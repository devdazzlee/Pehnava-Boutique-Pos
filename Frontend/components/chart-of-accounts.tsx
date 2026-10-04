"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { format } from "date-fns";
import {
  BookOpenText,
  Building2,
  CalendarRange,
  FileBarChart,
  LayoutDashboard,
  Layers,
  ListTree,
  Loader2,
  MoreHorizontal,
  NotebookPen,
  PieChart,
  Plus,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { YmdDatePicker } from "@/components/ui/date-picker";
import { AccountsSkeleton } from "@/components/accounts/coa-ui";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { normalizeUserRole } from "@/lib/role-utils";
import { ALL_DATES_FROM, rangeForPreset, type DatePreset } from "@/lib/business-timezone";
import { CoaColumns } from "@/components/accounts/coa-columns";
import { CoaLedger } from "@/components/accounts/coa-ledger";
import { CoaBreakdown } from "@/components/accounts/coa-breakdown";
import { CoaVouchers } from "@/components/accounts/coa-vouchers";
import { CoaOverview } from "@/components/accounts/coa-overview";
import { CoaProfitLoss } from "@/components/accounts/coa-profit-loss";
import { CoaReports, type ReportView } from "@/components/accounts/coa-reports";
import { QUICK_TEMPLATES, QuickEntryDialog } from "@/components/accounts/coa-quick-entry";
import { apiError, coaApi, flattenAccounts, type CoaFilters, type CoaTree } from "@/components/accounts/coa-shared";

type Tab = "overview" | "pnl" | "accounts" | "expenses" | "adjustments" | "reports";
/** Old tab names (sidebar / links) still work. */
export type CoaTab = Tab | "statement" | "ledger" | "breakdown" | "vouchers" | "trial";
export type CreateRequest = { kind: "sub" | "control" | "account"; n: number } | null;

const TABS: { id: Tab; label: string; icon: ComponentType<{ className?: string }>; help: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, help: "Money, dues and profit at a glance" },
  { id: "pnl", label: "Profit & Loss", icon: TrendingUp, help: "Did the shop make money?" },
  { id: "accounts", label: "Chart of accounts", icon: ListTree, help: "All account heads — add or edit" },
  { id: "expenses", label: "Expenses", icon: PieChart, help: "Where the money went" },
  { id: "adjustments", label: "Adjustments", icon: NotebookPen, help: "Owner money, bank transfers, loans" },
  { id: "reports", label: "Reports", icon: FileBarChart, help: "Balance sheet, ledgers, trial balance" },
];

function normalizeTab(t: CoaTab): { tab: Tab; report?: ReportView } {
  if (t === "vouchers") return { tab: "adjustments" };
  if (t === "breakdown") return { tab: "expenses" };
  if (t === "statement") return { tab: "reports", report: "statement" };
  if (t === "trial") return { tab: "reports", report: "trial" };
  if (t === "ledger") return { tab: "reports", report: "ledger" };
  return { tab: t };
}

type Preset = Extract<DatePreset, "today" | "thisMonth" | "lastMonth" | "thisYear" | "all" | "custom">;
const QUICK_PERIODS: { id: Exclude<Preset, "custom">; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "thisYear", label: "This year" },
  { id: "all", label: "All time" },
];
const fmtDay = (ymd: string) => format(new Date(`${ymd}T00:00:00`), "dd MMM yyyy");
const periodText = (from: string, to: string) => (from === ALL_DATES_FROM ? `All time to ${fmtDay(to)}` : from === to ? fmtDay(from) : `${fmtDay(from)} – ${fmtDay(to)}`);

