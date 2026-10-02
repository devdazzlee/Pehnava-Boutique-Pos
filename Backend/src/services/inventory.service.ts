import { prisma } from '../prisma/client';
import { asNumber } from '../utils/helpers';
import { Prisma } from '@prisma/client';
import {
  businessTodayYmd,
  localRange,
  shiftBusinessYmd,
  startOfBusinessMonth,
  toBusinessYmd,
} from '../utils/timezone';

export class InventoryService {
  async getDashboardStats(_userRole?: string, branchId?: string) {
    const warehouse = await prisma.branch.findFirst({
      where: { branch_type: 'WAREHOUSE', is_active: true },
    });

    // Apply branch filter whenever a branchId is provided (admins can opt into all-branches by omitting it).
    const branchFilter = branchId || undefined;

    const stockWhere: Prisma.StockWhereInput = {};
    if (branchFilter) {
      stockWhere.branch_id = branchFilter;
    }

    const stocks = await prisma.stock.findMany({
      where: stockWhere,
      include: {
        product: { include: { category: true } },
        branch: true,
      },
    });

    let totalInventoryValue = 0;
    let positiveInventoryValue = 0;
    let totalStockQuantity = 0;
    let negativeStockCount = 0;
    const branchSummary: Record<
      string,
      { name: string; value: number; items: number; type: string }
    > = {};

    for (const s of stocks) {
      const qty = asNumber(s.current_quantity);
      totalStockQuantity += qty;
      if (qty < 0) negativeStockCount += 1;
      const cost = asNumber((s.product as any).purchase_rate || 0);
      const value = qty * cost;
      const bid = s.branch_id;

      if (!branchSummary[bid]) {
        branchSummary[bid] = {
          name: (s.branch as any).name,
          value: 0,
          items: 0,
          type: (s.branch as any).branch_type,
        };
      }

      branchSummary[bid].value += value;
      branchSummary[bid].items += 1;
      totalInventoryValue += value;
      if (qty > 0) positiveInventoryValue += value;
    }

    const startOfMonth = startOfBusinessMonth();

    const purchaseWhere: Prisma.PurchaseWhereInput = {
      purchase_date: { gte: startOfMonth },
    };
    if (branchFilter) purchaseWhere.warehouse_branch_id = branchFilter;

    const recentPurchases = await prisma.purchase.findMany({
      where: purchaseWhere,
      take: 5,
      orderBy: { purchase_date: 'desc' },
      include: { product: true, supplier: true },
    });

    const pendingTransfersWhere: Prisma.TransferWhereInput = {
      status: { in: ['PENDING', 'DISPATCHED'] },
    };
    if (branchFilter) {
      pendingTransfersWhere.OR = [
        { from_branch_id: branchFilter },
        { to_branch_id: branchFilter },
      ];
    }

    const pendingTransfers = await prisma.transfer.findMany({
      where: pendingTransfersWhere,
      take: 10,
      orderBy: { transfer_date: 'desc' },
      include: { product: true, from_branch: true, to_branch: true },
    });

    const lowStockItems = stocks
      .filter((s) => {
        const minQty = asNumber(
          (s.product as any).min_qty ?? s.minimum_quantity ?? 0
        );
        return asNumber(s.current_quantity) <= minQty && minQty > 0;
      })
      .sort(
        (a, b) =>
          asNumber(a.current_quantity) - asNumber(b.current_quantity)
      );

    const lowStockAlerts = lowStockItems.slice(0, 25).map((s) => ({
      maxQuantity:
        asNumber(s.maximum_quantity ?? 0) || asNumber((s.product as any).max_qty ?? 0),
      productId: s.product_id,
      product: {
        id: (s.product as any).id,
        name: (s.product as any).name,
        sku: (s.product as any).sku,
        code: (s.product as any).code,
      },
      branch: {
        id: (s.branch as any).id,
        name: (s.branch as any).name,
      },
      currentQuantity: asNumber(s.current_quantity),
      minThreshold: asNumber(
        (s.product as any).min_qty ?? s.minimum_quantity ?? 0
      ),
    }));

    const outOfStockItems = stocks.filter(
      (s) => asNumber(s.current_quantity) <= 0
    );

    const sortedTopValued = Object.entries(branchSummary)
      .map(([id, v]) => ({ branchId: id, ...v }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const movementTrendRaw = await prisma.stockMovement.groupBy({
      by: ['movement_type'],
      where: {
        created_at: { gte: sevenDaysAgo },
        ...(branchFilter ? { branch_id: branchFilter } : {}),
      },
      _count: true,
      _sum: { quantity_change: true },
    });

    const movementTrend = movementTrendRaw.map((m) => ({
      movement_type: m.movement_type,
      count: m._count,
      quantity: Math.abs(asNumber(m._sum?.quantity_change || 0)),
    }));

    const categorySummary: Record<string, { value: number; items: number }> =
      {};
    for (const s of stocks) {
      const catName = (s.product as any).category?.name || 'Uncategorized';
      const cost = asNumber((s.product as any).purchase_rate || 0);
      const qty = asNumber(s.current_quantity);
      // Category valuation uses positive stock only so the chart stays meaningful
      const val = Math.max(0, qty) * cost;
      if (!categorySummary[catName])
        categorySummary[catName] = { value: 0, items: 0 };
      categorySummary[catName].value += val;
      if (qty > 0) categorySummary[catName].items += 1;
    }

    const topMoving = await prisma.stockMovement.groupBy({
      by: ['product_id'],
      where: {
        movement_type: 'SALE',
        created_at: { gte: sevenDaysAgo },
        ...(branchFilter ? { branch_id: branchFilter } : {}),
      },
      _sum: { quantity_change: true },
      orderBy: { _sum: { quantity_change: 'asc' } }, // SALE qty is negative
      take: 8,
    });

    const productIds = topMoving.map((m) => m.product_id);
    const products =
      productIds.length > 0
        ? await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, sku: true },
          })
        : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    const topMovingWithNames = topMoving
      .map((m) => {
        const p = productMap.get(m.product_id);
        return {
          productId: m.product_id,
          name: p?.name || 'Unknown',
          sku: p?.sku || '',
          quantity: Math.abs(asNumber(m._sum?.quantity_change || 0)),
        };
      })
      .filter((m) => m.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const purchasesThisMonth = await prisma.purchase.findMany({
      where: {
        created_at: { gte: startOfMonth },
        ...(branchFilter ? { warehouse_branch_id: branchFilter } : {}),
      },
      select: { quantity: true, cost_price: true },
    });

    const poTotalValue = purchasesThisMonth.reduce(
      (acc, p) => acc + asNumber(p.quantity) * asNumber(p.cost_price),
      0
    );

    const activeBranches = await prisma.branch.count({
      where: { is_active: true },
    });

    // ---------- Deep insights (all derived from existing tables) ----------
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const todayKey = businessTodayYmd();
    const trendStartKey = shiftBusinessYmd(todayKey, -13);
    const trendStart = localRange(trendStartKey, trendStartKey).start;

    const [sales30, trendRows, pendingTransferCount] = await Promise.all([
      prisma.stockMovement.groupBy({
        by: ['product_id', 'branch_id'],
        where: {
          movement_type: 'SALE',
          created_at: { gte: thirtyDaysAgo },
          ...(branchFilter ? { branch_id: branchFilter } : {}),
        },
        _sum: { quantity_change: true },
        _max: { created_at: true },
      }),
      prisma.stockMovement.findMany({
        where: {
          created_at: { gte: trendStart },
          ...(branchFilter ? { branch_id: branchFilter } : {}),
        },
        select: { quantity_change: true, created_at: true, movement_type: true },
      }),
      // Real count — the list above is capped at 10 for display.
      prisma.transfer.count({ where: pendingTransfersWhere }),
    ]);

    const rowKey = (productId: string, bid: string) => `${productId}:${bid}`;
    const sold30ByRow = new Map<string, number>();
    const sold30ByProduct = new Map<string, number>();
    const lastSaleByProduct = new Map<string, Date>();
    for (const row of sales30) {
      const qty = Math.abs(asNumber(row._sum?.quantity_change || 0));
      sold30ByRow.set(rowKey(row.product_id, row.branch_id), qty);
      sold30ByProduct.set(row.product_id, (sold30ByProduct.get(row.product_id) || 0) + qty);
      const last = row._max?.created_at;
      if (last) {
        const prev = lastSaleByProduct.get(row.product_id);
        if (!prev || last > prev) lastSaleByProduct.set(row.product_id, last);
      }
    }

    const priceOf = (p: any) =>
      asNumber(p?.sales_rate_inc_dis_and_tax || 0) || asNumber(p?.sales_rate_exc_dis_and_tax || 0);
    const round2 = (n: number) => Math.round(n * 100) / 100;

    let retailValue = 0;
    let reservedQuantity = 0;
    const overstockRows: any[] = [];
    const deadRows: any[] = [];
    const productAgg = new Map<
      string,
      { productId: string; name: string; sku: string; category: string; quantity: number; value: number; retail: number }
    >();
    const branchExtra: Record<string, { quantity: number; retail: number; low: number; out: number }> = {};
    const categoryExtra: Record<string, { quantity: number; retail: number }> = {};

    for (const s of stocks) {
      const p = s.product as any;
      const qty = asNumber(s.current_quantity);
      const cost = asNumber(p.purchase_rate || 0);
      const price = priceOf(p);
      const positive = Math.max(0, qty);
      const minQty = asNumber(p.min_qty ?? s.minimum_quantity ?? 0);
      const maxQty = asNumber(s.maximum_quantity ?? 0) || asNumber(p.max_qty ?? 0);
      const catName = p.category?.name || 'Uncategorized';

      retailValue += positive * price;
      reservedQuantity += asNumber(s.reserved_quantity || 0);

      const be = (branchExtra[s.branch_id] ||= { quantity: 0, retail: 0, low: 0, out: 0 });
      be.quantity += qty;
      be.retail += positive * price;
      if (qty <= 0) be.out += 1;
      else if (minQty > 0 && qty <= minQty) be.low += 1;

      const ce = (categoryExtra[catName] ||= { quantity: 0, retail: 0 });
      ce.quantity += positive;
      ce.retail += positive * price;

      const agg = productAgg.get(s.product_id) || {
        productId: s.product_id,
        name: p.name,
        sku: p.sku || p.code || '',
        category: catName,
        quantity: 0,
        value: 0,
        retail: 0,
      };
      agg.quantity += qty;
      agg.value += positive * cost;
      agg.retail += positive * price;
      productAgg.set(s.product_id, agg);

      const base = {
        productId: s.product_id,
        name: p.name,
        sku: p.sku || p.code || '',
        branch: { id: s.branch_id, name: (s.branch as any).name },
        quantity: qty,
      };
      if (maxQty > 0 && qty > maxQty) {
        overstockRows.push({ ...base, maxQuantity: maxQty, excess: qty - maxQty, excessValue: round2((qty - maxQty) * cost) });
      }
      if (qty > 0 && !sold30ByRow.has(rowKey(s.product_id, s.branch_id))) {
        deadRows.push({ ...base, value: round2(qty * cost) });
      }
    }

    // Last sale ever for the dead-stock items we show (outside the 30-day window).
    deadRows.sort((a, b) => b.value - a.value);
    const deadTop = deadRows.slice(0, 10);
    const deadIds = [...new Set(deadTop.map((r) => r.productId))];
    const lastSaleEver =
      deadIds.length > 0
        ? await prisma.stockMovement.groupBy({
            by: ['product_id'],
            where: {
              movement_type: 'SALE',
              product_id: { in: deadIds },
              ...(branchFilter ? { branch_id: branchFilter } : {}),
            },
            _max: { created_at: true },
          })
        : [];
    const lastSaleEverMap = new Map(lastSaleEver.map((r) => [r.product_id, r._max?.created_at || null]));

    const onHandByProduct = new Map<string, number>();
    for (const s of stocks) {
      onHandByProduct.set(s.product_id, (onHandByProduct.get(s.product_id) || 0) + asNumber(s.current_quantity));
    }

    const outOfStockList = outOfStockItems
      .map((s) => ({
        productId: s.product_id,
        name: (s.product as any).name,
        sku: (s.product as any).sku || (s.product as any).code || '',
        branch: { id: s.branch_id, name: (s.branch as any).name },
        quantity: asNumber(s.current_quantity),
        sold30: sold30ByRow.get(rowKey(s.product_id, s.branch_id)) || 0,
      }))
      .sort((a, b) => b.sold30 - a.sold30 || a.quantity - b.quantity)
      .slice(0, 15);

    // 14-day daily in/out trend, bucketed by business (PKT) date.
    const dayKeys = Array.from({ length: 14 }, (_, i) => shiftBusinessYmd(trendStartKey, i));
    const dayMap = new Map(dayKeys.map((k) => [k, { date: k, stockIn: 0, stockOut: 0, sold: 0 }]));
    let in7 = 0;
    let out7 = 0;
    let sold7 = 0;
    for (const m of trendRows) {
      const bucket = dayMap.get(toBusinessYmd(m.created_at));
      const change = asNumber(m.quantity_change);
      const recent = m.created_at >= sevenDaysAgo;
      if (change > 0) {
        if (bucket) bucket.stockIn += change;
        if (recent) in7 += change;
      } else if (change < 0) {
        if (bucket) bucket.stockOut += Math.abs(change);
        if (recent) out7 += Math.abs(change);
      }
      if (m.movement_type === 'SALE') {
        if (bucket) bucket.sold += Math.abs(change);
        if (recent) sold7 += Math.abs(change);
      }
    }
    const sold30Total = [...sold30ByProduct.values()].reduce((a, b) => a + b, 0);

    const positiveCost = positiveInventoryValue;
    const potentialProfit = retailValue - positiveCost;

    const sortedCategories = Object.entries(categorySummary)
      .map(([name, v]) => ({
        name,
        ...v,
        quantity: categoryExtra[name]?.quantity || 0,
        retail: round2(categoryExtra[name]?.retail || 0),
      }))
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value);

