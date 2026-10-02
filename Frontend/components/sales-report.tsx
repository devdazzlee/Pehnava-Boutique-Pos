"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { format } from "date-fns";
import {
  ArrowDownUp,
  BarChart3,
  Boxes,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Inbox,
  Loader2,
  Package,
  Percent,
  Printer,
  Receipt,
  RefreshCw,
  Repeat,
  Search,
  SlidersHorizontal,
  Tag,
  TrendingUp,
  Undo2,
  User,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DateField } from "@/components/ui/date-picker";
import { ReportItemCombobox } from "@/components/report-item-combobox";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { rangeForPreset } from "@/lib/business-timezone";
import { downloadSalesReportPdf } from "@/lib/sales-report-pdf";

type Preset = "all" | "today" | "yesterday" | "last7" | "last30" | "custom";
type Mode = "customer" | "item";
type LineType = "ALL" | "SL" | "SR" | "EX";
type SortKey = "date_asc" | "date_desc" | "amount_desc" | "qty_desc";

interface Line {
  id: string;
  date: string;
  voucher: string;
  type: string;
  typeLabel: string;
  customerId?: string | null;
  customer: string;
  customerPhone?: string;
  branch?: string;
  saleId?: string;
  productId?: string;
  sku: string;
  item: string;
  unit: string;
  quantity: number;
  rate: number;
  discount?: number;
  amount: number;
}

interface ReportData {
  period: { from: string; to: string };
  customers: { id: string; name: string; phone: string }[];
  products: { id: string; name: string; sku: string }[];
  branches?: { id: string; name: string; code: string }[];
  lines: Line[];
  totals: {
    quantity: number;
    amount: number;
    count: number;
    salesAmount?: number;
    salesQuantity?: number;
    returnsAmount?: number;
    returnsQuantity?: number;
    exchangeAmount?: number;
    exchangeQuantity?: number;
    discount?: number;
    billCount?: number;
    customerCount?: number;
    itemCount?: number;
  };
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 Days" },
  { id: "last30", label: "Last 30 Days" },
  { id: "custom", label: "Custom Range" },
];

