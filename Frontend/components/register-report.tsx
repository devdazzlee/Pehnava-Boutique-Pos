"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Calculator,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  Inbox,
  Landmark,
  Loader2,
  Lock,
  LockOpen,
  Printer,
  Receipt,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  SlidersHorizontal,
  Smartphone,
  TrendingUp,
  Undo2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CashCounter } from "@/components/cash-counter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateField } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { ymd, rangeForPreset } from "@/lib/business-timezone";
import { downloadRegisterReportPdf } from "@/lib/register-report-pdf";

type Preset = "all" | "today" | "yesterday" | "last7" | "last30" | "custom";

interface SessionRow {
  id: string;
  registerName: string;
  registerNumber: string;
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  opening: number;
  closing: number | null;
  status: "OPEN" | "CLOSED";
  /** Snapshotted when the session was closed (null while open). */
  expectedCash?: number | null;
  variance?: number | null;
  varianceLabel?: "Over" | "Short" | "Balanced" | null;
  closedBy?: string | null;
}

interface ReportData {
  period: { from: string; to: string };
  registerStatus: string;
  canReopen: boolean;
  filters: {
    registers: { id: string; name: string; number: string }[];
    cashiers: { id: string; name: string }[];
  };
  sessions: SessionRow[];
  salesSummary: {
    saleCount: number;
    grossSales: number;
    discounts: number;
    returns: number;
    netSales: number;
    tax: number;
    finalSales: number;
  };
  payments: { method: string; count: number; amount: number }[];
  cash: {
    openingCash: number;
    cashSales: number;
    cashRefunds: number;
    cashReceived: number;
    cashPaidOut: number;
    cashDeposits: number;
    expectedCash: number;
    actualClosing: number | null;
    difference: number | null;
    variance: "Over" | "Short" | "Balanced" | null;
  };
  cards: {
    openingCash: number;
    grossSales: number;
    netSales: number;
    cashSales: number;
    otherPayments: number;
    refunds: number;
    expectedCash: number;
    actualCash: number | null;
    variance: number | null;
    varianceLabel: "Over" | "Short" | "Balanced" | null;
  };
  transactions: {
    id: string;
    type: string;
    number: string;
    date: string;
    customer: string;
    cashier: string;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paymentMethod: string;
    status: string;
  }[];
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 Days" },
  { id: "last30", label: "Last 30 Days" },
  { id: "custom", label: "Custom Range" },
];

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  ONLINE: "Online payment",
  OTHER: "Other",
};

const TYPE_LABELS: Record<string, string> = {
  SALE: "Sale",
  RETURN: "Return",
  EXCHANGE: "Exchange",
  REFUND: "Refund",
  CASH_OUT: "Cash out",
  CUSTOMER_PAYMENT: "Customer payment",
  CUSTOMER_REFUND: "Customer refund",
};

const rangeFor = (preset: Exclude<Preset, "custom">) => rangeForPreset(preset);