    return {
      totalInventoryValue,
      positiveInventoryValue,
      totalStockQuantity,
      negativeStockCount,
      lowStockCount: lowStockItems.length,
      totalSkus: await prisma.product.count({ where: { is_active: true } }),
      outOfStockCount: outOfStockItems.length,
      totalLocations: branchFilter ? 1 : activeBranches,
      pendingTransferCount,
      branchSummary: sortedTopValued.map((b) => ({
        ...b,
        quantity: branchExtra[b.branchId]?.quantity || 0,
        retail: round2(branchExtra[b.branchId]?.retail || 0),
        lowCount: branchExtra[b.branchId]?.low || 0,
        outCount: branchExtra[b.branchId]?.out || 0,
      })),
      categorySummary: sortedCategories,
      velocity: topMovingWithNames.map((v) => {
        const onHand = onHandByProduct.get(v.productId) || 0;
        const perDay = v.quantity / 7;
        return {
          ...v,
          onHand,
          sold30: sold30ByProduct.get(v.productId) || 0,
          daysOfCover: perDay > 0 ? Math.max(0, Math.round((onHand / perDay) * 10) / 10) : null,
        };
      }),
      // --- deep insights ---
      retailValue: round2(retailValue),
      potentialProfit: round2(potentialProfit),
      marginPct: retailValue > 0 ? round2((potentialProfit / retailValue) * 100) : 0,
      reservedQuantity,
      overstockCount: overstockRows.length,
      overstockItems: overstockRows.sort((a, b) => b.excessValue - a.excessValue).slice(0, 10),
      deadStockCount: deadRows.length,
      deadStockValue: round2(deadRows.reduce((sum, r) => sum + r.value, 0)),
      deadStockItems: deadTop.map((r) => ({ ...r, lastSaleAt: lastSaleEverMap.get(r.productId) || null })),
      topValueItems: [...productAgg.values()]
        .filter((p) => p.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)
        .map((p) => ({ ...p, value: round2(p.value), retail: round2(p.retail) })),
      outOfStockItems: outOfStockList,
      dailyTrend: [...dayMap.values()],
      movementSummary: { stockIn7: in7, stockOut7: out7, sold7, sold30: sold30Total },
      recentPurchases: recentPurchases.map((p) => ({
        id: p.id,
        quantity: asNumber(p.quantity),
        costPrice: asNumber(p.cost_price),
        purchaseDate: p.purchase_date,
        product: p.product
          ? { id: p.product.id, name: p.product.name }
          : null,
        supplier: p.supplier
          ? { id: p.supplier.id, name: p.supplier.name }
          : null,
      })),
      pendingTransfers: pendingTransfers.map((t) => ({
        id: t.id,
        quantity: asNumber(t.quantity),
        status: t.status,
        transferDate: t.transfer_date,
        product: t.product
          ? { id: t.product.id, name: t.product.name }
          : null,
        from_branch: t.from_branch
          ? { id: t.from_branch.id, name: t.from_branch.name }
          : null,
        to_branch: t.to_branch
          ? { id: t.to_branch.id, name: t.to_branch.name }
          : null,
      })),
      lowStockAlerts: lowStockAlerts.map((a) => {
        const sold30 = sold30ByRow.get(rowKey(a.productId, a.branch.id)) || 0;
        const perDay = sold30 / 30;
        const target = a.maxQuantity > 0 ? a.maxQuantity : a.minThreshold * 2;
        return {
          ...a,
          sold30,
          daysOfCover: perDay > 0 ? Math.max(0, Math.round((a.currentQuantity / perDay) * 10) / 10) : null,
          suggestedReorder: Math.max(0, Math.ceil(target - a.currentQuantity)),
        };
      }),
      movementTrend,
      procurementHealth: {
        count: purchasesThisMonth.length,
        totalValue: poTotalValue,
      },
      warehouse: warehouse
        ? { id: warehouse.id, name: warehouse.name }
        : null,
      filteredBranchId: branchFilter || null,
    };
  }

  async getLowStockProducts(branchId?: string) {
    const where: Prisma.StockWhereInput = {};
    if (branchId) where.branch_id = branchId;

    const stocks = await prisma.stock.findMany({
      where,
      include: { product: true, branch: true },
    });

    const lowStock = stocks.filter((s) => {
      const minQty = asNumber(
        (s.product as any).min_qty ?? s.minimum_quantity ?? 0
      );
      return minQty > 0 && asNumber(s.current_quantity) <= minQty;
    });

    return lowStock;
  }

  async getStockMovements(params: {
    branchId?: string;
    productId?: string;
    movementType?: string;
    direction?: 'in' | 'out';
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
    userRole?: string;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = {};

    if (
      params.branchId &&
      params.userRole &&
      ['ADMIN', 'SUPER_ADMIN'].includes(params.userRole)
    ) {
      where.branch_id = params.branchId;
    } else if (
      params.branchId &&
      params.userRole &&
      !['ADMIN', 'SUPER_ADMIN'].includes(params.userRole)
    ) {
      where.branch_id = params.branchId;
    }

    if (params.productId) where.product_id = params.productId;
    if (params.movementType) where.movement_type = params.movementType as any;
    if (params.direction === 'in') where.quantity_change = { gt: 0 };
    if (params.direction === 'out') where.quantity_change = { lt: 0 };
    if (params.startDate || params.endDate) {
      where.created_at = {};
      if (params.startDate) where.created_at.gte = params.startDate;
      if (params.endDate) where.created_at.lte = params.endDate;
    }

    // Summary must reflect ALL movements matching the filter, not just the
    // current page. Previously we summed `movements` (the paginated slice)
    // which produced "+0 / -0" whenever the meaningful inbound/outbound
    // records lived on a later page.
    const [total, movements, increaseAgg, decreaseAgg] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          product: true,
          branch: true,
          user: { select: { email: true } },
        },
      }),
      prisma.stockMovement.aggregate({
        _sum: { quantity_change: true },
        where: { ...where, quantity_change: { gt: 0 } },
      }),
      prisma.stockMovement.aggregate({
        _sum: { quantity_change: true },
        where: { ...where, quantity_change: { lt: 0 } },
      }),
    ]);

    const summary = {
      totalIncrease: asNumber(increaseAgg._sum.quantity_change),
      totalDecrease: Math.abs(asNumber(decreaseAgg._sum.quantity_change)),
      count: total,
    };

    return {
      data: movements,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      summary,
    };
  }

  async getStockByLocation(branchId?: string, _userRole?: string) {
    const where: Prisma.StockWhereInput = {};
    if (branchId) {
      where.branch_id = branchId;
    }

    const stocks = await prisma.stock.findMany({
      where,
      include: {
        product: { include: { category: true } },
        branch: true,
      },
      orderBy: [{ branch_id: 'asc' }, { product_id: 'asc' }],
    });

    return stocks;
  }

  async getReports(params: {
    type: 'valuation' | 'purchase' | 'transfer' | 'stockout' | 'lowstock' | 'aging' | 'movement_summary' | 'financial_audit';
    branchId?: string;
    startDate?: Date;
    endDate?: Date;
    supplierId?: string;
    productId?: string;
    categoryId?: string;
  }) {
    switch (params.type) {
      case 'valuation': {
        const where: Prisma.StockWhereInput = {};
        if (params.branchId) where.branch_id = params.branchId;
        const stocks = await prisma.stock.findMany({
          where,
          include: { product: true, branch: true },
        });
        const byLocation: Record<string, { value: number; items: any[] }> = {};
        let totalValue = 0;
        let totalItems = 0;

        for (const s of stocks) {
          const bid = s.branch_id;
          if (!byLocation[bid]) {
            byLocation[bid] = { value: 0, items: [] };
          }
          const cost = asNumber((s.product as any).purchase_rate || 0);
          const value = asNumber(s.current_quantity) * cost;
          byLocation[bid].value += value;
          totalValue += value;
          totalItems += 1;
          byLocation[bid].items.push({
            product: s.product,
            quantity: asNumber(s.current_quantity),
            value,
          });
        }
        return { 
          byLocation, 
          totalValue, 
          summary: { totalValue, totalItems, locationsCount: Object.keys(byLocation).length } 
        };
      }

      case 'purchase': {
        const where: Prisma.PurchaseWhereInput = {};
        if (params.branchId) where.warehouse_branch_id = params.branchId;
        if (params.supplierId) where.supplier_id = params.supplierId;
        if (params.productId) where.product_id = params.productId;
        if (params.startDate || params.endDate) {
          where.purchase_date = {};
          if (params.startDate) where.purchase_date.gte = params.startDate;
          if (params.endDate) where.purchase_date.lte = params.endDate;
        }
        const purchases = await prisma.purchase.findMany({
          where,
          include: { product: true, supplier: true, warehouse_branch: true },
          orderBy: { purchase_date: 'desc' },
        });
        
        const totalCost = purchases.reduce((acc, p) => acc + asNumber(p.quantity) * asNumber(p.cost_price), 0);
        return {
          data: purchases,
          summary: { count: purchases.length, totalCost, avgPrice: purchases.length ? totalCost / purchases.length : 0 }
        };
      }

      case 'transfer': {
        const where: Prisma.TransferWhereInput = {};
        if (params.branchId) {
          where.OR = [
            { from_branch_id: params.branchId },
            { to_branch_id: params.branchId },
          ];
        }
        if (params.productId) where.product_id = params.productId;
        if (params.startDate || params.endDate) {
          where.transfer_date = {};
          if (params.startDate) where.transfer_date.gte = params.startDate;
          if (params.endDate) where.transfer_date.lte = params.endDate;
        }
        const transfers = await prisma.transfer.findMany({
          where,
          include: {
            product: true,
            from_branch: true,
            to_branch: true,
          },
          orderBy: { transfer_date: 'desc' },
        });
        return {
          data: transfers,
          summary: { count: transfers.length, completed: transfers.filter(t => t.status === 'RECEIVED').length }
        };
      }

      case 'stockout': {
        const where: Prisma.StockMovementWhereInput = {
          movement_type: { in: ['SALE', 'DAMAGE', 'LOSS', 'EXPIRED'] },
        };
        if (params.branchId) where.branch_id = params.branchId;
        if (params.productId) where.product_id = params.productId;
        if (params.startDate || params.endDate) {
          where.created_at = {};
          if (params.startDate) where.created_at.gte = params.startDate;
          if (params.endDate) where.created_at.lte = params.endDate;
        }
        const movements = await prisma.stockMovement.findMany({
          where,
          include: { product: true, branch: true },
          orderBy: { created_at: 'desc' },
        });
        const totalQty = movements.reduce((acc, m) => acc + Math.abs(asNumber(m.quantity_change)), 0);
        return {
          data: movements,
          summary: { count: movements.length, totalQty, damageCount: movements.filter(m => m.movement_type === 'DAMAGE').length }
        };
      }

      case 'lowstock': {
        const stocks = await prisma.stock.findMany({
          where: params.branchId ? { branch_id: params.branchId } : {},
          include: { product: true, branch: true },
        });
        const items = stocks.filter((s) => {
          const minQty = asNumber((s.product as any).min_qty ?? s.minimum_quantity ?? 0);
          return minQty > 0 && asNumber(s.current_quantity) <= minQty;
        });
        return {
          data: items,
          summary: { criticalCount: items.filter(i => asNumber(i.current_quantity) <= 0).length, warningCount: items.length }
        };
      }

      case 'aging': {
        const stocks = await prisma.stock.findMany({
          where: params.branchId ? { branch_id: params.branchId } : {},
          include: { product: true, branch: true },
        });
        
        const data = await Promise.all(stocks.map(async (s: any) => {
          const lastMovement = await prisma.stockMovement.findFirst({
            where: { product_id: s.product_id, branch_id: s.branch_id },
            orderBy: { created_at: 'desc' },
            select: { created_at: true }
          });
          const lastDate = lastMovement?.created_at || s.last_updated;
          const daysOld = Math.floor((new Date().getTime() - lastDate.getTime()) / (1000 * 3600 * 24));
          return {
            product: s.product,
            branch: s.branch,
            currentQuantity: asNumber(s.current_quantity),
            daysOld,
            lastAction: lastDate
          };
        }));
        
        return {
          data: data.sort((a, b) => b.daysOld - a.daysOld),
          summary: { avgAge: data.length ? data.reduce((acc, d) => acc + d.daysOld, 0) / data.length : 0, deadStockCount: data.filter(d => d.daysOld > 90).length }
        };
      }

      case 'movement_summary': {
        const where: Prisma.StockMovementWhereInput = {};
        if (params.branchId) where.branch_id = params.branchId;
        if (params.startDate || params.endDate) {
          where.created_at = {};
          if (params.startDate) where.created_at.gte = params.startDate;
          if (params.endDate) where.created_at.lte = params.endDate;
        }

        const stats = await prisma.stockMovement.groupBy({
          by: ['movement_type'],
          where,
          _sum: { quantity_change: true },
          _count: true
        });

        return {
          data: stats,
          summary: { totalMovements: stats.reduce((acc, s) => acc + s._count, 0) }
        };
      }

      case 'financial_audit': {
        const where: Prisma.SaleWhereInput = {
          status: 'COMPLETED'
        };
        if (params.branchId) where.branch_id = params.branchId;
        if (params.startDate || params.endDate) {
          where.sale_date = {};
          if (params.startDate) where.sale_date.gte = params.startDate;
          if (params.endDate) where.sale_date.lte = params.endDate;
        }

        const [sales, stockRows] = await Promise.all([
          prisma.sale.findMany({
            where,
            select: {
              id: true,
              branch_id: true,
              sale_date: true,
              discount_amount: true,
              tax_amount: true,
              branch: { select: { id: true, name: true, code: true } },
              sale_items: {
                select: {
                  product_id: true,
                  quantity: true,
                  line_total: true,
                  product: {
                    select: {
                      id: true,
                      name: true,
                      sku: true,
                      code: true,
                      purchase_rate: true,
                      category_id: true,
                      category: { select: { id: true, name: true } },
                    },
                  },
                },
              },
            },
          }),
          // Current inventory, for turnover / days-of-stock.
          prisma.stock.findMany({
            where: {
              ...(params.branchId ? { branch_id: params.branchId } : {}),
              ...(params.productId ? { product_id: params.productId } : {}),
              ...(params.categoryId ? { product: { category_id: params.categoryId } } : {}),
            },
            select: {
              branch_id: true,
              current_quantity: true,
              product: { select: { purchase_rate: true, sales_rate_inc_dis_and_tax: true, sales_rate_exc_dis_and_tax: true } },
            },
          }),
        ]);

        const r2 = (n: number) => Math.round(n * 100) / 100;
        type Agg = {
          revenue: number;
          cogs: number;
          units: number;
          count: number;
          discount: number;
          tax: number;
        };
        const blank = (): Agg => ({ revenue: 0, cogs: 0, units: 0, count: 0, discount: 0, tax: 0 });
        const totals = blank();
        const byBranch: Record<string, Agg & { branchId: string; name: string; code: string }> = {};
        const byCategory: Record<string, Agg & { id: string; name: string; byBranch: Record<string, Agg> }> = {};
        const byProduct: Record<string, Agg & { id: string; name: string; sku: string; category: string; byBranch: Record<string, Agg> }> = {};
        const byDay: Record<string, { date: string; revenue: number; cogs: number; count: number }> = {};

        for (const sale of sales) {
          const items = sale.sale_items.filter((item) => {
            if (params.productId && item.product_id !== params.productId) return false;
            if (params.categoryId && item.product.category_id !== params.categoryId) return false;
            return true;
          });
          if (items.length === 0) continue;

          const bId = sale.branch_id || 'unknown';
          const branch = (byBranch[bId] ||= {
            ...blank(),
            branchId: bId,
            name: sale.branch?.name || 'Central',
            code: sale.branch?.code || '',
          });
          // Only count a sale once even if several items matched.
          totals.count += 1;
          branch.count += 1;
          // Bill-level discount/tax only when the whole bill is in scope.
          if (!params.productId && !params.categoryId) {
            const d = asNumber(sale.discount_amount);
            const t = asNumber(sale.tax_amount);
            totals.discount += d;
            totals.tax += t;
            branch.discount += d;
            branch.tax += t;
          }
          const dayKey = toBusinessYmd(sale.sale_date);
          const day = (byDay[dayKey] ||= { date: dayKey, revenue: 0, cogs: 0, count: 0 });
          day.count += 1;

          const touchedCats = new Set<string>();
          const touchedProducts = new Set<string>();
          for (const item of items) {
            const qty = asNumber(item.quantity);
            const rev = asNumber(item.line_total);
            const cost = asNumber(item.product.purchase_rate) * qty;
            totals.revenue += rev;
            totals.cogs += cost;
            totals.units += qty;
            branch.revenue += rev;
            branch.cogs += cost;
            branch.units += qty;
            day.revenue += rev;
            day.cogs += cost;

            const catId = item.product.category?.id || 'none';
            const cat = (byCategory[catId] ||= { ...blank(), id: catId, name: item.product.category?.name || 'Uncategorized', byBranch: {} });
            cat.revenue += rev;
            cat.cogs += cost;
            cat.units += qty;
            if (!touchedCats.has(catId)) {
              cat.count += 1;
              touchedCats.add(catId);
            }
            const cb = (cat.byBranch[bId] ||= blank());
            cb.revenue += rev;
            cb.cogs += cost;
            cb.units += qty;

            const pId = item.product_id;
            const prod = (byProduct[pId] ||= {
              ...blank(),
              id: pId,
              name: item.product.name,
              sku: item.product.sku || item.product.code || '',
              category: item.product.category?.name || 'Uncategorized',
              byBranch: {},
            });
            prod.revenue += rev;
            prod.cogs += cost;
            prod.units += qty;
            if (!touchedProducts.has(pId)) {
              prod.count += 1;
              touchedProducts.add(pId);
            }
            const pb = (prod.byBranch[bId] ||= blank());
            pb.revenue += rev;
            pb.cogs += cost;
            pb.units += qty;
          }
        }

        // Inventory on hand (cost + retail), per branch.
        const stockByBranch: Record<string, { cost: number; retail: number; units: number }> = {};
        const stockTotals = { cost: 0, retail: 0, units: 0 };
        for (const row of stockRows) {
          const qty = Math.max(0, asNumber(row.current_quantity));
          const cost = qty * asNumber(row.product?.purchase_rate || 0);
          const price =
            asNumber(row.product?.sales_rate_inc_dis_and_tax || 0) || asNumber(row.product?.sales_rate_exc_dis_and_tax || 0);
          const retail = qty * price;
          const b = (stockByBranch[row.branch_id] ||= { cost: 0, retail: 0, units: 0 });
          b.cost += cost;
          b.retail += retail;
          b.units += qty;
          stockTotals.cost += cost;
          stockTotals.retail += retail;
          stockTotals.units += qty;
        }

        // Period length for turnover math.
        const dayKeys = Object.keys(byDay).sort();
        const periodStart = params.startDate || (dayKeys[0] ? new Date(`${dayKeys[0]}T00:00:00`) : new Date());
        const periodEnd = params.endDate || new Date();
        const periodDays = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000) + 1);

        const finish = (a: Agg) => {
          const profit = a.revenue - a.cogs;
          return {
            revenue: r2(a.revenue),
            cogs: r2(a.cogs),
            profit: r2(profit),
            margin: a.revenue > 0 ? Math.round((profit / a.revenue) * 1000) / 10 : 0,
            units: r2(a.units),
            count: a.count,
            discount: r2(a.discount),
            tax: r2(a.tax),
            avgTicket: a.count ? r2(a.revenue / a.count) : 0,
          };
        };
        const turnoverFor = (cogs: number, stockCost: number) => {
          // Annualised COGS ÷ current stock at cost.
          const annual = (cogs / periodDays) * 365;
          const turnover = stockCost > 0 ? Math.round((annual / stockCost) * 10) / 10 : null;
          const dailyCogs = cogs / periodDays;
          const daysOfStock = dailyCogs > 0 ? Math.round(stockCost / dailyCogs) : null;
          return { turnover, daysOfStock };
        };

        const rankBy = <T extends { revenue: number; cogs: number }>(rows: T[]) =>
          rows.map((row) => ({ ...row, profit: row.revenue - row.cogs }));

        const branchRows = Object.values(byBranch)
          .map((b) => {
            const f = finish(b);
            const stock = stockByBranch[b.branchId] || { cost: 0, retail: 0, units: 0 };
            const t = turnoverFor(b.cogs, stock.cost);
            const products = rankBy(
              Object.values(byProduct)
                .filter((p) => p.byBranch[b.branchId])
                .map((p) => ({ id: p.id, name: p.name, sku: p.sku, category: p.category, ...p.byBranch[b.branchId] })),
            );
            const cats = rankBy(
              Object.values(byCategory)
                .filter((c) => c.byBranch[b.branchId])
                .map((c) => ({ id: c.id, name: c.name, ...c.byBranch[b.branchId] })),
            );
            return {
              branchId: b.branchId,
              name: b.name,
              code: b.code,
              ...f,
              stockValue: r2(stock.cost),
              stockRetail: r2(stock.retail),
              stockUnits: r2(stock.units),
              ...t,
              topProducts: products
                .sort((x, y) => y.profit - x.profit)
                .slice(0, 8)
                .map((p) => ({ ...finish({ ...blank(), ...p, count: 0 }), id: p.id, name: p.name, sku: p.sku, category: p.category })),
              categories: cats
                .sort((x, y) => y.revenue - x.revenue)
                .map((c) => ({ ...finish({ ...blank(), ...c, count: 0 }), id: c.id, name: c.name })),
            };
          })
          .sort((a, b) => b.revenue - a.revenue);

        const productRows = Object.values(byProduct).map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          category: p.category,
          ...finish(p),
        }));
        const categoryRows = Object.values(byCategory)
          .map((c) => ({ id: c.id, name: c.name, ...finish(c) }))
          .sort((a, b) => b.revenue - a.revenue);

        const overall = finish(totals);
        const overallTurnover = turnoverFor(totals.cogs, stockTotals.cost);

        return {
          // Kept for existing callers: name/revenue/cogs/profit/count per branch.
          data: branchRows,
          summary: {
            totalRevenue: overall.revenue,
            totalCOGS: overall.cogs,
            grossProfit: overall.profit,
            profitMargin: totals.revenue > 0 ? ((totals.revenue - totals.cogs) / totals.revenue) * 100 : 0,
            transactionCount: totals.count,
            unitsSold: overall.units,
            avgTicket: overall.avgTicket,
            discount: overall.discount,
            tax: overall.tax,
            stockValue: r2(stockTotals.cost),
            stockRetail: r2(stockTotals.retail),
            stockUnits: r2(stockTotals.units),
            turnover: overallTurnover.turnover,
            daysOfStock: overallTurnover.daysOfStock,
            periodDays,
            productCount: productRows.length,
            lossMakingCount: productRows.filter((p) => p.profit < 0).length,
          },
          categories: categoryRows,
          topProducts: [...productRows].sort((a, b) => b.profit - a.profit).slice(0, 10),
          lowMarginProducts: productRows
            .filter((p) => p.revenue > 0)
            .sort((a, b) => a.margin - b.margin)
            .slice(0, 8),
          trend: dayKeys.map((k) => ({
            date: k,
            revenue: r2(byDay[k].revenue),
            cogs: r2(byDay[k].cogs),
            profit: r2(byDay[k].revenue - byDay[k].cogs),
            count: byDay[k].count,
          })),
        };
      }

      default:
        return { data: [], summary: {} };
    }
  }
}
