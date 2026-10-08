"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatsService = void 0;
const client_1 = require("../prisma/client");
const client_2 = require("@prisma/client");
const timezone_1 = require("../utils/timezone");
/** Completed checkout bills only — refunds/exchanges are tracked separately. */
const TODAY_SALE_STATUSES = [client_2.SaleStatus.COMPLETED];
const TODAY_REFUND_STATUSES = [client_2.SaleStatus.REFUNDED, client_2.SaleStatus.EXCHANGED];
class StatsService {
    todayBounds() {
        const ymd = (0, timezone_1.businessTodayYmd)();
        return (0, timezone_1.businessDayRange)(ymd, ymd);
    }
    async totalCustomers(branchId) {
        if (branchId) {
            // Customers aren't branch-owned in the schema, so "this branch's
            // customers" means distinct buyers who have a sale at this branch.
            const distinctBuyers = await client_1.prisma.sale.findMany({
                where: { branch_id: branchId, customer_id: { not: null } },
                distinct: ["customer_id"],
                select: { customer_id: true },
            });
            return distinctBuyers.length;
        }
        return client_1.prisma.customer.count();
    }
    async newCustomersToday() {
        const { start } = this.todayBounds();
        return client_1.prisma.customer.count({ where: { created_at: { gte: start } } });
    }
    async lowStockProducts(branchId) {
        const where = {
            current_quantity: { lt: 10 },
            product: { is_active: true },
        };
        if (branchId)
            where.branch_id = branchId;
        const lowStock = await client_1.prisma.stock.findMany({
            where,
            select: {
                id: true,
                current_quantity: true,
                product_id: true,
                product: {
                    select: {
                        name: true,
                        sku: true,
                        is_active: true,
                    },
                },
                branch: {
                    select: { id: true, name: true },
                },
            },
            orderBy: { current_quantity: "asc" },
        });
        return lowStock;
    }
    async todaySales(branchId) {
        const { start, end } = this.todayBounds();
        const where = {
            sale_date: { gte: start, lte: end },
            status: { in: TODAY_SALE_STATUSES },
        };
        if (branchId)
            where.branch_id = branchId;
        const sales = await client_1.prisma.sale.findMany({
            where,
            select: {
                id: true,
                total_amount: true,
                sale_number: true,
                status: true,
                created_at: true,
                sale_date: true,
                branch: { select: { id: true, name: true } },
            },
            orderBy: { sale_date: "desc" },
        });
        return sales;
    }
    async paymentBreakdownToday(branchId) {
        const { start, end } = this.todayBounds();
        const where = {
            sale_date: { gte: start, lte: end },
            status: { in: TODAY_SALE_STATUSES },
        };
        if (branchId)
            where.branch_id = branchId;
        const grouped = await client_1.prisma.sale.groupBy({
            by: ["payment_method"],
            where,
            _sum: { total_amount: true },
            _count: { id: true },
        });
        return grouped.map((g) => ({
            method: g.payment_method,
            total: Number(g._sum.total_amount || 0),
            count: g._count.id,
        }));
    }
    async todaySalesAggregate(branchId) {
        const { start, end } = this.todayBounds();
        const saleWhere = {
            sale_date: { gte: start, lte: end },
            status: { in: TODAY_SALE_STATUSES },
        };
        if (branchId)
            saleWhere.branch_id = branchId;
        const [totals, itemsSold] = await Promise.all([
            client_1.prisma.sale.aggregate({
                where: saleWhere,
                _sum: {
                    total_amount: true,
                    discount_amount: true,
                    tax_amount: true,
                },
                _count: { id: true },
                _avg: { total_amount: true },
            }),
            client_1.prisma.saleItem.aggregate({
                where: {
                    sale: saleWhere,
                    item_type: { not: "RETURN" },
                },
                _sum: { quantity: true },
            }),
        ]);
        return {
            salesCount: totals._count.id,
            salesTotal: Number(totals._sum.total_amount || 0),
            discountToday: Number(totals._sum.discount_amount || 0),
            taxToday: Number(totals._sum.tax_amount || 0),
            avgOrderValue: Number(totals._avg.total_amount || 0),
            itemsSoldToday: Number(itemsSold._sum.quantity || 0),
        };
    }
    async todayRefundsAggregate(branchId) {
        const { start, end } = this.todayBounds();
        const where = {
            sale_date: { gte: start, lte: end },
            status: { in: TODAY_REFUND_STATUSES },
            original_sale_id: { not: null },
        };
        if (branchId)
            where.branch_id = branchId;
        const totals = await client_1.prisma.sale.aggregate({
            where,
            _sum: { total_amount: true },
            _count: { id: true },
        });
        return {
            refundsCount: totals._count.id,
            refundsTotal: Number(totals._sum.total_amount || 0),
        };
    }
    async getDashboardStats(branchId) {
        const [totalCustomers, newCustomersToday, lowStockProducts, todaySales, paymentBreakdown, todayAgg, todayRefunds, branch,] = await Promise.all([
            this.totalCustomers(branchId),
            this.newCustomersToday(),
            this.lowStockProducts(branchId),
            this.todaySales(branchId),
            this.paymentBreakdownToday(branchId),
            this.todaySalesAggregate(branchId),
            this.todayRefundsAggregate(branchId),
            branchId
                ? client_1.prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } })
                : Promise.resolve(null),
        ]);
        const todaySalesTotal = todaySales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
        return {
            branch,
            isAllBranches: !branchId,
            totalCustomers,
            newCustomersToday,
            lowStockProducts,
            lowStockCount: lowStockProducts.length,
            todaySales,
            todaySalesCount: todaySales.length,
            todaySalesTotal,
            paymentBreakdown,
            avgOrderValue: todayAgg.avgOrderValue,
            itemsSoldToday: todayAgg.itemsSoldToday,
            discountToday: todayAgg.discountToday,
            taxToday: todayAgg.taxToday,
            todayRefundsCount: todayRefunds.refundsCount,
            todayRefundsTotal: todayRefunds.refundsTotal,
            todayNetRevenue: todaySalesTotal + todayRefunds.refundsTotal,
        };
    }
}
exports.StatsService = StatsService;
//# sourceMappingURL=stats.service.js.map