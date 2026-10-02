import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { asNumber } from '../utils/helpers';
import { toBusinessYmd } from '../utils/timezone';

/**
 * Inventory Reports (Valuation, Purchases, Transfers, Outflow, Low stock,
 * Aging, Movement summary).
 *
 * Every report returns the same envelope so the screen can treat them alike:
 *   rows        – flat, display-ready rows for the current page
 *   summary     – headline numbers for the whole filtered set
 *   breakdown   – grouped views (by branch / category / supplier / type …)
 *   pagination  – page, limit, total, totalPages
 */

export type InventoryReportType =
  | 'valuation'
  | 'purchase'
  | 'transfer'
  | 'stockout'
  | 'lowstock'
  | 'aging'
  | 'movement_summary';

export interface InventoryReportParams {
  type: InventoryReportType;
  branchId?: string;
  categoryId?: string;
  supplierId?: string;
  productId?: string;
  startDate?: Date;
  endDate?: Date;
  q?: string;
  sort?: string;
  status?: string;
  movementType?: string;
  stockStatus?: string;
  ageBucket?: string;
  page?: number;
  limit?: number;
  all?: boolean;
}

type Group = { id: string; name: string; count: number; units: number; value: number; extra?: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;
const OUTFLOW_TYPES = ['SALE', 'DAMAGE', 'LOSS', 'EXPIRED'] as const;

function addGroup(map: Map<string, Group>, id: string, name: string, units: number, value: number, extra = 0) {
  const g = map.get(id) || { id, name, count: 0, units: 0, value: 0, extra: 0 };
  g.count += 1;
  g.units += units;
  g.value += value;
  g.extra = (g.extra || 0) + extra;
  map.set(id, g);
}

function finishGroups(map: Map<string, Group>, by: 'value' | 'units' | 'count' = 'value', take?: number) {
  const list = [...map.values()]
    .map((g) => ({ ...g, units: r2(g.units), value: r2(g.value), extra: r2(g.extra || 0) }))
    .sort((a, b) => b[by] - a[by]);
  return take ? list.slice(0, take) : list;
}

function matches(q: string | undefined, ...parts: (string | null | undefined)[]) {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return parts.some((p) => (p || '').toLowerCase().includes(needle));
}

function paginate<T>(rows: T[], params: InventoryReportParams) {
  const total = rows.length;
  if (params.all) {
    return { rows, pagination: { page: 1, limit: total || 1, total, totalPages: 1 } };
  }
  const limit = Math.min(Math.max(Number(params.limit) || 25, 1), 200);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(Number(params.page) || 1, 1), totalPages);
  return {
    rows: rows.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total, totalPages },
  };
}

function dateRange(params: InventoryReportParams) {
  if (!params.startDate && !params.endDate) return undefined;
  const range: Prisma.DateTimeFilter = {};
  if (params.startDate) range.gte = params.startDate;
  if (params.endDate) range.lte = params.endDate;
  return range;
}

function productWhere(params: InventoryReportParams): Prisma.ProductWhereInput | undefined {
  const where: Prisma.ProductWhereInput = {};
  if (params.categoryId) where.category_id = params.categoryId;
  if (params.supplierId) where.supplier_id = params.supplierId;
  return Object.keys(where).length ? where : undefined;
}

function priceOf(p: { sales_rate_inc_dis_and_tax?: Prisma.Decimal | null; sales_rate_exc_dis_and_tax?: Prisma.Decimal | null }) {
  return asNumber(p.sales_rate_inc_dis_and_tax || 0) || asNumber(p.sales_rate_exc_dis_and_tax || 0);
}

function sortRows<T>(rows: T[], sort: string | undefined, sorters: Record<string, (a: T, b: T) => number>, fallback: string) {
  const fn = sorters[sort || ''] || sorters[fallback];
  return fn ? [...rows].sort(fn) : rows;
}

