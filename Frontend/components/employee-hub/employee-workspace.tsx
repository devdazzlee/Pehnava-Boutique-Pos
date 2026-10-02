"use client";

import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { format } from "date-fns";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeDollarSign,
  Banknote,
  Briefcase,
  CheckCircle2,
  HandCoins,
  LayoutDashboard,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Power,
  Printer,
  RotateCcw,
  Trash2,
  TrendingUp,
  UserRound,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Bone, Chips, EmptyState, StatTile } from "@/components/accounts/coa-ui";
import { ConfirmDialog } from "@/components/accounts/coa-dialogs";
import { escapeHtml, printDocument } from "@/components/accounts/coa-shared";
import { EmployeeSalesPerformance } from "@/components/employee-sales-performance";
import { AdvanceDialog, DeactivateDialog, EmployeeFormDialog, PaySalaryDialog, PayslipDialog } from "./employee-dialogs";
import {
  EMPLOYMENT_LABEL,
  METHOD_LABEL,
  SLIP_META,
  STATUS_META,
  apiError,
  employeeApi,
  initials,
  rs,
  type EmployeeRow,
  type FinanceFile,
  type Payslip,
} from "./employee-api";

type Tab = "overview" | "payroll" | "advances" | "commission" | "profile";
const TABS: { id: Tab; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "payroll", label: "Salary & payslips", icon: Banknote },
  { id: "advances", label: "Advances & loans", icon: HandCoins },
  { id: "commission", label: "Sales & commission", icon: TrendingUp },
  { id: "profile", label: "Profile", icon: UserRound },
];

const day = (v?: string | null) => (v ? format(new Date(v), "dd MMM yyyy") : "—");

