export type VarianceLabel = "Over" | "Short" | "Balanced";

export interface ReportSale {
  id: string;
  saleNumber: string;
  invoiceNumber: string | null;
  saleDate: string;
  customerName: string | null;
  cashierId: string | null;
  cashierName: string | null;
  branchId: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  /** Split tenders; when present they replace `paymentMethod` for payment / cash totals. */
  payments?: { method: string; amount: number }[];
  status: string;
  originalSaleId: string | null;
  notes: string | null;
}

export interface ReportExpense {
  id: string;
  particular: string;
  amount: number;
  date: string;
  paymentMethod: string;
  status: string;
  cashierId: string | null;
  cashierName: string | null;
  branchId: string | null;
}

export interface ReportCustomerPayment {
  id: string;
  amount: number;
  date: string;
  method: string;
  customerName: string | null;
  cashierId: string | null;
  cashierName: string | null;
  reference: string | null;
}

/** Cash added to the drawer (float top-up, change). */
export interface ReportCashIn {
  id: string;
  amount: number;
  date: string;
  reason: string;
  cashierName: string | null;
}

export interface ReportSession {
  id: string;
  branchId: string | null;
  registerName: string;
  registerNumber: string;
  cashierId: string | null;
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  opening: number;
  closing: number | null;
  status: "OPEN" | "CLOSED";
}

export interface ReportFilters {
  paymentMethod?: string;
  transactionType?: string;
  status?: string;
}

export interface ReportTransaction {
  id: string;
  type: string;
  number: string;
  date: string;
  customer: string;
  cashier: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  status: string;
}

const MONEY_METHODS = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE", "OTHER"] as const;

export const round2 = (value: number) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const varianceLabel = (difference: number | null): VarianceLabel | null => {
  if (difference == null || Number.isNaN(difference)) return null;
  if (Math.abs(difference) < 0.005) return "Balanced";
  return difference > 0 ? "Over" : "Short";
};

export const paymentBucket = (method?: string | null): (typeof MONEY_METHODS)[number] => {
  const value = (method || "").toUpperCase().replace(/\s+/g, "_");
  if (value === "CASH") return "CASH";
  if (value === "CARD") return "CARD";
  if (value === "BANK_TRANSFER" || value === "BANK") return "BANK_TRANSFER";
  if (value === "MOBILE_MONEY" || value === "ONLINE" || value === "ONLINE_PAYMENT") return "ONLINE";
  return "OTHER";
};

