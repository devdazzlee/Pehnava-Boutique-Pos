"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackGuestOrderSchema = exports.createGuestOrderSchema = void 0;
const zod_1 = require("zod");
const orderItemSchema = zod_1.z
    .object({
    id: zod_1.z.string().trim().min(1).optional(),
    productId: zod_1.z.string().trim().min(1).optional(),
    name: zod_1.z.string().trim().min(1, 'Product name is required'),
    price: zod_1.z.number().min(0, 'Price must be positive'),
    quantity: zod_1.z.coerce.number().positive('Quantity must be greater than zero'),
    gramsPerUnit: zod_1.z.coerce.number().positive().optional(),
    unitName: zod_1.z.string().trim().optional(),
    image: zod_1.z.string().optional(),
})
    .refine((val) => Boolean(val.id || val.productId), {
    message: 'Product ID is required',
    path: ['productId'],
});
const createGuestOrderSchema = zod_1.z.object({
    body: zod_1.z.object({
        items: zod_1.z.array(orderItemSchema).min(1, 'At least one item is required'),
        customer: zod_1.z.object({
            firstName: zod_1.z.string().min(1, 'First name is required'),
            lastName: zod_1.z.string().min(1, 'Last name is required'),
            email: zod_1.z.string().email('Invalid email address'),
            phone: zod_1.z.string().min(1, 'Phone number is required'),
        }),
        shipping: zod_1.z.object({
            address: zod_1.z.string().min(1, 'Address is required'),
            city: zod_1.z.string().min(1, 'City is required'),
            postalCode: zod_1.z.string().optional(),
        }),
        paymentMethod: zod_1.z.enum(['cash', 'card', 'bank_transfer']).default('cash'),
        subtotal: zod_1.z.number().min(0),
        shippingCost: zod_1.z.number().min(0),
        total: zod_1.z.number().min(0),
        orderNotes: zod_1.z.string().optional(),
    }),
});
exports.createGuestOrderSchema = createGuestOrderSchema;
const trackGuestOrderSchema = zod_1.z.object({
    body: zod_1.z.object({
        orderNumber: zod_1.z.string().trim().min(1, 'Order number is required'),
        email: zod_1.z.string().trim().email('Invalid email address').optional().or(zod_1.z.literal('')),
        phone: zod_1.z.string().trim().optional().or(zod_1.z.literal('')),
    }),
});
exports.trackGuestOrderSchema = trackGuestOrderSchema;
//# sourceMappingURL=guestOrder.validation.js.map