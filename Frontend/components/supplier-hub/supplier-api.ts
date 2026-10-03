import apiClient from "@/lib/apiClient";

export type BalanceFilter = "all" | "due" | "overdue" | "over_limit" | "advance" | "clear";
export type StatusFilter = "all" | "active" | "inactive";
export type SortKey = "recent" | "name" | "balance_desc" | "overdue_desc" | "purchases_desc" | "last_purchase" | "oldest";
export type TxnType = "PAYMENT" | "ADVANCE" | "REFUND" | "DEBIT_NOTE" | "CREDIT_NOTE" | "DISCOUNT";
export type LedgerType = "OPENING" | "PURCHASE" | "INVOICE" | "RETURN" | TxnType;
export type PayMethod = "CASH" | "BANK_TRANSFER" | "CHEQUE" | "CARD" | "MOBILE_MONEY" | "OTHER";
export type AgingKey = "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus";
export type Aging = Record<AgingKey, number>;

export interface SupplierRow {
  id: string;
  code: string;
  name: string;
  phone_number?: string | null;
  fax_number?: string | null;
  mobile_number?: string | null;
  whatsapp_number?: string | null;
  contact_person?: string | null;
  country?: string | null;
  city?: string | null;
  email?: string | null;
  ntn?: string | null;
  strn?: string | null;
  gov_id?: string | null;
  address?: string | null;
  status?: string | null;
  category?: string | null;
  payment_terms?: string | null;
  credit_days?: number | null;
  credit_limit?: number | null;
  opening_balance?: number;
  opening_balance_date?: string | null;
  bank_name?: string | null;
  bank_account_title?: string | null;
  bank_account_number?: string | null;
  bank_iban?: string | null;
  rating?: number | null;
  notes?: string | null;
  is_active: boolean;
  display_on_pos: boolean;
  product_count: number;
  purchase_count: number;
  payment_count?: number;
  total_purchased: number;
  total_paid: number;
  total_returned: number;
  total_adjusted: number;
  balance_due: number;
  overdue_amount: number;
  oldest_overdue_days: number;
  next_due_date: string | null;
  aging: Aging | null;
  last_purchase_date: string | null;
  last_payment_date: string | null;
  over_limit: boolean;
  created_at: string;
}

export interface PayablesSummary {
  totals: {
    payable: number;
    advance: number;
    net: number;
    overdue: number;
    dueThisWeek: number;
    creditors: number;
    advanceHolders: number;
    overLimit: number;
    supplierCount: number;
    activeCount: number;
  };
  aging: Aging;
  topCreditors: { id: string; name: string; code: string; phone: string | null; balanceDue: number; overdue: number; oldestDays: number }[];
  trend: { month: string; purchased: number; paid: number }[];
  recentPayments: { id: string; amount: number; type: TxnType; method: string; date: string; reference: string | null; supplier: { id: string; name: string } }[];
}

export interface OpenBill {
  kind: "OPENING" | "INVOICE" | "GOODS" | "CHARGE";
  ref: string;
  date: string;
  due: string;
  amount: number;
  outstanding: number;
  daysOverdue: number;
  invoiceId?: string | null;
}

export interface SupplierAccount {
  balance: { opening: number; totalPurchased: number; totalReturned: number; totalPaid: number; totalAdjusted: number; balanceDue: number; lastPurchase: string | null; lastPayment: string | null };
  aging: Aging;
  due: number;
  overdue: number;
  advance: number;
  oldestDays: number;
  nextDue: string | null;
  openBills: OpenBill[];
  creditLimit: number | null;
  creditDays: number | null;
  availableCredit: number | null;
  limitUsedPct: number | null;
  lastPayment: { amount: number; date: string; method: string } | null;
  counts: { purchases: number; payments: number; products: number; purchase_invoices: number; purchase_returns: number; purchase_orders: number };
}

export interface LedgerEntry {
  id: string;
  date: string;
  type: LedgerType;
  description: string;
  reference: string | null;
  debit: number;
  credit: number;
  balance: number;
  meta?: Record<string, unknown>;
}

