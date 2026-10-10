/**
 * Fix Oct 4 + Oct 6 closed register expected cash.
 *
 * Oct 6: original till expenses + one missing "shop rent for oct" (95,000).
 * Oct 4: recompute from expenses already linked to the session.
 *
 *   npx ts-node --transpile-only scripts/fix-register-expected-oct.ts
 */
import { PrismaClient } from '@prisma/client';
import { CashRegisterService } from '../src/services/cash-register.service';

const prisma = new PrismaClient();
const service = new CashRegisterService();

const OCT4 = 'd5bcdf26-d41f-469b-8cb8-0ca17b418b68';
const OCT6 = 'e25612ba-f13c-46cb-87a5-907c7ad6263b';

const OCT6_KEEP = new Set([
  'imran bhai',
  'internet connetction payment',
  'biryani',
  'fuel',
  'water bottle september payment',
  'ainy salary for september',
  'ainy comission till september 30',
  'salman comission for 6/10 7/10',
  'shop rent for oct',
]);

async function main() {
  const linked = await prisma.expense.findMany({ where: { cashflow_id: OCT6 } });
  const unlink: string[] = [];
  let keptShopRent = false;
  let keptBiryani1100 = false;
  let keptFuel500 = false;

  for (const e of linked) {
    const p = e.particular.trim().toLowerCase();
    const amt = Number(e.amount);
    if (p === 'shop rent for oct') {
      if (keptShopRent || amt !== 95000) unlink.push(e.id);
      else keptShopRent = true;
      continue;
    }
    if (p === 'biryani' && amt === 1100) {
      if (keptBiryani1100) unlink.push(e.id);
      else keptBiryani1100 = true;
      continue;
    }
    if (p === 'fuel' && amt === 500) {
      if (keptFuel500) unlink.push(e.id);
      else keptFuel500 = true;
      continue;
    }
    if (!OCT6_KEEP.has(p)) unlink.push(e.id);
  }

  if (!keptShopRent) {
    const rent = await prisma.expense.findFirst({
      where: {
        particular: { equals: 'shop rent for oct', mode: 'insensitive' },
        amount: 95000,
        payment_method: 'CASH',
        status: 'APPROVED',
      },
      orderBy: { created_at: 'asc' },
    });
    if (rent) {
      await prisma.expense.update({ where: { id: rent.id }, data: { cashflow_id: OCT6 } });
      console.log('Linked shop rent 95000');
    }
  }

  if (unlink.length) {
    await prisma.expense.updateMany({ where: { id: { in: unlink } }, data: { cashflow_id: null } });
    console.log('Oct 6 unlinked', unlink.length);
  }

  const r6 = await service.recalculateClosed(OCT6, { attachOrphans: false });
  const kept = await prisma.expense.findMany({
    where: { cashflow_id: OCT6 },
    select: { particular: true, amount: true },
    orderBy: { created_at: 'asc' },
  });
  console.log(
    'Oct 6 kept',
    kept.map((e) => ({ p: e.particular, a: Number(e.amount) })),
    'sum',
    kept.reduce((t, e) => t + Number(e.amount), 0),
  );
  console.log('Oct 6', { expected: r6.expectedCash, closing: r6.closing, variance: r6.variance, cashOut: r6.cashOut });

  const r4 = await service.recalculateClosed(OCT4, { attachOrphans: false });
  console.log('Oct 4', { expected: r4.expectedCash, closing: r4.closing, variance: r4.variance, cashOut: r4.cashOut });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
