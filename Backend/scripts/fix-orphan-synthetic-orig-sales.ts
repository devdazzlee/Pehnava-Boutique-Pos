/**
 * Remove orphan synthetic originals left from legacy return import:
 *   notes contains legacy_synthetic_original_for_return=
 * and no child returns point at them (real sales already exist via live_delta).
 *
 *   npx ts-node --transpile-only scripts/fix-orphan-synthetic-orig-sales.ts
 *   ... --apply
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const APPLY = process.argv.includes('--apply');

function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

async function main() {
  loadEnv();
  const url = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  const rows = await prisma.sale.findMany({
    where: { notes: { contains: 'legacy_synthetic_original_for_return=' } },
    select: {
      id: true,
      sale_number: true,
      invoice_number: true,
      total_amount: true,
      notes: true,
      _count: { select: { return_sales: true } },
    },
  });

  const orphans = rows.filter((r) => r._count.return_sales === 0);
  const kept = rows.filter((r) => r._count.return_sales > 0);
  const sum = orphans.reduce((s, r) => s + Number(r.total_amount), 0);

  console.log('Synthetic ORIG totals:', rows.length);
  console.log('Orphans (no child returns) to delete:', orphans.length, 'sum Rs', Math.round(sum));
  console.log('Still linked (keep):', kept.length);
  console.log(
    'Samples:',
    orphans.slice(0, 5).map((r) => ({ sn: r.sale_number, inv: r.invoice_number, amt: Number(r.total_amount) })),
  );

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply');
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      for (const r of orphans) {
        await tx.salePayment.deleteMany({ where: { sale_id: r.id } });
        await tx.saleItem.deleteMany({ where: { sale_id: r.id } });
        // Clear any stray original_sale_id pointers
        await tx.sale.updateMany({
          where: { original_sale_id: r.id },
          data: { original_sale_id: null },
        });
        await tx.sale.delete({ where: { id: r.id } });
      }
    },
    { maxWait: 30000, timeout: 300000 },
  );

  const legacy = await prisma.sale.findMany({
    where: {
      OR: [{ notes: { contains: 'legacy_sale_id=' } }, { notes: { contains: 'legacy_return_id=' } }],
    },
    select: { total_amount: true, payment_received: true },
  });
  console.log('\nAfter delete — legacy rows:', legacy.length, {
    net: Math.round(legacy.reduce((s, r) => s + Number(r.total_amount), 0)),
    paid: Math.round(legacy.reduce((s, r) => s + Number(r.payment_received), 0)),
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
