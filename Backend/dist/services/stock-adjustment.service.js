"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StockAdjustmentService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const helpers_1 = require("../utils/helpers");
const round = (n) => Math.round(n * 1000) / 1000;
const generateAdjustmentRef = () => `ADJ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
class StockAdjustmentService {
    /**
     * Applies one adjustment line inside a transaction. The system quantity is
     * read from the database here — it used to be sent by the browser, so a
     * stale page could record the wrong variance and overwrite real stock.
     */
    async applyLine(tx, line, common) {
        const stock = await tx.stock.findUnique({
            where: { product_id_branch_id: { product_id: line.productId, branch_id: common.branchId } },
            include: { product: { select: { name: true } } },
        });
        const productName = stock?.product?.name ||
            (await tx.product.findUnique({ where: { id: line.productId }, select: { name: true } }))?.name ||
            'product';
        const systemQty = stock ? (0, helpers_1.asNumber)(stock.current_quantity) : 0;
        let difference = 0;
        let newQty = systemQty;
        let changeQuantity;
        let physicalCount;
        if (common.adjustmentType === 'RECONCILIATION') {
            if (line.physicalCount === undefined || line.physicalCount === null || !Number.isFinite(line.physicalCount)) {
                throw new apiError_1.AppError(400, `Physical count is required for ${productName}`);
            }
            if (line.physicalCount < 0)
                throw new apiError_1.AppError(400, `Physical count cannot be negative for ${productName}`);
            physicalCount = round(line.physicalCount);
            newQty = physicalCount;
            difference = round(physicalCount - systemQty);
            if (difference === 0) {
                throw new apiError_1.AppError(400, `${productName}: counted quantity matches the system — nothing to adjust`);
            }
        }
        else {
            const raw = Math.abs(Number(line.changeQuantity));
            if (!Number.isFinite(raw) || raw === 0) {
                throw new apiError_1.AppError(400, `Enter a quantity greater than 0 for ${productName}`);
            }
            changeQuantity = round(raw);
            difference = common.adjustmentType === 'ADDITION' ? changeQuantity : -changeQuantity;
            newQty = round(systemQty + difference);
            if (newQty < 0) {
                throw new apiError_1.AppError(400, `${productName}: only ${systemQty} in stock — you can't remove ${changeQuantity}`);
            }
        }
        if (stock) {
            await tx.stock.update({
                where: { product_id_branch_id: { product_id: line.productId, branch_id: common.branchId } },
                data: { current_quantity: newQty },
            });
        }
        else {
            await tx.stock.create({
                data: { product_id: line.productId, branch_id: common.branchId, current_quantity: newQty },
            });
        }
        const adjustment = await tx.stockAdjustment.create({
            data: {
                product_id: line.productId,
                branch_id: common.branchId,
                system_quantity: systemQty,
                physical_count: physicalCount,
                change_quantity: common.adjustmentType === 'SUBTRACTION' && changeQuantity ? -changeQuantity : changeQuantity,
                difference,
                adjustment_type: common.adjustmentType,
                adjustment_category: common.adjustmentCategory,
                reason: common.reason,
                reference_no: common.referenceNo,
                adjusted_by: common.adjustedBy,
            },
            include: {
                product: true,
                branch: true,
                user: { select: { email: true } },
            },
        });
        await tx.stockMovement.create({
            data: {
                product_id: line.productId,
                branch_id: common.branchId,
                movement_type: 'ADJUSTMENT',
                reference_id: adjustment.id,
                reference_type: 'adjustment',
                quantity_change: difference,
                previous_qty: systemQty,
                new_qty: newQty,
                notes: common.reason ||
                    `${common.adjustmentType} - ${common.adjustmentCategory}. Ref: ${common.referenceNo || 'N/A'}`,
                created_by: common.adjustedBy,
            },
        });
        return adjustment;
    }
    /** Single-line adjustment (kept for existing callers). */
    async createAdjustment(data) {
        return client_1.prisma.$transaction((tx) => this.applyLine(tx, { productId: data.productId, physicalCount: data.physicalCount, changeQuantity: data.changeQuantity }, data));
    }
    /** Multi-line adjustment saved all-or-nothing under one reference. */
    async createBatch(data) {
        if (!data.lines?.length)
            throw new apiError_1.AppError(400, 'Add at least one product');
        const seen = new Set();
        for (const line of data.lines) {
            if (seen.has(line.productId))
                throw new apiError_1.AppError(400, 'Each product can only appear once per adjustment');
            seen.add(line.productId);
        }
        const common = { ...data, referenceNo: data.referenceNo?.trim() || generateAdjustmentRef() };
        const adjustments = await client_1.prisma.$transaction(async (tx) => {
            const out = [];
            for (const line of data.lines)
                out.push(await this.applyLine(tx, line, common));
            return out;
        });
        const net = adjustments.reduce((sum, a) => sum + (0, helpers_1.asNumber)(a.difference), 0);
        return { referenceNo: common.referenceNo, count: adjustments.length, netChange: round(net), adjustments };
    }
    async listAdjustments(params) {
        const page = Math.max(params.page || 1, 1);
        const limit = Math.min(Math.max(params.limit || 20, 1), 100);
        const skip = (page - 1) * limit;
        const where = {};
        if (params.productId)
            where.product_id = params.productId;
        if (params.branchId)
            where.branch_id = params.branchId;
        if (params.adjustmentCategory)
            where.adjustment_category = params.adjustmentCategory;
        if (params.startDate || params.endDate) {
            where.adjustment_date = {};
            if (params.startDate)
                where.adjustment_date.gte = params.startDate;
            if (params.endDate)
                where.adjustment_date.lte = params.endDate;
        }
        const search = params.search?.trim();
        if (search) {
            where.OR = [
                { reference_no: { contains: search, mode: 'insensitive' } },
                { reason: { contains: search, mode: 'insensitive' } },
                { product: { name: { contains: search, mode: 'insensitive' } } },
                { product: { sku: { contains: search, mode: 'insensitive' } } },
                { product: { code: { contains: search, mode: 'insensitive' } } },
                { branch: { name: { contains: search, mode: 'insensitive' } } },
            ];
        }
        // Type counts ignore the type filter so the chips always show all types.
        const listWhere = params.adjustmentType
            ? { ...where, adjustment_type: params.adjustmentType }
            : where;
        const [total, adjustments, summaryRows] = await Promise.all([
            client_1.prisma.stockAdjustment.count({ where: listWhere }),
            client_1.prisma.stockAdjustment.findMany({
                where: listWhere,
                skip,
                take: limit,
                orderBy: { adjustment_date: 'desc' },
                include: {
                    product: true,
                    branch: true,
                    user: { select: { email: true } },
                },
            }),
            client_1.prisma.stockAdjustment.findMany({
                where,
                select: {
                    adjustment_type: true,
                    difference: true,
                    product: { select: { purchase_rate: true } },
                },
            }),
        ]);
        const typeCounts = { RECONCILIATION: 0, ADDITION: 0, SUBTRACTION: 0 };
        let unitsGained = 0;
        let unitsLost = 0;
        let valueGained = 0;
        let valueLost = 0;
        let filteredCount = 0;
        for (const row of summaryRows) {
            typeCounts[row.adjustment_type] = (typeCounts[row.adjustment_type] || 0) + 1;
            if (params.adjustmentType && row.adjustment_type !== params.adjustmentType)
                continue;
            filteredCount += 1;
            const diff = (0, helpers_1.asNumber)(row.difference);
            const cost = (0, helpers_1.asNumber)(row.product?.purchase_rate || 0);
            if (diff > 0) {
                unitsGained += diff;
                valueGained += diff * cost;
            }
            else if (diff < 0) {
                unitsLost += -diff;
                valueLost += -diff * cost;
            }
        }
        return {
            data: adjustments,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.max(1, Math.ceil(total / limit)),
                summary: {
                    count: filteredCount,
                    allCount: summaryRows.length,
                    typeCounts,
                    unitsGained: round(unitsGained),
                    unitsLost: round(unitsLost),
                    netUnits: round(unitsGained - unitsLost),
                    valueGained: Math.round(valueGained * 100) / 100,
                    valueLost: Math.round(valueLost * 100) / 100,
                    netValue: Math.round((valueGained - valueLost) * 100) / 100,
                },
            },
        };
    }
}
exports.StockAdjustmentService = StockAdjustmentService;
//# sourceMappingURL=stock-adjustment.service.js.map