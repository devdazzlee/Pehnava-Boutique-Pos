import { SaleStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { businessTodayYmd, localRange, shiftBusinessYmd, toBusinessYmd } from '../utils/timezone';
import { SUPPLIER_CASH_TYPES, supplierAging, supplierEffect } from './supplier-accounts.service';

/* ============================================================
 * Business insight reports: sales by attribute, slow movers,
 * customer segments, supplier performance & purchase prices,
 * payables aging, cash flow with cash / bank books, and tax.
 * ============================================================ */

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const isRegenerated = (notes?: string | null) => {
  const text = (notes || '').toLowerCase();
  return text.includes('[regenerated]') || text.includes('regenerated bill');
};
const SOLD = { notIn: [SaleStatus.CANCELLED, SaleStatus.PENDING] };
const DAY = 86_400_000;

export type Range = { from: string; to: string; branchId?: string };
export type SalesDimension = 'category' | 'subcategory' | 'brand' | 'color' | 'size' | 'collection' | 'supplier' | 'product';

const BOOK_OF: Record<string, 'cash' | 'bank' | null> = {
  CASH: 'cash',
  CARD: 'bank',
  BANK_TRANSFER: 'bank',
  BANK: 'bank',
  MOBILE_MONEY: 'bank',
  ONLINE: 'bank',
  CHEQUE: 'bank',
  CREDIT: null,
  GIFT_CARD: null, // spending a gift card moves no money; selling one does (below)
  OTHER: 'cash',
};
const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  BANK: 'Bank',
  MOBILE_MONEY: 'Wallet',
  ONLINE: 'Online',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
};

export class AnalyticsService {
  /* ------------------------------ sales by attribute ------------------------------ */

