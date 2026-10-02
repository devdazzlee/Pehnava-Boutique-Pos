"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listShiftAssignmentsSchema = exports.endShiftByIdSchema = exports.endShiftBodySchema = exports.shiftAssignmentIdParamSchema = exports.employeeIdParamSchema = exports.updateShiftAssignmentSchema = exports.assignShiftSchema = void 0;
const zod_1 = require("zod");
exports.assignShiftSchema = zod_1.z.object({
    body: zod_1.z.object({
        employee_id: zod_1.z.string().uuid(),
        shift_time: zod_1.z.string().min(1),
        start_date: zod_1.z.string().datetime(),
        end_date: zod_1.z.string().datetime().optional().nullable(),
        break_time: zod_1.z.string().optional().nullable(),
        sales: zod_1.z.coerce.number().min(0).optional(),
    }),
});
exports.updateShiftAssignmentSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
    body: zod_1.z.object({
        shift_time: zod_1.z.string().min(1).optional(),
        start_date: zod_1.z.string().datetime().optional(),
        end_date: zod_1.z.string().datetime().optional().nullable(),
        break_time: zod_1.z.string().optional().nullable(),
        sales: zod_1.z.coerce.number().min(0).optional(),
    }),
});
exports.employeeIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        employee_id: zod_1.z.string().uuid(),
    }),
});
exports.shiftAssignmentIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
});
exports.endShiftBodySchema = zod_1.z.object({
    params: zod_1.z.object({
        employee_id: zod_1.z.string().uuid(),
    }),
    body: zod_1.z
        .object({
        sales: zod_1.z.coerce.number().min(0).optional(),
    })
        .optional(),
});
exports.endShiftByIdSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
    body: zod_1.z
        .object({
        sales: zod_1.z.coerce.number().min(0).optional(),
    })
        .optional(),
});
exports.listShiftAssignmentsSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.coerce.number().int().positive().optional(),
        limit: zod_1.z.coerce.number().int().positive().max(200).optional(),
        fetch_all: zod_1.z
            .union([zod_1.z.literal('true'), zod_1.z.literal('false'), zod_1.z.boolean()])
            .optional()
            .transform((v) => v === true || v === 'true'),
        search: zod_1.z.string().optional(),
        employee_id: zod_1.z.string().uuid().optional(),
        status: zod_1.z.enum(['all', 'active', 'scheduled', 'completed']).optional(),
        date_from: zod_1.z.string().optional(),
        date_to: zod_1.z.string().optional(),
        period: zod_1.z.enum(['all', 'today', 'week', 'month']).optional(),
    }),
});
//# sourceMappingURL=shiftAssignment.validation.js.map