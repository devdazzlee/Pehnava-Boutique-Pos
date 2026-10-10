"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_middleware_1 = require("../middleware/auth.middleware");
const permission_middleware_1 = require("../middleware/permission.middleware");
const apiResponse_1 = require("../utils/apiResponse");
const apiError_1 = require("../utils/apiError");
const timezone_1 = require("../utils/timezone");
const cash_register_service_1 = require("../services/cash-register.service");
const service = new cash_register_service_1.CashRegisterService();
const router = (0, express_1.Router)();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const send = (res, status, data, message) => new apiResponse_1.ApiResponse(data, message, status).send(res);
const actor = (req) => ({
    userId: req.user?.id,
    role: req.user?.role,
    branchId: req.user?.branch_id ?? null,
    approvalId: req.approval?.id ?? null,
});
const parse = (schema, data) => {
    const r = schema.safeParse(data);
    if (!r.success) {
        throw new apiError_1.AppError(400, r.error.issues[0]?.message || 'Invalid input', r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    return r.data;
};
const money = zod_1.z.coerce.number().min(0, 'Amount cannot be negative');
const counts = zod_1.z.record(zod_1.z.string(), zod_1.z.coerce.number().min(0)).nullable().optional();
const note = zod_1.z.string().trim().max(500).nullable().optional();
const openSchema = zod_1.z.object({ branchId: zod_1.z.string().uuid().optional(), opening: money, counts, note });
const cashInSchema = zod_1.z.object({ amount: zod_1.z.coerce.number().positive('Amount must be greater than 0'), reason: zod_1.z.string().trim().min(2, 'Enter a reason').max(200) });
const handoverSchema = zod_1.z.object({
    mode: zod_1.z.enum(['HANDOVER', 'BREAK', 'RETURN', 'EMERGENCY']),
    endCount: money.nullable().optional(),
    note,
    incomingEmail: zod_1.z.string().trim().optional(),
    incomingPassword: zod_1.z.string().optional(),
});
const closeSchema = zod_1.z.object({
    closing: money,
    counts,
    note,
    reconciliations: zod_1.z
        .array(zod_1.z.object({
        method: zod_1.z.enum(['CARD', 'BANK_TRANSFER', 'MOBILE_MONEY']),
        actual: money,
        reference: zod_1.z.string().trim().max(120).nullable().optional(),
        notes: zod_1.z.string().trim().max(300).nullable().optional(),
    }))
        .optional(),
});
const reasonSchema = zod_1.z.object({ reason: zod_1.z.string().trim().min(3, 'Enter a reason') });
const reviewSchema = zod_1.z.object({ note });
const ymd = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reportSchema = zod_1.z.object({
    from: ymd.optional(),
    to: ymd.optional(),
    branchId: zod_1.z.string().uuid().optional(),
    status: zod_1.z.enum(['ALL', 'PENDING', 'OPEN']).optional(),
});
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'CASHIER']));
router.get('/status', wrap(async (req, res) => send(res, 200, await service.status(actor(req)), 'Register status')));
router.get('/expected-opening', wrap(async (req, res) => {
    const branchId = req.query.branchId || req.user?.branch_id;
    send(res, 200, branchId ? await service.expectedOpening(branchId) : null, 'Expected opening');
}));
router.get('/reconciliation', (0, permission_middleware_1.requirePermission)('reports.financial', { approvable: false }), wrap(async (req, res) => {
    const q = parse(reportSchema, req.query);
    const today = (0, timezone_1.businessTodayYmd)();
    send(res, 200, await service.reconciliation(actor(req), { from: q.from || today, to: q.to || q.from || today, branchId: q.branchId, status: q.status }), 'Register reconciliation');
}));
router.get('/sessions/:id', wrap(async (req, res) => send(res, 200, await service.detail(req.params.id), 'Register session')));
// Opening count differs from last night's closing → a supervisor signs off.
router.post('/open', (0, permission_middleware_1.requirePermission)('register.operate'), wrap(async (req, res) => send(res, 201, await service.open(actor(req), parse(openSchema, req.body)), 'Register opened')));
router.post('/sessions/:id/cash-in', (0, permission_middleware_1.requirePermission)('register.cash_in'), wrap(async (req, res) => send(res, 200, await service.cashIn(actor(req), req.params.id, parse(cashInSchema, req.body)), 'Cash added')));
router.post('/sessions/:id/attach-expense', (0, permission_middleware_1.requirePermission)('register.paid_out'), wrap(async (req, res) => send(res, 200, await service.attachExpense(actor(req), req.params.id, parse(zod_1.z.object({ expenseId: zod_1.z.string().uuid() }), req.body).expenseId), 'Expense added to the drawer')));
router.post('/sessions/:id/handover', (0, permission_middleware_1.requirePermission)(async (req) => {
    const body = parse(handoverSchema, req.body);
    const keys = ['register.operate'];
    if (await service.handoverNeedsApproval(req.params.id, { mode: body.mode, endCount: body.endCount ?? undefined })) {
        keys.push('register.approve_variance');
    }
    return keys;
}), wrap(async (req, res) => send(res, 200, await service.handover(actor(req), req.params.id, parse(handoverSchema, req.body)), 'Register updated')));
router.post('/sessions/:id/close', (0, permission_middleware_1.requirePermission)('register.operate'), wrap(async (req, res) => send(res, 200, await service.close(actor(req), req.params.id, parse(closeSchema, req.body)), 'Register closed')));
router.post('/sessions/:id/review', (0, permission_middleware_1.requirePermission)('register.approve_variance', { approvable: false }), wrap(async (req, res) => send(res, 200, await service.review(actor(req), req.params.id, parse(reviewSchema, req.body)), 'Register reviewed')));
router.post('/sessions/:id/reopen', (0, permission_middleware_1.requirePermission)('register.reopen'), wrap(async (req, res) => send(res, 200, await service.reopen(actor(req), req.params.id, parse(reasonSchema, req.body)), 'Register reopened')));
exports.default = router;
//# sourceMappingURL=cash-register.routes.js.map