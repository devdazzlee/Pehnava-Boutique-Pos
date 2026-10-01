"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Download, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(summary), "Summary");
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
    const rows = exportRows
      .map(
        (row) => `<tr>
          <td>${row.number}</td><td>${when(row.date)}</td><td>${row.customer}</td><td>${row.cashier}</td>
          <td>${TYPE_LABELS[row.type] || row.type}</td><td>${money(row.subtotal)}</td><td>${money(row.discount)}</td>
          <td>${money(row.tax)}</td><td>${money(row.total)}</td><td>${PAYMENT_LABELS[row.paymentMethod] || row.paymentMethod}</td><td>${row.status}</td>
        </tr>`,
      )
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Register Report</title>
      <style>
        body{font-family:Georgia,serif;padding:28px;color:#2a2012}
        .top{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #a67c2e;padding-bottom:12px}
        img{height:58px;width:auto}
        h1{margin:0;font-size:22px}
        p{margin:4px 0 0;color:#786448}
        table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}
        td,th{border-bottom:1px solid #e8dcc4;padding:6px;text-align:left}
        th{background:#2a2012;color:#fff}
        .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0}
        .cards div{border:1px solid #e8dcc4;border-left:3px solid #a67c2e;padding:8px}
      </style>
      </head><body>
      <div class="top">
        <img src="${window.location.origin}/logo.png" alt="Pehnawa" />
        <div style="text-align:right"><h1>Register Report</h1><p>${periodLabel(report.period.from, report.period.to)}</p></div>
      </div>
      <div class="cards">
        <div>Opening cash<strong><br>${money(report.cards.openingCash)}</strong></div>
        <div>Net sales<strong><br>${money(report.cards.netSales)}</strong></div>
        <div>Expected cash<strong><br>${money(report.cards.expectedCash)}</strong></div>
        <div>Actual cash<strong><br>${money(report.cards.actualCash)}</strong></div>
        <div>Variance<strong><br>${money(report.cards.variance)} ${report.cards.varianceLabel || ""}</strong></div>
        <div>Refunds<strong><br>${money(report.cards.refunds)}</strong></div>
      </div>
      <table><thead><tr><th>Number</th><th>Date</th><th>Customer</th><th>Cashier</th><th>Type</th><th>Subtotal</th><th>Discount</th><th>Tax</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  const cards = report
    ? [
        ["Opening Cash", money(report.cards.openingCash)],
        ["Gross Sales", money(report.cards.grossSales)],
        ["Net Sales", money(report.cards.netSales)],
        ["Cash Sales", money(report.cards.cashSales)],
        ["Other Payments", money(report.cards.otherPayments)],
        ["Refunds", money(report.cards.refunds)],
        ["Expected Cash", money(report.cards.expectedCash)],
        ["Actual Cash", money(report.cards.actualCash)],
        ["Variance", `${money(report.cards.variance)} ${report.cards.varianceLabel || ""}`.trim()],
      ]
    : [];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Register Report</h1>
          <p className="text-sm text-gray-500">
            Reporting Period: {periodLabel(from, to)}
            {report?.registerStatus === "OPEN" ? " · Register open" : report?.registerStatus === "CLOSED" ? " · Register closed" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!report}>CSV</Button>
          <Button variant="outline" onClick={exportExcel} disabled={!report}>
            <Download className="mr-2 h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" onClick={exportPdf} disabled={!report}>PDF</Button>
          <Button variant="outline" onClick={printReport} disabled={!report}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <FilterSelect
              label="Date range"
              value={preset}
              onChange={(value) => applyPreset(value as Preset)}
              options={PRESETS.map((item) => ({ value: item.id, label: item.label }))}
            />
            <FilterSelect
              label="Register"
              value={branchId}
              onChange={setBranchId}
              options={[{ value: "all", label: "All registers" }, ...(report?.filters.registers || []).map((item) => ({ value: item.id, label: `${item.name} (${item.number})` }))]}
            />
            <FilterSelect
              label="Cashier"
              value={cashierId}
              onChange={setCashierId}
              options={[{ value: "all", label: "All cashiers" }, ...(report?.filters.cashiers || []).map((item) => ({ value: item.id, label: item.name }))]}
            />
            <FilterSelect
              label="Payment method"
              value={paymentMethod}
              onChange={setPaymentMethod}
              options={[
                { value: "ALL", label: "All methods" },
                ...Object.entries(PAYMENT_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
            <FilterSelect
              label="Transaction type"
              value={transactionType}
              onChange={setTransactionType}
              options={[
                { value: "ALL", label: "All types" },
                ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
              ]}
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
            />
          </div>
          {preset === "custom" && (
            <div className="grid grid-cols-1 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-end">
              <DateField label="From Date" value={draftFrom} onChange={setDraftFrom} />
              <DateField label="To Date" value={draftTo} onChange={setDraftTo} />
              <Button onClick={applyCustom}>Apply</Button>
              <Button variant="outline" onClick={resetDates}>Clear</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
              <p className={cn("mt-1 text-xl font-semibold", label === "Variance" ? varianceClass(report?.cards.varianceLabel || null) : "text-gray-900")}>
                {loading ? "…" : value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Register sessions</CardTitle>
          {openSession && (
            <Button size="sm" onClick={() => { setCloseTarget(openSession); setCountedCash(""); }}>
              Close register
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Register</TableHead>
                <TableHead>Cashier</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead>Closed</TableHead>
                <TableHead>Opening</TableHead>
                <TableHead>Closing</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(report?.sessions || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-gray-500">No register was opened in this period.</TableCell>
                </TableRow>
              ) : (
                report?.sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>{session.registerName} · {session.registerNumber}</TableCell>
                    <TableCell>{session.cashierName}</TableCell>
                    <TableCell>{when(session.openedAt)}</TableCell>
                    <TableCell>{when(session.closedAt)}</TableCell>
                    <TableCell>{money(session.opening)}</TableCell>
                    <TableCell>{money(session.closing)}</TableCell>
                    <TableCell>
                      <Badge variant={session.status === "OPEN" ? "default" : "secondary"}>{session.status === "OPEN" ? "Open" : "Closed"}</Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        {session.status === "CLOSED" && (
                          <Button size="sm" variant="outline" onClick={() => reopen(session.id)}>Reopen</Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Payment method summary</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead>Transactions</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.payments || []).map((row) => (
                  <TableRow key={row.method}>
                    <TableCell>{PAYMENT_LABELS[row.method] || row.method}</TableCell>
                    <TableCell>{row.count}</TableCell>
                    <TableCell>{money(row.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Cash movement</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              ["Opening cash", report?.cash.openingCash],
              ["Cash sales", report?.cash.cashSales],
              ["Cash received from customers", report?.cash.cashReceived],
              ["Cash deposits", report?.cash.cashDeposits],
              ["Cash refunds", report?.cash.cashRefunds],
              ["Cash paid out", report?.cash.cashPaidOut],
              ["Expected cash", report?.cash.expectedCash],
              ["Actual closing cash", report?.cash.actualClosing],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between border-b border-gray-100 py-1">
                <span className="text-gray-600">{label}</span>
                <span className="font-medium">{money(value as number | null)}</span>
              </div>
            ))}
            <div className={cn("flex justify-between pt-2 text-base font-semibold", varianceClass(report?.cash.variance || null))}>
              <span>Difference · {report?.cash.variance || "Not closed"}</span>
              <span>{money(report?.cash.difference)}</span>
            </div>
            <p className="pt-2 text-xs text-gray-500">
              Expected cash = opening cash + cash sales + cash inflows − cash refunds − cash outflows.
              Difference = actual closing cash − expected cash.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sales summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Sales", report?.salesSummary.saleCount],
            ["Gross sales", money(report?.salesSummary.grossSales)],
            ["Discounts", money(report?.salesSummary.discounts)],
            ["Returns / refunds", money(report?.salesSummary.returns)],
            ["Net sales", money(report?.salesSummary.netSales)],
            ["Tax", money(report?.salesSummary.tax)],
            ["Final sales", money(report?.salesSummary.finalSales)],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-md border border-gray-100 p-3">
              <p className="text-xs uppercase text-gray-500">{label}</p>
              <p className="text-lg font-semibold">{loading ? "…" : value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Transactions</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Cashier</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Subtotal</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exportRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-gray-500">No transactions in this period.</TableCell>
                </TableRow>
              ) : (
                exportRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.number}</TableCell>
                    <TableCell>{when(row.date)}</TableCell>
                    <TableCell>{row.customer}</TableCell>
                    <TableCell>{row.cashier}</TableCell>
                    <TableCell>{TYPE_LABELS[row.type] || row.type}</TableCell>
                    <TableCell>{money(row.subtotal)}</TableCell>
                    <TableCell>{money(row.discount)}</TableCell>
                    <TableCell>{money(row.tax)}</TableCell>
                    <TableCell>{money(row.total)}</TableCell>
                    <TableCell>{PAYMENT_LABELS[row.paymentMethod] || row.paymentMethod}</TableCell>
                    <TableCell>{row.status}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!closeTarget} onOpenChange={(open) => !open && setCloseTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close {closeTarget?.registerName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Count the cash in the drawer. Expected cash for this period is {money(report?.cash.expectedCash)}. The saved variance uses this session&apos;s own sales, refunds, and cash movements.
            </p>
            <Label htmlFor="counted-cash">Actual cash counted</Label>
            <Input id="counted-cash" type="number" min="0" step="0.01" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseTarget(null)}>Cancel</Button>
            <Button onClick={closeRegister} disabled={savingClose}>{savingClose ? "Saving…" : "Close register"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
