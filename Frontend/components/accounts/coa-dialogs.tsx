"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { YmdDatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { businessTodayYmd } from "@/lib/business-timezone";
import {
  apiError,
  coaApi,
  isDebitNature,
  type CoaAccount,
  type CoaControl,
  type CoaSubType,
  type CoaType,
} from "./coa-shared";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------ Sub type ------------------------------ */

export function SubTypeDialog({
  open,
  onOpenChange,
  typeCode,
  types,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  typeCode: number;
  types: CoaType[];
  editing: CoaSubType | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState(typeCode);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(editing?.type_code ?? typeCode);
    setCode(editing?.code ?? "");
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
  }, [open, editing, typeCode]);

  useEffect(() => {
    if (!open || editing) return;
    coaApi
      .nextCode({ typeCode: type })
      .then((r) => setCode(r.subType || ""))
      .catch(() => setCode(""));
  }, [open, editing, type]);

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await coaApi.updateSubType(editing.id, { name, description: description || null });
      } else {
        await coaApi.createSubType({ type_code: type, code: code || undefined, name, description: description || null });
      }
      toast({ title: editing ? "Sub type updated" : "Sub type added", description: `${code} · ${name}` });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save sub type", description: apiError(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit sub type" : "Add sub type"}</DialogTitle>
          <DialogDescription>Level 2 — groups control accounts (e.g. 52 Indirect Expenses).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account type">
              <Select value={String(type)} onValueChange={(v) => setType(Number(v))} disabled={!!editing}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.code} value={String(t.code)}>{t.code} · {t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Sub type code" hint={editing ? "Codes cannot be changed" : `2 digits, starts with ${type}`}>
              <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 2))}
                disabled={!!editing} className="h-9 font-mono" />
            </Field>
          </div>
          <Field label="Sub type name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Indirect Expenses" className="h-9" autoFocus />
          </Field>
          <Field label="Description (optional)">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[60px] text-sm" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || name.trim().length < 2}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Control ------------------------------ */

