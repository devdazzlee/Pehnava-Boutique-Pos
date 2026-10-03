import { Request, Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { z } from 'zod';
import asyncHandler from '../middleware/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/permission.middleware';
import { validate } from '../middleware/validation.middleware';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { ApiResponse } from '../utils/apiResponse';
import { localRange } from '../utils/timezone';
import { auditFromRequest, listAudit } from '../services/audit.service';
import { ROLES, matrix, permissionLabel, permissionsFor, resetRole, setPermission } from '../services/permissions.service';

const ROLE_VALUES = ROLES.map((r) => r.role) as [Role, ...Role[]];
const roleLabel = (role: string) => ROLES.find((r) => r.role === role)?.label ?? role;
const PRIVILEGED: Role[] = ['SUPER_ADMIN', 'ADMIN'];

/* ============================== users ============================== */

export const usersRouter = Router();
usersRouter.use(authenticate, requirePermission('users.manage', { approvable: false }));

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
} as const;

/** Only the owner may create, edit or promote owner / admin accounts. */
const guardPrivileged = (req: Request, targetRole?: string | null, nextRole?: string | null) => {
  const actorIsOwner = req.user?.role === 'SUPER_ADMIN';
  if (actorIsOwner) return;
  if ((targetRole && PRIVILEGED.includes(targetRole as Role)) || (nextRole && PRIVILEGED.includes(nextRole as Role))) {
    throw new AppError(403, 'Only the owner can create or change Owner / Admin accounts');
  }
};

usersRouter.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const users = await prisma.user.findMany({ select: USER_SELECT, orderBy: [{ is_active: 'desc' }, { created_at: 'asc' }] });
    new ApiResponse({ users, roles: ROLES }, 'Users').send(res);
  }),
);

const createUserSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email('Enter a valid email / login'),
    name: z.string().trim().max(80).optional(),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    role: z.enum(ROLE_VALUES),
    branch_id: z.string().uuid().nullable().optional(),
  }),
});

usersRouter.post(
  '/',
  validate(createUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = createUserSchema.shape.body.parse(req.body);
    guardPrivileged(req, null, body.role);
    if (await prisma.user.findUnique({ where: { email: body.email } })) throw new AppError(400, 'A user with this login already exists');
    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name || null,
        password: await bcrypt.hash(body.password, 10),
        role: body.role,
        branch_id: body.branch_id || null,
      },
      select: USER_SELECT,
    });
    await auditFromRequest(req, {
      action: 'user.create',
      category: 'security',
      entity: 'user',
      entityId: user.id,
      summary: `Created user ${user.email} as ${roleLabel(user.role)}${user.branch ? ` (${user.branch.name})` : ''}`,
    });
    new ApiResponse(user, 'User created', 201).send(res);
  }),
);

const updateUserSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().trim().max(80).nullable().optional(),
    role: z.enum(ROLE_VALUES).optional(),
    branch_id: z.string().uuid().nullable().optional(),
    is_active: z.boolean().optional(),
    password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  }),
});

usersRouter.patch(
  '/:id',
  validate(updateUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = updateUserSchema.shape.body.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, email: true, role: true, is_active: true, branch_id: true } });
    if (!existing) throw new AppError(404, 'User not found');
    guardPrivileged(req, existing.role, body.role);
    if (existing.id === req.user!.id && (body.is_active === false || (body.role && body.role !== existing.role))) {
      throw new AppError(400, 'You cannot deactivate yourself or change your own role');
    }
    if (existing.role === 'SUPER_ADMIN' && ((body.role && body.role !== 'SUPER_ADMIN') || body.is_active === false)) {
      const owners = await prisma.user.count({ where: { role: 'SUPER_ADMIN', is_active: true } });
      if (owners <= 1) throw new AppError(400, 'Keep at least one active owner account');
    }
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name || null } : {}),
        ...(body.role ? { role: body.role } : {}),
        ...(body.branch_id !== undefined ? { branch_id: body.branch_id || null } : {}),
        ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
        ...(body.password ? { password: await bcrypt.hash(body.password, 10) } : {}),
      },
      select: USER_SELECT,
    });
    const changes: string[] = [];
    if (body.role && body.role !== existing.role) changes.push(`role ${roleLabel(existing.role)} → ${roleLabel(body.role)}`);
    if (body.is_active !== undefined && body.is_active !== existing.is_active) changes.push(body.is_active ? 'activated' : 'deactivated');
    if (body.branch_id !== undefined && body.branch_id !== existing.branch_id) changes.push(`branch → ${user.branch?.name ?? 'none'}`);
    if (body.password) changes.push('password reset');
    if (body.name !== undefined) changes.push('name');
    await auditFromRequest(req, {
      action: body.role && body.role !== existing.role ? 'user.role_change' : 'user.update',
      category: 'security',
      entity: 'user',
      entityId: user.id,
      summary: `Updated ${user.email}: ${changes.join(', ') || 'no changes'}`,
    });
    new ApiResponse(user, 'User updated').send(res);
  }),
);

