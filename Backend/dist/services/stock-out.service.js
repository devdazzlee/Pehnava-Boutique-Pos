"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StockOutService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const helpers_1 = require("../utils/helpers");
const timezone_1 = require("../utils/timezone");
const STOCK_OUT_TYPES = ['SALE', 'DAMAGE', 'LOSS', 'RETURN', 'EXPIRED'];
class StockOutService {
    async logStockOut(data) {
        if (data.quantity <= 0) {
            throw new apiError_1.AppError(400, 'Quantity must be greater than 0');
        }
        if (!STOCK_OUT_TYPES.includes(data.reason)) {
            throw new apiError_1.AppError(400, 'Invalid stock out reason');
        }
        return client_1.prisma.$transaction(async (tx) => {
            const stock = await tx.stock.findUnique({
                where: {
                    product_id_branch_id: {
                        product_id: data.productId,
                        branch_id: data.branchId,
                    },
                },
            });
            if (!stock)
                throw new apiError_1.AppError(404, 'Stock not found');
            const currentQty = (0, helpers_1.asNumber)(stock.current_quantity);
            if (currentQty < data.quantity) {
                throw new apiError_1.AppError(400, 'Insufficient stock to remove');
            }
            const newQty = (0, helpers_1.addDecimal)(stock.current_quantity, -data.quantity);
            await tx.stock.update({
                where: {
                    product_id_branch_id: {
                        product_id: data.productId,
                        branch_id: data.branchId,
                    },
                },
                data: { current_quantity: newQty },
            });
            await tx.stockMovement.create({
                data: {
                    product_id: data.productId,
                    branch_id: data.branchId,
                    movement_type: data.reason,
                    quantity_change: -data.quantity,
                    previous_qty: stock.current_quantity,
                    new_qty: newQty,
                    notes: data.notes || `${data.reason} - Stock out`,
                    created_by: data.createdBy,
                },
            });
            return { newQty, success: true };
        });
    }
    // Bulk dispatch — accepts many lines and removes stock for each, all
    // inside one transaction so a single failure rolls everything back.
    async logBulkStockOut(data) {
        if (!Array.isArray(data.lines) || data.lines.length === 0) {
            throw new apiError_1.AppError(400, 'At least one line is required');
        }
        if (!STOCK_OUT_TYPES.includes(data.reason)) {
            throw new apiError_1.AppError(400, 'Invalid stock out reason');
        }
        return client_1.prisma.$transaction(async (tx) => {
            const movementIds = [];
            for (const line of data.lines) {
                if (!line.productId)
                    throw new apiError_1.AppError(400, 'Product is required on every line');
                if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
                    throw new apiError_1.AppError(400, `Invalid quantity on line for product ${line.productId}`);
                }
                const stock = await tx.stock.findUnique({
                    where: {
                        product_id_branch_id: {
                            product_id: line.productId,
                            branch_id: data.branchId,
                        },
                    },
                });
                if (!stock) {
                    throw new apiError_1.AppError(404, `Stock not found for product ${line.productId}`);
                }
                const currentQty = (0, helpers_1.asNumber)(stock.current_quantity);
                if (currentQty < line.quantity) {
                    throw new apiError_1.AppError(400, `Insufficient stock for product ${line.productId}. Available: ${currentQty}, requested: ${line.quantity}`);
                }
                const newQty = (0, helpers_1.addDecimal)(stock.current_quantity, -line.quantity);
                await tx.stock.update({
                    where: {
                        product_id_branch_id: {
                            product_id: line.productId,
                            branch_id: data.branchId,
                        },
                    },
                    data: { current_quantity: newQty },
                });
                // Compose a useful note line — preserves the dispatch metadata next
                // to the per-line movement so the history view can read it back.
                const noteParts = [];
                if (data.documentRef)
                    noteParts.push(`Ref: ${data.documentRef}`);
                if (line.rate != null)
                    noteParts.push(`Rate: ${line.rate}`);
                if (data.notes)
                    noteParts.push(data.notes);
                const noteText = noteParts.length > 0 ? noteParts.join(' | ') : `${data.reason} - Stock out`;
                const movement = await tx.stockMovement.create({
                    data: {
                        product_id: line.productId,
                        branch_id: data.branchId,
                        movement_type: data.reason,
                        quantity_change: -line.quantity,
                        previous_qty: stock.current_quantity,
                        new_qty: newQty,
                        unit_cost: line.rate ?? undefined,
                        notes: noteText,
                        reference_type: 'stock-out',
                        created_by: data.createdBy,
                    },
                });
                movementIds.push(movement.id);
            }
            return { count: movementIds.length, movementIds };
        });
    }
    // Paginated history of stock-out movements. Filters by reason / date range
    // / branch / product. Powers the "History Logs" tab.
    async listStockOutMovements(params) {
        const page = Math.max(1, params.page ?? 1);
        const limit = Math.max(1, Math.min(200, params.limit ?? 20));
        const skip = (page - 1) * limit;
        const where = {
            // Stock-out movements always have a negative quantity_change and a
            // type from the outbound set.
            quantity_change: { lt: 0 },
            movement_type: params.reason
                ? params.reason
                : { in: ['SALE', 'DAMAGE', 'LOSS', 'EXPIRED', 'RETURN'] },
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
        const [total, rows] = await Promise.all([
            client_1.prisma.stockMovement.count({ where }),
            client_1.prisma.stockMovement.findMany({
                where,
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    product: { select: { id: true, name: true, sku: true } },
                    branch: { select: { id: true, name: true } },
                    user: { select: { id: true, email: true } },
                },
            }),
        ]);
        return {
            data: rows,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
        };
    }
    async getMonthlyStats(branchId) {
        const startOfMonth = (0, timezone_1.startOfBusinessMonth)();
        const where = {
            quantity_change: { lt: 0 },
            movement_type: { in: ['SALE', 'DAMAGE', 'LOSS', 'EXPIRED', 'RETURN'] },
            created_at: { gte: startOfMonth },
        };
        if (branchId)
            where.branch_id = branchId;
        const movements = await client_1.prisma.stockMovement.findMany({
            where,
            select: {
                quantity_change: true,
                unit_cost: true,
                movement_type: true,
            },
        });
        const totalDispatches = movements.length;
        const totalQuantity = movements.reduce((sum, m) => sum + Math.abs((0, helpers_1.asNumber)(m.quantity_change)), 0);
        const totalValue = movements.reduce((sum, m) => {
            const qty = Math.abs((0, helpers_1.asNumber)(m.quantity_change));
            const rate = (0, helpers_1.asNumber)(m.unit_cost);
            return sum + qty * rate;
        }, 0);
        const byReason = {};
        for (const m of movements) {
            const key = String(m.movement_type || 'OTHER');
            byReason[key] = (byReason[key] || 0) + 1;
        }
        return {
            totalDispatches,
            totalQuantity,
            totalValue,
            byReason,
        };
    }
    async logReturn(data) {
        if (data.quantity <= 0) {
            throw new apiError_1.AppError(400, 'Quantity must be greater than 0');
        }
        return client_1.prisma.$transaction(async (tx) => {
            let stock = await tx.stock.findUnique({
                where: {
                    product_id_branch_id: {
                        product_id: data.productId,
                        branch_id: data.branchId,
                    },
                },
            });
            let previousQty = 0;
            let newQty = data.quantity;
            if (stock) {
                previousQty = (0, helpers_1.asNumber)(stock.current_quantity);
                newQty = (0, helpers_1.addDecimal)(stock.current_quantity, data.quantity);
                await tx.stock.update({
                    where: {
                        product_id_branch_id: {
                            product_id: data.productId,
                            branch_id: data.branchId,
                        },
                    },
                    data: { current_quantity: newQty },
                });
            }
            else {
                await tx.stock.create({
                    data: {
                        product_id: data.productId,
                        branch_id: data.branchId,
                        current_quantity: data.quantity,
                    },
                });
            }
            await tx.stockMovement.create({
                data: {
                    product_id: data.productId,
                    branch_id: data.branchId,
                    movement_type: 'RETURN',
                    quantity_change: data.quantity,
                    previous_qty: previousQty,
                    new_qty: typeof newQty === 'number' ? newQty : (0, helpers_1.asNumber)(newQty),
                    notes: data.notes || 'Return - Stock re-added',
                    created_by: data.createdBy,
                },
            });
            return { newQty, success: true };
        });
    }
}
exports.StockOutService = StockOutService;
//# sourceMappingURL=stock-out.service.js.map