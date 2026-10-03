"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Calculator, CheckCircle2, Coffee, Loader2, Lock, Repeat, ShieldAlert, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { DENOMINATIONS, errorMessage, HandoverMode, METHOD_LABEL, registerApi, rs, SessionDetail, signedRs } from "./register-api";

const TOLERANCE = 0.5;

/* ------------------------------ count pad ------------------------------ */

export function CountPad({
  value,
  onChange,
}: {
  value: Record<string, number>;
  onChange: (counts: Record<string, number>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {DENOMINATIONS.map((d) => {
        const qty = value[String(d)] || 0;
        return (
          <label
            key={d}
            className={cn(
              "flex flex-col rounded-lg border bg-white px-2.5 py-2 transition-colors",
              qty > 0 ? "border-[#a67c2e]/60 bg-[#fcf8f2]" : "border-stone-200",
            )}
          >
            <span className="text-[11px] font-medium text-stone-500">{d >= 10 ? `Rs ${d.toLocaleString()} note` : `Rs ${d} coin`}</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={qty || ""}
              placeholder="0"
              onChange={(e) => onChange({ ...value, [String(d)]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              className="mt-1 h-8 border-0 bg-transparent px-0 text-base font-semibold shadow-none focus-visible:ring-0"
            />
            <span className="text-[11px] tabular-nums text-stone-400">{qty ? rs(qty * d) : " "}</span>
          </label>
        );
      })}
    </div>
  );
}

const countTotal = (c: Record<string, number>) => Object.entries(c).reduce((t, [d, q]) => t + Number(d) * (q || 0), 0);

/** Cash amount entry: either type the total or count notes. */
function CashCount({
  amount,
  setAmount,
  counts,
  setCounts,
  label = "Cash in drawer",
}: {
  amount: string;
  setAmount: (v: string) => void;
  counts: Record<string, number>;
  setCounts: (c: Record<string, number>) => void;
  label?: string;
}) {
  const [mode, setMode] = useState<"total" | "notes">("total");
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <div className="inline-flex rounded-md border border-stone-200 p-0.5 text-xs">
          {(["total", "notes"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn("rounded px-2.5 py-1 font-medium", mode === m ? "bg-[#2a2012] text-white" : "text-stone-600 hover:bg-stone-100")}
            >
              {m === "total" ? "Enter total" : "Count notes"}
            </button>
          ))}
        </div>
      </div>
      {mode === "total" ? (
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          autoFocus
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setCounts({});
          }}
          placeholder="0"
          className="h-12 text-xl font-semibold"
        />
      ) : (
        <>
          <CountPad
            value={counts}
            onChange={(c) => {
              setCounts(c);
              setAmount(String(countTotal(c)));
            }}
          />
          <div className="flex items-center justify-between rounded-lg bg-[#2a2012] px-3 py-2 text-white">
            <span className="text-sm">Counted total</span>
            <span className="text-lg font-semibold tabular-nums">{rs(countTotal(counts))}</span>
          </div>
        </>
      )}
    </div>
  );
}