const productSelect = {
  id: true,
  name: true,
  sku: true,
  code: true,
  purchase_rate: true,
  sales_rate_inc_dis_and_tax: true,
  sales_rate_exc_dis_and_tax: true,
  min_qty: true,
  category: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.ProductSelect;

export class InventoryReportService {
  async getReport(params: InventoryReportParams) {
    switch (params.type) {
      case 'valuation':
        return this.valuation(params);
      case 'purchase':
        return this.purchases(params);
      case 'transfer':
        return this.transfers(params);
      case 'stockout':
        return this.outflow(params);
      case 'lowstock':
        return this.lowStock(params);
      case 'aging':
        return this.aging(params);
      case 'movement_summary':
        return this.movementSummary(params);
      default:
        return { rows: [], summary: {}, breakdown: {}, pagination: { page: 1, limit: 25, total: 0, totalPages: 1 } };
    }
  }

  // ---------------------------------------------------------------- valuation
  private async valuation(params: InventoryReportParams) {
    const stocks = await prisma.stock.findMany({
      where: {
        ...(params.branchId ? { branch_id: params.branchId } : {}),
        ...(params.productId ? { product_id: params.productId } : {}),
        ...(productWhere(params) ? { product: productWhere(params) } : {}),
      },
      select: {
        id: true,
        current_quantity: true,
        minimum_quantity: true,
        last_updated: true,
        branch: { select: { id: true, name: true } },
        product: { select: productSelect },
      },
    });

    let rows = stocks.map((s) => {
      const qty = asNumber(s.current_quantity);
      const unitCost = asNumber(s.product.purchase_rate);
      const unitPrice = priceOf(s.product);
      const costValue = qty * unitCost;
      const retailValue = qty * unitPrice;
      const minQty = asNumber(s.product.min_qty ?? 0) || asNumber(s.minimum_quantity);
      const status = qty < 0 ? 'negative' : qty === 0 ? 'out' : minQty > 0 && qty <= minQty ? 'low' : 'ok';
      return {
        id: s.id,
        productId: s.product.id,
        name: s.product.name,
        sku: s.product.sku || s.product.code || '',
        category: s.product.category?.name || 'Uncategorized',
        categoryId: s.product.category?.id || 'none',
        supplier: s.product.supplier?.name || '',
        branchId: s.branch.id,
        branch: s.branch.name,
        qty: r2(qty),
        minQty,
        unitCost: r2(unitCost),
        unitPrice: r2(unitPrice),
        costValue: r2(costValue),
        retailValue: r2(retailValue),
        potentialProfit: r2(retailValue - costValue),
        margin: unitPrice > 0 ? Math.round(((unitPrice - unitCost) / unitPrice) * 1000) / 10 : 0,
        status,
        lastUpdated: s.last_updated,
      };
    });

    // Summary + breakdown ignore the search box / status chip so the cards stay stable.
    const summaryRows = rows;
    const byBranch = new Map<string, Group>();
    const byCategory = new Map<string, Group>();
    const statusCounts = { ok: 0, low: 0, out: 0, negative: 0 };
    let cost = 0;
    let retail = 0;
    let units = 0;
    for (const r of summaryRows) {
      statusCounts[r.status as keyof typeof statusCounts] += 1;
      if (r.qty <= 0) continue;
      cost += r.costValue;
      retail += r.retailValue;
      units += r.qty;
      addGroup(byBranch, r.branchId, r.branch, r.qty, r.costValue, r.retailValue);
      addGroup(byCategory, r.categoryId, r.category, r.qty, r.costValue, r.retailValue);
    }

    rows = rows.filter(
      (r) =>
        (!params.stockStatus || params.stockStatus === 'all' || r.status === params.stockStatus ||
          (params.stockStatus === 'in_stock' && r.qty > 0)) &&
        matches(params.q, r.name, r.sku, r.branch, r.category, r.supplier),
    );
    rows = sortRows(rows, params.sort, {
      value_desc: (a, b) => b.costValue - a.costValue,
      value_asc: (a, b) => a.costValue - b.costValue,
      retail_desc: (a, b) => b.retailValue - a.retailValue,
      qty_desc: (a, b) => b.qty - a.qty,
      qty_asc: (a, b) => a.qty - b.qty,
      margin_desc: (a, b) => b.margin - a.margin,
      margin_asc: (a, b) => a.margin - b.margin,
      name: (a, b) => a.name.localeCompare(b.name),
    }, 'value_desc');

    const viewTotals = rows.reduce(
      (acc, r) => ({ qty: acc.qty + r.qty, cost: acc.cost + r.costValue, retail: acc.retail + r.retailValue }),
      { qty: 0, cost: 0, retail: 0 },
    );

    const paged = paginate(rows, params);
    return {
      ...paged,
      summary: {
        totalValue: r2(cost),
        retailValue: r2(retail),
        potentialProfit: r2(retail - cost),
        margin: retail > 0 ? Math.round(((retail - cost) / retail) * 1000) / 10 : 0,
        totalUnits: r2(units),
        skuCount: new Set(summaryRows.filter((r) => r.qty > 0).map((r) => r.productId)).size,
        stockRows: summaryRows.length,
        locationsCount: byBranch.size,
        statusCounts,
      },
      viewTotals: { qty: r2(viewTotals.qty), cost: r2(viewTotals.cost), retail: r2(viewTotals.retail) },
      breakdown: {
        byBranch: finishGroups(byBranch),
        byCategory: finishGroups(byCategory),
      },
    };
  }

  // ---------------------------------------------------------------- purchases
  private async purchases(params: InventoryReportParams) {
    const where: Prisma.PurchaseWhereInput = {};
    if (params.branchId) where.warehouse_branch_id = params.branchId;
    if (params.supplierId) where.supplier_id = params.supplierId;
    if (params.productId) where.product_id = params.productId;
    if (params.categoryId) where.product = { category_id: params.categoryId };
    const range = dateRange(params);
    if (range) where.purchase_date = range;

    const purchases = await prisma.purchase.findMany({
      where,
      select: {
        id: true,
        quantity: true,
        cost_price: true,
        sale_price: true,
        purchase_date: true,
        invoice_ref: true,
        bill_group_id: true,
        delivery_status: true,
        notes: true,
        product: { select: { id: true, name: true, sku: true, code: true, category: { select: { id: true, name: true } } } },
        supplier: { select: { id: true, name: true } },
        warehouse_branch: { select: { id: true, name: true } },
        user: { select: { email: true } },
      },
      orderBy: { purchase_date: 'desc' },
    });

    let rows = purchases.map((p) => {
      const qty = asNumber(p.quantity);
      const cost = asNumber(p.cost_price);
      const sale = asNumber(p.sale_price);
      return {
        id: p.id,
        date: p.purchase_date,
        invoiceRef: p.invoice_ref || '',
        billId: p.bill_group_id || p.id,
        productId: p.product.id,
        name: p.product.name,
        sku: p.product.sku || p.product.code || '',
        category: p.product.category?.name || 'Uncategorized',
        categoryId: p.product.category?.id || 'none',
        supplierId: p.supplier.id,
        supplier: p.supplier.name,
        branch: p.warehouse_branch.name,
        qty: r2(qty),
        unitCost: r2(cost),
        salePrice: r2(sale),
        lineTotal: r2(qty * cost),
        expectedMargin: sale > 0 ? Math.round(((sale - cost) / sale) * 1000) / 10 : 0,
        deliveryStatus: p.delivery_status,
        notes: p.notes || '',
        createdBy: p.user?.email || '',
      };
    });

    const bySupplier = new Map<string, Group>();
    const byCategory = new Map<string, Group>();
    const byProduct = new Map<string, Group>();
    const byDay = new Map<string, Group>();
    const bills = new Set<string>();
    let total = 0;
    let units = 0;
    let partial = 0;
    for (const r of rows) {
      total += r.lineTotal;
      units += r.qty;
      bills.add(r.billId);
      if (r.deliveryStatus === 'PARTIAL') partial += 1;
      addGroup(bySupplier, r.supplierId, r.supplier, r.qty, r.lineTotal);
      addGroup(byCategory, r.categoryId, r.category, r.qty, r.lineTotal);
      addGroup(byProduct, r.productId, r.name, r.qty, r.lineTotal);
      const day = toBusinessYmd(new Date(r.date));
      addGroup(byDay, day, day, r.qty, r.lineTotal);
    }

    rows = rows.filter((r) => matches(params.q, r.name, r.sku, r.supplier, r.invoiceRef, r.branch, r.category));
    rows = sortRows(rows, params.sort, {
      date_desc: (a, b) => +new Date(b.date) - +new Date(a.date),
      date_asc: (a, b) => +new Date(a.date) - +new Date(b.date),
      amount_desc: (a, b) => b.lineTotal - a.lineTotal,
      qty_desc: (a, b) => b.qty - a.qty,
      name: (a, b) => a.name.localeCompare(b.name),
    }, 'date_desc');
    const viewTotals = rows.reduce((acc, r) => ({ qty: acc.qty + r.qty, value: acc.value + r.lineTotal }), { qty: 0, value: 0 });

    const paged = paginate(rows, params);
    return {
      ...paged,
      summary: {
        totalCost: r2(total),
        count: purchases.length,
        bills: bills.size,
        units: r2(units),
        suppliers: bySupplier.size,
        avgUnitCost: units > 0 ? r2(total / units) : 0,
        avgBill: bills.size ? r2(total / bills.size) : 0,
        partialCount: partial,
      },
      viewTotals: { qty: r2(viewTotals.qty), value: r2(viewTotals.value) },
      breakdown: {
        bySupplier: finishGroups(bySupplier, 'value', 8),
        byCategory: finishGroups(byCategory, 'value', 8),
        byProduct: finishGroups(byProduct, 'value', 8),
        trend: finishGroups(byDay).sort((a, b) => a.id.localeCompare(b.id)),
      },
    };
  }

  // ---------------------------------------------------------------- transfers
  private async transfers(params: InventoryReportParams) {
    const where: Prisma.TransferWhereInput = {};
    if (params.branchId) where.OR = [{ from_branch_id: params.branchId }, { to_branch_id: params.branchId }];
    if (params.productId) where.product_id = params.productId;
    if (params.categoryId) where.product = { category_id: params.categoryId };
    const range = dateRange(params);
    if (range) where.transfer_date = range;

    const transfers = await prisma.transfer.findMany({
      where,
      select: {
        id: true,
        reference_no: true,
        quantity: true,
        status: true,
        transfer_date: true,
        received_at: true,
        reason: true,
        carrier_name: true,
        receiver_name: true,
        notes: true,
        product: { select: { id: true, name: true, sku: true, code: true, purchase_rate: true } },
        from_branch: { select: { id: true, name: true } },
        to_branch: { select: { id: true, name: true } },
        user: { select: { email: true } },
      },
      orderBy: { transfer_date: 'desc' },
    });

    let rows = transfers.map((t) => {
      const qty = asNumber(t.quantity);
      const leadDays =
        t.status === 'RECEIVED' && t.received_at
          ? Math.max(0, Math.round(((+t.received_at - +t.transfer_date) / DAY) * 10) / 10)
          : null;
      return {
        id: t.id,
        reference: t.reference_no || '',
        date: t.transfer_date,
        receivedAt: t.received_at,
        productId: t.product.id,
        name: t.product.name,
        sku: t.product.sku || t.product.code || '',
        fromId: t.from_branch.id,
        from: t.from_branch.name,
        toId: t.to_branch.id,
        to: t.to_branch.name,
        qty: r2(qty),
        value: r2(qty * asNumber(t.product.purchase_rate)),
        status: t.status,
        reason: t.reason || '',
        carrier: t.carrier_name || '',
        receiver: t.receiver_name || '',
        notes: t.notes || '',
        createdBy: t.user?.email || '',
        leadDays,
        ageDays: Math.floor((Date.now() - +t.transfer_date) / DAY),
      };
    });

    const statusCounts: Record<string, number> = { PENDING: 0, DISPATCHED: 0, RECEIVED: 0, CANCELLED: 0 };
    const byRoute = new Map<string, Group>();
    const byProduct = new Map<string, Group>();
    let units = 0;
    let value = 0;
    let inTransitValue = 0;
    const leads: number[] = [];
    for (const r of rows) {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      if (r.status === 'CANCELLED') continue;
      units += r.qty;
      value += r.value;
      if (r.status === 'PENDING' || r.status === 'DISPATCHED') inTransitValue += r.value;
      if (r.leadDays != null) leads.push(r.leadDays);
      addGroup(byRoute, `${r.fromId}>${r.toId}`, `${r.from} → ${r.to}`, r.qty, r.value);
      addGroup(byProduct, r.productId, r.name, r.qty, r.value);
    }

    rows = rows.filter(
      (r) =>
        (!params.status || params.status === 'all' || r.status === params.status) &&
        matches(params.q, r.name, r.sku, r.reference, r.from, r.to, r.carrier),
    );
    rows = sortRows(rows, params.sort, {
      date_desc: (a, b) => +new Date(b.date) - +new Date(a.date),
      date_asc: (a, b) => +new Date(a.date) - +new Date(b.date),
      qty_desc: (a, b) => b.qty - a.qty,
      value_desc: (a, b) => b.value - a.value,
    }, 'date_desc');
    const viewTotals = rows.reduce((acc, r) => ({ qty: acc.qty + r.qty, value: acc.value + r.value }), { qty: 0, value: 0 });

    const paged = paginate(rows, params);
    return {
      ...paged,
      summary: {
        count: transfers.length,
        units: r2(units),
        value: r2(value),
        inTransitValue: r2(inTransitValue),
        statusCounts,
        avgLeadDays: leads.length ? Math.round((leads.reduce((a, b) => a + b, 0) / leads.length) * 10) / 10 : null,
        // Pending/dispatched for more than 3 days — likely stuck.
        overdue: rows.filter((r) => (r.status === 'PENDING' || r.status === 'DISPATCHED') && r.ageDays > 3).length,
      },
      viewTotals: { qty: r2(viewTotals.qty), value: r2(viewTotals.value) },
      breakdown: {
        byRoute: finishGroups(byRoute, 'units', 8),
        byProduct: finishGroups(byProduct, 'units', 8),
      },
    };
  }

  // ---------------------------------------------------------------- outflow
  private async outflow(params: InventoryReportParams) {
    const where: Prisma.StockMovementWhereInput = { movement_type: { in: [...OUTFLOW_TYPES] } };
    if (params.branchId) where.branch_id = params.branchId;
    if (params.productId) where.product_id = params.productId;
    if (productWhere(params)) where.product = productWhere(params);
    const range = dateRange(params);
    if (range) where.created_at = range;

    const movements = await prisma.stockMovement.findMany({
      where,
      select: {
        id: true,
        movement_type: true,
        quantity_change: true,
        unit_cost: true,
        reference_type: true,
        reference_id: true,
        notes: true,
        created_at: true,
        previous_qty: true,
        new_qty: true,
        branch: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, sku: true, code: true, purchase_rate: true, category: { select: { id: true, name: true } } } },
        user: { select: { email: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    let rows = movements.map((m) => {
      const qty = Math.abs(asNumber(m.quantity_change));
      const unitCost = asNumber(m.unit_cost ?? 0) || asNumber(m.product.purchase_rate);
      return {
        id: m.id,
        date: m.created_at,
        type: m.movement_type,
        productId: m.product.id,
        name: m.product.name,
        sku: m.product.sku || m.product.code || '',
        category: m.product.category?.name || 'Uncategorized',
        branchId: m.branch.id,
        branch: m.branch.name,
        qty: r2(qty),
        unitCost: r2(unitCost),
        costValue: r2(qty * unitCost),
        before: r2(asNumber(m.previous_qty)),
        after: r2(asNumber(m.new_qty)),
        reference: m.reference_type ? `${m.reference_type}${m.reference_id ? ` · ${m.reference_id.slice(0, 8)}` : ''}` : '',
        notes: m.notes || '',
        createdBy: m.user?.email || '',
      };
    });

    const byType = new Map<string, Group>();
    for (const t of OUTFLOW_TYPES) byType.set(t, { id: t, name: t, count: 0, units: 0, value: 0, extra: 0 });
    const byProduct = new Map<string, Group>();
    const byBranch = new Map<string, Group>();
    const byDay = new Map<string, Group>();
    let units = 0;
    let value = 0;
    let shrinkUnits = 0;
    let shrinkValue = 0;
    for (const r of rows) {
      units += r.qty;
      value += r.costValue;
      if (r.type !== 'SALE') {
        shrinkUnits += r.qty;
        shrinkValue += r.costValue;
        addGroup(byProduct, r.productId, r.name, r.qty, r.costValue);
      }
      addGroup(byType, r.type, r.type, r.qty, r.costValue);
      addGroup(byBranch, r.branchId, r.branch, r.qty, r.costValue);
      const day = toBusinessYmd(new Date(r.date));
      addGroup(byDay, day, day, r.qty, r.costValue, r.type === 'SALE' ? 0 : r.qty);
    }

    rows = rows.filter(
      (r) =>
        (!params.movementType || params.movementType === 'all' ||
          (params.movementType === 'shrinkage' ? r.type !== 'SALE' : r.type === params.movementType)) &&
        matches(params.q, r.name, r.sku, r.branch, r.notes, r.category),
    );
    rows = sortRows(rows, params.sort, {
      date_desc: (a, b) => +new Date(b.date) - +new Date(a.date),
      date_asc: (a, b) => +new Date(a.date) - +new Date(b.date),
      qty_desc: (a, b) => b.qty - a.qty,
      value_desc: (a, b) => b.costValue - a.costValue,
    }, 'date_desc');
    const viewTotals = rows.reduce((acc, r) => ({ qty: acc.qty + r.qty, value: acc.value + r.costValue }), { qty: 0, value: 0 });

    const paged = paginate(rows, params);
    return {
      ...paged,
      summary: {
        count: movements.length,
        totalQty: r2(units),
        totalValue: r2(value),
        shrinkUnits: r2(shrinkUnits),
        shrinkValue: r2(shrinkValue),
        shrinkRate: units > 0 ? Math.round((shrinkUnits / units) * 1000) / 10 : 0,
        damageCount: byType.get('DAMAGE')?.count || 0,
      },
      viewTotals: { qty: r2(viewTotals.qty), value: r2(viewTotals.value) },
      breakdown: {
        byType: [...byType.values()].map((g) => ({ ...g, units: r2(g.units), value: r2(g.value) })),
        byBranch: finishGroups(byBranch, 'units'),
        topShrinkage: finishGroups(byProduct, 'value', 8),
        trend: finishGroups(byDay).sort((a, b) => a.id.localeCompare(b.id)),
      },
    };
  }

  // ---------------------------------------------------------------- low stock
  private async lowStock(params: InventoryReportParams) {
    const since = new Date(Date.now() - 30 * DAY);
    const [stocks, sales] = await Promise.all([
      prisma.stock.findMany({
        where: {
          ...(params.branchId ? { branch_id: params.branchId } : {}),
          ...(params.productId ? { product_id: params.productId } : {}),
          product: { is_active: true, ...(productWhere(params) || {}) },
        },
        select: {
          id: true,
          current_quantity: true,
          minimum_quantity: true,
          reorder_level: true,
          maximum_quantity: true,
          branch: { select: { id: true, name: true } },
          product: { select: productSelect },
        },
      }),
      // Selling speed over the last 30 days, per product + branch.
      prisma.stockMovement.groupBy({
        by: ['product_id', 'branch_id'],
        where: {
          movement_type: 'SALE',
          created_at: { gte: since },
          ...(params.branchId ? { branch_id: params.branchId } : {}),
        },
        _sum: { quantity_change: true },
      }),
    ]);

    const soldMap = new Map<string, number>();
    for (const s of sales) soldMap.set(`${s.product_id}|${s.branch_id}`, Math.abs(asNumber(s._sum.quantity_change)));

    const alerts = stocks
      .map((s) => {
        const qty = asNumber(s.current_quantity);
        const minQty = asNumber(s.product.min_qty ?? 0) || asNumber(s.minimum_quantity) || asNumber(s.reorder_level ?? 0);
        if (minQty <= 0 || qty > minQty) return null;
        const sold30 = soldMap.get(`${s.product.id}|${s.branch.id}`) || 0;
        const perDay = sold30 / 30;
        const maxQty = asNumber(s.maximum_quantity ?? 0);
        // Refill to max when set, otherwise to twice the minimum (or a month of sales, whichever is more).
        const target = maxQty > 0 ? maxQty : Math.max(minQty * 2, Math.ceil(perDay * 30));
        const reorderQty = Math.max(0, Math.ceil(target - Math.max(0, qty)));
        const unitCost = asNumber(s.product.purchase_rate);
        const status = qty <= 0 ? 'out' : qty <= minQty / 2 ? 'critical' : 'low';
        return {
          id: s.id,
          productId: s.product.id,
          name: s.product.name,
          sku: s.product.sku || s.product.code || '',
          category: s.product.category?.name || 'Uncategorized',
          supplierId: s.product.supplier?.id || 'none',
          supplier: s.product.supplier?.name || 'No supplier',
          branchId: s.branch.id,
          branch: s.branch.name,
          qty: r2(qty),
          minQty,
          shortfall: r2(Math.max(0, minQty - qty)),
          sold30: r2(sold30),
          perDay: r2(perDay),
          daysLeft: perDay > 0 ? Math.max(0, Math.floor(Math.max(0, qty) / perDay)) : null,
          reorderQty,
          unitCost: r2(unitCost),
          reorderCost: r2(reorderQty * unitCost),
          status,
        };
      })
      .filter(Boolean) as NonNullable<any>[];

    const statusCounts = { out: 0, critical: 0, low: 0 };
    const bySupplier = new Map<string, Group>();
    const byBranch = new Map<string, Group>();
    let reorderUnits = 0;
    let reorderCost = 0;
    for (const a of alerts) {
      statusCounts[a.status as keyof typeof statusCounts] += 1;
      reorderUnits += a.reorderQty;
      reorderCost += a.reorderCost;
      addGroup(bySupplier, a.supplierId, a.supplier, a.reorderQty, a.reorderCost);
      addGroup(byBranch, a.branchId, a.branch, a.reorderQty, a.reorderCost);
    }

    const rank: Record<string, number> = { out: 0, critical: 1, low: 2 };
    let rows = alerts.filter(
      (r: any) =>
        (!params.stockStatus || params.stockStatus === 'all' || r.status === params.stockStatus) &&
        matches(params.q, r.name, r.sku, r.branch, r.supplier, r.category),
    );
    rows = sortRows(rows, params.sort, {
      urgency: (a: any, b: any) => rank[a.status] - rank[b.status] || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) || b.shortfall - a.shortfall,
      shortfall_desc: (a: any, b: any) => b.shortfall - a.shortfall,
      days_asc: (a: any, b: any) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999),
      cost_desc: (a: any, b: any) => b.reorderCost - a.reorderCost,
      name: (a: any, b: any) => a.name.localeCompare(b.name),
    }, 'urgency');

    const paged = paginate(rows, params);
    return {
      ...paged,
      summary: {
        warningCount: alerts.length,
        criticalCount: statusCounts.out,
        statusCounts,
        reorderUnits: r2(reorderUnits),
        reorderCost: r2(reorderCost),
        runningOutThisWeek: alerts.filter((a: any) => a.daysLeft != null && a.daysLeft <= 7 && a.qty > 0).length,
      },
      breakdown: {
        bySupplier: finishGroups(bySupplier, 'value'),
        byBranch: finishGroups(byBranch, 'count'),
      },
    };
  }

  // ---------------------------------------------------------------- aging
  private async aging(params: InventoryReportParams) {
    const stockWhere: Prisma.StockWhereInput = {
      current_quantity: { gt: 0 },
      ...(params.branchId ? { branch_id: params.branchId } : {}),
      ...(params.productId ? { product_id: params.productId } : {}),
      ...(productWhere(params) ? { product: productWhere(params) } : {}),
    };
    const moveWhere: Prisma.StockMovementWhereInput = params.branchId ? { branch_id: params.branchId } : {};

    // Two grouped queries replace the old one-query-per-stock-row loop.
    const [stocks, lastMoves, lastSales, lastIns] = await Promise.all([
      prisma.stock.findMany({
        where: stockWhere,
        select: {
          id: true,
          current_quantity: true,
          created_at: true,
          last_updated: true,
          branch: { select: { id: true, name: true } },
          product: { select: productSelect },
        },
      }),
      prisma.stockMovement.groupBy({ by: ['product_id', 'branch_id'], where: moveWhere, _max: { created_at: true } }),
      prisma.stockMovement.groupBy({ by: ['product_id', 'branch_id'], where: { ...moveWhere, movement_type: 'SALE' }, _max: { created_at: true } }),
      prisma.stockMovement.groupBy({
        by: ['product_id', 'branch_id'],
        where: { ...moveWhere, movement_type: { in: ['PURCHASE', 'TRANSFER_IN', 'RETURN'] } },
        _max: { created_at: true },
      }),
    ]);
    const key = (p: string, b: string) => `${p}|${b}`;
    const toMap = (list: { product_id: string; branch_id: string; _max: { created_at: Date | null } }[]) =>
      new Map(list.map((m) => [key(m.product_id, m.branch_id), m._max.created_at]));
    const moveMap = toMap(lastMoves);
    const saleMap = toMap(lastSales);
    const inMap = toMap(lastIns);

    const now = Date.now();
    const bucketOf = (d: number) => (d <= 30 ? '0-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : d <= 180 ? '91-180' : '180+');

    let rows = stocks.map((s) => {
      const k = key(s.product.id, s.branch.id);
      const lastSale = saleMap.get(k) || null;
      const lastIn = inMap.get(k) || null;
      const lastMove = moveMap.get(k) || s.last_updated;
      // Age = days since it last sold; if it never sold, since stock first arrived.
      const since = lastSale || lastIn || s.created_at;
      const daysIdle = Math.max(0, Math.floor((now - +since) / DAY));
      const qty = asNumber(s.current_quantity);
      const unitCost = asNumber(s.product.purchase_rate);
      return {
        id: s.id,
        productId: s.product.id,
        name: s.product.name,
        sku: s.product.sku || s.product.code || '',
        category: s.product.category?.name || 'Uncategorized',
        branchId: s.branch.id,
        branch: s.branch.name,
        qty: r2(qty),
        unitCost: r2(unitCost),
        value: r2(qty * unitCost),
        retailValue: r2(qty * priceOf(s.product)),
        lastSale,
        lastIn,
        lastMovement: lastMove,
        neverSold: !lastSale,
        daysIdle,
        bucket: bucketOf(daysIdle),
      };
    });

    const buckets = ['0-30', '31-60', '61-90', '91-180', '180+'].map((b) => ({ id: b, name: `${b} days`, count: 0, units: 0, value: 0 }));
    let totalValue = 0;
    let weighted = 0;
    let deadValue = 0;
    let deadCount = 0;
    for (const r of rows) {
      const b = buckets.find((x) => x.id === r.bucket)!;
      b.count += 1;
      b.units += r.qty;
      b.value += r.value;
      totalValue += r.value;
      weighted += r.daysIdle * r.value;
      if (r.daysIdle > 90) {
        deadCount += 1;
        deadValue += r.value;
      }
    }

    rows = rows.filter(
      (r) =>
        (!params.ageBucket || params.ageBucket === 'all' || r.bucket === params.ageBucket ||
          (params.ageBucket === 'never' && r.neverSold)) &&
        matches(params.q, r.name, r.sku, r.branch, r.category),
    );
    rows = sortRows(rows, params.sort, {
      days_desc: (a, b) => b.daysIdle - a.daysIdle,
      days_asc: (a, b) => a.daysIdle - b.daysIdle,
      value_desc: (a, b) => b.value - a.value,
      qty_desc: (a, b) => b.qty - a.qty,
      name: (a, b) => a.name.localeCompare(b.name),
    }, 'days_desc');

    const all = stocks.length;
    const paged = paginate(rows, params);
    return {
      ...paged,
      summary: {
        avgAge: all ? Math.round(rows.reduce((a, r) => a + r.daysIdle, 0) / Math.max(1, rows.length)) : 0,
        weightedAge: totalValue > 0 ? Math.round(weighted / totalValue) : 0,
        deadStockCount: deadCount,
        deadStockValue: r2(deadValue),
        deadShare: totalValue > 0 ? Math.round((deadValue / totalValue) * 1000) / 10 : 0,
        neverSold: buckets.length ? stocks.filter((s) => !saleMap.get(key(s.product.id, s.branch.id))).length : 0,
        totalValue: r2(totalValue),
        items: all,
      },
      breakdown: {
        buckets: buckets.map((b) => ({ ...b, units: r2(b.units), value: r2(b.value) })),
      },
    };
  }

  // ---------------------------------------------------------------- movement summary
  private async movementSummary(params: InventoryReportParams) {
    const where: Prisma.StockMovementWhereInput = {};
    if (params.branchId) where.branch_id = params.branchId;
    if (params.productId) where.product_id = params.productId;
    if (productWhere(params)) where.product = productWhere(params);
    const range = dateRange(params);
    if (range) where.created_at = range;

    const movements = await prisma.stockMovement.findMany({
      where,
      select: {
        movement_type: true,
        quantity_change: true,
        unit_cost: true,
        created_at: true,
        product_id: true,
        branch: { select: { id: true, name: true } },
        product: { select: { name: true, purchase_rate: true } },
      },
    });

    type TypeRow = { type: string; count: number; unitsIn: number; unitsOut: number; net: number; value: number; lastAt: Date | null };
    const byType = new Map<string, TypeRow>();
    const byBranch = new Map<string, { id: string; name: string; in: number; out: number; count: number }>();
    const byDay = new Map<string, { date: string; in: number; out: number; count: number }>();
    const byProduct = new Map<string, Group>();
    let totalIn = 0;
    let totalOut = 0;
    for (const m of movements) {
      const change = asNumber(m.quantity_change);
      const unit = asNumber(m.unit_cost ?? 0) || asNumber(m.product.purchase_rate);
      const value = Math.abs(change) * unit;
      const t = byType.get(m.movement_type) || { type: m.movement_type, count: 0, unitsIn: 0, unitsOut: 0, net: 0, value: 0, lastAt: null };
      t.count += 1;
      if (change >= 0) t.unitsIn += change;
      else t.unitsOut += -change;
      t.net += change;
      t.value += value;
      if (!t.lastAt || m.created_at > t.lastAt) t.lastAt = m.created_at;
      byType.set(m.movement_type, t);

      const b = byBranch.get(m.branch.id) || { id: m.branch.id, name: m.branch.name, in: 0, out: 0, count: 0 };
      b.count += 1;
      if (change >= 0) b.in += change;
      else b.out += -change;
      byBranch.set(m.branch.id, b);

      const dayKey = toBusinessYmd(m.created_at);
      const d = byDay.get(dayKey) || { date: dayKey, in: 0, out: 0, count: 0 };
      d.count += 1;
      if (change >= 0) d.in += change;
      else d.out += -change;
      byDay.set(dayKey, d);

      addGroup(byProduct, m.product_id, m.product.name, Math.abs(change), value);
      if (change >= 0) totalIn += change;
      else totalOut += -change;
    }

    let rows = [...byType.values()].map((t) => ({
      id: t.type,
      type: t.type,
      count: t.count,
      unitsIn: r2(t.unitsIn),
      unitsOut: r2(t.unitsOut),
      net: r2(t.net),
      value: r2(t.value),
      share: movements.length ? Math.round((t.count / movements.length) * 1000) / 10 : 0,
      lastAt: t.lastAt,
    }));
    rows = rows.filter((r) => matches(params.q, r.type, r.type.replace(/_/g, ' ')));
    rows = sortRows(rows, params.sort, {
      count_desc: (a, b) => b.count - a.count,
      value_desc: (a, b) => b.value - a.value,
      net_desc: (a, b) => b.net - a.net,
    }, 'count_desc');

    const paged = paginate(rows, params);
    return {
      ...paged,
      summary: {
        totalMovements: movements.length,
        unitsIn: r2(totalIn),
        unitsOut: r2(totalOut),
        net: r2(totalIn - totalOut),
        activeProducts: byProduct.size,
        types: byType.size,
      },
      breakdown: {
        byBranch: [...byBranch.values()].map((b) => ({ ...b, in: r2(b.in), out: r2(b.out) })).sort((a, b) => b.count - a.count),
        trend: [...byDay.values()].map((d) => ({ ...d, in: r2(d.in), out: r2(d.out) })).sort((a, b) => a.date.localeCompare(b.date)),
        topProducts: finishGroups(byProduct, 'units', 8),
      },
    };
  }
}