export function ControlDialog({
  open,
  onOpenChange,
  subType,
  subTypes,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subType: CoaSubType | null;
  subTypes: CoaSubType[];
  editing: CoaControl | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [subTypeId, setSubTypeId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubTypeId(editing?.sub_type_id ?? subType?.id ?? subTypes[0]?.id ?? "");
    setCode(editing?.code ?? "");
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
  }, [open, editing, subType, subTypes]);

  useEffect(() => {
    if (!open || editing || !subTypeId) return;
    coaApi
      .nextCode({ subTypeId })
      .then((r) => setCode(r.control || ""))
      .catch(() => setCode(""));
  }, [open, editing, subTypeId]);

  const selectedSub = subTypes.find((s) => s.id === subTypeId);

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await coaApi.updateControl(editing.id, { name, description: description || null });
      } else {
        await coaApi.createControl({ sub_type_id: subTypeId, code: code || undefined, name, description: description || null });
      }
      toast({ title: editing ? "Control account updated" : "Control account added", description: `${code} · ${name}` });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save control account", description: apiError(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit control account" : "Add control account"}</DialogTitle>
          <DialogDescription>Level 3 — e.g. 523 Utility Expenses, 524 Office Expenses, 522 Payroll Expense.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Sub type">
            <Select value={subTypeId} onValueChange={setSubTypeId} disabled={!!editing}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select sub type" /></SelectTrigger>
              <SelectContent>
                {subTypes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.code} · {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Type code">
              <Input value={selectedSub ? String(selectedSub.type_code) : ""} disabled className="h-9 font-mono" />
            </Field>
            <Field label="Sub type code">
              <Input value={selectedSub?.code ?? ""} disabled className="h-9 font-mono" />
            </Field>
            <Field label="Control code">
              <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
                disabled={!!editing} className="h-9 font-mono" />
            </Field>
          </div>
          <Field label="Control account name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Utility Expenses" className="h-9" autoFocus />
          </Field>
          <Field label="Description (optional)">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[60px] text-sm" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || name.trim().length < 2 || !subTypeId}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- Transactional --------------------------- */

const blankAccount = () => ({
  control_id: "",
  code: "",
  name: "",
  contact_person: "",
  mobile: "",
  address: "",
  nic: "",
  ntn: "",
  email: "",
  notes: "",
  opening_balance: "",
  opening_side: "DEBIT" as "DEBIT" | "CREDIT",
  is_active: true,
});

export function AccountDialog({
  open,
  onOpenChange,
  control,
  types,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  control: CoaControl | null;
  types: CoaType[];
  editing: CoaAccount | null;
  onSaved: (account: CoaAccount) => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState(blankAccount);
  const [saving, setSaving] = useState(false);

  const allControls = types.flatMap((t) =>
    t.subTypes.flatMap((s) => s.controls.map((c) => ({ ...c, typeCode: t.code, typeName: t.name, subName: s.name, subCode: s.code }))),
  );
  const selected = allControls.find((c) => c.id === f.control_id);
  const typeCode = selected?.typeCode ?? editing?.type_code ?? 1;
  const isPL = typeCode === 4 || typeCode === 5;

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setF({
        control_id: editing.control_id,
        code: editing.code,
        name: editing.name,
        contact_person: editing.contact_person ?? "",
        mobile: editing.mobile ?? "",
        address: editing.address ?? "",
        nic: editing.nic ?? "",
        ntn: editing.ntn ?? "",
        email: editing.email ?? "",
        notes: editing.notes ?? "",
        opening_balance: editing.opening_balance ? String(editing.opening_balance) : "",
        opening_side: editing.opening_side,
        is_active: editing.is_active,
      });
    } else {
      const ctrl = control ?? null;
      const ctrlType = ctrl ? allControls.find((c) => c.id === ctrl.id)?.typeCode ?? 1 : 1;
      setF({ ...blankAccount(), control_id: ctrl?.id ?? "", opening_side: isDebitNature(ctrlType) ? "DEBIT" : "CREDIT" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, control]);

  useEffect(() => {
    if (!open || !f.control_id) return;
    if (editing && f.control_id === editing.control_id) return;
    coaApi
      .nextCode({ controlId: f.control_id })
      .then((r) => setF((prev) => ({ ...prev, code: r.account || "" })))
      .catch(() => undefined);
  }, [open, editing, f.control_id]);

  const set = (patch: Partial<typeof f>) => setF((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, any> = {
        name: f.name.trim(),
        contact_person: f.contact_person || null,
        mobile: f.mobile || null,
        address: f.address || null,
        nic: f.nic || null,
        ntn: f.ntn || null,
        email: f.email || null,
        notes: f.notes || null,
        opening_balance: isPL ? 0 : Number(f.opening_balance) || 0,
        opening_side: f.opening_side,
        is_active: f.is_active,
      };
      let saved: CoaAccount;
      if (editing) {
        if (f.control_id !== editing.control_id) body.control_id = f.control_id;
        saved = await coaApi.updateAccount(editing.id, body);
      } else {
        saved = await coaApi.createAccount({ ...body, control_id: f.control_id, code: f.code || undefined });
      }
      toast({ title: editing ? "Account updated" : "Account added", description: `${saved.code} · ${saved.name}` });
      onOpenChange(false);
      onSaved(saved);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save account", description: apiError(error) });
    } finally {
      setSaving(false);
    }
  };

  const controlsForPicker = editing
    ? allControls.filter((c) => c.typeCode === editing.type_code)
    : allControls;
  const grouped = new Map<string, typeof allControls>();
  for (const c of controlsForPicker) {
    const key = `${c.typeCode} ${c.typeName} › ${c.subCode} ${c.subName}`;
    grouped.set(key, [...(grouped.get(key) || []), c]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit transactional account" : "Add transactional account"}</DialogTitle>
          <DialogDescription>
            Level 4 — the account you post to (e.g. 5230001 Electricity Bill, 5220001 Bilal Salary).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Control account" hint={editing?.is_system ? "System accounts cannot be moved" : undefined}>
            <Select value={f.control_id} onValueChange={(v) => set({ control_id: v })} disabled={editing?.is_system}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select control account" /></SelectTrigger>
              <SelectContent className="max-h-80">
                {[...grouped.entries()].map(([label, items]) => (
                  <SelectGroup key={label}>
                    <SelectLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</SelectLabel>
                    {items.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.code} · {c.name}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Type">
              <Input value={selected ? `${selected.typeCode} ${selected.typeName}` : ""} disabled className="h-9" />
            </Field>
            <Field label="Sub type">
              <Input value={selected?.subCode ?? ""} disabled className="h-9 font-mono" />
            </Field>
            <Field label="Control">
              <Input value={selected?.code ?? ""} disabled className="h-9 font-mono" />
            </Field>
            <Field label="Account code">
              <Input value={f.code} onChange={(e) => set({ code: e.target.value.replace(/\D/g, "").slice(0, 7) })}
                disabled={!!editing} className="h-9 font-mono" />
            </Field>
          </div>
          <Field label="Account name">
            <Input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Electricity Bill" className="h-9" autoFocus />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contact person">
              <Input value={f.contact_person} onChange={(e) => set({ contact_person: e.target.value })} className="h-9" />
            </Field>
            <Field label="Mobile">
              <Input value={f.mobile} onChange={(e) => set({ mobile: e.target.value })} className="h-9" inputMode="tel" />
            </Field>
          </div>
          <Field label="Address">
            <Input value={f.address} onChange={(e) => set({ address: e.target.value })} className="h-9" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="NIC / CNIC">
              <Input value={f.nic} onChange={(e) => set({ nic: e.target.value })} className="h-9" />
            </Field>
            <Field label="NTN">
              <Input value={f.ntn} onChange={(e) => set({ ntn: e.target.value })} className="h-9" />
            </Field>
            <Field label="Email">
              <Input value={f.email} onChange={(e) => set({ email: e.target.value })} className="h-9" type="email" />
            </Field>
          </div>
          {!isPL && !editing?.computed ? (
            <div className="grid gap-3 rounded-md border border-dashed p-3 sm:grid-cols-2">
              <Field label="Opening balance (Rs)" hint="Balance brought forward before using the POS">
                <Input type="number" min="0" step="0.01" value={f.opening_balance}
                  onChange={(e) => set({ opening_balance: e.target.value })} className="h-9" />
              </Field>
              <Field label="Opening side">
                <Select value={f.opening_side} onValueChange={(v) => set({ opening_side: v as "DEBIT" | "CREDIT" })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEBIT">Debit (Dr)</SelectItem>
                    <SelectItem value="CREDIT">Credit (Cr)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          ) : null}
          <Field label="Notes">
            <Textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} className="min-h-[60px] text-sm" />
          </Field>
          {!editing?.is_system ? (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={f.is_active} onCheckedChange={(v) => set({ is_active: v })} />
              Active (inactive accounts are hidden from pickers)
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || f.name.trim().length < 2 || !f.control_id}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- Quick expense --------------------------- */

const PAYMENT_METHODS = ["CASH", "BANK", "CARD", "MOBILE_MONEY", "CHEQUE", "OTHER"] as const;

export function QuickExpenseDialog({
  open,
  onOpenChange,
  account,
  canApprove,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account: CoaAccount | null;
  canApprove: boolean;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [particular, setParticular] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(businessTodayYmd());
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>("CASH");
  const [vendor, setVendor] = useState("");
  const [reference, setReference] = useState("");
  const [approve, setApprove] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setParticular(account?.name ?? "");
    setAmount("");
    setDate(businessTodayYmd());
    setMethod("CASH");
    setVendor("");
    setReference("");
    setApprove(canApprove);
  }, [open, account, canApprove]);

  const save = async () => {
    if (!account) return;
    setSaving(true);
    try {
      const created = await coaApi.createExpense({
        particular: particular.trim(),
        amount: Number(amount),
        account_id: account.id,
        category_id: account.link?.kind === "EXPENSE_CATEGORY" ? account.link.id : null,
        payment_method: method,
        vendor: vendor.trim() || null,
        reference: reference.trim() || null,
        expense_date: date,
      });
      if (approve && canApprove) await coaApi.approveExpense(created.id);
      toast({
        title: "Expense recorded",
        description: `${account.code} ${account.name} · Rs ${Number(amount).toLocaleString()}${approve && canApprove ? " (approved)" : " (pending approval)"}`,
      });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not record expense", description: apiError(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record expense</DialogTitle>
          <DialogDescription>
            Posts to <span className="font-mono">{account?.code}</span> {account?.name}. It also appears in the Expenses module.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Description">
            <Input value={particular} onChange={(e) => setParticular(e.target.value)} className="h-9" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (Rs)">
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9" autoFocus />
            </Field>
            <Field label="Date">
              <YmdDatePicker value={date} onChange={setDate} className="h-9" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment method">
              <Select value={method} onValueChange={(v) => setMethod(v as (typeof PAYMENT_METHODS)[number])}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{m.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Reference / bill no.">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-9" />
            </Field>
          </div>
          <Field label="Vendor / paid to">
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} className="h-9" placeholder="e.g. K-Electric" />
          </Field>
          {canApprove ? (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={approve} onCheckedChange={setApprove} />
              Approve now (counts in balances immediately)
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">Saved as pending — it counts in balances once approved.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !particular.trim() || !(Number(amount) > 0)}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Confirm ------------------------------ */

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-rose-600 hover:bg-rose-700"
            disabled={busy}
            onClick={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
