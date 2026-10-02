import apiClient from "@/lib/apiClient";

export type TypeCode = 1 | 2 | 3 | 4 | 5;

export interface Totals {
  opening: number;
  debit: number;
  credit: number;
  closing: number;
}

export interface AccountLink {
  kind: "EMPLOYEE" | "SUPPLIER" | "EXPENSE_CATEGORY";
  id: string;
  name: string;
}

export interface CoaAccount {
  id: string;
  code: string;
  name: string;
  control_id: string;
  control: { id: string; code: string; name: string };
  sub_type: { id: string; code: string; name: string };
  type_code: TypeCode;
  type_name: string;
  contact_person: string | null;
  mobile: string | null;
  address: string | null;
  nic: string | null;
  ntn: string | null;
  email: string | null;
  notes: string | null;
  opening_balance: number;
  opening_side: "DEBIT" | "CREDIT";
  is_active: boolean;
  is_system: boolean;
  system_key: string | null;
  computed: boolean;
  computed_source?: string | null;
  link: AccountLink | null;
  balance?: Totals & { entries: number };
}

export interface CoaControl {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_system: boolean;
  system_key: string | null;
  sub_type_id: string;
  totals: Totals;
  accounts: CoaAccount[];
}

export interface CoaSubType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type_code: TypeCode;
  is_active: boolean;
  is_system: boolean;
  totals: Totals;
  controls: CoaControl[];
}

export interface CoaType {
  code: TypeCode;
  name: string;
  nature: "DEBIT" | "CREDIT";
  totals: Totals;
  subTypes: CoaSubType[];
}

export interface CoaTree {
  period: { from: string; to: string };
  branchId: string | null;
  branches: { id: string; name: string; code: string }[];
  types: CoaType[];
  summary: {
    assets: number;
    liabilities: number;
    equity: number;
    income: number;
    expenses: number;
    netProfit: number;
    accountCount: number;
    controlCount: number;
    subTypeCount: number;
  };
}

export interface CoaFilters {
  from: string;
  to: string;
  branchId: string;
}

