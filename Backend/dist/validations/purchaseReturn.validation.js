"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPurchaseReturnsSchema = exports.returnableBillsSchema = exports.createPurchaseReturnSchema = exports.idParamSchema = void 0;
const zod_1 = require("zod");
exports.idParamSchema = zod_1.z.object({ params: zod_1.z.object({ id: zod_1.z.string().uuid() }) });
exports.createPurchaseReturnSchema = zod_1.z.object({
    body: zod_1.z.object({
        supplier_id: zod_1.z.string().uuid(),
        branch_id: zod_1.z.string().uuid(),
        return_date: zod_1.z.string().optional(),
        reason: zod_1.z.string().trim().max(240).nullable().optional(),
        notes: zod_1.z.string().trim().max(500).nullable().optional(),
        items: zod_1.z
            .array(zod_1.z.object({
            product_id: zod_1.z.string().uuid(),
            quantity: zod_1.z.coerce.number().positive(),
            unit_cost: zod_1.z.coerce.number().nonnegative(),
            /** Required by service — links return to a real purchase bill line. */
            purchase_id: zod_1.z.string().uuid('Select a purchase bill line'),
        }))
            .min(1, 'Add at least one line'),
    }),
});
exports.returnableBillsSchema = zod_1.z.object({
    query: zod_1.z.object({
        supplier_id: zod_1.z.string().uuid(),
        branch_id: zod_1.z.string().uuid(),
    }),
});
exports.listPurchaseReturnsSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.coerce.number().int().positive().optional(),
        limit: zod_1.z.coerce.number().int().positive().max(200).optional(),
        supplier_id: zod_1.z.string().uuid().optional(),
        branch_id: zod_1.z.string().uuid().optional(),
        status: zod_1.z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
        from: zod_1.z.string().optional(),
        to: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=purchaseReturn.validation.js.map