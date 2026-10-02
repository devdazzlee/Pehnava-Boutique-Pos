import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const listCommissionsSchema = z.object({
  query: z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    employee_id: z.string().uuid().optional(),
    month: z.coerce.number().min(1).max(12).optional(),
    year: z.coerce.number().min(2020).optional(),
    is_paid: z.enum(['true', 'false']).optional(),
    search: z.string().optional(),
    fetch_all: z.enum(['true', 'false']).optional(),
  }),
});

export const performanceSchema = z.object({
  params: z.object({ employeeId: z.string().uuid() }),
  query: z
    .object({ from: dateString, to: dateString })
    .refine((value) => value.to >= value.from, {
      message: 'To Date cannot be earlier than From Date',
      path: ['to'],
    }),
});

export const previewCommissionsSchema = z.object({
  query: z
    .object({
      from: dateString,
      to: dateString,
      employee_id: z.string().uuid().optional(),
      branch_id: z.string().uuid().optional(),
    })
    .refine((value) => value.to >= value.from, {
      message: 'To Date cannot be earlier than From Date',
      path: ['to'],
    }),
});

export const generateCommissionsSchema = z.object({
  body: z.object({
    month: z.coerce.number().min(1).max(12),
    year: z.coerce.number().min(2020),
    employee_id: z.string().uuid().optional(),
    overwrite: z.boolean().optional(),
  }),
});

export const updateCommissionSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    rate: z.coerce.number().min(0).optional(),
    amount: z.coerce.number().min(0).optional(),
    is_paid: z.boolean().optional(),
    paid_date: z.string().datetime().nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
});

export const commissionIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const markCommissionPaidSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      paid_date: z.string().datetime().optional(),
    })
    .optional(),
});

export const commissionSalesSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export type GenerateCommissionsInput = z.infer<typeof generateCommissionsSchema>['body'];
export type UpdateCommissionInput = z.infer<typeof updateCommissionSchema>['body'];