export function EmployeeWorkspace({
  employee,
  open,
  onOpenChange,
  onChanged,
  month,
  year,
  initialTab = "overview",
}: {
  employee: EmployeeRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
  month: number;
  year: number;
  initialTab?: Tab;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [data, setData] = useState<FinanceFile | null>(null);
  const [slipDialog, setSlipDialog] = useState<{ open: boolean; editing: Payslip | null }>({ open: false, editing: null });
  const [paySlip, setPaySlip] = useState<Payslip | null>(null);
  const [advance, setAdvance] = useState<{ open: boolean; type: "ADVANCE" | "RECOVERY" }>({ open: false, type: "ADVANCE" });
  const [editOpen, setEditOpen] = useState(false);
  const [deactivate, setDeactivate] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; description: string; action: () => Promise<void>; label?: string } | null>(null);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab, employee?.id]);

  const load = useCallback(async () => {
    if (!employee) return;
    try {
      setData(await employeeApi.finance(employee.id));
    } catch (error) {
      toast({ variant: "destructive", title: "Could not load employee", description: apiError(error) });
    }
  }, [employee, toast]);

  useEffect(() => {
    if (open && employee) {
      setData(null);
      load();
    }
  }, [open, employee?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    load();
    onChanged();
  };

  if (!employee) return null;
  const t = data?.totals;
  const status = STATUS_META[employee.status] ?? STATUS_META.ACTIVE;
  const currentSlip = data?.salaries.find((s) => s.month === month && s.year === year) ?? employee.month_salary;

  const printPayslip = (s: Payslip) => {
    const e = data?.employee ?? employee;
    const line = (label: string, v: number, sign = "") =>
      v ? `<tr><td>${escapeHtml(label)}</td><td class="r">${sign}${rs(v)}</td></tr>` : "";
    printDocument(
      `Payslip · ${s.period_label}`,
      `${e.name}${e.employee_code ? ` (${e.employee_code})` : ""} · ${e.employee_type?.name || "Staff"}${e.department ? ` · ${e.department.name}` : ""}`,
      `<table><tbody>
        ${line("Basic salary", s.amount)}${line("Bonus", s.bonus, "+ ")}${line("Allowances", s.allowances, "+ ")}${line("Deductions", s.deductions, "− ")}
        <tr class="l3"><td>Gross salary</td><td class="r">${rs(s.gross)}</td></tr>
        ${line("Advance recovery", s.advance_deduction, "− ")}${line("Advance taken", s.loan_amount, "− ")}
        <tr class="l2"><td>Take-home pay</td><td class="r">${rs(s.net_payable)}</td></tr>
        <tr><td>Paid${s.payment_method ? ` (${escapeHtml(METHOD_LABEL[s.payment_method] || s.payment_method)})` : ""}${s.paid_date ? ` on ${day(s.paid_date)}` : ""}</td><td class="r">${rs(s.paid_amount)}</td></tr>
        <tr><td>Balance due</td><td class="r">${rs(s.due)}</td></tr>
      </tbody></table>
      ${e.bank_name || e.account_number ? `<p class="muted" style="margin-top:16px">Bank: ${escapeHtml([e.bank_name, e.account_title, e.account_number, e.iban].filter(Boolean).join(" · "))}</p>` : ""}
      <div style="display:flex;justify-content:space-between;margin-top:60px;font-size:12px"><span>Employee signature ____________</span><span>Authorised by ____________</span></div>`,
    );
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1100px,96vw)]">
          {/* header */}
          <div className="bg-gradient-to-br from-[#2a2012] to-[#463619] px-5 pb-4 pt-5 text-white sm:px-6">
            <div className="flex flex-wrap items-start gap-4 pr-8">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#e9d3a4] text-lg font-bold text-[#2a2012]">
                {employee.photo_url ? <img src={employee.photo_url} alt="" className="h-full w-full object-cover" /> : initials(employee.name)}
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-xl font-bold text-white">{employee.name}</SheetTitle>
                <SheetDescription asChild>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/70">
                    <span className="inline-flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{employee.employee_type?.name || "Staff"}{employee.department ? ` · ${employee.department.name}` : ""}</span>
                    {employee.employee_code ? <span>{employee.employee_code}</span> : null}
                    {employee.phone_number ? <a href={`tel:${employee.phone_number}`} className="inline-flex items-center gap-1 hover:text-white"><Phone className="h-3.5 w-3.5" />{employee.phone_number}</a> : null}
                    {employee.email ? <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{employee.email}</span> : null}
                    <span>Joined {day(employee.join_date)}</span>
                  </div>
                </SheetDescription>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", status.tone)}>{status.label}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80">{EMPLOYMENT_LABEL[employee.employment_type] || employee.employment_type}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80">Commission · {employee.commission_label}</span>
                  {employee.user ? <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80">POS · {employee.user.email}</span> : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-right">
                <HeaderStat label="Monthly salary" value={rs(employee.monthly_salary)} />
                <HeaderStat label="Salary due" value={rs(t?.salaryDue ?? employee.salary_due_total)} warn={(t?.salaryDue ?? employee.salary_due_total) > 0} />
                <HeaderStat label="Advance owed" value={rs(t?.advanceBalance ?? employee.advance_balance)} warn={(t?.advanceBalance ?? employee.advance_balance) > 0} />
                <HeaderStat label="Commission due" value={rs(t?.commissionDue ?? employee.commission_due)} />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {currentSlip ? (
                currentSlip.due > 0 ? (
                  <Button size="sm" className="h-9 bg-[#e9d3a4] text-[#2a2012] hover:bg-[#f3e2bd]" onClick={() => setPaySlip(currentSlip)}>
                    <Banknote className="mr-1.5 h-4 w-4" />Pay {currentSlip.period_label} · {rs(currentSlip.due)}
                  </Button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-400/20 px-3 py-2 text-xs font-medium text-emerald-100">
                    <CheckCircle2 className="h-4 w-4" />{currentSlip.period_label} salary paid
                  </span>
                )
              ) : (
                <Button size="sm" className="h-9 bg-[#e9d3a4] text-[#2a2012] hover:bg-[#f3e2bd]" onClick={() => setSlipDialog({ open: true, editing: null })}>
                  <Plus className="mr-1.5 h-4 w-4" />Create payslip
                </Button>
              )}
              <HeaderButton icon={ArrowUpRight} onClick={() => setAdvance({ open: true, type: "ADVANCE" })}>Give advance</HeaderButton>
              <div className="ml-auto flex gap-2">
                <HeaderButton icon={Pencil} onClick={() => setEditOpen(true)}>Edit</HeaderButton>
                {employee.is_active ? (
                  <HeaderButton icon={Power} onClick={() => setDeactivate(true)}>Deactivate</HeaderButton>
                ) : (
                  <HeaderButton
                    icon={Power}
                    onClick={() =>
                      setConfirm({
                        title: `Reactivate ${employee.name}?`,
                        description: "They will appear again in payroll runs and salesperson pickers.",
                        label: "Reactivate",
                        action: async () => {
                          await employeeApi.reactivate(employee.id);
                          toast({ title: "Employee reactivated" });
                          refresh();
                        },
                      })
                    }
                  >
                    Reactivate
                  </HeaderButton>
                )}
              </div>
            </div>
          </div>

          {/* tabs */}
          <div className="border-b border-gray-200 bg-white px-3 sm:px-5">
            <div className="-mb-px flex gap-1 overflow-x-auto">
              {TABS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setTab(x.id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                    tab === x.id ? "border-[#a67c2e] text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800",
                  )}
                >
                  <x.icon className="h-4 w-4" />
                  {x.label}
                  {x.id === "payroll" && data?.salaries.some((s) => s.due > 0) ? <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> : null}
                  {x.id === "advances" && (data?.totals.advanceBalance ?? 0) > 0 ? <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8f6f2] p-4 sm:p-5">
            {!data ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Bone key={i} className="h-20 rounded-xl" />)}</div>
                <Bone className="h-64 rounded-xl" />
              </div>
            ) : tab === "overview" ? (
              <OverviewTab data={data} row={employee} month={month} year={year} onTab={setTab} onPay={setPaySlip} />
            ) : tab === "payroll" ? (
              <PayrollTab
                data={data}
                onNew={() => setSlipDialog({ open: true, editing: null })}
                onEdit={(s) => setSlipDialog({ open: true, editing: s })}
                onPay={setPaySlip}
                onPrint={printPayslip}
                onUndo={(s) =>
                  setConfirm({
                    title: `Reverse payment for ${s.period_label}?`,
                    description: `${rs(s.paid_amount)} paid will be cleared and the payslip marked unpaid.`,
                    label: "Reverse payment",
                    action: async () => {
                      await employeeApi.undoPayment(s.id);
                      toast({ title: "Payment reversed" });
                      refresh();
                    },
                  })
                }
                onDelete={(s) =>
                  setConfirm({
                    title: `Delete payslip ${s.period_label}?`,
                    description: "The payslip and any advance recovery on it will be removed.",
                    action: async () => {
                      await employeeApi.deleteSlip(s.id);
                      toast({ title: "Payslip deleted" });
                      refresh();
                    },
                  })
                }
              />
            ) : tab === "advances" ? (
              <AdvancesTab
                data={data}
                onGive={() => setAdvance({ open: true, type: "ADVANCE" })}
                onRecover={() => setAdvance({ open: true, type: "RECOVERY" })}
                onDelete={(id) =>
                  setConfirm({
                    title: "Delete this entry?",
                    description: "The outstanding advance will be recalculated.",
                    action: async () => {
                      await employeeApi.deleteAdvance(id);
                      toast({ title: "Entry deleted" });
                      refresh();
                    },
                  })
                }
              />
            ) : tab === "commission" ? (
              <CommissionTab
                data={data}
                employeeId={employee.id}
                month={month}
                year={year}
                onChanged={refresh}
              />
            ) : (
              <ProfileTab data={data} />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <PayslipDialog
        open={slipDialog.open}
        onOpenChange={(o) => setSlipDialog((d) => ({ ...d, open: o }))}
        employee={{ id: employee.id, name: employee.name, monthly_salary: employee.monthly_salary }}
        editing={slipDialog.editing}
        defaultMonth={month}
        defaultYear={year}
        advanceBalance={Math.max(0, data?.totals.advanceBalance ?? employee.advance_balance)}
        suggestedCommission={employee.month_sales.commission}
        onSaved={refresh}
      />
      <PaySalaryDialog slip={paySlip} employeeName={employee.name} onOpenChange={(o) => !o && setPaySlip(null)} onSaved={refresh} />
      <AdvanceDialog
        open={advance.open}
        type={advance.type}
        employee={employee}
        balance={Math.max(0, data?.totals.advanceBalance ?? employee.advance_balance)}
        onOpenChange={(o) => setAdvance((a) => ({ ...a, open: o }))}
        onSaved={refresh}
      />
      <EmployeeFormDialog open={editOpen} onOpenChange={setEditOpen} editingId={employee.id} onSaved={refresh} />
      <DeactivateDialog employee={deactivate ? employee : null} onOpenChange={(o) => !o && setDeactivate(false)} onSaved={refresh} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        confirmLabel={confirm?.label ?? "Delete"}
        onConfirm={async () => {
          try {
            await confirm?.action();
          } catch (error) {
            toast({ variant: "destructive", title: "Action failed", description: apiError(error) });
            throw error;
          }
        }}
      />
    </>
  );
}

