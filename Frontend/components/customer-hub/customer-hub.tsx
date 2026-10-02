"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowDownLeft,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutGrid,
  List,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Scale,
  Trash2,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { normalizeUserRole } from "@/lib/role-utils";
import { startOfBusinessMonthYmd } from "@/lib/business-timezone";
import { qk } from "@/lib/query/query-keys";
import { Bone, Chips, EmptyState, FilterBar, SearchBox } from "@/components/accounts/coa-ui";
import { ConfirmDialog } from "@/components/accounts/coa-dialogs";
import { CustomerFormDialog, TransactionDialog } from "./customer-dialogs";
import { CustomerWorkspace } from "./customer-workspace";
import {
  AGING_META,
  apiError,
  customerApi,
  displayEmail,
  initials,
  num,
  rs,
  whatsappReminder,
  type BalanceFilter,
  type CustomerRow,
  type ReceivablesSummary,
  type SortKey,
  type StatusFilter,
  type TxnType,
} from "./customer-api";

const PAGE_SIZE = 20;
type View = "customers" | "receivables";
type Layout = "table" | "cards";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Newest first" },
  { value: "balance_desc", label: "Highest balance" },
  { value: "overdue_desc", label: "Most overdue" },
  { value: "sales_desc", label: "Top buyers" },
  { value: "last_visit", label: "Recent visit" },
  { value: "name", label: "Name A–Z" },
  { value: "oldest", label: "Oldest first" },
];

const day = (v?: string | null) => (v ? format(new Date(v), "dd MMM yyyy") : "—");

