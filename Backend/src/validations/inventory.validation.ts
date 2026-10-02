import { z } from 'zod';

export const listMovementsSchema = z.object({
  query: z.object({
    page: z.string().optional().default('1'),
    limit: z.string().optional().default('50'),
    branchId: z.string().optional(),
    productId: z.string().optional(),
    movementType: z.string().optional(),
    direction: z.enum(['in', 'out']).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
});

export const reportsSchema = z.object({
  query: z.object({
    type: z.enum(['valuation', 'purchase', 'transfer', 'stockout', 'lowstock', 'aging', 'movement_summary', 'financial_audit']),
    branchId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    supplierId: z.string().optional(),
    productId: z.string().optional(),
    categoryId: z.string().optional(),
    q: z.string().max(120).optional(),
    sort: z.string().max(40).optional(),
    status: z.string().max(40).optional(),
    movementType: z.string().max(40).optional(),
    stockStatus: z.string().max(40).optional(),
    ageBucket: z.string().max(40).optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
    all: z.string().optional(),
  }),
});
