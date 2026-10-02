import { z } from 'zod';

const phoneRegex = /^[0-9+\-\s]+$/;

const optionalEmail = z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, {
        message: 'Invalid email address',
    });

const optionalMoney = z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z
        .number({ invalid_type_error: 'Must be a valid number' })
        .nonnegative('Amount cannot be negative')
        .optional(),
);

const optionalPercent = z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z
        .number({ invalid_type_error: 'Must be a valid number' })
        .min(0, 'Discount cannot be negative')
        .max(100, 'Discount cannot exceed 100%')
        .optional(),
);

const optionalCreditDays = z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z
        .number({ invalid_type_error: 'Must be a whole number of days' })
        .int('Must be a whole number of days')
        .min(0, 'Credit days cannot be negative')
        .max(365, 'Credit days cannot exceed 365')
        .optional(),
);

const TXN_TYPES = ['PAYMENT', 'ADVANCE', 'REFUND', 'CREDIT_NOTE', 'DEBIT_NOTE', 'WRITE_OFF'] as const;
const TXN_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'ADJUSTMENT', 'OTHER'] as const;

// Customer self-registration — only email is required (the password is
// generated / sent separately in the existing flow).
const cusRegisterationSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email address'),
    }),
});

const customerLoginSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email address'),
        password: z.string().min(6, 'Password must be at least 6 characters long'),
    }),
});

// Admin / staff creating a customer from the POS Customers screen.
const customerCreateByAdminSchema = z.object({
    body: z.object({
        name: z.string().trim().min(1, 'Name is required'),
        phone_number: z
            .string()
            .trim()
            .min(1, 'Phone number is required')
            .min(7, 'Phone number must be at least 7 digits')
            .max(20, 'Phone number is too long')
            .regex(phoneRegex, 'Phone number must contain only digits, +, -, or spaces'),
        email: optionalEmail,
        address: z.string().trim().optional(),
        billing_address: z.string().trim().optional(),
        credit_limit: optionalMoney,
        previous_credit_balance: optionalMoney,
        default_discount_percent: optionalPercent,
        credit_days: optionalCreditDays,
        notes: z.string().trim().max(1000).optional(),
        is_active: z.boolean().optional(),
    }),
});

const customerUpdateSchema = z.object({
    body: z.object({
        name: z.string().trim().min(1, 'Name is required').nullable().optional(),
        phone_number: z
            .string()
            .trim()
            .min(7, 'Phone number must be at least 7 digits')
            .max(20, 'Phone number is too long')
            .regex(phoneRegex, 'Phone number must contain only digits, +, -, or spaces')
            .nullable()
            .optional(),
        email: z
            .union([
                z.string().trim().email('Invalid email address'),
                z.literal(''),
                z.null(),
            ])
            .optional(),
        address: z.string().trim().nullable().optional(),
        billing_address: z.string().trim().nullable().optional(),
        credit_limit: z.number().nonnegative('Credit limit cannot be negative').nullable().optional(),
        previous_credit_balance: z
            .number()
            .nonnegative('Previous credit balance cannot be negative')
            .nullable()
            .optional(),
        default_discount_percent: z
            .number()
            .min(0, 'Discount cannot be negative')
            .max(100, 'Discount cannot exceed 100%')
            .nullable()
            .optional(),
        credit_days: z.number().int().min(0, 'Credit days cannot be negative').max(365).nullable().optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
        is_active: z.boolean().optional(),
    }),
});

const getCustomerParamsSchema = z.object({
    params: z.object({
        customerId: z.string().min(1, 'Customer ID is required'),
    }),
});

const createCustomerPaymentSchema = z.object({
    params: z.object({
        customerId: z.string().min(1, 'Customer ID is required'),
    }),
    body: z.object({
        type: z.enum(TXN_TYPES).optional().default('PAYMENT'),
        amount: z.coerce.number().positive('Amount must be greater than 0'),
        paymentDate: z.string().optional(),
        method: z.enum(TXN_METHODS).optional().default('CASH'),
        reference: z.string().max(120).optional(),
        notes: z.string().max(500).optional(),
        saleId: z.string().uuid().nullable().optional(),
    }),
});

const updateCustomerPaymentSchema = z.object({
    params: z.object({
        customerId: z.string().min(1, 'Customer ID is required'),
        paymentId: z.string().min(1, 'Transaction ID is required'),
    }),
    body: z.object({
        type: z.enum(TXN_TYPES).optional(),
        amount: z.coerce.number().positive('Amount must be greater than 0').optional(),
        paymentDate: z.string().optional(),
        method: z.enum(TXN_METHODS).optional(),
        reference: z.string().max(120).nullable().optional(),
        notes: z.string().max(500).nullable().optional(),
        saleId: z.string().uuid().nullable().optional(),
    }),
});

const deleteCustomerPaymentSchema = z.object({
    params: z.object({
        customerId: z.string().min(1, 'Customer ID is required'),
        paymentId: z.string().min(1, 'Payment ID is required'),
    }),
});

export {
    cusRegisterationSchema,
    customerLoginSchema,
    customerCreateByAdminSchema,
    customerUpdateSchema,
    createCustomerPaymentSchema,
    updateCustomerPaymentSchema,
    deleteCustomerPaymentSchema,
    getCustomerParamsSchema,
};

export type CreateCustomerPaymentInput = z.infer<
    typeof createCustomerPaymentSchema
>['body'];

export type UpdateCustomerPaymentInput = z.infer<
    typeof updateCustomerPaymentSchema
>['body'];
