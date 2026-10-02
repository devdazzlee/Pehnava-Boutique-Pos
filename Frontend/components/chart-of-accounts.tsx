"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { format } from "date-fns";
import {
  ArrowUpRight,
  BookOpenText,
  Building2,
  CalendarRange,
  ChevronDown,
  FileSpreadsheet,
  FolderPlus,
  Landmark,
  Layers,
  ListTree,
  Loader2,
  NotebookPen,
  PieChart,
  Plus,
  Receipt,
  RefreshCw,
  Scale,
  TrendingDown,
  TrendingUp,
  Truck,
  UserPlus,
  Wallet,
  Wallet2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { YmdDatePicker } from "@/components/ui/date-picker";
import { AccountsSkeleton, Bone } from "@/components/accounts/coa-ui";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { normalizeUserRole } from "@/lib/role-utils";
import { ALL_DATES_FROM, rangeForPreset, type DatePreset } from "@/lib/business-timezone";
import { CoaExplorer } from "@/components/accounts/coa-explorer";
import { CoaTreeView } from "@/components/accounts/coa-tree";
import { CoaLedger } from "@/components/accounts/coa-ledger";
import { CoaBreakdown } from "@/components/accounts/coa-breakdown";
import { CoaVouchers } from "@/components/accounts/coa-vouchers";
import { CoaTrialBalance } from "@/components/accounts/coa-trial-balance";
import {
  apiError,
  coaApi,
  flattenAccounts,
  money,
  type CoaFilters,
  type CoaTree,
} from "@/components/accounts/coa-shared";

export type CoaTab = "accounts" | "statement" | "ledger" | "breakdown" | "vouchers" | "trial";
export type CreateRequest = { kind: "sub" | "control" | "account"; n: number } | null;

type Preset = Extract<DatePreset, "today" | "thisMonth" | "lastMonth" | "thisYear" | "all" | "custom">;

const QUICK_PERIODS: { id: Exclude<Preset, "custom">; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "thisYear", label: "This year" },
  { id: "all", label: "All time" },
];

const TABS: { id: CoaTab; label: string; short: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "accounts", label: "Accounts", short: "Accounts", icon: ListTree },
  { id: "statement", label: "Statement", short: "Statement", icon: FileSpreadsheet },
  { id: "ledger", label: "Ledger", short: "Ledger", icon: BookOpenText },
  { id: "breakdown", label: "Expense breakdown", short: "Expenses", icon: PieChart },
  { id: "vouchers", label: "Journal vouchers", short: "Vouchers", icon: NotebookPen },
  { id: "trial", label: "Trial balance", short: "Trial", icon: Scale },
];

/** Screens elsewhere in the POS that post into the chart automatically. */
const SOURCES: { tab: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { tab: "expenses", label: "Expenses", icon: Receipt },
  { tab: "salaries", label: "Salaries", icon: Wallet2 },
  { tab: "commissions", label: "Commissions", icon: TrendingUp },
  { tab: "employees", label: "Employees", icon: UserPlus },
  { tab: "suppliers", label: "Suppliers", icon: Truck },
  { tab: "purchase-orders", label: "Purchase invoices", icon: Landmark },
];

const fmtDay = (ymd: string) => format(new Date(`${ymd}T00:00:00`), "dd MMM yyyy");
const periodText = (from: string, to: string) =>
  from === ALL_DATES_FROM ? `All time to ${fmtDay(to)}` : from === to ? fmtDay(from) : `${fmtDay(from)} – ${fmtDay(to)}`;

