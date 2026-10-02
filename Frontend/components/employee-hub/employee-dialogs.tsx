"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, FileSpreadsheet, Loader2, Plus, Upload } from "lucide-react";
import * as XLSX from "xlsx";
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
  COMMISSION_TYPES,
  EMPLOYMENT_LABEL,
  METHOD_LABEL,
  MONTHS,
  PAY_METHODS,
  apiError,
  employeeApi,
  rs,
  type CommissionType,
  type EmployeeStatus,
  type EmploymentType,
  type Named,
  type Payslip,
} from "./employee-api";

function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs font-medium text-gray-600">{label}</Label>
      {children}
      {error ? <p className="text-[11px] text-rose-600">{error}</p> : hint ? <p className="text-[11px] text-gray-400">{hint}</p> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-gray-200 p-4">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{title}</h4>
      {children}
    </section>
  );
}

const toIsoDate = (ymd: string) => (ymd ? new Date(`${ymd}T00:00:00`).toISOString() : undefined);
const toYmd = (v?: string | null) => (v ? String(v).slice(0, 10) : "");

/* ============================ employee form ============================ */

type EmpForm = {
  name: string;
  employee_code: string;
  phone_number: string;
  email: string;
  cnic: string;
  gender: string;
  date_of_birth: string;
  address: string;
  employee_type_id: string;
  department_id: string;
  employment_type: EmploymentType;
  status: EmployeeStatus;
  join_date: string;
  user_id: string;
  monthly_salary: string;
  commission_type: CommissionType;
  commission_rate: string;
  commission_fixed: string;
  bank_name: string;
  account_title: string;
  account_number: string;
  iban: string;
  emergency_name: string;
  emergency_phone: string;
};

const blankEmp = (): EmpForm => ({
  name: "",
  employee_code: "",
  phone_number: "",
  email: "",
  cnic: "",
  gender: "",
  date_of_birth: "",
  address: "",
  employee_type_id: "",
  department_id: "",
  employment_type: "FULL_TIME",
  status: "ACTIVE",
  join_date: businessTodayYmd(),
  user_id: "",
  monthly_salary: "",
  commission_type: "PERCENTAGE",
  commission_rate: "",
  commission_fixed: "",
  bank_name: "",
  account_title: "",
  account_number: "",
  iban: "",
  emergency_name: "",
  emergency_phone: "",
});

