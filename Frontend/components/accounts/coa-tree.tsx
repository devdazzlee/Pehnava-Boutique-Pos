"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Download, FileSpreadsheet, Link2, Lock, Printer, SearchX } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Chips, EmptyState, FilterBar, FilterLabel, MultiChips, Panel, SearchBox } from "./coa-ui";
import {
  TYPE_OPTIONS,
  TYPE_STYLE,
  balanceLabel,
  escapeHtml,
  includesText,
  moneyOrDash,
  printDocument,
  type CoaTree,
  type Totals,
} from "./coa-shared";

type Depth = "1" | "2" | "3" | "4";
type Row = {
  level: 1 | 2 | 3 | 4;
  key: string;
  code: string;
  name: string;
  typeCode: number;
  totals: Totals;
  accountId?: string;
  locked?: boolean;
  linked?: boolean;
  inactive?: boolean;
  parents: string[];
};

const isZero = (t: Totals) =>
  Math.abs(t.opening) < 0.005 && Math.abs(t.debit) < 0.005 && Math.abs(t.credit) < 0.005 && Math.abs(t.closing) < 0.005;

/** Full four-level statement of the chart with opening / debit / credit / closing. */
export function CoaTreeView({
  tree,
  periodLabel,
  branchLabel,
  onOpenLedger,
}: {
  tree: CoaTree;
  periodLabel: string;
  branchLabel: string;
  onOpenLedger: (accountId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hideZero, setHideZero] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [types, setTypes] = useState<string[]>([]);
  const [depth, setDepth] = useState<Depth>("4");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const out: Row[] = [];
    const q = search.trim();
    for (const t of tree.types) {
      if (types.length && !types.includes(String(t.code))) continue;
      const typeRows: Row[] = [];
      const tk = `t${t.code}`;
      for (const s of t.subTypes) {
        if (!showInactive && !s.is_active) continue;
        const sk = `s${s.id}`;
        const subRows: Row[] = [];
        for (const c of s.controls) {
          if (!showInactive && !c.is_active) continue;
          const ck = `c${c.id}`;
          const accRows: Row[] = [];
          for (const a of c.accounts) {
            const totals = a.balance ?? { opening: 0, debit: 0, credit: 0, closing: 0 };
            if (!showInactive && !a.is_active) continue;
            if (hideZero && isZero(totals)) continue;
            if (q && !a.code.startsWith(q) && !includesText([a.name, a.link?.name], q)) continue;
            accRows.push({
              level: 4, key: a.id, code: a.code, name: a.name, typeCode: t.code, totals, accountId: a.id,
              locked: a.is_system, linked: !!a.link, inactive: !a.is_active, parents: [tk, sk, ck],
            });
          }
          const controlMatches = q && (c.code.startsWith(q) || includesText([c.name], q));
          if ((q && !accRows.length && !controlMatches) || (hideZero && isZero(c.totals) && !accRows.length)) continue;
          subRows.push({ level: 3, key: ck, code: c.code, name: c.name, typeCode: t.code, totals: c.totals, inactive: !c.is_active, parents: [tk, sk] }, ...accRows);
        }
        if ((q && !subRows.length) || (hideZero && isZero(s.totals) && !subRows.length)) continue;
        typeRows.push({ level: 2, key: sk, code: s.code, name: s.name, typeCode: t.code, totals: s.totals, inactive: !s.is_active, parents: [tk] }, ...subRows);
      }
      if (q && !typeRows.length) continue;
      out.push({ level: 1, key: tk, code: String(t.code), name: t.name, typeCode: t.code, totals: t.totals, parents: [] }, ...typeRows);
    }
    return out.filter((r) => r.level <= Number(depth));
  }, [tree, hideZero, showInactive, types, depth, search]);

  const visible = rows.filter((row) => !row.parents.some((p) => collapsed.has(p)));
  const accountCount = rows.filter((r) => r.level === 4).length;

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const exportExcel = () => {
    const data = rows.map((row) => ({
      Level: ["", "Type", "Sub type", "Control", "Account"][row.level],
      Code: row.code,
      Account: `${"   ".repeat(row.level - 1)}${row.name}`,
      Opening: row.totals.opening,
      Debit: row.totals.debit,
      Credit: row.totals.credit,
      Closing: row.totals.closing,
      Side: Math.abs(row.totals.closing) < 0.005 ? "" : row.totals.closing > 0 ? "Dr" : "Cr",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 10 }, { wch: 10 }, { wch: 44 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 5 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Chart of Accounts");
    XLSX.writeFile(wb, `chart-of-accounts-${tree.period.to}.xlsx`);
  };

  const print = () => {
    const body = rows
      .map(
        (row) => `<tr class="l${row.level}"><td>${escapeHtml(row.code)}</td>
          <td style="padding-left:${8 + (row.level - 1) * 14}px">${escapeHtml(row.name)}</td>
          <td class="r">${moneyOrDash(row.totals.opening)}</td><td class="r">${moneyOrDash(row.totals.debit)}</td>
          <td class="r">${moneyOrDash(row.totals.credit)}</td><td class="r">${balanceLabel(row.totals.closing, row.typeCode)}</td></tr>`,
      )
      .join("");
    printDocument(
      "Chart of Accounts",
      `${periodLabel} · ${branchLabel}`,
      `<table><thead><tr><th>Code</th><th>Account</th><th class="r">Opening</th><th class="r">Debit</th><th class="r">Credit</th><th class="r">Closing</th></tr></thead><tbody>${body}</tbody></table>`,
    );
  };

  return (
    <Panel
      icon={FileSpreadsheet}
      title="Chart of accounts statement"
      subtitle={`${periodLabel} · ${branchLabel} · ${accountCount} accounts shown`}
      actions={
        <>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setCollapsed(new Set(rows.filter((r) => r.level === 3).map((r) => r.key)))}>
            <ChevronsDownUp className="mr-1 h-4 w-4" />Collapse
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setCollapsed(new Set())}>
            <ChevronsUpDown className="mr-1 h-4 w-4" />Expand
          </Button>
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
        <FilterLabel>Show down to</FilterLabel>
        <Chips<Depth>
          size="xs"
          value={depth}
          onChange={setDepth}
          options={[
            { value: "1", label: "Types" },
            { value: "2", label: "Sub types" },
            { value: "3", label: "Controls" },
            { value: "4", label: "Accounts" },
          ]}
        />
        <div className="ml-auto flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <Switch checked={hideZero} onCheckedChange={setHideZero} />
            Hide zero balances
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Include inactive
          </label>
        </div>
      </FilterBar>

      {visible.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nothing to show"
          description={hideZero ? "No balances match these filters. Turn off “Hide zero balances” to see every account." : "No accounts match these filters."}
          action={
            <Button size="sm" variant="outline" onClick={() => { setSearch(""); setTypes([]); setHideZero(false); setDepth("4"); }}>
              Reset filters
            </Button>
          }
        />
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <th className="w-28 px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Account</th>
                <th className="w-36 px-4 py-2.5 text-right">Opening</th>
                <th className="w-36 px-4 py-2.5 text-right">Debit</th>
                <th className="w-36 px-4 py-2.5 text-right">Credit</th>
                <th className="w-40 px-4 py-2.5 text-right">Closing</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const hasChildren = row.level < Number(depth);
                const isCollapsed = collapsed.has(row.key);
                return (
                  <tr
                    key={row.key}
                    onClick={() => (row.accountId ? onOpenLedger(row.accountId) : hasChildren && toggle(row.key))}
                    className={cn(
                      "border-b border-gray-100 transition-colors",
                      row.level === 1 && "cursor-pointer bg-[#2a2012] text-white hover:bg-[#3b2e1a]",
                      row.level === 2 && "cursor-pointer bg-[#f3ead8] font-semibold text-gray-900 hover:bg-[#efe3cc]",
                      row.level === 3 && "cursor-pointer bg-[#fcf8f2] font-medium text-gray-800 hover:bg-[#f7f0e2]",
                      row.level === 4 && "group cursor-pointer hover:bg-sky-50/50",
                      row.inactive && "opacity-60",
                    )}
                  >
                    <td className={cn("px-4 py-2 font-mono text-xs", row.level === 1 ? "text-white/70" : "text-gray-500")}>{row.code}</td>
                    <td className="px-4 py-2" style={{ paddingLeft: 16 + (row.level - 1) * 20 }}>
                      <span className="inline-flex items-center gap-1.5">
                        {hasChildren ? (
                          isCollapsed ? <ChevronRight className="h-3.5 w-3.5 opacity-70" /> : <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                        ) : null}
                        {row.level === 1 ? <span className={cn("h-2 w-2 rounded-full", TYPE_STYLE[row.typeCode].dot)} /> : null}
                        <span className={row.level === 4 ? "group-hover:text-sky-700 group-hover:underline" : undefined}>{row.name}</span>
                        {row.locked ? <Lock className="h-3 w-3 text-gray-300" /> : null}
                        {row.linked ? <Link2 className="h-3 w-3 text-sky-500" /> : null}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{moneyOrDash(row.totals.opening)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{moneyOrDash(row.totals.debit)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{moneyOrDash(row.totals.credit)}</td>
                    <td className={cn("px-4 py-2 text-right tabular-nums", row.level <= 3 ? "font-bold" : "font-semibold")}>
                      {balanceLabel(row.totals.closing, row.typeCode)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-gray-100 px-5 py-2.5 text-[11px] text-gray-500">
        Assets, liabilities and equity carry forward (opening + period = closing). Income and expenses show the selected period only. Click
        any account to open its ledger.
      </p>
    </Panel>
  );
}
