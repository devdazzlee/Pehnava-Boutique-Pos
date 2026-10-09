import { PaymentMethod, Prisma, SaleStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { localRange } from './purchase-report.service';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);
const VIEWS = new Set(['revenue', 'cash', 'credit', 'expenses']);
/** Max rows returned when fetch_all=true or when limit is at the cap. */
export const DAY_REPORT_MAX_ROWS = 5000;

const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const isRegenerated = (notes?: string | null) => {
  const text = (notes || '').toLowerCase();
  return text.includes('[regenerated]') || text.includes('regenerated bill');
};

export type DayReportView = 'revenue' | 'cash' | 'credit' | 'expenses';

export class DayReportService {
  async report(params: {
    from: string;
    to: string;
    view: string;
    search?: string;
    page?: number;
    limit?: number;
    fetchAll?: boolean;
    branchId?: string;
    userRole?: string;
    userBranchId?: string | null;
  }) {
    const view = (params.view || 'revenue').toLowerCase() as DayReportView;
    if (!VIEWS.has(view)) throw new AppError(400, 'Invalid view');

    const isAdmin = ADMIN_ROLES.has(params.userRole || '');
    // Admins: only filter when a branch is explicitly selected.
    // Non-admins: always scoped to their assigned branch.
    const branchId = isAdmin
      ? params.branchId || undefined
      : params.userBranchId || undefined;
    if (!isAdmin && !branchId) {
      throw new AppError(400, 'Your account is not assigned to a branch');
    }

    const fetchAll = Boolean(params.fetchAll);
    const page = fetchAll ? 1 : Math.max(1, Number(params.page || 1));
    const limit = fetchAll
      ? DAY_REPORT_MAX_ROWS
      : Math.min(DAY_REPORT_MAX_ROWS, Math.max(1, Number(params.limit || 20)));
    const skip = fetchAll ? 0 : (page - 1) * limit;
    const search = (params.search || '').trim();
    const { start, end } = localRange(params.from, params.to);

    const branches = await prisma.branch.findMany({
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
        fetchAll,
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
      fetchAll,
      branches,
      scopeLabel,
      isAdmin,
    });
  }

