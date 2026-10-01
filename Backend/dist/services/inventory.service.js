"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryService = void 0;
const client_1 = require("../prisma/client");
const helpers_1 = require("../utils/helpers");
const timezone_1 = require("../utils/timezone");
class InventoryService {
    async getDashboardStats(_userRole, branchId) {
        const warehouse = await client_1.prisma.branch.findFirst({
            where: { branch_type: 'WAREHOUSE', is_active: true },
        });
        // Apply branch filter whenever a branchId is provided (admins can opt into all-branches by omitting it).
        const branchFilter = branchId || undefined;
        const stockWhere = {};
        if (branchFilter) {
            stockWhere.branch_id = branchFilter;
        }
        const stocks = await client_1.prisma.stock.findMany({
            where: stockWhere,
            include: {
                product: { include: { category: true } },
                branch: true,
            },
        });
        let totalInventoryValue = 0;
        let positiveInventoryValue = 0;
        let totalStockQuantity = 0;
        let negativeStockCount = 0;
        const branchSummary = {};
        for (const s of stocks) {
            const qty = (0, helpers_1.asNumber)(s.current_quantity);
            totalStockQuantity += qty;
            if (qty < 0)
                negativeStockCount += 1;
            const cost = (0, helpers_1.asNumber)(s.product.purchase_rate || 0);
            const value = qty * cost;
            const bid = s.branch_id;
            if (!branchSummary[bid]) {
                branchSummary[bid] = {
                    name: s.branch.name,
                    value: 0,
                    items: 0,
                    type: s.branch.branch_type,
                };
            }
            branchSummary[bid].value += value;
            branchSummary[bid].items += 1;
            totalInventoryValue += value;
            if (qty > 0)
                positiveInventoryValue += value;
        }
        const startOfMonth = (0, timezone_1.startOfBusinessMonth)();
        const purchaseWhere = {
            purchase_date: { gte: startOfMonth },
        };
        if (branchFilter)
            purchaseWhere.warehouse_branch_id = branchFilter;
        const recentPurchases = await client_1.prisma.purchase.findMany({
            where: purchaseWhere,
            take: 5,
            orderBy: { purchase_date: 'desc' },
            include: { product: true, supplier: true },
        });
        const pendingTransfersWhere = {
            status: { in: ['PENDING', 'DISPATCHED'] },
        };
        if (branchFilter) {
            pendingTransfersWhere.OR = [
                { from_branch_id: branchFilter },
                { to_branch_id: branchFilter },
            ];
        }
        const pendingTransfers = await client_1.prisma.transfer.findMany({
            where: pendingTransfersWhere,
            take: 10,
            orderBy: { transfer_date: 'desc' },
            include: { product: true, from_branch: true, to_branch: true },
        });
        const lowStockItems = stocks
            .filter((s) => {
            const minQty = (0, helpers_1.asNumber)(s.product.min_qty ?? s.minimum_quantity ?? 0);
            return (0, helpers_1.asNumber)(s.current_quantity) <= minQty && minQty > 0;
        })
            .sort((a, b) => (0, helpers_1.asNumber)(a.current_quantity) - (0, helpers_1.asNumber)(b.current_quantity));
        const lowStockAlerts = lowStockItems.slice(0, 25).map((s) => ({
            productId: s.product_id,
            product: {
                id: s.product.id,
                name: s.product.name,
                sku: s.product.sku,
                code: s.product.code,
            },
            branch: {
                id: s.branch.id,
                name: s.branch.name,
            },
            currentQuantity: (0, helpers_1.asNumber)(s.current_quantity),
            minThreshold: (0, helpers_1.asNumber)(s.product.min_qty ?? s.minimum_quantity ?? 0),
        }));
        const outOfStockItems = stocks.filter((s) => (0, helpers_1.asNumber)(s.current_quantity) <= 0);
        const sortedTopValued = Object.entries(branchSummary)
            .map(([id, v]) => ({ branchId: id, ...v }))
            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const movementTrendRaw = await client_1.prisma.stockMovement.groupBy({
            by: ['movement_type'],
            where: {
                created_at: { gte: sevenDaysAgo },
                ...(branchFilter ? { branch_id: branchFilter } : {}),
            },
            _count: true,
            _sum: { quantity_change: true },
        });
        const movementTrend = movementTrendRaw.map((m) => ({
            movement_type: m.movement_type,
            count: m._count,
            quantity: Math.abs((0, helpers_1.asNumber)(m._sum?.quantity_change || 0)),
        }));
        const categorySummary = {};
        for (const s of stocks) {
            const catName = s.product.category?.name || 'Uncategorized';
            const cost = (0, helpers_1.asNumber)(s.product.purchase_rate || 0);
            const qty = (0, helpers_1.asNumber)(s.current_quantity);
            // Category valuation uses positive stock only so the chart stays meaningful
            const val = Math.max(0, qty) * cost;
            if (!categorySummary[catName])
                categorySummary[catName] = { value: 0, items: 0 };
            categorySummary[catName].value += val;
            if (qty > 0)
                categorySummary[catName].items += 1;
        }
        const topMoving = await client_1.prisma.stockMovement.groupBy({
            by: ['product_id'],
            where: {
                movement_type: 'SALE',
                created_at: { gte: sevenDaysAgo },
                ...(branchFilter ? { branch_id: branchFilter } : {}),
            },
            _sum: { quantity_change: true },
            orderBy: { _sum: { quantity_change: 'asc' } }, // SALE qty is negative
            take: 8,
        });
        const productIds = topMoving.map((m) => m.product_id);
        const products = productIds.length > 0
            ? await client_1.prisma.product.findMany({
                where: { id: { in: productIds } },
                select: { id: true, name: true, sku: true },
            })
            : [];
        const productMap = new Map(products.map((p) => [p.id, p]));
        const topMovingWithNames = topMoving
            .map((m) => {
            const p = productMap.get(m.product_id);
            return {
                productId: m.product_id,
                name: p?.name || 'Unknown',
                sku: p?.sku || '',
                quantity: Math.abs((0, helpers_1.asNumber)(m._sum?.quantity_change || 0)),
            };
        })
            .filter((m) => m.quantity > 0)
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5);
        const purchasesThisMonth = await client_1.prisma.purchase.findMany({
            where: {
                created_at: { gte: startOfMonth },
                ...(branchFilter ? { warehouse_branch_id: branchFilter } : {}),
            },
            select: { quantity: true, cost_price: true },
        });
        const poTotalValue = purchasesThisMonth.reduce((acc, p) => acc + (0, helpers_1.asNumber)(p.quantity) * (0, helpers_1.asNumber)(p.cost_price), 0);
        const activeBranches = await client_1.prisma.branch.count({
            where: { is_active: true },
        });
        const sortedCategories = Object.entries(categorySummary)
            .map(([name, v]) => ({ name, ...v }))
            .filter((c) => c.value > 0)
            .sort((a, b) => b.value - a.value);
        return {
            totalInventoryValue,
            positiveInventoryValue,
            totalStockQuantity,
            negativeStockCount,
            lowStockCount: lowStockItems.length,
            totalSkus: await client_1.prisma.product.count({ where: { is_active: true } }),
            outOfStockCount: outOfStockItems.length,
            totalLocations: branchFilter ? 1 : activeBranches,
            pendingTransferCount: pendingTransfers.length,
            branchSummary: sortedTopValued,
            categorySummary: sortedCategories,
            velocity: topMovingWithNames,
            recentPurchases: recentPurchases.map((p) => ({
                id: p.id,
                quantity: (0, helpers_1.asNumber)(p.quantity),
                costPrice: (0, helpers_1.asNumber)(p.cost_price),
                purchaseDate: p.purchase_date,
                product: p.product
                    ? { id: p.product.id, name: p.product.name }
                    : null,
                supplier: p.supplier
                    ? { id: p.supplier.id, name: p.supplier.name }
                    : null,
            })),
            pendingTransfers: pendingTransfers.map((t) => ({
                id: t.id,
                quantity: (0, helpers_1.asNumber)(t.quantity),
                status: t.status,
                transferDate: t.transfer_date,
                product: t.product
                    ? { id: t.product.id, name: t.product.name }
                    : null,
                from_branch: t.from_branch
                    ? { id: t.from_branch.id, name: t.from_branch.name }
                    : null,
                to_branch: t.to_branch
                    ? { id: t.to_branch.id, name: t.to_branch.name }
                    : null,
            })),
            lowStockAlerts,
            movementTrend,
            procurementHealth: {
                count: purchasesThisMonth.length,
                totalValue: poTotalValue,
            },
            warehouse: warehouse
                ? { id: warehouse.id, name: warehouse.name }
                : null,
            filteredBranchId: branchFilter || null,
        };
    }
    async getLowStockProducts(branchId) {
        const where = {};
        if (branchId)
            where.branch_id = branchId;
        const stocks = await client_1.prisma.stock.findMany({
            where,
            include: { product: true, branch: true },
        });
        const lowStock = stocks.filter((s) => {
            const minQty = (0, helpers_1.asNumber)(s.product.min_qty ?? s.minimum_quantity ?? 0);
            return minQty > 0 && (0, helpers_1.asNumber)(s.current_quantity) <= minQty;
        });
        return lowStock;
    }
    async getStockMovements(params) {
        const page = params.page || 1;
        const limit = params.limit || 50;
        const skip = (page - 1) * limit;
        const where = {};
        if (params.branchId &&
            params.userRole &&
            ['ADMIN', 'SUPER_ADMIN'].includes(params.userRole)) {
            where.branch_id = params.branchId;
        }
        else if (params.branchId &&
            params.userRole &&
            !['ADMIN', 'SUPER_ADMIN'].includes(params.userRole)) {
            where.branch_id = params.branchId;
        }
        if (params.productId)
            where.product_id = params.productId;
        if (params.movementType)
            where.movement_type = params.movementType;
        if (params.direction === 'in')
            where.quantity_change = { gt: 0 };
        if (params.direction === 'out')
            where.quantity_change = { lt: 0 };
        if (params.startDate || params.endDate) {
            where.created_at = {};
            if (params.startDate)
                where.created_at.gte = params.startDate;
            if (params.endDate)
                where.created_at.lte = params.endDate;
        }
        // Summary must reflect ALL movements matching the filter, not just the
        // current page. Previously we summed `movements` (the paginated slice)
        // which produced "+0 / -0" whenever the meaningful inbound/outbound
        // records lived on a later page.
        const [total, movements, increaseAgg, decreaseAgg] = await Promise.all([
            client_1.prisma.stockMovement.count({ where }),
            client_1.prisma.stockMovement.findMany({
                where,
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    product: true,
                    branch: true,
                    user: { select: { email: true } },
                },
            }),
            client_1.prisma.stockMovement.aggregate({
                _sum: { quantity_change: true },
                where: { ...where, quantity_change: { gt: 0 } },
            }),
            client_1.prisma.stockMovement.aggregate({
                _sum: { quantity_change: true },
                where: { ...where, quantity_change: { lt: 0 } },
            }),
        ]);
        const summary = {
            totalIncrease: (0, helpers_1.asNumber)(increaseAgg._sum.quantity_change),
            totalDecrease: Math.abs((0, helpers_1.asNumber)(decreaseAgg._sum.quantity_change)),
            count: total,
        };
        return {
            data: movements,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
            summary,
        };
    }
    async getStockByLocation(branchId, _userRole) {
        const where = {};
        if (branchId) {
            where.branch_id = branchId;
        }
        const stocks = await client_1.prisma.stock.findMany({
            where,
            include: {
                product: { include: { category: true } },
                branch: true,
            },
            orderBy: [{ branch_id: 'asc' }, { product_id: 'asc' }],
        });
        return stocks;
    }
    async getReports(params) {
        switch (params.type) {
            case 'valuation': {
                const where = {};
                if (params.branchId)
                    where.branch_id = params.branchId;
                const stocks = await client_1.prisma.stock.findMany({
                    where,
                    include: { product: true, branch: true },
                });
                const byLocation = {};
                let totalValue = 0;
                let totalItems = 0;
                for (const s of stocks) {
                    const bid = s.branch_id;
                    if (!byLocation[bid]) {
                        byLocation[bid] = { value: 0, items: [] };
                    }
                    const cost = (0, helpers_1.asNumber)(s.product.purchase_rate || 0);
                    const value = (0, helpers_1.asNumber)(s.current_quantity) * cost;
                    byLocation[bid].value += value;
                    totalValue += value;
                    totalItems += 1;
                    byLocation[bid].items.push({
                        product: s.product,
                        quantity: (0, helpers_1.asNumber)(s.current_quantity),
                        value,
                    });
                }
                return {
                    byLocation,
                    totalValue,
                    summary: { totalValue, totalItems, locationsCount: Object.keys(byLocation).length }
                };
            }
            case 'purchase': {
                const where = {};
                if (params.branchId)
                    where.warehouse_branch_id = params.branchId;
                if (params.supplierId)
                    where.supplier_id = params.supplierId;
                if (params.productId)
                    where.product_id = params.productId;
                if (params.startDate || params.endDate) {
                    where.purchase_date = {};
                    if (params.startDate)
                        where.purchase_date.gte = params.startDate;
                    if (params.endDate)
                        where.purchase_date.lte = params.endDate;
                }
                const purchases = await client_1.prisma.purchase.findMany({
                    where,
                    include: { product: true, supplier: true, warehouse_branch: true },
                    orderBy: { purchase_date: 'desc' },
                });
                const totalCost = purchases.reduce((acc, p) => acc + (0, helpers_1.asNumber)(p.quantity) * (0, helpers_1.asNumber)(p.cost_price), 0);
                return {
                    data: purchases,
                    summary: { count: purchases.length, totalCost, avgPrice: purchases.length ? totalCost / purchases.length : 0 }
                };
            }
            case 'transfer': {
                const where = {};
                if (params.branchId) {
                    where.OR = [
                        { from_branch_id: params.branchId },
                        { to_branch_id: params.branchId },
                    ];
                }
                if (params.productId)
                    where.product_id = params.productId;
                if (params.startDate || params.endDate) {
                    where.transfer_date = {};
                    if (params.startDate)
                        where.transfer_date.gte = params.startDate;
                    if (params.endDate)
                        where.transfer_date.lte = params.endDate;
                }
                const transfers = await client_1.prisma.transfer.findMany({
                    where,
                    include: {
                        product: true,
                        from_branch: true,
                        to_branch: true,
                    },
                    orderBy: { transfer_date: 'desc' },
                });
                return {
                    data: transfers,
                    summary: { count: transfers.length, completed: transfers.filter(t => t.status === 'RECEIVED').length }
                };
            }
            case 'stockout': {
                const where = {
                    movement_type: { in: ['SALE', 'DAMAGE', 'LOSS', 'EXPIRED'] },
                };
                if (params.branchId)
                    where.branch_id = params.branchId;
                if (params.productId)
                    where.product_id = params.productId;
                if (params.startDate || params.endDate) {
                    where.created_at = {};
                    if (params.startDate)
                        where.created_at.gte = params.startDate;
                    if (params.endDate)
                        where.created_at.lte = params.endDate;
                }
                const movements = await client_1.prisma.stockMovement.findMany({
                    where,
                    include: { product: true, branch: true },
                    orderBy: { created_at: 'desc' },
                });
                const totalQty = movements.reduce((acc, m) => acc + Math.abs((0, helpers_1.asNumber)(m.quantity_change)), 0);
                return {
                    data: movements,
                    summary: { count: movements.length, totalQty, damageCount: movements.filter(m => m.movement_type === 'DAMAGE').length }
                };
            }
            case 'lowstock': {
                const stocks = await client_1.prisma.stock.findMany({
                    where: params.branchId ? { branch_id: params.branchId } : {},
                    include: { product: true, branch: true },
                });
                const items = stocks.filter((s) => {
                    const minQty = (0, helpers_1.asNumber)(s.product.min_qty ?? s.minimum_quantity ?? 0);
                    return minQty > 0 && (0, helpers_1.asNumber)(s.current_quantity) <= minQty;
                });
                return {
                    data: items,
                    summary: { criticalCount: items.filter(i => (0, helpers_1.asNumber)(i.current_quantity) <= 0).length, warningCount: items.length }
                };
            }
            case 'aging': {
                const stocks = await client_1.prisma.stock.findMany({
                    where: params.branchId ? { branch_id: params.branchId } : {},
                    include: { product: true, branch: true },
                });
                const data = await Promise.all(stocks.map(async (s) => {
                    const lastMovement = await client_1.prisma.stockMovement.findFirst({
                        where: { product_id: s.product_id, branch_id: s.branch_id },
                        orderBy: { created_at: 'desc' },
                        select: { created_at: true }
                    });
                    const lastDate = lastMovement?.created_at || s.last_updated;
                    const daysOld = Math.floor((new Date().getTime() - lastDate.getTime()) / (1000 * 3600 * 24));
                    return {
                        product: s.product,
                        branch: s.branch,
                        currentQuantity: (0, helpers_1.asNumber)(s.current_quantity),
                        daysOld,
                        lastAction: lastDate
                    };
                }));
                return {
                    data: data.sort((a, b) => b.daysOld - a.daysOld),
                    summary: { avgAge: data.length ? data.reduce((acc, d) => acc + d.daysOld, 0) / data.length : 0, deadStockCount: data.filter(d => d.daysOld > 90).length }
                };
            }
            case 'movement_summary': {
                const where = {};
                if (params.branchId)
                    where.branch_id = params.branchId;
                if (params.startDate || params.endDate) {
                    where.created_at = {};
                    if (params.startDate)
                        where.created_at.gte = params.startDate;
                    if (params.endDate)
                        where.created_at.lte = params.endDate;
                }
                const stats = await client_1.prisma.stockMovement.groupBy({
                    by: ['movement_type'],
                    where,
                    _sum: { quantity_change: true },
                    _count: true
                });
                return {
                    data: stats,
                    summary: { totalMovements: stats.reduce((acc, s) => acc + s._count, 0) }
                };
            }
            case 'financial_audit': {
                const where = {
                    status: 'COMPLETED'
                };
                if (params.branchId)
                    where.branch_id = params.branchId;
                if (params.startDate || params.endDate) {
                    where.sale_date = {};
                    if (params.startDate)
                        where.sale_date.gte = params.startDate;
                    if (params.endDate)
                        where.sale_date.lte = params.endDate;
                }
                const sales = await client_1.prisma.sale.findMany({
                    where,
                    include: {
                        sale_items: {
                            include: { product: true }
                        },
                        branch: true
                    }
                });
                let totalRevenue = 0;
                let totalCOGS = 0;
                const branchPerformance = {};
                sales.forEach(sale => {
                    const filteredItems = sale.sale_items.filter(item => {
                        if (params.productId && item.product_id !== params.productId)
                            return false;
                        if (params.categoryId && item.product.category_id !== params.categoryId)
                            return false;
                        return true;
                    });
                    if (filteredItems.length === 0)
                        return;
                    const bId = sale.branch_id || 'unknown';
                    if (!branchPerformance[bId]) {
                        branchPerformance[bId] = { name: sale.branch?.name || 'Central', revenue: 0, cogs: 0, profit: 0, count: 0 };
                    }
                    branchPerformance[bId].count += 1;
                    filteredItems.forEach(item => {
                        const rev = (0, helpers_1.asNumber)(item.line_total);
                        const cost = (0, helpers_1.asNumber)(item.product.purchase_rate) * (0, helpers_1.asNumber)(item.quantity);
                        totalRevenue += rev;
                        totalCOGS += cost;
                        branchPerformance[bId].revenue += rev;
                        branchPerformance[bId].cogs += cost;
                        branchPerformance[bId].profit += (rev - cost);
                    });
                });
                return {
                    data: Object.values(branchPerformance),
                    summary: {
                        totalRevenue,
                        totalCOGS,
                        grossProfit: totalRevenue - totalCOGS,
                        profitMargin: totalRevenue > 0 ? ((totalRevenue - totalCOGS) / totalRevenue) * 100 : 0,
                        transactionCount: sales.length
                    }
                };
            }
            default:
                return { data: [], summary: {} };
        }
    }
}
exports.InventoryService = InventoryService;
//# sourceMappingURL=inventory.service.js.map