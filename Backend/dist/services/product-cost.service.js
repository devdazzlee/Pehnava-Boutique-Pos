"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lineUnitCost = lineUnitCost;
exports.lineCogs = lineCogs;
exports.applyWeightedAverageCost = applyWeightedAverageCost;
exports.productOnHandQty = productOnHandQty;
const client_1 = require("@prisma/client");
const num = (v) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
};
const round4 = (v) => Math.round((v + Number.EPSILON) * 10000) / 10000;
/**
 * COGS unit cost for a sale line: prefer the cost frozen at sale time,
 * fall back to the product master rate for legacy rows.
 */
function lineUnitCost(item) {
    if (item.unit_cost != null && Number.isFinite(Number(item.unit_cost))) {
        return num(item.unit_cost);
    }
    return num(item.product?.purchase_rate);
}
function lineCogs(item) {
    return round4(lineUnitCost(item) * num(item.quantity));
}
/**
 * Moving weighted-average cost on Stock In / PO receive (retail standard when
 * there is no lot/FIFO layer). Updates Product.purchase_rate and logs history.
 *
 * `onHandBefore` = total qty on hand across all branches BEFORE this receipt.
 */
async function applyWeightedAverageCost(tx, opts) {
    const incomingQty = num(opts.incomingQty);
    const unitCost = num(opts.unitCost);
    if (!(incomingQty > 0) || !(unitCost >= 0))
        return null;
    const product = await tx.product.findUnique({
        where: { id: opts.productId },
        select: { purchase_rate: true },
    });
    if (!product)
        return null;
    const oldRate = num(product.purchase_rate);
    const onHand = Math.max(0, num(opts.onHandBefore));
    const newRate = onHand <= 0.0001
        ? unitCost
        : round4((onHand * oldRate + incomingQty * unitCost) / (onHand + incomingQty));
    if (Math.abs(newRate - oldRate) < 0.00005)
        return { oldRate, newRate };
    await tx.product.update({
        where: { id: opts.productId },
        data: { purchase_rate: new client_1.Prisma.Decimal(newRate) },
    });
    await tx.productPriceHistory.create({
        data: {
            product_id: opts.productId,
            field: 'purchase_rate',
            old_value: new client_1.Prisma.Decimal(oldRate),
            new_value: new client_1.Prisma.Decimal(newRate),
            source: opts.source || 'STOCK_IN',
            changed_by: opts.userId ?? null,
        },
    });
    return { oldRate, newRate };
}
/** Total on-hand qty for a product across all branches (for WAC). */
async function productOnHandQty(tx, productId) {
    const agg = await tx.stock.aggregate({
        where: { product_id: productId },
        _sum: { current_quantity: true },
    });
    return num(agg._sum.current_quantity);
}
//# sourceMappingURL=product-cost.service.js.map