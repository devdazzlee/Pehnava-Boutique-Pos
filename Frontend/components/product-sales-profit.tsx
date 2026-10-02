"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Printer, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateField } from "@/components/ui/date-picker";
import { PageLoader } from "@/components/ui/page-loader";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { CompactReportFilters } from "@/components/report-filters-shell";
import { rangeForPreset } from "@/lib/business-timezone";

type Preset = "all" | "today" | "yesterday" | "last7" | "last30" | "custom";

interface Row {
  productId: string;
  product: string;
  sku: string;
  category: string;
  orders: number;
  grossQty: number;
  returnsQty: number;
  netQty: number;
  remainingQty: number;
  grossSales: number;
  discounts: number;
  returnsValue: number;
  netSales: number;
  cost: number;
  grossProfit: number;
  marginPercent: number;
}

interface ReportData {
  categories: { id: string; name: string }[];
  branches: { id: string; name: string; code: string }[];
  rows: Row[];
  totals: {
    products: number;
    orders: number;
    grossQty: number;
    returnsQty: number;
    netQty: number;
    remainingQty: number;
    grossSales: number;
    discounts: number;
    returnsValue: number;
    netSales: number;
    cost: number;
    grossProfit: number;
    marginPercent: number;
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

const rangeFor = (preset: Exclude<Preset, "custom">) => rangeForPreset(preset);

const money = (value: number) =>
  Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const qty = (value: number) =>
  Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

const MoneyCell = ({
  value,
  tone = "neutral",
  strong,
  signed,
}: {
  value: number;
  tone?: "neutral" | "danger" | "success" | "accent";
  strong?: boolean;
  /** Show as negative with minus when value > 0 (returns) */
  signed?: boolean;
}) => {
  const amount = Math.abs(value);
  const showDanger = tone === "danger" && amount > 0;
  const showSuccess = tone === "success";
  const prefix = signed && amount > 0 ? "−" : value < 0 ? "−" : "";
  return (
    <span
      className={cn(
        "inline-flex items-baseline justify-end gap-1 whitespace-nowrap tabular-nums",
        strong && "font-semibold",
        showDanger && "text-red-600",
        showSuccess && (value >= 0 ? "text-emerald-700" : "text-red-600"),
        tone === "accent" && "font-semibold text-[#9a6b1f]",
        !showDanger && !showSuccess && tone === "neutral" && "text-slate-800",
        amount === 0 && tone === "danger" && "text-slate-400",
      )}
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Rs</span>
      <span>
        {prefix}
        {money(amount)}
      </span>
    </span>
  );
};

const periodLabel = (from: string, to: string) =>
  from === "2000-01-01"
    ? "All dates"
    : `${format(new Date(`${from}T00:00:00`), "dd MMM yyyy")} – ${format(
        new Date(`${to}T00:00:00`),
        "dd MMM yyyy",
      )}`;

export function ProductSalesProfit() {
  const { toast } = useToast();
  const initial = rangeFor("last30");
  const [preset, setPreset] = useState<Preset>("last30");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [categoryId, setCategoryId] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [search, setSearch] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { from, to };
      if (categoryId !== "all") params.categoryId = categoryId;
      if (branchId !== "all") params.branchId = branchId;
      if (search.trim()) params.search = search.trim();
      const response = await apiClient.get("/product-sales-profit", { params });
      setReport(response.data.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load product sales & profit",
        description: error?.response?.data?.message || error?.message || "Try again",
      });
    } finally {
      setLoading(false);
    }
  }, [from, to, categoryId, branchId, search, toast]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

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
    setPreset("custom");
    setFrom(draftFrom);
    setTo(draftTo);
  };

  const clearFilters = () => {
    const range = rangeFor("last30");
    setPreset("last30");
    setFrom(range.from);
    setTo(range.to);
    setDraftFrom(range.from);
    setDraftTo(range.to);
    setCategoryId("all");
    setBranchId("all");
    setSearch("");
  };

  const rows = report?.rows || [];
  const totals = report?.totals;
  const categoryName =
    categoryId === "all"
      ? "All categories"
      : report?.categories.find((category) => category.id === categoryId)?.name || "Category";
  const branchName =
    branchId === "all"
      ? "All locations"
      : report?.branches.find((branch) => branch.id === branchId)?.name || "Location";
  const filterLabel = `${categoryName} · ${branchName}`;

  const printMoney = (value: number) => `Rs. ${money(value)}`;

  const printReport = () => {
    const win = window.open("", "_blank");
    if (!win || !report) return;
    const body = rows
      .map(
        (row) => `<tr>
          <td>${row.product}<div style="color:#786448;font-size:11px">${row.sku} · ${row.category}</div></td>
          <td style="text-align:right">${row.orders}</td>
          <td style="text-align:right">${qty(row.grossQty)}</td>
          <td style="text-align:right;color:${row.returnsQty ? "#b91c1c" : "#64748b"}">${row.returnsQty ? `-${qty(row.returnsQty)}` : "0"}</td>
          <td style="text-align:right">${qty(row.netQty)}</td>
          <td style="text-align:right">${qty(row.remainingQty)}</td>
          <td style="text-align:right">${printMoney(row.grossSales)}</td>
          <td style="text-align:right">${printMoney(row.discounts)}</td>
          <td style="text-align:right;color:${row.returnsValue ? "#b91c1c" : "#64748b"}">${row.returnsValue ? `-${printMoney(row.returnsValue)}` : printMoney(0)}</td>
          <td style="text-align:right;font-weight:700">${printMoney(row.netSales)}</td>
          <td style="text-align:right">${printMoney(row.cost)}</td>
          <td style="text-align:right;color:${row.grossProfit >= 0 ? "#15803d" : "#b91c1c"}">${printMoney(row.grossProfit)}</td>
          <td style="text-align:right;color:#a67c2e">${row.marginPercent.toFixed(1)}%</td>
        </tr>`,
      )
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Product Sales & Profit</title>
      <style>
        body{font-family:Georgia,serif;color:#2a2012;padding:24px}
        .top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #a67c2e;padding-bottom:12px;margin-bottom:16px}
        img{height:56px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th{background:#1e3a5f;color:#fff;text-align:left;padding:8px 6px;white-space:nowrap}
        td{border-bottom:1px solid #e8dcc4;padding:7px 6px;vertical-align:top}
        tfoot td{font-weight:bold;border-top:2px solid #a67c2e;background:#fcf8f2}
      </style></head><body>
      <div class="top"><img src="${window.location.origin}/logo.png" alt="Pehnawa" />
      <div style="text-align:right"><h1 style="margin:0;font-size:22px">Product Sales & Profit</h1>
      <p style="margin:4px 0 0;color:#786448">${periodLabel(from, to)} · ${filterLabel}</p></div></div>
      <table><thead><tr>
        <th>Product</th><th>Orders</th><th>Gross Qty</th><th>Returns Qty</th><th>Net Qty</th><th>Remaining</th>
        <th>Gross Sales</th><th>Discounts</th><th>Returns Value</th><th>Net Sales</th>
        <th>Cost</th><th>Gross Profit</th><th>Margin %</th>
      </tr></thead>
      <tbody>${body || `<tr><td colspan="13">No product sales in this period.</td></tr>`}</tbody>
      ${
        totals
          ? `<tfoot><tr>
        <td>${totals.products} products</td>
        <td style="text-align:right">${totals.orders}</td>
        <td style="text-align:right">${qty(totals.grossQty)}</td>
        <td style="text-align:right">-${qty(totals.returnsQty)}</td>
        <td style="text-align:right">${qty(totals.netQty)}</td>
        <td style="text-align:right">${qty(totals.remainingQty)}</td>
        <td style="text-align:right">${printMoney(totals.grossSales)}</td>
        <td style="text-align:right">${printMoney(totals.discounts)}</td>
        <td style="text-align:right">-${printMoney(totals.returnsValue)}</td>
        <td style="text-align:right">${printMoney(totals.netSales)}</td>
        <td style="text-align:right">${printMoney(totals.cost)}</td>
        <td style="text-align:right">${printMoney(totals.grossProfit)}</td>
        <td style="text-align:right">${totals.marginPercent.toFixed(1)}%</td>
      </tr></tfoot>`
          : ""
      }
      </table></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Sales & Profit</h1>
          <p className="text-sm text-gray-500">
            Per dress: orders, returns, remaining stock, net sales, cost, profit & margin ·{" "}
            {periodLabel(from, to)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="outline" onClick={printReport} disabled={!report || loading}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      <CompactReportFilters
        defaultOpen
        summary={`${periodLabel(from, to)} · ${filterLabel}`}
        actions={
          <>
            {preset === "custom" ? (
              <Button size="sm" className="h-8" onClick={applyCustom}>
                Apply
              </Button>
            ) : null}
            <Button size="sm" variant="outline" className="h-8 border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800" onClick={clearFilters}>
              <X className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          </>
        }
        primary={
          <>
            <div className="space-y-1 sm:col-span-2">
              <Label>Dress / product</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-9 pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search dress name, SKU, or code…"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Date range</Label>
              <Select value={preset} onValueChange={(value) => applyPreset(value as Preset)}>
                <SelectTrigger>
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
            <div className="space-y-1">
              <Label>Category</Label>
              {loading && !report ? (
                <Skeleton className="h-9 w-full rounded-md" />
              ) : (
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {(report?.categories || []).map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </>
        }
        advanced={
          <>
            <DateField
              label="From date"
              value={draftFrom}
              onChange={(value) => {
                setDraftFrom(value);
                setPreset("custom");
              }}
            />
            <DateField
              label="To date"
              value={draftTo}
              onChange={(value) => {
                setDraftTo(value);
                setPreset("custom");
              }}
            />
            <div className="space-y-1">
              <Label>Branch</Label>
              {loading && !report ? (
                <Skeleton className="h-9 w-full rounded-md" />
              ) : (
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All branches" />
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
              )}
            </div>
          </>
        }
      />

      {loading ? (
        <Card>
          <CardContent className="p-0">
            <PageLoader message="Loading product sales & profit..." />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Products" value={String(totals?.products || 0)} />
            <SummaryCard label="Orders" value={String(totals?.orders || 0)} />
            <SummaryCard label="Net qty" value={qty(totals?.netQty || 0)} />
            <SummaryCard label="Net sales" value={`Rs ${money(totals?.netSales || 0)}`} />
            <SummaryCard
              label="Gross profit"
              value={`Rs ${money(totals?.grossProfit || 0)}`}
              hint={totals ? `${totals.marginPercent.toFixed(1)}% margin` : undefined}
              emphasis
              tone={(totals?.grossProfit || 0) >= 0 ? "good" : "bad"}
            />
          </div>

          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Dress-wise performance</p>
                <p className="text-xs text-slate-500">
                  Scroll sideways for full columns · Product & profit stay pinned
                </p>
              </div>
              <p className="hidden text-xs text-slate-400 sm:block">
                Amounts in <span className="font-medium text-slate-600">Rs</span>
              </p>
            </div>

            <div className="relative max-h-[min(70vh,720px)] overflow-auto">
              <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-30">
                  <tr className="bg-[#1e3a5f] text-[11px] uppercase tracking-wide text-white">
                    <th className="sticky left-0 z-40 min-w-[220px] bg-[#1e3a5f] px-4 py-3 text-left font-semibold shadow-[4px_0_8px_-4px_rgba(0,0,0,0.25)]">
                      Product
                    </th>
                    <th className="px-3 py-3 text-right font-semibold">Orders</th>
                    <th className="bg-[#243f66] px-3 py-3 text-right font-semibold">
                      <span className="block">Gross</span>
                      <span className="font-normal normal-case tracking-normal text-white/70">Qty</span>
                    </th>
                    <th className="bg-[#243f66] px-3 py-3 text-right font-semibold">
                      <span className="block">Returns</span>
                      <span className="font-normal normal-case tracking-normal text-white/70">Qty</span>
                    </th>
                    <th className="bg-[#243f66] px-3 py-3 text-right font-semibold">
                      <span className="block">Net</span>
                      <span className="font-normal normal-case tracking-normal text-white/70">Qty</span>
                    </th>
                    <th className="px-3 py-3 text-right font-semibold">
                      <span className="block">Stock</span>
                      <span className="font-normal normal-case tracking-normal text-white/70">Left</span>
                    </th>
                    <th className="min-w-[118px] px-3 py-3 text-right font-semibold">Gross Sales</th>
                    <th className="min-w-[100px] px-3 py-3 text-right font-semibold">Discount</th>
                    <th className="min-w-[118px] px-3 py-3 text-right font-semibold">Returns Val</th>
                    <th className="min-w-[118px] bg-[#2a4a72] px-3 py-3 text-right font-semibold">Net Sales</th>
                    <th className="min-w-[110px] px-3 py-3 text-right font-semibold">Cost</th>
                    <th className="sticky right-[72px] z-40 min-w-[120px] bg-[#1e3a5f] px-3 py-3 text-right font-semibold shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.2)]">
                      Profit
                    </th>
                    <th className="sticky right-0 z-40 min-w-[72px] bg-[#1e3a5f] px-3 py-3 text-right font-semibold">
                      Margin
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-4 py-14 text-center text-slate-500">
                        No product sales in this period. Try another date range or clear filters.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, index) => {
                      const zebra = index % 2 === 1;
                      const rowBg = zebra ? "bg-slate-50/80" : "bg-white";
                      const stickyBg = zebra ? "bg-slate-50" : "bg-white";
                      return (
                        <tr
                          key={row.productId}
                          className={cn("border-b border-slate-100 transition-colors hover:bg-[#fbf7ef]", rowBg)}
                        >
                          <td
                            className={cn(
                              "sticky left-0 z-20 max-w-[260px] px-4 py-3 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]",
                              stickyBg,
                            )}
                          >
                            <div className="truncate font-medium text-slate-900" title={row.product}>
                              {row.product}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">
                                {row.sku}
                              </span>
                              <span>{row.category}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-700">{row.orders}</td>
                          <td className="bg-slate-50/40 px-3 py-3 text-right tabular-nums text-slate-700">
                            {qty(row.grossQty)}
                          </td>
                          <td
                            className={cn(
                              "bg-slate-50/40 px-3 py-3 text-right tabular-nums",
                              row.returnsQty > 0 ? "font-medium text-red-600" : "text-slate-400",
                            )}
                          >
                            {row.returnsQty > 0 ? `−${qty(row.returnsQty)}` : "—"}
                          </td>
                          <td className="bg-slate-50/40 px-3 py-3 text-right font-medium tabular-nums text-slate-900">
                            {qty(row.netQty)}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                            {qty(row.remainingQty)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <MoneyCell value={row.grossSales} />
                          </td>
                          <td className="px-3 py-3 text-right">
                            <MoneyCell value={row.discounts} />
                          </td>
                          <td className="px-3 py-3 text-right">
                            {row.returnsValue > 0 ? (
                              <MoneyCell value={row.returnsValue} tone="danger" signed />
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="bg-[#f8fafc] px-3 py-3 text-right">
                            <MoneyCell value={row.netSales} strong />
                          </td>
                          <td className="px-3 py-3 text-right">
                            <MoneyCell value={row.cost} />
                          </td>
                          <td
                            className={cn(
                              "sticky right-[72px] z-20 px-3 py-3 text-right shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]",
                              stickyBg,
                            )}
                          >
                            <MoneyCell value={row.grossProfit} tone="success" strong />
                          </td>
                          <td
                            className={cn(
                              "sticky right-0 z-20 px-3 py-3 text-right tabular-nums font-semibold text-[#9a6b1f]",
                              stickyBg,
                            )}
                          >
                            {row.marginPercent.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {totals && rows.length > 0 ? (
                  <tfoot className="sticky bottom-0 z-30">
                    <tr className="border-t-2 border-[#c9a45a] bg-[#fcf8f2] text-sm font-semibold text-slate-900">
                      <td className="sticky left-0 z-40 bg-[#fcf8f2] px-4 py-3 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                        {totals.products} products
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{totals.orders}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{qty(totals.grossQty)}</td>
                      <td
                        className={cn(
                          "px-3 py-3 text-right tabular-nums",
                          totals.returnsQty > 0 ? "text-red-600" : "text-slate-400",
                        )}
                      >
                        {totals.returnsQty > 0 ? `−${qty(totals.returnsQty)}` : "—"}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{qty(totals.netQty)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{qty(totals.remainingQty)}</td>
                      <td className="px-3 py-3 text-right">
                        <MoneyCell value={totals.grossSales} strong />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <MoneyCell value={totals.discounts} strong />
                      </td>
                      <td className="px-3 py-3 text-right">
                        {totals.returnsValue > 0 ? (
                          <MoneyCell value={totals.returnsValue} tone="danger" signed strong />
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="bg-[#f5efe4] px-3 py-3 text-right">
                        <MoneyCell value={totals.netSales} strong />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <MoneyCell value={totals.cost} strong />
                      </td>
                      <td className="sticky right-[72px] z-40 bg-[#fcf8f2] px-3 py-3 text-right shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                        <MoneyCell value={totals.grossProfit} tone="success" strong />
                      </td>
                      <td className="sticky right-0 z-40 bg-[#fcf8f2] px-3 py-3 text-right tabular-nums text-[#9a6b1f]">
                        {totals.marginPercent.toFixed(1)}%
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <Card
      className={cn(
        "border-slate-200 shadow-sm",
        emphasis && "border-[#c9a45a]/50 bg-gradient-to-br from-[#fcf8f2] to-white",
      )}
    >
      <CardContent className="p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p
          className={cn(
            "mt-1 text-xl font-semibold tracking-tight text-slate-900",
            tone === "good" && "text-emerald-700",
            tone === "bad" && "text-red-600",
          )}
        >
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
