import { prisma } from '../prisma/client';
import { AppError } from './apiError';

/** POS sales require an open, unlocked cash register for the branch. */
export async function assertCashRegisterOpenForSale(branchId: string): Promise<void> {
  const session = await prisma.cashFlow.findFirst({
    where: { branch_id: branchId, status: 'OPEN' },
    select: { locked: true, locked_reason: true },
  });

  if (!session) {
    throw new AppError(
      423,
      'Cash register is not open. Open the cash register before creating a sale.',
    );
  }

  if (session.locked) {
    throw new AppError(
      423,
      `The register is locked (${session.locked_reason || 'cashier on break'}). Unlock it from Cash Register before billing.`,
    );
  }
}
