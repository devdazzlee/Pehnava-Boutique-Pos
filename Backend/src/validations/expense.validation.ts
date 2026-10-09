import { z } from 'zod';

const PAYMENT_METHODS = ['CASH', 'BANK', 'CARD', 'MOBILE_MONEY', 'CHEQUE', 'OTHER'] as const;
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;

const money = z.coerce.number().positive('Amount must be greater than 0');
const optionalDate = z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Invalid date'))
    .optional();

/* ----------------------------- categories ----------------------------- */

export const createExpenseCategorySchema = z.object({
    body: z.object({
        name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
        description: z.string().trim().max(240).optional(),
        is_active: z.boolean().optional(),
    }),
});

export const updateExpenseCategorySchema = z.object({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
        name: z.string().trim().min(2).max(60).optional(),
        description: z.string().trim().max(240).nullable().optional(),
        is_active: z.boolean().optional(),
    }),
});

export const idParamSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
});

/* ------------------------------ expenses ------------------------------ */

export const createExpenseSchema = z.object({
    body: z.object({
        particular: z.string().trim().min(1, 'Description is required').max(200),
        amount: money,
        category_id: z.string().uuid().nullable().optional(),
        account_id: z.string().uuid().nullable().optional(),
        payment_method: z.enum(PAYMENT_METHODS).optional(),
        bank_account: z.string().trim().max(120).nullable().optional(),
        reference: z.string().trim().max(120).nullable().optional(),
        vendor: z.string().trim().max(120).nullable().optional(),
        notes: z.string().trim().max(500).nullable().optional(),
        expense_date: optionalDate,
        branch_id: z.string().uuid().nullable().optional(),
        /** Record in the open cash register (any payment method; only cash reduces the drawer). */
        from_drawer: z.boolean().optional(),
    }),
});

export const updateExpenseSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
    body: createExpenseSchema.shape.body.partial(),
});

export const listExpensesSchema = z.object({
    query: z.object({
        page: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().positive().max(5000).optional(),
        fetch_all: z.enum(['true', 'false']).optional(),
        search: z.string().trim().optional(),
        category_id: z.string().uuid().optional(),
        account_id: z.string().uuid().optional(),
        payment_method: z.enum(PAYMENT_METHODS).optional(),
        status: z.enum(STATUSES).optional(),
        branch_id: z.string().uuid().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
    }),
});

export const rejectExpenseSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ reason: z.string().trim().max(300).optional() }),
});

export const expenseReportSchema = z.object({
    query: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        branch_id: z.string().uuid().optional(),
    }),
});

/* -------------------------- recurring expenses -------------------------- */

export const createRecurringExpenseSchema = z.object({
    body: z.object({
        particular: z.string().trim().min(1).max(200),
        amount: money,
        category_id: z.string().uuid().nullable().optional(),
        account_id: z.string().uuid().nullable().optional(),
        payment_method: z.enum(PAYMENT_METHODS).optional(),
        bank_account: z.string().trim().max(120).nullable().optional(),
        vendor: z.string().trim().max(120).nullable().optional(),
        notes: z.string().trim().max(500).nullable().optional(),
        branch_id: z.string().uuid().nullable().optional(),
        frequency: z.enum(FREQUENCIES),
        interval: z.coerce.number().int().min(1).max(52).optional(),
        start_date: optionalDate,
        end_date: optionalDate.nullable(),
        auto_approve: z.boolean().optional(),
        is_active: z.boolean().optional(),
    }),
});

export const updateRecurringExpenseSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
    body: createRecurringExpenseSchema.shape.body.partial(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>['body'];
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>['body'];
export type ExpenseListQuery = z.infer<typeof listExpensesSchema>['query'];
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>['body'];
export type CreateRecurringExpenseInput = z.infer<typeof createRecurringExpenseSchema>['body'];
export type UpdateRecurringExpenseInput = z.infer<typeof updateRecurringExpenseSchema>['body'];
