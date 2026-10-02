import { z } from 'zod';

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

export const createPurchaseReturnSchema = z.object({
    body: z.object({
        supplier_id: z.string().uuid(),
        branch_id: z.string().uuid(),
        return_date: z.string().optional(),
        reason: z.string().trim().max(240).nullable().optional(),
        notes: z.string().trim().max(500).nullable().optional(),
        items: z
            .array(
                z.object({
                    product_id: z.string().uuid(),
                    quantity: z.coerce.number().positive(),
                    unit_cost: z.coerce.number().nonnegative(),
                    /** Required by service — links return to a real purchase bill line. */
                    purchase_id: z.string().uuid('Select a purchase bill line'),
                }),
            )
            .min(1, 'Add at least one line'),
    }),
});

export const returnableBillsSchema = z.object({
    query: z.object({
        supplier_id: z.string().uuid(),
        branch_id: z.string().uuid(),
    }),
});

export const listPurchaseReturnsSchema = z.object({
    query: z.object({
        page: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().positive().max(200).optional(),
        supplier_id: z.string().uuid().optional(),
        branch_id: z.string().uuid().optional(),
        status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
    }),
});
