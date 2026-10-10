import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { asNumber } from '../utils/helpers';
import { businessTodayYmd, localRange, shiftBusinessYmd, toBusinessYmd } from '../utils/timezone';
import {
    CreateSupplierInput,
    UpdateSupplierInput,
    CreateSupplierPaymentInput,
    UpdateSupplierPaymentInput,
} from '../validations/supplier.validation';
import { catalogDefaults, catalogDeleteOptions } from './catalog-defaults.service';
import { PurchaseInvoiceService } from './purchaseInvoice.service';
import { assertPeriodOpen } from './period-lock.service';
import { recordCashPayOnOpenRegister } from './register-cash-out.helper';
import {
    SUPPLIER_CASH_TYPES,
    SUPPLIER_INVOICE_TYPES,
    SUPPLIER_TXN_LABEL,
    supplierAging,
    supplierBalances,
    supplierEffect,
} from './supplier-accounts.service';

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const METHOD_LABEL: Record<string, string> = {
    CASH: 'Cash',
    BANK_TRANSFER: 'Bank transfer',
    CHEQUE: 'Cheque',
    CARD: 'Card',
    MOBILE_MONEY: 'Wallet',
    OTHER: 'Other',
};

/** Prisma-ready supplier fields from the form (Decimal / Date conversion). */
function supplierData(data: Partial<CreateSupplierInput>) {
    const out: Record<string, unknown> = { ...data };
    if ('credit_limit' in data) out.credit_limit = data.credit_limit == null ? null : new Prisma.Decimal(data.credit_limit);
    if ('opening_balance' in data) out.opening_balance = new Prisma.Decimal(data.opening_balance ?? 0);
    if ('opening_balance_date' in data)
        out.opening_balance_date = data.opening_balance_date ? localRange(data.opening_balance_date.slice(0, 10), data.opening_balance_date.slice(0, 10)).start : null;
    return out;
}

