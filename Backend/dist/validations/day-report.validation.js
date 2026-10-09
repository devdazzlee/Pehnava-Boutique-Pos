"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dayReportSchema = void 0;
const zod_1 = require("zod");
const dateString = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
exports.dayReportSchema = zod_1.z.object({
    query: zod_1.z
        .object({
        from: dateString,
        to: dateString,
        view: zod_1.z.enum(['revenue', 'cash', 'credit', 'expenses']).default('revenue'),
        search: zod_1.z.string().optional(),
        page: zod_1.z.coerce.number().int().min(1).optional(),
        limit: zod_1.z.coerce.number().int().min(1).max(5000).optional(),
        /** When true, return all matching rows in one response (capped at 5000). */
        fetch_all: zod_1.z.enum(['true', 'false']).optional(),
        branchId: zod_1.z.string().uuid().optional(),
    })
        .refine((value) => value.to >= value.from, {
        message: 'To Date cannot be earlier than From Date',
        path: ['to'],
    }),
});
//# sourceMappingURL=day-report.validation.js.map