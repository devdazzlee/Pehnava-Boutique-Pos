"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DayReportService = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const purchase_report_service_1 = require("./purchase-report.service");
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);
const VIEWS = new Set(['revenue', 'cash', 'credit', 'expenses']);
const num = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const isRegenerated = (notes) => {
    const text = (notes || '').toLowerCase();
    return text.includes('[regenerated]') || text.includes('regenerated bill');
};
class DayReportService {
    async report(params) {
        const view = (params.view || 'revenue').toLowerCase();
        if (!VIEWS.has(view))
            throw new apiError_1.AppError(400, 'Invalid view');
        const isAdmin = ADMIN_ROLES.has(params.userRole || '');
        // Admins: only filter when a branch is explicitly selected.
        // Non-admins: always scoped to their assigned branch.
        const branchId = isAdmin
            ? params.branchId || undefined
            : params.userBranchId || undefined;
        if (!isAdmin && !branchId) {
            throw new apiError_1.AppError(400, 'Your account is not assigned to a branch');
        }
        const page = Math.max(1, Number(params.page || 1));
        const limit = Math.min(100, Math.max(1, Number(params.limit || 20)));
        const skip = (page - 1) * limit;
        const search = (params.search || '').trim();
        const { start, end } = (0, purchase_report_service_1.localRange)(params.from, params.to);
        const branches = await client_2.prisma.branch.findMany({
            where: { is_active: true },
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' },
        });
        const scopeLabel = branchId
            ? branches.find((b) => b.id === branchId)?.name || 'Branch'
            : 'All locations';
        if (view === 'expenses') {
            return this.expensesReport({
                start,
                end,
                from: params.from,
                to: params.to,
                branchId,
                search,
                page,
                limit,
                skip,
                branches,
                scopeLabel,
                isAdmin,
            });
        }
        return this.salesReport({
            view,
            start,
            end,
            from: params.from,
            to: params.to,
            branchId,
            search,
            page,
            limit,
            skip,
            branches,
            scopeLabel,
            isAdmin,
        });
    }
    async salesReport(input) {
        const saleWhere = {
            sale_date: { gte: input.start, lte: input.end },
            status: { notIn: [client_1.SaleStatus.CANCELLED, client_1.SaleStatus.PENDING] },
            ...(input.branchId ? { branch_id: input.branchId } : {}),
        };
        if (input.view === 'cash') {
            saleWhere.payment_method = client_1.PaymentMethod.CASH;
        }
        else if (input.view === 'credit') {
            saleWhere.payment_method = client_1.PaymentMethod.CREDIT;
        }
        if (input.search) {
            saleWhere.OR = [
                { sale_number: { contains: input.search, mode: 'insensitive' } },
                { invoice_number: { contains: input.search, mode: 'insensitive' } },
                { customer: { name: { contains: input.search, mode: 'insensitive' } } },
                { customer: { phone_number: { contains: input.search, mode: 'insensitive' } } },
            ];
        }
        const [sales, totalCount, cashPaymentsAgg] = await Promise.all([
            client_2.prisma.sale.findMany({
                where: saleWhere,
                include: {
                    customer: { select: { id: true, name: true, phone_number: true } },
                    branch: { select: { id: true, name: true, code: true } },
                },
                orderBy: { sale_date: 'desc' },
                skip: input.skip,
                take: input.limit,
            }),
            client_2.prisma.sale.count({ where: saleWhere }),
            input.view === 'cash'
                ? client_2.prisma.customerPayment.aggregate({
                    where: {
                        payment_date: { gte: input.start, lte: input.end },
                        method: { equals: 'CASH', mode: 'insensitive' },
                        amount: { gt: 0 },
                    },
                    _sum: { amount: true },
                    _count: { id: true },
                })
                : Promise.resolve({ _sum: { amount: null }, _count: { id: 0 } }),
        ]);
        const saleRows = sales
            .filter((sale) => !isRegenerated(sale.notes))
            .map((sale) => ({
            id: sale.id,
            type: 'SALE',
            reference: sale.invoice_number || sale.sale_number,
            customer: sale.customer?.name || 'Walk-in Customer',
            paymentMethod: sale.payment_method,
            status: sale.payment_status || sale.status,
            date: sale.sale_date.toISOString(),
            amount: round2(num(sale.total_amount)),
            branch: sale.branch,
            details: String(sale.payment_method),
        }));
        const allSales = await client_2.prisma.sale.findMany({
            where: saleWhere,
            select: { total_amount: true, notes: true, payment_method: true },
        });
        const validSales = allSales.filter((sale) => !isRegenerated(sale.notes));
        const salesTotal = round2(validSales.reduce((sum, sale) => sum + num(sale.total_amount), 0));
        const paymentsTotal = round2(num(cashPaymentsAgg._sum.amount));
        const paymentEntries = cashPaymentsAgg._count.id;
        const periodTotal = input.view === 'cash' ? round2(salesTotal + paymentsTotal) : salesTotal;
        const entries = input.view === 'cash' ? validSales.length + paymentEntries : validSales.length;
        const average = entries > 0 ? round2(periodTotal / entries) : 0;
        const amounts = validSales.map((s) => num(s.total_amount));
        const highest = amounts.length ? round2(Math.max(...amounts)) : 0;
        const cashShare = round2(validSales
            .filter((s) => String(s.payment_method) === 'CASH')
            .reduce((sum, s) => sum + num(s.total_amount), 0));
        const creditShare = round2(validSales
            .filter((s) => String(s.payment_method) === 'CREDIT')
            .reduce((sum, s) => sum + num(s.total_amount), 0));
        return {
            view: input.view,
            period: { from: input.from, to: input.to },
            branchId: input.branchId || null,
            branches: input.branches,
            scopeLabel: input.scopeLabel,
            isAdmin: input.isAdmin,
            summary: {
                periodTotal,
                entries,
                average,
                highest,
                cashShare,
                creditShare,
                salesTotal,
                paymentsTotal,
            },
            rows: saleRows,
            pagination: {
                page: input.page,
                limit: input.limit,
                total: totalCount,
                totalPages: Math.max(1, Math.ceil(totalCount / input.limit)),
            },
        };
    }
    async expensesReport(input) {
        const where = {
            expense_date: { gte: input.start, lte: input.end },
            status: 'APPROVED',
            ...(input.branchId ? { branch_id: input.branchId } : {}),
        };
        if (input.search) {
            where.OR = [
                { particular: { contains: input.search, mode: 'insensitive' } },
                { notes: { contains: input.search, mode: 'insensitive' } },
                { vendor: { contains: input.search, mode: 'insensitive' } },
            ];
        }
        const [expenses, totalCount, aggregate] = await Promise.all([
            client_2.prisma.expense.findMany({
                where,
                include: {
                    category: { select: { id: true, name: true } },
                    branch: { select: { id: true, name: true, code: true } },
                },
                orderBy: { expense_date: 'desc' },
                skip: input.skip,
                take: input.limit,
            }),
            client_2.prisma.expense.count({ where }),
            client_2.prisma.expense.aggregate({
                where,
                _sum: { amount: true },
                _avg: { amount: true },
                _max: { amount: true },
                _count: { id: true },
            }),
        ]);
        const periodTotal = round2(Math.abs(num(aggregate._sum.amount)));
        const entries = aggregate._count.id;
        const average = round2(Math.abs(num(aggregate._avg.amount)));
        const highest = round2(Math.abs(num(aggregate._max.amount)));
        return {
            view: 'expenses',
            period: { from: input.from, to: input.to },
            branchId: input.branchId || null,
            branches: input.branches,
            scopeLabel: input.scopeLabel,
            isAdmin: input.isAdmin,
            summary: {
                periodTotal,
                entries,
                average,
                highest,
                cashShare: 0,
                creditShare: 0,
                salesTotal: 0,
                paymentsTotal: 0,
            },
            rows: expenses.map((expense) => ({
                id: expense.id,
                type: 'EXPENSE',
                reference: expense.particular,
                customer: expense.vendor || expense.category?.name || '—',
                paymentMethod: expense.payment_method,
                status: expense.status,
                date: expense.expense_date.toISOString(),
                amount: round2(Math.abs(num(expense.amount))),
                branch: expense.branch,
                details: expense.notes || expense.particular,
                particular: expense.particular,
                description: expense.notes || expense.vendor || expense.category?.name || '—',
            })),
            pagination: {
                page: input.page,
                limit: input.limit,
                total: totalCount,
                totalPages: Math.max(1, Math.ceil(totalCount / input.limit)),
            },
        };
    }
}
exports.DayReportService = DayReportService;
//# sourceMappingURL=day-report.service.js.map