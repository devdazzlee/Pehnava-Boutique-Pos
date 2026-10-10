"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markSalaryPaidSchema = exports.salaryIdParamSchema = exports.listSalariesSchema = exports.updateSalarySchema = exports.createSalarySchema = void 0;
const zod_1 = require("zod");
const dateString = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
exports.createSalarySchema = zod_1.z.object({
    body: zod_1.z.object({
        employee_id: zod_1.z.string().uuid(),
        month: zod_1.z.coerce.number().min(1).max(12),
        year: zod_1.z.coerce.number().min(2020),
        amount: zod_1.z.coerce.number().positive('Amount must be greater than 0').optional(),
        loan_amount: zod_1.z.coerce.number().min(0).optional(),
        is_paid: zod_1.z.boolean().optional(),
        paid_date: zod_1.z.string().datetime().optional(),
        notes: zod_1.z.string().optional(),
    }),
});
exports.updateSalarySchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
    body: zod_1.z.object({
        employee_id: zod_1.z.string().uuid().optional(),
        month: zod_1.z.coerce.number().min(1).max(12).optional(),
        year: zod_1.z.coerce.number().min(2020).optional(),
        amount: zod_1.z.coerce.number().positive('Amount must be greater than 0').optional(),
        loan_amount: zod_1.z.coerce.number().min(0).optional(),
        is_paid: zod_1.z.boolean().optional(),
        paid_date: zod_1.z.string().datetime().nullable().optional(),
        notes: zod_1.z.string().nullable().optional(),
    }),
});
exports.listSalariesSchema = zod_1.z.object({
    query: zod_1.z
        .object({
        page: zod_1.z.coerce.number().optional(),
        limit: zod_1.z.coerce.number().optional(),
        employee_id: zod_1.z.string().uuid().optional(),
        month: zod_1.z.coerce.number().min(1).max(12).optional(),
        year: zod_1.z.coerce.number().min(2020).optional(),
        is_paid: zod_1.z.enum(['true', 'false']).optional(),
        search: zod_1.z.string().optional(),
        fetch_all: zod_1.z.enum(['true', 'false']).optional(),
        paid_from: dateString.optional(),
        paid_to: dateString.optional(),
    })
        .refine((value) => !value.paid_from || !value.paid_to || value.paid_to >= value.paid_from, {
        message: 'paid_to cannot be earlier than paid_from',
        path: ['paid_to'],
    }),
});
exports.salaryIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
});
exports.markSalaryPaidSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
    body: zod_1.z
        .object({
        paid_date: zod_1.z.string().datetime().optional(),
        payment_method: zod_1.z.string().optional(),
    })
        .optional(),
});
//# sourceMappingURL=salary.validation.js.map