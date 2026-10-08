"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TillService = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const timezone_1 = require("../utils/timezone");
const register_report_service_1 = require("./register-report.service");
const register_report_calc_1 = require("./register-report.calc");
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);
const num = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const cashierName = (email) => {
    if (!email)
        return '—';
    return email.includes('@') ? email.split('@')[0] : email;
};
class TillService {
    resolveBranchId(params) {
        const isAdmin = ADMIN_ROLES.has(params.userRole || '');
        if (isAdmin) {
            if (params.branchId)
                return params.branchId;
            if (params.userBranchId)
                return params.userBranchId;
            return null;
        }
        if (!params.userBranchId) {
            throw new apiError_1.AppError(400, 'Your account is not assigned to a branch');
        }
        return params.userBranchId;
    }
    async day(params) {
        const isAdmin = ADMIN_ROLES.has(params.userRole || '');
        const branches = await client_2.prisma.branch.findMany({
            where: { is_active: true },
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' },
        });
        let branchId = this.resolveBranchId(params);
        if (!branchId) {
            branchId = branches[0]?.id || null;
        }
        if (!branchId) {
            throw new apiError_1.AppError(400, 'Create a branch before opening the till');
        }
        const branch = branches.find((row) => row.id === branchId) || (await client_2.prisma.branch.findUnique({
            where: { id: branchId },
            select: { id: true, name: true, code: true },
        }));
        if (!branch)
            throw new apiError_1.AppError(404, 'Branch not found');
        const from = params.from || params.date;
        const to = params.to || params.date || params.from;
        if (!from || !to)
            throw new apiError_1.AppError(400, 'Use from and to dates in YYYY-MM-DD format');
        const { start, end } = (0, timezone_1.localRange)(from, to);
        const todayKey = (0, timezone_1.businessTodayYmd)();
        const todayRange = (0, timezone_1.localRange)(todayKey, todayKey);
        const [sessions, sales, todaySession, staleOpen] = await Promise.all([
            client_2.prisma.cashFlow.findMany({
                where: {
                    branch_id: branchId,
                    opened_at: { gte: start, lte: end },
                },
                include: {
                    expenses: {
                        orderBy: { created_at: 'asc' },
                        include: { creator: { select: { email: true } } },
                    },
                    cash_movements: true,
                    user: { select: { email: true } },
                    closer: { select: { email: true } },
                },
                orderBy: { opened_at: 'asc' },
            }),
            client_2.prisma.sale.findMany({
                where: {
                    branch_id: branchId,
                    sale_date: { gte: start, lte: end },
                    status: { notIn: [client_1.SaleStatus.CANCELLED, client_1.SaleStatus.PENDING] },
                },
                include: {
                    customer: { select: { name: true } },
                    user: { select: { email: true } },
                    payments: { select: { method: true, amount: true } },
                },
                orderBy: { sale_date: 'asc' },
            }),
            client_2.prisma.cashFlow.findFirst({
                where: {
                    branch_id: branchId,
                    opened_at: { gte: todayRange.start, lte: todayRange.end },
                },
                include: {
                    expenses: true,
                    user: { select: { email: true } },
                    closer: { select: { email: true } },
                },
            }),
            // A drawer left OPEN from an earlier day blocks nothing, but it must be
            // closed so its cash is counted — surface it so the UI can prompt.
            client_2.prisma.cashFlow.findFirst({
                where: {
                    branch_id: branchId,
                    status: 'OPEN',
                    opened_at: { lt: todayRange.start },
                },
                orderBy: { opened_at: 'desc' },
                include: { user: { select: { email: true } } },
            }),
        ]);
        const allExpenses = sessions.flatMap((session) => session.expenses || []);
        const sessionsForCalc = sessions.map((session) => ({
            id: session.id,
            branchId: session.branch_id,
            registerName: branch.name,
            registerNumber: branch.code,
            cashierId: session.user_id,
            cashierName: cashierName(session.user?.email),
            openedAt: session.opened_at.toISOString(),
            closedAt: session.closed_at ? session.closed_at.toISOString() : null,
            opening: num(session.opening),
            closing: session.closing == null ? null : num(session.closing),
            status: (session.status === 'CLOSED' ? 'CLOSED' : 'OPEN'),
        }));
        const report = (0, register_report_calc_1.buildRegisterReport)({
            sessions: sessionsForCalc,
            sales: sales.map((sale) => ({
                id: sale.id,
                saleNumber: sale.sale_number,
                invoiceNumber: sale.invoice_number,
                saleDate: sale.sale_date.toISOString(),
                customerName: sale.customer?.name || null,
                cashierId: sale.created_by,
                cashierName: cashierName(sale.user?.email),
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
            expenses: allExpenses
                .filter((expense) => expense.status === 'APPROVED')
                .map((expense) => ({
                id: expense.id,
                particular: expense.particular,
                amount: num(expense.amount),
                date: expense.expense_date.toISOString(),
                paymentMethod: expense.payment_method,
                status: expense.status,
                cashierId: expense.created_by,
                cashierName: null,
                branchId: expense.branch_id || branchId,
            })),
            customerPayments: [],
            cashIns: sessions.flatMap((session) => session.cash_movements.map((m) => ({ id: m.id, amount: num(m.amount), date: m.created_at.toISOString(), reason: m.reason, cashierName: null }))),
            filters: {},
        });
        const paymentAmount = (method) => round2(report.payments
            .filter((row) => row.method === method)
            .reduce((sum, row) => sum + row.amount, 0));
        const cashSales = paymentAmount('CASH');
        const cardSales = paymentAmount('CARD');
        const otherSales = round2(report.payments
            .filter((row) => row.method !== 'CASH' && row.method !== 'CARD')
            .reduce((sum, row) => sum + row.amount, 0));
        const opening = round2(sessions.reduce((sum, session) => sum + num(session.opening), 0));
        const expectedCash = sessions.length
            ? report.cash.expectedCash
            : round2(opening + cashSales - report.cash.cashRefunds - report.cash.cashPaidOut);
        const allClosed = sessions.length > 0 && sessions.every((session) => session.status === 'CLOSED' && session.closing != null);
        const closing = allClosed
            ? round2(sessions.reduce((sum, session) => sum + num(session.closing), 0))
            : null;
        const variance = closing == null ? null : round2(closing - expectedCash);
        const activeSession = sessions.find((session) => session.status === 'OPEN') ||
            todaySession ||
            sessions[sessions.length - 1] ||
            null;
        const mapSession = (session) => {
            const sessionOpening = round2(num(session.opening));
            const sessionClosing = session.closing == null ? null : round2(num(session.closing));
            const sessionExpected = sessions.length === 1 ? expectedCash : sessionOpening;
            const sessionVariance = sessionClosing == null ? null : round2(sessionClosing - (sessions.length === 1 ? expectedCash : sessionOpening));
            return {
                id: session.id,
                status: session.status,
                opening: sessionOpening,
                closing: sessionClosing,
                expectedCash: sessions.length === 1 ? expectedCash : sessionExpected,
                variance: sessions.length === 1 ? variance : sessionVariance,
                varianceLabel: (sessions.length === 1 ? variance : sessionVariance) == null
                    ? null
                    : Math.abs((sessions.length === 1 ? variance : sessionVariance)) < 0.005
                        ? 'Balanced'
                        : (sessions.length === 1 ? variance : sessionVariance) > 0
                            ? 'Over'
                            : 'Short',
                openedAt: session.opened_at.toISOString(),
                closedAt: session.closed_at ? session.closed_at.toISOString() : null,
                openedBy: cashierName(session.user?.email),
                closedBy: cashierName(session.closer?.email),
            };
        };
        return {
            date: from === to ? from : `${from} to ${to}`,
            period: { from, to },
            branch,
            branches: isAdmin ? branches : branches.filter((row) => row.id === branchId),
            session: activeSession ? mapSession(activeSession) : null,
            sessions: sessions.map(mapSession),
            summary: {
                opening,
                cashSales,
                cardSales,
                otherSales,
                cashRefunds: round2(report.cash.cashRefunds || 0),
                paidOut: round2(report.cash.cashPaidOut || 0),
                expectedCash: round2(expectedCash),
                closing,
                variance,
                billCount: report.salesSummary.saleCount,
                grossSales: round2(report.salesSummary.grossSales),
                netSales: round2(report.salesSummary.netSales),
                sessionCount: sessions.length,
            },
            paidOuts: allExpenses
                .filter((expense) => expense.status === 'APPROVED' && expense.payment_method === 'CASH')
                .map((expense) => ({
                id: expense.id,
                particular: expense.particular,
                amount: round2(num(expense.amount)),
                at: expense.created_at.toISOString(),
                by: expense.creator?.email ? cashierName(expense.creator.email) : null,
                cashflowId: expense.cashflow_id,
                canVoid: sessions.some((row) => row.id === expense.cashflow_id && row.status === 'OPEN'),
            })),
            transactions: report.transactions.slice(0, 100),
            transactionCount: report.transactions.length,
            staleOpenSession: staleOpen
                ? {
                    id: staleOpen.id,
                    opening: round2(num(staleOpen.opening)),
                    openedAt: staleOpen.opened_at.toISOString(),
                    openedBy: cashierName(staleOpen.user?.email),
                }
                : null,
            canOpen: !todaySession,
            canClose: Boolean(activeSession && activeSession.status === 'OPEN'),
            canPaidOut: Boolean(todaySession && todaySession.status === 'OPEN'),
            canReopen: Boolean(todaySession && todaySession.status === 'CLOSED' && isAdmin),
        };
    }
    async open(params) {
        let branchId = this.resolveBranchId(params);
        if (!branchId) {
            const first = await client_2.prisma.branch.findFirst({
                where: { is_active: true },
                orderBy: { name: 'asc' },
                select: { id: true },
            });
            branchId = first?.id || null;
        }
        if (!branchId)
            throw new apiError_1.AppError(400, 'Create a branch before opening the till');
        if (params.opening < 0)
            throw new apiError_1.AppError(400, 'Opening cash cannot be negative');
        const todayKey = (0, timezone_1.businessTodayYmd)();
        const today = (0, timezone_1.localRange)(todayKey, todayKey);
        const existing = await client_2.prisma.cashFlow.findFirst({
            where: {
                branch_id: branchId,
                opened_at: { gte: today.start, lte: today.end },
            },
        });
        if (existing) {
            throw new apiError_1.AppError(400, 'A till has already been opened for this branch today');
        }
        return client_2.prisma.cashFlow.create({
            data: {
                opening: new client_1.Prisma.Decimal(params.opening),
                sales: new client_1.Prisma.Decimal(0),
                closing: null,
                branch_id: branchId,
                user_id: params.userId,
                status: 'OPEN',
                opened_at: new Date(),
            },
        });
    }
    async paidOut(params) {
        let branchId = this.resolveBranchId(params);
        if (!branchId) {
            const first = await client_2.prisma.branch.findFirst({
                where: { is_active: true },
                orderBy: { name: 'asc' },
                select: { id: true },
            });
            branchId = first?.id || null;
        }
        if (!branchId)
            throw new apiError_1.AppError(400, 'Branch is required');
        if (params.amount <= 0)
            throw new apiError_1.AppError(400, 'Paid-out amount must be greater than zero');
        if (!params.particular.trim())
            throw new apiError_1.AppError(400, 'Reason is required');
        // Prefer today's drawer; fall back to the latest open one (e.g. a shift
        // that runs past midnight).
        const todayKey = (0, timezone_1.businessTodayYmd)();
        const today = (0, timezone_1.localRange)(todayKey, todayKey);
        const openDrawer = (await client_2.prisma.cashFlow.findFirst({
            where: { branch_id: branchId, status: 'OPEN', opened_at: { gte: today.start, lte: today.end } },
        })) ||
            (await client_2.prisma.cashFlow.findFirst({
                where: { branch_id: branchId, status: 'OPEN' },
                orderBy: { opened_at: 'desc' },
            }));
        if (!openDrawer)
            throw new apiError_1.AppError(400, 'Open the till before recording a paid-out');
        return client_2.prisma.expense.create({
            data: {
                particular: params.particular.trim(),
                amount: new client_1.Prisma.Decimal(params.amount),
                cashflow_id: openDrawer.id,
                branch_id: branchId,
                payment_method: 'CASH',
                status: 'APPROVED',
                approved_at: new Date(),
                ...(params.userId ? { created_by: params.userId, approved_by: params.userId } : {}),
            },
        });
    }
    /** Reverse a paid-out recorded by mistake. Kept as REJECTED for the audit trail. */
    async voidPaidOut(params) {
        const expense = await client_2.prisma.expense.findUnique({
            where: { id: params.expenseId },
            include: { cashflow: { select: { status: true } } },
        });
        if (!expense || !expense.cashflow_id)
            throw new apiError_1.AppError(404, 'Paid-out not found');
        if (expense.status !== 'APPROVED')
            throw new apiError_1.AppError(400, 'This paid-out has already been voided');
        if (expense.cashflow?.status !== 'OPEN') {
            throw new apiError_1.AppError(400, 'The till is closed. Reopen it before voiding a paid-out');
        }
        return client_2.prisma.expense.update({
            where: { id: expense.id },
            data: {
                status: 'REJECTED',
                rejection_reason: params.reason?.trim() || 'Voided from daily till',
                ...(params.userId ? { approved_by: params.userId } : {}),
            },
        });
    }
    async close(params) {
        return new register_report_service_1.RegisterReportService().closeSession(params.cashflowId, params.closing, params.userId, params.userRole);
    }
    async reopen(params) {
        return new register_report_service_1.RegisterReportService().reopenSession(params.cashflowId, params.userRole);
    }
}
exports.TillService = TillService;
//# sourceMappingURL=till.service.js.map