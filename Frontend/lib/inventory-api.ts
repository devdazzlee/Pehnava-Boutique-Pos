import apiClient from "@/lib/apiClient";

export interface InventoryBranchSummary {
  branchId: string;
  name: string;
  value: number;
  items: number;
  type?: string;
  quantity?: number;
  retail?: number;
  lowCount?: number;
  outCount?: number;
}

export interface InventoryCategorySummary {
  name: string;
  value: number;
  items: number;
  quantity?: number;
  retail?: number;
}

export interface InventoryVelocityItem {
  productId?: string;
  name: string;
  sku?: string;
  quantity: number;
  onHand?: number;
  sold30?: number;
  daysOfCover?: number | null;
}

export interface InventoryLowStockAlert {
  productId?: string;
  product: { id?: string; name?: string; sku?: string; code?: string } | null;
  branch: { id?: string; name?: string } | null;
  currentQuantity: number;
  minThreshold: number;
  maxQuantity?: number;
  sold30?: number;
  daysOfCover?: number | null;
  suggestedReorder?: number;
}

export interface InventoryStockRow {
  productId: string;
  name: string;
  sku: string;
  branch: { id: string; name: string };
  quantity: number;
}

export interface InventoryInsights {
  retailValue: number;
  potentialProfit: number;
  marginPct: number;
  reservedQuantity: number;
  overstockCount: number;
  overstockItems: (InventoryStockRow & { maxQuantity: number; excess: number; excessValue: number })[];
  deadStockCount: number;
  deadStockValue: number;
  deadStockItems: (InventoryStockRow & { value: number; lastSaleAt: string | null })[];
  topValueItems: { productId: string; name: string; sku: string; category: string; quantity: number; value: number; retail: number }[];
  outOfStockItems: (InventoryStockRow & { sold30: number })[];
  dailyTrend: { date: string; stockIn: number; stockOut: number; sold: number }[];
  movementSummary: { stockIn7: number; stockOut7: number; sold7: number; sold30: number };
}

export interface InventoryPendingTransfer {
  id: string;
  quantity: number;
  status: string;
  transferDate?: string;
  product: { id?: string; name?: string } | null;
  from_branch: { id?: string; name?: string } | null;
  to_branch: { id?: string; name?: string } | null;
}

export interface InventoryRecentPurchase {
  id: string;
  quantity: number;
  costPrice: number;
  purchaseDate?: string;
  product: { id?: string; name?: string } | null;
  supplier: { id?: string; name?: string } | null;
}

export interface InventoryMovementTrend {
  movement_type: string;
  count: number;
  quantity?: number;
  _count?: number;
}

export interface InventoryDashboardStats {
  totalInventoryValue: number;
  positiveInventoryValue: number;
  totalStockQuantity: number;
  negativeStockCount: number;
  lowStockCount: number;
  totalSkus: number;
  outOfStockCount: number;
  totalLocations: number;
  pendingTransferCount: number;
  branchSummary: InventoryBranchSummary[];
  categorySummary: InventoryCategorySummary[];
  velocity: InventoryVelocityItem[];
  recentPurchases: InventoryRecentPurchase[];
  pendingTransfers: InventoryPendingTransfer[];
  lowStockAlerts: InventoryLowStockAlert[];
  movementTrend: InventoryMovementTrend[];
  procurementHealth: { count: number; totalValue: number };
  warehouse: { id: string; name: string } | null;
  filteredBranchId: string | null;
  insights: InventoryInsights;
}

export interface BranchOption {
  id: string;
  name: string;
  branch_type?: string;
  is_active?: boolean;
}

function unwrapData<T>(payload: any): T {
  return (payload?.data ?? payload) as T;
}

export async function fetchInventoryDashboard(
  branchId?: string,
): Promise<InventoryDashboardStats> {
  const res = await apiClient.get("/inventory/dashboard", {
    params: branchId ? { branchId } : {},
  });
  const data = unwrapData<Partial<InventoryDashboardStats>>(res.data);

  return {
    totalInventoryValue: Number(data.totalInventoryValue || 0),
    positiveInventoryValue: Number(
      data.positiveInventoryValue ?? data.totalInventoryValue ?? 0,
    ),
    totalStockQuantity: Number(data.totalStockQuantity || 0),
    negativeStockCount: Number(data.negativeStockCount || 0),
    lowStockCount: Number(
      data.lowStockCount ?? data.lowStockAlerts?.length ?? 0,
    ),
    totalSkus: Number(data.totalSkus || 0),
    outOfStockCount: Number(data.outOfStockCount || 0),
    totalLocations: Number(data.totalLocations || 0),
    pendingTransferCount: Number(
      data.pendingTransferCount ?? data.pendingTransfers?.length ?? 0,
    ),
    branchSummary: Array.isArray(data.branchSummary) ? data.branchSummary : [],
    categorySummary: Array.isArray(data.categorySummary)
      ? data.categorySummary
      : [],
    velocity: Array.isArray(data.velocity) ? data.velocity : [],
    recentPurchases: Array.isArray(data.recentPurchases)
      ? data.recentPurchases
      : [],
    pendingTransfers: Array.isArray(data.pendingTransfers)
      ? data.pendingTransfers
      : [],
    lowStockAlerts: Array.isArray(data.lowStockAlerts)
      ? data.lowStockAlerts
      : [],
    movementTrend: Array.isArray(data.movementTrend) ? data.movementTrend : [],
    procurementHealth: {
      count: Number(data.procurementHealth?.count || 0),
      totalValue: Number(data.procurementHealth?.totalValue || 0),
    },
    warehouse: data.warehouse ?? null,
    filteredBranchId: data.filteredBranchId ?? null,
    insights: {
      retailValue: Number((data as any).retailValue || 0),
      potentialProfit: Number((data as any).potentialProfit || 0),
      marginPct: Number((data as any).marginPct || 0),
      reservedQuantity: Number((data as any).reservedQuantity || 0),
      overstockCount: Number((data as any).overstockCount || 0),
      overstockItems: Array.isArray((data as any).overstockItems) ? (data as any).overstockItems : [],
      deadStockCount: Number((data as any).deadStockCount || 0),
      deadStockValue: Number((data as any).deadStockValue || 0),
      deadStockItems: Array.isArray((data as any).deadStockItems) ? (data as any).deadStockItems : [],
      topValueItems: Array.isArray((data as any).topValueItems) ? (data as any).topValueItems : [],
      outOfStockItems: Array.isArray((data as any).outOfStockItems) ? (data as any).outOfStockItems : [],
      dailyTrend: Array.isArray((data as any).dailyTrend) ? (data as any).dailyTrend : [],
      movementSummary: {
        stockIn7: Number((data as any).movementSummary?.stockIn7 || 0),
        stockOut7: Number((data as any).movementSummary?.stockOut7 || 0),
        sold7: Number((data as any).movementSummary?.sold7 || 0),
        sold30: Number((data as any).movementSummary?.sold30 || 0),
      },
    },
  };
}

export async function fetchBranchesForFilter(): Promise<BranchOption[]> {
  const res = await apiClient.get("/branches", {
    params: { page: 1, limit: 100 },
  });
  const data = unwrapData<BranchOption[]>(res.data);
  return Array.isArray(data) ? data : [];
}
