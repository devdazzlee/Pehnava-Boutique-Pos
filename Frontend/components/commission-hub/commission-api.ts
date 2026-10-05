import apiClient from "@/lib/apiClient";

export type CommissionType = "PERCENTAGE" | "FIXED_PER_SALE" | "FIXED_PER_PIECE";

export interface EarnedRow {
  employeeId: string;
  employee: string;
  code: string | null;
  designation: string | null;
  userEmail: string | null;
  branch: string | null;
  phone: string | null;
  rate: number;
  commissionType: CommissionType;
  fixedAmount: number;
  basis: string;
  bills: number;
  returns: number;
  pieces: number;
  salesAmount: number;
  commissionAmount: number;
  averageBill: number;
  share: number;
  previous: number;
}

export interface EarnedReport {
  period: { from: string; to: string; days: number; isToday: boolean };
  previous: { from: string; to: string; commission: number; sales: number };
  summary: { commission: number; sales: number; bills: number; returns: number; pieces: number; employees: number; effectiveRate: number };
  rows: EarnedRow[];
  daily: { date: string; sales: number; bills: number; pieces: number; commission: number }[];
  unattributed: { bills: number; amount: number; byUser: { user: string; bills: number; amount: number }[] };
}

export interface CommissionRecord {
  id: string;
  employee_id: string;
  month: number;
  year: number;
  sales_amount: number;
  pieces: number;
  bills: number;
  rate: number;
  commission_type: CommissionType;
  fixed_amount: number;
  base_amount: number;
  adjustment: number;
  adjustment_note: string | null;
  amount: number;
  paid_amount?: number;
  outstanding?: number;
  status?: "UNPAID" | "PARTIAL" | "PAID";
  is_paid: boolean;
  paid_date: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  notes: string | null;
  employee: {
    id: string;
    name: string;
    employee_code: string | null;
    phone_number: string | null;
    branch: { name: string } | null;
    employee_type: { name: string } | null;
    user: { email: string } | null;
  };
}

export const commissionDue = (r: Pick<CommissionRecord, "amount" | "paid_amount" | "outstanding">) =>
  Number(r.outstanding ?? Math.max(0, Number(r.amount || 0) - Number(r.paid_amount || 0)));

export const commissionStatus = (r: Pick<CommissionRecord, "is_paid" | "paid_amount" | "status" | "amount">): "UNPAID" | "PARTIAL" | "PAID" => {
  if (r.status === "PAID" || r.status === "PARTIAL" || r.status === "UNPAID") return r.status;
  if (r.is_paid) return "PAID";
  if (Number(r.paid_amount || 0) > 0.005) return "PARTIAL";
  return "UNPAID";
};

export interface RecordsMeta {
  total: number;
  summary: { totalCommission: number; paidAmount: number; unpaidAmount: number; paidCount: number; unpaidCount: number; totalPieces: number; totalSales: number; employeeCount: number };
}

export interface Salesperson {
  id: string;
  name: string;
  employee_code: string | null;
  user_id: string | null;
  commission_type: CommissionType;
  commission_rate: number;
  commission_fixed: number;
  commission_label: string;
  branch: { id: string; name: string } | null;
  employee_type: { name: string } | null;
}

export interface PosUser {
  id: string;
  email: string;
  role: string;
  branch: { name: string } | null;
  employee: { id: string; name: string } | null;
}

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const PAY_METHODS = [
  { id: "CASH", label: "Cash" },
  { id: "BANK_TRANSFER", label: "Bank transfer" },
  { id: "MOBILE_MONEY", label: "Wallet (JazzCash / Easypaisa)" },
  { id: "CHEQUE", label: "Cheque" },
  { id: "WITH_SALARY", label: "With salary" },
];
export const methodLabel = (m?: string | null) => PAY_METHODS.find((x) => x.id === m)?.label ?? m ?? "—";

export const rs = (v: number | null | undefined) => `Rs ${Math.round(Number(v || 0)).toLocaleString("en-PK")}`;
export const basisText = (type: CommissionType, rate: number, fixed: number) =>
  type === "FIXED_PER_SALE" ? `Rs ${fixed.toLocaleString("en-PK")} per bill` : type === "FIXED_PER_PIECE" ? `Rs ${fixed.toLocaleString("en-PK")} per piece` : `${rate}% of sales`;

export function apiError(e: unknown, fallback = "Something went wrong") {
  const err = e as { response?: { data?: { message?: string } }; message?: string };
  return err?.response?.data?.message || err?.message || fallback;
}

const data = <T,>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data);

export const commissionApi = {
  earned: (params: { from: string; to: string; employee_id?: string }) => data<EarnedReport>(apiClient.get("/commissions/earned", { params })),
  records: (params: Record<string, unknown>) =>
    apiClient.get("/commissions", { params: { fetch_all: "true", ...params } }).then((r) => ({ rows: r.data.data as CommissionRecord[], meta: r.data.meta as RecordsMeta })),
  generate: (body: { month: number; year: number; employee_id?: string; overwrite?: boolean }) =>
    data<{ count: number; created: number; skippedPaid: number; skippedExisting: number }>(apiClient.post("/commissions/generate", body)),
  pay: (id: string, body: { amount: number; paid_date: string; payment_method: string; payment_reference?: string | null }) =>
    data<CommissionRecord>(apiClient.post(`/commissions/${id}/pay`, body)),
  bulkPay: (body: { ids: string[]; paid_date: string; payment_method: string; payment_reference?: string | null }) => data<{ paid: number; amount: number }>(apiClient.post("/commissions/bulk-pay", body)),
  unpay: (id: string) => data<CommissionRecord>(apiClient.patch(`/commissions/${id}/mark-unpaid`)),
  update: (id: string, body: Record<string, unknown>) => data<CommissionRecord>(apiClient.put(`/commissions/${id}`, body)),
  remove: (id: string) => apiClient.delete(`/commissions/${id}`),
  sales: (id: string) =>
    data<{
      period: { from: string; to: string };
      sales: { id: string; date: string; voucher: string; isReturn: boolean; customer: string; pieces: number; salesAmount: number; attribution: string }[];
      summary: { bills: number; pieces: number; salesAmount: number };
    }>(apiClient.get(`/commissions/${id}/sales`)),
  salespeople: () => data<Salesperson[]>(apiClient.get("/commissions/salespeople")),
  posUsers: () => apiClient.get("/employee/pos-users").then((r) => (Array.isArray(r.data?.data) ? r.data.data : []) as PosUser[]),
  saveRule: (employeeId: string, body: { user_id?: string | null; commission_type: CommissionType; commission_rate: number; commission_fixed: number }) =>
    apiClient.put(`/employee/${employeeId}`, body),
};
