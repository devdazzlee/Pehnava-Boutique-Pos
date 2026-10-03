"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Copy, Loader2, Save, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { usePermissions } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const rs = (v: number | null | undefined) => (v == null ? "—" : `Rs ${Math.round(v).toLocaleString("en-PK")}`);
const apiError = (e: unknown) => {
  const err = e as { response?: { data?: { message?: string } }; message?: string };
  return err?.response?.data?.message || err?.message || "Something went wrong";
};

type BvaRow = {
  accountId: string;
  code: string;
  name: string;
  control: string;
  subType: string;
  budget: number;
  actual: number;
  variance: number;
  usedPct: number | null;
  ytdBudget: number;
  ytdActual: number;
  ytdVariance: number;
  status: "OK" | "NEAR" | "OVER" | "NO_BUDGET" | "NONE";
};
type Bva = {
  year: number;
  month: number | null;
  rows: BvaRow[];
  monthly: { month: number; label: string; budget: number; actual: number }[];
  totals: { budget: number; actual: number; variance: number; ytdBudget: number; ytdActual: number; over: number; unbudgeted: number };
};
type BudgetAccount = { id: string; code: string; name: string; control: string; controlCode: string; subType: string; months: number[]; total: number };

const STATUS: Record<BvaRow["status"], { label: string; cls: string; bar: string }> = {
  OK: { label: "On track", cls: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" },
  NEAR: { label: "Near limit", cls: "bg-amber-50 text-amber-800", bar: "bg-amber-500" },
  OVER: { label: "Over budget", cls: "bg-rose-50 text-rose-700", bar: "bg-rose-600" },
  NO_BUDGET: { label: "No budget", cls: "bg-stone-100 text-stone-600", bar: "bg-stone-400" },
  NONE: { label: "—", cls: "bg-stone-50 text-stone-400", bar: "bg-stone-300" },
};

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" | "dark" }) {
  return (
    <div className={cn("min-w-0 rounded-xl border p-3.5", tone === "dark" ? "border-[#2a2012] bg-[#2a2012] text-white" : "border-stone-200 bg-white")}>
      <div className={cn("truncate text-xs", tone === "dark" ? "text-stone-300" : "text-stone-500")}>{label}</div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums", tone === "good" && "text-emerald-700", tone === "bad" && "text-rose-700")}>{value}</div>
      {hint && <div className={cn("mt-0.5 truncate text-xs", tone === "dark" ? "text-stone-400" : "text-stone-500")}>{hint}</div>}
    </div>
  );
}

export function Budgets() {
  const perms = usePermissions();
  const canEdit = perms.role === "SUPER_ADMIN" || perms.role === "ADMIN";
  const [tab, setTab] = useState<"bva" | "edit">("bva");
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2];

  return (
    <div className="min-h-full bg-[#f8f6f2] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#2a2012]">Budgets</h1>
            <p className="text-sm text-stone-500">Set a monthly budget for each expense head and see how actual spending compares.</p>
          </div>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-9 w-28 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="inline-flex rounded-xl border border-stone-200 bg-white p-1">
          {[
            { id: "bva" as const, label: "Budget vs actual" },
            ...(canEdit ? [{ id: "edit" as const, label: "Set budget" }] : []),
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn("rounded-lg px-4 py-2 text-sm font-medium", tab === t.id ? "bg-[#2a2012] text-white" : "text-stone-600 hover:bg-stone-100")}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "bva" ? <BudgetVsActual year={year} onEdit={canEdit ? () => setTab("edit") : undefined} /> : <BudgetEditor year={year} />}
      </div>
    </div>
  );
}

/* ====================================================================== */

