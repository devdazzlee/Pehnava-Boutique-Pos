"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeStockSchema = exports.transferStockSchema = exports.adjustStockSchema = exports.createStockSchema = void 0;
const zod_1 = require("zod");
const createStockSchema = zod_1.z.object({
    body: zod_1.z.object({
        productId: zod_1.z.string().min(1),
        branchId: zod_1.z.string().min(1),
        quantity: zod_1.z.number().positive().min(0.01), // Allow decimals for stock quantities
        // Optional metadata — captured into the StockMovement record.
        supplierId: zod_1.z.string().optional(),
        unitCost: zod_1.z.number().nonnegative().optional(),
        invoiceRef: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
    }),
});
exports.createStockSchema = createStockSchema;
const adjustStockSchema = zod_1.z.object({
    body: zod_1.z.object({
        productId: zod_1.z.string().min(1),
        branchId: zod_1.z.string().min(1),
        quantityChange: zod_1.z.number().int().refine(val => val !== 0, { message: "Quantity change must not be zero" }),
        reason: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
    }),
});
exports.adjustStockSchema = adjustStockSchema;
const transferStockSchema = zod_1.z.object({
    body: zod_1.z.object({
        productId: zod_1.z.string().min(1, "Product ID is required"),
        fromBranchId: zod_1.z.string().min(1, "Source branch ID is required"),
        toBranchId: zod_1.z.string().min(1, "Destination branch ID is required"),
        quantity: zod_1.z.number().int().min(1, "Quantity must be at least 1"),
        notes: zod_1.z.string().optional(),
    }),
});
exports.transferStockSchema = transferStockSchema;
const removeStockSchema = zod_1.z.object({
    body: zod_1.z.object({
        productId: zod_1.z.string().min(1, "Product ID is required"),
        branchId: zod_1.z.string().min(1, "Branch ID is required"),
        quantity: zod_1.z.number().positive().min(0.01, "Quantity must be greater than 0"),
        reason: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
    }),
});
exports.removeStockSchema = removeStockSchema;
//# sourceMappingURL=stock.validation.js.map