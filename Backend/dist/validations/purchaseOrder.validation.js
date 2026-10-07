"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPurchaseOrdersSchema = exports.receivePurchaseOrderSchema = exports.purchaseOrderStatusSchema = exports.updatePurchaseOrderSchema = exports.createPurchaseOrderSchema = exports.idParamSchema = void 0;
const zod_1 = require("zod");
const PO_STATUSES = [
    'PENDING',
    'APPROVED',
    'ORDERED',
    'PARTIALLY_RECEIVED',
    'RECEIVED',
    'CANCELLED',
];
const poItem = zod_1.z.object({
    product_id: zod_1.z.string().uuid(),
    ordered_quantity: zod_1.z.coerce.number().positive(),
    unit_cost: zod_1.z.coerce.number().nonnegative(),
});
exports.idParamSchema = zod_1.z.object({ params: zod_1.z.object({ id: zod_1.z.string().uuid() }) });
exports.createPurchaseOrderSchema = zod_1.z.object({
    body: zod_1.z.object({
        supplier_id: zod_1.z.string().uuid(),
        branch_id: zod_1.z.string().uuid(),
        order_date: zod_1.z.string().optional(),
        expected_delivery: zod_1.z.string().nullable().optional(),
        tax_amount: zod_1.z.coerce.number().nonnegative().optional(),
        notes: zod_1.z.string().trim().max(500).nullable().optional(),
        items: zod_1.z.array(poItem).min(1, 'Add at least one line'),
    }),
});
exports.updatePurchaseOrderSchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().uuid() }),
    body: zod_1.z.object({
        order_date: zod_1.z.string().optional(),
        expected_delivery: zod_1.z.string().nullable().optional(),
        tax_amount: zod_1.z.coerce.number().nonnegative().optional(),
        notes: zod_1.z.string().trim().max(500).nullable().optional(),
        items: zod_1.z.array(poItem).min(1).optional(),
    }),
});
exports.purchaseOrderStatusSchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().uuid() }),
    body: zod_1.z.object({ status: zod_1.z.enum(PO_STATUSES) }),
});
exports.receivePurchaseOrderSchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().uuid() }),
    body: zod_1.z.object({
        invoice_ref: zod_1.z.string().trim().max(120).optional(),
        notes: zod_1.z.string().trim().max(500).optional(),
        lines: zod_1.z
            .array(zod_1.z.object({
            item_id: zod_1.z.string().uuid(),
            quantity: zod_1.z.coerce.number().positive(),
            sale_price: zod_1.z.coerce.number().nonnegative().optional(),
        }))
            .min(1, 'Nothing to receive'),
    }),
});
exports.listPurchaseOrdersSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.coerce.number().int().positive().optional(),
        limit: zod_1.z.coerce.number().int().positive().max(200).optional(),
        search: zod_1.z.string().trim().optional(),
        supplier_id: zod_1.z.string().uuid().optional(),
        branch_id: zod_1.z.string().uuid().optional(),
        status: zod_1.z.enum(PO_STATUSES).optional(),
        from: zod_1.z.string().optional(),
        to: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=purchaseOrder.validation.js.map