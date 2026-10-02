"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  BadgeDollarSign,
  ChevronLeft,
  ChevronRight,
  Download,
  HandCoins,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  Pencil,
  Power,
  RefreshCw,
  TrendingUp,
  Upload,
  UserPlus,
  Users,
  Wand2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { qk } from "@/lib/query/query-keys";
import { Bone, Chips, EmptyState, FilterBar, SearchBox } from "@/components/accounts/coa-ui";
import { ConfirmDialog } from "@/components/accounts/coa-dialogs";
import { DeactivateDialog, EmployeeFormDialog, ImportEmployeesDialog, PaySalaryDialog, PayslipDialog } from "./employee-dialogs";
import { EmployeeWorkspace } from "./employee-workspace";
import {
  EMPLOYMENT_LABEL,
  MONTHS,
  SLIP_META,
  STATUS_META,
  apiError,
  employeeApi,
  initials,
  rs,
  type EmployeeRow,
  type Overview,
  type Payslip,
} from "./employee-api";

type StatusFilter = "active" | "all" | "ON_LEAVE" | "inactive";
type PayFilter = "all" | "unpaid" | "partial" | "paid" | "missing" | "advance" | "commission";
type SortKey = "name" | "salary" | "sales" | "commission" | "due" | "advance" | "joined";
type Layout = "table" | "cards";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Name A–Z" },
  { value: "sales", label: "Top sales this month" },
  { value: "commission", label: "Highest commission" },
  { value: "salary", label: "Highest salary" },
  { value: "due", label: "Most salary due" },
  { value: "advance", label: "Largest advance" },
  { value: "joined", label: "Newest joiners" },
];