/* ============================== permissions ============================== */

export const permissionsRouter = Router();
permissionsRouter.use(authenticate);

/** The signed-in user's effective permissions (used to show/hide buttons). */
permissionsRouter.get(
  '/me',
  asyncHandler(async (req: Request, res: Response) => {
    new ApiResponse({ role: req.user!.role, permissions: await permissionsFor(req.user!.role) }, 'My permissions').send(res);
  }),
);

permissionsRouter.get(
  '/',
  requirePermission('users.manage', { approvable: false }),
  asyncHandler(async (_req: Request, res: Response) => {
    new ApiResponse(await matrix(), 'Permission matrix').send(res);
  }),
);

const setSchema = z.object({
  body: z.object({ role: z.enum(ROLE_VALUES), permission: z.string(), allowed: z.boolean() }),
});

permissionsRouter.put(
  '/',
  validate(setSchema),
  asyncHandler(async (req: Request, res: Response) => {
    if (req.user!.role !== 'SUPER_ADMIN') throw new AppError(403, 'Only the owner can change permissions');
    const body = setSchema.shape.body.parse(req.body);
    const result = await setPermission(body.role, body.permission, body.allowed, req.user!.id);
    await auditFromRequest(req, {
      action: 'permission.change',
      category: 'security',
      entity: 'permission',
      entityId: `${body.role}:${body.permission}`,
      summary: `${roleLabel(body.role)}: "${permissionLabel(body.permission)}" ${result.before ? 'allowed' : 'denied'} → ${body.allowed ? 'allowed' : 'denied'}`,
    });
    new ApiResponse(await matrix(), 'Permission updated').send(res);
  }),
);

permissionsRouter.post(
  '/reset',
  validate(z.object({ body: z.object({ role: z.enum(ROLE_VALUES) }) })),
  asyncHandler(async (req: Request, res: Response) => {
    if (req.user!.role !== 'SUPER_ADMIN') throw new AppError(403, 'Only the owner can change permissions');
    await resetRole(req.body.role);
    await auditFromRequest(req, {
      action: 'permission.reset',
      category: 'security',
      entity: 'permission',
      entityId: req.body.role,
      summary: `Reset ${roleLabel(req.body.role)} permissions to defaults`,
    });
    new ApiResponse(await matrix(), 'Permissions reset').send(res);
  }),
);

/* ============================== audit ============================== */

export const auditRouter = Router();
auditRouter.use(authenticate);

const listSchema = z.object({
  query: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    user_id: z.string().optional(),
    category: z.string().optional(),
    action: z.string().optional(),
    entity_id: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
  }),
});

auditRouter.get(
  '/',
  requirePermission('audit.view', { approvable: false }),
  validate(listSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const q = listSchema.shape.query.parse(req.query);
    const range = q.from || q.to ? localRange(q.from || '2000-01-01', q.to || '2100-12-31') : null;
    const result = await listAudit({
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
    new ApiResponse(result, 'Audit trail').send(res);
  }),
);

/** Client-side events the server cannot see: report exports, PDF downloads, prints. */
const eventSchema = z.object({
  body: z.object({
    action: z.string().regex(/^(report|print|export|ui)\.[a-z0-9_.-]+$/i, 'Unsupported event'),
    summary: z.string().min(1).max(300),
    details: z.record(z.unknown()).optional(),
  }),
});

auditRouter.post(
  '/event',
  validate(eventSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = eventSchema.shape.body.parse(req.body);
    await auditFromRequest(req, {
      action: body.action,
      category: 'reports',
      summary: body.summary,
      details: body.details ?? null,
    });
    new ApiResponse(null, 'Logged').send(res);
  }),
);
