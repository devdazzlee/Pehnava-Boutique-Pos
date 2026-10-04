"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Download, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { escapeHtml, naturalAmount, printDocument, type CoaTree } from "./coa-shared";

/* Profit & loss in plain words: sales → cost of goods → gross profit → expenses → net profit. */

const rs = (v: number) => `${v < 0 ? "− " : ""}Rs ${Math.round(Math.abs(v)).toLocaleString("en-PK")}`;
type Line = { id: string; code: string; name: string; amount: number };
type Group = { key: string; title: string; total: number; lines: Line[] };

export function CoaProfitLoss({ tree, periodLabel, branchLabel, onOpenAccount }: { tree: CoaTree; periodLabel: string; branchLabel: string; onOpenAccount: (id: string) => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set(["sales"]));
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const pl = useMemo(() => {
    const income = tree.types.find((t) => t.code === 4);
    const expense = tree.types.find((t) => t.code === 5);
    const linesOf = (controls: { accounts: { id: string; code: string; name: string; balance?: { closing: number } }[] }[], type: number) =>
      controls.flatMap((c) => c.accounts.map((a) => ({ id: a.id, code: a.code, name: a.name, amount: naturalAmount(a.balance?.closing ?? 0, type) }))).filter((l) => Math.abs(l.amount) > 0.5);
    const salesCtrl = income?.subTypes.flatMap((s) => s.controls).filter((c) => c.code === "411") ?? [];
    const otherIncomeCtrl = income?.subTypes.flatMap((s) => s.controls).filter((c) => c.code !== "411") ?? [];
    const sales: Group = { key: "sales", title: "Net sales", lines: linesOf(salesCtrl, 4), total: 0 };
    sales.total = sales.lines.reduce((t, l) => t + l.amount, 0);
    const cogsSubs = expense?.subTypes.filter((s) => s.code === "51") ?? [];
    const cogs: Group = { key: "cogs", title: "Cost of goods sold", lines: linesOf(cogsSubs.flatMap((s) => s.controls), 5), total: 0 };
    cogs.total = cogs.lines.reduce((t, l) => t + l.amount, 0);
    const otherIncome: Group = { key: "other", title: "Other income", lines: linesOf(otherIncomeCtrl, 4), total: 0 };
    otherIncome.total = otherIncome.lines.reduce((t, l) => t + l.amount, 0);
    const expenseGroups: Group[] = (expense?.subTypes.filter((s) => s.code !== "51") ?? [])
      .flatMap((s) => s.controls)
      .map((c) => {
        const lines = linesOf([c], 5);
        return { key: c.id, title: c.name, lines, total: lines.reduce((t, l) => t + l.amount, 0) };
      })
      .filter((g) => Math.abs(g.total) > 0.5)
      .sort((a, b) => b.total - a.total);
    const expenses = expenseGroups.reduce((t, g) => t + g.total, 0);
    const gross = sales.total - cogs.total;
    const net = gross + otherIncome.total - expenses;
    return { sales, cogs, otherIncome, expenseGroups, expenses, gross, net };
  }, [tree]);

  const pct = (v: number) => (pl.sales.total > 0 ? `${((v / pl.sales.total) * 100).toFixed(1)}%` : "");

  const exportRows = () => {
    const rows: { Section: string; Account: string; Amount: number }[] = [];
    const add = (g: Group, sign = 1) => {
      g.lines.forEach((l) => rows.push({ Section: g.title, Account: `${l.code} ${l.name}`, Amount: sign * l.amount }));
      rows.push({ Section: g.title, Account: "Total", Amount: sign * g.total });
    };
    add(pl.sales);
    add(pl.cogs, -1);
    rows.push({ Section: "Gross profit", Account: "", Amount: pl.gross });
    if (pl.otherIncome.lines.length) add(pl.otherIncome);
    pl.expenseGroups.forEach((g) => add(g, -1));
    rows.push({ Section: pl.net >= 0 ? "Net profit" : "Net loss", Account: "", Amount: pl.net });
    return rows;
  };
  const excel = () => {
    const ws = XLSX.utils.json_to_sheet(exportRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Profit & Loss");
    XLSX.writeFile(wb, "profit-and-loss.xlsx");
  };
  const print = () => {
    const body = `<table><tbody>${exportRows()
      .map((r) =>
        r.Account === "Total" || r.Account === ""
          ? `<tr style="background:#f3ead9"><td colspan="2"><b>${escapeHtml(r.Section)}${r.Account ? " total" : ""}</b></td><td class="r"><b>${rs(r.Amount)}</b></td></tr>`
          : `<tr><td>${escapeHtml(r.Section)}</td><td>${escapeHtml(r.Account)}</td><td class="r">${rs(r.Amount)}</td></tr>`,
      )
      .join("")}</tbody></table>`;
    printDocument("Profit & Loss", `${periodLabel} · ${branchLabel}`, body);
  };

  const GroupRow = ({ g, sign = 1, tone }: { g: Group; sign?: 1 | -1; tone?: "minus" }) => (
    <>
      <button type="button" onClick={() => toggle(g.key)} className="flex w-full items-center gap-2 border-t border-gray-100 px-5 py-3 text-left hover:bg-gray-50">
        <ChevronRight className={cn("h-4 w-4 text-gray-400 transition-transform", open.has(g.key) && "rotate-90")} />
        <span className="flex-1 text-sm font-medium text-gray-800">
          {tone === "minus" ? "Less: " : ""}
          {g.title}
          <span className="ml-1.5 text-xs text-gray-400">{g.lines.length}</span>
        </span>
        <span className="w-16 text-right text-xs text-gray-400">{pct(g.total)}</span>
        <span className={cn("w-36 text-right text-sm font-semibold tabular-nums", sign < 0 ? "text-gray-700" : "text-gray-900")}>{rs(sign * g.total)}</span>
      </button>
      {open.has(g.key) &&
        g.lines.map((l) => (
          <button key={l.id} type="button" onClick={() => onOpenAccount(l.id)} className="flex w-full items-center gap-2 bg-gray-50/60 py-2 pl-12 pr-5 text-left text-sm hover:bg-[#fcf8f2]">
            <span className="w-20 font-mono text-[11px] text-gray-400">{l.code}</span>
            <span className="flex-1 text-gray-700 hover:text-[#a67c2e]">{l.name}</span>
            <span className="w-36 text-right tabular-nums text-gray-700">{rs(sign * l.amount)}</span>
          </button>
        ))}
    </>
  );

  const Total = ({ label, value, big }: { label: string; value: number; big?: boolean }) => (
    <div className={cn("flex items-center gap-2 border-t px-5 py-3", big ? (value >= 0 ? "border-emerald-700 bg-emerald-600 text-white" : "border-rose-700 bg-rose-600 text-white") : "border-gray-200 bg-[#fcf8f2]")}>
      <span className={cn("flex-1 font-semibold", big ? "text-base" : "text-sm text-gray-900")}>{label}</span>
      <span className={cn("w-16 text-right text-xs", big ? "text-white/80" : "text-gray-500")}>{pct(value)}</span>
      <span className={cn("w-36 text-right font-bold tabular-nums", big ? "text-lg" : "text-sm text-gray-900")}>{rs(value)}</span>
    </div>
  );

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Profit & Loss</h3>
          <p className="text-xs text-gray-500">
            {periodLabel} · {branchLabel} · click a line to see its entries
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={excel}>
            <Download className="mr-1.5 h-4 w-4" />
            Excel
          </Button>
          <Button size="sm" variant="outline" onClick={print}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print
          </Button>
        </div>
      </header>
      <div className="flex items-center gap-2 border-t border-gray-100 bg-gray-50 px-5 py-2 text-[11px] uppercase tracking-wide text-gray-500">
        <span className="flex-1">Item</span>
        <span className="w-16 text-right">of sales</span>
        <span className="w-36 text-right">Amount</span>
      </div>
      <GroupRow g={pl.sales} />
      <GroupRow g={pl.cogs} sign={-1} tone="minus" />
      <Total label="Gross profit" value={pl.gross} />
      {pl.otherIncome.lines.length > 0 && <GroupRow g={pl.otherIncome} />}
      {pl.expenseGroups.length === 0 ? (
        <div className="border-t border-gray-100 px-5 py-3 text-sm text-gray-500">No running expenses in this period.</div>
      ) : (
        pl.expenseGroups.map((g) => <GroupRow key={g.key} g={g} sign={-1} tone="minus" />)
      )}
      {pl.expenseGroups.length > 0 && <Total label="Total running expenses" value={-pl.expenses} />}
      <Total big label={pl.net >= 0 ? "Net profit" : "Net loss"} value={pl.net} />
    </section>
  );
}
