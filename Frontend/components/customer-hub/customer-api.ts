import apiClient from "@/lib/apiClient";

export type TxnType = "PAYMENT" | "ADVANCE" | "REFUND" | "CREDIT_NOTE" | "DEBIT_NOTE" | "WRITE_OFF";
export type AgingBucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus";
export type BalanceFilter = "all" | "due" | "advance" | "overdue" | "over_limit" | "clear";
export type StatusFilter = "all" | "active" | "inactive" | "new";
export type SortKey = "recent" | "name" | "balance_desc" | "overdue_desc" | "sales_desc" | "last_visit" | "oldest";

export interface CustomerRow {
  id: string;
  name: string | null;
  email: string | null;
  phone_number: string | null;
  mobile_number?: string | null;
  address: string | null;
  billing_address?: string | null;
  credit_limit?: number | string | null;
  credit_days?: number | null;
  previous_credit_balance?: number | string | null;
  default_discount_percent?: number | string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  total_sale_amount: number;
  sale_count: number;
  last_sale_date: string | null;
  balance: number;
  balance_due: number;
  advance_balance: number;
  overdue_amount: number;
  over_limit: boolean;
  last_payment_date: string | null;
}

export interface ReceivablesSummary {
  totals: {
    receivable: number;
    advance: number;
    net: number;
    overdue: number;
    debtors: number;
    advanceHolders: number;
    overLimit: number;
    overdueCustomers: number;
  };
  aging: Record<AgingBucket, number>;
  topDebtors: ReceivableRow[];
  topAdvances: ReceivableRow[];
}

export interface ReceivableRow {
  id: string;
  name: string | null;
  phone_number: string | null;
  balance: number;
  receivable: number;
  advance: number;
  overdue: number;
  overLimit: boolean;
  creditLimit: number | null;
  oldestDueDate: string | null;
  lastPaymentDate: string | null;
}

export type LedgerType =
  | "OPENING"
  | "SALE"
  | "SALE_PAYMENT"
  | "RETURN"
  | "EXCHANGE"
  | "RETURN_REFUND"
  | TxnType;

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

export interface OpenItem {
  key: string;
  kind: "OPENING" | "SALE" | "EXCHANGE" | "DEBIT_NOTE" | "REFUND";
  saleId: string | null;
  reference: string | null;
  description: string;
  date: string;
  dueDate: string;
  amount: number;
  paid: number;
  outstanding: number;
  daysOverdue: number;
  bucket: AgingBucket;
}

export interface Txn {
  id: string;
  type: TxnType;
  amount: number;
  payment_date: string;
  method: string;
  reference: string | null;
  notes: string | null;
  sale_id: string | null;
  sale: { id: string; sale_number: string; invoice_number: string | null } | null;
  created_at: string;
  user?: { email: string } | null;
}

export interface LedgerData {
  summary: {
    totalPaid: number;
    totalDebit: number;
    balance: number;
    balanceDue: number;
    advanceBalance: number;
    overdue: number;
    creditLimit: number | null;
    creditAvailable: number | null;
    creditDays: number | null;
    overLimit: boolean;
    openingBalance: number;
    saleCount: number;
    returnCount: number;
    paymentCount: number;
    lastPaymentDate: string | null;
    totals: {
      opening: number;
      sales: number;
      paidAtSale: number;
      returns: number;
      exchanges: number;
      payments: number;
      advances: number;
      refunds: number;
      creditNotes: number;
      debitNotes: number;
      writeOffs: number;
    } | null;
    aging: Record<AgingBucket, number>;
  };
  openItems: OpenItem[];
  entries: LedgerEntry[];
  payments: Txn[];
}

export interface PurchaseOrder {
  id: string;
  sale_number: string;
  invoice_number: string | null;
  sale_date: string;
  status: string;
  payment_method: string;
  payment_status: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_received: number;
  branch: { id: string; name: string } | null;
  items: {
    id: string;
    quantity: number;
    unit_price: number;
    discount_amount: number;
    line_total: number;
    item_type: string;
    product: { id: string; name: string; sku: string | null } | null;
  }[];
}

export interface PurchasesData {
  orders: PurchaseOrder[];
  productSummary: { productId: string; productName: string; sku: string | null; totalQty: number; totalValue: number; orderCount: number }[];
  summary: { orderCount: number; productCount: number; totalQuantity: number; totalValue: number };
}

export interface StatementData {
  customer: { id: string; name: string | null; phone_number: string | null; email: string | null; address: string | null; credit_limit: number | null };
  period: { from: string | null; to: string | null };
  summary: { openingBalance: number; totalDebit: number; totalCredit: number; closingBalance: number; entryCount: number };
  entries: LedgerEntry[];
}

/* ------------------------------ meta ------------------------------ */

export const TXN_META: Record<
  TxnType,
  { label: string; verb: string; side: "credit" | "debit"; cash: boolean; help: string; tone: string }
