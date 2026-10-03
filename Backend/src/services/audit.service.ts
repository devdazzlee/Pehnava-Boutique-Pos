import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../prisma/client';

/* ============================================================
 * Audit trail. Every mutating API call is recorded by the
 * auditTrail middleware; services/controllers add explicit
 * entries for events that need a richer description.
 * ============================================================ */

export type AuditEntry = {
  action: string;
  category: string;
  summary: string;
  entity?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  userId?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  branchId?: string | null;
  approvedById?: string | null;
  approvedByEmail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  statusCode?: number | null;
};

const SECRET_KEYS = /pass(word)?|token|secret|pin|otp/i;

/** Removes secrets and huge blobs (images) before storing request data. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 4) return '[…]';
  if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 120)}… (${value.length} chars)` : value;
  if (Array.isArray(value)) {
    const items = value.slice(0, 25).map((v) => sanitize(v, depth + 1));
    return value.length > 25 ? [...items, `… ${value.length - 25} more`] : items;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.test(k)) {
        out[k] = '••••';
        continue;
      }
      if (/image|photo|base64/i.test(k) && typeof v === 'string' && v.length > 100) {
        out[k] = '[image]';
        continue;
      }
      out[k] = sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Request with the fields set by the auth / permission middleware (kept local so this module stands alone). */
type AuthedRequest = Request & {
  user?: { id: string; role: string; branch_id?: string; email?: string };
  approval?: { id: string; email: string };
};

export function requestMeta(req: Request) {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
  return { ip, userAgent: (req.headers['user-agent'] as string | undefined)?.slice(0, 250) ?? null };
}

const emailCache = new Map<string, string>();
async function emailOf(userId?: string | null) {
  if (!userId) return null;
  if (emailCache.has(userId)) return emailCache.get(userId)!;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (u) emailCache.set(userId, u.email);
  return u?.email ?? null;
}

/** Writes an audit entry. Never throws — auditing must not break the action itself. */
export async function audit(entry: AuditEntry) {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        category: entry.category,
        summary: entry.summary.slice(0, 500),
        entity: entry.entity ?? null,
        entity_id: entry.entityId ?? null,
        details: entry.details ? (sanitize(entry.details) as Prisma.InputJsonValue) : undefined,
        user_id: entry.userId ?? null,
        user_email: entry.userEmail ?? (await emailOf(entry.userId)),
        user_role: entry.userRole ?? null,
        branch_id: entry.branchId ?? null,
        approved_by_id: entry.approvedById ?? null,
        approved_by_email: entry.approvedByEmail ?? null,
        ip: entry.ip ?? null,
        user_agent: entry.userAgent ?? null,
        status_code: entry.statusCode ?? null,
      },
    });
  } catch (error) {
    console.error('[audit] failed to record entry', entry.action, (error as Error).message);
  }
}

/** Convenience for controllers: fills user / approval / client details from the request. */
export function auditFromRequest(req: AuthedRequest, entry: Omit<AuditEntry, 'userId' | 'userRole' | 'branchId' | 'ip' | 'userAgent'>) {
  const meta = requestMeta(req);
  return audit({
    ...entry,
    userId: req.user?.id ?? null,
    userRole: req.user?.role ?? null,
    branchId: req.user?.branch_id ?? null,
    approvedById: entry.approvedById ?? req.approval?.id ?? null,
    approvedByEmail: entry.approvedByEmail ?? req.approval?.email ?? null,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

export async function listAudit(q: {
  from?: Date;
  to?: Date;
  userId?: string;
  category?: string;
  action?: string;
  entityId?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, q.page || 1);
  const limit = Math.min(200, Math.max(1, q.limit || 50));
  const where: Prisma.AuditLogWhereInput = {
    ...(q.from || q.to ? { created_at: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    ...(q.userId ? { user_id: q.userId } : {}),
    ...(q.category ? { category: q.category } : {}),
    ...(q.action ? { action: { startsWith: q.action } } : {}),
    ...(q.entityId ? { entity_id: q.entityId } : {}),
    ...(q.search?.trim()
      ? {
          OR: [
            { summary: { contains: q.search.trim(), mode: 'insensitive' } },
            { user_email: { contains: q.search.trim(), mode: 'insensitive' } },
            { action: { contains: q.search.trim(), mode: 'insensitive' } },
            { entity_id: q.search.trim() },
          ],
        }
      : {}),
  };
  const [rows, total, byCategory, users] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { created_at: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ['category'], where: { ...where, category: undefined }, _count: { _all: true } }),
    prisma.auditLog.findMany({
      where: { user_id: { not: null } },
      distinct: ['user_id'],
      select: { user_id: true, user_email: true },
      orderBy: { created_at: 'desc' },
      take: 200,
    }),
  ]);
  return {
    data: rows,
    meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
    categories: byCategory.map((c) => ({ category: c.category, count: c._count._all })).sort((a, b) => b.count - a.count),
    users: users.map((u) => ({ id: u.user_id, email: u.user_email })),
  };
}
