"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple()),
        }),
    ],
});
exports.logger = logger;
// Only use file logging locally or on non-serverless platforms
if (process.env.VERCEL !== '1') {
    logger.add(new winston_1.default.transports.File({ filename: 'error.log', level: 'error' }));
    logger.add(new winston_1.default.transports.File({ filename: 'combined.log' }));
}
//# sourceMappingURL=logger.js.map