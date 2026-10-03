import { getOne, post, del, cleanParams } from "./http";
import apiClient from "@/lib/apiClient";

export const EXPENSE_PAYMENT_METHODS = [
  "CASH",
  "BANK",
  "CARD",
  "MOBILE_MONEY",
  "CHEQUE",
  "OTHER",
] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

export const EXPENSE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const RECURRING_FREQUENCIES = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  expense_count: number;
  recurring_count: number;
  created_at: string;
}

export interface Expense {
  id: string;
  particular: string;
  amount: number;
  payment_method: ExpensePaymentMethod;
  status: ExpenseStatus;
  bank_account: string | null;
  reference: string | null;
  vendor: string | null;
  notes: string | null;
  expense_date: string;
  approved_at: string | null;
  rejection_reason: string | null;
  cashflow_id: string | null;
  recurring_id: string | null;
  category?: { id: string; name: string } | null;
  account?: { id: string; code: string; name: string } | null;
  branch?: { id: string; name: string } | null;
  creator?: { id: string; email: string } | null;
  approver?: { id: string; email: string } | null;
  _count?: { attachments: number };
  created_at: string;
}

export interface ExpenseListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: {
    totalAmount: number;
    pendingAmount: number;
    approvedAmount: number;
    rejectedAmount: number;
    pendingCount: number;
  };
}

export interface ExpenseQuery {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  paymentMethod?: ExpensePaymentMethod;
  status?: ExpenseStatus;
  from?: string;
  to?: string;
}

export interface ExpensePayload {
  particular: string;
  amount: number;
  category_id?: string | null;
  account_id?: string | null;
  payment_method?: ExpensePaymentMethod;
  bank_account?: string | null;
  reference?: string | null;
  vendor?: string | null;
  notes?: string | null;
  expense_date?: string;
}

export interface RecurringExpense {
  id: string;
  particular: string;
  amount: number;
  payment_method: ExpensePaymentMethod;
  bank_account: string | null;
  vendor: string | null;
  notes: string | null;
  frequency: RecurringFrequency;
  interval: number;
  start_date: string;
  end_date: string | null;
  next_run_date: string;
  last_run_date: string | null;
  is_active: boolean;
  auto_approve: boolean;
  category?: { id: string; name: string } | null;
  account?: { id: string; code: string; name: string } | null;
  branch?: { id: string; name: string } | null;
  _count?: { generated: number };
}

export interface RecurringExpensePayload {
  particular: string;
  amount: number;
  category_id?: string | null;
  account_id?: string | null;
  payment_method?: ExpensePaymentMethod;
  bank_account?: string | null;
  vendor?: string | null;
  notes?: string | null;
  frequency: RecurringFrequency;
  interval?: number;
  start_date?: string;
  end_date?: string | null;
  auto_approve?: boolean;
  is_active?: boolean;
}

export interface ExpenseReport {
  summary: { total: number; count: number };
  byCategory: { categoryId: string | null; category: string; amount: number; count: number }[];
  byPaymentMethod: { method: string; amount: number; count: number }[];
  byStatus: { status: string; amount: number; count: number }[];
  byMonth: { month: string; amount: number }[];
}

/* --------------------------- categories --------------------------- */

export function fetchExpenseCategories(params: { search?: string; isActive?: boolean } = {}) {
  return getOne<ExpenseCategory[]>("/expenses/categories", {
    params: cleanParams({ search: params.search, is_active: params.isActive }),
  });
}
export const createExpenseCategory = (body: { name: string; description?: string; is_active?: boolean }) =>
  post<ExpenseCategory>("/expenses/categories", body);
export const updateExpenseCategory = (
  id: string,
  body: { name?: string; description?: string | null; is_active?: boolean },
) => apiClient.patch(`/expenses/categories/${id}`, body).then((r) => r.data?.data);
export const toggleExpenseCategory = (id: string) =>
  apiClient.patch(`/expenses/categories/${id}/toggle`).then((r) => r.data?.data);
export const deleteExpenseCategory = (id: string) => del<void>(`/expenses/categories/${id}`);

/* ---------------------------- expenses ---------------------------- */

export async function fetchExpenses(
  q: ExpenseQuery,
  signal?: AbortSignal,
): Promise<{ data: Expense[]; meta: ExpenseListMeta }> {
  // Direct call (not getList) so the extended `meta.summary` survives.
  const res = await apiClient.get("/expenses", {
    params: cleanParams({
      page: q.page ?? 1,
      limit: q.limit ?? 20,
      search: q.search?.trim() || undefined,
      category_id: q.categoryId,
      payment_method: q.paymentMethod,
      status: q.status,
      from: q.from,
      to: q.to,
    }),
    signal,
  });
  const data: Expense[] = Array.isArray(res.data?.data) ? res.data.data : [];
  const rawMeta = res.data?.meta ?? {};
  return {
    data,
    meta: {
      total: Number(rawMeta.total ?? data.length) || 0,
      page: Number(rawMeta.page ?? q.page ?? 1) || 1,
      limit: Number(rawMeta.limit ?? q.limit ?? 20) || 20,
      totalPages: Math.max(1, Number(rawMeta.totalPages ?? 1) || 1),
      summary: {
        totalAmount: Number(rawMeta.summary?.totalAmount) || 0,
        pendingAmount: Number(rawMeta.summary?.pendingAmount) || 0,
        approvedAmount: Number(rawMeta.summary?.approvedAmount) || 0,
        rejectedAmount: Number(rawMeta.summary?.rejectedAmount) || 0,
        pendingCount: Number(rawMeta.summary?.pendingCount) || 0,
      },
    },
  };
}

export const fetchExpenseById = (id: string, signal?: AbortSignal) =>
  getOne<Expense>(`/expenses/${id}`, { signal });
export const createExpense = (body: ExpensePayload) => post<Expense>("/expenses", body);
export const updateExpense = (id: string, body: Partial<ExpensePayload>) =>
  apiClient.patch(`/expenses/${id}`, body).then((r) => r.data?.data as Expense);
export const deleteExpense = (id: string) => del<void>(`/expenses/${id}`);
export const approveExpense = (id: string) =>
  apiClient.patch(`/expenses/${id}/approve`).then((r) => r.data?.data as Expense);
export const rejectExpense = (id: string, reason?: string) =>
  apiClient.patch(`/expenses/${id}/reject`, { reason }).then((r) => r.data?.data as Expense);

export function fetchExpenseReport(
  params: { from?: string; to?: string } = {},
  signal?: AbortSignal,
) {
  return getOne<ExpenseReport>("/expenses/report", {
    params: cleanParams({ from: params.from, to: params.to }),
    signal,
  });
}

/* ------------------------ recurring expenses ------------------------ */

export const fetchRecurringExpenses = (params: { isActive?: boolean } = {}) =>
  getOne<RecurringExpense[]>("/expenses/recurring", {
    params: cleanParams({ is_active: params.isActive }),
  });
export const createRecurringExpense = (body: RecurringExpensePayload) =>
  post<RecurringExpense>("/expenses/recurring", body);
export const updateRecurringExpense = (id: string, body: Partial<RecurringExpensePayload>) =>
  apiClient.patch(`/expenses/recurring/${id}`, body).then((r) => r.data?.data as RecurringExpense);
export const toggleRecurringExpense = (id: string) =>
  apiClient.patch(`/expenses/recurring/${id}/toggle`).then((r) => r.data?.data as RecurringExpense);
export const deleteRecurringExpense = (id: string) => del<void>(`/expenses/recurring/${id}`);
export const runRecurringExpenses = () =>
  post<{ generated: number; templates: number }>("/expenses/recurring/run");
