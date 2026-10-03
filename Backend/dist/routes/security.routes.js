"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditRouter = exports.permissionsRouter = exports.usersRouter = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const permission_middleware_1 = require("../middleware/permission.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const apiResponse_1 = require("../utils/apiResponse");
const timezone_1 = require("../utils/timezone");
const audit_service_1 = require("../services/audit.service");
const permissions_service_1 = require("../services/permissions.service");
const ROLE_VALUES = permissions_service_1.ROLES.map((r) => r.role);
const roleLabel = (role) => permissions_service_1.ROLES.find((r) => r.role === role)?.label ?? role;
const PRIVILEGED = ['SUPER_ADMIN', 'ADMIN'];
/* ============================== users ============================== */
exports.usersRouter = (0, express_1.Router)();
exports.usersRouter.use(auth_middleware_1.authenticate, (0, permission_middleware_1.requirePermission)('users.manage', { approvable: false }));
const USER_SELECT = {
    id: true,
    email: true,
    name: true,
    role: true,
    is_active: true,
    last_login_at: true,
    created_at: true,
    branch: { select: { id: true, name: true, code: true } },
    employee: { select: { id: true, name: true } },
};
/** Only the owner may create, edit or promote owner / admin accounts. */
const guardPrivileged = (req, targetRole, nextRole) => {
    const actorIsOwner = req.user?.role === 'SUPER_ADMIN';
    if (actorIsOwner)
        return;
    if ((targetRole && PRIVILEGED.includes(targetRole)) || (nextRole && PRIVILEGED.includes(nextRole))) {
        throw new apiError_1.AppError(403, 'Only the owner can create or change Owner / Admin accounts');
    }
};
exports.usersRouter.get('/', (0, asyncHandler_1.default)(async (_req, res) => {
    const users = await client_1.prisma.user.findMany({ select: USER_SELECT, orderBy: [{ is_active: 'desc' }, { created_at: 'asc' }] });
    new apiResponse_1.ApiResponse({ users, roles: permissions_service_1.ROLES }, 'Users').send(res);
}));
const createUserSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().trim().toLowerCase().email('Enter a valid email / login'),
        name: zod_1.z.string().trim().max(80).optional(),
        password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
        role: zod_1.z.enum(ROLE_VALUES),
        branch_id: zod_1.z.string().uuid().nullable().optional(),
    }),
});
exports.usersRouter.post('/', (0, validation_middleware_1.validate)(createUserSchema), (0, asyncHandler_1.default)(async (req, res) => {
    const body = createUserSchema.shape.body.parse(req.body);
    guardPrivileged(req, null, body.role);
    if (await client_1.prisma.user.findUnique({ where: { email: body.email } }))
        throw new apiError_1.AppError(400, 'A user with this login already exists');
    const user = await client_1.prisma.user.create({
        data: {
            email: body.email,
            name: body.name || null,
            password: await bcryptjs_1.default.hash(body.password, 10),
            role: body.role,
            branch_id: body.branch_id || null,
        },
        select: USER_SELECT,
    });
    await (0, audit_service_1.auditFromRequest)(req, {
        action: 'user.create',
        category: 'security',
        entity: 'user',
        entityId: user.id,
        summary: `Created user ${user.email} as ${roleLabel(user.role)}${user.branch ? ` (${user.branch.name})` : ''}`,
    });
    new apiResponse_1.ApiResponse(user, 'User created', 201).send(res);
}));
const updateUserSchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().uuid() }),
    body: zod_1.z.object({
        name: zod_1.z.string().trim().max(80).nullable().optional(),
        role: zod_1.z.enum(ROLE_VALUES).optional(),
        branch_id: zod_1.z.string().uuid().nullable().optional(),
        is_active: zod_1.z.boolean().optional(),
        password: zod_1.z.string().min(6, 'Password must be at least 6 characters').optional(),
    }),
});
exports.usersRouter.patch('/:id', (0, validation_middleware_1.validate)(updateUserSchema), (0, asyncHandler_1.default)(async (req, res) => {
    const body = updateUserSchema.shape.body.parse(req.body);
    const existing = await client_1.prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, email: true, role: true, is_active: true, branch_id: true } });
    if (!existing)
        throw new apiError_1.AppError(404, 'User not found');
    guardPrivileged(req, existing.role, body.role);
    if (existing.id === req.user.id && (body.is_active === false || (body.role && body.role !== existing.role))) {
        throw new apiError_1.AppError(400, 'You cannot deactivate yourself or change your own role');
    }
    if (existing.role === 'SUPER_ADMIN' && ((body.role && body.role !== 'SUPER_ADMIN') || body.is_active === false)) {
        const owners = await client_1.prisma.user.count({ where: { role: 'SUPER_ADMIN', is_active: true } });
        if (owners <= 1)
            throw new apiError_1.AppError(400, 'Keep at least one active owner account');
    }
    const user = await client_1.prisma.user.update({
        where: { id: existing.id },
        data: {
            ...(body.name !== undefined ? { name: body.name || null } : {}),
            ...(body.role ? { role: body.role } : {}),
            ...(body.branch_id !== undefined ? { branch_id: body.branch_id || null } : {}),
            ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
            ...(body.password ? { password: await bcryptjs_1.default.hash(body.password, 10) } : {}),
        },
        select: USER_SELECT,
    });
    const changes = [];
    if (body.role && body.role !== existing.role)
        changes.push(`role ${roleLabel(existing.role)} → ${roleLabel(body.role)}`);
    if (body.is_active !== undefined && body.is_active !== existing.is_active)
        changes.push(body.is_active ? 'activated' : 'deactivated');
    if (body.branch_id !== undefined && body.branch_id !== existing.branch_id)
        changes.push(`branch → ${user.branch?.name ?? 'none'}`);
    if (body.password)
        changes.push('password reset');
    if (body.name !== undefined)
        changes.push('name');
    await (0, audit_service_1.auditFromRequest)(req, {
        action: body.role && body.role !== existing.role ? 'user.role_change' : 'user.update',
        category: 'security',
        entity: 'user',
        entityId: user.id,
        summary: `Updated ${user.email}: ${changes.join(', ') || 'no changes'}`,
    });
    new apiResponse_1.ApiResponse(user, 'User updated').send(res);
}));
/* ============================== permissions ============================== */
exports.permissionsRouter = (0, express_1.Router)();
exports.permissionsRouter.use(auth_middleware_1.authenticate);
/** The signed-in user's effective permissions (used to show/hide buttons). */
exports.permissionsRouter.get('/me', (0, asyncHandler_1.default)(async (req, res) => {
    new apiResponse_1.ApiResponse({ role: req.user.role, permissions: await (0, permissions_service_1.permissionsFor)(req.user.role) }, 'My permissions').send(res);
}));
exports.permissionsRouter.get('/', (0, permission_middleware_1.requirePermission)('users.manage', { approvable: false }), (0, asyncHandler_1.default)(async (_req, res) => {
    new apiResponse_1.ApiResponse(await (0, permissions_service_1.matrix)(), 'Permission matrix').send(res);
}));
const setSchema = zod_1.z.object({
    body: zod_1.z.object({ role: zod_1.z.enum(ROLE_VALUES), permission: zod_1.z.string(), allowed: zod_1.z.boolean() }),
});
exports.permissionsRouter.put('/', (0, validation_middleware_1.validate)(setSchema), (0, asyncHandler_1.default)(async (req, res) => {
    if (req.user.role !== 'SUPER_ADMIN')
        throw new apiError_1.AppError(403, 'Only the owner can change permissions');
    const body = setSchema.shape.body.parse(req.body);
    const result = await (0, permissions_service_1.setPermission)(body.role, body.permission, body.allowed, req.user.id);
    await (0, audit_service_1.auditFromRequest)(req, {
        action: 'permission.change',
        category: 'security',
        entity: 'permission',
        entityId: `${body.role}:${body.permission}`,
        summary: `${roleLabel(body.role)}: "${(0, permissions_service_1.permissionLabel)(body.permission)}" ${result.before ? 'allowed' : 'denied'} → ${body.allowed ? 'allowed' : 'denied'}`,
    });
    new apiResponse_1.ApiResponse(await (0, permissions_service_1.matrix)(), 'Permission updated').send(res);
}));
exports.permissionsRouter.post('/reset', (0, validation_middleware_1.validate)(zod_1.z.object({ body: zod_1.z.object({ role: zod_1.z.enum(ROLE_VALUES) }) })), (0, asyncHandler_1.default)(async (req, res) => {
    if (req.user.role !== 'SUPER_ADMIN')
        throw new apiError_1.AppError(403, 'Only the owner can change permissions');
    await (0, permissions_service_1.resetRole)(req.body.role);
    await (0, audit_service_1.auditFromRequest)(req, {
        action: 'permission.reset',
        category: 'security',
        entity: 'permission',
        entityId: req.body.role,
        summary: `Reset ${roleLabel(req.body.role)} permissions to defaults`,
    });
    new apiResponse_1.ApiResponse(await (0, permissions_service_1.matrix)(), 'Permissions reset').send(res);
}));
/* ============================== audit ============================== */
exports.auditRouter = (0, express_1.Router)();
exports.auditRouter.use(auth_middleware_1.authenticate);
const listSchema = zod_1.z.object({
    query: zod_1.z.object({
        from: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        user_id: zod_1.z.string().optional(),
        category: zod_1.z.string().optional(),
        action: zod_1.z.string().optional(),
        entity_id: zod_1.z.string().optional(),
        search: zod_1.z.string().optional(),
        page: zod_1.z.coerce.number().int().positive().optional(),
        limit: zod_1.z.coerce.number().int().positive().max(200).optional(),
    }),
});
exports.auditRouter.get('/', (0, permission_middleware_1.requirePermission)('audit.view', { approvable: false }), (0, validation_middleware_1.validate)(listSchema), (0, asyncHandler_1.default)(async (req, res) => {
    const q = listSchema.shape.query.parse(req.query);
    const range = q.from || q.to ? (0, timezone_1.localRange)(q.from || '2000-01-01', q.to || '2100-12-31') : null;
    const result = await (0, audit_service_1.listAudit)({
        from: range?.start,
        to: range?.end,
        userId: q.user_id,
        category: q.category,
        action: q.action,
        entityId: q.entity_id,
        search: q.search,
        page: q.page,
        limit: q.limit,
    });
    new apiResponse_1.ApiResponse(result, 'Audit trail').send(res);
}));
/** Client-side events the server cannot see: report exports, PDF downloads, prints. */
const eventSchema = zod_1.z.object({
    body: zod_1.z.object({
        action: zod_1.z.string().regex(/^(report|print|export|ui)\.[a-z0-9_.-]+$/i, 'Unsupported event'),
        summary: zod_1.z.string().min(1).max(300),
        details: zod_1.z.record(zod_1.z.unknown()).optional(),
    }),
});
exports.auditRouter.post('/event', (0, validation_middleware_1.validate)(eventSchema), (0, asyncHandler_1.default)(async (req, res) => {
    const body = eventSchema.shape.body.parse(req.body);
    await (0, audit_service_1.auditFromRequest)(req, {
        action: body.action,
        category: 'reports',
        summary: body.summary,
        details: body.details ?? null,
    });
    new apiResponse_1.ApiResponse(null, 'Logged').send(res);
}));
//# sourceMappingURL=security.routes.js.map