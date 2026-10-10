"use client";

import React, { useState, useEffect, useCallback, useMemo, type ComponentType, type ReactNode } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarIcon,
  ChevronRight,
  Gauge,
  Hourglass,
  Layers,
  Loader2,
  MapPin,
  Package,
  Percent,
  PiggyBank,
  Receipt,
  RefreshCw,
  ShoppingCart,
  SlidersHorizontal,
  Tag,
  TrendingDown,
  TrendingUp,
  Trophy,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { DetailSheet, DetailSheetBody, DetailSheetFooter, DetailSheetHeader } from "@/components/ui/detail-sheet";
import { ReportItemCombobox } from "@/components/report-item-combobox";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import apiClient from "@/lib/apiClient";
import { toast } from "sonner";
import { usePosData } from "@/hooks/use-pos-data";
import { useLogoDataUri } from "@/hooks/use-logo-data-uri";
import { StockOpsActions } from "@/components/inventory/stock-ops/stock-ops-actions";
import { downloadExcel, downloadBrandedPdf, formatMoney, formatQty, yieldForUi } from "@/components/inventory/stock-ops/export-utils";
import { cn } from "@/lib/utils";

type Metrics = {
  revenue: number;
  cogs: number;
  profit: number;
  margin: number;
  units: number;
  count: number;
  discount: number;
  tax: number;
  avgTicket: number;
};

type BranchRow = Metrics & {
  branchId?: string;
  name: string;
  code?: string;
  stockValue?: number;
  stockRetail?: number;
  stockUnits?: number;
  turnover?: number | null;
  daysOfStock?: number | null;
  topProducts?: (Metrics & { id: string; name: string; sku: string; category: string })[];
  categories?: (Metrics & { id: string; name: string })[];
};

type ProductRow = Metrics & { id: string; name: string; sku: string; category: string };
type CategoryRow = Metrics & { id: string; name: string };

interface Summary {
  totalRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  profitMargin: number;
  transactionCount: number;
  unitsSold?: number;
  avgTicket?: number;
  discount?: number;
  tax?: number;
  stockValue?: number;
  stockRetail?: number;
  stockUnits?: number;
  turnover?: number | null;
  daysOfStock?: number | null;
  periodDays?: number;
  productCount?: number;
  lossMakingCount?: number;
}

type SortKey = "revenue" | "profit" | "margin" | "count" | "name";
type DatePreset = "all" | "today" | "7d" | "month" | "custom";

