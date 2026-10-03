"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePermission = requirePermission;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const permissions_service_1 = require("../services/permissions.service");
const audit_service_1 = require("../services/audit.service");
const decodeHeader = (value) => {
    const raw = Array.isArray(value) ? value[0] : value;
    if (!raw)
        return null;
    try {
        return Buffer.from(raw, 'base64').toString('utf8');
    }
    catch {
        return null;
    }
};
/**
 * Lets the request through when the user's role has `key`. Otherwise, when
 * `approvable`, a manager can authorise it by sending their credentials in the
 * X-Approver-Email / X-Approver-Password headers (base64). The frontend shows a
 * "Manager approval" dialog automatically on a 403 APPROVAL_REQUIRED response.
 */
function requirePermission(resolver, opts = { approvable: true }) {
    const approvable = opts.approvable !== false;
    return async (req, _res, next) => {
        try {
            const resolved = typeof resolver === 'function' ? await resolver(req) : resolver;
            const keys = (Array.isArray(resolved) ? resolved : resolved ? [resolved] : []).filter(Boolean);
            if (!keys.length)
                return next();
            if (!req.user)
                throw new apiError_1.AppError(401, 'Authentication required');
            const missing = [];
            for (const key of keys)
                if (!(await (0, permissions_service_1.can)(req.user.role, key)))
                    missing.push(key);
            if (!missing.length)
                return next();
            const labels = missing.map(permissions_service_1.permissionLabel).join(', ');
            const email = decodeHeader(req.headers['x-approver-email']);
            const password = decodeHeader(req.headers['x-approver-password']);
            if (approvable && email && password) {
                const approver = await client_1.prisma.user.findUnique({
                    where: { email: email.trim().toLowerCase() },
                    select: { id: true, email: true, role: true, password: true, is_active: true },
                });
                const valid = approver && approver.is_active && (await bcryptjs_1.default.compare(password, approver.password));
                if (!valid) {
                    await (0, audit_service_1.auditFromRequest)(req, {
                        action: 'approval.denied',
                        category: 'security',
                        summary: `Manager approval failed for "${labels}" (wrong credentials for ${email})`,
                        details: { permissions: missing, approverEmail: email, path: req.originalUrl },
                    });
                    throw new apiError_1.AppError(403, 'Manager email or password is incorrect', [
                        { code: 'APPROVAL_INVALID', permission: missing[0], label: labels, message: 'Manager email or password is incorrect' },
                    ]);
                }
                for (const key of missing) {
                    if (!(await (0, permissions_service_1.can)(approver.role, key))) {
                        throw new apiError_1.AppError(403, `${approver.email} is not allowed to approve "${(0, permissions_service_1.permissionLabel)(key)}"`, [
                            { code: 'APPROVAL_INVALID', permission: key, label: (0, permissions_service_1.permissionLabel)(key), message: `${approver.email} cannot approve this` },
                        ]);
                    }
                }
                if (approver.id === req.user.id) {
                    throw new apiError_1.AppError(403, 'You cannot approve your own action', [{ code: 'APPROVAL_INVALID', permission: missing[0], label: labels }]);
                }
                req.approval = { id: approver.id, email: approver.email, role: approver.role, permission: missing.join(',') };
                await (0, audit_service_1.auditFromRequest)(req, {
                    action: 'approval.granted',
                    category: 'security',
                    summary: `${approver.email} approved "${labels}"`,
                    details: { permissions: missing, method: req.method, path: req.originalUrl },
                });
                return next();
            }
            throw new apiError_1.AppError(403, `Manager approval required: ${labels}`, [
                { code: 'APPROVAL_REQUIRED', permission: missing[0], permissions: missing, label: labels, message: `You need "${labels}" permission or a manager's approval.` },
            ]);
        }
        catch (error) {
            next(error);
        }
    };
}
//# sourceMappingURL=permission.middleware.js.map