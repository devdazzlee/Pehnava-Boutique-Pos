import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

/**
 * When salary / commission / similar is paid in CASH while a register is open,
 * record it as an approved expense on that drawer so Expected cash drops.
 */
export async function recordCashPayOnOpenRegister(opts: {
  particular: string;
  amount: number;
  branchId?: string | null;
  userId?: string | null;
  reference?: string | null;
  notes?: string | null;
}) {
  const amount = Math.round((Number(opts.amount) + Number.EPSILON) * 100) / 100;
  if (!(amount > 0.005)) return null;
  const method = 'CASH';

  const open = await prisma.cashFlow.findMany({
    where: {
      status: 'OPEN',
      ...(opts.branchId ? { branch_id: opts.branchId } : {}),
    },
    select: { id: true, branch_id: true },
    take: 2,
  });
  if (open.length !== 1) return null;

  return prisma.expense.create({
    data: {
      particular: opts.particular.trim(),
      amount: new Prisma.Decimal(amount),
      payment_method: method,
      reference: opts.reference?.trim() || null,
      notes: opts.notes?.trim() || null,
      expense_date: new Date(),
      branch_id: opts.branchId ?? open[0].branch_id,
      cashflow_id: open[0].id,
      status: 'APPROVED',
      approved_by: opts.userId ?? null,
      approved_at: new Date(),
      created_by: opts.userId ?? null,
    },
    select: { id: true, cashflow_id: true },
  });
}
