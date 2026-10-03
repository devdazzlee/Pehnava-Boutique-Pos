"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2, CreditCard, Landmark, Loader2, Phone, Star, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { YmdDatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { businessTodayYmd } from "@/lib/business-timezone";
import { cn } from "@/lib/utils";
import { apiError, METHOD_LABEL, rs, supplierApi, TXN_META, type OpenBill, type PayMethod, type SupplierRow, type TxnRow, type TxnType } from "./supplier-api";

/* ====================================================================== */
/* Supplier form                                                          */
/* ====================================================================== */

type FormState = Record<string, string | boolean>;
const TEXT_FIELDS = [
  "name",
  "contact_person",
  "phone_number",
  "mobile_number",
  "whatsapp_number",
  "fax_number",
  "email",
  "address",
  "city",
  "country",
  "category",
  "ntn",
  "strn",
  "gov_id",
  "payment_terms",
  "bank_name",
  "bank_account_title",
  "bank_account_number",
  "bank_iban",
  "notes",
] as const;

const TERMS = [
  { label: "Cash on delivery", days: 0 },
  { label: "7 days", days: 7 },
  { label: "15 days", days: 15 },
  { label: "30 days", days: 30 },
  { label: "45 days", days: 45 },
  { label: "60 days", days: 60 },
];

