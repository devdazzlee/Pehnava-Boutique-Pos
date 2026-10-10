"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPurchaseInvoicesSchema = exports.updatePurchaseInvoiceSchema = exports.createPurchaseInvoiceSchema = exports.supplierParamSchema = exports.idParamSchema = void 0;
const zod_1 = require("zod");
exports.idParamSchema = zod_1.z.object({ params: zod_1.z.object({ id: zod_1.z.string().uuid() }) });
exports.supplierParamSchema = zod_1.z.object({ params: zod_1.z.object({ supplierId: zod_1.z.string().uuid() }) });
exports.createPurchaseInvoiceSchema = zod_1.z.object({
    body: zod_1.z.object({
        supplier_id: zod_1.z.string().uuid(),
        branch_id: zod_1.z.string().uuid().nullable().optional(),
        purchase_order_id: zod_1.z.string().uuid().nullable().optional(),
        invoice_number: zod_1.z.string().trim().min(1, 'Invoice number is required').max(80),
        invoice_date: zod_1.z.string().optional(),
        due_date: zod_1.z.string().nullable().optional(),
        tax_amount: zod_1.z.coerce.number().nonnegative().optional(),
        discount_amount: zod_1.z.coerce.number().nonnegative().optional(),
        notes: zod_1.z.string().trim().max(500).nullable().optional(),
        purchase_ids: zod_1.z.array(zod_1.z.string().uuid()).min(1, 'Select at least one delivery'),
    }),
});
exports.updatePurchaseInvoiceSchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().uuid() }),
    body: zod_1.z.object({
        invoice_number: zod_1.z.string().trim().min(1).max(80).optional(),
        invoice_date: zod_1.z.string().optional(),
        due_date: zod_1.z.string().nullable().optional(),
        tax_amount: zod_1.z.coerce.number().nonnegative().optional(),
        discount_amount: zod_1.z.coerce.number().nonnegative().optional(),
        notes: zod_1.z.string().trim().max(500).nullable().optional(),
        purchase_ids: zod_1.z.array(zod_1.z.string().uuid()).min(1).optional(),
    }),
});
exports.listPurchaseInvoicesSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.coerce.number().int().positive().optional(),
        limit: zod_1.z.coerce.number().int().positive().max(200).optional(),
        supplier_id: zod_1.z.string().uuid().optional(),
        branch_id: zod_1.z.string().uuid().optional(),
        status: zod_1.z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID']).optional(),
        overdue: zod_1.z.enum(['true', 'false']).optional(),
        from: zod_1.z.string().optional(),
        to: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=purchaseInvoice.validation.js.map