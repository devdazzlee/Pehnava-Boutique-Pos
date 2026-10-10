import { Prisma, PaymentMethod } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { toBusinessYmd, localRange } from '../utils/timezone';
import { assertPeriodOpen } from './period-lock.service';

/**
 * Posts POS tenders into Chart of Accounts:
 *   Cash sale     → Dr Cash In Hand (CASH)      / Cr Sales Revenue
 *   Card/bank     → Dr Bank (BANK)              / Cr Sales Revenue
 *   Return/refund → Dr Sales Returns            / Cr Cash or Bank
 *
 * Idempotent via voucher `reference` = SALE:{id} or SALE-RTN:{id}.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const BANK_METHODS = new Set<string>([
  PaymentMethod.CARD,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.MOBILE_MONEY,
  'CARD',
  'BANK_TRANSFER',
  'MOBILE_MONEY',
]);

export const saleVoucherRef = (saleId: string) => `SALE:${saleId}`;
export const returnVoucherRef = (saleId: string) => `SALE-RTN:${saleId}`;

type Tx = Prisma.TransactionClient;

async function nextVoucherNo(tx: Tx) {
  const last = await tx.journalVoucher.findFirst({
    where: { voucher_no: { startsWith: 'JV-' } },
    orderBy: { voucher_no: 'desc' },
    select: { voucher_no: true },
  });
  const n = last ? Number(last.voucher_no.slice(3)) || 0 : 0;
  return `JV-${String(n + 1).padStart(6, '0')}`;
}

const accountCache = new Map<string, { id: string; code: string; name: string; system_key: string | null; is_active: boolean }>();

async function accountByKey(key: string) {
  const cached = accountCache.get(key);
  if (cached?.is_active) return cached;
  const row = await prisma.transactionalAccount.findUnique({
    where: { system_key: key },
    select: { id: true, code: true, name: true, system_key: true, is_active: true },
  });
  if (!row || !row.is_active) {
    throw new AppError(500, `Chart of Accounts is missing system account ${key}`);
  }
  accountCache.set(key, row);
  return row;
}

/** Ensures Bank (1110002 / Pehnawa bank) has system_key BANK for tender posting. */
export async function ensureBankSystemAccount() {
  const existing = await prisma.transactionalAccount.findUnique({ where: { system_key: 'BANK' } });
  if (existing) return existing;

  const candidate =
    (await prisma.transactionalAccount.findFirst({
      where: { code: '1110002' },
    })) ||
    (await prisma.transactionalAccount.findFirst({
      where: {
        system_key: null,
        control: { system_key: 'CASH_BANK' },
        name: { contains: 'Bank', mode: 'insensitive' },
        NOT: { name: { contains: 'Petty', mode: 'insensitive' } },
      },
      orderBy: { code: 'asc' },
    }));

  if (!candidate) {
    throw new AppError(500, 'Bank account not found under Cash & Bank — create it in Chart of Accounts');
  }

  return prisma.transactionalAccount.update({
    where: { id: candidate.id },
    data: { system_key: 'BANK', is_system: true },
  });
}

function splitTenders(
  payments: Array<{ method: string; amount: Prisma.Decimal | number }>,
  fallbackMethod: string,
  fallbackPaid: number,
): { cash: number; bank: number } {
  let cash = 0;
  let bank = 0;
  if (payments.length) {
    for (const p of payments) {
      const amt = round2(Math.abs(Number(p.amount) || 0));
      if (amt < 0.005) continue;
      const method = String(p.method || '').toUpperCase();
      if (method === 'CASH') cash += amt;
      else if (BANK_METHODS.has(method)) bank += amt;
      // GIFT_CARD / CREDIT / unknown — skip (not cash or bank drawer)
    }
  } else if (fallbackPaid > 0.005) {
    const method = String(fallbackMethod || 'CASH').toUpperCase();
    if (method === 'CASH') cash = round2(fallbackPaid);
    else if (BANK_METHODS.has(method)) bank = round2(fallbackPaid);
  }
  return { cash: round2(cash), bank: round2(bank) };
}

