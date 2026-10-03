"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commissionSalesSchema = exports.markCommissionPaidSchema = exports.commissionIdParamSchema = exports.updateCommissionSchema = exports.generateCommissionsSchema = exports.previewCommissionsSchema = exports.performanceSchema = exports.listCommissionsSchema = void 0;
const zod_1 = require("zod");
const dateString = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
exports.listCommissionsSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.coerce.number().optional(),
        limit: zod_1.z.coerce.number().optional(),
        employee_id: zod_1.z.string().uuid().optional(),
        month: zod_1.z.coerce.number().min(1).max(12).optional(),
        year: zod_1.z.coerce.number().min(2020).optional(),
        is_paid: zod_1.z.enum(['true', 'false']).optional(),
        search: zod_1.z.string().optional(),
        fetch_all: zod_1.z.enum(['true', 'false']).optional(),
    }),
});
exports.performanceSchema = zod_1.z.object({
    params: zod_1.z.object({ employeeId: zod_1.z.string().uuid() }),
    query: zod_1.z
        .object({ from: dateString, to: dateString })
        .refine((value) => value.to >= value.from, {
        message: 'To Date cannot be earlier than From Date',
        path: ['to'],
    }),
});
exports.previewCommissionsSchema = zod_1.z.object({
    query: zod_1.z
        .object({
        from: dateString,
        to: dateString,
        employee_id: zod_1.z.string().uuid().optional(),
        branch_id: zod_1.z.string().uuid().optional(),
    })
        .refine((value) => value.to >= value.from, {
        message: 'To Date cannot be earlier than From Date',
        path: ['to'],
    }),
});
exports.generateCommissionsSchema = zod_1.z.object({
    body: zod_1.z.object({
        month: zod_1.z.coerce.number().min(1).max(12),
        year: zod_1.z.coerce.number().min(2020),
        employee_id: zod_1.z.string().uuid().optional(),
        overwrite: zod_1.z.boolean().optional(),
    }),
});
exports.updateCommissionSchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().uuid() }),
    body: zod_1.z.object({
        rate: zod_1.z.coerce.number().min(0).optional(),
        amount: zod_1.z.coerce.number().min(0).optional(),
        is_paid: zod_1.z.boolean().optional(),
        paid_date: zod_1.z.string().datetime().nullable().optional(),
        notes: zod_1.z.string().nullable().optional(),
    }),
});
exports.commissionIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().uuid() }),
});
exports.markCommissionPaidSchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().uuid() }),
    body: zod_1.z
        .object({
        paid_date: zod_1.z.string().datetime().optional(),
    })
        .optional(),
});
exports.commissionSalesSchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().uuid() }),
});
//# sourceMappingURL=commission.validation.js.map