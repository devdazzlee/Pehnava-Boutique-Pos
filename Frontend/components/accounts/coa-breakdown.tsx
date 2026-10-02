"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { BarChart3, ChevronDown, ChevronRight, Download, Link2, Loader2, PieChart, Printer, SearchX, Trophy } from "lucide-react";
import * as XLSX from "xlsx";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Bone, Chips, EmptyState, FilterBar, FilterLabel, MultiChips, Panel, SearchBox } from "./coa-ui";
import { apiError, coaApi, compact, escapeHtml, includesText, money, moneyOrDash, printDocument, type CoaFilters } from "./coa-shared";

type BreakdownAccount = { id: string; code: string; name: string; linked: string | null; amount: number; entries: number; percent: number };
type BreakdownControl = { id: string; code: string; name: string; amount: number; percent: number; entries: number; accounts: BreakdownAccount[] };
type Breakdown = {
  period: { from: string; to: string };
  total: number;
  subTypes: { id: string; code: string; name: string; amount: number; percent: number; controls: BreakdownControl[] }[];
  topAccounts: (BreakdownAccount & { control: string })[];
  daily?: { date: string; amount: number }[];
  monthly: { month: string; total: number; byControl: { id: string; name: string; amount: number }[] }[];
};

type Sort = "amount" | "code" | "name";
type Grain = "daily" | "monthly";

const BAR = "#a67c2e";

