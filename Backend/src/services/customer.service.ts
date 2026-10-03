import { Customer } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import jwt from 'jsonwebtoken';
import { config } from '../config/app';
import bcrypt from 'bcryptjs';
import { asNumber } from '../utils/helpers';
import { CreateCustomerPaymentInput, UpdateCustomerPaymentInput } from '../validations/customer.validation';
import {
    AGING_BUCKETS,
    TXN_LABEL,
    buildCustomerAccount,
    buildCustomerAccounts,
    isCreditTxn,
    receivablesSummary,
} from './customer-accounts.service';
import { parsePagination, paginationMeta } from '../utils/pagination';
import { parseOptionalDateRange } from '../utils/timezone';
import { assertPeriodOpen } from './period-lock.service';

type LedgerType =
    | 'OPENING'
    | 'SALE'
    | 'SALE_PAYMENT'
    | 'RETURN'
    | 'EXCHANGE'
    | 'PAYMENT'
    | 'ADVANCE'
    | 'REFUND'
    | 'CREDIT_NOTE'
    | 'DEBIT_NOTE'
    | 'WRITE_OFF'
    | 'RETURN_REFUND';

type LedgerEntry = {
    id: string;
    date: Date;
    type: LedgerType;
    description: string;
    reference: string | null;
    debit: number;
    credit: number;
    balance: number;
    meta?: Record<string, unknown>;
};

class CustomerService {
    private generateToken(cusId: Customer['id'], email: Customer['email']): string {
        const token = jwt.sign(
            {
                email: email,
                id: cusId
            },
            config.jwtSecret,
            // No expiration - token remains valid until user logs out
        );

        return token;
    }

    private async verifyCustomerExistance(email: Customer['email']): Promise<boolean> {
        const customer = await prisma.customer.findFirst({
            where: {
                email: email,
            },
        });
        if (customer) return true;
        return false;
    }

    public async createCustomer(data: Customer) {
        const customerExists = await this.verifyCustomerExistance(data.email);
        if (customerExists) {
            throw new AppError(400, 'Customer already exists');
        }

        // Ensure password is hashed before storing
        const hashedPassword = await bcrypt.hash(data.password!, 10);

        const customer = await prisma.customer.create({
            data: {
                ...data,
                password: hashedPassword,
            },
        });

        const token = this.generateToken(customer.id, customer.email!);

        return {
            email: customer.email,
            token,
        };
    }

    public async createShopCustomer(data: Partial<Customer> & {
        credit_limit?: number | null;
        previous_credit_balance?: number | null;
        default_discount_percent?: number | null;
        credit_days?: number | null;
        notes?: string | null;
    }) {
        const email = this.resolveCustomerEmail(data.email, data.phone_number);
        const customerExists = await this.verifyCustomerExistance(email);
        if (customerExists) {
            throw new AppError(400, 'Customer already exists');
        }

        const customer = await prisma.customer.create({
            data: {
                name: data.name,
                phone_number: data.phone_number,
                email,
                address: data.address,
                billing_address: data.billing_address,
                is_active: data.is_active ?? true,
                credit_limit: data.credit_limit ?? null,
                previous_credit_balance: data.previous_credit_balance ?? 0,
                default_discount_percent: data.default_discount_percent ?? 0,
                credit_days: data.credit_days ?? null,
                notes: data.notes?.trim() || null,
            },
        });

        return {
            customer,
        };
    }

    private resolveCustomerEmail(email?: string | null, phone_number?: string | null) {
        const trimmed = email?.trim();
        if (trimmed) return trimmed;

        const digits = (phone_number || '').replace(/\D/g, '') || Date.now().toString();
        return `customer_${digits}_${Math.random().toString(36).slice(2, 8)}@pos.local`;
    }

