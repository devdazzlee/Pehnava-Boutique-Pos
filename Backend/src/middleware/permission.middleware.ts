import { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { can, permissionLabel } from '../services/permissions.service';
import { auditFromRequest } from '../services/audit.service';

type KeyResolver = string | ((req: Request) => string | string[] | null | Promise<string | string[] | null>);

const decodeHeader = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    return Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    return null;
  }
};

/**
 * Lets the request through when the user's role has `key`. Otherwise, when
 * `approvable`, a manager can authorise it by sending their credentials in the
 * X-Approver-Email / X-Approver-Password headers (base64). The frontend shows a
 * "Manager approval" dialog automatically on a 403 APPROVAL_REQUIRED response.
 */
export function requirePermission(resolver: KeyResolver, opts: { approvable?: boolean } = { approvable: true }) {
  const approvable = opts.approvable !== false;
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const resolved = typeof resolver === 'function' ? await resolver(req) : resolver;
      const keys = (Array.isArray(resolved) ? resolved : resolved ? [resolved] : []).filter(Boolean);
      if (!keys.length) return next();
      if (!req.user) throw new AppError(401, 'Authentication required');

      const missing: string[] = [];
      for (const key of keys) if (!(await can(req.user.role, key))) missing.push(key);
      if (!missing.length) return next();

      const labels = missing.map(permissionLabel).join(', ');
      const email = decodeHeader(req.headers['x-approver-email']);
      const password = decodeHeader(req.headers['x-approver-password']);

      if (approvable && email && password) {
        const approver = await prisma.user.findUnique({
          where: { email: email.trim().toLowerCase() },
          select: { id: true, email: true, role: true, password: true, is_active: true },
        });
        const valid = approver && approver.is_active && (await bcrypt.compare(password, approver.password));
        if (!valid) {
          await auditFromRequest(req, {
            action: 'approval.denied',
            category: 'security',
            summary: `Manager approval failed for "${labels}" (wrong credentials for ${email})`,
            details: { permissions: missing, approverEmail: email, path: req.originalUrl },
          });
          throw new AppError(403, 'Manager email or password is incorrect', [
            { code: 'APPROVAL_INVALID', permission: missing[0], label: labels, message: 'Manager email or password is incorrect' },
          ]);
        }
        for (const key of missing) {
          if (!(await can(approver!.role, key))) {
            throw new AppError(403, `${approver!.email} is not allowed to approve "${permissionLabel(key)}"`, [
              { code: 'APPROVAL_INVALID', permission: key, label: permissionLabel(key), message: `${approver!.email} cannot approve this` },
            ]);
          }
        }
        if (approver!.id === req.user.id) {
          throw new AppError(403, 'You cannot approve your own action', [{ code: 'APPROVAL_INVALID', permission: missing[0], label: labels }]);
        }
        req.approval = { id: approver!.id, email: approver!.email, role: approver!.role, permission: missing.join(',') };
        await auditFromRequest(req, {
          action: 'approval.granted',
          category: 'security',
          summary: `${approver!.email} approved "${labels}"`,
          details: { permissions: missing, method: req.method, path: req.originalUrl },
        });
        return next();
      }

      throw new AppError(403, `Manager approval required: ${labels}`, [
        { code: 'APPROVAL_REQUIRED', permission: missing[0], permissions: missing, label: labels, message: `You need "${labels}" permission or a manager's approval.` },
      ]);
    } catch (error) {
      next(error);
    }
  };
}
