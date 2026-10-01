"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchaseReportService = exports.BUSINESS_TIMEZONE = exports.localRange = void 0;
const client_1 = require("../prisma/client");
var timezone_1 = require("../utils/timezone");
Object.defineProperty(exports, "localRange", { enumerable: true, get: function () { return timezone_1.localRange; } });
Object.defineProperty(exports, "BUSINESS_TIMEZONE", { enumerable: true, get: function () { return timezone_1.BUSINESS_TIMEZONE; } });
const timezone_2 = require("../utils/timezone");
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);
const num = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const itemLabel = (product) => [product.name, product.size?.name, product.color?.name].filter(Boolean).join(' · ');
class PurchaseReportService {
    async itemwise(params) {
        const isAdmin = ADMIN_ROLES.has(params.userRole || '');
        const branchId = isAdmin ? undefined : params.userBranchId || undefined;
        const { start, end } = (0, timezone_2.localRange)(params.from, params.to);
        const mode = params.mode === 'item' ? 'item' : 'vendor';
        const supplierId = mode === 'vendor' ? params.supplierId : undefined;
        const productId = mode === 'item' ? params.productId : undefined;
        const search = params.search?.trim();
        const productSearchFilter = search
            ? {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { sku: { contains: search, mode: 'insensitive' } },
                    { code: { contains: search, mode: 'insensitive' } },
                ],
            }
            : undefined;
        const purchaseWhere = {
            purchase_date: { gte: start, lte: end },
            ...(branchId ? { warehouse_branch_id: branchId } : {}),
            ...(supplierId ? { supplier_id: supplierId } : {}),
            ...(productId ? { product_id: productId } : {}),
            ...(mode === 'item' && !productId && productSearchFilter
                ? { product: productSearchFilter }
                : {}),
        };
        const returnWhere = {
            return_date: { gte: start, lte: end },
            status: { not: 'CANCELLED' },
            ...(branchId ? { branch_id: branchId } : {}),
            ...(supplierId ? { supplier_id: supplierId } : {}),
            ...(productId
                ? { items: { some: { product_id: productId } } }
                : mode === 'item' && productSearchFilter
                    ? { items: { some: { product: productSearchFilter } } }
                    : {}),
        };
        const [purchases, returns, suppliers, products] = await Promise.all([
            client_1.prisma.purchase.findMany({
                where: purchaseWhere,
                include: {
                    product: { include: { unit: true, size: true, color: true } },
                    supplier: { select: { id: true, name: true, code: true } },
                    purchase_order: { select: { po_number: true } },
                },
                orderBy: { purchase_date: 'asc' },
            }),
            client_1.prisma.purchaseReturn.findMany({
                where: returnWhere,
                include: {
                    supplier: { select: { id: true, name: true, code: true } },
                    items: {
                        where: productId
                            ? { product_id: productId }
                            : mode === 'item' && productSearchFilter
                                ? { product: productSearchFilter }
                                : undefined,
                        include: { product: { include: { unit: true, size: true, color: true } } },
                    },
                },
                orderBy: { return_date: 'asc' },
            }),
            client_1.prisma.supplier.findMany({
                select: { id: true, name: true, code: true },
                orderBy: { name: 'asc' },
            }),
            client_1.prisma.product.findMany({
                where: { is_active: true },
                include: { size: true, color: true },
                orderBy: { name: 'asc' },
                take: 500,
            }),
        ]);
        const lines = [
            ...purchases.map((row) => {
                const quantity = num(row.quantity);
                const rate = num(row.cost_price);
                return {
                    id: row.id,
                    date: row.purchase_date.toISOString(),
                    voucher: row.invoice_ref || row.purchase_order?.po_number || '—',
                    type: 'PP',
                    typeLabel: 'Purchase',
                    supplierId: row.supplier_id,
                    supplier: row.supplier.name,
                    productId: row.product_id,
                    sku: row.product.sku || row.product.code,
                    item: itemLabel(row.product),
                    unit: row.product.unit?.name || 'Pcs',
                    quantity: round2(quantity),
                    rate: round2(rate),
                    amount: round2(quantity * rate),
                };
            }),
            ...returns.flatMap((row) => row.items.map((item) => {
                const quantity = -Math.abs(num(item.quantity));
                const rate = num(item.unit_cost);
                return {
                    id: item.id,
                    date: row.return_date.toISOString(),
                    voucher: row.return_number,
                    type: 'PR',
                    typeLabel: 'Purchase return',
                    supplierId: row.supplier_id,
                    supplier: row.supplier.name,
                    productId: item.product_id,
                    sku: item.product.sku || item.product.code,
                    item: itemLabel(item.product),
                    unit: item.product.unit?.name || 'Pcs',
                    quantity: round2(quantity),
                    rate: round2(rate),
                    amount: round2(quantity * rate),
                };
            })),
        ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const totalQuantity = round2(lines.reduce((sum, line) => sum + line.quantity, 0));
        const totalAmount = round2(lines.reduce((sum, line) => sum + line.amount, 0));
        return {
            period: { from: params.from, to: params.to },
            mode,
            suppliers,
            products: products.map((product) => ({
                id: product.id,
                name: itemLabel(product),
                sku: product.sku || product.code,
            })),
            lines,
            totals: { quantity: totalQuantity, amount: totalAmount, count: lines.length },
        };
    }
}
exports.PurchaseReportService = PurchaseReportService;
//# sourceMappingURL=purchase-report.service.js.map