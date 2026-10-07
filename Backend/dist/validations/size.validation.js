"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSizesSchema = exports.getSizeSchema = exports.updateSizeSchema = exports.createSizeSchema = void 0;
const zod_1 = require("zod");
const sizeBaseSchema = {
    name: zod_1.z.string().min(1, 'Name is required').max(100),
    is_active: zod_1.z.boolean().optional(),
    display_on_pos: zod_1.z.boolean().optional(),
};
exports.createSizeSchema = zod_1.z.object({
    body: zod_1.z.object(sizeBaseSchema),
});
exports.updateSizeSchema = zod_1.z.object({
    body: zod_1.z.object({
        ...sizeBaseSchema,
        name: sizeBaseSchema.name.optional(),
    }),
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Size ID is required'),
    }),
});
exports.getSizeSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Size ID is required'),
    }),
});
exports.listSizesSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional().default('1'),
        limit: zod_1.z.string().optional().default('10'),
        search: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=size.validation.js.map