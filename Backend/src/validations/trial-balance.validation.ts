import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const trialBalanceSchema = z.object({
  query: z
    .object({
      from: dateString,
      to: dateString,
      branchId: z.string().uuid().optional(),
    })
    .refine((value) => value.to >= value.from, {
      message: 'To Date cannot be earlier than From Date',
      path: ['to'],
    }),
});
