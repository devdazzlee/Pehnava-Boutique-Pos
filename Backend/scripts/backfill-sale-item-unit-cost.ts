/**
 * Freeze historical COGS on SaleItem.unit_cost.
 *
 * For each line missing unit_cost:
 *   1) Prefer latest Purchase.cost_price on/before the sale date
 *   2) Else product.purchase_rate
 *
 *   npx ts-node --transpile-only scripts/backfill-sale-item-unit-cost.ts
 *   npx ts-node --transpile-only scripts/backfill-sale-item-unit-cost.ts --dry-run
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const BATCH = 500;

async function main() {
  const totalMissing = await prisma.saleItem.count({ where: { unit_cost: null } });
  console.log(`Sale lines without unit_cost: ${totalMissing}${dryRun ? ' (dry-run)' : ''}`);

  let updated = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.saleItem.findMany({
      where: { unit_cost: null },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        product_id: true,
        sale: { select: { sale_date: true } },
        product: { select: { purchase_rate: true } },
      },
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;

    const productIds = [...new Set(rows.map((r) => r.product_id))];
    const purchases = await prisma.purchase.findMany({
      where: { product_id: { in: productIds } },
      select: { product_id: true, cost_price: true, purchase_date: true },
      orderBy: { purchase_date: 'asc' },
    });
    const byProduct = new Map<string, { cost: number; at: Date }[]>();
    for (const p of purchases) {
      const list = byProduct.get(p.product_id) ?? [];
      list.push({ cost: Number(p.cost_price) || 0, at: p.purchase_date });
      byProduct.set(p.product_id, list);
    }

    const ops = [];
    for (const row of rows) {
      const saleDate = row.sale.sale_date;
      const history = byProduct.get(row.product_id) || [];
      let cost: number | null = null;
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].at <= saleDate) {
          cost = history[i].cost;
          break;
        }
      }
      if (cost == null || !(cost >= 0)) {
        cost = Number(row.product.purchase_rate) || 0;
      }
      if (!dryRun) {
        ops.push(
          prisma.saleItem.update({
            where: { id: row.id },
            data: { unit_cost: cost },
          }),
        );
      }
      updated += 1;
    }
    if (ops.length) await prisma.$transaction(ops);
    console.log(`… processed ${updated}/${totalMissing}`);
  }

  console.log(dryRun ? `Would update ${updated} lines` : `Updated ${updated} lines`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