const money = (value: number | null | undefined) =>
  value == null
    ? "—"
    : `PKR ${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const when = (value?: string | null) =>
  value ? format(new Date(value), "dd MMM yyyy, HH:mm") : "—";

const periodLabel = (from: string, to: string) => {
  if (from === "2000-01-01") return "All dates";
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  return `${format(start, "dd MMM yyyy")} - ${format(end, "dd MMM yyyy")}`;
};

const varianceClass = (label: string | null) => {
  if (label === "Over") return "text-amber-700";
  if (label === "Short") return "text-red-700";
  if (label === "Balanced") return "text-emerald-700";
  return "text-gray-900";
};

export function RegisterReport() {
  const { toast } = useToast();
  const initial = rangeFor("today");
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [branchId, setBranchId] = useState("all");
  const [cashierId, setCashierId] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("ALL");
  const [transactionType, setTransactionType] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [closeTarget, setCloseTarget] = useState<SessionRow | null>(null);
  const [countedCash, setCountedCash] = useState("");
  const [savingClose, setSavingClose] = useState(false);
  const role = typeof window !== "undefined" ? localStorage.getItem("role") : null;
  const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { from, to };
      if (branchId !== "all") params.branchId = branchId;
      if (cashierId !== "all") params.cashierId = cashierId;
      if (paymentMethod !== "ALL") params.paymentMethod = paymentMethod;
      if (transactionType !== "ALL") params.transactionType = transactionType;
      if (status !== "ALL") params.status = status;
      const response = await apiClient.get("/register-report", { params });
      setReport(response.data.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load register report",
        description: error?.response?.data?.message || error?.message || "Try again",
      });
    } finally {
      setLoading(false);
    }
  }, [from, to, branchId, cashierId, paymentMethod, transactionType, status, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const applyPreset = (next: Preset) => {
    setPreset(next);
    if (next === "custom") return;
    const range = rangeFor(next);
    setFrom(range.from);
    setTo(range.to);
    setDraftFrom(range.from);
    setDraftTo(range.to);
  };

  const applyCustom = () => {
    if (draftTo < draftFrom) {
      toast({ variant: "destructive", title: "To Date cannot be earlier than From Date" });
      return;
    }
    setFrom(draftFrom);
    setTo(draftTo);
  };

  const resetDates = () => applyPreset("today");

  const openSession = report?.sessions.find((session) => session.status === "OPEN") || null;

  const closeRegister = async () => {
    if (!closeTarget) return;
    const amount = Number(countedCash);
    if (!Number.isFinite(amount) || amount < 0) {
      toast({ variant: "destructive", title: "Enter the cash you counted" });
      return;
    }
    setSavingClose(true);
    try {
      const response = await apiClient.post("/register-report/close", {
        cashflow_id: closeTarget.id,
        closing: amount,
      });
      const variance = Number(response.data?.data?.variance ?? 0);
      const label = Math.abs(variance) < 0.005 ? "Balanced" : variance > 0 ? "Over" : "Short";
      toast({ title: `Register closed · ${label}`, description: `Variance ${money(variance)}` });
      setCloseTarget(null);
      setCountedCash("");
      await load();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not close register",
        description: error?.response?.data?.message || error?.message,
      });
    } finally {
      setSavingClose(false);
    }
  };

  const reopen = async (id: string) => {
    try {
      await apiClient.post(`/register-report/sessions/${id}/reopen`);
      toast({ title: "Register session reopened" });
      await load();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not reopen",
        description: error?.response?.data?.message || error?.message,
      });
    }
  };

  const exportRows = useMemo(() => report?.transactions || [], [report]);

  const exportCsv = () => {
    if (!report) return;
    const lines = [
      `Register Report,${periodLabel(report.period.from, report.period.to)}`,
      `Opening cash,${report.cards.openingCash}`,
      `Gross sales,${report.cards.grossSales}`,
      `Net sales,${report.cards.netSales}`,
      `Expected cash,${report.cards.expectedCash}`,
      `Actual cash,${report.cards.actualCash ?? ""}`,
      `Variance,${report.cards.variance ?? ""}`,
      "",
      "Number,Date,Customer,Cashier,Type,Subtotal,Discount,Tax,Total,Payment,Status",
      ...exportRows.map((row) =>
        [
          row.number,
          when(row.date),
          row.customer,
          row.cashier,
          TYPE_LABELS[row.type] || row.type,
          row.subtotal,
          row.discount,
          row.tax,
          row.total,
          PAYMENT_LABELS[row.paymentMethod] || row.paymentMethod,
          row.status,
        ]
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `register-report-${report.period.from}-to-${report.period.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = async () => {
    if (!report) return;
    const XLSX = await import("xlsx");
    const summary = [
      ["Register Report", periodLabel(report.period.from, report.period.to)],
      ["Sales", report.salesSummary.saleCount],
      ["Gross sales", report.salesSummary.grossSales],
      ["Discounts", report.salesSummary.discounts],
      ["Returns", report.salesSummary.returns],
      ["Net sales", report.salesSummary.netSales],
      ["Tax", report.salesSummary.tax],
      ["Final sales", report.salesSummary.finalSales],
      ["Opening cash", report.cash.openingCash],
      ["Cash sales", report.cash.cashSales],
      ["Cash refunds", report.cash.cashRefunds],
      ["Cash received", report.cash.cashReceived],
      ["Cash paid out", report.cash.cashPaidOut],
      ["Expected cash", report.cash.expectedCash],
      ["Actual cash", report.cash.actualClosing ?? ""],
      ["Variance", report.cash.difference ?? ""],
      ["Result", report.cash.variance ?? "Open"],
    ];
    const payments = [["Method", "Transactions", "Amount"], ...report.payments.map((row) => [PAYMENT_LABELS[row.method] || row.method, row.count, row.amount])];
    const tx = [
      ["Number", "Date", "Customer", "Cashier", "Type", "Subtotal", "Discount", "Tax", "Total", "Payment", "Status"],
      ...exportRows.map((row) => [
        row.number,
        when(row.date),
        row.customer,
        row.cashier,
        TYPE_LABELS[row.type] || row.type,
        row.subtotal,
        row.discount,
        row.tax,
        row.total,
        PAYMENT_LABELS[row.paymentMethod] || row.paymentMethod,
        row.status,
      ]),
    ];
    const sessionsSheet = [
      ["Register", "Number", "Cashier", "Opened", "Closed", "Closed by", "Opening", "Expected", "Counted", "Variance", "Result"],
      ...report.sessions.map((s) => [
        s.registerName,
        s.registerNumber,
        s.cashierName,
        when(s.openedAt),
        when(s.closedAt),
        s.closedBy || "",
        s.opening,
        s.expectedCash ?? "",
        s.closing ?? "",
        s.variance ?? "",
        s.status === "OPEN" ? "Open" : s.varianceLabel || "Closed",
      ]),
    ];
    const cashierSheet = [
      ["Cashier", "Transactions", "Sales", "Sales total", "Refunds", "Net", "Avg sale"],
      ...buildCashierRows(exportRows).map((c) => [c.cashier, c.transactions, c.sales, c.salesTotal, c.refunds, c.net, c.average]),
    ];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(summary), "Summary");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sessionsSheet), "Sessions");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(cashierSheet), "By cashier");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(payments), "Payments");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(tx), "Transactions");
    XLSX.writeFile(book, `register-report-${report.period.from}-to-${report.period.to}.xlsx`);
  };

  const exportPdf = async () => {
    if (!report) return;
    await downloadRegisterReportPdf(report, exportRows);
  };

  const printReport = () => {
    if (!report) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const r = (cells: (string | number)[], rightFrom = -1) =>
      `<tr>${cells
        .map((cell, i) => `<td${rightFrom >= 0 && i >= rightFrom ? ' class="r"' : ""}>${escapeHtml(String(cell))}</td>`)
        .join("")}</tr>`;
    const empty = (cols: number, text: string) => `<tr><td colspan="${cols}" class="muted">${text}</td></tr>`;

    const sessionRows = report.sessions.length
      ? report.sessions
          .map((s) =>
            r(
              [
                `${s.registerName} (${s.registerNumber})`,
                s.cashierName,
                when(s.openedAt),
                when(s.closedAt),
                money(s.opening),
                money(s.expectedCash ?? null),
                money(s.closing),
                s.variance == null ? "—" : `${signed(s.variance)} ${s.varianceLabel || ""}`,
              ],
              4,
            ),
          )
          .join("")
      : empty(8, "No register session in this period.");
    const paymentRows = report.payments.length
      ? report.payments.map((p) => r([PAYMENT_LABELS[p.method] || p.method, p.count, money(p.amount)], 1)).join("")
      : empty(3, "No payments.");
    const cashierRows = buildCashierRows(exportRows);
    const cashierHtml = cashierRows.length
      ? cashierRows
          .map((c) => r([c.cashier, c.transactions, c.sales, money(c.salesTotal), money(c.refunds), money(c.net), money(c.average)], 1))
          .join("")
      : empty(7, "No transactions.");
    const txRows = exportRows.length
      ? exportRows
          .map((row) =>
            r([
              row.number,
              when(row.date),
              row.customer,
              row.cashier,
              TYPE_LABELS[row.type] || row.type,
              money(row.subtotal),
              money(row.discount),
              money(row.tax),
              money(row.total),
              PAYMENT_LABELS[row.paymentMethod] || row.paymentMethod,
              row.status,
            ]),
          )
          .join("")
      : empty(11, "No transactions.");
    const c = report.cash;

    win.document.write(`<!DOCTYPE html><html><head><title>Register Report</title>
      <style>
        body{font-family:Georgia,serif;padding:28px;color:#2a2012}
        .top{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #a67c2e;padding-bottom:12px}
        img{height:58px;width:auto}
        h1{margin:0;font-size:22px}
        h2{font-size:14px;margin:22px 0 0;border-left:3px solid #a67c2e;padding-left:8px}
        p{margin:4px 0 0;color:#786448}
        table{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px}
        td,th{border-bottom:1px solid #e8dcc4;padding:5px 6px;text-align:left}
        th{background:#2a2012;color:#fff}
        td.r{text-align:right}
        td.muted{color:#786448;font-style:italic}
        .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0 0}
        .cards div{border:1px solid #e8dcc4;border-left:3px solid #a67c2e;padding:8px;font-size:11px}
        .cards strong{font-size:14px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .move td:last-child{text-align:right}
        .move tr.total td{font-weight:bold;border-top:2px solid #2a2012}
        @media print{h2{break-after:avoid}tr{break-inside:avoid}}
      </style>
      </head><body>
      <div class="top">
        <img src="${window.location.origin}/logo.png" alt="Pehnawa" />
        <div style="text-align:right"><h1>Register Report</h1>
        <p>${periodLabel(report.period.from, report.period.to)} · Printed ${format(new Date(), "dd MMM yyyy, HH:mm")}</p></div>
      </div>
      <div class="cards">
        <div>Net sales<br><strong>${money(report.cards.netSales)}</strong></div>
        <div>Expected cash<br><strong>${money(report.cards.expectedCash)}</strong></div>
        <div>Actual cash<br><strong>${money(report.cards.actualCash)}</strong></div>
        <div>Variance<br><strong>${report.cards.variance == null ? "—" : signed(report.cards.variance)} ${report.cards.varianceLabel || ""}</strong></div>
        <div>Opening cash<br><strong>${money(report.cards.openingCash)}</strong></div>
        <div>Gross sales<br><strong>${money(report.cards.grossSales)}</strong></div>
        <div>Other payments<br><strong>${money(report.cards.otherPayments)}</strong></div>
        <div>Refunds<br><strong>${money(report.cards.refunds)}</strong></div>
      </div>
      <h2>Register sessions</h2>
      <table><thead><tr><th>Register</th><th>Cashier</th><th>Opened</th><th>Closed</th><th>Opening</th><th>Expected</th><th>Counted</th><th>Variance</th></tr></thead><tbody>${sessionRows}</tbody></table>
      <div class="grid">
        <div><h2>Payment methods</h2>
        <table><thead><tr><th>Method</th><th>Transactions</th><th>Amount</th></tr></thead><tbody>${paymentRows}</tbody></table></div>
        <div><h2>Cash movement</h2>
        <table class="move"><tbody>
          ${r(["Opening cash", money(c.openingCash)])}
          ${r(["+ Cash sales", money(c.cashSales)])}
          ${r(["+ Cash received from customers", money(c.cashReceived)])}
          ${r(["− Cash refunds", money(c.cashRefunds)])}
          ${r(["− Cash paid out", money(c.cashPaidOut)])}
          <tr class="total"><td>Expected cash</td><td>${money(c.expectedCash)}</td></tr>
          ${r(["Actual closing cash", money(c.actualClosing)])}
          ${r(["Difference", c.difference == null ? "—" : `${signed(c.difference)} ${c.variance || ""}`])}
        </tbody></table></div>
      </div>
      <h2>By cashier</h2>
      <table><thead><tr><th>Cashier</th><th>Transactions</th><th>Sales</th><th>Sales total</th><th>Refunds</th><th>Net</th><th>Avg sale</th></tr></thead><tbody>${cashierHtml}</tbody></table>
      <h2>Transactions</h2>
      <table><thead><tr><th>Number</th><th>Date</th><th>Customer</th><th>Cashier</th><th>Type</th><th>Subtotal</th><th>Discount</th><th>Tax</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead><tbody>${txRows}</tbody></table>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  // ----- UI state (presentation only) -----
  const [sessionExpected, setSessionExpected] = useState<number | null>(null);
  const [expectedLoading, setExpectedLoading] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<SessionRow | null>(null);
  const [reopening, setReopening] = useState(false);
  const [exporting, setExporting] = useState<null | "csv" | "xlsx" | "pdf">(null);
  const [txSearch, setTxSearch] = useState("");
  const [txPage, setTxPage] = useState(1);
  const TX_PAGE_SIZE = 25;

  // Expected cash for the specific drawer being closed (not the whole period).
  useEffect(() => {
    if (!closeTarget) {
      setSessionExpected(null);
      return;
    }
    let cancelled = false;
    setExpectedLoading(true);
    apiClient
      .get(`/register-report/sessions/${closeTarget.id}/expected`)
      .then((response) => {
        if (!cancelled) setSessionExpected(Number(response.data?.data?.expectedCash ?? 0));
      })
      .catch(() => {
        if (!cancelled) setSessionExpected(null);
      })
      .finally(() => {
        if (!cancelled) setExpectedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [closeTarget]);

  useEffect(() => {
    setTxPage(1);
  }, [txSearch, report]);

  const isFirstLoad = loading && !report;
  const isRefreshing = loading && !!report;

  const activeFilterCount =
    (preset !== "today" ? 1 : 0) +
    (branchId !== "all" ? 1 : 0) +
    (cashierId !== "all" ? 1 : 0) +
    (paymentMethod !== "ALL" ? 1 : 0) +
    (transactionType !== "ALL" ? 1 : 0) +
    (status !== "ALL" ? 1 : 0);

  const clearAllFilters = () => {
    applyPreset("today");
    setBranchId("all");
    setCashierId("all");
    setPaymentMethod("ALL");
    setTransactionType("ALL");
    setStatus("ALL");
  };

  const runExport = async (type: "csv" | "xlsx" | "pdf") => {
    setExporting(type);
    try {
      if (type === "csv") exportCsv();
      else if (type === "xlsx") await exportExcel();
      else await exportPdf();
      toast({ title: "Export ready", description: `Register report saved as ${type.toUpperCase()}.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Export failed", description: error?.message || "Try again" });
    } finally {
      setExporting(null);
    }
  };

  const confirmReopen = async () => {
    if (!reopenTarget) return;
    setReopening(true);
    try {
      await reopen(reopenTarget.id);
      setReopenTarget(null);
    } finally {
      setReopening(false);
    }
  };

  const filteredTx = useMemo(() => {
    const term = txSearch.trim().toLowerCase();
    if (!term) return exportRows;
    return exportRows.filter((row) =>
      [row.number, row.customer, row.cashier, TYPE_LABELS[row.type] || row.type, PAYMENT_LABELS[row.paymentMethod] || row.paymentMethod]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [exportRows, txSearch]);
  const txPages = Math.max(1, Math.ceil(filteredTx.length / TX_PAGE_SIZE));
  const pagedTx = filteredTx.slice((txPage - 1) * TX_PAGE_SIZE, txPage * TX_PAGE_SIZE);

  const cashierRows = useMemo(() => buildCashierRows(exportRows), [exportRows]);
  const cashierMaxNet = Math.max(0, ...cashierRows.map((row) => row.net));

  const paymentTotal = (report?.payments || []).reduce((sum, row) => sum + Math.max(0, row.amount), 0);
  const varianceValue = report?.cards.variance ?? null;
  const openSessions = (report?.sessions || []).filter((session) => session.status === "OPEN");

  const closeExpected = sessionExpected ?? null;
  const countedValue = countedCash === "" ? null : Number(countedCash);
  const closeVariance =
    closeExpected != null && countedValue != null && Number.isFinite(countedValue) ? countedValue - closeExpected : null;

  const statusPill =
    report?.registerStatus === "OPEN"
      ? { text: "Register open", tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" }
      : report?.registerStatus === "CLOSED"
        ? { text: "Register closed", tone: "bg-slate-100 text-slate-700 ring-slate-500/20" }
        : { text: "No register opened", tone: "bg-amber-50 text-amber-700 ring-amber-600/20" };

  const heroCards = report
    ? [
        {
          label: "Net sales",
          value: money(report.cards.netSales),
          hint: `${report.salesSummary.saleCount} ${report.salesSummary.saleCount === 1 ? "sale" : "sales"} · gross ${money(report.cards.grossSales)}`,
          icon: TrendingUp,
          tone: "bg-emerald-50 text-emerald-600",
          accent: "bg-emerald-500",
        },
        {
          label: "Expected cash",
          value: money(report.cards.expectedCash),
          hint: "Should be in the drawer",
          icon: Calculator,
          tone: "bg-slate-900 text-white",
          accent: "bg-slate-900",
        },
        {
          label: "Actual cash",
          value: money(report.cards.actualCash),
          hint: report.cards.actualCash == null ? "Shown once all registers close" : "Counted at close",
          icon: Banknote,
          tone: "bg-sky-50 text-sky-600",
          accent: "bg-sky-500",
        },
        {
          label: "Variance",
          value: varianceValue == null ? "—" : signed(varianceValue),
          hint: report.cards.varianceLabel || "Not closed yet",
          icon: Scale,
          tone:
            report.cards.varianceLabel === "Short"
              ? "bg-rose-50 text-rose-600"
              : report.cards.varianceLabel === "Over"
                ? "bg-amber-50 text-amber-600"
                : "bg-emerald-50 text-emerald-600",
          accent:
            report.cards.varianceLabel === "Short"
              ? "bg-rose-500"
              : report.cards.varianceLabel === "Over"
                ? "bg-amber-500"
                : report.cards.varianceLabel === "Balanced"
                  ? "bg-emerald-500"
                  : "bg-slate-300",
          valueClass: varianceClass(report.cards.varianceLabel),
        },
      ]
    : [];

  const minorCards = report
    ? [
        { label: "Opening cash", value: money(report.cards.openingCash), icon: Wallet, tone: "text-slate-500" },
        { label: "Gross sales", value: money(report.cards.grossSales), icon: Receipt, tone: "text-blue-500" },
        { label: "Cash sales", value: money(report.cards.cashSales), icon: ArrowUpRight, tone: "text-emerald-500" },
        { label: "Other payments", value: money(report.cards.otherPayments), icon: CreditCard, tone: "text-violet-500" },
        { label: "Refunds", value: money(report.cards.refunds), icon: Undo2, tone: "text-rose-500" },
      ]
    : [];

  const filterLabel = "text-xs font-semibold text-indigo-900/80";
  const filterControl = "h-9 border-indigo-200/80 bg-white shadow-sm";
  const th = "h-10 whitespace-nowrap bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500";

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6 lg:p-8">
      <style>{`@keyframes rr-progress{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">Register Report</h1>
              {report ? <Pill tone={statusPill.tone}>{statusPill.text}</Pill> : null}
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
              <CalendarDays className="h-3.5 w-3.5" />
              Reporting period: {periodLabel(from, to)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-9 bg-white shadow-sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" className="h-9 bg-white shadow-sm" onClick={printReport} disabled={!report}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-9 shadow-sm" disabled={!report || exporting !== null}>
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                {exporting ? "Exporting…" : "Export"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="truncate text-xs font-normal text-slate-500">{periodLabel(from, to)}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => runExport("xlsx")} className="items-start gap-2 py-2">
                <FileSpreadsheet className="mt-0.5 h-4 w-4 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium">Excel (.xlsx)</p>
                  <p className="text-xs text-slate-500">Summary, payments, transactions</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => runExport("csv")} className="items-start gap-2 py-2">
                <FileText className="mt-0.5 h-4 w-4 text-sky-600" />
                <div>
                  <p className="text-sm font-medium">CSV (.csv)</p>
                  <p className="text-xs text-slate-500">Plain text, opens anywhere</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => runExport("pdf")} className="items-start gap-2 py-2">
                <Download className="mt-0.5 h-4 w-4 text-rose-600" />
                <div>
                  <p className="text-sm font-medium">PDF (.pdf)</p>
                  <p className="text-xs text-slate-500">Formatted landscape report</p>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Open register banner */}
      {openSessions.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <LockOpen className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="text-sm">
              <p className="font-semibold text-emerald-900">
                {openSessions.length === 1
                  ? `${openSessions[0].registerName} is open`
                  : `${openSessions.length} registers are open`}
              </p>
              <p className="text-emerald-800">
                {openSessions.length === 1
                  ? `Opened by ${openSessions[0].cashierName} at ${when(openSessions[0].openedAt)}. Close it with the counted cash at end of day.`
                  : "Close each one with its counted cash to finalise the variance."}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="h-8 shrink-0"
            onClick={() => {
              setCloseTarget(openSessions[0]);
              setCountedCash("");
            }}
          >
            <Lock className="mr-1.5 h-3.5 w-3.5" />
            Close {openSessions.length === 1 ? "register" : openSessions[0].registerName}
          </Button>
        </div>
      ) : null}

      {/* Hero KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 md:gap-4">
        {isFirstLoad
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={`hero-skel-${i}`} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-36" />
              </div>
            ))
          : heroCards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className={cn("absolute inset-x-0 top-0 h-1", card.accent)} aria-hidden />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{card.label}</p>
                      <p
                        className={cn(
                          "mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums text-slate-900 transition-opacity",
                          card.valueClass,
                          isRefreshing && "opacity-40",
                        )}
                      >
                        {card.value}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">{card.hint}</p>
                    </div>
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", card.tone)}>
                      {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-5 w-5" />}
                    </div>
                  </div>
                </div>
              );
            })}
      </div>

      {/* Secondary KPI strip */}
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
        {isFirstLoad
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={`minor-skel-${i}`} className="space-y-2 p-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-28" />
              </div>
            ))
          : minorCards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="min-w-0 p-4">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <Icon className={cn("h-3.5 w-3.5", card.tone)} />
                    {card.label}
                  </p>
                  <p className={cn("mt-1 truncate text-base font-semibold tabular-nums text-slate-900 transition-opacity", isRefreshing && "opacity-40")}>
                    {card.value}
                  </p>
                </div>
              );
            })}
      </div>

      {/* Filters */}
      <Card className="overflow-hidden rounded-xl border-indigo-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                Filters
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                    {activeFilterCount} active
                  </span>
                ) : null}
              </p>
              <p className="truncate text-xs text-slate-500">Narrow by date, register, cashier, payment, type or status</p>
            </div>
          </div>
          {isRefreshing ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating…
            </span>
          ) : null}
          {activeFilterCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-8 border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800"
              onClick={clearAllFilters}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Clear filters
            </Button>
          ) : null}
        </div>
        <div className="space-y-4 border-t border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-indigo-50/30 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold text-indigo-900/80">Quick range</span>
            {PRESETS.filter((item) => item.id !== "custom").map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => applyPreset(item.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  preset === item.id
                    ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                    : "border-indigo-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            <FilterSelect
              label="Date range"
              value={preset}
              onChange={(value) => applyPreset(value as Preset)}
              options={PRESETS.map((item) => ({ value: item.id, label: item.label }))}
              labelClass={filterLabel}
              triggerClass={filterControl}
            />
            <FilterSelect
              label="Register"
              value={branchId}
              onChange={setBranchId}
              options={[{ value: "all", label: "All registers" }, ...(report?.filters.registers || []).map((item) => ({ value: item.id, label: `${item.name} (${item.number})` }))]}
              labelClass={filterLabel}
              triggerClass={filterControl}
            />
            <FilterSelect
              label="Cashier"
              value={cashierId}
              onChange={setCashierId}
              options={[{ value: "all", label: "All cashiers" }, ...(report?.filters.cashiers || []).map((item) => ({ value: item.id, label: item.name }))]}
              labelClass={filterLabel}
              triggerClass={filterControl}
            />
            <FilterSelect
              label="Payment method"
              value={paymentMethod}
              onChange={setPaymentMethod}
              options={[
                { value: "ALL", label: "All methods" },
                ...Object.entries(PAYMENT_LABELS).map(([value, label]) => ({ value, label })),
              ]}
              labelClass={filterLabel}
              triggerClass={filterControl}
            />
            <FilterSelect
              label="Transaction type"
              value={transactionType}
              onChange={setTransactionType}
              options={[
                { value: "ALL", label: "All types" },
                ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
              ]}
              labelClass={filterLabel}
              triggerClass={filterControl}
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "ALL", label: "All statuses" },
                { value: "COMPLETED", label: "Completed" },
                { value: "REFUNDED", label: "Refunded" },
                { value: "EXCHANGED", label: "Exchanged" },
                { value: "CANCELLED", label: "Cancelled" },
                { value: "APPROVED", label: "Approved" },
              ]}
              labelClass={filterLabel}
              triggerClass={filterControl}
            />
          </div>
          {preset === "custom" && (
            <div className="grid grid-cols-1 gap-3 border-t border-dashed border-indigo-200 pt-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-end [&_label]:text-xs [&_label]:font-semibold [&_label]:text-indigo-900/80">
              <DateField label="From Date" value={draftFrom} onChange={setDraftFrom} triggerClassName={filterControl} />
              <DateField label="To Date" value={draftTo} onChange={setDraftTo} triggerClassName={filterControl} />
              <Button className="h-9 shadow-sm" onClick={applyCustom}>
                Apply range
              </Button>
              <Button variant="outline" className="h-9 bg-white" onClick={resetDates}>
                Reset to today
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Sessions */}
      <Card className="relative overflow-hidden rounded-xl border-slate-200 shadow-sm">
        <PanelHeader
          icon={<Clock className="h-4 w-4" />}
          title="Register sessions"
          description="Every drawer opened in this period and how it closed"
          action={<CountPill>{report?.sessions.length || 0} sessions</CountPill>}
        />
        <RefreshOverlay show={isRefreshing} />
        {isFirstLoad ? (
          <TableSkeleton rows={3} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(th, "pl-5")}>Register</TableHead>
                  <TableHead className={th}>Cashier</TableHead>
                  <TableHead className={th}>Opened</TableHead>
                  <TableHead className={th}>Closed</TableHead>
                  <TableHead className={cn(th, "text-right")}>Opening</TableHead>
                  <TableHead className={cn(th, "text-right")}>Expected</TableHead>
                  <TableHead className={cn(th, "text-right")}>Counted</TableHead>
                  <TableHead className={cn(th, "text-right")}>Variance</TableHead>
                  <TableHead className={th}>Status</TableHead>
                  <TableHead className={cn(th, "pr-5")} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.sessions || []).length === 0 ? (
                  <EmptyRow colSpan={10} icon={Inbox} message="No register was opened in this period." />
                ) : (
                  report?.sessions.map((session) => (
                    <TableRow key={session.id} className="border-slate-100 hover:bg-slate-50/70">
                      <TableCell className="py-3 pl-5">
                        <p className="font-medium text-slate-900">{session.registerName}</p>
                        <p className="font-mono text-[11px] text-slate-500">{session.registerNumber}</p>
                      </TableCell>
                      <TableCell className="py-3 text-sm text-slate-700">{session.cashierName}</TableCell>
                      <TableCell className="whitespace-nowrap py-3 text-sm text-slate-600">{when(session.openedAt)}</TableCell>
                      <TableCell className="whitespace-nowrap py-3 text-sm text-slate-600">
                        {when(session.closedAt)}
                        {session.closedBy ? <p className="text-[11px] text-slate-400">by {session.closedBy}</p> : null}
                      </TableCell>
                      <TableCell className="py-3 text-right tabular-nums">{money(session.opening)}</TableCell>
                      <TableCell className="py-3 text-right tabular-nums text-slate-600">{money(session.expectedCash ?? null)}</TableCell>
                      <TableCell className="py-3 text-right tabular-nums">{money(session.closing)}</TableCell>
                      <TableCell className={cn("py-3 text-right font-semibold tabular-nums", varianceClass(session.varianceLabel ?? null))}>
                        {session.variance == null ? "—" : signed(session.variance)}
                      </TableCell>
                      <TableCell className="py-3">
                        {session.status === "OPEN" ? (
                          <Pill tone="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Open</Pill>
                        ) : (
                          <Pill
                            tone={
                              session.varianceLabel === "Short"
                                ? "bg-rose-50 text-rose-700 ring-rose-600/20"
                                : session.varianceLabel === "Over"
                                  ? "bg-amber-50 text-amber-700 ring-amber-600/20"
                                  : session.varianceLabel === "Balanced"
                                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                                    : "bg-slate-100 text-slate-700 ring-slate-500/20"
                            }
                          >
                            {session.varianceLabel || "Closed"}
                          </Pill>
                        )}
                      </TableCell>
                      <TableCell className="py-3 pr-5 text-right">
                        {session.status === "OPEN" ? (
                          <Button
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              setCloseTarget(session);
                              setCountedCash("");
                            }}
                          >
                            <Lock className="mr-1.5 h-3.5 w-3.5" />
                            Close
                          </Button>
                        ) : isAdmin ? (
                          <Button size="sm" variant="outline" className="h-8" onClick={() => setReopenTarget(session)}>
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            Reopen
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Payments + cash movement */}
      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <Card className="relative overflow-hidden rounded-xl border-slate-200 shadow-sm">
          <PanelHeader
            icon={<CreditCard className="h-4 w-4" />}
            title="Payment methods"
            description="How customers paid in this period"
            action={<CountPill>{money(paymentTotal)}</CountPill>}
          />
          <RefreshOverlay show={isRefreshing} />
          {isFirstLoad ? (
            <TableSkeleton rows={3} />
          ) : (report?.payments || []).length === 0 ? (
            <EmptyState icon={CreditCard} message="No payments in this period." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {report?.payments.map((row) => {
                const Icon = PAYMENT_ICONS[row.method] || Wallet;
                const share = paymentTotal > 0 ? (Math.max(0, row.amount) / paymentTotal) * 100 : 0;
                return (
                  <li key={row.method} className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{PAYMENT_LABELS[row.method] || row.method}</p>
                        <p className="text-xs text-slate-500">
                          {row.count} {row.count === 1 ? "transaction" : "transactions"} · {share.toFixed(0)}%
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{money(row.amount)}</p>
                    </div>
                    <div className="ml-12 mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-slate-900" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="relative overflow-hidden rounded-xl border-slate-200 shadow-sm">
          <PanelHeader icon={<Calculator className="h-4 w-4" />} title="Cash movement" description="How the expected drawer amount is worked out" />
          {isFirstLoad ? (
            <TableSkeleton rows={4} />
          ) : (
            <div className={cn("space-y-0.5 p-5 transition-opacity", isRefreshing && "opacity-50")}>
              <MoveRow label="Opening cash" value={report?.cash.openingCash} />
              <MoveRow sign="+" label="Cash sales" value={report?.cash.cashSales} />
              <MoveRow sign="+" label="Cash received from customers" value={report?.cash.cashReceived} />
              {report?.cash.cashDeposits ? (
                <MoveRow sign="+" label="Cash deposits" value={report.cash.cashDeposits} />
              ) : null}
              <MoveRow sign="−" label="Cash refunds" value={report?.cash.cashRefunds} />
              <MoveRow sign="−" label="Cash paid out" value={report?.cash.cashPaidOut} />
              <div className="!mt-3 flex items-center justify-between rounded-lg bg-slate-900 px-4 py-3 text-white">
                <span className="text-sm font-medium">Expected cash</span>
                <span className="text-base font-semibold tabular-nums">{money(report?.cash.expectedCash)}</span>
              </div>
              <div className="!mt-3 space-y-1 rounded-lg border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Actual closing cash</span>
                  <span className="font-medium tabular-nums text-slate-900">{money(report?.cash.actualClosing)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Difference</span>
                  <span className={cn("font-semibold tabular-nums", varianceClass(report?.cash.variance || null))}>
                    {report?.cash.difference == null ? "—" : `${signed(report.cash.difference)} · ${report.cash.variance}`}
                  </span>
                </div>
              </div>
              <p className="!mt-3 text-xs leading-relaxed text-slate-500">
                Expected = opening + cash sales + cash inflows − cash refunds − cash outflows. Difference = actual − expected.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* By cashier */}
      <Card className="relative overflow-hidden rounded-xl border-slate-200 shadow-sm">
        <PanelHeader
          icon={<Users className="h-4 w-4" />}
          title="By cashier"
          description="Who rang up what in this period"
          action={<CountPill>{cashierRows.length} {cashierRows.length === 1 ? "cashier" : "cashiers"}</CountPill>}
        />
        <RefreshOverlay show={isRefreshing} />
        {isFirstLoad ? (
          <TableSkeleton rows={3} />
        ) : cashierRows.length === 0 ? (
          <EmptyState icon={Users} message="No cashier activity in this period." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(th, "pl-5")}>Cashier</TableHead>
                  <TableHead className={cn(th, "text-right")}>Transactions</TableHead>
                  <TableHead className={cn(th, "text-right")}>Sales</TableHead>
                  <TableHead className={cn(th, "text-right")}>Sales total</TableHead>
                  <TableHead className={cn(th, "text-right")}>Refunds</TableHead>
                  <TableHead className={cn(th, "text-right")}>Avg sale</TableHead>
                  <TableHead className={cn(th, "w-[28%] pr-5")}>Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashierRows.map((row) => {
                  const share = cashierMaxNet > 0 ? (Math.max(0, row.net) / cashierMaxNet) * 100 : 0;
                  return (
                    <TableRow
                      key={row.cashier}
                      className="cursor-pointer border-slate-100 hover:bg-slate-50/70"
                      title="Search transactions by this cashier"
                      onClick={() => setTxSearch(row.cashier)}
                    >
                      <TableCell className="py-3 pl-5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold uppercase text-slate-600">
                            {row.cashier.slice(0, 2)}
                          </span>
                          <span className="truncate font-medium text-slate-900">{row.cashier}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-right tabular-nums text-slate-600">{row.transactions}</TableCell>
                      <TableCell className="py-3 text-right tabular-nums text-slate-600">{row.sales}</TableCell>
                      <TableCell className="whitespace-nowrap py-3 text-right tabular-nums">{money(row.salesTotal)}</TableCell>
                      <TableCell className={cn("whitespace-nowrap py-3 text-right tabular-nums", row.refunds ? "text-rose-700" : "text-slate-400")}>
                        {money(row.refunds)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-3 text-right tabular-nums text-slate-600">{money(row.average)}</TableCell>
                      <TableCell className="py-3 pr-5">
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${share}%` }} />
                          </div>
                          <span className="w-32 shrink-0 text-right font-semibold tabular-nums text-slate-900">{money(row.net)}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Sales summary */}
      <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
        <PanelHeader icon={<Receipt className="h-4 w-4" />} title="Sales summary" description="From gross to final sales" />
        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4 lg:grid-cols-7">
          {[
            { label: "Sales", value: String(report?.salesSummary.saleCount ?? 0) },
            { label: "Gross sales", value: money(report?.salesSummary.grossSales) },
            { label: "Discounts", value: money(report?.salesSummary.discounts), tone: "text-rose-700", sign: "−" },
            { label: "Returns / refunds", value: money(report?.salesSummary.returns), tone: "text-rose-700", sign: "−" },
            { label: "Net sales", value: money(report?.salesSummary.netSales), strong: true },
            { label: "Tax", value: money(report?.salesSummary.tax), sign: "+" },
            { label: "Final sales", value: money(report?.salesSummary.finalSales), strong: true },
          ].map((item) => (
            <div key={item.label} className={cn("min-w-0 bg-white p-4", item.strong && "bg-slate-50")}>
              <p className="truncate text-xs font-medium text-slate-500">
                {item.sign ? <span className="mr-1 text-slate-400">{item.sign}</span> : null}
                {item.label}
              </p>
              {isFirstLoad ? (
                <Skeleton className="mt-2 h-5 w-24" />
              ) : (
                <p
                  className={cn(
                    "mt-1 truncate text-base font-semibold tabular-nums text-slate-900 transition-opacity",
                    item.tone,
                    item.strong && "text-lg",
                    isRefreshing && "opacity-40",
                  )}
                >
                  {item.value}
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Transactions */}
      <Card className="relative overflow-hidden rounded-xl border-slate-200 shadow-sm">
        {isRefreshing ? (
          <div className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-slate-100" aria-hidden>
            <div className="h-full w-1/3 animate-[rr-progress_1.1s_ease-in-out_infinite] rounded-full bg-slate-900" />
          </div>
        ) : null}
        <PanelHeader
          icon={<Inbox className="h-4 w-4" />}
          title="Transactions"
          description={
            txSearch
              ? `${filteredTx.length} of ${exportRows.length} match “${txSearch}”`
              : `${exportRows.length} ${exportRows.length === 1 ? "transaction" : "transactions"} in this period`
          }
          action={
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-8 pl-9 pr-8 text-sm"
                placeholder="Search number, customer, cashier…"
                value={txSearch}
                onChange={(event) => setTxSearch(event.target.value)}
              />
              {txSearch ? (
                <button
                  type="button"
                  onClick={() => setTxSearch("")}
                  className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  title="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          }
        />
        <RefreshOverlay show={isRefreshing} label="Loading transactions…" />
        {isFirstLoad ? (
          <TableSkeleton rows={6} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(th, "pl-5")}>Number</TableHead>
                  <TableHead className={th}>Date</TableHead>
                  <TableHead className={th}>Customer</TableHead>
                  <TableHead className={th}>Cashier</TableHead>
                  <TableHead className={th}>Type</TableHead>
                  <TableHead className={cn(th, "text-right")}>Subtotal</TableHead>
                  <TableHead className={cn(th, "text-right")}>Discount</TableHead>
                  <TableHead className={cn(th, "text-right")}>Tax</TableHead>
                  <TableHead className={cn(th, "text-right")}>Total</TableHead>
                  <TableHead className={th}>Payment</TableHead>
                  <TableHead className={cn(th, "pr-5")}>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedTx.length === 0 ? (
                  <EmptyRow
                    colSpan={11}
                    icon={Inbox}
                    message={txSearch ? "No transactions match your search." : "No transactions in this period."}
                  />
                ) : (
                  pagedTx.map((row) => (
                    <TableRow key={row.id} className="border-slate-100 hover:bg-slate-50/70">
                      <TableCell className="whitespace-nowrap py-3 pl-5 font-mono text-xs font-medium text-slate-700">{row.number}</TableCell>
                      <TableCell className="whitespace-nowrap py-3 text-sm text-slate-600">{when(row.date)}</TableCell>
                      <TableCell className="py-3 text-slate-900">{row.customer}</TableCell>
                      <TableCell className="py-3 text-sm text-slate-600">{row.cashier}</TableCell>
                      <TableCell className="py-3">
                        <Pill tone={typeTone(row.type)}>{TYPE_LABELS[row.type] || row.type}</Pill>
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-3 text-right tabular-nums text-slate-600">{money(row.subtotal)}</TableCell>
                      <TableCell className="whitespace-nowrap py-3 text-right tabular-nums text-slate-600">{money(row.discount)}</TableCell>
                      <TableCell className="whitespace-nowrap py-3 text-right tabular-nums text-slate-600">{money(row.tax)}</TableCell>
                      <TableCell
                        className={cn(
                          "whitespace-nowrap py-3 text-right font-semibold tabular-nums",
                          row.total < 0 ? "text-rose-700" : "text-slate-900",
                        )}
                      >
                        {money(row.total)}
                      </TableCell>
                      <TableCell className="py-3">
                        <Pill tone={paymentTone(row.paymentMethod)}>{PAYMENT_LABELS[row.paymentMethod] || row.paymentMethod}</Pill>
                      </TableCell>
                      <TableCell className="py-3 pr-5">
                        <Pill tone={statusTone(row.status)}>{row.status}</Pill>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
        {filteredTx.length > TX_PAGE_SIZE ? (
          <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p className="tabular-nums">
              Showing {(txPage - 1) * TX_PAGE_SIZE + 1}–{Math.min(txPage * TX_PAGE_SIZE, filteredTx.length)} of {filteredTx.length}
            </p>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-8 bg-white px-2.5"
                disabled={txPage <= 1}
                onClick={() => setTxPage((page) => Math.max(1, page - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <span className="px-2 text-xs tabular-nums">
                Page {txPage} of {txPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-8 bg-white px-2.5"
                disabled={txPage >= txPages}
                onClick={() => setTxPage((page) => Math.min(txPages, page + 1))}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {/* Close register */}
      <Dialog open={!!closeTarget} onOpenChange={(open) => !open && setCloseTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Close {closeTarget?.registerName}
            </DialogTitle>
            <DialogDescription>
              Opened by {closeTarget?.cashierName} at {when(closeTarget?.openedAt)} with {money(closeTarget?.opening)}. Count
              every note and coin in the drawer.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!savingClose) closeRegister();
            }}
          >
            <div className="flex items-center justify-between rounded-lg bg-slate-900 px-4 py-3 text-white">
              <span className="text-sm font-medium">Expected for this session</span>
              <span className="text-base font-semibold tabular-nums">
                {expectedLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : money(closeExpected ?? report?.cash.expectedCash ?? 0)}
              </span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="counted-cash">Actual cash counted</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">PKR</span>
                <Input
                  id="counted-cash"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  autoFocus
                  className="h-11 pl-12 text-lg font-semibold tabular-nums"
                  value={countedCash}
                  onChange={(event) => setCountedCash(event.target.value)}
                />
              </div>
            </div>
            <CashCounter onTotal={(total) => setCountedCash(String(total))} />
            {closeVariance != null ? (
              <div
                className={cn(
                  "flex items-center justify-between rounded-lg border px-4 py-3 text-sm",
                  Math.abs(closeVariance) < 0.005
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : closeVariance > 0
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-rose-200 bg-rose-50 text-rose-800",
                )}
              >
                <span className="inline-flex items-center gap-2 font-medium">
                  {Math.abs(closeVariance) < 0.005 ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {Math.abs(closeVariance) < 0.005 ? "Balanced" : closeVariance > 0 ? "Over" : "Short"}
                </span>
                <span className="font-semibold tabular-nums">Variance {signed(closeVariance)}</span>
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCloseTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingClose || countedCash === ""}>
                {savingClose ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                {savingClose ? "Saving…" : "Close register"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reopen confirm */}
      <Dialog open={!!reopenTarget} onOpenChange={(open) => !open && setReopenTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Reopen this session?
            </DialogTitle>
            <DialogDescription>
              {reopenTarget?.registerName} opened at {when(reopenTarget?.openedAt)}. Its counted cash and variance will be
              cleared, and it must be closed again with a fresh count.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenTarget(null)}>
              Cancel
            </Button>
            <Button onClick={confirmReopen} disabled={reopening}>
              {reopening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Reopen session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const PAYMENT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  CASH: Wallet,
  CARD: CreditCard,
  BANK_TRANSFER: Landmark,
  ONLINE: Smartphone,
  OTHER: Receipt,
};

const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${money(Math.abs(value))}`;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string);

const SALE_TYPES = new Set(["SALE", "EXCHANGE"]);
const REFUND_TYPES = new Set(["RETURN", "REFUND"]);

type CashierRow = {
  cashier: string;
  transactions: number;
  sales: number;
  salesTotal: number;
  refunds: number;
  net: number;
  average: number;
};

/** Per-cashier performance, derived from the report's transaction list. */
function buildCashierRows(
  rows: { cashier: string; type: string; total: number; status: string }[],
): CashierRow[] {
  const map = new Map<string, CashierRow>();
  for (const row of rows) {
    if ((row.status || "").toUpperCase() === "CANCELLED") continue;
    const key = row.cashier || "—";
    const entry =
      map.get(key) || { cashier: key, transactions: 0, sales: 0, salesTotal: 0, refunds: 0, net: 0, average: 0 };
    entry.transactions += 1;
    if (SALE_TYPES.has(row.type) && row.total >= 0) {
      entry.sales += 1;
      entry.salesTotal += row.total;
    } else if (REFUND_TYPES.has(row.type) || (SALE_TYPES.has(row.type) && row.total < 0)) {
      entry.refunds += Math.abs(row.total);
    }
    map.set(key, entry);
  }
  return [...map.values()]
    .map((entry) => ({
      ...entry,
      salesTotal: Math.round(entry.salesTotal * 100) / 100,
      refunds: Math.round(entry.refunds * 100) / 100,
      net: Math.round((entry.salesTotal - entry.refunds) * 100) / 100,
      average: entry.sales ? Math.round((entry.salesTotal / entry.sales) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.net - a.net);
}

const paymentTone = (method: string) => {
  if (method === "CASH") return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (method === "CARD") return "bg-blue-50 text-blue-700 ring-blue-600/20";
  if (method === "BANK_TRANSFER") return "bg-sky-50 text-sky-700 ring-sky-600/20";
  if (method === "ONLINE") return "bg-violet-50 text-violet-700 ring-violet-600/20";
  return "bg-slate-100 text-slate-700 ring-slate-500/20";
};

const typeTone = (type: string) => {
  if (type === "RETURN" || type === "REFUND" || type === "CUSTOMER_REFUND") return "bg-rose-50 text-rose-700 ring-rose-600/20";
  if (type === "EXCHANGE") return "bg-violet-50 text-violet-700 ring-violet-600/20";
  if (type === "CASH_OUT") return "bg-orange-50 text-orange-700 ring-orange-600/20";
  if (type === "CUSTOMER_PAYMENT") return "bg-sky-50 text-sky-700 ring-sky-600/20";
  return "bg-slate-100 text-slate-700 ring-slate-500/20";
};

const statusTone = (status: string) => {
  const upper = (status || "").toUpperCase();
  if (upper === "COMPLETED" || upper === "APPROVED" || upper === "PAID") return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (upper === "REFUNDED" || upper === "CANCELLED") return "bg-rose-50 text-rose-700 ring-rose-600/20";
  if (upper === "EXCHANGED") return "bg-violet-50 text-violet-700 ring-violet-600/20";
  return "bg-slate-100 text-slate-700 ring-slate-500/20";
};

function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        tone,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}

function PanelHeader({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
          {description ? <p className="truncate text-xs text-slate-500">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

function CountPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-slate-600">
      {children}
    </span>
  );
}

function RefreshOverlay({ show, label = "Updating…" }: { show: boolean; label?: string }) {
  if (!show) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-md">
        <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
        {label}
      </div>
    </div>
  );
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-4 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: ComponentType<{ className?: string }>; message: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-slate-700">{message}</p>
    </div>
  );
}

function EmptyRow({
  colSpan,
  icon,
  message,
}: {
  colSpan: number;
  icon: ComponentType<{ className?: string }>;
  message: string;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="p-0">
        <EmptyState icon={icon} message={message} />
      </TableCell>
    </TableRow>
  );
}

function MoveRow({ label, value, sign }: { label: string; value: number | null | undefined; sign?: "+" | "−" }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="flex items-center gap-2 text-slate-600">
        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded text-xs font-semibold",
            sign === "+" ? "bg-emerald-50 text-emerald-700" : sign === "−" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500",
          )}
        >
          {sign || "="}
        </span>
        {label}
      </span>
      <span className="font-medium tabular-nums text-slate-900">{money(value ?? 0)}</span>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  labelClass,
  triggerClass,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  labelClass?: string;
  triggerClass?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className={labelClass}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={triggerClass}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
