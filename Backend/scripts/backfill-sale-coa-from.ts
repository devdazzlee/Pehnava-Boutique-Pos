/**
 * Backfill Chart of Accounts journal vouchers for POS sales.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/backfill-sale-coa-from.ts
 *   npx ts-node --transpile-only scripts/backfill-sale-coa-from.ts --from=2026-10-03
 *   npx ts-node --transpile-only scripts/backfill-sale-coa-from.ts --from=2026-10-03 --to=2026-10-10
 */
import { saleAccountingService } from '../src/services/sale-accounting.service';

function arg(name: string, fallback?: string) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main() {
  const from = arg('from', '2026-10-03')!;
  const to = arg('to');
  console.log(`Backfilling sale CoA vouchers from ${from}${to ? ` to ${to}` : ''}…`);
  const result = await saleAccountingService.backfillFrom(from, to ? { toYmd: to } : undefined);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
