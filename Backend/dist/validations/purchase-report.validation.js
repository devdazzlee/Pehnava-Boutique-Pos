"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.itemwisePurchaseReportSchema = void 0;
const zod_1 = require("zod");
const dateString = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
exports.itemwisePurchaseReportSchema = zod_1.z.object({
    query: zod_1.z
        .object({
        from: dateString,
        to: dateString,
        mode: zod_1.z.enum(['vendor', 'item']).optional(),
        supplierId: zod_1.z.string().uuid().optional(),
        productId: zod_1.z.string().uuid().optional(),
        search: zod_1.z.string().optional(),
        branchId: zod_1.z.string().uuid().optional(),
        page: zod_1.z.string().optional(),
        limit: zod_1.z.string().optional(),
        all: zod_1.z.enum(['true', 'false']).optional(),
        type: zod_1.z.enum(['PP', 'PR']).optional(),
        q: zod_1.z.string().optional(),
        sort: zod_1.z.enum(['date_desc', 'date_asc', 'amount_desc', 'qty_desc']).optional(),
    })
        .refine((value) => value.to >= value.from, {
        message: 'To Date cannot be earlier than From Date',
        path: ['to'],
    }),
});
//# sourceMappingURL=purchase-report.validation.js.map