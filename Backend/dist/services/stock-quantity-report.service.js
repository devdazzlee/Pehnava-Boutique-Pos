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
        p.min_qty AS min_qty,
        p.purchase_rate AS purchase_rate,
        CASE WHEN p.sales_rate_inc_dis_and_tax > 0 THEN p.sales_rate_inc_dis_and_tax ELSE p.sales_rate_exc_dis_and_tax END AS sales_rate,
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
      GROUP BY p.id, p.sku, p.name, u.name, sz.name, col.name, cat.name, p.min_qty, p.purchase_rate, p.sales_rate_inc_dis_and_tax, p.sales_rate_exc_dis_and_tax
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
            const minQty = num(row.min_qty);
            const cost = num(row.purchase_rate);
            const price = num(row.sales_rate);
            const availableBase = opening + boughtQty;
            const status = availableQty <= 0 ? 'out' : minQty > 0 && availableQty <= minQty ? 'low' : 'in';
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
                minQty,
                status,
                cost,
                stockValue: round2(Math.max(availableQty, 0) * cost),
                retailValue: round2(Math.max(availableQty, 0) * price),
                // Share of what was on hand + bought in the period that got sold.
                sellThrough: availableBase > 0 ? Math.round((soldQty / availableBase) * 1000) / 10 : null,
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
        const statusCounts = {
            all: lines.length,
            in: lines.filter((l) => l.status === 'in').length,
            low: lines.filter((l) => l.status === 'low').length,
            out: lines.filter((l) => l.status === 'out').length,
        };
        const stockValue = round2(lines.reduce((sum, l) => sum + l.stockValue, 0));
        const retailValue = round2(lines.reduce((sum, l) => sum + l.retailValue, 0));
        const sellBase = totals.opening + totals.boughtQty;
        const sellThrough = sellBase > 0 ? Math.round((totals.soldQty / sellBase) * 1000) / 10 : null;
        // Status filter, sort and paging on the server; exports pass `all`.
        const status = params.status && params.status !== 'all' ? params.status : null;
        let view = status ? lines.filter((l) => l.status === status) : lines;
        const sort = params.sort || 'name_asc';
        view = [...view].sort((a, b) => {
            switch (sort) {
                case 'sold_desc':
                    return b.soldQty - a.soldQty || a.item.localeCompare(b.item);
                case 'bought_desc':
                    return b.boughtQty - a.boughtQty || a.item.localeCompare(b.item);
                case 'available_asc':
                    return a.availableQty - b.availableQty || a.item.localeCompare(b.item);
                case 'available_desc':
                    return b.availableQty - a.availableQty || a.item.localeCompare(b.item);
                case 'value_desc':
                    return b.stockValue - a.stockValue || a.item.localeCompare(b.item);
                default:
                    return a.item.localeCompare(b.item);
            }
        });
        const viewTotals = view.reduce((sum, l) => ({
            count: sum.count + 1,
            opening: round2(sum.opening + l.opening),
            boughtQty: round2(sum.boughtQty + l.boughtQty),
            soldQty: round2(sum.soldQty + l.soldQty),
            closing: round2(sum.closing + l.closing),
            availableQty: round2(sum.availableQty + l.availableQty),
            stockValue: round2(sum.stockValue + l.stockValue),
        }), { count: 0, opening: 0, boughtQty: 0, soldQty: 0, closing: 0, availableQty: 0, stockValue: 0 });
        const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
        const totalPages = Math.max(1, Math.ceil(view.length / limit));
        const page = Math.min(Math.max(Number(params.page) || 1, 1), totalPages);
        const pageLines = params.all ? view : view.slice((page - 1) * limit, page * limit);
        return {
            period: { from: params.from, to: params.to },
            categories,
            branches,
            lines: pageLines,
            totals: { ...totals, stockValue, retailValue, sellThrough },
            statusCounts,
            viewTotals,
            pagination: {
                page: params.all ? 1 : page,
                limit: params.all ? view.length : limit,
                total: view.length,
                totalPages: params.all ? 1 : totalPages,
            },
        };
    }
}
exports.StockQuantityReportService = StockQuantityReportService;
//# sourceMappingURL=stock-quantity-report.service.js.map