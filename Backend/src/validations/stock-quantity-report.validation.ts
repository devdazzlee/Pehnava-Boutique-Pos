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
      status: z.enum(['all', 'in', 'low', 'out']).optional(),
      sort: z.enum(['name_asc', 'sold_desc', 'bought_desc', 'available_asc', 'available_desc', 'value_desc']).optional(),
      page: z.string().optional(),
      limit: z.string().optional(),
      all: z.enum(['true', 'false']).optional(),
    })
    .refine((value) => value.to >= value.from, {
      message: 'To Date cannot be earlier than From Date',
      path: ['to'],
    }),
});