export class SupplierService {
    async createSupplier(data: CreateSupplierInput) {
        const existingSupplier = await prisma.supplier.findFirst({
            where: { name: { equals: data.name.trim(), mode: 'insensitive' } },
        });
        if (existingSupplier) throw new AppError(400, 'A supplier with this name already exists');

        const generateCode = () => {
            const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let suffix = '';
            for (let i = 0; i < 6; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
            return `SUP-${suffix}`;
        };
        let newCode = generateCode();
        for (let attempt = 0; attempt < 5; attempt++) {
            const clash = await prisma.supplier.findUnique({ where: { code: newCode } });
            if (!clash) break;
            newCode = generateCode();
        }
        if (data.opening_balance) await assertPeriodOpen(data.opening_balance_date || new Date(), 'an opening balance');

        return prisma.supplier.create({
            data: {
                ...(supplierData(data) as Prisma.SupplierCreateInput),
                name: data.name.trim(),
                code: newCode,
                status: data.status ?? 'active',
            },
        });
    }

    async getSupplierById(id: string) {
        const supplier = await prisma.supplier.findUnique({
            where: { id },
            include: {
                _count: { select: { purchases: true, payments: true, products: true, purchase_invoices: true, purchase_returns: true, purchase_orders: true } },
            },
        });
        if (!supplier) throw new AppError(404, 'Supplier not found');
        return supplier;
    }

    async updateSupplier(id: string, data: Partial<UpdateSupplierInput>) {
        const existing = await this.getSupplierById(id);
        if (data.name && data.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
            const clash = await prisma.supplier.findFirst({ where: { name: { equals: data.name.trim(), mode: 'insensitive' }, id: { not: id } } });
            if (clash) throw new AppError(400, 'Another supplier already has this name');
        }
        const openingChanged =
            ('opening_balance' in data && asNumber(existing.opening_balance) !== Number(data.opening_balance ?? 0)) ||
            ('opening_balance_date' in data && data.opening_balance_date !== undefined);
        if (openingChanged) {
            await assertPeriodOpen(existing.opening_balance_date || existing.created_at, 'an opening balance');
            if (data.opening_balance_date) await assertPeriodOpen(data.opening_balance_date, 'an opening balance');
        }
        return prisma.supplier.update({ where: { id }, data: supplierData(data) as Prisma.SupplierUpdateInput });
    }

    async toggleSupplierStatus(id: string) {
        const supplier = await this.getSupplierById(id);
        const active = !supplier.is_active;
        return prisma.supplier.update({ where: { id }, data: { is_active: active, status: active ? 'active' : 'inactive' } });
    }

    /** Only suppliers with no money history can be deleted — others should be deactivated. */
    async deleteSupplier(id: string) {
        const supplier = await this.getSupplierById(id);
        const c = supplier._count;
        if (c.purchases || c.payments || c.purchase_invoices || c.purchase_returns || asNumber(supplier.opening_balance) !== 0) {
            throw new AppError(400, 'This supplier has purchases or payments in their ledger. Deactivate them instead so the history stays intact.');
        }
        await prisma.$transaction(async (tx) => {
            const defaultSupplierId = await catalogDefaults.ensureDefaultSupplier(tx, id);
            await tx.product.updateMany({ where: { supplier_id: id }, data: { supplier_id: defaultSupplierId } });
            await tx.purchaseOrder.updateMany({ where: { supplier_id: id }, data: { supplier_id: defaultSupplierId } });
            await tx.supplier.delete({ where: { id } });
        }, catalogDeleteOptions);
        return { message: 'Supplier deleted successfully' };
    }

    /* ------------------------------ dashboard ------------------------------ */

    /** Shop-wide payables dashboard. */
    async payablesSummary() {
        const suppliers = await prisma.supplier.findMany({
            select: { id: true, name: true, code: true, phone_number: true, mobile_number: true, is_active: true, credit_limit: true },
            orderBy: { name: 'asc' },
        });
        const [balances, aging] = await Promise.all([supplierBalances(), supplierAging()]);

        let payable = 0;
        let advance = 0;
        let creditors = 0;
        let advanceHolders = 0;
        let overLimit = 0;
        const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
        const weekAhead = localRange(shiftBusinessYmd(businessTodayYmd(), 7), shiftBusinessYmd(businessTodayYmd(), 7)).end;
        let dueThisWeek = 0;
        const top: { id: string; name: string; code: string; phone: string | null; balanceDue: number; overdue: number; oldestDays: number }[] = [];

        for (const s of suppliers) {
            const b = balances.get(s.id);
            const a = aging.get(s.id);
            const bal = b?.balanceDue ?? 0;
            if (bal > 0.005) {
                payable += bal;
                creditors += 1;
                top.push({ id: s.id, name: s.name, code: s.code, phone: s.mobile_number || s.phone_number || null, balanceDue: bal, overdue: a?.overdue ?? 0, oldestDays: a?.oldestDays ?? 0 });
            } else if (bal < -0.005) {
                advance += -bal;
                advanceHolders += 1;
            }
            if (s.credit_limit != null && asNumber(s.credit_limit) > 0 && bal > asNumber(s.credit_limit)) overLimit += 1;
            if (a) {
                for (const k of Object.keys(buckets) as (keyof typeof buckets)[]) buckets[k] += a.buckets[k];
                dueThisWeek += a.bills.filter((x) => x.daysOverdue <= 0 && x.due <= weekAhead).reduce((t, x) => t + x.outstanding, 0);
            }
        }
        top.sort((a, b) => b.balanceDue - a.balanceDue);

        // Last 6 months: purchases vs payments.
        const today = businessTodayYmd();
        const months: { month: string; purchased: number; paid: number }[] = [];
        const start = localRange(`${shiftBusinessYmd(today, -150).slice(0, 7)}-01`, today).start;
        const [goods, invs, pays, recent] = await Promise.all([
            prisma.purchase.findMany({ where: { purchase_date: { gte: start }, purchase_invoice_id: null }, select: { purchase_date: true, quantity: true, cost_price: true } }),
            prisma.purchaseInvoice.findMany({ where: { invoice_date: { gte: start } }, select: { invoice_date: true, total_amount: true } }),
            prisma.supplierPayment.findMany({ where: { payment_date: { gte: start } }, select: { payment_date: true, amount: true, type: true } }),
            prisma.supplierPayment.findMany({
                orderBy: { payment_date: 'desc' },
                take: 8,
                select: { id: true, amount: true, type: true, method: true, payment_date: true, reference: true, supplier: { select: { id: true, name: true } } },
            }),
        ]);
        const monthOf = (d: Date) => toBusinessYmd(d).slice(0, 7);
        const bucketMonth = (m: string) => {
            let row = months.find((x) => x.month === m);
            if (!row) months.push((row = { month: m, purchased: 0, paid: 0 }));
            return row;
        };
        for (let i = 5; i >= 0; i--) {
            const d = new Date(`${today}T12:00:00Z`);
            d.setUTCMonth(d.getUTCMonth() - i, 1);
            bucketMonth(d.toISOString().slice(0, 7));
        }
        for (const g of goods) bucketMonth(monthOf(g.purchase_date)).purchased += asNumber(g.quantity) * asNumber(g.cost_price);
        for (const i of invs) bucketMonth(monthOf(i.invoice_date)).purchased += asNumber(i.total_amount);
        for (const p of pays) if (SUPPLIER_CASH_TYPES.has(p.type)) bucketMonth(monthOf(p.payment_date)).paid += -supplierEffect(p.type) * asNumber(p.amount);

        return {
            totals: {
                payable: r2(payable),
                advance: r2(advance),
                net: r2(payable - advance),
                overdue: r2(payable > 0 ? buckets.d1_30 + buckets.d31_60 + buckets.d61_90 + buckets.d90_plus : 0),
                dueThisWeek: r2(dueThisWeek),
                creditors,
                advanceHolders,
                overLimit,
                supplierCount: suppliers.length,
                activeCount: suppliers.filter((s) => s.is_active).length,
            },
            aging: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, r2(v)])),
            topCreditors: top.slice(0, 8).map((t) => ({ ...t, balanceDue: r2(t.balanceDue) })),
            trend: months.sort((a, b) => a.month.localeCompare(b.month)).slice(-6).map((m) => ({ ...m, purchased: r2(m.purchased), paid: r2(m.paid) })),
            recentPayments: recent.map((p) => ({ id: p.id, amount: asNumber(p.amount), type: p.type, method: p.method, date: p.payment_date, reference: p.reference, supplier: p.supplier })),
        };
    }

    /* ------------------------------ list ------------------------------ */

    async listSuppliers({
        page = 1,
        limit = 10,
        search,
        is_active,
        display_on_pos,
        fetch_all,
        balance,
        city,
        category,
        sort = 'recent',
    }: {
        page?: number;
        limit?: number;
        search?: string;
        is_active?: boolean;
        display_on_pos?: boolean;
        fetch_all?: boolean;
        balance?: 'all' | 'due' | 'advance' | 'clear' | 'overdue' | 'over_limit';
        city?: string;
        category?: string;
        sort?: 'recent' | 'name' | 'balance_desc' | 'purchases_desc' | 'overdue_desc' | 'last_purchase' | 'oldest';
    }) {
        const where: Prisma.SupplierWhereInput = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { phone_number: { contains: search, mode: 'insensitive' } },
                { mobile_number: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { contact_person: { contains: search, mode: 'insensitive' } },
                { city: { contains: search, mode: 'insensitive' } },
                { ntn: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (is_active !== undefined) where.is_active = is_active;
        if (display_on_pos !== undefined) where.display_on_pos = display_on_pos;
        if (city) where.city = { equals: city, mode: 'insensitive' };
        if (category) where.category = { equals: category, mode: 'insensitive' };

        const matched = await prisma.supplier.findMany({
            where,
            orderBy: { created_at: sort === 'oldest' ? 'asc' : 'desc' },
            include: { _count: { select: { products: true, purchases: true, payments: true } } },
        });
        const ids = matched.map((s) => s.id);
        const [balances, aging] = await Promise.all([supplierBalances(ids), supplierAging(ids)]);

        let rows = matched.map((s) => {
            const b = balances.get(s.id);
            const a = aging.get(s.id);
            const limitAmt = s.credit_limit == null ? null : asNumber(s.credit_limit);
            const due = b?.balanceDue ?? 0;
            return {
                ...s,
                credit_limit: limitAmt,
                opening_balance: asNumber(s.opening_balance),
                product_count: s._count.products,
                purchase_count: s._count.purchases,
                payment_count: s._count.payments,
                total_purchased: b?.totalPurchased ?? 0,
                total_paid: b?.totalPaid ?? 0,
                total_returned: b?.totalReturned ?? 0,
                total_adjusted: b?.totalAdjusted ?? 0,
                balance_due: due,
                overdue_amount: a?.overdue ?? 0,
                oldest_overdue_days: a?.oldestDays ?? 0,
                next_due_date: a?.nextDue ?? null,
                aging: a?.buckets ?? null,
                last_purchase_date: b?.lastPurchase ?? null,
                last_payment_date: b?.lastPayment ?? null,
                over_limit: limitAmt != null && limitAmt > 0 && due > limitAmt,
                _count: undefined,
            };
        });

        if (balance === 'due') rows = rows.filter((r) => r.balance_due > 0.005);
        else if (balance === 'advance') rows = rows.filter((r) => r.balance_due < -0.005);
        else if (balance === 'clear') rows = rows.filter((r) => Math.abs(r.balance_due) <= 0.005);
        else if (balance === 'overdue') rows = rows.filter((r) => r.overdue_amount > 0.005);
        else if (balance === 'over_limit') rows = rows.filter((r) => r.over_limit);

        if (sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name));
        else if (sort === 'balance_desc') rows.sort((a, b) => b.balance_due - a.balance_due);
        else if (sort === 'purchases_desc') rows.sort((a, b) => b.total_purchased - a.total_purchased);
        else if (sort === 'overdue_desc') rows.sort((a, b) => b.overdue_amount - a.overdue_amount || b.oldest_overdue_days - a.oldest_overdue_days);
        else if (sort === 'last_purchase') rows.sort((a, b) => (b.last_purchase_date?.getTime() ?? 0) - (a.last_purchase_date?.getTime() ?? 0));

        const take = fetch_all ? Math.min(500, Math.max(limit, 1)) : limit;
        const total = rows.length;
        const skip = fetch_all ? 0 : (page - 1) * limit;
        const pageRows = rows.slice(skip, skip + take);
        return {
            data: pageRows,
            meta: { total, page, limit: take, totalPages: Math.max(1, Math.ceil(total / take)) },
        };
    }

    /** Distinct cities / categories for the filters. */
    async facets() {
        const rows = await prisma.supplier.findMany({ select: { city: true, category: true } });
        const uniq = (vals: (string | null)[]) => [...new Set(vals.map((v) => v?.trim()).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
        return { cities: uniq(rows.map((r) => r.city)), categories: uniq(rows.map((r) => r.category)) };
    }

    /* ------------------------------ account ------------------------------ */

    /** One supplier's position: balance, terms, aging and open bills. */
    async getSupplierAccount(supplierId: string) {
        const supplier = await this.getSupplierById(supplierId);
        const [balances, aging, lastPayment] = await Promise.all([
            supplierBalances([supplierId]),
            supplierAging([supplierId]),
            prisma.supplierPayment.findFirst({
                where: { supplier_id: supplierId, type: { in: ['PAYMENT', 'ADVANCE'] } },
                orderBy: { payment_date: 'desc' },
                select: { amount: true, payment_date: true, method: true },
            }),
        ]);
        const b = balances.get(supplierId)!;
        const a = aging.get(supplierId)!;
        const limit = supplier.credit_limit == null ? null : asNumber(supplier.credit_limit);
        return {
            balance: b,
            aging: a.buckets,
            due: a.due,
            overdue: a.overdue,
            advance: a.advance,
            oldestDays: a.oldestDays,
            nextDue: a.nextDue,
            openBills: a.bills,
            creditLimit: limit,
            creditDays: supplier.credit_days,
            availableCredit: limit != null && limit > 0 ? r2(limit - b.balanceDue) : null,
            limitUsedPct: limit != null && limit > 0 ? r2((Math.max(0, b.balanceDue) / limit) * 100) : null,
            lastPayment: lastPayment ? { amount: asNumber(lastPayment.amount), date: lastPayment.payment_date, method: lastPayment.method } : null,
            counts: supplier._count,
        };
    }

    /* ------------------------------ purchases ------------------------------ */

    async getSupplierPurchases(supplierId: string) {
        await this.getSupplierById(supplierId);
        const purchases = await prisma.purchase.findMany({
            where: { supplier_id: supplierId },
            include: {
                product: { select: { id: true, name: true, sku: true } },
                warehouse_branch: { select: { id: true, name: true } },
                purchase_invoice: { select: { id: true, invoice_number: true } },
            },
            orderBy: { purchase_date: 'desc' },
        });
        const productMap = new Map<string, { productId: string; productName: string; sku: string | null; totalQty: number; totalValue: number; purchaseCount: number; lastCost: number; firstCost: number; lastDate: Date }>();
        let totalQuantity = 0;
        let totalValue = 0;
        // Oldest first so first/last cost are right.
        for (const p of [...purchases].reverse()) {
            const qty = asNumber(p.quantity);
            const cost = asNumber(p.cost_price);
            const line = qty * cost;
            totalQuantity += qty;
            totalValue += line;
            const existing = productMap.get(p.product_id);
            if (existing) {
                existing.totalQty += qty;
                existing.totalValue += line;
                existing.purchaseCount += 1;
                if (cost > 0) existing.lastCost = cost;
                existing.lastDate = p.purchase_date;
            } else {
                productMap.set(p.product_id, {
                    productId: p.product_id,
                    productName: p.product?.name || 'Unknown',
                    sku: p.product?.sku || null,
                    totalQty: qty,
                    totalValue: line,
                    purchaseCount: 1,
                    lastCost: cost,
                    firstCost: cost,
                    lastDate: p.purchase_date,
                });
            }
        }
        return {
            purchases: purchases.map((p) => ({
                id: p.id,
                purchase_date: p.purchase_date,
                quantity: asNumber(p.quantity),
                cost_price: asNumber(p.cost_price),
                sale_price: asNumber(p.sale_price),
                line_total: asNumber(p.quantity) * asNumber(p.cost_price),
                invoice_ref: p.invoice_ref,
                bill_group_id: p.bill_group_id,
                notes: p.notes,
                delivery_status: p.delivery_status,
                product: p.product,
                warehouse_branch: p.warehouse_branch,
                invoice: p.purchase_invoice,
            })),
            productSummary: Array.from(productMap.values())
                .map((x) => ({ ...x, avgCost: x.totalQty ? r2(x.totalValue / x.totalQty) : 0, costChangePct: x.firstCost > 0 ? r2(((x.lastCost - x.firstCost) / x.firstCost) * 100) : 0 }))
                .sort((a, b) => b.totalValue - a.totalValue),
            summary: { purchaseCount: purchases.length, productCount: productMap.size, totalQuantity, totalValue: r2(totalValue) },
        };
    }

    /** Purchase orders, invoices and returns for one supplier. */
    async getSupplierDocuments(supplierId: string) {
        await this.getSupplierById(supplierId);
        const [orders, invoices, returns] = await Promise.all([
            prisma.purchaseOrder.findMany({
                where: { supplier_id: supplierId },
                orderBy: { created_at: 'desc' },
                take: 200,
            }),
            prisma.purchaseInvoice.findMany({
                where: { supplier_id: supplierId },
                orderBy: { invoice_date: 'desc' },
                include: { _count: { select: { purchases: true, payments: true } } },
                take: 300,
            }),
            prisma.purchaseReturn.findMany({
                where: { supplier_id: supplierId },
                orderBy: { return_date: 'desc' },
                include: { _count: { select: { items: true } } },
                take: 200,
            }),
        ]);
        const now = new Date();
        return {
            orders: orders.map((o) => ({
                id: o.id,
                number: o.po_number,
                date: o.order_date,
                expected: o.expected_delivery,
                delivered: o.delivery_date,
                status: o.status,
                total: asNumber(o.total_amount),
            })),
            invoices: invoices.map((i) => ({
                id: i.id,
                number: i.invoice_number,
                date: i.invoice_date,
                due: i.due_date,
                status: i.status,
                total: asNumber(i.total_amount),
                paid: asNumber(i.amount_paid),
                outstanding: r2(asNumber(i.total_amount) - asNumber(i.amount_paid)),
                overdue: !!i.due_date && i.due_date < now && asNumber(i.total_amount) - asNumber(i.amount_paid) > 0.005,
                items: i._count.purchases,
                payments: i._count.payments,
            })),
            returns: returns.map((r) => ({
                id: r.id,
                number: r.return_number,
                date: r.return_date,
                status: r.status,
                reason: r.reason,
                total: asNumber(r.total_amount),
                items: r._count.items,
            })),
        };
    }

    /* ------------------------------ ledger ------------------------------ */

    /**
     * Full chronological payable ledger. Debit = reduces what we owe
     * (payments, returns, debit notes, discounts); credit = increases it
     * (opening balance, goods / invoices, credit notes, refunds received).
     */
    private async computeSupplierLedger(supplierId: string) {
        const supplier = await this.getSupplierById(supplierId);
        const [purchases, invoices, returns, payments] = await Promise.all([
            prisma.purchase.findMany({
                where: { supplier_id: supplierId },
                include: { product: { select: { id: true, name: true, sku: true } } },
                orderBy: { purchase_date: 'asc' },
            }),
            prisma.purchaseInvoice.findMany({ where: { supplier_id: supplierId }, orderBy: { invoice_date: 'asc' } }),
            prisma.purchaseReturn.findMany({ where: { supplier_id: supplierId, status: 'COMPLETED' }, orderBy: { return_date: 'asc' } }),
            prisma.supplierPayment.findMany({
                where: { supplier_id: supplierId },
                include: { user: { select: { email: true } }, purchase_invoice: { select: { invoice_number: true } } },
                orderBy: { payment_date: 'asc' },
            }),
        ]);

        type LedgerEntry = {
            id: string;
            date: Date;
            type: string;
            description: string;
            reference: string | null;
            debit: number;
            credit: number;
            balance: number;
            meta?: Record<string, unknown>;
        };
        const order: Record<string, number> = { OPENING: -1, PURCHASE: 0, INVOICE: 0, CREDIT_NOTE: 0, REFUND: 1, RETURN: 1, DEBIT_NOTE: 1, DISCOUNT: 1, ADVANCE: 2, PAYMENT: 2 };
        const raw: Omit<LedgerEntry, 'balance'>[] = [];

        const ob = asNumber(supplier.opening_balance);
        if (Math.abs(ob) > 0.005) {
            raw.push({
                id: 'opening',
                date: supplier.opening_balance_date ?? supplier.created_at,
                type: 'OPENING',
                description: ob > 0 ? 'Opening balance (we owe)' : 'Opening balance (advance with supplier)',
                reference: null,
                debit: ob < 0 ? -ob : 0,
                credit: ob > 0 ? ob : 0,
            });
        }

        // Group uninvoiced goods per bill so the ledger reads like the supplier's bills.
        const groups = new Map<string, { id: string; date: Date; ref: string | null; amount: number; lines: string[]; ids: string[] }>();
        for (const p of purchases) {
            if (p.purchase_invoice_id) continue; // carried by the invoice
            const key = p.bill_group_id || `${p.invoice_ref || ''}|${toBusinessYmd(p.purchase_date)}|${p.invoice_ref ? '' : p.id}`;
            const g = groups.get(key) ?? { id: `purchase-${p.id}`, date: p.purchase_date, ref: p.invoice_ref, amount: 0, lines: [], ids: [] };
            g.amount += asNumber(p.quantity) * asNumber(p.cost_price);
            g.lines.push(`${p.product?.name || 'Product'} × ${asNumber(p.quantity)}`);
            g.ids.push(p.id);
            groups.set(key, g);
        }
        for (const g of groups.values()) {
            raw.push({
                id: g.id,
                date: g.date,
                type: 'PURCHASE',
                description: `Goods received · ${g.lines.slice(0, 3).join(', ')}${g.lines.length > 3 ? ` +${g.lines.length - 3} more` : ''}`,
                reference: g.ref,
                debit: 0,
                credit: r2(g.amount),
                meta: { purchaseIds: g.ids, lines: g.lines.length },
            });
        }
        for (const inv of invoices) {
            raw.push({
                id: `invoice-${inv.id}`,
                date: inv.invoice_date,
                type: 'INVOICE',
                description: `Purchase invoice ${inv.invoice_number}`,
                reference: inv.invoice_number,
                debit: 0,
                credit: asNumber(inv.total_amount),
                meta: { invoiceId: inv.id, status: inv.status, dueDate: inv.due_date },
            });
        }
        for (const r of returns) {
            raw.push({
                id: `return-${r.id}`,
                date: r.return_date,
                type: 'RETURN',
                description: `Goods returned ${r.return_number}${r.reason ? ` · ${r.reason}` : ''}`,
                reference: r.return_number,
                debit: asNumber(r.total_amount),
                credit: 0,
                meta: { returnId: r.id },
            });
        }
        for (const pay of payments) {
            const amount = asNumber(pay.amount);
            const effect = supplierEffect(pay.type);
            const label = SUPPLIER_TXN_LABEL[pay.type] ?? pay.type;
            const how = SUPPLIER_CASH_TYPES.has(pay.type) ? ` · ${METHOD_LABEL[pay.method] ?? pay.method}` : '';
            raw.push({
                id: `payment-${pay.id}`,
                date: pay.payment_date,
                type: pay.type,
                description: `${label}${how}${pay.purchase_invoice ? ` · against ${pay.purchase_invoice.invoice_number}` : ''}${pay.notes ? ` · ${pay.notes}` : ''}`,
                reference: pay.reference,
                debit: effect < 0 ? amount : 0,
                credit: effect > 0 ? amount : 0,
                meta: { paymentId: pay.id, method: pay.method, createdBy: pay.user?.email || null, invoiceId: pay.purchase_invoice_id },
            });
        }

        raw.sort((a, b) => a.date.getTime() - b.date.getTime() || (order[a.type] ?? 3) - (order[b.type] ?? 3));
        let running = 0;
        const entries: LedgerEntry[] = raw.map((e) => {
            running = r2(running + e.credit - e.debit);
            return { ...e, balance: running };
        });
        return { supplier, entries, purchases, invoices, returns, payments, closingBalance: running };
    }

    async getSupplierLedger(supplierId: string) {
        const { entries, purchases, invoices, returns, payments, supplier } = await this.computeSupplierLedger(supplierId);
        const bal = (await supplierBalances([supplierId])).get(supplierId)!;
        return {
            summary: {
                openingBalance: asNumber(supplier.opening_balance),
                totalPurchased: bal.totalPurchased,
                totalPaid: bal.totalPaid,
                totalReturned: bal.totalReturned,
                totalAdjusted: bal.totalAdjusted,
                balanceDue: bal.balanceDue,
                purchaseCount: purchases.length,
                invoiceCount: invoices.length,
                uninvoicedPurchases: purchases.filter((p) => !p.purchase_invoice_id).length,
                returnCount: returns.length,
                paymentCount: payments.length,
            },
            entries: [...entries].reverse(),
            payments: payments
                .map((p) => ({
                    id: p.id,
                    type: p.type,
                    amount: asNumber(p.amount),
                    payment_date: p.payment_date,
                    method: p.method,
                    reference: p.reference,
                    notes: p.notes,
                    purchase_invoice_id: p.purchase_invoice_id,
                    invoice_number: p.purchase_invoice?.invoice_number ?? null,
                    created_at: p.created_at,
                    user: p.user,
                }))
                .reverse(),
        };
    }

    /** Date-ranged statement (business dates): opening carried to `from`, entries in range, closing. */
    async getSupplierStatement(supplierId: string, range: { from?: string; to?: string } = {}) {
        const { supplier, entries } = await this.computeSupplierLedger(supplierId);
        const from = range.from && /^\d{4}-\d{2}-\d{2}/.test(range.from) ? localRange(range.from.slice(0, 10), range.from.slice(0, 10)).start : null;
        const to = range.to && /^\d{4}-\d{2}-\d{2}/.test(range.to) ? localRange(range.to.slice(0, 10), range.to.slice(0, 10)).end : null;

        let openingBalance = 0;
        const windowEntries: typeof entries = [];
        for (const e of entries) {
            if (from && e.date < from) {
                openingBalance = e.balance;
                continue;
            }
            if (to && e.date > to) continue;
            windowEntries.push(e);
        }
        const totalDebit = r2(windowEntries.reduce((acc, e) => acc + e.debit, 0));
        const totalCredit = r2(windowEntries.reduce((acc, e) => acc + e.credit, 0));
        return {
            supplier: {
                id: supplier.id,
                name: supplier.name,
                code: supplier.code,
                phone_number: supplier.phone_number,
                mobile_number: supplier.mobile_number,
                email: supplier.email,
                address: supplier.address,
                city: supplier.city,
                ntn: supplier.ntn,
                strn: supplier.strn,
                contact_person: supplier.contact_person,
            },
            period: { from: from ? from.toISOString() : null, to: to ? to.toISOString() : null },
            summary: {
                openingBalance,
                totalDebit,
                totalCredit,
                closingBalance: r2(openingBalance + totalCredit - totalDebit),
                entryCount: windowEntries.length,
            },
            entries: windowEntries,
        };
    }

    /** Products assigned to this supplier (the supplier's catalogue). */
    async getSupplierProducts(supplierId: string) {
        await this.getSupplierById(supplierId);
        const products = await prisma.product.findMany({
            where: { supplier_id: supplierId },
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                sku: true,
                code: true,
                is_active: true,
                purchase_rate: true,
                sales_rate_inc_dis_and_tax: true,
                category: { select: { id: true, name: true } },
                unit: { select: { id: true, name: true } },
                stock: { select: { current_quantity: true } },
                _count: { select: { purchases: true } },
            },
        });
        const sold = products.length
            ? await prisma.saleItem.groupBy({
                  by: ['product_id'],
                  where: { product_id: { in: products.map((p) => p.id) }, item_type: { not: 'RETURN' }, sale: { status: { notIn: ['CANCELLED', 'PENDING'] } } },
                  _sum: { quantity: true },
              })
            : [];
        const soldMap = new Map(sold.map((s) => [s.product_id, asNumber(s._sum.quantity)]));
        return products.map((p) => {
            const cost = asNumber(p.purchase_rate);
            const price = asNumber(p.sales_rate_inc_dis_and_tax);
            return {
                id: p.id,
                name: p.name,
                sku: p.sku,
                code: p.code,
                is_active: p.is_active,
                purchase_rate: cost,
                sales_rate: price,
                margin: price > 0 ? r2(((price - cost) / price) * 100) : null,
                stock: r2(p.stock.reduce((t, s) => t + asNumber(s.current_quantity), 0)),
                sold: soldMap.get(p.id) ?? 0,
                category: p.category?.name ?? null,
                unit: p.unit?.name ?? null,
                purchase_count: p._count.purchases,
            };
        });
    }

    /* ------------------------------ payments & adjustments ------------------------------ */

    private async checkInvoice(supplierId: string, type: string, invoiceId?: string | null) {
        if (!invoiceId) return null;
        if (!SUPPLIER_INVOICE_TYPES.has(type)) throw new AppError(400, 'Only payments, debit notes and discounts can be set against an invoice');
        const invoice = await prisma.purchaseInvoice.findFirst({ where: { id: invoiceId, supplier_id: supplierId } });
        if (!invoice) throw new AppError(400, 'That invoice does not belong to this supplier');
        return invoice.id;
    }

    private serializePayment(p: Prisma.SupplierPaymentGetPayload<{ include: { user: { select: { email: true } }; purchase_invoice: { select: { invoice_number: true } } } }>) {
        return {
            id: p.id,
            type: p.type,
            amount: asNumber(p.amount),
            payment_date: p.payment_date,
            method: p.method,
            reference: p.reference,
            notes: p.notes,
            purchase_invoice_id: p.purchase_invoice_id,
            invoice_number: p.purchase_invoice?.invoice_number ?? null,
            created_at: p.created_at,
            user: p.user,
        };
    }

    async createSupplierPayment(supplierId: string, data: CreateSupplierPaymentInput, createdBy: string) {
        await this.getSupplierById(supplierId);
        const type = data.type || 'PAYMENT';
        const date = data.paymentDate ? localRange(data.paymentDate.slice(0, 10), data.paymentDate.slice(0, 10)).start : new Date();
        // Today keeps the actual time so the ledger orders entries correctly.
        const paymentDate = data.paymentDate && data.paymentDate.slice(0, 10) !== businessTodayYmd() ? new Date(date.getTime() + 12 * 3600_000) : new Date();
        await assertPeriodOpen(paymentDate, 'a supplier payment');
        const invoiceId = await this.checkInvoice(supplierId, type, data.purchaseInvoiceId);

        const method = SUPPLIER_CASH_TYPES.has(type) ? String(data.method || 'CASH').toUpperCase() : 'ADJUSTMENT';
        const payment = await prisma.supplierPayment.create({
            data: {
                supplier_id: supplierId,
                type,
                amount: data.amount,
                payment_date: paymentDate,
                method,
                reference: data.reference || null,
                notes: data.notes || null,
                purchase_invoice_id: invoiceId,
                created_by: createdBy,
            },
            include: { user: { select: { email: true } }, purchase_invoice: { select: { invoice_number: true } } },
        });
        if (invoiceId) await PurchaseInvoiceService.recompute(invoiceId);
        if (SUPPLIER_CASH_TYPES.has(type) && method === 'CASH') {
            const supplier = await prisma.supplier.findUnique({
                where: { id: supplierId },
                select: { name: true },
            });
            await recordCashPayOnOpenRegister({
                particular: `Purchase payment · ${supplier?.name || 'Supplier'}`,
                amount: Number(data.amount),
                userId: createdBy,
                reference: payment.id,
                notes: data.notes || data.reference || null,
            }).catch(() => undefined);
        }
        return this.serializePayment(payment);
    }

    async updateSupplierPayment(supplierId: string, paymentId: string, data: UpdateSupplierPaymentInput) {
        const existing = await prisma.supplierPayment.findFirst({ where: { id: paymentId, supplier_id: supplierId } });
        if (!existing) throw new AppError(404, 'Transaction not found');
        await assertPeriodOpen(existing.payment_date, 'a supplier payment');
        const type = data.type || existing.type;
        let paymentDate: Date | undefined;
        if (data.paymentDate) {
            const start = localRange(data.paymentDate.slice(0, 10), data.paymentDate.slice(0, 10)).start;
            paymentDate = toBusinessYmd(existing.payment_date) === data.paymentDate.slice(0, 10) ? existing.payment_date : new Date(start.getTime() + 12 * 3600_000);
            await assertPeriodOpen(paymentDate, 'a supplier payment');
        }
        const invoiceId =
            data.purchaseInvoiceId !== undefined ? await this.checkInvoice(supplierId, type, data.purchaseInvoiceId) : SUPPLIER_INVOICE_TYPES.has(type) ? existing.purchase_invoice_id : null;
        const payment = await prisma.supplierPayment.update({
            where: { id: paymentId },
            data: {
                type,
                ...(data.amount !== undefined ? { amount: data.amount } : {}),
                ...(paymentDate ? { payment_date: paymentDate } : {}),
                method: SUPPLIER_CASH_TYPES.has(type) ? data.method || (existing.method === 'ADJUSTMENT' ? 'CASH' : existing.method) : 'ADJUSTMENT',
                ...(data.reference !== undefined ? { reference: data.reference || null } : {}),
                ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
                purchase_invoice_id: invoiceId,
            },
            include: { user: { select: { email: true } }, purchase_invoice: { select: { invoice_number: true } } },
        });
        for (const id of new Set([existing.purchase_invoice_id, invoiceId].filter((v): v is string => !!v))) await PurchaseInvoiceService.recompute(id);
        return this.serializePayment(payment);
    }

    async deleteSupplierPayment(supplierId: string, paymentId: string) {
        const payment = await prisma.supplierPayment.findFirst({ where: { id: paymentId, supplier_id: supplierId } });
        if (!payment) throw new AppError(404, 'Transaction not found');
        await assertPeriodOpen(payment.payment_date, 'a supplier payment');
        const invoiceId = payment.purchase_invoice_id;
        await prisma.supplierPayment.delete({ where: { id: paymentId } });
        if (invoiceId) await PurchaseInvoiceService.recompute(invoiceId);
        return { message: 'Transaction deleted' };
    }
}
