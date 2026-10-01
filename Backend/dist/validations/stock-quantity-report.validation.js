"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stockQuantityReportSchema = void 0;
const zod_1 = require("zod");
const dateString = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
exports.stockQuantityReportSchema = zod_1.z.object({
    query: zod_1.z
        .object({
        from: dateString,
        to: dateString,
        categoryId: zod_1.z.string().uuid().optional(),
        branchId: zod_1.z.string().uuid().optional(),
        type: zod_1.z.enum(['all', 'finished', 'loose']).optional(),
        activity: zod_1.z.enum(['all', 'moved']).optional(),
        search: zod_1.z.string().optional(),
    })
        .refine((value) => value.to >= value.from, {
        message: 'To Date cannot be earlier than From Date',
        path: ['to'],
    }),
});
//# sourceMappingURL=stock-quantity-report.validation.js.map