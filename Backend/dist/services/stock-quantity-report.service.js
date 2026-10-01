"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StockQuantityReportService = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const timezone_1 = require("../utils/timezone");
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);
const num = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
class StockQuantityReportService {
    async report(params) {
        const isAdmin = ADMIN_ROLES.has(params.userRole || '');
        const branchId = isAdmin ? params.branchId : params.userBranchId || undefined;
        const { start, end } = (0, timezone_1.localRange)(params.from, params.to);
        const type = params.type === 'finished' || params.type === 'loose' ? params.type : 'all';
        const activity = params.activity === 'moved' ? 'moved' : 'all';
        const search = params.search?.trim().replace(/[%_\\]/g, '\\$&') || '';
        const rows = await client_2.prisma.$queryRaw(client_1.Prisma.sql `
      SELECT
        p.id,
        p.sku,
        p.name,
        u.name AS unit,
        sz.name AS size_name,
        col.name AS color_name,
        cat.name AS category_name,
        COALESCE(SUM(CASE WHEN m.created_at < ${start} THEN m.quantity_change ELSE 0 END), 0) AS opening,
        COALESCE(SUM(CASE
          WHEN m.created_at >= ${start} AND m.created_at <= ${end}
            AND m.movement_type = 'PURCHASE'
            AND m.quantity_change > 0
          THEN m.quantity_change ELSE 0 END), 0) AS bought_qty,
        COALESCE(SUM(CASE
          WHEN m.created_at >= ${start} AND m.created_at <= ${end}
            AND m.movement_type = 'SALE'
            AND m.quantity_change < 0
          THEN -m.quantity_change ELSE 0 END), 0) AS sold_qty,
        COALESCE(SUM(CASE
          WHEN m.created_at >= ${start} AND m.created_at <= ${end}
            AND m.quantity_change > 0
          THEN m.quantity_change ELSE 0 END), 0) AS in_qty,
        COALESCE(SUM(CASE
          WHEN m.created_at >= ${start} AND m.created_at <= ${end}
            AND m.quantity_change < 0
          THEN -m.quantity_change ELSE 0 END), 0) AS out_qty,
        COALESCE((
          SELECT SUM(s.current_quantity)
          FROM "Stock" s
          WHERE s.product_id = p.id
          ${branchId ? client_1.Prisma.sql `AND s.branch_id = ${branchId}` : client_1.Prisma.empty}
        ), 0) AS available_qty
      FROM "Product" p
      LEFT JOIN "StockMovement" m
        ON m.product_id = p.id
        ${branchId ? client_1.Prisma.sql `AND m.branch_id = ${branchId}` : client_1.Prisma.empty}
      LEFT JOIN "Unit" u ON u.id = p.unit_id
      LEFT JOIN "Size" sz ON sz.id = p.size_id
      LEFT JOIN "Color" col ON col.id = p.color_id
      LEFT JOIN "Category" cat ON cat.id = p.category_id
      WHERE p.is_active = true
        ${params.categoryId ? client_1.Prisma.sql `AND p.category_id = ${params.categoryId}` : client_1.Prisma.empty}
        ${type === 'finished' ? client_1.Prisma.sql `AND p.is_finished_good = true AND p.is_loose_item = false` : client_1.Prisma.empty}
        ${type === 'loose' ? client_1.Prisma.sql `AND p.is_loose_item = true` : client_1.Prisma.empty}
        ${search ? client_1.Prisma.sql `AND (p.name ILIKE ${`%${search}%`} OR p.sku ILIKE ${`%${search}%`} OR p.code ILIKE ${`%${search}%`})` : client_1.Prisma.empty}
      GROUP BY p.id, p.sku, p.name, u.name, sz.name, col.name, cat.name
      ORDER BY p.name ASC
    `);
        const [categories, branches] = await Promise.all([
            client_2.prisma.category.findMany({
                where: { is_active: true },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
            }),
            isAdmin
                ? client_2.prisma.branch.findMany({
                    where: { is_active: true },
                    select: { id: true, name: true, code: true },
                    orderBy: { name: 'asc' },
                })
                : Promise.resolve([]),
        ]);
        const lines = rows
            .map((row) => {
            const opening = round2(num(row.opening));
            const boughtQty = round2(num(row.bought_qty));
            const soldQty = round2(num(row.sold_qty));
            const inQty = round2(num(row.in_qty));
            const outQty = round2(num(row.out_qty));
            const closing = round2(opening + inQty - outQty);
            const availableQty = round2(num(row.available_qty));
            const item = [row.name, row.size_name, row.color_name].filter(Boolean).join(' · ');
            return {
                id: row.id,
                sku: row.sku,
                item,
                dressName: row.name,
                unit: row.unit || 'Pcs',
                category: row.category_name || '—',
                opening,
                boughtQty,
                soldQty,
                inQty,
                outQty,
                closing,
                availableQty,
            };
        })
            .filter((line) => activity === 'all' ||
            line.opening !== 0 ||
            line.boughtQty !== 0 ||
            line.soldQty !== 0 ||
            line.inQty !== 0 ||
            line.outQty !== 0 ||
            line.availableQty !== 0);
        const totals = lines.reduce((sum, line) => ({
            count: sum.count + 1,
            opening: round2(sum.opening + line.opening),
            boughtQty: round2(sum.boughtQty + line.boughtQty),
            soldQty: round2(sum.soldQty + line.soldQty),
            inQty: round2(sum.inQty + line.inQty),
            outQty: round2(sum.outQty + line.outQty),
            closing: round2(sum.closing + line.closing),
            availableQty: round2(sum.availableQty + line.availableQty),
        }), {
            count: 0,
            opening: 0,
            boughtQty: 0,
            soldQty: 0,
            inQty: 0,
            outQty: 0,
            closing: 0,
            availableQty: 0,
        });
        return {
            period: { from: params.from, to: params.to },
            categories,
            branches,
            lines,
            totals,
        };
    }
}
exports.StockQuantityReportService = StockQuantityReportService;
//# sourceMappingURL=stock-quantity-report.service.js.map