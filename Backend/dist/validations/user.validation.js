"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyOTPSchema = exports.loginSchema = exports.updateUserSchema = exports.registerUserSchema = exports.createGuestUserSchema = void 0;
const zod_1 = require("zod");
const passwordSchema = zod_1.z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number');
const addressSchema = zod_1.z
    .object({
    street: zod_1.z.string().min(1, 'Street is required'),
    city: zod_1.z.string().min(1, 'City is required'),
    state: zod_1.z.string().min(1, 'State is required'),
    postalCode: zod_1.z.string().min(1, 'Postal code is required'),
    country: zod_1.z.string().min(1, 'Country is required'),
})
    .optional();
// For guest checkout
const createGuestUserSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email('Invalid email address').optional(),
        phone: zod_1.z.string().min(6, 'Invalid phone number').optional(),
        firstName: zod_1.z.string().min(1, 'First name is required'),
        lastName: zod_1.z.string().min(1, 'Last name is required'),
        address: addressSchema,
    }),
});
exports.createGuestUserSchema = createGuestUserSchema;
// For user registration
const registerUserSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email('Invalid email address').optional(),
        phone: zod_1.z.string().min(6, 'Invalid phone number').optional(),
        password: passwordSchema,
        firstName: zod_1.z.string().min(1, 'First name is required'),
        lastName: zod_1.z.string().min(1, 'Last name is required'),
        address: addressSchema,
    }),
});
exports.registerUserSchema = registerUserSchema;
// For profile updates
const updateUserSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email('Invalid email address').optional(),
        phone: zod_1.z.string().min(6, 'Invalid phone number').optional(),
        firstName: zod_1.z.string().min(1, 'First name is required').optional(),
        lastName: zod_1.z.string().min(1, 'Last name is required').optional(),
        address: addressSchema,
    }),
});
exports.updateUserSchema = updateUserSchema;
const loginSchema = zod_1.z.object({
    body: zod_1.z
        .object({
        email: zod_1.z.string().email('Invalid email address').optional(),
        phone: zod_1.z.string().min(6, 'Invalid phone number').optional(),
        password: zod_1.z.string().min(1, 'Password is required'),
    })
        .refine((data) => data.email || data.phone, {
        message: 'Either email or phone must be provided',
    }),
});
exports.loginSchema = loginSchema;
const verifyOTPSchema = zod_1.z.object({
    body: zod_1.z
        .object({
        email: zod_1.z.string().email('Invalid email address').optional(),
        phone: zod_1.z.string().min(6, 'Invalid phone number').optional(),
        otp: zod_1.z.string().min(4, 'OTP must be at least 4 digits'),
    })
        .refine((data) => data.email || data.phone, {
        message: 'Either email or phone must be provided',
    }),
});
exports.verifyOTPSchema = verifyOTPSchema;
//# sourceMappingURL=user.validation.js.map