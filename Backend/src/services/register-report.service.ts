import { ExpenseStatus, Prisma, SaleStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { localRange } from '../utils/timezone';
import {
  buildRegisterReport,
  paymentBucket,
  varianceLabel,
  ReportCustomerPayment,
  ReportExpense,
  ReportSale,
  ReportSession,
} from './register-report.calc';

export { localRange } from '../utils/timezone';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

const num = (value: unknown) => {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const cashierName = (email?: string | null) => email || '—';

export class RegisterReportService {
  async getReport(params: {
    from: string;
    to: string;
    branchId?: string;
    cashierId?: string;
    paymentMethod?: string;
    transactionType?: string;
    status?: string;
    userRole?: string;
    userBranchId?: string | null;
  }) {
    const isAdmin = ADMIN_ROLES.has(params.userRole || '');
    const branchId = isAdmin ? params.branchId || undefined : params.userBranchId || undefined;
    if (!isAdmin && !branchId) {
      throw new AppError(400, 'Your user has no register branch assigned');
    }

    const { start, end } = localRange(params.from, params.to);
    const cashierId = params.cashierId || undefined;

    const sessionWhere: Prisma.CashFlowWhereInput = {
      opened_at: { gte: start, lte: end },
      ...(branchId ? { branch_id: branchId } : {}),
      ...(cashierId ? { user_id: cashierId } : {}),
    };
    const saleWhere: Prisma.SaleWhereInput = {
      sale_date: { gte: start, lte: end },
      ...(branchId ? { branch_id: branchId } : {}),
      ...(cashierId ? { created_by: cashierId } : {}),
    };
    const expenseWhere: Prisma.ExpenseWhereInput = {
      expense_date: { gte: start, lte: end },
      status: ExpenseStatus.APPROVED,
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
      prisma.cashFlow.findMany({
        where: sessionWhere,
        include: {
          branch: { select: { id: true, name: true, code: true } },
          user: { select: { id: true, email: true } },
          closer: { select: { email: true } },
        },
        orderBy: { opened_at: 'asc' },
      }),
      prisma.sale.findMany({
        where: saleWhere,
        include: {
          customer: { select: { name: true } },
          user: { select: { id: true, email: true } },
        },
        orderBy: { sale_date: 'desc' },
      }),
      prisma.expense.findMany({
        where: expenseWhere,
        include: { creator: { select: { id: true, email: true } } },
        orderBy: { expense_date: 'desc' },
      }),
      prisma.customerPayment.findMany({
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
      prisma.branch.findMany({
        where: branchId ? { id: branchId } : { is_active: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
      prisma.user.findMany({
        where: branchId ? { branch_id: branchId } : undefined,
        select: { id: true, email: true, role: true },
        orderBy: { email: 'asc' },
      }),
    ]);

    const sessions: ReportSession[] = sessionsRaw.map((session) => ({
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

    const sales: ReportSale[] = salesRaw.map((sale) => ({
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
      status: sale.status,
      originalSaleId: sale.original_sale_id,
      notes: sale.notes,
    }));

    const expenses: ReportExpense[] = expensesRaw.map((expense) => ({
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

    const customerPayments: ReportCustomerPayment[] = paymentsRaw.map((payment) => ({
      id: payment.id,
      amount: payment.type === 'REFUND' ? -num(payment.amount) : num(payment.amount),
      date: payment.payment_date.toISOString(),
      method: payment.method,
      customerName: payment.customer?.name || null,
      cashierId: payment.created_by,
      cashierName: cashierName(payment.user?.email),
      reference: payment.reference,
    }));

    const report = buildRegisterReport({
      sessions,
      sales,
      expenses,
      customerPayments,
      filters: {
        paymentMethod: params.paymentMethod,
        transactionType: params.transactionType,
        status: params.status,
      },
    });

    const registerStatus =
      sessions.length === 0 ? 'NONE' : sessions.some((session) => session.status === 'OPEN') ? 'OPEN' : 'CLOSED';

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
        varianceLabel: varianceLabel(sessionVariance),
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

  async expectedForSession(cashflowId: string) {
    const session = await prisma.cashFlow.findUnique({
      where: { id: cashflowId },
      include: {
        branch: { select: { name: true, code: true } },
        user: { select: { email: true } },
        expenses: true,
      },
    });
    if (!session) throw new AppError(404, 'Register session not found');

    const end = session.closed_at || new Date();
    const sales = await prisma.sale.findMany({
      where: {
        branch_id: session.branch_id || undefined,
        sale_date: { gte: session.opened_at, lte: end },
        status: { notIn: [SaleStatus.CANCELLED, SaleStatus.PENDING] },
      },
    });

    const report = buildRegisterReport({
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
      filters: {},
    });

    return {
      sessionId: session.id,
      status: session.status,
      expectedCash: report.cash.expectedCash,
      openingCash: report.cash.openingCash,
    };
  }

  async closeSession(cashflowId: string, closing: number, userId?: string, role?: string) {
    const existing = await prisma.cashFlow.findUnique({ where: { id: cashflowId } });
    if (!existing) throw new AppError(404, 'Register session not found');
    if (existing.status === 'CLOSED' && !ADMIN_ROLES.has(role || '')) {
      throw new AppError(403, 'This register session is closed and cannot be modified');
    }

    const preview = await this.expectedForSession(cashflowId);
    const variance = closing - preview.expectedCash;
    const updated = await prisma.cashFlow.update({
      where: { id: cashflowId },
      data: {
        closing: new Prisma.Decimal(closing),
        expected_cash: new Prisma.Decimal(preview.expectedCash),
        variance: new Prisma.Decimal(variance),
        status: 'CLOSED',
        closed_at: new Date(),
        ...(userId ? { closed_by: userId } : {}),
      },
    });
    return updated;
  }

  async reopenSession(cashflowId: string, role?: string) {
    if (!ADMIN_ROLES.has(role || '')) {
      throw new AppError(403, 'Only a manager or admin can reopen a register session');
    }
    const existing = await prisma.cashFlow.findUnique({ where: { id: cashflowId } });
    if (!existing) throw new AppError(404, 'Register session not found');
    // Clear the previous count so a reopened drawer doesn't keep showing a
    // stale closing amount / variance until it is closed again.
    return prisma.cashFlow.update({
      where: { id: cashflowId },
      data: {
        status: 'OPEN',
        closed_at: null,
        closing: null,
        expected_cash: null,
        variance: null,
        closed_by: null,
      },
    });
  }
}

export { paymentBucket };
