"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGING_BUCKETS = exports.TXN_LABEL = exports.isCreditTxn = exports.CASH_TXN_TYPES = exports.DEBIT_TXN_TYPES = exports.CREDIT_TXN_TYPES = void 0;
exports.buildAccount = buildAccount;
exports.buildCustomerAccounts = buildCustomerAccounts;
exports.buildCustomerAccount = buildCustomerAccount;
exports.receivablesSummary = receivablesSummary;
const client_1 = require("../prisma/client");
const helpers_1 = require("../utils/helpers");
/**
 * Customer receivables maths shared by the customer list, the customer ledger
 * and the receivables dashboard so every screen shows the same numbers.
 *
 *   balance > 0  → customer owes the shop (receivable)
 *   balance < 0  → shop holds the customer's money (advance / credit)
 */
exports.CREDIT_TXN_TYPES = ['PAYMENT', 'ADVANCE', 'CREDIT_NOTE', 'WRITE_OFF'];
exports.DEBIT_TXN_TYPES = ['REFUND', 'DEBIT_NOTE'];
/** Types that move real money in or out of the till. */
exports.CASH_TXN_TYPES = ['PAYMENT', 'ADVANCE', 'REFUND'];
const isCreditTxn = (type) => exports.CREDIT_TXN_TYPES.includes(type);
exports.isCreditTxn = isCreditTxn;
exports.TXN_LABEL = {
    PAYMENT: 'Payment received',
    ADVANCE: 'Advance received',
    REFUND: 'Refund paid',
    CREDIT_NOTE: 'Credit note',
    DEBIT_NOTE: 'Debit note',
    WRITE_OFF: 'Write-off',
};
exports.AGING_BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'];
const DAY_MS = 86_400_000;
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
/** Returns kept as store credit stay on the account; other refund methods pay the money back. */
const keepsStoreCredit = (sale) => {
    const match = sale.notes?.match(/"refundMethod":"([^"]*)"/);
    return match ? match[1] === 'store_credit' : sale.payment_method === 'CREDIT';
};
const bucketFor = (daysOverdue) => {
    if (daysOverdue <= 0)
        return 'current';
    if (daysOverdue <= 30)
        return 'd1_30';
    if (daysOverdue <= 60)
        return 'd31_60';
    if (daysOverdue <= 90)
        return 'd61_90';
    return 'd90_plus';
};
/** Runs the oldest-first allocation for one customer. */
function buildAccount(customer, sales, txns, now) {
    const creditDays = customer.credit_days ?? null;
    const dueOf = (date) => new Date(date.getTime() + (creditDays ?? 0) * DAY_MS);
    const items = [];
    const itemBySale = new Map();
    const pool = [];
    const totals = {
        opening: 0, sales: 0, paidAtSale: 0, returns: 0, exchanges: 0, payments: 0,
        advances: 0, refunds: 0, creditNotes: 0, debitNotes: 0, writeOffs: 0,
    };
    const addItem = (item) => {
        const full = { ...item, paid: 0, outstanding: item.amount, daysOverdue: 0, bucket: 'current' };
        items.push(full);
        if (item.saleId)
            itemBySale.set(item.saleId, full);
        return full;
    };
    /** Applies a credit to one item; returns what is left over. */
    const applyTo = (item, amount) => {
        if (!item || amount <= 0)
            return amount;
        const used = Math.min(item.outstanding, amount);
        item.paid += used;
        item.outstanding -= used;
        return amount - used;
    };
    const opening = (0, helpers_1.asNumber)(customer.previous_credit_balance);
    if (opening > 0) {
        totals.opening = opening;
        addItem({
            key: `opening-${customer.id}`, kind: 'OPENING', saleId: null, reference: null,
            description: 'Opening balance', date: customer.created_at, dueDate: customer.created_at, amount: opening,
        });
    }
    const originals = sales.filter((s) => !s.original_sale_id && s.status === 'COMPLETED');
    const children = sales.filter((s) => s.original_sale_id);
    for (const sale of originals) {
        const total = (0, helpers_1.asNumber)(sale.total_amount);
        totals.sales += total;
        if (total > 0) {
            addItem({
                key: `sale-${sale.id}`, kind: 'SALE', saleId: sale.id, reference: sale.invoice_number || sale.sale_number,
                description: `Sale ${sale.invoice_number || sale.sale_number}`, date: sale.sale_date, dueDate: dueOf(sale.sale_date), amount: total,
            });
        }
    }
    // Debit adjustments (refunds paid out, debit notes) become their own items.
    for (const txn of txns) {
        if ((0, exports.isCreditTxn)(txn.type))
            continue;
        const amount = (0, helpers_1.asNumber)(txn.amount);
        if (txn.type === 'REFUND')
            totals.refunds += amount;
        else
            totals.debitNotes += amount;
        addItem({
            key: `txn-${txn.id}`, kind: txn.type === 'REFUND' ? 'REFUND' : 'DEBIT_NOTE', saleId: null, reference: null,
            description: exports.TXN_LABEL[txn.type], date: txn.payment_date, dueDate: txn.payment_date, amount,
        });
    }
    // Exchanges that cost the customer more are new debits.
    for (const child of children) {
        const net = (0, helpers_1.asNumber)(child.total_amount);
        if (net > 0) {
            totals.exchanges += net;
            addItem({
                key: `exchange-${child.id}`, kind: 'EXCHANGE', saleId: child.id, reference: child.sale_number,
                description: `Exchange difference ${child.sale_number}`, date: child.sale_date, dueDate: dueOf(child.sale_date), amount: net,
            });
        }
    }
    // Targeted credits first: money taken at the sale, returns against their sale, txns tied to an invoice.
    for (const sale of [...originals, ...children]) {
        const received = (0, helpers_1.asNumber)(sale.payment_received);
        if (received <= 0)
            continue;
        if (!sale.original_sale_id || (0, helpers_1.asNumber)(sale.total_amount) > 0) {
            totals.paidAtSale += received;
            const left = applyTo(itemBySale.get(sale.id), received);
            if (left > 0)
                pool.push({ date: sale.sale_date, amount: left });
        }
    }
    const returnRefunds = [];
    for (const child of children) {
        const net = (0, helpers_1.asNumber)(child.total_amount);
        if (net >= 0)
            continue;
        totals.returns += -net;
        const left = applyTo(child.original_sale_id ? itemBySale.get(child.original_sale_id) : undefined, -net);
        if (left <= 0.005)
            continue;
        if (keepsStoreCredit(child))
            pool.push({ date: child.sale_date, amount: left });
        else
            returnRefunds.push({ saleId: child.id, date: child.sale_date, reference: child.sale_number, amount: round2(left) });
    }
    let lastPaymentDate = null;
    for (const txn of txns) {
        if (!(0, exports.isCreditTxn)(txn.type))
            continue;
        const amount = (0, helpers_1.asNumber)(txn.amount);
        if (txn.type === 'PAYMENT')
            totals.payments += amount;
        if (txn.type === 'ADVANCE')
            totals.advances += amount;
        if (txn.type === 'CREDIT_NOTE')
            totals.creditNotes += amount;
        if (txn.type === 'WRITE_OFF')
            totals.writeOffs += amount;
        if ((txn.type === 'PAYMENT' || txn.type === 'ADVANCE') && (!lastPaymentDate || txn.payment_date > lastPaymentDate)) {
            lastPaymentDate = txn.payment_date;
        }
        const left = applyTo(txn.sale_id ? itemBySale.get(txn.sale_id) : undefined, amount);
        if (left > 0)
            pool.push({ date: txn.payment_date, amount: left });
    }
    // Remaining credits settle the oldest open items first.
    items.sort((a, b) => a.date.getTime() - b.date.getTime());
    pool.sort((a, b) => a.date.getTime() - b.date.getTime());
    let unapplied = 0;
    for (const credit of pool) {
        let left = credit.amount;
        for (const item of items) {
            if (left <= 0.000001)
                break;
            left = applyTo(item, left);
        }
        unapplied += left;
    }
    const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    let receivable = 0;
    let overdue = 0;
    let oldestDueDate = null;
    const openItems = [];
    for (const item of items) {
        item.paid = round2(item.paid);
        item.outstanding = round2(item.outstanding);
        if (item.outstanding <= 0.005)
            continue;
        item.daysOverdue = Math.max(0, Math.floor((now.getTime() - item.dueDate.getTime()) / DAY_MS));
        item.bucket = bucketFor(item.daysOverdue);
        aging[item.bucket] += item.outstanding;
        receivable += item.outstanding;
        if (item.daysOverdue > 0) {
            overdue += item.outstanding;
            if (!oldestDueDate || item.dueDate < oldestDueDate)
                oldestDueDate = item.dueDate;
        }
        openItems.push(item);
    }
    for (const key of exports.AGING_BUCKETS)
        aging[key] = round2(aging[key]);
    receivable = round2(receivable);
    const advance = round2(unapplied);
    const creditLimit = customer.credit_limit === null || customer.credit_limit === undefined ? null : (0, helpers_1.asNumber)(customer.credit_limit);
    return {
        customerId: customer.id,
        balance: round2(receivable - advance),
        receivable,
        advance,
        overdue: round2(overdue),
        aging,
        openItems,
        totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)])),
        creditLimit,
        creditDays,
        overLimit: creditLimit !== null && creditLimit > 0 && receivable > creditLimit + 0.005,
        oldestDueDate,
        lastPaymentDate,
        returnRefunds,
    };
}
const SALE_SELECT = {
    id: true,
    customer_id: true,
    sale_number: true,
    invoice_number: true,
    sale_date: true,
    total_amount: true,
    payment_received: true,
    original_sale_id: true,
    status: true,
    payment_method: true,
    notes: true,
};
/** Builds receivable accounts for the given customers (or every customer when omitted). */
async function buildCustomerAccounts(customerIds, now = new Date()) {
    const idFilter = customerIds ? { in: customerIds } : undefined;
    const [customers, sales, txns] = await Promise.all([
        client_1.prisma.customer.findMany({
            where: idFilter ? { id: idFilter } : {},
            select: { id: true, created_at: true, previous_credit_balance: true, credit_limit: true, credit_days: true },
        }),
        client_1.prisma.sale.findMany({
            where: {
                customer_id: idFilter ?? { not: null },
                OR: [{ original_sale_id: null, status: 'COMPLETED' }, { original_sale_id: { not: null } }],
            },
            select: SALE_SELECT,
        }),
        client_1.prisma.customerPayment.findMany({
            where: idFilter ? { customer_id: idFilter } : {},
            select: { id: true, customer_id: true, type: true, amount: true, payment_date: true, sale_id: true },
        }),
    ]);
    const salesBy = new Map();
    for (const sale of sales) {
        if (!sale.customer_id)
            continue;
        const list = salesBy.get(sale.customer_id) || [];
        list.push(sale);
        salesBy.set(sale.customer_id, list);
    }
    const txnsBy = new Map();
    for (const txn of txns) {
        const list = txnsBy.get(txn.customer_id) || [];
        list.push(txn);
        txnsBy.set(txn.customer_id, list);
    }
    const accounts = new Map();
    for (const customer of customers) {
        accounts.set(customer.id, buildAccount(customer, salesBy.get(customer.id) || [], txnsBy.get(customer.id) || [], now));
    }
    return accounts;
}
async function buildCustomerAccount(customerId, now = new Date()) {
    const accounts = await buildCustomerAccounts([customerId], now);
    return accounts.get(customerId) ?? null;
}
/** Shop-wide receivables dashboard. */
async function receivablesSummary() {
    const now = new Date();
    const [accounts, customers] = await Promise.all([
        buildCustomerAccounts(undefined, now),
        client_1.prisma.customer.findMany({
            select: { id: true, name: true, phone_number: true, is_active: true },
        }),
    ]);
    const info = new Map(customers.map((c) => [c.id, c]));
    const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    let receivable = 0;
    let advance = 0;
    let overdue = 0;
    let debtors = 0;
    let advanceHolders = 0;
    let overLimit = 0;
    let overdueCustomers = 0;
    const rows = [];
    for (const account of accounts.values()) {
        receivable += account.receivable;
        advance += account.advance;
        overdue += account.overdue;
        for (const key of exports.AGING_BUCKETS)
            aging[key] += account.aging[key];
        if (account.receivable > 0.005)
            debtors += 1;
        if (account.advance > 0.005)
            advanceHolders += 1;
        if (account.overLimit)
            overLimit += 1;
        if (account.overdue > 0.005)
            overdueCustomers += 1;
        if (account.receivable > 0.005 || account.advance > 0.005) {
            const c = info.get(account.customerId);
            rows.push({
                id: account.customerId,
                name: c?.name ?? null,
                phone_number: c?.phone_number ?? null,
                balance: account.balance,
                receivable: account.receivable,
                advance: account.advance,
                overdue: account.overdue,
                overLimit: account.overLimit,
                creditLimit: account.creditLimit,
                oldestDueDate: account.oldestDueDate,
                lastPaymentDate: account.lastPaymentDate,
            });
        }
    }
    for (const key of exports.AGING_BUCKETS)
        aging[key] = round2(aging[key]);
    return {
        totals: {
            receivable: round2(receivable),
            advance: round2(advance),
            net: round2(receivable - advance),
            overdue: round2(overdue),
            debtors,
            advanceHolders,
            overLimit,
            overdueCustomers,
        },
        aging,
        topDebtors: rows.filter((r) => r.receivable > 0.005).sort((a, b) => b.receivable - a.receivable).slice(0, 10),
        topAdvances: rows.filter((r) => r.advance > 0.005).sort((a, b) => b.advance - a.advance).slice(0, 10),
    };
}
//# sourceMappingURL=customer-accounts.service.js.map