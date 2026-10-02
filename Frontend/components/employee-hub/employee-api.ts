import apiClient from "@/lib/apiClient";

export type CommissionType = "PERCENTAGE" | "FIXED_PER_SALE" | "FIXED_PER_PIECE";
export type EmployeeStatus = "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "TERMINATED";
export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";
export type SlipStatus = "PAID" | "PARTIAL" | "UNPAID";

export interface Named {
  id: string;
  name: string;
}

export interface Payslip {
  id: string;
  employee_id: string;
  month: number;
  year: number;
  amount: number;
  bonus: number;
  allowances: number;
  deductions: number;
  advance_deduction: number;
  loan_amount: number;
  paid_amount: number;
  gross: number;
  net_payable: number;
  due: number;
  status: SlipStatus;
  period_label: string;
  is_paid: boolean;
  paid_date: string | null;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
  commission?: { id: string; amount: number; is_paid: boolean; sales_amount: number } | null;
}

export interface EmployeeRow {
  id: string;
  name: string;
  employee_code: string | null;
  phone_number: string | null;
  email: string | null;
  cnic: string | null;
  photo_url: string | null;
  status: EmployeeStatus;
  is_active: boolean;
  join_date: string;
  employment_type: EmploymentType;
  monthly_salary: number;
  commission_type: CommissionType;
  commission_rate: number;
  commission_fixed: number;
  commission_label: string;
  user_id: string | null;
  bank_name: string | null;
  account_title: string | null;
  account_number: string | null;
  iban: string | null;
  address: string | null;
  department: Named | null;
  employee_type: Named | null;
  branch: { id: string; name: string; code: string } | null;
  user: { id: string; email: string } | null;
  month_salary: Payslip | null;
  salary_paid_total: number;
  salary_due_total: number;
  last_paid_date: string | null;
  advance_balance: number;
  commission_due: number;
  month_sales: { bills: number; pieces: number; sales: number; commission: number };
}

export interface Overview {
  period: { month: number; year: number; label: string; from: string; to: string };
  totals: {
    headcount: number;
    active: number;
    monthlyPayroll: number;
    slipsGenerated: number;
    slipsMissing: number;
    monthNet: number;
    monthPaid: number;
    monthDue: number;
    salaryDueAll: number;
    advancesOutstanding: number;
    monthSales: number;
    monthBills: number;
    monthCommission: number;
    commissionDue: number;
  };
  employees: EmployeeRow[];
}

export interface AdvanceEntry {
  id: string;
  type: "ADVANCE" | "RECOVERY";
  amount: number;
  txn_date: string;
  method: string;
  reference: string | null;
  notes: string | null;
  salary_id: string | null;
  balance: number;
}

export interface CommissionRow {
  id: string;
  month: number;
  year: number;
  period_label: string;
  sales_amount: number;
  bills: number;
  pieces: number;
  amount: number;
  commission_type: CommissionType;
  rate: number;
  fixed_amount: number;
  is_paid: boolean;
  paid_date: string | null;
}

export interface FinanceFile {
  employee: Omit<EmployeeRow, "month_salary" | "salary_paid_total" | "salary_due_total" | "last_paid_date" | "advance_balance" | "commission_due" | "month_sales">;
  totals: {
    salaryPaidLifetime: number;
    salaryDue: number;
    ytdGross: number;
    ytdPaid: number;
    bonusesLifetime: number;
    deductionsLifetime: number;
    commissionEarned: number;
    commissionPaid: number;
    commissionDue: number;
    advanceGiven: number;
    advanceRecovered: number;
    advanceBalance: number;
    slipCount: number;
  };
  salaries: Payslip[];
  advances: AdvanceEntry[];
  commissions: CommissionRow[];
}

/* ------------------------------ labels ------------------------------ */

