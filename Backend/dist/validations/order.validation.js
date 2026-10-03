"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateOrderStatusSchema = exports.createOrderSchema = void 0;
const zod_1 = require("zod");
const orderItemSchema = zod_1.z.object({
    productId: zod_1.z.string().min(1, 'Product ID is required'),
    quantity: zod_1.z.number().int().min(1, 'Quantity must be at least 1'),
});
const createOrderSchema = zod_1.z.object({
    body: zod_1.z.object({
        items: zod_1.z.array(orderItemSchema).min(1, 'At least one item is required'),
        paymentMethod: zod_1.z.enum(['CASH', 'CARD', 'MOBILE_MONEY']).optional(),
    }),
});
exports.createOrderSchema = createOrderSchema;
const updateOrderStatusSchema = zod_1.z.object({
    body: zod_1.z.object({
        status: zod_1.z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED']),
    }),
});
exports.updateOrderStatusSchema = updateOrderStatusSchema;
//# sourceMappingURL=order.validation.js.map