function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-gray-700">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Phone; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 p-4">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Icon className="h-4 w-4 text-[#a67c2e]" />
        {title}
      </h4>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function SupplierFormDialog({
  open,
  onOpenChange,
  editing,
  facets,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: SupplierRow | null;
  facets?: { cities: string[]; categories: string[] };
  onSaved: (s: SupplierRow) => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState<FormState>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const base: FormState = Object.fromEntries(TEXT_FIELDS.map((k) => [k, String((editing as unknown as Record<string, unknown>)?.[k] ?? "")]));
    base.country = editing?.country || "Pakistan";
    base.credit_days = editing?.credit_days != null ? String(editing.credit_days) : "";
    base.credit_limit = editing?.credit_limit != null ? String(editing.credit_limit) : "";
    base.opening_balance = editing?.opening_balance ? String(Math.abs(editing.opening_balance)) : "";
    base.opening_side = (editing?.opening_balance ?? 0) < 0 ? "advance" : "owe";
    base.opening_balance_date = editing?.opening_balance_date ? editing.opening_balance_date.slice(0, 10) : businessTodayYmd();
    base.rating = editing?.rating ? String(editing.rating) : "";
    base.display_on_pos = editing?.display_on_pos ?? true;
    setF(base);
  }, [open, editing]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const str = (k: string) => String(f[k] ?? "");

  const save = async () => {
    if (!str("name").trim()) return toast({ variant: "destructive", title: "Enter the supplier name" });
    const email = str("email").trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return toast({ variant: "destructive", title: "Email looks wrong" });
    setBusy(true);
    const body: Record<string, unknown> = {};
    for (const k of TEXT_FIELDS) {
      const v = str(k).trim();
      if (editing) body[k] = v || null;
      else if (v) body[k] = v;
    }
    body.name = str("name").trim();
    body.display_on_pos = !!f.display_on_pos;
    body.credit_days = str("credit_days") === "" ? null : Number(str("credit_days"));
    body.credit_limit = str("credit_limit") === "" ? null : Number(str("credit_limit"));
    body.rating = str("rating") === "" ? null : Number(str("rating"));
    const ob = Number(str("opening_balance")) || 0;
    body.opening_balance = f.opening_side === "advance" ? -ob : ob;
    body.opening_balance_date = ob ? str("opening_balance_date") || null : null;
    try {
      const saved = editing ? await supplierApi.update(editing.id, body) : await supplierApi.create(body);
      toast({ title: editing ? "Supplier updated" : "Supplier added", description: saved.name });
      onOpenChange(false);
      onSaved(saved);
    } catch (e) {
      toast({ variant: "destructive", title: "Could not save supplier", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : "Add supplier"}</DialogTitle>
          <DialogDescription>Contact details, payment terms, bank account and any balance carried from before.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Section icon={Building2} title="Business">
            <Field label="Supplier / company name *" className="sm:col-span-2">
              <Input value={str("name")} onChange={set("name")} placeholder="e.g. Al-Karam Textiles" autoFocus />
            </Field>
            <Field label="Category">
              <Input value={str("category")} onChange={set("category")} placeholder="Fabric, Embroidery, Packaging…" list="supplier-categories" />
              <datalist id="supplier-categories">
                {(facets?.categories ?? []).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Rating">
              <div className="flex h-9 items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setF((x) => ({ ...x, rating: String(x.rating) === String(n) ? "" : String(n) }))} title={`${n} star`}>
                    <Star className={cn("h-5 w-5", Number(str("rating")) >= n ? "fill-[#a67c2e] text-[#a67c2e]" : "text-gray-300")} />
                  </button>
                ))}
              </div>
            </Field>
            <Field label="NTN">
              <Input value={str("ntn")} onChange={set("ntn")} />
            </Field>
            <Field label="STRN (sales tax no.)">
              <Input value={str("strn")} onChange={set("strn")} />
            </Field>
          </Section>

          <Section icon={Phone} title="Contact">
            <Field label="Contact person">
              <Input value={str("contact_person")} onChange={set("contact_person")} />
            </Field>
            <Field label="Mobile">
              <Input value={str("mobile_number")} onChange={set("mobile_number")} placeholder="03xx xxxxxxx" />
            </Field>
            <Field label="WhatsApp">
              <Input value={str("whatsapp_number")} onChange={set("whatsapp_number")} placeholder="Same as mobile if empty" />
            </Field>
            <Field label="Office phone">
              <Input value={str("phone_number")} onChange={set("phone_number")} />
            </Field>
            <Field label="Email">
              <Input value={str("email")} onChange={set("email")} type="email" />
            </Field>
            <Field label="City">
              <Input value={str("city")} onChange={set("city")} list="supplier-cities" />
              <datalist id="supplier-cities">
                {(facets?.cities ?? []).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Textarea value={str("address")} onChange={set("address")} rows={2} />
            </Field>
          </Section>

          <Section icon={CreditCard} title="Payment terms">
            <Field label="Credit period (days)" hint="Bills are due this many days after delivery / invoice.">
              <Input type="number" min={0} value={str("credit_days")} onChange={set("credit_days")} placeholder="0 = pay on delivery" />
              <div className="flex flex-wrap gap-1 pt-1">
                {TERMS.map((t) => (
                  <button
                    key={t.days}
                    type="button"
                    onClick={() => setF((x) => ({ ...x, credit_days: String(t.days), payment_terms: x.payment_terms || t.label }))}
                    className={cn("rounded-full border px-2 py-0.5 text-[11px]", str("credit_days") === String(t.days) ? "border-[#2a2012] bg-[#2a2012] text-white" : "border-gray-200 hover:border-[#a67c2e]")}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Credit limit (Rs)" hint="Warns you when what you owe goes above this.">
              <Input type="number" min={0} value={str("credit_limit")} onChange={set("credit_limit")} placeholder="No limit" />
            </Field>
            <Field label="Terms note" className="sm:col-span-2">
              <Input value={str("payment_terms")} onChange={set("payment_terms")} placeholder="e.g. 50% advance, rest on delivery" />
            </Field>
          </Section>

          <Section icon={Landmark} title="Supplier's bank account (for payments)">
            <Field label="Bank">
              <Input value={str("bank_name")} onChange={set("bank_name")} placeholder="Meezan, HBL…" />
            </Field>
            <Field label="Account title">
              <Input value={str("bank_account_title")} onChange={set("bank_account_title")} />
            </Field>
            <Field label="Account number">
              <Input value={str("bank_account_number")} onChange={set("bank_account_number")} />
            </Field>
            <Field label="IBAN">
              <Input value={str("bank_iban")} onChange={set("bank_iban")} placeholder="PK00 XXXX …" className="font-mono" />
            </Field>
          </Section>

          <Section icon={Wallet} title="Opening balance (from before using this POS)">
            <Field label="Amount (Rs)">
              <Input type="number" min={0} value={str("opening_balance")} onChange={set("opening_balance")} placeholder="0" />
            </Field>
            <Field label="As of">
              <YmdDatePicker value={str("opening_balance_date")} onChange={(v) => setF((x) => ({ ...x, opening_balance_date: v }))} />
            </Field>
            <div className="sm:col-span-2">
              <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-xs">
                {[
                  { v: "owe", l: "We owe the supplier" },
                  { v: "advance", l: "Supplier holds our advance" },
                ].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setF((x) => ({ ...x, opening_side: o.v }))}
                    className={cn("rounded-md px-3 py-1.5 font-medium", f.opening_side === o.v ? "bg-[#2a2012] text-white" : "text-gray-600 hover:bg-gray-100")}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Internal notes">
              <Textarea value={str("notes")} onChange={set("notes")} rows={2} />
            </Field>
            <label className="flex items-center justify-between gap-3 self-end rounded-lg border border-gray-200 px-3 py-2.5 text-sm">
              <span>
                Show in product forms
                <span className="block text-[11px] text-gray-500">Available when adding products / stock-in</span>
              </span>
              <Switch checked={!!f.display_on_pos} onCheckedChange={(v) => setF((x) => ({ ...x, display_on_pos: v }))} />
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save changes" : "Add supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ====================================================================== */
/* Payment / adjustment                                                   */
/* ====================================================================== */

const TYPE_ORDER: TxnType[] = ["PAYMENT", "ADVANCE", "DEBIT_NOTE", "DISCOUNT", "CREDIT_NOTE", "REFUND"];
const METHODS: PayMethod[] = ["CASH", "BANK_TRANSFER", "CHEQUE", "MOBILE_MONEY", "CARD", "OTHER"];

export function TransactionDialog({
  open,
  onOpenChange,
  supplier,
  initialType = "PAYMENT",
  editing,
  balanceDue,
  openBills,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  supplier: Pick<SupplierRow, "id" | "name" | "bank_name" | "bank_account_number" | "bank_iban"> | null;
  initialType?: TxnType;
  editing?: TxnRow | null;
  balanceDue?: number;
  openBills?: OpenBill[];
  onSaved: (t: TxnRow) => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<TxnType>(initialType);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(businessTodayYmd());
  const [method, setMethod] = useState<PayMethod>("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [invoiceId, setInvoiceId] = useState<string>("none");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(editing?.type ?? initialType);
    setAmount(editing ? String(editing.amount) : "");
    setDate(editing ? editing.payment_date.slice(0, 10) : businessTodayYmd());
    setMethod(((editing?.method && editing.method !== "ADJUSTMENT" ? editing.method : "CASH") as PayMethod) || "CASH");
    setReference(editing?.reference ?? "");
    setNotes(editing?.notes ?? "");
    setInvoiceId(editing?.purchase_invoice_id ?? "none");
  }, [open, editing, initialType]);

  const meta = TXN_META[type];
  const invoices = useMemo(() => (openBills ?? []).filter((b) => b.kind === "INVOICE" && b.invoiceId), [openBills]);
  const canAllocate = type === "PAYMENT" || type === "DEBIT_NOTE" || type === "DISCOUNT";
  const value = Number(amount) || 0;
  const after = balanceDue != null ? balanceDue + (meta.effect === "increase" ? value : -value) : null;

  const save = async () => {
    if (!supplier) return;
    if (!(value > 0)) return toast({ variant: "destructive", title: "Enter an amount" });
    if (!meta.cash && !notes.trim()) return toast({ variant: "destructive", title: "Write the reason for this note" });
    setBusy(true);
    const body = {
      type,
      amount: value,
      paymentDate: date,
      method: meta.cash ? method : undefined,
      reference: reference.trim() || null,
      notes: notes.trim() || null,
      purchaseInvoiceId: canAllocate && invoiceId !== "none" ? invoiceId : null,
    };
    try {
      const saved = editing ? await supplierApi.updateTxn(supplier.id, editing.id, body) : await supplierApi.addTxn(supplier.id, body);
      toast({ title: `${meta.label} ${editing ? "updated" : "recorded"}`, description: `${rs(value)} · ${supplier.name}` });
      onOpenChange(false);
      onSaved(saved);
    } catch (e) {
      toast({ variant: "destructive", title: "Could not save", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit transaction" : "New transaction"}</DialogTitle>
          <DialogDescription>{supplier?.name}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TYPE_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                "rounded-lg border px-2.5 py-2 text-left transition-colors",
                type === t ? "border-[#a67c2e] bg-[#fcf8f2] ring-1 ring-[#a67c2e]" : "border-gray-200 hover:bg-gray-50",
              )}
            >
              <span className="block text-xs font-semibold text-gray-900">{TXN_META[t].label}</span>
              <span className={cn("block text-[10px]", TXN_META[t].effect === "reduce" ? "text-emerald-700" : "text-rose-700")}>
                {TXN_META[t].effect === "reduce" ? "− reduces what we owe" : "+ increases what we owe"}
              </span>
            </button>
          ))}
        </div>
        <p className="-mt-1 text-xs text-gray-500">{meta.help}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (Rs)">
            <Input type="number" min={0} autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 text-base font-semibold" />
            {balanceDue != null && balanceDue > 0 && type === "PAYMENT" && (
              <button type="button" onClick={() => setAmount(String(Math.round(balanceDue)))} className="text-[11px] font-medium text-[#a67c2e]">
                Pay full balance ({rs(balanceDue)})
              </button>
            )}
          </Field>
          <Field label="Date">
            <YmdDatePicker value={date} onChange={setDate} max={businessTodayYmd()} />
          </Field>
          {meta.cash && (
            <Field label={type === "REFUND" ? "Received by" : "Paid by"}>
              <Select value={method} onValueChange={(v) => setMethod(v as PayMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {METHOD_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label={method === "CHEQUE" && meta.cash ? "Cheque no." : meta.cash ? "Reference / transaction ID" : "Note / bill reference"}>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          {canAllocate && invoices.length > 0 && (
            <Field label="Against invoice (optional)" className="sm:col-span-2">
              <Select value={invoiceId} onValueChange={setInvoiceId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Oldest bills first (automatic)</SelectItem>
                  {invoices.map((b) => (
                    <SelectItem key={b.invoiceId!} value={b.invoiceId!}>
                      {b.ref} — {rs(b.outstanding)} due
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label={meta.cash ? "Notes" : "Reason *"} className="sm:col-span-2">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={type === "DEBIT_NOTE" ? "e.g. 3 suits short in delivery 202" : type === "CREDIT_NOTE" ? "e.g. freight charges for October" : ""} />
          </Field>
        </div>

        {meta.cash && type !== "REFUND" && (method === "BANK_TRANSFER" || method === "CHEQUE") && supplier?.bank_account_number && (
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            Pay to: <b>{supplier.bank_name}</b> · {supplier.bank_account_number}
            {supplier.bank_iban ? ` · ${supplier.bank_iban}` : ""}
          </div>
        )}
        {after != null && value > 0 && !editing && (
          <div className="flex items-center justify-between rounded-lg border border-[#a67c2e]/30 bg-[#fcf8f2] px-3 py-2 text-sm">
            <span className="text-gray-600">Balance after this</span>
            <b className={cn(after < -0.5 ? "text-emerald-700" : "text-gray-900")}>{after < -0.5 ? `${rs(-after)} advance` : rs(after)}</b>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save" : `Record ${meta.label.toLowerCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
