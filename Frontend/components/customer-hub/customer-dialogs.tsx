"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { YmdDatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { businessTodayYmd } from "@/lib/business-timezone";
import { cn } from "@/lib/utils";
import {
  METHOD_LABEL,
  PAYMENT_METHODS,
  TXN_META,
  apiError,
  customerApi,
  displayEmail,
  num,
  rs,
  type CustomerRow,
  type OpenItem,
  type Txn,
  type TxnType,
} from "./customer-api";

function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs font-medium text-gray-600">{label}</Label>
      {children}
      {error ? <p className="text-[11px] text-rose-600">{error}</p> : hint ? <p className="text-[11px] text-gray-400">{hint}</p> : null}
    </div>
  );
}

/* ============================ customer form ============================ */

type FormState = {
  name: string;
  phone_number: string;
  email: string;
  address: string;
  billing_address: string;
  credit_limit: string;
  credit_days: string;
  previous_credit_balance: string;
  default_discount_percent: string;
  notes: string;
};

const blank = (): FormState => ({
  name: "",
  phone_number: "",
  email: "",
  address: "",
  billing_address: "",
  credit_limit: "",
  credit_days: "",
  previous_credit_balance: "",
  default_discount_percent: "",
  notes: "",
});

const toForm = (c: CustomerRow): FormState => ({
  name: c.name || "",
  phone_number: c.phone_number || "",
  email: displayEmail(c.email) || "",
  address: c.address || "",
  billing_address: c.billing_address || "",
  credit_limit: c.credit_limit != null && c.credit_limit !== "" ? String(c.credit_limit) : "",
  credit_days: c.credit_days != null ? String(c.credit_days) : "",
  previous_credit_balance: num(c.previous_credit_balance) > 0 ? String(c.previous_credit_balance) : "",
  default_discount_percent: num(c.default_discount_percent) > 0 ? String(c.default_discount_percent) : "",
  notes: c.notes || "",
});

