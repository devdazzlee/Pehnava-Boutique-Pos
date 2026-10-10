"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const app_1 = require("../config/app");
const apiError_1 = require("../utils/apiError");
const client_1 = require("../prisma/client");
// Pure JWT auth — no server-side session store. The signed token is the
// session. Tokens are issued without expiry (see auth.service.ts), so a user
// stays logged in until they explicitly clear the token on the client.
const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            throw new apiError_1.AppError(401, 'Authentication required');
        }
        const decoded = jsonwebtoken_1.default.verify(token, app_1.config.jwtSecret);
        // Verify the user still exists. Tokens never expire on their own, so a
        // user who was deleted (or a DB reseed) leaves the client holding a JWT
        // whose `id` doesn't match a User row — every subsequent write that
        // stores `created_by` would FK-violate. Reject the request cleanly so
        // the client can drop the stale token and prompt a fresh login.
        const userExists = await client_1.prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, role: true, branch_id: true, email: true, is_active: true },
        });
        if (!userExists) {
            throw new apiError_1.AppError(401, 'Session expired, please log in again');
        }
        if (!userExists.is_active) {
            throw new apiError_1.AppError(401, 'This account has been deactivated. Contact the owner.');
        }
        // Role / branch come from the database so changes apply immediately (tokens never expire).
        req.user = {
            id: userExists.id,
            role: userExists.role,
            branch_id: userExists.branch_id ?? undefined,
            email: userExists.email,
        };
        next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError || error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return next(new apiError_1.AppError(401, 'Invalid token'));
        }
        next(error);
    }
};
exports.authenticate = authenticate;
const authorize = (roles) => {
    return (req, res, next) => {
        const role = req.user?.role;
        // A supervisor can reach everything a branch manager can; permissions then narrow it down.
        const allowed = !!role && (roles.includes(role) || (role === 'SUPERVISOR' && roles.includes('BRANCH_MANAGER')));
        if (!allowed) {
            return next(new apiError_1.AppError(403, 'Unauthorized access'));
        }
        next();
    };
};
exports.authorize = authorize;
//# sourceMappingURL=auth.middleware.js.map