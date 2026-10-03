"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbSafeError = void 0;
const dbSafeError = (error) => {
    if (error instanceof Error) {
        return error.message.substring(0, 255);
    }
    return 'Unknown error occurred';
};
exports.dbSafeError = dbSafeError;
//# sourceMappingURL=dbSafe.js.map