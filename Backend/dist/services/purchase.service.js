"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchaseService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const helpers_1 = require("../utils/helpers");
const timezone_1 = require("../utils/timezone");
const crypto_1 = require("crypto");
const register_cash_out_helper_1 = require("./register-cash-out.helper");
const product_cost_service_1 = require("./product-cost.service");
const PURCHASE_LIST_INCLUDE = {
    product: true,
    supplier: true,
    warehouse_branch: true,
    user: { select: { email: true } },
};
/** Remote DB (Neon) needs more than Prisma's default 5s interactive tx limit. */
const PURCHASE_TX_OPTIONS = { maxWait: 20_000, timeout: 30_000 };
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
function parseStockInPayNotes(notes) {
    const raw = notes || '';
    const match = raw.match(/Pay:\s*(CASH|CREDIT|MIX)(?:\s*·\s*paid\s*([\d.]+))?(?:\s*·\s*credit\s*([\d.]+))?/i);
    if (!match)
        return { mode: null, paidAmount: 0, creditAmount: 0 };
    const mode = match[1].toUpperCase();
    const paidAmount = match[2] != null ? Number(match[2]) : 0;
    const creditAmount = match[3] != null ? Number(match[3]) : 0;
    return { mode, paidAmount, creditAmount };
}
function replaceStockInPayInNotes(notes, payLine) {
    const base = (notes || '').trim();
    if (!base)
        return payLine;
    if (/Pay:\s*(CASH|CREDIT|MIX)/i.test(base)) {
        return base.replace(/Pay:\s*(CASH|CREDIT|MIX)[^|]*/i, payLine).trim();
    }
    return `${base} | ${payLine}`;
}
class PurchaseService {
    billTotalFromLines(lines) {
        return lines.reduce((sum, line) => sum + (0, helpers_1.asNumber)(line.quantity) * (0, helpers_1.asNumber)(line.cost_price), 0);
    }
    /**
     * Keeps supplier ledger in sync when Stock In bills change:
     * payable = sum(purchase lines); auto-payments from stock-in follow bill total.
     */
    async syncStockInBillPayments(tx, billGroupId) {
        if (!billGroupId)
            return;
        const lines = await tx.purchase.findMany({
            where: { bill_group_id: billGroupId, purchase_invoice_id: null },
        });
        const payments = await tx.supplierPayment.findMany({
            where: { bill_group_id: billGroupId, type: 'PAYMENT' },
        });
        if (lines.length === 0) {
            if (payments.length) {
                await tx.supplierPayment.deleteMany({ where: { bill_group_id: billGroupId } });
            }
            return;
        }
        const billTotal = this.billTotalFromLines(lines);
        const notesSample = lines.map((l) => l.notes).find((n) => n && /Pay:/i.test(n)) || '';
        const payMeta = parseStockInPayNotes(notesSample);
        if (!payMeta.mode || payMeta.mode === 'CREDIT') {
            if (payments.length) {
                await tx.supplierPayment.deleteMany({ where: { bill_group_id: billGroupId } });
            }
            return;
        }
        const paidTarget = payMeta.mode === 'CASH'
            ? billTotal
            : Math.min(Math.max(payMeta.paidAmount, 0), billTotal);
        const creditTarget = Math.max(0, billTotal - paidTarget);
        const payLine = payMeta.mode === 'CASH'
            ? `Pay: CASH · paid ${paidTarget.toFixed(2)} · credit 0.00`
            : `Pay: MIX · paid ${paidTarget.toFixed(2)} · credit ${creditTarget.toFixed(2)}`;
        for (const line of lines) {
            const nextNotes = replaceStockInPayInNotes(line.notes, payLine);
            if (nextNotes !== line.notes) {
                await tx.purchase.update({
                    where: { id: line.id },
                    data: { notes: nextNotes },
                });
            }
        }
        if (paidTarget <= 0.005) {
            await tx.supplierPayment.deleteMany({ where: { bill_group_id: billGroupId } });
            return;
        }
        if (payments.length === 0 && lines[0]) {
            const anchor = lines[0];
            const dayStart = new Date(anchor.purchase_date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(anchor.purchase_date);
            dayEnd.setHours(23, 59, 59, 999);
            const inv = (anchor.invoice_ref || '').trim();
            const legacy = await tx.supplierPayment.findFirst({
                where: {
                    supplier_id: anchor.supplier_id,
                    bill_group_id: null,
                    type: 'PAYMENT',
                    ...(inv ? { OR: [{ reference: inv }, { notes: { contains: inv } }] } : {}),
                    notes: { contains: 'Stock-in', mode: 'insensitive' },
                    payment_date: { gte: dayStart, lte: dayEnd },
                },
                orderBy: { created_at: 'desc' },
            });
            if (legacy) {
                await tx.supplierPayment.update({
                    where: { id: legacy.id },
                    data: { bill_group_id: billGroupId, amount: paidTarget },
                });
                return;
            }
        }
        if (payments.length === 0) {
            return;
        }
        await tx.supplierPayment.update({
            where: { id: payments[0].id },
            data: { amount: paidTarget },
        });
        if (payments.length > 1) {
            await tx.supplierPayment.deleteMany({
                where: { bill_group_id: billGroupId, id: { not: payments[0].id } },
            });
        }
    }
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
            const onHandBefore = await (0, product_cost_service_1.productOnHandQty)(tx, data.productId);
            await (0, product_cost_service_1.applyWeightedAverageCost)(tx, {
                productId: data.productId,
                onHandBefore,
                incomingQty: qty,
                unitCost: data.costPrice,
                userId: data.createdBy,
                source: 'STOCK_IN',
            });
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
        }, PURCHASE_TX_OPTIONS);
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
        const result = await client_1.prisma.$transaction(async (tx) => {
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
                // WAC before stock bump so on-hand excludes this receipt.
                const onHandBefore = await (0, product_cost_service_1.productOnHandQty)(tx, line.productId);
                await (0, product_cost_service_1.applyWeightedAverageCost)(tx, {
                    productId: line.productId,
                    onHandBefore,
                    incomingQty: line.quantity,
                    unitCost: line.costPrice,
                    userId: data.createdBy,
                    source: 'STOCK_IN',
                });
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
                        bill_group_id: billGroupId,
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
        }, PURCHASE_TX_OPTIONS);
        const method = String(data.paymentMethod || 'CASH').toUpperCase();
        if (result.paidAmount > 0 && method === 'CASH') {
            const supplier = await client_1.prisma.supplier.findUnique({
                where: { id: data.supplierId },
                select: { name: true },
            });
            await (0, register_cash_out_helper_1.recordCashPayOnOpenRegister)({
                particular: `Purchase payment · ${supplier?.name || 'Supplier'}`,
                amount: result.paidAmount,
                branchId: data.warehouseBranchId,
                userId: data.createdBy,
                reference: result.paymentId,
                notes: data.paymentNotes || data.invoiceRef || null,
            }).catch(() => undefined);
        }
        return result;
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
    /**
     * Correct a Stock In line: qty/cost/meta. Quantity changes adjust on-hand stock
     * by the delta and write an ADJUSTMENT movement linked to the purchase.
     */
    async updatePurchase(id, data) {
        const existing = await client_1.prisma.purchase.findUnique({
            where: { id },
            include: {
                return_items: { select: { quantity: true } },
            },
        });
        if (!existing)
            throw new apiError_1.AppError(404, 'Purchase not found');
        const oldQty = (0, helpers_1.asNumber)(existing.quantity);
        const returnedQty = existing.return_items.reduce((s, r) => s + (0, helpers_1.asNumber)(r.quantity), 0);
        const nextQty = data.quantity !== undefined ? Number(data.quantity) : oldQty;
        if (!Number.isFinite(nextQty) || nextQty <= 0) {
            throw new apiError_1.AppError(400, 'Quantity must be greater than zero');
        }
        if (nextQty < returnedQty) {
            throw new apiError_1.AppError(400, `Quantity cannot be less than already returned (${returnedQty})`);
        }
        const nextCost = data.costPrice !== undefined ? Number(data.costPrice) : (0, helpers_1.asNumber)(existing.cost_price);
        if (!Number.isFinite(nextCost) || nextCost < 0) {
            throw new apiError_1.AppError(400, 'Cost price must be >= 0');
        }
        const nextSale = data.salePrice !== undefined
            ? Number(data.salePrice)
            : (0, helpers_1.asNumber)(existing.sale_price);
        if (!Number.isFinite(nextSale) || nextSale < 0) {
            throw new apiError_1.AppError(400, 'Sale price must be >= 0');
        }
        const qtyDelta = nextQty - oldQty;
        return client_1.prisma.$transaction(async (tx) => {
            if (qtyDelta !== 0) {
                let stock = await tx.stock.findUnique({
                    where: {
                        product_id_branch_id: {
                            product_id: existing.product_id,
                            branch_id: existing.warehouse_branch_id,
                        },
                    },
                });
                const previousQty = stock ? (0, helpers_1.asNumber)(stock.current_quantity) : 0;
                const newStockQty = previousQty + qtyDelta;
                if (newStockQty < 0) {
                    throw new apiError_1.AppError(400, `Cannot reduce quantity: only ${previousQty} units remain in stock at this branch`);
                }
                if (stock) {
                    await tx.stock.update({
                        where: {
                            product_id_branch_id: {
                                product_id: existing.product_id,
                                branch_id: existing.warehouse_branch_id,
                            },
                        },
                        data: { current_quantity: newStockQty },
                    });
                }
                else {
                    await tx.stock.create({
                        data: {
                            product_id: existing.product_id,
                            branch_id: existing.warehouse_branch_id,
                            current_quantity: Math.max(0, newStockQty),
                        },
                    });
                }
                await tx.stockMovement.create({
                    data: {
                        product_id: existing.product_id,
                        branch_id: existing.warehouse_branch_id,
                        movement_type: 'ADJUSTMENT',
                        reference_id: existing.id,
                        reference_type: 'purchase_edit',
                        quantity_change: qtyDelta,
                        previous_qty: previousQty,
                        new_qty: newStockQty,
                        unit_cost: nextCost,
                        notes: `Stock In edit: qty ${oldQty} → ${nextQty}`,
                        created_by: data.updatedBy,
                    },
                });
            }
            const purchase = await tx.purchase.update({
                where: { id },
                data: {
                    quantity: nextQty,
                    cost_price: nextCost,
                    sale_price: nextSale,
                    ...(data.purchaseDate !== undefined
                        ? { purchase_date: data.purchaseDate }
                        : {}),
                    ...(data.invoiceRef !== undefined ? { invoice_ref: data.invoiceRef } : {}),
                    ...(data.notes !== undefined ? { notes: data.notes } : {}),
                    ...(data.deliveryStatus !== undefined
                        ? { delivery_status: data.deliveryStatus }
                        : {}),
                },
                include: PURCHASE_LIST_INCLUDE,
            });
            await this.syncStockInBillPayments(tx, existing.bill_group_id);
            return purchase;
        }, PURCHASE_TX_OPTIONS);
    }
    /** Stock reversal + movement + row delete (no payment sync). */
    async deletePurchaseLineInTransaction(tx, existing, deletedBy) {
        const qty = (0, helpers_1.asNumber)(existing.quantity);
        const cost = (0, helpers_1.asNumber)(existing.cost_price);
        const stock = await tx.stock.findUnique({
            where: {
                product_id_branch_id: {
                    product_id: existing.product_id,
                    branch_id: existing.warehouse_branch_id,
                },
            },
        });
        const previousQty = stock ? (0, helpers_1.asNumber)(stock.current_quantity) : 0;
        const newStockQty = previousQty - qty;
        if (stock) {
            await tx.stock.update({
                where: {
                    product_id_branch_id: {
                        product_id: existing.product_id,
                        branch_id: existing.warehouse_branch_id,
                    },
                },
                data: { current_quantity: newStockQty },
            });
        }
        else {
            await tx.stock.create({
                data: {
                    product_id: existing.product_id,
                    branch_id: existing.warehouse_branch_id,
                    current_quantity: newStockQty,
                },
            });
        }
        const movementNote = newStockQty < 0
            ? `Stock In line removed (${qty} units) · on-hand now ${newStockQty} (some units may already have been sold)`
            : `Stock In line removed (${qty} units)`;
        await tx.stockMovement.create({
            data: {
                product_id: existing.product_id,
                branch_id: existing.warehouse_branch_id,
                movement_type: 'ADJUSTMENT',
                reference_id: existing.id,
                reference_type: 'purchase_delete',
                quantity_change: -qty,
                previous_qty: previousQty,
                new_qty: newStockQty,
                unit_cost: cost,
                notes: movementNote,
                created_by: deletedBy,
            },
        });
        await tx.purchase.delete({ where: { id: existing.id } });
    }
    /** Remove one Stock In line and reverse received quantity from branch stock. */
    async deletePurchaseLine(id, deletedBy) {
        const existing = await client_1.prisma.purchase.findUnique({
            where: { id },
            include: { return_items: { select: { id: true, quantity: true } } },
        });
        if (!existing)
            throw new apiError_1.AppError(404, 'Purchase not found');
        if (existing.return_items.length > 0) {
            throw new apiError_1.AppError(400, 'Cannot remove this line: supplier returns exist against it. Reverse returns first.');
        }
        if (existing.purchase_invoice_id) {
            throw new apiError_1.AppError(400, 'Cannot remove this line: it is on a supplier invoice. Unlink the invoice first.');
        }
        return client_1.prisma.$transaction(async (tx) => {
            await this.deletePurchaseLineInTransaction(tx, existing, deletedBy);
            await this.syncStockInBillPayments(tx, existing.bill_group_id);
            return { deletedId: id };
        }, PURCHASE_TX_OPTIONS);
    }
    /** Delete every line on the same supplier bill (bill_group_id). */
    async deleteBill(anchorPurchaseId, deletedBy) {
        const detail = await this.getPurchaseById(anchorPurchaseId);
        const lines = detail.bill_lines || [detail];
        if (lines.length === 0)
            throw new apiError_1.AppError(404, 'Bill not found');
        const invoiced = lines.find((l) => l.purchase_invoice_id);
        if (invoiced) {
            throw new apiError_1.AppError(400, 'Cannot delete this bill: one or more lines are on a supplier invoice. Unlink the invoice in Suppliers first.');
        }
        for (const line of lines) {
            const row = await client_1.prisma.purchase.findUnique({
                where: { id: line.id },
                include: { return_items: { select: { id: true } } },
            });
            if (row?.return_items.length) {
                throw new apiError_1.AppError(400, 'Cannot delete this bill: supplier returns exist on one or more lines. Reverse returns first.');
            }
        }
        const billGroupId = lines[0]?.bill_group_id ?? null;
        return client_1.prisma.$transaction(async (tx) => {
            for (const line of lines) {
                await this.deletePurchaseLineInTransaction(tx, line, deletedBy);
            }
            await this.syncStockInBillPayments(tx, billGroupId);
            return { deletedLineCount: lines.length };
        }, PURCHASE_TX_OPTIONS);
    }
    /** Add a product line to an existing supplier bill (same bill_group_id). */
    async appendBillLine(anchorPurchaseId, data) {
        const anchor = await client_1.prisma.purchase.findUnique({
            where: { id: anchorPurchaseId },
            include: { product: true },
        });
        if (!anchor)
            throw new apiError_1.AppError(404, 'Bill not found');
        const qty = Number(data.quantity);
        const cost = Number(data.costPrice);
        if (!Number.isFinite(qty) || qty <= 0) {
            throw new apiError_1.AppError(400, 'Quantity must be positive');
        }
        if (!Number.isFinite(cost) || cost < 0) {
            throw new apiError_1.AppError(400, 'Cost price must be >= 0');
        }
        const sale = data.salePrice !== undefined ? Number(data.salePrice) : cost;
        if (!Number.isFinite(sale) || sale < 0) {
            throw new apiError_1.AppError(400, 'Sale price must be >= 0');
        }
        let billGroupId = anchor.bill_group_id;
        if (!billGroupId) {
            billGroupId = (0, crypto_1.randomUUID)();
        }
        return client_1.prisma.$transaction(async (tx) => {
            if (!anchor.bill_group_id) {
                const siblings = await this.getPurchaseById(anchorPurchaseId);
                const siblingLines = siblings.bill_lines || [anchor];
                for (const line of siblingLines) {
                    await tx.purchase.update({
                        where: { id: line.id },
                        data: { bill_group_id: billGroupId },
                    });
                }
            }
            const purchase = await tx.purchase.create({
                data: {
                    product_id: data.productId,
                    supplier_id: anchor.supplier_id,
                    warehouse_branch_id: anchor.warehouse_branch_id,
                    quantity: qty,
                    cost_price: cost,
                    sale_price: sale,
                    purchase_date: anchor.purchase_date,
                    invoice_ref: anchor.invoice_ref,
                    bill_group_id: billGroupId,
                    notes: anchor.notes,
                    delivery_status: anchor.delivery_status,
                    purchase_order_id: anchor.purchase_order_id,
                    created_by: data.createdBy,
                },
                include: PURCHASE_LIST_INCLUDE,
            });
            let stock = await tx.stock.findUnique({
                where: {
                    product_id_branch_id: {
                        product_id: data.productId,
                        branch_id: anchor.warehouse_branch_id,
                    },
                },
            });
            const previousQty = stock ? (0, helpers_1.asNumber)(stock.current_quantity) : 0;
            const newQty = stock ? (0, helpers_1.addDecimal)(stock.current_quantity, qty) : qty;
            if (stock) {
                await tx.stock.update({
                    where: {
                        product_id_branch_id: {
                            product_id: data.productId,
                            branch_id: anchor.warehouse_branch_id,
                        },
                    },
                    data: { current_quantity: newQty },
                });
            }
            else {
                await tx.stock.create({
                    data: {
                        product_id: data.productId,
                        branch_id: anchor.warehouse_branch_id,
                        current_quantity: qty,
                    },
                });
            }
            await tx.stockMovement.create({
                data: {
                    product_id: data.productId,
                    branch_id: anchor.warehouse_branch_id,
                    movement_type: 'PURCHASE',
                    reference_id: purchase.id,
                    reference_type: 'purchase',
                    quantity_change: qty,
                    previous_qty: previousQty,
                    new_qty: typeof newQty === 'number' ? newQty : (0, helpers_1.asNumber)(newQty),
                    unit_cost: cost,
                    notes: 'Added to existing supplier bill',
                    created_by: data.createdBy,
                },
            });
            await this.syncStockInBillPayments(tx, billGroupId);
            return purchase;
        }, PURCHASE_TX_OPTIONS);
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