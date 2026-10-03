"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listVouchersSchema = exports.updateVoucherSchema = exports.createVoucherSchema = exports.listAccountsSchema = exports.updateAccountSchema = exports.createAccountSchema = exports.updateControlSchema = exports.createControlSchema = exports.updateSubTypeSchema = exports.createSubTypeSchema = exports.idParamSchema = exports.nextCodeSchema = exports.ledgerSchema = exports.reportQuerySchema = void 0;
const zod_1 = require("zod");
const ymd = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const optionalText = (max) => zod_1.z.string().trim().max(max).nullable().optional();
const idParams = zod_1.z.object({ id: zod_1.z.string().uuid() });
exports.reportQuerySchema = zod_1.z.object({
    query: zod_1.z
        .object({
        from: ymd.optional(),
        to: ymd.optional(),
        branchId: zod_1.z.string().uuid().optional(),
        includeInactive: zod_1.z.enum(['true', 'false']).optional(),
    })
        .refine((v) => !v.from || !v.to || v.to >= v.from, {
        message: 'To Date cannot be earlier than From Date',
        path: ['to'],
    }),
});
exports.ledgerSchema = zod_1.z.object({
    params: idParams,
    query: exports.reportQuerySchema.shape.query,
});
exports.nextCodeSchema = zod_1.z.object({
    query: zod_1.z.object({
        typeCode: zod_1.z.coerce.number().int().min(1).max(5).optional(),
        subTypeId: zod_1.z.string().uuid().optional(),
        controlId: zod_1.z.string().uuid().optional(),
    }),
});
exports.idParamSchema = zod_1.z.object({ params: idParams });
/* ------------------------------ sub types ------------------------------ */
exports.createSubTypeSchema = zod_1.z.object({
    body: zod_1.z.object({
        type_code: zod_1.z.coerce.number().int().min(1).max(5),
        code: zod_1.z.string().trim().regex(/^\d{2}$/, 'Sub type code must be 2 digits').optional(),
        name: zod_1.z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
        description: optionalText(240),
    }),
});
exports.updateSubTypeSchema = zod_1.z.object({
    params: idParams,
    body: zod_1.z.object({
        name: zod_1.z.string().trim().min(2).max(80).optional(),
        description: optionalText(240),
        is_active: zod_1.z.boolean().optional(),
    }),
});
/* ------------------------------ controls ------------------------------ */
exports.createControlSchema = zod_1.z.object({
    body: zod_1.z.object({
        sub_type_id: zod_1.z.string().uuid(),
        code: zod_1.z.string().trim().regex(/^\d{3}$/, 'Control code must be 3 digits').optional(),
        name: zod_1.z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
        description: optionalText(240),
    }),
});
exports.updateControlSchema = zod_1.z.object({
    params: idParams,
    body: exports.updateSubTypeSchema.shape.body,
});
/* --------------------------- transactional --------------------------- */
const accountFields = {
    name: zod_1.z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
    contact_person: optionalText(120),
    mobile: optionalText(40),
    address: optionalText(300),
    nic: optionalText(40),
    ntn: optionalText(40),
    email: zod_1.z.string().trim().email('Invalid email').max(120).nullable().optional().or(zod_1.z.literal('')),
    notes: optionalText(500),
    opening_balance: zod_1.z.coerce.number().min(0, 'Opening balance cannot be negative').max(1e12).optional(),
    opening_side: zod_1.z.enum(['DEBIT', 'CREDIT']).optional(),
    is_active: zod_1.z.boolean().optional(),
};
exports.createAccountSchema = zod_1.z.object({
    body: zod_1.z.object({
        control_id: zod_1.z.string().uuid(),
        code: zod_1.z.string().trim().regex(/^\d{7}$/, 'Account code must be 7 digits').optional(),
        ...accountFields,
    }),
});
exports.updateAccountSchema = zod_1.z.object({
    params: idParams,
    body: zod_1.z.object({ control_id: zod_1.z.string().uuid().optional(), ...accountFields }).partial(),
});
exports.listAccountsSchema = zod_1.z.object({
    query: zod_1.z.object({
        search: zod_1.z.string().trim().optional(),
        type_code: zod_1.z.coerce.number().int().min(1).max(5).optional(),
        control_id: zod_1.z.string().uuid().optional(),
        active: zod_1.z.enum(['true', 'false']).optional(),
    }),
});
/* --------------------------- journal vouchers --------------------------- */
const voucherLine = zod_1.z.object({
    account_id: zod_1.z.string().uuid('Select an account'),
    debit: zod_1.z.coerce.number().min(0).max(1e12).optional(),
    credit: zod_1.z.coerce.number().min(0).max(1e12).optional(),
    description: optionalText(200),
});
exports.createVoucherSchema = zod_1.z.object({
    body: zod_1.z.object({
        voucher_date: ymd.optional(),
        narration: optionalText(300),
        reference: optionalText(120),
        branch_id: zod_1.z.string().uuid().nullable().optional(),
        lines: zod_1.z.array(voucherLine).min(2, 'A journal voucher needs at least two lines').max(100),
    }),
});
exports.updateVoucherSchema = zod_1.z.object({
    params: idParams,
    body: exports.createVoucherSchema.shape.body.partial(),
});
exports.listVouchersSchema = zod_1.z.object({
    query: zod_1.z.object({
        from: ymd.optional(),
        to: ymd.optional(),
        search: zod_1.z.string().trim().optional(),
        account_id: zod_1.z.string().uuid().optional(),
        page: zod_1.z.coerce.number().int().positive().optional(),
        limit: zod_1.z.coerce.number().int().positive().max(200).optional(),
    }),
});
//# sourceMappingURL=chart-of-accounts.validation.js.map