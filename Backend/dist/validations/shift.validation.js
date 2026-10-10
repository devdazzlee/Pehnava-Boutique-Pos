"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shiftIdParamSchema = exports.listShiftsSchema = exports.createShiftSchema = void 0;
const zod_1 = require("zod");
exports.createShiftSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string(),
        start_time: zod_1.z.string().datetime(),
        end_time: zod_1.z.string().datetime(),
    }),
});
exports.listShiftsSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.coerce.number().optional(),
        limit: zod_1.z.coerce.number().optional(),
    }),
});
exports.shiftIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
});
//# sourceMappingURL=shift.validation.js.map