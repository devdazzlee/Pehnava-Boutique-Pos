import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const itemwisePurchaseReportSchema = z.object({
  query: z
    .object({
      from: dateString,
      to: dateString,
      mode: z.enum(['vendor', 'item']).optional(),
      supplierId: z.string().uuid().optional(),
      productId: z.string().uuid().optional(),
      search: z.string().optional(),
      branchId: z.string().uuid().optional(),
      page: z.string().optional(),
      limit: z.string().optional(),
      all: z.enum(['true', 'false']).optional(),
      type: z.enum(['PP', 'PR']).optional(),
      q: z.string().optional(),
      sort: z.enum(['date_desc', 'date_asc', 'amount_desc', 'qty_desc']).optional(),
    })
    .refine((value) => value.to >= value.from, {
      message: 'To Date cannot be earlier than From Date',
      path: ['to'],
    }),
});