export function ChartOfAccounts({
  initialTab = "accounts",
  onNavigate,
}: {
  initialTab?: CoaTab;
  onNavigate?: (tab: string) => void;
}) {
  const { toast } = useToast();
  const initial = rangeForPreset("thisMonth");
  const [tab, setTab] = useState<CoaTab>(initialTab);
  const [preset, setPreset] = useState<Preset>("thisMonth");
  const [filters, setFilters] = useState<CoaFilters>({ from: initial.from, to: initial.to, branchId: "all" });
  const [draft, setDraft] = useState({ from: initial.from, to: initial.to });
  const [customOpen, setCustomOpen] = useState(false);
  const [tree, setTree] = useState<CoaTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [ledgerAccountId, setLedgerAccountId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [createRequest, setCreateRequest] = useState<CreateRequest>(null);
  const [voucherRequest, setVoucherRequest] = useState(0);

  useEffect(() => setTab(initialTab), [initialTab]);
  useEffect(() => setRole(normalizeUserRole(localStorage.getItem("role"))), []);

  const canManage = role === "SUPER_ADMIN" || role === "ADMIN";
  const canApprove = canManage || role === "BRANCH_MANAGER";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Inactive records are always fetched; each tab decides whether to show them.
      setTree(await coaApi.tree(filters, true));
    } catch (error) {
      toast({ variant: "destructive", title: "Could not load chart of accounts", description: apiError(error) });
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const reload = useCallback(() => {
    load();
    setRefreshKey((k) => k + 1);
  }, [load]);

  const pickPeriod = (next: Exclude<Preset, "custom">) => {
    const range = rangeForPreset(next);
    setPreset(next);
    setDraft(range);
    setFilters((f) => ({ ...f, ...range }));
  };

  const applyCustom = () => {
    if (!draft.from || !draft.to || draft.to < draft.from) {
      toast({ variant: "destructive", title: "Pick a valid date range", description: "The end date cannot be before the start date." });
      return;
    }
    setPreset("custom");
    setFilters((f) => ({ ...f, from: draft.from, to: draft.to }));
    setCustomOpen(false);
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await coaApi.sync();
      const created = result.employees + result.suppliers + result.expenseCategories;
      toast({
        title: created ? "Accounts synchronised" : "Everything is already linked",
        description: created
          ? `${result.employees} employee, ${result.suppliers} supplier and ${result.expenseCategories} expense-category account(s) added`
          : "Every employee, supplier and expense category already has an account.",
      });
      reload();
    } catch (error) {
      toast({ variant: "destructive", title: "Sync failed", description: apiError(error) });
    } finally {
      setSyncing(false);
    }
  };

  const openLedger = useCallback((accountId: string) => {
    setLedgerAccountId(accountId);
    setTab("ledger");
  }, []);

  const requestCreate = (kind: "sub" | "control" | "account") => {
    setTab("accounts");
    setCreateRequest({ kind, n: Date.now() });
  };

  const periodLabel = periodText(filters.from, filters.to);
  const branchLabel =
    filters.branchId === "all" ? "All branches" : tree?.branches.find((b) => b.id === filters.branchId)?.name || "Branch";

  const kpis = useMemo(() => {
    if (!tree) return [];
    const accounts = flattenAccounts(tree);
    const byKey = (key: string) => accounts.find((a) => a.system_key === key)?.balance?.closing ?? 0;
    const cash = accounts
      .filter((a) => a.control.code === "111")
      .reduce((s, a) => s + (a.balance?.closing ?? 0), 0);
    const stock = byKey("INVENTORY");
    const cogs = byKey("COGS");
    const s = tree.summary;
    const margin = s.income > 0 ? (s.netProfit / s.income) * 100 : 0;
    return [
      { label: "Assets", value: s.assets, icon: Wallet, accent: "bg-sky-50 text-sky-600", hint: `Cash ${money(cash)} · Stock ${money(stock)}` },
      { label: "Liabilities", value: s.liabilities, icon: Building2, accent: "bg-rose-50 text-rose-600", hint: "Supplier payables & other dues" },
      { label: "Income", value: s.income, icon: TrendingUp, accent: "bg-emerald-50 text-emerald-600", hint: "Sales less discounts & returns" },
      { label: "Expenses", value: s.expenses, icon: TrendingDown, accent: "bg-amber-50 text-amber-700", hint: `incl. cost of goods ${money(cogs)}` },
      {
        label: "Net profit",
        value: s.netProfit,
        icon: Scale,
        accent: s.netProfit >= 0 ? "bg-emerald-600 text-white" : "bg-rose-600 text-white",
        hint: s.income > 0 ? `${margin.toFixed(1)}% net margin` : "No income in this period",
        highlight: true,
      },
    ];
  }, [tree]);

  return (
    <div className="min-h-full bg-[#f8f6f2]">
      {/* ---------- header ---------- */}
      <div className="border-b border-gray-200/70 bg-white">
        <div className="flex flex-col gap-4 px-4 pb-4 pt-5 md:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="hidden h-11 w-11 items-center justify-center rounded-xl bg-[#2a2012] text-[#e9d3a4] shadow-sm sm:flex">
              <ListTree className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a67c2e]">Accounts</p>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Chart of Accounts</h1>
              <p className="text-xs text-gray-500">
                {tree
                  ? `${tree.summary.accountCount} accounts · ${tree.summary.controlCount} control accounts · ${tree.summary.subTypeCount} sub types`
                  : "Loading accounts and balances…"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-9" onClick={reload} disabled={loading}>
              <RefreshCw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
            {canManage ? (
              <Button variant="outline" size="sm" className="h-9" onClick={sync} disabled={syncing} title="Create missing employee, supplier and expense-category accounts">
                {syncing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Layers className="mr-1.5 h-4 w-4" />}
                Sync
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-9 bg-[#2a2012] px-3 hover:bg-[#3b2e1a]">
                  <Plus className="mr-1.5 h-4 w-4" />
                  New
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-gray-400">Post a transaction</DropdownMenuLabel>
                {onNavigate ? (
                  <DropdownMenuItem onClick={() => onNavigate("expenses")}>
                    <Receipt className="mr-2 h-4 w-4 text-amber-600" />
                    <div>
                      <p className="text-sm">Expense</p>
                      <p className="text-[11px] text-gray-500">Utility, office or any bill</p>
                    </div>
                  </DropdownMenuItem>
                ) : null}
                {canManage ? (
                  <DropdownMenuItem
                    onClick={() => {
                      setTab("vouchers");
                      setVoucherRequest(Date.now());
                    }}
                  >
                    <NotebookPen className="mr-2 h-4 w-4 text-violet-600" />
                    <div>
                      <p className="text-sm">Journal voucher</p>
                      <p className="text-[11px] text-gray-500">Capital, bank, assets, loans</p>
                    </div>
                  </DropdownMenuItem>
                ) : null}
                {canManage ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-gray-400">Chart structure</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => requestCreate("account")}>
                      <Plus className="mr-2 h-4 w-4" />Transactional account
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => requestCreate("control")}>
                      <FolderPlus className="mr-2 h-4 w-4" />Control account
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => requestCreate("sub")}>
                      <Layers className="mr-2 h-4 w-4" />Sub type
                    </DropdownMenuItem>
                  </>
                ) : null}
                {onNavigate ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-gray-400">Linked records</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => onNavigate("employees")}>
                      <UserPlus className="mr-2 h-4 w-4" />Employee <span className="ml-auto text-[11px] text-gray-400">522xxxx</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onNavigate("suppliers")}>
                      <Truck className="mr-2 h-4 w-4" />Supplier <span className="ml-auto text-[11px] text-gray-400">211xxxx</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onNavigate("salaries")}>
                      <Wallet2 className="mr-2 h-4 w-4" />Salary payment
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ---------- period & branch toolbar ---------- */}
        <div className="flex flex-col gap-2 border-t border-gray-100 px-4 py-2.5 md:flex-row md:items-center md:px-6">
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
            <CalendarRange className="h-4 w-4 shrink-0 text-gray-400" />
            <div className="flex shrink-0 rounded-lg bg-gray-100 p-0.5">
              {QUICK_PERIODS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickPeriod(p.id)}
                  className={cn(
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    preset === p.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800",
                  )}
                >
                  {p.label}
                </button>
              ))}
              <Popover open={customOpen} onOpenChange={setCustomOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      preset === "custom" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800",
                    )}
                  >
                    Custom
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 space-y-3">
                  <p className="text-sm font-semibold">Custom date range</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1 text-xs text-gray-500">
                      From
                      <YmdDatePicker value={draft.from} onChange={(v) => setDraft((d) => ({ ...d, from: v }))} className="h-9" />
                    </label>
                    <label className="space-y-1 text-xs text-gray-500">
                      To
                      <YmdDatePicker value={draft.to} onChange={(v) => setDraft((d) => ({ ...d, to: v }))} className="h-9" />
                    </label>
                  </div>
                  <Button size="sm" className="w-full bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={applyCustom}>
                    Apply range
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
            <span className="whitespace-nowrap text-xs font-medium text-gray-600">{periodLabel}</span>
            {loading && tree ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#fcf8f2] px-2 py-0.5 text-[11px] font-medium text-[#8a6520] ring-1 ring-[#a67c2e]/20">
                <Loader2 className="h-3 w-3 animate-spin" />Updating…
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 md:ml-auto">
            <Building2 className="h-4 w-4 text-gray-400" />
            <Select value={filters.branchId} onValueChange={(v) => setFilters((f) => ({ ...f, branchId: v }))}>
              <SelectTrigger className="h-8 w-[200px] rounded-lg border-gray-200 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {(tree?.branches || []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-5 px-4 py-5 md:px-6">
        {/* ---------- KPIs ---------- */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {!tree
            ? Array.from({ length: 5 }).map((_, i) => <Bone key={i} className="h-[92px] rounded-xl" />)
            : kpis.map((k) => (
                <div
                  key={k.label}
                  className={cn(
                    "relative overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md",
                    k.highlight ? "col-span-2 border-[#a67c2e]/30 bg-gradient-to-br from-[#fffaf0] to-white lg:col-span-1" : "border-gray-200/80",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{k.label}</p>
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", k.accent)}>
                      <k.icon className="h-4 w-4" />
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-1 text-xl font-bold tabular-nums tracking-tight",
                      k.highlight ? (k.value >= 0 ? "text-emerald-700" : "text-rose-700") : "text-gray-900",
                    )}
                  >
                    {money(k.value)}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-gray-500">{k.hint}</p>
                </div>
              ))}
        </div>

        {/* ---------- tabs ---------- */}
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as CoaTab)}
          className={cn("space-y-4 transition-opacity", loading && tree && "opacity-70")}
        >
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <TabsList className="h-auto w-max gap-1 rounded-xl border border-gray-200/80 bg-white p-1 shadow-sm">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.id}
                  value={t.id}
                  className="group gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-gray-500 transition-all hover:text-gray-900 data-[state=active]:bg-[#2a2012] data-[state=active]:text-white data-[state=active]:shadow-sm"
                >
                  <t.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{t.label}</span>
                  <span className="sm:hidden">{t.short}</span>
                  {t.id === "accounts" && tree ? (
                    <span className="rounded-full bg-black/10 px-1.5 text-[10px] tabular-nums group-data-[state=active]:bg-white/20">
                      {tree.summary.accountCount}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {!tree ? (
            <AccountsSkeleton />
          ) : (
            <>
              <TabsContent value="accounts" className="mt-0 space-y-4">
                <CoaExplorer
                  tree={tree}
                  filters={filters}
                  reload={reload}
                  canManage={canManage}
                  canApprove={canApprove}
                  onOpenLedger={openLedger}
                  createRequest={createRequest}
                />
                {onNavigate ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white/60 px-4 py-3">
                    <span className="mr-1 text-xs font-medium text-gray-500">Posts automatically from</span>
                    {SOURCES.map((s) => (
                      <button
                        key={s.tab}
                        type="button"
                        onClick={() => onNavigate(s.tab)}
                        className="group inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:border-[#a67c2e]/50 hover:text-[#8a6520]"
                      >
                        <s.icon className="h-3.5 w-3.5 text-gray-400 group-hover:text-[#a67c2e]" />
                        {s.label}
                        <ArrowUpRight className="h-3 w-3 text-gray-300 group-hover:text-[#a67c2e]" />
                      </button>
                    ))}
                    <span className="text-xs text-gray-400">· anything else via journal vouchers</span>
                  </div>
                ) : null}
              </TabsContent>
              <TabsContent value="statement" className="mt-0">
                <CoaTreeView tree={tree} periodLabel={periodLabel} branchLabel={branchLabel} onOpenLedger={openLedger} />
              </TabsContent>
              <TabsContent value="ledger" className="mt-0">
                <CoaLedger
                  tree={tree}
                  filters={filters}
                  accountId={ledgerAccountId}
                  onAccountChange={setLedgerAccountId}
                  periodLabel={periodLabel}
                  branchLabel={branchLabel}
                />
              </TabsContent>
              <TabsContent value="breakdown" className="mt-0">
                <CoaBreakdown
                  filters={filters}
                  periodLabel={periodLabel}
                  branchLabel={branchLabel}
                  onOpenLedger={openLedger}
                  refreshKey={refreshKey}
                />
              </TabsContent>
              <TabsContent value="vouchers" className="mt-0">
                <CoaVouchers
                  tree={tree}
                  filters={filters}
                  canManage={canManage}
                  onPosted={reload}
                  onOpenLedger={openLedger}
                  newRequest={voucherRequest}
                />
              </TabsContent>
              <TabsContent value="trial" className="mt-0">
                <CoaTrialBalance
                  filters={filters}
                  periodLabel={periodLabel}
                  branchLabel={branchLabel}
                  refreshKey={refreshKey}
                  onOpenLedger={openLedger}
                />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </div>
  );
}
