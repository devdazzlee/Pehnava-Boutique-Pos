import { z } from 'zod';

export const createPurchaseSchema = z.object({
  body: z.object({
    productId: z.string().min(1, 'Product is required'),
    supplierId: z.string().min(1, 'Supplier is required'),
    warehouseBranchId: z.string().min(1, 'Warehouse branch is required'),
    quantity: z.number().positive('Quantity must be positive'),
    costPrice: z.number().min(0, 'Cost price must be >= 0'),
    salePrice: z.number().min(0, 'Sale price must be >= 0'),
    purchaseDate: z.union([z.string(), z.date()]).optional(),
    invoiceRef: z.string().optional(),
    notes: z.string().optional(),
    deliveryStatus: z.enum(['PARTIAL', 'COMPLETE']).optional(),
  }),
});

export const createBulkPurchaseSchema = z.object({
  body: z
    .object({
      supplierId: z.string().min(1, 'Supplier is required'),
      warehouseBranchId: z.string().min(1, 'Warehouse branch is required'),
      purchaseDate: z.union([z.string(), z.date()]).optional(),
      invoiceRef: z.string().optional(),
      notes: z.string().optional(),
      batchNo: z.string().optional(),
      expiryDate: z.union([z.string(), z.date()]).optional(),
      deliveryStatus: z.enum(['PARTIAL', 'COMPLETE']).optional(),
      /** How this supplier bill is settled at stock-in time */
      paymentMode: z.enum(['CASH', 'CREDIT', 'MIX']).optional().default('CREDIT'),
      /** Amount paid now (required for MIX; ignored/overridden for CASH & CREDIT) */
      paidAmount: z.coerce.number().min(0).optional(),
      paymentMethod: z
        .enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER'])
        .optional()
        .default('CASH'),
      paymentReference: z.string().optional(),
      paymentNotes: z.string().optional(),
      lines: z
        .array(
          z.object({
            productId: z.string().min(1, 'Product is required'),
            quantity: z.number().positive('Quantity must be positive'),
            costPrice: z.number().min(0, 'Cost price must be >= 0'),
            salePrice: z.number().min(0).optional(),
          }),
        )
        .min(1, 'At least one line is required'),
    })
    .superRefine((body, ctx) => {
      const total = body.lines.reduce(
        (sum, line) => sum + line.quantity * line.costPrice,
        0,
      );
      const mode = body.paymentMode || 'CREDIT';
      if (mode === 'MIX') {
        const paid = body.paidAmount ?? 0;
        if (paid <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['paidAmount'],
            message: 'Enter how much was paid now for a mix payment',
          });
        } else if (paid >= total && total > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['paidAmount'],
            message: 'Mix paid amount must be less than bill total (use Cash for full pay)',
          });
        }
      }
    }),
});

export const listPurchasesSchema = z.object({
  query: z.object({
    page: z.string().optional().default('1'),
    limit: z.string().optional().default('20'),
    productId: z.string().optional(),
    supplierId: z.string().optional(),
    branchId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    search: z.string().optional(),
    groupBy: z.enum(['line', 'bill']).optional().default('line'),
  }),
});

export const updatePurchaseSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid purchase id'),
  }),
  body: z
    .object({
      quantity: z.number().positive('Quantity must be positive').optional(),
      costPrice: z.number().min(0, 'Cost price must be >= 0').optional(),
      salePrice: z.number().min(0, 'Sale price must be >= 0').optional(),
      purchaseDate: z.union([z.string(), z.date()]).optional(),
      invoiceRef: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      deliveryStatus: z.enum(['PARTIAL', 'COMPLETE']).optional(),
    })
    .refine(
      (body) =>
        body.quantity !== undefined ||
        body.costPrice !== undefined ||
        body.salePrice !== undefined ||
        body.purchaseDate !== undefined ||
        body.invoiceRef !== undefined ||
        body.notes !== undefined ||
        body.deliveryStatus !== undefined,
      { message: 'Provide at least one field to update' },
    ),
});
