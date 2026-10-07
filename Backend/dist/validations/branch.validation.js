"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.branchCredentialsSchema = exports.listBranchesSchema = exports.getBranchSchema = exports.updateBranchSchema = exports.createBranchSchema = void 0;
const zod_1 = require("zod");
const branchBaseSchema = {
    name: zod_1.z.string().min(1, 'Name is required').max(100),
    address: zod_1.z.string().optional().nullable(),
    branch_type: zod_1.z.enum(['WAREHOUSE', 'BRANCH']).optional().default('BRANCH'),
    allow_neg_pos_stock: zod_1.z.boolean().optional().default(false),
    allow_neg_stock_grrn: zod_1.z.boolean().optional().default(false),
    allow_neg_transferout: zod_1.z.boolean().optional().default(false),
    is_active: zod_1.z.boolean().optional().default(true),
};
exports.createBranchSchema = zod_1.z.object({
    body: zod_1.z.object(branchBaseSchema),
});
exports.updateBranchSchema = zod_1.z.object({
    body: zod_1.z.object({
        ...branchBaseSchema,
        name: branchBaseSchema.name.optional(),
    }),
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Branch ID is required'),
    }),
});
exports.getBranchSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Branch ID is required'),
    }),
});
exports.listBranchesSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional().default('1'),
        limit: zod_1.z.string().optional().default('10'),
        search: zod_1.z.string().optional(),
        is_active: zod_1.z.string().optional(),
        fetch_all: zod_1.z.string().optional(),
    }),
});
exports.branchCredentialsSchema = zod_1.z.object({
    body: zod_1.z
        .object({
        email: zod_1.z.string().email('Invalid email address').optional(),
        password: zod_1.z.string().min(6, 'Password must be at least 6 characters').optional(),
    })
        .refine((data) => data.email || data.password, {
        message: 'Provide an email and/or password to update',
    }),
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Branch ID is required'),
    }),
});
//# sourceMappingURL=branch.validation.js.map