function DiffBanner({ expected, actual, label = "Expected" }: { expected: number | null; actual: number | null; label?: string }) {
  if (expected == null || actual == null || Number.isNaN(actual)) return null;
  const diff = actual - expected;
  const ok = Math.abs(diff) <= TOLERANCE;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <div>
        <div>
          {label}: <b>{rs(expected)}</b> · Counted: <b>{rs(actual)}</b>
        </div>
        <div className="text-xs">
          {ok ? "Matches — no difference." : `${diff > 0 ? "Over" : "Short"} by ${rs(Math.abs(diff))}. A reason is required and a supervisor must approve.`}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ open ------------------------------ */

export function OpenRegisterDialog({
  open,
  onOpenChange,
  branchId,
  branchName,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  branchId?: string;
  branchName?: string;
  onDone: (s: SessionDetail) => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [expected, setExpected] = useState<{ amount: number; at: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setCounts({});
    setNote("");
    registerApi
      .expectedOpening(branchId)
      .then(setExpected)
      .catch(() => setExpected(null));
  }, [open, branchId]);

  const value = amount === "" ? null : Number(amount);
  const differs = expected != null && value != null && Math.abs(value - expected.amount) > TOLERANCE;

  const submit = async () => {
    if (value == null || value < 0) return toast({ variant: "destructive", title: "Enter the opening cash" });
    if (differs && !note.trim()) return toast({ variant: "destructive", title: "Enter why the opening cash is different" });
    setBusy(true);
    try {
      const s = await registerApi.open({ branchId, opening: value, counts: Object.keys(counts).length ? counts : null, note: note.trim() || null });
      toast({ title: "Register opened", description: `Opening cash ${rs(value)}` });
      onOpenChange(false);
      onDone(s);
    } catch (e) {
      toast({ variant: "destructive", title: "Could not open register", description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Open register{branchName ? ` — ${branchName}` : ""}</DialogTitle>
          <DialogDescription>Count the cash in the drawer before the first bill. It's checked against last night's closing.</DialogDescription>
        </DialogHeader>
        {expected ? (
          <div className="rounded-lg border border-stone-200 bg-[#fcf8f2] px-3 py-2 text-sm text-stone-700">
            Last closing cash: <b>{rs(expected.amount)}</b>
            <button type="button" className="ml-2 text-xs font-medium text-[#a67c2e] underline" onClick={() => setAmount(String(expected.amount))}>
              use this
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">No previous closing found — enter the float you're starting with.</div>
        )}
        <CashCount amount={amount} setAmount={setAmount} counts={counts} setCounts={setCounts} label="Opening cash" />
        {expected && <DiffBanner expected={expected.amount} actual={value} label="Last closing" />}
        {differs && (
          <div className="space-y-1.5">
            <Label>Reason for the difference</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Owner took Rs 2,000 for change overnight" />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Open register
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ cash in / out ------------------------------ */

export function CashMoveDialog({
  open,
  onOpenChange,
  direction,
  session,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  direction: "IN" | "OUT";
  session: SessionDetail | null;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setAmount("");
      setReason("");
    }
  }, [open]);
  const presets =
    direction === "IN" ? ["Change float top-up", "Owner added cash", "Cash from bank"] : ["Tea / refreshments", "Courier", "Stationery", "Cash deposited to bank"];
  const value = Number(amount);
  const submit = async () => {
    if (!session) return;
    if (!(value > 0)) return toast({ variant: "destructive", title: "Enter an amount" });
    if (!reason.trim()) return toast({ variant: "destructive", title: "Enter a reason" });
    if (direction === "OUT" && value > session.live.expectedCash + TOLERANCE) {
      return toast({ variant: "destructive", title: "Not enough cash", description: `The drawer should only have ${rs(session.live.expectedCash)}.` });
    }
    setBusy(true);
    try {
      if (direction === "IN") await registerApi.cashIn(session.id, { amount: value, reason: reason.trim() });
      else await registerApi.cashOut({ amount: value, particular: reason.trim(), branchId: session.branch?.id });
      toast({ title: direction === "IN" ? "Cash added" : "Cash taken out", description: `${rs(value)} — ${reason.trim()}` });
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not save", description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {direction === "IN" ? <ArrowDownCircle className="h-5 w-5 text-emerald-600" /> : <ArrowUpCircle className="h-5 w-5 text-rose-600" />}
            {direction === "IN" ? "Cash in" : "Cash out (paid out)"}
          </DialogTitle>
          <DialogDescription>
            {direction === "IN" ? "Money added to the drawer that isn't a sale." : "Money taken out of the drawer for an expense. It's booked as an expense too."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input type="number" min={0} autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 text-lg font-semibold" />
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What is it for?" />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {presets.map((p) => (
                <button key={p} type="button" onClick={() => setReason(p)} className="rounded-full border border-stone-200 px-2.5 py-0.5 text-xs text-stone-600 hover:border-[#a67c2e] hover:text-[#a67c2e]">
                  {p}
                </button>
              ))}
            </div>
          </div>
          {session && (
            <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">
              Drawer after this: <b className="text-stone-900">{rs(session.live.expectedCash + (direction === "IN" ? 1 : -1) * (value || 0))}</b>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ handover / break ------------------------------ */

const MODE_META: Record<HandoverMode, { title: string; icon: typeof Repeat; help: string; count: boolean; incoming: string }> = {
  HANDOVER: { title: "Hand over register", icon: Repeat, help: "Shift change. Count the drawer; the next cashier confirms with their password.", count: true, incoming: "Incoming cashier" },
  BREAK: { title: "Go on break", icon: Coffee, help: "Leave someone covering (count + their password), or lock the register until you're back.", count: true, incoming: "Covering cashier" },
  RETURN: { title: "Back from break", icon: UserCheck, help: "Take the register back. Count the drawer with the cashier who covered for you.", count: true, incoming: "Returning cashier" },
  EMERGENCY: { title: "Emergency replacement", icon: ShieldAlert, help: "The cashier on duty can't continue. A supervisor approves; the replacement confirms.", count: true, incoming: "Replacement cashier" },
};

export function HandoverDialog({
  open,
  onOpenChange,
  mode,
  session,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: HandoverMode;
  session: SessionDetail | null;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [lockOnly, setLockOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const onBreak = session?.activeShift?.status === "ON_BREAK";
  const unlockOnly = mode === "RETURN" && onBreak;

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setCounts({});
    setNote("");
    setEmail("");
    setPassword("");
    setLockOnly(false);
  }, [open]);

  const meta = MODE_META[mode];
  const Icon = meta.icon;
  const expected = session?.activeShift?.expectedNow ?? null;
  const value = amount === "" ? null : Number(amount);
  const differs = expected != null && value != null && Math.abs(value - expected) > TOLERANCE;
  const needsCount = !lockOnly && !unlockOnly;

  const submit = async () => {
    if (!session) return;
    if (needsCount && (value == null || value < 0)) return toast({ variant: "destructive", title: "Count the drawer first" });
    if (needsCount && differs && !note.trim()) return toast({ variant: "destructive", title: "Enter a note for the difference" });
    if (mode === "EMERGENCY" && !note.trim()) return toast({ variant: "destructive", title: "Give a reason for the replacement" });
    if (!lockOnly && (!email.trim() || !password)) return toast({ variant: "destructive", title: "The other cashier must sign in to confirm" });
    setBusy(true);
    try {
      await registerApi.handover(session.id, {
        mode,
        endCount: needsCount ? value : null,
        note: note.trim() || null,
        incomingEmail: lockOnly ? undefined : email.trim(),
        incomingPassword: lockOnly ? undefined : password,
      });
      toast({
        title: lockOnly ? "Register locked" : unlockOnly ? "Register unlocked" : "Register handed over",
        description: lockOnly ? "No bills can be made until you return." : undefined,
      });
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not update the register", description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-[#a67c2e]" />
            {unlockOnly ? "Unlock register" : meta.title}
          </DialogTitle>
          <DialogDescription>{unlockOnly ? "Sign in with the password of the cashier who went on break." : meta.help}</DialogDescription>
        </DialogHeader>

        {mode === "BREAK" && (
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: false, t: "Someone covers", d: "Count + handover" },
              { v: true, t: "Lock the register", d: "No sales until I return" },
            ].map((o) => (
              <button
                key={o.t}
                type="button"
                onClick={() => setLockOnly(o.v)}
                className={cn("rounded-lg border p-3 text-left", lockOnly === o.v ? "border-[#a67c2e] bg-[#fcf8f2]" : "border-stone-200 hover:bg-stone-50")}
              >
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  {o.v ? <Lock className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
                  {o.t}
                </div>
                <div className="text-xs text-stone-500">{o.d}</div>
              </button>
            ))}
          </div>
        )}

        {session?.activeShift && (
          <div className="rounded-lg border border-stone-200 bg-[#fcf8f2] px-3 py-2 text-sm">
            On duty: <b>{session.activeShift.cashier ?? "—"}</b>
            {expected != null && needsCount && (
              <>
                {" "}
                · This shift should hand over <b>{rs(expected)}</b>
              </>
            )}
          </div>
        )}

        {needsCount && (
          <>
            <CashCount amount={amount} setAmount={setAmount} counts={counts} setCounts={setCounts} />
            <DiffBanner expected={expected} actual={value} label="Expected for this shift" />
          </>
        )}

        {(differs || mode === "EMERGENCY" || lockOnly) && (
          <div className="space-y-1.5">
            <Label>{mode === "EMERGENCY" ? "Reason" : lockOnly ? "Note (optional)" : "Note for the difference"}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        )}

        {!lockOnly && (
          <div className="rounded-lg border border-stone-200 p-3">
            <div className="mb-2 text-sm font-semibold text-stone-800">{unlockOnly ? "Returning cashier" : meta.incoming} — confirm</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Login email" autoComplete="off" />
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="new-password" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {lockOnly ? "Lock register" : unlockOnly ? "Unlock" : "Confirm handover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ close & reconcile ------------------------------ */

export function CloseRegisterDialog({
  open,
  onOpenChange,
  session,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: SessionDetail | null;
  onDone: (s: SessionDetail) => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [recs, setRecs] = useState<Record<string, { actual: string; reference: string }>>({});
  const [busy, setBusy] = useState(false);

  const methods = useMemo(
    () => (session ? (["CARD", "BANK_TRANSFER", "MOBILE_MONEY"] as const).filter((m) => (session.live.byMethod[m] || 0) !== 0) : []),
    [session],
  );

  useEffect(() => {
    if (!open || !session) return;
    setAmount("");
    setCounts({});
    setNote("");
    setRecs(Object.fromEntries(methods.map((m) => [m, { actual: String(Math.round(session.live.byMethod[m] || 0)), reference: "" }])));
  }, [open, session, methods]);

  if (!session) return null;
  const expected = session.live.expectedCash;
  const value = amount === "" ? null : Number(amount);
  const differs = value != null && Math.abs(value - expected) > TOLERANCE;

  const submit = async () => {
    if (value == null || value < 0) return toast({ variant: "destructive", title: "Count the cash in the drawer" });
    if (differs && !note.trim()) return toast({ variant: "destructive", title: "Enter a reason for the difference" });
    setBusy(true);
    try {
      const s = await registerApi.close(session.id, {
        closing: value,
        counts: Object.keys(counts).length ? counts : null,
        note: note.trim() || null,
        reconciliations: methods.map((m) => ({ method: m, actual: Number(recs[m]?.actual || 0), reference: recs[m]?.reference || null })),
      });
      toast({
        title: "Register closed",
        description: s.reviewStatus === "PENDING" ? "Sent to the manager for review." : "Count approved.",
      });
      onOpenChange(false);
      onDone(s);
    } catch (e) {
      toast({ variant: "destructive", title: "Could not close register", description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-[#a67c2e]" />
            Close register
          </DialogTitle>
          <DialogDescription>Count the drawer and confirm card, bank and wallet totals against the machine / statement.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {[
            ["Opening", session.live.opening],
            ["Cash sales", session.live.cashSales],
            ["Cash in − out", session.live.cashIn - session.live.cashOut],
            ["Expected cash", expected],
          ].map(([l, v]) => (
            <div key={l as string} className={cn("rounded-lg border px-3 py-2", l === "Expected cash" ? "border-[#2a2012] bg-[#2a2012] text-white" : "border-stone-200 bg-white")}>
              <div className={cn("text-[11px]", l === "Expected cash" ? "text-stone-300" : "text-stone-500")}>{l}</div>
              <div className="font-semibold tabular-nums">{rs(v as number)}</div>
            </div>
          ))}
        </div>

        <CashCount amount={amount} setAmount={setAmount} counts={counts} setCounts={setCounts} label="Closing cash counted" />
        <DiffBanner expected={expected} actual={value} />
        {differs && (
          <div className="space-y-1.5">
            <Label>Reason for the difference</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Gave Rs 100 extra change to a customer" />
          </div>
        )}

        {methods.length > 0 && (
          <div className="space-y-2">
            <Label>Card / bank / wallet reconciliation</Label>
            <div className="overflow-hidden rounded-lg border border-stone-200">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-xs text-stone-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Method</th>
                    <th className="px-3 py-2 text-right font-medium">POS total</th>
                    <th className="px-3 py-2 text-right font-medium">Actual received</th>
                    <th className="px-3 py-2 text-left font-medium">Batch / ref no.</th>
                    <th className="px-3 py-2 text-right font-medium">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {methods.map((m) => {
                    const exp = session.live.byMethod[m] || 0;
                    const act = Number(recs[m]?.actual || 0);
                    const diff = act - exp;
                    return (
                      <tr key={m} className="border-t border-stone-100">
                        <td className="px-3 py-2 font-medium">{METHOD_LABEL[m]}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{rs(exp)}</td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="number"
                            value={recs[m]?.actual ?? ""}
                            onChange={(e) => setRecs({ ...recs, [m]: { ...recs[m], actual: e.target.value } })}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            value={recs[m]?.reference ?? ""}
                            onChange={(e) => setRecs({ ...recs, [m]: { ...recs[m], reference: e.target.value } })}
                            className="h-8"
                            placeholder="optional"
                          />
                        </td>
                        <td className={cn("px-3 py-2 text-right tabular-nums", Math.abs(diff) > TOLERANCE ? "font-semibold text-amber-700" : "text-stone-400")}>{signedRs(diff)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Close register
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ reason prompt ------------------------------ */

export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  confirmLabel,
  required = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  label: string;
  confirmLabel: string;
  required?: boolean;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setText("");
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>{label}</Label>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy || (required && text.trim().length < 3)}
            className="bg-[#2a2012] hover:bg-[#3a2e1c]"
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(text.trim());
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
