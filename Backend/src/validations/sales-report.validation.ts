import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const itemwiseSalesReportSchema = z.object({
  query: z
    .object({
      from: dateString,
      to: dateString,
      mode: z.enum(['customer', 'item']).optional(),
      customerId: z.string().uuid().optional(),
      productId: z.string().uuid().optional(),
      search: z.string().optional(),
      branchId: z.string().uuid().optional(),
    })
    .refine((value) => value.to >= value.from, {
      message: 'To Date cannot be earlier than From Date',
      path: ['to'],
    }),
});