  async salesBy(dimension: SalesDimension, range: Range) {
    const { start, end } = localRange(range.from, range.to);
    const items = await prisma.saleItem.findMany({
      where: {
        sale: { sale_date: { gte: start, lte: end }, status: SOLD, ...(range.branchId ? { branch_id: range.branchId } : {}) },
      },
      select: {
        quantity: true,
        line_total: true,
        item_type: true,
        sale: { select: { id: true, notes: true, discount_amount: true, subtotal: true } },
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            purchase_rate: true,
            collection: true,
            category: { select: { id: true, name: true } },
            subcategory: { select: { id: true, name: true } },
            brand: { select: { id: true, name: true } },
            color: { select: { id: true, name: true } },
            size: { select: { id: true, name: true } },
            supplier: { select: { id: true, name: true } },
          },
        },
      },
    });

    type Row = { key: string; label: string; qty: number; returnedQty: number; revenue: number; cost: number; bills: Set<string>; products: Set<string> };
    const rows = new Map<string, Row>();
    const keyOf = (p: (typeof items)[number]['product']): [string, string] => {
      switch (dimension) {
        case 'category':
          return [p.category?.id ?? 'none', p.category?.name ?? 'Uncategorised'];
        case 'subcategory':
          return [p.subcategory?.id ?? 'none', p.subcategory?.name ?? 'No sub-category'];
        case 'brand':
          return [p.brand?.id ?? 'none', p.brand?.name ?? 'No brand'];
        case 'color':
          return [p.color?.id ?? 'none', p.color?.name ?? 'No colour'];
        case 'size':
          return [p.size?.id ?? 'none', p.size?.name ?? 'No size'];
        case 'collection':
          return [p.collection?.trim().toLowerCase() || 'none', p.collection?.trim() || 'No collection'];
        case 'supplier':
          return [p.supplier?.id ?? 'none', p.supplier?.name ?? 'No supplier'];
        default:
          return [p.id, `${p.name}${p.sku ? ` (${p.sku})` : ''}`];
      }
    };

    for (const it of items) {
      if (isRegenerated(it.sale.notes)) continue;
      const [key, label] = keyOf(it.product);
      let row = rows.get(key);
      if (!row) {
        row = { key, label, qty: 0, returnedQty: 0, revenue: 0, cost: 0, bills: new Set(), products: new Set() };
        rows.set(key, row);
      }
      const qty = num(it.quantity);
      const line = num(it.line_total);
      // Bill-level discount is spread over the lines by value.
      const subtotal = num(it.sale.subtotal);
      const billDisc = subtotal > 0 ? (num(it.sale.discount_amount) * line) / subtotal : 0;
      const isReturn = it.item_type === 'RETURN' || qty < 0 || line < 0;
      const q = isReturn ? -Math.abs(qty) : qty;
      if (isReturn) row.returnedQty += Math.abs(qty);
      else row.qty += qty;
      row.revenue += line - billDisc;
      row.cost += num(it.product.purchase_rate) * q;
      row.bills.add(it.sale.id);
      row.products.add(it.product.id);
    }

    const totalRevenue = [...rows.values()].reduce((t, r) => t + r.revenue, 0);
    const out = [...rows.values()]
      .map((r) => ({
        key: r.key,
        label: r.label,
        qty: r2(r.qty),
        returnedQty: r2(r.returnedQty),
        netQty: r2(r.qty - r.returnedQty),
        revenue: r2(r.revenue),
        cost: r2(r.cost),
        profit: r2(r.revenue - r.cost),
        margin: r.revenue > 0 ? r2(((r.revenue - r.cost) / r.revenue) * 100) : 0,
        bills: r.bills.size,
        products: r.products.size,
        share: totalRevenue > 0 ? r2((r.revenue / totalRevenue) * 100) : 0,
        returnRate: r.qty > 0 ? r2((r.returnedQty / r.qty) * 100) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      dimension,
      period: range,
      rows: out,
      totals: {
        qty: r2(out.reduce((t, r) => t + r.netQty, 0)),
        revenue: r2(totalRevenue),
        cost: r2(out.reduce((t, r) => t + r.cost, 0)),
        profit: r2(out.reduce((t, r) => t + r.profit, 0)),
      },
    };
  }

  /* ------------------------------ slow movers ------------------------------ */

  async slowMovers(q: { days: number; branchId?: string; maxSold?: number }) {
    const days = Math.max(7, Math.min(365, q.days || 60));
    const since = new Date(Date.now() - days * DAY);
    const stocks = await prisma.stock.findMany({
      where: { current_quantity: { gt: 0 }, ...(q.branchId ? { branch_id: q.branchId } : {}), product: { is_active: true, non_inventory_item: false } },
      select: {
        current_quantity: true,
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            purchase_rate: true,
            sales_rate_inc_dis_and_tax: true,
            created_at: true,
            collection: true,
            category: { select: { name: true } },
            brand: { select: { name: true } },
            size: { select: { name: true } },
            color: { select: { name: true } },
          },
        },
      },
    });
    const byProduct = new Map<string, { product: (typeof stocks)[number]['product']; stock: number }>();
    for (const s of stocks) {
      const row = byProduct.get(s.product.id) ?? { product: s.product, stock: 0 };
      row.stock += num(s.current_quantity);
      byProduct.set(s.product.id, row);
    }
    const ids = [...byProduct.keys()];
    if (!ids.length) return { days, rows: [], totals: { products: 0, dead: 0, slow: 0, stockValue: 0, retailValue: 0 } };

    const saleWhere = { status: SOLD, ...(q.branchId ? { branch_id: q.branchId } : {}) };
    const [recent, lastSold, lastPurchased] = await Promise.all([
      prisma.saleItem.groupBy({
        by: ['product_id'],
        where: { product_id: { in: ids }, item_type: { not: 'RETURN' }, sale: { ...saleWhere, sale_date: { gte: since } } },
        _sum: { quantity: true },
      }),
      prisma.saleItem.groupBy({
        by: ['product_id'],
        where: { product_id: { in: ids }, item_type: { not: 'RETURN' }, sale: saleWhere },
        _max: { created_at: true },
      }),
      prisma.purchase.groupBy({ by: ['product_id'], where: { product_id: { in: ids } }, _max: { purchase_date: true } }),
    ]);
    const soldMap = new Map(recent.map((r) => [r.product_id, num(r._sum.quantity)]));
    const lastMap = new Map(lastSold.map((r) => [r.product_id, r._max.created_at]));
    const purchMap = new Map(lastPurchased.map((r) => [r.product_id, r._max.purchase_date]));
    const maxSold = q.maxSold ?? 2;

    const rows = [...byProduct.values()]
      .map(({ product: p, stock }) => {
        const sold = soldMap.get(p.id) ?? 0;
        const last = lastMap.get(p.id) ?? null;
        const ref = last ?? purchMap.get(p.id) ?? p.created_at;
        const idleDays = Math.floor((Date.now() - new Date(ref).getTime()) / DAY);
        const coverDays = sold > 0 ? Math.round((stock / sold) * days) : null;
        return {
          productId: p.id,
          name: p.name,
          sku: p.sku,
          category: p.category?.name ?? null,
          brand: p.brand?.name ?? null,
          size: p.size?.name ?? null,
          color: p.color?.name ?? null,
          collection: p.collection,
          stock: r2(stock),
          soldInPeriod: r2(sold),
          lastSoldAt: last,
          lastPurchasedAt: purchMap.get(p.id) ?? null,
          idleDays,
          coverDays,
          stockValue: r2(stock * num(p.purchase_rate)),
          retailValue: r2(stock * num(p.sales_rate_inc_dis_and_tax)),
          status: sold === 0 ? ('DEAD' as const) : ('SLOW' as const),
        };
      })
      .filter((r) => r.soldInPeriod <= maxSold)
      .sort((a, b) => b.stockValue - a.stockValue);

    return {
      days,
      rows,
      totals: {
        products: rows.length,
        dead: rows.filter((r) => r.status === 'DEAD').length,
        slow: rows.filter((r) => r.status === 'SLOW').length,
        stockValue: r2(rows.reduce((t, r) => t + r.stockValue, 0)),
        retailValue: r2(rows.reduce((t, r) => t + r.retailValue, 0)),
      },
    };
  }

  /* ------------------------------ customer segments ------------------------------ */

  async customerSegments(range: Range & { inactiveDays?: number }) {
    const { start, end } = localRange(range.from, range.to);
    const inactiveDays = Math.max(15, range.inactiveDays || 90);
    const sales = await prisma.sale.findMany({
      where: { customer_id: { not: null }, status: SOLD, ...(range.branchId ? { branch_id: range.branchId } : {}) },
      select: { customer_id: true, sale_date: true, total_amount: true, notes: true, original_sale_id: true },
    });
    const customers = await prisma.customer.findMany({
      select: { id: true, name: true, phone_number: true, mobile_number: true, created_at: true },
    });
    const info = new Map(customers.map((c) => [c.id, c]));

    type Agg = { first: Date; last: Date; lifetime: number; lifeBills: number; periodSpend: number; periodBills: number };
    const agg = new Map<string, Agg>();
    for (const s of sales) {
      if (!s.customer_id || isRegenerated(s.notes)) continue;
      const a = agg.get(s.customer_id) ?? { first: s.sale_date, last: s.sale_date, lifetime: 0, lifeBills: 0, periodSpend: 0, periodBills: 0 };
      const amt = num(s.total_amount);
      if (s.sale_date < a.first) a.first = s.sale_date;
      if (s.sale_date > a.last) a.last = s.sale_date;
      a.lifetime += amt;
      if (!s.original_sale_id) a.lifeBills += 1;
      if (s.sale_date >= start && s.sale_date <= end) {
        a.periodSpend += amt;
        if (!s.original_sale_id) a.periodBills += 1;
      }
      agg.set(s.customer_id, a);
    }

    const row = (id: string, a: Agg) => {
      const c = info.get(id);
      return {
        id,
        name: c?.name || 'Unnamed customer',
        phone: c?.mobile_number || c?.phone_number || null,
        firstPurchase: a.first,
        lastPurchase: a.last,
        lifetimeSpend: r2(a.lifetime),
        lifetimeBills: a.lifeBills,
        periodSpend: r2(a.periodSpend),
        periodBills: a.periodBills,
        avgBill: a.lifeBills ? r2(a.lifetime / a.lifeBills) : 0,
        daysSinceLast: Math.floor((Date.now() - a.last.getTime()) / DAY),
      };
    };
    const all = [...agg.entries()].map(([id, a]) => ({ ...row(id, a), _a: a }));
    const strip = <T extends { _a: Agg }>(r: T) => {
      const { _a, ...rest } = r;
      void _a;
      return rest;
    };

    const active = all.filter((r) => r._a.periodBills > 0);
    const top = [...active].sort((a, b) => b.periodSpend - a.periodSpend).slice(0, 50).map(strip);
    const fresh = active.filter((r) => r._a.first >= start).sort((a, b) => b.periodSpend - a.periodSpend).map(strip);
    const repeat = active.filter((r) => r._a.first < start || r._a.periodBills >= 2).sort((a, b) => b.periodBills - a.periodBills).map(strip);
    const inactiveCut = Date.now() - inactiveDays * DAY;
    const inactive = all.filter((r) => r._a.last.getTime() < inactiveCut).sort((a, b) => b.lifetimeSpend - a.lifetimeSpend).map(strip);
    const periodRevenue = active.reduce((t, r) => t + r.periodSpend, 0);
    const top10Revenue = top.slice(0, 10).reduce((t, r) => t + r.periodSpend, 0);

    return {
      period: range,
      inactiveDays,
      summary: {
        customersWithPurchases: agg.size,
        activeInPeriod: active.length,
        newInPeriod: fresh.length,
        repeatInPeriod: repeat.length,
        inactive: inactive.length,
        repeatRate: active.length ? r2((repeat.length / active.length) * 100) : 0,
        periodRevenue: r2(periodRevenue),
        top10Share: periodRevenue > 0 ? r2((top10Revenue / periodRevenue) * 100) : 0,
        avgSpend: active.length ? r2(periodRevenue / active.length) : 0,
      },
      top,
      new: fresh,
      repeat,
      inactive,
    };
  }

  /* ------------------------------ suppliers ------------------------------ */

  async supplierPerformance(range: Range) {
    const { start, end } = localRange(range.from, range.to);
    const [suppliers, purchases, returns, payments, invoices] = await Promise.all([
      prisma.supplier.findMany({ select: { id: true, name: true, code: true, is_active: true } }),
      prisma.purchase.findMany({
        where: { purchase_date: { gte: start, lte: end }, ...(range.branchId ? { warehouse_branch_id: range.branchId } : {}) },
        select: { supplier_id: true, product_id: true, quantity: true, cost_price: true, purchase_date: true, bill_group_id: true, invoice_ref: true, id: true },
      }),
      prisma.purchaseReturn.findMany({
        where: { return_date: { gte: start, lte: end }, status: 'COMPLETED', ...(range.branchId ? { branch_id: range.branchId } : {}) },
        select: { supplier_id: true, total_amount: true },
      }),
      prisma.supplierPayment.findMany({ where: { payment_date: { gte: start, lte: end }, type: { in: [...SUPPLIER_CASH_TYPES] } }, select: { supplier_id: true, amount: true, type: true } }),
      prisma.purchaseInvoice.findMany({
        where: { invoice_date: { gte: start, lte: end } },
        select: { supplier_id: true, due_date: true, status: true, total_amount: true, amount_paid: true },
      }),
    ]);

    const productIds = [...new Set(purchases.map((p) => p.product_id))];
    const sold = productIds.length
      ? await prisma.saleItem.groupBy({
          by: ['product_id'],
          where: { product_id: { in: productIds }, item_type: { not: 'RETURN' }, sale: { status: SOLD, sale_date: { gte: start } } },
          _sum: { quantity: true, line_total: true },
        })
      : [];
    const soldMap = new Map(sold.map((s) => [s.product_id, { qty: num(s._sum.quantity), revenue: num(s._sum.line_total) }]));

    type Row = {
      purchased: number;
      qty: number;
      bills: Set<string>;
      products: Set<string>;
      returned: number;
      paid: number;
      last: Date | null;
      overdue: number;
    };
    const rows = new Map<string, Row>();
    const ensure = (id: string) => {
      let r = rows.get(id);
      if (!r) {
        r = { purchased: 0, qty: 0, bills: new Set(), products: new Set(), returned: 0, paid: 0, last: null, overdue: 0 };
        rows.set(id, r);
      }
      return r;
    };
    for (const p of purchases) {
      const r = ensure(p.supplier_id);
      r.purchased += num(p.quantity) * num(p.cost_price);
      r.qty += num(p.quantity);
      r.bills.add(p.bill_group_id || p.invoice_ref || p.id);
      r.products.add(p.product_id);
      if (!r.last || p.purchase_date > r.last) r.last = p.purchase_date;
    }
    for (const x of returns) ensure(x.supplier_id).returned += num(x.total_amount);
    for (const x of payments) ensure(x.supplier_id).paid += -supplierEffect(x.type) * num(x.amount);
    const now = new Date();
    for (const inv of invoices) {
      if (inv.due_date && inv.due_date < now && inv.status !== 'PAID') ensure(inv.supplier_id).overdue += num(inv.total_amount) - num(inv.amount_paid);
    }

    const names = new Map(suppliers.map((s) => [s.id, s]));
    const out = [...rows.entries()]
      .map(([id, r]) => {
        let soldQty = 0;
        let soldRevenue = 0;
        for (const pid of r.products) {
          const s = soldMap.get(pid);
          if (s) {
            soldQty += s.qty;
            soldRevenue += s.revenue;
          }
        }
        return {
          id,
          name: names.get(id)?.name ?? 'Unknown supplier',
          code: names.get(id)?.code ?? '',
          purchased: r2(r.purchased),
          qty: r2(r.qty),
          bills: r.bills.size,
          products: r.products.size,
          returned: r2(r.returned),
          returnRate: r.purchased > 0 ? r2((r.returned / r.purchased) * 100) : 0,
          paid: r2(r.paid),
          overdue: r2(Math.max(0, r.overdue)),
          lastPurchase: r.last,
          soldQty: r2(soldQty),
          soldRevenue: r2(soldRevenue),
          sellThrough: r.qty > 0 ? r2(Math.min(100, (soldQty / r.qty) * 100)) : 0,
        };
      })
      .sort((a, b) => b.purchased - a.purchased);

    return {
      period: range,
      rows: out,
      totals: {
        suppliers: out.length,
        purchased: r2(out.reduce((t, r) => t + r.purchased, 0)),
        returned: r2(out.reduce((t, r) => t + r.returned, 0)),
        paid: r2(out.reduce((t, r) => t + r.paid, 0)),
        overdue: r2(out.reduce((t, r) => t + r.overdue, 0)),
      },
    };
  }

  async purchasePriceHistory(q: Range & { productId?: string; supplierId?: string; search?: string }) {
    const { start, end } = localRange(q.from, q.to);
    const rows = await prisma.purchase.findMany({
      where: {
        purchase_date: { gte: start, lte: end },
        ...(q.productId ? { product_id: q.productId } : {}),
        ...(q.supplierId ? { supplier_id: q.supplierId } : {}),
        ...(q.search
          ? { product: { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { sku: { contains: q.search, mode: 'insensitive' } }] } }
          : {}),
      },
      select: {
        id: true,
        purchase_date: true,
        quantity: true,
        cost_price: true,
        sale_price: true,
        invoice_ref: true,
        product: { select: { id: true, name: true, sku: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { purchase_date: 'asc' },
      take: 2000,
    });
    const lastCost = new Map<string, number>();
    const entries = rows.map((r) => {
      const cost = num(r.cost_price);
      const prev = lastCost.get(r.product.id);
      // Zero-cost rows (opening stock / free goods) don't count as a price.
      if (cost > 0) lastCost.set(r.product.id, cost);
      return {
        id: r.id,
        date: r.purchase_date,
        product: r.product,
        supplier: r.supplier,
        qty: num(r.quantity),
        cost,
        salePrice: num(r.sale_price),
        margin: num(r.sale_price) > 0 ? r2(((num(r.sale_price) - cost) / num(r.sale_price)) * 100) : null,
        previousCost: prev ?? null,
        change: prev == null || cost <= 0 ? null : r2(cost - prev),
        changePct: prev && cost > 0 ? r2(((cost - prev) / prev) * 100) : null,
        reference: r.invoice_ref,
      };
    });
    // Per product: first / last / min / max cost in the period.
    const byProduct = new Map<string, { product: { id: string; name: string; sku: string }; first: number; last: number; min: number; max: number; buys: number; suppliers: Set<string> }>();
    for (const e of entries) {
      if (e.cost <= 0) continue;
      const p = byProduct.get(e.product.id) ?? { product: e.product, first: e.cost, last: e.cost, min: e.cost, max: e.cost, buys: 0, suppliers: new Set<string>() };
      p.last = e.cost;
      p.min = Math.min(p.min, e.cost);
      p.max = Math.max(p.max, e.cost);
      p.buys += 1;
      p.suppliers.add(e.supplier.name);
      byProduct.set(e.product.id, p);
    }
    return {
      period: q,
      entries: entries.reverse(),
      products: [...byProduct.values()]
        .map((p) => ({
          ...p.product,
          first: p.first,
          last: p.last,
          min: p.min,
          max: p.max,
          buys: p.buys,
          suppliers: [...p.suppliers],
          change: r2(p.last - p.first),
          changePct: p.first ? r2(((p.last - p.first) / p.first) * 100) : 0,
        }))
        .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)),
    };
  }

  /* ------------------------------ payables aging ------------------------------ */

  async payablesAging(q: { asOf?: string; supplierId?: string }) {
    const asOfYmd = q.asOf || businessTodayYmd();
    const suppliers = await prisma.supplier.findMany({
      where: q.supplierId ? { id: q.supplierId } : {},
      select: { id: true, name: true, code: true, phone_number: true, mobile_number: true },
    });
    const aging = await supplierAging(suppliers.map((x) => x.id), asOfYmd);
    const totals = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    let advance = 0;
    const rows = [];
    for (const sup of suppliers) {
      const a = aging.get(sup.id);
      if (!a) continue;
      advance += a.advance;
      if (a.due <= 0.005 && a.advance <= 0.005) continue;
      for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += a.buckets[k];
      rows.push({
        id: sup.id,
        name: sup.name,
        code: sup.code,
        phone: sup.mobile_number || sup.phone_number || null,
        due: a.due,
        advance: a.advance,
        buckets: a.buckets,
        oldestDays: a.oldestDays,
        bills: a.bills.map((b) => ({ ref: b.ref, date: b.date, due: b.due, amount: b.amount, outstanding: b.outstanding, daysOverdue: b.daysOverdue })),
      });
    }
    rows.sort((a, b) => b.due - a.due);
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = r2(totals[k]);
    return {
      asOf: asOfYmd,
      rows,
      totals: { ...totals, due: r2(Object.values(totals).reduce((t, v) => t + v, 0)), advance: r2(advance), suppliers: rows.filter((r) => r.due > 0).length },
    };
  }

  /* ------------------------------ cash flow & books ------------------------------ */

  private async flows(start: Date | null, end: Date, branchId?: string) {
    const dateWhere = (field: string) => ({ [field]: { ...(start ? { gte: start } : {}), lte: end } });
    const [sales, custPayments, expenses, supplierPayments, salaries, giftLoads] = await Promise.all([
      prisma.sale.findMany({
        where: { ...dateWhere('sale_date'), status: SOLD, ...(branchId ? { branch_id: branchId } : {}) },
        select: {
          id: true,
          sale_number: true,
          invoice_number: true,
          sale_date: true,
          total_amount: true,
          payment_method: true,
          notes: true,
          original_sale_id: true,
          payments: { select: { method: true, amount: true } },
          customer: { select: { name: true } },
        },
      }),
      prisma.customerPayment.findMany({
        where: { ...dateWhere('payment_date'), type: { in: ['PAYMENT', 'ADVANCE', 'REFUND'] }, ...(branchId ? { user: { branch_id: branchId } } : {}) },
        select: { id: true, payment_date: true, amount: true, method: true, type: true, reference: true, customer: { select: { name: true } } },
      }),
      prisma.expense.findMany({
        where: { ...dateWhere('expense_date'), status: 'APPROVED', ...(branchId ? { branch_id: branchId } : {}) },
        select: { id: true, expense_date: true, amount: true, payment_method: true, particular: true, category: { select: { name: true } } },
      }),
      prisma.supplierPayment.findMany({
        where: { ...dateWhere('payment_date'), type: { in: [...SUPPLIER_CASH_TYPES] } },
        select: { id: true, payment_date: true, amount: true, method: true, type: true, reference: true, supplier: { select: { name: true } } },
      }),
      prisma.salary.findMany({
        where: { paid_date: { not: null, ...(start ? { gte: start } : {}), lte: end }, paid_amount: { gt: 0 } },
        select: { id: true, paid_date: true, paid_amount: true, payment_method: true, month: true, year: true, employee: { select: { name: true } } },
      }),
      prisma.giftCardTransaction.findMany({
        where: { ...dateWhere('created_at'), type: { in: ['ISSUE', 'RELOAD'] }, payment_method: { notIn: ['COMPLIMENTARY'] }, ...(branchId ? { card: { branch_id: branchId } } : {}) },
        select: { id: true, created_at: true, amount: true, payment_method: true, type: true, card: { select: { code: true } } },
      }),
    ]);

    type Entry = { id: string; date: Date; method: string; amount: number; kind: string; group: 'operating' | 'financing'; description: string };
    const entries: Entry[] = [];
    for (const s of sales) {
      if (isRegenerated(s.notes)) continue;
      const total = num(s.total_amount);
      const isReturn = !!s.original_sale_id || total < 0;
      const tenders = s.payments.length ? s.payments.map((p) => ({ method: String(p.method), amount: num(p.amount) })) : [{ method: String(s.payment_method), amount: total }];
      const paid = tenders.reduce((t, p) => t + p.amount, 0);
      for (const t of tenders) {
        if (t.method === 'CREDIT') continue;
        // Split bills: scale tenders to the bill total (change returned in cash is not income).
        const amount = s.payments.length > 1 && paid !== 0 ? (total * t.amount) / paid : s.payments.length ? Math.min(t.amount, total) : total;
        if (Math.abs(amount) < 0.005) continue;
        entries.push({
          id: `${s.id}:${t.method}`,
          date: s.sale_date,
          method: t.method,
          amount: isReturn ? -Math.abs(amount) : amount,
          kind: isReturn ? 'Customer refund' : 'Sales receipt',
          group: 'operating',
          description: `${s.invoice_number || s.sale_number}${s.customer?.name ? ` · ${s.customer.name}` : ''}`,
        });
      }
    }
    for (const p of custPayments) {
      const amt = num(p.amount);
      entries.push({
        id: p.id,
        date: p.payment_date,
        method: String(p.method || 'CASH').toUpperCase(),
        amount: p.type === 'REFUND' ? -amt : amt,
        kind: p.type === 'REFUND' ? 'Customer refund' : p.type === 'ADVANCE' ? 'Customer advance' : 'Customer payment',
        group: 'operating',
        description: `${p.customer?.name || 'Customer'}${p.reference ? ` · ${p.reference}` : ''}`,
      });
    }
    for (const e of expenses) {
      entries.push({
        id: e.id,
        date: e.expense_date,
        method: String(e.payment_method),
        amount: -num(e.amount),
        kind: 'Expense',
        group: 'operating',
        description: `${e.particular}${e.category?.name ? ` · ${e.category.name}` : ''}`,
      });
    }
    for (const p of supplierPayments) {
      entries.push({
        id: p.id,
        date: p.payment_date,
        method: String(p.method || 'CASH').toUpperCase(),
        amount: supplierEffect(p.type) * num(p.amount),
        kind: p.type === 'REFUND' ? 'Supplier refund' : p.type === 'ADVANCE' ? 'Supplier advance' : 'Supplier payment',
        group: 'operating',
        description: `${p.supplier?.name || 'Supplier'}${p.reference ? ` · ${p.reference}` : ''}`,
      });
    }
    for (const s of salaries) {
      entries.push({
        id: s.id,
        date: s.paid_date!,
        method: String(s.payment_method || 'CASH').toUpperCase(),
        amount: -num(s.paid_amount),
        kind: 'Salary',
        group: 'operating',
        description: `${s.employee?.name || 'Employee'} · ${s.month}/${s.year}`,
      });
    }
    for (const g of giftLoads) {
      entries.push({
        id: g.id,
        date: g.created_at,
        method: String(g.payment_method || 'CASH').toUpperCase(),
        amount: num(g.amount),
        kind: 'Gift card sold',
        group: 'operating',
        description: `${g.card.code}${g.type === 'RELOAD' ? ' (reload)' : ''}`,
      });
    }
    return entries.map((e) => ({ ...e, book: e.method in BOOK_OF ? BOOK_OF[e.method] : 'bank', amount: r2(e.amount) }));
  }

  async cashFlow(range: Range) {
    const { start, end } = localRange(range.from, range.to);
    const entries = (await this.flows(start, end, range.branchId)).filter((e) => e.book !== null);
    const byKind = new Map<string, { kind: string; inflow: number; outflow: number; count: number }>();
    const byMethod = new Map<string, { method: string; label: string; inflow: number; outflow: number }>();
    const daily = new Map<string, { date: string; inflow: number; outflow: number }>();
    for (const e of entries) {
      const k = byKind.get(e.kind) ?? { kind: e.kind, inflow: 0, outflow: 0, count: 0 };
      const m = byMethod.get(e.method) ?? { method: e.method, label: METHOD_LABEL[e.method] ?? e.method, inflow: 0, outflow: 0 };
      const day = toBusinessYmd(e.date);
      const d = daily.get(day) ?? { date: day, inflow: 0, outflow: 0 };
      if (e.amount >= 0) {
        k.inflow += e.amount;
        m.inflow += e.amount;
        d.inflow += e.amount;
      } else {
        k.outflow += -e.amount;
        m.outflow += -e.amount;
        d.outflow += -e.amount;
      }
      k.count += 1;
      byKind.set(e.kind, k);
      byMethod.set(e.method, m);
      daily.set(day, d);
    }
    const inflow = entries.filter((e) => e.amount > 0).reduce((t, e) => t + e.amount, 0);
    const outflow = entries.filter((e) => e.amount < 0).reduce((t, e) => t - e.amount, 0);
    const round = <T extends Record<string, unknown>>(o: T) =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? r2(v) : v])) as T;
    return {
      period: range,
      totals: { inflow: r2(inflow), outflow: r2(outflow), net: r2(inflow - outflow) },
      byKind: [...byKind.values()].map(round).sort((a, b) => b.inflow + b.outflow - (a.inflow + a.outflow)),
      byMethod: [...byMethod.values()].map((m) => round({ ...m, net: m.inflow - m.outflow })),
      daily: [...daily.values()].map((d) => round({ ...d, net: d.inflow - d.outflow })).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /** Cash book or bank book: every receipt and payment with a running balance. */
  async book(book: 'cash' | 'bank', range: Range & { method?: string }) {
    const { start, end } = localRange(range.from, range.to);
    const dayBefore = localRange(shiftBusinessYmd(range.from, -1), shiftBusinessYmd(range.from, -1)).end;
    const match = (e: { book: string | null; method: string }) => e.book === book && (!range.method || e.method === range.method);
    const [prior, current] = await Promise.all([this.flows(null, dayBefore, range.branchId), this.flows(start, end, range.branchId)]);
    const opening = r2(prior.filter(match).reduce((t, e) => t + e.amount, 0));
    let balance = opening;
    const rows = current
      .filter(match)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((e) => {
        balance = r2(balance + e.amount);
        return {
          id: e.id,
          date: e.date,
          kind: e.kind,
          method: e.method,
          methodLabel: METHOD_LABEL[e.method] ?? e.method,
          description: e.description,
          receipt: e.amount > 0 ? e.amount : 0,
          payment: e.amount < 0 ? -e.amount : 0,
          balance,
        };
      });
    const receipts = r2(rows.reduce((t, r) => t + r.receipt, 0));
    const payments = r2(rows.reduce((t, r) => t + r.payment, 0));
    return {
      book,
      period: range,
      methods: [...new Set(current.filter((e) => e.book === book).map((e) => e.method))],
      opening,
      receipts,
      payments,
      closing: r2(opening + receipts - payments),
      rows,
      note:
        book === 'cash'
          ? 'Cash book is built from cash sales, customer payments, cash expenses, supplier and salary payments. Register cash-in / opening floats are internal transfers and not included.'
          : 'Bank book covers card, bank transfer, wallet and cheque receipts and payments.',
    };
  }

  /* ------------------------------ tax ------------------------------ */

  async tax(range: Range) {
    const { start, end } = localRange(range.from, range.to);
    const [items, invoices, uninvoicedCount] = await Promise.all([
      prisma.saleItem.findMany({
        where: { sale: { sale_date: { gte: start, lte: end }, status: SOLD, ...(range.branchId ? { branch_id: range.branchId } : {}) } },
        select: { tax_rate: true, tax_amount: true, line_total: true, item_type: true, quantity: true, sale: { select: { sale_date: true, notes: true, id: true } } },
      }),
      prisma.purchaseInvoice.findMany({
        where: { invoice_date: { gte: start, lte: end }, ...(range.branchId ? { branch_id: range.branchId } : {}) },
        select: {
          id: true,
          invoice_number: true,
          invoice_date: true,
          subtotal: true,
          tax_amount: true,
          total_amount: true,
          supplier: { select: { name: true, ntn: true, strn: true } },
        },
        orderBy: { invoice_date: 'asc' },
      }),
      prisma.purchase.count({ where: { purchase_date: { gte: start, lte: end }, purchase_invoice_id: null } }),
    ]);

    const byRate = new Map<string, { rate: number; taxable: number; tax: number; lines: number }>();
    const monthly = new Map<string, { month: string; output: number; input: number; taxableSales: number; taxablePurchases: number }>();
    const monthRow = (d: Date) => {
      const key = toBusinessYmd(d).slice(0, 7);
      const row = monthly.get(key) ?? { month: key, output: 0, input: 0, taxableSales: 0, taxablePurchases: 0 };
      monthly.set(key, row);
      return row;
    };
    for (const it of items) {
      if (isRegenerated(it.sale.notes)) continue;
      const isReturn = it.item_type === 'RETURN' || num(it.quantity) < 0 || num(it.line_total) < 0;
      const sign = isReturn ? -1 : 1;
      const tax = sign * Math.abs(num(it.tax_amount));
      const taxable = sign * Math.abs(num(it.line_total)) - tax;
      const rate = num(it.tax_rate);
      const key = rate.toFixed(2);
      const r = byRate.get(key) ?? { rate, taxable: 0, tax: 0, lines: 0 };
      r.taxable += taxable;
      r.tax += tax;
      r.lines += 1;
      byRate.set(key, r);
      const m = monthRow(it.sale.sale_date);
      m.output += tax;
      if (rate > 0) m.taxableSales += taxable;
    }
    for (const inv of invoices) {
      const m = monthRow(inv.invoice_date);
      m.input += num(inv.tax_amount);
      m.taxablePurchases += num(inv.subtotal);
    }
    const output = [...byRate.values()].reduce((t, r) => t + r.tax, 0);
    const input = invoices.reduce((t, i) => t + num(i.tax_amount), 0);
    return {
      period: range,
      totals: { output: r2(output), input: r2(input), net: r2(output - input) },
      outputByRate: [...byRate.values()].map((r) => ({ rate: r.rate, taxable: r2(r.taxable), tax: r2(r.tax), lines: r.lines })).sort((a, b) => b.rate - a.rate),
      inputInvoices: invoices
        .filter((i) => num(i.tax_amount) !== 0)
        .map((i) => ({
          id: i.id,
          invoiceNumber: i.invoice_number,
          date: i.invoice_date,
          supplier: i.supplier.name,
          ntn: i.supplier.ntn || i.supplier.strn || null,
          taxable: r2(num(i.subtotal)),
          tax: r2(num(i.tax_amount)),
          total: r2(num(i.total_amount)),
        })),
      monthly: [...monthly.values()]
        .map((m) => ({ ...m, output: r2(m.output), input: r2(m.input), net: r2(m.output - m.input), taxableSales: r2(m.taxableSales), taxablePurchases: r2(m.taxablePurchases) }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      uninvoicedPurchases: uninvoicedCount,
    };
  }
}

export const assertRange = (from?: string, to?: string): { from: string; to: string } => {
  const today = businessTodayYmd();
  const f = from || shiftBusinessYmd(today, -29);
  const t = to || today;
  if (t < f) throw new AppError(400, 'To date cannot be before From date');
  return { from: f, to: t };
};

