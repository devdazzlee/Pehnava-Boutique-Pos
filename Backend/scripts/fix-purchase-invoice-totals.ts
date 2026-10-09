/**
 * Safe ledger fix: set PurchaseInvoice.total_amount = sum(linked purchase lines).
 * Does NOT delete or unlink any rows. Writes a JSON backup before applying.
 *
 * Production:
 *   DATABASE_URL=<production> npx ts-node --transpile-only scripts/fix-purchase-invoice-totals.ts
 * Dry run (default):
 *   ... fix-purchase-invoice-totals.ts
 * Apply:
 *   ... fix-purchase-invoice-totals.ts --apply
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/prisma/client';
import { supplierBalances } from '../src/services/supplier-accounts.service';

const APPLY = process.argv.includes('--apply');

function lineTotal(q: unknown, c: unknown) {
  return Math.round(Number(q) * Number(c) * 100) / 100;
}

function invoiceStatus(total: number, paid: number): 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' {
  if (paid <= 0.005) return 'UNPAID';
  if (paid >= total - 0.005) return 'PAID';
  return 'PARTIALLY_PAID';
}

async function main() {
  const invoices = await prisma.purchaseInvoice.findMany({
    include: {
      purchases: { select: { id: true, quantity: true, cost_price: true } },
      supplier: { select: { id: true, name: true } },
    },
  });

  const fixes: Array<{
    id: string;
    invoice_number: string;
    supplier_name: string;
    old_total: number;
    new_total: number;
    diff: number;
    line_count: number;
    old_status: string;
    new_status: string;
    amount_paid: number;
  }> = [];

  for (const inv of invoices) {
    const newTotal = inv.purchases.reduce(
      (s, p) => s + lineTotal(p.quantity, p.cost_price),
      0,
    );
    const oldTotal = Number(inv.total_amount);
    const diff = Math.round((newTotal - oldTotal) * 100) / 100;
    if (Math.abs(diff) <= 0.01) continue;

    const paid = Number(inv.amount_paid);
    fixes.push({
      id: inv.id,
      invoice_number: inv.invoice_number,
      supplier_name: inv.supplier.name,
      old_total: oldTotal,
      new_total: Math.round(newTotal * 100) / 100,
      diff,
      line_count: inv.purchases.length,
      old_status: inv.status,
      new_status: invoiceStatus(newTotal, paid),
      amount_paid: paid,
    });
  }

  const backupPath = path.resolve(
    __dirname,
    `../../invoice-total-fix-backup-${new Date().toISOString().slice(0, 10)}.json`,
  );
  fs.writeFileSync(
    backupPath,
    JSON.stringify({ created_at: new Date().toISOString(), apply: APPLY, fixes }, null, 2),
    'utf8',
  );

  console.log(`Found ${fixes.length} invoice(s) to correct. Backup: ${backupPath}`);
  console.log(JSON.stringify(fixes, null, 2));

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to update totals (no deletes).');
    return;
  }

  if (fixes.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const f of fixes) {
      await tx.purchaseInvoice.update({
        where: { id: f.id },
        data: {
          total_amount: f.new_total,
          status: f.new_status as 'UNPAID' | 'PARTIALLY_PAID' | 'PAID',
        },
      });
    }
  });

  const pehnawaId = fixes.find((f) => f.supplier_name === 'Pehnawa')
    ? (await prisma.supplier.findFirst({ where: { name: 'Pehnawa' }, select: { id: true } }))?.id
    : null;
  if (pehnawaId) {
    const bal = (await supplierBalances([pehnawaId])).get(pehnawaId);
    console.log('\nPehnawa after fix:', {
      totalPurchased: bal?.totalPurchased,
      balanceDue: bal?.balanceDue,
      totalPaid: bal?.totalPaid,
    });
  }

  console.log('\nApplied successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
