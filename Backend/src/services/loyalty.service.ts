import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { localRange } from '../utils/timezone';

/* ============================================================
 * Loyalty programme: customers earn points on what they pay,
 * redeem them as a discount on later bills, and move up tiers
 * by lifetime spend. Points live in a ledger (balance = sum).
 * ============================================================ */

export type LoyaltyTier = { name: string; minSpend: number; multiplier: number };
export type LoyaltySettings = {
  enabled: boolean;
  /** Points earned for every Rs 100 paid. */
  pointsPer100: number;
  /** Rupee value of one point when redeemed. */
  pointValue: number;
  /** Smallest number of points that can be redeemed at once. */
  minRedeem: number;
  /** Max share of a bill (after other discounts) payable with points. */
  maxRedeemPct: number;
  /** Points expire this many months after they're earned (0 = never). */
  expiryMonths: number;
  tiers: LoyaltyTier[];
};

export const DEFAULT_LOYALTY: LoyaltySettings = {
  enabled: false,
  pointsPer100: 1,
  pointValue: 1,
  minRedeem: 100,
  maxRedeemPct: 50,
  expiryMonths: 0,
  tiers: [
    { name: 'Classic', minSpend: 0, multiplier: 1 },
    { name: 'Silver', minSpend: 50000, multiplier: 1.25 },
    { name: 'Gold', minSpend: 150000, multiplier: 1.5 },
    { name: 'Platinum', minSpend: 400000, multiplier: 2 },
  ],
};

const KEY = 'loyalty';
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

let cache: { value: LoyaltySettings; at: number } | null = null;

export async function loyaltySettings(): Promise<LoyaltySettings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const value = { ...DEFAULT_LOYALTY, ...((row?.value as Partial<LoyaltySettings>) || {}) };
  value.tiers = [...(value.tiers?.length ? value.tiers : DEFAULT_LOYALTY.tiers)].sort((a, b) => a.minSpend - b.minSpend);
  cache = { value, at: Date.now() };
  return value;
}

export function tierFor(settings: LoyaltySettings, lifetimeSpend: number) {
  let tier = settings.tiers[0] ?? { name: 'Member', minSpend: 0, multiplier: 1 };
  for (const t of settings.tiers) if (lifetimeSpend >= t.minSpend) tier = t;
  const next = settings.tiers.find((t) => t.minSpend > lifetimeSpend) ?? null;
  return { tier, next, toNext: next ? r2(next.minSpend - lifetimeSpend) : 0 };
}

export async function pointsBalance(customerId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const agg = await db.loyaltyTransaction.aggregate({ where: { customer_id: customerId }, _sum: { points: true } });
  return agg._sum.points ?? 0;
}

async function lifetimeSpend(customerId: string) {
  const agg = await prisma.sale.aggregate({
    where: { customer_id: customerId, status: { notIn: ['CANCELLED', 'PENDING'] } },
    _sum: { total_amount: true },
  });
  return num(agg._sum.total_amount);
}

/** Points a bill earns (before it is saved). */
export async function pointsToEarn(customerId: string, amountPaid: number) {
  const s = await loyaltySettings();
  if (!s.enabled || amountPaid <= 0) return 0;
  const { tier } = tierFor(s, await lifetimeSpend(customerId));
  return Math.floor((amountPaid / 100) * s.pointsPer100 * (tier.multiplier || 1));
}

/** Validates a redemption and returns its rupee value. */
export async function redemptionValue(customerId: string, points: number, billAfterDiscounts: number) {
  const s = await loyaltySettings();
  if (!s.enabled) throw new AppError(400, 'The loyalty programme is switched off');
  if (!Number.isInteger(points) || points <= 0) throw new AppError(400, 'Enter whole points to redeem');
  if (points < s.minRedeem) throw new AppError(400, `At least ${s.minRedeem} points must be redeemed at a time`);
  const balance = await pointsBalance(customerId);
  if (points > balance) throw new AppError(400, `Customer only has ${balance} points`);
  const value = r2(points * s.pointValue);
  const cap = r2((billAfterDiscounts * s.maxRedeemPct) / 100);
  if (value > cap + 0.005) throw new AppError(400, `Points can pay at most ${s.maxRedeemPct}% of this bill (Rs ${cap.toLocaleString('en-PK')})`);
  return value;
}

