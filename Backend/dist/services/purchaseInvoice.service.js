"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchaseInvoiceService = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const helpers_1 = require("../utils/helpers");
const pagination_1 = require("../utils/pagination");
const timezone_1 = require("../utils/timezone");
const INV_INCLUDE = {
    supplier: { select: { id: true, name: true, code: true } },
    branch: { select: { id: true, name: true } },
    user: { select: { id: true, email: true } },
    purchase_order: { select: { id: true, po_number: true } },
    purchases: {
        include: { product: { select: { id: true, name: true, sku: true, code: true } } },
    },
};
function statusFor(total, paid) {
    if (paid >= total - 1e-6 && total > 0)
        return 'PAID';
    if (paid > 1e-6)
        return 'PARTIALLY_PAID';
    return 'UNPAID';
}
class PurchaseInvoiceService {
    shape = (inv) => ({
        ...inv,
        subtotal: (0, helpers_1.asNumber)(inv.subtotal),
        tax_amount: (0, helpers_1.asNumber)(inv.tax_amount),
        discount_amount: (0, helpers_1.asNumber)(inv.discount_amount),
        total_amount: (0, helpers_1.asNumber)(inv.total_amount),
        amount_paid: (0, helpers_1.asNumber)(inv.amount_paid),
        balance_due: (0, helpers_1.asNumber)(inv.total_amount) - (0, helpers_1.asNumber)(inv.amount_paid),
        purchases: inv.purchases.map((p) => ({
            id: p.id,
            product: p.product,
            quantity: (0, helpers_1.asNumber)(p.quantity),
            cost_price: (0, helpers_1.asNumber)(p.cost_price),
            line_total: (0, helpers_1.asNumber)(p.quantity) * (0, helpers_1.asNumber)(p.cost_price),
            purchase_date: p.purchase_date,
        })),
    });
    /** Received purchases from this supplier not yet on any invoice. */
    async uninvoicedPurchases(supplierId) {
        const rows = await client_2.prisma.purchase.findMany({
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
            quantity: (0, helpers_1.asNumber)(p.quantity),
            cost_price: (0, helpers_1.asNumber)(p.cost_price),
            line_total: (0, helpers_1.asNumber)(p.quantity) * (0, helpers_1.asNumber)(p.cost_price),
            purchase_date: p.purchase_date,
            invoice_ref: p.invoice_ref,
            po_number: p.purchase_order?.po_number ?? null,
        }));
    }
    async list(q) {
        const { page, limit, skip } = (0, pagination_1.parsePagination)({ page: q.page, limit: q.limit });
        const where = {};
        if (q.supplier_id)
            where.supplier_id = q.supplier_id;
        if (q.branch_id)
            where.branch_id = q.branch_id;
        if (q.status && q.status in client_1.PurchaseInvoiceStatus) {
            where.status = q.status;
        }
        if (q.overdue === 'true') {
            where.status = { not: 'PAID' };
            where.due_date = { lt: new Date() };
        }
        const { start, end } = (0, timezone_1.parseOptionalDateRange)(q.from, q.to);
        if (start || end) {
            where.invoice_date = {};
            if (start)
                where.invoice_date.gte = start;
            if (end)
                where.invoice_date.lte = end;
        }
        const [rows, total, openRows] = await Promise.all([
            client_2.prisma.purchaseInvoice.findMany({
                where,
                orderBy: { invoice_date: 'desc' },
                skip,
                take: limit,
                include: INV_INCLUDE,
            }),
            client_2.prisma.purchaseInvoice.count({ where }),
            client_2.prisma.purchaseInvoice.findMany({
                where: { ...where, status: { not: 'PAID' } },
                select: { total_amount: true, amount_paid: true, due_date: true },
            }),
        ]);
        // Aging buckets on outstanding balance, by due date.
        const now = Date.now();
        const aging = { current: 0, d1_30: 0, d31_60: 0, d60_plus: 0 };
        let outstanding = 0;
        for (const r of openRows) {
            const bal = (0, helpers_1.asNumber)(r.total_amount) - (0, helpers_1.asNumber)(r.amount_paid);
            if (bal <= 0)
                continue;
            outstanding += bal;
            const daysLate = r.due_date
                ? Math.floor((now - r.due_date.getTime()) / 86_400_000)
                : 0;
            if (daysLate <= 0)
                aging.current += bal;
            else if (daysLate <= 30)
                aging.d1_30 += bal;
            else if (daysLate <= 60)
                aging.d31_60 += bal;
            else
                aging.d60_plus += bal;
        }
        return {
            data: rows.map(this.shape),
            meta: {
                ...(0, pagination_1.paginationMeta)(total, page, limit),
                summary: { outstanding, aging, openCount: openRows.length },
            },
        };
    }
    async getById(id) {
        const inv = await client_2.prisma.purchaseInvoice.findUnique({ where: { id }, include: INV_INCLUDE });
        if (!inv)
            throw new apiError_1.AppError(404, 'Purchase invoice not found');
        return this.shape(inv);
    }
    async create(data, userId) {
        if (!data.purchase_ids?.length) {
            throw new apiError_1.AppError(400, 'Select at least one received delivery to invoice');
        }
        const [supplier, purchases] = await Promise.all([
            client_2.prisma.supplier.findUnique({ where: { id: data.supplier_id } }),
            client_2.prisma.purchase.findMany({ where: { id: { in: data.purchase_ids } } }),
        ]);
        if (!supplier)
            throw new apiError_1.AppError(400, 'Invalid supplier');
        if (purchases.length !== data.purchase_ids.length) {
            throw new apiError_1.AppError(400, 'One or more deliveries no longer exist');
        }
        for (const p of purchases) {
            if (p.supplier_id !== data.supplier_id) {
                throw new apiError_1.AppError(400, 'All deliveries must belong to the same supplier');
            }
            if (p.purchase_invoice_id) {
                throw new apiError_1.AppError(400, 'One or more deliveries are already on an invoice');
            }
        }
        const subtotal = purchases.reduce((acc, p) => acc + (0, helpers_1.asNumber)(p.quantity) * (0, helpers_1.asNumber)(p.cost_price), 0);
        const tax = Number(data.tax_amount) || 0;
        const discount = Number(data.discount_amount) || 0;
        const total = subtotal + tax - discount;
        if (total < 0)
            throw new apiError_1.AppError(400, 'Discount cannot exceed the invoice value');
        try {
            const invoice = await client_2.prisma.$transaction(async (tx) => {
                const inv = await tx.purchaseInvoice.create({
                    data: {
                        invoice_number: data.invoice_number.trim(),
                        supplier_id: data.supplier_id,
                        branch_id: data.branch_id ?? null,
                        purchase_order_id: data.purchase_order_id ?? null,
                        invoice_date: data.invoice_date ? new Date(data.invoice_date) : new Date(),
                        due_date: data.due_date ? new Date(data.due_date) : null,
                        subtotal: new client_1.Prisma.Decimal(subtotal),
                        tax_amount: new client_1.Prisma.Decimal(tax),
                        discount_amount: new client_1.Prisma.Decimal(discount),
                        total_amount: new client_1.Prisma.Decimal(total),
                        amount_paid: new client_1.Prisma.Decimal(0),
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
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new apiError_1.AppError(400, `Invoice "${data.invoice_number}" already exists for this supplier`);
            }
            throw e;
        }
    }
    async update(id, data) {
        const existing = await client_2.prisma.purchaseInvoice.findUnique({
            where: { id },
            include: { purchases: { select: { id: true } } },
        });
        if (!existing)
            throw new apiError_1.AppError(404, 'Purchase invoice not found');
        if ((0, helpers_1.asNumber)(existing.amount_paid) > 0) {
            throw new apiError_1.AppError(400, 'This invoice already has payments and can no longer be edited');
        }
        await client_2.prisma.$transaction(async (tx) => {
            let subtotal = (0, helpers_1.asNumber)(existing.subtotal);
            if (data.purchase_ids) {
                const purchases = await tx.purchase.findMany({
                    where: { id: { in: data.purchase_ids } },
                });
                if (purchases.length !== data.purchase_ids.length) {
                    throw new apiError_1.AppError(400, 'One or more deliveries no longer exist');
                }
                for (const p of purchases) {
                    if (p.supplier_id !== existing.supplier_id) {
                        throw new apiError_1.AppError(400, 'All deliveries must belong to this supplier');
                    }
                    if (p.purchase_invoice_id && p.purchase_invoice_id !== id) {
                        throw new apiError_1.AppError(400, 'One or more deliveries are already on another invoice');
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
                subtotal = purchases.reduce((acc, p) => acc + (0, helpers_1.asNumber)(p.quantity) * (0, helpers_1.asNumber)(p.cost_price), 0);
            }
            const tax = data.tax_amount !== undefined ? Number(data.tax_amount) || 0 : (0, helpers_1.asNumber)(existing.tax_amount);
            const discount = data.discount_amount !== undefined
                ? Number(data.discount_amount) || 0
                : (0, helpers_1.asNumber)(existing.discount_amount);
            const total = subtotal + tax - discount;
            if (total < 0)
                throw new apiError_1.AppError(400, 'Discount cannot exceed the invoice value');
            await tx.purchaseInvoice.update({
                where: { id },
                data: {
                    invoice_number: data.invoice_number?.trim() ?? existing.invoice_number,
                    invoice_date: data.invoice_date ? new Date(data.invoice_date) : existing.invoice_date,
                    due_date: data.due_date === undefined
                        ? existing.due_date
                        : data.due_date
                            ? new Date(data.due_date)
                            : null,
                    notes: data.notes === undefined ? existing.notes : data.notes,
                    subtotal: new client_1.Prisma.Decimal(subtotal),
                    tax_amount: new client_1.Prisma.Decimal(tax),
                    discount_amount: new client_1.Prisma.Decimal(discount),
                    total_amount: new client_1.Prisma.Decimal(total),
                },
            });
        });
        return this.getById(id);
    }
    async remove(id) {
        const inv = await client_2.prisma.purchaseInvoice.findUnique({
            where: { id },
            include: { payments: { select: { id: true } } },
        });
        if (!inv)
            throw new apiError_1.AppError(404, 'Purchase invoice not found');
        if (inv.payments.length > 0 || (0, helpers_1.asNumber)(inv.amount_paid) > 0) {
            throw new apiError_1.AppError(400, 'This invoice has payments and cannot be deleted');
        }
        await client_2.prisma.$transaction(async (tx) => {
            await tx.purchase.updateMany({
                where: { purchase_invoice_id: id },
                data: { purchase_invoice_id: null },
            });
            await tx.purchaseInvoice.delete({ where: { id } });
        });
        return { id };
    }
    /** Recompute amount_paid + status from allocated payments. Call after any payment change. */
    static async recompute(invoiceId, client = client_2.prisma) {
        const [inv, agg] = await Promise.all([
            client.purchaseInvoice.findUnique({ where: { id: invoiceId } }),
            client.supplierPayment.aggregate({
                where: { purchase_invoice_id: invoiceId },
                _sum: { amount: true },
            }),
        ]);
        if (!inv)
            return;
        const paid = (0, helpers_1.asNumber)(agg._sum.amount);
        await client.purchaseInvoice.update({
            where: { id: invoiceId },
            data: {
                amount_paid: new client_1.Prisma.Decimal(paid),
                status: statusFor((0, helpers_1.asNumber)(inv.total_amount), paid),
            },
        });
    }
}
exports.PurchaseInvoiceService = PurchaseInvoiceService;
//# sourceMappingURL=purchaseInvoice.service.js.map