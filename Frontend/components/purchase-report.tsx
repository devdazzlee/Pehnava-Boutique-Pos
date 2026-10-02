"use client";

import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { format } from "date-fns";
import {
  ArrowDownUp,
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
  Printer,
  Receipt,
  RefreshCw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { downloadPurchaseReportPdf } from "@/lib/purchase-report-pdf";

type Preset = "all" | "today" | "yesterday" | "last7" | "last30" | "custom";
type Mode = "vendor" | "item";
type LineType = "ALL" | "PP" | "PR";
type SortKey = "date_desc" | "date_asc" | "amount_desc" | "qty_desc";

interface Line {
  id: string;
  date: string;
  voucher: string;
  type: string;
  typeLabel: string;
  supplierId?: string;
  supplier: string;
  productId?: string;
  sku: string;
  item: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
}

type Ranked = { id: string; name: string; quantity: number; amount: number; vouchers: number };

interface ReportData {
  period: { from: string; to: string };
  suppliers: { id: string; name: string; code: string }[];
  products: { id: string; name: string; sku: string }[];
  branches?: { id: string; name: string; code: string }[];
  lines: Line[];
  totals: {
    quantity: number;
    amount: number;
    count: number;
    purchasesAmount?: number;
    purchasesQuantity?: number;
    returnsAmount?: number;
    returnsQuantity?: number;
    voucherCount?: number;
    vendorCount?: number;
    itemCount?: number;
    typeCounts?: { ALL: number; PP: number; PR: number };
  };
  viewTotals?: { quantity: number; amount: number; count: number };
  topItems?: Ranked[];
  topVendors?: Ranked[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
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
  PP: { label: "Purchase", tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  PR: { label: "Return", tone: "bg-rose-50 text-rose-700 ring-rose-600/20" },
};

const DEFAULT_PRESET = "last30" as const satisfies Exclude<Preset, "custom">;

const rangeFor = (preset: Exclude<Preset, "custom">) => rangeForPreset(preset);
const money = (value: number) =>
  `PKR ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (value: number) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const periodLabel = (from: string, to: string) =>
  from === "2000-01-01"
    ? "All dates"
    : from === to
      ? format(new Date(`${from}T00:00:00`), "dd MMM yyyy")
      : `${format(new Date(`${from}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${to}T00:00:00`), "dd MMM yyyy")}`;
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string);

export function PurchaseReport() {
  const { toast } = useToast();
  const initial = rangeFor(DEFAULT_PRESET);
  const [preset, setPreset] = useState<Preset>(DEFAULT_PRESET);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [mode, setMode] = useState<Mode>("vendor");
  const [supplierId, setSupplierId] = useState("all");
  const [productId, setProductId] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  // Table controls — all applied on the server
  const [typeFilter, setTypeFilter] = useState<LineType>("ALL");
  const [resultQuery, setResultQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date_desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [exporting, setExporting] = useState<null | "xlsx" | "csv" | "pdf" | "print">(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(resultQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [resultQuery]);
  // Any change that alters the result set returns to page 1.
  useEffect(() => {
    setPage(1);
  }, [from, to, mode, supplierId, productId, branchId, debouncedSearch, typeFilter, debouncedQuery, sortKey, pageSize]);

  const searching = (mode === "item" && search.trim() !== debouncedSearch) || resultQuery.trim() !== debouncedQuery;
  const isFirstLoad = loading && !report;
  const isRefreshing = (loading && !!report) || searching;

  const buildParams = useCallback(
    (extra: Record<string, string | number> = {}) => {
      const params: Record<string, string | number> = { from, to, mode, sort: sortKey, ...extra };
      if (mode === "vendor" && supplierId !== "all") params.supplierId = supplierId;
      if (mode === "item" && productId !== "all") params.productId = productId;
      if (mode === "item" && debouncedSearch) params.search = debouncedSearch;
      if (branchId !== "all") params.branchId = branchId;
      if (typeFilter !== "ALL") params.type = typeFilter;
      if (debouncedQuery) params.q = debouncedQuery;
      return params;
    },
    [from, to, mode, sortKey, supplierId, productId, debouncedSearch, branchId, typeFilter, debouncedQuery],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get("/purchase-report/itemwise", { params: buildParams({ page, limit: pageSize }) });
      setReport(response.data.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load purchase report",
        description: error?.response?.data?.message || error?.message || "Try again",
      });
    } finally {
      setLoading(false);
    }
  }, [buildParams, page, pageSize, toast]);

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
  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setSupplierId("all");
    setProductId("all");
    setSearch("");
  };

  const activeFilterCount =
    (preset !== DEFAULT_PRESET ? 1 : 0) +
    (supplierId !== "all" ? 1 : 0) +
    (productId !== "all" ? 1 : 0) +
    (branchId !== "all" ? 1 : 0) +
    (search.trim() ? 1 : 0);
  const clearFilters = () => {
    applyPreset(DEFAULT_PRESET);
    setSupplierId("all");
    setProductId("all");
    setBranchId("all");
    setSearch("");
  };

  const lines = report?.lines || [];
  const totals = report?.totals;
  const pagination = report?.pagination || { page: 1, limit: pageSize, total: lines.length, totalPages: 1 };
  const viewTotals = report?.viewTotals || { quantity: totals?.quantity || 0, amount: totals?.amount || 0, count: lines.length };
  const isAdmin = (report?.branches || []).length > 0;
  const typeCounts = totals?.typeCounts || { ALL: totals?.count || 0, PP: 0, PR: 0 };

  const vendorName = supplierId === "all" ? "All vendors" : report?.suppliers.find((s) => s.id === supplierId)?.name || "Vendor";
  const itemName =
    productId === "all"
      ? search.trim()
        ? `Items matching “${search.trim()}”`
        : "All items"
      : report?.products.find((p) => p.id === productId)?.name || "Item";
  const branchName = branchId === "all" ? null : report?.branches?.find((b) => b.id === branchId)?.name || null;
  const filterLabel = [mode === "vendor" ? vendorName : itemName, branchName].filter(Boolean).join(" · ");

  const purchasesAmount = totals?.purchasesAmount ?? totals?.amount ?? 0;
  const returnsAmount = totals?.returnsAmount ?? 0;
  const voucherCount = totals?.voucherCount ?? 0;
  const avgVoucher = voucherCount ? (totals?.amount || 0) / voucherCount : 0;

  // ----- exports fetch every matching line (not just this page) -----
  const fetchAllLines = async (): Promise<ReportData | null> => {
    const response = await apiClient.get("/purchase-report/itemwise", { params: buildParams({ all: "true" }) });
    return response.data.data as ReportData;
  };
  const fileBase = () => `purchase-report-${mode}-${from === "2000-01-01" ? "all-dates" : from === to ? from : `${from}_to_${to}`}`;
  const EXPORT_HEADER = ["Date", "Voucher", "Type", "Vendor", "SKU", "Item", "Unit", "Qty", "Rate", "Amount"];
  const toRow = (l: Line) => [
    format(new Date(l.date), "dd MMM yyyy"),
    l.voucher,
    TYPE_META[l.type as "PP" | "PR"]?.label || l.typeLabel || l.type,
    l.supplier,
    l.sku,
    l.item,
    l.unit,
    l.quantity,
    l.rate,
    l.amount,
  ];

  const runExport = async (type: "xlsx" | "csv" | "pdf" | "print") => {
    setExporting(type);
    try {
      const data = await fetchAllLines();
      if (!data) return;
      const all = data.lines;
      if (type === "xlsx") {
        const XLSX = await import("xlsx");
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.aoa_to_sheet([
            ["Item", "Value"],
            ["Period", periodLabel(from, to)],
            ["Filter", filterLabel],
            ["Purchases", purchasesAmount],
            ["Returns", -returnsAmount],
            ["Net", totals?.amount || 0],
            ["Vouchers", voucherCount],
            ["Vendors", totals?.vendorCount || 0],
            ["Items", totals?.itemCount || 0],
          ]),
          "Summary",
        );
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([EXPORT_HEADER, ...all.map(toRow)]), "Lines");
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.aoa_to_sheet([["Vendor", "Vouchers", "Qty", "Amount"], ...(data.topVendors || []).map((v) => [v.name, v.vouchers, v.quantity, v.amount])]),
          "Top vendors",
        );
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.aoa_to_sheet([["Item", "Qty", "Amount"], ...(data.topItems || []).map((v) => [v.name, v.quantity, v.amount])]),
          "Top items",
        );
        XLSX.writeFile(wb, `${fileBase()}.xlsx`);
      } else if (type === "csv") {
        const esc = (v: string | number) => {
          const t = String(v ?? "");
          return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
        };
        const csv = [EXPORT_HEADER, ...all.map(toRow)].map((r) => r.map(esc).join(",")).join("\n");
        const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileBase()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (type === "pdf") {
        await downloadPurchaseReportPdf(
          { ...data, lines: all, totals: { quantity: data.viewTotals?.quantity ?? 0, amount: data.viewTotals?.amount ?? 0, count: all.length } },
          { from, to, filterLabel },
        );
      } else {
        const win = window.open("", "_blank");
        if (!win) return;
        const rows = all
          .map(
            (l) => `<tr><td>${format(new Date(l.date), "dd-MMM-yy")}</td><td>${escapeHtml(l.voucher)}</td><td>${l.type}</td><td>${escapeHtml(l.supplier)}</td><td>${escapeHtml(l.sku || "")}</td><td>${escapeHtml(l.item)}</td><td>${escapeHtml(l.unit)}</td><td style="text-align:right">${qty(l.quantity)}</td><td style="text-align:right">${qty(l.rate)}</td><td style="text-align:right">${qty(l.amount)}</td></tr>`,
          )
          .join("");
        win.document.write(`<!DOCTYPE html><html><head><title>Purchase Report</title><style>
          body{font-family:Georgia,serif;color:#2a2012;padding:28px}
          .top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #a67c2e;padding-bottom:12px}
          img{height:56px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}
          .cards div{border:1px solid #e8dcc4;border-left:3px solid #a67c2e;padding:8px;font-size:11px}.cards strong{font-size:14px}
          table{width:100%;border-collapse:collapse;margin-top:16px;font-size:11px}
          th{background:#2a2012;color:#fff;text-align:left;padding:6px}td{border-bottom:1px solid #e8dcc4;padding:5px 6px}
          tfoot td{font-weight:bold;border-top:2px solid #a67c2e}</style></head><body>
          <div class="top"><img src="${window.location.origin}/logo.png" alt="Pehnawa"/><div style="text-align:right"><h1 style="margin:0">Purchase Report</h1>
          <p style="margin:4px 0 0;color:#786448">${periodLabel(from, to)} · ${escapeHtml(filterLabel)}</p></div></div>
          <div class="cards"><div>Net purchases<br><strong>${money(data.totals.amount)}</strong></div><div>Purchases<br><strong>${money(data.totals.purchasesAmount || 0)}</strong></div>
          <div>Returns<br><strong>${money(data.totals.returnsAmount || 0)}</strong></div><div>Vouchers<br><strong>${data.totals.voucherCount || 0}</strong></div></div>
          <table><thead><tr><th>Date</th><th>Voucher</th><th>Type</th><th>Vendor</th><th>SKU</th><th>Item</th><th>Unit</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="10">No purchases in this period.</td></tr>`}</tbody>
          <tfoot><tr><td colspan="7">Total (${all.length} lines)</td><td style="text-align:right">${qty(data.viewTotals?.quantity || 0)}</td><td></td><td style="text-align:right">${qty(data.viewTotals?.amount || 0)}</td></tr></tfoot></table></body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 400);
      }
      if (type !== "print") toast({ title: "Export ready", description: `${all.length.toLocaleString()} lines exported.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Export failed", description: error?.response?.data?.message || error?.message || "Try again" });
    } finally {
      setExporting(null);
    }
  };

  const heroCards: Array<{ label: string; value: string; hint: string; icon: ComponentType<{ className?: string }>; tone: string; accent: string }> = [
    { label: "Net purchases", value: money(totals?.amount || 0), hint: "After purchase returns", icon: Wallet, tone: "bg-emerald-50 text-emerald-600", accent: "bg-emerald-500" },
    { label: "Vouchers", value: qty(voucherCount), hint: `Avg ${money(avgVoucher)} each`, icon: Receipt, tone: "bg-blue-50 text-blue-600", accent: "bg-blue-500" },
    { label: "Net quantity", value: qty(totals?.quantity || 0), hint: `${qty(totals?.itemCount || 0)} different items`, icon: Boxes, tone: "bg-violet-50 text-violet-600", accent: "bg-violet-500" },
    { label: "Vendors", value: qty(totals?.vendorCount || 0), hint: "Supplied in this period", icon: Users, tone: "bg-amber-50 text-amber-600", accent: "bg-amber-500" },
  ];
  const minorCards = [
    { label: "Purchases", value: money(purchasesAmount), icon: ShoppingCart, tone: "text-emerald-500", valueClass: undefined as string | undefined },
    { label: "Returns to vendor", value: returnsAmount ? `− ${money(returnsAmount)}` : money(0), icon: Undo2, tone: "text-rose-500", valueClass: returnsAmount ? "text-rose-700" : undefined },
    { label: "Units purchased", value: qty(totals?.purchasesQuantity ?? totals?.quantity ?? 0), icon: Package, tone: "text-sky-500", valueClass: undefined },
    { label: "Units returned", value: qty(totals?.returnsQuantity ?? 0), icon: Truck, tone: "text-slate-500", valueClass: undefined },
  ];

  const filterLabelCls = "text-xs font-semibold text-indigo-900/80";
  const filterControl = "h-9 border-indigo-200/80 bg-white shadow-sm";
  const th = "h-10 whitespace-nowrap bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500";
  const from_ = (pagination.page - 1) * pagination.limit + 1;
  const to_ = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">Purchase Report</h1>
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
          <Button variant="outline" className="h-9 bg-white shadow-sm" onClick={() => runExport("print")} disabled={!report || exporting !== null}>
            {exporting === "print" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
            Print
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-9 shadow-sm" disabled={!report || exporting !== null}>
                {exporting && exporting !== "print" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                {exporting && exporting !== "print" ? "Exporting…" : "Export"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs font-normal text-slate-500">
                All {viewTotals.count.toLocaleString()} matching lines
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => runExport("xlsx")} className="items-start gap-2 py-2">
                <FileSpreadsheet className="mt-0.5 h-4 w-4 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium">Excel (.xlsx)</p>
                  <p className="text-xs text-slate-500">Summary, lines, top vendors & items</p>
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

      {/* Hero cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 md:gap-4">
        {isFirstLoad
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
                      <p className={cn("mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums text-slate-900 transition-opacity", isRefreshing && "opacity-40")}>
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

      {/* Secondary strip */}
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:grid-cols-4 lg:divide-y-0">
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
                <p className={cn("mt-1 truncate text-base font-semibold tabular-nums text-slate-900 transition-opacity", card.valueClass, isRefreshing && "opacity-40")}>{card.value}</p>
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
                {activeFilterCount > 0 ? <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">{activeFilterCount} active</span> : null}
              </p>
              <p className="truncate text-xs text-slate-500">Pick a period, then report by vendor or by stock item</p>
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
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("mr-1", filterLabelCls)}>Period</span>
            {PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => applyPreset(item.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  preset === item.id ? "border-indigo-600 bg-indigo-600 text-white shadow-sm" : "border-indigo-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {preset === "custom" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end [&_label]:text-xs [&_label]:font-semibold [&_label]:text-indigo-900/80">
              <DateField label="From date" value={draftFrom} onChange={setDraftFrom} triggerClassName={filterControl} />
              <DateField label="To date" value={draftTo} onChange={setDraftTo} triggerClassName={filterControl} />
              <Button className="h-9 shadow-sm" onClick={applyCustom}>
                Apply range
              </Button>
            </div>
          ) : null}
          <div className={cn("grid gap-x-3 gap-y-4 border-t border-dashed border-indigo-200 pt-4 md:grid-cols-2", isAdmin ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
            <div className="space-y-1.5">
              <Label className={filterLabelCls}>Report by</Label>
              <div className="grid h-9 grid-cols-2 rounded-lg border border-indigo-200/80 bg-white p-0.5 shadow-sm">
                {(
                  [
                    { id: "vendor", label: "Vendor", icon: Users },
                    { id: "item", label: "Stock item", icon: Package },
                  ] as const
                ).map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => switchMode(opt.id)}
                      className={cn(
                        "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors",
                        mode === opt.id ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-700",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {mode === "vendor" ? (
              <div className={cn("space-y-1.5", isAdmin ? "xl:col-span-2" : "xl:col-span-2")}>
                <Label className={filterLabelCls}>Vendor</Label>
                <ReportItemCombobox
                  value={supplierId}
                  onChange={setSupplierId}
                  items={(report?.suppliers || []).map((s) => ({ id: s.id, name: s.name, sku: s.code || null }))}
                  loading={isFirstLoad}
                  placeholder="All vendors"
                  allLabel="All vendors"
                  searchPlaceholder="Search vendors…"
                  emptyText="No vendors found"
                  className={filterControl}
                />
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className={filterLabelCls}>Find item</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, SKU or code" className={cn(filterControl, "pl-9")} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className={filterLabelCls}>Stock item</Label>
                  <ReportItemCombobox value={productId} onChange={setProductId} items={report?.products || []} loading={isFirstLoad} placeholder="All items" className={filterControl} />
                </div>
              </>
            )}
            {isAdmin ? (
              <div className="space-y-1.5">
                <Label className={filterLabelCls}>Branch</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger className={filterControl}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All branches</SelectItem>
                    {(report?.branches || []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} ({b.code})
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
          icon={<Users className="h-4 w-4" />}
          title="Top vendors"
          description="Biggest suppliers by amount · click to drill in"
          loading={isFirstLoad}
          empty={!(report?.topVendors || []).length}
        >
          {(report?.topVendors || []).map((row, i) => (
            <InsightRow
              key={row.id}
              rank={i + 1}
              title={row.name}
              meta={`${row.vouchers} voucher${row.vouchers === 1 ? "" : "s"} · ${qty(row.quantity)} units`}
              value={money(row.amount)}
              share={(row.amount / Math.max(1, report?.topVendors?.[0]?.amount || 1)) * 100}
              bar="bg-amber-500"
              onClick={() => {
                setMode("vendor");
                setProductId("all");
                setSearch("");
                setSupplierId(row.id);
              }}
            />
          ))}
        </InsightCard>
        <InsightCard
          icon={<Package className="h-4 w-4" />}
          title="Top items"
          description="Most bought by amount · click to drill in"
          loading={isFirstLoad}
          empty={!(report?.topItems || []).length}
        >
          {(report?.topItems || []).map((row, i) => (
            <InsightRow
              key={row.id}
              rank={i + 1}
              title={row.name}
              meta={`${qty(row.quantity)} units`}
              value={money(row.amount)}
              share={(row.amount / Math.max(1, report?.topItems?.[0]?.amount || 1)) * 100}
              bar="bg-emerald-500"
              onClick={() => {
                setMode("item");
                setSupplierId("all");
                setSearch("");
                setProductId(row.id);
              }}
            />
          ))}
        </InsightCard>
      </div>

      {/* Lines */}
      <Card className="relative overflow-hidden rounded-xl border-slate-200 shadow-sm">
        <div className="space-y-3 border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Receipt className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight text-slate-900">Purchase lines</h2>
                <p className="truncate text-xs text-slate-500">
                  {pagination.total.toLocaleString()} line{pagination.total === 1 ? "" : "s"}
                  {pagination.total !== (totals?.count || 0) ? ` of ${(totals?.count || 0).toLocaleString()}` : ""} in this period
                </p>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input className="h-8 pl-9 pr-8 text-sm" placeholder="Search voucher, vendor, item…" value={resultQuery} onChange={(e) => setResultQuery(e.target.value)} />
                {resultQuery ? (
                  <button
                    type="button"
                    onClick={() => setResultQuery("")}
                    className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
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
          <div className="flex flex-wrap gap-1.5">
            {(["ALL", "PP", "PR"] as LineType[]).map((type) => {
              const active = typeFilter === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(type)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
                  )}
                >
                  {type === "ALL" ? "All" : `${TYPE_META[type].label}s`}
                  <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", active ? "bg-white/20" : "bg-slate-100 text-slate-500")}>{typeCounts[type]}</span>
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
                {searching ? "Searching…" : "Loading…"}
              </div>
            </div>
          ) : null}

          {isFirstLoad ? (
            <div className="space-y-4 p-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
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
                    <TableHead className={th}>Vendor</TableHead>
                    <TableHead className={th}>Item</TableHead>
                    <TableHead className={cn(th, "text-right")}>Qty</TableHead>
                    <TableHead className={cn(th, "text-right")}>Rate</TableHead>
                    <TableHead className={cn(th, "pr-5 text-right")}>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={8} className="py-14">
                        <div className="flex flex-col items-center text-center">
                          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                            <Inbox className="h-5 w-5" />
                          </div>
                          <p className="text-sm font-medium text-slate-900">{(totals?.count || 0) === 0 ? "No purchases in this period" : "No lines match"}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {(totals?.count || 0) === 0 ? "Try a longer period or a different vendor / item." : "Clear the search or pick another type."}
                          </p>
                          {(totals?.count || 0) > 0 ? (
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
                            <Button variant="outline" size="sm" className="mt-4 h-8 border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" onClick={clearFilters}>
                              <X className="mr-1 h-3.5 w-3.5" /> Clear filters
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    lines.map((line) => {
                      const meta = TYPE_META[line.type as "PP" | "PR"];
                      return (
                        <TableRow key={`${line.type}-${line.id}`} className="border-slate-100 hover:bg-slate-50/70">
                          <TableCell className="whitespace-nowrap py-3 pl-5 text-sm text-slate-600">{format(new Date(line.date), "dd MMM yy")}</TableCell>
                          <TableCell className="whitespace-nowrap py-3 font-mono text-xs font-medium text-slate-700">{line.voucher}</TableCell>
                          <TableCell className="py-3">
                            <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", meta?.tone || "bg-slate-100 text-slate-700 ring-slate-500/20")}>
                              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                              {meta?.label || line.typeLabel}
                            </span>
                          </TableCell>
                          <TableCell className="py-3">
                            <p className="max-w-[180px] truncate text-slate-900">{line.supplier}</p>
                          </TableCell>
                          <TableCell className="py-3">
                            <p className="max-w-[280px] truncate font-medium text-slate-900">{line.item}</p>
                            <p className="font-mono text-[11px] text-slate-400">{line.sku}</p>
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-3 text-right tabular-nums text-slate-700">
                            {qty(line.quantity)} <span className="text-[11px] text-slate-400">{line.unit}</span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-3 text-right tabular-nums text-slate-600">{money(line.rate)}</TableCell>
                          <TableCell className={cn("whitespace-nowrap py-3 pr-5 text-right font-semibold tabular-nums", line.amount < 0 ? "text-rose-700" : "text-slate-900")}>
                            {money(line.amount)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
                {lines.length > 0 ? (
                  <TableFooter className="sticky bottom-0 z-[1] bg-slate-50">
                    <TableRow className="hover:bg-slate-50">
                      <TableCell colSpan={5} className="py-3 pl-5 text-sm font-semibold text-slate-700">
                        Total · all {viewTotals.count.toLocaleString()} matching lines
                      </TableCell>
                      <TableCell className="py-3 text-right font-semibold tabular-nums text-slate-900">{qty(viewTotals.quantity)}</TableCell>
                      <TableCell />
                      <TableCell className="py-3 pr-5 text-right text-base font-semibold tabular-nums text-slate-900">{money(viewTotals.amount)}</TableCell>
                    </TableRow>
                  </TableFooter>
                ) : null}
              </Table>
            </div>
          )}
        </div>

        {pagination.total > 0 ? (
          <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-sm text-slate-600 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <p className="tabular-nums">
                Showing <span className="font-medium text-slate-900">{from_.toLocaleString()}–{to_.toLocaleString()}</span> of{" "}
                <span className="font-medium text-slate-900">{pagination.total.toLocaleString()}</span>
              </p>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500">Rows</span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="h-8 w-[72px] bg-white text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[25, 50, 100, 200].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 bg-white px-2.5" disabled={pagination.page <= 1 || loading} onClick={() => setPage(1)}>
                First
              </Button>
              <Button variant="outline" size="sm" className="h-8 bg-white px-2.5" disabled={pagination.page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                const pg = Math.max(1, Math.min(pagination.totalPages - 4, pagination.page - 2)) + i;
                return (
                  <Button
                    key={pg}
                    variant={pg === pagination.page ? "default" : "outline"}
                    size="sm"
                    className={cn("h-8 min-w-[34px] px-2 tabular-nums", pg !== pagination.page && "bg-white")}
                    disabled={loading}
                    onClick={() => setPage(pg)}
                  >
                    {pg}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                className="h-8 bg-white px-2.5"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 bg-white px-2.5"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => setPage(pagination.totalPages)}
              >
                Last
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <Building2 className="h-3.5 w-3.5" />
        <span>Purchase = goods received from a vendor · Return = goods sent back, which reduces quantity and amount.</span>
      </p>
    </div>
  );
}

function InsightCard({
  icon,
  title,
  description,
  loading,
  empty,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  loading: boolean;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
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
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : empty ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Inbox className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-slate-700">No purchases in this period.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">{children}</ul>
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
  onClick: () => void;
}) {
  return (
    <li>
      <button type="button" onClick={onClick} className="w-full px-5 py-3 text-left transition-colors hover:bg-slate-50">
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
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
        </div>
      </button>
    </li>
  );
}
