"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentBucket = exports.RegisterReportService = exports.localRange = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const timezone_1 = require("../utils/timezone");
const register_report_calc_1 = require("./register-report.calc");
Object.defineProperty(exports, "paymentBucket", { enumerable: true, get: function () { return register_report_calc_1.paymentBucket; } });
var timezone_2 = require("../utils/timezone");
Object.defineProperty(exports, "localRange", { enumerable: true, get: function () { return timezone_2.localRange; } });
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);
const num = (value) => {
    if (value == null)
        return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const cashierName = (email) => email || '—';
class RegisterReportService {
    async getReport(params) {
        const isAdmin = ADMIN_ROLES.has(params.userRole || '');
        const branchId = isAdmin ? params.branchId || undefined : params.userBranchId || undefined;
        if (!isAdmin && !branchId) {
            throw new apiError_1.AppError(400, 'Your user has no register branch assigned');
        }
        const { start, end } = (0, timezone_1.localRange)(params.from, params.to);
        const cashierId = params.cashierId || undefined;
        const sessionWhere = {
            opened_at: { gte: start, lte: end },
            ...(branchId ? { branch_id: branchId } : {}),
            ...(cashierId ? { user_id: cashierId } : {}),
        };
        const saleWhere = {
            sale_date: { gte: start, lte: end },
            ...(branchId ? { branch_id: branchId } : {}),
            ...(cashierId ? { created_by: cashierId } : {}),
        };
        const expenseWhere = {
            expense_date: { gte: start, lte: end },
            status: client_1.ExpenseStatus.APPROVED,
            ...(cashierId ? { created_by: cashierId } : {}),
            ...(branchId
                ? {
                    OR: [
                        { branch_id: branchId },
                        { cashflow: { branch_id: branchId } },
                    ],
                }
                : {}),
        };
        const [sessionsRaw, salesRaw, expensesRaw, paymentsRaw, branches, users] = await Promise.all([
            client_2.prisma.cashFlow.findMany({
                where: sessionWhere,
                include: {
                    branch: { select: { id: true, name: true, code: true } },
                    user: { select: { id: true, email: true } },
                    closer: { select: { email: true } },
                    cash_movements: true,
                },
                orderBy: { opened_at: 'asc' },
            }),
            client_2.prisma.sale.findMany({
                where: saleWhere,
                include: {
                    customer: { select: { name: true } },
                    user: { select: { id: true, email: true } },
                    payments: { select: { method: true, amount: true } },
                },
                orderBy: { sale_date: 'desc' },
            }),
            client_2.prisma.expense.findMany({
                where: expenseWhere,
                include: { creator: { select: { id: true, email: true } } },
                orderBy: { expense_date: 'desc' },
            }),
            client_2.prisma.customerPayment.findMany({
                where: {
                    payment_date: { gte: start, lte: end },
                    // Only real money movements touch the register (not credit/debit notes or write-offs)
                    type: { in: ['PAYMENT', 'ADVANCE', 'REFUND'] },
                    ...(cashierId ? { created_by: cashierId } : {}),
                    ...(!cashierId && branchId
                        ? { user: { branch_id: branchId } }
                        : {}),
                },
                include: {
                    customer: { select: { name: true } },
                    user: { select: { id: true, email: true, branch_id: true } },
                },
                orderBy: { payment_date: 'desc' },
            }),
            client_2.prisma.branch.findMany({
                where: branchId ? { id: branchId } : { is_active: true },
                select: { id: true, name: true, code: true },
                orderBy: { name: 'asc' },
            }),
            client_2.prisma.user.findMany({
                where: branchId ? { branch_id: branchId } : undefined,
                select: { id: true, email: true, role: true },
                orderBy: { email: 'asc' },
            }),
        ]);
        const sessions = sessionsRaw.map((session) => ({
            id: session.id,
            branchId: session.branch_id,
            registerName: session.branch?.name || 'Register',
            registerNumber: session.branch?.code || '—',
            cashierId: session.user_id,
            cashierName: cashierName(session.user?.email),
            openedAt: session.opened_at.toISOString(),
            closedAt: session.closed_at ? session.closed_at.toISOString() : null,
            opening: num(session.opening),
            closing: session.closing == null ? null : num(session.closing),
            status: session.status,
        }));
        const sales = salesRaw.map((sale) => ({
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
        }));
        const expenses = expensesRaw.map((expense) => ({
            id: expense.id,
            particular: expense.particular,
            amount: num(expense.amount),
            date: expense.expense_date.toISOString(),
            paymentMethod: expense.payment_method,
            status: expense.status,
            cashierId: expense.created_by,
            cashierName: cashierName(expense.creator?.email),
            branchId: expense.branch_id,
        }));
        const customerPayments = paymentsRaw.map((payment) => ({
            id: payment.id,
            amount: payment.type === 'REFUND' ? -num(payment.amount) : num(payment.amount),
            date: payment.payment_date.toISOString(),
            method: payment.method,
            customerName: payment.customer?.name || null,
            cashierId: payment.created_by,
            cashierName: cashierName(payment.user?.email),
            reference: payment.reference,
        }));
        const report = (0, register_report_calc_1.buildRegisterReport)({
            sessions,
            sales,
            expenses,
            customerPayments,
            cashIns: sessionsRaw.flatMap((session) => session.cash_movements.map((m) => ({ id: m.id, amount: num(m.amount), date: m.created_at.toISOString(), reason: m.reason, cashierName: null }))),
            filters: {
                paymentMethod: params.paymentMethod,
                transactionType: params.transactionType,
                status: params.status,
            },
        });
        const registerStatus = sessions.length === 0 ? 'NONE' : sessions.some((session) => session.status === 'OPEN') ? 'OPEN' : 'CLOSED';
        // Per-session result as saved at close time (expected / variance are
        // snapshotted on the CashFlow row), so each drawer shows its own outcome.
        const rawById = new Map(sessionsRaw.map((row) => [row.id, row]));
        const sessionRows = report.sessions.map((session) => {
            const raw = rawById.get(session.id);
            const closed = session.status === 'CLOSED';
            const expected = closed && raw?.expected_cash != null ? Math.round(num(raw.expected_cash) * 100) / 100 : null;
            const sessionVariance = closed && raw?.variance != null ? Math.round(num(raw.variance) * 100) / 100 : null;
            return {
                ...session,
                expectedCash: expected,
                variance: sessionVariance,
                varianceLabel: (0, register_report_calc_1.varianceLabel)(sessionVariance),
                closedBy: raw?.closer?.email ? cashierName(raw.closer.email) : null,
            };
        });
        return {
            period: { from: params.from, to: params.to, start: start.toISOString(), end: end.toISOString() },
            registerStatus,
            canClose: true,
            canReopen: isAdmin,
            filters: {
                registers: branches.map((branch) => ({
                    id: branch.id,
                    name: branch.name,
                    number: branch.code,
                })),
                cashiers: users.map((user) => ({ id: user.id, name: user.email, role: user.role })),
                paymentMethods: ['CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'OTHER'],
            },
            ...report,
            sessions: sessionRows,
        };
    }
    async expectedForSession(cashflowId) {
        const session = await client_2.prisma.cashFlow.findUnique({
            where: { id: cashflowId },
            include: {
                branch: { select: { name: true, code: true } },
                user: { select: { email: true } },
                expenses: true,
                cash_movements: true,
            },
        });
        if (!session)
            throw new apiError_1.AppError(404, 'Register session not found');
        const end = session.closed_at || new Date();
        const sales = await client_2.prisma.sale.findMany({
            where: {
                branch_id: session.branch_id || undefined,
                sale_date: { gte: session.opened_at, lte: end },
                status: { notIn: [client_1.SaleStatus.CANCELLED, client_1.SaleStatus.PENDING] },
            },
            include: { payments: { select: { method: true, amount: true } } },
        });
        const report = (0, register_report_calc_1.buildRegisterReport)({
            sessions: [
                {
                    id: session.id,
                    branchId: session.branch_id,
                    registerName: session.branch?.name || 'Register',
                    registerNumber: session.branch?.code || '—',
                    cashierId: session.user_id,
                    cashierName: cashierName(session.user?.email),
                    openedAt: session.opened_at.toISOString(),
                    closedAt: session.closed_at ? session.closed_at.toISOString() : null,
                    opening: num(session.opening),
                    closing: session.closing == null ? null : num(session.closing),
                    status: session.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
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
            expenses: session.expenses
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
                branchId: expense.branch_id,
            })),
            customerPayments: [],
            cashIns: session.cash_movements.map((m) => ({ id: m.id, amount: num(m.amount), date: m.created_at.toISOString(), reason: m.reason, cashierName: null })),
            filters: {},
        });
        return {
            sessionId: session.id,
            status: session.status,
            expectedCash: report.cash.expectedCash,
            openingCash: report.cash.openingCash,
        };
    }
    async closeSession(cashflowId, closing, userId, role) {
        const existing = await client_2.prisma.cashFlow.findUnique({ where: { id: cashflowId } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Register session not found');
        if (existing.status === 'CLOSED' && !ADMIN_ROLES.has(role || '')) {
            throw new apiError_1.AppError(403, 'This register session is closed and cannot be modified');
        }
        const preview = await this.expectedForSession(cashflowId);
        const variance = closing - preview.expectedCash;
        const updated = await client_2.prisma.cashFlow.update({
            where: { id: cashflowId },
            data: {
                closing: new client_1.Prisma.Decimal(closing),
                expected_cash: new client_1.Prisma.Decimal(preview.expectedCash),
                variance: new client_1.Prisma.Decimal(variance),
                status: 'CLOSED',
                closed_at: new Date(),
                ...(userId ? { closed_by: userId } : {}),
            },
        });
        return updated;
    }
    // Who may reopen is decided by the "register.reopen" permission on the route.
    async reopenSession(cashflowId, _role) {
        const existing = await client_2.prisma.cashFlow.findUnique({ where: { id: cashflowId } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Register session not found');
        // Clear the previous count so a reopened drawer doesn't keep showing a
        // stale closing amount / variance until it is closed again.
        return client_2.prisma.cashFlow.update({
            where: { id: cashflowId },
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
            },
        });
    }
}
exports.RegisterReportService = RegisterReportService;
//# sourceMappingURL=register-report.service.js.map