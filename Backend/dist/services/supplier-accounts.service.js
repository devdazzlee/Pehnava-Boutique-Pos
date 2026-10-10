"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supplierEffect = exports.SUPPLIER_TXN_LABEL = exports.SUPPLIER_INVOICE_TYPES = exports.SUPPLIER_CASH_TYPES = exports.SUPPLIER_TXN_EFFECT = exports.SUPPLIER_TXN_TYPES = void 0;
exports.supplierBalances = supplierBalances;
exports.supplierAging = supplierAging;
const client_1 = require("../prisma/client");
const timezone_1 = require("../utils/timezone");
/* ============================================================
 * Supplier (accounts payable) maths shared by the supplier
 * screens, reports and the chart of accounts.
 *
 * Balance = what we owe the supplier:
 *   + opening balance, goods received / invoices, credit notes, refunds received
 *   − payments, advances, purchase returns, debit notes, discounts received
 * ============================================================ */
exports.SUPPLIER_TXN_TYPES = ['PAYMENT', 'ADVANCE', 'REFUND', 'DEBIT_NOTE', 'CREDIT_NOTE', 'DISCOUNT'];
/** +1 = increases what we owe, −1 = reduces it. */
exports.SUPPLIER_TXN_EFFECT = {
    PAYMENT: -1,
    ADVANCE: -1,
    REFUND: 1,
    DEBIT_NOTE: -1,
    CREDIT_NOTE: 1,
    DISCOUNT: -1,
};
/** Types that move real money (cash / bank). */
exports.SUPPLIER_CASH_TYPES = new Set(['PAYMENT', 'ADVANCE', 'REFUND']);
/** Types that can be allocated against a specific purchase invoice. */
exports.SUPPLIER_INVOICE_TYPES = new Set(['PAYMENT', 'DEBIT_NOTE', 'DISCOUNT']);
exports.SUPPLIER_TXN_LABEL = {
    PAYMENT: 'Payment',
    ADVANCE: 'Advance paid',
    REFUND: 'Refund received',
    DEBIT_NOTE: 'Debit note',
    CREDIT_NOTE: 'Credit note',
    DISCOUNT: 'Discount received',
};
const supplierEffect = (type) => exports.SUPPLIER_TXN_EFFECT[(type || 'PAYMENT')] ?? -1;
exports.supplierEffect = supplierEffect;
const num = (v) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
};
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const DAY = 86_400_000;
const blank = () => ({ opening: 0, totalPurchased: 0, totalReturned: 0, totalPaid: 0, totalAdjusted: 0, balanceDue: 0, lastPurchase: null, lastPayment: null });
/** Balances for many suppliers at once (optionally as of a date). */
async function supplierBalances(supplierIds, asOf) {
    const sup = supplierIds?.length ? { supplier_id: { in: supplierIds } } : {};
    const [suppliers, uninvoiced, invoices, returns, txns] = await Promise.all([
        client_1.prisma.supplier.findMany({
            where: supplierIds?.length ? { id: { in: supplierIds } } : {},
            select: { id: true, opening_balance: true, opening_balance_date: true },
        }),
        client_1.prisma.purchase.findMany({
            where: { ...sup, purchase_invoice_id: null, ...(asOf ? { purchase_date: { lte: asOf } } : {}) },
            select: { supplier_id: true, quantity: true, cost_price: true, purchase_date: true },
        }),
        client_1.prisma.purchaseInvoice.findMany({
            where: { ...sup, ...(asOf ? { invoice_date: { lte: asOf } } : {}) },
            select: { supplier_id: true, total_amount: true, invoice_date: true },
        }),
        client_1.prisma.purchaseReturn.findMany({
            where: { ...sup, status: 'COMPLETED', ...(asOf ? { return_date: { lte: asOf } } : {}) },
            select: { supplier_id: true, total_amount: true },
        }),
        client_1.prisma.supplierPayment.findMany({
            where: { ...sup, ...(asOf ? { payment_date: { lte: asOf } } : {}) },
            select: { supplier_id: true, amount: true, type: true, payment_date: true },
        }),
    ]);
    const map = new Map();
    const ensure = (id) => {
        let b = map.get(id);
        if (!b)
            map.set(id, (b = blank()));
        return b;
    };
    for (const s of suppliers) {
        if (!asOf || !s.opening_balance_date || s.opening_balance_date <= asOf)
            ensure(s.id).opening = num(s.opening_balance);
    }
    for (const p of uninvoiced) {
        const b = ensure(p.supplier_id);
        b.totalPurchased += num(p.quantity) * num(p.cost_price);
        if (!b.lastPurchase || p.purchase_date > b.lastPurchase)
            b.lastPurchase = p.purchase_date;
    }
    for (const i of invoices) {
        const b = ensure(i.supplier_id);
        b.totalPurchased += num(i.total_amount);
        if (!b.lastPurchase || i.invoice_date > b.lastPurchase)
            b.lastPurchase = i.invoice_date;
    }
    for (const r of returns)
        ensure(r.supplier_id).totalReturned += num(r.total_amount);
    for (const t of txns) {
        const b = ensure(t.supplier_id);
        const signed = -(0, exports.supplierEffect)(t.type) * num(t.amount); // positive = reduces payable
        if (exports.SUPPLIER_CASH_TYPES.has(t.type)) {
            b.totalPaid += signed;
            if (t.type !== 'REFUND' && (!b.lastPayment || t.payment_date > b.lastPayment))
                b.lastPayment = t.payment_date;
        }
        else
            b.totalAdjusted += signed;
    }
    for (const b of map.values()) {
        b.totalPurchased = r2(b.totalPurchased);
        b.totalReturned = r2(b.totalReturned);
        b.totalPaid = r2(b.totalPaid);
        b.totalAdjusted = r2(b.totalAdjusted);
        b.balanceDue = r2(b.opening + b.totalPurchased - b.totalReturned - b.totalPaid - b.totalAdjusted);
    }
    return map;
}
const zero = () => ({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 });
const bucketOf = (days) => (days <= 0 ? 'current' : days <= 30 ? 'd1_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd90_plus');
/**
 * Bill-wise position: every bill (opening balance, invoices, uninvoiced goods,
 * credit notes, refunds) is settled oldest-first by payments, returns, debit
 * notes and discounts. Due date = invoice due date, else bill date + credit days.
 */
