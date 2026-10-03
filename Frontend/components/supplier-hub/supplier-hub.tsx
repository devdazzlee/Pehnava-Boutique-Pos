"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Download,
  LayoutGrid,
  List,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Scale,
  ScrollText,
  Star,
  Trash2,
  Truck,
  Wallet,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { normalizeUserRole } from "@/lib/role-utils";
import { Bone, Chips, EmptyState, FilterBar, SearchBox } from "@/components/accounts/coa-ui";
import { ConfirmDialog } from "@/components/accounts/coa-dialogs";
import { SupplierFormDialog, TransactionDialog } from "./supplier-dialogs";
import { SupplierWorkspace, type WorkspaceTab } from "./supplier-workspace";
import {
  AGING_META,
  apiError,
  initials,
  rs,
  supplierApi,
  supplierPhone,
  TXN_META,
  whatsappLink,
  type AgingKey,
  type BalanceFilter,
  type PayablesSummary,
  type SortKey,
  type StatusFilter,
  type SupplierRow,
  type TxnType,
} from "./supplier-api";

const PAGE_SIZE = 20;
type View = "suppliers" | "payables";
type Layout = "table" | "cards";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Newest first" },
  { value: "balance_desc", label: "We owe most" },
  { value: "overdue_desc", label: "Most overdue" },
  { value: "purchases_desc", label: "Bought most" },
  { value: "last_purchase", label: "Recent delivery" },
  { value: "name", label: "Name A–Z" },
  { value: "oldest", label: "Oldest first" },
];
const day = (v?: string | null) => (v ? format(new Date(v), "dd MMM yyyy") : "—");

function Kpi({ label, value, hint, tone, icon: Icon, onClick }: { label: string; value: string; hint?: string; tone?: "dark" | "bad" | "good"; icon: typeof Wallet; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "min-w-0 rounded-xl border p-3.5 text-left transition-colors",
        tone === "dark" ? "border-[#2a2012] bg-[#2a2012] text-white" : tone === "bad" ? "border-rose-200 bg-white" : "border-gray-200 bg-white",
        onClick && "hover:border-[#a67c2e]",
      )}
    >
      <div className={cn("flex items-center gap-1.5 text-xs", tone === "dark" ? "text-stone-300" : "text-gray-500")}>
        <Icon className="h-3.5 w-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("mt-1 truncate text-xl font-semibold tabular-nums", tone === "bad" && "text-rose-700", tone === "good" && "text-emerald-700")}>{value}</div>
      {hint && <div className={cn("mt-0.5 truncate text-xs", tone === "dark" ? "text-stone-400" : "text-gray-500")}>{hint}</div>}
    </button>
  );
}

