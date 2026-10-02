"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPurchasesSchema = exports.createBulkPurchaseSchema = exports.createPurchaseSchema = void 0;
const zod_1 = require("zod");
exports.createPurchaseSchema = zod_1.z.object({
    body: zod_1.z.object({
        productId: zod_1.z.string().min(1, 'Product is required'),
        supplierId: zod_1.z.string().min(1, 'Supplier is required'),
        warehouseBranchId: zod_1.z.string().min(1, 'Warehouse branch is required'),
        quantity: zod_1.z.number().positive('Quantity must be positive'),
        costPrice: zod_1.z.number().min(0, 'Cost price must be >= 0'),
        salePrice: zod_1.z.number().min(0, 'Sale price must be >= 0'),
        purchaseDate: zod_1.z.union([zod_1.z.string(), zod_1.z.date()]).optional(),
        invoiceRef: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
        deliveryStatus: zod_1.z.enum(['PARTIAL', 'COMPLETE']).optional(),
    }),
});
exports.createBulkPurchaseSchema = zod_1.z.object({
    body: zod_1.z
        .object({
        supplierId: zod_1.z.string().min(1, 'Supplier is required'),
        warehouseBranchId: zod_1.z.string().min(1, 'Warehouse branch is required'),
        purchaseDate: zod_1.z.union([zod_1.z.string(), zod_1.z.date()]).optional(),
        invoiceRef: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
        batchNo: zod_1.z.string().optional(),
        expiryDate: zod_1.z.union([zod_1.z.string(), zod_1.z.date()]).optional(),
        deliveryStatus: zod_1.z.enum(['PARTIAL', 'COMPLETE']).optional(),
        /** How this supplier bill is settled at stock-in time */
        paymentMode: zod_1.z.enum(['CASH', 'CREDIT', 'MIX']).optional().default('CREDIT'),
        /** Amount paid now (required for MIX; ignored/overridden for CASH & CREDIT) */
        paidAmount: zod_1.z.coerce.number().min(0).optional(),
        paymentMethod: zod_1.z
            .enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER'])
            .optional()
            .default('CASH'),
        paymentReference: zod_1.z.string().optional(),
        paymentNotes: zod_1.z.string().optional(),
        lines: zod_1.z
            .array(zod_1.z.object({
            productId: zod_1.z.string().min(1, 'Product is required'),
            quantity: zod_1.z.number().positive('Quantity must be positive'),
            costPrice: zod_1.z.number().min(0, 'Cost price must be >= 0'),
            salePrice: zod_1.z.number().min(0).optional(),
        }))
            .min(1, 'At least one line is required'),
    })
        .superRefine((body, ctx) => {
        const total = body.lines.reduce((sum, line) => sum + line.quantity * line.costPrice, 0);
        const mode = body.paymentMode || 'CREDIT';
        if (mode === 'MIX') {
            const paid = body.paidAmount ?? 0;
            if (paid <= 0) {
                ctx.addIssue({
                    code: zod_1.z.ZodIssueCode.custom,
                    path: ['paidAmount'],
                    message: 'Enter how much was paid now for a mix payment',
                });
            }
            else if (paid >= total && total > 0) {
                ctx.addIssue({
                    code: zod_1.z.ZodIssueCode.custom,
                    path: ['paidAmount'],
                    message: 'Mix paid amount must be less than bill total (use Cash for full pay)',
                });
            }
        }
    }),
});
exports.listPurchasesSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional().default('1'),
        limit: zod_1.z.string().optional().default('20'),
        productId: zod_1.z.string().optional(),
        supplierId: zod_1.z.string().optional(),
        branchId: zod_1.z.string().optional(),
        startDate: zod_1.z.string().optional(),
        endDate: zod_1.z.string().optional(),
        search: zod_1.z.string().optional(),
        groupBy: zod_1.z.enum(['line', 'bill']).optional().default('line'),
    }),
});
//# sourceMappingURL=purchase.validation.js.map