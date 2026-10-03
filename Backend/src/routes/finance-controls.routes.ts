import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/permission.middleware';
import { ApiResponse } from '../utils/apiResponse';
import { AppError } from '../utils/apiError';
import { PeriodLockService } from '../services/period-lock.service';
import { FinanceControlsService } from '../services/finance-controls.service';

const periods = new PeriodLockService();
const service = new FinanceControlsService();
const router = Router();

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|gif|heic|heif)$/.test(file.mimetype) || file.mimetype === 'application/pdf') return cb(null, true);
    cb(new AppError(400, 'Only photos (JPG, PNG, WEBP) or PDF files can be attached'));
  },
});

const wrap = (fn: (req: Request) => Promise<unknown>, message: string, status = 200) => (req: Request, res: Response, next: NextFunction) =>
  fn(req)
    .then((data) => new ApiResponse(data, message, status).send(res))
    .catch(next);

const parse = <T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> => {
  const r = schema.safeParse(data);
  if (!r.success) throw new AppError(400, r.error.issues[0]?.message || 'Invalid input');
  return r.data;
};

const actor = (req: Request) => ({ userId: req.user?.id, role: req.user?.role, branchId: req.user?.branch_id ?? null });
const ADMIN = new Set(['SUPER_ADMIN', 'ADMIN']);
const branchOf = (req: Request, v: unknown) => (ADMIN.has(req.user?.role || '') ? (typeof v === 'string' && v && v !== 'all' ? v : null) : req.user?.branch_id ?? null);
const financial = requirePermission('reports.financial', { approvable: false });

router.use(authenticate);

/* ---------------- period closing ---------------- */
router.get('/periods', authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']), wrap(() => periods.status(), 'Period status'));
router.post(
  '/periods/lock',
  authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']),
  requirePermission('period.manage'),
  wrap(async (req) => {
    const b = parse(z.object({ until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'), note: z.string().max(300).nullable().optional() }), req.body);
    return periods.lock(b.until, b.note, req.user?.id);
  }, 'Books closed'),
);
router.post(
  '/periods/:id/reopen',
  authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']),
  requirePermission('period.manage'),
  wrap(async (req) => periods.reopen(req.params.id, parse(z.object({ reason: z.string().trim().min(3, 'Enter a reason') }), req.body).reason, req.user?.id), 'Period reopened'),
);

/* ---------------- budgets ---------------- */
const yearOf = (v: unknown) => {
  const y = Number(v) || new Date().getFullYear();
  if (y < 2000 || y > 2100) throw new AppError(400, 'Invalid year');
  return y;
};
router.get('/budgets', authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']), financial, wrap(async (req) => service.budgets(yearOf(req.query.year), branchOf(req, req.query.branchId)), 'Budgets'));
router.put(
  '/budgets',
  authorize(['SUPER_ADMIN', 'ADMIN']),
  financial,
  wrap(async (req) => {
    const b = parse(
      z.object({
        year: z.coerce.number().int(),
        branchId: z.string().uuid().nullable().optional(),
        rows: z.array(z.object({ accountId: z.string().uuid(), month: z.coerce.number().int().min(1).max(12), amount: z.coerce.number().min(0) })).max(2000),
      }),
      req.body,
    );
    return service.saveBudgets(actor(req), { ...b, year: yearOf(b.year) });
  }, 'Budget saved'),
);
router.post(
  '/budgets/copy',
  authorize(['SUPER_ADMIN', 'ADMIN']),
  financial,
  wrap(async (req) => {
    const b = parse(
      z.object({ fromYear: z.coerce.number().int(), toYear: z.coerce.number().int(), branchId: z.string().uuid().nullable().optional(), adjustPct: z.coerce.number().min(-90).max(500).optional() }),
      req.body,
    );
    return service.copyBudgets(actor(req), b);
  }, 'Budget copied'),
);
router.get(
  '/budget-vs-actual',
  authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']),
  financial,
  wrap(async (req) => service.budgetVsActual(actor(req), { year: yearOf(req.query.year), month: Number(req.query.month) || undefined, branchId: branchOf(req, req.query.branchId) }), 'Budget vs actual'),
);

/* ---------------- expense receipts ---------------- */
const expenseStaff = authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']);
router.get('/expenses/:id/attachments', expenseStaff, wrap(async (req) => service.attachments(req.params.id), 'Attachments'));
router.post(
  '/expenses/:id/attachments',
  expenseStaff,
  receiptUpload.single('file'),
  wrap(async (req) => {
    if (!req.file) throw new AppError(400, 'Choose a file to attach');
    return service.addAttachment(actor(req), req.params.id, req.file);
  }, 'Receipt attached', 201),
);
router.delete('/attachments/:id', expenseStaff, wrap(async (req) => service.removeAttachment(req.params.id), 'Attachment removed'));

/* ---------------- saved report views ---------------- */
router.get('/saved-reports', wrap(async (req) => service.savedReports(actor(req), typeof req.query.report === 'string' ? req.query.report : undefined), 'Saved views'));
router.post(
  '/saved-reports',
  wrap(async (req) => {
    const b = parse(
      z.object({ name: z.string().trim().min(1).max(80), report: z.string().min(1).max(60), params: z.record(z.string(), z.unknown()), isShared: z.boolean().optional() }),
      req.body,
    );
    return service.saveReport(actor(req), b);
  }, 'View saved', 201),
);
router.delete('/saved-reports/:id', wrap(async (req) => service.deleteReport(actor(req), req.params.id), 'View deleted'));

export default router;