  private async salesReport(input: {
    view: Exclude<DayReportView, 'expenses'>;
    start: Date;
    end: Date;
    from: string;
    to: string;
    branchId?: string;
    search: string;
    page: number;
    limit: number;
    skip: number;
    fetchAll: boolean;
    branches: { id: string; name: string; code: string }[];
    scopeLabel: string;
    isAdmin: boolean;
  }) {
    const saleWhere: Prisma.SaleWhereInput = {
      sale_date: { gte: input.start, lte: input.end },
      status: { notIn: [SaleStatus.CANCELLED, SaleStatus.PENDING] },
      ...(input.branchId ? { branch_id: input.branchId } : {}),
    };

    if (input.view === 'cash') {
      saleWhere.AND = [{ OR: [{ payment_method: PaymentMethod.CASH }, { payments: { some: { method: PaymentMethod.CASH } } }] }];
    } else if (input.view === 'credit') {
      saleWhere.AND = [{ OR: [{ payment_method: PaymentMethod.CREDIT }, { payments: { some: { method: PaymentMethod.CREDIT } } }] }];
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
      prisma.sale.findMany({
        where: saleWhere,
        include: {
          customer: { select: { id: true, name: true, phone_number: true } },
          branch: { select: { id: true, name: true, code: true } },
        },
        orderBy: { sale_date: 'desc' },
        skip: input.skip,
        take: input.limit,
      }),
      prisma.sale.count({ where: saleWhere }),
      input.view === 'cash'
        ? prisma.customerPayment.aggregate({
            where: {
              payment_date: { gte: input.start, lte: input.end },
              method: { equals: 'CASH', mode: 'insensitive' },
              amount: { gt: 0 },
              type: { in: ['PAYMENT', 'ADVANCE'] },
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
        type: 'SALE' as const,
        reference: sale.invoice_number || sale.sale_number,
        customer: sale.customer?.name || 'Walk-in Customer',
        paymentMethod: sale.payment_method,
        status: sale.payment_status || sale.status,
        date: sale.sale_date.toISOString(),
        amount: round2(num(sale.total_amount)),
        branch: sale.branch,
        details: String(sale.payment_method),
      }));

    const allSales = await prisma.sale.findMany({
      where: saleWhere,
      select: { total_amount: true, notes: true, payment_method: true, payments: { select: { method: true, amount: true } } },
    });
    const validSales = allSales.filter((sale) => !isRegenerated(sale.notes));
    const salesTotal = round2(validSales.reduce((sum, sale) => sum + num(sale.total_amount), 0));
    const paymentsTotal = round2(num(cashPaymentsAgg._sum.amount));
    const paymentEntries = cashPaymentsAgg._count.id;
    const periodTotal =
      input.view === 'cash' ? round2(salesTotal + paymentsTotal) : salesTotal;
    const entries =
      input.view === 'cash' ? validSales.length + paymentEntries : validSales.length;
    const average = entries > 0 ? round2(periodTotal / entries) : 0;
    const amounts = validSales.map((s) => num(s.total_amount));
    const highest = amounts.length ? round2(Math.max(...amounts)) : 0;

    // Portion of each bill paid by a tender (split bills count only their share).
    const tenderShare = (sale: (typeof validSales)[number], method: string) => {
      const parts = sale.payments.filter((p) => num(p.amount) > 0);
      if (parts.length > 1) {
        const paid = parts.reduce((t, p) => t + num(p.amount), 0);
        const own = parts.filter((p) => String(p.method) === method).reduce((t, p) => t + num(p.amount), 0);
        return paid > 0 ? (num(sale.total_amount) * own) / paid : 0;
      }
      return String(sale.payment_method) === method ? num(sale.total_amount) : 0;
    };
    const cashShare = round2(validSales.reduce((sum, s) => sum + tenderShare(s, 'CASH'), 0));
    const creditShare = round2(validSales.reduce((sum, s) => sum + tenderShare(s, 'CREDIT'), 0));

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
      pagination: this.paginationMeta({
        fetchAll: input.fetchAll,
        page: input.page,
        limit: input.limit,
        total: totalCount,
        rowCount: saleRows.length,
      }),
    };
  }

  private paginationMeta(input: {
    fetchAll: boolean;
    page: number;
    limit: number;
    total: number;
    rowCount: number;
  }) {
    if (input.fetchAll) {
      return {
        page: 1,
        limit: input.rowCount,
        total: input.total,
        totalPages: 1,
        fetchAll: true as const,
      };
    }
    return {
      page: input.page,
      limit: input.limit,
      total: input.total,
      totalPages: Math.max(1, Math.ceil(input.total / input.limit)),
      fetchAll: false as const,
    };
  }

  private async expensesReport(input: {
    start: Date;
    end: Date;
    from: string;
    to: string;
    branchId?: string;
    search: string;
    page: number;
    limit: number;
    skip: number;
    fetchAll: boolean;
    branches: { id: string; name: string; code: string }[];
    scopeLabel: string;
    isAdmin: boolean;
  }) {
    const where: Prisma.ExpenseWhereInput = {
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
      prisma.expense.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true, code: true } },
        },
        orderBy: { expense_date: 'desc' },
        skip: input.skip,
        take: input.limit,
      }),
      prisma.expense.count({ where }),
      prisma.expense.aggregate({
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
      view: 'expenses' as const,
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
        type: 'EXPENSE' as const,
        reference: expense.particular,
        customer: expense.vendor || expense.category?.name || '—',
        paymentMethod: expense.payment_method,
        status: expense.status,
        date: expense.expense_date.toISOString(),
        // The expense date is a day; the time it was entered is more useful to show.
        enteredAt: expense.created_at.toISOString(),
        amount: round2(Math.abs(num(expense.amount))),
        branch: expense.branch,
        details: expense.notes || expense.particular,
        particular: expense.particular,
        description: expense.notes || expense.vendor || expense.category?.name || '—',
      })),
      pagination: this.paginationMeta({
        fetchAll: input.fetchAll,
        page: input.page,
        limit: input.limit,
        total: totalCount,
        rowCount: expenses.length,
      }),
    };
  }
}
