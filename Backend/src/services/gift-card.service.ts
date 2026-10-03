import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { localRange } from '../utils/timezone';

/* ============================================================
 * Gift cards: sold for money (cash goes into the open register),
 * spent as a payment at checkout, reloaded, voided. Every change
 * is a transaction row; balance is kept on the card for speed.
 * ============================================================ */

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const LOAD_METHODS = new Set(['CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE_MONEY', 'COMPLIMENTARY']);

export const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, '');

function newCode() {
  // GC-XXXX-XXXX without look-alike characters
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (n: number) => Array.from(crypto.randomBytes(n), (b) => alphabet[b % alphabet.length]).join('');
  return `GC-${pick(4)}-${pick(4)}`;
}

/** Validates gift cards used at checkout; returns the cards with amounts. */
export async function validateGiftCardTenders(tenders: { code: string; amount: number }[]) {
  const out: { id: string; code: string; amount: number }[] = [];
  const seen = new Set<string>();
  for (const t of tenders) {
    const code = normalizeCode(t.code || '');
    const amount = r2(num(t.amount));
    if (!code || amount <= 0) continue;
    if (seen.has(code)) throw new AppError(400, `Gift card ${code} is used twice`);
    seen.add(code);
    const card = await prisma.giftCard.findUnique({ where: { code } });
    if (!card) throw new AppError(400, `Gift card ${code} was not found`);
    if (card.status !== 'ACTIVE') throw new AppError(400, `Gift card ${code} is ${card.status.toLowerCase()}`);
    if (card.expires_at && card.expires_at < new Date()) throw new AppError(400, `Gift card ${code} expired on ${card.expires_at.toISOString().slice(0, 10)}`);
    if (amount > num(card.balance) + 0.005) throw new AppError(400, `Gift card ${code} only has Rs ${num(card.balance).toLocaleString('en-PK')}`);
    out.push({ id: card.id, code, amount });
  }
  return out;
}

type Actor = { userId?: string; branchId?: string | null };

export class GiftCardService {
  private serialize(card: Prisma.GiftCardGetPayload<{ include: { customer: { select: { id: true; name: true; phone_number: true } } } }>) {
    const expired = card.status === 'ACTIVE' && card.expires_at && card.expires_at < new Date();
    return {
      id: card.id,
      code: card.code,
      initialValue: num(card.initial_value),
      balance: num(card.balance),
      status: expired ? 'EXPIRED' : card.status,
      customer: card.customer ? { id: card.customer.id, name: card.customer.name, phone: card.customer.phone_number } : null,
      holderName: card.holder_name,
      holderPhone: card.holder_phone,
      expiresAt: card.expires_at,
      notes: card.notes,
      createdAt: card.created_at,
    };
  }

  async list(q: { search?: string; status?: string }) {
    const cards = await prisma.giftCard.findMany({
      where: {
        ...(q.status && q.status !== 'all' && q.status !== 'EXPIRED' ? { status: q.status } : {}),
        ...(q.status === 'EXPIRED' ? { OR: [{ status: 'EXPIRED' }, { status: 'ACTIVE', expires_at: { lt: new Date() } }] } : {}),
        ...(q.search
          ? {
              AND: [
                {
                  OR: [
                    { code: { contains: normalizeCode(q.search) } },
                    { holder_name: { contains: q.search, mode: 'insensitive' } },
                    { holder_phone: { contains: q.search } },
                    { customer: { name: { contains: q.search, mode: 'insensitive' } } },
                  ],
                },
              ],
            }
          : {}),
      },
      include: { customer: { select: { id: true, name: true, phone_number: true } } },
      orderBy: { created_at: 'desc' },
      take: 500,
    });
    const all = await prisma.giftCard.findMany({ select: { status: true, balance: true, initial_value: true, expires_at: true } });
    const now = new Date();
    const live = all.filter((c) => c.status === 'ACTIVE' && !(c.expires_at && c.expires_at < now));
    const redeemed = await prisma.giftCardTransaction.aggregate({ where: { type: 'REDEEM' }, _sum: { amount: true } });
    return {
      cards: cards.map((c) => this.serialize(c)),
      summary: {
        total: all.length,
        active: live.length,
        outstanding: r2(live.reduce((t, c) => t + num(c.balance), 0)),
        issuedValue: r2(all.reduce((t, c) => t + num(c.initial_value), 0)),
        redeemed: r2(Math.abs(num(redeemed._sum.amount))),
      },
    };
  }

