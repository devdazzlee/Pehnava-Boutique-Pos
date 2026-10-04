"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { ArrowLeft, ArrowLeftRight, Banknote, Building, Coins, HandCoins, Landmark, Loader2, PiggyBank, Receipt, UserMinus, UserPlus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { YmdDatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { businessTodayYmd } from "@/lib/business-timezone";
import { cn } from "@/lib/utils";
import { apiError, coaApi, flattenAccounts, type CoaAccount, type CoaTree } from "./coa-shared";

/* ============================================================
 * Quick entries: common money movements without debit / credit.
 * Each template knows which side goes up; the person only picks
 * the accounts in plain words and the amount.
 * ============================================================ */

type Pick = (a: CoaAccount) => boolean;
type Template = {
  id: string;
  title: string;
  help: string;
  icon: ComponentType<{ className?: string }>;
  /** Debit side */
  into: { label: string; pick: Pick; prefer?: Pick };
  /** Credit side */
  from: { label: string; pick: Pick; prefer?: Pick };
  narration: string;
  explain: (into: string, from: string, amount: string) => string;
};

const isMoney: Pick = (a) => a.control.code === "111";
const named = (re: RegExp): Pick => (a) => re.test(a.name);

export const QUICK_TEMPLATES: Template[] = [
  {
    id: "OWNER_IN",
    title: "Owner added money",
    help: "Owner puts cash or bank money into the shop (incl. starting money)",
    icon: UserPlus,
    into: { label: "Money went into", pick: isMoney, prefer: (a) => a.system_key === "CASH" },
    from: { label: "Owner's account", pick: (a) => a.control.code === "311", prefer: (a) => a.system_key === "OWNER_CAPITAL" },
    narration: "Owner added money to the business",
    explain: (i, f, x) => `${i} goes up by ${x}. The owner's share in the business (${f}) goes up by ${x}.`,
  },
  {
    id: "OWNER_OUT",
    title: "Owner took money",
    help: "Owner takes money out for personal use",
    icon: UserMinus,
    into: { label: "Record against", pick: (a) => a.control.code === "311", prefer: named(/drawing/i) },
    from: { label: "Money taken from", pick: isMoney, prefer: (a) => a.system_key === "CASH" },
    narration: "Owner withdrew money for personal use",
    explain: (i, f, x) => `${f} goes down by ${x}, recorded as ${i}. It is not an expense of the shop.`,
  },
  {
    id: "TRANSFER",
    title: "Move money (cash ↔ bank)",
    help: "Deposit cash in bank, withdraw from bank, or move between accounts",
    icon: ArrowLeftRight,
    into: { label: "Money went into", pick: isMoney, prefer: named(/bank/i) },
    from: { label: "Money came from", pick: isMoney, prefer: (a) => a.system_key === "CASH" },
    narration: "Money moved between accounts",
    explain: (i, f, x) => `${f} goes down by ${x} and ${i} goes up by ${x}. Total money stays the same.`,
  },
  {
    id: "ASSET",
    title: "Bought furniture / equipment",
    help: "Things the shop keeps and uses for years (AC, computer, racks)",
    icon: Wrench,
    into: { label: "What you bought", pick: (a) => a.type_code === 1 && a.sub_type.code === "12" },
    from: { label: "Paid from", pick: isMoney, prefer: (a) => a.system_key === "CASH" },
    narration: "Bought fixed asset",
    explain: (i, f, x) => `${f} goes down by ${x} and the shop now owns ${i} worth ${x}. It is not counted as an expense.`,
  },
  {
    id: "LOAN_IN",
    title: "Took a loan",
    help: "Money borrowed from a bank or a person",
    icon: Landmark,
    into: { label: "Money went into", pick: isMoney, prefer: named(/bank/i) },
    from: { label: "Loan account", pick: (a) => a.type_code === 2 && a.control.code !== "211" && a.system_key !== "CUSTOMER_CREDITS", prefer: named(/loan/i) },
    narration: "Loan received",
    explain: (i, f, x) => `${i} goes up by ${x} and you now owe ${x} on ${f}.`,
  },
  {
    id: "LOAN_OUT",
    title: "Repaid a loan / due",
    help: "Paying back a loan, salary payable, tax or another due",
    icon: Building,
    into: { label: "Loan / due paid", pick: (a) => a.type_code === 2 && a.control.code !== "211" && a.system_key !== "CUSTOMER_CREDITS", prefer: named(/loan/i) },
    from: { label: "Paid from", pick: isMoney, prefer: named(/bank/i) },
    narration: "Loan / due repaid",
    explain: (i, f, x) => `${f} goes down by ${x} and what you owe on ${i} goes down by ${x}.`,
  },
  {
    id: "STAFF_ADVANCE",
    title: "Gave staff a loan / advance",
    help: "Money given to staff that they will return",
    icon: HandCoins,
    into: { label: "Advance account", pick: (a) => a.control.code === "114", prefer: named(/staff/i) },
    from: { label: "Paid from", pick: isMoney, prefer: (a) => a.system_key === "CASH" },
    narration: "Advance given to staff",
    explain: (i, f, x) => `${f} goes down by ${x}; the staff now owe the shop ${x} (${i}).`,
  },
  {
    id: "OTHER_INCOME",
    title: "Other income received",
    help: "Stitching / alteration charges, rent received, misc. income",
    icon: Coins,
    into: { label: "Money went into", pick: isMoney, prefer: (a) => a.system_key === "CASH" },
    from: { label: "Type of income", pick: (a) => a.type_code === 4 && a.control.code !== "411" },
    narration: "Other income received",
    explain: (i, f, x) => `${i} goes up by ${x}; it counts as income (${f}) in your profit.`,
  },
  {
    id: "DEPOSIT",
    title: "Paid a security deposit / advance rent",
    help: "Money you'll get back or use later",
    icon: PiggyBank,
    into: { label: "Deposit account", pick: (a) => a.control.code === "114", prefer: named(/deposit|rent/i) },
    from: { label: "Paid from", pick: isMoney, prefer: named(/bank/i) },
    narration: "Deposit / advance paid",
    explain: (i, f, x) => `${f} goes down by ${x}; the shop has ${x} sitting in ${i}.`,
  },
];