const rs = (n: unknown) => `Rs ${formatMoney(Number(n) || 0)}`;
const compact = (n: number) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 10_000_000) return `${sign}Rs ${(abs / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000) return `${sign}Rs ${(abs / 100_000).toFixed(2)} Lac`;
  return rs(n);
};
const pct = (n: number) => `${(Number(n) || 0).toFixed(1)}%`;
const marginTone = (m: number) =>
  m >= 40 ? "text-emerald-700" : m >= 20 ? "text-emerald-600" : m >= 10 ? "text-amber-600" : "text-rose-600";
const marginPill = (m: number) =>
  m >= 20
    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
    : m >= 10
      ? "bg-amber-50 text-amber-700 ring-amber-600/20"
      : "bg-rose-50 text-rose-700 ring-rose-600/20";

export function InventoryAudit() {
  const logoDataUri = useLogoDataUri();
  const { categories, branches, fetchCategories, fetchBranches } = usePosData();

  const [rows, setRows] = useState<BranchRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);
  const [topProducts, setTopProducts] = useState<ProductRow[]>([]);
  const [lowMargin, setLowMargin] = useState<ProductRow[]>([]);
  const [trend, setTrend] = useState<{ date: string; revenue: number; cogs: number; profit: number; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [productOptions, setProductOptions] = useState<{ id: string; name: string; sku: string | null }[]>([]);

  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterProduct, setFilterProduct] = useState("all");
  const [filterStart, setFilterStart] = useState<Date | undefined>();
  const [filterEnd, setFilterEnd] = useState<Date | undefined>();
  const [preset, setPreset] = useState<DatePreset>("all");
  const [detail, setDetail] = useState<BranchRow | null>(null);

  const fetchAuditData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { type: "financial_audit" };
      if (filterBranch !== "all") params.branchId = filterBranch;
      if (filterCategory !== "all") params.categoryId = filterCategory;
      if (filterProduct !== "all") params.productId = filterProduct;
      if (filterStart) params.startDate = filterStart.toISOString();
      if (filterEnd) {
        const e = new Date(filterEnd);
        e.setHours(23, 59, 59, 999);
        params.endDate = e.toISOString();
      }
      const response = await apiClient.get("/inventory/reports", { params });
      const report = response.data?.data || {};
      setRows(report.data || []);
      setSummary(report.summary || null);
      setCategoryRows(report.categories || []);
      setTopProducts(report.topProducts || []);
      setLowMargin(report.lowMarginProducts || []);
      setTrend(report.trend || []);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || "Failed to load financial audit");
    } finally {
      setLoading(false);
    }
  }, [filterBranch, filterCategory, filterProduct, filterStart, filterEnd]);

  useEffect(() => {
    fetchCategories();
    fetchBranches();
    apiClient
      .get("/products", { params: { page: 1, limit: 1000, is_active: true } })
      .then((res) =>
        setProductOptions(
          (res.data?.data || []).map((p: any) => ({ id: p.id, name: p.name, sku: p.sku || p.code || null })),
        ),
      )
      .catch(() => setProductOptions([]));
  }, [fetchCategories, fetchBranches]);

  useEffect(() => {
    fetchAuditData();
  }, [fetchAuditData]);

  const applyPreset = (next: DatePreset) => {
    setPreset(next);
    const now = new Date();
    const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (next === "all") {
      setFilterStart(undefined);
      setFilterEnd(undefined);
    } else if (next === "today") {
      setFilterStart(day(now));
      setFilterEnd(day(now));
    } else if (next === "7d") {
      const from = day(now);
      from.setDate(from.getDate() - 6);
      setFilterStart(from);
      setFilterEnd(day(now));
    } else if (next === "month") {
      setFilterStart(new Date(now.getFullYear(), now.getMonth(), 1));
      setFilterEnd(day(now));
    }
  };

  const activeFilterCount =
    (preset !== "all" ? 1 : 0) + (filterBranch !== "all" ? 1 : 0) + (filterCategory !== "all" ? 1 : 0) + (filterProduct !== "all" ? 1 : 0);
  const clearFilters = () => {
    applyPreset("all");
    setFilterBranch("all");
    setFilterCategory("all");
    setFilterProduct("all");
  };

  const sortedRows = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      switch (sortKey) {
        case "profit":
          return b.profit - a.profit;
        case "margin":
          return (b.margin ?? 0) - (a.margin ?? 0);
        case "count":
          return b.count - a.count;
        case "name":
          return a.name.localeCompare(b.name);
        default:
          return b.revenue - a.revenue;
      }
    });
    return list;
  }, [rows, sortKey]);

  const totalRevenue = summary?.totalRevenue || 0;
  const periodLabel = filterStart
    ? `${format(filterStart, "dd MMM yyyy")}${filterEnd ? ` – ${format(filterEnd, "dd MMM yyyy")}` : " onwards"}`
    : "All time";
  const scopeLabel = [
    filterBranch !== "all" ? branches.find((b) => b.id === filterBranch)?.name : "All branches",
    filterCategory !== "all" ? categories.find((c) => c.id === filterCategory)?.name : null,
    filterProduct !== "all" ? productOptions.find((p) => p.id === filterProduct)?.name : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // ---------------- export ----------------
  const exportExcel = async () => {
    if (!rows.length) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      downloadExcel(
        `financial-audit-${format(new Date(), "yyyy-MM-dd")}.xlsx`,
        "Branches",
        ["Branch", "Sales", "Units", "Revenue", "COGS", "Gross profit", "Margin %", "Avg ticket", "Discounts", "Tax", "Stock value (cost)", "Turnover / yr", "Days of stock"],
        sortedRows.map((r) => [
          r.name,
          r.count,
          r.units,
          r.revenue,
          r.cogs,
          r.profit,
          r.margin,
          r.avgTicket,
          r.discount,
          r.tax,
          r.stockValue ?? 0,
          r.turnover ?? "",
          r.daysOfStock ?? "",
        ]),
      );
      toast.success("Excel downloaded");
    } catch {
      toast.error("Failed to export Excel");
    } finally {
      setExporting(false);
    }
  };
  const exportPdf = async () => {
    if (!rows.length) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      await downloadBrandedPdf({
        filename: `financial-audit-${format(new Date(), "yyyy-MM-dd")}.pdf`,
        title: "Inventory Financial Audit",
        subtitle: `${periodLabel} · ${scopeLabel}`,
        logoDataUri,
        summary: [
          { label: "Revenue", value: rs(summary?.totalRevenue) },
          { label: "COGS", value: rs(summary?.totalCOGS) },
          { label: "Gross profit", value: rs(summary?.grossProfit) },
          { label: "Margin", value: pct(summary?.profitMargin || 0) },
        ],
        columns: [
          { header: "Branch", width: 1.8 },
          { header: "Sales", align: "right", width: 0.7 },
          { header: "Revenue", align: "right", width: 1.2 },
          { header: "COGS", align: "right", width: 1.2 },
          { header: "Profit", align: "right", width: 1.2 },
          { header: "Margin", align: "right", width: 0.8 },
        ],
        rows: sortedRows.map((r) => [r.name, String(r.count), formatMoney(r.revenue), formatMoney(r.cogs), formatMoney(r.profit), pct(r.margin)]),
      });
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  const isFirstLoad = loading && !summary;
  const isRefreshing = loading && !!summary;

  const heroCards: Array<{ label: string; value: string; hint: string; icon: ComponentType<{ className?: string }>; tone: string; accent: string; valueClass?: string }> = [
    {
      label: "Revenue",
      value: compact(summary?.totalRevenue || 0),
      hint: `${(summary?.transactionCount || 0).toLocaleString()} sales · avg ${rs(summary?.avgTicket || 0)}`,
      icon: Receipt,
      tone: "bg-blue-50 text-blue-600",
      accent: "bg-blue-500",
    },
    {
      label: "Cost of goods sold",
      value: compact(summary?.totalCOGS || 0),
      hint: `${formatQty(summary?.unitsSold || 0)} units sold`,
      icon: ShoppingCart,
      tone: "bg-slate-100 text-slate-600",
      accent: "bg-slate-400",
    },
    {
      label: "Gross profit",
      value: compact(summary?.grossProfit || 0),
      hint: `${pct(summary?.profitMargin || 0)} margin`,
      icon: PiggyBank,
      tone: (summary?.grossProfit || 0) < 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600",
      accent: (summary?.grossProfit || 0) < 0 ? "bg-rose-500" : "bg-emerald-500",
      valueClass: (summary?.grossProfit || 0) < 0 ? "text-rose-700" : "text-emerald-700",
    },
    {
      label: "Inventory on hand",
      value: compact(summary?.stockValue || 0),
      hint: `${formatQty(summary?.stockUnits || 0)} units · retail ${compact(summary?.stockRetail || 0)}`,
      icon: Boxes,
      tone: "bg-violet-50 text-violet-600",
      accent: "bg-violet-500",
    },
  ];

  const strip: Array<{ label: string; value: string; icon: ComponentType<{ className?: string }>; tone: string; title?: string; valueClass?: string }> = [
    { label: "Profit margin", value: pct(summary?.profitMargin || 0), icon: Percent, tone: "text-emerald-500", valueClass: marginTone(summary?.profitMargin || 0) },
    { label: "Discounts given", value: rs(summary?.discount || 0), icon: Tag, tone: "text-amber-500" },
    { label: "Tax collected", value: rs(summary?.tax || 0), icon: Receipt, tone: "text-sky-500" },
    {
      label: "Stock turnover",
      value: summary?.turnover != null ? `${summary.turnover}× / yr` : "—",
      icon: Gauge,
      tone: "text-violet-500",
      title: "Annualised cost of goods sold ÷ current stock at cost",
    },
    {
      label: "Days of stock",
      value: summary?.daysOfStock != null ? `${summary.daysOfStock} days` : "—",
      icon: Hourglass,
      tone: "text-indigo-500",
      title: "How long current stock lasts at this period's selling rate",
    },
    {
      label: "Loss-making items",
      value: String(summary?.lossMakingCount || 0),
      icon: AlertTriangle,
      tone: "text-rose-500",
      valueClass: (summary?.lossMakingCount || 0) > 0 ? "text-rose-700" : undefined,
    },
  ];

  const filterLabel = "text-xs font-semibold text-indigo-900/80";
  const filterControl = "h-10 border-indigo-200/80 bg-white text-sm shadow-sm";
  const th = "px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap";

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-5 p-4 text-black md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">Inventory Financial Audit</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1">
                <CalendarIcon className="h-3.5 w-3.5" />
                {periodLabel}
              </span>
              <span className="text-slate-300">•</span>
              <span className="truncate">{scopeLabel}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9 bg-white shadow-sm" onClick={fetchAuditData} disabled={loading} title="Refresh">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <StockOpsActions onExportExcel={exportExcel} onExportPdf={exportPdf} disabled={loading || rows.length === 0} exporting={exporting} />
        </div>
      </div>

      {/* Hero cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 md:gap-4">
        {isFirstLoad
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-3 w-36" />
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
                      <p className={cn("mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums text-slate-900 transition-opacity", card.valueClass, isRefreshing && "opacity-40")}>
                        {card.value}
                      </p>
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

      {/* Secondary strip */}
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
        {strip.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="min-w-0 p-4" title={item.title}>
              <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Icon className={cn("h-3.5 w-3.5", item.tone)} />
                {item.label}
              </p>
              {isFirstLoad ? (
                <Skeleton className="mt-2 h-5 w-20" />
              ) : (
                <p className={cn("mt-1 truncate text-base font-semibold tabular-nums text-slate-900 transition-opacity", item.valueClass, isRefreshing && "opacity-40")}>{item.value}</p>
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
              <p className="truncate text-xs text-slate-500">Narrow the audit by period, branch, category or a single product</p>
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
              onClick={clearFilters}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Clear filters
            </Button>
          ) : null}
        </div>
        <div className="space-y-4 border-t border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-indigo-50/30 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("mr-1", filterLabel)}>Period</span>
            {(
              [
                { id: "all", label: "All time" },
                { id: "today", label: "Today" },
                { id: "7d", label: "Last 7 days" },
                { id: "month", label: "This month" },
                { id: "custom", label: "Custom" },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  preset === p.id ? "border-indigo-600 bg-indigo-600 text-white shadow-sm" : "border-indigo-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-x-3 gap-y-4 border-t border-dashed border-indigo-200 pt-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-1.5">
              <Label className={filterLabel}>Branch</Label>
              <Select value={filterBranch} onValueChange={setFilterBranch}>
                <SelectTrigger className={filterControl}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabel}>Category</Label>
              <ReportItemCombobox
                value={filterCategory}
                onChange={setFilterCategory}
                items={categories.filter((c) => (c.name || "").toLowerCase() !== "unknown").map((c) => ({ id: c.id, name: c.name, sku: null }))}
                placeholder="All categories"
                allLabel="All categories"
                searchPlaceholder="Search categories…"
                emptyText="No categories found"
                className={filterControl}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabel}>Product</Label>
              <ReportItemCombobox
                value={filterProduct}
                onChange={setFilterProduct}
                items={productOptions}
                placeholder="All products"
                allLabel="All products"
                searchPlaceholder="Search name or SKU…"
                className={filterControl}
              />
            </div>
            {(
              [
                { label: "From", value: filterStart, set: setFilterStart },
                { label: "To", value: filterEnd, set: setFilterEnd },
              ] as const
            ).map((f) => (
              <div key={f.label} className="space-y-1.5">
                <Label className={filterLabel}>{f.label}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn(filterControl, "w-full justify-start text-left font-normal")}>
                      <CalendarIcon className="mr-2 h-4 w-4 text-slate-500" />
                      {f.value ? format(f.value, "dd MMM yyyy") : <span className="text-slate-400">Any date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={f.value}
                      onSelect={(d) => {
                        f.set(d);
                        setPreset("custom");
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Trend */}
      <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
        <PanelHeader icon={<TrendingUp className="h-4 w-4" />} title="Revenue, cost & profit over time" description="Daily totals for the selected period" />
        <div className="h-[280px] p-4">
          {isFirstLoad ? (
            <Skeleton className="h-full w-full" />
          ) : trend.length === 0 ? (
            <EmptyBlock icon={BarChart3} message="No completed sales in this period" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend.map((d) => ({ ...d, label: format(new Date(`${d.date}T00:00:00`), "dd MMM") }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#64748b" }} interval="preserveStartEnd" />
                <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#64748b" }} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} width={44} />
                <Tooltip formatter={(value: number, name: string) => [rs(value), name]} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="cogs" name="COGS" fill="#cbd5e1" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Line dataKey="profit" name="Profit" type="monotone" stroke="#059669" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Branch performance */}
      <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
        <PanelHeader
          icon={<MapPin className="h-4 w-4" />}
          title="Branch performance"
          description="Click a branch for its full breakdown"
          action={
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-8 w-[170px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="revenue">Sort: Revenue</SelectItem>
                <SelectItem value="profit">Sort: Profit</SelectItem>
                <SelectItem value="margin">Sort: Margin</SelectItem>
                <SelectItem value="count">Sort: Sales</SelectItem>
                <SelectItem value="name">Sort: Name</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        {isFirstLoad ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : sortedRows.length === 0 ? (
          <EmptyBlock icon={MapPin} message="No branch sales for these filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className={cn(th, "pl-5")}>Branch</th>
                  <th className={cn(th, "text-right")}>Sales</th>
                  <th className={cn(th, "text-right")}>Revenue</th>
                  <th className={cn(th, "text-right")}>COGS</th>
                  <th className={cn(th, "text-right")}>Profit</th>
                  <th className={cn(th, "w-40")}>Margin</th>
                  <th className={cn(th, "text-right")}>Stock value</th>
                  <th className={cn(th, "text-right")}>Turnover</th>
                  <th className={cn(th, "pr-5")} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.map((r) => {
                  const share = totalRevenue ? (r.revenue / totalRevenue) * 100 : 0;
                  return (
                    <tr key={r.branchId || r.name} className="cursor-pointer hover:bg-slate-50/70" onClick={() => setDetail(r)}>
                      <td className="px-4 py-3 pl-5">
                        <p className="flex items-center gap-1.5 font-semibold text-slate-900">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" />
                          {r.name}
                        </p>
                        <p className="text-[11px] text-slate-500">{share.toFixed(1)}% of revenue · avg ticket {rs(r.avgTicket || 0)}</p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{r.count.toLocaleString()}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{rs(r.revenue)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-500">{rs(r.cogs)}</td>
                      <td className={cn("whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums", r.profit < 0 ? "text-rose-700" : "text-emerald-700")}>{rs(r.profit)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={cn("h-full rounded-full", (r.margin ?? 0) >= 20 ? "bg-emerald-500" : (r.margin ?? 0) >= 10 ? "bg-amber-400" : "bg-rose-500")}
                              style={{ width: `${Math.max(2, Math.min(100, r.margin ?? 0))}%` }}
                            />
                          </div>
                          <span className={cn("w-12 text-right text-xs font-semibold tabular-nums", marginTone(r.margin ?? 0))}>{pct(r.margin ?? 0)}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">{r.stockValue != null ? rs(r.stockValue) : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">{r.turnover != null ? `${r.turnover}×` : "—"}</td>
                      <td className="px-4 py-3 pr-5 text-right">
                        <ChevronRight className="inline h-4 w-4 text-slate-300" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Category + products */}
      <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
          <PanelHeader icon={<Layers className="h-4 w-4" />} title="By category" description="Revenue share and margin per category" />
          {isFirstLoad ? (
            <ListSkeleton />
          ) : categoryRows.length === 0 ? (
            <EmptyBlock icon={Layers} message="No category sales" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {categoryRows.map((c) => {
                const share = totalRevenue ? (c.revenue / totalRevenue) * 100 : 0;
                return (
                  <li key={c.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-slate-900">{c.name}</p>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums text-slate-900">{rs(c.revenue)}</span>
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset", marginPill(c.margin))}>{pct(c.margin)}</span>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${share}%` }} />
                      </div>
                      <span className="w-12 text-right text-[11px] tabular-nums text-slate-400">{share.toFixed(0)}%</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {formatQty(c.units)} units · profit <span className={c.profit < 0 ? "text-rose-600" : "text-emerald-700"}>{rs(c.profit)}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-4 md:space-y-6">
          <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
            <PanelHeader icon={<Trophy className="h-4 w-4" />} title="Most profitable products" description="Ranked by gross profit" />
            {isFirstLoad ? (
              <ListSkeleton />
            ) : topProducts.length === 0 ? (
              <EmptyBlock icon={Package} message="No product sales" />
            ) : (
              <ProductList rows={topProducts} max={Math.max(1, ...topProducts.map((p) => p.profit))} bar="bg-emerald-500" />
            )}
          </Card>
          <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
            <PanelHeader icon={<TrendingDown className="h-4 w-4" />} title="Lowest margins" description="Check pricing or cost on these" />
            {isFirstLoad ? (
              <ListSkeleton />
            ) : lowMargin.length === 0 ? (
              <EmptyBlock icon={Package} message="No product sales" />
            ) : (
              <ProductList rows={lowMargin} highlightMargin />
            )}
          </Card>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        COGS uses each sale line&apos;s cost at sale time (falls back to purchase rate for older bills). Only completed sales are included. Turnover and days of stock compare this period&apos;s selling
        rate with stock on hand today.
      </p>

      {/* Branch detail */}
      <DetailSheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)} size="lg">
        <DetailSheetHeader title={detail?.name || "Branch"} subtitle={`Financial breakdown · ${periodLabel}`} />
        <DetailSheetBody>
          {detail ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", marginPill(detail.margin))}>{pct(detail.margin)} margin</span>
                <span className="text-xs text-slate-500">
                  {detail.count.toLocaleString()} completed sales · {totalRevenue ? ((detail.revenue / totalRevenue) * 100).toFixed(1) : "0"}% of revenue
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  { label: "Revenue", value: rs(detail.revenue), tone: "text-slate-900" },
                  { label: "COGS", value: rs(detail.cogs), tone: "text-slate-700" },
                  { label: "Gross profit", value: rs(detail.profit), tone: detail.profit < 0 ? "text-rose-700" : "text-emerald-700" },
                  { label: "Avg ticket", value: rs(detail.avgTicket), tone: "text-slate-900" },
                  { label: "Units sold", value: formatQty(detail.units), tone: "text-slate-900" },
                  { label: "Profit / sale", value: rs(detail.count ? detail.profit / detail.count : 0), tone: "text-slate-900" },
                  { label: "Discounts", value: rs(detail.discount), tone: "text-amber-700" },
                  { label: "Tax", value: rs(detail.tax), tone: "text-slate-700" },
                  { label: "Profit / unit", value: rs(detail.units ? detail.profit / detail.units : 0), tone: "text-slate-900" },
                ].map((k) => (
                  <div key={k.label} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</p>
                    <p className={cn("mt-0.5 text-base font-semibold tabular-nums", k.tone)}>{k.value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-violet-800">
                  <Wallet className="h-3.5 w-3.5" />
                  Inventory at this branch
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-[11px] text-slate-500">Stock at cost</p>
                    <p className="font-semibold tabular-nums text-slate-900">{rs(detail.stockValue || 0)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Stock at retail</p>
                    <p className="font-semibold tabular-nums text-slate-900">{rs(detail.stockRetail || 0)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Turnover</p>
                    <p className="font-semibold tabular-nums text-slate-900">{detail.turnover != null ? `${detail.turnover}× / yr` : "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Days of stock</p>
                    <p className="font-semibold tabular-nums text-slate-900">{detail.daysOfStock != null ? `${detail.daysOfStock} days` : "—"}</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Categories</p>
                {(detail.categories || []).length === 0 ? (
                  <p className="text-sm text-slate-400">No category data</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-slate-100">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left">Category</th>
                          <th className="px-3 py-2 text-right">Units</th>
                          <th className="px-3 py-2 text-right">Revenue</th>
                          <th className="px-3 py-2 text-right">Profit</th>
                          <th className="px-3 py-2 text-right">Margin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(detail.categories || []).map((c) => (
                          <tr key={c.id}>
                            <td className="px-3 py-2 font-medium text-slate-900">{c.name}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatQty(c.units)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{rs(c.revenue)}</td>
                            <td className={cn("px-3 py-2 text-right tabular-nums", c.profit < 0 ? "text-rose-700" : "text-emerald-700")}>{rs(c.profit)}</td>
                            <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", marginTone(c.margin))}>{pct(c.margin)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Top products by profit</p>
                {(detail.topProducts || []).length === 0 ? (
                  <p className="text-sm text-slate-400">No product data</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-slate-100">
                    <ProductList rows={detail.topProducts as ProductRow[]} max={Math.max(1, ...(detail.topProducts || []).map((p) => p.profit))} bar="bg-emerald-500" />
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (detail?.branchId) setFilterBranch(detail.branchId);
              setDetail(null);
            }}
            disabled={!detail?.branchId || filterBranch === detail?.branchId}
          >
            <MapPin className="mr-2 h-4 w-4" />
            Filter page to this branch
          </Button>
          <Button variant="outline" onClick={() => setDetail(null)}>
            Close
          </Button>
        </DetailSheetFooter>
      </DetailSheet>
    </div>
  );
}

function PanelHeader({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
          {description ? <p className="truncate text-xs text-slate-500">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

function ProductList({ rows, max, bar, highlightMargin }: { rows: ProductRow[]; max?: number; bar?: string; highlightMargin?: boolean }) {
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((p, i) => (
        <li key={p.id} className="px-5 py-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums",
                !highlightMargin && i === 0 ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200" : "bg-slate-100 text-slate-600",
              )}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                {highlightMargin ? (
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", marginPill(p.margin))}>{pct(p.margin)}</span>
                ) : (
                  <p className={cn("shrink-0 text-sm font-semibold tabular-nums", p.profit < 0 ? "text-rose-700" : "text-emerald-700")}>{rs(p.profit)}</p>
                )}
              </div>
              <p className="truncate text-[11px] text-slate-500">
                {p.sku ? <span className="font-mono">{p.sku} · </span> : null}
                {formatQty(p.units)} sold · revenue {rs(p.revenue)}
                {highlightMargin ? ` · profit ${rs(p.profit)}` : ` · ${pct(p.margin)} margin`}
              </p>
              {max ? (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.max(2, (Math.max(0, p.profit) / max) * 100)}%` }} />
                </div>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4 p-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  );
}

function EmptyBlock({ icon: Icon, message }: { icon: ComponentType<{ className?: string }>; message: string }) {
  return (
    <div className="flex h-full min-h-[160px] flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-slate-600">{message}</p>
    </div>
  );
}