/* ------------------------------ header bits ------------------------------ */

function HeaderStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-white/10 px-3 py-2 ring-1 ring-white/15">
      <p className="text-[10px] uppercase tracking-wide text-white/60">{label}</p>
      <p className={cn("text-sm font-bold tabular-nums", warn ? "text-amber-200" : "text-white")}>{value}</p>
    </div>
  );
}

function HeaderButton({ icon: Icon, onClick, children }: { icon: ComponentType<{ className?: string }>; onClick: () => void; children: ReactNode }) {
  return (
    <Button size="sm" variant="outline" className="h-9 border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white" onClick={onClick}>
      <Icon className="mr-1.5 h-4 w-4" />
      {children}
    </Button>
  );
}

function Card({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}

function SlipBadge({ status }: { status: Payslip["status"] }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", SLIP_META[status].tone)}>{SLIP_META[status].label}</span>;
}

/* ------------------------------ overview ------------------------------ */

function OverviewTab({
  data,
  row,
  month,
  year,
  onTab,
  onPay,
}: {
  data: FinanceFile;
  row: EmployeeRow;
  month: number;
  year: number;
  onTab: (t: Tab) => void;
  onPay: (s: Payslip) => void;
}) {
  const t = data.totals;
  const slip = data.salaries.find((s) => s.month === month && s.year === year) ?? null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Salary paid (lifetime)" value={rs(t.salaryPaidLifetime)} hint={`${t.slipCount} payslip(s)`} icon={Banknote} />
        <StatTile label="This year" value={rs(t.ytdPaid)} hint={`Gross ${rs(t.ytdGross)}`} icon={Wallet} />
        <StatTile label="Commission earned" value={rs(t.commissionEarned)} hint={`Paid ${rs(t.commissionPaid)} · due ${rs(t.commissionDue)}`} icon={BadgeDollarSign} />
        <StatTile label="Advance owed" value={rs(t.advanceBalance)} hint={`Given ${rs(t.advanceGiven)} · recovered ${rs(t.advanceRecovered)}`} tone={t.advanceBalance > 0 ? "bad" : "default"} icon={HandCoins} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card title={`This month · ${row.month_salary?.period_label ?? `${month}/${year}`}`}>
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <Mini label="Sales" value={rs(row.month_sales.sales)} />
            <Mini label="Bills" value={String(row.month_sales.bills)} />
            <Mini label="Pieces" value={String(row.month_sales.pieces)} />
            <Mini label="Commission" value={rs(row.month_sales.commission)} accent />
          </div>
          <div className="border-t border-gray-100 p-4">
            {slip ? (
              <div className="flex flex-wrap items-center gap-3">
                <SlipBadge status={slip.status} />
                <span className="text-sm text-gray-600">
                  Take-home <span className="font-semibold text-gray-900">{rs(slip.net_payable)}</span> · paid {rs(slip.paid_amount)}
                </span>
                {slip.due > 0 ? (
                  <Button size="sm" className="ml-auto h-8 bg-emerald-600 hover:bg-emerald-700" onClick={() => onPay(slip)}>
                    Pay {rs(slip.due)}
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No payslip for this month yet — create it from “Salary &amp; payslips”.</p>
            )}
          </div>
        </Card>
        <Card title="Recent payslips" action={<button className="text-xs font-medium text-[#8a6520] hover:underline" onClick={() => onTab("payroll")}>All payslips →</button>}>
          {data.salaries.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-gray-400">No payslips yet.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.salaries.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-20 font-medium text-gray-900">{s.period_label}</span>
                  <SlipBadge status={s.status} />
                  <span className="ml-auto tabular-nums text-gray-900">{rs(s.net_payable)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-lg px-3 py-2", accent ? "bg-emerald-50" : "bg-gray-50")}>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={cn("text-sm font-bold tabular-nums", accent ? "text-emerald-700" : "text-gray-900")}>{value}</p>
    </div>
  );
}

/* ------------------------------ payroll ------------------------------ */

function PayrollTab({
  data,
  onNew,
  onEdit,
  onPay,
  onPrint,
  onUndo,
  onDelete,
}: {
  data: FinanceFile;
  onNew: () => void;
  onEdit: (s: Payslip) => void;
  onPay: (s: Payslip) => void;
  onPrint: (s: Payslip) => void;
  onUndo: (s: Payslip) => void;
  onDelete: (s: Payslip) => void;
}) {
  const [filter, setFilter] = useState<"all" | "due" | "PAID">("all");
  const years = [...new Set(data.salaries.map((s) => s.year))].sort((a, b) => b - a);
  const [yearFilter, setYearFilter] = useState<string>("all");
  const rows = data.salaries.filter(
    (s) => (filter === "all" || (filter === "due" ? s.due > 0 : s.status === "PAID")) && (yearFilter === "all" || String(s.year) === yearFilter),
  );
  const totals = rows.reduce((a, s) => ({ gross: a.gross + s.gross, net: a.net + s.net_payable, paid: a.paid + s.paid_amount, due: a.due + s.due }), { gross: 0, net: 0, paid: 0, due: 0 });

  return (
    <Card
      title="Payslips"
      action={
        <Button size="sm" className="h-8 bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={onNew}>
          <Plus className="mr-1 h-4 w-4" />New payslip
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50/60 px-4 py-2.5">
        <Chips
          size="xs"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: data.salaries.length },
            { value: "due", label: "Unpaid / partly paid", count: data.salaries.filter((s) => s.due > 0).length },
            { value: "PAID", label: "Paid", count: data.salaries.filter((s) => s.status === "PAID").length },
          ]}
        />
        {years.length > 1 ? (
          <Chips size="xs" value={yearFilter} onChange={setYearFilter} options={[{ value: "all", label: "All years" }, ...years.map((y) => ({ value: String(y), label: String(y) }))]} />
        ) : null}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Banknote} title="No payslips" description="Create a payslip for a month, then record the payment." action={<Button size="sm" onClick={onNew}>New payslip</Button>} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2.5">Month</th>
                <th className="px-3 py-2.5 text-right">Basic</th>
                <th className="px-3 py-2.5 text-right">+ Bonus / allow.</th>
                <th className="px-3 py-2.5 text-right">− Deductions</th>
                <th className="px-3 py-2.5 text-right">Take-home</th>
                <th className="px-3 py-2.5 text-right">Paid</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="w-40 px-4 py-2.5 text-right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/70">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{s.period_label}</p>
                    {s.paid_date ? <p className="text-[11px] text-gray-400">Paid {day(s.paid_date)}{s.payment_method ? ` · ${METHOD_LABEL[s.payment_method] || s.payment_method}` : ""}</p> : null}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{rs(s.amount)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{s.bonus + s.allowances ? rs(s.bonus + s.allowances) : "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-rose-700">
                    {s.deductions + s.advance_deduction + s.loan_amount ? rs(s.deductions + s.advance_deduction + s.loan_amount) : "—"}
                    {s.advance_deduction ? <p className="text-[10px] text-gray-400">incl. advance {rs(s.advance_deduction)}</p> : null}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-gray-900">{rs(s.net_payable)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {rs(s.paid_amount)}
                    {s.due > 0 && s.paid_amount > 0 ? <p className="text-[10px] text-rose-600">{rs(s.due)} left</p> : null}
                  </td>
                  <td className="px-3 py-3"><SlipBadge status={s.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {s.due > 0 ? (
                        <Button size="sm" className="h-8 bg-emerald-600 text-xs hover:bg-emerald-700" onClick={() => onPay(s)}>Pay</Button>
                      ) : null}
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onPrint(s)} title="Print payslip"><Printer className="h-4 w-4" /></Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="More"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(s)}><Pencil className="mr-2 h-4 w-4" />Edit payslip</DropdownMenuItem>
                          {s.paid_amount > 0 ? <DropdownMenuItem onClick={() => onUndo(s)}><RotateCcw className="mr-2 h-4 w-4" />Reverse payment</DropdownMenuItem> : null}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-rose-600 focus:text-rose-700" disabled={s.paid_amount > 0} onClick={() => onDelete(s)}>
                            <Trash2 className="mr-2 h-4 w-4" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#2a2012] text-sm font-semibold text-white">
                <td className="px-4 py-2.5" colSpan={4}>Totals</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rs(totals.net)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rs(totals.paid)}</td>
                <td className="px-3 py-2.5" colSpan={2}>{totals.due > 0 ? `${rs(totals.due)} due` : "All paid"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------ advances ------------------------------ */

function AdvancesTab({ data, onGive, onRecover, onDelete }: { data: FinanceFile; onGive: () => void; onRecover: () => void; onDelete: (id: string) => void }) {
  const t = data.totals;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Total given" value={rs(t.advanceGiven)} icon={ArrowUpRight} />
        <StatTile label="Recovered" value={rs(t.advanceRecovered)} icon={ArrowDownLeft} />
        <StatTile label="Outstanding" value={rs(t.advanceBalance)} tone={t.advanceBalance > 0 ? "bad" : "good"} icon={HandCoins} />
      </div>
      <Card
        title="Advances & loans ledger"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8" onClick={onRecover} disabled={t.advanceBalance <= 0}>
              <ArrowDownLeft className="mr-1 h-4 w-4" />Record repayment
            </Button>
            <Button size="sm" className="h-8 bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={onGive}>
              <ArrowUpRight className="mr-1 h-4 w-4" />Give advance
            </Button>
          </div>
        }
      >
        {data.advances.length === 0 ? (
          <EmptyState icon={HandCoins} title="No advances" description="Money given in advance is tracked here and can be recovered from salary (Advance recovery on a payslip) or repaid in cash." />
        ) : (
          <div className="divide-y divide-gray-50">
            {data.advances.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", a.type === "ADVANCE" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>
                  {a.type === "ADVANCE" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {a.type === "ADVANCE" ? "Advance given" : a.salary_id ? "Recovered from salary" : "Repaid"}
                    <span className="ml-1.5 text-xs font-normal text-gray-500">· {METHOD_LABEL[a.method] || a.method}</span>
                  </p>
                  <p className="text-[11px] text-gray-500">{day(a.txn_date)}{a.reference ? ` · ref ${a.reference}` : ""}{a.notes ? ` · ${a.notes}` : ""}</p>
                </div>
                <div className="text-right">
                  <p className={cn("text-sm font-bold tabular-nums", a.type === "ADVANCE" ? "text-amber-700" : "text-emerald-700")}>
                    {a.type === "ADVANCE" ? "+" : "−"}{rs(a.amount)}
                  </p>
                  <p className="text-[10px] text-gray-400">balance {rs(a.balance)}</p>
                </div>
                {!a.salary_id ? (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-rose-600" onClick={() => onDelete(a.id)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : <span className="w-8" />}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------ commission ------------------------------ */

function CommissionTab({
  data,
  employeeId,
  month,
  year,
  onChanged,
}: {
  data: FinanceFile;
  employeeId: string;
  month: number;
  year: number;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast({ title: ok });
      onChanged();
    } catch (error) {
      toast({ variant: "destructive", title: "Action failed", description: apiError(error) });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-4">
      <Card title="Sales performance">
        <div className="p-4">
          <EmployeeSalesPerformance employeeId={employeeId} />
        </div>
      </Card>
      <Card
        title="Monthly commission records"
        action={
          <Button size="sm" variant="outline" className="h-8" disabled={busy === "gen"} onClick={() => run("gen", () => employeeApi.generateCommission(month, year, employeeId), "Commission calculated for this month")}>
            Calculate {month}/{year}
          </Button>
        }
      >
        {data.commissions.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-gray-400">No commission records yet — calculate a month to save it.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {data.commissions.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="w-20 font-medium text-gray-900">{c.period_label}</span>
                <span className="text-xs text-gray-500">{rs(c.sales_amount)} sales · {c.bills} bills · {c.pieces} pcs</span>
                <span className="ml-auto font-semibold tabular-nums text-gray-900">{rs(c.amount)}</span>
                {c.is_paid ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">Paid {day(c.paid_date)}</span>
                ) : (
                  <Button size="sm" className="h-7 bg-emerald-600 text-xs hover:bg-emerald-700" disabled={busy === c.id} onClick={() => run(c.id, () => employeeApi.markCommissionPaid(c.id), "Commission marked paid")}>
                    Mark paid
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------ profile ------------------------------ */

function ProfileTab({ data }: { data: FinanceFile }) {
  const e = data.employee;
  const rows: [string, ReactNode][] = [
    ["Employee code", e.employee_code],
    ["Designation", e.employee_type?.name],
    ["Department", e.department?.name],
    ["Branch", e.branch?.name],
    ["Employment", EMPLOYMENT_LABEL[e.employment_type]],
    ["Joined", day(e.join_date)],
    ["Phone", e.phone_number],
    ["Email", e.email],
    ["CNIC", e.cnic],
    ["Address", e.address],
    ["POS login", e.user?.email],
    ["Monthly salary", rs(e.monthly_salary)],
    ["Commission", e.commission_label],
    ["Bank", [e.bank_name, e.account_title].filter(Boolean).join(" · ")],
    ["Account no.", e.account_number],
    ["IBAN", e.iban],
  ];
  return (
    <Card title="Profile">
      <dl className="grid gap-x-8 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-gray-50 px-4 py-2.5 text-sm">
            <dt className="text-gray-500">{label}</dt>
            <dd className={cn("text-right", value ? "font-medium text-gray-900" : "text-gray-300")}>{value || "—"}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
