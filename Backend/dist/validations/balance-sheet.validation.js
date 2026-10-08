"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.balanceSheetSchema = void 0;
const zod_1 = require("zod");
const dateString = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
exports.balanceSheetSchema = zod_1.z.object({
    query: zod_1.z
        .object({
        from: dateString,
        to: dateString,
        branchId: zod_1.z.string().uuid().optional(),
    })
        .refine((value) => value.to >= value.from, {
        message: 'To Date cannot be earlier than From Date',
        path: ['to'],
    }),
});
//# sourceMappingURL=balance-sheet.validation.js.map