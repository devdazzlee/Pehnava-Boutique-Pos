import apiClient from "@/lib/apiClient";

export type BalanceFilter = "all" | "due" | "advance" | "clear";
export type StatusFilter = "all" | "active" | "inactive" | "pos";
export type SortKey = "recent" | "name" | "balance_desc" | "purchases_desc";
export type LedgerType = "PURCHASE" | "INVOICE" | "RETURN" | "PAYMENT";
export type PayMethod = "CASH" | "BANK_TRANSFER" | "CHEQUE" | "CARD" | "OTHER";

export interface SupplierRow {
  id: string;
  code: string;
  name: string;
  phone_number?: string | null;
  fax_number?: string | null;
  mobile_number?: string | null;
  country?: string | null;
  city?: string | null;
  email?: string | null;
  ntn?: string | null;
  strn?: string | null;
  gov_id?: string | null;
  address?: string | null;
  status?: string | null;
  is_active: boolean;
  display_on_pos: boolean;
  product_count: number;
  purchase_count: number;
  payment_count?: number;
  total_purchased: number;
  total_paid: number;
  total_returned: number;
  balance_due: number;
  created_at: string;
}

export interface PayablesSummary {
  totals: {
    payable: number;
    advance: number;
    net: number;
    purchased: number;
    paid: number;
    creditors: number;
    advanceHolders: number;
    supplierCount: number;
  };
  topCreditors: Array<{
    id: string;
    name: string;
    code: string;
    phone: string | null;
    balanceDue: number;
    totalPurchased: number;
    totalPaid: number;
  }>;
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

export interface LedgerSummary {
  totalPurchased: number;
  totalPaid: number;
  totalReturned: number;
  balanceDue: number;
  purchaseCount: number;
  invoiceCount: number;
  uninvoicedPurchases: number;
  returnCount: number;
  paymentCount: number;
}

export interface PaymentRow {
  id: string;
  amount: number;
  payment_date: string;
  method: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
  user?: { email: string } | null;
}

export interface LedgerData {
  summary: LedgerSummary;
  entries: LedgerEntry[];
  payments: PaymentRow[];
}

export interface StatementData {
  supplier: {
    id: string;
    name: string;
    code: string;
    phone_number?: string | null;
    email?: string | null;
    address?: string | null;
  };
  period: { from: string | null; to: string | null };
  summary: {
    openingBalance: number;
    totalDebit: number;
    totalCredit: number;
    closingBalance: number;
    entryCount: number;
  };
  entries: LedgerEntry[];
}

export interface PurchasesData {
  purchases: Array<{
    id: string;
    purchase_date: string;
    quantity: number;
    cost_price: number;
    line_total: number;
    invoice_ref: string | null;
    notes: string | null;
    delivery_status?: string;
    product: { id: string; name: string; sku: string | null } | null;
    warehouse_branch: { id: string; name: string } | null;
  }>;
  productSummary: Array<{
    productId: string;
    productName: string;
    sku: string | null;
    totalQty: number;
    totalValue: number;
    purchaseCount: number;
  }>;
  summary: {
    purchaseCount: number;
    productCount: number;
    totalQuantity: number;
    totalValue: number;
  };
}

export interface SupplierProduct {
  id: string;
  name: string;
  sku: string | null;
  code: string | null;
  is_active: boolean;
  purchase_rate: number;
  sales_rate: number;
  category: string | null;
  unit: string | null;
  purchase_count: number;
}

export const LEDGER_META: Record<
  LedgerType,
  { label: string; tone: string }
> = {
  PURCHASE: { label: "Goods in", tone: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  INVOICE: { label: "Invoice", tone: "bg-indigo-50 text-indigo-700 ring-indigo-600/20" },
  RETURN: { label: "Return", tone: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  PAYMENT: { label: "Payment", tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
};

export const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
};

export const rs = (v: number) =>
  `Rs ${Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
export const rs2 = (v: number) =>
  `Rs ${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const num = (v: unknown) => Number(v) || 0;
export const initials = (name?: string | null) => {
  const parts = (name || "?").trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
};

export function apiError(error: unknown, fallback = "Something went wrong") {
  const e = error as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message || e?.message || fallback;
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
      meta: res.data?.meta || { total: 0, page: 1, limit: 20, totalPages: 1 },
    };
  },
  payables: () => unwrap<PayablesSummary>(apiClient.get("/suppliers/payables/summary")),
  ledger: (id: string) => unwrap<LedgerData>(apiClient.get(`/suppliers/${id}/ledger`)),
  purchases: (id: string) => unwrap<PurchasesData>(apiClient.get(`/suppliers/${id}/purchases`)),
  products: (id: string) => unwrap<SupplierProduct[]>(apiClient.get(`/suppliers/${id}/products`)),
  statement: (id: string, range: { from?: string; to?: string }) =>
    unwrap<StatementData>(apiClient.get(`/suppliers/${id}/statement`, { params: range })),
  create: (body: Record<string, unknown>) => unwrap<SupplierRow>(apiClient.post("/suppliers", body)),
  update: (id: string, body: Record<string, unknown>) =>
    unwrap<SupplierRow>(apiClient.put(`/suppliers/${id}`, body)),
  remove: (id: string) => apiClient.delete(`/suppliers/${id}`),
  toggle: (id: string) => apiClient.patch(`/suppliers/${id}/toggle-status`),
  pay: (id: string, body: Record<string, unknown>) =>
    unwrap<PaymentRow>(apiClient.post(`/suppliers/${id}/payments`, body)),
  deletePayment: (id: string, paymentId: string) =>
    apiClient.delete(`/suppliers/${id}/payments/${paymentId}`),
};
