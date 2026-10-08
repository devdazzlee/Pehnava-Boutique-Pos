"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeOriginalSalePaidFactor = computeOriginalSalePaidFactor;
const toNum = (value) => {
    if (value == null)
        return 0;
    if (typeof value === 'number')
        return value;
    return value.toNumber();
};
/**
 * Ratio of what the customer paid to the pre-discount line subtotal.
 * Used to prorate order-level discounts (manual, promo, loyalty) onto returns.
 */
function computeOriginalSalePaidFactor(sale) {
    const lineSum = (sale.sale_items || []).reduce((s, i) => s + toNum(i.line_total), 0);
    const grossSubtotal = toNum(sale.subtotal) || lineSum;
    if (grossSubtotal <= 0)
        return 1;
    const orderDiscount = toNum(sale.discount_amount);
    if (orderDiscount > 0) {
        return Math.max(0, Math.min(1, (grossSubtotal - orderDiscount) / grossSubtotal));
    }
    const paid = Math.abs(toNum(sale.total_amount));
    if (paid > 0 && paid < grossSubtotal - 0.01) {
        return Math.max(0, Math.min(1, paid / grossSubtotal));
    }
    return 1;
}
//# sourceMappingURL=saleReturnPricing.js.map