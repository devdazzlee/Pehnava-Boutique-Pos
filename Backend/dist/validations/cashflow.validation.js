"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCashFlowsSchema = exports.getExpensesByDateSchema = exports.getCashFlowByDateSchema = exports.addClosingSchema = exports.createExpenseSchema = exports.createOpeningSchema = void 0;
const zod_1 = require("zod");
exports.createOpeningSchema = zod_1.z.object({
    body: zod_1.z.object({
        opening: zod_1.z.number().min(0),
        sales: zod_1.z.number().min(0).default(0),
    }),
});
exports.createExpenseSchema = zod_1.z.object({
    body: zod_1.z.object({
        particular: zod_1.z.string().min(1),
        amount: zod_1.z.number().positive(),
    }),
});
exports.addClosingSchema = zod_1.z.object({
    body: zod_1.z.object({
        cashflow_id: zod_1.z.string().uuid(),
        closing: zod_1.z.number().min(0),
    }),
});
exports.getCashFlowByDateSchema = zod_1.z.object({
    query: zod_1.z.object({
        date: zod_1.z.string().refine((val) => !isNaN(Date.parse(val)), {
            message: 'Invalid date format',
        }),
    }),
});
exports.getExpensesByDateSchema = zod_1.z.object({
    query: zod_1.z.object({
        date: zod_1.z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), {
            message: 'Invalid date format',
        }),
    }),
});
exports.listCashFlowsSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.coerce.number().optional(),
        limit: zod_1.z.coerce.number().optional(),
    }),
});
//# sourceMappingURL=cashflow.validation.js.map