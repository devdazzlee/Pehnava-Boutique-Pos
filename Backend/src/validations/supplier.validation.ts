import { z } from 'zod';

// Optional contact fields are .nullable() so the Edit form can send `null`
// explicitly to clear a previously-set value. On create the frontend omits
// empty optionals entirely, so this still leaves NULL in the column.
const optionalString = z.string().nullable().optional();
const optionalEmail = z
    .string()
    .email('Invalid email format')
    .nullable()
    .optional();

const supplierBaseSchema = {
    name: z.string().min(1, 'Name is required').max(100),
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
    display_on_pos: z.boolean().optional().default(true),
    contact_person: optionalString,
    whatsapp_number: optionalString,
    category: optionalString,
    payment_terms: optionalString,
    credit_days: z.coerce.number().int().min(0).max(365).nullable().optional(),
    credit_limit: z.coerce.number().min(0).nullable().optional(),
    opening_balance: z.coerce.number().optional(),
    opening_balance_date: z.string().nullable().optional(),
    bank_name: optionalString,
    bank_account_title: optionalString,
    bank_account_number: optionalString,
    bank_iban: optionalString,
    rating: z.coerce.number().int().min(1).max(5).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
};

export const createSupplierSchema = z.object({
    body: z.object(supplierBaseSchema),
});

export const updateSupplierSchema = z.object({
    body: z.object({
        ...supplierBaseSchema,
        name: z.string().min(1, 'Name is required').max(100).optional(),
    }),
    params: z.object({
        id: z.string().min(1, 'Supplier ID is required'),
    }),
});
export const supplierBodySchema = z.object(supplierBaseSchema);
export const supplierUpdateBodySchema = z.object(supplierBaseSchema).partial();

export const getSupplierSchema = z.object({
    params: z.object({
        id: z.string().min(1, 'Supplier ID is required'),
    }),
});

export const listSuppliersSchema = z.object({
    query: z.object({
        page: z.string().optional().default('1'),
        limit: z.string().optional().default('10'),
        search: z.string().optional(),
        status: z.string().optional(),
        is_active: z.enum(['true', 'false']).optional(),
        display_on_pos: z.enum(['true', 'false']).optional(),
        fetch_all: z.enum(['true', 'false']).optional(),
        balance: z.enum(['all', 'due', 'advance', 'clear', 'overdue', 'over_limit']).optional(),
        sort: z.enum(['recent', 'name', 'balance_desc', 'purchases_desc', 'overdue_desc', 'last_purchase', 'oldest']).optional(),
        city: z.string().optional(),
        category: z.string().optional(),
    }),
});

export const createSupplierPaymentSchema = z.object({
    params: z.object({
        id: z.string().min(1, 'Supplier ID is required'),
    }),
    body: z.object({
        type: z.enum(['PAYMENT', 'ADVANCE', 'REFUND', 'DEBIT_NOTE', 'CREDIT_NOTE', 'DISCOUNT']).optional().default('PAYMENT'),
        amount: z.coerce.number().positive('Amount must be greater than 0'),
        paymentDate: z.string().optional(),
        method: z
            .enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'MOBILE_MONEY', 'OTHER'])
            .optional()
            .default('CASH'),
        reference: z.string().max(120).nullable().optional(),
        notes: z.string().max(500).nullable().optional(),
        purchaseInvoiceId: z.string().uuid().nullable().optional(),
    }),
});

export const updateSupplierPaymentSchema = z.object({
    params: z.object({
        id: z.string().min(1),
        paymentId: z.string().min(1),
    }),
    body: z.object({
        type: z.enum(['PAYMENT', 'ADVANCE', 'REFUND', 'DEBIT_NOTE', 'CREDIT_NOTE', 'DISCOUNT']).optional(),
        amount: z.coerce.number().positive('Amount must be greater than 0').optional(),
        paymentDate: z.string().optional(),
        method: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'MOBILE_MONEY', 'OTHER']).optional(),
        reference: z.string().max(120).nullable().optional(),
        notes: z.string().max(500).nullable().optional(),
        purchaseInvoiceId: z.string().uuid().nullable().optional(),
    }),
});

export const deleteSupplierPaymentSchema = z.object({
    params: z.object({
        id: z.string().min(1, 'Supplier ID is required'),
        paymentId: z.string().min(1, 'Payment ID is required'),
    }),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>['body'];
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>['body'];
export type CreateSupplierPaymentInput = z.infer<
    typeof createSupplierPaymentSchema
>['body'];
export type UpdateSupplierPaymentInput = z.infer<typeof updateSupplierPaymentSchema>['body'];