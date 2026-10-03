"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.financialStatementSchema = void 0;
const zod_1 = require("zod");
const dateString = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const boolish = zod_1.z
    .union([zod_1.z.boolean(), zod_1.z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform((value) => {
    if (value === undefined)
        return undefined;
    if (typeof value === 'boolean')
        return value;
    return value === 'true' || value === '1';
});
exports.financialStatementSchema = zod_1.z.object({
    query: zod_1.z
        .object({
        from: dateString,
        to: dateString,
        branchId: zod_1.z.string().uuid().optional(),
        paymentMethod: zod_1.z.string().optional(),
        cashierId: zod_1.z.string().uuid().optional(),
        categoryId: zod_1.z.string().uuid().optional(),
        saleType: zod_1.z.enum(['ALL', 'SALES', 'RETURNS', 'all', 'sales', 'returns']).optional(),
        includeSalaries: boolish,
        includePurchases: boolish,
        comparePrevious: boolish,
    })
        .refine((value) => value.to >= value.from, {
        message: 'To Date cannot be earlier than From Date',
        path: ['to'],
    }),
});
//# sourceMappingURL=financial-statement.validation.js.map