export const TYPE_STYLE: Record<number, { badge: string; dot: string; soft: string }> = {
  1: { badge: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500", soft: "bg-sky-50/60" },
  2: { badge: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500", soft: "bg-rose-50/60" },
  3: { badge: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500", soft: "bg-violet-50/60" },
  4: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", soft: "bg-emerald-50/60" },
  5: { badge: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500", soft: "bg-amber-50/60" },
};

export const LINK_LABEL: Record<string, string> = {
  EMPLOYEE: "Employee",
  SUPPLIER: "Supplier",
  EXPENSE_CATEGORY: "Expense category",
};

export const KIND_LABEL: Record<string, string> = {
  OPENING: "Opening",
  JOURNAL: "Journal voucher",
  EXPENSE: "Expense",
  SALARY: "Salary",
  COMMISSION: "Commission",
  PURCHASE_INVOICE: "Purchase invoice",
  SUPPLIER_PAYMENT: "Supplier payment",
  COMPUTED: "POS computed",
};

/** Badge colours per posting source (ledger, vouchers). */
export const KIND_STYLE: Record<string, string> = {
  OPENING: "bg-gray-100 text-gray-700 ring-gray-200",
  JOURNAL: "bg-violet-50 text-violet-700 ring-violet-200",
  EXPENSE: "bg-amber-50 text-amber-800 ring-amber-200",
  SALARY: "bg-sky-50 text-sky-700 ring-sky-200",
  COMMISSION: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  PURCHASE_INVOICE: "bg-rose-50 text-rose-700 ring-rose-200",
  SUPPLIER_PAYMENT: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  COMPUTED: "bg-[#fcf8f2] text-[#8a6520] ring-[#a67c2e]/30",
};

export const TYPE_OPTIONS = [
  { value: "1", label: "Assets", dot: "bg-sky-500" },
  { value: "2", label: "Liabilities", dot: "bg-rose-500" },
  { value: "3", label: "Equity", dot: "bg-violet-500" },
  { value: "4", label: "Income", dot: "bg-emerald-500" },
  { value: "5", label: "Expenses", dot: "bg-amber-500" },
] as const;

/** 1.2k / 3.4M style label for axes and dense spots. */
export const compact = (value: number) => {
  const abs = Math.abs(value || 0);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(value || 0));
};

export const includesText = (haystack: (string | null | undefined)[], needle: string) => {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return haystack.some((h) => (h || "").toLowerCase().includes(q));
};

export const isDebitNature = (typeCode: number) => typeCode === 1 || typeCode === 5;

const fmt = (value: number) =>
  Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (value: number) => `Rs ${fmt(value)}`;
export const moneyOrDash = (value: number) => (Math.abs(value || 0) < 0.005 ? "—" : fmt(value));

/** Balance shown on the account's natural side, with Dr/Cr suffix when it flips. */
export function balanceLabel(closing: number, typeCode: number) {
  if (Math.abs(closing) < 0.005) return "—";
  const natural = isDebitNature(typeCode) ? closing : -closing;
  const side = closing > 0 ? "Dr" : "Cr";
  return natural >= 0 ? fmt(Math.abs(closing)) : `${fmt(Math.abs(closing))} ${side}`;
}

export const naturalAmount = (closing: number, typeCode: number) => (isDebitNature(typeCode) ? closing : -closing);

export const apiError = (error: any, fallback = "Something went wrong") =>
  error?.response?.data?.errors?.[0]?.message ||
  error?.response?.data?.message ||
  error?.message ||
  fallback;

export const reportParams = (filters: CoaFilters) => {
  const params: Record<string, string> = { from: filters.from, to: filters.to };
  if (filters.branchId !== "all") params.branchId = filters.branchId;
  return params;
};

export const coaApi = {
  tree: (filters: CoaFilters, includeInactive = false) =>
    apiClient
      .get("/chart-of-accounts", { params: { ...reportParams(filters), includeInactive: String(includeInactive) } })
      .then((r) => r.data.data as CoaTree),
  ledger: (id: string, filters: CoaFilters) =>
    apiClient.get(`/chart-of-accounts/accounts/${id}/ledger`, { params: reportParams(filters) }).then((r) => r.data.data),
  breakdown: (filters: CoaFilters) =>
    apiClient.get("/chart-of-accounts/expense-breakdown", { params: reportParams(filters) }).then((r) => r.data.data),
  trial: (filters: CoaFilters) =>
    apiClient.get("/chart-of-accounts/trial-balance", { params: reportParams(filters) }).then((r) => r.data.data),
  nextCode: (params: { typeCode?: number; subTypeId?: string; controlId?: string }) =>
    apiClient.get("/chart-of-accounts/next-code", { params }).then((r) => r.data.data),
  sync: () => apiClient.post("/chart-of-accounts/sync").then((r) => r.data.data),
  createSubType: (body: any) => apiClient.post("/chart-of-accounts/sub-types", body).then((r) => r.data.data),
  updateSubType: (id: string, body: any) => apiClient.patch(`/chart-of-accounts/sub-types/${id}`, body).then((r) => r.data.data),
  deleteSubType: (id: string) => apiClient.delete(`/chart-of-accounts/sub-types/${id}`).then((r) => r.data.data),
  createControl: (body: any) => apiClient.post("/chart-of-accounts/controls", body).then((r) => r.data.data),
  updateControl: (id: string, body: any) => apiClient.patch(`/chart-of-accounts/controls/${id}`, body).then((r) => r.data.data),
  deleteControl: (id: string) => apiClient.delete(`/chart-of-accounts/controls/${id}`).then((r) => r.data.data),
  createAccount: (body: any) => apiClient.post("/chart-of-accounts/accounts", body).then((r) => r.data.data),
  updateAccount: (id: string, body: any) => apiClient.patch(`/chart-of-accounts/accounts/${id}`, body).then((r) => r.data.data),
  deleteAccount: (id: string) => apiClient.delete(`/chart-of-accounts/accounts/${id}`).then((r) => r.data.data),
  vouchers: (params: Record<string, any>) =>
    apiClient.get("/chart-of-accounts/vouchers", { params }).then((r) => ({ data: r.data.data, meta: r.data.meta })),
  createVoucher: (body: any) => apiClient.post("/chart-of-accounts/vouchers", body).then((r) => r.data.data),
  updateVoucher: (id: string, body: any) => apiClient.patch(`/chart-of-accounts/vouchers/${id}`, body).then((r) => r.data.data),
  deleteVoucher: (id: string) => apiClient.delete(`/chart-of-accounts/vouchers/${id}`).then((r) => r.data.data),
  createExpense: (body: any) => apiClient.post("/expenses", body).then((r) => r.data.data),
  approveExpense: (id: string) => apiClient.patch(`/expenses/${id}/approve`).then((r) => r.data.data),
};

export const flattenAccounts = (tree: CoaTree | null) =>
  tree
    ? tree.types.flatMap((t) => t.subTypes.flatMap((s) => s.controls.flatMap((c) => c.accounts)))
    : [];

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export { escapeHtml };

/** Opens a branded print window (same look as the other finance reports). */
export function printDocument(title: string, subtitle: string, bodyHtml: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title>
    <style>
      body{font-family:Georgia,serif;color:#2a2012;padding:28px}
      .top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #a67c2e;padding-bottom:12px;margin-bottom:12px}
      img{height:56px}
      h1{margin:0;font-size:22px}
      table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
      th{background:#2a2012;color:#fff;text-align:left;padding:6px 8px}
      td{border-bottom:1px solid #e8dcc4;padding:6px 8px}
      td.r,th.r{text-align:right}
      tr.l1 td{background:#2a2012;color:#fff;font-weight:bold}
      tr.l2 td{background:#efe4cf;font-weight:bold}
      tr.l3 td{background:#fcf8f2;font-weight:bold}
      tfoot td{font-weight:bold;background:#fcf8f2}
      .muted{color:#786448}
    </style></head><body>
    <div class="top"><img src="${window.location.origin}/logo.png" alt="logo" />
    <div style="text-align:right"><h1>${escapeHtml(title)}</h1><p class="muted" style="margin:4px 0 0">${escapeHtml(subtitle)}</p></div></div>
    ${bodyHtml}
    </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
