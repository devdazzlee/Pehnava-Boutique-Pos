"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAdjustmentBatchSchema = exports.listAdjustmentsSchema = exports.createAdjustmentSchema = void 0;
const zod_1 = require("zod");
exports.createAdjustmentSchema = zod_1.z.object({
    body: zod_1.z.object({
        productId: zod_1.z.string().min(1, 'Product is required'),
        branchId: zod_1.z.string().min(1, 'Branch is required'),
        // Ignored by the server (it reads live stock); kept optional for old clients.
        systemQuantity: zod_1.z.number().optional(),
        adjustmentType: zod_1.z.enum(['ADDITION', 'SUBTRACTION', 'RECONCILIATION']),
        adjustmentCategory: zod_1.z.enum(['CORRECTION', 'DAMAGE', 'EXPIRED', 'THEFT', 'RETURN_TO_SUPPLIER', 'ADMINISTRATIVE']),
        physicalCount: zod_1.z.number().optional(),
        changeQuantity: zod_1.z.number().optional(),
        reason: zod_1.z.string().optional(),
        referenceNo: zod_1.z.string().optional(),
    }),
});
exports.listAdjustmentsSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional().default('1'),
        limit: zod_1.z.string().optional().default('20'),
        productId: zod_1.z.string().optional(),
        branchId: zod_1.z.string().optional(),
        adjustmentType: zod_1.z
            .enum(['ADDITION', 'SUBTRACTION', 'RECONCILIATION'])
            .optional(),
        adjustmentCategory: zod_1.z
            .enum([
            'CORRECTION',
            'DAMAGE',
            'EXPIRED',
            'THEFT',
            'RETURN_TO_SUPPLIER',
            'ADMINISTRATIVE',
        ])
            .optional(),
        startDate: zod_1.z.string().optional(),
        endDate: zod_1.z.string().optional(),
        search: zod_1.z.string().optional(),
    }),
});
exports.createAdjustmentBatchSchema = zod_1.z.object({
    body: zod_1.z.object({
        branchId: zod_1.z.string().min(1, 'Branch is required'),
        adjustmentType: zod_1.z.enum(['ADDITION', 'SUBTRACTION', 'RECONCILIATION']),
        adjustmentCategory: zod_1.z.enum(['CORRECTION', 'DAMAGE', 'EXPIRED', 'THEFT', 'RETURN_TO_SUPPLIER', 'ADMINISTRATIVE']),
        reason: zod_1.z.string().max(500).optional(),
        referenceNo: zod_1.z.string().max(100).optional(),
        lines: zod_1.z
            .array(zod_1.z.object({
            productId: zod_1.z.string().min(1, 'Product is required'),
            physicalCount: zod_1.z.number().min(0).optional(),
            changeQuantity: zod_1.z.number().optional(),
        }))
            .min(1, 'Add at least one product')
            .max(500, 'Too many lines in one adjustment'),
    }),
});
//# sourceMappingURL=stock-adjustment.validation.js.map