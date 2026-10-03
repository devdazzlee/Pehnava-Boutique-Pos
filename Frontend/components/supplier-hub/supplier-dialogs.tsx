"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { YmdDatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { businessTodayYmd } from "@/lib/business-timezone";
import {
  METHOD_LABEL,
  apiError,
  rs2,
  supplierApi,
  type PayMethod,
  type SupplierRow,
} from "./supplier-api";

type FormState = {
  name: string;
  mobile_number: string;
  phone_number: string;
  email: string;
  city: string;
  country: string;
  address: string;
  ntn: string;
  strn: string;
  gov_id: string;
  display_on_pos: boolean;
};

const emptyForm = (): FormState => ({
  name: "",
  mobile_number: "",
  phone_number: "",
  email: "",
  city: "",
  country: "",
  address: "",
  ntn: "",
  strn: "",
  gov_id: "",
  display_on_pos: true,
});

export function SupplierFormDialog({
  open,
  editing,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  editing: SupplierRow | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name || "",
        mobile_number: editing.mobile_number || "",
        phone_number: editing.phone_number || "",
        email: editing.email || "",
        city: editing.city || "",
        country: editing.country || "",
        address: editing.address || "",
        ntn: editing.ntn || "",
        strn: editing.strn || "",
        gov_id: editing.gov_id || "",
        display_on_pos: editing.display_on_pos ?? true,
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, editing]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!form.name.trim()) {
      toast({ variant: "destructive", title: "Supplier name is required" });
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        mobile_number: form.mobile_number.trim() || null,
        phone_number: form.phone_number.trim() || null,
        email: form.email.trim() || null,
        city: form.city.trim() || null,
        country: form.country.trim() || null,
        address: form.address.trim() || null,
        ntn: form.ntn.trim() || null,
        strn: form.strn.trim() || null,
        gov_id: form.gov_id.trim() || null,
        display_on_pos: form.display_on_pos,
        status: "active",
      };
      if (editing) await supplierApi.update(editing.id, body);
      else await supplierApi.create(body);
      toast({ title: editing ? "Supplier updated" : "Supplier created" });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not save supplier",
        description: apiError(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit supplier" : "New supplier"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Name <span className="text-rose-500">*</span></Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Supplier / brand name" />
          </div>
          <div className="space-y-1.5">
            <Label>Mobile</Label>
            <Input value={form.mobile_number} onChange={(e) => set("mobile_number", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone_number} onChange={(e) => set("phone_number", e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Country</Label>
            <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Address</Label>
            <Textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>NTN</Label>
            <Input value={form.ntn} onChange={(e) => set("ntn", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>STRN</Label>
            <Input value={form.strn} onChange={(e) => set("strn", e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Gov ID</Label>
            <Input value={form.gov_id} onChange={(e) => set("gov_id", e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox
              checked={form.display_on_pos}
              onCheckedChange={(v) => set("display_on_pos", Boolean(v))}
            />
            Show on POS / Stock In supplier list
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {editing ? "Save changes" : "Create supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentDialog({
  open,
  supplier,
  balanceDue,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  supplier: SupplierRow | null;
  balanceDue: number;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(businessTodayYmd());
  const [method, setMethod] = useState<PayMethod>("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [kind, setKind] = useState<"settle" | "upfront">("settle");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(balanceDue > 0.005 ? "settle" : "upfront");
    setAmount(balanceDue > 0.005 ? String(Math.round(balanceDue * 100) / 100) : "");
    setDate(businessTodayYmd());
    setMethod("CASH");
    setReference("");
    setNotes("");
  }, [open, balanceDue, supplier?.id]);

  const save = async () => {
    if (!supplier) return;
    const value = Number(amount);
    if (!(value > 0)) {
      toast({ variant: "destructive", title: "Enter a valid payment amount" });
      return;
    }
    setSaving(true);
    try {
      await supplierApi.pay(supplier.id, {
        amount: value,
        paymentDate: new Date(`${date}T12:00:00`).toISOString(),
        method,
        reference: reference.trim() || undefined,
        notes:
          [kind === "upfront" ? "Upfront / advance payment" : null, notes.trim()]
            .filter(Boolean)
            .join(" · ") || undefined,
      });
      toast({ title: "Payment recorded", description: `${rs2(value)} paid to ${supplier.name}` });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not record payment",
        description: apiError(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay {supplier?.name || "supplier"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {balanceDue > 0.005 ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              Balance due <span className="font-semibold tabular-nums">{rs2(balanceDue)}</span>
            </div>
          ) : balanceDue < -0.005 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Advance held <span className="font-semibold tabular-nums">{rs2(Math.abs(balanceDue))}</span>
            </div>
          ) : null}

          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(
              [
                { id: "settle" as const, label: "Settle balance" },
                { id: "upfront" as const, label: "Advance / upfront" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setKind(opt.id);
                  if (opt.id === "settle" && balanceDue > 0) {
                    setAmount(String(Math.round(balanceDue * 100) / 100));
                  }
                }}
                className={
                  kind === opt.id
                    ? "rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                    : "rounded-md px-3 py-1.5 text-xs font-medium text-slate-600"
                }
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Amount <span className="text-rose-500">*</span></Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <YmdDatePicker value={date} onChange={setDate} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PayMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(METHOD_LABEL).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque / txn #" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
