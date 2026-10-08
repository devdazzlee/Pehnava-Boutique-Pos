"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTransfersSchema = exports.updateTransferStatusSchema = exports.createTransferSchema = void 0;
const zod_1 = require("zod");
exports.createTransferSchema = zod_1.z.object({
    body: zod_1.z.object({
        productId: zod_1.z.string().min(1, 'Product is required'),
        quantity: zod_1.z.number().positive('Quantity must be positive'),
        fromBranchId: zod_1.z.string().min(1, 'Source branch is required'),
        toBranchId: zod_1.z.string().min(1, 'Destination branch is required'),
        notes: zod_1.z.string().optional(),
        reason: zod_1.z.string().optional(),
        carrierName: zod_1.z.string().optional(),
        vehicleNo: zod_1.z.string().optional(),
        estimatedArrival: zod_1.z.string().optional(),
        receiverName: zod_1.z.string().optional(),
    }),
});
exports.updateTransferStatusSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Transfer ID is required'),
    }),
    body: zod_1.z.object({
        status: zod_1.z.enum(['PENDING', 'DISPATCHED', 'RECEIVED', 'CANCELLED']),
    }),
});
exports.listTransfersSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional().default('1'),
        limit: zod_1.z.string().optional().default('20'),
        fromBranchId: zod_1.z.string().optional(),
        toBranchId: zod_1.z.string().optional(),
        productId: zod_1.z.string().optional(),
        status: zod_1.z.string().optional(),
        branchId: zod_1.z.string().optional(),
        startDate: zod_1.z.string().optional(),
        endDate: zod_1.z.string().optional(),
        search: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=transfer.validation.js.map