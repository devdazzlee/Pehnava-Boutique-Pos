import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const stockQuantityReportSchema = z.object({
  query: z
    .object({
      from: dateString,
      to: dateString,
      categoryId: z.string().uuid().optional(),
      branchId: z.string().uuid().optional(),
      type: z.enum(['all', 'finished', 'loose']).optional(),
      activity: z.enum(['all', 'moved']).optional(),
      search: z.string().optional(),
    })
    .refine((value) => value.to >= value.from, {
      message: 'To Date cannot be earlier than From Date',
      path: ['to'],
    }),
});
