"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUniqueFilename = void 0;
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
/**
 * Generates a unique filename with optional format conversion
 * @param originalName Original filename
 * @param targetFormat Optional target format (e.g., 'webp', 'jpg')
 * @returns Unique filename with proper extension
 */
const generateUniqueFilename = (originalName, targetFormat) => {
    if (!originalName || typeof originalName !== 'string') {
        throw new Error('Original name must be a non-empty string');
    }
    const allowedFormats = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
    if (targetFormat && !allowedFormats.has(targetFormat.toLowerCase())) {
        throw new Error(`Unsupported target format: ${targetFormat}`);
    }
    // Remove any query strings or hashes from the filename
    const cleanName = originalName.split('?')[0].split('#')[0];
    // Get the original extension (without dot)
    const originalExt = path_1.default.extname(cleanName).slice(1).toLowerCase();
    // Determine the final extension
    const finalExt = targetFormat?.toLowerCase() || originalExt;
    // Generate the unique filename
    return `${(0, uuid_1.v4)()}.${finalExt}`;
};
exports.generateUniqueFilename = generateUniqueFilename;
//# sourceMappingURL=filename.js.map