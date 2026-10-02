"use client";

import { useState, useEffect, useMemo, useCallback, type ComponentType, type ReactNode } from "react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageLoader } from "@/components/ui/page-loader";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatMoneyDisplay } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  fetchInventoryDashboard,
  fetchBranchesForFilter,
  type InventoryDashboardStats,
  type BranchOption,
} from "@/lib/inventory-api";
import {
  Package,
  MapPin,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  ShoppingBag,
  ArrowRightLeft,
  Loader2,
  Truck,
  PackageMinus,
  ClipboardList,
  TrendingUp,
  Warehouse,
  Boxes,
  Wallet,
  PiggyBank,
  Activity,
  RefreshCw,
  Download,
  Moon,
  Layers,
  PackageX,
  MinusCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Flame,
  SlidersHorizontal,
  Clock,
  Inbox,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Legend,
} from "recharts";

const CHART_COLORS = ["#4f46e5", "#059669", "#d97706", "#dc2626", "#0891b2", "#7c3aed", "#db2777", "#64748b"];

const BRANCH_FILTER_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "WAREHOUSE_MANAGER", "PURCHASE_MANAGER"]);

function formatRs(n: number) {
  const value = Number(n) || 0;
  const sign = value < 0 ? "-" : "";
  return `${sign}Rs ${formatMoneyDisplay(Math.abs(value))}`;
}

