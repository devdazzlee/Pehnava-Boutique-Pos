"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, CreditCard, Landmark, Loader2, Plus, Smartphone, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type TenderMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "MOBILE_MONEY";
export type CheckoutMethod = "Cash" | "Card" | "Bank" | "Wallet" | "Split";

export interface TenderResult {
  /** Saved as the sale's main method (largest tender, or CREDIT when nothing was paid). */
  primary: TenderMethod | "CREDIT";
  /** Human label for receipts, e.g. "Cash + Card". */
  label: string;
  payments: { method: TenderMethod; amount: number; reference: string | null }[];
  /** Money applied to the bill (excludes change). */
  amountPaid: number;
  change: number;
  /** Left on the customer's account. */
  onAccount: number;
}

const METHODS: { id: TenderMethod; label: string; short: string; icon: typeof Banknote; needsRef?: boolean }[] = [
  { id: "CASH", label: "Cash", short: "Cash", icon: Banknote },
  { id: "CARD", label: "Card", short: "Card", icon: CreditCard, needsRef: true },
  { id: "BANK_TRANSFER", label: "Bank transfer", short: "Bank", icon: Landmark, needsRef: true },
  { id: "MOBILE_MONEY", label: "JazzCash / Easypaisa", short: "Wallet", icon: Smartphone, needsRef: true },
];
const LABEL: Record<TenderMethod, string> = { CASH: "Cash", CARD: "Card", BANK_TRANSFER: "Bank", MOBILE_MONEY: "Wallet" };

export const checkoutToTender = (m: CheckoutMethod | null): TenderMethod =>
  m === "Card" ? "CARD" : m === "Bank" ? "BANK_TRANSFER" : m === "Wallet" ? "MOBILE_MONEY" : "CASH";

