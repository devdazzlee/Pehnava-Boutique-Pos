"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ override: true });
const config = {
    port: parseInt(process.env.PORT || '5000'),
    env: process.env.NODE_ENV || 'development',
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    cookieExpiresIn: parseInt(process.env.COOKIE_EXPIRES_IN || '86400000'),
};
exports.config = config;
//# sourceMappingURL=app.js.map