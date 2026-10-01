import { SaleItemType, SaleStatus, PaymentMethod } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { localRange } from './purchase-report.service';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);
const INCLUDED_STATUSES: SaleStatus[] = ['COMPLETED', 'REFUNDED', 'EXCHANGED'];

const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const isRegenerated = (notes?: string | null) => {
  const text = (notes || '').toLowerCase();
  return text.includes('[regenerated]') || text.includes('regenerated bill');
};

const cashierLabel = (email?: string | null) => {
  if (!email) return 'Unknown';
  return email.includes('@') ? email.split('@')[0] : email;
};

const ymd = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

type Snapshot = {
  grossSales: number;
  discounts: number;
  returns: number;
  tax: number;
  netRevenue: number;
  cogs: number;
  billCount: number;
  operatingExpenses: number;
  salaryExpense: number;
  purchaseSpend: number;
  purchaseReturnValue: number;
  grossProfit: number;
  netProfit: number;
  marginPercent: number;
  expenseByCategory: { name: string; amount: number; count: number }[];
  byBranch: { id: string; name: string; code: string; revenue: number; cogs: number; bills: number; grossProfit: number }[];
  byPaymentMethod: { method: string; revenue: number; bills: number }[];
  byCashier: { id: string; name: string; revenue: number; bills: number; cogs: number; grossProfit: number }[];
  monthly: {
    month: string;
    label: string;
    revenue: number;
    cogs: number;
    expenses: number;
    grossProfit: number;
    netProfit: number;
    bills: number;
  }[];
  lines: { label: string; amount: number; section: string; emphasis?: boolean }[];
  pnlLines: { label: string; amount: number; section: string; emphasis?: boolean }[];
};

