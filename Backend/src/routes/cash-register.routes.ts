import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/permission.middleware';
import { ApiResponse } from '../utils/apiResponse';
import { AppError } from '../utils/apiError';
import { businessTodayYmd } from '../utils/timezone';
import { CashRegisterService } from '../services/cash-register.service';

const service = new CashRegisterService();
const router = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next);

const send = (res: Response, status: number, data: unknown, message: string) => new ApiResponse(data, message, status).send(res);

const actor = (req: Request) => ({
  userId: req.user?.id,
  role: req.user?.role,
  branchId: req.user?.branch_id ?? null,
  approvalId: req.approval?.id ?? null,
});

const parse = <T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> => {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new AppError(400, r.error.issues[0]?.message || 'Invalid input', r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  }
  return r.data;
};

const money = z.coerce.number().min(0, 'Amount cannot be negative');
const counts = z.record(z.string(), z.coerce.number().min(0)).nullable().optional();
const note = z.string().trim().max(500).nullable().optional();

const openSchema = z.object({ branchId: z.string().uuid().optional(), opening: money, counts, note });
const cashInSchema = z.object({ amount: z.coerce.number().positive('Amount must be greater than 0'), reason: z.string().trim().min(2, 'Enter a reason').max(200) });
const handoverSchema = z.object({
  mode: z.enum(['HANDOVER', 'BREAK', 'RETURN', 'EMERGENCY']),
  endCount: money.nullable().optional(),
  note,
  incomingEmail: z.string().trim().optional(),
  incomingPassword: z.string().optional(),
});
const closeSchema = z.object({
  closing: money,
  counts,
  note,
  reconciliations: z
    .array(
      z.object({
        method: z.enum(['CARD', 'BANK_TRANSFER', 'MOBILE_MONEY']),
        actual: money,
        reference: z.string().trim().max(120).nullable().optional(),
        notes: z.string().trim().max(300).nullable().optional(),
      }),
    )
    .optional(),
});
const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Enter a reason') });
const reviewSchema = z.object({ note });
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reportSchema = z.object({
  from: ymd.optional(),
  to: ymd.optional(),
  branchId: z.string().uuid().optional(),
  status: z.enum(['ALL', 'PENDING', 'OPEN']).optional(),
});

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'CASHIER']));

router.get(
  '/status',
  wrap(async (req, res) => send(res, 200, await service.status(actor(req)), 'Register status')),
);

router.get(
  '/expected-opening',
  wrap(async (req, res) => {
    const branchId = (req.query.branchId as string) || req.user?.branch_id;
    send(res, 200, branchId ? await service.expectedOpening(branchId) : null, 'Expected opening');
  }),
);

router.get(
  '/reconciliation',
  requirePermission('reports.financial', { approvable: false }),
  wrap(async (req, res) => {
    const q = parse(reportSchema, req.query);
    const today = businessTodayYmd();
    send(res, 200, await service.reconciliation(actor(req), { from: q.from || today, to: q.to || q.from || today, branchId: q.branchId, status: q.status }),
      'Register reconciliation',
    );
  }),
);

router.get(
  '/sessions/:id',
  wrap(async (req, res) => send(res, 200, await service.detail(req.params.id), 'Register session')),
);

// Opening count differs from last night's closing → a supervisor signs off.
router.post(
  '/open',
  requirePermission(async (req) => {
    const body = parse(openSchema, req.body);
    const keys = ['register.operate'];
    if (await service.openNeedsApproval(actor(req), body)) keys.push('register.approve_variance');
    return keys;
  }),
  wrap(async (req, res) => send(res, 201, await service.open(actor(req), parse(openSchema, req.body)), 'Register opened')),
);

router.post(
  '/sessions/:id/cash-in',
  requirePermission('register.cash_in'),
  wrap(async (req, res) => send(res, 200, await service.cashIn(actor(req), req.params.id, parse(cashInSchema, req.body)), 'Cash added')),
);

router.post(
  '/sessions/:id/handover',
  requirePermission(async (req) => {
    const body = parse(handoverSchema, req.body);
    const keys = ['register.operate'];
    if (await service.handoverNeedsApproval(req.params.id, { mode: body.mode, endCount: body.endCount ?? undefined })) {
      keys.push('register.approve_variance');
    }
    return keys;
  }),
  wrap(async (req, res) => send(res, 200, await service.handover(actor(req), req.params.id, parse(handoverSchema, req.body)), 'Register updated')),
);

router.post(
  '/sessions/:id/close',
  requirePermission(async (req) => {
    const body = parse(closeSchema, req.body);
    const keys = ['register.operate'];
    if (await service.closeNeedsApproval(req.params.id, body.closing)) keys.push('register.approve_variance');
    return keys;
  }),
  wrap(async (req, res) => send(res, 200, await service.close(actor(req), req.params.id, parse(closeSchema, req.body)), 'Register closed')),
);

router.post(
  '/sessions/:id/review',
  requirePermission('register.approve_variance', { approvable: false }),
  wrap(async (req, res) => send(res, 200, await service.review(actor(req), req.params.id, parse(reviewSchema, req.body)), 'Register reviewed')),
);

router.post(
  '/sessions/:id/reopen',
  requirePermission('register.reopen'),
  wrap(async (req, res) => send(res, 200, await service.reopen(actor(req), req.params.id, parse(reasonSchema, req.body)), 'Register reopened')),
);

export default router;