    public async loginCustomer(email: Customer['email'], password: Customer['password']) {
        const customer = await prisma.customer.findFirst({
            where: { email },
        });

        if (!customer || !customer.password) {
            throw new AppError(401, 'Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(password!, customer.password);
        if (!isPasswordValid) {
            throw new AppError(401, 'Invalid credentials');
        }

        const token = this.generateToken(customer.id, customer.email!);

        return {
            email: customer.email,
            token,
        };
    }

    public async getCustomerById(customerId: Customer['id']) {
        const customer = await prisma.customer.findUnique({
            where: { id: customerId },
        });

        if (!customer) {
            throw new AppError(404, 'Customer not found');
        }

        return customer;
    }

    public async getCustomers(params?: {
        search?: string;
        page?: number;
        limit?: number;
        is_active?: boolean;
        created_after?: string;
        balance?: string;
        sort?: string;
    }) {
        const search = params?.search?.trim();
        const { page, limit, skip } = parsePagination({
            page: params?.page,
            limit: params?.limit,
        });
        const createdAfter = params?.created_after ? new Date(params.created_after) : null;
        const validCreatedAfter =
            createdAfter && !Number.isNaN(createdAfter.getTime()) ? createdAfter : null;

        const where = {
            ...(params?.is_active !== undefined ? { is_active: params.is_active } : {}),
            ...(validCreatedAfter ? { created_at: { gte: validCreatedAfter } } : {}),
            ...(search
                ? {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' as const } },
                        { email: { contains: search, mode: 'insensitive' as const } },
                        { phone_number: { contains: search } },
                        { mobile_number: { contains: search } },
                    ],
                }
                : {}),
        };

        const balanceFilter = params?.balance && params.balance !== 'all' ? params.balance : null;
        const sort = params?.sort || 'recent';
        // Balance filters / sorts need every matching customer's account before paging.
        const needsAll =
            Boolean(balanceFilter) || ['balance_desc', 'overdue_desc', 'sales_desc', 'last_visit'].includes(sort);

        const orderBy =
            sort === 'name'
                ? { name: 'asc' as const }
                : sort === 'oldest'
                    ? { created_at: 'asc' as const }
                    : { created_at: 'desc' as const };

        const customers = await prisma.customer.findMany({
            where,
            orderBy,
            ...(needsAll ? {} : { skip, take: limit }),
        });
        let total = needsAll ? customers.length : await prisma.customer.count({ where });

        if (customers.length === 0) {
            return { data: [], meta: paginationMeta(total, page, limit) };
        }

        const customerIds = customers.map((customer) => customer.id);
        const [accounts, saleAggregates] = await Promise.all([
            buildCustomerAccounts(customerIds),
            prisma.sale.groupBy({
                by: ['customer_id'],
                where: { customer_id: { in: customerIds }, status: 'COMPLETED', original_sale_id: null },
                _sum: { total_amount: true },
                _count: { id: true },
                _max: { sale_date: true },
            }),
        ]);
        const statsByCustomerId = new Map(
            saleAggregates
                .filter((row) => row.customer_id)
                .map((row) => [
                    row.customer_id as string,
                    {
                        total_sale_amount: Number(row._sum.total_amount ?? 0),
                        sale_count: row._count.id,
                        last_sale_date: row._max.sale_date,
                    },
                ]),
        );

        let rows = customers.map((customer) => {
            const stats = statsByCustomerId.get(customer.id);
            const account = accounts.get(customer.id);
            return {
                ...customer,
                total_sale_amount: stats?.total_sale_amount ?? 0,
                sale_count: stats?.sale_count ?? 0,
                last_sale_date: stats?.last_sale_date ?? null,
                balance: account?.balance ?? 0,
                balance_due: account?.receivable ?? 0,
                advance_balance: account?.advance ?? 0,
                overdue_amount: account?.overdue ?? 0,
                over_limit: account?.overLimit ?? false,
                last_payment_date: account?.lastPaymentDate ?? null,
            };
        });

        if (balanceFilter) {
            rows = rows.filter((row) => {
                if (balanceFilter === 'due') return row.balance_due > 0.005;
                if (balanceFilter === 'advance') return row.advance_balance > 0.005;
                if (balanceFilter === 'overdue') return row.overdue_amount > 0.005;
                if (balanceFilter === 'over_limit') return row.over_limit;
                if (balanceFilter === 'clear') return row.balance_due <= 0.005 && row.advance_balance <= 0.005;
                return true;
            });
        }
        if (needsAll) {
            const time = (d: Date | null) => (d ? new Date(d).getTime() : 0);
            if (sort === 'balance_desc') {
                rows.sort((a, b) => b.balance_due - a.balance_due || b.advance_balance - a.advance_balance);
            }
            if (sort === 'overdue_desc') rows.sort((a, b) => b.overdue_amount - a.overdue_amount);
            if (sort === 'sales_desc') rows.sort((a, b) => b.total_sale_amount - a.total_sale_amount);
            if (sort === 'last_visit') rows.sort((a, b) => time(b.last_sale_date) - time(a.last_sale_date));
            total = rows.length;
            rows = rows.slice(skip, skip + limit);
        }

        return { data: rows, meta: paginationMeta(total, page, limit) };
    }

    /** Shop-wide receivables: totals, aging, top debtors and advance holders. */
    public async getReceivablesSummary() {
        return receivablesSummary();
    }

    public async updateCustomer(
        customerId: Customer['id'],
        updateData: Partial<Customer> & {
            credit_limit?: number | null;
            previous_credit_balance?: number | null;
        },
    ) {
        const existingCustomer = await prisma.customer.findUnique({
            where: { id: customerId },
        });

        if (!existingCustomer) {
            throw new AppError(404, 'Customer not found');
        }

        if (updateData.password) {
            updateData.password = await bcrypt.hash(updateData.password, 10);
        }

        const data: Partial<Customer> = { ...updateData };

        if (data.email !== undefined) {
            const trimmed = data.email?.trim();
            data.email = trimmed
                ? trimmed
                : this.resolveCustomerEmail(null, data.phone_number ?? existingCustomer.phone_number);
        }

        if (data.credit_limit === undefined) {
            delete (data as { credit_limit?: unknown }).credit_limit;
        }

        const updatedCustomer = await prisma.customer.update({
            where: { id: customerId },
            data,
        });

        return updatedCustomer;
    }

    public async deleteCustomer(customerId: Customer['id']) {
        const existingCustomer = await prisma.customer.findUnique({
            where: { id: customerId },
        });

        if (!existingCustomer) {
            throw new AppError(404, 'Customer not found');
        }

        await prisma.$transaction(
            async (tx) => {
                await tx.customerPayment.deleteMany({
                    where: { customer_id: customerId },
                });

                await tx.sale.updateMany({
                    where: { original_sale: { customer_id: customerId } },
                    data: { original_sale_id: null },
                });

                await tx.saleItem.deleteMany({
                    where: { sale: { customer_id: customerId } },
                });
                await tx.sale.deleteMany({ where: { customer_id: customerId } });

                await tx.orderItem.deleteMany({
                    where: { order: { customer_id: customerId } },
                });
                await tx.order.deleteMany({ where: { customer_id: customerId } });

                await tx.holdSale.deleteMany({ where: { customer_id: customerId } });
                await tx.deviceIdentity.deleteMany({ where: { customer_id: customerId } });

                await tx.customer.delete({ where: { id: customerId } });
            },
            {
                maxWait: 30000,
                timeout: 120000,
            },
        );

        return { message: 'Customer deleted successfully' };
    }

    // No server-side session to invalidate — the token is the session and is
    // discarded by the client. Method kept so the existing /customer/logout
    // route stays valid.
    public async logoutCustomer(_customerId: Customer['id']) {
        return { message: 'Logged out successfully' };
    }

    public async getCustomerPurchases(customerId: string) {
        await this.getCustomerById(customerId);

        const sales = await prisma.sale.findMany({
            where: {
                customer_id: customerId,
                status: { in: ['COMPLETED', 'REFUNDED', 'EXCHANGED'] },
                original_sale_id: null,
            },
            include: {
                sale_items: {
                    include: {
                        product: { select: { id: true, name: true, sku: true } },
                    },
                },
                branch: { select: { id: true, name: true } },
            },
            orderBy: { sale_date: 'desc' },
        });

        const productMap = new Map<
            string,
            {
                productId: string;
                productName: string;
                sku: string | null;
                totalQty: number;
                totalValue: number;
                orderCount: number;
            }
        >();

        let totalQuantity = 0;
        let totalValue = 0;

        const orders = sales.map((sale) => {
            const items = sale.sale_items.map((item) => {
                const qty = asNumber(item.quantity);
                const lineTotal = asNumber(item.line_total);
                totalQuantity += qty;
                totalValue += lineTotal;

                const pid = item.product_id;
                const existing = productMap.get(pid);
                if (existing) {
                    existing.totalQty += qty;
                    existing.totalValue += lineTotal;
                    existing.orderCount += 1;
                } else {
                    productMap.set(pid, {
                        productId: pid,
                        productName: item.product?.name || 'Unknown',
                        sku: item.product?.sku || null,
                        totalQty: qty,
                        totalValue: lineTotal,
                        orderCount: 1,
                    });
                }

                return {
                    id: item.id,
                    product_id: item.product_id,
                    quantity: qty,
                    unit_price: asNumber(item.unit_price),
                    discount_amount: asNumber(item.discount_amount),
                    tax_amount: asNumber(item.tax_amount),
                    line_total: lineTotal,
                    item_type: item.item_type,
                    product: item.product,
                };
            });

            return {
                id: sale.id,
                sale_number: sale.sale_number,
                invoice_number: sale.invoice_number,
                sale_date: sale.sale_date,
                status: sale.status,
                payment_method: sale.payment_method,
                payment_status: sale.payment_status,
                subtotal: asNumber(sale.subtotal),
                tax_amount: asNumber(sale.tax_amount),
                discount_amount: asNumber(sale.discount_amount),
                total_amount: asNumber(sale.total_amount),
                payment_received: asNumber(sale.payment_received),
                notes: sale.notes,
                branch: sale.branch,
                items,
            };
        });

        return {
            orders,
            productSummary: Array.from(productMap.values()).sort(
                (a, b) => b.totalValue - a.totalValue,
            ),
            summary: {
                orderCount: orders.length,
                productCount: productMap.size,
                totalQuantity,
                totalValue,
            },
        };
    }

    /**
     * Builds the full chronological ledger for a customer: opening balance,
     * every completed sale (debit) with its at-sale payment (credit), every
     * return/exchange child sale (credit when money flows back to the customer,
     * debit when they owe an exchange difference), and every manual payment
     * (credit). Shared by the live ledger view and the printable statement.
     */
    private async computeLedger(customerId: string) {
        const customer = await this.getCustomerById(customerId);

        const [sales, returns, payments] = await Promise.all([
            prisma.sale.findMany({
                where: {
                    customer_id: customerId,
                    status: 'COMPLETED',
                    original_sale_id: null,
                },
                orderBy: { sale_date: 'asc' },
            }),
            prisma.sale.findMany({
                where: {
                    customer_id: customerId,
                    original_sale_id: { not: null },
                },
                include: { original_sale: { select: { sale_number: true, invoice_number: true } } },
                orderBy: { sale_date: 'asc' },
            }),
            prisma.customerPayment.findMany({
                where: { customer_id: customerId },
                include: {
                    user: { select: { email: true } },
                    sale: { select: { id: true, sale_number: true, invoice_number: true } },
                },
                orderBy: { payment_date: 'asc' },
            }),
        ]);
        const account = await buildCustomerAccount(customerId);

        const typeOrder: Record<LedgerType, number> = {
            OPENING: 0,
            SALE: 1,
            SALE_PAYMENT: 2,
            RETURN: 3,
            EXCHANGE: 3,
            RETURN_REFUND: 3,
            PAYMENT: 4,
            ADVANCE: 4,
            CREDIT_NOTE: 4,
            WRITE_OFF: 4,
            REFUND: 5,
            DEBIT_NOTE: 5,
        };

        const raw: Omit<LedgerEntry, 'balance'>[] = [];

        const opening = asNumber(customer.previous_credit_balance);
        if (opening > 0) {
            raw.push({
                id: `opening-${customer.id}`,
                date: customer.created_at,
                type: 'OPENING',
                description: 'Opening credit balance',
                reference: null,
                debit: opening,
                credit: 0,
                meta: { previous_credit_balance: opening },
            });
        }

        for (const sale of sales) {
            const total = asNumber(sale.total_amount);
            const received = asNumber(sale.payment_received);

            raw.push({
                id: `sale-${sale.id}`,
                date: sale.sale_date,
                type: 'SALE',
                description: `Sale · ${sale.invoice_number || sale.sale_number}`,
                reference: sale.invoice_number || sale.sale_number,
                debit: total,
                credit: 0,
                meta: {
                    saleId: sale.id,
                    saleNumber: sale.sale_number,
                    invoiceNumber: sale.invoice_number,
                },
            });

            if (received > 0) {
                raw.push({
                    id: `sale-payment-${sale.id}`,
                    date: sale.sale_date,
                    type: 'SALE_PAYMENT',
                    description: `Sale payment · ${sale.invoice_number || sale.sale_number}`,
                    reference: sale.invoice_number || sale.sale_number,
                    debit: 0,
                    credit: received,
                    meta: {
                        saleId: sale.id,
                        paymentMethod: sale.payment_method,
                    },
                });
            }
        }

        for (const ret of returns) {
            // Return line totals are recorded negative and exchange replacements
            // positive, so `total_amount` is the net effect on what the customer
            // owes: negative => credit them back, positive => exchange difference.
            const net = asNumber(ret.total_amount);
            const ref =
                ret.original_sale?.invoice_number ||
                ret.original_sale?.sale_number ||
                ret.sale_number;
            if (net < 0) {
                raw.push({
                    id: `return-${ret.id}`,
                    date: ret.sale_date,
                    type: 'RETURN',
                    description: `Return · ${ref}`,
                    reference: ref,
                    debit: 0,
                    credit: Math.abs(net),
                    meta: { returnSaleId: ret.id, refundMethod: ret.payment_method },
                });
            } else if (net > 0) {
                raw.push({
                    id: `exchange-${ret.id}`,
                    date: ret.sale_date,
                    type: 'EXCHANGE',
                    description: `Exchange difference · ${ref}`,
                    reference: ref,
                    debit: net,
                    credit: 0,
                    meta: { returnSaleId: ret.id },
                });
                const recv = asNumber(ret.payment_received);
                if (recv > 0) {
                    raw.push({
                        id: `exchange-payment-${ret.id}`,
                        date: ret.sale_date,
                        type: 'SALE_PAYMENT',
                        description: `Exchange payment · ${ref}`,
                        reference: ref,
                        debit: 0,
                        credit: recv,
                        meta: { returnSaleId: ret.id, paymentMethod: ret.payment_method },
                    });
                }
            }
        }

        for (const pay of payments) {
            const amount = asNumber(pay.amount);
            const credit = isCreditTxn(pay.type);
            const against = pay.sale ? ` · ${pay.sale.invoice_number || pay.sale.sale_number}` : '';
            const viaMethod =
                pay.type === 'PAYMENT' || pay.type === 'ADVANCE' || pay.type === 'REFUND' ? ` · ${pay.method}` : '';
            raw.push({
                id: `payment-${pay.id}`,
                date: pay.payment_date,
                type: pay.type as LedgerType,
                description: `${TXN_LABEL[pay.type]}${viaMethod}${against}${pay.notes ? ` · ${pay.notes}` : ''}`,
                reference: pay.reference,
                debit: credit ? 0 : amount,
                credit: credit ? amount : 0,
                meta: {
                    paymentId: pay.id,
                    method: pay.method,
                    saleId: pay.sale_id,
                    createdBy: pay.user?.email || null,
                },
            });
        }

        // Return value handed back in cash / card / bank (not kept as store credit).
        for (const refund of account?.returnRefunds ?? []) {
            raw.push({
                id: `return-refund-${refund.saleId}`,
                date: refund.date,
                type: 'RETURN_REFUND',
                description: `Refund paid on return · ${refund.reference}`,
                reference: refund.reference,
                debit: refund.amount,
                credit: 0,
                meta: { returnSaleId: refund.saleId },
            });
        }

        raw.sort((a, b) => {
            const d = a.date.getTime() - b.date.getTime();
            if (d !== 0) return d;
            return typeOrder[a.type] - typeOrder[b.type];
        });

        let running = 0;
        const entries: LedgerEntry[] = raw.map((e) => {
            running += e.debit - e.credit;
            return { ...e, balance: running };
        });

        const creditLimit =
            customer.credit_limit === null || customer.credit_limit === undefined
                ? null
                : asNumber(customer.credit_limit);

        return {
            customer,
            entries,
            opening,
            closingBalance: running,
            creditLimit,
            saleCount: sales.length,
            returnCount: returns.length,
            paymentCount: payments.length,
            payments,
            account,
        };
    }

    public async getCustomerLedger(customerId: string) {
        const {
            customer,
            entries,
            opening,
            closingBalance,
            creditLimit,
            saleCount,
            returnCount,
            paymentCount,
            payments,
            account,
        } = await this.computeLedger(customerId);

        const totalPaid = entries.reduce((acc, e) => acc + e.credit, 0);
        const totalDebit = entries.reduce((acc, e) => acc + e.debit, 0);
        const receivable = account?.receivable ?? Math.max(0, closingBalance);
        const creditAvailable = creditLimit === null ? null : Math.max(0, creditLimit - receivable);

        return {
            summary: {
                totalPaid,
                totalDebit,
                balance: account?.balance ?? closingBalance,
                balanceDue: receivable,
                advanceBalance: account?.advance ?? Math.max(0, -closingBalance),
                overdue: account?.overdue ?? 0,
                creditLimit,
                creditAvailable,
                creditDays: customer.credit_days ?? null,
                overLimit: account?.overLimit ?? false,
                openingBalance: opening,
                saleCount,
                returnCount,
                paymentCount,
                lastPaymentDate: account?.lastPaymentDate ?? null,
                totals: account?.totals ?? null,
                aging: account?.aging ?? Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])),
            },
            openItems: account?.openItems ?? [],
            entries: [...entries].reverse(),
            payments: payments.map((p) => this.serializePayment(p)).reverse(),
        };
    }

    /**
     * A printable account statement for a date range: opening balance carried
     * forward to `from`, the entries that fall within [from, to], and the
     * closing balance.
     */
    public async getCustomerStatement(
        customerId: string,
        range: { from?: string; to?: string } = {},
    ) {
        const { customer, entries, creditLimit } = await this.computeLedger(customerId);

        const { start: validFrom, end: validTo } = parseOptionalDateRange(range.from, range.to);

        let openingBalance = 0;
        const windowEntries: typeof entries = [];
        for (const e of entries) {
            if (validFrom && e.date < validFrom) {
                openingBalance = e.balance;
                continue;
            }
            if (validTo && e.date > validTo) continue;
            windowEntries.push(e);
        }

        const totalDebit = windowEntries.reduce((acc, e) => acc + e.debit, 0);
        const totalCredit = windowEntries.reduce((acc, e) => acc + e.credit, 0);
        const closingBalance = openingBalance + totalDebit - totalCredit;

        return {
            customer: {
                id: customer.id,
                name: customer.name,
                phone_number: customer.phone_number,
                email: customer.email,
                address: customer.address,
                credit_limit: creditLimit,
            },
            period: {
                from: validFrom ? validFrom.toISOString() : null,
                to: validTo ? validTo.toISOString() : null,
            },
            summary: {
                openingBalance,
                totalDebit,
                totalCredit,
                closingBalance,
                entryCount: windowEntries.length,
            },
            entries: windowEntries,
        };
    }

    /**
     * Reverse-chronological activity feed derived from existing records —
     * profile create/update, sales, returns/exchanges and payments. No new
     * tables; this is a read-only projection.
     */
    public async getCustomerActivity(customerId: string, limit = 50) {
        const customer = await this.getCustomerById(customerId);

        const [sales, payments] = await Promise.all([
            prisma.sale.findMany({
                where: { customer_id: customerId },
                orderBy: { sale_date: 'desc' },
                take: 200,
                select: {
                    id: true,
                    sale_number: true,
                    invoice_number: true,
                    total_amount: true,
                    sale_date: true,
                    original_sale_id: true,
                    payment_method: true,
                },
            }),
            prisma.customerPayment.findMany({
                where: { customer_id: customerId },
                orderBy: { payment_date: 'desc' },
                take: 200,
                include: { user: { select: { email: true } } },
            }),
        ]);

        type Activity = {
            id: string;
            date: Date;
            kind: 'CREATED' | 'UPDATED' | 'SALE' | 'RETURN' | 'PAYMENT';
            title: string;
            amount: number | null;
            meta?: Record<string, unknown>;
        };

        const items: Activity[] = [];

        items.push({
            id: `created-${customer.id}`,
            date: customer.created_at,
            kind: 'CREATED',
            title: 'Customer profile created',
            amount: null,
        });
        if (
            customer.updated_at &&
            customer.updated_at.getTime() - customer.created_at.getTime() > 1000
        ) {
            items.push({
                id: `updated-${customer.id}`,
                date: customer.updated_at,
                kind: 'UPDATED',
                title: 'Profile last updated',
                amount: null,
            });
        }

        for (const sale of sales) {
            const isReturn = Boolean(sale.original_sale_id);
            const amount = asNumber(sale.total_amount);
            items.push({
                id: `sale-${sale.id}`,
                date: sale.sale_date,
                kind: isReturn ? 'RETURN' : 'SALE',
                title: isReturn
                    ? `Return / exchange · ${sale.invoice_number || sale.sale_number}`
                    : `Sale · ${sale.invoice_number || sale.sale_number}`,
                amount,
                meta: { saleId: sale.id, paymentMethod: sale.payment_method },
            });
        }

        for (const pay of payments) {
            items.push({
                id: `payment-${pay.id}`,
                date: pay.payment_date,
                kind: 'PAYMENT',
                title: `Payment received · ${pay.method}`,
                amount: asNumber(pay.amount),
                meta: { paymentId: pay.id, by: pay.user?.email || null },
            });
        }

        items.sort((a, b) => b.date.getTime() - a.date.getTime());

        return { items: items.slice(0, Math.max(1, Math.min(limit, 200))) };
    }

    private async assertSaleOfCustomer(customerId: string, saleId?: string | null) {
        if (!saleId) return;
        const sale = await prisma.sale.findFirst({
            where: { id: saleId, customer_id: customerId },
            select: { id: true },
        });
        if (!sale) throw new AppError(400, 'That invoice does not belong to this customer');
    }

    private serializePayment(payment: {
        id: string;
        type: string;
        amount: Parameters<typeof asNumber>[0];
        payment_date: Date;
        method: string;
        reference: string | null;
        notes: string | null;
        sale_id: string | null;
        created_at: Date;
        user?: { email: string } | null;
        sale?: { id: string; sale_number: string; invoice_number: string | null } | null;
    }) {
        return {
            id: payment.id,
            type: payment.type,
            amount: asNumber(payment.amount),
            payment_date: payment.payment_date,
            method: payment.method,
            reference: payment.reference,
            notes: payment.notes,
            sale_id: payment.sale_id,
            sale: payment.sale ?? null,
            created_at: payment.created_at,
            user: payment.user,
        };
    }

    public async createCustomerPayment(
        customerId: string,
        data: CreateCustomerPaymentInput,
        createdBy: string,
    ) {
        await this.getCustomerById(customerId);
        await this.assertSaleOfCustomer(customerId, data.saleId);
        await assertPeriodOpen(data.paymentDate ? new Date(data.paymentDate) : new Date(), 'a customer transaction');

        const payment = await prisma.customerPayment.create({
            data: {
                customer_id: customerId,
                type: data.type || 'PAYMENT',
                sale_id: data.saleId || null,
                amount: data.amount,
                payment_date: data.paymentDate
                    ? new Date(data.paymentDate)
                    : new Date(),
                method: data.method || 'CASH',
                reference: data.reference || null,
                notes: data.notes || null,
                created_by: createdBy,
            },
            include: {
                user: { select: { email: true } },
                sale: { select: { id: true, sale_number: true, invoice_number: true } },
            },
        });

        return this.serializePayment(payment);
    }

    public async updateCustomerPayment(customerId: string, paymentId: string, data: UpdateCustomerPaymentInput) {
        const existing = await prisma.customerPayment.findFirst({
            where: { id: paymentId, customer_id: customerId },
        });
        if (!existing) throw new AppError(404, 'Transaction not found');
        await assertPeriodOpen(existing.payment_date, 'a customer transaction');
        if (data.paymentDate) await assertPeriodOpen(new Date(data.paymentDate), 'a customer transaction');
        if (data.saleId !== undefined) await this.assertSaleOfCustomer(customerId, data.saleId);

        const payment = await prisma.customerPayment.update({
            where: { id: paymentId },
            data: {
                ...(data.type ? { type: data.type } : {}),
                ...(data.amount !== undefined ? { amount: data.amount } : {}),
                ...(data.paymentDate ? { payment_date: new Date(data.paymentDate) } : {}),
                ...(data.method ? { method: data.method } : {}),
                ...(data.reference !== undefined ? { reference: data.reference || null } : {}),
                ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
                ...(data.saleId !== undefined ? { sale_id: data.saleId || null } : {}),
            },
            include: {
                user: { select: { email: true } },
                sale: { select: { id: true, sale_number: true, invoice_number: true } },
            },
        });
        return this.serializePayment(payment);
    }

    public async deleteCustomerPayment(customerId: string, paymentId: string) {
        const payment = await prisma.customerPayment.findFirst({
            where: { id: paymentId, customer_id: customerId },
        });
        if (!payment) throw new AppError(404, 'Transaction not found');
        await assertPeriodOpen(payment.payment_date, 'a customer transaction');
        await prisma.customerPayment.delete({ where: { id: paymentId } });
        return { message: 'Payment deleted successfully' };
    }
}

export default CustomerService;
