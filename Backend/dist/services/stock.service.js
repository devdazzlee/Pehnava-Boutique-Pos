"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StockService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const helpers_1 = require("../utils/helpers");
const timezone_1 = require("../utils/timezone");
class StockService {
    async createStock({ productId, branchId, quantity, supplierId, unitCost, invoiceRef, notes, createdBy }) {
        return client_1.prisma.$transaction(async (tx) => {
            const exists = await tx.stock.findUnique({
                where: { product_id_branch_id: { product_id: productId, branch_id: branchId } },
            });
            let stock;
            let previousQty = 0;
            let newQty = quantity;
            if (exists) {
                // If stock exists, add to existing quantity
                previousQty = (0, helpers_1.asNumber)(exists.current_quantity);
                newQty = (0, helpers_1.addDecimal)(exists.current_quantity, quantity);
                stock = await tx.stock.update({
                    where: { product_id_branch_id: { product_id: productId, branch_id: branchId } },
                    data: {
                        current_quantity: newQty,
                    },
                });
            }
            else {
                // If stock doesn't exist, create new entry
                stock = await tx.stock.create({
                    data: {
                        product_id: productId,
                        branch_id: branchId,
                        current_quantity: quantity,
                    },
                });
            }
            // Compose notes that preserve all the optional metadata next to
            // the movement record so the audit log shows where it came from.
            const noteParts = [];
            if (supplierId)
                noteParts.push(`Supplier: ${supplierId}`);
            if (invoiceRef)
                noteParts.push(`Invoice: ${invoiceRef}`);
            if (notes)
                noteParts.push(notes);
            const noteText = noteParts.length > 0 ? noteParts.join(" | ") : undefined;
            await tx.stockMovement.create({
                data: {
                    product_id: productId,
                    branch_id: branchId,
                    movement_type: "PURCHASE",
                    quantity_change: quantity,
                    previous_qty: previousQty,
                    new_qty: newQty,
                    unit_cost: unitCost,
                    notes: noteText,
                    created_by: createdBy,
                },
            });
            return stock;
        });
    }
    async adjustStock({ productId, branchId, quantityChange, reason, notes, createdBy }) {
        return client_1.prisma.$transaction(async (tx) => {
            const stock = await tx.stock.findUnique({
                where: { product_id_branch_id: { product_id: productId, branch_id: branchId } },
            });
            if (!stock)
                throw new apiError_1.AppError(404, "Stock not found");
            const newQty = (0, helpers_1.addDecimal)(stock.current_quantity, quantityChange);
            if (newQty.lt(0))
                throw new apiError_1.AppError(400, "Insufficient stock");
            await tx.stock.update({
                where: {
                    product_id_branch_id: {
                        product_id: productId,
                        branch_id: branchId,
                    },
                },
                data: {
                    current_quantity: newQty,
                },
            });
            // Combine reason + notes so both surface in the movement log.
            const noteParts = [];
            if (reason)
                noteParts.push(`Reason: ${reason}`);
            if (notes)
                noteParts.push(notes);
            const noteText = noteParts.length > 0 ? noteParts.join(" | ") : undefined;
            await tx.stockMovement.create({
                data: {
                    product_id: productId,
                    branch_id: branchId,
                    movement_type: quantityChange > 0 ? "ADJUSTMENT" : "DAMAGE",
                    quantity_change: quantityChange,
                    previous_qty: stock.current_quantity,
                    new_qty: newQty,
                    notes: noteText,
                    created_by: createdBy,
                },
            });
            return { newQty };
        });
    }
    async transferStock({ productId, fromBranchId, toBranchId, quantity, notes, createdBy }) {
        if (fromBranchId === toBranchId) {
            throw new apiError_1.AppError(400, "Cannot transfer to the same branch");
        }
        if (quantity <= 0) {
            throw new apiError_1.AppError(400, "Quantity must be greater than 0");
        }
        return client_1.prisma.$transaction(async (tx) => {
            // Get source stock
            const sourceStock = await tx.stock.findUnique({
                where: { product_id_branch_id: { product_id: productId, branch_id: fromBranchId } },
            });
            if (!sourceStock) {
                throw new apiError_1.AppError(404, "Source stock not found");
            }
            const sourceQty = (0, helpers_1.asNumber)(sourceStock.current_quantity);
            if (sourceQty < quantity) {
                throw new apiError_1.AppError(400, "Insufficient stock for transfer");
            }
            // Deduct from source branch
            const newSourceQty = (0, helpers_1.addDecimal)(sourceStock.current_quantity, -quantity);
            await tx.stock.update({
                where: { product_id_branch_id: { product_id: productId, branch_id: fromBranchId } },
                data: { current_quantity: newSourceQty },
            });
            // Check if destination stock exists
            let destinationStock = await tx.stock.findUnique({
                where: { product_id_branch_id: { product_id: productId, branch_id: toBranchId } },
            });
            let finalDestQty;
            if (!destinationStock) {
                // Create destination stock if it doesn't exist
                destinationStock = await tx.stock.create({
                    data: {
                        product_id: productId,
                        branch_id: toBranchId,
                        current_quantity: quantity,
                    },
                });
                finalDestQty = quantity;
            }
            else {
                // Add to destination branch
                const newDestQty = (0, helpers_1.addDecimal)(destinationStock.current_quantity, quantity);
                await tx.stock.update({
                    where: { product_id_branch_id: { product_id: productId, branch_id: toBranchId } },
                    data: { current_quantity: newDestQty },
                });
                finalDestQty = newDestQty;
            }
            // Create transfer out movement
            await tx.stockMovement.create({
                data: {
                    product_id: productId,
                    branch_id: fromBranchId,
                    movement_type: "TRANSFER_OUT",
                    quantity_change: -quantity,
                    previous_qty: sourceStock.current_quantity,
                    new_qty: newSourceQty,
                    notes: notes || `Transferred to ${toBranchId}`,
                    created_by: createdBy,
                },
            });
            // Create transfer in movement
            await tx.stockMovement.create({
                data: {
                    product_id: productId,
                    branch_id: toBranchId,
                    movement_type: "TRANSFER_IN",
                    quantity_change: quantity,
                    previous_qty: destinationStock.current_quantity || 0,
                    new_qty: finalDestQty,
                    notes: notes || `Transferred from ${fromBranchId}`,
                    created_by: createdBy,
                },
            });
            return {
                success: true,
                fromBranch: { newQty: newSourceQty },
                toBranch: { newQty: finalDestQty },
            };
        });
    }
    async removeStock({ productId, branchId, quantity, reason, notes, createdBy }) {
        if (quantity <= 0) {
            throw new apiError_1.AppError(400, "Quantity must be greater than 0");
        }
        return client_1.prisma.$transaction(async (tx) => {
            const stock = await tx.stock.findUnique({
                where: { product_id_branch_id: { product_id: productId, branch_id: branchId } },
            });
            if (!stock)
                throw new apiError_1.AppError(404, "Stock not found");
            const currentQty = (0, helpers_1.asNumber)(stock.current_quantity);
            if (currentQty < quantity) {
                throw new apiError_1.AppError(400, "Insufficient stock to remove");
            }
            const newQty = (0, helpers_1.addDecimal)(stock.current_quantity, -quantity);
            await tx.stock.update({
                where: { product_id_branch_id: { product_id: productId, branch_id: branchId } },
                data: {
                    current_quantity: newQty,
                },
            });
            // Map the UI reason (DAMAGE/WASTE/THEFT/EXPIRED) to a real movement
            // type when it matches the schema enum; otherwise default to DAMAGE.
            const reasonUpper = (reason || "").toUpperCase();
            const movementType = reasonUpper === "EXPIRED" ? "EXPIRED" :
                reasonUpper === "THEFT" ? "LOSS" :
                    reasonUpper === "WASTE" ? "DAMAGE" :
                        "DAMAGE";
            const noteParts = [];
            if (reason)
                noteParts.push(`Reason: ${reason}`);
            if (notes)
                noteParts.push(notes);
            const noteText = noteParts.length > 0 ? noteParts.join(" | ") : "Stock removed";
            await tx.stockMovement.create({
                data: {
                    product_id: productId,
                    branch_id: branchId,
                    movement_type: movementType,
                    quantity_change: -quantity,
                    previous_qty: stock.current_quantity,
                    new_qty: newQty,
                    notes: noteText,
                    created_by: createdBy,
                },
            });
            return { newQty };
        });
    }
    // Single-row lookup for the "Available: N" hint in Stock Out / Transfer
    // dialogs. Returns current_quantity = 0 if there's no Stock row for
    // this product+branch yet, so callers always get a number.
    async getStockByProductBranch(productId, branchId) {
        const stock = await client_1.prisma.stock.findUnique({
            where: { product_id_branch_id: { product_id: productId, branch_id: branchId } },
            select: {
                id: true,
                product_id: true,
                branch_id: true,
                current_quantity: true,
                minimum_quantity: true,
                last_updated: true,
            },
        });
        if (!stock) {
            return {
                product_id: productId,
                branch_id: branchId,
                current_quantity: 0,
                minimum_quantity: 0,
            };
        }
        return stock;
    }
    async getStockByBranch(branchId, page = 1, limit = 20, search, userRole, categoryId, brandId, supplierId, stockStatus) {
        const skip = (page - 1) * limit;
        const where = {};
        if (branchId && branchId.trim() !== "" && userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
            where.branch_id = branchId;
        }
        else if (branchId && branchId.trim() !== "") {
            where.branch_id = branchId;
        }
        const productWhere = {};
        if (search && search.trim() !== "") {
            productWhere.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (categoryId && categoryId !== 'all') {
            productWhere.category_id = categoryId;
        }
        if (brandId && brandId !== 'all') {
            productWhere.brand_id = brandId;
        }
        if (supplierId && supplierId !== 'all') {
            productWhere.supplier_id = supplierId;
        }
        if (Object.keys(productWhere).length > 0) {
            where.product = productWhere;
        }
        const productInclude = {
            category: { select: { id: true, name: true } },
            brand: { select: { id: true, name: true } },
            supplier: { select: { id: true, name: true } },
            ProductImage: { take: 1, orderBy: { created_at: 'asc' } },
        };
        const [allForStats, total] = await Promise.all([
            client_1.prisma.stock.findMany({
                where,
                select: {
                    id: true,
                    current_quantity: true,
                    reserved_quantity: true,
                    minimum_quantity: true,
                    product: { select: { purchase_rate: true, min_qty: true, id: true } },
                },
            }),
            client_1.prisma.stock.count({ where }),
        ]);
        const matchesStockStatus = (row) => {
            const qty = Number(row.current_quantity || 0);
            const minQty = Number(row.product?.min_qty ?? row.minimum_quantity ?? 0);
            switch (stockStatus) {
                case 'negative':
                    return qty < 0;
                case 'out':
                    return qty <= 0;
                case 'low':
                    return qty > 0 && minQty > 0 && qty <= minQty;
                case 'in':
                    return qty > 0 && (minQty <= 0 || qty > minQty);
                default:
                    return true;
            }
        };
        let filteredIds = null;
        if (stockStatus && stockStatus !== 'all') {
            filteredIds = allForStats.filter(matchesStockStatus).map((row) => row.id);
        }
        const listWhere = filteredIds !== null
            ? { ...where, id: { in: filteredIds.length > 0 ? filteredIds : ['__none__'] } }
            : where;
        const filteredTotal = filteredIds !== null ? filteredIds.length : total;
        const stocks = await client_1.prisma.stock.findMany({
            where: listWhere,
            include: {
                product: { include: productInclude },
                branch: true,
            },
            orderBy: { last_updated: 'desc' },
            skip,
            take: limit,
        });
        let totalInventoryValue = 0;
        let totalQuantity = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;
        let negativeStockCount = 0;
        const productIds = new Set();
        for (const row of allForStats) {
            const qty = Number(row.current_quantity || 0);
            const reserved = Number(row.reserved_quantity || 0);
            const minQty = Number(row.product?.min_qty ?? row.minimum_quantity ?? 0);
            const cost = Number(row.product?.purchase_rate || 0);
            totalQuantity += qty;
            totalInventoryValue += qty * cost;
            productIds.add(row.product?.id);
            if (qty < 0)
                negativeStockCount += 1;
            if (qty <= 0)
                outOfStockCount += 1;
            else if (minQty > 0 && qty <= minQty)
                lowStockCount += 1;
        }
        return {
            data: stocks,
            meta: {
                total: filteredTotal,
                page,
                limit,
                totalPages: Math.max(1, Math.ceil(filteredTotal / limit)),
                totalQuantity,
                totalInventoryValue,
                totalProducts: productIds.size,
                lowStockCount,
                outOfStockCount,
                negativeStockCount,
            },
        };
    }
    async getStockMovements(branchId, userRole) {
        const where = {};
        // Only filter by branch if branchId is provided AND user is not admin
        if (branchId && branchId.trim() !== "" && userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
            where.branch_id = branchId;
        }
        return client_1.prisma.stockMovement.findMany({
            where,
            include: { product: true, branch: true, user: { select: { email: true } } },
            orderBy: { created_at: "desc" },
        });
    }
    async getTodayStockMovements(branchId, userRole) {
        const { start, end } = (0, timezone_1.businessTodayRange)();
        const whereClause = {
            created_at: {
                gte: start,
                lte: end,
            }
        };
        // Only filter by branch if branchId is provided AND user is not admin
        if (branchId && branchId !== "" && userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
            whereClause.branch_id = branchId;
        }
        return client_1.prisma.stockMovement.findMany({
            where: whereClause,
            include: { product: true, branch: true, user: { select: { email: true } } },
            orderBy: { created_at: "desc" },
        });
    }
}
exports.StockService = StockService;
//# sourceMappingURL=stock.service.js.map