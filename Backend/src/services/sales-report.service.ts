import { Prisma, SaleItemType, SaleStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { localRange } from './purchase-report.service';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);
const INCLUDED_STATUSES: SaleStatus[] = ['COMPLETED', 'REFUNDED', 'EXCHANGED'];

const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const itemLabel = (product: {
  name: string;
  size?: { name: string } | null;
  color?: { name: string } | null;
}) => [product.name, product.size?.name, product.color?.name].filter(Boolean).join(' · ');

const isRegenerated = (notes?: string | null) => {
  const text = (notes || '').toLowerCase();
  return text.includes('[regenerated]') || text.includes('regenerated bill');
};

const typeFor = (itemType: SaleItemType) => {
  if (itemType === 'RETURN') return { type: 'SR', typeLabel: 'Sale return' };
  if (itemType === 'EXCHANGE') return { type: 'EX', typeLabel: 'Exchange' };
  return { type: 'SL', typeLabel: 'Sale' };
};

export class SalesReportService {
  async itemwise(params: {
    from: string;
    to: string;
    mode?: 'customer' | 'item';
    customerId?: string;
    productId?: string;
    search?: string;
    userRole?: string;
    userBranchId?: string | null;
  }) {
    const isAdmin = ADMIN_ROLES.has(params.userRole || '');
    const branchId = isAdmin ? undefined : params.userBranchId || undefined;
    const { start, end } = localRange(params.from, params.to);
    const mode = params.mode === 'item' ? 'item' : 'customer';
    const customerId = mode === 'customer' ? params.customerId : undefined;
    const productId = mode === 'item' ? params.productId : undefined;
    const search = params.search?.trim();
    const productSearchFilter = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { sku: { contains: search, mode: 'insensitive' as const } },
            { code: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const saleWhere: Prisma.SaleWhereInput = {
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

    const [sales, customers, products] = await Promise.all([
      prisma.sale.findMany({
        where: saleWhere,
        include: {
          customer: { select: { id: true, name: true, phone_number: true, mobile_number: true } },
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
      prisma.customer.findMany({
        where: { is_active: true },
        select: { id: true, name: true, phone_number: true, mobile_number: true },
        orderBy: { name: 'asc' },
      }),
      prisma.product.findMany({
        where: { is_active: true },
        include: { size: true, color: true },
        orderBy: { name: 'asc' },
        take: 500,
      }),
    ]);

    const lines = sales
      .filter((sale) => !isRegenerated(sale.notes))
      .flatMap((sale) =>
        sale.sale_items.map((item) => {
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
            productId: item.product_id,
            sku: item.product.sku || item.product.code,
            item: itemLabel(item.product),
            unit: item.product.unit?.name || 'Pcs',
            quantity: round2(quantity),
            rate: round2(rate),
            amount: round2(num(item.line_total)),
          };
        }),
      )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
      lines,
      totals: {
        quantity: round2(lines.reduce((sum, line) => sum + line.quantity, 0)),
        amount: round2(lines.reduce((sum, line) => sum + line.amount, 0)),
        count: lines.length,
      },
    };
  }
}
