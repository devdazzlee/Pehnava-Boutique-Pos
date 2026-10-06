import { prisma } from '../prisma/client';

type SalePrefix = 'SALE' | 'RTN';

/**
 * Short receipt numbers: SALE-0001, RTN-0001, …
 * Ignores legacy `SALE-<Date.now()>` values so new numbers stay short.
 */
export async function allocateSaleNumber(prefix: SalePrefix = 'SALE'): Promise<string> {
  const pattern = `^${prefix}-[0-9]{1,6}$`;
  const rows = await prisma.$queryRawUnsafe<{ max_n: number | bigint | null }[]>(
    `SELECT COALESCE(MAX(
       CASE WHEN sale_number ~ $1
         THEN CAST(substring(sale_number from $2) AS INTEGER)
         ELSE NULL
       END
     ), 0) AS max_n
     FROM "Sale"`,
    pattern,
    prefix.length + 2,
  );
  let next = Number(rows[0]?.max_n ?? 0) + 1;
  if (!Number.isFinite(next) || next < 1) next = 1;

  for (let i = 0; i < 20; i++) {
    const candidate = `${prefix}-${String(next + i).padStart(4, '0')}`;
    const exists = await prisma.sale.findUnique({
      where: { sale_number: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }

  return `${prefix}-${Date.now().toString().slice(-6)}`;
}
