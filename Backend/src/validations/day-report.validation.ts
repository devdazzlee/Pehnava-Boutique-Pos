import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const dayReportSchema = z.object({
  query: z
    .object({
      from: dateString,
      to: dateString,
      view: z.enum(['revenue', 'cash', 'credit', 'expenses']).default('revenue'),
      search: z.string().optional(),
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      branchId: z.string().uuid().optional(),
    })
    .refine((value) => value.to >= value.from, {
      message: 'To Date cannot be earlier than From Date',
      path: ['to'],
    }),
});
