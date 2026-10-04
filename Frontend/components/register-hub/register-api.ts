import apiClient from "@/lib/apiClient";

export type HandoverMode = "HANDOVER" | "BREAK" | "RETURN" | "EMERGENCY";
export type RegisterState = "NOT_OPENED" | "OPEN" | "LOCKED" | "CLOSED";
export type ReviewStatus = "NONE" | "PENDING" | "APPROVED";

export interface BoardRow {
  branch: { id: string; name: string; code: string };
  state: RegisterState;
  pendingReviews: number;
  session: null | {
    id: string;
    openedAt: string;
    closedAt: string | null;
    stale: boolean;
    opening: number;
    expectedCash: number;
    closing: number | null;
    variance: number | null;
    reviewStatus: ReviewStatus;
    lockedReason: string | null;
    onDuty: string | null;
    shiftStatus: string | null;
    handovers: number;
    bills: number | null;
  };
}

export interface ShiftRow {
  id: string;
  kind: string;
  status: "ACTIVE" | "ON_BREAK" | "ENDED";
  cashier: string | null;
  startedAt: string;
  endedAt: string | null;
  startCount: number;
  endCount: number | null;
  expectedEnd: number | null;
  variance: number | null;
  startNote: string | null;
  endNote: string | null;
  approvedBy: string | null;
  endedBy: string | null;
}

export interface SessionDetail {
  id: string;
  branch: { id: string; name: string; code: string } | null;
  status: "OPEN" | "CLOSED";
  locked: boolean;
  lockedReason: string | null;
  openedAt: string;
  openedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  opening: number;
  expectedOpening: number | null;
  openingVariance: number | null;
  openingNote: string | null;
  openingCount: Record<string, number> | null;
  closingCount: Record<string, number> | null;
  closing: number | null;
  expectedCash: number;
  variance: number | null;
  varianceNote: string | null;
  varianceApprovedBy: string | null;
  reviewStatus: ReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  live: {
    expectedCash: number;
    opening: number;
    cashSales: number;
    cashRefunds: number;
    cashIn: number;
    cashOut: number;
    byMethod: Record<string, number>;
    expensesByMethod: Record<string, number>;
    allExpenses: number;
    bills: number;
    netSales: number;
    dayTotal: number;
  };
  activeShift: null | {
    id: string;
    status: "ACTIVE" | "ON_BREAK";
    cashier: string | null;
    cashierId: string;
    startedAt: string;
    expectedNow: number | null;
  };
  shifts: ShiftRow[];
  cashIns: { id: string; amount: number; reason: string; at: string; by: string | null; approvedBy: string | null }[];
  paidOuts: { id: string; amount: number; reason: string; at: string; by: string | null; status: string; method?: string }[];
  /** Cash expenses entered on the Expenses screen that are not in this drawer yet. */
  unlinkedExpenses: { id: string; particular: string; amount: number; date: string; createdAt: string; status: string; method?: string; category: string | null; by: string | null }[];
  reconciliations: {
    method: string;
    label: string;
    expected: number;
    actual: number;
    variance: number;
    reference: string | null;
    notes: string | null;
    by: string | null;
  }[];
}

export interface ReconReport {
  period: { from: string; to: string };
  sessions: {
    id: string;
    branch: { name: string; code: string } | null;
    openedAt: string;
    closedAt: string | null;
    status: "OPEN" | "CLOSED";
    reviewStatus: ReviewStatus;
    openedBy: string | null;
    closedBy: string | null;
    reviewedBy: string | null;
    opening: number;
    openingVariance: number | null;
    expectedCash: number | null;
    closing: number | null;
    variance: number | null;
    varianceNote: string | null;
    handovers: number;
    methods: { method: string; expected: number; actual: number; variance: number }[];
  }[];
  totals: {
    sessions: number;
    pendingReview: number;
    cashVariance: number;
    methods: { method: string; label: string; expected: number; actual: number; variance: number }[];
  };
  byCashier: { cashier: string; shifts: number; over: number; short: number; net: number }[];
}

/** Pakistani rupee notes & coins for the drawer count. */
export const DENOMINATIONS = [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1];

export const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  MOBILE_MONEY: "Wallet",
};

export const rs = (v: number | null | undefined) =>
  v == null ? "—" : `Rs ${Math.round(Number(v)).toLocaleString("en-PK")}`;

export const signedRs = (v: number | null | undefined) => {
  if (v == null) return "—";
  if (Math.abs(v) < 0.5) return "Rs 0";
  return `${v > 0 ? "+" : "−"}Rs ${Math.abs(Math.round(v)).toLocaleString("en-PK")}`;
};

export const userName = (email?: string | null) => (email ? (email.includes("@") ? email.split("@")[0] : email) : "—");

export const errorMessage = (e: unknown, fallback = "Something went wrong") => {
  const err = e as { response?: { data?: { message?: string } }; message?: string };
  return err?.response?.data?.message || err?.message || fallback;
};

const data = <T,>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data);

export const registerApi = {
  status: () => data<{ branches: BoardRow[] }>(apiClient.get("/cash-register/status")),
  session: (id: string) => data<SessionDetail>(apiClient.get(`/cash-register/sessions/${id}`)),
  expectedOpening: (branchId?: string) =>
    data<{ amount: number; at: string } | null>(apiClient.get("/cash-register/expected-opening", { params: { branchId } })),
  open: (body: { branchId?: string; opening: number; counts?: Record<string, number> | null; note?: string | null }) =>
    data<SessionDetail>(apiClient.post("/cash-register/open", body)),
  cashIn: (id: string, body: { amount: number; reason: string }) =>
    data<SessionDetail>(apiClient.post(`/cash-register/sessions/${id}/cash-in`, body)),
  cashOut: (body: { amount: number; particular: string; branchId?: string }) => apiClient.post("/till/paid-out", body),
  voidCashOut: (id: string) => apiClient.post(`/till/paid-out/${id}/void`, {}),
  attachExpense: (id: string, expenseId: string) => data<SessionDetail>(apiClient.post(`/cash-register/sessions/${id}/attach-expense`, { expenseId })),
  handover: (
    id: string,
    body: { mode: HandoverMode; endCount?: number | null; note?: string | null; incomingEmail?: string; incomingPassword?: string },
  ) => data<SessionDetail>(apiClient.post(`/cash-register/sessions/${id}/handover`, body)),
  close: (
    id: string,
    body: {
      closing: number;
      counts?: Record<string, number> | null;
      note?: string | null;
      reconciliations?: { method: string; actual: number; reference?: string | null; notes?: string | null }[];
    },
  ) => data<SessionDetail>(apiClient.post(`/cash-register/sessions/${id}/close`, body)),
  review: (id: string, note?: string) => data<SessionDetail>(apiClient.post(`/cash-register/sessions/${id}/review`, { note })),
  reopen: (id: string, reason: string) => data<SessionDetail>(apiClient.post(`/cash-register/sessions/${id}/reopen`, { reason })),
  reconciliation: (params: { from: string; to: string; branchId?: string; status?: string }) =>
    data<ReconReport>(apiClient.get("/cash-register/reconciliation", { params })),
};
