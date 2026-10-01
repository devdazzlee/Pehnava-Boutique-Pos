import { prisma } from '../prisma/client';
import { businessDayRange, businessTodayRange, localRange } from '../utils/timezone';

export class CashFlowService {
  async getCashFlowByDate(branch_id: string, date: string) {
    const { start: startOfDay, end: endOfDay } = localRange(date, date);

    const cashFlow = await prisma.cashFlow.findFirst({
      where: {
        branch_id,
        opened_at: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: { expenses: true },
    });

    if (!cashFlow) {
      return { exists: false, data: null };
    }

    return { exists: true, data: cashFlow };
  }

  async createOpeningCashFlow(data: { opening: number; sales: number; branch_id: string; user_id?: string }) {
    const cashFlow = await prisma.cashFlow.create({
      data: {
        opening: data.opening,
        sales: data.sales,
        closing: null,
        branch_id: data.branch_id,
        user_id: data.user_id,
        status: 'OPEN',
        opened_at: new Date(),
      },
    });

    return cashFlow;
  }

  async addExpense(data: {
    cashflow_id: string;
    particular: string;
    amount: number;
  }) {
    const expense = await prisma.expense.create({
      data: {
        particular: data.particular,
        amount: data.amount,
        cashflow_id: data.cashflow_id,
        // Petty cash already left the drawer — it is not part of the approval
        // queue in the Expenses module.
        payment_method: 'CASH',
        status: 'APPROVED',
        approved_at: new Date(),
      },
    });

    return expense;
  }

  async addClosing(cashflow_id: string, closing: number, userId?: string, role?: string) {
    const { RegisterReportService } = await import('./register-report.service');
    return new RegisterReportService().closeSession(cashflow_id, closing, userId, role);
  }

  async listCashFlows({
    page = 1,
    limit = 10,
    branch_id,
  }: {
    page?: number;
    limit?: number;
    branch_id?: string;
  }) {
    const whereClause = branch_id ? { branch_id } : {};

    const [cashFlows, total] = await Promise.all([
      prisma.cashFlow.findMany({
        where: whereClause,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: { expenses: true },
      }),
      prisma.cashFlow.count({ where: whereClause }),
    ]);

    return {
      data: cashFlows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOpenDrawer(branch_id: string) {
    const { start: startOfDay, end: endOfDay } = businessTodayRange();

    return prisma.cashFlow.findFirst({
      where: {
        branch_id,
        status: 'OPEN',
        opened_at: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });
  }

  async findAnyDrawerToday(branch_id: string) {
    const { start: startOfDay, end: endOfDay } = businessTodayRange();

    return prisma.cashFlow.findFirst({
      where: {
        branch_id,
        opened_at: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });
  }

  async getExpensesByDate(branch_id: string, date?: string) {
    // First, try to find the currently open drawer for this branch
    let cashFlow = await prisma.cashFlow.findFirst({
      where: {
        branch_id,
        status: 'OPEN',
      },
      include: { expenses: true },
    });

    if (cashFlow) {
      return cashFlow.expenses || [];
    }

    const { start: startOfDay, end: endOfDay } = date
      ? businessDayRange(date, date)
      : businessTodayRange();

    cashFlow = await prisma.cashFlow.findFirst({
      where: {
        branch_id,
        opened_at: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: { expenses: true },
    });

    return cashFlow?.expenses || [];
  }
}
