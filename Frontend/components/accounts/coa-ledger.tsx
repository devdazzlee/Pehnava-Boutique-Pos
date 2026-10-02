"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { BookOpenText, ChevronRight, Download, Link2, Loader2, Printer, SearchX, X } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AccountCombobox, Chips, EmptyState, FilterBar, FilterLabel, MultiChips, Panel, SearchBox, StatTile } from "./coa-ui";
import {
  KIND_LABEL,
  KIND_STYLE,
  TYPE_OPTIONS,
  TYPE_STYLE,
  apiError,
  balanceLabel,
  coaApi,
  escapeHtml,
  flattenAccounts,
  includesText,
  money,
  moneyOrDash,
  printDocument,
  type CoaAccount,
  type CoaFilters,
  type CoaTree,
} from "./coa-shared";

type LedgerLine = {
  date: string | null;
  kind: string;
  reference: string | null;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

type LedgerData = {
  account: CoaAccount;
  period: { from: string; to: string };
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  lines: LedgerLine[];
  byKind: { kind: string; count: number; debit: number; credit: number }[];
};

type Side = "all" | "debit" | "credit";

const fmtDate = (value: string | null) => (value ? format(new Date(`${value}T00:00:00`), "dd MMM yyyy") : "—");

export function CoaLedger({
  tree,
  filters,
  accountId,
  onAccountChange,
  periodLabel,
  branchLabel,
}: {
  tree: CoaTree;
  filters: CoaFilters;
  accountId: string | null;
  onAccountChange: (id: string | null) => void;
  periodLabel: string;
  branchLabel: string;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<string>("all");
  const [side, setSide] = useState<Side>("all");
  const [search, setSearch] = useState("");
  const accounts = useMemo(() => flattenAccounts(tree), [tree]);

  useEffect(() => {
    setKind("all");
    setSide("all");
    setSearch("");
  }, [accountId]);

  useEffect(() => {
    if (!accountId) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    coaApi
      .ledger(accountId, filters)
      .then((res) => alive && setData(res))
      .catch((error) => toast({ variant: "destructive", title: "Could not load ledger", description: apiError(error) }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [accountId, filters, toast]);

  const lines = useMemo(
    () =>
      (data?.lines ?? []).filter(
        (l) =>
          (kind === "all" || l.kind === kind) &&
          (side === "all" || (side === "debit" ? l.debit > 0 : l.credit > 0)) &&
          includesText([l.description, l.reference], search),
      ),
    [data, kind, side, search],
  );
  const filtered = lines.length !== (data?.lines.length ?? 0);
  const shownDebit = lines.reduce((s, l) => s + l.debit, 0);
  const shownCredit = lines.reduce((s, l) => s + l.credit, 0);
  const typeCode = data?.account.type_code ?? 1;

  const print = () => {
    if (!data) return;
    const rows = lines
      .map(
        (l) => `<tr><td>${fmtDate(l.date)}</td><td>${escapeHtml(KIND_LABEL[l.kind] || l.kind)}</td><td>${escapeHtml(l.reference || "")}</td>
        <td>${escapeHtml(l.description)}</td><td class="r">${moneyOrDash(l.debit)}</td><td class="r">${moneyOrDash(l.credit)}</td>
        <td class="r">${balanceLabel(l.balance, typeCode)}</td></tr>`,
      )
      .join("");
    printDocument(
      `Ledger — ${data.account.code} ${data.account.name}`,
      `${data.account.type_name} › ${data.account.sub_type.name} › ${data.account.control.name} · ${periodLabel} · ${branchLabel}`,
      `<table><thead><tr><th>Date</th><th>Source</th><th>Ref</th><th>Description</th><th class="r">Debit</th><th class="r">Credit</th><th class="r">Balance</th></tr></thead>
      <tbody><tr class="l3"><td colspan="6">Opening balance</td><td class="r">${balanceLabel(data.opening, typeCode)}</td></tr>${rows}</tbody>
      <tfoot><tr><td colspan="4">Totals / closing</td><td class="r">${moneyOrDash(shownDebit)}</td><td class="r">${moneyOrDash(shownCredit)}</td><td class="r">${balanceLabel(data.closing, typeCode)}</td></tr></tfoot></table>`,
    );
  };

  const exportExcel = () => {
    if (!data) return;
    const ws = XLSX.utils.json_to_sheet([
      { Date: "", Source: "Opening", Reference: "", Description: "Opening balance", Debit: "", Credit: "", Balance: data.opening },
      ...lines.map((l) => ({
        Date: l.date ?? "",
        Source: KIND_LABEL[l.kind] || l.kind,
        Reference: l.reference ?? "",
        Description: l.description,
        Debit: l.debit,
        Credit: l.credit,
        Balance: l.balance,
      })),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ledger");
    XLSX.writeFile(wb, `ledger-${data.account.code}-${data.period.to}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <Panel
        icon={BookOpenText}
        title="Account ledger"
        subtitle={`${periodLabel} · ${branchLabel}`}
        actions={
          <>
            <div className="w-full sm:w-[380px]">
              <AccountCombobox accounts={accounts} value={accountId} onChange={onAccountChange} placeholder="Search & select an account…" />
            </div>
            {accountId ? (
              <>
                <Button variant="outline" size="sm" className="h-9" onClick={print} disabled={!data}>
                  <Printer className="mr-1 h-4 w-4" />Print
                </Button>
                <Button variant="outline" size="sm" className="h-9" onClick={exportExcel} disabled={!data}>
                  <Download className="mr-1 h-4 w-4" />Excel
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onAccountChange(null)} aria-label="Change account">
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : null}
          </>
        }
      >
        {!accountId ? <AccountPicker accounts={accounts} onPick={onAccountChange} /> : null}
      </Panel>

      {accountId && loading && !data ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border bg-white py-16 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />Loading ledger…
        </div>
      ) : null}

      {accountId && data ? (
        <>
          <section className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-3 bg-gradient-to-r from-[#fcf8f2] to-white px-5 py-4">
              <span className={cn("h-10 w-1.5 rounded-full", TYPE_STYLE[typeCode].dot)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">{data.account.name}</h2>
                  <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">{data.account.code}</span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", TYPE_STYLE[typeCode].badge)}>{data.account.type_name}</span>
                  {data.account.link ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700">
                      <Link2 className="h-3 w-3" />
                      {data.account.link.name}
                    </span>
                  ) : null}
                  {loading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : null}
                </div>
                <p className="text-xs text-gray-500">
                  {data.account.sub_type.code} {data.account.sub_type.name} › {data.account.control.code} {data.account.control.name}
                </p>
              </div>
            </div>
            <div className="grid gap-3 border-t border-gray-100 p-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
              <StatTile label="Opening" value={balanceLabel(data.opening, typeCode)} />
              <StatTile label="Total debit" value={money(data.debit)} hint={`${data.lines.filter((l) => l.debit).length} entries`} />
              <StatTile label="Total credit" value={money(data.credit)} hint={`${data.lines.filter((l) => l.credit).length} entries`} />
              <StatTile label="Closing balance" value={balanceLabel(data.closing, typeCode)} tone="brand" hint={`${data.lines.length} postings`} />
            </div>
          </section>

          <Panel
            title="Postings"
            subtitle={filtered ? `${lines.length} of ${data.lines.length} postings match your filters` : `${data.lines.length} postings`}
          >
            <FilterBar>
              <SearchBox value={search} onChange={setSearch} placeholder="Search description or reference…" className="max-w-xs" />
              <Chips
                value={kind}
                onChange={setKind}
                options={[
                  { value: "all", label: "All sources", count: data.lines.length },
                  ...data.byKind.map((k) => ({ value: k.kind, label: KIND_LABEL[k.kind] || k.kind, count: k.count })),
                ]}
              />
            </FilterBar>
            <FilterBar className="bg-white">
              <FilterLabel>Side</FilterLabel>
              <Chips<Side>
                size="xs"
                value={side}
                onChange={setSide}
                options={[
                  { value: "all", label: "Debit & credit" },
                  { value: "debit", label: "Debits only" },
                  { value: "credit", label: "Credits only" },
                ]}
              />
              {filtered ? (
                <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => { setKind("all"); setSide("all"); setSearch(""); }}>
                  Clear filters
                </Button>
              ) : null}
            </FilterBar>

            {lines.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title={data.lines.length ? "No postings match these filters" : "No postings in this period"}
                description={data.lines.length ? "Try another source or clear the search." : "Try a wider date range from the top of the page."}
              />
            ) : (
              <div className="max-h-[65vh] overflow-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      <th className="w-32 px-4 py-2.5">Date</th>
                      <th className="w-40 px-4 py-2.5">Source</th>
                      <th className="w-32 px-4 py-2.5">Reference</th>
                      <th className="px-4 py-2.5">Description</th>
                      <th className="w-32 px-4 py-2.5 text-right">Debit</th>
                      <th className="w-32 px-4 py-2.5 text-right">Credit</th>
                      <th className="w-36 px-4 py-2.5 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100 bg-[#fcf8f2] text-xs font-medium text-gray-700">
                      <td className="px-4 py-2" colSpan={6}>Opening balance</td>
                      <td className="px-4 py-2 text-right tabular-nums">{balanceLabel(data.opening, typeCode)}</td>
                    </tr>
                    {lines.map((line, index) => (
                      <tr key={index} className="border-b border-gray-50 hover:bg-gray-50/80">
                        <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">{fmtDate(line.date)}</td>
                        <td className="px-4 py-2.5">
                          <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", KIND_STYLE[line.kind])}>
                            {KIND_LABEL[line.kind] || line.kind}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{line.reference || "—"}</td>
                        <td className="px-4 py-2.5 text-gray-800">{line.description}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{moneyOrDash(line.debit)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{moneyOrDash(line.credit)}</td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums">{balanceLabel(line.balance, typeCode)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0">
                    <tr className="bg-[#2a2012] text-sm font-semibold text-white">
                      <td className="px-4 py-2.5" colSpan={4}>{filtered ? "Totals (filtered)" : "Totals"} · closing balance</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{moneyOrDash(shownDebit)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{moneyOrDash(shownCredit)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{balanceLabel(data.closing, typeCode)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {filtered ? (
              <p className="border-t border-gray-100 px-5 py-2 text-[11px] text-gray-500">
                The balance column is the running balance of all postings, so it stays correct while filtering.
              </p>
            ) : null}
          </Panel>
        </>
      ) : null}
    </div>
  );
}

/** Shown before an account is chosen: the most active accounts as quick-pick cards. */
function AccountPicker({ accounts, onPick }: { accounts: CoaAccount[]; onPick: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [activeOnly, setActiveOnly] = useState<"active" | "all">("active");

  const list = useMemo(
    () =>
      accounts
        .filter((a) => a.is_active)
        .filter((a) => !types.length || types.includes(String(a.type_code)))
        .filter((a) => activeOnly === "all" || (a.balance?.entries ?? 0) > 0)
        .filter((a) => a.code.startsWith(search.trim()) || includesText([a.name, a.control.name, a.link?.name], search))
        .sort(
          (a, b) =>
            (b.balance?.entries ?? 0) - (a.balance?.entries ?? 0) ||
            Math.abs(b.balance?.closing ?? 0) - Math.abs(a.balance?.closing ?? 0) ||
            a.code.localeCompare(b.code),
        )
        .slice(0, 36),
    [accounts, types, activeOnly, search],
  );

  return (
    <>
      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Filter accounts…" className="max-w-xs" />
        <MultiChips options={TYPE_OPTIONS.map((t) => ({ ...t }))} value={types} onChange={setTypes} allLabel="All types" />
        <div className="ml-auto">
          <Chips
            size="xs"
            value={activeOnly}
            onChange={setActiveOnly}
            options={[
              { value: "active", label: "With postings" },
              { value: "all", label: "All accounts" },
            ]}
          />
        </div>
      </FilterBar>
      {list.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No accounts here"
          description={activeOnly === "active" ? "No account has postings in this period. Switch to “All accounts”." : "Try another search."}
        />
      ) : (
        <div className="grid gap-2 p-4 sm:grid-cols-2 sm:px-5 xl:grid-cols-3">
          {list.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onPick(a.id)}
              className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left transition-all hover:-translate-y-px hover:border-[#a67c2e]/40 hover:shadow-sm"
            >
              <span className={cn("h-8 w-1 shrink-0 rounded-full", TYPE_STYLE[a.type_code].dot)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900">{a.name}</span>
                <span className="block truncate text-[11px] text-gray-500">
                  <span className="font-mono">{a.code}</span> · {a.control.name}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-xs font-semibold tabular-nums text-gray-800">{balanceLabel(a.balance?.closing ?? 0, a.type_code)}</span>
                <span className="block text-[10px] text-gray-400">{a.balance?.entries ?? 0} postings</span>
              </span>
              <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-[#a67c2e]" />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