> = {
  PAYMENT: {
    label: "Payment received",
    verb: "Receive payment",
    side: "credit",
    cash: true,
    help: "Customer pays against what they owe. Reduces their balance.",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  ADVANCE: {
    label: "Advance / upfront",
    verb: "Take advance",
    side: "credit",
    cash: true,
    help: "Money received before a sale (booking, stitching order). Held as credit and used on future bills.",
    tone: "bg-sky-50 text-sky-700 ring-sky-200",
  },
  REFUND: {
    label: "Refund paid",
    verb: "Refund customer",
    side: "debit",
    cash: true,
    help: "Pay money back to the customer, e.g. returning an unused advance.",
    tone: "bg-orange-50 text-orange-700 ring-orange-200",
  },
  CREDIT_NOTE: {
    label: "Credit note",
    verb: "Issue credit note",
    side: "credit",
    cash: false,
    help: "Reduce what the customer owes without cash — discount, compensation or correction.",
    tone: "bg-violet-50 text-violet-700 ring-violet-200",
  },
  DEBIT_NOTE: {
    label: "Debit note",
    verb: "Add debit note",
    side: "debit",
    cash: false,
    help: "Add a charge to the account without a sale — alteration fee, delivery, correction.",
    tone: "bg-rose-50 text-rose-700 ring-rose-200",
  },
  WRITE_OFF: {
    label: "Write-off",
    verb: "Write off balance",
    side: "credit",
    cash: false,
    help: "Clear a balance you will not recover (bad debt).",
    tone: "bg-gray-100 text-gray-700 ring-gray-200",
  },
};

export const LEDGER_META: Record<LedgerType, { label: string; tone: string }> = {
  OPENING: { label: "Opening", tone: "bg-gray-100 text-gray-700 ring-gray-200" },
  SALE: { label: "Sale", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  SALE_PAYMENT: { label: "Paid at sale", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  RETURN: { label: "Return", tone: "bg-teal-50 text-teal-700 ring-teal-200" },
  EXCHANGE: { label: "Exchange", tone: "bg-yellow-50 text-yellow-800 ring-yellow-200" },
  RETURN_REFUND: { label: "Return refund", tone: "bg-orange-50 text-orange-700 ring-orange-200" },
  PAYMENT: { label: "Payment", tone: TXN_META.PAYMENT.tone },
  ADVANCE: { label: "Advance", tone: TXN_META.ADVANCE.tone },
  REFUND: { label: "Refund", tone: TXN_META.REFUND.tone },
  CREDIT_NOTE: { label: "Credit note", tone: TXN_META.CREDIT_NOTE.tone },
  DEBIT_NOTE: { label: "Debit note", tone: TXN_META.DEBIT_NOTE.tone },
  WRITE_OFF: { label: "Write-off", tone: TXN_META.WRITE_OFF.tone },
};

export const AGING_META: { key: AgingBucket; label: string; short: string; color: string }[] = [
  { key: "current", label: "Not yet due", short: "Current", color: "#94a3b8" },
  { key: "d1_30", label: "1–30 days overdue", short: "1–30", color: "#f59e0b" },
  { key: "d31_60", label: "31–60 days overdue", short: "31–60", color: "#f97316" },
  { key: "d61_90", label: "61–90 days overdue", short: "61–90", color: "#ef4444" },
  { key: "d90_plus", label: "90+ days overdue", short: "90+", color: "#991b1b" },
];

export const PAYMENT_METHODS = ["CASH", "CARD", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE", "OTHER"] as const;
export const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  MOBILE_MONEY: "JazzCash / Easypaisa",
  CHEQUE: "Cheque",
  ADJUSTMENT: "Adjustment",
  OTHER: "Other",
};

/* ------------------------------ helpers ------------------------------ */

export const rs = (value: number) =>
  `Rs ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export const rs2 = (value: number) =>
  `Rs ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
export const displayEmail = (email?: string | null) => (!email || email.includes("@pos.local") ? null : email);
export const initials = (name?: string | null) =>
  (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

export const apiError = (error: any, fallback = "Something went wrong") =>
  error?.response?.data?.errors?.[0]?.message || error?.response?.data?.message || error?.message || fallback;

/** Opens WhatsApp with a polite balance reminder. */
export function whatsappReminder(customer: { name: string | null; phone_number: string | null }, amount: number, shop = "Pehnawa") {
  const digits = (customer.phone_number || "").replace(/\D/g, "");
  const phone = digits.startsWith("0") ? `92${digits.slice(1)}` : digits;
  const text = `Assalam o Alaikum ${customer.name || ""},\nThis is a friendly reminder from ${shop} that your outstanding balance is ${rs(amount)}. Kindly clear it at your earliest convenience. Thank you!`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
}

/* ------------------------------ api ------------------------------ */

const data = <T>(p: Promise<{ data: { data: T; meta?: any } }>) => p.then((r) => r.data.data);

export const customerApi = {
  list: (params: Record<string, unknown>) =>
    apiClient.get("/customer", { params }).then((r) => ({ data: r.data.data as CustomerRow[], meta: r.data.meta as { total: number; page: number; limit: number; totalPages: number } })),
  receivables: () => data<ReceivablesSummary>(apiClient.get("/customer/receivables/summary")),
  ledger: (id: string) => data<LedgerData>(apiClient.get(`/customer/${id}/ledger`)),
  purchases: (id: string) => data<PurchasesData>(apiClient.get(`/customer/${id}/purchases`)),
  statement: (id: string, from?: string, to?: string) =>
    data<StatementData>(apiClient.get(`/customer/${id}/statement`, { params: { from: from || undefined, to: to || undefined } })),
  create: (body: Record<string, unknown>) => data<{ customer: CustomerRow }>(apiClient.post("/customer", body)),
  update: (id: string, body: Record<string, unknown>) => data<CustomerRow>(apiClient.put(`/customer/${id}`, body)),
  remove: (id: string) => data(apiClient.delete(`/customer/${id}`)),
  addTxn: (id: string, body: Record<string, unknown>) => data<Txn>(apiClient.post(`/customer/${id}/payments`, body)),
  updateTxn: (id: string, txnId: string, body: Record<string, unknown>) => data<Txn>(apiClient.patch(`/customer/${id}/payments/${txnId}`, body)),
  deleteTxn: (id: string, txnId: string) => data(apiClient.delete(`/customer/${id}/payments/${txnId}`)),
};
