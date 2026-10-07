"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = void 0;
const apiError_1 = require("../utils/apiError");
const notFoundHandler = (req, res, next) => {
    next(new apiError_1.AppError(404, `Not Found - ${req.originalUrl}`));
};
exports.notFoundHandler = notFoundHandler;
//# sourceMappingURL=not-found.middleware.js.map