export function EmployeeHub() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [pay, setPay] = useState<PayFilter>("all");
  const [department, setDepartment] = useState("all");
  const [designation, setDesignation] = useState("all");
  const [employment, setEmployment] = useState("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [layout, setLayout] = useState<Layout>("table");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [formOpen, setFormOpen] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [importOpen, setImportOpen] = useState(false);
  const [paySlip, setPaySlip] = useState<{ slip: Payslip; name: string } | null>(null);
  const [newSlipFor, setNewSlipFor] = useState<EmployeeRow | null>(null);
  const [deactivating, setDeactivating] = useState<EmployeeRow | null>(null);
  const [runConfirm, setRunConfirm] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await employeeApi.overview(month, year));
    } catch (error) {
      toast({ variant: "destructive", title: "Could not load employees", description: apiError(error) });
    } finally {
      setLoading(false);
    }
  }, [month, year, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const changed = useCallback(() => {
    load();
    qc.invalidateQueries({ queryKey: qk.employees.all });
  }, [load, qc]);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setMonth(d.getMonth() + 1);
    setYear(d.getFullYear());
  };

  const employees = data?.employees ?? [];
  const departments = useMemo(() => [...new Map(employees.filter((e) => e.department).map((e) => [e.department!.id, e.department!])).values()], [employees]);
  const designations = useMemo(() => [...new Map(employees.filter((e) => e.employee_type).map((e) => [e.employee_type!.id, e.employee_type!])).values()], [employees]);

  const isActive = (e: EmployeeRow) => e.is_active && e.status !== "TERMINATED" && e.status !== "INACTIVE";
  const statusCounts = {
    active: employees.filter(isActive).length,
    all: employees.length,
    ON_LEAVE: employees.filter((e) => e.status === "ON_LEAVE").length,
    inactive: employees.filter((e) => !isActive(e)).length,
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = employees.filter((e) => {
      if (status === "active" && !isActive(e)) return false;
      if (status === "inactive" && isActive(e)) return false;
      if (status === "ON_LEAVE" && e.status !== "ON_LEAVE") return false;
      if (department !== "all" && e.department?.id !== department) return false;
      if (designation !== "all" && e.employee_type?.id !== designation) return false;
      if (employment !== "all" && e.employment_type !== employment) return false;
      const slip = e.month_salary;
      if (pay === "unpaid" && slip?.status !== "UNPAID") return false;
      if (pay === "partial" && slip?.status !== "PARTIAL") return false;
      if (pay === "paid" && slip?.status !== "PAID") return false;
      if (pay === "missing" && (slip || !(e.monthly_salary > 0) || !isActive(e))) return false;
      if (pay === "advance" && !(e.advance_balance > 0)) return false;
      if (pay === "commission" && !(e.month_sales.commission > 0 || e.commission_due > 0)) return false;
      if (q && ![e.name, e.employee_code, e.phone_number, e.cnic, e.email, e.department?.name, e.employee_type?.name].some((v) => (v || "").toLowerCase().includes(q))) return false;
      return true;
    });
    const by: Record<SortKey, (a: EmployeeRow, b: EmployeeRow) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      salary: (a, b) => b.monthly_salary - a.monthly_salary,
      sales: (a, b) => b.month_sales.sales - a.month_sales.sales,
      commission: (a, b) => b.month_sales.commission - a.month_sales.commission,
      due: (a, b) => b.salary_due_total - a.salary_due_total,
      advance: (a, b) => b.advance_balance - a.advance_balance,
      joined: (a, b) => new Date(b.join_date).getTime() - new Date(a.join_date).getTime(),
    };
    return list.sort(by[sort]);
  }, [employees, search, status, department, designation, employment, pay, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = data?.totals;
  const selected = employees.find((e) => e.id === selectedId) ?? null;
  const filtersActive = !!search || status !== "active" || pay !== "all" || department !== "all" || designation !== "all" || employment !== "all";

  const runPayroll = async () => {
    setRunning(true);
    try {
      const res = await employeeApi.generate(month, year);
      toast({
        title: res.created ? `${res.created} payslip(s) created` : "Payroll already generated",
        description: res.created ? `${MONTHS[month - 1]} ${year}: ${res.names.slice(0, 5).join(", ")}${res.names.length > 5 ? "…" : ""}` : "Every active employee with a salary already has a payslip.",
      });
      changed();
    } catch (error) {
      toast({ variant: "destructive", title: "Payroll run failed", description: apiError(error) });
    } finally {
      setRunning(false);
    }
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(
      rows.map((e) => ({
        Code: e.employee_code || "",
        Name: e.name,
        Designation: e.employee_type?.name || "",
        Department: e.department?.name || "",
        Status: STATUS_META[e.status]?.label || e.status,
        "Monthly salary": e.monthly_salary,
        Commission: e.commission_label,
        [`Sales ${MONTHS[month - 1]}`]: e.month_sales.sales,
        Bills: e.month_sales.bills,
        [`Commission ${MONTHS[month - 1]}`]: e.month_sales.commission,
        "Payslip status": e.month_salary ? SLIP_META[e.month_salary.status].label : "Not generated",
        "Take-home": e.month_salary?.net_payable ?? 0,
        "Paid this month": e.month_salary?.paid_amount ?? 0,
        "Salary due (all)": e.salary_due_total,
        "Salary paid (lifetime)": e.salary_paid_total,
        "Advance owed": e.advance_balance,
        "Commission due": e.commission_due,
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, `employees-payroll-${year}-${String(month).padStart(2, "0")}.xlsx`);
  };

  const open = (e: EmployeeRow) => {
    setSelectedId(e.id);
    setWorkspaceOpen(true);
  };

  const kpis = [
    { label: "Team", value: String(t?.active ?? 0), hint: `${t?.headcount ?? 0} total · payroll ${rs(t?.monthlyPayroll ?? 0)}/mo`, icon: Users, accent: "bg-gray-100 text-gray-700", onClick: () => { setStatus("active"); setPay("all"); } },
    { label: `${MONTHS[month - 1]} salaries`, value: rs(t?.monthNet ?? 0), hint: `Paid ${rs(t?.monthPaid ?? 0)} · due ${rs(t?.monthDue ?? 0)}`, icon: Banknote, accent: "bg-emerald-50 text-emerald-600", onClick: () => setPay("unpaid") },
    { label: "Salary due (all months)", value: rs(t?.salaryDueAll ?? 0), hint: t?.slipsMissing ? `${t.slipsMissing} payslip(s) not generated` : "All payslips generated", icon: AlertTriangle, accent: "bg-rose-50 text-rose-600", onClick: () => setPay(t?.slipsMissing ? "missing" : "unpaid") },
    { label: "Advances owed", value: rs(t?.advancesOutstanding ?? 0), hint: `${employees.filter((e) => e.advance_balance > 0).length} employee(s)`, icon: HandCoins, accent: "bg-amber-50 text-amber-700", onClick: () => setPay("advance") },
    { label: `${MONTHS[month - 1]} sales by staff`, value: rs(t?.monthSales ?? 0), hint: `${t?.monthBills ?? 0} bills · commission ${rs(t?.monthCommission ?? 0)}`, icon: TrendingUp, accent: "bg-sky-50 text-sky-600", onClick: () => setSort("sales") },
  ];

  return (
    <div className="min-h-full bg-[#f8f6f2]">
      <div className="border-b border-gray-200/70 bg-white">
        <div className="flex flex-col gap-4 px-4 py-5 md:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="hidden h-11 w-11 items-center justify-center rounded-xl bg-[#2a2012] text-[#e9d3a4] shadow-sm sm:flex">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a67c2e]">Staff & HR</p>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Employees & payroll</h1>
              <p className="text-xs text-gray-500">Profiles, salaries, advances, sales and commission in one place</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-gray-200 bg-white">
              <button type="button" className="rounded-l-lg p-2 text-gray-500 hover:bg-gray-50" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
              <span className="min-w-[120px] text-center text-sm font-semibold text-gray-800">{MONTHS[month - 1]} {year}</span>
              <button type="button" className="rounded-r-lg p-2 text-gray-500 hover:bg-gray-50" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <Button variant="outline" size="sm" className="h-9" onClick={changed} disabled={loading}>
              <RefreshCw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} />Refresh
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => setRunConfirm(true)} disabled={running}>
              {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}Run payroll
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 px-2" aria-label="More"><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setImportOpen(true)}><Upload className="mr-2 h-4 w-4" />Import employees</DropdownMenuItem>
                <DropdownMenuItem onClick={exportExcel}><Download className="mr-2 h-4 w-4" />Export to Excel</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="h-9 bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={() => setFormOpen({ open: true, id: null })}>
              <UserPlus className="mr-1.5 h-4 w-4" />New employee
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-5 px-4 py-5 md:px-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {!data
            ? Array.from({ length: 5 }).map((_, i) => <Bone key={i} className="h-[96px] rounded-xl" />)
            : kpis.map((k) => (
                <button key={k.label} type="button" onClick={k.onClick} className="rounded-xl border border-gray-200/80 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{k.label}</p>
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", k.accent)}><k.icon className="h-4 w-4" /></span>
                  </div>
                  <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-gray-900">{k.value}</p>
                  <p className="mt-0.5 truncate text-[11px] text-gray-500">{k.hint}</p>
                </button>
              ))}
        </div>

        {t && t.slipsMissing > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            <span>{t.slipsMissing} active employee(s) have no payslip for {MONTHS[month - 1]} {year}.</span>
            <Button size="sm" className="ml-auto h-8 bg-amber-600 hover:bg-amber-700" onClick={() => setRunConfirm(true)}>Generate payslips</Button>
          </div>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm">
          <FilterBar>
            <SearchBox value={search} onChange={setSearch} placeholder="Name, code, phone, CNIC…" className="max-w-xs" />
            <Chips<StatusFilter>
              value={status}
              onChange={setStatus}
              options={[
                { value: "active", label: "Active", count: statusCounts.active },
                { value: "ON_LEAVE", label: "On leave", count: statusCounts.ON_LEAVE },
                { value: "inactive", label: "Inactive / left", count: statusCounts.inactive },
                { value: "all", label: "All", count: statusCounts.all },
              ]}
            />
            <div className="ml-auto flex items-center gap-2">
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="h-9 w-[180px] rounded-lg border-gray-200 bg-white text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
                {([["table", List], ["cards", LayoutGrid]] as const).map(([v, Icon]) => (
                  <button key={v} type="button" onClick={() => setLayout(v)} aria-label={`${v} view`} className={cn("rounded-md p-1.5", layout === v ? "bg-[#2a2012] text-white" : "text-gray-500 hover:bg-gray-100")}>
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </FilterBar>
          <FilterBar className="bg-white">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{MONTHS[month - 1]} payroll</span>
            <Chips<PayFilter>
              size="xs"
              value={pay}
              onChange={setPay}
              options={[
                { value: "all", label: "Any" },
                { value: "unpaid", label: "Unpaid", dot: "bg-rose-500" },
                { value: "partial", label: "Partly paid", dot: "bg-amber-500" },
                { value: "paid", label: "Paid", dot: "bg-emerald-500" },
                { value: "missing", label: "No payslip", dot: "bg-gray-400", count: t?.slipsMissing },
                { value: "advance", label: "Owes advance", dot: "bg-orange-500" },
                { value: "commission", label: "Earned commission", dot: "bg-sky-500" },
              ]}
            />
            <div className="ml-auto flex flex-wrap gap-2">
              {departments.length ? (
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : null}
              {designations.length ? (
                <Select value={designation} onValueChange={setDesignation}>
                  <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All designations</SelectItem>
                    {designations.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : null}
              <Select value={employment} onValueChange={setEmployment}>
                <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any type</SelectItem>
                  {Object.entries(EMPLOYMENT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </FilterBar>

          {!data ? (
            <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, i) => <Bone key={i} className="h-14 rounded-lg" />)}</div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Users}
              title={employees.length ? "No employees match these filters" : "No employees yet"}
              description={employees.length ? "Clear filters or pick another month." : "Add your team to manage salaries, advances and commission."}
              action={
                employees.length ? (
                  <Button size="sm" variant="outline" disabled={!filtersActive} onClick={() => { setSearch(""); setStatus("active"); setPay("all"); setDepartment("all"); setDesignation("all"); setEmployment("all"); }}>
                    Clear filters
                  </Button>
                ) : (
                  <Button size="sm" className="bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={() => setFormOpen({ open: true, id: null })}>New employee</Button>
                )
              }
            />
          ) : layout === "table" ? (
            <div className={cn("overflow-x-auto transition-opacity", loading && "opacity-60")}>
              <table className="w-full min-w-[1020px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-5 py-2.5">Employee</th>
                    <th className="px-3 py-2.5 text-right">Salary</th>
                    <th className="px-3 py-2.5 text-right">{MONTHS[month - 1].slice(0, 3)} sales</th>
                    <th className="px-3 py-2.5 text-right">Commission</th>
                    <th className="px-3 py-2.5">{MONTHS[month - 1].slice(0, 3)} payslip</th>
                    <th className="px-3 py-2.5 text-right">Owed to / by staff</th>
                    <th className="w-44 px-5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id} onClick={() => open(e)} className={cn("group cursor-pointer border-b border-gray-50 transition-colors hover:bg-[#fcf8f2]/70", !isActive(e) && "opacity-60")}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar e={e} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-900 group-hover:text-[#8a6520]">{e.name}</p>
                            <p className="truncate text-[11px] text-gray-500">
                              {[e.employee_code, e.employee_type?.name, e.department?.name].filter(Boolean).join(" · ") || "Staff"}
                            </p>
                          </div>
                          {e.status !== "ACTIVE" ? <StatusPill e={e} /> : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <p className="font-medium tabular-nums text-gray-900">{rs(e.monthly_salary)}</p>
                        <p className="text-[10px] text-gray-400">{EMPLOYMENT_LABEL[e.employment_type]}</p>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <p className="font-medium tabular-nums text-gray-900">{e.month_sales.sales ? rs(e.month_sales.sales) : "—"}</p>
                        <p className="text-[10px] text-gray-400">{e.month_sales.bills} bills · {e.month_sales.pieces} pcs</p>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <p className="font-semibold tabular-nums text-emerald-700">{e.month_sales.commission ? rs(e.month_sales.commission) : "—"}</p>
                        <p className="text-[10px] text-gray-400">{e.commission_label}</p>
                      </td>
                      <td className="px-3 py-3"><SlipCell e={e} /></td>
                      <td className="px-3 py-3 text-right">
                        {e.salary_due_total > 0 ? <p className="text-xs font-semibold tabular-nums text-rose-700">Salary due {rs(e.salary_due_total)}</p> : null}
                        {e.commission_due > 0 ? <p className="text-xs tabular-nums text-sky-700">Commission due {rs(e.commission_due)}</p> : null}
                        {e.advance_balance > 0 ? <p className="text-xs tabular-nums text-amber-700">Advance owed {rs(e.advance_balance)}</p> : null}
                        {!(e.salary_due_total > 0 || e.commission_due > 0 || e.advance_balance > 0) ? <p className="text-xs text-gray-400">Settled</p> : null}
                      </td>
                      <td className="px-5 py-3" onClick={(ev) => ev.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <QuickAction e={e} onPay={(slip) => setPaySlip({ slip, name: e.name })} onCreate={() => setNewSlipFor(e)} onOpen={() => open(e)} />
                          <RowMenu e={e} onEdit={() => setFormOpen({ open: true, id: e.id })} onDeactivate={() => setDeactivating(e)} onReactivate={async () => {
                            try {
                              await employeeApi.reactivate(e.id);
                              toast({ title: "Employee reactivated", description: e.name });
                              changed();
                            } catch (error) {
                              toast({ variant: "destructive", title: "Could not reactivate", description: apiError(error) });
                            }
                          }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={cn("grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3", loading && "opacity-60")}>
              {rows.map((e) => (
                <div key={e.id} role="button" tabIndex={0} onClick={() => open(e)} onKeyDown={(ev) => ev.key === "Enter" && open(e)} className={cn("cursor-pointer rounded-xl border border-gray-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[#a67c2e]/40 hover:shadow-md", !isActive(e) && "opacity-60")}>
                  <div className="flex items-start gap-3">
                    <Avatar e={e} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-gray-900">{e.name}</p>
                      <p className="truncate text-[11px] text-gray-500">{e.employee_type?.name || "Staff"}{e.department ? ` · ${e.department.name}` : ""}</p>
                    </div>
                    <StatusPill e={e} />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    <CardStat label="Salary" value={rs(e.monthly_salary)} />
                    <CardStat label="Sales" value={rs(e.month_sales.sales)} />
                    <CardStat label="Commission" value={rs(e.month_sales.commission)} accent />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <SlipCell e={e} />
                    {e.advance_balance > 0 ? <span className="text-[11px] font-medium text-amber-700">Advance {rs(e.advance_balance)}</span> : null}
                  </div>
                  <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3" onClick={(ev) => ev.stopPropagation()}>
                    <QuickAction e={e} onPay={(slip) => setPaySlip({ slip, name: e.name })} onCreate={() => setNewSlipFor(e)} onOpen={() => open(e)} wide />
                    <RowMenu e={e} onEdit={() => setFormOpen({ open: true, id: e.id })} onDeactivate={() => setDeactivating(e)} onReactivate={async () => { await employeeApi.reactivate(e.id); changed(); }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {data && rows.length ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
              <span>{rows.length} of {employees.length} employees</span>
              <span>
                Payroll {rs(rows.reduce((s, e) => s + (isActive(e) ? e.monthly_salary : 0), 0))}/mo · sales {rs(rows.reduce((s, e) => s + e.month_sales.sales, 0))} · commission{" "}
                {rs(rows.reduce((s, e) => s + e.month_sales.commission, 0))}
              </span>
            </div>
          ) : null}
        </section>
      </div>

      <EmployeeWorkspace employee={selected} open={workspaceOpen} onOpenChange={setWorkspaceOpen} onChanged={changed} month={month} year={year} />
      <EmployeeFormDialog open={formOpen.open} onOpenChange={(o) => setFormOpen((f) => ({ ...f, open: o }))} editingId={formOpen.id} onSaved={changed} />
      <ImportEmployeesDialog open={importOpen} onOpenChange={setImportOpen} onSaved={changed} />
      <PaySalaryDialog slip={paySlip?.slip ?? null} employeeName={paySlip?.name ?? ""} onOpenChange={(o) => !o && setPaySlip(null)} onSaved={changed} />
      {newSlipFor ? (
        <PayslipDialog
          open={!!newSlipFor}
          onOpenChange={(o) => !o && setNewSlipFor(null)}
          employee={{ id: newSlipFor.id, name: newSlipFor.name, monthly_salary: newSlipFor.monthly_salary }}
          editing={null}
          defaultMonth={month}
          defaultYear={year}
          advanceBalance={Math.max(0, newSlipFor.advance_balance)}
          suggestedCommission={newSlipFor.month_sales.commission}
          onSaved={changed}
        />
      ) : null}
      <DeactivateDialog employee={deactivating} onOpenChange={(o) => !o && setDeactivating(null)} onSaved={changed} />
      <ConfirmDialog
        open={runConfirm}
        onOpenChange={setRunConfirm}
        title={`Run payroll for ${MONTHS[month - 1]} ${year}?`}
        description="Creates a payslip at the monthly salary for every active employee who doesn't have one yet. You can adjust bonuses, deductions and advance recovery on each payslip afterwards."
        confirmLabel="Generate payslips"
        onConfirm={runPayroll}
      />
    </div>
  );
}

/* ------------------------------ pieces ------------------------------ */

function Avatar({ e }: { e: EmployeeRow }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f3ead8] text-sm font-semibold text-[#8a6520]">
      {e.photo_url ? <img src={e.photo_url} alt="" className="h-full w-full object-cover" /> : initials(e.name)}
    </span>
  );
}

function StatusPill({ e }: { e: EmployeeRow }) {
  const m = STATUS_META[e.status] ?? STATUS_META.ACTIVE;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", m.tone)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

function SlipCell({ e }: { e: EmployeeRow }) {
  const s = e.month_salary;
  if (!s) {
    return e.monthly_salary > 0 ? <span className="text-[11px] text-gray-400">Not generated</span> : <span className="text-[11px] text-gray-300">No salary set</span>;
  }
  return (
    <div>
      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", SLIP_META[s.status].tone)}>{SLIP_META[s.status].label}</span>
      <p className="mt-0.5 text-[11px] tabular-nums text-gray-600">
        {rs(s.paid_amount)} / {rs(s.net_payable)}
      </p>
    </div>
  );
}

function CardStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-lg px-2.5 py-2", accent ? "bg-emerald-50" : "bg-gray-50")}>
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={cn("truncate font-semibold tabular-nums", accent ? "text-emerald-700" : "text-gray-900")}>{value}</p>
    </div>
  );
}

function QuickAction({ e, onPay, onCreate, onOpen, wide }: { e: EmployeeRow; onPay: (s: Payslip) => void; onCreate: () => void; onOpen: () => void; wide?: boolean }) {
  const s = e.month_salary;
  if (s && s.due > 0) {
    return (
      <Button size="sm" className={cn("h-8 bg-emerald-600 text-xs hover:bg-emerald-700", wide && "flex-1")} onClick={() => onPay(s)}>
        <Banknote className="mr-1 h-3.5 w-3.5" />Pay {rs(s.due)}
      </Button>
    );
  }
  if (!s && e.monthly_salary > 0 && e.is_active) {
    return (
      <Button size="sm" variant="outline" className={cn("h-8 text-xs", wide && "flex-1")} onClick={onCreate}>
        <BadgeDollarSign className="mr-1 h-3.5 w-3.5" />Payslip
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" className={cn("h-8 text-xs", wide && "flex-1")} onClick={onOpen}>Open</Button>
  );
}

function RowMenu({ e, onEdit, onDeactivate, onReactivate }: { e: EmployeeRow; onEdit: () => void; onDeactivate: () => void; onReactivate: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-500" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />Edit employee</DropdownMenuItem>
        <DropdownMenuSeparator />
        {e.is_active ? (
          <DropdownMenuItem className="text-rose-600 focus:text-rose-700" onClick={onDeactivate}><Power className="mr-2 h-4 w-4" />Deactivate</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onReactivate}><Power className="mr-2 h-4 w-4" />Reactivate</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
