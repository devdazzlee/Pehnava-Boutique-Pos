"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentParts = exports.paymentBucket = exports.varianceLabel = exports.round2 = void 0;
exports.buildRegisterReport = buildRegisterReport;
const MONEY_METHODS = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE", "OTHER"];
const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
exports.round2 = round2;
const varianceLabel = (difference) => {
    if (difference == null || Number.isNaN(difference))
        return null;
    if (Math.abs(difference) < 0.005)
        return "Balanced";
    return difference > 0 ? "Over" : "Short";
};
exports.varianceLabel = varianceLabel;
const paymentBucket = (method) => {
    const value = (method || "").toUpperCase().replace(/\s+/g, "_");
    if (value === "CASH")
        return "CASH";
    if (value === "CARD")
        return "CARD";
    if (value === "BANK_TRANSFER" || value === "BANK")
        return "BANK_TRANSFER";
    if (value === "MOBILE_MONEY" || value === "ONLINE" || value === "ONLINE_PAYMENT")
        return "ONLINE";
    return "OTHER";
};
exports.paymentBucket = paymentBucket;
const parseMeta = (notes) => {
    if (!notes)
        return null;
    const match = notes.match(/__META__([\s\S]*?)__ENDMETA__/);
    if (!match)
        return null;
    try {
        return JSON.parse(match[1]);
    }
    catch {
        return null;
    }
};
/** How a bill was paid: its tenders plus any balance left on account. */
const paymentParts = (sale) => {
    if (!sale.payments?.length)
        return [{ method: sale.paymentMethod, amount: sale.total }];
    const paid = sale.payments.reduce((sum, p) => sum + p.amount, 0);
    const remainder = (0, exports.round2)(sale.total - paid);
    return remainder > 0.005 ? [...sale.payments, { method: "CREDIT", amount: remainder }] : sale.payments;
};
exports.paymentParts = paymentParts;
const isCountedSale = (sale) => sale.status !== "CANCELLED" && sale.status !== "PENDING";
const isRegenerated = (sale) => {
    const notes = (sale.notes || "").toLowerCase();
    return notes.includes("[regenerated]") || notes.includes("regenerated bill");
};
const returnValueOf = (sale) => {
    const meta = parseMeta(sale.notes);
    if (meta && typeof meta.returnValue === "number")
        return meta.returnValue;
    if (sale.originalSaleId && sale.total < 0)
        return Math.abs(sale.total);
    return 0;
};
const exchangeValueOf = (sale) => {
    const meta = parseMeta(sale.notes);
    if (meta && typeof meta.exchangeValue === "number")
        return meta.exchangeValue;
    if (sale.originalSaleId && sale.status === "EXCHANGED" && sale.total > 0)
        return sale.total;
    return 0;
};
const saleType = (sale) => {
    if (!sale.originalSaleId)
        return "SALE";
    if (sale.status === "EXCHANGED")
        return "EXCHANGE";
    return "RETURN";
};
const matchesPayment = (method, filter) => {
    if (!filter || filter === "ALL")
        return true;
    return (0, exports.paymentBucket)(method) === filter || method.toUpperCase() === filter;
};
const matchesType = (type, filter) => {
    if (!filter || filter === "ALL")
        return true;
    if (filter === "REFUND")
        return type === "RETURN" || type === "CUSTOMER_REFUND";
    if (filter === "CASH_IN")
        return type === "CUSTOMER_PAYMENT";
    return type === filter;
};
const matchesStatus = (status, filter) => {
    if (!filter || filter === "ALL")
        return true;
    return status.toUpperCase() === filter.toUpperCase();
};
function buildRegisterReport(input) {
    const filters = input.filters || {};
    const countedSales = input.sales.filter((sale) => isCountedSale(sale) && !isRegenerated(sale));
    const transactions = [];
    const rowSales = input.sales.filter((sale) => {
        if (isRegenerated(sale))
            return false;
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
            subtotal: (0, exports.round2)(sale.subtotal),
            discount: (0, exports.round2)(sale.discount),
            tax: (0, exports.round2)(sale.tax),
            total: (0, exports.round2)(sale.total),
            paymentMethod: (0, exports.paymentBucket)(sale.paymentMethod),
            status: sale.status,
        });
    }
    for (const expense of input.expenses) {
        if (expense.status !== "APPROVED")
            continue;
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
            total: (0, exports.round2)(-Math.abs(expense.amount)),
            paymentMethod: (0, exports.paymentBucket)(expense.paymentMethod),
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
            total: (0, exports.round2)(payment.amount),
            paymentMethod: (0, exports.paymentBucket)(payment.method),
            status: "COMPLETED",
        });
    }
    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const visible = transactions.filter((row) => matchesPayment(row.paymentMethod, filters.paymentMethod) &&
        matchesType(row.type, filters.transactionType) &&
        matchesStatus(row.status, filters.status));
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
        }
        else {
            grossSales += exchangeValueOf(sale);
            returns += returnValueOf(sale);
        }
    }
    const netSales = grossSales - discounts - returns;
    const finalSales = netSales + tax;
    const paymentMap = new Map();
    for (const method of MONEY_METHODS) {
        paymentMap.set(method, { method, count: 0, amount: 0 });
    }
    for (const sale of salesInView) {
        for (const part of (0, exports.paymentParts)(sale)) {
            const row = paymentMap.get((0, exports.paymentBucket)(part.method));
            row.count += 1;
            row.amount += part.amount;
        }
    }
    const openingCash = (0, exports.round2)(input.sessions.reduce((sum, session) => sum + session.opening, 0));
    const cashSales = (0, exports.round2)(salesInView.reduce((sum, sale) => sum +
        (0, exports.paymentParts)(sale)
            .filter((part) => (0, exports.paymentBucket)(part.method) === "CASH")
            .reduce((s, part) => s + Math.max(0, part.amount), 0), 0));
    const cashRefunds = (0, exports.round2)(salesInView.reduce((sum, sale) => {
        if ((0, exports.paymentBucket)(sale.paymentMethod) !== "CASH")
            return sum;
        return sum + Math.abs(Math.min(0, sale.total));
    }, 0));
    const cashInflows = (0, exports.round2)(input.customerPayments.reduce((sum, payment) => {
        if (!visibleIds.has(payment.id))
            return sum;
        if ((0, exports.paymentBucket)(payment.method) !== "CASH")
            return sum;
        return sum + Math.max(0, payment.amount);
    }, 0));
    const cashOutflows = (0, exports.round2)(input.expenses.reduce((sum, expense) => {
        if (!visibleIds.has(expense.id))
            return sum;
        if (expense.status !== "APPROVED")
            return sum;
        if ((0, exports.paymentBucket)(expense.paymentMethod) !== "CASH")
            return sum;
        return sum + Math.abs(expense.amount);
    }, 0));
    const expectedCash = (0, exports.round2)(openingCash + cashSales + cashInflows - cashRefunds - cashOutflows);
    const allClosed = input.sessions.length > 0 && input.sessions.every((session) => session.status === "CLOSED" && session.closing != null);
    const actualClosing = allClosed
        ? (0, exports.round2)(input.sessions.reduce((sum, session) => sum + (session.closing || 0), 0))
        : null;
    const difference = actualClosing == null ? null : (0, exports.round2)(actualClosing - expectedCash);
    const otherPayments = (0, exports.round2)([...paymentMap.values()]
        .filter((row) => row.method !== "CASH")
        .reduce((sum, row) => sum + row.amount, 0));
    return {
        sessions: input.sessions.map((session) => ({
            ...session,
            opening: (0, exports.round2)(session.opening),
            closing: session.closing == null ? null : (0, exports.round2)(session.closing),
        })),
        salesSummary: {
            saleCount,
            grossSales: (0, exports.round2)(grossSales),
            discounts: (0, exports.round2)(discounts),
            returns: (0, exports.round2)(returns),
            netSales: (0, exports.round2)(netSales),
            tax: (0, exports.round2)(tax),
            finalSales: (0, exports.round2)(finalSales),
        },
        payments: [...paymentMap.values()].map((row) => ({
            ...row,
            amount: (0, exports.round2)(row.amount),
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
            variance: (0, exports.varianceLabel)(difference),
        },
        cards: {
            openingCash,
            grossSales: (0, exports.round2)(grossSales),
            netSales: (0, exports.round2)(netSales),
            cashSales,
            otherPayments,
            refunds: (0, exports.round2)(returns),
            expectedCash,
            actualCash: actualClosing,
            variance: difference,
            varianceLabel: (0, exports.varianceLabel)(difference),
        },
        transactions: visible,
    };
}
//# sourceMappingURL=register-report.calc.js.map