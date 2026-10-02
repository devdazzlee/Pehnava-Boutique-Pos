"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SalesReportService = void 0;
const client_1 = require("../prisma/client");
const purchase_report_service_1 = require("./purchase-report.service");
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);
const INCLUDED_STATUSES = ['COMPLETED', 'REFUNDED', 'EXCHANGED'];
const num = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const itemLabel = (product) => [product.name, product.size?.name, product.color?.name].filter(Boolean).join(' · ');
const isRegenerated = (notes) => {
    const text = (notes || '').toLowerCase();
    return text.includes('[regenerated]') || text.includes('regenerated bill');
};
const typeFor = (itemType) => {
    if (itemType === 'RETURN')
        return { type: 'SR', typeLabel: 'Sale return' };
    if (itemType === 'EXCHANGE')
        return { type: 'EX', typeLabel: 'Exchange' };
    return { type: 'SL', typeLabel: 'Sale' };
};
class SalesReportService {
    async itemwise(params) {
        const isAdmin = ADMIN_ROLES.has(params.userRole || '');
        // Admins may narrow to one branch; everyone else is locked to their own.
        const branchId = isAdmin ? params.branchId || undefined : params.userBranchId || undefined;
        const { start, end } = (0, purchase_report_service_1.localRange)(params.from, params.to);
        const mode = params.mode === 'item' ? 'item' : 'customer';
        const customerId = mode === 'customer' ? params.customerId : undefined;
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
        const saleWhere = {
            sale_date: { gte: start, lte: end },
            status: { in: INCLUDED_STATUSES },
            ...(branchId ? { branch_id: branchId } : {}),
            ...(customerId ? { customer_id: customerId } : {}),
            ...(productId
                ? { sale_items: { some: { product_id: productId } } }
                : mode === 'item' && productSearchFilter
                    ? { sale_items: { some: { product: productSearchFilter } } }
                    : {}),
        };
        const [sales, customers, products, branches] = await Promise.all([
            client_1.prisma.sale.findMany({
                where: saleWhere,
                include: {
                    customer: { select: { id: true, name: true, phone_number: true, mobile_number: true } },
                    branch: { select: { id: true, name: true } },
                    sale_items: {
                        where: productId
                            ? { product_id: productId }
                            : mode === 'item' && productSearchFilter
                                ? { product: productSearchFilter }
                                : undefined,
                        include: { product: { include: { unit: true, size: true, color: true } } },
                    },
                },
                orderBy: { sale_date: 'asc' },
            }),
            client_1.prisma.customer.findMany({
                where: { is_active: true },
                select: { id: true, name: true, phone_number: true, mobile_number: true },
                orderBy: { name: 'asc' },
            }),
            // Lean select (no 500 cap) so every active item is pickable in the filter.
            client_1.prisma.product.findMany({
                where: { is_active: true },
                select: {
                    id: true,
                    name: true,
                    sku: true,
                    code: true,
                    size: { select: { name: true } },
                    color: { select: { name: true } },
                },
                orderBy: { name: 'asc' },
            }),
            isAdmin
                ? client_1.prisma.branch.findMany({
                    where: { is_active: true },
                    select: { id: true, name: true, code: true },
                    orderBy: { name: 'asc' },
                })
                : Promise.resolve([]),
        ]);
        const lines = sales
            .filter((sale) => !isRegenerated(sale.notes))
            .flatMap((sale) => sale.sale_items.map((item) => {
            const quantity = num(item.quantity);
            const rate = num(item.unit_price);
            const kind = typeFor(item.item_type);
            const phone = sale.customer?.mobile_number || sale.customer?.phone_number;
            return {
                id: item.id,
                date: sale.sale_date.toISOString(),
                voucher: sale.invoice_number || sale.sale_number,
                type: kind.type,
                typeLabel: kind.typeLabel,
                customerId: sale.customer_id,
                customer: sale.customer?.name?.trim() || 'Walk-in',
                customerPhone: phone || '',
                branch: sale.branch?.name || '',
                saleId: sale.id,
                productId: item.product_id,
                sku: item.product.sku || item.product.code,
                item: itemLabel(item.product),
                unit: item.product.unit?.name || 'Pcs',
                quantity: round2(quantity),
                rate: round2(rate),
                discount: round2(num(item.discount_amount)),
                amount: round2(num(item.line_total)),
            };
        }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        // Split totals by line type so the UI can show sales vs returns vs exchanges.
        const sumBy = (type, field) => round2(lines.filter((line) => line.type === type).reduce((sum, line) => sum + line[field], 0));
        const breakdown = {
            salesAmount: sumBy('SL', 'amount'),
            salesQuantity: sumBy('SL', 'quantity'),
            returnsAmount: sumBy('SR', 'amount'),
            returnsQuantity: sumBy('SR', 'quantity'),
            exchangeAmount: sumBy('EX', 'amount'),
            exchangeQuantity: sumBy('EX', 'quantity'),
            discount: round2(lines.reduce((sum, line) => sum + line.discount, 0)),
            billCount: new Set(lines.map((line) => line.saleId)).size,
            customerCount: new Set(lines.filter((line) => line.customerId).map((line) => line.customerId)).size,
            itemCount: new Set(lines.map((line) => line.productId)).size,
        };
        return {
            period: { from: params.from, to: params.to },
            mode,
            customers: customers.map((customer) => ({
                id: customer.id,
                name: customer.name?.trim() || 'Unnamed customer',
                phone: customer.mobile_number || customer.phone_number || '',
            })),
            products: products.map((product) => ({
                id: product.id,
                name: itemLabel(product),
                sku: product.sku || product.code,
            })),
            branches,
            branchId: branchId || null,
            lines,
            totals: {
                quantity: round2(lines.reduce((sum, line) => sum + line.quantity, 0)),
                amount: round2(lines.reduce((sum, line) => sum + line.amount, 0)),
                count: lines.length,
                ...breakdown,
            },
        };
    }
}
exports.SalesReportService = SalesReportService;
//# sourceMappingURL=sales-report.service.js.map