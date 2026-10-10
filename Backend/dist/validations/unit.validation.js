"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUnitsSchema = exports.getUnitSchema = exports.updateUnitSchema = exports.createUnitSchema = void 0;
const zod_1 = require("zod");
const unitBaseSchema = {
    name: zod_1.z.string().min(1, 'Name is required').max(100),
    is_active: zod_1.z.boolean().optional().default(true),
    display_on_pos: zod_1.z.boolean().optional().default(true),
};
exports.createUnitSchema = zod_1.z.object({
    body: zod_1.z.object(unitBaseSchema),
});
exports.updateUnitSchema = zod_1.z.object({
    body: zod_1.z.object({
        ...unitBaseSchema,
        name: unitBaseSchema.name.optional(),
    }),
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Unit ID is required'),
    }),
});
exports.getUnitSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Unit ID is required'),
    }),
});
exports.listUnitsSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional().default('1'),
        limit: zod_1.z.string().optional().default('10'),
        search: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=unit.validation.js.map