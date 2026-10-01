import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const getRegisterReportSchema = z.object({
  query: z
    .object({
      from: dateString,
      to: dateString,
      branchId: z.string().uuid().optional(),
      cashierId: z.string().uuid().optional(),
      paymentMethod: z.string().optional(),
      transactionType: z.string().optional(),
      status: z.string().optional(),
    })
    .refine((value) => value.to >= value.from, {
      message: 'To Date cannot be earlier than From Date',
      path: ['to'],
    }),
});

export const closeRegisterSchema = z.object({
  body: z.object({
    cashflow_id: z.string().uuid(),
    closing: z.number().min(0),
  }),
});