export interface TxnRow {
  id: string;
  type: TxnType;
  amount: number;
  payment_date: string;
  method: string;
  reference: string | null;
  notes: string | null;
  purchase_invoice_id: string | null;
  invoice_number: string | null;
  created_at: string;
  user?: { email: string } | null;
}

export interface LedgerData {
  summary: {
    openingBalance: number;
    totalPurchased: number;
    totalPaid: number;
    totalReturned: number;
    totalAdjusted: number;
    balanceDue: number;
    purchaseCount: number;
    invoiceCount: number;
    uninvoicedPurchases: number;
    returnCount: number;
    paymentCount: number;
  };
  entries: LedgerEntry[];
  payments: TxnRow[];
}

export interface StatementData {
  supplier: {
    id: string;
    name: string;
    code: string;
    phone_number?: string | null;
    mobile_number?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    ntn?: string | null;
    strn?: string | null;
    contact_person?: string | null;
  };
  period: { from: string | null; to: string | null };
  summary: { openingBalance: number; totalDebit: number; totalCredit: number; closingBalance: number; entryCount: number };
  entries: LedgerEntry[];
}

export interface PurchasesData {
  purchases: {
    id: string;
    purchase_date: string;
    quantity: number;
    cost_price: number;
    sale_price: number;
    line_total: number;
    invoice_ref: string | null;
    notes: string | null;
    delivery_status?: string;
    product: { id: string; name: string; sku: string | null } | null;
    warehouse_branch: { id: string; name: string } | null;
    invoice: { id: string; invoice_number: string } | null;
  }[];
  productSummary: {
    productId: string;
    productName: string;
    sku: string | null;
    totalQty: number;
    totalValue: number;
    purchaseCount: number;
    lastCost: number;
    firstCost: number;
    avgCost: number;
    costChangePct: number;
    lastDate: string;
  }[];
  summary: { purchaseCount: number; productCount: number; totalQuantity: number; totalValue: number };
}

export interface DocumentsData {
  orders: { id: string; number: string; date: string; expected: string | null; status: string; total: number }[];
  invoices: { id: string; number: string; date: string; due: string | null; status: string; total: number; paid: number; outstanding: number; overdue: boolean; items: number; payments: number }[];
  returns: { id: string; number: string; date: string; status: string; reason: string | null; total: number; items: number }[];
}

export interface SupplierProduct {
  id: string;
  name: string;
  sku: string | null;
  code: string | null;
  is_active: boolean;
  purchase_rate: number;
  sales_rate: number;
  margin: number | null;
  stock: number;
  sold: number;
  category: string | null;
  unit: string | null;
  purchase_count: number;
}

/* ------------------------------ presentation ------------------------------ */

export const TXN_META: Record<TxnType, { label: string; help: string; effect: "reduce" | "increase"; cash: boolean }> = {
  PAYMENT: { label: "Payment", help: "Money paid against bills", effect: "reduce", cash: true },
  ADVANCE: { label: "Advance", help: "Paid before goods / bills arrive", effect: "reduce", cash: true },
  REFUND: { label: "Refund received", help: "Supplier paid money back to us", effect: "increase", cash: true },
  DEBIT_NOTE: { label: "Debit note", help: "Claim: short / damaged goods, price difference", effect: "reduce", cash: false },
  DISCOUNT: { label: "Discount received", help: "Settlement or early-payment discount", effect: "reduce", cash: false },
  CREDIT_NOTE: { label: "Credit note", help: "Extra charges added by supplier (freight etc.)", effect: "increase", cash: false },
};

