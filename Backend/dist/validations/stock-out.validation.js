"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logReturnSchema = exports.listStockOutSchema = exports.logBulkStockOutSchema = exports.logStockOutSchema = void 0;
const zod_1 = require("zod");
exports.logStockOutSchema = zod_1.z.object({
    body: zod_1.z.object({
        productId: zod_1.z.string().min(1, 'Product is required'),
        branchId: zod_1.z.string().min(1, 'Branch is required'),
        quantity: zod_1.z.number().positive('Quantity must be positive'),
        reason: zod_1.z.enum(['SALE', 'DAMAGE', 'LOSS', 'RETURN', 'EXPIRED']),
        notes: zod_1.z.string().optional(),
    }),
});
exports.logBulkStockOutSchema = zod_1.z.object({
    body: zod_1.z.object({
        branchId: zod_1.z.string().min(1, 'Branch is required'),
        reason: zod_1.z.enum(['SALE', 'DAMAGE', 'LOSS', 'RETURN', 'EXPIRED']),
        customerId: zod_1.z.string().optional(),
        documentRef: zod_1.z.string().optional(),
        dispatchDate: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
        lines: zod_1.z
            .array(zod_1.z.object({
            productId: zod_1.z.string().min(1, 'Product is required'),
            quantity: zod_1.z.number().positive('Quantity must be positive'),
            rate: zod_1.z.number().nonnegative().optional(),
        }))
            .min(1, 'At least one line is required'),
    }),
});
exports.listStockOutSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional(),
        limit: zod_1.z.string().optional(),
        reason: zod_1.z.enum(['SALE', 'DAMAGE', 'LOSS', 'RETURN', 'EXPIRED']).optional(),
        branchId: zod_1.z.string().optional(),
        productId: zod_1.z.string().optional(),
        startDate: zod_1.z.string().optional(),
        endDate: zod_1.z.string().optional(),
    }),
});
exports.logReturnSchema = zod_1.z.object({
    body: zod_1.z.object({
        productId: zod_1.z.string().min(1, 'Product is required'),
        branchId: zod_1.z.string().min(1, 'Branch is required'),
        quantity: zod_1.z.number().positive('Quantity must be positive'),
        notes: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=stock-out.validation.js.map