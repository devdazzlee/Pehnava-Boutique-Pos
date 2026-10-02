"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowDownUp,
  ArrowUpFromLine,
  Boxes,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Flame,
  Inbox,
  Loader2,
  MinusCircle,
  Package,
  Printer,
  RefreshCw,
  Search,
  SlidersHorizontal,
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
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { downloadStockQuantityReportPdf } from "@/lib/stock-quantity-report-pdf";
import { rangeForPreset } from "@/lib/business-timezone";

type Preset = "all" | "today" | "yesterday" | "last7" | "last30" | "custom";
type ItemType = "all" | "finished" | "loose";
type Activity = "all" | "moved";
type Status = "all" | "in" | "low" | "out";
type SortKey = "name_asc" | "sold_desc" | "bought_desc" | "available_asc" | "available_desc" | "value_desc";

interface Line {
  id: string;
  sku: string;
  item: string;
  dressName?: string;
  unit: string;
  category: string;
  opening: number;
  boughtQty: number;
  soldQty: number;
  inQty: number;
  outQty: number;
  closing: number;
  availableQty: number;
  minQty?: number;
  status?: "in" | "low" | "out";
  stockValue?: number;
  sellThrough?: number | null;
}

interface ReportData {
  categories: { id: string; name: string }[];
  branches: { id: string; name: string; code: string }[];
  lines: Line[];
  totals: {
    count: number;
    opening: number;
    boughtQty: number;
    soldQty: number;
    inQty: number;
    outQty: number;
    closing: number;
    availableQty: number;
    stockValue?: number;
    retailValue?: number;
    sellThrough?: number | null;
  };
  statusCounts?: { all: number; in: number; low: number; out: number };
  viewTotals?: { count: number; opening: number; boughtQty: number; soldQty: number; closing: number; availableQty: number; stockValue: number };
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

const STATUS_META: Record<"in" | "low" | "out", { label: string; tone: string }> = {
  in: { label: "In stock", tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  low: { label: "Low", tone: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  out: { label: "Out", tone: "bg-rose-50 text-rose-700 ring-rose-600/20" },
};

const DEFAULT_PRESET = "last30" as const satisfies Exclude<Preset, "custom">;
const rangeFor = (preset: Exclude<Preset, "custom">) => rangeForPreset(preset);
const qty = (value: number) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const money = (value: number) => `PKR ${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const periodLabel = (from: string, to: string) =>
  from === "2000-01-01"
    ? "All dates"
    : from === to
      ? format(new Date(`${from}T00:00:00`), "dd MMM yyyy")
      : `${format(new Date(`${from}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${to}T00:00:00`), "dd MMM yyyy")}`;
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string);

export function StockQuantityReport() {
  const { toast } = useToast();
  const initial = rangeFor(DEFAULT_PRESET);
  const [preset, setPreset] = useState<Preset>(DEFAULT_PRESET);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [categoryId, setCategoryId] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [itemType, setItemType] = useState<ItemType>("all");
  const [activity, setActivity] = useState<Activity>("moved");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name_asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<null | "xlsx" | "csv" | "pdf" | "print">(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    setPage(1);
  }, [from, to, categoryId, branchId, itemType, activity, debouncedSearch, status, sortKey, pageSize]);

  const searching = search.trim() !== debouncedSearch;
  const isFirstLoad = loading && !report;
  const isRefreshing = (loading && !!report) || searching;

  const buildParams = useCallback(
    (extra: Record<string, string | number> = {}) => {
      const params: Record<string, string | number> = { from, to, type: itemType, activity, sort: sortKey, status, ...extra };
      if (categoryId !== "all") params.categoryId = categoryId;
      if (branchId !== "all") params.branchId = branchId;
      if (debouncedSearch) params.search = debouncedSearch;
      return params;
    },
    [from, to, itemType, activity, sortKey, status, categoryId, branchId, debouncedSearch],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get("/stock-quantity-report", { params: buildParams({ page, limit: pageSize }) });
      setReport(response.data.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load stock quantity report",
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

  const activeFilterCount =
    (preset !== DEFAULT_PRESET ? 1 : 0) +
    (categoryId !== "all" ? 1 : 0) +
    (branchId !== "all" ? 1 : 0) +
    (itemType !== "all" ? 1 : 0) +
    (activity !== "moved" ? 1 : 0) +
    (search.trim() ? 1 : 0);
  const clearFilters = () => {
    applyPreset(DEFAULT_PRESET);
    setCategoryId("all");
    setBranchId("all");
    setItemType("all");
    setActivity("moved");
    setSearch("");
    setStatus("all");
  };

  const lines = report?.lines || [];
  const totals = report?.totals;
  const statusCounts = report?.statusCounts || { all: totals?.count || 0, in: 0, low: 0, out: 0 };
  const pagination = report?.pagination || { page: 1, limit: pageSize, total: lines.length, totalPages: 1 };
  const viewTotals = report?.viewTotals;
  const isAdmin = (report?.branches || []).length > 0;
  const categoryName = categoryId === "all" ? "All categories" : report?.categories.find((c) => c.id === categoryId)?.name || "Category";
  const branchName = branchId === "all" ? "All locations" : report?.branches.find((b) => b.id === branchId)?.name || "Location";
  const filterLabel = `${categoryName} · ${branchName}`;

  // ---- exports fetch every matching row ----
  const fetchAll = async () => (await apiClient.get("/stock-quantity-report", { params: buildParams({ all: "true" }) })).data.data as ReportData;
  const fileBase = () => `stock-quantity-${from === "2000-01-01" ? "all-dates" : `${from}_to_${to}`}`;
  const HEADER = ["SKU", "Item", "Category", "Unit", "Opening", "Bought", "Sold", "Closing", "Available now", "Status", "Sell-through %", "Stock value"];
  const toRow = (l: Line) => [
    l.sku,
    l.item,
    l.category,
    l.unit,
    l.opening,
    l.boughtQty,
    l.soldQty,
    l.closing,
    l.availableQty,
    l.status ? STATUS_META[l.status].label : "",
    l.sellThrough ?? "",
    l.stockValue ?? 0,
  ];

  const runExport = async (type: "xlsx" | "csv" | "pdf" | "print") => {
    setExporting(type);
    try {
      const data = await fetchAll();
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
            ["Items", data.totals.count],
            ["Bought", data.totals.boughtQty],
            ["Sold", data.totals.soldQty],
            ["Available now", data.totals.availableQty],
            ["Sell-through %", data.totals.sellThrough ?? ""],
            ["Stock value (cost)", data.totals.stockValue ?? 0],
          ]),
          "Summary",
        );
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER, ...all.map(toRow)]), "Items");
        XLSX.writeFile(wb, `${fileBase()}.xlsx`);
      } else if (type === "csv") {
        const esc = (v: string | number) => {
          const t = String(v ?? "");
          return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
        };
        const csv = [HEADER, ...all.map(toRow)].map((r) => r.map(esc).join(",")).join("\n");
        const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileBase()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (type === "pdf") {
        await downloadStockQuantityReportPdf(data, { from, to, filterLabel });
      } else {
        const win = window.open("", "_blank");
        if (!win) return;
        const rows = all
          .map(
            (l) => `<tr><td>${escapeHtml(l.sku || "")}</td><td>${escapeHtml(l.item)}</td><td>${escapeHtml(l.unit)}</td><td style="text-align:right">${qty(l.opening)}</td><td style="text-align:right">${qty(l.boughtQty)}</td><td style="text-align:right">${qty(l.soldQty)}</td><td style="text-align:right">${qty(l.closing)}</td><td style="text-align:right">${qty(l.availableQty)}</td></tr>`,
          )
          .join("");
        win.document.write(`<!DOCTYPE html><html><head><title>Stock Quantity Report</title><style>
          body{font-family:Georgia,serif;color:#2a2012;padding:28px}.top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #a67c2e;padding-bottom:12px}
          img{height:56px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th{background:#2a2012;color:#fff;text-align:left;padding:6px}
          td{border-bottom:1px solid #e8dcc4;padding:6px}tfoot td{font-weight:bold;border-top:2px solid #a67c2e}</style></head><body>
          <div class="top"><img src="${window.location.origin}/logo.png" alt="Pehnawa"/><div style="text-align:right"><h1 style="margin:0">Stock Quantity Report</h1>
          <p style="margin:4px 0 0;color:#786448">${periodLabel(from, to)} · ${escapeHtml(filterLabel)}</p></div></div>
          <table><thead><tr><th>SKU</th><th>Dress</th><th>Unit</th><th>Opening</th><th>Bought</th><th>Sold</th><th>Closing</th><th>Available</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="8">No dresses for this period.</td></tr>`}</tbody>
          <tfoot><tr><td colspan="3">${all.length} items</td><td style="text-align:right">${qty(data.viewTotals?.opening || 0)}</td><td style="text-align:right">${qty(data.viewTotals?.boughtQty || 0)}</td>
          <td style="text-align:right">${qty(data.viewTotals?.soldQty || 0)}</td><td style="text-align:right">${qty(data.viewTotals?.closing || 0)}</td><td style="text-align:right">${qty(data.viewTotals?.availableQty || 0)}</td></tr></tfoot>
          </table></body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 400);
      }
      if (type !== "print") toast({ title: "Export ready", description: `${all.length.toLocaleString()} items exported.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Export failed", description: error?.response?.data?.message || error?.message || "Try again" });
    } finally {
      setExporting(null);
    }
  };

  const heroCards: Array<{ label: string; value: string; hint: string; icon: ComponentType<{ className?: string }>; tone: string; accent: string }> = [
    { label: "Available now", value: qty(totals?.availableQty || 0), hint: `${qty(totals?.count || 0)} items · worth ${money(totals?.stockValue || 0)}`, icon: Boxes, tone: "bg-indigo-50 text-indigo-600", accent: "bg-indigo-500" },
    { label: "Bought", value: qty(totals?.boughtQty || 0), hint: `Opening ${qty(totals?.opening || 0)} at start of period`, icon: ArrowDownToLine, tone: "bg-emerald-50 text-emerald-600", accent: "bg-emerald-500" },
    { label: "Sold", value: qty(totals?.soldQty || 0), hint: totals?.sellThrough != null ? `${totals.sellThrough}% sell-through` : "No stock to sell in period", icon: ArrowUpFromLine, tone: "bg-rose-50 text-rose-600", accent: "bg-rose-500" },
    { label: "Closing", value: qty(totals?.closing || 0), hint: "Opening + in − out for the period", icon: Package, tone: "bg-sky-50 text-sky-600", accent: "bg-sky-500" },
  ];

  const filterLabelCls = "text-xs font-semibold text-indigo-900/80";
  const filterControl = "h-9 border-indigo-200/80 bg-white shadow-sm";
  const th = "h-10 whitespace-nowrap bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500";
  const fromRow = (pagination.page - 1) * pagination.limit + 1;
  const toRowN = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <Boxes className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">Stock Quantity Report</h1>
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
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="text-xs font-normal text-slate-500">All {pagination.total.toLocaleString()} matching items</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => runExport("xlsx")} className="gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => runExport("csv")} className="gap-2">
                <FileText className="h-4 w-4 text-sky-600" /> CSV (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => runExport("pdf")} className="gap-2">
                <Download className="h-4 w-4 text-rose-600" /> PDF (.pdf)
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
                <Skeleton className="h-7 w-28" />
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
                      <p className={cn("mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums text-slate-900 transition-opacity", isRefreshing && "opacity-40")}>{card.value}</p>
                      <p className="mt-1 truncate text-xs text-slate-500" title={card.hint}>
                        {card.hint}
                      </p>
                    </div>
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", card.tone)}>
                      {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-5 w-5" />}
                    </div>
                  </div>
                </div>
              );
            })}
      </div>