export function ChartOfAccounts({ initialTab = "overview", onNavigate }: { initialTab?: CoaTab; onNavigate?: (tab: string) => void }) {
  const { toast } = useToast();
  const initial = rangeForPreset("thisMonth");
  const start = normalizeTab(initialTab === "accounts" ? "overview" : initialTab);
  const [tab, setTab] = useState<Tab>(start.tab);
  const [reportView, setReportView] = useState<ReportView>(start.report ?? "balance");
  const [preset, setPreset] = useState<Preset>("thisMonth");
  const [filters, setFilters] = useState<CoaFilters>({ from: initial.from, to: initial.to, branchId: "all" });
  const [draft, setDraft] = useState({ from: initial.from, to: initial.to });
  const [customOpen, setCustomOpen] = useState(false);
  const [tree, setTree] = useState<CoaTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [role, setRole] = useState<string | null>(null);
  const [createRequest, setCreateRequest] = useState<CreateRequest>(null);
  const [voucherRequest, setVoucherRequest] = useState(0);
  const [quick, setQuick] = useState<{ open: boolean; template: string | null }>({ open: false, template: null });
  const [drawerAccount, setDrawerAccount] = useState<string | null>(null);
  const [ledgerAccountId, setLedgerAccountId] = useState<string | null>(null);

  useEffect(() => {
    const n = normalizeTab(initialTab === "accounts" ? "overview" : initialTab);
    setTab(n.tab);
    if (n.report) setReportView(n.report);
  }, [initialTab]);
  useEffect(() => setRole(normalizeUserRole(localStorage.getItem("role"))), []);
  const canManage = role === "SUPER_ADMIN" || role === "ADMIN";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTree(await coaApi.tree(filters, true));
    } catch (error) {
      toast({ variant: "destructive", title: "Could not load accounts", description: apiError(error) });
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
      toast({ variant: "destructive", title: "Pick a valid date range" });
      return;
    }
    setPreset("custom");
    setFilters((f) => ({ ...f, from: draft.from, to: draft.to }));
    setCustomOpen(false);
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await coaApi.sync();
      const created = r.employees + r.suppliers + r.expenseCategories;
      toast({ title: created ? "Accounts added" : "Everything is already linked", description: created ? `${r.employees} staff, ${r.suppliers} supplier and ${r.expenseCategories} expense accounts added` : undefined });
      reload();
    } catch (e) {
      toast({ variant: "destructive", title: "Sync failed", description: apiError(e) });
    } finally {
      setSyncing(false);
    }
  };

  const openAccount = useCallback((id: string) => setDrawerAccount(id), []);
  const drawerName = useMemo(() => (tree && drawerAccount ? flattenAccounts(tree).find((a) => a.id === drawerAccount) : null), [tree, drawerAccount]);

  const periodLabel = periodText(filters.from, filters.to);
  const branchLabel = filters.branchId === "all" ? "All branches" : tree?.branches.find((b) => b.id === filters.branchId)?.name || "Branch";
  const go = (where: string) => {
    if (where === "pnl") setTab("pnl");
    else if (where === "expenses") setTab("expenses");
    else if (where === "accounts") setTab("accounts");
    else if (where === "adjustments") setTab("adjustments");
    else if (where === "balance") {
      setTab("reports");
      setReportView("balance");
    } else onNavigate?.(where);
  };

  return (
    <div className="min-h-full bg-[#f8f6f2]">
      {/* header */}
      <div className="border-b border-gray-200/70 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-5 md:px-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#2a2012]">Accounts</h1>
            <p className="text-sm text-gray-500">Your money, what people owe, what you owe, and your profit — in one place.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-9" onClick={reload} disabled={loading}>
              <RefreshCw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
            {canManage && (
              <Button size="sm" className="h-9 bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={() => setQuick({ open: true, template: null })}>
                <Plus className="mr-1.5 h-4 w-4" />
                Record entry
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-9 p-0" aria-label="More">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {onNavigate && <DropdownMenuItem onSelect={() => onNavigate("expenses")}>Record an expense</DropdownMenuItem>}
                {canManage && (
                  <>
                    <DropdownMenuItem
                      onSelect={() => {
                        setTab("accounts");
                        setCreateRequest({ kind: "account", n: Date.now() });
                      }}
                    >
                      Add an account head
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setTab("adjustments");
                        setVoucherRequest(Date.now());
                      }}
                    >
                      Advanced journal entry (debit / credit)
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={sync} disabled={syncing}>
                      {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Layers className="mr-2 h-4 w-4" />}
                      Add missing staff / supplier accounts
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* period & branch */}
        <div className="flex flex-col gap-2 border-t border-gray-100 px-4 py-2.5 md:flex-row md:items-center md:px-6">
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
            <CalendarRange className="h-4 w-4 shrink-0 text-gray-400" />
            <div className="flex shrink-0 rounded-lg bg-gray-100 p-0.5">
              {QUICK_PERIODS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickPeriod(p.id)}
                  className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all", preset === p.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800")}
                >
                  {p.label}
                </button>
              ))}
              <Popover open={customOpen} onOpenChange={setCustomOpen}>
                <PopoverTrigger asChild>
                  <button type="button" className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all", preset === "custom" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800")}>
                    Custom
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 space-y-3">
                  <p className="text-sm font-semibold">Custom dates</p>
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
                    Apply
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
            <span className="whitespace-nowrap text-xs font-medium text-gray-600">{periodLabel}</span>
            {loading && tree && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
          </div>
          {(tree?.branches.length ?? 0) > 1 && (
            <div className="flex items-center gap-2 md:ml-auto">
              <Building2 className="h-4 w-4 text-gray-400" />
              <Select value={filters.branchId} onValueChange={(v) => setFilters((f) => ({ ...f, branchId: v }))}>
                <SelectTrigger className="h-8 w-[200px] rounded-lg text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {(tree?.branches || []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* tabs */}
        <div className="flex gap-1 overflow-x-auto px-4 md:px-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              title={t.help}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                tab === t.id ? "border-[#a67c2e] text-[#2a2012]" : "border-transparent text-gray-500 hover:text-gray-800",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("px-4 py-5 transition-opacity md:px-6", loading && tree && "opacity-70")}>
        {!tree ? (
          <AccountsSkeleton />
        ) : (
          <>
            {tab === "overview" && <CoaOverview tree={tree} periodLabel={periodLabel} onOpenAccount={openAccount} onGo={go} onQuickEntry={(t) => setQuick({ open: true, template: t ?? null })} />}
            {tab === "pnl" && <CoaProfitLoss tree={tree} periodLabel={periodLabel} branchLabel={branchLabel} onOpenAccount={openAccount} />}
            {tab === "accounts" && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Your account heads, organised in 4 levels: <b>Type → Group → Head → Account</b>. Pick one in each column; add new heads with the <b>+ Add</b> buttons. Staff, supplier and
                  expense-category accounts are created automatically.
                </p>
                <CoaColumns tree={tree} reload={reload} canManage={canManage} onOpenLedger={openAccount} createRequest={createRequest} />
              </div>
            )}
            {tab === "expenses" && <CoaBreakdown filters={filters} periodLabel={periodLabel} branchLabel={branchLabel} onOpenLedger={openAccount} refreshKey={refreshKey} />}
            {tab === "adjustments" && (
              <div className="space-y-4">
                <section className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">Record money that doesn&apos;t come from a sale or expense</h3>
                      <p className="text-xs text-gray-500">Pick what happened — the debit / credit is done for you.</p>
                    </div>
                    {onNavigate && (
                      <button className="text-xs font-medium text-[#a67c2e] hover:underline" onClick={() => onNavigate("expenses")}>
                        Paying a bill or expense? Use Expenses →
                      </button>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {QUICK_TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        disabled={!canManage}
                        onClick={() => setQuick({ open: true, template: t.id })}
                        className="flex items-start gap-3 rounded-xl border border-gray-200 p-3 text-left transition-colors hover:border-[#a67c2e] hover:bg-[#fcf8f2] disabled:opacity-50"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fcf8f2] text-[#a67c2e]">
                          <t.icon className="h-4 w-4" />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-gray-900">{t.title}</span>
                          <span className="block text-xs text-gray-500">{t.help}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  {!canManage && <p className="mt-2 text-xs text-gray-500">Only admins can record adjustments.</p>}
                </section>
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">History of adjustments</h3>
                  <CoaVouchers tree={tree} filters={filters} canManage={canManage} onPosted={reload} onOpenLedger={openAccount} newRequest={voucherRequest} />
                </div>
              </div>
            )}
            {tab === "reports" && (
              <CoaReports
                tree={tree}
                filters={filters}
                periodLabel={periodLabel}
                branchLabel={branchLabel}
                refreshKey={refreshKey}
                view={reportView}
                onView={setReportView}
                ledgerAccountId={ledgerAccountId}
                onLedgerAccount={setLedgerAccountId}
                onOpenAccount={openAccount}
              />
            )}
          </>
        )}
      </div>

      {/* account entries side panel */}
      <Sheet open={!!drawerAccount} onOpenChange={(v) => !v && setDrawerAccount(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto bg-[#f8f6f2] p-4 sm:max-w-[min(1100px,96vw)] sm:p-6">
          <SheetTitle className="flex items-center gap-2">
            <BookOpenText className="h-5 w-5 text-[#a67c2e]" />
            {drawerName ? drawerName.name : "Account entries"}
          </SheetTitle>
          <SheetDescription>
            {drawerName ? `${drawerName.code} · ${drawerName.control.name} · ` : ""}
            {periodLabel}
          </SheetDescription>
          <div className="mt-4">
            {tree && drawerAccount && <CoaLedger tree={tree} filters={filters} accountId={drawerAccount} onAccountChange={(id) => setDrawerAccount(id)} periodLabel={periodLabel} branchLabel={branchLabel} />}
          </div>
        </SheetContent>
      </Sheet>

      {tree && (
        <QuickEntryDialog
          open={quick.open}
          onOpenChange={(v) => setQuick((q) => ({ ...q, open: v }))}
          tree={tree}
          initial={quick.template}
          onSaved={reload}
          onAdvanced={() => {
            setQuick({ open: false, template: null });
            setTab("adjustments");
            setVoucherRequest(Date.now());
          }}
          onExpense={
            onNavigate
              ? () => {
                  setQuick({ open: false, template: null });
                  onNavigate("expenses");
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