async function createBalancedVoucher(params: {
  voucherDate: Date;
  narration: string;
  reference: string;
  branchId?: string | null;
  createdBy?: string | null;
  lines: Array<{ accountId: string; debit?: number; credit?: number; description?: string }>;
  skipPeriodLock?: boolean;
}) {
  const lines = params.lines
    .map((l) => ({
      account_id: l.accountId,
      debit: round2(Math.max(0, l.debit || 0)),
      credit: round2(Math.max(0, l.credit || 0)),
      description: l.description || null,
    }))
    .filter((l) => l.debit > 0.004 || l.credit > 0.004);

  if (lines.length < 2) return null;

  let debit = round2(lines.reduce((s, l) => s + l.debit, 0));
  let credit = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(debit - credit) >= 0.02) {
    throw new AppError(500, `Sale voucher out of balance: Dr ${debit} Cr ${credit} (${params.reference})`);
  }
  // Absorb 1-cent float on the largest credit/debit line
  if (Math.abs(debit - credit) >= 0.005) {
    const diff = round2(debit - credit);
    if (diff > 0) {
      const line = lines.find((l) => l.credit > 0) || lines[lines.length - 1];
      line.credit = round2(line.credit + diff);
      credit = round2(credit + diff);
    } else {
      const line = lines.find((l) => l.debit > 0) || lines[0];
      line.debit = round2(line.debit - diff);
      debit = round2(debit - diff);
    }
  }

  if (!params.skipPeriodLock) {
    await assertPeriodOpen(params.voucherDate, 'a sale journal voucher');
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const exists = await tx.journalVoucher.findFirst({
          where: { reference: params.reference },
          select: { id: true },
        });
        if (exists) return exists;

        const voucher_no = await nextVoucherNo(tx);
        return tx.journalVoucher.create({
          data: {
            voucher_no,
            voucher_date: params.voucherDate,
            narration: params.narration,
            reference: params.reference,
            branch_id: params.branchId || null,
            total: new Prisma.Decimal(debit),
            created_by: params.createdBy ?? null,
            lines: {
              create: lines.map((l) => ({
                account_id: l.account_id,
                debit: new Prisma.Decimal(l.debit),
                credit: new Prisma.Decimal(l.credit),
                description: l.description,
              })),
            },
          },
          select: { id: true, voucher_no: true },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && attempt < 2) {
        continue;
      }
      throw error;
    }
  }
  throw new AppError(500, 'Could not allocate a voucher number for the sale');
}

