"use client";

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Boxes,
  CheckCircle2,
  ChevronDown,
  HandCoins,
  Landmark,
  Receipt,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { naturalAmount, type CoaAccount, type CoaTree } from "./coa-shared";

/* ============================================================
 * Accounts overview — the questions an owner actually asks,
 * answered in plain words. Every number opens the account behind it.
 * ============================================================ */

const rs = (v: number) => `Rs ${Math.round(v).toLocaleString("en-PK")}`;

type Totals = { receivable: number; overdue: number; count: number };

export function CoaOverview({
  tree,
  periodLabel,
  onOpenAccount,
  onGo,
  onQuickEntry,
}: {
  tree: CoaTree;
  periodLabel: string;
  onOpenAccount: (accountId: string) => void;
  onGo: (where: "pnl" | "expenses" | "accounts" | "balance" | "suppliers" | "customers" | "adjustments") => void;
  onQuickEntry: (template?: string) => void;
}) {
  const [customers, setCustomers] = useState<Totals | null>(null);
  const [suppliers, setSuppliers] = useState<Totals | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);

  useEffect(() => {
    apiClient
      .get("/customer/receivables/summary")
      .then((r) => {
        const t = r.data?.data?.totals;
        if (t) setCustomers({ receivable: t.receivable, overdue: t.overdue, count: t.debtors });
      })
      .catch(() => undefined);
    apiClient
      .get("/suppliers/payables/summary")
      .then((r) => {
        const t = r.data?.data?.totals;
        if (t) setSuppliers({ receivable: t.payable, overdue: t.overdue, count: t.creditors });
      })
      .catch(() => undefined);
  }, []);

  const view = useMemo(() => {
    const all: (CoaAccount & { natural: number })[] = tree.types.flatMap((t) =>
      t.subTypes.flatMap((s) => s.controls.flatMap((c) => c.accounts.map((a) => ({ ...a, natural: naturalAmount(a.balance?.closing ?? 0, t.code) })))),
    );
    const byControl = (code: string) => all.filter((a) => a.control.code === code);
    const sum = (rows: { natural: number }[]) => rows.reduce((t, a) => t + a.natural, 0);
    const money = byControl("111").filter((a) => a.is_active || Math.abs(a.natural) > 0.5);
    const receivable = byControl("112");
    const stock = byControl("113");
    const supplierAcc = byControl("211");
    const otherPay = byControl("212");
    const customerCredits = otherPay.filter((a) => a.system_key === "CUSTOMER_CREDITS");
    const otherDues = otherPay.filter((a) => a.system_key !== "CUSTOMER_CREDITS");
    const loans = all.filter((a) => a.type_code === 2 && a.sub_type.code === "22");

    const sales = all.find((a) => a.system_key === "SALES")?.natural ?? 0;
    const discounts = -(all.find((a) => a.system_key === "SALES_DISCOUNTS")?.natural ?? 0);
    const returns = -(all.find((a) => a.system_key === "SALES_RETURNS")?.natural ?? 0);
    const netSales = sum(all.filter((a) => a.control.code === "411"));
    const otherIncome = sum(all.filter((a) => a.type_code === 4 && a.control.code !== "411"));
    const cogs = sum(all.filter((a) => a.type_code === 5 && a.sub_type.code === "51"));
    const expenses = sum(all.filter((a) => a.type_code === 5 && a.sub_type.code !== "51"));
    const gross = netSales - cogs;
    const net = gross + otherIncome - expenses;
    const topExpenses = all
      .filter((a) => a.type_code === 5 && a.system_key !== "COGS" && a.natural > 0.5)
      .sort((a, b) => b.natural - a.natural)
      .slice(0, 6);
    const s = tree.summary;
    const unexplained = s.assets - s.liabilities - s.equity - s.netProfit;
    return {
      money,
      moneyTotal: sum(money),
      receivable: sum(receivable),
      receivableId: receivable[0]?.id,
      stock: sum(stock),
      stockId: stock[0]?.id,
      supplierTotal: sum(supplierAcc),
      topSupplier: [...supplierAcc].sort((a, b) => b.natural - a.natural).filter((a) => a.natural > 0.5).slice(0, 3),
      customerCredits: sum(customerCredits),
      customerCreditsId: customerCredits[0]?.id,
      otherDues: sum(otherDues),
      loans: sum(loans),
      sales,
      discounts,
      returns,
      netSales,
      otherIncome,
      cogs,
      expenses,
      gross,
      net,
      topExpenses,
      unexplained,
      own: s.assets,
      owe: s.liabilities,
    };
  }, [tree]);

  const margin = view.netSales > 0 ? (view.net / view.netSales) * 100 : 0;
  const alerts: { tone: "bad" | "warn" | "info"; text: ReactNode; action?: { label: string; run: () => void } }[] = [];
  if (suppliers && suppliers.overdue > 0.5) alerts.push({ tone: "bad", text: <>You have <b>{rs(suppliers.overdue)}</b> overdue to suppliers.</>, action: { label: "Pay suppliers", run: () => onGo("suppliers") } });
  if (customers && customers.overdue > 0.5) alerts.push({ tone: "warn", text: <>Customers are late paying <b>{rs(customers.overdue)}</b>.</>, action: { label: "See customers", run: () => onGo("customers") } });
  if (view.moneyTotal < -0.5) alerts.push({ tone: "bad", text: <>Cash & bank shows a minus balance (<b>{rs(view.moneyTotal)}</b>) — some payments were recorded without matching money in.</> });

  return (
    <div className="space-y-5">
      {/* 1. Where is my money */}
      <Section title="Where your money is" hint="Cash in the drawer and in your bank accounts" icon={Wallet}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <BigCard dark label="Total cash & bank" value={rs(view.moneyTotal)} icon={Banknote} hint="Ready to spend" />
          {view.money.map((a) => (
            <BigCard key={a.id} label={a.name} value={rs(a.natural)} icon={/bank/i.test(a.name) ? Landmark : Banknote} hint={a.code} onClick={() => onOpenAccount(a.id)} />
          ))}
        </div>
      </Section>

      {/* 2. Owed to me / I owe */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Money coming to you" hint="What others owe you" icon={TrendingUp}>
          <div className="space-y-2">
            <LineRow
              icon={Users}
              label="Customers owe you"
              sub={customers ? `${customers.count} customers${customers.overdue > 0.5 ? ` · ${rs(customers.overdue)} overdue` : ""}` : "Credit sales not yet paid"}
              value={rs(view.receivable)}
              tone={customers && customers.overdue > 0.5 ? "warn" : undefined}
              onClick={() => (view.receivableId ? onOpenAccount(view.receivableId) : onGo("customers"))}
              action={{ label: "Customers", run: () => onGo("customers") }}
            />
            <LineRow icon={Boxes} label="Stock in the shop" sub="Value of items at purchase price" value={rs(view.stock)} onClick={() => view.stockId && onOpenAccount(view.stockId)} />
          </div>
        </Section>

        <Section title="Money you owe" hint="Bills and dues still to pay" icon={TrendingDown}>
          <div className="space-y-2">
            <LineRow
              icon={Truck}
              label="Suppliers"
              sub={
                view.topSupplier.length
                  ? view.topSupplier.map((x) => `${x.name} ${rs(x.natural)}`).join(" · ")
                  : suppliers
                    ? `${suppliers.count} suppliers`
                    : "Goods taken on credit"
              }
              value={rs(view.supplierTotal)}
              tone={suppliers && suppliers.overdue > 0.5 ? "bad" : undefined}
              action={{ label: "Pay suppliers", run: () => onGo("suppliers") }}
            />
            <LineRow
              icon={HandCoins}
              label="Customer advances / store credit"
              sub="Money customers paid in advance"
              value={rs(view.customerCredits)}
              onClick={() => view.customerCreditsId && onOpenAccount(view.customerCreditsId)}
            />
            {(Math.abs(view.otherDues) > 0.5 || Math.abs(view.loans) > 0.5) && (
              <LineRow icon={Receipt} label="Other dues & loans" sub="Salaries, bills, tax, loans" value={rs(view.otherDues + view.loans)} onClick={() => onGo("balance")} />
            )}
          </div>
        </Section>
      </div>

      {/* 3. Did I make a profit */}
      <Section
        title={`Profit — ${periodLabel}`}
        hint="Sales minus what the goods cost you minus running expenses"
        icon={view.net >= 0 ? TrendingUp : TrendingDown}
        action={
          <button className="flex items-center gap-1 text-xs font-medium text-[#a67c2e] hover:underline" onClick={() => onGo("pnl")}>
            Full profit & loss <ArrowRight className="h-3.5 w-3.5" />
          </button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-1.5 rounded-xl border border-gray-200 bg-white p-4 lg:col-span-3">
            <Step label="You sold" value={view.sales} />
            {view.discounts + view.returns > 0.5 && <Step label="Less discounts & returns" value={-(view.discounts + view.returns)} muted />}
            <Step label="Net sales" value={view.netSales} strong />
            <Step label="Less cost of the goods sold" value={-view.cogs} muted />
            <Step label="Gross profit (before expenses)" value={view.gross} strong />
            {view.otherIncome > 0.5 && <Step label="Plus other income" value={view.otherIncome} muted />}
            <Step label="Less running expenses (rent, salaries, bills…)" value={-view.expenses} muted onClick={() => onGo("expenses")} />
            <div className={cn("mt-2 flex items-center justify-between rounded-lg px-3 py-2.5", view.net >= 0 ? "bg-emerald-600 text-white" : "bg-rose-600 text-white")}>
              <span className="text-sm font-semibold">{view.net >= 0 ? "Net profit" : "Net loss"}</span>
              <span className="text-lg font-bold tabular-nums">{rs(Math.abs(view.net))}</span>
            </div>
            {view.netSales > 0 && (
              <p className="pt-1 text-xs text-gray-500">
                From every Rs 100 of sales you keep about <b className="text-gray-800">Rs {Math.max(0, Math.round(margin))}</b> as profit.
              </p>
            )}
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">Biggest expenses</h4>
              <button className="text-xs font-medium text-[#a67c2e] hover:underline" onClick={() => onGo("expenses")}>
                All expenses
              </button>
            </div>
            {view.topExpenses.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">No expenses recorded in this period.</p>
            ) : (
              <ul className="space-y-2.5">
                {view.topExpenses.map((a) => (
                  <li key={a.id}>
                    <button className="w-full text-left" onClick={() => onOpenAccount(a.id)}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate text-gray-800 hover:text-[#a67c2e]">{a.name}</span>
                        <span className="shrink-0 tabular-nums text-gray-900">{rs(a.natural)}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                        <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${Math.max(3, (a.natural / view.topExpenses[0].natural) * 100)}%` }} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      {/* 4. Needs attention */}
      <Section title="Needs your attention" icon={AlertTriangle}>
        {alerts.length === 0 && Math.abs(view.unexplained) < 1 ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            All good — nothing overdue and your books add up.
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div
                key={i}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm",
                  a.tone === "bad" ? "border-rose-200 bg-rose-50 text-rose-900" : a.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900",
                )}
              >
                <span>{a.text}</span>
                {a.action && (
                  <button className="rounded-lg bg-white px-3 py-1 text-xs font-medium shadow-sm ring-1 ring-black/5 hover:bg-gray-50" onClick={a.action.run}>
                    {a.action.label}
                  </button>
                )}
              </div>
            ))}
            {Math.abs(view.unexplained) >= 1 && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <b>{rs(Math.abs(view.unexplained))}</b> in your books has no recorded source yet.
                  </span>
                  <div className="flex gap-2">
                    <button className="flex items-center gap-1 text-xs font-medium underline" onClick={() => setWhyOpen((v) => !v)}>
                      Why? <ChevronDown className={cn("h-3 w-3 transition-transform", whyOpen && "rotate-180")} />
                    </button>
                    {view.unexplained > 0 && (
                      <button className="rounded-lg bg-white px-3 py-1 text-xs font-medium shadow-sm ring-1 ring-black/5" onClick={() => onQuickEntry("OWNER_IN")}>
                        Record owner&apos;s starting money
                      </button>
                    )}
                  </div>
                </div>
                {whyOpen && (
                  <p className="mt-2 text-xs leading-relaxed text-sky-800">
                    What you own ({rs(view.own)}) minus what you owe ({rs(view.owe)}) should equal the owner&apos;s money plus profit. The gap usually means:
                    the owner&apos;s starting cash or stock was never entered, or money was spent / received outside the POS (e.g. a supplier paid from your pocket).
                    {view.unexplained > 0
                      ? " Record the owner's starting money once with “Owner added money”."
                      : " Record the owner's withdrawals or the missing payments with a quick entry in Adjustments."}{" "}
                    Reports still work; this only matters for your accountant.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, hint, icon: Icon, action, children }: { title: string; hint?: string; icon: ComponentType<{ className?: string }>; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2a2012] text-[#e6c98f]">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            {hint && <p className="text-xs text-gray-500">{hint}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function BigCard({ label, value, hint, icon: Icon, dark, onClick }: { label: string; value: string; hint?: string; icon: ComponentType<{ className?: string }>; dark?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-xl border p-4 text-left transition-colors",
        dark ? "border-[#2a2012] bg-[#2a2012] text-white" : "border-gray-200 bg-white hover:border-[#a67c2e]/60",
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", dark ? "bg-white/10 text-[#e6c98f]" : "bg-[#fcf8f2] text-[#a67c2e]")}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className={cn("block truncate text-xs", dark ? "text-stone-300" : "text-gray-500")}>{label}</span>
        <span className="block truncate text-xl font-semibold tabular-nums">{value}</span>
        {hint && <span className={cn("block truncate text-[11px]", dark ? "text-stone-400" : "text-gray-400")}>{hint}</span>}
      </span>
    </button>
  );
}

function LineRow({
  icon: Icon,
  label,
  sub,
  value,
  tone,
  onClick,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  sub?: string;
  value: string;
  tone?: "bad" | "warn";
  onClick?: () => void;
  action?: { label: string; run: () => void };
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tone === "bad" ? "bg-rose-50 text-rose-600" : tone === "warn" ? "bg-amber-50 text-amber-700" : "bg-[#fcf8f2] text-[#a67c2e]")}>
        <Icon className="h-4 w-4" />
      </span>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onClick} disabled={!onClick}>
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {sub && <span className="block truncate text-xs text-gray-500">{sub}</span>}
      </button>
      <span className="shrink-0 text-right text-lg font-semibold tabular-nums text-gray-900">{value}</span>
      {action && (
        <button type="button" className="hidden shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-[#a67c2e] sm:block" onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  );
}

function Step({ label, value, strong, muted, onClick }: { label: string; value: number; strong?: boolean; muted?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={cn("flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left", strong && "border-t border-gray-100 pt-2", onClick && "hover:bg-gray-50")}
    >
      <span className={cn("text-sm", strong ? "font-semibold text-gray-900" : "text-gray-600")}>{label}</span>
      <span className={cn("tabular-nums", strong ? "text-base font-semibold text-gray-900" : muted ? "text-sm text-gray-600" : "text-sm text-gray-900")}>
        {value < 0 ? "− " : ""}
        {rs(Math.abs(value))}
      </span>
    </button>
  );
}
