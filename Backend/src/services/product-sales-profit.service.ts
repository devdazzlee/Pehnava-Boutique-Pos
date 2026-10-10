import { Prisma, SaleItemType, SaleStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { localRange } from '../utils/timezone';

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

type Acc = {
  productId: string;
  product: string;
  sku: string;
  category: string;
  purchaseRate: number;
  orderIds: Set<string>;
  grossQty: number;
  returnsQty: number;
  grossSales: number;
  discounts: number;
  returnsValue: number;
  cost: number;
};

const emptyTotals = () => ({
  products: 0,
  orders: 0,
  grossQty: 0,
  returnsQty: 0,
  netQty: 0,
  grossSales: 0,
  discounts: 0,
  returnsValue: 0,
  netSales: 0,
  cost: 0,
  grossProfit: 0,
  remainingQty: 0,
});

export class ProductSalesProfitService {
  async report(params: {
    from: string;
    to: string;
    branchId?: string;
    categoryId?: string;
    productId?: string;
    search?: string;
    userRole?: string;
    userBranchId?: string | null;
  }) {
    const isAdmin = ADMIN_ROLES.has(params.userRole || '');
    const branchId = isAdmin ? params.branchId : params.userBranchId || undefined;
    const { start, end } = localRange(params.from, params.to);
    const search = params.search?.trim();

    const productFilter: Prisma.ProductWhereInput = {
      ...(params.productId ? { id: params.productId } : {}),
      ...(params.categoryId ? { category_id: params.categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const hasProductFilter = Boolean(params.productId || params.categoryId || search);

    const saleWhere: Prisma.SaleWhereInput = {
      sale_date: { gte: start, lte: end },
      status: { in: INCLUDED_STATUSES },
      ...(branchId ? { branch_id: branchId } : {}),
      ...(hasProductFilter ? { sale_items: { some: { product: productFilter } } } : {}),
    };

    const [sales, categories, branches, stockRows] = await Promise.all([
      prisma.sale.findMany({
        where: saleWhere,
        select: {
          id: true,
          notes: true,
          sale_items: {
            where: hasProductFilter ? { product: productFilter } : undefined,
            select: {
              sale_id: true,
              product_id: true,
              quantity: true,
              unit_price: true,
              unit_cost: true,
              discount_amount: true,
              line_total: true,
              item_type: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  code: true,
                  purchase_rate: true,
                  size: { select: { name: true } },
                  color: { select: { name: true } },
                  category: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { sale_date: 'asc' },
      }),
      prisma.category.findMany({
        where: { is_active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      isAdmin
        ? prisma.branch.findMany({
            where: { is_active: true },
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
      prisma.stock.groupBy({
        by: ['product_id'],
        where: branchId ? { branch_id: branchId } : undefined,
        _sum: { current_quantity: true },
      }),
    ]);

    const remainingByProduct = new Map<string, number>();
    for (const row of stockRows) {
      remainingByProduct.set(row.product_id, round2(num(row._sum.current_quantity)));
    }

    const byProduct = new Map<string, Acc>();

    for (const sale of sales) {
      if (isRegenerated(sale.notes)) continue;

      for (const item of sale.sale_items) {
        const productId = item.product_id;
        const qty = num(item.quantity);
        const unitPrice = num(item.unit_price);
        const discount = Math.abs(num(item.discount_amount));
        const lineTotal = num(item.line_total);
        const purchaseRate =
          item.unit_cost != null && Number.isFinite(Number(item.unit_cost))
            ? num(item.unit_cost)
            : num(item.product.purchase_rate);
        const absQty = Math.abs(qty);

        let row = byProduct.get(productId);
        if (!row) {
          row = {
            productId,
            product: itemLabel(item.product),
            sku: item.product.sku || item.product.code || '—',
            category: item.product.category?.name || 'Uncategorized',
            purchaseRate: num(item.product.purchase_rate),
            orderIds: new Set(),
            grossQty: 0,
            returnsQty: 0,
            grossSales: 0,
            discounts: 0,
            returnsValue: 0,
            cost: 0,
          };
          byProduct.set(productId, row);
        }

        // Signed COGS matching financial statement (returns reduce cost)
        row.cost += purchaseRate * qty;

        if (item.item_type === SaleItemType.RETURN || qty < 0 || lineTotal < 0) {
          row.returnsQty += absQty;
          row.returnsValue += Math.abs(lineTotal);
          continue;
        }

        // ORIGINAL + EXCHANGE sell lines
        row.orderIds.add(sale.id);
        row.grossQty += absQty;
        row.grossSales += unitPrice * absQty;
        row.discounts += discount;
      }
    }

    const rows = Array.from(byProduct.values())
      .map((row) => {
        const netQty = round2(row.grossQty - row.returnsQty);
        const grossSales = round2(row.grossSales);
        const discounts = round2(row.discounts);
        const returnsValue = round2(row.returnsValue);
        const netSales = round2(grossSales - discounts - returnsValue);
        const cost = round2(row.cost);
        const grossProfit = round2(netSales - cost);
        const marginPercent = netSales > 0 ? round2((grossProfit / netSales) * 100) : 0;
        const remainingQty = remainingByProduct.get(row.productId) ?? 0;

        return {
          productId: row.productId,
          product: row.product,
          sku: row.sku,
          category: row.category,
          orders: row.orderIds.size,
          grossQty: round2(row.grossQty),
          returnsQty: round2(row.returnsQty),
          netQty,
          remainingQty,
          grossSales,
          discounts,
          returnsValue,
          netSales,
          cost,
          grossProfit,
          marginPercent,
        };
      })
      .sort((a, b) => b.netSales - a.netSales || a.product.localeCompare(b.product));

    const totals = emptyTotals();
    totals.products = rows.length;
    for (const row of rows) {
      totals.orders += row.orders;
      totals.grossQty += row.grossQty;
      totals.returnsQty += row.returnsQty;
      totals.netQty += row.netQty;
      totals.grossSales += row.grossSales;
      totals.discounts += row.discounts;
      totals.returnsValue += row.returnsValue;
      totals.netSales += row.netSales;
      totals.cost += row.cost;
      totals.grossProfit += row.grossProfit;
      totals.remainingQty += row.remainingQty;
    }

    const marginPercent =
      totals.netSales > 0 ? round2((totals.grossProfit / totals.netSales) * 100) : 0;

    return {
      period: { from: params.from, to: params.to },
      branches,
      categories,
      rows,
      totals: {
        ...Object.fromEntries(
          Object.entries(totals).map(([key, value]) => [key, round2(value as number)]),
        ),
        marginPercent,
      },
    };
  }
}
