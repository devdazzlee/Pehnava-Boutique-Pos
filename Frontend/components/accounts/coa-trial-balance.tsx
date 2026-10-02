"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Info, Loader2, Printer, Scale, SearchX } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Bone, Chips, EmptyState, FilterBar, FilterLabel, MultiChips, Panel, SearchBox, StatTile } from "./coa-ui";
import {
  TYPE_OPTIONS,
  TYPE_STYLE,
  apiError,
  coaApi,
  escapeHtml,
  includesText,
  money,
  moneyOrDash,
  printDocument,
  type CoaFilters,
} from "./coa-shared";

type TrialRow = {
  id: string;
  code: string;
  name: string;
  type_code: number;
  type_name: string;
  sub_type: string | null;
  control: string | null;
  debit: number;
  credit: number;
};

type TrialData = {
  period: { from: string; to: string };
  rows: TrialRow[];
  balancing: { label: string; note: string; debit: number; credit: number } | null;
  totals: { debit: number; credit: number; balanced: boolean; rawDifference: number };
};

type View = "grouped" | "flat";
type Side = "all" | "debit" | "credit";

/** Trial balance at transactional-account level. */
export function CoaTrialBalance({
  filters,
  periodLabel,
  branchLabel,
  refreshKey,
  onOpenLedger,
}: {
  filters: CoaFilters;
  periodLabel: string;
  branchLabel: string;
  refreshKey: number;
  onOpenLedger: (accountId: string) => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<TrialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("grouped");
  const [side, setSide] = useState<Side>("all");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    coaApi
      .trial(filters)
      .then((res) => alive && setData(res))
      .catch((error) => toast({ variant: "destructive", title: "Could not load trial balance", description: apiError(error) }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [filters, refreshKey, toast]);

  const rows = useMemo(
    () =>
      (data?.rows ?? [])
        .filter((r) => !types.length || types.includes(String(r.type_code)))
        .filter((r) => side === "all" || (side === "debit" ? r.debit > 0 : r.credit > 0))
        .filter((r) => r.code.startsWith(search.trim()) || includesText([r.name, r.control, r.sub_type], search)),
    [data, types, side, search],
  );

  const groups = useMemo(() => {
    const out: { code: string; control: string; typeCode: number; rows: TrialRow[]; debit: number; credit: number }[] = [];
    for (const row of rows) {
      const code = row.code.slice(0, 3);
      let group = out.find((g) => g.code === code);
      if (!group) {
        group = { code, control: row.control || code, typeCode: row.type_code, rows: [], debit: 0, credit: 0 };
        out.push(group);
      }
      group.rows.push(row);
      group.debit += row.debit;
      group.credit += row.credit;
    }
    return out;
  }, [rows]);

  const byType = useMemo(
    () =>
      TYPE_OPTIONS.map((t) => {
        const list = (data?.rows ?? []).filter((r) => String(r.type_code) === t.value);
        return { ...t, debit: list.reduce((s, r) => s + r.debit, 0), credit: list.reduce((s, r) => s + r.credit, 0) };
      }),
    [data],
  );

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Bone key={i} className="h-20 rounded-xl" />)}
        </div>
        <Bone className="h-96 rounded-xl" />
      </div>
    );
  }
  if (!data) return null;

  const isFiltered = types.length > 0 || side !== "all" || !!search.trim();
  const shownDebit = rows.reduce((s, r) => s + r.debit, 0);
  const shownCredit = rows.reduce((s, r) => s + r.credit, 0);

  const print = () => {
    const line = (r: TrialRow, indent: boolean) =>
      `<tr><td>${r.code}</td><td${indent ? ' style="padding-left:20px"' : ""}>${escapeHtml(r.name)}</td><td class="r">${moneyOrDash(r.debit)}</td><td class="r">${moneyOrDash(r.credit)}</td></tr>`;
    const body =
      view === "grouped"
        ? groups.map((g) => `<tr class="l3"><td>${g.code}</td><td colspan="3">${escapeHtml(g.control)}</td></tr>` + g.rows.map((r) => line(r, true)).join("")).join("")
        : rows.map((r) => line(r, false)).join("");
    const balancing =
      data.balancing && !isFiltered
        ? `<tr><td></td><td>${escapeHtml(data.balancing.label)}</td><td class="r">${moneyOrDash(data.balancing.debit)}</td><td class="r">${moneyOrDash(data.balancing.credit)}</td></tr>`
        : "";
    const totalD = isFiltered ? shownDebit : data.totals.debit;
    const totalC = isFiltered ? shownCredit : data.totals.credit;
    printDocument(
      "Trial Balance (Chart of Accounts)",
      `${periodLabel} · ${branchLabel}`,
      `<table><thead><tr><th>Code</th><th>Account</th><th class="r">Debit</th><th class="r">Credit</th></tr></thead><tbody>${body}${balancing}</tbody>
      <tfoot><tr><td colspan="2">Total${isFiltered ? " (filtered)" : ""}</td><td class="r">${money(totalD)}</td><td class="r">${money(totalC)}</td></tr></tfoot></table>`,
    );
  };

  const exportExcel = () => {
    const out = rows.map((r) => ({ Code: r.code, Account: r.name, Type: r.type_name, "Sub type": r.sub_type, Control: r.control, Debit: r.debit, Credit: r.credit }));
    if (data.balancing && !isFiltered) {
      out.push({ Code: "", Account: data.balancing.label, Type: "Equity", "Sub type": "", Control: "", Debit: data.balancing.debit, Credit: data.balancing.credit });
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out), "Trial Balance");
    XLSX.writeFile(wb, `coa-trial-balance-${data.period.to}.xlsx`);
  };

  const accountRow = (r: TrialRow, indent: boolean) => (
    <tr key={r.id} onClick={() => onOpenLedger(r.id)} className="group cursor-pointer border-b border-gray-50 hover:bg-sky-50/50">
      <td className="px-5 py-2.5 font-mono text-xs text-gray-400">{r.code}</td>
      <td className={cn("px-4 py-2.5 text-gray-800 group-hover:text-sky-700", indent && "pl-10")}>
        {r.name}
        {!indent ? <span className="ml-2 text-[11px] text-gray-400">{r.control}</span> : null}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">{moneyOrDash(r.debit)}</td>
      <td className="px-5 py-2.5 text-right tabular-nums">{moneyOrDash(r.credit)}</td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total debit" value={money(data.totals.debit)} />
        <StatTile label="Total credit" value={money(data.totals.credit)} />
        <StatTile label="Accounts with balance" value={data.rows.length} hint={`${groups.length} control accounts shown`} />
        <StatTile
          label="Status"
          tone={data.totals.balanced ? "good" : "bad"}
          value={
            <span className={cn("inline-flex items-center gap-1.5", data.totals.balanced ? "text-emerald-700" : "text-rose-700")}>
              {data.totals.balanced ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {data.totals.balanced ? "Balanced" : "Not balanced"}
            </span>
          }
          hint={data.balancing ? `Includes ${money(data.balancing.debit || data.balancing.credit)} equity balancing line` : "Debits equal credits"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <Panel
          icon={Scale}
          title="Trial balance by account"
          subtitle={`${periodLabel} · ${branchLabel}`}
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
            <SearchBox value={search} onChange={setSearch} placeholder="Find account or control…" className="max-w-xs" />
            <MultiChips options={TYPE_OPTIONS.map((t) => ({ ...t }))} value={types} onChange={setTypes} allLabel="All types" />
          </FilterBar>
          <FilterBar className="bg-white">
            <FilterLabel>View</FilterLabel>
            <Chips<View>
              size="xs"
              value={view}
              onChange={setView}
              options={[
                { value: "grouped", label: "Grouped by control" },
                { value: "flat", label: "Flat list" },
              ]}
            />
            <FilterLabel>Side</FilterLabel>
            <Chips<Side>
              size="xs"
              value={side}
              onChange={setSide}
              options={[
                { value: "all", label: "Both" },
                { value: "debit", label: "Debit balances" },
                { value: "credit", label: "Credit balances" },
              ]}
            />
            {isFiltered ? (
              <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => { setTypes([]); setSide("all"); setSearch(""); }}>
                Clear filters
              </Button>
            ) : null}
          </FilterBar>

          {rows.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={data.rows.length ? "No accounts match these filters" : "No balances for this period"}
              description={data.rows.length ? "Try another type or clear the search." : "Pick a wider date range at the top of the page."}
            />
          ) : (
            <div className="max-h-[68vh] overflow-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <th className="w-28 px-5 py-2.5">Code</th>
                    <th className="px-4 py-2.5">Account</th>
                    <th className="w-40 px-4 py-2.5 text-right">Debit</th>
                    <th className="w-40 px-5 py-2.5 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {view === "grouped"
                    ? groups.map((g) => (
                        <GroupBlock key={g.code} group={g}>
                          {g.rows.map((r) => accountRow(r, true))}
                        </GroupBlock>
                      ))
                    : rows.map((r) => accountRow(r, false))}
                  {data.balancing && !isFiltered ? (
                    <tr className="border-b border-violet-100 bg-violet-50/50">
                      <td className="px-5 py-2.5 font-mono text-xs text-gray-400">—</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 font-medium text-gray-800">
                          {data.balancing.label}
                          <span title={data.balancing.note}>
                            <Info className="h-3.5 w-3.5 text-violet-500" />
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{moneyOrDash(data.balancing.debit)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{moneyOrDash(data.balancing.credit)}</td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot className="sticky bottom-0">
                  <tr className="bg-[#2a2012] font-semibold text-white">
                    <td className="px-5 py-3" colSpan={2}>{isFiltered ? "Total (filtered)" : "Total"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(isFiltered ? shownDebit : data.totals.debit)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{money(isFiltered ? shownCredit : data.totals.credit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="By account type" bodyClassName="divide-y divide-gray-50">
            {byType.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTypes(types.length === 1 && types[0] === t.value ? [] : [t.value])}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-gray-50",
                  types.length === 1 && types[0] === t.value && "bg-[#fcf8f2]",
                )}
              >
                <span className={cn("h-2.5 w-2.5 rounded-full", t.dot)} />
                <span className="flex-1 font-medium text-gray-800">{t.label}</span>
                <span className="text-right text-xs tabular-nums">
                  {t.debit ? <span className="block text-gray-900">Dr {moneyOrDash(t.debit)}</span> : null}
                  {t.credit ? <span className="block text-emerald-700">Cr {moneyOrDash(t.credit)}</span> : null}
                  {!t.debit && !t.credit ? <span className="text-gray-300">—</span> : null}
                </span>
              </button>
            ))}
          </Panel>
          {data.balancing ? (
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 text-xs leading-relaxed text-violet-900">
              <p className="mb-1 flex items-center gap-1.5 font-semibold">
                <Info className="h-4 w-4" />About the balancing line
              </p>
              {data.balancing.note} Record owner capital and opening balances with journal vouchers to shrink it.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GroupBlock({
  group,
  children,
}: {
  group: { code: string; control: string; typeCode: number; debit: number; credit: number };
  children: React.ReactNode;
}) {
  return (
    <>
      <tr className="border-b border-gray-100 bg-[#fcf8f2]">
        <td className="px-5 py-2 font-mono text-xs text-gray-500">{group.code}</td>
        <td className="px-4 py-2 font-semibold text-gray-800">
          <span className={cn("mr-2 inline-block h-2 w-2 rounded-full", TYPE_STYLE[group.typeCode]?.dot)} />
          {group.control}
        </td>
        <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums text-gray-600">{moneyOrDash(group.debit)}</td>
        <td className="px-5 py-2 text-right text-xs font-semibold tabular-nums text-gray-600">{moneyOrDash(group.credit)}</td>
      </tr>
      {children}
    </>
  );
}