export const LEDGER_META: Record<LedgerType, { label: string; tone: string }> = {
  OPENING: { label: "Opening", tone: "bg-stone-100 text-stone-700 ring-stone-500/20" },
  PURCHASE: { label: "Goods in", tone: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  INVOICE: { label: "Invoice", tone: "bg-indigo-50 text-indigo-700 ring-indigo-600/20" },
  RETURN: { label: "Return", tone: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  PAYMENT: { label: "Payment", tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  ADVANCE: { label: "Advance", tone: "bg-teal-50 text-teal-700 ring-teal-600/20" },
  REFUND: { label: "Refund in", tone: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  DEBIT_NOTE: { label: "Debit note", tone: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  DISCOUNT: { label: "Discount", tone: "bg-lime-50 text-lime-700 ring-lime-600/20" },
  CREDIT_NOTE: { label: "Credit note", tone: "bg-orange-50 text-orange-700 ring-orange-600/20" },
};

export const AGING_META: Record<AgingKey, { label: string; color: string }> = {
  current: { label: "Not due", color: "#d6c7a8" },
  d1_30: { label: "1–30 days", color: "#a67c2e" },
  d31_60: { label: "31–60", color: "#c2410c" },
  d61_90: { label: "61–90", color: "#b91c1c" },
  d90_plus: { label: "90+", color: "#7f1d1d" },
};

export const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
  CARD: "Card",
  MOBILE_MONEY: "Wallet",
  OTHER: "Other",
  ADJUSTMENT: "Adjustment",
};

export const rs = (v: number | null | undefined) => `Rs ${Math.round(Number(v || 0)).toLocaleString("en-PK")}`;
export const rs2 = (v: number) => `Rs ${Number(v || 0).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const num = (v: unknown) => Number(v) || 0;
export const initials = (name?: string | null) => {
  const parts = (name || "?").trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
};
export const supplierPhone = (s: Pick<SupplierRow, "mobile_number" | "phone_number" | "whatsapp_number">) => s.mobile_number || s.phone_number || s.whatsapp_number || null;
export const balanceLabel = (v: number) => (v > 0.5 ? "We owe" : v < -0.5 ? "Advance with them" : "Settled");

export function apiError(error: unknown, fallback = "Something went wrong") {
  const e = error as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message || e?.message || fallback;
}

/** WhatsApp message to the supplier confirming a payment / our balance. */
export function whatsappLink(phone: string | null | undefined, text: string) {
  const digits = (phone || "").replace(/\D/g, "");
  const intl = digits.startsWith("0") ? `92${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}

async function unwrap<T>(promise: Promise<{ data: { data: T } }>): Promise<T> {
  const res = await promise;
  return res.data.data;
}

export const supplierApi = {
  list: async (params: Record<string, unknown>) => {
    const res = await apiClient.get("/suppliers", { params });
    return {
      data: (res.data?.data || []) as SupplierRow[],
      meta: (res.data?.meta || { total: 0, page: 1, limit: 20, totalPages: 1 }) as { total: number; page: number; limit: number; totalPages: number },
    };
  },
  facets: () => unwrap<{ cities: string[]; categories: string[] }>(apiClient.get("/suppliers/facets")),
  payables: () => unwrap<PayablesSummary>(apiClient.get("/suppliers/payables/summary")),
  account: (id: string) => unwrap<SupplierAccount>(apiClient.get(`/suppliers/${id}/account`)),
  ledger: (id: string) => unwrap<LedgerData>(apiClient.get(`/suppliers/${id}/ledger`)),
  purchases: (id: string) => unwrap<PurchasesData>(apiClient.get(`/suppliers/${id}/purchases`)),
  documents: (id: string) => unwrap<DocumentsData>(apiClient.get(`/suppliers/${id}/documents`)),
  products: (id: string) => unwrap<SupplierProduct[]>(apiClient.get(`/suppliers/${id}/products`)),
  statement: (id: string, range: { from?: string; to?: string }) => unwrap<StatementData>(apiClient.get(`/suppliers/${id}/statement`, { params: range })),
  create: (body: Record<string, unknown>) => unwrap<SupplierRow>(apiClient.post("/suppliers", body)),
  update: (id: string, body: Record<string, unknown>) => unwrap<SupplierRow>(apiClient.put(`/suppliers/${id}`, body)),
  remove: (id: string) => apiClient.delete(`/suppliers/${id}`),
  toggle: (id: string) => apiClient.patch(`/suppliers/${id}/toggle-status`),
  addTxn: (id: string, body: Record<string, unknown>) => unwrap<TxnRow>(apiClient.post(`/suppliers/${id}/payments`, body)),
  updateTxn: (id: string, txnId: string, body: Record<string, unknown>) => unwrap<TxnRow>(apiClient.patch(`/suppliers/${id}/payments/${txnId}`, body)),
  deleteTxn: (id: string, txnId: string) => apiClient.delete(`/suppliers/${id}/payments/${txnId}`),
};
