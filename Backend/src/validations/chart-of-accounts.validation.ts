import { z } from 'zod';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const idParams = z.object({ id: z.string().uuid() });

export const reportQuerySchema = z.object({
  query: z
    .object({
      from: ymd.optional(),
      to: ymd.optional(),
      branchId: z.string().uuid().optional(),
      includeInactive: z.enum(['true', 'false']).optional(),
    })
    .refine((v) => !v.from || !v.to || v.to >= v.from, {
      message: 'To Date cannot be earlier than From Date',
      path: ['to'],
    }),
});

export const ledgerSchema = z.object({
  params: idParams,
  query: reportQuerySchema.shape.query,
});

export const nextCodeSchema = z.object({
  query: z.object({
    typeCode: z.coerce.number().int().min(1).max(5).optional(),
    subTypeId: z.string().uuid().optional(),
    controlId: z.string().uuid().optional(),
  }),
});

export const idParamSchema = z.object({ params: idParams });

/* ------------------------------ sub types ------------------------------ */

export const createSubTypeSchema = z.object({
  body: z.object({
    type_code: z.coerce.number().int().min(1).max(5),
    code: z.string().trim().regex(/^\d{2}$/, 'Sub type code must be 2 digits').optional(),
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
    description: optionalText(240),
  }),
});

export const updateSubTypeSchema = z.object({
  params: idParams,
  body: z.object({
    name: z.string().trim().min(2).max(80).optional(),
    description: optionalText(240),
    is_active: z.boolean().optional(),
  }),
});

/* ------------------------------ controls ------------------------------ */

export const createControlSchema = z.object({
  body: z.object({
    sub_type_id: z.string().uuid(),
    code: z.string().trim().regex(/^\d{3}$/, 'Control code must be 3 digits').optional(),
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
    description: optionalText(240),
  }),
});

export const updateControlSchema = z.object({
  params: idParams,
  body: updateSubTypeSchema.shape.body,
});

/* --------------------------- transactional --------------------------- */

const accountFields = {
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  contact_person: optionalText(120),
  mobile: optionalText(40),
  address: optionalText(300),
  nic: optionalText(40),
  ntn: optionalText(40),
  email: z.string().trim().email('Invalid email').max(120).nullable().optional().or(z.literal('')),
  notes: optionalText(500),
  opening_balance: z.coerce.number().min(0, 'Opening balance cannot be negative').max(1e12).optional(),
  opening_side: z.enum(['DEBIT', 'CREDIT']).optional(),
  is_active: z.boolean().optional(),
};

export const createAccountSchema = z.object({
  body: z.object({
    control_id: z.string().uuid(),
    code: z.string().trim().regex(/^\d{7}$/, 'Account code must be 7 digits').optional(),
    ...accountFields,
  }),
});

export const updateAccountSchema = z.object({
  params: idParams,
  body: z.object({ control_id: z.string().uuid().optional(), ...accountFields }).partial(),
});

export const listAccountsSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    type_code: z.coerce.number().int().min(1).max(5).optional(),
    control_id: z.string().uuid().optional(),
    active: z.enum(['true', 'false']).optional(),
  }),
});

/* --------------------------- journal vouchers --------------------------- */

const voucherLine = z.object({
  account_id: z.string().uuid('Select an account'),
  debit: z.coerce.number().min(0).max(1e12).optional(),
  credit: z.coerce.number().min(0).max(1e12).optional(),
  description: optionalText(200),
});

export const createVoucherSchema = z.object({
  body: z.object({
    voucher_date: ymd.optional(),
    narration: optionalText(300),
    reference: optionalText(120),
    branch_id: z.string().uuid().nullable().optional(),
    lines: z.array(voucherLine).min(2, 'A journal voucher needs at least two lines').max(100),
  }),
});

export const updateVoucherSchema = z.object({
  params: idParams,
  body: createVoucherSchema.shape.body.partial(),
});

export const listVouchersSchema = z.object({
  query: z.object({
    from: ymd.optional(),
    to: ymd.optional(),
    search: z.string().trim().optional(),
    account_id: z.string().uuid().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
  }),
});
