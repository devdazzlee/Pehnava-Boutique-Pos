"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const zod_1 = require("zod");
const auth_middleware_1 = require("../middleware/auth.middleware");
const permission_middleware_1 = require("../middleware/permission.middleware");
const apiResponse_1 = require("../utils/apiResponse");
const apiError_1 = require("../utils/apiError");
const period_lock_service_1 = require("../services/period-lock.service");
const finance_controls_service_1 = require("../services/finance-controls.service");
const periods = new period_lock_service_1.PeriodLockService();
const service = new finance_controls_service_1.FinanceControlsService();
const router = (0, express_1.Router)();
const receiptUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (/^image\/(jpe?g|png|webp|gif|heic|heif)$/.test(file.mimetype) || file.mimetype === 'application/pdf')
            return cb(null, true);
        cb(new apiError_1.AppError(400, 'Only photos (JPG, PNG, WEBP) or PDF files can be attached'));
    },
});
const wrap = (fn, message, status = 200) => (req, res, next) => fn(req)
    .then((data) => new apiResponse_1.ApiResponse(data, message, status).send(res))
    .catch(next);
const parse = (schema, data) => {
    const r = schema.safeParse(data);
    if (!r.success)
        throw new apiError_1.AppError(400, r.error.issues[0]?.message || 'Invalid input');
    return r.data;
};
const actor = (req) => ({ userId: req.user?.id, role: req.user?.role, branchId: req.user?.branch_id ?? null });
const ADMIN = new Set(['SUPER_ADMIN', 'ADMIN']);
const branchOf = (req, v) => (ADMIN.has(req.user?.role || '') ? (typeof v === 'string' && v && v !== 'all' ? v : null) : req.user?.branch_id ?? null);
const financial = (0, permission_middleware_1.requirePermission)('reports.financial', { approvable: false });
router.use(auth_middleware_1.authenticate);
/* ---------------- period closing ---------------- */
router.get('/periods', (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']), wrap(() => periods.status(), 'Period status'));
router.post('/periods/lock', (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']), (0, permission_middleware_1.requirePermission)('period.manage'), wrap(async (req) => {
    const b = parse(zod_1.z.object({ until: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'), note: zod_1.z.string().max(300).nullable().optional() }), req.body);
    return periods.lock(b.until, b.note, req.user?.id);
}, 'Books closed'));
router.post('/periods/:id/reopen', (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']), (0, permission_middleware_1.requirePermission)('period.manage'), wrap(async (req) => periods.reopen(req.params.id, parse(zod_1.z.object({ reason: zod_1.z.string().trim().min(3, 'Enter a reason') }), req.body).reason, req.user?.id), 'Period reopened'));
/* ---------------- budgets ---------------- */
const yearOf = (v) => {
    const y = Number(v) || new Date().getFullYear();
    if (y < 2000 || y > 2100)
        throw new apiError_1.AppError(400, 'Invalid year');
    return y;
};
router.get('/budgets', (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']), financial, wrap(async (req) => service.budgets(yearOf(req.query.year), branchOf(req, req.query.branchId)), 'Budgets'));
router.put('/budgets', (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']), financial, wrap(async (req) => {
    const b = parse(zod_1.z.object({
        year: zod_1.z.coerce.number().int(),
        branchId: zod_1.z.string().uuid().nullable().optional(),
        rows: zod_1.z.array(zod_1.z.object({ accountId: zod_1.z.string().uuid(), month: zod_1.z.coerce.number().int().min(1).max(12), amount: zod_1.z.coerce.number().min(0) })).max(2000),
    }), req.body);
    return service.saveBudgets(actor(req), { ...b, year: yearOf(b.year) });
}, 'Budget saved'));
router.post('/budgets/copy', (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']), financial, wrap(async (req) => {
    const b = parse(zod_1.z.object({ fromYear: zod_1.z.coerce.number().int(), toYear: zod_1.z.coerce.number().int(), branchId: zod_1.z.string().uuid().nullable().optional(), adjustPct: zod_1.z.coerce.number().min(-90).max(500).optional() }), req.body);
    return service.copyBudgets(actor(req), b);
}, 'Budget copied'));
router.get('/budget-vs-actual', (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']), financial, wrap(async (req) => service.budgetVsActual(actor(req), { year: yearOf(req.query.year), month: Number(req.query.month) || undefined, branchId: branchOf(req, req.query.branchId) }), 'Budget vs actual'));
/* ---------------- expense receipts ---------------- */
const expenseStaff = (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']);
router.get('/expenses/:id/attachments', expenseStaff, wrap(async (req) => service.attachments(req.params.id), 'Attachments'));
router.post('/expenses/:id/attachments', expenseStaff, receiptUpload.single('file'), wrap(async (req) => {
    if (!req.file)
        throw new apiError_1.AppError(400, 'Choose a file to attach');
    return service.addAttachment(actor(req), req.params.id, req.file);
}, 'Receipt attached', 201));
router.delete('/attachments/:id', expenseStaff, wrap(async (req) => service.removeAttachment(req.params.id), 'Attachment removed'));
/* ---------------- saved report views ---------------- */
router.get('/saved-reports', wrap(async (req) => service.savedReports(actor(req), typeof req.query.report === 'string' ? req.query.report : undefined), 'Saved views'));
router.post('/saved-reports', wrap(async (req) => {
    const b = parse(zod_1.z.object({ name: zod_1.z.string().trim().min(1).max(80), report: zod_1.z.string().min(1).max(60), params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()), isShared: zod_1.z.boolean().optional() }), req.body);
    return service.saveReport(actor(req), b);
}, 'View saved', 201));
router.delete('/saved-reports/:id', wrap(async (req) => service.deleteReport(actor(req), req.params.id), 'View deleted'));
exports.default = router;
//# sourceMappingURL=finance-controls.routes.js.map