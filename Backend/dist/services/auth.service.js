"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("../prisma/client");
const app_1 = require("../config/app");
const apiError_1 = require("../utils/apiError");
const client_2 = require("@prisma/client");
class AuthService {
    async register(data) {
        const existingUser = await client_1.prisma.user.findUnique({
            where: { email: data.email },
        });
        if (existingUser) {
            throw new apiError_1.AppError(400, 'Email already in use');
        }
        const hashedPassword = await bcryptjs_1.default.hash(data.password, 10);
        const user = await client_1.prisma.user.create({
            data: {
                email: data.email,
                password: hashedPassword,
                role: data.role || client_2.Role.ADMIN, // Use Role.USER instead of string
            },
            select: {
                id: true,
                email: true,
                role: true,
                created_at: true,
            },
        });
        return user;
    }
    async registerAdmin(data) {
        if (data.role === client_2.Role.SUPER_ADMIN) {
            throw new apiError_1.AppError(400, 'Cannot assign SUPER_ADMIN role');
        }
        const existingUser = await client_1.prisma.user.findUnique({
            where: { email: data.email },
        });
        if (existingUser) {
            throw new apiError_1.AppError(400, 'Email already in use');
        }
        const hashedPassword = await bcryptjs_1.default.hash(data.password, 10);
        const user = await client_1.prisma.user.create({
            data: {
                email: data.email,
                password: hashedPassword,
                branch_id: data.branch_id,
                role: data.role || client_2.Role.ADMIN,
            },
            select: {
                id: true,
                email: true,
                role: true,
                branch_id: true,
                created_at: true,
            },
        });
        return user;
    }
    async login(email, password) {
        const user = await client_1.prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                branch_id: true,
                password: true,
                role: true,
                is_active: true,
            },
        });
        if (!user || !(await bcryptjs_1.default.compare(password, user.password))) {
            throw new apiError_1.AppError(400, 'Invalid username or password');
        }
        if (!user.is_active) {
            throw new apiError_1.AppError(403, 'This account has been deactivated. Contact the owner.');
        }
        await client_1.prisma.user.update({ where: { id: user.id }, data: { last_login_at: new Date() } });
        // Pure-JWT auth: the signed token (no expiry) IS the session. No Redis,
        // no server-side store. Logout becomes a client-side localStorage wipe.
        const token = jsonwebtoken_1.default.sign({
            id: user.id,
            role: user.role,
            branch_id: user.branch_id,
        }, app_1.config.jwtSecret);
        // Omit password from returned user object
        const { id, password: _, is_active: _active, ...userWithoutPassword } = user;
        return {
            user: userWithoutPassword,
            token,
        };
    }
    // Logout is intentionally a no-op on the server: there is no session to
    // invalidate. The frontend clears its localStorage token; that's it. We
    // keep the method so the existing /auth/logout route stays valid.
    async logout(_userId) {
        return;
    }
    async changePassword(userId, currentPassword, newPassword) {
        const user = await client_1.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new apiError_1.AppError(404, 'User not found');
        }
        const matches = await bcryptjs_1.default.compare(currentPassword, user.password);
        if (!matches) {
            throw new apiError_1.AppError(400, 'Current password is incorrect');
        }
        const hashedPassword = await bcryptjs_1.default.hash(newPassword, 10);
        await client_1.prisma.user.update({ where: { id: userId }, data: { password: hashedPassword } });
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=auth.service.js.map