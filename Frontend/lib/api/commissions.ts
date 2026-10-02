import apiClient from "@/lib/apiClient";
import { post, put, del, cleanParams, type ListMeta } from "./http";

export interface CommissionRecord {
  id: string;
  employee_id: string;
  employee?: {
    id: string;
    name: string;
    employee_code?: string | null;
    commission_rate?: number;
    phone_number?: string | null;
    user?: { id: string; email: string } | null;
    department?: { id: string; name: string } | null;
    employee_type?: { id: string; name: string } | null;
    branch?: { id: string; name: string; code: string } | null;
  } | null;
  month: number;
  year: number;
  sales_amount: number;
  pieces: number;
  bills: number;
  rate: number;
  commission_type?: "PERCENTAGE" | "FIXED_PER_SALE" | "FIXED_PER_PIECE";
  fixed_amount?: number;
  amount: number;
  is_paid: boolean;
  paid_date?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface CommissionSummary {
  totalCommission: number;
  paidAmount: number;
  unpaidAmount: number;
  outstanding: number;
  paidCount: number;
  unpaidCount: number;
  totalPieces: number;
  totalSales: number;
  employeeCount: number;
}

export interface CommissionQuery {
  page?: number;
  limit?: number;
  search?: string;
  isPaid?: boolean;
  month?: string | number;
  year?: string | number;
  employeeId?: string;
  fetchAll?: boolean;
}

export interface CommissionListResult {
  data: CommissionRecord[];
  meta: ListMeta;
  summary: CommissionSummary | null;
}

export interface CommissionPreviewRow {
  employeeId: string;
  employee: string;
  code: string | null;
  designation: string | null;
  userEmail: string | null;
  rate: number;
  commissionType?: "PERCENTAGE" | "FIXED_PER_SALE" | "FIXED_PER_PIECE";
  fixedAmount?: number;
  basis?: string;
  returns?: number;
  bills: number;
  pieces: number;
  salesAmount: number;
  commissionAmount: number;
}

/** "2.5%", "Rs 100 / bill" or "Rs 50 / piece" for a commission record or preview row. */
export function commissionBasisLabel(row: {
  rate?: number;
  commission_type?: string;
  commissionType?: string;
  fixed_amount?: number;
  fixedAmount?: number;
}) {
  const type = row.commission_type || row.commissionType || "PERCENTAGE";
  const fixed = Number(row.fixed_amount ?? row.fixedAmount ?? 0);
  if (type === "FIXED_PER_SALE") return `Rs ${fixed.toLocaleString()} / bill`;
  if (type === "FIXED_PER_PIECE") return `Rs ${fixed.toLocaleString()} / piece`;
  return `${Number(row.rate) || 0}%`;
}

export interface CommissionSaleLine {
  id: string;
  date: string;
  voucher: string;
  status: string;
  customer: string;
  pieces: number;
  salesAmount: number;
  items: Array<{
    product: string;
    sku: string;
    quantity: number;
    amount: number;
    type: string;
  }>;
}

function toParams(q: CommissionQuery): Record<string, unknown> {
  return cleanParams({
    page: q.page ?? 1,
    limit: q.limit ?? 20,
    search: typeof q.search === "string" ? q.search.trim() || undefined : undefined,
    is_paid: q.isPaid === undefined ? undefined : q.isPaid ? "true" : "false",
    month: q.month,
    year: q.year,
    employee_id: q.employeeId,
    fetch_all: q.fetchAll ? "true" : undefined,
  });
}

export async function fetchCommissions(
  q: CommissionQuery = {},
  signal?: AbortSignal,
): Promise<CommissionListResult> {
  const res = await apiClient.get("/commissions", { params: toParams(q), signal });
  const data: CommissionRecord[] = Array.isArray(res.data?.data) ? res.data.data : [];
  const rawMeta = res.data?.meta ?? {};
  const page = Number(q.page ?? 1) || 1;
  const limit = Number(q.limit ?? 20) || 20;
  const s = rawMeta.summary;
  return {
    data,
    meta: {
      total: Number(rawMeta.total ?? data.length) || 0,
      page: Number(rawMeta.page ?? page) || page,
      limit: Number(rawMeta.limit ?? limit) || limit,
      totalPages: Math.max(1, Number(rawMeta.totalPages ?? 1) || 1),
    },
    summary: s
      ? {
          totalCommission: Number(s.totalCommission) || 0,
          paidAmount: Number(s.paidAmount) || 0,
          unpaidAmount: Number(s.unpaidAmount) || 0,
          outstanding: Number(s.outstanding) || 0,
          paidCount: Number(s.paidCount) || 0,
          unpaidCount: Number(s.unpaidCount) || 0,
          totalPieces: Number(s.totalPieces) || 0,
          totalSales: Number(s.totalSales) || 0,
          employeeCount: Number(s.employeeCount) || 0,
        }
      : null,
  };
}

export async function previewCommissions(params: {
  from: string;
  to: string;
  employeeId?: string;
}) {
  const res = await apiClient.get("/commissions/preview", {
    params: cleanParams({
      from: params.from,
      to: params.to,
      employee_id: params.employeeId,
    }),
  });
  return res.data.data as {
    period: { from: string; to: string };
    rows: CommissionPreviewRow[];
    summary: {
      totalSales: number;
      totalPieces: number;
      totalBills: number;
      totalCommission: number;
      employeeCount: number;
    };
  };
}

export function generateCommissions(body: {
  month: number;
  year: number;
  employee_id?: string;
  overwrite?: boolean;
}) {
  return post<{ count: number; data: CommissionRecord[]; period: unknown }>(
    "/commissions/generate",
    body,
  );
}

export function updateCommission(id: string, body: Record<string, unknown>) {
  return put<CommissionRecord>(`/commissions/${id}`, body);
}

export function deleteCommission(id: string) {
  return del<void>(`/commissions/${id}`);
}

export function markCommissionPaid(id: string, body?: Record<string, unknown>) {
  return apiClient
    .patch(`/commissions/${id}/mark-paid`, body ?? { paid_date: new Date().toISOString() })
    .then((r) => r.data);
}

export function markCommissionUnpaid(id: string) {
  return apiClient.patch(`/commissions/${id}/mark-unpaid`).then((r) => r.data);
}

export async function fetchCommissionSales(id: string) {
  const res = await apiClient.get(`/commissions/${id}/sales`);
  return res.data.data as {
    commission: CommissionRecord;
    period: { from: string; to: string };
    sales: CommissionSaleLine[];
    summary: { bills: number; pieces: number; salesAmount: number };
  };
}
