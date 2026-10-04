"use client";

import { useMemo, useState } from "react";
import { BookOpenText, FileSpreadsheet, Printer, Scale, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CoaTreeView } from "./coa-tree";
import { CoaLedger } from "./coa-ledger";
import { CoaTrialBalance } from "./coa-trial-balance";
import { escapeHtml, naturalAmount, printDocument, type CoaFilters, type CoaTree } from "./coa-shared";

export type ReportView = "balance" | "ledger" | "trial" | "statement";

const VIEWS: { id: ReportView; label: string; help: string; icon: typeof Wallet }[] = [
  { id: "balance", label: "Balance sheet", help: "What you own vs what you owe", icon: Wallet },
  { id: "ledger", label: "Account ledger", help: "Every entry of one account", icon: BookOpenText },
  { id: "trial", label: "Trial balance", help: "For your accountant", icon: Scale },
  { id: "statement", label: "Full chart statement", help: "All accounts with debit / credit", icon: FileSpreadsheet },
];

const rs = (v: number) => `${v < -0.5 ? "− " : ""}Rs ${Math.round(Math.abs(v)).toLocaleString("en-PK")}`;

export function CoaReports({
  tree,
  filters,
  periodLabel,
  branchLabel,
  refreshKey,
  view,
  onView,
  ledgerAccountId,
  onLedgerAccount,
  onOpenAccount,
}: {
  tree: CoaTree;
  filters: CoaFilters;
  periodLabel: string;
  branchLabel: string;
  refreshKey: number;
  view: ReportView;
  onView: (v: ReportView) => void;
  ledgerAccountId: string | null;
  onLedgerAccount: (id: string | null) => void;
  onOpenAccount: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onView(v.id)}
            className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition-colors", view === v.id ? "border-[#2a2012] bg-[#2a2012] text-white" : "border-gray-200 bg-white hover:border-[#a67c2e]")}
          >
            <v.icon className={cn("mt-0.5 h-4 w-4 shrink-0", view === v.id ? "text-[#e6c98f]" : "text-[#a67c2e]")} />
            <span>
              <span className="block text-sm font-semibold">{v.label}</span>
              <span className={cn("block text-xs", view === v.id ? "text-stone-300" : "text-gray-500")}>{v.help}</span>
            </span>
          </button>
        ))}
      </div>
      {view === "balance" && <BalanceSheet tree={tree} periodLabel={periodLabel} branchLabel={branchLabel} onOpenAccount={onOpenAccount} />}
      {view === "ledger" && <CoaLedger tree={tree} filters={filters} accountId={ledgerAccountId} onAccountChange={onLedgerAccount} periodLabel={periodLabel} branchLabel={branchLabel} />}
      {view === "trial" && <CoaTrialBalance filters={filters} periodLabel={periodLabel} branchLabel={branchLabel} refreshKey={refreshKey} onOpenLedger={onOpenAccount} />}
      {view === "statement" && <CoaTreeView tree={tree} periodLabel={periodLabel} branchLabel={branchLabel} onOpenLedger={onOpenAccount} />}
    </div>
  );
}