  async get(idOrCode: string) {
    const card = await prisma.giftCard.findFirst({
      where: { OR: [{ id: idOrCode }, { code: normalizeCode(idOrCode) }] },
      include: {
        customer: { select: { id: true, name: true, phone_number: true } },
        transactions: { orderBy: { created_at: 'desc' }, include: { sale: { select: { id: true, sale_number: true, invoice_number: true } } } },
      },
    });
    if (!card) throw new AppError(404, 'Gift card not found');
    const userIds = [...new Set(card.transactions.map((t) => t.created_by).filter((v): v is string => !!v))];
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }) : [];
    const email = new Map(users.map((u) => [u.id, u.email]));
    return {
      ...this.serialize(card),
      transactions: card.transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: num(t.amount),
        method: t.payment_method,
        note: t.note,
        at: t.created_at,
        by: email.get(t.created_by || '') ?? null,
        sale: t.sale,
      })),
    };
  }

  /** Public-safe balance check used at the till. */
  async check(code: string) {
    const card = await prisma.giftCard.findUnique({ where: { code: normalizeCode(code) } });
    if (!card) throw new AppError(404, 'Gift card not found');
    const expired = !!card.expires_at && card.expires_at < new Date();
    return {
      code: card.code,
      balance: num(card.balance),
      status: expired && card.status === 'ACTIVE' ? 'EXPIRED' : card.status,
      usable: card.status === 'ACTIVE' && !expired && num(card.balance) > 0,
      expiresAt: card.expires_at,
      holderName: card.holder_name,
    };
  }

  /** Money taken for a card goes into the open register when paid in cash. */
  private async registerCash(actor: Actor, amount: number, reason: string) {
    if (!actor.branchId) return null;
    const session = await prisma.cashFlow.findFirst({ where: { branch_id: actor.branchId, status: 'OPEN' }, select: { id: true } });
    if (!session) throw new AppError(400, 'Open the cash register before taking cash for a gift card');
    await prisma.cashMovement.create({ data: { cashflow_id: session.id, type: 'IN', amount: new Prisma.Decimal(amount), reason, created_by: actor.userId ?? null } });
    return session.id;
  }

  async issue(
    actor: Actor,
    body: {
      amount: number;
      paymentMethod: string;
      code?: string | null;
      customerId?: string | null;
      holderName?: string | null;
      holderPhone?: string | null;
      expiresAt?: string | null;
      notes?: string | null;
    },
  ) {
    const amount = r2(num(body.amount));
    if (amount <= 0) throw new AppError(400, 'Enter the card value');
    const method = String(body.paymentMethod || 'CASH').toUpperCase();
    if (!LOAD_METHODS.has(method)) throw new AppError(400, 'Choose how the card was paid for');
    let code = body.code ? normalizeCode(body.code) : '';
    if (code) {
      if (!/^[A-Z0-9-]{4,30}$/.test(code)) throw new AppError(400, 'Card code can use letters, numbers and dashes (4–30)');
      if (await prisma.giftCard.findUnique({ where: { code } })) throw new AppError(400, `Code ${code} is already used`);
    } else {
      for (let i = 0; i < 5 && !code; i++) {
        const c = newCode();
        if (!(await prisma.giftCard.findUnique({ where: { code: c } }))) code = c;
      }
    }
    if (body.customerId && !(await prisma.customer.findUnique({ where: { id: body.customerId }, select: { id: true } }))) throw new AppError(400, 'Customer not found');
    const cashflowId = method === 'CASH' ? await this.registerCash(actor, amount, `Gift card ${code} sold`) : null;
    const card = await prisma.giftCard.create({
      data: {
        code,
        initial_value: new Prisma.Decimal(amount),
        balance: new Prisma.Decimal(amount),
        customer_id: body.customerId || null,
        holder_name: body.holderName?.trim() || null,
        holder_phone: body.holderPhone?.trim() || null,
        expires_at: body.expiresAt ? localRange(body.expiresAt.slice(0, 10), body.expiresAt.slice(0, 10)).end : null,
        notes: body.notes?.trim() || null,
        branch_id: actor.branchId ?? null,
        created_by: actor.userId ?? null,
        transactions: {
          create: { type: 'ISSUE', amount: new Prisma.Decimal(amount), payment_method: method, cashflow_id: cashflowId, created_by: actor.userId ?? null, note: method === 'COMPLIMENTARY' ? 'Complimentary card' : null },
        },
      },
    });
    return this.get(card.id);
  }

  async reload(actor: Actor, id: string, body: { amount: number; paymentMethod: string; note?: string | null }) {
    const card = await prisma.giftCard.findUnique({ where: { id } });
    if (!card) throw new AppError(404, 'Gift card not found');
    if (card.status === 'VOID') throw new AppError(400, 'This card is void');
    const amount = r2(num(body.amount));
    if (amount <= 0) throw new AppError(400, 'Enter the amount to add');
    const method = String(body.paymentMethod || 'CASH').toUpperCase();
    if (!LOAD_METHODS.has(method)) throw new AppError(400, 'Choose how it was paid for');
    const cashflowId = method === 'CASH' ? await this.registerCash(actor, amount, `Gift card ${card.code} reloaded`) : null;
    await prisma.$transaction([
      prisma.giftCard.update({ where: { id }, data: { balance: { increment: amount }, status: 'ACTIVE' } }),
      prisma.giftCardTransaction.create({
        data: { card_id: id, type: 'RELOAD', amount: new Prisma.Decimal(amount), payment_method: method, cashflow_id: cashflowId, note: body.note?.trim() || null, created_by: actor.userId ?? null },
      }),
    ]);
    return this.get(id);
  }

  async update(id: string, body: { holderName?: string | null; holderPhone?: string | null; expiresAt?: string | null; notes?: string | null; customerId?: string | null }) {
    const card = await prisma.giftCard.findUnique({ where: { id } });
    if (!card) throw new AppError(404, 'Gift card not found');
    await prisma.giftCard.update({
      where: { id },
      data: {
        ...(body.holderName !== undefined ? { holder_name: body.holderName?.trim() || null } : {}),
        ...(body.holderPhone !== undefined ? { holder_phone: body.holderPhone?.trim() || null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
        ...(body.customerId !== undefined ? { customer_id: body.customerId || null } : {}),
        ...(body.expiresAt !== undefined ? { expires_at: body.expiresAt ? localRange(body.expiresAt.slice(0, 10), body.expiresAt.slice(0, 10)).end : null } : {}),
      },
    });
    return this.get(id);
  }

  async void(actor: Actor, id: string, reason: string) {
    if (!reason?.trim()) throw new AppError(400, 'Enter a reason');
    const card = await prisma.giftCard.findUnique({ where: { id } });
    if (!card) throw new AppError(404, 'Gift card not found');
    if (card.status === 'VOID') throw new AppError(400, 'Already void');
    await prisma.$transaction([
      prisma.giftCard.update({ where: { id }, data: { status: 'VOID', balance: 0 } }),
      prisma.giftCardTransaction.create({
        data: { card_id: id, type: 'VOID', amount: new Prisma.Decimal(-num(card.balance)), note: reason.trim(), created_by: actor.userId ?? null },
      }),
    ]);
    return this.get(id);
  }

  /** Put gift card money back when a bill paid with it is voided. */
  async refundForSale(saleId: string, userId?: string) {
    const txns = await prisma.giftCardTransaction.findMany({ where: { sale_id: saleId, type: 'REDEEM' } });
    for (const t of txns) {
      const amount = Math.abs(num(t.amount));
      await prisma.$transaction([
        prisma.giftCard.update({ where: { id: t.card_id }, data: { balance: { increment: amount }, status: 'ACTIVE' } }),
        prisma.giftCardTransaction.create({
          data: { card_id: t.card_id, sale_id: saleId, type: 'REFUND', amount: new Prisma.Decimal(amount), note: 'Bill voided — amount returned to card', created_by: userId ?? null },
        }),
      ]);
    }
  }
}
