import { z } from 'zod';

export const createTransferSchema = z.object({
  body: z.object({
    productId: z.string().min(1, 'Product is required'),
    quantity: z.number().positive('Quantity must be positive'),
    fromBranchId: z.string().min(1, 'Source branch is required'),
    toBranchId: z.string().min(1, 'Destination branch is required'),
    notes: z.string().optional(),
    reason: z.string().optional(),
    carrierName: z.string().optional(),
    vehicleNo: z.string().optional(),
    estimatedArrival: z.string().optional(),
    receiverName: z.string().optional(),
  }),
});

export const updateTransferStatusSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Transfer ID is required'),
  }),
  body: z.object({
    status: z.enum(['PENDING', 'DISPATCHED', 'RECEIVED', 'CANCELLED']),
  }),
});

export const listTransfersSchema = z.object({
  query: z.object({
    page: z.string().optional().default('1'),
    limit: z.string().optional().default('20'),
    fromBranchId: z.string().optional(),
    toBranchId: z.string().optional(),
    productId: z.string().optional(),
    status: z.string().optional(),
    branchId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    search: z.string().optional(),
  }),
});
