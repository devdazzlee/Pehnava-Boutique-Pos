"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSubcategoriesSchema = exports.getSubcategorySchema = exports.updateSubcategorySchema = exports.createSubcategorySchema = void 0;
const zod_1 = require("zod");
const subcategoryBaseSchema = {
    name: zod_1.z.string().min(1, 'Name is required').max(100),
    display_on_pos: zod_1.z.boolean().optional().default(true),
    is_active: zod_1.z.boolean().optional().default(true),
};
exports.createSubcategorySchema = zod_1.z.object({
    body: zod_1.z.object({
        ...subcategoryBaseSchema,
    }),
});
exports.updateSubcategorySchema = zod_1.z.object({
    body: zod_1.z.object({
        ...subcategoryBaseSchema,
        name: subcategoryBaseSchema.name.optional(),
    }),
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Subcategory ID is required'),
    }),
});
exports.getSubcategorySchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Subcategory ID is required'),
    }),
});
exports.listSubcategoriesSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional().default('1'),
        limit: zod_1.z.string().optional().default('10'),
        search: zod_1.z.string().optional(),
        is_active: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=subcategory.validation.js.map