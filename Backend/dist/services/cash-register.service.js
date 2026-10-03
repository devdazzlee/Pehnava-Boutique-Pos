"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashRegisterService = exports.METHOD_LABEL = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const timezone_1 = require("../utils/timezone");
const register_report_calc_1 = require("./register-report.calc");
const permissions_service_1 = require("./permissions.service");
/* ============================================================
 * Cash register: open with a count, cash in/out, cashier shifts,
 * breaks and handovers (both cashiers confirm), close with a count
 * and card / bank / wallet reconciliation, then manager review.
 * Every cash difference stays attached to the shift that caused it.
 * ============================================================ */
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);
const TOLERANCE = 0.5; // rupees
const num = (v) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
};
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const short = (email) => (email ? (email.includes('@') ? email.split('@')[0] : email) : '—');
/** Bucket names used by the register maths → stored payment methods. */
const BUCKET_TO_METHOD = { CASH: 'CASH', CARD: 'CARD', BANK_TRANSFER: 'BANK_TRANSFER', ONLINE: 'MOBILE_MONEY' };
exports.METHOD_LABEL = { CASH: 'Cash', CARD: 'Card', BANK_TRANSFER: 'Bank transfer', MOBILE_MONEY: 'Wallet (JazzCash / Easypaisa)' };
const sessionInclude = {
    branch: { select: { id: true, name: true, code: true } },
    user: { select: { id: true, email: true } },
    closer: { select: { email: true } },
    expenses: { include: { creator: { select: { email: true } } }, orderBy: { created_at: 'asc' } },
    cash_movements: { orderBy: { created_at: 'asc' } },
    shifts: { orderBy: { started_at: 'asc' } },
    reconciliations: true,
};
class CashRegisterService {
    /* ------------------------------ helpers ------------------------------ */
    branchFor(actor, branchId) {
        if (ADMIN_ROLES.has(actor.role || ''))
            return branchId || actor.branchId || null;
        if (!actor.branchId)
            throw new apiError_1.AppError(400, 'Your account is not assigned to a branch');
        return actor.branchId;
    }
    async session(id, retry = true) {
        const s = await client_2.prisma.cashFlow.findUnique({
            where: { id },
            include: sessionInclude,
        });
        if (!s)
            throw new apiError_1.AppError(404, 'Register session not found');
        // Registers opened from the older till screen have no shift yet: the opener is on duty.
        if (retry && s.status === 'OPEN' && s.shifts.length === 0 && s.user_id) {
            await client_2.prisma.registerShift.create({
                data: { cashflow_id: s.id, cashier_id: s.user_id, kind: 'OPENING', start_count: s.opening, started_at: s.opened_at, confirmed_by_incoming: true },
            });
            return this.session(id, false);
        }
        return s;
    }
    /** Register maths for a session up to `at` (defaults to now / closing time). */
    async compute(s, at) {
        const end = at ?? s.closed_at ?? new Date();
        const sales = await client_2.prisma.sale.findMany({
            where: {
                branch_id: s.branch_id || undefined,
                sale_date: { gte: s.opened_at, lte: end },
                status: { notIn: [client_1.SaleStatus.CANCELLED, client_1.SaleStatus.PENDING] },
            },
            include: { payments: { select: { method: true, amount: true } } },
        });
        const report = (0, register_report_calc_1.buildRegisterReport)({
            sessions: [
                {
                    id: s.id,
                    branchId: s.branch_id,
                    registerName: s.branch?.name || 'Register',
                    registerNumber: s.branch?.code || '—',
                    cashierId: s.user_id,
                    cashierName: short(s.user?.email),
                    openedAt: s.opened_at.toISOString(),
                    closedAt: null,
                    opening: num(s.opening),
                    closing: null,
                    status: 'OPEN',
                },
            ],
            sales: sales.map((sale) => ({
                id: sale.id,
                saleNumber: sale.sale_number,
                invoiceNumber: sale.invoice_number,
                saleDate: sale.sale_date.toISOString(),
                customerName: null,
                cashierId: sale.created_by,
                cashierName: null,
                branchId: sale.branch_id,
                subtotal: num(sale.subtotal),
                discount: num(sale.discount_amount),
                tax: num(sale.tax_amount),
                total: num(sale.total_amount),
                paymentMethod: sale.payment_method,
                payments: sale.payments.map((p) => ({ method: p.method, amount: num(p.amount) })),
                status: sale.status,
                originalSaleId: sale.original_sale_id,
                notes: sale.notes,
            })),
            expenses: s.expenses
                .filter((e) => e.status === 'APPROVED' && e.created_at <= end)
                .map((e) => ({
                id: e.id,
                particular: e.particular,
                amount: num(e.amount),
                date: e.created_at.toISOString(),
                paymentMethod: e.payment_method,
                status: e.status,
                cashierId: e.created_by,
                cashierName: short(e.creator?.email),
                branchId: e.branch_id,
            })),
            customerPayments: [],
            cashIns: s.cash_movements
                .filter((m) => m.created_at <= end)
                .map((m) => ({ id: m.id, amount: num(m.amount), date: m.created_at.toISOString(), reason: m.reason, cashierName: null })),
        });
        const byMethod = { CASH: 0, CARD: 0, BANK_TRANSFER: 0, MOBILE_MONEY: 0 };
        for (const row of report.payments) {
            const method = BUCKET_TO_METHOD[row.method];
            if (method)
                byMethod[method] = r2(byMethod[method] + row.amount);
        }
        return {
            expectedCash: report.cash.expectedCash,
            opening: report.cash.openingCash,
            cashSales: report.cash.cashSales,
            cashRefunds: report.cash.cashRefunds,
            cashIn: r2(s.cash_movements.filter((m) => m.created_at <= end).reduce((t, m) => t + num(m.amount), 0)),
            cashOut: report.cash.cashPaidOut,
            byMethod,
            bills: report.salesSummary.saleCount,
            netSales: report.salesSummary.netSales,
        };
    }
    /** Cash the active shift should hold right now. */
    async shiftExpected(s, shift, at = new Date()) {
        const [now, start] = await Promise.all([this.compute(s, at), this.compute(s, shift.started_at)]);
        return r2(num(shift.start_count) + (now.expectedCash - start.expectedCash));
    }
    activeShift(s) {
        return [...s.shifts].reverse().find((x) => x.status !== 'ENDED') ?? null;
    }
    async verifyCashier(email, password) {
        if (!email || !password)
            throw new apiError_1.AppError(400, 'The other cashier must confirm with their login and password');
        const user = await client_2.prisma.user.findUnique({
            where: { email: email.trim().toLowerCase() },
            select: { id: true, email: true, role: true, password: true, is_active: true },
        });
        if (!user || !user.is_active || !(await bcryptjs_1.default.compare(password, user.password))) {
            throw new apiError_1.AppError(400, 'Login or password of the confirming cashier is incorrect');
        }
        if (!(await (0, permissions_service_1.can)(user.role, 'register.operate')))
            throw new apiError_1.AppError(403, `${user.email} is not allowed to run the register`);
        return user;
    }
    async emails(ids) {
        const unique = [...new Set(ids.filter((v) => !!v))];
        if (!unique.length)
            return new Map();
        const users = await client_2.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, email: true } });
        return new Map(users.map((u) => [u.id, u.email]));
    }
    /* ------------------------------ status board ------------------------------ */
    async status(actor) {
        const isAdmin = ADMIN_ROLES.has(actor.role || '');
        const branches = await client_2.prisma.branch.findMany({
            where: { is_active: true, ...(isAdmin ? {} : { id: actor.branchId || '__none__' }) },
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' },
        });
        const today = (0, timezone_1.localRange)((0, timezone_1.businessTodayYmd)(), (0, timezone_1.businessTodayYmd)());
        const rows = [];
        for (const b of branches) {
            const open = await client_2.prisma.cashFlow.findFirst({ where: { branch_id: b.id, status: 'OPEN' }, orderBy: { opened_at: 'desc' }, select: { id: true } });
            const todays = await client_2.prisma.cashFlow.findFirst({
                where: { branch_id: b.id, opened_at: { gte: today.start, lte: today.end } },
                orderBy: { opened_at: 'desc' },
                select: { id: true },
            });
            const pending = await client_2.prisma.cashFlow.count({ where: { branch_id: b.id, status: 'CLOSED', review_status: 'PENDING' } });
            const sid = open?.id ?? todays?.id;
            if (!sid) {
                rows.push({ branch: b, state: 'NOT_OPENED', session: null, pendingReviews: pending });
                continue;
            }
            const s = await this.session(sid);
            const shift = this.activeShift(s);
            const users = await this.emails([shift ? (s.shifts.find((x) => x.id === shift.id)?.cashier_id) : null, s.user_id]);
            const live = s.status === 'OPEN' ? await this.compute(s) : null;
            rows.push({
                branch: b,
                state: s.status === 'CLOSED' ? 'CLOSED' : s.locked ? 'LOCKED' : 'OPEN',
                pendingReviews: pending,
                session: {
                    id: s.id,
                    openedAt: s.opened_at,
                    closedAt: s.closed_at,
                    stale: s.status === 'OPEN' && s.opened_at < today.start,
                    opening: num(s.opening),
                    expectedCash: live?.expectedCash ?? num(s.expected_cash),
                    closing: s.closing == null ? null : num(s.closing),
                    variance: s.variance == null ? null : num(s.variance),
                    reviewStatus: s.review_status,
                    lockedReason: s.locked_reason,
                    onDuty: shift ? short(users.get(s.shifts.find((x) => x.id === shift.id).cashier_id)) : null,
                    shiftStatus: shift?.status ?? null,
                    handovers: Math.max(0, s.shifts.length - 1),
                    bills: live?.bills ?? null,
                },
            });
        }
        return { branches: rows };
    }
    /* ------------------------------ session detail ------------------------------ */
    async detail(id) {
        const s = await this.session(id);
        const live = await this.compute(s);
        const shift = this.activeShift(s);
        const users = await this.emails([
            s.user_id,
            s.closed_by,
            s.reviewed_by,
            s.variance_approved_by,
            ...s.shifts.flatMap((x) => [x.cashier_id, x.approved_by, x.ended_by]),
            ...s.cash_movements.flatMap((m) => [m.created_by, m.approved_by]),
            ...s.reconciliations.map((r) => r.reconciled_by),
        ]);
        const shiftExpectedNow = shift && s.status === 'OPEN' ? await this.shiftExpected(s, s.shifts.find((x) => x.id === shift.id)) : null;
        return {
            id: s.id,
            branch: s.branch,
            status: s.status,
            locked: s.locked,
            lockedReason: s.locked_reason,
            openedAt: s.opened_at,
            openedBy: users.get(s.user_id || '') ?? null,
            closedAt: s.closed_at,
            closedBy: s.closer?.email ?? null,
            opening: num(s.opening),
            expectedOpening: s.expected_opening == null ? null : num(s.expected_opening),
            openingVariance: s.opening_variance == null ? null : num(s.opening_variance),
            openingNote: s.opening_note,
            openingCount: s.opening_count,
            closingCount: s.closing_count,
            closing: s.closing == null ? null : num(s.closing),
            expectedCash: s.status === 'CLOSED' && s.expected_cash != null ? num(s.expected_cash) : live.expectedCash,
            variance: s.variance == null ? null : num(s.variance),
            varianceNote: s.variance_note,
            varianceApprovedBy: users.get(s.variance_approved_by || '') ?? null,
            reviewStatus: s.review_status,
            reviewedBy: users.get(s.reviewed_by || '') ?? null,
            reviewedAt: s.reviewed_at,
            reviewNote: s.review_note,
            live,
            activeShift: shift
                ? {
                    id: shift.id,
                    status: shift.status,
                    cashier: users.get(s.shifts.find((x) => x.id === shift.id).cashier_id) ?? null,
                    cashierId: s.shifts.find((x) => x.id === shift.id).cashier_id,
                    startedAt: shift.started_at,
                    expectedNow: shiftExpectedNow,
                }
                : null,
            shifts: s.shifts.map((x) => ({
                id: x.id,
                kind: x.kind,
                status: x.status,
                cashier: users.get(x.cashier_id) ?? null,
                startedAt: x.started_at,
                endedAt: x.ended_at,
                startCount: num(x.start_count),
                endCount: x.end_count == null ? null : num(x.end_count),
                expectedEnd: x.expected_end == null ? null : num(x.expected_end),
                variance: x.variance == null ? null : num(x.variance),
                startNote: x.start_note,
                endNote: x.end_note,
                confirmedByIncoming: x.confirmed_by_incoming,
                approvedBy: users.get(x.approved_by || '') ?? null,
                endedBy: users.get(x.ended_by || '') ?? null,
            })),
            cashIns: s.cash_movements.map((m) => ({
                id: m.id,
                amount: num(m.amount),
                reason: m.reason,
                at: m.created_at,
                by: users.get(m.created_by || '') ?? null,
                approvedBy: users.get(m.approved_by || '') ?? null,
            })),
            paidOuts: s.expenses
                .filter((e) => e.payment_method === 'CASH')
                .map((e) => ({ id: e.id, amount: num(e.amount), reason: e.particular, at: e.created_at, by: e.creator?.email ?? null, status: e.status })),
            reconciliations: s.reconciliations.map((r) => ({
                method: r.method,
                label: exports.METHOD_LABEL[r.method] ?? r.method,
                expected: num(r.expected),
                actual: num(r.actual),
                variance: num(r.variance),
                reference: r.reference,
                notes: r.notes,
                by: users.get(r.reconciled_by || '') ?? null,
            })),
        };
    }
    /* ------------------------------ previews (for approval checks) ------------------------------ */
    async expectedOpening(branchId) {
        const last = await client_2.prisma.cashFlow.findFirst({
            where: { branch_id: branchId, status: 'CLOSED', closing: { not: null } },
            orderBy: { closed_at: 'desc' },
            select: { closing: true, closed_at: true },
        });
        return last ? { amount: num(last.closing), at: last.closed_at } : null;
    }
    async openNeedsApproval(actor, body) {
        const branchId = this.branchFor(actor, body.branchId);
        if (!branchId)
            return false;
        const expected = await this.expectedOpening(branchId);
        return !!expected && Math.abs(num(body.opening) - expected.amount) > TOLERANCE;
    }
    async closeNeedsApproval(sessionId, closing) {
        const s = await this.session(sessionId);
        const live = await this.compute(s);
        return Math.abs(num(closing) - live.expectedCash) > TOLERANCE;
    }
    async handoverNeedsApproval(sessionId, body) {
        if (body.mode === 'EMERGENCY')
            return true;
        if (body.endCount === undefined || body.endCount === null)
            return false;
        const s = await this.session(sessionId);
        const active = this.activeShift(s);
        if (!active)
            return false;
        const expected = await this.shiftExpected(s, s.shifts.find((x) => x.id === active.id));
        return Math.abs(num(body.endCount) - expected) > TOLERANCE;
    }
    /* ------------------------------ open ------------------------------ */
    async open(actor, body) {
        let branchId = this.branchFor(actor, body.branchId);
        if (!branchId)
            branchId = (await client_2.prisma.branch.findFirst({ where: { is_active: true }, orderBy: { name: 'asc' }, select: { id: true } }))?.id ?? null;
        if (!branchId)
            throw new apiError_1.AppError(400, 'Create a branch before opening the register');
        if (!(num(body.opening) >= 0))
            throw new apiError_1.AppError(400, 'Opening cash cannot be negative');
        const already = await client_2.prisma.cashFlow.findFirst({ where: { branch_id: branchId, status: 'OPEN' }, select: { id: true } });
        if (already)
            throw new apiError_1.AppError(400, 'This branch already has an open register. Close it first.');
        const today = (0, timezone_1.localRange)((0, timezone_1.businessTodayYmd)(), (0, timezone_1.businessTodayYmd)());
        const todays = await client_2.prisma.cashFlow.findFirst({ where: { branch_id: branchId, opened_at: { gte: today.start, lte: today.end } }, select: { id: true } });
        if (todays)
            throw new apiError_1.AppError(400, 'The register was already opened and closed today. Ask a manager to reopen it.');
        const expected = await this.expectedOpening(branchId);
        const variance = expected ? r2(num(body.opening) - expected.amount) : null;
        if (variance !== null && Math.abs(variance) > TOLERANCE && !body.note?.trim()) {
            throw new apiError_1.AppError(400, `Opening cash differs from last closing (Rs ${expected.amount.toLocaleString()}) by Rs ${variance.toLocaleString()}. Enter a reason.`);
        }
        const s = await client_2.prisma.cashFlow.create({
            data: {
                branch_id: branchId,
                user_id: actor.userId,
                opening: new client_1.Prisma.Decimal(num(body.opening)),
                sales: new client_1.Prisma.Decimal(0),
                status: 'OPEN',
                opened_at: new Date(),
                opening_count: body.counts ? body.counts : undefined,
                expected_opening: expected ? new client_1.Prisma.Decimal(expected.amount) : null,
                opening_variance: variance === null ? null : new client_1.Prisma.Decimal(variance),
                opening_note: body.note?.trim() || null,
                shifts: {
                    create: {
                        cashier_id: actor.userId,
                        kind: 'OPENING',
                        start_count: new client_1.Prisma.Decimal(num(body.opening)),
                        confirmed_by_incoming: true,
                        approved_by: actor.approvalId ?? null,
                    },
                },
            },
        });
        return this.detail(s.id);
    }
    /* ------------------------------ cash in ------------------------------ */
    async cashIn(actor, sessionId, body) {
        const s = await this.session(sessionId);
        if (s.status !== 'OPEN')
            throw new apiError_1.AppError(400, 'Open the register first');
        if (!(num(body.amount) > 0))
            throw new apiError_1.AppError(400, 'Amount must be greater than 0');
        if (!body.reason?.trim())
            throw new apiError_1.AppError(400, 'Enter a reason');
        await client_2.prisma.cashMovement.create({
            data: {
                cashflow_id: s.id,
                type: 'IN',
                amount: new client_1.Prisma.Decimal(num(body.amount)),
                reason: body.reason.trim(),
                created_by: actor.userId ?? null,
                approved_by: actor.approvalId ?? null,
            },
        });
        return this.detail(s.id);
    }
    /* ------------------------------ breaks & handovers ------------------------------ */
    async handover(actor, sessionId, body) {
        const s = await this.session(sessionId);
        if (s.status !== 'OPEN')
            throw new apiError_1.AppError(400, 'The register is not open');
        const activeRef = this.activeShift(s);
        if (!activeRef)
            throw new apiError_1.AppError(400, 'No cashier is on duty for this register');
        const active = s.shifts.find((x) => x.id === activeRef.id);
        const isOutgoing = active.cashier_id === actor.userId;
        const supervisor = await (0, permissions_service_1.can)(actor.role, 'register.approve_variance');
        // Protected break with nobody covering: lock the register.
        if (body.mode === 'BREAK' && !body.incomingEmail) {
            if (!isOutgoing && !supervisor)
                throw new apiError_1.AppError(403, 'Only the cashier on duty can go on break');
            if (active.status === 'ON_BREAK')
                throw new apiError_1.AppError(400, 'Already on break');
            const cashier = (await this.emails([active.cashier_id])).get(active.cashier_id);
            await client_2.prisma.$transaction([
                client_2.prisma.registerShift.update({ where: { id: active.id }, data: { status: 'ON_BREAK', end_note: body.note?.trim() || null } }),
                client_2.prisma.cashFlow.update({ where: { id: s.id }, data: { locked: true, locked_reason: `${short(cashier)} is on break` } }),
            ]);
            return this.detail(s.id);
        }
        // Back from an uncovered break: the same cashier confirms with their password.
        if (body.mode === 'RETURN' && active.status === 'ON_BREAK') {
            const returning = await this.verifyCashier(body.incomingEmail, body.incomingPassword);
            if (returning.id !== active.cashier_id && !supervisor)
                throw new apiError_1.AppError(403, 'Only the cashier who went on break can unlock the register');
            await client_2.prisma.$transaction([
                client_2.prisma.registerShift.update({ where: { id: active.id }, data: { status: 'ACTIVE' } }),
                client_2.prisma.cashFlow.update({ where: { id: s.id }, data: { locked: false, locked_reason: null } }),
            ]);
            return this.detail(s.id);
        }
        // Handover / break cover / return from cover / emergency replacement.
        if (body.mode !== 'EMERGENCY' && !isOutgoing && !supervisor) {
            throw new apiError_1.AppError(403, 'Only the cashier on duty can hand over the register (or a supervisor via emergency replacement)');
        }
        if (body.endCount === undefined || body.endCount === null || !(num(body.endCount) >= 0)) {
            throw new apiError_1.AppError(400, 'Count the cash in the drawer before handing over');
        }
        if (body.mode === 'EMERGENCY' && !body.note?.trim())
            throw new apiError_1.AppError(400, 'Give a reason for the emergency replacement');
        const incoming = await this.verifyCashier(body.incomingEmail, body.incomingPassword);
        if (incoming.id === active.cashier_id)
            throw new apiError_1.AppError(400, 'Choose a different cashier to take over');
        const expected = await this.shiftExpected(s, active);
        const variance = r2(num(body.endCount) - expected);
        if (Math.abs(variance) > TOLERANCE && !body.note?.trim()) {
            throw new apiError_1.AppError(400, `The count is ${variance > 0 ? 'over' : 'short'} by Rs ${Math.abs(variance).toLocaleString()}. Enter a note.`);
        }
        const kind = body.mode === 'BREAK' ? 'BREAK_COVER' : body.mode;
        await client_2.prisma.$transaction([
            client_2.prisma.registerShift.update({
                where: { id: active.id },
                data: {
                    status: 'ENDED',
                    ended_at: new Date(),
                    end_count: new client_1.Prisma.Decimal(num(body.endCount)),
                    expected_end: new client_1.Prisma.Decimal(expected),
                    variance: new client_1.Prisma.Decimal(variance),
                    end_note: body.note?.trim() || null,
                    ended_by: actor.userId ?? null,
                    approved_by: actor.approvalId ?? null,
                },
            }),
            client_2.prisma.registerShift.create({
                data: {
                    cashflow_id: s.id,
                    cashier_id: incoming.id,
                    kind,
                    start_count: new client_1.Prisma.Decimal(num(body.endCount)),
                    start_note: body.note?.trim() || null,
                    confirmed_by_incoming: true,
                    approved_by: actor.approvalId ?? null,
                },
            }),
            client_2.prisma.cashFlow.update({ where: { id: s.id }, data: { locked: false, locked_reason: null } }),
        ]);
        return this.detail(s.id);
    }
    /* ------------------------------ close ------------------------------ */
    async close(actor, sessionId, body) {
        const s = await this.session(sessionId);
        if (s.status !== 'OPEN')
            throw new apiError_1.AppError(400, 'This register is already closed');
        if (!(num(body.closing) >= 0))
            throw new apiError_1.AppError(400, 'Count the cash in the drawer');
        const live = await this.compute(s);
        const variance = r2(num(body.closing) - live.expectedCash);
        if (Math.abs(variance) > TOLERANCE && !body.note?.trim()) {
            throw new apiError_1.AppError(400, `Cash is ${variance > 0 ? 'over' : 'short'} by Rs ${Math.abs(variance).toLocaleString()}. Enter a reason.`);
        }
        const activeRef = this.activeShift(s);
        const ops = [];
        if (activeRef) {
            const active = s.shifts.find((x) => x.id === activeRef.id);
            const expected = await this.shiftExpected(s, active);
            ops.push(client_2.prisma.registerShift.update({
                where: { id: active.id },
                data: {
                    status: 'ENDED',
                    ended_at: new Date(),
                    end_count: new client_1.Prisma.Decimal(num(body.closing)),
                    expected_end: new client_1.Prisma.Decimal(expected),
                    variance: new client_1.Prisma.Decimal(r2(num(body.closing) - expected)),
                    end_note: body.note?.trim() || 'Register closed',
                    ended_by: actor.userId ?? null,
                },
            }));
        }
        const recs = [
            { method: 'CASH', actual: num(body.closing), reference: null, notes: body.note?.trim() || null },
            ...(body.reconciliations ?? []).filter((r) => r.method !== 'CASH' && BUCKET_TO_METHOD[r.method === 'MOBILE_MONEY' ? 'ONLINE' : r.method]),
        ];
        for (const rec of recs) {
            const expected = rec.method === 'CASH' ? live.expectedCash : live.byMethod[rec.method] ?? 0;
            const actual = num(rec.actual);
            ops.push(client_2.prisma.registerReconciliation.upsert({
                where: { cashflow_id_method: { cashflow_id: s.id, method: rec.method } },
                create: {
                    cashflow_id: s.id,
                    method: rec.method,
                    expected: new client_1.Prisma.Decimal(expected),
                    actual: new client_1.Prisma.Decimal(actual),
                    variance: new client_1.Prisma.Decimal(r2(actual - expected)),
                    reference: rec.reference || null,
                    notes: rec.notes || null,
                    reconciled_by: actor.userId ?? null,
                },
                update: {
                    expected: new client_1.Prisma.Decimal(expected),
                    actual: new client_1.Prisma.Decimal(actual),
                    variance: new client_1.Prisma.Decimal(r2(actual - expected)),
                    reference: rec.reference || null,
                    notes: rec.notes || null,
                    reconciled_by: actor.userId ?? null,
                },
            }));
        }
        // A manager closing their own register signs off immediately; otherwise it waits for review.
        const selfReview = await (0, permissions_service_1.can)(actor.role, 'register.approve_variance');
        ops.push(client_2.prisma.cashFlow.update({
            where: { id: s.id },
            data: {
                closing: new client_1.Prisma.Decimal(num(body.closing)),
                expected_cash: new client_1.Prisma.Decimal(live.expectedCash),
                variance: new client_1.Prisma.Decimal(variance),
                closing_count: body.counts ? body.counts : undefined,
                variance_note: body.note?.trim() || null,
                variance_approved_by: actor.approvalId ?? null,
                status: 'CLOSED',
                closed_at: new Date(),
                closed_by: actor.userId ?? null,
                locked: false,
                locked_reason: null,
                review_status: selfReview ? 'APPROVED' : 'PENDING',
                reviewed_by: selfReview ? actor.userId ?? null : null,
                reviewed_at: selfReview ? new Date() : null,
            },
        }));
        await client_2.prisma.$transaction(ops);
        return this.detail(s.id);
    }
    /* ------------------------------ review / reopen ------------------------------ */
    async review(actor, sessionId, body) {
        const s = await this.session(sessionId);
        if (s.status !== 'CLOSED')
            throw new apiError_1.AppError(400, 'Only closed registers can be reviewed');
        await client_2.prisma.cashFlow.update({
            where: { id: s.id },
            data: { review_status: 'APPROVED', reviewed_by: actor.userId ?? null, reviewed_at: new Date(), review_note: body.note?.trim() || null },
        });
        return this.detail(s.id);
    }
    async reopen(actor, sessionId, body) {
        const s = await this.session(sessionId);
        if (s.status !== 'CLOSED')
            throw new apiError_1.AppError(400, 'This register is not closed');
        if (!body.reason?.trim())
            throw new apiError_1.AppError(400, 'Enter a reason for reopening');
        await client_2.prisma.$transaction([
            client_2.prisma.cashFlow.update({
                where: { id: s.id },
                data: {
                    status: 'OPEN',
                    closed_at: null,
                    closing: null,
                    expected_cash: null,
                    variance: null,
                    closed_by: null,
                    review_status: 'NONE',
                    reviewed_by: null,
                    reviewed_at: null,
                    review_note: `Reopened: ${body.reason.trim()}`,
                },
            }),
            client_2.prisma.registerReconciliation.deleteMany({ where: { cashflow_id: s.id } }),
            client_2.prisma.registerShift.create({
                data: {
                    cashflow_id: s.id,
                    cashier_id: actor.userId,
                    kind: 'REOPEN',
                    start_count: s.closing ?? new client_1.Prisma.Decimal(0),
                    start_note: body.reason.trim(),
                    confirmed_by_incoming: true,
                    approved_by: actor.approvalId ?? null,
                },
            }),
        ]);
        return this.detail(s.id);
    }
    /* ------------------------------ reconciliation report ------------------------------ */
    async reconciliation(actor, q) {
        const isAdmin = ADMIN_ROLES.has(actor.role || '');
        const branchId = isAdmin ? q.branchId : actor.branchId || undefined;
        const { start, end } = (0, timezone_1.localRange)(q.from, q.to);
        const sessions = await client_2.prisma.cashFlow.findMany({
            where: {
                opened_at: { gte: start, lte: end },
                ...(branchId ? { branch_id: branchId } : {}),
                ...(q.status === 'PENDING' ? { status: 'CLOSED', review_status: 'PENDING' } : {}),
                ...(q.status === 'OPEN' ? { status: 'OPEN' } : {}),
            },
            include: {
                branch: { select: { name: true, code: true } },
                reconciliations: true,
                shifts: { select: { cashier_id: true, variance: true, kind: true, ended_at: true } },
            },
            orderBy: { opened_at: 'desc' },
        });
        const users = await this.emails([
            ...sessions.flatMap((s) => [s.user_id, s.closed_by, s.reviewed_by]),
            ...sessions.flatMap((s) => s.shifts.map((x) => x.cashier_id)),
        ]);
        const methodTotals = {};
        const byCashier = new Map();
        for (const s of sessions) {
            for (const r of s.reconciliations) {
                const t = (methodTotals[r.method] ??= { expected: 0, actual: 0, variance: 0 });
                t.expected = r2(t.expected + num(r.expected));
                t.actual = r2(t.actual + num(r.actual));
                t.variance = r2(t.variance + num(r.variance));
            }
            for (const x of s.shifts) {
                if (x.variance == null)
                    continue;
                const key = x.cashier_id;
                const row = byCashier.get(key) ?? { cashier: users.get(key) ?? key, shifts: 0, over: 0, short: 0, net: 0 };
                const v = num(x.variance);
                row.shifts += 1;
                if (v > 0)
                    row.over = r2(row.over + v);
                if (v < 0)
                    row.short = r2(row.short + v);
                row.net = r2(row.net + v);
                byCashier.set(key, row);
            }
        }
        return {
            period: { from: q.from, to: q.to },
            sessions: sessions.map((s) => ({
                id: s.id,
                branch: s.branch,
                openedAt: s.opened_at,
                closedAt: s.closed_at,
                status: s.status,
                reviewStatus: s.review_status,
                openedBy: users.get(s.user_id || '') ?? null,
                closedBy: users.get(s.closed_by || '') ?? null,
                reviewedBy: users.get(s.reviewed_by || '') ?? null,
                opening: num(s.opening),
                openingVariance: s.opening_variance == null ? null : num(s.opening_variance),
                expectedCash: s.expected_cash == null ? null : num(s.expected_cash),
                closing: s.closing == null ? null : num(s.closing),
                variance: s.variance == null ? null : num(s.variance),
                varianceNote: s.variance_note,
                handovers: Math.max(0, s.shifts.length - 1),
                methods: s.reconciliations.map((r) => ({ method: r.method, expected: num(r.expected), actual: num(r.actual), variance: num(r.variance) })),
            })),
            totals: {
                sessions: sessions.length,
                pendingReview: sessions.filter((s) => s.status === 'CLOSED' && s.review_status === 'PENDING').length,
                cashVariance: r2(sessions.reduce((t, s) => t + num(s.variance), 0)),
                methods: Object.entries(methodTotals).map(([method, t]) => ({ method, label: exports.METHOD_LABEL[method] ?? method, ...t })),
            },
            byCashier: [...byCashier.values()].sort((a, b) => a.net - b.net),
        };
    }
}
exports.CashRegisterService = CashRegisterService;
//# sourceMappingURL=cash-register.service.js.map