function BudgetVsActual({ year, onEdit }: { year: number; onEdit?: () => void }) {
  const { toast } = useToast();
  const now = new Date();
  const [month, setMonth] = useState(year === now.getFullYear() ? String(now.getMonth() + 1) : "all");
  const [data, setData] = useState<Bva | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "OVER" | "NO_BUDGET">("all");

  useEffect(() => {
    setMonth(year === now.getFullYear() ? String(now.getMonth() + 1) : "all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  useEffect(() => {
    setLoading(true);
    apiClient
      .get("/finance/budget-vs-actual", { params: { year, month: month === "all" ? undefined : month } })
      .then((r) => setData(r.data.data))
      .catch((e) => toast({ variant: "destructive", title: "Could not load budget report", description: apiError(e) }))
      .finally(() => setLoading(false));
  }, [year, month, toast]);

  const rows = useMemo(() => (data ? (filter === "all" ? data.rows : data.rows.filter((r) => r.status === filter)) : []), [data, filter]);
  const periodLabel = month === "all" ? `Full year ${year}` : `${MONTHS[Number(month) - 1]} ${year}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <span className="text-sm text-stone-600">Period</span>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Full year</SelectItem>
            {MONTHS.map((m, i) => (
              <SelectItem key={m} value={String(i + 1)}>
                {m} {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
      </div>

      {!data ? (
        <div className="h-72 animate-pulse rounded-xl bg-stone-200/60" />
      ) : (
        <div className={cn("space-y-4", loading && "opacity-60")}>
          {data.totals.budget === 0 && data.totals.ytdBudget === 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#a67c2e]/30 bg-[#fcf8f2] px-4 py-3 text-sm text-stone-700">
              <span className="flex items-center gap-2">
                <Target className="h-4 w-4 text-[#a67c2e]" />
                No budget set for {year} yet — actual spending is shown so you can plan one.
              </span>
              {onEdit && (
                <Button size="sm" onClick={onEdit} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
                  Set budget
                </Button>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi tone="dark" label={`Budget · ${periodLabel}`} value={rs(data.totals.budget)} hint={month !== "all" ? `YTD ${rs(data.totals.ytdBudget)}` : undefined} />
            <Kpi label="Actual spending" value={rs(data.totals.actual)} hint={month !== "all" ? `YTD ${rs(data.totals.ytdActual)}` : undefined} />
            <Kpi
              label={data.totals.variance >= 0 ? "Under budget by" : "Over budget by"}
              value={rs(Math.abs(data.totals.variance))}
              tone={data.totals.budget ? (data.totals.variance >= 0 ? "good" : "bad") : undefined}
            />
            <Kpi label="Heads over budget" value={String(data.totals.over)} tone={data.totals.over ? "bad" : undefined} hint={`${data.totals.unbudgeted} with spending but no budget`} />
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-800">Month by month</h3>
              <div className="flex gap-4 text-xs text-stone-600">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#d6c7a8]" /> Budget
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#2a2012]" /> Actual
                </span>
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthly} barGap={2}>
                  <CartesianGrid vertical={false} stroke="#eee" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v)} tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip formatter={(v: number, n: string) => [rs(v), n === "budget" ? "Budget" : "Actual"]} cursor={{ fill: "#f5f5f4" }} />
                  <Bar dataKey="budget" fill="#d6c7a8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" fill="#2a2012" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-stone-800">By expense head · {periodLabel}</h3>
              <div className="flex gap-1.5">
                {(
                  [
                    ["all", `All (${data.rows.length})`],
                    ["OVER", `Over budget (${data.totals.over})`],
                    ["NO_BUDGET", `No budget (${data.totals.unbudgeted})`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setFilter(id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium",
                      filter === id ? "border-[#2a2012] bg-[#2a2012] text-white" : "border-stone-200 text-stone-600 hover:border-[#a67c2e]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-stone-500">Nothing to show.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="text-xs text-stone-500">
                    <tr className="border-b border-stone-100">
                      <th className="px-4 py-2 text-left font-medium">Expense head</th>
                      <th className="px-3 py-2 text-right font-medium">Budget</th>
                      <th className="px-3 py-2 text-right font-medium">Actual</th>
                      <th className="w-48 px-3 py-2 text-left font-medium">Used</th>
                      <th className="px-3 py-2 text-right font-medium">Remaining</th>
                      {month !== "all" && <th className="px-4 py-2 text-right font-medium">YTD actual / budget</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.accountId} className="border-b border-stone-50">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-stone-800">{r.name}</div>
                          <div className="text-xs text-stone-500">
                            {r.code} · {r.control}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.budget ? rs(r.budget) : "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{rs(r.actual)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded-full bg-stone-100">
                              <div className={cn("h-2 rounded-full", STATUS[r.status].bar)} style={{ width: `${Math.min(100, r.usedPct ?? (r.actual > 0 ? 100 : 0))}%` }} />
                            </div>
                            <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium", STATUS[r.status].cls)}>
                              {r.usedPct != null ? `${Math.round(r.usedPct)}%` : STATUS[r.status].label}
                            </span>
                          </div>
                        </td>
                        <td className={cn("px-3 py-2.5 text-right tabular-nums font-medium", r.variance < 0 ? "text-rose-700" : "text-stone-700")}>
                          {r.budget ? (r.variance < 0 ? `−${rs(-r.variance)}` : rs(r.variance)) : "—"}
                        </td>
                        {month !== "all" && (
                          <td className="px-4 py-2.5 text-right text-xs tabular-nums text-stone-600">
                            {rs(r.ytdActual)} / {r.ytdBudget ? rs(r.ytdBudget) : "—"}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ====================================================================== */

function BudgetEditor({ year }: { year: number }) {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<BudgetAccount[] | null>(null);
  const [grid, setGrid] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setAccounts(null);
    try {
      const r = await apiClient.get("/finance/budgets", { params: { year } });
      const list: BudgetAccount[] = r.data.data.accounts;
      setAccounts(list);
      setGrid(Object.fromEntries(list.map((a) => [a.id, a.months.map((v) => (v ? String(v) : ""))])));
    } catch (e) {
      toast({ variant: "destructive", title: "Could not load budget", description: apiError(e) });
      setAccounts([]);
    }
  }, [year, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const changes = useMemo(() => {
    if (!accounts) return [];
    const out: { accountId: string; month: number; amount: number }[] = [];
    for (const a of accounts) {
      const row = grid[a.id] || [];
      a.months.forEach((orig, i) => {
        const next = Number(row[i] || 0);
        if (Math.abs(next - orig) > 0.004) out.push({ accountId: a.id, month: i + 1, amount: next });
      });
    }
    return out;
  }, [accounts, grid]);

  const setCell = (id: string, i: number, v: string) => setGrid((g) => ({ ...g, [id]: (g[id] || Array(12).fill("")).map((x, j) => (j === i ? v.replace(/[^0-9.]/g, "") : x)) }));
  const fillRow = (id: string) => {
    const first = (grid[id] || []).find((v) => v && Number(v) > 0);
    const v = window.prompt("Monthly amount for every month", first || "");
    if (v == null) return;
    const clean = v.replace(/[^0-9.]/g, "");
    setGrid((g) => ({ ...g, [id]: Array(12).fill(clean) }));
  };

  const save = async () => {
    if (!changes.length) return;
    setSaving(true);
    try {
      await apiClient.put("/finance/budgets", { year, rows: changes });
      toast({ title: "Budget saved", description: `${changes.length} cells updated` });
      await load();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not save budget", description: apiError(e) });
    } finally {
      setSaving(false);
    }
  };

  const visible = (accounts ?? []).filter((a) => !search.trim() || `${a.code} ${a.name} ${a.control}`.toLowerCase().includes(search.trim().toLowerCase()));
  const groups = [...new Set(visible.map((a) => a.control))];
  const rowTotal = (id: string) => (grid[id] || []).reduce((t, v) => t + (Number(v) || 0), 0);
  const monthTotal = (i: number) => (accounts ?? []).reduce((t, a) => t + (Number(grid[a.id]?.[i]) || 0), 0);
  const grand = Array.from({ length: 12 }, (_, i) => monthTotal(i)).reduce((t, v) => t + v, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search expense head…" className="h-9 max-w-xs" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-stone-600">
            Year total <b className="tabular-nums text-stone-900">{rs(grand)}</b>
          </span>
          <Button size="sm" variant="outline" onClick={() => setCopyOpen(true)}>
            <Copy className="mr-1.5 h-4 w-4" />
            Copy from {year - 1}
          </Button>
          <Button size="sm" onClick={save} disabled={!changes.length || saving} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Save{changes.length ? ` (${changes.length})` : ""}
          </Button>
        </div>
      </div>

      {!accounts ? (
        <div className="h-96 animate-pulse rounded-xl bg-stone-200/60" />
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500">No expense accounts found in the Chart of Accounts.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="sticky top-0 bg-stone-50 text-xs text-stone-500">
              <tr>
                <th className="sticky left-0 z-10 w-56 bg-stone-50 px-3 py-2 text-left font-medium">Expense head</th>
                {MONTHS.map((m) => (
                  <th key={m} className="px-1 py-2 text-right font-medium">
                    {m}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Year</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <FragmentRows key={g}>
                  <tr className="bg-[#fcf8f2]">
                    <td colSpan={14} className="sticky left-0 px-3 py-1.5 text-xs font-semibold text-[#8f6a26]">
                      {g}
                    </td>
                  </tr>
                  {visible
                    .filter((a) => a.control === g)
                    .map((a) => (
                      <tr key={a.id} className="border-t border-stone-100">
                        <td className="sticky left-0 z-10 bg-white px-3 py-1">
                          <button onClick={() => fillRow(a.id)} className="text-left" title="Click to fill all 12 months">
                            <div className="truncate font-medium text-stone-800">{a.name}</div>
                            <div className="text-[11px] text-stone-400">{a.code} · fill row</div>
                          </button>
                        </td>
                        {MONTHS.map((m, i) => {
                          const changed = Math.abs(Number(grid[a.id]?.[i] || 0) - a.months[i]) > 0.004;
                          return (
                            <td key={m} className="px-1 py-1">
                              <input
                                inputMode="decimal"
                                value={grid[a.id]?.[i] ?? ""}
                                onChange={(e) => setCell(a.id, i, e.target.value)}
                                placeholder="0"
                                className={cn(
                                  "h-8 w-full min-w-[64px] rounded-md border px-1.5 text-right text-sm tabular-nums outline-none focus:border-[#a67c2e] focus:ring-1 focus:ring-[#a67c2e]",
                                  changed ? "border-[#a67c2e] bg-[#fcf8f2]" : "border-transparent hover:border-stone-200",
                                )}
                              />
                            </td>
                          );
                        })}
                        <td className="px-3 py-1 text-right font-semibold tabular-nums">{rs(rowTotal(a.id))}</td>
                      </tr>
                    ))}
                </FragmentRows>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-stone-200 bg-stone-50 font-semibold">
              <tr>
                <td className="sticky left-0 bg-stone-50 px-3 py-2">Total</td>
                {MONTHS.map((m, i) => (
                  <td key={m} className="px-1 py-2 text-right text-xs tabular-nums">
                    {Math.round(monthTotal(i)).toLocaleString("en-PK")}
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums">{rs(grand)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {changes.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5" /> {changes.length} unsaved change{changes.length > 1 ? "s" : ""}
        </div>
      )}
      <CopyDialog open={copyOpen} onOpenChange={setCopyOpen} year={year} onDone={load} />
    </div>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function CopyDialog({ open, onOpenChange, year, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; year: number; onDone: () => void }) {
  const { toast } = useToast();
  const [pct, setPct] = useState("0");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Copy {year - 1} budget</DialogTitle>
          <DialogDescription>Fills {year} with last year&apos;s budget. Existing {year} amounts for the same heads are replaced.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Increase / decrease by (%)</Label>
          <Input type="number" value={pct} onChange={(e) => setPct(e.target.value)} />
          <p className="text-xs text-stone-500">e.g. 10 for 10% more (inflation), −5 to cut 5%.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            className="bg-[#2a2012] hover:bg-[#3a2e1c]"
            onClick={async () => {
              setBusy(true);
              try {
                await apiClient.post("/finance/budgets/copy", { fromYear: year - 1, toYear: year, adjustPct: Number(pct) || 0 });
                toast({ title: "Budget copied" });
                onOpenChange(false);
                onDone();
              } catch (e) {
                toast({ variant: "destructive", title: "Could not copy", description: apiError(e) });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
