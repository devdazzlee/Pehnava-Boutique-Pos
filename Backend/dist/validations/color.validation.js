"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listColorsSchema = exports.getColorSchema = exports.updateColorSchema = exports.createColorSchema = void 0;
const zod_1 = require("zod");
const colorBaseSchema = {
    name: zod_1.z.string().min(1, 'Name is required').max(100),
    is_active: zod_1.z.boolean().optional(),
};
exports.createColorSchema = zod_1.z.object({
    body: zod_1.z.object(colorBaseSchema),
});
exports.updateColorSchema = zod_1.z.object({
    body: zod_1.z.object({
        ...colorBaseSchema,
        name: colorBaseSchema.name.optional(),
    }),
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Color ID is required'),
    }),
});
exports.getColorSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Color ID is required'),
    }),
});
exports.listColorsSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional().default('1'),
        limit: zod_1.z.string().optional().default('10'),
        search: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=color.validation.js.map