export function EmployeeFormDialog({
  open,
  onOpenChange,
  editingId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingId: string | null;
  onSaved: (id?: string) => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState<EmpForm>(blankEmp);
  const [errors, setErrors] = useState<Partial<Record<keyof EmpForm, string>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<Named[]>([]);
  const [designations, setDesignations] = useState<Named[]>([]);
  const [users, setUsers] = useState<{ id: string; email: string; role: string; employee: { id: string; name: string } | null }[]>([]);
  const [newDept, setNewDept] = useState<string | null>(null);
  const [newType, setNewType] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setNewDept(null);
    setNewType(null);
    Promise.all([employeeApi.departments(), employeeApi.designations(), employeeApi.posUsers()])
      .then(([d, t, u]) => {
        setDepartments(d);
        setDesignations(t.filter((x) => x.is_active !== false));
        setUsers(u);
      })
      .catch(() => undefined);
    if (!editingId) {
      setF(blankEmp());
      return;
    }
    setLoading(true);
    employeeApi
      .employee(editingId)
      .then((e) =>
        setF({
          name: e.name || "",
          employee_code: e.employee_code || "",
          phone_number: e.phone_number || "",
          email: e.email || "",
          cnic: e.cnic || "",
          gender: e.gender || "",
          date_of_birth: toYmd(e.date_of_birth),
          address: e.address || "",
          employee_type_id: e.employee_type_id || e.employee_type?.id || "",
          department_id: e.department_id || e.department?.id || "",
          employment_type: e.employment_type || "FULL_TIME",
          status: e.status || "ACTIVE",
          join_date: toYmd(e.join_date) || businessTodayYmd(),
          user_id: e.user_id || "",
          monthly_salary: Number(e.monthly_salary) ? String(Number(e.monthly_salary)) : "",
          commission_type: e.commission_type || "PERCENTAGE",
          commission_rate: Number(e.commission_rate) ? String(Number(e.commission_rate)) : "",
          commission_fixed: Number(e.commission_fixed) ? String(Number(e.commission_fixed)) : "",
          bank_name: e.bank_name || "",
          account_title: e.account_title || "",
          account_number: e.account_number || "",
          iban: e.iban || "",
          emergency_name: e.emergency_name || "",
          emergency_phone: e.emergency_phone || "",
        }),
      )
      .catch((error) => toast({ variant: "destructive", title: "Could not load employee", description: apiError(error) }))
      .finally(() => setLoading(false));
  }, [open, editingId, toast]);

  const set = (patch: Partial<EmpForm>) => setF((prev) => ({ ...prev, ...patch }));

  const createNamed = async (kind: "dept" | "type") => {
    const name = (kind === "dept" ? newDept : newType)?.trim();
    if (!name || name.length < 2) return;
    try {
      const created = kind === "dept" ? await employeeApi.addDepartment(name) : await employeeApi.addDesignation(name);
      if (kind === "dept") {
        setDepartments((d) => [...d, created]);
        set({ department_id: created.id });
        setNewDept(null);
      } else {
        setDesignations((d) => [...d, created]);
        set({ employee_type_id: created.id });
        setNewType(null);
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Could not add", description: apiError(error) });
    }
  };

  const validate = () => {
    const e: Partial<Record<keyof EmpForm, string>> = {};
    if (f.name.trim().length < 2) e.name = "Full name is required";
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = "Invalid email";
    if (f.monthly_salary && (Number(f.monthly_salary) < 0 || !Number.isFinite(Number(f.monthly_salary)))) e.monthly_salary = "Enter a valid amount";
    if (f.commission_type === "PERCENTAGE" && f.commission_rate && (Number(f.commission_rate) < 0 || Number(f.commission_rate) > 100)) {
      e.commission_rate = "0–100%";
    }
    if (f.commission_type !== "PERCENTAGE" && f.commission_fixed && Number(f.commission_fixed) < 0) e.commission_fixed = "Cannot be negative";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    const s = (v: string) => v.trim() || (editingId ? null : undefined);
    try {
      const body: Record<string, unknown> = {
        name: f.name.trim(),
        employee_code: s(f.employee_code),
        phone_number: s(f.phone_number),
        email: f.email.trim() || (editingId ? null : ""),
        cnic: s(f.cnic),
        gender: s(f.gender),
        address: s(f.address),
        date_of_birth: f.date_of_birth ? toIsoDate(f.date_of_birth) : editingId ? null : undefined,
        join_date: toIsoDate(f.join_date),
        employee_type_id: f.employee_type_id || undefined,
        department_id: f.department_id || (editingId ? null : undefined),
        employment_type: f.employment_type,
        status: f.status,
        user_id: f.user_id || (editingId ? null : undefined),
        monthly_salary: Number(f.monthly_salary) || 0,
        commission_type: f.commission_type,
        commission_rate: Number(f.commission_rate) || 0,
        commission_fixed: Number(f.commission_fixed) || 0,
        bank_name: s(f.bank_name),
        account_title: s(f.account_title),
        account_number: s(f.account_number),
        iban: s(f.iban),
        emergency_name: s(f.emergency_name),
        emergency_phone: s(f.emergency_phone),
      };
      Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);
      const saved = editingId ? await employeeApi.update(editingId, body) : await employeeApi.create(body);
      toast({ title: editingId ? "Employee updated" : "Employee added", description: f.name });
      onOpenChange(false);
      onSaved(saved?.id ?? editingId ?? undefined);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save employee", description: apiError(error) });
    } finally {
      setSaving(false);
    }
  };

  const availableUsers = users.filter((u) => !u.employee || u.employee.id === editingId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit employee" : "New employee"}</DialogTitle>
          <DialogDescription>Profile, job, salary and commission in one place.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />Loading…
          </div>
        ) : (
          <div className="space-y-4">
            <Section title="Basic details">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Full name *" error={errors.name} className="sm:col-span-2">
                  <Input value={f.name} onChange={(e) => set({ name: e.target.value })} className="h-9" autoFocus />
                </Field>
                <Field label="Employee code" hint="Leave empty to auto-assign">
                  <Input value={f.employee_code} onChange={(e) => set({ employee_code: e.target.value })} className="h-9" />
                </Field>
                <Field label="Phone">
                  <Input value={f.phone_number} onChange={(e) => set({ phone_number: e.target.value })} className="h-9" inputMode="tel" />
                </Field>
                <Field label="Email" error={errors.email}>
                  <Input value={f.email} onChange={(e) => set({ email: e.target.value })} className="h-9" type="email" />
                </Field>
                <Field label="CNIC">
                  <Input value={f.cnic} onChange={(e) => set({ cnic: e.target.value })} className="h-9" placeholder="xxxxx-xxxxxxx-x" />
                </Field>
              </div>
            </Section>

            <Section title="Job">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Designation">
                  {newType !== null ? (
                    <div className="flex gap-1">
                      <Input value={newType} onChange={(e) => setNewType(e.target.value)} className="h-9" placeholder="e.g. Sales Associate" autoFocus />
                      <Button size="sm" className="h-9" onClick={() => createNamed("type")}>Add</Button>
                    </div>
                  ) : (
                    <Select value={f.employee_type_id || "none"} onValueChange={(v) => (v === "__new" ? setNewType("") : set({ employee_type_id: v === "none" ? "" : v }))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Default</SelectItem>
                        {designations.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                        <SelectItem value="__new">+ New designation</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </Field>
                <Field label="Department">
                  {newDept !== null ? (
                    <div className="flex gap-1">
                      <Input value={newDept} onChange={(e) => setNewDept(e.target.value)} className="h-9" placeholder="e.g. Sales" autoFocus />
                      <Button size="sm" className="h-9" onClick={() => createNamed("dept")}>Add</Button>
                    </div>
                  ) : (
                    <Select value={f.department_id || "none"} onValueChange={(v) => (v === "__new" ? setNewDept("") : set({ department_id: v === "none" ? "" : v }))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No department</SelectItem>
                        {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                        <SelectItem value="__new">+ New department</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </Field>
                <Field label="Employment type">
                  <Select value={f.employment_type} onValueChange={(v) => set({ employment_type: v as EmploymentType })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(EMPLOYMENT_LABEL) as EmploymentType[]).map((k) => <SelectItem key={k} value={k}>{EMPLOYMENT_LABEL[k]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Join date">
                  <YmdDatePicker value={f.join_date} onChange={(v) => set({ join_date: v })} className="h-9" />
                </Field>
                <Field label="Status">
                  <Select value={f.status} onValueChange={(v) => set({ status: v as EmployeeStatus })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="ON_LEAVE">On leave</SelectItem>
                      <SelectItem value="INACTIVE">Inactive</SelectItem>
                      <SelectItem value="TERMINATED">Terminated</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="POS login" hint="Bills rung up with this login count as their sales">
                  <Select value={f.user_id || "none"} onValueChange={(v) => set({ user_id: v === "none" ? "" : v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not linked</SelectItem>
                      {availableUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.email} · {u.role.replace("_", " ").toLowerCase()}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </Section>

            <Section title="Salary & commission">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Monthly salary (Rs)" error={errors.monthly_salary} hint="Basic pay used for payroll">
                  <Input type="number" min="0" value={f.monthly_salary} onChange={(e) => set({ monthly_salary: e.target.value })} className="h-9 tabular-nums" placeholder="e.g. 35000" />
                </Field>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-medium text-gray-600">Commission on sales</Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {COMMISSION_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => set({ commission_type: t.value })}
                        className={cn(
                          "rounded-lg border px-2.5 py-2 text-left transition-all",
                          f.commission_type === t.value ? "border-[#2a2012] bg-[#2a2012] text-white" : "border-gray-200 hover:border-gray-300",
                        )}
                      >
                        <span className="block text-xs font-semibold">{t.label}</span>
                        <span className={cn("block text-[10px]", f.commission_type === t.value ? "text-white/60" : "text-gray-400")}>{t.hint}</span>
                      </button>
                    ))}
                  </div>
                  {f.commission_type === "PERCENTAGE" ? (
                    <Input type="number" min="0" max="100" step="0.01" value={f.commission_rate} onChange={(e) => set({ commission_rate: e.target.value })} className="h-9" placeholder="Commission % e.g. 2.5" />
                  ) : (
                    <Input type="number" min="0" value={f.commission_fixed} onChange={(e) => set({ commission_fixed: e.target.value })} className="h-9" placeholder={f.commission_type === "FIXED_PER_SALE" ? "Rs per bill e.g. 100" : "Rs per piece e.g. 50"} />
                  )}
                  {errors.commission_rate || errors.commission_fixed ? (
                    <p className="text-[11px] text-rose-600">{errors.commission_rate || errors.commission_fixed}</p>
                  ) : null}
                </div>
              </div>
            </Section>

            <Section title="Bank & payout">
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Bank"><Input value={f.bank_name} onChange={(e) => set({ bank_name: e.target.value })} className="h-9" /></Field>
                <Field label="Account title"><Input value={f.account_title} onChange={(e) => set({ account_title: e.target.value })} className="h-9" /></Field>
                <Field label="Account no."><Input value={f.account_number} onChange={(e) => set({ account_number: e.target.value })} className="h-9" /></Field>
                <Field label="IBAN"><Input value={f.iban} onChange={(e) => set({ iban: e.target.value })} className="h-9" /></Field>
              </div>
            </Section>

            <Section title="Personal">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Gender">
                  <Select value={f.gender || "none"} onValueChange={(v) => set({ gender: v === "none" ? "" : v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Date of birth"><YmdDatePicker value={f.date_of_birth} onChange={(v) => set({ date_of_birth: v })} className="h-9" /></Field>
                <Field label="Address"><Input value={f.address} onChange={(e) => set({ address: e.target.value })} className="h-9" /></Field>
                <Field label="Emergency contact"><Input value={f.emergency_name} onChange={(e) => set({ emergency_name: e.target.value })} className="h-9" /></Field>
                <Field label="Emergency phone"><Input value={f.emergency_phone} onChange={(e) => set({ emergency_phone: e.target.value })} className="h-9" /></Field>
              </div>
            </Section>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingId ? "Save changes" : "Add employee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ payslip ============================ */

export function PayslipDialog({
  open,
  onOpenChange,
  employee,
  editing,
  defaultMonth,
  defaultYear,
  advanceBalance,
  suggestedCommission,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee: { id: string; name: string; monthly_salary: number };
  editing: Payslip | null;
  defaultMonth: number;
  defaultYear: number;
  advanceBalance: number;
  suggestedCommission?: number;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);
  const [amount, setAmount] = useState("");
  const [bonus, setBonus] = useState("");
  const [allowances, setAllowances] = useState("");
  const [deductions, setDeductions] = useState("");
  const [recovery, setRecovery] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMonth(editing?.month ?? defaultMonth);
    setYear(editing?.year ?? defaultYear);
    setAmount(String(editing?.amount ?? (employee.monthly_salary || "")));
    setBonus(editing?.bonus ? String(editing.bonus) : "");
    setAllowances(editing?.allowances ? String(editing.allowances) : "");
    setDeductions(editing?.deductions ? String(editing.deductions) : "");
    setRecovery(editing?.advance_deduction ? String(editing.advance_deduction) : "");
    setNotes(editing?.notes || "");
  }, [open, editing, employee.monthly_salary, defaultMonth, defaultYear]);

  const n = (v: string) => Number(v) || 0;
  const gross = n(amount) + n(bonus) + n(allowances) - n(deductions);
  const legacy = editing?.loan_amount ?? 0;
  const net = Math.max(0, gross - n(recovery) - legacy);
  const maxRecovery = advanceBalance + (editing?.advance_deduction ?? 0);
  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, []);

  const save = async () => {
    if (!(n(amount) > 0)) {
      toast({ variant: "destructive", title: "Basic salary must be greater than 0" });
      return;
    }
    if (n(recovery) > maxRecovery + 0.005) {
      toast({ variant: "destructive", title: "Recovery is more than the outstanding advance", description: `Outstanding ${rs(maxRecovery)}` });
      return;
    }
    setSaving(true);
    try {
      const body = {
        amount: n(amount),
        bonus: n(bonus),
        allowances: n(allowances),
        deductions: n(deductions),
        advance_deduction: n(recovery),
        notes: notes.trim() || null,
      };
      if (editing) await employeeApi.updateSlip(editing.id, body);
      else await employeeApi.createSlip({ ...body, employee_id: employee.id, month, year });
      toast({ title: editing ? "Payslip updated" : "Payslip created", description: `${employee.name} · ${MONTHS[month - 1]} ${year} · ${rs(net)}` });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save payslip", description: apiError(error) });
    } finally {
      setSaving(false);
    }
  };

  const Line = ({ label, value, sign, strong }: { label: string; value: number; sign?: "+" | "−"; strong?: boolean }) => (
    <div className={cn("flex justify-between text-sm", strong && "border-t border-dashed pt-2 font-semibold")}>
      <span className={strong ? "text-gray-900" : "text-gray-500"}>{label}</span>
      <span className={cn("tabular-nums", sign === "−" ? "text-rose-700" : strong ? "text-gray-900" : "text-gray-800")}>
        {sign ? `${sign} ` : ""}{rs(value)}
      </span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit payslip · ${editing.period_label}` : "New payslip"}</DialogTitle>
          <DialogDescription>{employee.name}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            {!editing ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Month">
                  <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Year">
                  <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
            ) : null}
            <Field label="Basic salary (Rs)">
              <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 tabular-nums" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bonus" hint={suggestedCommission ? `Commission this month ${rs(suggestedCommission)} is paid separately` : "Eid / performance bonus"}>
                <Input type="number" min="0" value={bonus} onChange={(e) => setBonus(e.target.value)} className="h-9 tabular-nums" />
              </Field>
              <Field label="Allowances" hint="Travel, food, overtime">
                <Input type="number" min="0" value={allowances} onChange={(e) => setAllowances(e.target.value)} className="h-9 tabular-nums" />
              </Field>
              <Field label="Deductions" hint="Absences, late, fines">
                <Input type="number" min="0" value={deductions} onChange={(e) => setDeductions(e.target.value)} className="h-9 tabular-nums" />
              </Field>
              <Field label="Advance recovery" hint={maxRecovery > 0 ? `Outstanding advance ${rs(maxRecovery)}` : "No outstanding advance"}>
                <div className="flex gap-1">
                  <Input type="number" min="0" value={recovery} onChange={(e) => setRecovery(e.target.value)} className="h-9 tabular-nums" disabled={maxRecovery <= 0} />
                  {maxRecovery > 0 ? (
                    <Button type="button" size="sm" variant="outline" className="h-9 px-2 text-xs" onClick={() => setRecovery(String(Math.min(maxRecovery, Math.max(0, gross - legacy))))}>
                      Max
                    </Button>
                  ) : null}
                </div>
              </Field>
            </div>
            <Field label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[56px] text-sm" />
            </Field>
          </div>
          <div className="h-fit space-y-2 rounded-xl border border-[#a67c2e]/25 bg-[#fcf8f2] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a6520]">Payslip</p>
            <Line label="Basic salary" value={n(amount)} />
            {n(bonus) ? <Line label="Bonus" value={n(bonus)} sign="+" /> : null}
            {n(allowances) ? <Line label="Allowances" value={n(allowances)} sign="+" /> : null}
            {n(deductions) ? <Line label="Deductions" value={n(deductions)} sign="−" /> : null}
            <Line label="Gross salary" value={gross} strong />
            {n(recovery) ? <Line label="Advance recovery" value={n(recovery)} sign="−" /> : null}
            {legacy ? <Line label="Advance taken (old entry)" value={legacy} sign="−" /> : null}
            <div className="mt-2 rounded-lg bg-[#2a2012] px-3 py-2.5 text-white">
              <p className="text-[10px] uppercase tracking-wide text-white/60">Take-home pay</p>
              <p className="text-xl font-bold tabular-nums">{rs(net)}</p>
            </div>
            {editing?.paid_amount ? <p className="text-[11px] text-gray-500">Already paid {rs(editing.paid_amount)}</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save payslip" : "Create payslip"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ pay salary ============================ */

export function PaySalaryDialog({
  slip,
  employeeName,
  onOpenChange,
  onSaved,
}: {
  slip: Payslip | null;
  employeeName: string;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [date, setDate] = useState(businessTodayYmd());
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!slip) return;
    setAmount(String(slip.due));
    setMethod(slip.payment_method || "CASH");
    setDate(businessTodayYmd());
    setReference("");
  }, [slip]);

  const value = Number(amount) || 0;
  const save = async () => {
    if (!slip) return;
    setSaving(true);
    try {
      const res = await employeeApi.paySlip(slip.id, { amount: value, method, date, reference: reference.trim() || null });
      toast({ title: res.status === "PAID" ? "Salary paid in full" : "Partial payment recorded", description: `${employeeName} · ${slip.period_label} · ${rs(value)}` });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not record payment", description: apiError(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!slip} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay salary · {slip?.period_label}</DialogTitle>
          <DialogDescription>
            {employeeName} · take-home {rs(slip?.net_payable ?? 0)}
            {slip?.paid_amount ? ` · already paid ${rs(slip.paid_amount)}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Amount (Rs)" hint={`Remaining ${rs(slip?.due ?? 0)} — pay less for a partial payment`}>
            <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 text-base font-semibold tabular-nums" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Method">
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{PAY_METHODS.map((m) => <SelectItem key={m} value={m}>{METHOD_LABEL[m]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Date">
              <YmdDatePicker value={date} onChange={setDate} className="h-9" />
            </Field>
          </div>
          <Field label="Reference" hint="Cheque / transfer no.">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-9" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !(value > 0)} className="bg-emerald-600 hover:bg-emerald-700">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Pay {rs(value)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ advances ============================ */

export function AdvanceDialog({
  open,
  type,
  employee,
  balance,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  type: "ADVANCE" | "RECOVERY";
  employee: { id: string; name: string };
  balance: number;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(businessTodayYmd());
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(type === "RECOVERY" && balance > 0 ? String(balance) : "");
    setDate(businessTodayYmd());
    setMethod("CASH");
    setReference("");
    setNotes("");
  }, [open, type, balance]);

  const value = Number(amount) || 0;
  const after = type === "ADVANCE" ? balance + value : balance - value;

  const save = async () => {
    setSaving(true);
    try {
      await employeeApi.addAdvance({ employee_id: employee.id, type, amount: value, date, method, reference: reference.trim() || null, notes: notes.trim() || null });
      toast({ title: type === "ADVANCE" ? "Advance given" : "Repayment recorded", description: `${employee.name} · ${rs(value)}` });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save", description: apiError(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{type === "ADVANCE" ? "Give advance / loan" : "Record repayment"}</DialogTitle>
          <DialogDescription>
            {employee.name} · outstanding {rs(balance)}.{" "}
            {type === "ADVANCE" ? "Recover it later from salary or in cash." : "Cash returned by the employee."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Amount (Rs)">
            <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 text-base font-semibold tabular-nums" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><YmdDatePicker value={date} onChange={setDate} className="h-9" /></Field>
            <Field label="Method">
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{PAY_METHODS.map((m) => <SelectItem key={m} value={m}>{METHOD_LABEL[m]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-9" /></Field>
          <Field label="Reason / notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[56px] text-sm" /></Field>
          <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <span className="text-gray-500">Outstanding after this</span>
            <span className={cn("font-semibold tabular-nums", after > 0.005 ? "text-amber-700" : "text-emerald-700")}>{rs(Math.max(0, after))}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !(value > 0)} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ deactivate ============================ */

export function DeactivateDialog({
  employee,
  onOpenChange,
  onSaved,
}: {
  employee: { id: string; name: string } | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"INACTIVE" | "TERMINATED">("INACTIVE");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setReason("");
    setStatus("INACTIVE");
  }, [employee]);

  const save = async () => {
    if (!employee) return;
    setSaving(true);
    try {
      await employeeApi.deactivate(employee.id, reason.trim(), status);
      toast({ title: status === "TERMINATED" ? "Employee terminated" : "Employee deactivated", description: employee.name });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not deactivate", description: apiError(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!employee} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate {employee?.name}?</DialogTitle>
          <DialogDescription>They will be hidden from salesperson pickers and payroll runs. History is kept.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(["INACTIVE", "TERMINATED"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn("rounded-lg border px-3 py-2 text-left text-sm", status === s ? "border-[#2a2012] bg-[#2a2012] text-white" : "border-gray-200")}
              >
                {s === "INACTIVE" ? "Inactive (may return)" : "Terminated (left)"}
              </button>
            ))}
          </div>
          <Field label="Reason *">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[70px] text-sm" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !reason.trim()} className="bg-rose-600 hover:bg-rose-700">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Deactivate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ import ============================ */

const IMPORT_COLUMNS = ["name", "email", "phone_number", "cnic", "gender", "department", "employee_type", "employment_type", "join_date"];

export function ImportEmployeesDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRows([]);
      setFileName("");
    }
  }, [open]);

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { name: "Ali Raza", email: "", phone_number: "03001234567", cnic: "", gender: "Male", department: "Sales", employee_type: "Sales Associate", employment_type: "FULL_TIME", join_date: businessTodayYmd() },
    ], { header: IMPORT_COLUMNS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, "employees-import-template.xlsx");
  };

  const onFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const cleaned = data
        .map((r) =>
          Object.fromEntries(
            Object.entries(r)
              .map(([k, v]) => [k.trim().toLowerCase().replace(/\s+/g, "_"), typeof v === "string" ? v.trim() : v])
              .filter(([k, v]) => IMPORT_COLUMNS.includes(k as string) && v !== ""),
          ),
        )
        .filter((r) => r.name);
      setRows(cleaned);
      setFileName(file.name);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not read file", description: apiError(error) });
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await employeeApi.importRows(rows);
      toast({ title: "Employees imported", description: `${rows.length} row(s)` });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({ variant: "destructive", title: "Import failed", description: apiError(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import employees</DialogTitle>
          <DialogDescription>Upload an Excel or CSV file. Columns: {IMPORT_COLUMNS.join(", ")}. Only “name” is required.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="mr-1.5 h-4 w-4" />Download template
            </Button>
            <label className="inline-flex cursor-pointer items-center rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
              <Upload className="mr-1.5 h-4 w-4" />
              {fileName || "Choose file"}
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
          </div>
          {rows.length ? (
            <div className="max-h-64 overflow-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>{IMPORT_COLUMNS.map((c) => <th key={c} className="px-2 py-1.5 text-left font-semibold text-gray-500">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t">{IMPORT_COLUMNS.map((c) => <td key={c} className="px-2 py-1">{String(r[c] ?? "")}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-sm text-gray-400">
              <FileSpreadsheet className="h-8 w-8" />No file loaded
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !rows.length} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
            Import {rows.length || ""} employee{rows.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