export class FinancialStatementService {
  async statement(params: {
    from: string;
    to: string;
    branchId?: string;
    paymentMethod?: string;
    cashierId?: string;
    categoryId?: string;
    saleType?: string;
    includeSalaries?: boolean;
    includePurchases?: boolean;
    comparePrevious?: boolean;
    userRole?: string;
    userBranchId?: string | null;
  }) {
    const isAdmin = ADMIN_ROLES.has(params.userRole || '');
    const includeSalaries = params.includeSalaries !== false;
    const includePurchases = params.includePurchases !== false;
    const saleType = (params.saleType || 'ALL').toUpperCase();
    const paymentMethod =
      params.paymentMethod && params.paymentMethod !== 'ALL'
        ? params.paymentMethod.toUpperCase()
        : undefined;
    const comparePrevious = params.comparePrevious === true;

    const [branches, expenseCategories, cashiers] = await Promise.all([
      prisma.branch.findMany({
        where: { is_active: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
      prisma.expenseCategory.findMany({
        where: { is_active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.user.findMany({
        select: { id: true, email: true, role: true },
        orderBy: { email: 'asc' },
      }),
    ]);

    let branchId = isAdmin ? params.branchId || params.userBranchId || undefined : params.userBranchId || undefined;
    if (!isAdmin && !branchId) {
      throw new AppError(400, 'Your account is not assigned to a branch');
    }

    const current = await this.buildSnapshot({
      from: params.from,
      to: params.to,
      branchId,
      paymentMethod,
      cashierId: params.cashierId,
      categoryId: params.categoryId,
      saleType,
      includeSalaries,
      includePurchases,
    });

    let previous: (Snapshot & { period: { from: string; to: string } }) | null = null;
    if (comparePrevious) {
      const { start, end } = localRange(params.from, params.to);
      const duration = end.getTime() - start.getTime();
      const prevEnd = new Date(start.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - duration);
      const prevFrom = ymd(prevStart);
      const prevTo = ymd(prevEnd);
      const prevSnap = await this.buildSnapshot({
        from: prevFrom,
        to: prevTo,
        branchId,
        paymentMethod,
        cashierId: params.cashierId,
        categoryId: params.categoryId,
        saleType,
        includeSalaries,
        includePurchases,
      });
      previous = { ...prevSnap, period: { from: prevFrom, to: prevTo } };
    }

    const change = (currentValue: number, previousValue: number) => {
      const delta = round2(currentValue - previousValue);
      const percent =
        previousValue === 0
          ? currentValue === 0
            ? 0
            : 100
          : round2((delta / Math.abs(previousValue)) * 100);
      return { delta, percent };
    };

    return {
      period: { from: params.from, to: params.to },
      branchId: branchId || null,
      filters: {
        paymentMethod: paymentMethod || 'ALL',
        cashierId: params.cashierId || null,
        categoryId: params.categoryId || null,
        saleType,
        includeSalaries,
        includePurchases,
        comparePrevious,
      },
      branches,
      expenseCategories,
      cashiers: cashiers.map((user) => ({
        id: user.id,
        name: cashierLabel(user.email),
        email: user.email,
        role: user.role,
      })),
      paymentMethods: Object.values(PaymentMethod),
      income: {
        grossSales: current.grossSales,
        discounts: current.discounts,
        returns: current.returns,
        tax: current.tax,
        netRevenue: current.netRevenue,
        billCount: current.billCount,
      },
      cogs: {
        soldCost: current.cogs,
        purchasesInPeriod: current.purchaseSpend,
        purchaseReturnsInPeriod: current.purchaseReturnValue,
        method: 'sold_items_x_purchase_rate',
      },
      grossProfit: current.grossProfit,
      marginPercent: current.marginPercent,
      expenses: {
        operating: round2(current.operatingExpenses - current.salaryExpense),
        salaries: current.salaryExpense,
        total: current.operatingExpenses,
        byCategory: current.expenseByCategory,
      },
      netProfit: current.netProfit,
      byBranch: current.byBranch,
      byPaymentMethod: current.byPaymentMethod,
      byCashier: current.byCashier,
      lines: current.lines,
      pnl: {
        lines: current.pnlLines,
        monthly: current.monthly,
        operatingProfit: round2(current.grossProfit - current.operatingExpenses),
        netMarginPercent:
          current.netRevenue > 0 ? round2((current.netProfit / current.netRevenue) * 100) : 0,
      },
      previous: previous
        ? {
            period: previous.period,
            income: {
              grossSales: previous.grossSales,
              discounts: previous.discounts,
              returns: previous.returns,
              tax: previous.tax,
              netRevenue: previous.netRevenue,
              billCount: previous.billCount,
            },
            cogs: { soldCost: previous.cogs },
            grossProfit: previous.grossProfit,
            expenses: { total: previous.operatingExpenses },
            netProfit: previous.netProfit,
            marginPercent: previous.marginPercent,
            lines: previous.pnlLines,
            comparison: {
              netRevenue: change(current.netRevenue, previous.netRevenue),
              grossProfit: change(current.grossProfit, previous.grossProfit),
              expenses: change(current.operatingExpenses, previous.operatingExpenses),
              netProfit: change(current.netProfit, previous.netProfit),
            },
          }
        : null,
    };
  }

  private async buildSnapshot(params: {
    from: string;
    to: string;
    branchId?: string;
    paymentMethod?: string;
    cashierId?: string;
    categoryId?: string;
    saleType: string;
    includeSalaries: boolean;
    includePurchases: boolean;
  }): Promise<Snapshot> {
    const { start, end } = localRange(params.from, params.to);
    const paymentMethod = params.paymentMethod as PaymentMethod | undefined;

    const saleWhere: Record<string, unknown> = {
      sale_date: { gte: start, lte: end },
      status: { in: INCLUDED_STATUSES },
      ...(params.branchId ? { branch_id: params.branchId } : {}),
      ...(params.cashierId ? { created_by: params.cashierId } : {}),
      ...(paymentMethod ? { payment_method: paymentMethod } : {}),
    };
    if (params.saleType === 'SALES') saleWhere.original_sale_id = null;
    if (params.saleType === 'RETURNS') saleWhere.original_sale_id = { not: null };

    const [sales, expenses, salaries, purchases, purchaseReturns] = await Promise.all([
      prisma.sale.findMany({
        where: saleWhere,
        include: {
          sale_items: {
            include: {
              product: { select: { id: true, name: true, purchase_rate: true, sku: true } },
            },
          },
          branch: { select: { id: true, name: true, code: true } },
          user: { select: { id: true, email: true } },
        },
        orderBy: { sale_date: 'asc' },
      }),
      prisma.expense.findMany({
        where: {
          expense_date: { gte: start, lte: end },
          status: 'APPROVED',
          ...(params.branchId ? { branch_id: params.branchId } : {}),
          ...(params.categoryId ? { category_id: params.categoryId } : {}),
        },
        include: { category: { select: { id: true, name: true } } },
        orderBy: { expense_date: 'asc' },
      }),
      params.includeSalaries
        ? prisma.salary.findMany({
            where: { is_paid: true, paid_date: { gte: start, lte: end } },
            include: { employee: { select: { id: true, name: true } } },
            orderBy: { paid_date: 'asc' },
          })
        : Promise.resolve([]),
      params.includePurchases
        ? prisma.purchase.findMany({
            where: {
              purchase_date: { gte: start, lte: end },
              ...(params.branchId ? { warehouse_branch_id: params.branchId } : {}),
            },
            select: { quantity: true, cost_price: true },
          })
        : Promise.resolve([]),
      params.includePurchases
        ? prisma.purchaseReturn.findMany({
            where: {
              return_date: { gte: start, lte: end },
              status: { not: 'CANCELLED' },
              ...(params.branchId ? { branch_id: params.branchId } : {}),
            },
            include: { items: { select: { quantity: true, total_cost: true, unit_cost: true } } },
          })
        : Promise.resolve([]),
    ]);

    let grossSales = 0;
    let discounts = 0;
    let tax = 0;
    let returns = 0;
    let netRevenue = 0;
    let cogs = 0;
    let billCount = 0;
    const byBranch = new Map<
      string,
      { id: string; name: string; code: string; revenue: number; cogs: number; bills: number }
    >();
    const byPayment = new Map<string, { method: string; revenue: number; bills: number }>();
    const byCashier = new Map<
      string,
      { id: string; name: string; revenue: number; bills: number; cogs: number }
    >();
    const monthly = new Map<
      string,
      { month: string; label: string; revenue: number; cogs: number; expenses: number; bills: number }
    >();

    const ensureMonth = (date: Date) => {
      const key = monthKey(date);
      if (!monthly.has(key)) {
        monthly.set(key, {
          month: key,
          label: date.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
          revenue: 0,
          cogs: 0,
          expenses: 0,
          bills: 0,
        });
      }
      return monthly.get(key)!;
    };

    for (const sale of sales) {
      if (isRegenerated(sale.notes)) continue;
      billCount += 1;
      discounts += num(sale.discount_amount);
      tax += num(sale.tax_amount);

      const monthRow = ensureMonth(sale.sale_date);
      monthRow.bills += 1;

      const method = String(sale.payment_method || 'OTHER');
      if (!byPayment.has(method)) byPayment.set(method, { method, revenue: 0, bills: 0 });
      const paymentRow = byPayment.get(method)!;
      paymentRow.bills += 1;

      const cashierId = sale.created_by || 'unknown';
      if (!byCashier.has(cashierId)) {
        byCashier.set(cashierId, {
          id: cashierId,
          name: cashierLabel(sale.user?.email),
          revenue: 0,
          bills: 0,
          cogs: 0,
        });
      }
      const cashierRow = byCashier.get(cashierId)!;
      cashierRow.bills += 1;

      const branchKey = sale.branch_id || 'all';
      if (!byBranch.has(branchKey)) {
        byBranch.set(branchKey, {
          id: sale.branch_id || 'all',
          name: sale.branch?.name || 'All locations',
          code: sale.branch?.code || '—',
          revenue: 0,
          cogs: 0,
          bills: 0,
        });
      }
      const branchRow = byBranch.get(branchKey)!;
      branchRow.bills += 1;

      for (const item of sale.sale_items) {
        const line = num(item.line_total);
        const qty = num(item.quantity);
        const cost = round2(num(item.product.purchase_rate) * qty);

        if (item.item_type === SaleItemType.RETURN || line < 0 || qty < 0) {
          returns += Math.abs(line);
          netRevenue += line;
          cogs += cost;
          branchRow.revenue += line;
          branchRow.cogs += cost;
          paymentRow.revenue += line;
          cashierRow.revenue += line;
          cashierRow.cogs += cost;
          monthRow.revenue += line;
          monthRow.cogs += cost;
        } else {
          grossSales += Math.abs(line);
          netRevenue += line;
          cogs += cost;
          branchRow.revenue += line;
          branchRow.cogs += cost;
          paymentRow.revenue += line;
          cashierRow.revenue += line;
          cashierRow.cogs += cost;
          monthRow.revenue += line;
          monthRow.cogs += cost;
        }
      }
    }

    const purchaseSpend = round2(
      purchases.reduce((sum, row) => sum + num(row.quantity) * num(row.cost_price), 0),
    );
    const purchaseReturnValue = round2(
      purchaseReturns.reduce(
        (sum, row) =>
          sum +
          row.items.reduce((inner, item) => {
            const total = num(item.total_cost);
            if (total) return inner + Math.abs(total);
            return inner + Math.abs(num(item.quantity) * num(item.unit_cost));
          }, 0),
        0,
      ),
    );

    const expenseByCategory = new Map<string, { name: string; amount: number; count: number }>();
    let operatingExpenses = 0;
    for (const expense of expenses) {
      const amount = Math.abs(num(expense.amount));
      operatingExpenses += amount;
      const key = expense.category?.id || 'uncategorized';
      const name = expense.category?.name || 'Uncategorized';
      const row = expenseByCategory.get(key) || { name, amount: 0, count: 0 };
      row.amount += amount;
      row.count += 1;
      expenseByCategory.set(key, row);
      ensureMonth(expense.expense_date).expenses += amount;
    }

    const salaryExpense = round2(
      salaries.reduce((sum, row) => sum + Math.abs(num(row.amount)), 0),
    );
    operatingExpenses = round2(operatingExpenses + salaryExpense);
    if (salaryExpense > 0) {
      const row = expenseByCategory.get('salaries') || { name: 'Salaries', amount: 0, count: 0 };
      row.amount += salaryExpense;
      row.count += salaries.length;
      expenseByCategory.set('salaries', row);
      for (const salary of salaries) {
        if (salary.paid_date) ensureMonth(salary.paid_date).expenses += Math.abs(num(salary.amount));
      }
    }

    const grossProfit = round2(netRevenue - cogs);
    const netProfit = round2(grossProfit - operatingExpenses);
    const margin = netRevenue > 0 ? round2((grossProfit / netRevenue) * 100) : 0;
    const categories = [...expenseByCategory.values()]
      .map((row) => ({ ...row, amount: round2(row.amount) }))
      .sort((a, b) => b.amount - a.amount);

    const lines = [
      { label: 'Gross sales', amount: round2(grossSales), section: 'income' },
      { label: 'Less: discounts', amount: -round2(discounts), section: 'income' },
      { label: 'Less: returns', amount: -round2(returns), section: 'income' },
      { label: 'Net revenue', amount: round2(netRevenue), section: 'income', emphasis: true },
      { label: 'Cost of goods sold', amount: -round2(cogs), section: 'cogs' },
      { label: 'Gross profit', amount: grossProfit, section: 'gross', emphasis: true },
      ...categories.map((row) => ({
        label: row.name,
        amount: -round2(row.amount),
        section: 'expense' as const,
      })),
      {
        label: 'Total operating expenses',
        amount: -operatingExpenses,
        section: 'expense',
        emphasis: true,
      },
      { label: 'Net profit', amount: netProfit, section: 'net', emphasis: true },
    ];

    const operatingOnly = round2(operatingExpenses - salaryExpense);
    const pnlLines = [
      { label: 'Revenue', amount: round2(netRevenue), section: 'income', emphasis: true },
      { label: '  Gross sales', amount: round2(grossSales), section: 'income' },
      { label: '  Discounts', amount: -round2(discounts), section: 'income' },
      { label: '  Returns', amount: -round2(returns), section: 'income' },
      { label: 'Cost of goods sold', amount: -round2(cogs), section: 'cogs' },
      { label: 'Gross profit', amount: grossProfit, section: 'gross', emphasis: true },
      { label: 'Operating expenses', amount: -operatingOnly, section: 'expense', emphasis: true },
      ...categories
        .filter((row) => row.name !== 'Salaries')
        .map((row) => ({
          label: `  ${row.name}`,
          amount: -round2(row.amount),
          section: 'expense' as const,
        })),
      ...(salaryExpense > 0
        ? [{ label: '  Salaries', amount: -salaryExpense, section: 'expense' as const }]
        : []),
      {
        label: 'Operating profit',
        amount: round2(grossProfit - operatingExpenses),
        section: 'operating',
        emphasis: true,
      },
      { label: 'Net profit / (loss)', amount: netProfit, section: 'net', emphasis: true },
    ];

    return {
      grossSales: round2(grossSales),
      discounts: round2(discounts),
      returns: round2(returns),
      tax: round2(tax),
      netRevenue: round2(netRevenue),
      cogs: round2(cogs),
      billCount,
      operatingExpenses,
      salaryExpense,
      purchaseSpend,
      purchaseReturnValue,
      grossProfit,
      netProfit,
      marginPercent: margin,
      expenseByCategory: categories,
      byBranch: [...byBranch.values()]
        .map((row) => ({
          ...row,
          revenue: round2(row.revenue),
          cogs: round2(row.cogs),
          grossProfit: round2(row.revenue - row.cogs),
        }))
        .sort((a, b) => b.revenue - a.revenue),
      byPaymentMethod: [...byPayment.values()]
        .map((row) => ({ ...row, revenue: round2(row.revenue) }))
        .sort((a, b) => b.revenue - a.revenue),
      byCashier: [...byCashier.values()]
        .map((row) => ({
          ...row,
          revenue: round2(row.revenue),
          cogs: round2(row.cogs),
          grossProfit: round2(row.revenue - row.cogs),
        }))
        .sort((a, b) => b.revenue - a.revenue),
      monthly: [...monthly.values()]
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((row) => {
          const gp = round2(row.revenue - row.cogs);
          return {
            ...row,
            revenue: round2(row.revenue),
            cogs: round2(row.cogs),
            expenses: round2(row.expenses),
            grossProfit: gp,
            netProfit: round2(gp - row.expenses),
          };
        }),
      lines,
      pnlLines,
    };
  }
}
