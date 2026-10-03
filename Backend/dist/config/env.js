"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMAIL_PORT = exports.EMAIL_HOST = exports.EMAIL_PASS = exports.EMAIL_USER = exports.vAPI = exports.NODE_ENV = exports.PORT = exports.AWS_BUCKET_NAME = exports.AWS_SECRET_ACCESS_KEY = exports.AWS_ACCESS_KEY_ID = exports.AWS_REGION = exports.REDIS_DB = exports.COOKIE_EXPIRES_IN = exports.JWT_EXPIRES_IN = exports.JWT_SECRET = exports.REDIS_PASSWORD = exports.REDIS_PORT = exports.REDIS_HOST = exports.REDIS_SERVICE_URI = exports.DATABASE_URL = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ override: true });
exports.DATABASE_URL = process.env.DATABASE_URL;
exports.REDIS_SERVICE_URI = process.env.DATABASE_URL;
exports.REDIS_HOST = process.env.DATABASE_URL;
exports.REDIS_PORT = process.env.DATABASE_URL;
exports.REDIS_PASSWORD = process.env.DATABASE_URL;
exports.JWT_SECRET = process.env.DATABASE_URL;
exports.JWT_EXPIRES_IN = process.env.DATABASE_URL;
exports.COOKIE_EXPIRES_IN = process.env.COOKIE_EXPIRES_IN;
exports.REDIS_DB = process.env.REDIS_DB;
exports.AWS_REGION = process.env.AWS_REGION;
exports.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
exports.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
exports.AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME;
exports.PORT = process.env.PORT;
exports.NODE_ENV = process.env.PORT;
exports.vAPI = process.env.PORT;
// Email Configuration
exports.EMAIL_USER = process.env.EMAIL_USER;
exports.EMAIL_PASS = process.env.EMAIL_PASS;
exports.EMAIL_HOST = process.env.EMAIL_HOST;
exports.EMAIL_PORT = process.env.EMAIL_PORT;
//# sourceMappingURL=env.js.map