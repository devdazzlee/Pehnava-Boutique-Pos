"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeRegisterSchema = exports.getRegisterReportSchema = void 0;
const zod_1 = require("zod");
const dateString = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
exports.getRegisterReportSchema = zod_1.z.object({
    query: zod_1.z
        .object({
        from: dateString,
        to: dateString,
        branchId: zod_1.z.string().uuid().optional(),
        cashierId: zod_1.z.string().uuid().optional(),
        paymentMethod: zod_1.z.string().optional(),
        transactionType: zod_1.z.string().optional(),
        status: zod_1.z.string().optional(),
    })
        .refine((value) => value.to >= value.from, {
        message: 'To Date cannot be earlier than From Date',
        path: ['to'],
    }),
});
exports.closeRegisterSchema = zod_1.z.object({
    body: zod_1.z.object({
        cashflow_id: zod_1.z.string().uuid(),
        closing: zod_1.z.number().min(0),
    }),
});
//# sourceMappingURL=register-report.validation.js.map