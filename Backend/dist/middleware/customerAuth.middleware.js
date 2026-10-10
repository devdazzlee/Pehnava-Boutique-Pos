"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateCustomer = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const app_1 = require("../config/app");
const apiError_1 = require("../utils/apiError");
// Pure JWT — no Redis session lookup. The earlier implementation rejected
// any request when the Redis key was missing, which is the single biggest
// source of "Session expired" complaints (Redis evictions, restarts, TTL).
const authenticateCustomer = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new apiError_1.AppError(401, 'Authentication required. Please provide a valid token.');
        }
        const token = authHeader.split(' ')[1];
        if (!token) {
            throw new apiError_1.AppError(401, 'Authentication required');
        }
        const decoded = jsonwebtoken_1.default.verify(token, app_1.config.jwtSecret);
        if (!decoded.id || !decoded.email) {
            throw new apiError_1.AppError(401, 'Invalid token structure');
        }
        req.customer = { id: decoded.id, email: decoded.email };
        next();
    }
    catch (error) {
        if (error instanceof apiError_1.AppError)
            return next(error);
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError || error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return next(new apiError_1.AppError(401, 'Invalid token'));
        }
        next(error);
    }
};
exports.authenticateCustomer = authenticateCustomer;
//# sourceMappingURL=customerAuth.middleware.js.map