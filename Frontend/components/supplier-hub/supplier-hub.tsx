"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Scale,
  Trash2,
  Truck,
  Wallet,
} from "lucide-react";
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
import { Bone, Chips, EmptyState, FilterBar, SearchBox } from "@/components/accounts/coa-ui";
import { ConfirmDialog } from "@/components/accounts/coa-dialogs";
import { PaymentDialog, SupplierFormDialog } from "./supplier-dialogs";
import { SupplierWorkspace } from "./supplier-workspace";
import {
  apiError,
  initials,
  rs,
  supplierApi,
  type BalanceFilter,
  type PayablesSummary,
  type SortKey,
  type StatusFilter,
  type SupplierRow,
} from "./supplier-api";

const PAGE_SIZE = 20;
type View = "suppliers" | "payables";
type Layout = "table" | "cards";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Newest first" },
  { value: "balance_desc", label: "Highest payable" },
  { value: "purchases_desc", label: "Top purchased" },
  { value: "name", label: "Name A–Z" },
];

export function SupplierHub() {
  const { toast } = useToast();
  const [view, setView] = useState<View>("suppliers");
  const [layout, setLayout] = useState<Layout>("table");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [balance, setBalance] = useState<BalanceFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: PAGE_SIZE, totalPages: 1 });
  const [summary, setSummary] = useState<PayablesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  const [selected, setSelected] = useState<SupplierRow | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<"overview" | "ledger" | "payments">("overview");
  const [formOpen, setFormOpen] = useState<{ open: boolean; editing: SupplierRow | null }>({
    open: false,
    editing: null,
  });
  const [payFor, setPayFor] = useState<SupplierRow | null>(null);
  const [deleting, setDeleting] = useState<SupplierRow | null>(null);

  useEffect(() => setRole(normalizeUserRole(localStorage.getItem("role"))), []);
  const canDelete = role === "SUPER_ADMIN" || role === "ADMIN";

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, status, balance, sort]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page,
        limit: PAGE_SIZE,
        sort,
        search: debounced || undefined,
        balance: balance !== "all" ? balance : undefined,
      };
      if (status === "active") params.is_active = true;
      if (status === "inactive") params.is_active = false;
      if (status === "pos") params.display_on_pos = true;

      const [list, payables] = await Promise.all([
        supplierApi.list(params),
        supplierApi.payables(),
      ]);
      setRows(list.data);
      setMeta(list.meta);
      setSummary(payables);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not load suppliers",
        description: apiError(error),
      });
    } finally {
      setLoading(false);
    }
  }, [page, sort, debounced, status, balance, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openWorkspace = (row: SupplierRow, tab: "overview" | "ledger" | "payments" = "overview") => {
    setSelected(row);
    setWorkspaceTab(tab);
    setWorkspaceOpen(true);
  };

  const totals = summary?.totals;

  return (
    <div className="mx-auto w-full min-w-0 max-w-none space-y-5 p-4 text-black md:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm">
            <Truck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
              Suppliers
            </h1>
            <p className="truncate text-sm text-slate-500">
              Profiles, payables ledger, payments, purchases and statements
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" className="h-9 bg-white shadow-sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button
            className="h-9 bg-emerald-700 text-white shadow-sm hover:bg-emerald-800"
            onClick={() => setFormOpen({ open: true, editing: null })}
          >
            <Plus className="mr-2 h-4 w-4" />
            New supplier
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {[
          {
            label: "Payable to suppliers",
            value: rs(totals?.payable ?? 0),
            hint: `${totals?.creditors ?? 0} creditors`,
            onClick: () => {
              setBalance("due");
              setView("suppliers");
            },
          },
          {
            label: "Advances held",
            value: rs(totals?.advance ?? 0),
            hint: `${totals?.advanceHolders ?? 0} suppliers`,
            onClick: () => {
              setBalance("advance");
              setView("suppliers");
            },
          },
          {
            label: "Purchased (all time)",
            value: rs(totals?.purchased ?? 0),
            hint: `Paid ${rs(totals?.paid ?? 0)}`,
          },
          {
            label: "Suppliers",
            value: (totals?.supplierCount ?? meta.total).toLocaleString(),
            hint: "In directory",
            onClick: () => {
              setStatus("all");
              setBalance("all");
              setView("suppliers");
            },
          },
        ].map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={card.onClick}
            className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 sm:p-5"
          >
            <span className="absolute inset-x-0 top-0 h-1 bg-emerald-600" aria-hidden />
            <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-500">
              {card.label}
            </p>
            {loading && !summary ? (
              <Bone className="mt-2 h-7 w-24" />
            ) : (
              <p className="mt-2 truncate text-xl font-semibold tracking-tight tabular-nums text-slate-900 sm:text-2xl">
                {card.value}
              </p>
            )}
            <p className="mt-1 truncate text-xs text-slate-500">{card.hint}</p>
          </button>
        ))}
      </div>

      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-1">
        {(
          [
            { id: "suppliers" as const, label: "Directory", icon: Truck },
            { id: "payables" as const, label: "Payables", icon: Scale },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium",
                view === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {view === "payables" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Top creditors</h2>
            <p className="text-xs text-slate-500">Suppliers we currently owe the most</p>
          </div>
          {!summary ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Bone key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : summary.topCreditors.length === 0 ? (
            <EmptyState
              icon={Scale}
              title="No payables outstanding"
              description="All supplier balances are settled or in advance."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {summary.topCreditors.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    openWorkspace(
                      {
                        id: c.id,
                        code: c.code,
                        name: c.name,
                        phone_number: c.phone,
                        is_active: true,
                        display_on_pos: true,
                        product_count: 0,
                        purchase_count: 0,
                        total_purchased: c.totalPurchased,
                        total_paid: c.totalPaid,
                        total_returned: 0,
                        balance_due: c.balanceDue,
                        created_at: new Date().toISOString(),
                      },
                      "ledger",
                    )
                  }
                  className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50"
                >
                  <span className="w-6 text-xs font-semibold text-slate-400">{i + 1}</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-xs font-bold text-emerald-800">
                    {initials(c.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{c.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {c.code}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums text-rose-700">{rs(c.balanceDue)}</p>
                    <p className="text-[11px] text-slate-400">due</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <FilterBar>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Search name, code, phone, email…"
              className="max-w-sm"
            />
            <Chips<StatusFilter>
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "pos", label: "On POS" },
              ]}
            />
            <Chips<BalanceFilter>
              value={balance}
              onChange={setBalance}
              options={[
                { value: "all", label: "Any balance" },
                { value: "due", label: "Payable" },
                { value: "advance", label: "Advance" },
                { value: "clear", label: "Settled" },
              ]}
            />
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-9 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto inline-flex rounded-lg border border-slate-200 p-0.5">
              <button
                type="button"
                onClick={() => setLayout("table")}
                className={cn(
                  "inline-flex h-8 items-center rounded-md px-2",
                  layout === "table" ? "bg-slate-900 text-white" : "text-slate-600",
                )}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setLayout("cards")}
                className={cn(
                  "inline-flex h-8 items-center rounded-md px-2",
                  layout === "cards" ? "bg-slate-900 text-white" : "text-slate-600",
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </FilterBar>

          {loading && rows.length === 0 ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Bone key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No suppliers found"
              description="Clear filters or add your first supplier."
              action={
                <Button size="sm" onClick={() => setFormOpen({ open: true, editing: null })}>
                  <Plus className="mr-1 h-4 w-4" /> New supplier
                </Button>
              }
            />
          ) : layout === "table" ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3 text-left font-semibold">Supplier</th>
                    <th className="px-3 py-3 text-left font-semibold">Contact</th>
                    <th className="px-3 py-3 text-right font-semibold">Purchased</th>
                    <th className="px-3 py-3 text-right font-semibold">Paid</th>
                    <th className="px-3 py-3 text-right font-semibold">Balance</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((s) => (
                    <tr
                      key={s.id}
                      className="cursor-pointer hover:bg-slate-50/70"
                      onClick={() => openWorkspace(s)}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-xs font-bold text-emerald-800">
                            {initials(s.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">{s.name}</p>
                            <p className="font-mono text-[11px] text-slate-400">{s.code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        <p>{s.mobile_number || s.phone_number || "—"}</p>
                        <p className="truncate text-[11px] text-slate-400">{s.city || s.email || ""}</p>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-800">
                        {rs(s.total_purchased || 0)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-emerald-700">
                        {rs(s.total_paid || 0)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <p
                          className={cn(
                            "font-semibold tabular-nums",
                            (s.balance_due || 0) > 0.005
                              ? "text-rose-700"
                              : (s.balance_due || 0) < -0.005
                                ? "text-emerald-700"
                                : "text-slate-500",
                          )}
                        >
                          {(s.balance_due || 0) > 0.005
                            ? rs(s.balance_due)
                            : (s.balance_due || 0) < -0.005
                              ? rs(Math.abs(s.balance_due))
                              : "Settled"}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {(s.balance_due || 0) > 0.005
                            ? "payable"
                            : (s.balance_due || 0) < -0.005
                              ? "advance"
                              : ""}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          {(s.balance_due || 0) > 0.005 ? (
                            <Button
                              size="sm"
                              className="h-8 bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => setPayFor(s)}
                            >
                              <Wallet className="mr-1 h-3.5 w-3.5" />
                              Pay
                            </Button>
                          ) : null}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openWorkspace(s, "overview")}>
                                Open account
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openWorkspace(s, "ledger")}>
                                Ledger
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setPayFor(s)}>
                                Record payment
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setFormOpen({ open: true, editing: s })}
                              >
                                <Pencil className="mr-2 h-3.5 w-3.5" />
                                Edit
                              </DropdownMenuItem>
                              {canDelete ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-rose-600"
                                    onClick={() => setDeleting(s)}
                                  >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openWorkspace(s)}
                  className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-800">
                      {initials(s.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">{s.name}</p>
                      <p className="font-mono text-[11px] text-slate-400">{s.code}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-slate-400">Purchased</p>
                      <p className="font-semibold tabular-nums">{rs(s.total_purchased || 0)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-400">Balance</p>
                      <p
                        className={cn(
                          "font-semibold tabular-nums",
                          (s.balance_due || 0) > 0 ? "text-rose-700" : "text-emerald-700",
                        )}
                      >
                        {(s.balance_due || 0) > 0.005
                          ? rs(s.balance_due)
                          : (s.balance_due || 0) < -0.005
                            ? rs(Math.abs(s.balance_due))
                            : "Settled"}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {meta.totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
              <p className="text-slate-500">
                Page {meta.page} of {meta.totalPages} · {meta.total} suppliers
              </p>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= meta.totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <SupplierWorkspace
        supplier={selected}
        open={workspaceOpen}
        onOpenChange={setWorkspaceOpen}
        onChanged={load}
        canDelete={canDelete}
        initialTab={workspaceTab}
      />
      <SupplierFormDialog
        open={formOpen.open}
        editing={formOpen.editing}
        onOpenChange={(o) => setFormOpen((f) => ({ ...f, open: o }))}
        onSaved={load}
      />
      <PaymentDialog
        open={!!payFor}
        supplier={payFor}
        balanceDue={payFor?.balance_due || 0}
        onOpenChange={(o) => !o && setPayFor(null)}
        onSaved={load}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name || "supplier"}?`}
        description="Purchases stay in history but will be reassigned to the default supplier."
        confirmLabel="Delete supplier"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await supplierApi.remove(deleting.id);
            toast({ title: "Supplier deleted" });
            setDeleting(null);
            load();
          } catch (error) {
            toast({
              variant: "destructive",
              title: "Could not delete",
              description: apiError(error),
            });
            throw error;
          }
        }}
      />
    </div>
  );
}