function BalanceSheet({ tree, periodLabel, branchLabel, onOpenAccount }: { tree: CoaTree; periodLabel: string; branchLabel: string; onOpenAccount: (id: string) => void }) {
  const data = useMemo(() => {
    const side = (code: number) => {
      const t = tree.types.find((x) => x.code === code);
      const groups = (t?.subTypes ?? [])
        .flatMap((s) => s.controls)
        .map((c) => ({
          id: c.id,
          name: c.name,
          accounts: c.accounts.map((a) => ({ id: a.id, code: a.code, name: a.name, amount: naturalAmount(a.balance?.closing ?? 0, code) })).filter((a) => Math.abs(a.amount) > 0.5),
        }))
        .map((g) => ({ ...g, total: g.accounts.reduce((s, a) => s + a.amount, 0) }))
        .filter((g) => g.accounts.length > 0);
      return { groups, total: groups.reduce((s, g) => s + g.total, 0) };
    };
    const own = side(1);
    const owe = side(2);
    const equity = side(3);
    const profit = tree.summary.netProfit;
    const ownerTotal = equity.total + profit;
    const gap = own.total - owe.total - ownerTotal;
    return { own, owe, equity, profit, ownerTotal, gap };
  }, [tree]);

  const print = () => {
    const block = (title: string, s: typeof data.own) =>
      `<tr style="background:#2a2012;color:#fff"><td colspan="2"><b>${title}</b></td><td class="r"><b>${rs(s.total)}</b></td></tr>${s.groups
        .map((g) => `<tr style="background:#f3ead9"><td colspan="2">${escapeHtml(g.name)}</td><td class="r">${rs(g.total)}</td></tr>${g.accounts.map((a) => `<tr><td>${a.code}</td><td>${escapeHtml(a.name)}</td><td class="r">${rs(a.amount)}</td></tr>`).join("")}`)
        .join("")}`;
    const body = `<table><tbody>${block("What the shop owns", data.own)}${block("What the shop owes", data.owe)}${block("Owner's money", data.equity)}<tr><td colspan="2">Profit for the period</td><td class="r">${rs(data.profit)}</td></tr>${
      Math.abs(data.gap) >= 1 ? `<tr><td colspan="2"><i>Not yet recorded (difference)</i></td><td class="r">${rs(data.gap)}</td></tr>` : ""
    }</tbody></table>`;
    printDocument("Balance sheet", `${periodLabel} · ${branchLabel}`, body);
  };

  const Side = ({ title, hint, s, tone }: { title: string; hint: string; s: typeof data.own; tone: string }) => (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <header className={cn("flex items-center justify-between px-4 py-3", tone)}>
        <div>
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="text-[11px] opacity-80">{hint}</p>
        </div>
        <span className="text-lg font-bold tabular-nums">{rs(s.total)}</span>
      </header>
      {s.groups.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-500">Nothing here yet.</p>
      ) : (
        s.groups.map((g) => (
          <div key={g.id} className="border-t border-gray-100">
            <div className="flex justify-between bg-gray-50 px-4 py-1.5 text-xs font-semibold text-gray-600">
              <span>{g.name}</span>
              <span className="tabular-nums">{rs(g.total)}</span>
            </div>
            {g.accounts.map((a) => (
              <button key={a.id} type="button" onClick={() => onOpenAccount(a.id)} className="flex w-full justify-between px-4 py-2 text-left text-sm hover:bg-[#fcf8f2]">
                <span className="text-gray-800">{a.name}</span>
                <span className="tabular-nums text-gray-900">{rs(a.amount)}</span>
              </button>
            ))}
          </div>
        ))
      )}
    </section>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          As at the end of <b>{periodLabel}</b> · {branchLabel}
        </p>
        <Button size="sm" variant="outline" onClick={print}>
          <Printer className="mr-1.5 h-4 w-4" />
          Print
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Side title="What the shop owns" hint="Cash, bank, stock, money customers owe" s={data.own} tone="bg-sky-50 text-sky-900" />
        <div className="space-y-4">
          <Side title="What the shop owes" hint="Suppliers, customer advances, loans, dues" s={data.owe} tone="bg-rose-50 text-rose-900" />
          <section className="rounded-xl border border-gray-200 bg-white">
            <header className="flex items-center justify-between bg-violet-50 px-4 py-3 text-violet-900">
              <div>
                <h4 className="text-sm font-semibold">Owner&apos;s share</h4>
                <p className="text-[11px] opacity-80">Money the owner put in + profit kept</p>
              </div>
              <span className="text-lg font-bold tabular-nums">{rs(data.ownerTotal)}</span>
            </header>
            <div className="divide-y divide-gray-100 text-sm">
              {data.equity.groups.flatMap((g) => g.accounts).map((a) => (
                <button key={a.id} type="button" onClick={() => onOpenAccount(a.id)} className="flex w-full justify-between px-4 py-2 text-left hover:bg-[#fcf8f2]">
                  <span>{a.name}</span>
                  <span className="tabular-nums">{rs(a.amount)}</span>
                </button>
              ))}
              <div className="flex justify-between px-4 py-2">
                <span>{data.profit >= 0 ? "Profit" : "Loss"} for this period</span>
                <span className="tabular-nums">{rs(data.profit)}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
      <div className={cn("rounded-xl border px-4 py-3 text-sm", Math.abs(data.gap) < 1 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-sky-200 bg-sky-50 text-sky-900")}>
        {Math.abs(data.gap) < 1 ? (
          <>Balanced: what you own = what you owe + owner&apos;s share.</>
        ) : (
          <>
            Owns {rs(data.own.total)} − owes {rs(data.owe.total)} − owner&apos;s share {rs(data.ownerTotal)} leaves <b>{rs(data.gap)}</b> not yet recorded — usually the owner&apos;s starting money / stock or
            money spent outside the POS. Record it with a quick entry in <b>Adjustments</b>.
          </>
        )}
      </div>
    </div>
  );
}