export const STATUS_META: Record<EmployeeStatus, { label: string; tone: string; dot: string }> = {
  ACTIVE: { label: "Active", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  ON_LEAVE: { label: "On leave", tone: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  INACTIVE: { label: "Inactive", tone: "bg-gray-100 text-gray-600 ring-gray-200", dot: "bg-gray-400" },
  TERMINATED: { label: "Terminated", tone: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" },
};

export const SLIP_META: Record<SlipStatus, { label: string; tone: string }> = {
  PAID: { label: "Paid", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  PARTIAL: { label: "Partly paid", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  UNPAID: { label: "Unpaid", tone: "bg-rose-50 text-rose-700 ring-rose-200" },
};

export const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: "Full time",
  PART_TIME: "Part time",
  CONTRACT: "Contract",
  INTERN: "Intern",
};

export const COMMISSION_TYPES: { value: CommissionType; label: string; hint: string }[] = [
  { value: "PERCENTAGE", label: "% of sales", hint: "Percentage of net sales value" },
  { value: "FIXED_PER_SALE", label: "Fixed per bill", hint: "Same amount on every bill" },
  { value: "FIXED_PER_PIECE", label: "Fixed per piece", hint: "Amount for every piece sold" },
];

export const PAY_METHODS = ["CASH", "BANK_TRANSFER", "CHEQUE", "MOBILE_MONEY", "OTHER"] as const;
export const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
  MOBILE_MONEY: "JazzCash / Easypaisa",
  SALARY: "Salary deduction",
  OTHER: "Other",
};

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const rs = (v: number) => `Rs ${Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
export const initials = (name?: string | null) =>
  (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
export const apiError = (error: any, fallback = "Something went wrong") =>
  error?.response?.data?.errors?.[0]?.message || error?.response?.data?.message || error?.message || fallback;

const unwrap = <T>(p: Promise<{ data: any }>) => p.then((r) => (r.data?.data ?? r.data) as T);
const asList = <T>(v: any): T[] => (Array.isArray(v) ? v : Array.isArray(v?.data) ? v.data : Array.isArray(v?.items) ? v.items : []);

/* ------------------------------ api ------------------------------ */

export const employeeApi = {
  overview: (month: number, year: number) => unwrap<Overview>(apiClient.get("/payroll/overview", { params: { month, year } })),
  finance: (id: string) => unwrap<FinanceFile>(apiClient.get(`/payroll/employees/${id}`)),
  employee: (id: string) => unwrap<Record<string, any>>(apiClient.get(`/employee/${id}`)),
  departments: () => apiClient.get("/employee/departments", { params: { fetch_all: "true" } }).then((r) => asList<Named>(r.data?.data ?? r.data)),
  designations: () => apiClient.get("/employee/types").then((r) => asList<Named & { is_active?: boolean }>(r.data?.data ?? r.data)),
  posUsers: () =>
    apiClient
      .get("/employee/pos-users")
      .then((r) => asList<{ id: string; email: string; role: string; employee: { id: string; name: string } | null }>(r.data?.data ?? r.data)),
  addDepartment: (name: string) => unwrap<Named>(apiClient.post("/employee/departments", { name })),
  addDesignation: (name: string) => unwrap<Named>(apiClient.post("/employee/type", { name })),
  create: (body: Record<string, unknown>) => unwrap<{ id: string }>(apiClient.post("/employee", body)),
  update: (id: string, body: Record<string, unknown>) => unwrap<{ id: string }>(apiClient.put(`/employee/${id}`, body)),
  remove: (id: string) => unwrap(apiClient.delete(`/employee/${id}`)),
  deactivate: (id: string, reason: string, status: "INACTIVE" | "TERMINATED") => unwrap(apiClient.patch(`/employee/${id}/deactivate`, { reason, status })),
  reactivate: (id: string) => unwrap(apiClient.patch(`/employee/${id}/reactivate`)),
  importRows: (rows: Record<string, unknown>[]) => unwrap(apiClient.post("/employee/import", { rows })),
  generate: (month: number, year: number, employeeIds?: string[]) =>
    unwrap<{ created: number; skipped: number; names: string[] }>(apiClient.post("/payroll/generate", { month, year, employee_ids: employeeIds })),
  createSlip: (body: Record<string, unknown>) => unwrap<Payslip>(apiClient.post("/payroll/salaries", body)),
  updateSlip: (id: string, body: Record<string, unknown>) => unwrap<Payslip>(apiClient.put(`/payroll/salaries/${id}`, body)),
  paySlip: (id: string, body: Record<string, unknown>) => unwrap<Payslip>(apiClient.post(`/payroll/salaries/${id}/pay`, body)),
  undoPayment: (id: string) => unwrap<Payslip>(apiClient.post(`/payroll/salaries/${id}/undo-payment`)),
  deleteSlip: (id: string) => unwrap(apiClient.delete(`/payroll/salaries/${id}`)),
  addAdvance: (body: Record<string, unknown>) => unwrap(apiClient.post("/payroll/advances", body)),
  deleteAdvance: (id: string) => unwrap(apiClient.delete(`/payroll/advances/${id}`)),
  markCommissionPaid: (id: string) => unwrap(apiClient.patch(`/commissions/${id}/mark-paid`, { paid_date: new Date().toISOString() })),
  generateCommission: (month: number, year: number, employeeId: string) =>
    unwrap(apiClient.post("/commissions/generate", { month, year, employee_id: employeeId, overwrite: true })),
};
