"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changePassword = exports.getCurrentUser = exports.registerAdmin = exports.logout = exports.login = exports.register = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const audit_service_1 = require("../services/audit.service");
const auth_service_1 = require("../services/auth.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const authService = new auth_service_1.AuthService();
const register = (0, asyncHandler_1.default)(async (req, res) => {
    const user = await authService.register(req.body);
    new apiResponse_1.ApiResponse(user, 'IUser registered successfully', 201).send(res);
});
exports.register = register;
const registerAdmin = (0, asyncHandler_1.default)(async (req, res) => {
    const user = await authService.registerAdmin(req.body);
    new apiResponse_1.ApiResponse(user, 'IUser registered successfully', 201).send(res);
});
exports.registerAdmin = registerAdmin;
const login = (0, asyncHandler_1.default)(async (req, res) => {
    const { email, password } = req.body;
    const meta = (0, audit_service_1.requestMeta)(req);
    try {
        const userWithToken = await authService.login(email, password);
        const decoded = jsonwebtoken_1.default.decode(userWithToken.token);
        await (0, audit_service_1.audit)({
            action: 'auth.login',
            category: 'security',
            summary: `Signed in (${userWithToken.user.role})`,
            userId: decoded?.id ?? null,
            userEmail: userWithToken.user.email,
            userRole: userWithToken.user.role,
            branchId: userWithToken.user.branch_id ?? null,
            ip: meta.ip,
            userAgent: meta.userAgent,
        });
        new apiResponse_1.ApiResponse({ ...userWithToken }, 'Login successful').send(res);
    }
    catch (error) {
        await (0, audit_service_1.audit)({
            action: 'auth.login_failed',
            category: 'security',
            summary: `Failed sign-in for ${String(email || '').slice(0, 80)}: ${error.message}`,
            userEmail: String(email || '').slice(0, 120) || null,
            ip: meta.ip,
            userAgent: meta.userAgent,
        });
        throw error;
    }
});
exports.login = login;
const logout = (0, asyncHandler_1.default)(async (req, res) => {
    await authService.logout(req.user?.id);
    await (0, audit_service_1.auditFromRequest)(req, { action: 'auth.logout', category: 'security', summary: 'Signed out' });
    new apiResponse_1.ApiResponse(null, 'Logout successful').send(res);
});
exports.logout = logout;
const getCurrentUser = (0, asyncHandler_1.default)(async (req, res) => {
    new apiResponse_1.ApiResponse(req.user, 'Current user fetched').send(res);
});
exports.getCurrentUser = getCurrentUser;
const changePassword = (0, asyncHandler_1.default)(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, currentPassword, newPassword);
    new apiResponse_1.ApiResponse(null, 'Password updated successfully').send(res);
});
exports.changePassword = changePassword;
//# sourceMappingURL=auth.controller.js.map