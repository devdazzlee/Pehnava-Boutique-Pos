"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTaxesSchema = exports.gettaxeschema = exports.updatetaxeschema = exports.createtaxeschema = void 0;
const zod_1 = require("zod");
const taxBaseSchema = {
    name: zod_1.z.string().min(1, 'Name is required').max(100),
    percentage: zod_1.z.number().min(0, 'Percentage must be at least 0').max(100, 'Percentage cannot exceed 100'),
    is_active: zod_1.z.boolean().optional().default(true),
};
exports.createtaxeschema = zod_1.z.object({
    body: zod_1.z.object(taxBaseSchema),
});
exports.updatetaxeschema = zod_1.z.object({
    body: zod_1.z.object({
        ...taxBaseSchema,
        name: taxBaseSchema.name.optional(),
        percentage: taxBaseSchema.percentage.optional(),
    }),
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Tax ID is required'),
    }),
});
exports.gettaxeschema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Tax ID is required'),
    }),
});
exports.listTaxesSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional().default('1'),
        limit: zod_1.z.string().optional().default('10'),
        search: zod_1.z.string().optional(),
        is_active: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=tax.validation.js.map