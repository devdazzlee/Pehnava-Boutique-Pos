"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listBrandsSchema = exports.getBrandSchema = exports.updateBrandSchema = exports.createBrandSchema = void 0;
const zod_1 = require("zod");
const brandBaseSchema = {
    name: zod_1.z.string().min(1, 'Name is required').max(100),
    is_active: zod_1.z.boolean().optional().default(true),
    display_on_pos: zod_1.z.boolean().optional().default(true),
};
exports.createBrandSchema = zod_1.z.object({
    body: zod_1.z.object(brandBaseSchema),
});
exports.updateBrandSchema = zod_1.z.object({
    body: zod_1.z.object({
        ...brandBaseSchema,
        name: brandBaseSchema.name.optional(),
    }),
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Brand ID is required'),
    }),
});
exports.getBrandSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Brand ID is required'),
    }),
});
exports.listBrandsSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional().default('1'),
        limit: zod_1.z.string().optional().default('10'),
        search: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=brand.validation.js.map