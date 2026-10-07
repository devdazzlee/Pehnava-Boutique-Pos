"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.allocateSaleNumber = allocateSaleNumber;
const client_1 = require("../prisma/client");
/**
 * Short receipt numbers: SALE-0001, RTN-0001, …
 * Ignores legacy `SALE-<Date.now()>` values so new numbers stay short.
 */
async function allocateSaleNumber(prefix = 'SALE') {
    const pattern = `^${prefix}-[0-9]{1,6}$`;
    const fromPos = prefix.length + 2;
    const rows = await client_1.prisma.$queryRawUnsafe(`SELECT COALESCE(MAX(
       CASE WHEN sale_number ~ $1
         THEN CAST(substring(sale_number from CAST($2 AS INTEGER)) AS INTEGER)
         ELSE NULL
       END
     ), 0) AS max_n
     FROM "Sale"`, pattern, fromPos);
    let next = Number(rows[0]?.max_n ?? 0) + 1;
    if (!Number.isFinite(next) || next < 1)
        next = 1;
    for (let i = 0; i < 20; i++) {
        const candidate = `${prefix}-${String(next + i).padStart(4, '0')}`;
        const exists = await client_1.prisma.sale.findUnique({
            where: { sale_number: candidate },
            select: { id: true },
        });
        if (!exists)
            return candidate;
    }
    return `${prefix}-${Date.now().toString().slice(-6)}`;
}
//# sourceMappingURL=saleNumber.js.map