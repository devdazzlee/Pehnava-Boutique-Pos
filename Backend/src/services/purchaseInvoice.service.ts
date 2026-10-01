import { Prisma, PurchaseInvoiceStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { asNumber } from '../utils/helpers';
import { parsePagination, paginationMeta } from '../utils/pagination';
import { parseOptionalDateRange } from '../utils/timezone';

const INV_INCLUDE = {
    supplier: { select: { id: true, name: true, code: true } },
    branch: { select: { id: true, name: true } },
    user: { select: { id: true, email: true } },
    purchase_order: { select: { id: true, po_number: true } },
    purchases: {
        include: { product: { select: { id: true, name: true, sku: true, code: true } } },
    },
} satisfies Prisma.PurchaseInvoiceInclude;

type Tx = Prisma.TransactionClient;

interface CreateInvoiceInput {
    supplier_id: string;
    branch_id?: string | null;
    purchase_order_id?: string | null;
    invoice_number: string;
    invoice_date?: string;
    due_date?: string | null;
    tax_amount?: number;
    discount_amount?: number;
    notes?: string | null;
    purchase_ids: string[];
}

function statusFor(total: number, paid: number): PurchaseInvoiceStatus {
    if (paid >= total - 1e-6 && total > 0) return 'PAID';
    if (paid > 1e-6) return 'PARTIALLY_PAID';
    return 'UNPAID';
}

export class PurchaseInvoiceService {
    private shape = (
        inv: Prisma.PurchaseInvoiceGetPayload<{ include: typeof INV_INCLUDE }>,
    ) => ({
        ...inv,
        subtotal: asNumber(inv.subtotal),
        tax_amount: asNumber(inv.tax_amount),
        discount_amount: asNumber(inv.discount_amount),
        total_amount: asNumber(inv.total_amount),
        amount_paid: asNumber(inv.amount_paid),
        balance_due: asNumber(inv.total_amount) - asNumber(inv.amount_paid),
        purchases: inv.purchases.map((p) => ({
            id: p.id,
            product: p.product,
            quantity: asNumber(p.quantity),
            cost_price: asNumber(p.cost_price),
            line_total: asNumber(p.quantity) * asNumber(p.cost_price),
            purchase_date: p.purchase_date,
        })),
    });

    /** Received purchases from this supplier not yet on any invoice. */
    async uninvoicedPurchases(supplierId: string) {
        const rows = await prisma.purchase.findMany({
            where: { supplier_id: supplierId, purchase_invoice_id: null },
            include: {
                product: { select: { id: true, name: true, sku: true, code: true } },
                purchase_order: { select: { id: true, po_number: true } },
            },
            orderBy: { purchase_date: 'desc' },
        });
        return rows.map((p) => ({
            id: p.id,
            product: p.product,
            quantity: asNumber(p.quantity),
            cost_price: asNumber(p.cost_price),
            line_total: asNumber(p.quantity) * asNumber(p.cost_price),
            purchase_date: p.purchase_date,
            invoice_ref: p.invoice_ref,
            po_number: p.purchase_order?.po_number ?? null,
        }));
    }

    async list(q: {
        page?: unknown;
        limit?: unknown;
        supplier_id?: string;
        branch_id?: string;
        status?: string;
        overdue?: string;
        from?: string;
        to?: string;
    }) {
        const { page, limit, skip } = parsePagination({ page: q.page, limit: q.limit });
        const where: Prisma.PurchaseInvoiceWhereInput = {};
        if (q.supplier_id) where.supplier_id = q.supplier_id;
        if (q.branch_id) where.branch_id = q.branch_id;
        if (q.status && q.status in PurchaseInvoiceStatus) {
            where.status = q.status as PurchaseInvoiceStatus;
        }
        if (q.overdue === 'true') {
            where.status = { not: 'PAID' };
            where.due_date = { lt: new Date() };
        }
        const { start, end } = parseOptionalDateRange(q.from, q.to);
        if (start || end) {
            where.invoice_date = {};
            if (start) where.invoice_date.gte = start;
            if (end) where.invoice_date.lte = end;
        }

        const [rows, total, openRows] = await Promise.all([
            prisma.purchaseInvoice.findMany({
                where,
                orderBy: { invoice_date: 'desc' },
                skip,
                take: limit,
                include: INV_INCLUDE,
            }),
            prisma.purchaseInvoice.count({ where }),
            prisma.purchaseInvoice.findMany({
                where: { ...where, status: { not: 'PAID' } },
                select: { total_amount: true, amount_paid: true, due_date: true },
            }),
        ]);

        // Aging buckets on outstanding balance, by due date.
        const now = Date.now();
        const aging = { current: 0, d1_30: 0, d31_60: 0, d60_plus: 0 };
        let outstanding = 0;
        for (const r of openRows) {
            const bal = asNumber(r.total_amount) - asNumber(r.amount_paid);
            if (bal <= 0) continue;
            outstanding += bal;
            const daysLate = r.due_date
                ? Math.floor((now - r.due_date.getTime()) / 86_400_000)
                : 0;
            if (daysLate <= 0) aging.current += bal;
            else if (daysLate <= 30) aging.d1_30 += bal;
            else if (daysLate <= 60) aging.d31_60 += bal;
            else aging.d60_plus += bal;
        }

        return {
            data: rows.map(this.shape),
            meta: {
                ...paginationMeta(total, page, limit),
                summary: { outstanding, aging, openCount: openRows.length },
            },
        };
    }

    async getById(id: string) {
        const inv = await prisma.purchaseInvoice.findUnique({ where: { id }, include: INV_INCLUDE });
        if (!inv) throw new AppError(404, 'Purchase invoice not found');
        return this.shape(inv);
    }

    async create(data: CreateInvoiceInput, userId: string) {
        if (!data.purchase_ids?.length) {
            throw new AppError(400, 'Select at least one received delivery to invoice');
        }
        const [supplier, purchases] = await Promise.all([
            prisma.supplier.findUnique({ where: { id: data.supplier_id } }),
            prisma.purchase.findMany({ where: { id: { in: data.purchase_ids } } }),
        ]);
        if (!supplier) throw new AppError(400, 'Invalid supplier');
        if (purchases.length !== data.purchase_ids.length) {
            throw new AppError(400, 'One or more deliveries no longer exist');
        }
        for (const p of purchases) {
            if (p.supplier_id !== data.supplier_id) {
                throw new AppError(400, 'All deliveries must belong to the same supplier');
            }
            if (p.purchase_invoice_id) {
                throw new AppError(400, 'One or more deliveries are already on an invoice');
            }
        }

        const subtotal = purchases.reduce(
            (acc, p) => acc + asNumber(p.quantity) * asNumber(p.cost_price),
            0,
        );
        const tax = Number(data.tax_amount) || 0;
        const discount = Number(data.discount_amount) || 0;
        const total = subtotal + tax - discount;
        if (total < 0) throw new AppError(400, 'Discount cannot exceed the invoice value');

        try {
            const invoice = await prisma.$transaction(async (tx) => {
                const inv = await tx.purchaseInvoice.create({
                    data: {
                        invoice_number: data.invoice_number.trim(),
                        supplier_id: data.supplier_id,
                        branch_id: data.branch_id ?? null,
                        purchase_order_id: data.purchase_order_id ?? null,
                        invoice_date: data.invoice_date ? new Date(data.invoice_date) : new Date(),
                        due_date: data.due_date ? new Date(data.due_date) : null,
                        subtotal: new Prisma.Decimal(subtotal),
                        tax_amount: new Prisma.Decimal(tax),
                        discount_amount: new Prisma.Decimal(discount),
                        total_amount: new Prisma.Decimal(total),
                        amount_paid: new Prisma.Decimal(0),
                        status: 'UNPAID',
                        notes: data.notes ?? null,
                        created_by: userId,
                    },
                });
                await tx.purchase.updateMany({
                    where: { id: { in: data.purchase_ids } },
                    data: { purchase_invoice_id: inv.id },
                });
                return inv;
            });
            return this.getById(invoice.id);
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new AppError(400, `Invoice "${data.invoice_number}" already exists for this supplier`);
            }
            throw e;
        }
    }

    async update(
        id: string,
        data: Partial<Omit<CreateInvoiceInput, 'supplier_id'>>,
    ) {
        const existing = await prisma.purchaseInvoice.findUnique({
            where: { id },
            include: { purchases: { select: { id: true } } },
        });
        if (!existing) throw new AppError(404, 'Purchase invoice not found');
        if (asNumber(existing.amount_paid) > 0) {
            throw new AppError(400, 'This invoice already has payments and can no longer be edited');
        }

        await prisma.$transaction(async (tx) => {
            let subtotal = asNumber(existing.subtotal);

            if (data.purchase_ids) {
                const purchases = await tx.purchase.findMany({
                    where: { id: { in: data.purchase_ids } },
                });
                if (purchases.length !== data.purchase_ids.length) {
                    throw new AppError(400, 'One or more deliveries no longer exist');
                }
                for (const p of purchases) {
                    if (p.supplier_id !== existing.supplier_id) {
                        throw new AppError(400, 'All deliveries must belong to this supplier');
                    }
                    if (p.purchase_invoice_id && p.purchase_invoice_id !== id) {
                        throw new AppError(400, 'One or more deliveries are already on another invoice');
                    }
                }
                await tx.purchase.updateMany({
                    where: { purchase_invoice_id: id },
                    data: { purchase_invoice_id: null },
                });
                await tx.purchase.updateMany({
                    where: { id: { in: data.purchase_ids } },
                    data: { purchase_invoice_id: id },
                });
                subtotal = purchases.reduce(
                    (acc, p) => acc + asNumber(p.quantity) * asNumber(p.cost_price),
                    0,
                );
            }

            const tax = data.tax_amount !== undefined ? Number(data.tax_amount) || 0 : asNumber(existing.tax_amount);
            const discount =
                data.discount_amount !== undefined
                    ? Number(data.discount_amount) || 0
                    : asNumber(existing.discount_amount);
            const total = subtotal + tax - discount;
            if (total < 0) throw new AppError(400, 'Discount cannot exceed the invoice value');

            await tx.purchaseInvoice.update({
                where: { id },
                data: {
                    invoice_number: data.invoice_number?.trim() ?? existing.invoice_number,
                    invoice_date: data.invoice_date ? new Date(data.invoice_date) : existing.invoice_date,
                    due_date:
                        data.due_date === undefined
                            ? existing.due_date
                            : data.due_date
                              ? new Date(data.due_date)
                              : null,
                    notes: data.notes === undefined ? existing.notes : data.notes,
                    subtotal: new Prisma.Decimal(subtotal),
                    tax_amount: new Prisma.Decimal(tax),
                    discount_amount: new Prisma.Decimal(discount),
                    total_amount: new Prisma.Decimal(total),
                },
            });
        });

        return this.getById(id);
    }

    async remove(id: string) {
        const inv = await prisma.purchaseInvoice.findUnique({
            where: { id },
            include: { payments: { select: { id: true } } },
        });
        if (!inv) throw new AppError(404, 'Purchase invoice not found');
        if (inv.payments.length > 0 || asNumber(inv.amount_paid) > 0) {
            throw new AppError(400, 'This invoice has payments and cannot be deleted');
        }
        await prisma.$transaction(async (tx) => {
            await tx.purchase.updateMany({
                where: { purchase_invoice_id: id },
                data: { purchase_invoice_id: null },
            });
            await tx.purchaseInvoice.delete({ where: { id } });
        });
        return { id };
    }

    /** Recompute amount_paid + status from allocated payments. Call after any payment change. */
    static async recompute(invoiceId: string, client: Tx | typeof prisma = prisma) {
        const [inv, agg] = await Promise.all([
            client.purchaseInvoice.findUnique({ where: { id: invoiceId } }),
            client.supplierPayment.aggregate({
                where: { purchase_invoice_id: invoiceId },
                _sum: { amount: true },
            }),
        ]);
        if (!inv) return;
        const paid = asNumber(agg._sum.amount);
        await client.purchaseInvoice.update({
            where: { id: invoiceId },
            data: {
                amount_paid: new Prisma.Decimal(paid),
                status: statusFor(asNumber(inv.total_amount), paid),
            },
        });
    }
}
