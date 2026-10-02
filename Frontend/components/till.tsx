"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Calculator,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  Inbox,
  Loader2,
  Lock,
  LockOpen,
  Printer,
  Receipt,
  RefreshCw,
  RotateCcw,
  Scale,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  Undo2,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DateField } from "@/components/ui/date-picker";
import { CashCounter } from "@/components/cash-counter";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { ymd, rangeForPreset } from "@/lib/business-timezone";

interface TillSession {
  id: string;
  status: string;
  opening: number;
  closing: number | null;
  expectedCash: number;
  variance: number | null;
  varianceLabel: string | null;
  openedAt: string;
  closedAt: string | null;
  openedBy: string;
  closedBy: string;
}

interface TillDay {
  date: string;
  period: { from: string; to: string };
  branch: { id: string; name: string; code: string };
  branches: { id: string; name: string; code: string }[];
  session: TillSession | null;
  sessions: TillSession[];
  summary: {
    opening: number;
    cashSales: number;
    cardSales: number;
    otherSales: number;
    cashRefunds: number;
    paidOut: number;
    expectedCash: number;
    closing: number | null;
    variance: number | null;
    billCount: number;
    grossSales: number;
    netSales: number;
    sessionCount: number;
  };
  paidOuts: {
    id: string;
    particular: string;
    amount: number;
    at: string;
    by?: string | null;
    canVoid?: boolean;
  }[];
  transactions: {
    id: string;
    date: string;
    number: string;
    type: string;
    customer?: string | null;
    paymentMethod: string;
    total: number;
    status: string;
  }[];
  transactionCount?: number;
  staleOpenSession?: {
    id: string;
    opening: number;
    openedAt: string;
    openedBy: string;
  } | null;
  canOpen: boolean;
  canClose: boolean;
  canPaidOut: boolean;
  canReopen: boolean;
}

type Preset = "all" | "today" | "yesterday" | "last7" | "last30" | "custom";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 Days" },
  { id: "last30", label: "Last 30 Days" },
  { id: "custom", label: "Custom Range" },
];


const rangeFor = (preset: Exclude<Preset, "custom">) => rangeForPreset(preset);

const money = (value: number | null | undefined) =>
  `PKR ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const signedMoney = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${money(Math.abs(value))}`;

const periodLabel = (from: string, to: string) =>
  from === "2000-01-01"
    ? "All dates"
    : from === to
    ? format(new Date(`${from}T00:00:00`), "dd MMM yyyy")
    : `${format(new Date(`${from}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${to}T00:00:00`), "dd MMM yyyy")}`;

const varianceTone = (value: number | null | undefined) =>
  value == null
    ? "text-slate-900"
    : Math.abs(value) < 0.005
      ? "text-emerald-700"
      : value > 0
        ? "text-sky-700"
        : "text-rose-700";

const varianceWord = (value: number) =>
  Math.abs(value) < 0.005 ? "Balanced" : value > 0 ? "Over" : "Short";

const paymentTone = (method: string) => {
  const upper = (method || "").toUpperCase();
  if (upper === "CASH") return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (upper === "CARD") return "bg-blue-50 text-blue-700 ring-blue-600/20";
  if (upper === "CREDIT") return "bg-amber-50 text-amber-700 ring-amber-600/20";
  return "bg-violet-50 text-violet-700 ring-violet-600/20";
};

const typeTone = (type: string) => {
  const upper = (type || "").toUpperCase();
  if (upper.includes("REFUND") || upper.includes("RETURN")) return "bg-rose-50 text-rose-700 ring-rose-600/20";
  if (upper.includes("EXCHANGE")) return "bg-violet-50 text-violet-700 ring-violet-600/20";
  return "bg-slate-100 text-slate-700 ring-slate-500/20";
};

