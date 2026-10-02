import { z } from 'zod';

export const createAdjustmentSchema = z.object({
  body: z.object({
    productId: z.string().min(1, 'Product is required'),
    branchId: z.string().min(1, 'Branch is required'),
    // Ignored by the server (it reads live stock); kept optional for old clients.
    systemQuantity: z.number().optional(),
    adjustmentType: z.enum(['ADDITION', 'SUBTRACTION', 'RECONCILIATION']),
    adjustmentCategory: z.enum(['CORRECTION', 'DAMAGE', 'EXPIRED', 'THEFT', 'RETURN_TO_SUPPLIER', 'ADMINISTRATIVE']),
    physicalCount: z.number().optional(),
    changeQuantity: z.number().optional(),
    reason: z.string().optional(),
    referenceNo: z.string().optional(),
  }),
});

export const listAdjustmentsSchema = z.object({
  query: z.object({
    page: z.string().optional().default('1'),
    limit: z.string().optional().default('20'),
    productId: z.string().optional(),
    branchId: z.string().optional(),
    adjustmentType: z
      .enum(['ADDITION', 'SUBTRACTION', 'RECONCILIATION'])
      .optional(),
    adjustmentCategory: z
      .enum([
        'CORRECTION',
        'DAMAGE',
        'EXPIRED',
        'THEFT',
        'RETURN_TO_SUPPLIER',
        'ADMINISTRATIVE',
      ])
      .optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    search: z.string().optional(),
  }),
});

export const createAdjustmentBatchSchema = z.object({
  body: z.object({
    branchId: z.string().min(1, 'Branch is required'),
    adjustmentType: z.enum(['ADDITION', 'SUBTRACTION', 'RECONCILIATION']),
    adjustmentCategory: z.enum(['CORRECTION', 'DAMAGE', 'EXPIRED', 'THEFT', 'RETURN_TO_SUPPLIER', 'ADMINISTRATIVE']),
    reason: z.string().max(500).optional(),
    referenceNo: z.string().max(100).optional(),
    lines: z
      .array(
        z.object({
          productId: z.string().min(1, 'Product is required'),
          physicalCount: z.number().min(0).optional(),
          changeQuantity: z.number().optional(),
        }),
      )
      .min(1, 'Add at least one product')
      .max(500, 'Too many lines in one adjustment'),
  }),
});