function formatQty(n: number) {
  const value = Number(n) || 0;
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function compactRs(n: number) {
  const value = Number(n) || 0;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 10_000_000) return `${sign}Rs ${(abs / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000) return `${sign}Rs ${(abs / 100_000).toFixed(2)} Lac`;
  return formatRs(value);
}

function movementLabel(type: string) {
  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type QuickAction = {
  label: string;
  description: string;
  tab: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
  roles?: string[];
};

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Stock In", description: "Receive purchases", tab: "purchases", icon: ShoppingBag, tone: "bg-emerald-50 text-emerald-600", roles: ["SUPER_ADMIN", "ADMIN", "PURCHASE_MANAGER"] },
  { label: "Transfers", description: "Move between branches", tab: "transfers", icon: Truck, tone: "bg-blue-50 text-blue-600" },
  { label: "Stock Out", description: "Damage, loss, return", tab: "stock-out", icon: PackageMinus, tone: "bg-rose-50 text-rose-600", roles: ["SUPER_ADMIN", "ADMIN"] },
  { label: "Adjustments", description: "Correct stock levels", tab: "stock-adjustment", icon: ClipboardList, tone: "bg-amber-50 text-amber-600" },
  { label: "By Location", description: "Stock per branch", tab: "stock-view", icon: Warehouse, tone: "bg-violet-50 text-violet-600" },
  { label: "Stock Mgmt", description: "Full stock tools", tab: "stock-management", icon: ArrowRightLeft, tone: "bg-slate-100 text-slate-600" },
];

type AttentionTab = "low" | "out" | "dead" | "over" | "transfers";

export function InventoryDashboard({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [stats, setStats] = useState<InventoryDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [attentionTab, setAttentionTab] = useState<AttentionTab>("low");
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const canFilterBranches = userRole ? BRANCH_FILTER_ROLES.has(userRole) : false;

  const visibleActions = useMemo(
    () => QUICK_ACTIONS.filter((a) => !a.roles || (userRole ? a.roles.includes(userRole) : false)),
    [userRole],
  );

  const loadStats = useCallback(
    async (branchId?: string, soft = false) => {
      if (soft) setRefreshing(true);
      else setLoading(true);
      try {
        const data = await fetchInventoryDashboard(branchId || undefined);
        setStats(data);
        setUpdatedAt(new Date());
      } catch (e: any) {
        toast({
          title: "Failed to load inventory",
          description: e?.response?.data?.message || "Could not fetch dashboard data",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    const role = localStorage.getItem("role");
    setUserRole(role);

    let initialBranchId = "";
    const raw = localStorage.getItem("branch");
    if (raw && raw !== "Not Found") {
      try {
        const obj = JSON.parse(raw);
        initialBranchId = obj.id || raw;
      } catch {
        initialBranchId = raw;
      }
    }

    if (role === "BRANCH_MANAGER" && initialBranchId) {
      setSelectedBranchId(initialBranchId);
      loadStats(initialBranchId);
    } else {
      setSelectedBranchId("");
      loadStats();
    }

    fetchBranchesForFilter()
      .then(setBranches)
      .catch(() => setBranches([]));
  }, [loadStats]);

  const goTo = (tab: string) => onNavigate?.(tab);

  const onBranchChange = (value: string) => {
    const bid = value === "all" ? "" : value;
    setSelectedBranchId(bid);
    loadStats(bid, true);
  };

  const healthScore = useMemo(() => {
    if (!stats || stats.totalSkus === 0) return 100;
    const problem = (stats.outOfStockCount || 0) + (stats.negativeStockCount || 0);
    const score = Math.round(((stats.totalSkus - Math.min(problem, stats.totalSkus)) / stats.totalSkus) * 100);
    return Math.max(0, Math.min(100, score));
  }, [stats]);

  const categoryChartData = useMemo(() => {
    if (!stats?.categorySummary?.length) return [];
    const top = stats.categorySummary.slice(0, 7).map((c) => ({
      name: c.name,
      value: Math.max(0, Number(c.value) || 0),
      items: c.items,
      quantity: c.quantity ?? 0,
      retail: c.retail ?? 0,
    }));
    const rest = stats.categorySummary.slice(7);
    if (rest.length) {
      top.push({
        name: `Other (${rest.length})`,
        value: rest.reduce((s, c) => s + Math.max(0, Number(c.value) || 0), 0),
        items: rest.reduce((s, c) => s + c.items, 0),
        quantity: rest.reduce((s, c) => s + (c.quantity ?? 0), 0),
        retail: rest.reduce((s, c) => s + (c.retail ?? 0), 0),
      });
    }
    return top;
  }, [stats]);
  const categoryTotal = categoryChartData.reduce((s, c) => s + c.value, 0);

  const trendData = useMemo(
    () =>
      (stats?.insights.dailyTrend || []).map((d) => ({
        ...d,
        label: format(new Date(`${d.date}T00:00:00`), "dd MMM"),
      })),
    [stats],
  );

  const movementData = useMemo(() => {
    if (!stats?.movementTrend?.length) return [];
    return [...stats.movementTrend]
      .map((m) => ({
        type: m.movement_type,
        name: movementLabel(m.movement_type),
        count: Number(m.count ?? m._count ?? 0),
        quantity: Number(m.quantity ?? 0),
      }))
      .sort((a, b) => b.count - a.count);
  }, [stats]);
  const movementMax = Math.max(1, ...movementData.map((m) => m.count));

  const absTotalValue = useMemo(
    () => (stats?.branchSummary || []).reduce((sum, b) => sum + Math.abs(Number(b.value) || 0), 0),
    [stats],
  );

  const exportExcel = async () => {
    if (!stats) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const add = (name: string, rows: (string | number | null)[][]) =>
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
      const i = stats.insights;
      add("Summary", [
        ["Metric", "Value"],
        ["Scope", selectedBranchName],
        ["Generated", format(new Date(), "dd MMM yyyy HH:mm")],
        ["Stock value (cost)", stats.positiveInventoryValue],
        ["Retail value", i.retailValue],
        ["Potential profit", i.potentialProfit],
        ["Margin %", i.marginPct],
        ["Units on hand", stats.totalStockQuantity],
        ["Reserved units", i.reservedQuantity],
        ["Active SKUs", stats.totalSkus],
        ["Out of stock (locations)", stats.outOfStockCount],
        ["Low stock (locations)", stats.lowStockCount],
        ["Negative stock (locations)", stats.negativeStockCount],
        ["Dead stock (30d, locations)", i.deadStockCount],
        ["Dead stock value", i.deadStockValue],
        ["Overstock (locations)", i.overstockCount],
        ["Pending transfers", stats.pendingTransferCount],
        ["Units in (7d)", i.movementSummary.stockIn7],
        ["Units out (7d)", i.movementSummary.stockOut7],
        ["Units sold (7d)", i.movementSummary.sold7],
        ["Units sold (30d)", i.movementSummary.sold30],
      ]);
      add("Low stock", [
        ["Product", "SKU", "Branch", "On hand", "Min", "Sold 30d", "Days of cover", "Suggested reorder"],
        ...stats.lowStockAlerts.map((a) => [
          a.product?.name || "",
          a.product?.sku || a.product?.code || "",
          a.branch?.name || "",
          a.currentQuantity,
          a.minThreshold,
          a.sold30 ?? 0,
          a.daysOfCover ?? "",
          a.suggestedReorder ?? "",
        ]),
      ]);
      add("Out of stock", [["Product", "SKU", "Branch", "On hand", "Sold 30d"], ...i.outOfStockItems.map((r) => [r.name, r.sku, r.branch.name, r.quantity, r.sold30])]);
      add("Dead stock", [
        ["Product", "SKU", "Branch", "On hand", "Value", "Last sale"],
        ...i.deadStockItems.map((r) => [r.name, r.sku, r.branch.name, r.quantity, r.value, r.lastSaleAt ? format(new Date(r.lastSaleAt), "dd MMM yyyy") : "Never"]),
      ]);
      add("Overstock", [["Product", "SKU", "Branch", "On hand", "Max", "Excess", "Excess value"], ...i.overstockItems.map((r) => [r.name, r.sku, r.branch.name, r.quantity, r.maxQuantity, r.excess, r.excessValue])]);
      add("Top value", [["Product", "SKU", "Category", "Qty", "Cost value", "Retail value"], ...i.topValueItems.map((r) => [r.name, r.sku, r.category, r.quantity, r.value, r.retail])]);
      add("By branch", [
        ["Branch", "SKUs", "Units", "Cost value", "Retail value", "Low", "Out"],
        ...stats.branchSummary.map((b) => [b.name, b.items, b.quantity ?? 0, b.value, b.retail ?? 0, b.lowCount ?? 0, b.outCount ?? 0]),
      ]);
      add("By category", [["Category", "SKUs in stock", "Units", "Cost value", "Retail value"], ...stats.categorySummary.map((c) => [c.name, c.items, c.quantity ?? 0, c.value, c.retail ?? 0])]);
      add("Daily flow", [["Date", "Units in", "Units out", "Units sold"], ...i.dailyTrend.map((d) => [d.date, d.stockIn, d.stockOut, d.sold])]);
      XLSX.writeFile(wb, `inventory-dashboard-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast({ title: "Export ready", description: "Inventory dashboard saved as Excel." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Export failed", description: e?.message || "Try again" });
    } finally {
      setExporting(false);
    }
  };

  const selectedBranchName = selectedBranchId
    ? branches.find((b) => b.id === selectedBranchId)?.name || "Selected branch"
    : "All branches";

  if (loading && !stats) {
    return <PageLoader message="Loading inventory data..." />;
  }

  const ins = stats?.insights;
  const displayValue = stats?.positiveInventoryValue ?? stats?.totalInventoryValue ?? 0;
  const hasNegativeStock = (stats?.negativeStockCount ?? 0) > 0;
  const healthTone = healthScore >= 80 ? "emerald" : healthScore >= 50 ? "amber" : "rose";

  const heroCards = [
    {
      label: "Stock value (cost)",
      value: compactRs(displayValue),
      exact: formatRs(displayValue),
      hint: hasNegativeStock ? `Ledger incl. negatives: ${formatRs(stats?.totalInventoryValue ?? 0)}` : `${formatQty(stats?.totalSkus ?? 0)} active SKUs`,
      icon: Wallet,
      tone: "bg-indigo-50 text-indigo-600",
      accent: "bg-indigo-500",
    },
    {
      label: "Retail value",
      value: compactRs(ins?.retailValue ?? 0),
      exact: formatRs(ins?.retailValue ?? 0),
      hint: `Potential profit ${compactRs(ins?.potentialProfit ?? 0)} · ${(ins?.marginPct ?? 0).toFixed(1)}% margin`,
      icon: PiggyBank,
      tone: "bg-emerald-50 text-emerald-600",
      accent: "bg-emerald-500",
    },
    {
      label: "Units on hand",
      value: formatQty(stats?.totalStockQuantity ?? 0),
      exact: undefined,
      hint: `${formatQty(ins?.reservedQuantity ?? 0)} reserved · ${stats?.totalLocations ?? 0} location${(stats?.totalLocations ?? 0) === 1 ? "" : "s"}`,
      icon: Boxes,
      tone: "bg-sky-50 text-sky-600",
      accent: "bg-sky-500",
    },
    {
      label: "Stock health",
      value: `${healthScore}%`,
      exact: undefined,
      hint: `${formatQty(stats?.outOfStockCount ?? 0)} out · ${formatQty(stats?.negativeStockCount ?? 0)} negative`,
      icon: Activity,
      tone: healthTone === "emerald" ? "bg-emerald-50 text-emerald-600" : healthTone === "amber" ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600",
      accent: healthTone === "emerald" ? "bg-emerald-500" : healthTone === "amber" ? "bg-amber-500" : "bg-rose-500",
      progress: healthScore,
    },
  ];

  const alertTiles: Array<{
    key: AttentionTab | "negative";
    label: string;
    value: string;
    hint: string;
    icon: ComponentType<{ className?: string }>;
    active: boolean;
    tone: "rose" | "amber" | "slate" | "violet" | "blue";
    onClick: () => void;
  }> = [
    {
      key: "out",
      label: "Out of stock",
      value: formatQty(stats?.outOfStockCount ?? 0),
      hint: "Locations at zero",
      icon: PackageX,
      active: (stats?.outOfStockCount ?? 0) > 0,
      tone: "rose",
      onClick: () => setAttentionTab("out"),
    },
    {
      key: "low",
      label: "Low stock",
      value: formatQty(stats?.lowStockCount ?? 0),
      hint: "At or below minimum",
      icon: AlertTriangle,
      active: (stats?.lowStockCount ?? 0) > 0,
      tone: "amber",
      onClick: () => setAttentionTab("low"),
    },
    {
      key: "negative",
      label: "Negative stock",
      value: formatQty(stats?.negativeStockCount ?? 0),
      hint: "Needs an adjustment",
      icon: MinusCircle,
      active: hasNegativeStock,
      tone: "rose",
      onClick: () => goTo("stock-adjustment"),
    },
    {
      key: "dead",
      label: "Dead stock",
      value: formatQty(ins?.deadStockCount ?? 0),
      hint: `${compactRs(ins?.deadStockValue ?? 0)} · no sale 30d`,
      icon: Moon,
      active: (ins?.deadStockCount ?? 0) > 0,
      tone: "slate",
      onClick: () => setAttentionTab("dead"),
    },
    {
      key: "over",
      label: "Overstock",
      value: formatQty(ins?.overstockCount ?? 0),
      hint: "Above maximum level",
      icon: Layers,
      active: (ins?.overstockCount ?? 0) > 0,
      tone: "violet",
      onClick: () => setAttentionTab("over"),
    },
    {
      key: "transfers",
      label: "Pending transfers",
      value: formatQty(stats?.pendingTransferCount ?? 0),
      hint: "Pending or dispatched",
      icon: Truck,
      active: (stats?.pendingTransferCount ?? 0) > 0,
      tone: "blue",
      onClick: () => setAttentionTab("transfers"),
    },
  ];

  const toneMap = {
    rose: { box: "border-rose-200 bg-rose-50/60", icon: "bg-rose-100 text-rose-600", value: "text-rose-700" },
    amber: { box: "border-amber-200 bg-amber-50/60", icon: "bg-amber-100 text-amber-600", value: "text-amber-700" },
    slate: { box: "border-slate-300 bg-slate-50", icon: "bg-slate-200 text-slate-600", value: "text-slate-800" },
    violet: { box: "border-violet-200 bg-violet-50/60", icon: "bg-violet-100 text-violet-600", value: "text-violet-700" },
    blue: { box: "border-blue-200 bg-blue-50/60", icon: "bg-blue-100 text-blue-600", value: "text-blue-700" },
  } as const;

  const attentionTabs: { id: AttentionTab; label: string; count: number }[] = [
    { id: "low", label: "Low stock", count: stats?.lowStockCount ?? 0 },
    { id: "out", label: "Out of stock", count: stats?.outOfStockCount ?? 0 },
    { id: "dead", label: "Dead stock", count: ins?.deadStockCount ?? 0 },
    { id: "over", label: "Overstock", count: ins?.overstockCount ?? 0 },
    { id: "transfers", label: "Transfers", count: stats?.pendingTransferCount ?? 0 },
  ];

  const th = "px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap";
  const td = "px-4 py-3 text-sm";

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <Warehouse className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">Inventory Dashboard</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {selectedBranchName}
              </span>
              {updatedAt ? (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Updated {format(updatedAt, "hh:mm a")}
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="h-9 bg-white shadow-sm"
            onClick={() => loadStats(selectedBranchId, true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button className="h-9 shadow-sm" onClick={exportExcel} disabled={!stats || exporting}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export Excel
          </Button>
        </div>
      </div>

      {/* Hero KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 md:gap-4">
        {heroCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className={cn("absolute inset-x-0 top-0 h-1", card.accent)} aria-hidden />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{card.label}</p>
                  {refreshing ? (
                    <Skeleton className="mt-2 h-8 w-32" />
                  ) : (
                    <p className="mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums text-slate-900" title={card.exact}>
                      {card.value}
                    </p>
                  )}
                  <p className="mt-1 truncate text-xs text-slate-500" title={card.hint}>
                    {card.hint}
                  </p>
                </div>
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", card.tone)}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              {"progress" in card && card.progress != null ? (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={cn("h-full rounded-full", card.accent)} style={{ width: `${card.progress}%` }} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Alert tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {alertTiles.map((tile) => {
          const Icon = tile.icon;
          const t = toneMap[tile.tone];
          return (
            <button
              key={tile.key}
              type="button"
              onClick={tile.onClick}
              className={cn(
                "group min-w-0 rounded-xl border p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30",
                tile.active ? t.box : "border-slate-200 bg-white",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-md", tile.active ? t.icon : "bg-slate-100 text-slate-400")}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-300 transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-2.5 truncate text-xs font-medium text-slate-600">{tile.label}</p>
              {refreshing ? (
                <Skeleton className="mt-1 h-6 w-12" />
              ) : (
                <p className={cn("text-xl font-semibold tabular-nums", tile.active ? t.value : "text-slate-400")}>{tile.value}</p>
              )}
              <p className="truncate text-[11px] text-slate-500">{tile.hint}</p>
            </button>
          );
        })}
      </div>

      {/* Filters + quick actions */}
      <Card className="overflow-hidden rounded-xl border-indigo-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">View & actions</p>
              <p className="truncate text-xs text-slate-500">Pick a location, or jump straight to a stock operation</p>
            </div>
          </div>
          {refreshing ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating…
            </span>
          ) : null}
        </div>
        <div className="grid gap-4 border-t border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-indigo-50/30 px-4 py-4 sm:px-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-end">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-indigo-900/80">Location</Label>
            {canFilterBranches ? (
              <Select value={selectedBranchId || "all"} disabled={refreshing} onValueChange={onBranchChange}>
                <SelectTrigger className="h-10 border-indigo-200/80 bg-white shadow-sm">
                  <SelectValue placeholder="All branches" />
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
            ) : (
              <div className="flex h-10 items-center gap-2 rounded-md border border-indigo-200/80 bg-white px-3 text-sm text-slate-700 shadow-sm">
                <MapPin className="h-4 w-4 text-indigo-500" />
                <span className="truncate">{selectedBranchName}</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {visibleActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.tab}
                  type="button"
                  onClick={() => goTo(action.tab)}
                  className="group flex items-center gap-2.5 rounded-lg border border-indigo-100 bg-white px-3 py-2.5 text-left shadow-sm transition-all hover:border-indigo-300 hover:shadow"
                >
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", action.tone)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">{action.label}</span>
                    <span className="block truncate text-[11px] text-slate-500">{action.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Stock flow */}
      <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
        <PanelHeader icon={<Activity className="h-4 w-4" />} title="Stock flow" description="Units in and out per day, last 14 days" />
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="h-[280px] p-4">
            {refreshing ? (
              <Skeleton className="h-full w-full" />
            ) : trendData.every((d) => !d.stockIn && !d.stockOut) ? (
              <EmptyBlock icon={Activity} message="No stock movement in the last 14 days" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#64748b" }} interval="preserveStartEnd" />
                  <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#64748b" }} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "#f8fafc" }}
                    formatter={(value: number, name: string) => [formatQty(value), name]}
                    contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="stockIn" name="Units in" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="stockOut" name="Units out" fill="#e11d48" radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 border-t border-slate-100 lg:grid-cols-1 lg:divide-x-0 lg:border-l lg:border-t-0">
            <FlowStat icon={ArrowDownToLine} tone="text-emerald-600" label="Units in · 7 days" value={formatQty(ins?.movementSummary.stockIn7 ?? 0)} />
            <FlowStat icon={ArrowUpFromLine} tone="text-rose-600" label="Units out · 7 days" value={formatQty(ins?.movementSummary.stockOut7 ?? 0)} />
            <FlowStat icon={Flame} tone="text-amber-600" label="Units sold · 7 days" value={formatQty(ins?.movementSummary.sold7 ?? 0)} />
            <FlowStat icon={TrendingUp} tone="text-indigo-600" label="Units sold · 30 days" value={formatQty(ins?.movementSummary.sold30 ?? 0)} />
          </div>
        </div>
      </Card>

      {/* Needs attention */}
      <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
        <div className="border-b border-slate-100 px-5 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight text-slate-900">Needs attention</h2>
                <p className="truncate text-xs text-slate-500">What to reorder, clear, rebalance or receive</p>
              </div>
            </div>
          </div>
          <div className="-mb-px mt-3 flex gap-1 overflow-x-auto scrollbar-none">
            {attentionTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAttentionTab(tab.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors",
                  attentionTab === tab.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800",
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[11px] tabular-nums",
                    attentionTab === tab.id ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {formatQty(tab.count)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="relative max-h-[440px] min-h-[200px] overflow-auto">
          {refreshing ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : attentionTab === "low" ? (
            stats?.lowStockAlerts?.length ? (
              <table className="w-full">
                <thead className="sticky top-0 z-[1] bg-slate-50">
                  <tr>
                    <th className={th}>Product</th>
                    <th className={th}>Location</th>
                    <th className={cn(th, "text-right")}>On hand</th>
                    <th className={cn(th, "w-40")}>Level</th>
                    <th className={cn(th, "text-right")}>Sold 30d</th>
                    <th className={cn(th, "text-right")}>Cover</th>
                    <th className={cn(th, "text-right")}>Reorder</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.lowStockAlerts.map((a, i) => {
                    const qty = Number(a.currentQuantity) || 0;
                    const min = Number(a.minThreshold) || 0;
                    const critical = qty <= 0;
                    const pct = min > 0 ? Math.max(0, Math.min(100, (Math.max(qty, 0) / min) * 100)) : 0;
                    return (
                      <tr key={`${a.product?.id}-${a.branch?.id}-${i}`} className="hover:bg-slate-50/70">
                        <td className={td}>
                          <p className="max-w-[260px] truncate font-medium text-slate-900">{a.product?.name}</p>
                          <p className="font-mono text-[11px] text-slate-400">{a.product?.sku || a.product?.code || "—"}</p>
                        </td>
                        <td className={cn(td, "text-slate-600")}>{a.branch?.name}</td>
                        <td className={cn(td, "text-right font-semibold tabular-nums", critical ? "text-rose-600" : "text-amber-600")}>
                          {formatQty(qty)}
                        </td>
                        <td className={td}>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div className={cn("h-full rounded-full", critical ? "bg-rose-500" : "bg-amber-400")} style={{ width: `${critical ? 4 : pct}%` }} />
                          </div>
                          <p className="mt-1 text-[10px] text-slate-400">min {formatQty(min)}</p>
                        </td>
                        <td className={cn(td, "text-right tabular-nums text-slate-600")}>{formatQty(a.sold30 ?? 0)}</td>
                        <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>
                          {a.daysOfCover == null ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <span className={cn(a.daysOfCover < 7 ? "font-semibold text-rose-600" : "text-slate-600")}>{a.daysOfCover} d</span>
                          )}
                        </td>
                        <td className={cn(td, "text-right")}>
                          {a.suggestedReorder ? (
                            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                              +{formatQty(a.suggestedReorder)}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <HealthyBlock title="All levels healthy" message="No product is at or below its minimum." />
            )
          ) : attentionTab === "out" ? (
            ins?.outOfStockItems.length ? (
              <table className="w-full">
                <thead className="sticky top-0 z-[1] bg-slate-50">
                  <tr>
                    <th className={th}>Product</th>
                    <th className={th}>Location</th>
                    <th className={cn(th, "text-right")}>On hand</th>
                    <th className={cn(th, "text-right")}>Sold 30d</th>
                    <th className={cn(th, "text-right")}>Priority</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ins.outOfStockItems.map((r, i) => (
                    <tr key={`${r.productId}-${r.branch.id}-${i}`} className="hover:bg-slate-50/70">
                      <td className={td}>
                        <p className="max-w-[300px] truncate font-medium text-slate-900">{r.name}</p>
                        <p className="font-mono text-[11px] text-slate-400">{r.sku || "—"}</p>
                      </td>
                      <td className={cn(td, "text-slate-600")}>{r.branch.name}</td>
                      <td className={cn(td, "text-right font-semibold tabular-nums text-rose-600")}>{formatQty(r.quantity)}</td>
                      <td className={cn(td, "text-right tabular-nums text-slate-600")}>{formatQty(r.sold30)}</td>
                      <td className={cn(td, "text-right")}>
                        <Pill tone={r.sold30 > 0 ? "bg-rose-50 text-rose-700 ring-rose-600/20" : "bg-slate-100 text-slate-600 ring-slate-500/20"}>
                          {r.sold30 > 0 ? "Selling — restock" : "Low demand"}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <HealthyBlock title="Nothing out of stock" message="Every location has stock of every item." />
            )
          ) : attentionTab === "dead" ? (
            ins?.deadStockItems.length ? (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 text-xs text-slate-600">
                  <span>
                    <strong className="tabular-nums text-slate-900">{formatQty(ins.deadStockCount)}</strong> locations with stock but no sale in 30 days
                  </span>
                  <span>
                    Tied-up value <strong className="tabular-nums text-slate-900">{formatRs(ins.deadStockValue)}</strong>
                  </span>
                  <span className="text-slate-400">Showing the 10 highest value</span>
                </div>
                <table className="w-full">
                  <thead className="sticky top-0 z-[1] bg-slate-50">
                    <tr>
                      <th className={th}>Product</th>
                      <th className={th}>Location</th>
                      <th className={cn(th, "text-right")}>On hand</th>
                      <th className={cn(th, "text-right")}>Value</th>
                      <th className={cn(th, "text-right")}>Last sale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ins.deadStockItems.map((r, i) => (
                      <tr key={`${r.productId}-${r.branch.id}-${i}`} className="hover:bg-slate-50/70">
                        <td className={td}>
                          <p className="max-w-[300px] truncate font-medium text-slate-900">{r.name}</p>
                          <p className="font-mono text-[11px] text-slate-400">{r.sku || "—"}</p>
                        </td>
                        <td className={cn(td, "text-slate-600")}>{r.branch.name}</td>
                        <td className={cn(td, "text-right tabular-nums")}>{formatQty(r.quantity)}</td>
                        <td className={cn(td, "whitespace-nowrap text-right font-semibold tabular-nums text-slate-900")}>{formatRs(r.value)}</td>
                        <td className={cn(td, "whitespace-nowrap text-right text-slate-500")}>
                          {r.lastSaleAt ? format(new Date(r.lastSaleAt), "dd MMM yyyy") : <span className="text-slate-400">Never sold</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <HealthyBlock title="No dead stock" message="Everything in stock has sold in the last 30 days." />
            )
          ) : attentionTab === "over" ? (
            ins?.overstockItems.length ? (
              <table className="w-full">
                <thead className="sticky top-0 z-[1] bg-slate-50">
                  <tr>
                    <th className={th}>Product</th>
                    <th className={th}>Location</th>
                    <th className={cn(th, "text-right")}>On hand</th>
                    <th className={cn(th, "text-right")}>Max</th>
                    <th className={cn(th, "text-right")}>Excess</th>
                    <th className={cn(th, "text-right")}>Excess value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ins.overstockItems.map((r, i) => (
                    <tr key={`${r.productId}-${r.branch.id}-${i}`} className="hover:bg-slate-50/70">
                      <td className={td}>
                        <p className="max-w-[300px] truncate font-medium text-slate-900">{r.name}</p>
                        <p className="font-mono text-[11px] text-slate-400">{r.sku || "—"}</p>
                      </td>
                      <td className={cn(td, "text-slate-600")}>{r.branch.name}</td>
                      <td className={cn(td, "text-right tabular-nums")}>{formatQty(r.quantity)}</td>
                      <td className={cn(td, "text-right tabular-nums text-slate-500")}>{formatQty(r.maxQuantity)}</td>
                      <td className={cn(td, "text-right font-semibold tabular-nums text-violet-700")}>+{formatQty(r.excess)}</td>
                      <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{formatRs(r.excessValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <HealthyBlock title="No overstock" message="Nothing is above its maximum level (only items with a max set are checked)." />
            )
          ) : stats?.pendingTransfers?.length ? (
            <table className="w-full">
              <thead className="sticky top-0 z-[1] bg-slate-50">
                <tr>
                  <th className={th}>Product</th>
                  <th className={th}>Route</th>
                  <th className={cn(th, "text-right")}>Qty</th>
                  <th className={th}>Date</th>
                  <th className={cn(th, "text-right")}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.pendingTransfers.map((t) => (
                  <tr key={t.id} className="cursor-pointer hover:bg-slate-50/70" onClick={() => goTo("transfers")}>
                    <td className={cn(td, "font-medium text-slate-900")}>
                      <p className="max-w-[260px] truncate">{t.product?.name}</p>
                    </td>
                    <td className={td}>
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        <span className="max-w-[120px] truncate">{t.from_branch?.name}</span>
                        <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                        <span className="max-w-[120px] truncate font-medium text-slate-800">{t.to_branch?.name}</span>
                      </span>
                    </td>
                    <td className={cn(td, "text-right font-semibold tabular-nums")}>{formatQty(t.quantity)}</td>
                    <td className={cn(td, "whitespace-nowrap text-slate-500")}>
                      {t.transferDate ? format(new Date(t.transferDate), "dd MMM yyyy") : "—"}
                    </td>
                    <td className={cn(td, "text-right")}>
                      <Pill tone={t.status === "DISPATCHED" ? "bg-blue-50 text-blue-700 ring-blue-600/20" : "bg-amber-50 text-amber-700 ring-amber-600/20"}>
                        {t.status}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <HealthyBlock title="No transfers in progress" message="Pending and dispatched moves appear here." icon={Truck} />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3">
          <p className="text-xs text-slate-500">
            {attentionTab === "transfers" && (stats?.pendingTransferCount ?? 0) > (stats?.pendingTransfers.length ?? 0)
              ? `Showing the latest ${stats?.pendingTransfers.length} of ${stats?.pendingTransferCount}`
              : attentionTab === "low" && (stats?.lowStockCount ?? 0) > (stats?.lowStockAlerts.length ?? 0)
                ? `Showing the ${stats?.lowStockAlerts.length} most urgent of ${stats?.lowStockCount}`
                : "Cover = days of stock left at the last 30 days' sales rate."}
          </p>
          <Button variant="outline" size="sm" className="h-8 bg-white" onClick={() => goTo(attentionTab === "transfers" ? "transfers" : "stock-view")}>
            {attentionTab === "transfers" ? "Manage transfers" : "Open stock by location"}
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </Card>

      {/* Sellers + categories */}
      <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
          <PanelHeader icon={<Flame className="h-4 w-4" />} title="Top sellers" description="Most units sold in the last 7 days, with stock cover" />
          {refreshing ? (
            <ListSkeleton />
          ) : stats?.velocity?.length ? (
            <ul className="divide-y divide-slate-100">
              {stats.velocity.map((v, i) => {
                const max = Math.max(1, ...stats.velocity.map((x) => x.quantity));
                const cover = v.daysOfCover;
                return (
                  <li key={v.productId || v.name} className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums",
                          i === 0 ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200" : "bg-slate-100 text-slate-600",
                        )}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-medium text-slate-900">{v.name}</p>
                          <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{formatQty(v.quantity)} sold</p>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(v.quantity / max) * 100}%` }} />
                        </div>
                        <p className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
                          <span className="font-mono">{v.sku || "—"}</span>
                          <span>· {formatQty(v.onHand ?? 0)} on hand</span>
                          {cover != null ? (
                            <span className={cn(cover < 7 ? "font-semibold text-rose-600" : cover < 14 ? "text-amber-600" : "text-emerald-600")}>
                              · {cover} days cover
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyBlock icon={Flame} message="No sales in the last 7 days" />
          )}
        </Card>

        <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
          <PanelHeader icon={<Layers className="h-4 w-4" />} title="Value by category" description="Cost value of stock on hand, with retail value" />
          {refreshing ? (
            <ListSkeleton />
          ) : categoryChartData.length === 0 ? (
            <EmptyBlock icon={Layers} message="No positive stock value by category" />
          ) : (
            <div className="grid gap-2 p-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
              <div className="relative mx-auto h-[180px] w-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryChartData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={84} paddingAngle={2} stroke="none">
                      {categoryChartData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatRs(value)} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">Total</span>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">{compactRs(categoryTotal)}</span>
                </div>
              </div>
              <ul className="min-w-0 space-y-2">
                {categoryChartData.map((c, i) => {
                  const share = categoryTotal ? (c.value / categoryTotal) * 100 : 0;
                  return (
                    <li key={c.name} className="flex items-center gap-2.5 text-sm">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="min-w-0 flex-1 truncate text-slate-700">{c.name}</span>
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-400">{share.toFixed(0)}%</span>
                      <span className="w-24 shrink-0 text-right font-medium tabular-nums text-slate-900" title={`Retail ${formatRs(c.retail)} · ${formatQty(c.quantity)} units`}>
                        {compactRs(c.value)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {/* Top value + locations */}
      <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
          <PanelHeader icon={<Wallet className="h-4 w-4" />} title="Highest value items" description="Where most of your money is sitting" />
          {refreshing ? (
            <ListSkeleton />
          ) : ins?.topValueItems.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={th}>Product</th>
                    <th className={cn(th, "text-right")}>Qty</th>
                    <th className={cn(th, "text-right")}>Cost value</th>
                    <th className={cn(th, "text-right")}>Retail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ins.topValueItems.map((r) => (
                    <tr key={r.productId} className="hover:bg-slate-50/70">
                      <td className={td}>
                        <p className="max-w-[240px] truncate font-medium text-slate-900">{r.name}</p>
                        <p className="text-[11px] text-slate-400">
                          <span className="font-mono">{r.sku || "—"}</span> · {r.category}
                        </p>
                      </td>
                      <td className={cn(td, "text-right tabular-nums text-slate-600")}>{formatQty(r.quantity)}</td>
                      <td className={cn(td, "whitespace-nowrap text-right font-semibold tabular-nums text-slate-900")}>{formatRs(r.value)}</td>
                      <td className={cn(td, "whitespace-nowrap text-right tabular-nums text-emerald-700")}>{formatRs(r.retail)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyBlock icon={Wallet} message="No stock value yet" />
          )}
        </Card>

        <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
          <PanelHeader icon={<MapPin className="h-4 w-4" />} title="Locations" description="Value, units and problems per branch" />
          {refreshing ? (
            <ListSkeleton />
          ) : stats?.branchSummary?.length ? (
            <ul className="divide-y divide-slate-100">
              {stats.branchSummary.map((b) => {
                const share = absTotalValue ? (Math.abs(b.value) / absTotalValue) * 100 : 0;
                return (
                  <li key={b.branchId} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-900">
                          {b.type === "WAREHOUSE" ? <Warehouse className="h-3.5 w-3.5 text-slate-400" /> : <MapPin className="h-3.5 w-3.5 text-slate-400" />}
                          {b.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {formatQty(b.items)} SKUs · {formatQty(b.quantity ?? 0)} units · retail {compactRs(b.retail ?? 0)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn("text-sm font-semibold tabular-nums", b.value < 0 ? "text-rose-600" : "text-slate-900")}>{compactRs(b.value)}</p>
                        <p className="text-[11px] tabular-nums text-slate-400">{share.toFixed(1)}%</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${share}%` }} />
                      </div>
                      {(b.lowCount ?? 0) > 0 ? <Pill tone="bg-amber-50 text-amber-700 ring-amber-600/20">{b.lowCount} low</Pill> : null}
                      {(b.outCount ?? 0) > 0 ? <Pill tone="bg-rose-50 text-rose-700 ring-rose-600/20">{b.outCount} out</Pill> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyBlock icon={MapPin} message="No location stock data" />
          )}
        </Card>
      </div>

      {/* Purchases + movement types */}
      <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
          <PanelHeader
            icon={<ShoppingBag className="h-4 w-4" />}
            title="Purchases this month"
            description={`${formatQty(stats?.procurementHealth?.count || 0)} purchase records`}
            action={
              <span className="text-base font-semibold tabular-nums text-slate-900">{formatRs(stats?.procurementHealth?.totalValue || 0)}</span>
            }
          />
          {refreshing ? (
            <ListSkeleton />
          ) : stats?.recentPurchases?.length ? (
            <ul className="divide-y divide-slate-100">
              {stats.recentPurchases.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{p.product?.name || "Product"}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {p.supplier?.name || "No supplier"}
                      {p.purchaseDate ? ` · ${format(new Date(p.purchaseDate), "dd MMM")}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-slate-900">{formatQty(p.quantity)} units</p>
                    <p className="text-[11px] tabular-nums text-slate-500">@ {formatRs(p.costPrice)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyBlock icon={ShoppingBag} message="No purchases received this month" />
          )}
          {(!userRole || ["SUPER_ADMIN", "ADMIN", "PURCHASE_MANAGER"].includes(userRole)) && (
            <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-3">
              <Button size="sm" className="h-8" onClick={() => goTo("purchases")}>
                Open Stock In
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
          <PanelHeader icon={<ClipboardList className="h-4 w-4" />} title="Movement activity" description="Stock movements by type, last 7 days" />
          {refreshing ? (
            <ListSkeleton />
          ) : movementData.length ? (
            <ul className="divide-y divide-slate-100">
              {movementData.map((m) => {
                const inbound = ["PURCHASE", "TRANSFER_IN", "RETURN"].includes(m.type);
                const outbound = ["SALE", "TRANSFER_OUT", "DAMAGE", "EXPIRED", "LOSS", "PURCHASE_RETURN"].includes(m.type);
                return (
                  <li key={m.type} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        <span className={cn("h-2 w-2 rounded-full", inbound ? "bg-emerald-500" : outbound ? "bg-rose-500" : "bg-slate-400")} />
                        {m.name}
                      </p>
                      <p className="text-xs tabular-nums text-slate-500">
                        <span className="font-semibold text-slate-900">{formatQty(m.count)}</span> entries · {formatQty(m.quantity)} units
                      </p>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn("h-full rounded-full", inbound ? "bg-emerald-500" : outbound ? "bg-rose-400" : "bg-slate-400")}
                        style={{ width: `${(m.count / movementMax) * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyBlock icon={ClipboardList} message="No stock movements in the last 7 days" />
          )}
        </Card>
      </div>
    </div>
  );
}

function PanelHeader({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
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

function FlowStat({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  tone: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <Icon className={cn("h-5 w-5 shrink-0", tone)} />
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
        <p className="text-lg font-semibold tabular-nums text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", tone)}>
      {children}
    </span>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4 p-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-7 w-7 rounded-lg" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function EmptyBlock({ icon: Icon = Inbox, message }: { icon?: ComponentType<{ className?: string }>; message: string }) {
  return (
    <div className="flex h-full min-h-[160px] flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-slate-600">{message}</p>
    </div>
  );
}

function HealthyBlock({
  title,
  message,
  icon: Icon = CheckCircle2,
}: {
  title: string;
  message: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-slate-500">{message}</p>
    </div>
  );
}