async function supplierAging(supplierIds, asOfYmd = (0, timezone_1.businessTodayYmd)()) {
    const asOf = (0, timezone_1.localRange)(asOfYmd, asOfYmd).end;
    const sup = supplierIds?.length ? { supplier_id: { in: supplierIds } } : {};
    const [suppliers, uninvoiced, invoices, returns, txns] = await Promise.all([
        client_1.prisma.supplier.findMany({
            where: supplierIds?.length ? { id: { in: supplierIds } } : {},
            select: { id: true, credit_days: true, opening_balance: true, opening_balance_date: true, created_at: true },
        }),
        client_1.prisma.purchase.findMany({
            where: { ...sup, purchase_invoice_id: null, purchase_date: { lte: asOf } },
            select: { supplier_id: true, quantity: true, cost_price: true, purchase_date: true, invoice_ref: true, bill_group_id: true },
        }),
        client_1.prisma.purchaseInvoice.findMany({
            where: { ...sup, invoice_date: { lte: asOf } },
            select: { id: true, supplier_id: true, invoice_number: true, invoice_date: true, due_date: true, total_amount: true },
        }),
        client_1.prisma.purchaseReturn.findMany({ where: { ...sup, status: 'COMPLETED', return_date: { lte: asOf } }, select: { supplier_id: true, total_amount: true } }),
        client_1.prisma.supplierPayment.findMany({ where: { ...sup, payment_date: { lte: asOf } }, select: { supplier_id: true, amount: true, type: true, payment_date: true, reference: true } }),
    ]);
    const terms = new Map(suppliers.map((s) => [s.id, s.credit_days ?? 0]));
    const due = (supplierId, d) => new Date(d.getTime() + (terms.get(supplierId) ?? 0) * DAY);
    const bills = new Map();
    const push = (id, b) => bills.set(id, [...(bills.get(id) ?? []), { ...b, outstanding: 0, daysOverdue: 0 }]);
    const credits = new Map();
    const credit = (id, v) => credits.set(id, (credits.get(id) ?? 0) + v);
    for (const s of suppliers) {
        const ob = num(s.opening_balance);
        const date = s.opening_balance_date ?? s.created_at;
        if (ob > 0.005 && date <= asOf)
            push(s.id, { kind: 'OPENING', ref: 'Opening balance', date, due: date, amount: ob });
        else if (ob < -0.005)
            credit(s.id, -ob);
    }
    const groups = new Map();
    for (const p of uninvoiced) {
        const key = `${p.supplier_id}|${p.bill_group_id || p.invoice_ref || (0, timezone_1.toBusinessYmd)(p.purchase_date)}`;
        const g = groups.get(key) ?? { supplier: p.supplier_id, ref: p.invoice_ref || `Goods received ${(0, timezone_1.toBusinessYmd)(p.purchase_date)}`, date: p.purchase_date, amount: 0 };
        g.amount += num(p.quantity) * num(p.cost_price);
        if (p.purchase_date < g.date)
            g.date = p.purchase_date;
        groups.set(key, g);
    }
    for (const g of groups.values())
        push(g.supplier, { kind: 'GOODS', ref: g.ref, date: g.date, due: due(g.supplier, g.date), amount: g.amount });
    for (const i of invoices)
        push(i.supplier_id, { kind: 'INVOICE', ref: i.invoice_number, date: i.invoice_date, due: i.due_date ?? due(i.supplier_id, i.invoice_date), amount: num(i.total_amount), invoiceId: i.id });
    for (const r of returns)
        credit(r.supplier_id, num(r.total_amount));
    for (const t of txns) {
        if ((0, exports.supplierEffect)(t.type) < 0)
            credit(t.supplier_id, num(t.amount));
        else
            push(t.supplier_id, { kind: 'CHARGE', ref: `${exports.SUPPLIER_TXN_LABEL[t.type] ?? t.type}${t.reference ? ` ${t.reference}` : ''}`, date: t.payment_date, due: t.payment_date, amount: num(t.amount) });
    }
    const result = new Map();
    for (const s of suppliers) {
        const list = (bills.get(s.id) ?? []).sort((a, b) => a.date.getTime() - b.date.getTime());
        let left = credits.get(s.id) ?? 0;
        const buckets = zero();
        const open = [];
        for (const b of list) {
            const applied = Math.min(left, b.amount);
            left -= applied;
            const outstanding = r2(b.amount - applied);
            if (outstanding <= 0.005)
                continue;
            const daysOverdue = Math.floor((asOf.getTime() - b.due.getTime()) / DAY);
            buckets[bucketOf(daysOverdue)] += outstanding;
            open.push({ ...b, amount: r2(b.amount), outstanding, daysOverdue });
        }
        for (const k of Object.keys(buckets))
            buckets[k] = r2(buckets[k]);
        const totalDue = r2(Object.values(buckets).reduce((t, v) => t + v, 0));
        const upcoming = open.filter((b) => b.daysOverdue <= 0).sort((a, b) => a.due.getTime() - b.due.getTime());
        result.set(s.id, {
            buckets,
            due: totalDue,
            overdue: r2(totalDue - buckets.current),
            advance: r2(Math.max(0, left)),
            oldestDays: open.length ? Math.max(0, ...open.map((o) => o.daysOverdue)) : 0,
            nextDue: upcoming[0]?.due ?? null,
            bills: open.reverse(),
        });
    }
    return result;
}
//# sourceMappingURL=supplier-accounts.service.js.map