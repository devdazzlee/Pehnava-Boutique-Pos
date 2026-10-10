"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRecurringExpenseSchema = exports.createRecurringExpenseSchema = exports.expenseReportSchema = exports.rejectExpenseSchema = exports.listExpensesSchema = exports.updateExpenseSchema = exports.createExpenseSchema = exports.idParamSchema = exports.updateExpenseCategorySchema = exports.createExpenseCategorySchema = void 0;
const zod_1 = require("zod");
const PAYMENT_METHODS = ['CASH', 'BANK', 'CARD', 'MOBILE_MONEY', 'CHEQUE', 'OTHER'];
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];
const money = zod_1.z.coerce.number().positive('Amount must be greater than 0');
const optionalDate = zod_1.z
    .string()
    .datetime({ offset: true })
    .or(zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Invalid date'))
    .optional();
/* ----------------------------- categories ----------------------------- */
exports.createExpenseCategorySchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
        description: zod_1.z.string().trim().max(240).optional(),
        is_active: zod_1.z.boolean().optional(),
    }),
});
exports.updateExpenseCategorySchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().uuid() }),
    body: zod_1.z.object({
        name: zod_1.z.string().trim().min(2).max(60).optional(),
        description: zod_1.z.string().trim().max(240).nullable().optional(),
        is_active: zod_1.z.boolean().optional(),
    }),
});
exports.idParamSchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().uuid() }),
});
/* ------------------------------ expenses ------------------------------ */
exports.createExpenseSchema = zod_1.z.object({
    body: zod_1.z.object({
        particular: zod_1.z.string().trim().min(1, 'Description is required').max(200),
        amount: money,
        category_id: zod_1.z.string().uuid().nullable().optional(),
        account_id: zod_1.z.string().uuid().nullable().optional(),
        payment_method: zod_1.z.enum(PAYMENT_METHODS).optional(),
        bank_account: zod_1.z.string().trim().max(120).nullable().optional(),
        reference: zod_1.z.string().trim().max(120).nullable().optional(),
        vendor: zod_1.z.string().trim().max(120).nullable().optional(),
        notes: zod_1.z.string().trim().max(500).nullable().optional(),
        expense_date: optionalDate,
        branch_id: zod_1.z.string().uuid().nullable().optional(),
        /** Record in the open cash register (any payment method; only cash reduces the drawer). */
        from_drawer: zod_1.z.boolean().optional(),
    }),
});
exports.updateExpenseSchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().uuid() }),
    body: exports.createExpenseSchema.shape.body.partial(),
});
exports.listExpensesSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.coerce.number().int().positive().optional(),
        limit: zod_1.z.coerce.number().int().positive().max(5000).optional(),
        fetch_all: zod_1.z.enum(['true', 'false']).optional(),
        search: zod_1.z.string().trim().optional(),
        category_id: zod_1.z.string().uuid().optional(),
        account_id: zod_1.z.string().uuid().optional(),
        payment_method: zod_1.z.enum(PAYMENT_METHODS).optional(),
        status: zod_1.z.enum(STATUSES).optional(),
        branch_id: zod_1.z.string().uuid().optional(),
        from: zod_1.z.string().optional(),
        to: zod_1.z.string().optional(),
    }),
});
exports.rejectExpenseSchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().uuid() }),
    body: zod_1.z.object({ reason: zod_1.z.string().trim().max(300).optional() }),
});
exports.expenseReportSchema = zod_1.z.object({
    query: zod_1.z.object({
        from: zod_1.z.string().optional(),
        to: zod_1.z.string().optional(),
        branch_id: zod_1.z.string().uuid().optional(),
    }),
});
/* -------------------------- recurring expenses -------------------------- */
exports.createRecurringExpenseSchema = zod_1.z.object({
    body: zod_1.z.object({
        particular: zod_1.z.string().trim().min(1).max(200),
        amount: money,
        category_id: zod_1.z.string().uuid().nullable().optional(),
        account_id: zod_1.z.string().uuid().nullable().optional(),
        payment_method: zod_1.z.enum(PAYMENT_METHODS).optional(),
        bank_account: zod_1.z.string().trim().max(120).nullable().optional(),
        vendor: zod_1.z.string().trim().max(120).nullable().optional(),
        notes: zod_1.z.string().trim().max(500).nullable().optional(),
        branch_id: zod_1.z.string().uuid().nullable().optional(),
        frequency: zod_1.z.enum(FREQUENCIES),
        interval: zod_1.z.coerce.number().int().min(1).max(52).optional(),
        start_date: optionalDate,
        end_date: optionalDate.nullable(),
        auto_approve: zod_1.z.boolean().optional(),
        is_active: zod_1.z.boolean().optional(),
    }),
});
exports.updateRecurringExpenseSchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().uuid() }),
    body: exports.createRecurringExpenseSchema.shape.body.partial(),
});
//# sourceMappingURL=expense.validation.js.map