class SaleAccountingService {
  /** Post (or no-op if already posted) accounting for a completed sale or return. */
  async postForSale(saleId: string, opts?: { skipPeriodLock?: boolean; userId?: string | null }) {
    await ensureBankSystemAccount();

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { payments: true },
    });
    if (!sale) return null;
    if (sale.status === 'CANCELLED') return null;

    const total = Number(sale.total_amount) || 0;
    // Child return/exchange docs: money out when total < 0, money in when total > 0.
    if (sale.original_sale_id || total < 0) {
      if (total > 0.005) return this.postSale(sale, opts);
      if (total < -0.005) return this.postReturn(sale, opts);
      return null;
    }
    return this.postSale(sale, opts);
  }

  private async postSale(
    sale: Prisma.SaleGetPayload<{ include: { payments: true } }>,
    opts?: { skipPeriodLock?: boolean; userId?: string | null },
  ) {
    const reference = saleVoucherRef(sale.id);
    const existing = await prisma.journalVoucher.findFirst({ where: { reference }, select: { id: true } });
    if (existing) return existing;

    const { cash, bank } = splitTenders(
      sale.payments,
      String(sale.payment_method),
      Number(sale.payment_received) || 0,
    );
    const totalMoney = round2(cash + bank);
    if (totalMoney < 0.005) return null;

    const [cashAcct, bankAcct, salesAcct] = await Promise.all([
      accountByKey('CASH'),
      accountByKey('BANK'),
      accountByKey('SALES'),
    ]);

    const ymd = toBusinessYmd(sale.sale_date);
    const voucherDate = localRange(ymd, ymd).start;
    const lines: Array<{ accountId: string; debit?: number; credit?: number; description?: string }> = [];
    if (cash > 0.005) {
      lines.push({
        accountId: cashAcct.id,
        debit: cash,
        description: `Cash tender · ${sale.sale_number}`,
      });
    }
    if (bank > 0.005) {
      lines.push({
        accountId: bankAcct.id,
        debit: bank,
        description: `Card/bank tender · ${sale.sale_number}`,
      });
    }
    lines.push({
      accountId: salesAcct.id,
      credit: totalMoney,
      description: `Sale · ${sale.sale_number}`,
    });

    return createBalancedVoucher({
      voucherDate,
      narration: `POS sale ${sale.sale_number}`,
      reference,
      branchId: sale.branch_id,
      createdBy: opts?.userId ?? sale.created_by,
      lines,
      skipPeriodLock: opts?.skipPeriodLock,
    });
  }

  private async postReturn(
    sale: Prisma.SaleGetPayload<{ include: { payments: true } }>,
    opts?: { skipPeriodLock?: boolean; userId?: string | null },
  ) {
    const reference = returnVoucherRef(sale.id);
    const existing = await prisma.journalVoucher.findFirst({ where: { reference }, select: { id: true } });
    if (existing) return existing;

    // Return docs store negative totals; refund amount is absolute.
    // Prefer payment_received when set; else |total_amount|.
    const refundAbs = round2(
      Math.abs(Number(sale.payment_received) || 0) > 0.005
        ? Math.abs(Number(sale.payment_received))
        : Math.abs(Number(sale.total_amount) || 0),
    );
    if (refundAbs < 0.005) return null;

    const method = String(sale.payment_method || 'CASH').toUpperCase();
    const toBank = BANK_METHODS.has(method);
    // no_refund / store credit style — if method is CREDIT, skip cash/bank
    if (method === 'CREDIT' || method === 'GIFT_CARD') return null;

    const [cashAcct, bankAcct, returnsAcct] = await Promise.all([
      accountByKey('CASH'),
      accountByKey('BANK'),
      accountByKey('SALES_RETURNS'),
    ]);

    const ymd = toBusinessYmd(sale.sale_date);
    const voucherDate = localRange(ymd, ymd).start;
    const moneyAcct = toBank ? bankAcct : cashAcct;

    return createBalancedVoucher({
      voucherDate,
      narration: `POS return ${sale.sale_number}`,
      reference,
      branchId: sale.branch_id,
      createdBy: opts?.userId ?? sale.created_by,
      lines: [
        {
          accountId: returnsAcct.id,
          debit: refundAbs,
          description: `Return · ${sale.sale_number}`,
        },
        {
          accountId: moneyAcct.id,
          credit: refundAbs,
          description: `${toBank ? 'Bank' : 'Cash'} refund · ${sale.sale_number}`,
        },
      ],
      skipPeriodLock: opts?.skipPeriodLock,
    });
  }

  /** Backfill vouchers for sales on/after fromYmd (business date). Idempotent. */
  async backfillFrom(fromYmd: string, opts?: { toYmd?: string }) {
    await ensureBankSystemAccount();
    const { start } = localRange(fromYmd, fromYmd);
    const end = opts?.toYmd ? localRange(opts.toYmd, opts.toYmd).end : undefined;

    const sales = await prisma.sale.findMany({
      where: {
        sale_date: end ? { gte: start, lte: end } : { gte: start },
        status: { not: 'CANCELLED' },
      },
      select: { id: true, sale_number: true, original_sale_id: true, total_amount: true },
      orderBy: { sale_date: 'asc' },
    });

    let posted = 0;
    let skipped = 0;
    let failed = 0;
    const errors: Array<{ id: string; sale_number: string; error: string }> = [];

    for (const sale of sales) {
      try {
        const result = await this.postForSale(sale.id, { skipPeriodLock: true });
        if (result) posted += 1;
        else skipped += 1;
      } catch (e) {
        failed += 1;
        errors.push({
          id: sale.id,
          sale_number: sale.sale_number,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { total: sales.length, posted, skipped, failed, errors: errors.slice(0, 20) };
  }
}

export const saleAccountingService = new SaleAccountingService();
