import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

export { localRange, BUSINESS_TIMEZONE } from '../utils/timezone';
import { localRange } from '../utils/timezone';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

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

export class PurchaseReportService {
  async itemwise(params: {
    from: string;
    to: string;
    mode?: 'vendor' | 'item';
    supplierId?: string;
    productId?: string;
    search?: string;
    branchId?: string;
    /** Paging/filters applied to the merged line list (server side). */
    page?: number;
    limit?: number;
    all?: boolean;
    type?: 'PP' | 'PR';
    q?: string;
    sort?: 'date_desc' | 'date_asc' | 'amount_desc' | 'qty_desc';
    userRole?: string;
    userBranchId?: string | null;
  }) {
    const isAdmin = ADMIN_ROLES.has(params.userRole || '');
    // Admins may narrow to one branch; everyone else is locked to their own.
    const branchId = isAdmin ? params.branchId || undefined : params.userBranchId || undefined;
    const { start, end } = localRange(params.from, params.to);
    const mode = params.mode === 'item' ? 'item' : 'vendor';
    const supplierId = mode === 'vendor' ? params.supplierId : undefined;
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

    const purchaseWhere: Prisma.PurchaseWhereInput = {
      purchase_date: { gte: start, lte: end },
      ...(branchId ? { warehouse_branch_id: branchId } : {}),
      ...(supplierId ? { supplier_id: supplierId } : {}),
      ...(productId ? { product_id: productId } : {}),
      ...(mode === 'item' && !productId && productSearchFilter
        ? { product: productSearchFilter }
        : {}),
    };
    const returnWhere: Prisma.PurchaseReturnWhereInput = {
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

    const [purchases, returns, suppliers, products, branches] = await Promise.all([
      prisma.purchase.findMany({
        where: purchaseWhere,
        include: {
          product: { include: { unit: true, size: true, color: true } },
          supplier: { select: { id: true, name: true, code: true } },
          purchase_order: { select: { po_number: true } },
        },
        orderBy: { purchase_date: 'asc' },
      }),
      prisma.purchaseReturn.findMany({
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
      prisma.supplier.findMany({
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
      // Lean select, no 500 cap, so every active item can be picked.
      prisma.product.findMany({
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
        ? prisma.branch.findMany({
            where: { is_active: true },
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([] as { id: string; name: string; code: string }[]),
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
      ...returns.flatMap((row) =>
        row.items.map((item) => {
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
        }),
      ),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const totalQuantity = round2(lines.reduce((sum, line) => sum + line.quantity, 0));
    const totalAmount = round2(lines.reduce((sum, line) => sum + line.amount, 0));

    // Breakdown + rankings over every line in the period (before table filters).
    type ReportLine = (typeof lines)[number];
    const sumWhere = (type: string, field: 'amount' | 'quantity') =>
      round2(lines.filter((l) => l.type === type).reduce((sum, l) => sum + l[field], 0));
    const rank = (keyOf: (l: ReportLine) => string, nameOf: (l: ReportLine) => string) => {
      const map = new Map<string, { id: string; name: string; quantity: number; amount: number; vouchers: Set<string> }>();
      for (const l of lines) {
        if (l.type !== 'PP') continue;
        const key = keyOf(l);
        const entry = map.get(key) || { id: key, name: nameOf(l), quantity: 0, amount: 0, vouchers: new Set<string>() };
        entry.quantity += l.quantity;
        entry.amount += l.amount;
        entry.vouchers.add(l.voucher);
        map.set(key, entry);
      }
      return [...map.values()]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5)
        .map((e) => ({ id: e.id, name: e.name, quantity: round2(e.quantity), amount: round2(e.amount), vouchers: e.vouchers.size }));
    };
    const breakdown = {
      purchasesAmount: sumWhere('PP', 'amount'),
      purchasesQuantity: sumWhere('PP', 'quantity'),
      returnsAmount: Math.abs(sumWhere('PR', 'amount')),
      returnsQuantity: Math.abs(sumWhere('PR', 'quantity')),
      voucherCount: new Set(lines.map((l) => `${l.type}:${l.voucher}`)).size,
      vendorCount: new Set(lines.map((l) => l.supplierId)).size,
      itemCount: new Set(lines.map((l) => l.productId)).size,
      typeCounts: {
        ALL: lines.length,
        PP: lines.filter((l) => l.type === 'PP').length,
        PR: lines.filter((l) => l.type === 'PR').length,
      },
    };
    const topItems = rank((l) => l.productId, (l) => l.item);
    const topVendors = rank((l) => l.supplierId, (l) => l.supplier);

    // Table filters, sort and paging on the server -- the client only ever
    // receives one page (unless `all` is requested for exports).
    const q = params.q?.trim().toLowerCase();
    let view = lines.filter((l) => {
      if (params.type && l.type !== params.type) return false;
      if (!q) return true;
      return [l.voucher, l.supplier, l.item, l.sku || ''].join(' ').toLowerCase().includes(q);
    });
    const sort = params.sort || 'date_desc';
    view = [...view].sort((a, b) => {
      if (sort === 'date_asc') return new Date(a.date).getTime() - new Date(b.date).getTime();
      if (sort === 'amount_desc') return b.amount - a.amount;
      if (sort === 'qty_desc') return b.quantity - a.quantity;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    const viewTotals = {
      quantity: round2(view.reduce((sum, l) => sum + l.quantity, 0)),
      amount: round2(view.reduce((sum, l) => sum + l.amount, 0)),
      count: view.length,
    };
    const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
    const totalPages = Math.max(1, Math.ceil(view.length / limit));
    const page = Math.min(Math.max(Number(params.page) || 1, 1), totalPages);
    const pageLines = params.all ? view : view.slice((page - 1) * limit, page * limit);

    return {
      period: { from: params.from, to: params.to },
      mode,
      suppliers,
      branches,
      products: products.map((product) => ({
        id: product.id,
        name: itemLabel(product),
        sku: product.sku || product.code,
      })),
      lines: pageLines,
      totals: { quantity: totalQuantity, amount: totalAmount, count: lines.length, ...breakdown },
      viewTotals,
      topItems,
      topVendors,
      pagination: {
        page: params.all ? 1 : page,
        limit: params.all ? view.length : limit,
        total: view.length,
        totalPages: params.all ? 1 : totalPages,
      },
    };
  }
}