export class LoyaltyService {
  async getSettings() {
    return loyaltySettings();
  }

  async saveSettings(input: Partial<LoyaltySettings>, userId?: string) {
    const current = await loyaltySettings();
    const next: LoyaltySettings = { ...current, ...input };
    if (next.pointsPer100 < 0 || next.pointValue < 0) throw new AppError(400, 'Rates cannot be negative');
    if (next.maxRedeemPct < 0 || next.maxRedeemPct > 100) throw new AppError(400, 'Max redeem must be 0–100%');
    next.tiers = (next.tiers || [])
      .filter((t) => t.name?.trim())
      .map((t) => ({ name: t.name.trim(), minSpend: Math.max(0, num(t.minSpend)), multiplier: Math.max(0, num(t.multiplier) || 1) }))
      .sort((a, b) => a.minSpend - b.minSpend);
    if (!next.tiers.length) next.tiers = DEFAULT_LOYALTY.tiers;
    await prisma.appSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: next as unknown as Prisma.InputJsonValue, updated_by: userId ?? null },
      update: { value: next as unknown as Prisma.InputJsonValue, updated_by: userId ?? null },
    });
    cache = null;
    return next;
  }

  /** Programme dashboard: members, points outstanding, liability, recent activity. */
  async overview(q: { from?: string; to?: string; search?: string; tier?: string }) {
    const s = await loyaltySettings();
    const [balances, spends, customers] = await Promise.all([
      prisma.loyaltyTransaction.groupBy({ by: ['customer_id'], _sum: { points: true }, _max: { created_at: true } }),
      prisma.sale.groupBy({
        by: ['customer_id'],
        where: { customer_id: { not: null }, status: { notIn: ['CANCELLED', 'PENDING'] } },
        _sum: { total_amount: true },
        _count: { id: true },
        _max: { sale_date: true },
      }),
      prisma.customer.findMany({
        where: q.search
          ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { phone_number: { contains: q.search } }, { mobile_number: { contains: q.search } }] }
          : {},
        select: { id: true, name: true, phone_number: true, mobile_number: true, email: true, created_at: true },
      }),
    ]);
    const balMap = new Map(balances.map((b) => [b.customer_id, { points: b._sum.points ?? 0, last: b._max.created_at }]));
    const spendMap = new Map(spends.map((x) => [x.customer_id as string, { spend: num(x._sum.total_amount), bills: x._count.id, last: x._max.sale_date }]));

    const members = customers
      .map((c) => {
        const bal = balMap.get(c.id);
        const sp = spendMap.get(c.id);
        const spend = sp?.spend ?? 0;
        const t = tierFor(s, spend);
        return {
          id: c.id,
          name: c.name || 'Unnamed customer',
          phone: c.mobile_number || c.phone_number || null,
          email: c.email,
          points: bal?.points ?? 0,
          value: r2((bal?.points ?? 0) * s.pointValue),
          lifetimeSpend: r2(spend),
          bills: sp?.bills ?? 0,
          lastVisit: sp?.last ?? null,
          tier: t.tier.name,
          nextTier: t.next?.name ?? null,
          toNextTier: t.toNext,
        };
      })
      .filter((m) => m.bills > 0 || m.points !== 0)
      .filter((m) => !q.tier || q.tier === 'all' || m.tier === q.tier)
      .sort((a, b) => b.points - a.points || b.lifetimeSpend - a.lifetimeSpend);

    const range = q.from && q.to ? localRange(q.from, q.to) : null;
    const periodAgg = await prisma.loyaltyTransaction.groupBy({
      by: ['type'],
      where: range ? { created_at: { gte: range.start, lte: range.end } } : {},
      _sum: { points: true, value: true },
      _count: { id: true },
    });
    const byType = Object.fromEntries(periodAgg.map((g) => [g.type, { points: g._sum.points ?? 0, value: num(g._sum.value), count: g._count.id }]));
    const outstanding = members.reduce((t, m) => t + Math.max(0, m.points), 0);
    const tierCounts = s.tiers.map((t) => ({ name: t.name, minSpend: t.minSpend, multiplier: t.multiplier, members: members.filter((m) => m.tier === t.name).length }));

    return {
      settings: s,
      summary: {
        members: members.length,
        withPoints: members.filter((m) => m.points > 0).length,
        pointsOutstanding: outstanding,
        liability: r2(outstanding * s.pointValue),
        earned: byType.EARN?.points ?? 0,
        redeemed: Math.abs(byType.REDEEM?.points ?? 0),
        redeemedValue: Math.abs(byType.REDEEM?.value ?? 0),
      },
      tiers: tierCounts,
      members,
    };
  }

  async customer(customerId: string) {
    const s = await loyaltySettings();
    const [balance, spend, txns] = await Promise.all([
      pointsBalance(customerId),
      lifetimeSpend(customerId),
      prisma.loyaltyTransaction.findMany({
        where: { customer_id: customerId },
        orderBy: { created_at: 'desc' },
        take: 100,
        include: { sale: { select: { id: true, sale_number: true, invoice_number: true } } },
      }),
    ]);
    const t = tierFor(s, spend);
    const maxRedeemable = s.enabled && balance >= s.minRedeem ? balance : 0;
    return {
      enabled: s.enabled,
      balance,
      value: r2(balance * s.pointValue),
      pointValue: s.pointValue,
      minRedeem: s.minRedeem,
      maxRedeemPct: s.maxRedeemPct,
      maxRedeemable,
      lifetimeSpend: r2(spend),
      tier: t.tier,
      nextTier: t.next,
      toNextTier: t.toNext,
      transactions: txns.map((x) => ({
        id: x.id,
        type: x.type,
        points: x.points,
        value: num(x.value),
        note: x.note,
        at: x.created_at,
        sale: x.sale,
      })),
    };
  }

  async adjust(customerId: string, body: { points: number; note: string }, userId?: string) {
    if (!Number.isInteger(body.points) || body.points === 0) throw new AppError(400, 'Enter a whole number of points (use minus to deduct)');
    if (!body.note?.trim()) throw new AppError(400, 'Enter a reason');
    const exists = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!exists) throw new AppError(404, 'Customer not found');
    if (body.points < 0) {
      const balance = await pointsBalance(customerId);
      if (balance + body.points < 0) throw new AppError(400, `Customer only has ${balance} points`);
    }
    const s = await loyaltySettings();
    await prisma.loyaltyTransaction.create({
      data: { customer_id: customerId, type: 'ADJUST', points: body.points, value: new Prisma.Decimal(r2(body.points * s.pointValue)), note: body.note.trim(), created_by: userId ?? null },
    });
    return this.customer(customerId);
  }

  /** Undo the points of a voided bill. */
  async reverseForSale(saleId: string, userId?: string) {
    const txns = await prisma.loyaltyTransaction.findMany({ where: { sale_id: saleId, type: { in: ['EARN', 'REDEEM'] } } });
    if (!txns.length) return;
    await prisma.loyaltyTransaction.createMany({
      data: txns.map((t) => ({
        customer_id: t.customer_id,
        sale_id: saleId,
        type: 'REVERSE',
        points: -t.points,
        value: new Prisma.Decimal(-num(t.value)),
        note: `Bill voided (${t.type.toLowerCase()} reversed)`,
        created_by: userId ?? null,
      })),
    });
  }

  /** A return takes back the points earned on the returned value. */
  async clawbackForReturn(originalSaleId: string, returnSaleId: string, refundValue: number, userId?: string) {
    if (refundValue <= 0) return;
    const original = await prisma.sale.findUnique({
      where: { id: originalSaleId },
      select: { customer_id: true, total_amount: true, loyalty_points_earned: true },
    });
    if (!original?.customer_id || !original.loyalty_points_earned) return;
    const total = num(original.total_amount);
    if (total <= 0) return;
    const points = Math.min(original.loyalty_points_earned, Math.round((original.loyalty_points_earned * refundValue) / total));
    if (points <= 0) return;
    await prisma.loyaltyTransaction.create({
      data: { customer_id: original.customer_id, sale_id: returnSaleId, type: 'ADJUST', points: -points, note: 'Points taken back for returned items', created_by: userId ?? null },
    });
  }
}
