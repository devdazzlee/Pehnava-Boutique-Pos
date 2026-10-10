"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchaseOrderService = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const helpers_1 = require("../utils/helpers");
const pagination_1 = require("../utils/pagination");
const timezone_1 = require("../utils/timezone");
const product_cost_service_1 = require("./product-cost.service");
const PO_INCLUDE = {
    supplier: { select: { id: true, name: true, code: true } },
    branch: { select: { id: true, name: true } },
    user: { select: { id: true, email: true } },
    purchase_order_items: {
        include: { product: { select: { id: true, name: true, sku: true, code: true } } },
    },
};
function docNumber(prefix) {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${prefix}-${ymd}-${rand}`;
}
function computeTotals(items, taxAmount) {
    const subtotal = items.reduce((acc, it) => acc + Number(it.ordered_quantity) * Number(it.unit_cost), 0);
    return { subtotal, tax_amount: taxAmount, total_amount: subtotal + taxAmount };
}
const EDITABLE_STATUSES = ['PENDING', 'APPROVED', 'ORDERED'];
class PurchaseOrderService {
    async list(q) {
        const { page, limit, skip } = (0, pagination_1.parsePagination)({ page: q.page, limit: q.limit });
        const where = {};
        if (q.search?.trim()) {
            where.OR = [
                { po_number: { contains: q.search.trim(), mode: 'insensitive' } },
                { supplier: { name: { contains: q.search.trim(), mode: 'insensitive' } } },
            ];
        }
        if (q.supplier_id)
            where.supplier_id = q.supplier_id;
        if (q.branch_id)
            where.branch_id = q.branch_id;
        if (q.status && q.status in client_1.PurchaseOrderStatus) {
            where.status = q.status;
        }
        const { start, end } = (0, timezone_1.parseOptionalDateRange)(q.from, q.to);
        if (start || end) {
            where.order_date = {};
            if (start)
                where.order_date.gte = start;
            if (end)
                where.order_date.lte = end;
        }
        const [rows, total, statusAgg] = await Promise.all([
            client_2.prisma.purchaseOrder.findMany({
                where,
                orderBy: { order_date: 'desc' },
                skip,
                take: limit,
                include: PO_INCLUDE,
            }),
            client_2.prisma.purchaseOrder.count({ where }),
            client_2.prisma.purchaseOrder.groupBy({
                by: ['status'],
                where,
                _sum: { total_amount: true },
                _count: { _all: true },
            }),
        ]);
        const openStatuses = ['PENDING', 'APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED'];
        const outstanding = statusAgg
            .filter((s) => openStatuses.includes(s.status))
            .reduce((acc, s) => acc + (0, helpers_1.asNumber)(s._sum.total_amount), 0);
        return {
            data: rows.map(this.shape),
            meta: {
                ...(0, pagination_1.paginationMeta)(total, page, limit),
                summary: {
                    outstandingValue: outstanding,
                    openCount: statusAgg
                        .filter((s) => openStatuses.includes(s.status))
                        .reduce((acc, s) => acc + s._count._all, 0),
                },
            },
        };
    }
    async getById(id) {
        const po = await client_2.prisma.purchaseOrder.findUnique({ where: { id }, include: PO_INCLUDE });
        if (!po)
            throw new apiError_1.AppError(404, 'Purchase order not found');
        return this.shape(po);
    }
    shape = (po) => ({
        ...po,
        subtotal: (0, helpers_1.asNumber)(po.subtotal),
        tax_amount: (0, helpers_1.asNumber)(po.tax_amount),
        total_amount: (0, helpers_1.asNumber)(po.total_amount),
        purchase_order_items: po.purchase_order_items.map((it) => ({
            ...it,
            ordered_quantity: (0, helpers_1.asNumber)(it.ordered_quantity),
            received_quantity: (0, helpers_1.asNumber)(it.received_quantity),
            unit_cost: (0, helpers_1.asNumber)(it.unit_cost),
            total_cost: (0, helpers_1.asNumber)(it.total_cost),
        })),
    });
    async create(data, userId) {
        if (!data.items?.length)
            throw new apiError_1.AppError(400, 'A purchase order needs at least one line');
        const [supplier, branch] = await Promise.all([
            client_2.prisma.supplier.findUnique({ where: { id: data.supplier_id } }),
            client_2.prisma.branch.findUnique({ where: { id: data.branch_id } }),
        ]);
        if (!supplier)
            throw new apiError_1.AppError(400, 'Invalid supplier');
        if (!branch)
            throw new apiError_1.AppError(400, 'Invalid branch');
        const productIds = [...new Set(data.items.map((i) => i.product_id))];
        const products = await client_2.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true },
        });
        if (products.length !== productIds.length) {
            throw new apiError_1.AppError(400, 'One or more products do not exist');
        }
        const totals = computeTotals(data.items, Number(data.tax_amount) || 0);
        const po = await client_2.prisma.purchaseOrder.create({
            data: {
                po_number: docNumber('PO'),
                supplier_id: data.supplier_id,
                branch_id: data.branch_id,
                order_date: data.order_date ? new Date(data.order_date) : new Date(),
                expected_delivery: data.expected_delivery ? new Date(data.expected_delivery) : null,
                notes: data.notes ?? null,
                subtotal: new client_1.Prisma.Decimal(totals.subtotal),
                tax_amount: new client_1.Prisma.Decimal(totals.tax_amount),
                total_amount: new client_1.Prisma.Decimal(totals.total_amount),
                created_by: userId,
                purchase_order_items: {
                    create: data.items.map((it) => ({
                        product_id: it.product_id,
                        ordered_quantity: new client_1.Prisma.Decimal(it.ordered_quantity),
                        unit_cost: new client_1.Prisma.Decimal(it.unit_cost),
                        total_cost: new client_1.Prisma.Decimal(Number(it.ordered_quantity) * Number(it.unit_cost)),
                    })),
                },
            },
            include: PO_INCLUDE,
        });
        return this.shape(po);
    }
    async update(id, data) {
        const existing = await client_2.prisma.purchaseOrder.findUnique({
            where: { id },
            include: { purchase_order_items: true },
        });
        if (!existing)
            throw new apiError_1.AppError(404, 'Purchase order not found');
        if (!EDITABLE_STATUSES.includes(existing.status)) {
            throw new apiError_1.AppError(400, `A ${existing.status} purchase order can no longer be edited`);
        }
        const patch = {};
        if (data.expected_delivery !== undefined) {
            patch.expected_delivery = data.expected_delivery ? new Date(data.expected_delivery) : null;
        }
        if (data.notes !== undefined)
            patch.notes = data.notes ?? null;
        if (data.order_date !== undefined && data.order_date)
            patch.order_date = new Date(data.order_date);
        if (data.items) {
            if (!data.items.length)
                throw new apiError_1.AppError(400, 'A purchase order needs at least one line');
            const totals = computeTotals(data.items, data.tax_amount !== undefined ? Number(data.tax_amount) || 0 : (0, helpers_1.asNumber)(existing.tax_amount));
            await client_2.prisma.purchaseOrderItem.deleteMany({ where: { purchase_order_id: id } });
            patch.subtotal = new client_1.Prisma.Decimal(totals.subtotal);
            patch.tax_amount = new client_1.Prisma.Decimal(totals.tax_amount);
            patch.total_amount = new client_1.Prisma.Decimal(totals.total_amount);
            patch.purchase_order_items = {
                create: data.items.map((it) => ({
                    product_id: it.product_id,
                    ordered_quantity: new client_1.Prisma.Decimal(it.ordered_quantity),
                    unit_cost: new client_1.Prisma.Decimal(it.unit_cost),
                    total_cost: new client_1.Prisma.Decimal(Number(it.ordered_quantity) * Number(it.unit_cost)),
                })),
            };
        }
        else if (data.tax_amount !== undefined) {
            const subtotal = (0, helpers_1.asNumber)(existing.subtotal);
            patch.tax_amount = new client_1.Prisma.Decimal(Number(data.tax_amount) || 0);
            patch.total_amount = new client_1.Prisma.Decimal(subtotal + (Number(data.tax_amount) || 0));
        }
        const po = await client_2.prisma.purchaseOrder.update({ where: { id }, data: patch, include: PO_INCLUDE });
        return this.shape(po);
    }
    async setStatus(id, status) {
        const existing = await client_2.prisma.purchaseOrder.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Purchase order not found');
        if (existing.status === 'RECEIVED' || existing.status === 'CANCELLED') {
            throw new apiError_1.AppError(400, `A ${existing.status} purchase order cannot change status`);
        }
        const po = await client_2.prisma.purchaseOrder.update({
            where: { id },
            data: { status },
            include: PO_INCLUDE,
        });
        return this.shape(po);
    }
    async remove(id) {
        const existing = await client_2.prisma.purchaseOrder.findUnique({
            where: { id },
            include: { purchases: { select: { id: true } } },
        });
        if (!existing)
            throw new apiError_1.AppError(404, 'Purchase order not found');
        if (existing.purchases.length > 0) {
            throw new apiError_1.AppError(400, 'This purchase order has received stock and cannot be deleted. Cancel it instead.');
        }
        await client_2.prisma.purchaseOrder.delete({ where: { id } });
        return { id };
    }
    /**
     * Receive some or all outstanding lines. For each received line: bump
     * received_quantity, create a Purchase row linked to the PO, increment
     * warehouse stock and log a stock movement — all in one transaction. The
     * PO advances to PARTIALLY_RECEIVED or RECEIVED.
     */
    async receive(id, lines, userId, opts) {
        if (!lines?.length)
            throw new apiError_1.AppError(400, 'Nothing to receive');
        const po = await client_2.prisma.purchaseOrder.findUnique({
            where: { id },
            include: { purchase_order_items: true },
        });
        if (!po)
            throw new apiError_1.AppError(404, 'Purchase order not found');
        if (po.status === 'CANCELLED' || po.status === 'RECEIVED') {
            throw new apiError_1.AppError(400, `A ${po.status} purchase order cannot receive stock`);
        }
        const itemById = new Map(po.purchase_order_items.map((it) => [it.id, it]));
        for (const l of lines) {
            const it = itemById.get(l.item_id);
            if (!it)
                throw new apiError_1.AppError(400, `Line ${l.item_id} is not on this purchase order`);
            const outstanding = (0, helpers_1.asNumber)(it.ordered_quantity) - (0, helpers_1.asNumber)(it.received_quantity);
            if (l.quantity <= 0)
                throw new apiError_1.AppError(400, 'Received quantity must be positive');
            if (l.quantity > outstanding + 1e-9) {
                throw new apiError_1.AppError(400, `Cannot receive ${l.quantity} — only ${outstanding} outstanding for this line`);
            }
        }
        await client_2.prisma.$transaction(async (tx) => {
            for (const l of lines) {
                const it = itemById.get(l.item_id);
                const unitCost = (0, helpers_1.asNumber)(it.unit_cost);
                const salePrice = Number(l.sale_price) || unitCost;
                const purchase = await tx.purchase.create({
                    data: {
                        product_id: it.product_id,
                        supplier_id: po.supplier_id,
                        warehouse_branch_id: po.branch_id,
                        quantity: new client_1.Prisma.Decimal(l.quantity),
                        cost_price: new client_1.Prisma.Decimal(unitCost),
                        sale_price: new client_1.Prisma.Decimal(salePrice),
                        purchase_date: new Date(),
                        invoice_ref: opts?.invoice_ref ?? po.po_number,
                        notes: opts?.notes ?? null,
                        delivery_status: 'COMPLETE',
                        purchase_order_id: po.id,
                        created_by: userId,
                    },
                });
                const stock = await tx.stock.findUnique({
                    where: {
                        product_id_branch_id: {
                            product_id: it.product_id,
                            branch_id: po.branch_id,
                        },
                    },
                });
                const previousQty = stock ? (0, helpers_1.asNumber)(stock.current_quantity) : 0;
                const newQty = previousQty + l.quantity;
                const onHandBefore = await (0, product_cost_service_1.productOnHandQty)(tx, it.product_id);
                await (0, product_cost_service_1.applyWeightedAverageCost)(tx, {
                    productId: it.product_id,
                    onHandBefore,
                    incomingQty: l.quantity,
                    unitCost,
                    userId,
                    source: 'PO_RECEIVE',
                });
                if (stock) {
                    await tx.stock.update({
                        where: {
                            product_id_branch_id: {
                                product_id: it.product_id,
                                branch_id: po.branch_id,
                            },
                        },
                        data: { current_quantity: new client_1.Prisma.Decimal(newQty) },
                    });
                }
                else {
                    await tx.stock.create({
                        data: {
                            product_id: it.product_id,
                            branch_id: po.branch_id,
                            current_quantity: new client_1.Prisma.Decimal(l.quantity),
                        },
                    });
                }
                await tx.stockMovement.create({
                    data: {
                        product_id: it.product_id,
                        branch_id: po.branch_id,
                        movement_type: 'PURCHASE',
                        reference_id: purchase.id,
                        reference_type: 'purchase',
                        quantity_change: new client_1.Prisma.Decimal(l.quantity),
                        previous_qty: new client_1.Prisma.Decimal(previousQty),
                        new_qty: new client_1.Prisma.Decimal(newQty),
                        unit_cost: new client_1.Prisma.Decimal(unitCost),
                        notes: `PO ${po.po_number}`,
                        created_by: userId,
                    },
                });
                await tx.purchaseOrderItem.update({
                    where: { id: it.id },
                    data: {
                        received_quantity: new client_1.Prisma.Decimal((0, helpers_1.asNumber)(it.received_quantity) + l.quantity),
                    },
                });
            }
            const refreshed = await tx.purchaseOrderItem.findMany({
                where: { purchase_order_id: po.id },
            });
            const allReceived = refreshed.every((it) => (0, helpers_1.asNumber)(it.received_quantity) >= (0, helpers_1.asNumber)(it.ordered_quantity) - 1e-9);
            const anyReceived = refreshed.some((it) => (0, helpers_1.asNumber)(it.received_quantity) > 0);
            await tx.purchaseOrder.update({
                where: { id: po.id },
                data: {
                    status: allReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : po.status,
                    delivery_date: allReceived ? new Date() : po.delivery_date,
                },
            });
        });
        return this.getById(id);
    }
}
exports.PurchaseOrderService = PurchaseOrderService;
//# sourceMappingURL=purchaseOrder.service.js.map