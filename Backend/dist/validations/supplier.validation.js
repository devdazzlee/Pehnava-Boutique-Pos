"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSupplierPaymentSchema = exports.updateSupplierPaymentSchema = exports.createSupplierPaymentSchema = exports.listSuppliersSchema = exports.getSupplierSchema = exports.supplierUpdateBodySchema = exports.supplierBodySchema = exports.updateSupplierSchema = exports.createSupplierSchema = void 0;
const zod_1 = require("zod");
// Optional contact fields are .nullable() so the Edit form can send `null`
// explicitly to clear a previously-set value. On create the frontend omits
// empty optionals entirely, so this still leaves NULL in the column.
const optionalString = zod_1.z.string().nullable().optional();
const optionalEmail = zod_1.z
    .string()
    .email('Invalid email format')
    .nullable()
    .optional();
const supplierBaseSchema = {
    name: zod_1.z.string().min(1, 'Name is required').max(100),
    phone_number: optionalString,
    fax_number: optionalString,
    mobile_number: optionalString,
    country: optionalString,
    city: optionalString,
    status: optionalString,
    email: optionalEmail,
    ntn: optionalString,
    strn: optionalString,
    gov_id: optionalString,
    address: optionalString,
    display_on_pos: zod_1.z.boolean().optional().default(true),
    contact_person: optionalString,
    whatsapp_number: optionalString,
    category: optionalString,
    payment_terms: optionalString,
    credit_days: zod_1.z.coerce.number().int().min(0).max(365).nullable().optional(),
    credit_limit: zod_1.z.coerce.number().min(0).nullable().optional(),
    opening_balance: zod_1.z.coerce.number().optional(),
    opening_balance_date: zod_1.z.string().nullable().optional(),
    bank_name: optionalString,
    bank_account_title: optionalString,
    bank_account_number: optionalString,
    bank_iban: optionalString,
    rating: zod_1.z.coerce.number().int().min(1).max(5).nullable().optional(),
    notes: zod_1.z.string().max(1000).nullable().optional(),
};
exports.createSupplierSchema = zod_1.z.object({
    body: zod_1.z.object(supplierBaseSchema),
});
exports.updateSupplierSchema = zod_1.z.object({
    body: zod_1.z.object({
        ...supplierBaseSchema,
        name: zod_1.z.string().min(1, 'Name is required').max(100).optional(),
    }),
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Supplier ID is required'),
    }),
});
exports.supplierBodySchema = zod_1.z.object(supplierBaseSchema);
exports.supplierUpdateBodySchema = zod_1.z.object(supplierBaseSchema).partial();
exports.getSupplierSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Supplier ID is required'),
    }),
});
exports.listSuppliersSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional().default('1'),
        limit: zod_1.z.string().optional().default('10'),
        search: zod_1.z.string().optional(),
        status: zod_1.z.string().optional(),
        is_active: zod_1.z.enum(['true', 'false']).optional(),
        display_on_pos: zod_1.z.enum(['true', 'false']).optional(),
        fetch_all: zod_1.z.enum(['true', 'false']).optional(),
        balance: zod_1.z.enum(['all', 'due', 'advance', 'clear', 'overdue', 'over_limit']).optional(),
        sort: zod_1.z.enum(['recent', 'name', 'balance_desc', 'purchases_desc', 'overdue_desc', 'last_purchase', 'oldest']).optional(),
        city: zod_1.z.string().optional(),
        category: zod_1.z.string().optional(),
    }),
});
exports.createSupplierPaymentSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Supplier ID is required'),
    }),
    body: zod_1.z.object({
        type: zod_1.z.enum(['PAYMENT', 'ADVANCE', 'REFUND', 'DEBIT_NOTE', 'CREDIT_NOTE', 'DISCOUNT']).optional().default('PAYMENT'),
        amount: zod_1.z.coerce.number().positive('Amount must be greater than 0'),
        paymentDate: zod_1.z.string().optional(),
        method: zod_1.z
            .enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'MOBILE_MONEY', 'OTHER'])
            .optional()
            .default('CASH'),
        reference: zod_1.z.string().max(120).nullable().optional(),
        notes: zod_1.z.string().max(500).nullable().optional(),
        purchaseInvoiceId: zod_1.z.string().uuid().nullable().optional(),
    }),
});
exports.updateSupplierPaymentSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1),
        paymentId: zod_1.z.string().min(1),
    }),
    body: zod_1.z.object({
        type: zod_1.z.enum(['PAYMENT', 'ADVANCE', 'REFUND', 'DEBIT_NOTE', 'CREDIT_NOTE', 'DISCOUNT']).optional(),
        amount: zod_1.z.coerce.number().positive('Amount must be greater than 0').optional(),
        paymentDate: zod_1.z.string().optional(),
        method: zod_1.z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'MOBILE_MONEY', 'OTHER']).optional(),
        reference: zod_1.z.string().max(120).nullable().optional(),
        notes: zod_1.z.string().max(500).nullable().optional(),
        purchaseInvoiceId: zod_1.z.string().uuid().nullable().optional(),
    }),
});
exports.deleteSupplierPaymentSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Supplier ID is required'),
        paymentId: zod_1.z.string().min(1, 'Payment ID is required'),
    }),
});
//# sourceMappingURL=supplier.validation.js.map