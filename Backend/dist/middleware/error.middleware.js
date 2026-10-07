"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const apiError_1 = require("../utils/apiError");
const logger_1 = require("../utils/logger");
const errorHandler = (err, req, res, next) => {
    let statusCode = 500;
    let message = 'Internal Server Error';
    let errors = [];
    if (err instanceof apiError_1.AppError) {
        statusCode = err.statusCode;
        message = err.message;
        errors = err.errors || [];
    }
    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Token expired';
        errors = [{ message: err.message }];
    }
    if (err.name === 'PrismaClientKnownRequestError') {
        const prismaErr = err;
        const meta = (prismaErr.meta || {});
        // Translate raw Prisma errors into user-friendly text. The default
        // `prismaErr.message` is the multi-line ``Invalid `prisma.x.delete()`
        // invocation`` wall of text which is useless to surface to an end user
        // — we extract the relevant constraint name and produce a short hint.
        if (prismaErr.code === 'P2002') {
            const target = meta.target;
            message = 'Unique constraint failed';
            errors = [{
                    message: `A record with this ${Array.isArray(target) ? target.join(', ') : target} already exists.`,
                    code: prismaErr.code,
                }];
            statusCode = 409;
        }
        else if (prismaErr.code === 'P2003') {
            // Foreign-key violation. Strip the `_fkey` / `_<col>_fkey` suffix from
            // the constraint name to point at the referencing table.
            const rawConstraint = String(meta.field_name || meta.constraint || '');
            const ref = rawConstraint
                .replace(/_[a-z_]+_fkey$/i, '')
                .replace(/_fkey$/i, '');
            message = ref
                ? `Cannot delete: still referenced by ${ref} records`
                : 'Cannot delete: record is still referenced by other data';
            errors = [{
                    message: ref
                        ? `This record has related rows in "${ref}". Remove or reassign those first, then try again.`
                        : 'This record has related rows in other tables. Remove or reassign those first.',
                    code: prismaErr.code,
                }];
            statusCode = 409;
        }
        else if (prismaErr.code === 'P2025') {
            message = 'Record not found';
            errors = [{
                    message: meta.cause || 'The record you requested does not exist or was already removed.',
                    code: prismaErr.code,
                }];
            statusCode = 404;
        }
        else {
            message = 'Database request error';
            errors = [{
                    message: prismaErr.message,
                    code: prismaErr.code,
                }];
            statusCode = 400;
        }
    }
    if (err.name === 'PrismaClientValidationError') {
        statusCode = 400;
        message = 'Invalid database query';
        errors = [{ message: err.message }];
    }
    if (err.name === 'PrismaClientInitializationError') {
        statusCode = 503;
        message = 'Database connection failed';
        errors = [{ message: err.message }];
    }
    if (process.env.NODE_ENV === 'development') {
        logger_1.logger.error(err.stack);
    }
    res.status(statusCode).json({
        success: false,
        message,
        errors,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=error.middleware.js.map