export function SupplierHub() {
  const { toast } = useToast();
  const [view, setView] = useState<View>("suppliers");
  const [layout, setLayout] = useState<Layout>("table");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [balance, setBalance] = useState<BalanceFilter>("all");
  const [city, setCity] = useState("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: PAGE_SIZE, totalPages: 1 });
  const [summary, setSummary] = useState<PayablesSummary | null>(null);
  const [facets, setFacets] = useState<{ cities: string[]; categories: string[] }>({ cities: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  const [selected, setSelected] = useState<SupplierRow | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("overview");
  const [form, setForm] = useState<{ open: boolean; editing: SupplierRow | null }>({ open: false, editing: null });
  const [quickTxn, setQuickTxn] = useState<{ supplier: SupplierRow; type: TxnType } | null>(null);
  const [deleting, setDeleting] = useState<SupplierRow | null>(null);

  useEffect(() => setRole(normalizeUserRole(localStorage.getItem("role"))), []);
  const canDelete = role === "SUPER_ADMIN" || role === "ADMIN";

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, status, balance, sort, city, category]);

  const params = useCallback(
    (extra: Record<string, unknown> = {}) => {
      const p: Record<string, unknown> = { sort, search: debounced || undefined, ...extra };
      if (status === "active") p.is_active = true;
      if (status === "inactive") p.is_active = false;
      if (balance !== "all") p.balance = balance;
      if (city !== "all") p.city = city;
      if (category !== "all") p.category = category;
      return p;
    },
    [sort, debounced, status, balance, city, category],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, payables, f] = await Promise.all([supplierApi.list(params({ page, limit: PAGE_SIZE })), supplierApi.payables(), supplierApi.facets().catch(() => null)]);
      setRows(list.data);
      setMeta(list.meta);
      setSummary(payables);
      if (f) setFacets(f);
      setSelected((prev) => (prev ? list.data.find((r) => r.id === prev.id) ?? prev : prev));
    } catch (e) {
      toast({ variant: "destructive", title: "Could not load suppliers", description: apiError(e) });
    } finally {
      setLoading(false);
    }
  }, [params, page, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openWorkspace = (s: SupplierRow, tab: WorkspaceTab = "overview") => {
    setSelected(s);
    setWorkspaceTab(tab);
    setWorkspaceOpen(true);
  };
  const openById = async (id: string, tab: WorkspaceTab = "overview") => {
    const found = rows.find((r) => r.id === id);
    if (found) return openWorkspace(found, tab);
    const res = await supplierApi.list({ fetch_all: true, limit: 500 });
    const s = res.data.find((r) => r.id === id);
    if (s) openWorkspace(s, tab);
  };

  const exportList = async () => {
    try {
      const all = await supplierApi.list(params({ fetch_all: true, limit: 500 }));
      const ws = XLSX.utils.json_to_sheet(
        all.data.map((s) => ({
          Code: s.code,
          Supplier: s.name,
          Category: s.category ?? "",
          Contact: s.contact_person ?? "",
          Phone: supplierPhone(s) ?? "",
          City: s.city ?? "",
          "Credit days": s.credit_days ?? "",
          "Credit limit": s.credit_limit ?? "",
          Purchased: s.total_purchased,
          Paid: s.total_paid,
          Returned: s.total_returned,
          "Balance (we owe)": s.balance_due,
          Overdue: s.overdue_amount,
          "Last delivery": day(s.last_purchase_date),
          "Last payment": day(s.last_payment_date),
          Status: s.is_active ? "Active" : "Inactive",
        })),
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Suppliers");
      XLSX.writeFile(wb, `suppliers-${format(new Date(), "yyyyMMdd")}.xlsx`);
    } catch (e) {
      toast({ variant: "destructive", title: "Export failed", description: apiError(e) });
    }
  };

  const toggle = async (s: SupplierRow) => {
    try {
      await supplierApi.toggle(s.id);
      toast({ title: s.is_active ? "Supplier deactivated" : "Supplier activated" });
      load();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not update", description: apiError(e) });
    }
  };

  const t = summary?.totals;

  return (
    <div className="min-h-full bg-[#f8f6f2] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        {/* header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#2a2012]">Suppliers</h1>
            <p className="text-sm text-gray-500">Who you buy from, what you owe, when it&apos;s due — with full ledgers, payments, notes and statements.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 bg-white" onClick={load}>
              <RefreshCw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button size="sm" className="h-9 bg-[#2a2012] hover:bg-[#3a2e1c]" onClick={() => setForm({ open: true, editing: null })}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add supplier
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kpi tone="dark" icon={Wallet} label="We owe suppliers" value={rs(t?.payable)} hint={`${t?.creditors ?? 0} suppliers`} onClick={() => { setView("suppliers"); setBalance("due"); setSort("balance_desc"); }} />
          <Kpi tone={t?.overdue ? "bad" : undefined} icon={AlertTriangle} label="Overdue" value={rs(t?.overdue)} hint="past credit period" onClick={() => { setView("suppliers"); setBalance("overdue"); setSort("overdue_desc"); }} />
          <Kpi icon={CalendarClock} label="Due in next 7 days" value={rs(t?.dueThisWeek)} onClick={() => setView("payables")} />
          <Kpi tone={t?.advance ? "good" : undefined} icon={Scale} label="Advances with suppliers" value={rs(t?.advance)} hint={`${t?.advanceHolders ?? 0} suppliers`} onClick={() => { setView("suppliers"); setBalance("advance"); }} />
          <Kpi tone={t?.overLimit ? "bad" : undefined} icon={AlertTriangle} label="Over credit limit" value={String(t?.overLimit ?? 0)} onClick={() => { setView("suppliers"); setBalance("over_limit"); }} />
          <Kpi icon={Truck} label="Active suppliers" value={String(t?.activeCount ?? 0)} hint={`${t?.supplierCount ?? 0} total`} />
        </div>

        {/* view switch */}
        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
          {(
            [
              ["suppliers", "Suppliers"],
              ["payables", "Payables & aging"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} className={cn("rounded-lg px-4 py-2 text-sm font-medium", view === id ? "bg-[#2a2012] text-white" : "text-gray-600 hover:bg-gray-100")}>
              {label}
            </button>
          ))}
        </div>

        {view === "payables" ? (
          <PayablesView summary={summary} onOpen={openById} onPay={(id) => { const s = rows.find((r) => r.id === id); if (s) setQuickTxn({ supplier: s, type: "PAYMENT" }); else openById(id, "bills"); }} />
        ) : (
          <>
            <FilterBar>
              <SearchBox value={search} onChange={setSearch} placeholder="Name, code, phone, contact, NTN, city…" />
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="h-9 w-44 bg-white">
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
              {facets.cities.length > 0 && (
                <Select value={city} onValueChange={setCity}>
                  <SelectTrigger className="h-9 w-36 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All cities</SelectItem>
                    {facets.cities.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {facets.categories.length > 0 && (
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-9 w-40 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {facets.categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Button size="sm" variant="outline" className="h-9 bg-white" onClick={exportList}>
                  <Download className="mr-1.5 h-4 w-4" />
                  Excel
                </Button>
                <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
                  <button title="Table" onClick={() => setLayout("table")} className={cn("rounded-md p-1.5", layout === "table" ? "bg-[#2a2012] text-white" : "text-gray-500")}>
                    <List className="h-4 w-4" />
                  </button>
                  <button title="Cards" onClick={() => setLayout("cards")} className={cn("rounded-md p-1.5", layout === "cards" ? "bg-[#2a2012] text-white" : "text-gray-500")}>
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </FilterBar>
            <div className="flex flex-wrap items-center gap-3">
              <Chips
                options={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                  { value: "all", label: "All" },
                ]}
                value={status}
                onChange={setStatus}
              />
              <span className="h-5 w-px bg-gray-200" />
              <Chips
                options={[
                  { value: "all", label: "Any balance" },
                  { value: "due", label: "We owe" },
                  { value: "overdue", label: "Overdue" },
                  { value: "over_limit", label: "Over limit" },
                  { value: "advance", label: "Advance" },
                  { value: "clear", label: "Settled" },
                ]}
                value={balance}
                onChange={setBalance}
              />
            </div>

            {loading && rows.length === 0 ? (
              <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Bone key={i} className="h-12" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white">
                <EmptyState
                  icon={Truck}
                  title={debounced || balance !== "all" || status !== "active" ? "No suppliers match" : "No suppliers yet"}
                  description={debounced || balance !== "all" ? "Try a different search or filter." : "Add the people and companies you buy stock from."}
                  action={
                    <Button size="sm" onClick={() => setForm({ open: true, editing: null })}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      Add supplier
                    </Button>
                  }
                />
              </div>
            ) : layout === "table" ? (
              <div className={cn("overflow-hidden rounded-xl border border-gray-200 bg-white", loading && "opacity-60")}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-medium">Supplier</th>
                        <th className="px-2 py-2.5 text-left font-medium">Contact</th>
                        <th className="px-2 py-2.5 text-right font-medium">Purchased</th>
                        <th className="px-2 py-2.5 text-right font-medium">Paid</th>
                        <th className="px-2 py-2.5 text-right font-medium">Balance</th>
                        <th className="px-2 py-2.5 text-left font-medium">Due</th>
                        <th className="px-2 py-2.5 text-left font-medium">Last delivery</th>
                        <th className="w-28 px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((s) => (
                        <tr key={s.id} onClick={() => openWorkspace(s)} className="cursor-pointer border-t border-gray-100 hover:bg-[#fcf8f2]/70">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold", s.is_active ? "bg-[#fcf8f2] text-[#a67c2e]" : "bg-gray-100 text-gray-400")}>{initials(s.name)}</span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 font-medium text-gray-900">
                                  <span className="truncate">{s.name}</span>
                                  {!s.is_active && <span className="rounded bg-gray-100 px-1.5 text-[10px] text-gray-500">inactive</span>}
                                  {s.rating ? (
                                    <span className="flex items-center text-[11px] text-[#a67c2e]">
                                      <Star className="h-3 w-3 fill-current" />
                                      {s.rating}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-[11px] text-gray-500">
                                  {s.code}
                                  {s.category ? ` · ${s.category}` : ""}
                                  {s.city ? ` · ${s.city}` : ""}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2.5">
                            <div className="text-gray-800">{s.contact_person || "—"}</div>
                            <div className="text-[11px] text-gray-500">{supplierPhone(s) ?? ""}</div>
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{rs(s.total_purchased)}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums text-gray-600">{rs(s.total_paid)}</td>
                          <td className="px-2 py-2.5 text-right">
                            <div className={cn("font-semibold tabular-nums", s.balance_due > 0.5 ? "text-gray-900" : s.balance_due < -0.5 ? "text-emerald-700" : "text-gray-400")}>
                              {s.balance_due < -0.5 ? `${rs(-s.balance_due)} adv` : rs(s.balance_due)}
                            </div>
                            {s.over_limit && <div className="text-[10px] font-medium text-rose-600">over limit</div>}
                          </td>
                          <td className="px-2 py-2.5">
                            {s.overdue_amount > 0.5 ? (
                              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                                {rs(s.overdue_amount)} · {s.oldest_overdue_days}d
                              </span>
                            ) : s.next_due_date ? (
                              <span className="text-xs text-gray-600">{day(s.next_due_date)}</span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-xs text-gray-600">{day(s.last_purchase_date)}</td>
                          <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" className="h-8" disabled={!s.is_active && s.balance_due <= 0} onClick={() => setQuickTxn({ supplier: s, type: "PAYMENT" })}>
                                Pay
                              </Button>
                              <RowMenu
                                s={s}
                                canDelete={canDelete}
                                onTxn={(type) => setQuickTxn({ supplier: s, type })}
                                onOpen={(tab) => openWorkspace(s, tab)}
                                onEdit={() => setForm({ open: true, editing: s })}
                                onToggle={() => toggle(s)}
                                onDelete={() => setDeleting(s)}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", loading && "opacity-60")}>
                {rows.map((s) => (
                  <div key={s.id} onClick={() => openWorkspace(s)} className="cursor-pointer rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:border-[#a67c2e]/50 hover:shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fcf8f2] text-sm font-semibold text-[#a67c2e]">{initials(s.name)}</span>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-gray-900">{s.name}</div>
                          <div className="truncate text-xs text-gray-500">{[s.category, s.city, supplierPhone(s)].filter(Boolean).join(" · ") || s.code}</div>
                        </div>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <RowMenu s={s} canDelete={canDelete} onTxn={(type) => setQuickTxn({ supplier: s, type })} onOpen={(tab) => openWorkspace(s, tab)} onEdit={() => setForm({ open: true, editing: s })} onToggle={() => toggle(s)} onDelete={() => setDeleting(s)} />
                      </div>
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <div>
                        <div className="text-[11px] text-gray-500">{s.balance_due < -0.5 ? "Advance" : "We owe"}</div>
                        <div className={cn("text-lg font-semibold tabular-nums", s.balance_due < -0.5 && "text-emerald-700")}>{rs(Math.abs(s.balance_due))}</div>
                      </div>
                      {s.overdue_amount > 0.5 ? (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">{rs(s.overdue_amount)} overdue</span>
                      ) : s.next_due_date ? (
                        <span className="text-xs text-gray-500">due {day(s.next_due_date)}</span>
                      ) : null}
                    </div>
                    {s.aging && s.balance_due > 0.5 && (
                      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-gray-100">
                        {(Object.keys(AGING_META) as AgingKey[]).map((k) => (s.aging![k] > 0 ? <div key={k} style={{ width: `${(s.aging![k] / s.balance_due) * 100}%`, backgroundColor: AGING_META[k].color }} /> : null))}
                      </div>
                    )}
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 text-center text-xs">
                      <div>
                        <div className="font-semibold tabular-nums">{rs(s.total_purchased)}</div>
                        <div className="text-gray-500">bought</div>
                      </div>
                      <div>
                        <div className="font-semibold tabular-nums">{rs(s.total_paid)}</div>
                        <div className="text-gray-500">paid</div>
                      </div>
                      <div>
                        <div className="font-semibold">{day(s.last_purchase_date)}</div>
                        <div className="text-gray-500">last delivery</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {meta.totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>
                  {meta.total} suppliers · page {meta.page} of {meta.totalPages}
                </span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <SupplierWorkspace supplier={selected} open={workspaceOpen} onOpenChange={setWorkspaceOpen} initialTab={workspaceTab} facets={facets} onChanged={load} />
      <SupplierFormDialog
        open={form.open}
        onOpenChange={(v) => setForm((f) => ({ ...f, open: v }))}
        editing={form.editing}
        facets={facets}
        onSaved={(s) => {
          load();
          if (!form.editing) openWorkspace({ ...(s as SupplierRow), balance_due: 0, overdue_amount: 0, total_purchased: 0, total_paid: 0, total_returned: 0, total_adjusted: 0, purchase_count: 0, product_count: 0, aging: null, next_due_date: null, last_purchase_date: null, last_payment_date: null, oldest_overdue_days: 0, over_limit: false });
        }}
      />
      <TransactionDialog
        open={!!quickTxn}
        onOpenChange={(v) => !v && setQuickTxn(null)}
        supplier={quickTxn?.supplier ?? null}
        initialType={quickTxn?.type}
        balanceDue={quickTxn?.supplier.balance_due}
        onSaved={load}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Only suppliers with no purchases or payments can be deleted. Suppliers with history should be deactivated instead."
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await supplierApi.remove(deleting.id);
            toast({ title: "Supplier deleted" });
            setDeleting(null);
            load();
          } catch (e) {
            toast({ variant: "destructive", title: "Could not delete", description: apiError(e) });
          }
        }}
      />
    </div>
  );
}

function RowMenu({
  s,
  canDelete,
  onTxn,
  onOpen,
  onEdit,
  onToggle,
  onDelete,
}: {
  s: SupplierRow;
  canDelete: boolean;
  onTxn: (t: TxnType) => void;
  onOpen: (tab: WorkspaceTab) => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const wa = s.whatsapp_number || s.mobile_number;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => onTxn("PAYMENT")}>
          <ArrowUpRight className="mr-2 h-4 w-4 text-emerald-600" />
          Pay
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onTxn("ADVANCE")}>
          <Wallet className="mr-2 h-4 w-4" />
          {TXN_META.ADVANCE.label}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onTxn("DEBIT_NOTE")}>
          <ScrollText className="mr-2 h-4 w-4" />
          {TXN_META.DEBIT_NOTE.label}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onOpen("ledger")}>Ledger</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpen("statement")}>Statement</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpen("bills")}>Open bills</DropdownMenuItem>
        {wa && (
          <DropdownMenuItem onSelect={() => window.open(whatsappLink(wa, `Assalam o Alaikum ${s.contact_person || s.name},`), "_blank")}>
            <MessageCircle className="mr-2 h-4 w-4" />
            WhatsApp
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggle}>
          <Power className="mr-2 h-4 w-4" />
          {s.is_active ? "Deactivate" : "Activate"}
        </DropdownMenuItem>
        {canDelete && (
          <DropdownMenuItem className="text-rose-600" onSelect={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ====================================================================== */

function PayablesView({ summary, onOpen, onPay }: { summary: PayablesSummary | null; onOpen: (id: string, tab?: WorkspaceTab) => void; onPay: (id: string) => void }) {
  if (!summary) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Bone className="h-64" />
        <Bone className="h-64" />
      </div>
    );
  }
  const total = Object.values(summary.aging).reduce((t, v) => t + v, 0);
  const trend = summary.trend.map((m) => ({ ...m, label: format(new Date(`${m.month}-15T12:00:00`), "MMM") }));
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">What we owe, by age</h3>
        {total <= 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">Nothing owed to suppliers right now.</p>
        ) : (
          <>
            <div className="flex h-4 overflow-hidden rounded-full bg-gray-100">
              {(Object.keys(AGING_META) as AgingKey[]).map((k) =>
                summary.aging[k] > 0 ? <div key={k} title={`${AGING_META[k].label}: ${rs(summary.aging[k])}`} style={{ width: `${(summary.aging[k] / total) * 100}%`, backgroundColor: AGING_META[k].color }} /> : null,
              )}
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2 text-center">
              {(Object.keys(AGING_META) as AgingKey[]).map((k) => (
                <div key={k}>
                  <div className="flex items-center justify-center gap-1 text-[11px] text-gray-500">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: AGING_META[k].color }} />
                    {AGING_META[k].label}
                  </div>
                  <div className={cn("text-sm font-semibold tabular-nums", summary.aging[k] > 0 && k !== "current" && "text-rose-700")}>{rs(summary.aging[k])}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="rounded-xl border border-gray-200 bg-white lg:col-span-3">
          <h3 className="border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-900">Biggest balances</h3>
          {summary.topCreditors.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">No outstanding balances.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {summary.topCreditors.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fcf8f2] text-xs font-semibold text-[#a67c2e]">{initials(c.name)}</span>
                  <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(c.id)}>
                    <div className="truncate text-sm font-medium text-gray-900 hover:text-[#a67c2e]">{c.name}</div>
                    <div className="text-[11px] text-gray-500">{c.overdue > 0.5 ? <span className="text-rose-600">{rs(c.overdue)} overdue · {c.oldestDays}d</span> : "nothing overdue"}</div>
                  </button>
                  <div className="text-right text-sm font-semibold tabular-nums">{rs(c.balanceDue)}</div>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => onPay(c.id)}>
                    Pay
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white lg:col-span-2">
          <h3 className="border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-900">Recent payments & notes</h3>
          {summary.recentPayments.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">No payments recorded yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {summary.recentPayments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <button className="truncate font-medium text-gray-900 hover:text-[#a67c2e]" onClick={() => onOpen(p.supplier.id, "transactions")}>
                      {p.supplier.name}
                    </button>
                    <div className="text-[11px] text-gray-500">
                      {TXN_META[p.type]?.label ?? p.type} · {day(p.date)}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </div>
                  </div>
                  <div className={cn("font-semibold tabular-nums", TXN_META[p.type]?.effect === "increase" ? "text-rose-700" : "text-emerald-700")}>{rs(p.amount)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Bought vs paid — last 6 months</h3>
          <div className="flex gap-4 text-xs text-gray-600">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#a67c2e]" /> Bought
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#2a2012]" /> Paid
            </span>
          </div>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} barGap={2}>
              <CartesianGrid vertical={false} stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v)} tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} width={44} />
              <Tooltip formatter={(v: number, n: string) => [rs(v), n === "purchased" ? "Bought" : "Paid"]} cursor={{ fill: "#f5f5f4" }} />
              <Bar dataKey="purchased" fill="#a67c2e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="paid" fill="#2a2012" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
