"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportsSchema = exports.listMovementsSchema = void 0;
const zod_1 = require("zod");
exports.listMovementsSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional().default('1'),
        limit: zod_1.z.string().optional().default('50'),
        branchId: zod_1.z.string().optional(),
        productId: zod_1.z.string().optional(),
        movementType: zod_1.z.string().optional(),
        direction: zod_1.z.enum(['in', 'out']).optional(),
        startDate: zod_1.z.string().optional(),
        endDate: zod_1.z.string().optional(),
    }),
});
exports.reportsSchema = zod_1.z.object({
    query: zod_1.z.object({
        type: zod_1.z.enum(['valuation', 'purchase', 'transfer', 'stockout', 'lowstock', 'aging', 'movement_summary', 'financial_audit']),
        branchId: zod_1.z.string().optional(),
        startDate: zod_1.z.string().optional(),
        endDate: zod_1.z.string().optional(),
        supplierId: zod_1.z.string().optional(),
        productId: zod_1.z.string().optional(),
        categoryId: zod_1.z.string().optional(),
        q: zod_1.z.string().max(120).optional(),
        sort: zod_1.z.string().max(40).optional(),
        status: zod_1.z.string().max(40).optional(),
        movementType: zod_1.z.string().max(40).optional(),
        stockStatus: zod_1.z.string().max(40).optional(),
        ageBucket: zod_1.z.string().max(40).optional(),
        page: zod_1.z.string().optional(),
        limit: zod_1.z.string().optional(),
        all: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=inventory.validation.js.map