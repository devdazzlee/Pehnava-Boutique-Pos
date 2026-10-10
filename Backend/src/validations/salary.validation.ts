import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const createSalarySchema = z.object({
  body: z.object({
    employee_id: z.string().uuid(),
    month: z.coerce.number().min(1).max(12),
    year: z.coerce.number().min(2020),
    amount: z.coerce.number().positive('Amount must be greater than 0').optional(),
    loan_amount: z.coerce.number().min(0).optional(),
    is_paid: z.boolean().optional(),
    paid_date: z.string().datetime().optional(),
    notes: z.string().optional(),
  }),
});

export const updateSalarySchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    employee_id: z.string().uuid().optional(),
    month: z.coerce.number().min(1).max(12).optional(),
    year: z.coerce.number().min(2020).optional(),
    amount: z.coerce.number().positive('Amount must be greater than 0').optional(),
    loan_amount: z.coerce.number().min(0).optional(),
    is_paid: z.boolean().optional(),
    paid_date: z.string().datetime().nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
});

export const listSalariesSchema = z.object({
  query: z
    .object({
      page: z.coerce.number().optional(),
      limit: z.coerce.number().optional(),
      employee_id: z.string().uuid().optional(),
      month: z.coerce.number().min(1).max(12).optional(),
      year: z.coerce.number().min(2020).optional(),
      is_paid: z.enum(['true', 'false']).optional(),
      search: z.string().optional(),
      fetch_all: z.enum(['true', 'false']).optional(),
      paid_from: dateString.optional(),
      paid_to: dateString.optional(),
    })
    .refine(
      (value) =>
        !value.paid_from || !value.paid_to || value.paid_to >= value.paid_from,
      {
        message: 'paid_to cannot be earlier than paid_from',
        path: ['paid_to'],
      },
    ),
});

export const salaryIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const markSalaryPaidSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z
    .object({
      paid_date: z.string().datetime().optional(),
      payment_method: z.string().optional(),
    })
    .optional(),
});

export type CreateSalaryInput = z.infer<typeof createSalarySchema>['body'];
export type UpdateSalaryInput = z.infer<typeof updateSalarySchema>['body'];
