"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const zod_1 = require("zod");
const apiError_1 = require("../utils/apiError");
const validate = (schema) => {
    return async (req, res, next) => {
        try {
            await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                const errors = error.errors.map((err) => ({
                    path: err.path.join('.'),
                    message: err.message,
                }));
                next(new apiError_1.AppError(400, 'Validation failed', errors));
            }
            else {
                next(error);
            }
        }
    };
};
exports.validate = validate;
//# sourceMappingURL=validation.middleware.js.map