export function CustomerFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: CustomerRow | null;
  onSaved: (id?: string) => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState<FormState>(blank);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF(editing ? toForm(editing) : blank());
    setErrors({});
  }, [open, editing]);

  const set = (patch: Partial<FormState>) => setF((prev) => ({ ...prev, ...patch }));

  const validate = () => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!f.name.trim()) e.name = "Name is required";
    const phone = f.phone_number.trim();
    if (!phone) e.phone_number = "Phone number is required";
    else if (!/^[0-9+\-\s]{7,20}$/.test(phone)) e.phone_number = "Use 7–20 digits (+, - and spaces allowed)";
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = "Invalid email address";
    for (const key of ["credit_limit", "previous_credit_balance"] as const) {
      if (f[key] && (!Number.isFinite(Number(f[key])) || Number(f[key]) < 0)) e[key] = "Enter a positive amount";
    }
    if (f.credit_days && (!Number.isInteger(Number(f.credit_days)) || Number(f.credit_days) < 0 || Number(f.credit_days) > 365)) {
      e.credit_days = "0–365 days";
    }
    if (f.default_discount_percent && (Number(f.default_discount_percent) < 0 || Number(f.default_discount_percent) > 100)) {
      e.default_discount_percent = "0–100%";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
    try {
      const body = {
        name: f.name.trim(),
        phone_number: f.phone_number.trim(),
        email: f.email.trim() || (editing ? null : undefined),
        address: f.address.trim() || (editing ? null : undefined),
        billing_address: f.billing_address.trim() || (editing ? null : undefined),
        credit_limit: numOrNull(f.credit_limit),
        credit_days: numOrNull(f.credit_days),
        previous_credit_balance: editing ? numOrNull(f.previous_credit_balance) : numOrNull(f.previous_credit_balance) ?? undefined,
        default_discount_percent: numOrNull(f.default_discount_percent) ?? 0,
        notes: f.notes.trim() || (editing ? null : undefined),
        ...(editing ? {} : { is_active: true }),
      };
      if (editing) {
        await customerApi.update(editing.id, body);
        toast({ title: "Customer updated", description: f.name });
        onOpenChange(false);
        onSaved(editing.id);
      } else {
        const created = await customerApi.create(body);
        toast({ title: "Customer added", description: f.name });
        onOpenChange(false);
        onSaved(created?.customer?.id);
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save customer", description: apiError(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit customer" : "New customer"}</DialogTitle>
          <DialogDescription>Contact details plus the credit terms used for the receivables ledger.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Contact</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name *" error={errors.name}>
                <Input value={f.name} onChange={(e) => set({ name: e.target.value })} className="h-9" autoFocus />
              </Field>
              <Field label="Phone *" error={errors.phone_number}>
                <Input value={f.phone_number} onChange={(e) => set({ phone_number: e.target.value })} className="h-9" inputMode="tel" placeholder="03xx xxxxxxx" />
              </Field>
              <Field label="Email" error={errors.email}>
                <Input value={f.email} onChange={(e) => set({ email: e.target.value })} className="h-9" type="email" />
              </Field>
              <Field label="Address">
                <Input value={f.address} onChange={(e) => set({ address: e.target.value })} className="h-9" />
              </Field>
              <Field label="Billing address" className="sm:col-span-2" hint="Leave empty if same as address">
                <Input value={f.billing_address} onChange={(e) => set({ billing_address: e.target.value })} className="h-9" />
              </Field>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Credit terms</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Credit limit (Rs)" error={errors.credit_limit} hint="Empty = no limit">
                <Input type="number" min="0" value={f.credit_limit} onChange={(e) => set({ credit_limit: e.target.value })} className="h-9 bg-white" />
              </Field>
              <Field label="Credit days" error={errors.credit_days} hint="Credit bills fall due after this many days">
                <Input type="number" min="0" max="365" value={f.credit_days} onChange={(e) => set({ credit_days: e.target.value })} className="h-9 bg-white" placeholder="e.g. 30" />
              </Field>
              <Field label="Opening balance owed (Rs)" error={errors.previous_credit_balance} hint="Old balance from before using the POS">
                <Input type="number" min="0" value={f.previous_credit_balance} onChange={(e) => set({ previous_credit_balance: e.target.value })} className="h-9 bg-white" />
              </Field>
              <Field label="Default discount (%)" error={errors.default_discount_percent}>
                <Input type="number" min="0" max="100" value={f.default_discount_percent} onChange={(e) => set({ default_discount_percent: e.target.value })} className="h-9 bg-white" />
              </Field>
            </div>
          </section>

          <Field label="Notes" hint="Measurements, preferences or anything staff should know">
            <Textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} className="min-h-[70px] text-sm" />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save changes" : "Add customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ transaction ============================ */

const TYPE_ORDER: TxnType[] = ["PAYMENT", "ADVANCE", "REFUND", "CREDIT_NOTE", "DEBIT_NOTE", "WRITE_OFF"];

export function TransactionDialog({
  open,
  onOpenChange,
  customer,
  initialType = "PAYMENT",
  initialSaleId,
  editing,
  openItems,
  balanceDue,
  advanceBalance,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: { id: string; name: string | null };
  initialType?: TxnType;
  initialSaleId?: string | null;
  editing?: Txn | null;
  openItems: OpenItem[];
  balanceDue: number;
  advanceBalance: number;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<TxnType>(initialType);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(businessTodayYmd());
  const [method, setMethod] = useState<string>("CASH");
  const [saleId, setSaleId] = useState<string>("none");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.type);
      setAmount(String(editing.amount));
      setDate(format(new Date(editing.payment_date), "yyyy-MM-dd"));
      setMethod(editing.method);
      setSaleId(editing.sale_id || "none");
      setReference(editing.reference || "");
      setNotes(editing.notes || "");
    } else {
      setType(initialType);
      const target = initialSaleId ? openItems.find((i) => i.saleId === initialSaleId) : null;
      setAmount(target ? String(target.outstanding) : initialType === "PAYMENT" && balanceDue > 0 ? String(balanceDue) : initialType === "REFUND" && advanceBalance > 0 ? String(advanceBalance) : "");
      setDate(businessTodayYmd());
      setMethod("CASH");
      setSaleId(initialSaleId || "none");
      setReference("");
      setNotes("");
    }
  }, [open, editing, initialType, initialSaleId, openItems, balanceDue, advanceBalance]);

  const meta = TXN_META[type];
  const value = Number(amount) || 0;
  const invoiceItems = useMemo(() => openItems.filter((i) => i.saleId), [openItems]);
  const showInvoice = type === "PAYMENT" || type === "CREDIT_NOTE" || type === "WRITE_OFF";

  // Projected balance after saving (signed: + owes, - advance).
  const current = balanceDue - advanceBalance;
  const previousEffect = editing ? (TXN_META[editing.type].side === "credit" ? -editing.amount : editing.amount) : 0;
  const effect = meta.side === "credit" ? -value : value;
  const projected = current - previousEffect + effect;

  const save = async () => {
    if (!(value > 0)) {
      toast({ variant: "destructive", title: "Enter an amount greater than zero" });
      return;
    }
    setSaving(true);
    try {
      const body = {
        type,
        amount: value,
        paymentDate: date,
        method: meta.cash ? method : "ADJUSTMENT",
        reference: reference.trim() || (editing ? null : undefined),
        notes: notes.trim() || (editing ? null : undefined),
        saleId: showInvoice && saleId !== "none" ? saleId : null,
      };
      if (editing) await customerApi.updateTxn(customer.id, editing.id, body);
      else await customerApi.addTxn(customer.id, body);
      toast({ title: editing ? "Transaction updated" : `${meta.label} recorded`, description: `${customer.name || "Customer"} · ${rs(value)}` });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save transaction", description: apiError(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit transaction" : meta.verb}</DialogTitle>
          <DialogDescription>{customer.name || "Customer"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TYPE_ORDER.map((t) => {
              const m = TXN_META[t];
              const active = t === type;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-all",
                    active ? "border-[#2a2012] bg-[#2a2012] text-white shadow-sm" : "border-gray-200 bg-white hover:border-gray-300",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    {m.side === "credit" ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                    {m.label}
                  </span>
                  <span className={cn("block text-[10px]", active ? "text-white/60" : "text-gray-400")}>
                    {m.side === "credit" ? "Reduces balance" : "Increases balance"}
                    {m.cash ? " · cash" : " · no cash"}
                  </span>
                </button>
              );
            })}
          </div>
          <p className={cn("rounded-lg px-3 py-2 text-xs ring-1 ring-inset", meta.tone)}>{meta.help}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount (Rs)">
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 text-base font-semibold tabular-nums" autoFocus />
            </Field>
            <Field label="Date">
              <YmdDatePicker value={date} onChange={setDate} className="h-10" />
            </Field>
            {meta.cash ? (
              <Field label="Method">
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>{METHOD_LABEL[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <Field label="Reference" hint={meta.cash ? "Receipt / cheque / transaction no." : "Note or document no."}>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-9" />
            </Field>
            {showInvoice && invoiceItems.length ? (
              <Field label="Apply to invoice" className="sm:col-span-2" hint="Optional — otherwise the oldest open bill is settled first">
                <Select
                  value={saleId}
                  onValueChange={(v) => {
                    setSaleId(v);
                    const item = invoiceItems.find((i) => i.saleId === v);
                    if (item && !editing) setAmount(String(item.outstanding));
                  }}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Oldest bills first (automatic)</SelectItem>
                    {invoiceItems.map((i) => (
                      <SelectItem key={i.key} value={i.saleId as string}>
                        {i.reference} · {format(new Date(i.date), "dd MMM")} · due {rs(i.outstanding)}
                        {i.daysOverdue > 0 ? ` · ${i.daysOverdue}d overdue` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <Field label="Notes" className="sm:col-span-2">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[56px] text-sm" />
            </Field>
          </div>

          <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-gray-200 text-center">
            <div className="p-3">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Now</p>
              <p className={cn("text-sm font-semibold tabular-nums", current > 0 ? "text-rose-700" : current < 0 ? "text-emerald-700" : "text-gray-700")}>
                {current < 0 ? `${rs(-current)} adv` : rs(current)}
              </p>
            </div>
            <div className="border-x border-gray-100 bg-gray-50 p-3">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">This entry</p>
              <p className={cn("text-sm font-semibold tabular-nums", meta.side === "credit" ? "text-emerald-700" : "text-rose-700")}>
                {meta.side === "credit" ? "−" : "+"} {rs(value)}
              </p>
            </div>
            <div className="p-3">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">After</p>
              <p className={cn("text-sm font-bold tabular-nums", projected > 0.005 ? "text-rose-700" : projected < -0.005 ? "text-emerald-700" : "text-gray-900")}>
                {projected < -0.005 ? `${rs(-projected)} advance` : projected > 0.005 ? `${rs(projected)} owed` : "Settled"}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !(value > 0)} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save changes" : `Save ${meta.label.toLowerCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