type Line = { key: number; method: TenderMethod; amount: string; reference: string };
let seq = 0;
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function SplitPaymentDialog({
  open,
  total,
  initialMethod,
  customerName,
  loading,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  total: number;
  initialMethod: CheckoutMethod | null;
  /** When set, any unpaid balance can go on this customer's account. */
  customerName?: string | null;
  loading?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (result: TenderResult) => void;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [localError, setLocalError] = useState("");
  const firstInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const method = checkoutToTender(initialMethod);
    setLines([{ key: ++seq, method, amount: initialMethod === "Split" ? "" : String(r2(total)), reference: "" }]);
    setLocalError("");
    setTimeout(() => firstInput.current?.select(), 50);
  }, [open, initialMethod, total]);

  const calc = useMemo(() => {
    const amounts = lines.map((l) => ({ ...l, value: r2(Number(l.amount) || 0) }));
    const nonCash = r2(amounts.filter((l) => l.method !== "CASH").reduce((s, l) => s + l.value, 0));
    const cash = r2(amounts.filter((l) => l.method === "CASH").reduce((s, l) => s + l.value, 0));
    const cashApplied = r2(Math.min(cash, Math.max(0, total - nonCash)));
    const paid = r2(nonCash + cashApplied);
    return {
      amounts,
      nonCash,
      cash,
      paid,
      change: r2(cash - cashApplied),
      remaining: r2(Math.max(0, total - paid)),
      overCard: nonCash > total + 0.005,
    };
  }, [lines, total]);

  const update = (key: number, patch: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const addMethod = (method: TenderMethod) => {
    const existing = lines.find((l) => l.method === method && !(Number(l.amount) > 0));
    if (existing) return;
    setLines((prev) => {
      // When the first line still covers the full bill, shrink it so the new tender takes the rest.
      const remaining = r2(Math.max(0, total - prev.reduce((s, l) => s + (Number(l.amount) || 0), 0)));
      return [...prev, { key: ++seq, method, amount: remaining > 0 ? String(remaining) : "", reference: "" }];
    });
  };

  const quickCash = useMemo(() => {
    const due = Math.max(0, r2(total - calc.nonCash));
    if (due <= 0) return [];
    const steps = [500, 1000, 5000];
    const set = new Set<number>([due]);
    for (const step of steps) set.add(Math.ceil(due / step) * step);
    return [...set].filter((v) => v >= due).sort((a, b) => a - b).slice(0, 4);
  }, [total, calc.nonCash]);

  const setCash = (value: number) => {
    const cashLine = lines.find((l) => l.method === "CASH");
    if (cashLine) update(cashLine.key, { amount: String(value) });
    else setLines((prev) => [...prev, { key: ++seq, method: "CASH", amount: String(value), reference: "" }]);
  };

  const confirm = (allowOnAccount: boolean) => {
    if (calc.overCard) {
      setLocalError("Card, bank and wallet amounts cannot be more than the bill.");
      return;
    }
    if (calc.remaining > 0.005 && !(allowOnAccount && customerName)) {
      setLocalError(customerName ? `Rs ${fmt(calc.remaining)} is still due — add a payment or put it on account.` : `Rs ${fmt(calc.remaining)} is still due. Select a customer to sell on credit.`);
      return;
    }
    const payments = calc.amounts
      .filter((l) => l.value > 0)
      .map((l) => ({ method: l.method, amount: l.value, reference: l.reference.trim() || null }));
    const merged = new Map<TenderMethod, number>();
    payments.forEach((p) => merged.set(p.method, (merged.get(p.method) ?? 0) + p.amount));
    const applied = [...merged.entries()].map(([method, amount]) => ({ method, amount: method === "CASH" ? r2(amount - calc.change) : amount }));
    const largest = [...applied].sort((a, b) => b.amount - a.amount)[0];
    const methodsUsed = [...merged.keys()];
    const label =
      methodsUsed.length === 0
        ? "Credit"
        : methodsUsed.map((m) => LABEL[m]).join(" + ") + (calc.remaining > 0.005 ? " + Credit" : "");
    onConfirm({
      primary: calc.paid <= 0.005 ? "CREDIT" : (largest.method as TenderMethod),
      label,
      payments,
      amountPaid: calc.paid,
      change: calc.change,
      onAccount: calc.remaining,
    });
  };

  const shownError = localError || error;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !loading && onCancel()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Take payment</DialogTitle>
          <DialogDescription>Use one method or split the bill across several. Cash over the amount is returned as change.</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-slate-900 px-4 py-3 text-white">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wide text-slate-400">Payable</span>
            <span className="text-2xl font-bold tabular-nums">Rs {fmt(total)}</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-white/10 px-2 py-1.5">
              <p className="text-slate-400">Paid</p>
              <p className="font-semibold tabular-nums">Rs {fmt(calc.paid)}</p>
            </div>
            <div className={cn("rounded-lg px-2 py-1.5", calc.remaining > 0.005 ? "bg-rose-500/25" : "bg-white/10")}>
              <p className="text-slate-400">Remaining</p>
              <p className="font-semibold tabular-nums">Rs {fmt(calc.remaining)}</p>
            </div>
            <div className={cn("rounded-lg px-2 py-1.5", calc.change > 0.005 ? "bg-emerald-500/25" : "bg-white/10")}>
              <p className="text-slate-400">Change</p>
              <p className="font-semibold tabular-nums">Rs {fmt(calc.change)}</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {lines.map((line, index) => {
            const meta = METHODS.find((m) => m.id === line.method)!;
            return (
              <div key={line.key} className="rounded-xl border border-slate-200 p-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex shrink-0 gap-1">
                    {METHODS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        title={m.label}
                        onClick={() => update(line.key, { method: m.id })}
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
                          line.method === m.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-500 hover:bg-slate-50",
                        )}
                      >
                        <m.icon className="h-4 w-4" />
                      </button>
                    ))}
                  </div>
                  <div className="relative min-w-0 flex-1">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rs</span>
                    <Input
                      ref={index === 0 ? firstInput : undefined}
                      inputMode="decimal"
                      value={line.amount}
                      onChange={(e) => {
                        setLocalError("");
                        update(line.key, { amount: e.target.value.replace(/[^\d.]/g, "") });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          confirm(false);
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          onCancel();
                        }
                      }}
                      className="h-10 pl-8 text-right text-base font-semibold tabular-nums"
                      data-amount-input="true"
                    />
                  </div>
                  {lines.length > 1 ? (
                    <button type="button" onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600" aria-label="Remove">
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="font-medium text-slate-700">{meta.label}</span>
                  {meta.needsRef ? (
                    <Input
                      value={line.reference}
                      onChange={(e) => update(line.key, { reference: e.target.value })}
                      placeholder={line.method === "CARD" ? "Card slip / last 4 digits (optional)" : "Transaction ID (optional)"}
                      className="h-7 flex-1 text-xs"
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-slate-500">Add:</span>
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => addMethod(m.id)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            >
              <Plus className="h-3 w-3" />
              {m.short}
            </button>
          ))}
        </div>

        {quickCash.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-500">Cash received:</span>
            {quickCash.map((v, i) => (
              <button
                key={v}
                type="button"
                onClick={() => setCash(v)}
                className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-700 hover:bg-slate-200"
              >
                {i === 0 ? "Exact" : `Rs ${fmt(v)}`}
              </button>
            ))}
          </div>
        ) : null}

        {customerName && calc.remaining > 0.005 ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <UserRound className="h-4 w-4 shrink-0" />
            <span className="flex-1">
              Rs {fmt(calc.remaining)} can be put on <strong>{customerName}</strong>&apos;s account (credit sale).
            </span>
          </div>
        ) : null}

        {shownError ? <p className="text-sm text-red-600">{shownError}</p> : null}

        <DialogFooter className="gap-2 pt-1 sm:gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          {customerName && calc.remaining > 0.005 ? (
            <Button variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50" onClick={() => confirm(true)} disabled={loading}>
              Put Rs {fmt(calc.remaining)} on account
            </Button>
          ) : null}
          <Button onClick={() => confirm(false)} disabled={loading || calc.remaining > 0.005} className="min-w-[140px]">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {loading ? "Processing…" : calc.change > 0.005 ? `Complete · change Rs ${fmt(calc.change)}` : "Complete sale"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