const rs = (v: number) => `Rs ${Math.round(v).toLocaleString("en-PK")}`;
/** Entries where money leaves the shop: show "Paid from" first. */
const OUTFLOW = new Set(["OWNER_OUT", "ASSET", "LOAN_OUT", "STAFF_ADVANCE", "DEPOSIT"]);

export function QuickEntryDialog({
  open,
  onOpenChange,
  tree,
  initial,
  onSaved,
  onAdvanced,
  onExpense,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tree: CoaTree;
  initial?: string | null;
  onSaved: () => void;
  onAdvanced: () => void;
  onExpense?: () => void;
}) {
  const { toast } = useToast();
  const [tpl, setTpl] = useState<Template | null>(null);
  const [into, setInto] = useState("");
  const [from, setFrom] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(businessTodayYmd());
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const accounts = useMemo(() => flattenAccounts(tree).filter((a) => a.is_active), [tree]);

  const choose = (t: Template | null) => {
    setTpl(t);
    if (!t) return;
    const intoList = accounts.filter(t.into.pick);
    const fromList = accounts.filter(t.from.pick);
    const i = (t.into.prefer && intoList.find(t.into.prefer)) || intoList[0];
    let f = (t.from.prefer && fromList.find(t.from.prefer)) || fromList[0];
    if (f && i && f.id === i.id) f = fromList.find((x) => x.id !== i.id) ?? f;
    setInto(i?.id ?? "");
    setFrom(f?.id ?? "");
    setNote(t.narration);
  };

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setDate(businessTodayYmd());
    setReference("");
    choose(initial ? QUICK_TEMPLATES.find((t) => t.id === initial) ?? null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const intoAcc = accounts.find((a) => a.id === into);
  const fromAcc = accounts.find((a) => a.id === from);
  const value = Number(amount) || 0;

  const save = async () => {
    if (!tpl || !intoAcc || !fromAcc) return toast({ variant: "destructive", title: "Pick both accounts" });
    if (intoAcc.id === fromAcc.id) return toast({ variant: "destructive", title: "Pick two different accounts" });
    if (!(value > 0)) return toast({ variant: "destructive", title: "Enter the amount" });
    setBusy(true);
    try {
      const saved = await coaApi.createVoucher({
        voucher_date: date,
        narration: note.trim() || tpl.narration,
        reference: reference.trim() || null,
        branch_id: null,
        lines: [
          { account_id: intoAcc.id, debit: value, credit: 0, description: tpl.title },
          { account_id: fromAcc.id, debit: 0, credit: value, description: tpl.title },
        ],
      });
      toast({ title: "Saved", description: `${tpl.title} · ${rs(value)} (${saved.voucher_no})` });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not save", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  const AccountSelect = ({ value: v, onChange, list, label }: { value: string; onChange: (v: string) => void; list: CoaAccount[]; label: string }) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500">No suitable account yet — add one in Chart of accounts.</p>
      ) : (
        <Select value={v} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {list.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} <span className="text-gray-400">· {a.code}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        {!tpl ? (
          <>
            <DialogHeader>
              <DialogTitle>What happened?</DialogTitle>
              <DialogDescription>Pick the closest one — no debit / credit needed.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 sm:grid-cols-2">
              {onExpense && (
                <button type="button" onClick={onExpense} className="flex items-start gap-3 rounded-xl border border-gray-200 p-3 text-left hover:border-[#a67c2e] hover:bg-[#fcf8f2]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                    <Receipt className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">Paid an expense</span>
                    <span className="block text-xs text-gray-500">Bills, rent, salary, tea… (opens Expenses)</span>
                  </span>
                </button>
              )}
              {QUICK_TEMPLATES.map((t) => (
                <button key={t.id} type="button" onClick={() => choose(t)} className="flex items-start gap-3 rounded-xl border border-gray-200 p-3 text-left hover:border-[#a67c2e] hover:bg-[#fcf8f2]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fcf8f2] text-[#a67c2e]">
                    <t.icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">{t.title}</span>
                    <span className="block text-xs text-gray-500">{t.help}</span>
                  </span>
                </button>
              ))}
            </div>
            <button type="button" onClick={onAdvanced} className="mt-1 text-left text-xs text-gray-500 underline hover:text-gray-800">
              Something else? Use an advanced journal entry (debit / credit) →
            </button>
          </>
        ) : (
          <>
            <DialogHeader>
              <button type="button" onClick={() => setTpl(null)} className="mb-1 flex w-fit items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
                <ArrowLeft className="h-3.5 w-3.5" />
                Choose another
              </button>
              <DialogTitle className="flex items-center gap-2">
                <tpl.icon className="h-5 w-5 text-[#a67c2e]" />
                {tpl.title}
              </DialogTitle>
              <DialogDescription>{tpl.help}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Amount (Rs)</Label>
                <Input type="number" min={0} autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 text-lg font-semibold" />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <YmdDatePicker value={date} onChange={setDate} max={businessTodayYmd()} />
              </div>
              {(OUTFLOW.has(tpl.id)
                ? [
                    { key: "from", label: tpl.from.label, value: from, set: setFrom, pick: tpl.from.pick },
                    { key: "into", label: tpl.into.label, value: into, set: setInto, pick: tpl.into.pick },
                  ]
                : [
                    { key: "into", label: tpl.into.label, value: into, set: setInto, pick: tpl.into.pick },
                    { key: "from", label: tpl.from.label, value: from, set: setFrom, pick: tpl.from.pick },
                  ]
              ).map((f) => (
                <AccountSelect key={f.key} label={f.label} value={f.value} onChange={f.set} list={accounts.filter(f.pick)} />
              ))}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Note</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Reference (optional)</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque no., deposit slip, transaction ID" />
              </div>
            </div>
            {intoAcc && fromAcc && (
              <div className={cn("rounded-xl border px-4 py-3 text-sm", intoAcc.id === fromAcc.id ? "border-rose-200 bg-rose-50 text-rose-800" : "border-[#a67c2e]/30 bg-[#fcf8f2] text-gray-800")}>
                {intoAcc.id === fromAcc.id ? (
                  "Pick two different accounts."
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-[#a67c2e]" />
                      <span>{tpl.explain(intoAcc.name, fromAcc.name, value ? rs(value) : "the amount")}</span>
                    </div>
                    <div className="mt-1.5 text-[11px] text-gray-500">
                      For your accountant: Dr {intoAcc.code} {intoAcc.name} · Cr {fromAcc.code} {fromAcc.name}
                    </div>
                  </>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={busy} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