      {/* Status tiles */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {(
          [
            { key: "low", label: "Low stock", icon: AlertTriangle, on: "border-amber-200 bg-amber-50/60", iconOn: "bg-amber-100 text-amber-600", valueOn: "text-amber-700", hint: "At or below minimum" },
            { key: "out", label: "Out of stock", icon: MinusCircle, on: "border-rose-200 bg-rose-50/60", iconOn: "bg-rose-100 text-rose-600", valueOn: "text-rose-700", hint: "Nothing left to sell" },
            { key: "in", label: "Healthy", icon: Wallet, on: "border-emerald-200 bg-emerald-50/50", iconOn: "bg-emerald-100 text-emerald-600", valueOn: "text-emerald-700", hint: "Above minimum" },
          ] as const
        ).map((tile) => {
          const Icon = tile.icon;
          const count = statusCounts[tile.key];
          const active = count > 0;
          const selected = status === tile.key;
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => setStatus(selected ? "all" : tile.key)}
              className={cn(
                "flex min-w-0 items-center gap-3 rounded-xl border p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-4",
                active ? tile.on : "border-slate-200 bg-white",
                selected && "ring-2 ring-indigo-500/40",
              )}
            >
              <span className={cn("hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:flex", active ? tile.iconOn : "bg-slate-100 text-slate-400")}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-slate-600">{tile.label}</span>
                <span className={cn("block text-xl font-semibold tabular-nums", active ? tile.valueOn : "text-slate-400")}>{count.toLocaleString()}</span>
                <span className="hidden truncate text-[11px] text-slate-500 sm:block">{selected ? "Filtering · click to clear" : tile.hint}</span>
              </span>
            </button>
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
              <p className="truncate text-xs text-slate-500">Search a dress to see bought, sold and remaining pieces</p>
            </div>
          </div>
          {isRefreshing ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              {searching ? "Searching…" : "Updating…"}
            </span>
          ) : null}
          {activeFilterCount > 0 || status !== "all" ? (
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
          <div className={cn("grid gap-x-3 gap-y-4 border-t border-dashed border-indigo-200 pt-4 md:grid-cols-2", isAdmin ? "xl:grid-cols-5" : "xl:grid-cols-4")}>
            <div className="space-y-1.5 md:col-span-2 xl:col-span-1">
              <Label className={filterLabelCls}>Dress name</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input placeholder="Name, SKU or code…" value={search} onChange={(e) => setSearch(e.target.value)} className={cn(filterControl, "pl-9 pr-8")} />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabelCls}>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className={filterControl}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {(report?.categories || []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabelCls}>Type</Label>
              <Select value={itemType} onValueChange={(v) => setItemType(v as ItemType)}>
                <SelectTrigger className={filterControl}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All items</SelectItem>
                  <SelectItem value="finished">Finished goods</SelectItem>
                  <SelectItem value="loose">Loose items</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabelCls}>Show</Label>
              <div className="grid h-9 grid-cols-2 rounded-lg border border-indigo-200/80 bg-white p-0.5 shadow-sm">
                {(
                  [
                    { id: "moved", label: "With activity" },
                    { id: "all", label: "All items" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setActivity(opt.id)}
                    className={cn(
                      "rounded-md text-xs font-medium transition-colors",
                      activity === opt.id ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-700",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {isAdmin ? (
              <div className="space-y-1.5">
                <Label className={filterLabelCls}>Location</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger className={filterControl}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    {(report?.branches || []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Items */}
      <Card className="relative overflow-hidden rounded-xl border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Package className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-slate-900">Dresses</h2>
              <p className="truncate text-xs text-slate-500">
                {pagination.total.toLocaleString()} item{pagination.total === 1 ? "" : "s"}
                {status !== "all" ? ` · ${STATUS_META[status].label.toLowerCase()} only` : ""}
              </p>
            </div>
          </div>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-8 w-[190px] text-sm">
              <ArrowDownUp className="mr-1.5 h-3.5 w-3.5 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name_asc">Name A–Z</SelectItem>
              <SelectItem value="sold_desc">Best sellers</SelectItem>
              <SelectItem value="bought_desc">Most bought</SelectItem>
              <SelectItem value="available_asc">Lowest stock first</SelectItem>
              <SelectItem value="available_desc">Highest stock first</SelectItem>
              <SelectItem value="value_desc">Highest stock value</SelectItem>
            </SelectContent>
          </Select>
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
                    <TableHead className={cn(th, "pl-5")}>Dress</TableHead>
                    <TableHead className={cn(th, "text-right")}>Opening</TableHead>
                    <TableHead className={cn(th, "text-right")}>Bought</TableHead>
                    <TableHead className={cn(th, "text-right")}>Sold</TableHead>
                    <TableHead className={cn(th, "w-28")}>Sell-through</TableHead>
                    <TableHead className={cn(th, "text-right")}>Closing</TableHead>
                    <TableHead className={cn(th, "text-right")}>Available now</TableHead>
                    <TableHead className={cn(th, "pr-5 text-right")}>Value</TableHead>
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
                          <p className="text-sm font-medium text-slate-900">No dresses found</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {activity === "moved" ? "Nothing moved in this period — switch Show to “All items” or pick a longer period." : "Try another search or category."}
                          </p>
                          {activeFilterCount > 0 || status !== "all" ? (
                            <Button variant="outline" size="sm" className="mt-4 h-8 border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" onClick={clearFilters}>
                              <X className="mr-1 h-3.5 w-3.5" /> Clear filters
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    lines.map((line) => {
                      const st = line.status ? STATUS_META[line.status] : null;
                      const sell = line.sellThrough;
                      return (
                        <TableRow key={line.id} className="border-slate-100 hover:bg-slate-50/70">
                          <TableCell className="py-3 pl-5">
                            <div className="flex items-center gap-2">
                              <p className="max-w-[300px] truncate font-semibold text-slate-900">{line.item}</p>
                              {st ? (
                                <span className={cn("inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset", st.tone)}>{st.label}</span>
                              ) : null}
                            </div>
                            <p className="text-[11px] text-slate-500">
                              <span className="font-mono">{line.sku}</span> · {line.category} · {line.unit}
                            </p>
                          </TableCell>
                          <TableCell className="py-3 text-right tabular-nums text-slate-500">{qty(line.opening)}</TableCell>
                          <TableCell className={cn("py-3 text-right tabular-nums", line.boughtQty ? "font-medium text-emerald-700" : "text-slate-300")}>
                            {line.boughtQty ? `+${qty(line.boughtQty)}` : "—"}
                          </TableCell>
                          <TableCell className={cn("py-3 text-right tabular-nums", line.soldQty ? "font-medium text-rose-700" : "text-slate-300")}>
                            {line.soldQty ? `−${qty(line.soldQty)}` : "—"}
                          </TableCell>
                          <TableCell className="py-3">
                            {sell == null ? (
                              <span className="text-xs text-slate-300">—</span>
                            ) : (
                              <div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                                  <div className={cn("h-full rounded-full", sell >= 60 ? "bg-emerald-500" : sell >= 25 ? "bg-amber-400" : "bg-slate-400")} style={{ width: `${Math.min(100, sell)}%` }} />
                                </div>
                                <p className="mt-0.5 flex items-center gap-1 text-[10px] tabular-nums text-slate-500">
                                  {sell >= 60 ? <Flame className="h-3 w-3 text-orange-500" /> : null}
                                  {sell}%
                                </p>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="py-3 text-right font-semibold tabular-nums text-slate-900">{qty(line.closing)}</TableCell>
                          <TableCell className={cn("py-3 text-right text-base font-semibold tabular-nums", line.availableQty <= 0 ? "text-rose-600" : "text-slate-900")}>
                            {qty(line.availableQty)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-3 pr-5 text-right text-sm tabular-nums text-slate-600">{line.stockValue ? money(line.stockValue) : "—"}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
                {lines.length > 0 && viewTotals ? (
                  <TableFooter className="sticky bottom-0 z-[1] bg-slate-50">
                    <TableRow className="hover:bg-slate-50">
                      <TableCell className="py-3 pl-5 text-sm font-semibold text-slate-700">Total · all {viewTotals.count.toLocaleString()} items</TableCell>
                      <TableCell className="py-3 text-right tabular-nums text-slate-600">{qty(viewTotals.opening)}</TableCell>
                      <TableCell className="py-3 text-right font-semibold tabular-nums text-emerald-700">+{qty(viewTotals.boughtQty)}</TableCell>
                      <TableCell className="py-3 text-right font-semibold tabular-nums text-rose-700">−{qty(viewTotals.soldQty)}</TableCell>
                      <TableCell />
                      <TableCell className="py-3 text-right font-semibold tabular-nums text-slate-900">{qty(viewTotals.closing)}</TableCell>
                      <TableCell className="py-3 text-right text-base font-semibold tabular-nums text-slate-900">{qty(viewTotals.availableQty)}</TableCell>
                      <TableCell className="py-3 pr-5 text-right font-semibold tabular-nums text-slate-900">{money(viewTotals.stockValue)}</TableCell>
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
                Showing <span className="font-medium text-slate-900">{fromRow.toLocaleString()}–{toRowN.toLocaleString()}</span> of{" "}
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
              <Button variant="outline" size="sm" className="h-8 bg-white px-2.5" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => setPage(pagination.totalPages)}>
                Last
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <p className="text-xs text-slate-500">
        Closing = opening + everything received − everything sent out in the period. Available now = live stock today. Sell-through = sold ÷ (opening + bought).
      </p>
    </div>
  );
}
