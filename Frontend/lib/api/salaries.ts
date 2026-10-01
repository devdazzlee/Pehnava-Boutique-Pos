import apiClient from "@/lib/apiClient";
import { getList, post, put, del, cleanParams, type ListMeta } from "./http";

export interface SalaryRecord {
  id: string;
  employee_id: string;
  employee?: {
    id: string;
    name: string;
    employee_code?: string | null;
    phone_number?: string | null;
    email?: string | null;
    monthly_salary?: number | string | null;
    commission_rate?: number | string | null;
    bank_name?: string | null;
    account_title?: string | null;
    account_number?: string | null;
    iban?: string | null;
    department?: { id: string; name: string } | null;
    employee_type?: { id: string; name: string } | null;
    branch?: { id: string; name: string; code: string } | null;
  } | null;
  month: number;
  year: number;
  amount: number | string;
  loan_amount?: number | string;
  net_payable?: number | string;
  commission_amount?: number | string;
  commission_rate?: number | string;
  commission_is_paid?: boolean;
  total_with_commission?: number | string;
  is_paid: boolean;
  paid_date?: string | null;
  notes?: string | null;
  created_at?: string;
  [key: string]: unknown;
}

export interface SalarySummary {
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  loanAmount: number;
  netPayable: number;
  paidCount: number;
  unpaidCount: number;
  employeeCount: number;
}

export interface SalaryEmployeeTotals {
  employeeId: string;
  name: string;
  code: string | null;
  totalSalary: number;
  totalPaid: number;
  totalUnpaid: number;
  totalLoan: number;
}

export interface SalaryQuery {
  page?: number;
  limit?: number;
  search?: string;
  isPaid?: boolean;
  month?: string | number;
  year?: string | number;
  employeeId?: string;
  paidFrom?: string;
  paidTo?: string;
  fetchAll?: boolean;
}

export interface SalaryListResult {
  data: SalaryRecord[];
  meta: ListMeta;
  summary: SalarySummary | null;
  employeeTotals: SalaryEmployeeTotals | null;
}

function toParams(q: SalaryQuery): Record<string, unknown> {
  return cleanParams({
    page: q.page ?? 1,
    limit: q.limit ?? 20,
    search: typeof q.search === "string" ? q.search.trim() || undefined : undefined,
    is_paid: q.isPaid === undefined ? undefined : q.isPaid ? "true" : "false",
    month: q.month,
    year: q.year,
    employee_id: q.employeeId,
    paid_from: q.paidFrom,
    paid_to: q.paidTo,
    fetch_all: q.fetchAll ? "true" : undefined,
  });
}

export async function fetchSalaries(
  q: SalaryQuery = {},
  signal?: AbortSignal,
): Promise<SalaryListResult> {
  const res = await apiClient.get("/salaries", { params: toParams(q), signal });
  const data: SalaryRecord[] = Array.isArray(res.data?.data) ? res.data.data : [];
  const rawMeta = res.data?.meta ?? {};
  const page = Number(q.page ?? 1) || 1;
  const limit = Number(q.limit ?? 20) || 20;
  const s = rawMeta.summary;
  const et = rawMeta.employeeTotals;
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
          totalAmount: Number(s.totalAmount) || 0,
          paidAmount: Number(s.paidAmount) || 0,
          unpaidAmount: Number(s.unpaidAmount) || 0,
          loanAmount: Number(s.loanAmount) || 0,
          netPayable: Number(s.netPayable) || 0,
          paidCount: Number(s.paidCount) || 0,
          unpaidCount: Number(s.unpaidCount) || 0,
          employeeCount: Number(s.employeeCount) || 0,
        }
      : null,
    employeeTotals: et
      ? {
          employeeId: String(et.employeeId),
          name: String(et.name || ""),
          code: et.code ?? null,
          totalSalary: Number(et.totalSalary) || 0,
          totalPaid: Number(et.totalPaid) || 0,
          totalUnpaid: Number(et.totalUnpaid) || 0,
          totalLoan: Number(et.totalLoan) || 0,
        }
      : null,
  };
}

export type SalaryPayload = Record<string, unknown>;

export function createSalary(body: SalaryPayload) {
  return post<SalaryRecord>("/salaries", body);
}

export function updateSalary(id: string, body: SalaryPayload) {
  return put<SalaryRecord>(`/salaries/${id}`, body);
}

export function deleteSalary(id: string) {
  return del<void>(`/salaries/${id}`);
}

export function markSalaryPaid(id: string, body?: SalaryPayload) {
  return apiClient
    .patch(`/salaries/${id}/mark-paid`, body ?? { paid_date: new Date().toISOString() })
    .then((r) => r.data);
}

export function markSalaryUnpaid(id: string) {
  return apiClient.patch(`/salaries/${id}/mark-unpaid`).then((r) => r.data);
}
