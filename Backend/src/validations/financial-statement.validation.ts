import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const boolish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1';
  });

export const financialStatementSchema = z.object({
  query: z
    .object({
      from: dateString,
      to: dateString,
      branchId: z.string().uuid().optional(),
      paymentMethod: z.string().optional(),
      cashierId: z.string().uuid().optional(),
      categoryId: z.string().uuid().optional(),
      saleType: z.enum(['ALL', 'SALES', 'RETURNS', 'all', 'sales', 'returns']).optional(),
      includeSalaries: boolish,
      includePurchases: boolish,
      comparePrevious: boolish,
    })
    .refine((value) => value.to >= value.from, {
      message: 'To Date cannot be earlier than From Date',
      path: ['to'],
    }),
});
