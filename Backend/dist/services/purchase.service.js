"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchaseService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const helpers_1 = require("../utils/helpers");
const timezone_1 = require("../utils/timezone");
const crypto_1 = require("crypto");
const PURCHASE_LIST_INCLUDE = {
    product: true,
    supplier: true,
    warehouse_branch: true,
    user: { select: { email: true } },
};
function billKey(p) {
    if (p.bill_group_id)
        return p.bill_group_id;
    // Legacy rows without a group: keep each line as its own bill unless invoice_ref ties them.
    const inv = (p.invoice_ref || '').trim();
    if (inv) {
        const day = p.purchase_date.toISOString().slice(0, 10);
        return `legacy:${p.supplier_id}|${p.warehouse_branch_id}|${inv}|${day}`;
    }
    return `solo:${p.id}`;
}
class PurchaseService {
    async createPurchase(data) {
        const warehouse = await client_1.prisma.branch.findFirst({
            where: { id: data.warehouseBranchId, branch_type: 'WAREHOUSE' },
        });
        if (!warehouse) {
            const anyBranch = await client_1.prisma.branch.findUnique({
                where: { id: data.warehouseBranchId },
            });
            if (!anyBranch)
                throw new apiError_1.AppError(404, 'Warehouse branch not found');
        }
        return client_1.prisma.$transaction(async (tx) => {
            const billGroupId = (0, crypto_1.randomUUID)();
            const purchase = await tx.purchase.create({
                data: {
                    product_id: data.productId,
                    supplier_id: data.supplierId,
                    warehouse_branch_id: data.warehouseBranchId,
                    quantity: data.quantity,
                    cost_price: data.costPrice,
                    sale_price: data.salePrice,
                    purchase_date: data.purchaseDate || new Date(),
                    invoice_ref: data.invoiceRef,
                    bill_group_id: billGroupId,
                    notes: data.notes,
                    delivery_status: data.deliveryStatus || 'COMPLETE',
                    created_by: data.createdBy,
                },
                include: {
                    product: true,
                    supplier: true,
                    warehouse_branch: true,
                    user: { select: { email: true } },
                },
            });
            let stock = await tx.stock.findUnique({
                where: {
                    product_id_branch_id: {
                        product_id: data.productId,
                        branch_id: data.warehouseBranchId,
                    },
                },
            });
            const qty = data.quantity;
            const previousQty = stock ? (0, helpers_1.asNumber)(stock.current_quantity) : 0;
            const newQty = stock ? (0, helpers_1.addDecimal)(stock.current_quantity, qty) : qty;
            if (stock) {
                await tx.stock.update({
                    where: {
                        product_id_branch_id: {
                            product_id: data.productId,
                            branch_id: data.warehouseBranchId,
                        },
                    },
                    data: { current_quantity: newQty },
                });
            }
            else {
                await tx.stock.create({
                    data: {
                        product_id: data.productId,
                        branch_id: data.warehouseBranchId,
                        current_quantity: qty,
                    },
                });
            }
            await tx.stockMovement.create({
                data: {
                    product_id: data.productId,
                    branch_id: data.warehouseBranchId,
                    movement_type: 'PURCHASE',
                    reference_id: purchase.id,
                    reference_type: 'purchase',
                    quantity_change: qty,
                    previous_qty: previousQty,
                    new_qty: typeof newQty === 'number' ? newQty : (0, helpers_1.asNumber)(newQty),
                    unit_cost: data.costPrice,
                    notes: data.notes,
                    created_by: data.createdBy,
                },
            });
            return purchase;
        });
    }
    // Multi-line GRN — saves the supplier delivery as N Purchase rows + one
    // stock movement per line, all in a single transaction. Use this for the
    // "Save purchase" flow on the Stock In screen.
    //
    // Payment modes (supplier credit / cash):
    // - CREDIT: full bill stays payable on the supplier ledger
    // - CASH: auto-records a supplier payment for the full bill total
    // - MIX: records a partial payment; remainder stays as balance due
    async createBulkPurchase(data) {
        if (!Array.isArray(data.lines) || data.lines.length === 0) {
            throw new apiError_1.AppError(400, 'At least one line is required');
        }
        const branch = await client_1.prisma.branch.findUnique({
            where: { id: data.warehouseBranchId },
        });
        if (!branch)
            throw new apiError_1.AppError(404, 'Warehouse branch not found');
        const supplier = await client_1.prisma.supplier.findUnique({
            where: { id: data.supplierId },
        });
        if (!supplier)
            throw new apiError_1.AppError(404, 'Supplier not found');
        const billTotal = data.lines.reduce((sum, line) => sum + line.quantity * line.costPrice, 0);
        const paymentMode = data.paymentMode || 'CREDIT';
        let paidNow = 0;
        if (paymentMode === 'CASH') {
            paidNow = billTotal;
        }
        else if (paymentMode === 'MIX') {
            paidNow = Number(data.paidAmount) || 0;
            if (paidNow <= 0) {
                throw new apiError_1.AppError(400, 'Enter how much was paid now for a mix payment');
            }
            if (paidNow >= billTotal && billTotal > 0) {
                throw new apiError_1.AppError(400, 'Mix paid amount must be less than bill total (use Cash for full pay)');
            }
        }
        const creditRemaining = Math.max(0, billTotal - paidNow);
        return client_1.prisma.$transaction(async (tx) => {
            const purchaseIds = [];
            const billGroupId = (0, crypto_1.randomUUID)();
            for (const line of data.lines) {
                if (!line.productId)
                    throw new apiError_1.AppError(400, 'Product is required on every line');
                if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
                    throw new apiError_1.AppError(400, `Invalid quantity on line for product ${line.productId}`);
                }
                if (!Number.isFinite(line.costPrice) || line.costPrice < 0) {
                    throw new apiError_1.AppError(400, `Invalid cost price on line for product ${line.productId}`);
                }
                const noteParts = [];
                if (data.batchNo)
                    noteParts.push(`Batch: ${data.batchNo}`);
                if (data.expiryDate)
                    noteParts.push(`Expiry: ${data.expiryDate.toISOString().slice(0, 10)}`);
                if (data.notes)
                    noteParts.push(data.notes);
                noteParts.push(`Pay: ${paymentMode}` +
                    (paymentMode !== 'CREDIT'
                        ? ` · paid ${paidNow.toFixed(2)} · credit ${creditRemaining.toFixed(2)}`
                        : ` · credit ${billTotal.toFixed(2)}`));
                const noteText = noteParts.length > 0 ? noteParts.join(' | ') : undefined;
                const purchase = await tx.purchase.create({
                    data: {
                        product_id: line.productId,
                        supplier_id: data.supplierId,
                        warehouse_branch_id: data.warehouseBranchId,
                        quantity: line.quantity,
                        cost_price: line.costPrice,
                        sale_price: line.salePrice ?? line.costPrice,
                        purchase_date: data.purchaseDate || new Date(),
                        invoice_ref: data.invoiceRef,
                        bill_group_id: billGroupId,
                        notes: noteText,
                        delivery_status: data.deliveryStatus || 'COMPLETE',
                        created_by: data.createdBy,
                    },
                });
                let stock = await tx.stock.findUnique({
                    where: {
                        product_id_branch_id: {
                            product_id: line.productId,
                            branch_id: data.warehouseBranchId,
                        },
                    },
                });
                const previousQty = stock ? (0, helpers_1.asNumber)(stock.current_quantity) : 0;
                const newQty = stock
                    ? (0, helpers_1.addDecimal)(stock.current_quantity, line.quantity)
                    : line.quantity;
                if (stock) {
                    await tx.stock.update({
                        where: {
                            product_id_branch_id: {
                                product_id: line.productId,
                                branch_id: data.warehouseBranchId,
                            },
                        },
                        data: { current_quantity: newQty },
                    });
                }
                else {
                    await tx.stock.create({
                        data: {
                            product_id: line.productId,
                            branch_id: data.warehouseBranchId,
                            current_quantity: line.quantity,
                        },
                    });
                }
                await tx.stockMovement.create({
                    data: {
                        product_id: line.productId,
                        branch_id: data.warehouseBranchId,
                        movement_type: 'PURCHASE',
                        reference_id: purchase.id,
                        reference_type: 'purchase',
                        quantity_change: line.quantity,
                        previous_qty: previousQty,
                        new_qty: typeof newQty === 'number' ? newQty : (0, helpers_1.asNumber)(newQty),
                        unit_cost: line.costPrice,
                        notes: noteText,
                        created_by: data.createdBy,
                    },
                });
                purchaseIds.push(purchase.id);
            }
            let paymentId = null;
            if (paidNow > 0) {
                const payNotes = [
                    data.paymentNotes,
                    `Stock-in ${paymentMode}`,
                    data.invoiceRef ? `Invoice ${data.invoiceRef}` : null,
                    creditRemaining > 0
                        ? `Remaining on credit ${creditRemaining.toFixed(2)}`
                        : 'Fully paid at stock-in',
                ]
                    .filter(Boolean)
                    .join(' · ');
                const payment = await tx.supplierPayment.create({
                    data: {
                        supplier_id: data.supplierId,
                        amount: paidNow,
                        payment_date: data.purchaseDate || new Date(),
                        method: data.paymentMethod || 'CASH',
                        reference: data.paymentReference || data.invoiceRef || null,
                        notes: payNotes || null,
                        created_by: data.createdBy,
                    },
                });
                paymentId = payment.id;
            }
            return {
                count: purchaseIds.length,
                purchaseIds,
                billGroupId,
                billTotal,
                paymentMode,
                paidAmount: paidNow,
                creditRemaining,
                paymentId,
            };
        });
    }
    async listPurchases(params) {
        const page = Math.max(params.page || 1, 1);
        const limit = Math.min(Math.max(params.limit || 20, 1), 100);
        const skip = (page - 1) * limit;
        const groupBy = params.groupBy === 'bill' ? 'bill' : 'line';
        const where = {};
        if (params.productId)
            where.product_id = params.productId;
        if (params.supplierId)
            where.supplier_id = params.supplierId;
        if (params.branchId)
            where.warehouse_branch_id = params.branchId;
        if (params.userId)
            where.created_by = params.userId;
        if (params.startDate || params.endDate) {
            where.purchase_date = {};
            if (params.startDate)
                where.purchase_date.gte = params.startDate;
            if (params.endDate)
                where.purchase_date.lte = params.endDate;
        }
        const search = params.search?.trim();
        if (search) {
            where.OR = [
                { invoice_ref: { contains: search, mode: 'insensitive' } },
                { product: { name: { contains: search, mode: 'insensitive' } } },
                { product: { sku: { contains: search, mode: 'insensitive' } } },
                { product: { code: { contains: search, mode: 'insensitive' } } },
                { supplier: { name: { contains: search, mode: 'insensitive' } } },
            ];
        }
        const totalsRows = await client_1.prisma.purchase.findMany({
            where,
            select: { quantity: true, cost_price: true },
        });
        let totalQuantity = 0;
        let totalValue = 0;
        for (const row of totalsRows) {
            const qty = Number(row.quantity) || 0;
            totalQuantity += qty;
            totalValue += qty * (Number(row.cost_price) || 0);
        }
        const totalsMeta = {
            totalQuantity: Math.round(totalQuantity * 100) / 100,
            totalValue: Math.round(totalValue * 100) / 100,
        };
        if (groupBy === 'line') {
            const [total, purchases] = await Promise.all([
                client_1.prisma.purchase.count({ where }),
                client_1.prisma.purchase.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: { purchase_date: 'desc' },
                    include: PURCHASE_LIST_INCLUDE,
                }),
            ]);
            return {
                data: purchases,
                meta: {
                    total,
                    page,
                    limit,
                    totalPages: Math.max(1, Math.ceil(total / limit)),
                    groupBy: 'line',
                    ...totalsMeta,
                },
            };
        }
        // Bill-wise: load matching lines, group, then paginate groups.
        const allLines = await client_1.prisma.purchase.findMany({
            where,
            orderBy: { purchase_date: 'desc' },
            include: PURCHASE_LIST_INCLUDE,
            take: 5000,
        });
        const groupMap = new Map();
        for (const row of allLines) {
            const key = billKey(row);
            const qty = Number(row.quantity) || 0;
            const cost = Number(row.cost_price) || 0;
            const existing = groupMap.get(key);
            if (existing) {
                existing.lines.push(row);
                existing.quantity += qty;
                existing.value += qty * cost;
                if (row.purchase_date > existing.purchase_date) {
                    existing.purchase_date = row.purchase_date;
                }
            }
            else {
                groupMap.set(key, {
                    bill_group_id: key,
                    purchase_date: row.purchase_date,
                    invoice_ref: row.invoice_ref,
                    supplier: row.supplier,
                    warehouse_branch: row.warehouse_branch,
                    user: row.user,
                    delivery_status: row.delivery_status,
                    lines: [row],
                    quantity: qty,
                    value: qty * cost,
                });
            }
        }
        const bills = Array.from(groupMap.values()).sort((a, b) => b.purchase_date.getTime() - a.purchase_date.getTime());
        const total = bills.length;
        const pageBills = bills.slice(skip, skip + limit).map((b) => ({
            id: b.lines[0]?.id,
            bill_group_id: b.bill_group_id,
            purchase_date: b.purchase_date,
            invoice_ref: b.invoice_ref,
            supplier: b.supplier,
            warehouse_branch: b.warehouse_branch,
            user: b.user,
            delivery_status: b.delivery_status,
            line_count: b.lines.length,
            quantity: Math.round(b.quantity * 100) / 100,
            cost_price: b.quantity > 0 ? Math.round((b.value / b.quantity) * 100) / 100 : 0,
            value: Math.round(b.value * 100) / 100,
            product: {
                id: b.lines[0]?.product_id,
                name: b.lines.length === 1
                    ? b.lines[0]?.product?.name || '—'
                    : `${b.lines.length} products`,
                sku: b.lines.length === 1 ? b.lines[0]?.product?.sku : null,
            },
            lines: b.lines.map((l) => ({
                id: l.id,
                product: l.product,
                quantity: Number(l.quantity) || 0,
                cost_price: Number(l.cost_price) || 0,
                value: (Number(l.quantity) || 0) * (Number(l.cost_price) || 0),
            })),
        }));
        return {
            data: pageBills,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.max(1, Math.ceil(total / limit)),
                groupBy: 'bill',
                ...totalsMeta,
            },
        };
    }
    async getPurchaseById(id) {
        const purchase = await client_1.prisma.purchase.findUnique({
            where: { id },
            include: PURCHASE_LIST_INCLUDE,
        });
        if (!purchase)
            throw new apiError_1.AppError(404, 'Purchase not found');
        const groupId = purchase.bill_group_id;
        let billLines = [purchase];
        if (groupId) {
            billLines = await client_1.prisma.purchase.findMany({
                where: { bill_group_id: groupId },
                orderBy: { created_at: 'asc' },
                include: PURCHASE_LIST_INCLUDE,
            });
        }
        else {
            const inv = (purchase.invoice_ref || '').trim();
            if (inv) {
                const dayStart = new Date(purchase.purchase_date);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(purchase.purchase_date);
                dayEnd.setHours(23, 59, 59, 999);
                billLines = await client_1.prisma.purchase.findMany({
                    where: {
                        supplier_id: purchase.supplier_id,
                        warehouse_branch_id: purchase.warehouse_branch_id,
                        invoice_ref: purchase.invoice_ref,
                        purchase_date: { gte: dayStart, lte: dayEnd },
                    },
                    orderBy: { created_at: 'asc' },
                    include: PURCHASE_LIST_INCLUDE,
                });
            }
        }
        const billQuantity = billLines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
        const billValue = billLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.cost_price) || 0), 0);
        return {
            ...purchase,
            bill_group_id: groupId || billKey(purchase),
            bill_lines: billLines,
            bill_line_count: billLines.length,
            bill_quantity: Math.round(billQuantity * 100) / 100,
            bill_value: Math.round(billValue * 100) / 100,
        };
    }
    async getMonthlyStats(warehouseBranchId) {
        const startOfMonth = (0, timezone_1.startOfBusinessMonth)();
        const where = {
            purchase_date: { gte: startOfMonth },
        };
        if (warehouseBranchId)
            where.warehouse_branch_id = warehouseBranchId;
        const purchases = await client_1.prisma.purchase.findMany({
            where,
            include: { product: true },
        });
        const totalQuantity = purchases.reduce((sum, p) => sum + (0, helpers_1.asNumber)(p.quantity), 0);
        const totalValue = purchases.reduce((sum, p) => sum + (0, helpers_1.asNumber)(p.quantity) * (0, helpers_1.asNumber)(p.cost_price), 0);
        return {
            totalPurchases: purchases.length,
            totalQuantity,
            totalValue,
        };
    }
}
exports.PurchaseService = PurchaseService;
//# sourceMappingURL=purchase.service.js.map