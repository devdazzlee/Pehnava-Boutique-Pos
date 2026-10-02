import { getOne, post, cleanParams } from "./http";
import apiClient from "@/lib/apiClient";

export const PR_STATUSES = ["PENDING", "COMPLETED", "CANCELLED"] as const;
export type PurchaseReturnStatus = (typeof PR_STATUSES)[number];

export interface PurchaseReturnItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  product?: { id: string; name: string; sku: string | null; code: string | null };
}

export interface PurchaseReturn {
  id: string;
  return_number: string;
  status: PurchaseReturnStatus;
  return_date: string;
  reason: string | null;
  notes: string | null;
  total_amount: number;
  supplier?: { id: string; name: string; code: string };
  branch?: { id: string; name: string };
  user?: { id: string; email: string };
  items: PurchaseReturnItem[];
}

export interface PurchaseReturnQuery {
  page?: number;
  limit?: number;
  supplierId?: string;
  status?: PurchaseReturnStatus;
  from?: string;
  to?: string;
}

export interface PurchaseReturnPayload {
  supplier_id: string;
  branch_id?: string;
  return_date?: string;
  reason?: string | null;
  notes?: string | null;
  items: {
    product_id: string;
    quantity: number;
    unit_cost: number;
    purchase_id: string;
  }[];
}

export interface ReturnableBillLine {
  purchase_id: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  purchased_qty: number;
  already_returned: number;
  returnable_qty: number;
  on_hand: number;
  unit_cost: number;
}

export interface ReturnableBill {
  bill_group_id: string;
  purchase_date: string;
  invoice_ref: string | null;
  line_count: number;
  returnable_qty: number;
  returnable_value: number;
  lines: ReturnableBillLine[];
}

export async function fetchReturnableBills(
  supplierId: string,
  branchId: string,
  signal?: AbortSignal,
): Promise<ReturnableBill[]> {
  const res = await apiClient.get("/purchase-returns/returnable-bills", {
    params: cleanParams({ supplier_id: supplierId, branch_id: branchId }),
    signal,
  });
  return Array.isArray(res.data?.data) ? res.data.data : [];
}

export async function fetchPurchaseReturns(
  q: PurchaseReturnQuery,
  signal?: AbortSignal,
): Promise<{ data: PurchaseReturn[]; meta: { total: number; page: number; limit: number; totalPages: number; summary: { totalReturned: number } } }> {
  const res = await apiClient.get("/purchase-returns", {
    params: cleanParams({
      page: q.page ?? 1,
      limit: q.limit ?? 20,
      supplier_id: q.supplierId,
      status: q.status,
      from: q.from,
      to: q.to,
    }),
    signal,
  });
  const data: PurchaseReturn[] = Array.isArray(res.data?.data) ? res.data.data : [];
  const m = res.data?.meta ?? {};
  return {
    data,
    meta: {
      total: Number(m.total ?? data.length) || 0,
      page: Number(m.page ?? q.page ?? 1) || 1,
      limit: Number(m.limit ?? q.limit ?? 20) || 20,
      totalPages: Math.max(1, Number(m.totalPages ?? 1) || 1),
      summary: { totalReturned: Number(m.summary?.totalReturned) || 0 },
    },
  };
}

export const fetchPurchaseReturnById = (id: string, signal?: AbortSignal) =>
  getOne<PurchaseReturn>(`/purchase-returns/${id}`, { signal });

export const createPurchaseReturn = (body: PurchaseReturnPayload) =>
  post<PurchaseReturn>("/purchase-returns", body);

export const cancelPurchaseReturn = (id: string) =>
  apiClient.post(`/purchase-returns/${id}/cancel`).then((r) => r.data?.data as PurchaseReturn);
