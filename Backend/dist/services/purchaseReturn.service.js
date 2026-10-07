"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchaseReturnService = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const helpers_1 = require("../utils/helpers");
const pagination_1 = require("../utils/pagination");
const timezone_1 = require("../utils/timezone");
const PR_INCLUDE = {
    supplier: { select: { id: true, name: true, code: true } },
    branch: { select: { id: true, name: true } },
    user: { select: { id: true, email: true } },
    items: {
        include: {
            product: { select: { id: true, name: true, sku: true, code: true } },
            purchase: { select: { id: true, invoice_ref: true, bill_group_id: true } },
        },
    },
};
function returnNumber() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `PRN-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
function billGroupKey(p) {
    if (p.bill_group_id)
        return p.bill_group_id;
    const inv = (p.invoice_ref || '').trim();
    if (inv) {
        const day = p.purchase_date.toISOString().slice(0, 10);
        return `legacy:${p.supplier_id}|${p.warehouse_branch_id}|${inv}|${day}`;
    }
    return `solo:${p.id}`;
}
class PurchaseReturnService {
    async list(q) {
        const { page, limit, skip } = (0, pagination_1.parsePagination)({ page: q.page, limit: q.limit });
        const where = {};
        if (q.supplier_id)
            where.supplier_id = q.supplier_id;
        if (q.branch_id)
            where.branch_id = q.branch_id;
        if (q.status && q.status in client_1.PurchaseReturnStatus) {
            where.status = q.status;
        }
        const { start, end } = (0, timezone_1.parseOptionalDateRange)(q.from, q.to);
        if (start || end) {
            where.return_date = {};
            if (start)
                where.return_date.gte = start;
            if (end)
                where.return_date.lte = end;
        }
        const [rows, total, agg] = await Promise.all([
            client_2.prisma.purchaseReturn.findMany({
                where,
                orderBy: { return_date: 'desc' },
                skip,
                take: limit,
                include: PR_INCLUDE,
            }),
            client_2.prisma.purchaseReturn.count({ where }),
            client_2.prisma.purchaseReturn.aggregate({ where, _sum: { total_amount: true } }),
        ]);
        return {
            data: rows.map(this.shape),
            meta: {
                ...(0, pagination_1.paginationMeta)(total, page, limit),
                summary: { totalReturned: (0, helpers_1.asNumber)(agg._sum.total_amount) },
            },
        };
    }
    async getById(id) {
        const pr = await client_2.prisma.purchaseReturn.findUnique({ where: { id }, include: PR_INCLUDE });
        if (!pr)
            throw new apiError_1.AppError(404, 'Purchase return not found');
        return this.shape(pr);
    }
    shape = (pr) => ({
        ...pr,
        total_amount: (0, helpers_1.asNumber)(pr.total_amount),
        items: pr.items.map((it) => ({
            ...it,
            quantity: (0, helpers_1.asNumber)(it.quantity),
            unit_cost: (0, helpers_1.asNumber)(it.unit_cost),
            total_cost: (0, helpers_1.asNumber)(it.total_cost),
        })),
    });
    /**
     * Bills (and lines) from this supplier/branch that still have returnable qty.
     * Returns must reference a real purchase line — never free-catalog picks.
     */
    async listReturnableBills(supplierId, branchId) {
        if (!supplierId || !branchId) {
            throw new apiError_1.AppError(400, 'Supplier and branch are required');
        }
        const purchases = await client_2.prisma.purchase.findMany({
            where: {
                supplier_id: supplierId,
                warehouse_branch_id: branchId,
            },
            orderBy: { purchase_date: 'desc' },
            include: {
                product: { select: { id: true, name: true, sku: true, code: true } },
            },
            take: 800,
        });
        if (purchases.length === 0)
            return [];
        const purchaseIds = purchases.map((p) => p.id);
        const priorReturns = await client_2.prisma.purchaseReturnItem.findMany({
            where: {
                purchase_id: { in: purchaseIds },
                purchase_return: { status: { not: 'CANCELLED' } },
            },
            select: { purchase_id: true, quantity: true },
        });
        const returnedByPurchase = new Map();
        for (const row of priorReturns) {
            if (!row.purchase_id)
                continue;
            returnedByPurchase.set(row.purchase_id, (returnedByPurchase.get(row.purchase_id) || 0) + (0, helpers_1.asNumber)(row.quantity));
        }
        const stockRows = await client_2.prisma.stock.findMany({
            where: {
                branch_id: branchId,
                product_id: { in: [...new Set(purchases.map((p) => p.product_id))] },
            },
            select: { product_id: true, current_quantity: true },
        });
        const stockByProduct = new Map(stockRows.map((s) => [s.product_id, (0, helpers_1.asNumber)(s.current_quantity)]));
        const groups = new Map();
        for (const p of purchases) {
            const purchased = (0, helpers_1.asNumber)(p.quantity);
            const already = returnedByPurchase.get(p.id) || 0;
            const returnable = Math.max(0, Math.round((purchased - already) * 1000) / 1000);
            if (returnable <= 0)
                continue;
            const key = billGroupKey(p);
            const line = {
                purchase_id: p.id,
                product_id: p.product_id,
                product_name: p.product?.name || '—',
                sku: p.product?.sku ?? p.product?.code ?? null,
                purchased_qty: purchased,
                already_returned: already,
                returnable_qty: returnable,
                on_hand: stockByProduct.get(p.product_id) ?? 0,
                unit_cost: (0, helpers_1.asNumber)(p.cost_price),
            };
            const existing = groups.get(key);
            if (existing) {
                existing.lines.push(line);
                if (p.purchase_date > existing.purchase_date) {
                    existing.purchase_date = p.purchase_date;
                }
            }
            else {
                groups.set(key, {
                    bill_group_id: key,
                    purchase_date: p.purchase_date,
                    invoice_ref: p.invoice_ref,
                    lines: [line],
                });
            }
        }
        return Array.from(groups.values())
            .map((g) => {
            const qty = g.lines.reduce((s, l) => s + l.returnable_qty, 0);
            const value = g.lines.reduce((s, l) => s + l.returnable_qty * l.unit_cost, 0);
            return {
                bill_group_id: g.bill_group_id,
                purchase_date: g.purchase_date,
                invoice_ref: g.invoice_ref,
                line_count: g.lines.length,
                returnable_qty: Math.round(qty * 100) / 100,
                returnable_value: Math.round(value * 100) / 100,
                lines: g.lines,
            };
        })
            .sort((a, b) => b.purchase_date.getTime() - a.purchase_date.getTime());
    }
    async create(data, userId) {
        if (!data.items?.length)
            throw new apiError_1.AppError(400, 'A purchase return needs at least one line');
        for (const it of data.items) {
            if (it.quantity <= 0)
                throw new apiError_1.AppError(400, 'Return quantity must be positive');
            if (!it.purchase_id) {
                throw new apiError_1.AppError(400, 'Each return line must link to a purchase bill line');
            }
        }
        const [supplier, branch] = await Promise.all([
            client_2.prisma.supplier.findUnique({ where: { id: data.supplier_id } }),
            client_2.prisma.branch.findUnique({ where: { id: data.branch_id } }),
        ]);
        if (!supplier)
            throw new apiError_1.AppError(400, 'Invalid supplier');
        if (!branch)
            throw new apiError_1.AppError(400, 'Invalid branch');
        const purchaseIds = [...new Set(data.items.map((i) => i.purchase_id))];
        const purchases = await client_2.prisma.purchase.findMany({
            where: { id: { in: purchaseIds } },
        });
        if (purchases.length !== purchaseIds.length) {
            throw new apiError_1.AppError(400, 'One or more purchase lines were not found');
        }
        const purchaseById = new Map(purchases.map((p) => [p.id, p]));
        for (const p of purchases) {
            if (p.supplier_id !== data.supplier_id) {
                throw new apiError_1.AppError(400, 'Purchase line does not belong to this supplier');
            }
            if (p.warehouse_branch_id !== data.branch_id) {
                throw new apiError_1.AppError(400, 'Purchase line is not from this branch');
            }
        }
        const priorReturns = await client_2.prisma.purchaseReturnItem.findMany({
            where: {
                purchase_id: { in: purchaseIds },
                purchase_return: { status: { not: 'CANCELLED' } },
            },
            select: { purchase_id: true, quantity: true },
        });
        const returnedByPurchase = new Map();
        for (const row of priorReturns) {
            if (!row.purchase_id)
                continue;
            returnedByPurchase.set(row.purchase_id, (returnedByPurchase.get(row.purchase_id) || 0) + (0, helpers_1.asNumber)(row.quantity));
        }
        const requestedByPurchase = new Map();
        for (const it of data.items) {
            requestedByPurchase.set(it.purchase_id, (requestedByPurchase.get(it.purchase_id) || 0) + Number(it.quantity));
        }
        for (const [purchaseId, qty] of requestedByPurchase) {
            const purchase = purchaseById.get(purchaseId);
            const purchased = (0, helpers_1.asNumber)(purchase.quantity);
            const already = returnedByPurchase.get(purchaseId) || 0;
            const returnable = purchased - already;
            if (qty > returnable + 1e-9) {
                throw new apiError_1.AppError(400, `Cannot return more than purchased for a bill line (returnable ${Math.max(0, returnable)})`);
            }
        }
        for (const it of data.items) {
            const purchase = purchaseById.get(it.purchase_id);
            if (it.product_id !== purchase.product_id) {
                throw new apiError_1.AppError(400, 'Product does not match the selected purchase line');
            }
        }
        const total = data.items.reduce((acc, it) => acc + Number(it.quantity) * Number(it.unit_cost), 0);
        const created = await client_2.prisma.$transaction(async (tx) => {
            const pr = await tx.purchaseReturn.create({
                data: {
                    return_number: returnNumber(),
                    supplier_id: data.supplier_id,
                    branch_id: data.branch_id,
                    return_date: data.return_date ? new Date(data.return_date) : new Date(),
                    status: 'COMPLETED',
                    reason: data.reason ?? null,
                    notes: data.notes ?? null,
                    total_amount: new client_1.Prisma.Decimal(total),
                    created_by: userId,
                    items: {
                        create: data.items.map((it) => ({
                            product_id: it.product_id,
                            quantity: new client_1.Prisma.Decimal(it.quantity),
                            unit_cost: new client_1.Prisma.Decimal(it.unit_cost),
                            total_cost: new client_1.Prisma.Decimal(Number(it.quantity) * Number(it.unit_cost)),
                            purchase_id: it.purchase_id,
                        })),
                    },
                },
                include: PR_INCLUDE,
            });
            for (const it of data.items) {
                const stock = await tx.stock.findUnique({
                    where: {
                        product_id_branch_id: {
                            product_id: it.product_id,
                            branch_id: data.branch_id,
                        },
                    },
                });
                const previousQty = stock ? (0, helpers_1.asNumber)(stock.current_quantity) : 0;
                if (it.quantity > previousQty + 1e-9) {
                    throw new apiError_1.AppError(400, `Not enough stock on hand to return (have ${previousQty}, need ${it.quantity})`);
                }
                const newQty = previousQty - it.quantity;
                if (stock) {
                    await tx.stock.update({
                        where: {
                            product_id_branch_id: {
                                product_id: it.product_id,
                                branch_id: data.branch_id,
                            },
                        },
                        data: { current_quantity: new client_1.Prisma.Decimal(newQty) },
                    });
                }
                else {
                    await tx.stock.create({
                        data: {
                            product_id: it.product_id,
                            branch_id: data.branch_id,
                            current_quantity: new client_1.Prisma.Decimal(newQty),
                        },
                    });
                }
                await tx.stockMovement.create({
                    data: {
                        product_id: it.product_id,
                        branch_id: data.branch_id,
                        movement_type: 'PURCHASE_RETURN',
                        reference_id: pr.id,
                        reference_type: 'purchase_return',
                        quantity_change: new client_1.Prisma.Decimal(-it.quantity),
                        previous_qty: new client_1.Prisma.Decimal(previousQty),
                        new_qty: new client_1.Prisma.Decimal(newQty),
                        unit_cost: new client_1.Prisma.Decimal(it.unit_cost),
                        notes: `Return ${pr.return_number}`,
                        created_by: userId,
                    },
                });
            }
            return pr;
        });
        return this.shape(created);
    }
    /** Cancel a return and put the stock back. */
    async cancel(id, userId) {
        const pr = await client_2.prisma.purchaseReturn.findUnique({ where: { id }, include: { items: true } });
        if (!pr)
            throw new apiError_1.AppError(404, 'Purchase return not found');
        if (pr.status === 'CANCELLED')
            return this.getById(id);
        await client_2.prisma.$transaction(async (tx) => {
            for (const it of pr.items) {
                const qty = (0, helpers_1.asNumber)(it.quantity);
                const stock = await tx.stock.findUnique({
                    where: {
                        product_id_branch_id: { product_id: it.product_id, branch_id: pr.branch_id },
                    },
                });
                const previousQty = stock ? (0, helpers_1.asNumber)(stock.current_quantity) : 0;
                const newQty = previousQty + qty;
                if (stock) {
                    await tx.stock.update({
                        where: {
                            product_id_branch_id: { product_id: it.product_id, branch_id: pr.branch_id },
                        },
                        data: { current_quantity: new client_1.Prisma.Decimal(newQty) },
                    });
                }
                else {
                    await tx.stock.create({
                        data: {
                            product_id: it.product_id,
                            branch_id: pr.branch_id,
                            current_quantity: new client_1.Prisma.Decimal(newQty),
                        },
                    });
                }
                await tx.stockMovement.create({
                    data: {
                        product_id: it.product_id,
                        branch_id: pr.branch_id,
                        movement_type: 'PURCHASE_RETURN',
                        reference_id: pr.id,
                        reference_type: 'purchase_return_cancel',
                        quantity_change: new client_1.Prisma.Decimal(qty),
                        previous_qty: new client_1.Prisma.Decimal(previousQty),
                        new_qty: new client_1.Prisma.Decimal(newQty),
                        unit_cost: new client_1.Prisma.Decimal((0, helpers_1.asNumber)(it.unit_cost)),
                        notes: `Cancelled return ${pr.return_number}`,
                        created_by: userId,
                    },
                });
            }
            await tx.purchaseReturn.update({ where: { id }, data: { status: 'CANCELLED' } });
        });
        return this.getById(id);
    }
}
exports.PurchaseReturnService = PurchaseReturnService;
//# sourceMappingURL=purchaseReturn.service.js.map