export function CoaBreakdown({
  filters,
  periodLabel,
  branchLabel,
  onOpenLedger,
  refreshKey,
}: {
  filters: CoaFilters;
  periodLabel: string;
  branchLabel: string;
  onOpenLedger: (accountId: string) => void;
  refreshKey: number;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<Breakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showEmpty, setShowEmpty] = useState(false);
  const [heads, setHeads] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("amount");
  const spanDays = differenceInCalendarDays(parseISO(filters.to), parseISO(filters.from)) + 1;
  const [grain, setGrain] = useState<Grain>(spanDays <= 62 ? "daily" : "monthly");

  useEffect(() => setGrain(spanDays <= 62 ? "daily" : "monthly"), [spanDays]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    coaApi
      .breakdown(filters)
      .then((res) => alive && setData(res))
      .catch((error) => toast({ variant: "destructive", title: "Could not load expense breakdown", description: apiError(error) }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [filters, refreshKey, toast]);

  const allControls = useMemo(() => (data ? data.subTypes.flatMap((s) => s.controls) : []), [data]);

  const view = useMemo(() => {
    if (!data) return [];
    const sorter = <T extends { amount: number; code: string; name: string }>(a: T, b: T) =>
      sort === "amount" ? b.amount - a.amount || a.code.localeCompare(b.code) : sort === "code" ? a.code.localeCompare(b.code) : a.name.localeCompare(b.name);
    return data.subTypes
      .map((sub) => {
        const controls = sub.controls
          .filter((c) => !heads.length || heads.includes(c.id))
          .map((c) => {
            const accounts = c.accounts
              .filter((a) => showEmpty || Math.abs(a.amount) > 0.005)
              .filter((a) => a.code.startsWith(search.trim()) || includesText([a.name], search) || includesText([c.name], search))
              .sort(sorter);
            return { ...c, accounts, shownAmount: accounts.reduce((s, a) => s + a.amount, 0) };
          })
          .filter((c) => (showEmpty && !search.trim()) || c.accounts.length > 0)
          .sort(sorter);
        return { ...sub, controls, shownAmount: controls.reduce((s, c) => s + c.shownAmount, 0) };
      })
      .filter((s) => s.controls.length > 0);
  }, [data, heads, showEmpty, search, sort]);

  const shownTotal = view.reduce((s, sub) => s + sub.shownAmount, 0);
  const isFiltered = heads.length > 0 || !!search.trim();

  const trend = useMemo(() => {
    if (!data) return [];
    if (grain === "monthly") return data.monthly.map((m) => ({ label: format(parseISO(`${m.month}-01`), "MMM yy"), amount: m.total, detail: m.byControl }));
    const byDay = new Map((data.daily ?? []).map((d) => [d.date, d.amount]));
    const days = Math.min(spanDays, 62);
    const start = spanDays > 62 ? addDays(parseISO(filters.to), -61) : parseISO(filters.from);
    return Array.from({ length: days }, (_, i) => {
      const date = format(addDays(start, i), "yyyy-MM-dd");
      return { label: format(parseISO(date), "dd MMM"), amount: byDay.get(date) ?? 0, detail: [] as { id: string; name: string; amount: number }[] };
    });
  }, [data, grain, spanDays, filters.from, filters.to]);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Bone key={i} className="h-24 rounded-xl" />)}
        </div>
        <Bone className="h-96 rounded-xl" />
      </div>
    );
  }
  if (!data) return null;

  const keyControls = [...allControls].filter((c) => c.amount > 0.005).sort((a, b) => b.amount - a.amount);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const print = () => {
    const rows = view
      .map(
        (s) =>
          `<tr class="l2"><td>${s.code}</td><td>${escapeHtml(s.name)}</td><td class="r">${moneyOrDash(s.shownAmount)}</td></tr>` +
          s.controls
            .map(
              (c) =>
                `<tr class="l3"><td>${c.code}</td><td style="padding-left:22px">${escapeHtml(c.name)}</td><td class="r">${moneyOrDash(c.shownAmount)}</td></tr>` +
                c.accounts
                  .map((a) => `<tr><td>${a.code}</td><td style="padding-left:36px">${escapeHtml(a.name)}</td><td class="r">${moneyOrDash(a.amount)}</td></tr>`)
                  .join(""),
            )
            .join(""),
      )
      .join("");
    printDocument(
      "Expense Breakdown",
      `${periodLabel} · ${branchLabel}`,
      `<table><thead><tr><th>Code</th><th>Expense head</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td colspan="2">Total${isFiltered ? " (filtered)" : ""}</td><td class="r">${moneyOrDash(shownTotal)}</td></tr></tfoot></table>`,
    );
  };

  const exportExcel = () => {
    const rows = view.flatMap((s) =>
      s.controls.flatMap((c) =>
        c.accounts.map((a) => ({
          "Sub type": `${s.code} ${s.name}`,
          Control: `${c.code} ${c.name}`,
          Code: a.code,
          Account: a.name,
          Postings: a.entries,
          Amount: a.amount,
          "Share %": a.percent,
        })),
      ),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Expense Breakdown");
    XLSX.writeFile(wb, `expense-breakdown-${data.period.to}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* headline cards */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="col-span-2 rounded-xl border border-[#a67c2e]/30 bg-gradient-to-br from-[#2a2012] to-[#4a3a20] p-4 text-white shadow-sm xl:col-span-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Total expenses</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{money(data.total)}</p>
          <p className="mt-0.5 text-[11px] text-white/60">{periodLabel}</p>
        </div>
        {keyControls.slice(0, 3).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setHeads([c.id])}
            className="rounded-xl border border-gray-200/80 bg-white p-4 text-left shadow-sm transition-all hover:border-[#a67c2e]/40 hover:shadow-md"
          >
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {c.code} · {c.name}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{money(c.amount)}</p>
            <div className="mt-2 h-1.5 rounded-full bg-gray-100">
              <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, c.percent)}%`, background: BAR }} />
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              {c.percent}% of expenses · {c.entries} posting{c.entries === 1 ? "" : "s"}
            </p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Panel
          icon={PieChart}
          title="Breakdown by expense head"
          subtitle={isFiltered ? `Showing ${money(shownTotal)} of ${money(data.total)}` : "Sub type › control › account"}
          actions={
            <>
              {loading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : null}
              <Button size="sm" variant="outline" className="h-8" onClick={print}>
                <Printer className="mr-1 h-4 w-4" />Print
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={exportExcel}>
                <Download className="mr-1 h-4 w-4" />Excel
              </Button>
            </>
          }
        >
          <FilterBar>
            <SearchBox value={search} onChange={setSearch} placeholder="Find an expense account…" className="max-w-xs" />
            <MultiChips
              allLabel="All heads"
              value={heads}
              onChange={setHeads}
              options={allControls
                .filter((c) => c.amount > 0.005 || showEmpty)
                .map((c) => ({ value: c.id, label: c.name, count: c.entries }))}
            />
          </FilterBar>
          <FilterBar className="bg-white">
            <FilterLabel>Sort</FilterLabel>
            <Chips<Sort>
              size="xs"
              value={sort}
              onChange={setSort}
              options={[
                { value: "amount", label: "Highest amount" },
                { value: "code", label: "Code" },
                { value: "name", label: "Name A–Z" },
              ]}
            />
            <label className="ml-auto flex items-center gap-2 text-xs text-gray-600">
              <Switch checked={showEmpty} onCheckedChange={setShowEmpty} />
              Show heads with no expense
            </label>
          </FilterBar>

          {view.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={data.total > 0 ? "No expense heads match these filters" : "No expenses in this period"}
              description={data.total > 0 ? "Clear the search or pick other heads." : "Record expenses in the Expenses module or pick a wider date range."}
              action={
                isFiltered ? (
                  <Button size="sm" variant="outline" onClick={() => { setHeads([]); setSearch(""); }}>
                    Clear filters
                  </Button>
                ) : null
              }
            />
          ) : (
            <div>
              {view.map((sub) => (
                <div key={sub.id}>
                  <div className="flex items-center justify-between bg-[#f3ead8] px-5 py-2 text-sm font-semibold text-gray-900">
                    <span>
                      <span className="mr-1.5 font-mono text-xs text-gray-500">{sub.code}</span>
                      {sub.name}
                    </span>
                    <span className="tabular-nums">
                      {money(sub.shownAmount)}
                      {data.total > 0 ? (
                        <span className="ml-1.5 text-xs font-normal text-gray-500">{((sub.shownAmount / data.total) * 100).toFixed(1)}%</span>
                      ) : null}
                    </span>
                  </div>
                  {sub.controls.map((control) => {
                    const isCollapsed = collapsed.has(control.id);
                    return (
                      <div key={control.id} className="border-b border-gray-100 last:border-0">
                        <button
                          type="button"
                          onClick={() => toggle(control.id)}
                          className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm transition-colors hover:bg-[#fcf8f2]"
                        >
                          {isCollapsed ? <ChevronRight className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                          <span className="font-mono text-xs text-gray-400">{control.code}</span>
                          <span className="font-semibold text-gray-800">{control.name}</span>
                          <span className="rounded-full bg-gray-100 px-1.5 text-[10px] text-gray-500">{control.accounts.length}</span>
                          <span className="ml-auto font-semibold tabular-nums text-gray-900">{money(control.shownAmount)}</span>
                          <span className="w-12 text-right text-xs tabular-nums text-gray-500">{control.percent}%</span>
                        </button>
                        {!isCollapsed ? (
                          <div className="pb-2">
                            {control.accounts.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => onOpenLedger(a.id)}
                                title={`${a.code} ${a.name}: ${money(a.amount)} · ${a.percent}% · ${a.entries} posting(s) — open ledger`}
                                className="group grid w-full grid-cols-[4.5rem_1fr_auto] items-center gap-x-3 py-2 pl-11 pr-5 text-left text-sm transition-colors hover:bg-sky-50/50 sm:grid-cols-[4.5rem_minmax(9rem,15rem)_1fr_auto]"
                              >
                                <span className="font-mono text-[11px] text-gray-400">{a.code}</span>
                                <span className="flex min-w-0 items-center gap-1.5 truncate text-gray-800 group-hover:text-sky-700">
                                  <span className="truncate">{a.name}</span>
                                  {a.linked === "EMPLOYEE" ? <Link2 className="h-3 w-3 shrink-0 text-sky-500" /> : null}
                                  <span className="shrink-0 text-[10px] text-gray-400">{a.entries ? `${a.entries}×` : ""}</span>
                                </span>
                                <span className="hidden h-2 overflow-hidden rounded-full bg-gray-100 sm:block">
                                  <span className="block h-2 rounded-full" style={{ width: `${Math.min(100, Math.max(0, a.percent))}%`, background: BAR }} />
                                </span>
                                <span className="text-right tabular-nums">
                                  <span className="font-medium text-gray-900">{moneyOrDash(a.amount)}</span>
                                  <span className="ml-2 inline-block w-11 text-[11px] text-gray-500">{a.percent ? `${a.percent}%` : ""}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className="flex items-center justify-between bg-[#2a2012] px-5 py-3 text-sm font-semibold text-white">
                <span>{isFiltered ? "Total (filtered)" : "Total expenses"}</span>
                <span className="tabular-nums">{money(shownTotal)}</span>
              </div>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel
            icon={BarChart3}
            title="Expense trend"
            subtitle={grain === "daily" ? (spanDays > 62 ? "Last 62 days of the range" : "Per day") : "Per month"}
            actions={
              <Chips<Grain>
                size="xs"
                value={grain}
                onChange={setGrain}
                options={[
                  { value: "daily", label: "Daily" },
                  { value: "monthly", label: "Monthly" },
                ]}
              />
            }
            bodyClassName="p-4"
          >
            {trend.every((t) => !t.amount) ? (
              <p className="py-10 text-center text-xs text-gray-400">No dated expenses in this period.</p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#f0ede6" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      minTickGap={16}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      allowDecimals={false}
                      tickCount={4}
                      tickFormatter={compact}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(166,124,46,0.08)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload as (typeof trend)[number];
                        return (
                          <div className="min-w-[160px] rounded-lg border border-gray-200 bg-white p-2.5 text-xs shadow-lg">
                            <p className="font-semibold text-gray-900">{row.label}</p>
                            <p className="tabular-nums text-gray-700">{money(row.amount)}</p>
                            {row.detail
                              .filter((d) => Math.abs(d.amount) > 0.005)
                              .sort((a, b) => b.amount - a.amount)
                              .map((d) => (
                                <p key={d.id} className="mt-0.5 flex justify-between gap-3 text-gray-500">
                                  <span className="truncate">{d.name}</span>
                                  <span className="tabular-nums">{compact(d.amount)}</span>
                                </p>
                              ))}
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="amount" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={grain === "daily" ? 14 : 32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-2 text-[11px] text-gray-400">Cost of goods sold is in the totals but not split by date.</p>
          </Panel>

          <Panel icon={Trophy} title="Top expense accounts" bodyClassName="p-4">
            {data.topAccounts.length === 0 ? (
              <p className="py-6 text-center text-xs text-gray-400">No expenses in this period.</p>
            ) : (
              <ol className="space-y-3">
                {data.topAccounts.map((a, index) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => onOpenLedger(a.id)} className="group block w-full text-left">
                      <div className="flex items-baseline gap-2 text-sm">
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                            index === 0 ? "bg-[#a67c2e] text-white" : "bg-gray-100 text-gray-500",
                          )}
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-gray-800 group-hover:text-sky-700">{a.name}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-gray-900">{money(a.amount)}</span>
                      </div>
                      <div className="ml-7 mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                          <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, a.percent)}%`, background: BAR }} />
                        </div>
                        <span className="w-24 truncate text-right text-[10px] text-gray-400">{a.control}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
