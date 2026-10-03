"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.changePasswordSchema = exports.registerSchema = exports.loginSchema = void 0;
const zod_1 = require("zod");
const registerSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email('Invalid email address'),
        password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
        role: zod_1.z.enum(['ADMIN', 'SUPER_ADMIN']).optional(),
        branch_id: zod_1.z.string().optional(),
    }),
});
exports.registerSchema = registerSchema;
const loginSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().min(1, 'Username is required'),
        password: zod_1.z.string().min(1, 'Password is required'),
    }),
});
exports.loginSchema = loginSchema;
const changePasswordSchema = zod_1.z.object({
    body: zod_1.z.object({
        currentPassword: zod_1.z.string().min(1, 'Current password is required'),
        newPassword: zod_1.z.string().min(6, 'New password must be at least 6 characters'),
    }),
});
exports.changePasswordSchema = changePasswordSchema;
//# sourceMappingURL=auth.validation.js.map