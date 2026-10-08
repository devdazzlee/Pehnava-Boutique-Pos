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
        status: zod_1.z.enum(['all', 'in', 'low', 'out']).optional(),
        sort: zod_1.z.enum(['name_asc', 'sold_desc', 'bought_desc', 'available_asc', 'available_desc', 'value_desc']).optional(),
        page: zod_1.z.string().optional(),
        limit: zod_1.z.string().optional(),
        all: zod_1.z.enum(['true', 'false']).optional(),
    })
        .refine((value) => value.to >= value.from, {
        message: 'To Date cannot be earlier than From Date',
        path: ['to'],
    }),
});
//# sourceMappingURL=stock-quantity-report.validation.js.map