const parseMeta = (notes?: string | null): Record<string, unknown> | null => {
  if (!notes) return null;
  const match = notes.match(/__META__([\s\S]*?)__ENDMETA__/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
};

/** How a bill was paid: its tenders plus any balance left on account. */
export const paymentParts = (sale: ReportSale): { method: string; amount: number }[] => {
  if (!sale.payments?.length) return [{ method: sale.paymentMethod, amount: sale.total }];
  const paid = sale.payments.reduce((sum, p) => sum + p.amount, 0);
  const remainder = round2(sale.total - paid);
  return remainder > 0.005 ? [...sale.payments, { method: "CREDIT", amount: remainder }] : sale.payments;
};

const isCountedSale = (sale: ReportSale) =>
  sale.status !== "CANCELLED" && sale.status !== "PENDING";

const isRegenerated = (sale: ReportSale) => {
  const notes = (sale.notes || "").toLowerCase();
  return notes.includes("[regenerated]") || notes.includes("regenerated bill");
};

const returnValueOf = (sale: ReportSale) => {
  const meta = parseMeta(sale.notes);
  if (meta && typeof meta.returnValue === "number") return meta.returnValue;
  if (sale.originalSaleId && sale.total < 0) return Math.abs(sale.total);
  return 0;
};

const exchangeValueOf = (sale: ReportSale) => {
  const meta = parseMeta(sale.notes);
  if (meta && typeof meta.exchangeValue === "number") return meta.exchangeValue;
  if (sale.originalSaleId && sale.status === "EXCHANGED" && sale.total > 0) return sale.total;
  return 0;
};

const saleType = (sale: ReportSale) => {
  if (!sale.originalSaleId) return "SALE";
  if (sale.status === "EXCHANGED") return "EXCHANGE";
  return "RETURN";
};

const matchesPayment = (method: string, filter?: string) => {
  if (!filter || filter === "ALL") return true;
  return paymentBucket(method) === filter || method.toUpperCase() === filter;
};

const matchesType = (type: string, filter?: string) => {
  if (!filter || filter === "ALL") return true;
  if (filter === "REFUND") return type === "RETURN" || type === "CUSTOMER_REFUND";
  if (filter === "CASH_IN") return type === "CUSTOMER_PAYMENT" || type === "CASH_IN";
  return type === filter;
};

const matchesStatus = (status: string, filter?: string) => {
  if (!filter || filter === "ALL") return true;
  return status.toUpperCase() === filter.toUpperCase();
};

export function buildRegisterReport(input: {
  sessions: ReportSession[];
  sales: ReportSale[];
  expenses: ReportExpense[];
  customerPayments: ReportCustomerPayment[];
  cashIns?: ReportCashIn[];
  filters?: ReportFilters;
}) {
  const filters = input.filters || {};
  const countedSales = input.sales.filter((sale) => isCountedSale(sale) && !isRegenerated(sale));

  const transactions: ReportTransaction[] = [];

  const rowSales = input.sales.filter((sale) => {
    if (isRegenerated(sale)) return false;
    if (sale.status === "CANCELLED" || sale.status === "PENDING") {
      return filters.status?.toUpperCase() === sale.status;
    }
    return true;
  });

  for (const sale of rowSales) {
    const type = saleType(sale);
    transactions.push({
      id: sale.id,
      type,
      number: sale.invoiceNumber || sale.saleNumber,
      date: sale.saleDate,
      customer: sale.customerName || "Walk-in",
      cashier: sale.cashierName || "—",
      subtotal: round2(sale.subtotal),
      discount: round2(sale.discount),
      tax: round2(sale.tax),
      total: round2(sale.total),
      paymentMethod: paymentBucket(sale.paymentMethod),
      status: sale.status,
    });
  }

  for (const expense of input.expenses) {
    if (expense.status !== "APPROVED") continue;
    transactions.push({
      id: expense.id,
      type: "CASH_OUT",
      number: expense.particular,
      date: expense.date,
      customer: "—",
      cashier: expense.cashierName || "—",
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: round2(-Math.abs(expense.amount)),
      paymentMethod: paymentBucket(expense.paymentMethod),
      status: expense.status,
    });
  }

  for (const payment of input.customerPayments) {
    const type = payment.amount < 0 ? "CUSTOMER_REFUND" : "CUSTOMER_PAYMENT";
    transactions.push({
      id: payment.id,
      type,
      number: payment.reference || "Customer payment",
      date: payment.date,
      customer: payment.customerName || "—",
      cashier: payment.cashierName || "—",
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: round2(payment.amount),
      paymentMethod: paymentBucket(payment.method),
      status: "COMPLETED",
    });
  }

  for (const cashIn of input.cashIns ?? []) {
    transactions.push({
      id: cashIn.id,
      type: "CASH_IN",
      number: cashIn.reason,
      date: cashIn.date,
      customer: "—",
      cashier: cashIn.cashierName || "—",
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: round2(Math.abs(cashIn.amount)),
      paymentMethod: "CASH",
      status: "COMPLETED",
    });
  }

  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const visible = transactions.filter(
    (row) =>
      matchesPayment(row.paymentMethod, filters.paymentMethod) &&
      matchesType(row.type, filters.transactionType) &&
      matchesStatus(row.status, filters.status),
  );

  const visibleIds = new Set(visible.map((row) => row.id));
  const salesInView = countedSales.filter((sale) => visibleIds.has(sale.id));

  let grossSales = 0;
  let discounts = 0;
  let tax = 0;
  let returns = 0;
  let saleCount = 0;

  for (const sale of salesInView) {
    if (!sale.originalSaleId) {
      grossSales += sale.subtotal;
      discounts += sale.discount;
      tax += sale.tax;
      saleCount += 1;
    } else {
      grossSales += exchangeValueOf(sale);
      returns += returnValueOf(sale);
    }
  }

  const netSales = grossSales - discounts - returns;
  const finalSales = netSales + tax;

  const paymentMap = new Map<string, { method: string; count: number; amount: number }>();
  for (const method of MONEY_METHODS) {
    paymentMap.set(method, { method, count: 0, amount: 0 });
  }
  for (const sale of salesInView) {
    for (const part of paymentParts(sale)) {
      const row = paymentMap.get(paymentBucket(part.method))!;
      row.count += 1;
      row.amount += part.amount;
    }
  }

  const openingCash = round2(input.sessions.reduce((sum, session) => sum + session.opening, 0));
  const cashSales = round2(
    salesInView.reduce(
      (sum, sale) =>
        sum +
        paymentParts(sale)
          .filter((part) => paymentBucket(part.method) === "CASH")
          .reduce((s, part) => s + Math.max(0, part.amount), 0),
      0,
    ),
  );
  const cashRefunds = round2(
    salesInView.reduce((sum, sale) => {
      if (paymentBucket(sale.paymentMethod) !== "CASH") return sum;
      return sum + Math.abs(Math.min(0, sale.total));
    }, 0),
  );

  const cashInflows = round2(
    input.customerPayments.reduce((sum, payment) => {
      if (!visibleIds.has(payment.id)) return sum;
      if (paymentBucket(payment.method) !== "CASH") return sum;
      return sum + Math.max(0, payment.amount);
    }, 0) +
      (input.cashIns ?? []).reduce((sum, cashIn) => (visibleIds.has(cashIn.id) ? sum + Math.abs(cashIn.amount) : sum), 0),
  );
  const cashOutflows = round2(
    input.expenses.reduce((sum, expense) => {
      if (!visibleIds.has(expense.id)) return sum;
      if (expense.status !== "APPROVED") return sum;
      // Only cash leaves the drawer; card / bank / wallet expenses are reported per method.
      if (paymentBucket(expense.paymentMethod) !== "CASH") return sum;
      return sum + Math.abs(expense.amount);
    }, 0),
  );

  const expectedCash = round2(openingCash + cashSales + cashInflows - cashRefunds - cashOutflows);
  const allClosed = input.sessions.length > 0 && input.sessions.every((session) => session.status === "CLOSED" && session.closing != null);
  const actualClosing = allClosed
    ? round2(input.sessions.reduce((sum, session) => sum + (session.closing || 0), 0))
    : null;
  const difference = actualClosing == null ? null : round2(actualClosing - expectedCash);

  const otherPayments = round2(
    [...paymentMap.values()]
      .filter((row) => row.method !== "CASH")
      .reduce((sum, row) => sum + row.amount, 0),
  );

  return {
    sessions: input.sessions.map((session) => ({
      ...session,
      opening: round2(session.opening),
      closing: session.closing == null ? null : round2(session.closing),
    })),
    salesSummary: {
      saleCount,
      grossSales: round2(grossSales),
      discounts: round2(discounts),
      returns: round2(returns),
      netSales: round2(netSales),
      tax: round2(tax),
      finalSales: round2(finalSales),
    },
    payments: [...paymentMap.values()].map((row) => ({
      ...row,
      amount: round2(row.amount),
    })),
    cash: {
      openingCash,
      cashSales,
      cashRefunds,
      cashReceived: cashInflows,
      cashPaidOut: cashOutflows,
      cashDeposits: 0,
      cashInflows,
      cashOutflows,
      expectedCash,
      actualClosing,
      difference,
      variance: varianceLabel(difference),
    },
    cards: {
      openingCash,
      grossSales: round2(grossSales),
      netSales: round2(netSales),
      cashSales,
      otherPayments,
      refunds: round2(returns),
      expectedCash,
      actualCash: actualClosing,
      variance: difference,
      varianceLabel: varianceLabel(difference),
    },
    transactions: visible,
  };
}