export function Till() {
  const { toast } = useToast();
  const today = ymd(new Date());
  const initial = rangeFor("today");
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [branchId, setBranchId] = useState("auto");
  const [report, setReport] = useState<TillDay | null>(null);
  const [loading, setLoading] = useState(true);

  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [paidOutDialog, setPaidOutDialog] = useState(false);
  const [voidTarget, setVoidTarget] = useState<TillDay["paidOuts"][number] | null>(null);
  const [openingAmount, setOpeningAmount] = useState("0");
  const [closingAmount, setClosingAmount] = useState("");
  const [paidOutAmount, setPaidOutAmount] = useState("");
  const [paidOutReason, setPaidOutReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<null | "xlsx" | "csv" | "pdf">(null);

  const coversToday = from <= today && to >= today;
  const isFirstLoad = loading && !report;
  const isRefreshing = loading && !!report;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { from, to };
      if (branchId !== "auto") params.branchId = branchId;
      const response = await apiClient.get("/till/day", { params });
      const data = response.data.data as TillDay;
      setReport(data);
      if (branchId === "auto" && data.branch?.id) setBranchId(data.branch.id);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load till",
        description: error?.response?.data?.message || error?.message || "Try again",
      });
    } finally {
      setLoading(false);
    }
  }, [from, to, branchId, toast]);

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

  const jumpToDay = (day: string) => {
    setPreset("custom");
    setFrom(day);
    setTo(day);
    setDraftFrom(day);
    setDraftTo(day);
  };

  const expectedPreview = useMemo(() => {
    if (!report) return 0;
    return report.summary.expectedCash;
  }, [report]);

  const countedClosing = Number(closingAmount || 0);
  const variancePreview = closingAmount === "" ? null : countedClosing - expectedPreview;

  const openTill = async () => {
    const opening = Number(openingAmount);
    if (!Number.isFinite(opening) || opening < 0) {
      toast({ variant: "destructive", title: "Enter a valid opening amount" });
      return;
    }
    setSaving(true);
    try {
      await apiClient.post("/till/open", {
        opening,
        ...(branchId !== "auto" ? { branchId } : {}),
      });
      toast({ title: "Till opened for today" });
      setOpenDialog(false);
      setOpeningAmount("0");
      setPreset("today");
      setFrom(today);
      setTo(today);
      setDraftFrom(today);
      setDraftTo(today);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not open till",
        description: error?.response?.data?.message || error?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const recordPaidOut = async () => {
    const amount = Number(paidOutAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "Enter a valid paid-out amount" });
      return;
    }
    if (!paidOutReason.trim()) {
      toast({ variant: "destructive", title: "Enter a reason for this paid-out" });
      return;
    }
    setSaving(true);
    try {
      await apiClient.post("/till/paid-out", {
        amount,
        particular: paidOutReason.trim(),
        ...(branchId !== "auto" ? { branchId } : {}),
      });
      toast({ title: "Paid-out recorded" });
      setPaidOutDialog(false);
      setPaidOutAmount("");
      setPaidOutReason("");
      await load();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not record paid-out",
        description: error?.response?.data?.message || error?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const voidPaidOut = async () => {
    if (!voidTarget) return;
    setSaving(true);
    try {
      await apiClient.post(`/till/paid-out/${voidTarget.id}/void`, {});
      toast({ title: "Paid-out voided", description: `${money(voidTarget.amount)} returned to the expected cash.` });
      setVoidTarget(null);
      await load();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not void paid-out",
        description: error?.response?.data?.message || error?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const closeTill = async () => {
    if (!report?.session?.id) return;
    if (!Number.isFinite(countedClosing) || countedClosing < 0) {
      toast({ variant: "destructive", title: "Enter the counted closing cash" });
      return;
    }
    setSaving(true);
    try {
      await apiClient.post("/till/close", {
        cashflow_id: report.session.id,
        closing: countedClosing,
      });
      toast({ title: "Till closed for the day" });
      setCloseDialog(false);
      setClosingAmount("");
      await load();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not close till",
        description: error?.response?.data?.message || error?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const reopenTill = async () => {
    if (!report?.session?.id) return;
    setSaving(true);
    try {
      await apiClient.post(`/till/sessions/${report.session.id}/reopen`);
      toast({ title: "Till reopened" });
      await load();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not reopen till",
        description: error?.response?.data?.message || error?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const printDay = () => {
    if (!report) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const rows = report.transactions
      .map(
        (row) => `<tr>
          <td>${format(new Date(row.date), "dd-MMM-yy HH:mm")}</td>
          <td>${row.number}</td>
          <td>${row.type}</td>
          <td>${row.customer || "—"}</td>
          <td>${row.paymentMethod}</td>
          <td style="text-align:right">${money(row.total)}</td>
        </tr>`,
      )
      .join("");
    const paidOutRows = report.paidOuts
      .map(
        (row) => `<tr>
          <td>${format(new Date(row.at), "dd-MMM-yy HH:mm")}</td>
          <td>${row.particular}</td>
          <td>${row.by || "—"}</td>
          <td style="text-align:right">${money(row.amount)}</td>
        </tr>`,
      )
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Daily Till</title>
      <style>
        body{font-family:Georgia,serif;color:#2a2012;padding:28px}
        .top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #a67c2e;padding-bottom:12px}
        img{height:56px}
        h2{font-size:14px;margin:20px 0 0}
        table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}
        th{background:#2a2012;color:#fff;text-align:left;padding:6px}
        td{border-bottom:1px solid #e8dcc4;padding:6px}
        .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}
        .card{border:1px solid #e8dcc4;padding:12px;background:#fcf8f2}
      </style></head><body>
      <div class="top"><img src="${window.location.origin}/logo.png" alt="Pehnawa" />
      <div style="text-align:right"><h1 style="margin:0">Daily Till</h1>
      <p style="margin:4px 0 0;color:#786448">${periodLabel(report.period.from, report.period.to)} · ${report.branch.name}</p></div></div>
      <div class="cards">
        <div class="card"><div>Opening</div><strong>${money(report.summary.opening)}</strong></div>
        <div class="card"><div>Cash sales</div><strong>${money(report.summary.cashSales)}</strong></div>
        <div class="card"><div>Cash refunds</div><strong>${money(report.summary.cashRefunds)}</strong></div>
        <div class="card"><div>Paid out</div><strong>${money(report.summary.paidOut)}</strong></div>
        <div class="card"><div>Expected</div><strong>${money(report.summary.expectedCash)}</strong></div>
        <div class="card"><div>Counted</div><strong>${report.summary.closing == null ? "—" : money(report.summary.closing)}</strong></div>
        <div class="card"><div>Variance</div><strong>${report.summary.variance == null ? "—" : signedMoney(report.summary.variance)}</strong></div>
        <div class="card"><div>Card / other</div><strong>${money(report.summary.cardSales + report.summary.otherSales)}</strong></div>
      </div>
      <h2>Paid outs</h2>
      <table><thead><tr><th>Time</th><th>Reason</th><th>By</th><th>Amount</th></tr></thead>
      <tbody>${paidOutRows || `<tr><td colspan="4">No paid-outs.</td></tr>`}</tbody></table>
      <h2>Transactions</h2>
      <table><thead><tr><th>Time</th><th>No.</th><th>Type</th><th>Customer</th><th>Pay</th><th>Amount</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6">No transactions.</td></tr>`}</tbody></table>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  // ----- Export (Excel / CSV / PDF) -----
  const exportBaseName = () => {
    const code = (report?.branch.code || report?.branch.name || "branch").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const range = from === "2000-01-01" ? "all-dates" : from === to ? from : `${from}_to_${to}`;
    return `daily-till-${code}-${range}`;
  };

  const buildExportData = (data: TillDay) => {
    const s = data.summary;
    const summary: (string | number)[][] = [
      ["Branch", `${data.branch.name} (${data.branch.code})`],
      ["Period", periodLabel(data.period.from, data.period.to)],
      ["Till status", data.session ? data.session.status : "Not opened"],
      ["Sessions", s.sessionCount],
      ["Opening cash", s.opening],
      ["Cash sales", s.cashSales],
      ["Cash refunds", s.cashRefunds],
      ["Paid out", s.paidOut],
      ["Expected cash", s.expectedCash],
      ["Counted cash", s.closing ?? "—"],
      ["Variance", s.variance ?? "—"],
      ["Variance status", s.variance == null ? "—" : varianceWord(s.variance)],
      ["Card sales", s.cardSales],
      ["Other payments", s.otherSales],
      ["Gross sales", s.grossSales],
      ["Net sales", s.netSales],
      ["Bills", s.billCount],
      ["Generated", format(new Date(), "dd MMM yyyy HH:mm")],
    ];
    const paidOuts = data.paidOuts.map((row) => [
      format(new Date(row.at), "dd MMM yyyy HH:mm"),
      row.particular,
      row.by || "—",
      row.amount,
    ]);
    const sessions = data.sessions.map((row) => [
      format(new Date(row.openedAt), "dd MMM yyyy"),
      `${format(new Date(row.openedAt), "HH:mm")} · ${row.openedBy}`,
      row.closedAt ? `${format(new Date(row.closedAt), "HH:mm")} · ${row.closedBy || "—"}` : "—",
      row.opening,
      row.closing ?? "—",
      row.variance ?? "—",
      row.status === "OPEN" ? "Open" : row.varianceLabel || "Closed",
    ]);
    const transactions = data.transactions.map((row) => [
      format(new Date(row.date), "dd MMM yyyy HH:mm"),
      row.number,
      row.type,
      row.customer || "—",
      row.paymentMethod,
      row.total,
    ]);
    return { summary, paidOuts, sessions, transactions };
  };

  const EXPORT_HEADERS = {
    summary: ["Item", "Value"],
    paidOuts: ["Date / time", "Reason", "Recorded by", "Amount (PKR)"],
    sessions: ["Day", "Opened", "Closed", "Opening (PKR)", "Counted (PKR)", "Variance (PKR)", "Status"],
    transactions: ["Date / time", "No.", "Type", "Customer", "Payment", "Amount (PKR)"],
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportExcel = async (data: TillDay) => {
    const XLSX = await import("xlsx");
    const rows = buildExportData(data);
    const wb = XLSX.utils.book_new();
    const addSheet = (name: string, header: string[], body: (string | number)[][], widths: number[]) => {
      const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
      ws["!cols"] = widths.map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    };
    addSheet("Summary", EXPORT_HEADERS.summary, rows.summary, [22, 34]);
    addSheet("Paid outs", EXPORT_HEADERS.paidOuts, rows.paidOuts, [20, 36, 16, 14]);
    addSheet("Sessions", EXPORT_HEADERS.sessions, rows.sessions, [14, 20, 20, 14, 14, 14, 12]);
    addSheet("Transactions", EXPORT_HEADERS.transactions, rows.transactions, [20, 22, 12, 22, 12, 14]);
    XLSX.writeFile(wb, `${exportBaseName()}.xlsx`);
  };

  const exportCsv = (data: TillDay) => {
    const rows = buildExportData(data);
    const esc = (value: string | number) => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const section = (title: string, header: string[], body: (string | number)[][]) =>
      [title, header.map(esc).join(","), ...body.map((r) => r.map(esc).join(",")), ""].join("\n");
    const csv = [
      section("SUMMARY", EXPORT_HEADERS.summary, rows.summary),
      section("PAID OUTS", EXPORT_HEADERS.paidOuts, rows.paidOuts),
      section("SESSIONS", EXPORT_HEADERS.sessions, rows.sessions),
      section("TRANSACTIONS", EXPORT_HEADERS.transactions, rows.transactions),
    ].join("\n");
    // BOM so Excel opens the UTF-8 file with the right encoding.
    downloadBlob(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `${exportBaseName()}.csv`);
  };

  const exportPdf = async (data: TillDay) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = 210;
    const pageH = 297;
    const m = 14;
    const usable = pageW - m * 2;
    const bottom = pageH - 16;
    const s = data.summary;
    const pdfMoney = (v: number | null) => (v == null ? "—" : money(v).replace("PKR ", "Rs "));

    // Header band
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Daily Till Report", m, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${data.branch.name} (${data.branch.code})`, m, 18.5);
    doc.setFontSize(8);
    doc.text(periodLabel(data.period.from, data.period.to), pageW - m, 12, { align: "right" });
    doc.text(`Status: ${data.session ? data.session.status : "Not opened"}`, pageW - m, 17, { align: "right" });
    doc.text(`Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`, pageW - m, 22, { align: "right" });
    let y = 34;

    // KPI tiles (2 rows of 4)
    const tiles: [string, string][] = [
      ["OPENING CASH", pdfMoney(s.opening)],
      ["CASH SALES", pdfMoney(s.cashSales)],
      ["CASH REFUNDS", pdfMoney(s.cashRefunds)],
      ["PAID OUT", pdfMoney(s.paidOut)],
      ["EXPECTED CASH", pdfMoney(s.expectedCash)],
      ["COUNTED CASH", pdfMoney(s.closing)],
      ["VARIANCE", s.variance == null ? "—" : `${pdfMoney(s.variance)} (${varianceWord(s.variance)})`],
      ["NET SALES", `${pdfMoney(s.netSales)} · ${s.billCount} bills`],
    ];
    const gap = 3;
    const tileW = (usable - gap * 3) / 4;
    const tileH = 17;
    tiles.forEach(([label, value], i) => {
      const x = m + (i % 4) * (tileW + gap);
      const ty = y + Math.floor(i / 4) * (tileH + gap);
      const highlight = label === "EXPECTED CASH";
      doc.setDrawColor(226, 232, 240);
      if (highlight) doc.setFillColor(15, 23, 42);
      else doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, ty, tileW, tileH, 2, 2, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.3);
      if (highlight) doc.setTextColor(203, 213, 225);
      else doc.setTextColor(100, 116, 139);
      doc.text(label, x + 3, ty + 6);
      doc.setFontSize(9.5);
      if (highlight) doc.setTextColor(255, 255, 255);
      else doc.setTextColor(15, 23, 42);
      doc.text(doc.splitTextToSize(value, tileW - 6)[0] || "", x + 3, ty + 12.5);
    });
    y += tileH * 2 + gap + 10;

    type Col = { label: string; width: number; right?: boolean };
    const drawHeader = (cols: Col[]) => {
      doc.setFillColor(241, 245, 249);
      doc.rect(m, y, usable, 6.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(51, 65, 85);
      let x = m;
      cols.forEach((c) => {
        doc.text(c.label, c.right ? x + c.width - 2 : x + 2, y + 4.4, c.right ? { align: "right" } : undefined);
        x += c.width;
      });
      y += 6.5;
    };
    const drawTable = (title: string, cols: Col[], body: (string | number)[][]) => {
      if (y + 16 > bottom) {
        doc.addPage();
        y = m;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(title, m, y);
      doc.setDrawColor(79, 70, 229);
      doc.setLineWidth(0.6);
      doc.line(m, y + 1.6, m + 10, y + 1.6);
      y += 6;
      drawHeader(cols);
      if (!body.length) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text("No data", m + 2, y + 4.5);
        y += 12;
        return;
      }
      const rowH = 6.2;
      body.forEach((row, idx) => {
        if (y + rowH > bottom) {
          doc.addPage();
          y = m;
          drawHeader(cols);
        }
        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(m, y, usable, rowH, "F");
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.2);
        doc.setTextColor(30, 41, 59);
        let x = m;
        row.forEach((cell, ci) => {
          const c = cols[ci];
          const text = typeof cell === "number" ? pdfMoney(cell) : String(cell ?? "—");
          const fitted = doc.splitTextToSize(text, c.width - 4)[0] || "";
          doc.text(fitted, c.right ? x + c.width - 2 : x + 2, y + rowH - 1.8, c.right ? { align: "right" } : undefined);
          x += c.width;
        });
        y += rowH;
      });
      y += 8;
    };

    const rows = buildExportData(data);
    drawTable(
      "Paid outs",
      [
        { label: "DATE / TIME", width: 38 },
        { label: "REASON", width: 84 },
        { label: "BY", width: 28 },
        { label: "AMOUNT", width: usable - 150, right: true },
      ],
      rows.paidOuts,
    );
    if (data.sessions.length > 1) {
      drawTable(
        "Till sessions",
        [
          { label: "DAY", width: 24 },
          { label: "OPENED", width: 32 },
          { label: "CLOSED", width: 32 },
          { label: "OPENING", width: 26, right: true },
          { label: "COUNTED", width: 26, right: true },
          { label: "VARIANCE", width: 24, right: true },
          { label: "STATUS", width: usable - 164 },
        ],
        rows.sessions,
      );
    }
    drawTable(
      "Transactions",
      [
        { label: "DATE / TIME", width: 32 },
        { label: "NO.", width: 40 },
        { label: "TYPE", width: 20 },
        { label: "CUSTOMER", width: 40 },
        { label: "PAYMENT", width: 22 },
        { label: "AMOUNT", width: usable - 154, right: true },
      ],
      rows.transactions,
    );

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(m, pageH - 13, pageW - m, pageH - 13);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text("Pehnawa Boutique Pos · Daily Till", m, pageH - 8);
      doc.text(`Page ${i} of ${pages}`, pageW - m, pageH - 8, { align: "right" });
    }
    doc.save(`${exportBaseName()}.pdf`);
  };

  const handleExport = async (type: "xlsx" | "csv" | "pdf") => {
    if (!report) return;
    setExporting(type);
    try {
      if (type === "xlsx") await exportExcel(report);
      else if (type === "csv") exportCsv(report);
      else await exportPdf(report);
      toast({
        title: "Export ready",
        description:
          report.transactionCount != null && report.transactionCount > report.transactions.length
            ? `Includes the first ${report.transactions.length} of ${report.transactionCount} transactions — narrow the date range for the rest.`
            : `Saved ${exportBaseName()}.${type}`,
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Export failed", description: error?.message || "Try again" });
    } finally {
      setExporting(null);
    }
  };

  const session = report?.session || null;
  const status = session?.status || "CLOSED";
  const tillState: "open" | "closed" | "none" = !session ? "none" : status === "OPEN" ? "open" : "closed";
  const stale = report?.staleOpenSession || null;
  const staleDay = stale ? ymd(new Date(stale.openedAt)) : null;
  const viewingStaleDay = Boolean(staleDay && from === staleDay && to === staleDay);
  const showSessionsTable = (report?.sessions.length || 0) > 1 || (from !== to && (report?.sessions.length || 0) > 0);
  const truncatedTransactions =
    report?.transactionCount != null && report.transactionCount > report.transactions.length;

  const statusMeta = {
    open: {
      title: "Till is open",
      icon: LockOpen,
      tile: "bg-emerald-600 text-white",
      ring: "border-emerald-200",
      band: "from-emerald-50 to-white",
      pill: "bg-emerald-100 text-emerald-800",
      pillText: "Open",
    },
    closed: {
      title: "Till is closed",
      icon: Lock,
      tile: "bg-slate-800 text-white",
      ring: "border-slate-200",
      band: "from-slate-50 to-white",
      pill: "bg-slate-200 text-slate-700",
      pillText: "Closed",
    },
    none: {
      title: coversToday ? "Till not opened yet" : "No till session",
      icon: AlertTriangle,
      tile: "bg-amber-500 text-white",
      ring: "border-amber-200",
      band: "from-amber-50 to-white",
      pill: "bg-amber-100 text-amber-800",
      pillText: "Not opened",
    },
  }[tillState];
  const StatusIcon = statusMeta.icon;

  const kpis: Array<{
    label: string;
    value: string;
    hint: string;
    icon: ComponentType<{ className?: string }>;
    tone: string;
    valueClass?: string;
  }> = report
    ? [
        { label: "Opening cash", value: money(report.summary.opening), hint: "Counted at open", icon: Wallet, tone: "bg-slate-100 text-slate-600" },
        { label: "Cash sales", value: money(report.summary.cashSales), hint: "Adds to drawer", icon: ArrowUpRight, tone: "bg-emerald-50 text-emerald-600", valueClass: "text-emerald-700" },
        { label: "Cash refunds", value: money(report.summary.cashRefunds), hint: "Leaves drawer", icon: Undo2, tone: "bg-rose-50 text-rose-600", valueClass: report.summary.cashRefunds ? "text-rose-700" : undefined },
        { label: "Paid out", value: money(report.summary.paidOut), hint: `${report.paidOuts.length} ${report.paidOuts.length === 1 ? "entry" : "entries"} · leaves drawer`, icon: ArrowDownRight, tone: "bg-orange-50 text-orange-600", valueClass: report.summary.paidOut ? "text-orange-700" : undefined },
        { label: "Card sales", value: money(report.summary.cardSales), hint: "Not in drawer", icon: CreditCard, tone: "bg-blue-50 text-blue-600" },
        { label: "Other payments", value: money(report.summary.otherSales), hint: "Online, credit & others", icon: Smartphone, tone: "bg-violet-50 text-violet-600" },
        { label: "Net sales", value: money(report.summary.netSales), hint: `${report.summary.billCount} ${report.summary.billCount === 1 ? "bill" : "bills"} · all methods`, icon: Receipt, tone: "bg-sky-50 text-sky-600" },
        {
          label: "Counted / variance",
          value: report.summary.closing == null ? "—" : money(report.summary.closing),
          hint:
            report.summary.variance == null
              ? "Shown after closing"
              : `${varianceWord(report.summary.variance)} ${signedMoney(report.summary.variance)}`,
          icon: Scale,
          tone: "bg-amber-50 text-amber-600",
        },
      ]
    : [];

  const filterLabel = "text-xs font-semibold text-indigo-900/80";
  const filterControl = "h-9 border-indigo-200/80 bg-white shadow-sm";
  const th = "h-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500";

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6 lg:p-8">
      <style>{`@keyframes till-progress{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <Banknote className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">Daily Till</h1>
            <p className="text-sm text-slate-500">
              Open the drawer, track cash in and out, then close with counted cash.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" className="h-9 bg-white shadow-sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" className="h-9 bg-white shadow-sm" onClick={printDay} disabled={!report || loading}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-9 shadow-sm" disabled={!report || loading || exporting !== null}>
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                {exporting ? "Exporting…" : "Export"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="truncate text-xs font-normal text-slate-500">
                {periodLabel(from, to)} · {report?.branch.name}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => handleExport("xlsx")} className="items-start gap-2 py-2">
                <FileSpreadsheet className="mt-0.5 h-4 w-4 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium">Excel (.xlsx)</p>
                  <p className="text-xs text-slate-500">Summary, paid outs, sessions, transactions</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExport("csv")} className="items-start gap-2 py-2">
                <FileText className="mt-0.5 h-4 w-4 text-sky-600" />
                <div>
                  <p className="text-sm font-medium">CSV (.csv)</p>
                  <p className="text-xs text-slate-500">Plain text, opens anywhere</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExport("pdf")} className="items-start gap-2 py-2">
                <Download className="mt-0.5 h-4 w-4 text-rose-600" />
                <div>
                  <p className="text-sm font-medium">PDF (.pdf)</p>
                  <p className="text-xs text-slate-500">Formatted report to share or file</p>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stale drawer warning */}
      {stale && !viewingStaleDay ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm">
              <p className="font-semibold text-amber-900">
                A till from {format(new Date(stale.openedAt), "dd MMM yyyy")} is still open
              </p>
              <p className="text-amber-800">
                Opened by {stale.openedBy} with {money(stale.opening)}. Close it with the counted cash so that day&apos;s
                drawer is reconciled.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="h-8 shrink-0 bg-amber-600 text-white hover:bg-amber-700"
            onClick={() => staleDay && jumpToDay(staleDay)}
          >
            <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
            Go to that day
          </Button>
        </div>
      ) : null}

      {/* Till status hero */}
      {isFirstLoad ? (
        <Card className="rounded-xl border-slate-200 p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-9 w-40" />
          </div>
        </Card>
      ) : report ? (
        <Card className={cn("relative overflow-hidden rounded-xl bg-gradient-to-r shadow-sm", statusMeta.ring, statusMeta.band)}>
          <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-sm", statusMeta.tile)}>
                <StatusIcon className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight text-slate-900">{statusMeta.title}</h2>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", statusMeta.pill)}>
                    {statusMeta.pillText}
                  </span>
                  {session?.varianceLabel ? (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
                        session.varianceLabel === "Balanced"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                          : session.varianceLabel === "Over"
                            ? "bg-sky-50 text-sky-700 ring-sky-600/20"
                            : "bg-rose-50 text-rose-700 ring-rose-600/20",
                      )}
                    >
                      {session.varianceLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-500">
                  <span>{report.branch.name}</span>
                  <span className="text-slate-300">•</span>
                  <span>{periodLabel(from, to)}</span>
                  {session ? (
                    <>
                      <span className="text-slate-300">•</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Opened by {session.openedBy} at {format(new Date(session.openedAt), "dd MMM, HH:mm")}
                      </span>
                      {session.closedAt ? (
                        <>
                          <span className="text-slate-300">•</span>
                          <span>
                            Closed by {session.closedBy || "—"} at {format(new Date(session.closedAt), "dd MMM, HH:mm")}
                          </span>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <span className="text-slate-300">•</span>
                      <span>
                        {coversToday && report.canOpen
                          ? "Count the drawer and open the till to start the day."
                          : "No till session in this date range."}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center lg:gap-6">
              <div className="sm:text-right">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Expected in drawer</p>
                <p className={cn("text-2xl font-semibold tracking-tight tabular-nums text-slate-900 transition-opacity", isRefreshing && "opacity-40")}>
                  {money(report.summary.expectedCash)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {coversToday && report.canOpen && (
                  <Button className="h-10 bg-emerald-600 px-4 text-white shadow-sm hover:bg-emerald-700" onClick={() => setOpenDialog(true)}>
                    <LockOpen className="mr-2 h-4 w-4" />
                    Open till
                  </Button>
                )}
                {report.canPaidOut && (
                  <Button variant="outline" className="h-10 bg-white shadow-sm" onClick={() => setPaidOutDialog(true)}>
                    <ArrowDownCircle className="mr-2 h-4 w-4" />
                    Paid out
                  </Button>
                )}
                {report.canClose && (
                  <Button
                    className="h-10 px-4 shadow-sm"
                    onClick={() => {
                      setClosingAmount(String(expectedPreview || 0));
                      setCloseDialog(true);
                    }}
                  >
                    <Lock className="mr-2 h-4 w-4" />
                    Close till
                  </Button>
                )}
                {report.canReopen && (
                  <Button variant="outline" className="h-10 bg-white shadow-sm" onClick={reopenTill} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                    Reopen till
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 md:gap-4">
        {isFirstLoad
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={`kpi-skel-${i}`} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-32" />
              </div>
            ))
          : kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div key={kpi.label} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", kpi.tone)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300" /> : null}
                  </div>
                  <p className="mt-3 truncate text-xs font-medium uppercase tracking-wider text-slate-500">{kpi.label}</p>
                  <p
                    className={cn(
                      "mt-1 truncate text-lg font-semibold tracking-tight tabular-nums text-slate-900 transition-opacity sm:text-xl",
                      kpi.valueClass,
                      kpi.label === "Counted / variance" && varianceTone(report?.summary.variance),
                      isRefreshing && "opacity-40",
                    )}
                  >
                    {kpi.value}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{kpi.hint}</p>
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
              <p className="text-sm font-semibold text-slate-900">Filters</p>
              <p className="truncate text-xs text-slate-500">
                Showing {periodLabel(from, to)}
                {report?.summary.sessionCount != null
                  ? ` · ${report.summary.sessionCount} till ${report.summary.sessionCount === 1 ? "session" : "sessions"}`
                  : ""}
              </p>
            </div>
          </div>
          {isRefreshing ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating…
            </span>
          ) : null}
          {preset !== "today" ? (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-8 border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800"
              onClick={() => applyPreset("today")}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          ) : null}
        </div>
        <div className="space-y-4 border-t border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-indigo-50/30 px-4 py-4 sm:px-5">
          <div className="grid gap-x-3 gap-y-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className={filterLabel}>Date range</Label>
              <Select value={preset} onValueChange={(value) => applyPreset(value as Preset)}>
                <SelectTrigger className={filterControl}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabel}>Branch</Label>
              {isFirstLoad ? (
                <Skeleton className="h-9 w-full rounded-md" />
              ) : (
                <Select value={branchId === "auto" ? undefined : branchId} onValueChange={setBranchId} disabled={loading}>
                  <SelectTrigger className={filterControl}>
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {(report?.branches || []).map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          {preset === "custom" ? (
            <div className="grid grid-cols-1 gap-3 border-t border-dashed border-indigo-200 pt-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end [&_label]:text-xs [&_label]:font-semibold [&_label]:text-indigo-900/80">
              <DateField label="From date" value={draftFrom} onChange={setDraftFrom} triggerClassName={filterControl} />
              <DateField label="To date" value={draftTo} onChange={setDraftTo} triggerClassName={filterControl} />
              <Button className="h-9 shadow-sm" onClick={applyCustom}>
                Apply range
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      {/* Formula + paid outs */}
      <div className="grid gap-4 md:gap-6 xl:grid-cols-5">
        <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm xl:col-span-2">
          <PanelHeader
            icon={<Calculator className="h-4 w-4" />}
            title="Cash formula"
            description="How the expected drawer amount is worked out"
          />
          {isFirstLoad ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : (
            <div className={cn("space-y-1 p-5 transition-opacity", isRefreshing && "opacity-50")}>
              <FormulaRow label="Opening cash" value={money(report?.summary.opening)} />
              <FormulaRow sign="+" label="Cash sales" value={money(report?.summary.cashSales)} tone="text-emerald-700" />
              <FormulaRow sign="−" label="Cash refunds" value={money(report?.summary.cashRefunds)} tone="text-rose-700" />
              <FormulaRow sign="−" label="Paid out" value={money(report?.summary.paidOut)} tone="text-orange-700" />
              <div className="!mt-3 flex items-center justify-between rounded-lg bg-slate-900 px-4 py-3 text-white">
                <span className="text-sm font-medium">Expected cash</span>
                <span className="text-base font-semibold tabular-nums">{money(report?.summary.expectedCash)}</span>
              </div>
              {report?.summary.closing != null ? (
                <div className="!mt-3 space-y-1 rounded-lg border border-slate-200 px-4 py-3">
                  <FormulaRow label="Counted cash" value={money(report.summary.closing)} />
                  {report.summary.variance != null ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Variance</span>
                      <span className={cn("font-semibold tabular-nums", varianceTone(report.summary.variance))}>
                        {signedMoney(report.summary.variance)} · {varianceWord(report.summary.variance)}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </Card>

        <Card className="relative overflow-hidden rounded-xl border-slate-200 shadow-sm xl:col-span-3">
          <PanelHeader
            icon={<ArrowDownCircle className="h-4 w-4" />}
            title="Paid outs"
            description="Cash taken out of the drawer"
            action={
              <div className="flex items-center gap-2">
                <CountPill>
                  {report?.paidOuts.length || 0} {(report?.paidOuts.length || 0) === 1 ? "entry" : "entries"}
                </CountPill>
                {report?.canPaidOut ? (
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setPaidOutDialog(true)}>
                    <ArrowDownCircle className="mr-1.5 h-3.5 w-3.5" />
                    Add
                  </Button>
                ) : null}
              </div>
            }
          />
          <RefreshOverlay show={isRefreshing} />
          {isFirstLoad ? (
            <TableSkeleton rows={3} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(th, "pl-5")}>Time</TableHead>
                  <TableHead className={th}>Reason</TableHead>
                  <TableHead className={th}>By</TableHead>
                  <TableHead className={cn(th, "text-right")}>Amount</TableHead>
                  <TableHead className={cn(th, "w-12 pr-5")} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.paidOuts || []).length === 0 ? (
                  <EmptyRow colSpan={5} icon={ArrowDownCircle} message="No paid-outs in this period." />
                ) : (
                  report?.paidOuts.map((row) => (
                    <TableRow key={row.id} className="border-slate-100 hover:bg-slate-50/70">
                      <TableCell className="py-3 pl-5 text-sm tabular-nums text-slate-600">
                        {from === to ? format(new Date(row.at), "HH:mm") : format(new Date(row.at), "dd MMM, HH:mm")}
                      </TableCell>
                      <TableCell className="py-3 font-medium text-slate-900">{row.particular}</TableCell>
                      <TableCell className="py-3 text-sm text-slate-500">{row.by || "—"}</TableCell>
                      <TableCell className="py-3 text-right font-semibold tabular-nums text-orange-700">
                        {money(row.amount)}
                      </TableCell>
                      <TableCell className="py-3 pr-5 text-right">
                        {row.canVoid ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            title="Void this paid-out"
                            onClick={() => setVoidTarget(row)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {/* Sessions in range */}
      {showSessionsTable && report ? (
        <Card className="relative overflow-hidden rounded-xl border-slate-200 shadow-sm">
          <PanelHeader
            icon={<Clock className="h-4 w-4" />}
            title="Till sessions"
            description="Each drawer opened in this period"
            action={<CountPill>{report.sessions.length} sessions</CountPill>}
          />
          <RefreshOverlay show={isRefreshing} />
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(th, "pl-5")}>Day</TableHead>
                <TableHead className={th}>Opened</TableHead>
                <TableHead className={th}>Closed</TableHead>
                <TableHead className={cn(th, "text-right")}>Opening</TableHead>
                <TableHead className={cn(th, "text-right")}>Counted</TableHead>
                <TableHead className={cn(th, "pr-5 text-right")}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.sessions.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer border-slate-100 hover:bg-slate-50/70"
                  onClick={() => jumpToDay(ymd(new Date(row.openedAt)))}
                  title="Open this day"
                >
                  <TableCell className="py-3 pl-5 font-medium text-slate-900">
                    {format(new Date(row.openedAt), "EEE, dd MMM yyyy")}
                  </TableCell>
                  <TableCell className="py-3 text-sm text-slate-600">
                    {format(new Date(row.openedAt), "HH:mm")} · {row.openedBy}
                  </TableCell>
                  <TableCell className="py-3 text-sm text-slate-600">
                    {row.closedAt ? `${format(new Date(row.closedAt), "HH:mm")} · ${row.closedBy || "—"}` : "—"}
                  </TableCell>
                  <TableCell className="py-3 text-right tabular-nums">{money(row.opening)}</TableCell>
                  <TableCell className="py-3 text-right tabular-nums">{row.closing == null ? "—" : money(row.closing)}</TableCell>
                  <TableCell className="py-3 pr-5 text-right">
                    <Pill
                      tone={
                        row.status === "OPEN"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                          : "bg-slate-100 text-slate-700 ring-slate-500/20"
                      }
                    >
                      {row.status === "OPEN" ? "Open" : row.varianceLabel || "Closed"}
                    </Pill>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      {/* Transactions */}
      <Card className="relative overflow-hidden rounded-xl border-slate-200 shadow-sm">
        {isRefreshing ? (
          <div className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-slate-100" aria-hidden>
            <div className="h-full w-1/3 animate-[till-progress_1.1s_ease-in-out_infinite] rounded-full bg-slate-900" />
          </div>
        ) : null}
        <PanelHeader
          icon={<Receipt className="h-4 w-4" />}
          title="Transactions"
          description={
            truncatedTransactions
              ? `Showing the first ${report?.transactions.length} of ${report?.transactionCount} — print or narrow the range for the rest`
              : "Every bill in this period"
          }
          action={
            <CountPill>
              {report?.summary.billCount || 0} {(report?.summary.billCount || 0) === 1 ? "bill" : "bills"} · Net{" "}
              {money(report?.summary.netSales)}
            </CountPill>
          }
        />
        <RefreshOverlay show={isRefreshing} label="Loading transactions…" />
        {isFirstLoad ? (
          <TableSkeleton rows={5} />
        ) : (
          <div className="max-h-[55vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-[1]">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(th, "pl-5")}>Time</TableHead>
                  <TableHead className={th}>No.</TableHead>
                  <TableHead className={th}>Type</TableHead>
                  <TableHead className={th}>Customer</TableHead>
                  <TableHead className={th}>Payment</TableHead>
                  <TableHead className={cn(th, "pr-5 text-right")}>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.transactions || []).length === 0 ? (
                  <EmptyRow colSpan={6} icon={Inbox} message="No transactions in this period." />
                ) : (
                  report?.transactions.map((row) => (
                    <TableRow key={row.id} className="border-slate-100 hover:bg-slate-50/70">
                      <TableCell className="py-3 pl-5 text-sm tabular-nums text-slate-600">
                        {from === to ? format(new Date(row.date), "HH:mm") : format(new Date(row.date), "dd MMM, HH:mm")}
                      </TableCell>
                      <TableCell className="py-3 font-mono text-xs font-medium text-slate-700">{row.number}</TableCell>
                      <TableCell className="py-3">
                        <Pill tone={typeTone(row.type)}>{row.type}</Pill>
                      </TableCell>
                      <TableCell className="py-3 text-slate-900">{row.customer || "—"}</TableCell>
                      <TableCell className="py-3">
                        <Pill tone={paymentTone(row.paymentMethod)}>{row.paymentMethod}</Pill>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "py-3 pr-5 text-right font-semibold tabular-nums",
                          row.total < 0 ? "text-rose-700" : "text-slate-900",
                        )}
                      >
                        {money(row.total)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Open till */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockOpen className="h-5 w-5 text-emerald-600" />
              Open till for today
            </DialogTitle>
            <DialogDescription>
              Count the cash in the drawer and enter that amount. Only one till can be opened per branch each day.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!saving) openTill();
            }}
          >
            <AmountField
              label="Opening cash"
              value={openingAmount}
              onChange={setOpeningAmount}
              autoFocus
            />
            <CashCounter onTotal={(total) => setOpeningAmount(String(total))} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LockOpen className="mr-2 h-4 w-4" />}
                Open till
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Paid out */}
      <Dialog open={paidOutDialog} onOpenChange={setPaidOutDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownCircle className="h-5 w-5 text-orange-600" />
              Record paid out
            </DialogTitle>
            <DialogDescription>Cash taken out of the drawer is deducted from the expected closing amount.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!saving) recordPaidOut();
            }}
          >
            <AmountField label="Amount" value={paidOutAmount} onChange={setPaidOutAmount} autoFocus />
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea
                value={paidOutReason}
                onChange={(event) => setPaidOutReason(event.target.value)}
                placeholder="Tea, delivery, petty cash…"
                rows={3}
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {["Tea / refreshments", "Delivery", "Petty cash", "Staff advance", "Utility bill"].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setPaidOutReason(reason)}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>
            {report ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Expected cash after this paid-out:{" "}
                <span className="font-semibold text-slate-900">
                  {money(report.summary.expectedCash - (Number(paidOutAmount) || 0))}
                </span>
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPaidOutDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save paid-out
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Void paid out */}
      <Dialog open={voidTarget !== null} onOpenChange={(open) => !open && setVoidTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-600" />
              Void this paid-out?
            </DialogTitle>
            <DialogDescription>
              {voidTarget ? (
                <>
                  <span className="font-medium text-slate-900">{voidTarget.particular}</span> ·{" "}
                  {money(voidTarget.amount)} will be removed and added back to the expected cash. The entry is kept as
                  voided for the audit trail.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTarget(null)}>
              Keep it
            </Button>
            <Button className="bg-rose-600 text-white hover:bg-rose-700" onClick={voidPaidOut} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Void paid-out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close till */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Close till
            </DialogTitle>
            <DialogDescription>Count every note and coin in the drawer, then enter the total.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!saving) closeTill();
            }}
          >
            <div className="flex items-center justify-between rounded-lg bg-slate-900 px-4 py-3 text-white">
              <span className="text-sm font-medium">Expected cash</span>
              <span className="text-base font-semibold tabular-nums">{money(expectedPreview)}</span>
            </div>
            <AmountField label="Counted closing cash" value={closingAmount} onChange={setClosingAmount} autoFocus />
            <CashCounter onTotal={(total) => setClosingAmount(String(total))} />
            {variancePreview != null && (
              <div
                className={cn(
                  "flex items-center justify-between rounded-lg border px-4 py-3 text-sm",
                  Math.abs(variancePreview) < 0.005
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : variancePreview > 0
                      ? "border-sky-200 bg-sky-50 text-sky-800"
                      : "border-rose-200 bg-rose-50 text-rose-800",
                )}
              >
                <span className="inline-flex items-center gap-2 font-medium">
                  {Math.abs(variancePreview) < 0.005 ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  {Math.abs(variancePreview) < 0.005
                    ? "Balanced"
                    : variancePreview > 0
                      ? "Over"
                      : "Short"}
                </span>
                <span className="font-semibold tabular-nums">Variance {signedMoney(variancePreview)}</span>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCloseDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                Close till
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
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

function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        tone,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
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
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

function EmptyRow({
  colSpan,
  icon: Icon,
  message,
}: {
  colSpan: number;
  icon: ComponentType<{ className?: string }>;
  message: string;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="py-12">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Icon className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-slate-700">{message}</p>
        </div>
      </TableCell>
    </TableRow>
  );
}

function FormulaRow({
  label,
  value,
  sign,
  tone,
}: {
  label: string;
  value: string;
  sign?: "+" | "−";
  tone?: string;
}) {
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
      <span className={cn("font-medium tabular-nums text-slate-900", tone)}>{value}</span>
    </div>
  );
}

function AmountField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
          PKR
        </span>
        <Input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          className="h-11 pl-12 text-lg font-semibold tabular-nums"
          value={value}
          autoFocus={autoFocus}
          onFocus={(event) => event.target.select()}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}