export function CustomerHub() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<View>("customers");
  const [layout, setLayout] = useState<Layout>("table");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [balance, setBalance] = useState<BalanceFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: PAGE_SIZE, totalPages: 1 });
  const [counts, setCounts] = useState({ all: 0, active: 0, inactive: 0, new: 0 });
  const [summary, setSummary] = useState<ReceivablesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<"overview" | "statement">("overview");
  const [formOpen, setFormOpen] = useState<{ open: boolean; editing: CustomerRow | null }>({ open: false, editing: null });
  const [quickTxn, setQuickTxn] = useState<{ customer: CustomerRow; type: TxnType } | null>(null);
  const [deleting, setDeleting] = useState<CustomerRow | null>(null);

  useEffect(() => setRole(normalizeUserRole(localStorage.getItem("role"))), []);
  const canDelete = role === "SUPER_ADMIN" || role === "ADMIN";

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, status, balance, sort]);

  const monthStart = startOfBusinessMonthYmd();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: PAGE_SIZE, sort, search: debounced || undefined };
      if (status === "active") params.is_active = true;
      if (status === "inactive") params.is_active = false;
      if (status === "new") params.created_after = monthStart;
      if (balance !== "all") params.balance = balance;
      const [list, receivables, all, active, inactive, fresh] = await Promise.all([
        customerApi.list(params),
        customerApi.receivables(),
        customerApi.list({ page: 1, limit: 1 }),
        customerApi.list({ page: 1, limit: 1, is_active: true }),
        customerApi.list({ page: 1, limit: 1, is_active: false }),
        customerApi.list({ page: 1, limit: 1, created_after: monthStart }),
      ]);
      setRows(list.data);
      setMeta(list.meta);
      setSummary(receivables);
      setCounts({ all: all.meta.total, active: active.meta.total, inactive: inactive.meta.total, new: fresh.meta.total });
      setSelected((prev) => (prev ? list.data.find((r) => r.id === prev.id) ?? prev : prev));
    } catch (error) {
      toast({ variant: "destructive", title: "Could not load customers", description: apiError(error) });
    } finally {
      setLoading(false);
    }
  }, [page, sort, debounced, status, balance, monthStart, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const changed = useCallback(() => {
    load();
    // Keep the POS customer pickers and other screens in sync.
    qc.invalidateQueries({ queryKey: qk.customers.all });
  }, [load, qc]);

  const openCustomer = (c: CustomerRow, tab: "overview" | "statement" = "overview") => {
    setSelected(c);
    setWorkspaceTab(tab);
    setWorkspaceOpen(true);
  };

  const toggleActive = async (c: CustomerRow) => {
    try {
      await customerApi.update(c.id, { is_active: !c.is_active });
      toast({ title: c.is_active ? "Customer deactivated" : "Customer activated", description: c.name || "" });
      changed();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not update status", description: apiError(error) });
    }
  };

  const t = summary?.totals;
  const kpis = [
    { label: "Customers", value: counts.all.toLocaleString(), hint: `${counts.active} active · ${counts.new} new this month`, icon: Users, accent: "bg-gray-100 text-gray-700", onClick: () => { setBalance("all"); setStatus("all"); } },
    { label: "Receivable", value: rs(t?.receivable ?? 0), hint: `${t?.debtors ?? 0} customers owe you`, icon: Scale, accent: "bg-rose-50 text-rose-600", onClick: () => setBalance("due") },
    { label: "Advances held", value: rs(t?.advance ?? 0), hint: `${t?.advanceHolders ?? 0} customers paid upfront`, icon: Wallet, accent: "bg-emerald-50 text-emerald-600", onClick: () => setBalance("advance") },
    { label: "Overdue", value: rs(t?.overdue ?? 0), hint: `${t?.overdueCustomers ?? 0} customers past due`, icon: CalendarClock, accent: "bg-amber-50 text-amber-700", onClick: () => setBalance("overdue") },
    { label: "Over credit limit", value: String(t?.overLimit ?? 0), hint: "Customers above their limit", icon: AlertTriangle, accent: "bg-orange-50 text-orange-600", onClick: () => setBalance("over_limit") },
  ];

  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.total, meta.page * meta.limit);

  return (
    <div className="min-h-full bg-[#f8f6f2]">
      {/* header */}
      <div className="border-b border-gray-200/70 bg-white">
        <div className="flex flex-col gap-4 px-4 py-5 md:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="hidden h-11 w-11 items-center justify-center rounded-xl bg-[#2a2012] text-[#e9d3a4] shadow-sm sm:flex">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a67c2e]">Customers</p>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Customer accounts</h1>
              <p className="text-xs text-gray-500">Profiles, purchases, receivables, advances and full ledger</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-gray-100 p-0.5">
              {(["customers", "receivables"] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all",
                    view === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="h-9" onClick={changed} disabled={loading}>
              <RefreshCw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} />Refresh
            </Button>
            <Button size="sm" className="h-9 bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={() => setFormOpen({ open: true, editing: null })}>
              <UserPlus className="mr-1.5 h-4 w-4" />New customer
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-5 px-4 py-5 md:px-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {!summary
            ? Array.from({ length: 5 }).map((_, i) => <Bone key={i} className="h-[96px] rounded-xl" />)
            : kpis.map((k) => (
                <button
                  key={k.label}
                  type="button"
                  onClick={() => {
                    setView("customers");
                    k.onClick();
                  }}
                  className="rounded-xl border border-gray-200/80 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{k.label}</p>
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", k.accent)}>
                      <k.icon className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-gray-900">{k.value}</p>
                  <p className="mt-0.5 truncate text-[11px] text-gray-500">{k.hint}</p>
                </button>
              ))}
        </div>

        {view === "receivables" ? (
          <ReceivablesView summary={summary} onOpen={(id) => {
            const row = rows.find((r) => r.id === id);
            if (row) openCustomer(row);
            else customerApi.list({ search: undefined, page: 1, limit: 200, balance: "all" }).then((r) => {
              const found = r.data.find((x) => x.id === id);
              if (found) openCustomer(found);
            });
          }} />
        ) : (
          <section className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm">
            <FilterBar>
              <SearchBox value={search} onChange={setSearch} placeholder="Search name, phone or email…" className="max-w-sm" />
              <Chips<StatusFilter>
                value={status}
                onChange={setStatus}
                options={[
                  { value: "all", label: "All", count: counts.all },
                  { value: "active", label: "Active", count: counts.active },
                  { value: "inactive", label: "Inactive", count: counts.inactive },
                  { value: "new", label: "New this month", count: counts.new },
                ]}
              />
              <div className="ml-auto flex items-center gap-2">
                <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                  <SelectTrigger className="h-9 w-[170px] rounded-lg border-gray-200 bg-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
                  {([["table", List], ["cards", LayoutGrid]] as const).map(([value, Icon]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLayout(value)}
                      aria-label={`${value} view`}
                      className={cn("rounded-md p-1.5", layout === value ? "bg-[#2a2012] text-white" : "text-gray-500 hover:bg-gray-100")}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </div>
            </FilterBar>
            <FilterBar className="bg-white">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Balance</span>
              <Chips<BalanceFilter>
                size="xs"
                value={balance}
                onChange={setBalance}
                options={[
                  { value: "all", label: "Any" },
                  { value: "due", label: "Owes money", dot: "bg-rose-500", count: t?.debtors },
                  { value: "advance", label: "Has advance", dot: "bg-emerald-500", count: t?.advanceHolders },
                  { value: "overdue", label: "Overdue", dot: "bg-amber-500", count: t?.overdueCustomers },
                  { value: "over_limit", label: "Over limit", dot: "bg-orange-500", count: t?.overLimit },
                  { value: "clear", label: "Settled", dot: "bg-gray-400" },
                ]}
              />
              {loading ? <Loader2 className="ml-auto h-4 w-4 animate-spin text-gray-400" /> : null}
            </FilterBar>

            {loading && rows.length === 0 ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 5 }).map((_, i) => <Bone key={i} className="h-12 rounded-lg" />)}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Users}
                title={counts.all ? "No customers match these filters" : "No customers yet"}
                description={counts.all ? "Try another search or balance filter." : "Add your first customer to track purchases and credit."}
                action={
                  counts.all ? (
                    <Button size="sm" variant="outline" onClick={() => { setSearch(""); setStatus("all"); setBalance("all"); }}>Clear filters</Button>
                  ) : (
                    <Button size="sm" className="bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={() => setFormOpen({ open: true, editing: null })}>
                      <Plus className="mr-1 h-4 w-4" />New customer
                    </Button>
                  )
                }
              />
            ) : layout === "table" ? (
              <div className={cn("overflow-x-auto transition-opacity", loading && "opacity-60")}>
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-5 py-2.5">Customer</th>
                      <th className="px-3 py-2.5 text-right">Purchases</th>
                      <th className="px-3 py-2.5">Last visit</th>
                      <th className="px-3 py-2.5 text-right">Balance</th>
                      <th className="px-3 py-2.5">Credit</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="w-44 px-5 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id} onClick={() => openCustomer(c)} className="group cursor-pointer border-b border-gray-50 transition-colors hover:bg-[#fcf8f2]/70">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={c.name} inactive={!c.is_active} />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-gray-900 group-hover:text-[#8a6520]">{c.name || "Unnamed"}</p>
                              <p className="truncate text-[11px] text-gray-500">
                                {c.phone_number || "No phone"}
                                {displayEmail(c.email) ? ` · ${displayEmail(c.email)}` : ""}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <p className="font-medium tabular-nums text-gray-900">{rs(c.total_sale_amount)}</p>
                          <p className="text-[11px] text-gray-500">{c.sale_count} bill{c.sale_count === 1 ? "" : "s"}</p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-gray-600">{day(c.last_sale_date)}</td>
                        <td className="px-3 py-3 text-right"><BalanceCell c={c} /></td>
                        <td className="px-3 py-3"><CreditCell c={c} /></td>
                        <td className="px-3 py-3"><StatusPill active={c.is_active} /></td>
                        <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {c.balance_due > 0.005 ? (
                              <Button size="sm" className="h-8 bg-emerald-600 text-xs hover:bg-emerald-700" onClick={() => setQuickTxn({ customer: c, type: "PAYMENT" })}>
                                <ArrowDownLeft className="mr-1 h-3.5 w-3.5" />Receive
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openCustomer(c)}>Open</Button>
                            )}
                            <RowMenu
                              c={c}
                              canDelete={canDelete}
                              onAdvance={() => setQuickTxn({ customer: c, type: "ADVANCE" })}
                              onStatement={() => openCustomer(c, "statement")}
                              onEdit={() => setFormOpen({ open: true, editing: c })}
                              onToggle={() => toggleActive(c)}
                              onDelete={() => setDeleting(c)}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={cn("grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3", loading && "opacity-60")}>
                {rows.map((c) => (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openCustomer(c)}
                    onKeyDown={(e) => e.key === "Enter" && openCustomer(c)}
                    className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[#a67c2e]/40 hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar name={c.name} inactive={!c.is_active} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-gray-900">{c.name || "Unnamed"}</p>
                        <p className="text-[11px] text-gray-500">{c.phone_number || "No phone"}</p>
                      </div>
                      <StatusPill active={c.is_active} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-gray-50 px-2.5 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">Purchases</p>
                        <p className="font-semibold tabular-nums text-gray-900">{rs(c.total_sale_amount)}</p>
                        <p className="text-[10px] text-gray-500">{c.sale_count} bills · {day(c.last_sale_date)}</p>
                      </div>
                      <div className={cn("rounded-lg px-2.5 py-2", c.balance_due > 0.005 ? "bg-rose-50" : c.advance_balance > 0.005 ? "bg-emerald-50" : "bg-gray-50")}>
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">Balance</p>
                        <BalanceCell c={c} align="left" />
                      </div>
                    </div>
                    <div className="mt-3"><CreditCell c={c} /></div>
                    <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3" onClick={(e) => e.stopPropagation()}>
                      {c.balance_due > 0.005 ? (
                        <Button size="sm" className="h-8 flex-1 bg-emerald-600 text-xs hover:bg-emerald-700" onClick={() => setQuickTxn({ customer: c, type: "PAYMENT" })}>
                          Receive payment
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-8 flex-1 text-xs" onClick={() => setQuickTxn({ customer: c, type: "ADVANCE" })}>
                          Take advance
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openCustomer(c)}>Open</Button>
                      <RowMenu
                        c={c}
                        canDelete={canDelete}
                        onAdvance={() => setQuickTxn({ customer: c, type: "ADVANCE" })}
                        onStatement={() => openCustomer(c, "statement")}
                        onEdit={() => setFormOpen({ open: true, editing: c })}
                        onToggle={() => toggleActive(c)}
                        onDelete={() => setDeleting(c)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {meta.total > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
                <span>Showing {from}–{to} of {meta.total} customers</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-8" disabled={meta.page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span>Page {meta.page} of {Math.max(1, meta.totalPages)}</span>
                  <Button size="sm" variant="outline" className="h-8" disabled={meta.page >= meta.totalPages || loading} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        )}
      </div>

      <CustomerWorkspace
        customer={selected}
        open={workspaceOpen}
        onOpenChange={setWorkspaceOpen}
        onChanged={changed}
        canDelete={canDelete}
        initialTab={workspaceTab}
      />
      <CustomerFormDialog
        open={formOpen.open}
        onOpenChange={(open) => setFormOpen((f) => ({ ...f, open }))}
        editing={formOpen.editing}
        onSaved={changed}
      />
      {quickTxn ? (
        <TransactionDialog
          open={!!quickTxn}
          onOpenChange={(o) => !o && setQuickTxn(null)}
          customer={quickTxn.customer}
          initialType={quickTxn.type}
          openItems={[]}
          balanceDue={quickTxn.customer.balance_due}
          advanceBalance={quickTxn.customer.advance_balance}
          onSaved={changed}
        />
      ) : null}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name || "customer"}?`}
        description="This permanently removes the customer together with their sales, payments and history. Consider deactivating instead."
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await customerApi.remove(deleting.id);
            toast({ title: "Customer deleted" });
            changed();
          } catch (error) {
            toast({ variant: "destructive", title: "Could not delete customer", description: apiError(error) });
            throw error;
          }
        }}
      />
    </div>
  );
}

/* ------------------------------ pieces ------------------------------ */

function Avatar({ name, inactive }: { name: string | null; inactive?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
        inactive ? "bg-gray-100 text-gray-400" : "bg-[#f3ead8] text-[#8a6520]",
      )}
    >
      {initials(name)}
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        active ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" : "bg-gray-100 text-gray-500",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-500" : "bg-gray-400")} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function BalanceCell({ c, align = "right" }: { c: CustomerRow; align?: "left" | "right" }) {
  if (c.balance_due > 0.005) {
    return (
      <div className={align === "right" ? "text-right" : undefined}>
        <p className="font-semibold tabular-nums text-rose-700">{rs(c.balance_due)}</p>
        <p className="text-[10px] text-gray-500">{c.overdue_amount > 0.005 ? <span className="font-medium text-amber-700">{rs(c.overdue_amount)} overdue</span> : "owes"}</p>
      </div>
    );
  }
  if (c.advance_balance > 0.005) {
    return (
      <div className={align === "right" ? "text-right" : undefined}>
        <p className="font-semibold tabular-nums text-emerald-700">{rs(c.advance_balance)}</p>
        <p className="text-[10px] text-gray-500">advance held</p>
      </div>
    );
  }
  return <p className={cn("text-xs text-gray-400", align === "right" && "text-right")}>Settled</p>;
}

function CreditCell({ c }: { c: CustomerRow }) {
  const limit = c.credit_limit != null && c.credit_limit !== "" ? num(c.credit_limit) : null;
  if (!limit) {
    return <p className="text-[11px] text-gray-400">{c.credit_days ? `${c.credit_days}-day terms · no limit` : "No limit"}</p>;
  }
  const pct = Math.min(100, (c.balance_due / limit) * 100);
  return (
    <div className="w-36">
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div className={cn("h-1.5 rounded-full", pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
      </div>
      <p className={cn("mt-1 text-[10px]", c.over_limit ? "font-semibold text-rose-600" : "text-gray-500")}>
        {c.over_limit ? "Over limit · " : ""}
        {rs(c.balance_due)} / {rs(limit)}
        {c.credit_days ? ` · ${c.credit_days}d` : ""}
      </p>
    </div>
  );
}

function RowMenu({
  c,
  canDelete,
  onAdvance,
  onStatement,
  onEdit,
  onToggle,
  onDelete,
}: {
  c: CustomerRow;
  canDelete: boolean;
  onAdvance: () => void;
  onStatement: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-500" aria-label="More actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={onAdvance}>
          <Wallet className="mr-2 h-4 w-4" />Take advance
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onStatement}>
          <FileText className="mr-2 h-4 w-4" />Statement
        </DropdownMenuItem>
        {c.phone_number && c.balance_due > 0.005 ? (
          <DropdownMenuItem onClick={() => whatsappReminder(c, c.balance_due)}>
            <MessageCircle className="mr-2 h-4 w-4" />WhatsApp reminder
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />Edit details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onToggle}>
          <Power className="mr-2 h-4 w-4" />{c.is_active ? "Deactivate" : "Activate"}
        </DropdownMenuItem>
        {canDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-rose-600 focus:text-rose-700" onClick={onDelete}>
              <Trash2 className="mr-2 h-4 w-4" />Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------ receivables ------------------------------ */

function ReceivablesView({ summary, onOpen }: { summary: ReceivablesSummary | null; onOpen: (id: string) => void }) {
  const aging = summary?.aging;
  const total = useMemo(() => (aging ? AGING_META.reduce((s, b) => s + aging[b.key], 0) : 0), [aging]);
  if (!summary) return <Bone className="h-80 rounded-xl" />;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">Receivable aging</h2>
            <p className="text-xs text-gray-500">How long customer balances have been unpaid past their due date</p>
          </div>
          <p className="text-sm text-gray-600">
            Net receivable <span className="font-bold text-gray-900">{rs(summary.totals.net)}</span>
            <span className="text-xs text-gray-400"> (owed {rs(summary.totals.receivable)} − advances {rs(summary.totals.advance)})</span>
          </p>
        </div>
        {total <= 0.005 ? (
          <p className="py-8 text-center text-sm text-gray-400">No outstanding customer balances. 🎉</p>
        ) : (
          <>
            <div className="mt-4 flex h-4 gap-0.5 overflow-hidden rounded-full bg-gray-100">
              {AGING_META.filter((b) => summary.aging[b.key] > 0.005).map((b) => (
                <div key={b.key} style={{ width: `${(summary.aging[b.key] / total) * 100}%`, background: b.color }} title={`${b.label}: ${rs(summary.aging[b.key])}`} />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {AGING_META.map((b) => (
                <div key={b.key} className="rounded-lg border border-gray-100 px-3 py-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
                    {b.label}
                  </p>
                  <p className="mt-0.5 text-base font-bold tabular-nums text-gray-900">{summary.aging[b.key] > 0.005 ? rs(summary.aging[b.key]) : "—"}</p>
                  <p className="text-[10px] text-gray-400">{total > 0 ? `${((summary.aging[b.key] / total) * 100).toFixed(0)}%` : ""}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReceivableList title="Top debtors" empty="Nobody owes you money." rows={summary.topDebtors} kind="due" onOpen={onOpen} />
        <ReceivableList title="Advances held" empty="No customer advances." rows={summary.topAdvances} kind="advance" onOpen={onOpen} />
      </div>
    </div>
  );
}

function ReceivableList({
  title,
  empty,
  rows,
  kind,
  onOpen,
}: {
  title: string;
  empty: string;
  rows: ReceivablesSummary["topDebtors"];
  kind: "due" | "advance";
  onOpen: (id: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => (kind === "due" ? r.receivable : r.advance)));
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-[11px] text-gray-400">Top {rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-xs text-gray-400">{empty}</p>
      ) : (
        <ol className="divide-y divide-gray-50">
          {rows.map((r, i) => {
            const value = kind === "due" ? r.receivable : r.advance;
            return (
              <li key={r.id}>
                <button type="button" onClick={() => onOpen(r.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-gray-50/70">
                  <span className="w-5 text-xs font-semibold text-gray-400">{i + 1}</span>
                  <Avatar name={r.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{r.name || "Unnamed"}</p>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                      <div className={cn("h-1.5 rounded-full", kind === "due" ? "bg-rose-400" : "bg-emerald-400")} style={{ width: `${(value / max) * 100}%` }} />
                    </div>
                    <p className="mt-0.5 text-[10px] text-gray-500">
                      {r.phone_number || "No phone"}
                      {kind === "due" && r.overdue > 0.005 ? ` · ${rs(r.overdue)} overdue` : ""}
                      {kind === "due" && r.overLimit ? " · over limit" : ""}
                    </p>
                  </div>
                  <span className={cn("text-sm font-bold tabular-nums", kind === "due" ? "text-rose-700" : "text-emerald-700")}>{rs(value)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
