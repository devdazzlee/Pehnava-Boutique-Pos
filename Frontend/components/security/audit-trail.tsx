"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ChevronLeft, ChevronRight, Download, FileClock, Loader2, RefreshCw, ShieldCheck, UserCheck } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { YmdDatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { rangeForPreset } from "@/lib/business-timezone";
import { Bone, Chips, EmptyState, FilterBar, Panel, SearchBox } from "@/components/accounts/coa-ui";

type AuditRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  action: string;
  category: string;
  entity: string | null;
  entity_id: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  approved_by_email: string | null;
  ip: string | null;
  user_agent: string | null;
};

type Preset = "today" | "last7" | "thisMonth" | "last90" | "all" | "custom";

const CATEGORY: Record<string, { label: string; tone: string }> = {
  sales: { label: "Sales", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  inventory: { label: "Inventory", tone: "bg-sky-50 text-sky-700 ring-sky-200" },
  cash: { label: "Cash", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  expenses: { label: "Expenses", tone: "bg-orange-50 text-orange-700 ring-orange-200" },
  customers: { label: "Customers", tone: "bg-teal-50 text-teal-700 ring-teal-200" },
  suppliers: { label: "Suppliers", tone: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  staff: { label: "Staff", tone: "bg-violet-50 text-violet-700 ring-violet-200" },
  accounts: { label: "Accounts", tone: "bg-lime-50 text-lime-800 ring-lime-200" },
  security: { label: "Security", tone: "bg-rose-50 text-rose-700 ring-rose-200" },
  reports: { label: "Reports", tone: "bg-gray-100 text-gray-700 ring-gray-200" },
  other: { label: "Other", tone: "bg-gray-100 text-gray-600 ring-gray-200" },
};

const QUICK_ACTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Any action" },
  { value: "auth.", label: "Sign-ins" },
  { value: "sale.void", label: "Voids" },
  { value: "sale.refund", label: "Refunds / returns" },
  { value: "sale.edit", label: "Bill edits" },
  { value: "sale.create", label: "Sales" },
  { value: "product.update", label: "Product / price edits" },
  { value: "inventory.adjust", label: "Stock adjustments" },
  { value: "register.", label: "Register / cash" },
  { value: "expense.", label: "Expense changes" },
  { value: "approval.", label: "Manager approvals" },
  { value: "permission.", label: "Permission changes" },
  { value: "user.", label: "User changes" },
  { value: "export.", label: "Exports" },
  { value: "print.", label: "Prints" },
];

const apiError = (e: any, f = "Something went wrong") => e?.response?.data?.message || e?.message || f;

export function AuditTrail() {
  const { toast } = useToast();
  const initial = rangeForPreset("last7");
  const [preset, setPreset] = useState<Preset>("last7");
  const [range, setRange] = useState(initial);
  const [category, setCategory] = useState("all");
  const [action, setAction] = useState("all");
  const [userId, setUserId] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ data: AuditRow[]; meta: { total: number; page: number; totalPages: number }; categories: { category: string; count: number }[]; users: { id: string; email: string }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AuditRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [range, category, action, userId, debounced]);

  const params = useMemo(
    () => ({
      ...(preset === "all" ? {} : { from: range.from, to: range.to }),
      ...(category !== "all" ? { category } : {}),
      ...(action !== "all" ? { action } : {}),
      ...(userId !== "all" ? { user_id: userId } : {}),
      ...(debounced ? { search: debounced } : {}),
    }),
    [preset, range, category, action, userId, debounced],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get("/audit", { params: { ...params, page, limit: 50 } });
      setData(r.data.data);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not load audit trail", description: apiError(error) });
    } finally {
      setLoading(false);
    }
  }, [params, page, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const pickPreset = (p: Preset) => {
    setPreset(p);
    if (p !== "custom" && p !== "all") setRange(rangeForPreset(p));
  };

  const exportExcel = async () => {
    try {
      const r = await apiClient.get("/audit", { params: { ...params, page: 1, limit: 200 } });
      const rows = (r.data.data.data as AuditRow[]).map((a) => ({
        Time: format(new Date(a.created_at), "yyyy-MM-dd HH:mm:ss"),
        User: a.user_email || "",
        Role: a.user_role || "",
        Category: CATEGORY[a.category]?.label || a.category,
        Action: a.action,
        Summary: a.summary,
        "Approved by": a.approved_by_email || "",
        Reference: a.entity_id || "",
        IP: a.ip || "",
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Audit trail");
      XLSX.writeFile(wb, `audit-trail-${range.from}-${range.to}.xlsx`);
    } catch (error) {
      toast({ variant: "destructive", title: "Export failed", description: apiError(error) });
    }
  };

  return (
    <div className="min-h-full bg-[#f8f6f2]">
      <div className="border-b border-gray-200/70 bg-white">
        <div className="flex flex-col gap-4 px-4 py-5 md:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="hidden h-11 w-11 items-center justify-center rounded-xl bg-[#2a2012] text-[#e9d3a4] shadow-sm sm:flex">
              <FileClock className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a67c2e]">Security</p>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Audit trail</h1>
              <p className="text-xs text-gray-500">Every sign-in, sale change, void, refund, price change, cash movement, approval and export</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-9" onClick={load} disabled={loading}>
              <RefreshCw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} />Refresh
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={exportExcel}>
              <Download className="mr-1.5 h-4 w-4" />Excel
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-5 md:px-6">
        <Panel
          icon={ShieldCheck}
          title="Activity"
          subtitle={data ? `${data.meta.total.toLocaleString()} entries` : "Loading…"}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Chips<Preset>
                size="xs"
                value={preset}
                onChange={pickPreset}
                options={[
                  { value: "today", label: "Today" },
                  { value: "last7", label: "7 days" },
                  { value: "thisMonth", label: "This month" },
                  { value: "last90", label: "90 days" },
                  { value: "all", label: "All" },
                  { value: "custom", label: "Custom" },
                ]}
              />
              {preset === "custom" ? (
                <div className="flex items-center gap-1">
                  <YmdDatePicker value={range.from} onChange={(v) => setRange((r) => ({ ...r, from: v }))} className="h-8 w-[136px] text-xs" />
                  <span className="text-xs text-gray-400">to</span>
                  <YmdDatePicker value={range.to} onChange={(v) => setRange((r) => ({ ...r, to: v }))} className="h-8 w-[136px] text-xs" />
                </div>
              ) : null}
            </div>
          }
        >
          <FilterBar>
            <SearchBox value={search} onChange={setSearch} placeholder="Search summary, user, bill no…" className="max-w-xs" />
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="h-9 w-[190px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{QUICK_ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-9 w-[200px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {(data?.users ?? []).filter((u) => u.id).map((u) => <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterBar>
          <FilterBar className="bg-white">
            <Chips
              size="xs"
              value={category}
              onChange={setCategory}
              options={[
                { value: "all", label: "All areas" },
                ...(data?.categories ?? []).map((c) => ({ value: c.category, label: CATEGORY[c.category]?.label || c.category, count: c.count })),
              ]}
            />
          </FilterBar>

          {!data ? (
            <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Bone key={i} className="h-11 rounded-lg" />)}</div>
          ) : data.data.length === 0 ? (
            <EmptyState icon={FileClock} title="No activity for these filters" description="Activity is recorded from now on for every user." />
          ) : (
            <div className={cn("divide-y divide-gray-50 transition-opacity", loading && "opacity-60")}>
              {data.data.map((a) => {
                const cat = CATEGORY[a.category] ?? CATEGORY.other;
                return (
                  <button key={a.id} type="button" onClick={() => setSelected(a)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-gray-50/70">
                    <div className="w-24 shrink-0 pt-0.5">
                      <p className="text-xs font-medium text-gray-800">{format(new Date(a.created_at), "HH:mm:ss")}</p>
                      <p className="text-[10px] text-gray-400">{format(new Date(a.created_at), "dd MMM yyyy")}</p>
                    </div>
                    <span className={cn("mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", cat.tone)}>{cat.label}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900">{a.summary}</p>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        <span className="font-mono">{a.action}</span>
                        {a.user_email ? ` · ${a.user_email}` : " · system"}
                        {a.user_role ? ` (${a.user_role.replace("_", " ").toLowerCase()})` : ""}
                      </p>
                    </div>
                    {a.approved_by_email ? (
                      <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200">
                        <UserCheck className="h-3 w-3" />approved by {a.approved_by_email.split("@")[0]}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
          {data && data.meta.totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-gray-100 px-5 py-2.5 text-xs text-gray-500">
              <span>Page {data.meta.page} of {data.meta.totalPages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" className="h-8" disabled={page >= data.meta.totalPages || loading} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          ) : null}
        </Panel>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="text-base">{selected.summary}</SheetTitle>
                <SheetDescription>
                  {format(new Date(selected.created_at), "EEEE dd MMM yyyy, HH:mm:ss")} · {formatDistanceToNow(new Date(selected.created_at), { addSuffix: true })}
                </SheetDescription>
              </SheetHeader>
              <dl className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200 text-sm">
                {[
                  ["Action", selected.action],
                  ["Area", CATEGORY[selected.category]?.label || selected.category],
                  ["User", selected.user_email || "system"],
                  ["Role", selected.user_role || "—"],
                  ["Approved by", selected.approved_by_email || "—"],
                  ["Record", selected.entity ? `${selected.entity}${selected.entity_id ? ` · ${selected.entity_id}` : ""}` : "—"],
                  ["IP address", selected.ip || "—"],
                  ["Device", selected.user_agent || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-3 px-3 py-2">
                    <dt className="w-28 shrink-0 text-gray-500">{k}</dt>
                    <dd className="min-w-0 break-words text-gray-900">{v}</dd>
                  </div>
                ))}
              </dl>
              {selected.details ? (
                <div className="mt-4">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Details</p>
                  <pre className="max-h-96 overflow-auto rounded-xl bg-gray-900 p-3 text-[11px] leading-relaxed text-gray-100">{JSON.stringify(selected.details, null, 2)}</pre>
                </div>
              ) : null}
              {loading ? <Loader2 className="mt-4 h-4 w-4 animate-spin text-gray-400" /> : null}
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
