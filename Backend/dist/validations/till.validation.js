"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tillVoidPaidOutSchema = exports.tillReopenSchema = exports.tillCloseSchema = exports.tillPaidOutSchema = exports.tillOpenSchema = exports.tillDaySchema = void 0;
const zod_1 = require("zod");
const dateString = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
exports.tillDaySchema = zod_1.z.object({
    query: zod_1.z
        .object({
        date: dateString.optional(),
        from: dateString.optional(),
        to: dateString.optional(),
        branchId: zod_1.z.string().uuid().optional(),
    })
        .superRefine((value, ctx) => {
        const from = value.from || value.date;
        const to = value.to || value.date || value.from;
        if (!from || !to) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'Provide date, or from and to',
                path: ['from'],
            });
            return;
        }
        if (to < from) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'To Date cannot be earlier than From Date',
                path: ['to'],
            });
        }
    }),
});
exports.tillOpenSchema = zod_1.z.object({
    body: zod_1.z.object({
        opening: zod_1.z.number().min(0),
        branchId: zod_1.z.string().uuid().optional(),
    }),
});
exports.tillPaidOutSchema = zod_1.z.object({
    body: zod_1.z.object({
        particular: zod_1.z.string().min(1),
        amount: zod_1.z.number().positive(),
        branchId: zod_1.z.string().uuid().optional(),
    }),
});
exports.tillCloseSchema = zod_1.z.object({
    body: zod_1.z.object({
        cashflow_id: zod_1.z.string().uuid(),
        closing: zod_1.z.number().min(0),
    }),
});
exports.tillReopenSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
});
exports.tillVoidPaidOutSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
    body: zod_1.z
        .object({
        reason: zod_1.z.string().max(500).optional(),
    })
        .optional(),
});
//# sourceMappingURL=till.validation.js.map