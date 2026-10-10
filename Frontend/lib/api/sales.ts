import apiClient from "@/lib/apiClient";
import { getOne, del, cleanParams, type ListMeta } from "./http";

/**
 * `/sale` list rows are screen-shaped (deep item / customer / branch trees), so
 * they stay loosely typed here and the screen keeps its own `Sale` interface.
 */
export interface SaleRecord {
  id: string;
  sale_number?: string;
  sale_date?: string;
  total_amount?: string | number;
  [key: string]: unknown;
}

export interface SaleCashier {
  id: string;
  email: string;
  role?: string;
}

export interface SalesSummary {
  totalSales: number;
  totalPaid?: number;
  totalOrders: number;
  completedOrders: number;
  totalRefunds: number;
  refundCount: number;
  averageOrderValue: number;
  totalTaxCollected: number;
  totalDiscounts: number;
}

/**
 * Every filter the sales-history screen's `buildParams()` produces. Names match
 * the query string the old screen sent verbatim so the endpoint contract is
 * unchanged.
 */
export interface SalesQuery {
  page?: number;
  limit?: number;
  search?: string;
  /** order status (`params.status`) */
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  cashierId?: string;
  /** employee credited with the sale; "none" = no salesperson picked */
  salespersonId?: string;
  /** resolved branch id (`params.branchId`) */
  branchId?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  /** When true (default), return rows appear like old POS. */
  includeReturns?: boolean;
}

export interface SalesListResult {
  data: SaleRecord[];
  meta: ListMeta;
  summary: SalesSummary | null;
  cashiers: SaleCashier[];
}

function toParams(q: SalesQuery): Record<string, unknown> {
  return cleanParams({
    page: q.page,
    limit: q.limit,
    search: q.search,
    paymentMethod: q.paymentMethod,
    paymentStatus: q.paymentStatus,
    status: q.status,
    cashierId: q.cashierId,
    salespersonId: q.salespersonId,
    branchId: q.branchId,
    startDate: q.startDate,
    endDate: q.endDate,
    sortBy: q.sortBy,
    sortOrder: q.sortOrder,
    includeReturns: q.includeReturns === false ? false : true,
  });
}

const isValidSale = (s: SaleRecord) =>
  Boolean(s?.id) &&
  Boolean(s?.sale_number) &&
  Boolean(s?.sale_date) &&
  s?.total_amount !== undefined;

/**
 * `GET /sale` — the envelope is `{ data: Sale[], meta: { total, totalPages,
 * page, limit, summary, cashiers } }`. `summary` and `cashiers` are extra
 * fields the standard `getList` helper would drop, so this unwraps by hand.
 */
export async function fetchSales(
  q: SalesQuery,
  signal?: AbortSignal,
): Promise<SalesListResult> {
  const res = await apiClient.get("/sale", { params: toParams(q), signal });
  const rawData: SaleRecord[] = Array.isArray(res.data?.data) ? res.data.data : [];
  const data = rawData.filter(isValidSale);
  const rawMeta = res.data?.meta ?? {};
  const page = Number(q.page ?? 1) || 1;
  const limit = Number(q.limit ?? 25) || 25;

  return {
    data,
    meta: {
      total: Number(rawMeta.total ?? data.length) || 0,
      page: Number(rawMeta.page ?? page) || page,
      limit: Number(rawMeta.limit ?? limit) || limit,
      totalPages: Math.max(1, Number(rawMeta.totalPages ?? 1) || 1),
    },
    summary: (rawMeta.summary as SalesSummary) ?? null,
    cashiers: Array.isArray(rawMeta.cashiers) ? (rawMeta.cashiers as SaleCashier[]) : [],
  };
}

export function fetchSaleById(id: string, signal?: AbortSignal): Promise<SaleRecord> {
  return getOne<SaleRecord>(`/sale/${id}`, { signal });
}

export function deleteSale(id: string) {
  return del<void>(`/sale/${id}`);
}

export function cancelSale(id: string, reason?: string) {
  return apiClient.patch(`/sale/${id}/cancel`, { reason }).then((r) => r.data);
}

/**
 * One un-paginated pull for the export feature. Reproduces the old screen's
 * `buildParams({ forExport: true, page: 1, limit: 5000 })` — page 1, a large
 * limit, and every active filter. Deliberately a plain async fn, not a hook.
 */
export async function fetchAllSalesForExport(q: SalesQuery): Promise<SaleRecord[]> {
  const res = await apiClient.get("/sale", {
    params: toParams({ ...q, page: 1, limit: 5000 }),
  });
  return Array.isArray(res.data?.data) ? res.data.data : [];
}