const TYPE_META: Record<Exclude<LineType, "ALL">, { label: string; tone: string }> = {
  SL: { label: "Sale", tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  SR: { label: "Return", tone: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  EX: { label: "Exchange", tone: "bg-violet-50 text-violet-700 ring-violet-600/20" },
};

const DEFAULT_PRESET = "last30" as const satisfies Exclude<Preset, "custom">;
const PAGE_SIZE = 50;

const rangeFor = (preset: Exclude<Preset, "custom">) => rangeForPreset(preset);

const money = (value: number) =>
  `PKR ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const qty = (value: number) =>
  Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const periodLabel = (from: string, to: string) =>
  from === "2000-01-01"
    ? "All dates"
    : from === to
      ? format(new Date(`${from}T00:00:00`), "dd MMM yyyy")
      : `${format(new Date(`${from}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${to}T00:00:00`), "dd MMM yyyy")}`;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string);

export function SalesReport() {
  const { toast } = useToast();
  const initial = rangeFor(DEFAULT_PRESET);
  const [preset, setPreset] = useState<Preset>(DEFAULT_PRESET);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [mode, setMode] = useState<Mode>("customer");
  const [customerId, setCustomerId] = useState("all");
  const [productId, setProductId] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  // Results-table controls (client side, no refetch)
  const [typeFilter, setTypeFilter] = useState<LineType>("ALL");
  const [resultQuery, setResultQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date_desc");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState<null | "xlsx" | "csv" | "pdf">(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const searching = mode === "item" && search.trim() !== debouncedSearch;
  const isFirstLoad = loading && !report;
  const isRefreshing = (loading && !!report) || searching;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { from, to, mode };
      if (mode === "customer" && customerId !== "all") params.customerId = customerId;
      if (mode === "item" && productId !== "all") params.productId = productId;
      if (mode === "item" && debouncedSearch) params.search = debouncedSearch;
      if (branchId !== "all") params.branchId = branchId;
      const response = await apiClient.get("/sales-report/itemwise", { params });
      setReport(response.data.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load sales report",
        description: error?.response?.data?.message || error?.message || "Try again",
      });
    } finally {
      setLoading(false);
    }
  }, [from, to, mode, customerId, productId, branchId, debouncedSearch, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [report, typeFilter, resultQuery, sortKey]);

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

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setCustomerId("all");
    setProductId("all");
    setSearch("");
  };

  const activeFilterCount =
    (preset !== DEFAULT_PRESET ? 1 : 0) +
    (customerId !== "all" ? 1 : 0) +
    (productId !== "all" ? 1 : 0) +
    (branchId !== "all" ? 1 : 0) +
    (search.trim() ? 1 : 0);

  const clearFilters = () => {
    applyPreset(DEFAULT_PRESET);
    setCustomerId("all");
    setProductId("all");
    setBranchId("all");
    setSearch("");
  };

  const lines = useMemo(() => report?.lines || [], [report]);
  const isAdmin = (report?.branches || []).length > 0;
  const totals = report?.totals;

  const customerName =
    customerId === "all"
      ? "All customers"
      : report?.customers.find((customer) => customer.id === customerId)?.name || "Customer";
  const itemName =
    productId === "all"
      ? search.trim()
        ? `Items matching “${search.trim()}”`
        : "All items"
      : report?.products.find((product) => product.id === productId)?.name || "Item";
  const branchName =
    branchId === "all" ? null : report?.branches?.find((branch) => branch.id === branchId)?.name || null;
  const filterLabel = [mode === "customer" ? customerName : itemName, branchName].filter(Boolean).join(" · ");

  // ----- derived: counts, results, insights -----
  const typeCounts = useMemo(() => {
    const counts: Record<LineType, number> = { ALL: lines.length, SL: 0, SR: 0, EX: 0 };
    for (const line of lines) {
      if (line.type === "SL" || line.type === "SR" || line.type === "EX") counts[line.type] += 1;
    }
    return counts;
  }, [lines]);

  const visibleLines = useMemo(() => {
    const term = resultQuery.trim().toLowerCase();
    const filtered = lines.filter((line) => {
      if (typeFilter !== "ALL" && line.type !== typeFilter) return false;
      if (!term) return true;
      return [line.voucher, line.customer, line.item, line.sku, line.branch || ""].join(" ").toLowerCase().includes(term);
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortKey === "date_asc") return new Date(a.date).getTime() - new Date(b.date).getTime();
      if (sortKey === "amount_desc") return b.amount - a.amount;
      if (sortKey === "qty_desc") return b.quantity - a.quantity;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    return sorted;
  }, [lines, typeFilter, resultQuery, sortKey]);

  const visibleTotals = useMemo(
    () => ({
      quantity: visibleLines.reduce((sum, line) => sum + line.quantity, 0),
      amount: visibleLines.reduce((sum, line) => sum + line.amount, 0),
    }),
    [visibleLines],
  );

  const pageCount = Math.max(1, Math.ceil(visibleLines.length / PAGE_SIZE));
  const pagedLines = visibleLines.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const topItems = useMemo(() => {
    const map = new Map<string, { id: string; name: string; sku: string; quantity: number; amount: number }>();
    for (const line of lines) {
      if (line.type !== "SL") continue;
      const key = line.productId || line.sku || line.item;
      const entry = map.get(key) || { id: line.productId || "", name: line.item, sku: line.sku, quantity: 0, amount: 0 };
      entry.quantity += line.quantity;
      entry.amount += line.amount;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [lines]);

  const topCustomers = useMemo(() => {
    const map = new Map<string, { id: string | null; name: string; bills: Set<string>; amount: number }>();
    for (const line of lines) {
      const key = line.customerId || "walk-in";
      const entry = map.get(key) || { id: line.customerId || null, name: line.customer, bills: new Set<string>(), amount: 0 };
      entry.bills.add(line.saleId || line.voucher);
      entry.amount += line.amount;
      map.set(key, entry);
    }
    return [...map.values()]
      .map((entry) => ({ id: entry.id, name: entry.name, bills: entry.bills.size, amount: entry.amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [lines]);

  const topItemMax = Math.max(1, ...topItems.map((row) => row.amount));
  const topCustomerMax = Math.max(1, ...topCustomers.map((row) => row.amount));

  const salesAmount = totals?.salesAmount ?? totals?.amount ?? 0;
  const returnsAmount = Math.abs(totals?.returnsAmount ?? 0);
  const billCount = totals?.billCount ?? new Set(lines.map((line) => line.voucher)).size;
  const avgBill = billCount ? (totals?.amount || 0) / billCount : 0;
  const returnRate = salesAmount > 0 ? (returnsAmount / salesAmount) * 100 : 0;

  // ----- exports -----
  const fileBase = () => {
    const range = from === "2000-01-01" ? "all-dates" : from === to ? from : `${from}_to_${to}`;
    return `sales-report-${mode}-${range}`;
  };

  const exportRows = () =>
    visibleLines.map((line) => [
      format(new Date(line.date), "dd MMM yyyy HH:mm"),
      line.voucher,
      TYPE_META[line.type as Exclude<LineType, "ALL">]?.label || line.typeLabel || line.type,
      line.customer,
      line.branch || "",
      line.sku,
      line.item,
      line.unit,
      line.quantity,
      line.rate,
      line.discount ?? 0,
      line.amount,
    ]);
  const EXPORT_HEADER = ["Date", "Voucher", "Type", "Customer", "Branch", "SKU", "Item", "Unit", "Qty", "Rate", "Discount", "Amount"];

  const summaryRows = (): (string | number)[][] => [
    ["Period", periodLabel(from, to)],
    ["Filter", filterLabel],
    ["Net sales", totals?.amount ?? 0],
    ["Gross sales", salesAmount],
    ["Returns", -(returnsAmount)],
    ["Exchanges", totals?.exchangeAmount ?? 0],
    ["Discounts", totals?.discount ?? 0],
    ["Bills", billCount],
    ["Average bill", Math.round(avgBill * 100) / 100],
    ["Net quantity", totals?.quantity ?? 0],
    ["Items", totals?.itemCount ?? 0],
    ["Customers", totals?.customerCount ?? 0],
    ["Generated", format(new Date(), "dd MMM yyyy HH:mm")],
  ];

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const add = (name: string, rows: (string | number)[][], widths: number[]) => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = widths.map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    };
    add("Summary", [["Item", "Value"], ...summaryRows()], [18, 40]);
    add("Lines", [EXPORT_HEADER, ...exportRows()], [18, 20, 10, 22, 16, 14, 30, 8, 8, 10, 10, 12]);
    add(
      "Top items",
      [["Item", "SKU", "Qty sold", "Amount"], ...topItems.map((row) => [row.name, row.sku, row.quantity, Math.round(row.amount * 100) / 100])],
      [32, 14, 10, 14],
    );
    add(
      "Top customers",
      [["Customer", "Bills", "Amount"], ...topCustomers.map((row) => [row.name, row.bills, Math.round(row.amount * 100) / 100])],
      [28, 8, 14],
    );
    XLSX.writeFile(wb, `${fileBase()}.xlsx`);
  };

  const exportCsv = () => {
    const esc = (value: string | number) => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = [EXPORT_HEADER, ...exportRows()].map((row) => row.map(esc).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileBase()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const runExport = async (type: "xlsx" | "csv" | "pdf") => {
    if (!report) return;
    setExporting(type);
    try {
      if (type === "xlsx") await exportExcel();
      else if (type === "csv") exportCsv();
      else await downloadSalesReportPdf({ ...report, lines: visibleLines }, { from, to, filterLabel });
      toast({
        title: "Export ready",
        description:
          visibleLines.length !== lines.length
            ? `Exported the ${visibleLines.length} lines that match the table filters.`
            : `${visibleLines.length} lines exported.`,
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Export failed", description: error?.message || "Try again" });
    } finally {
      setExporting(null);
    }
  };

  const printReport = () => {
    const win = window.open("", "_blank");
    if (!win || !report) return;
    const rows = visibleLines
      .map(
        (line) => `<tr>
          <td>${format(new Date(line.date), "dd-MMM-yy")}</td>
          <td>${escapeHtml(line.voucher)}</td>
          <td>${line.type}</td>
          <td>${escapeHtml(line.customer)}</td>
          <td>${escapeHtml(line.sku || "")}</td>
          <td>${escapeHtml(line.item)}</td>
          <td>${escapeHtml(line.unit)}</td>
          <td style="text-align:right">${qty(line.quantity)}</td>
          <td style="text-align:right">${qty(line.rate)}</td>
          <td style="text-align:right">${qty(line.amount)}</td>
        </tr>`,
      )
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Sales Report</title>
      <style>
        body{font-family:Georgia,serif;color:#2a2012;padding:28px}
        .top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #a67c2e;padding-bottom:12px}
        img{height:56px}
        .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}
        .cards div{border:1px solid #e8dcc4;border-left:3px solid #a67c2e;padding:8px;font-size:11px}
        .cards strong{font-size:14px}
        table{width:100%;border-collapse:collapse;margin-top:16px;font-size:11px}
        th{background:#2a2012;color:#fff;text-align:left;padding:6px}
        td{border-bottom:1px solid #e8dcc4;padding:5px 6px}
        tfoot td{font-weight:bold;border-top:2px solid #a67c2e}
      </style></head><body>
      <div class="top"><img src="${window.location.origin}/logo.png" alt="Pehnawa" />
      <div style="text-align:right"><h1 style="margin:0">Sales Report — Itemwise</h1>
      <p style="margin:4px 0 0;color:#786448">${periodLabel(from, to)} · ${escapeHtml(filterLabel)}</p></div></div>
      <div class="cards">
        <div>Net sales<br><strong>${money(totals?.amount || 0)}</strong></div>
        <div>Gross sales<br><strong>${money(salesAmount)}</strong></div>
        <div>Returns<br><strong>${money(returnsAmount)}</strong></div>
        <div>Bills<br><strong>${billCount}</strong> · avg ${money(avgBill)}</div>
      </div>
      <table><thead><tr><th>Date</th><th>Voucher</th><th>Type</th><th>Customer</th><th>SKU</th><th>Item</th><th>Unit</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="10">No sales in this period.</td></tr>`}</tbody>
      <tfoot><tr><td colspan="7">Total (${visibleLines.length} lines)</td><td style="text-align:right">${qty(visibleTotals.quantity)}</td><td></td><td style="text-align:right">${qty(visibleTotals.amount)}</td></tr></tfoot>
      </table></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  // ----- presentation -----
  const heroCards: Array<{
    label: string;
    value: string;
    hint: string;
    icon: ComponentType<{ className?: string }>;
    tone: string;
    accent: string;
  }> = [
    {
      label: "Net sales",
      value: money(totals?.amount || 0),
      hint: "After returns & exchanges",
      icon: TrendingUp,
      tone: "bg-emerald-50 text-emerald-600",
      accent: "bg-emerald-500",
    },
    {
      label: "Bills",
      value: qty(billCount),
      hint: `Avg bill ${money(avgBill)}`,
      icon: Receipt,
      tone: "bg-blue-50 text-blue-600",
      accent: "bg-blue-500",
    },
    {
      label: "Net quantity",
      value: qty(totals?.quantity || 0),
      hint: `${qty(totals?.itemCount ?? 0)} different items`,
      icon: Boxes,
      tone: "bg-violet-50 text-violet-600",
      accent: "bg-violet-500",
    },
    {
      label: "Customers",
      value: qty(totals?.customerCount ?? 0),
      hint: "Named customers · walk-ins excluded",
      icon: Users,
      tone: "bg-amber-50 text-amber-600",
      accent: "bg-amber-500",
    },
  ];

  const minorCards: Array<{ label: string; value: string; icon: ComponentType<{ className?: string }>; tone: string; valueClass?: string }> = [
    { label: "Gross sales", value: money(salesAmount), icon: BarChart3, tone: "text-emerald-500" },
    { label: "Returns", value: returnsAmount ? `− ${money(returnsAmount)}` : money(0), icon: Undo2, tone: "text-rose-500", valueClass: returnsAmount ? "text-rose-700" : undefined },
    { label: "Exchanges", value: money(totals?.exchangeAmount ?? 0), icon: Repeat, tone: "text-violet-500" },
    { label: "Discounts", value: money(totals?.discount ?? 0), icon: Tag, tone: "text-amber-500" },
    { label: "Return rate", value: `${returnRate.toFixed(1)}%`, icon: Percent, tone: "text-slate-500", valueClass: returnRate >= 10 ? "text-rose-700" : undefined },
  ];

  const filterLabelClass = "text-xs font-semibold text-indigo-900/80";
  const filterControl = "h-9 border-indigo-200/80 bg-white shadow-sm";
  const th = "h-10 whitespace-nowrap bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500";

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6 lg:p-8">
      <style>{`@keyframes sr-progress{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">Sales Report</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {periodLabel(from, to)}
              </span>
              <span className="text-slate-300">•</span>
              <span className="truncate">{filterLabel}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-9 bg-white shadow-sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" className="h-9 bg-white shadow-sm" onClick={printReport} disabled={!report || loading}>
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
              <DropdownMenuLabel className="text-xs font-normal text-slate-500">
                {visibleLines.length} lines · {periodLabel(from, to)}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => runExport("xlsx")} className="items-start gap-2 py-2">
                <FileSpreadsheet className="mt-0.5 h-4 w-4 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium">Excel (.xlsx)</p>
                  <p className="text-xs text-slate-500">Summary, lines, top items & customers</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => runExport("csv")} className="items-start gap-2 py-2">
                <FileText className="mt-0.5 h-4 w-4 text-sky-600" />
                <div>
                  <p className="text-sm font-medium">CSV (.csv)</p>
                  <p className="text-xs text-slate-500">All lines, opens anywhere</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => runExport("pdf")} className="items-start gap-2 py-2">
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

      {/* Hero KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 md:gap-4">
        {isFirstLoad
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={`hero-skel-${i}`} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-36" />
                <Skeleton className="h-3 w-32" />
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
        {minorCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="min-w-0 p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Icon className={cn("h-3.5 w-3.5", card.tone)} />
                {card.label}
              </p>
              {isFirstLoad ? (
                <Skeleton className="mt-2 h-5 w-24" />
              ) : (
                <p
                  className={cn(
                    "mt-1 truncate text-base font-semibold tabular-nums text-slate-900 transition-opacity",
                    card.valueClass,
                    isRefreshing && "opacity-40",
                  )}
                >
                  {card.value}
                </p>
              )}
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
              <p className="truncate text-xs text-slate-500">Pick a period, then report by customer or by stock item</p>
            </div>
          </div>
          {isRefreshing ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              {searching ? "Searching…" : "Updating…"}
            </span>
          ) : null}
          {activeFilterCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-8 border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800"
              onClick={clearFilters}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Clear filters
            </Button>
          ) : null}
        </div>

        <div className="space-y-4 border-t border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-indigo-50/30 px-4 py-4 sm:px-5">
          {/* Quick range */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("mr-1", filterLabelClass)}>Period</span>
            {PRESETS.map((item) => (
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

          {preset === "custom" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end [&_label]:text-xs [&_label]:font-semibold [&_label]:text-indigo-900/80">
              <DateField label="From date" value={draftFrom} onChange={setDraftFrom} triggerClassName={filterControl} />
              <DateField label="To date" value={draftTo} onChange={setDraftTo} triggerClassName={filterControl} />
              <Button className="h-9 shadow-sm" onClick={applyCustom}>
                Apply range
              </Button>
            </div>
          )}

          <div className={cn("grid gap-x-3 gap-y-4 border-t border-dashed border-indigo-200 pt-4 md:grid-cols-2", isAdmin ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
            {/* Mode toggle */}
            <div className="space-y-1.5">
              <Label className={filterLabelClass}>Report by</Label>
              <div className="grid h-9 grid-cols-2 rounded-lg border border-indigo-200/80 bg-white p-0.5 shadow-sm">
                {(
                  [
                    { id: "customer", label: "Customer", icon: User },
                    { id: "item", label: "Stock item", icon: Package },
                  ] as const
                ).map((option) => {
                  const Icon = option.icon;
                  const active = mode === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => switchMode(option.id)}
                      className={cn(
                        "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors",
                        active ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-700",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {mode === "customer" ? (
              <div className={cn("space-y-1.5", isAdmin ? "md:col-span-1 xl:col-span-2" : "xl:col-span-2")}>
                <Label className={filterLabelClass}>Customer</Label>
                <ReportItemCombobox
                  value={customerId}
                  onChange={setCustomerId}
                  items={(report?.customers || []).map((customer) => ({
                    id: customer.id,
                    name: customer.name,
                    sku: customer.phone || null,
                  }))}
                  loading={isFirstLoad}
                  placeholder="All customers"
                  allLabel="All customers"
                  searchPlaceholder="Search name or phone…"
                  emptyText="No customers found"
                  className={filterControl}
                />
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className={filterLabelClass}>Find item</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Name, SKU or code"
                      className={cn(filterControl, "pl-9 pr-8")}
                    />
                    {searching || (loading && !!search.trim()) ? (
                      <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
                    ) : search ? (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Clear search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className={filterLabelClass}>Stock item</Label>
                  <ReportItemCombobox
                    value={productId}
                    onChange={setProductId}
                    items={report?.products || []}
                    loading={isFirstLoad}
                    placeholder="All items"
                    className={filterControl}
                  />
                </div>
              </>
            )}

            {isAdmin ? (
              <div className="space-y-1.5">
                <Label className={filterLabelClass}>Branch</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger className={filterControl}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All branches</SelectItem>
                    {(report?.branches || []).map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Insights */}
      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <InsightCard
          icon={<Package className="h-4 w-4" />}
          title="Top items"
          description="Best sellers by amount · click to drill in"
          loading={isFirstLoad}
          refreshing={isRefreshing}
          empty={topItems.length === 0}
          emptyText="No items sold in this period."
        >
          {topItems.map((row, index) => (
            <InsightRow
              key={`${row.id}-${row.name}`}
              rank={index + 1}
              title={row.name}
              meta={`${row.sku ? `${row.sku} · ` : ""}${qty(row.quantity)} sold`}
              value={money(row.amount)}
              share={(row.amount / topItemMax) * 100}
              bar="bg-emerald-500"
              onClick={
                row.id
                  ? () => {
                      setMode("item");
                      setCustomerId("all");
                      setSearch("");
                      setProductId(row.id);
                    }
                  : undefined
              }
            />
          ))}
        </InsightCard>

        <InsightCard
          icon={<Users className="h-4 w-4" />}
          title="Top customers"
          description="Biggest spenders · click to drill in"
          loading={isFirstLoad}
          refreshing={isRefreshing}
          empty={topCustomers.length === 0}
          emptyText="No customer sales in this period."
        >
          {topCustomers.map((row, index) => (
            <InsightRow
              key={`${row.id || "walk-in"}-${index}`}
              rank={index + 1}
              title={row.name}
              meta={`${row.bills} ${row.bills === 1 ? "bill" : "bills"}${row.id ? "" : " · walk-in"}`}
              value={money(row.amount)}
              share={(row.amount / topCustomerMax) * 100}
              bar="bg-amber-500"
              onClick={
                row.id
                  ? () => {
                      setMode("customer");
                      setProductId("all");
                      setSearch("");
                      setCustomerId(row.id as string);
                    }
                  : undefined
              }
            />
          ))}
        </InsightCard>
      </div>

      {/* Lines */}
      <Card className="relative overflow-hidden rounded-xl border-slate-200 shadow-sm">
        {isRefreshing ? (
          <div className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-slate-100" aria-hidden>
            <div className="h-full w-1/3 animate-[sr-progress_1.1s_ease-in-out_infinite] rounded-full bg-slate-900" />
          </div>
        ) : null}

        <div className="space-y-3 border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Receipt className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight text-slate-900">Sales lines</h2>
                <p className="truncate text-xs text-slate-500">
                  {visibleLines.length === lines.length
                    ? `${lines.length} ${lines.length === 1 ? "line" : "lines"} in this period`
                    : `${visibleLines.length} of ${lines.length} lines shown`}
                </p>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-8 pl-9 pr-8 text-sm"
                  placeholder="Search voucher, customer, item…"
                  value={resultQuery}
                  onChange={(event) => setResultQuery(event.target.value)}
                />
                {resultQuery ? (
                  <button
                    type="button"
                    onClick={() => setResultQuery("")}
                    className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
                <SelectTrigger className="h-8 w-[170px] text-sm">
                  <ArrowDownUp className="mr-1.5 h-3.5 w-3.5 text-slate-400" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date_desc">Newest first</SelectItem>
                  <SelectItem value="date_asc">Oldest first</SelectItem>
                  <SelectItem value="amount_desc">Highest amount</SelectItem>
                  <SelectItem value="qty_desc">Highest quantity</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Type chips */}
          <div className="flex flex-wrap gap-1.5">
            {(["ALL", "SL", "SR", "EX"] as LineType[]).map((type) => {
              const active = typeFilter === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(type)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
                  )}
                >
                  {type === "ALL" ? "All" : TYPE_META[type].label + "s"}
                  <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", active ? "bg-white/20" : "bg-slate-100 text-slate-500")}>
                    {typeCounts[type]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative">
        {isRefreshing ? (
          <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/60 pt-16 backdrop-blur-[1px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-md">
              <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
              {searching ? "Searching items…" : "Loading sales…"}
            </div>
          </div>
        ) : null}

        {isFirstLoad ? (
          <div className="space-y-4 p-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        ) : (
          <div className="max-h-[65vh] min-h-[240px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-[1]">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(th, "pl-5")}>Date</TableHead>
                  <TableHead className={th}>Voucher</TableHead>
                  <TableHead className={th}>Type</TableHead>
                  <TableHead className={th}>Customer</TableHead>
                  <TableHead className={th}>Item</TableHead>
                  <TableHead className={cn(th, "text-right")}>Qty</TableHead>
                  <TableHead className={cn(th, "text-right")}>Rate</TableHead>
                  <TableHead className={cn(th, "text-right")}>Discount</TableHead>
                  <TableHead className={cn(th, "pr-5 text-right")}>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedLines.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={9} className="py-14">
                      <div className="flex flex-col items-center text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                          <Inbox className="h-5 w-5" />
                        </div>
                        <p className="text-sm font-medium text-slate-900">
                          {lines.length === 0 ? "No sales in this period" : "No lines match"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {lines.length === 0
                            ? "Try a longer period or a different customer / item."
                            : "Clear the search or pick another type."}
                        </p>
                        {lines.length > 0 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-4 h-8"
                            onClick={() => {
                              setResultQuery("");
                              setTypeFilter("ALL");
                            }}
                          >
                            Show all lines
                          </Button>
                        ) : activeFilterCount > 0 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-4 h-8 border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800"
                            onClick={clearFilters}
                          >
                            <X className="mr-1 h-3.5 w-3.5" /> Clear filters
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedLines.map((line) => {
                    const meta = TYPE_META[line.type as Exclude<LineType, "ALL">];
                    const negative = line.amount < 0 || line.type === "SR";
                    return (
                      <TableRow key={line.id} className="border-slate-100 hover:bg-slate-50/70">
                        <TableCell className="whitespace-nowrap py-3 pl-5 text-sm text-slate-600">
                          <div>{format(new Date(line.date), "dd MMM yy")}</div>
                          <div className="text-[11px] text-slate-400">{format(new Date(line.date), "hh:mm a")}</div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-3 font-mono text-xs font-medium text-slate-700">{line.voucher}</TableCell>
                        <TableCell className="py-3">
                          <Pill tone={meta?.tone || "bg-slate-100 text-slate-700 ring-slate-500/20"}>{meta?.label || line.typeLabel || line.type}</Pill>
                        </TableCell>
                        <TableCell className="py-3">
                          <p className="max-w-[180px] truncate text-slate-900">{line.customer}</p>
                          {line.branch && isAdmin ? (
                            <p className="flex items-center gap-1 text-[11px] text-slate-400">
                              <Building2 className="h-3 w-3" />
                              {line.branch}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="py-3">
                          <p className="max-w-[260px] truncate font-medium text-slate-900">{line.item}</p>
                          <p className="font-mono text-[11px] text-slate-400">{line.sku}</p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-3 text-right tabular-nums text-slate-700">
                          {qty(line.quantity)} <span className="text-[11px] text-slate-400">{line.unit}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-3 text-right tabular-nums text-slate-600">{money(line.rate)}</TableCell>
                        <TableCell className={cn("whitespace-nowrap py-3 text-right tabular-nums", line.discount ? "text-amber-700" : "text-slate-300")}>
                          {line.discount ? money(line.discount) : "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "whitespace-nowrap py-3 pr-5 text-right font-semibold tabular-nums",
                            negative ? "text-rose-700" : "text-slate-900",
                          )}
                        >
                          {money(line.amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              {visibleLines.length > 0 ? (
                <TableFooter className="sticky bottom-0 z-[1] bg-slate-50">
                  <TableRow className="hover:bg-slate-50">
                    <TableCell colSpan={5} className="py-3 pl-5 text-sm font-semibold text-slate-700">
                      Total{visibleLines.length !== lines.length ? " (filtered)" : ""}
                    </TableCell>
                    <TableCell className="py-3 text-right font-semibold tabular-nums text-slate-900">{qty(visibleTotals.quantity)}</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="py-3 pr-5 text-right text-base font-semibold tabular-nums text-slate-900">
                      {money(visibleTotals.amount)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              ) : null}
            </Table>
          </div>
        )}
        </div>

        {visibleLines.length > PAGE_SIZE ? (
          <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p className="tabular-nums">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, visibleLines.length)} of {visibleLines.length}
            </p>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-8 bg-white px-2.5" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <span className="px-2 text-xs tabular-nums">
                Page {page} of {pageCount}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-8 bg-white px-2.5"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <Pill tone={TYPE_META.SL.tone}>Sale</Pill> a piece sold
        <Pill tone={TYPE_META.SR.tone}>Return</Pill> reduces quantity and amount
        <Pill tone={TYPE_META.EX.tone}>Exchange</Pill> a piece given in exchange · Walk-in bills are included with all customers.
      </p>
    </div>
  );
}

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

function InsightCard({
  icon,
  title,
  description,
  loading,
  refreshing,
  empty,
  emptyText,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  loading: boolean;
  refreshing: boolean;
  empty: boolean;
  emptyText: string;
  children: ReactNode;
}) {
  return (
    <Card className="relative overflow-hidden rounded-xl border-slate-200 shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
          <p className="truncate text-xs text-slate-500">{description}</p>
        </div>
      </div>
      {loading ? (
        <div className="space-y-4 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : empty ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Inbox className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-slate-700">{emptyText}</p>
        </div>
      ) : (
        <ul className={cn("divide-y divide-slate-100 transition-opacity", refreshing && "opacity-50")}>{children}</ul>
      )}
    </Card>
  );
}

function InsightRow({
  rank,
  title,
  meta,
  value,
  share,
  bar,
  onClick,
}: {
  rank: number;
  title: string;
  meta: string;
  value: string;
  share: number;
  bar: string;
  onClick?: () => void;
}) {
  const content = (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums",
          rank === 1 ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200" : "bg-slate-100 text-slate-600",
        )}
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium text-slate-900">{title}</p>
          <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{value}</p>
        </div>
        <p className="truncate text-xs text-slate-500">{meta}</p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
          <div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.max(2, share)}%` }} />
        </div>
      </div>
      {onClick ? <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" /> : null}
    </div>
  );
  return (
    <li>
      {onClick ? (
        <button type="button" onClick={onClick} className="w-full px-5 py-3 text-left transition-colors hover:bg-slate-50">
          {content}
        </button>
      ) : (
        <div className="px-5 py-3">{content}</div>
      )}
    </li>
  );
}
