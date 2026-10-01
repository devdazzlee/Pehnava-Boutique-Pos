"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { format } from "date-fns";
import {
  Search,
  Plus,
  Loader2,
  DollarSign,
  CheckCircle2,
  XCircle,
  List,
  LayoutGrid,
  X,
  Wallet,
  RefreshCcw,
  Banknote,
  CreditCard,
  Percent,
  MoreHorizontal,
} from "lucide-react";
import { LoadingButton } from "@/components/ui/loading-button";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import {
  downloadExcel,
  formatMoney,
} from "@/components/inventory/stock-ops/export-utils";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { extractApiError } from "@/lib/api/errors";
import { useEmployees } from "@/hooks/queries/use-employees";
import { useSalaries, useSalaryMutations } from "@/hooks/queries/use-salaries";
import type { SalaryRecord } from "@/lib/api/salaries";
import { useQuery } from "@tanstack/react-query";
import { fetchCommissions } from "@/lib/api/commissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type PaidFilter = "all" | "paid" | "unpaid";

interface FormState {
  employee_id: string;
  month: number;
  year: number;
  amount: string;
  loan_amount: string;
  is_paid: boolean;
  paid_date: Date | undefined;
  notes: string;
}

const PAGE_SIZE = 20;
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => currentYear - i);

const fieldLabel = "text-xs font-medium text-foreground";
const fieldControl = "h-9 text-sm";

const salaryFormSchema = z.object({
  employee_id: z.string().min(1, "Select an employee"),
  month: z.number().min(1).max(12),
  year: z.number().min(2020),
  amount: z.number().positive("Amount must be greater than 0"),
  loan_amount: z.number().min(0).optional(),
  is_paid: z.boolean(),
  notes: z.string().optional(),
});

const emptyForm = (): FormState => ({
  employee_id: "",
  month: new Date().getMonth() + 1,
  year: currentYear,
  amount: "",
  loan_amount: "0",
  is_paid: false,
  paid_date: undefined,
  notes: "",
});

const formatPeriod = (month: number, year: number) =>
  `${MONTHS[month - 1] || month} ${year}`;

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy");
};

export function Salaries() {
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>(String(currentYear));
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [paidFrom, setPaidFrom] = useState("");
  const [paidTo, setPaidTo] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryRecord | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState("");

  const [detail, setDetail] = useState<SalaryRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SalaryRecord | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const { employees: employeeRows } = useEmployees({ fetchAll: true, limit: 500 });
  const employees = useMemo(
    () =>
      (
        employeeRows as Array<{
          id: string;
          name: string;
          employee_code?: string | null;
          status?: string;
          monthly_salary?: number | string | null;
          commission_rate?: number | string | null;
          bank_name?: string | null;
          account_title?: string | null;
          account_number?: string | null;
          iban?: string | null;
        }>
      )
        .filter((e) => (e.status || "ACTIVE") !== "TERMINATED")
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [employeeRows],
  );

  const selectedFilterEmployee = useMemo(
    () => employees.find((e) => e.id === employeeFilter) ?? null,
    [employees, employeeFilter],
  );

  const selectedFormEmployee = useMemo(
    () => employees.find((e) => e.id === form.employee_id) ?? null,
    [employees, form.employee_id],
  );

  const formCommissionQuery = useQuery({
    queryKey: [
      "salary-form-commission",
      form.employee_id,
      form.month,
      form.year,
    ],
    queryFn: ({ signal }) =>
      fetchCommissions(
        {
          employeeId: form.employee_id,
          month: form.month,
          year: form.year,
          limit: 1,
        },
        signal,
      ),
    enabled: formOpen && !!form.employee_id && !!form.month && !!form.year,
  });
  const formCommissionAmount =
    Number(formCommissionQuery.data?.data?.[0]?.amount) || 0;

  const listParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      isPaid:
        paidFilter === "paid" ? true : paidFilter === "unpaid" ? false : undefined,
      month: monthFilter !== "all" ? monthFilter : undefined,
      year: yearFilter !== "all" ? yearFilter : undefined,
      employeeId: employeeFilter !== "all" ? employeeFilter : undefined,
      paidFrom: paidFrom || undefined,
      paidTo: paidTo || undefined,
    }),
    [page, debouncedSearch, paidFilter, monthFilter, yearFilter, employeeFilter, paidFrom, paidTo],
  );

  const {
    salaries: rows,
    meta,
    isFirstLoad,
    isRefreshing,
    refetch,
    error: listError,
  } = useSalaries(listParams);

  const directoryParams = useMemo(
    () => ({
      page: 1,
      limit: 1,
      month: monthFilter !== "all" ? monthFilter : undefined,
      year: yearFilter !== "all" ? yearFilter : undefined,
      employeeId: employeeFilter !== "all" ? employeeFilter : undefined,
      paidFrom: paidFrom || undefined,
      paidTo: paidTo || undefined,
    }),
    [monthFilter, yearFilter, employeeFilter, paidFrom, paidTo],
  );
  const directoryQuery = useSalaries(directoryParams);
  const statsLoading =
    directoryQuery.isPending || directoryQuery.isPlaceholderData;
  const rawSummary = directoryQuery.summary;
  const employeeTotals = directoryQuery.employeeTotals;

  const summary = rawSummary ?? {
    totalAmount: 0,
    paidAmount: 0,
    unpaidAmount: 0,
    loanAmount: 0,
    netPayable: 0,
    paidCount: 0,
    unpaidCount: 0,
    employeeCount: 0,
  };
  const listMeta = meta ?? { total: 0, page: 1, limit: PAGE_SIZE, totalPages: 1 };
  const directoryTotal =
    directoryQuery.meta?.total ?? summary.paidCount + summary.unpaidCount;

  const { create, update, remove, markPaid, markUnpaid } = useSalaryMutations();
  const submitting = create.isPending || update.isPending;
  const deleting = remove.isPending;

  useEffect(() => {
    if (listError) {
      toast({
        variant: "destructive",
        title: "Failed to load salaries",
        description: extractApiError(listError, "Failed to load salaries"),
      });
    }
  }, [listError]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, listMeta.totalPages);
  const pageSafe = Math.min(page, totalPages);
  const pageRows = rows as SalaryRecord[];

  const hasFilters =
    Boolean(search.trim()) ||
    paidFilter !== "all" ||
    monthFilter !== "all" ||
    yearFilter !== String(currentYear) ||
    employeeFilter !== "all" ||
    Boolean(paidFrom) ||
    Boolean(paidTo);

  const clearFilters = () => {
    setSearch("");
    setPaidFilter("all");
    setMonthFilter("all");
    setYearFilter(String(currentYear));
    setEmployeeFilter("all");
    setPaidFrom("");
    setPaidTo("");
    setPage(1);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (row: SalaryRecord) => {
    setEditing(row);
    setForm({
      employee_id: row.employee_id,
      month: row.month,
      year: row.year,
      amount: String(row.amount ?? ""),
      loan_amount: String(row.loan_amount ?? 0),
      is_paid: !!row.is_paid,
      paid_date: row.paid_date ? new Date(row.paid_date) : undefined,
      notes: row.notes || "",
    });
    setFormError("");
    setFormOpen(true);
  };

  const openDetail = (row: SalaryRecord) => {
    setDetail(row);
    setDetailOpen(true);
  };

  const handleSubmit = () => {
    const parsed = salaryFormSchema.safeParse({
      employee_id: form.employee_id,
      month: form.month,
      year: form.year,
      amount: Number(form.amount),
      loan_amount: Number(form.loan_amount || 0),
      is_paid: form.is_paid,
      notes: form.notes.trim() || undefined,
    });
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message || "Fix the form fields";
      setFormError(msg);
      toast({ variant: "destructive", title: msg });
      return;
    }
    setFormError("");

    const payload: Record<string, unknown> = {
      employee_id: parsed.data.employee_id,
      month: parsed.data.month,
      year: parsed.data.year,
      amount: parsed.data.amount,
      loan_amount: parsed.data.loan_amount ?? 0,
      is_paid: parsed.data.is_paid,
      notes: parsed.data.notes || null,
      paid_date: parsed.data.is_paid
        ? (form.paid_date || new Date()).toISOString()
        : null,
    };

    const onError = (e: unknown) =>
      toast({
        variant: "destructive",
        title: "Could not save salary",
        description: extractApiError(e, "Failed to save salary"),
      });

    if (editing) {
      update.mutate(
        { id: editing.id, body: payload },
        {
          onSuccess: () => {
            toast({ title: "Salary record updated" });
            setFormOpen(false);
          },
          onError,
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast({ title: "Salary record created" });
          setFormOpen(false);
        },
        onError,
      });
    }
  };

  const handleMarkPaid = (row: SalaryRecord) => {
    setActionId(row.id);
    markPaid.mutate(
      { id: row.id, body: { paid_date: new Date().toISOString() } },
      {
        onSuccess: () => {
          toast({ title: "Marked as paid" });
          if (detail?.id === row.id) {
            setDetail({
              ...row,
              is_paid: true,
              paid_date: new Date().toISOString(),
            });
          }
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Could not mark paid",
            description: extractApiError(e, "Failed to mark paid"),
          }),
        onSettled: () => setActionId(null),
      },
    );
  };

  const handleMarkUnpaid = (row: SalaryRecord) => {
    setActionId(row.id);
    markUnpaid.mutate(row.id, {
      onSuccess: () => {
        toast({ title: "Marked as unpaid" });
        if (detail?.id === row.id) {
          setDetail({ ...row, is_paid: false, paid_date: null });
        }
      },
      onError: (e) =>
        toast({
          variant: "destructive",
          title: "Could not mark unpaid",
          description: extractApiError(e, "Failed to mark unpaid"),
        }),
      onSettled: () => setActionId(null),
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    remove.mutate(target.id, {
      onSuccess: () => {
        toast({ title: "Salary record deleted" });
        setDeleteTarget(null);
        if (detail?.id === target.id) {
          setDetailOpen(false);
          setDetail(null);
        }
      },
      onError: (e) =>
        toast({
          variant: "destructive",
          title: "Could not delete",
          description: extractApiError(e, "Failed to delete"),
        }),
    });
  };

  const handleExport = () => {
    if (rows.length === 0) {
      toast({ variant: "destructive", title: "Nothing to export" });
      return;
    }
    downloadExcel(
      `salaries-${format(new Date(), "yyyy-MM-dd")}.xlsx`,
      "Salaries",
      [
        "Employee",
        "Code",
        "Designation",
        "Department",
        "Period",
        "Fixed salary",
        "Base amount",
        "Commission",
        "Total with commission",
        "Loan",
        "Net",
        "Bank",
        "Account title",
        "Account number",
        "IBAN",
        "Status",
        "Paid date",
        "Notes",
      ],
      (rows as SalaryRecord[]).map((r) => [
        r.employee?.name || "",
        r.employee?.employee_code || "",
        r.employee?.employee_type?.name || "",
        r.employee?.department?.name || "",
        formatPeriod(r.month, r.year),
        r.employee?.monthly_salary ?? "",
        r.amount,
        r.commission_amount ?? 0,
        r.total_with_commission ??
          Number(r.amount) + Number(r.commission_amount || 0),
        r.loan_amount ?? 0,
        r.net_payable ?? Number(r.amount) - Number(r.loan_amount || 0),
        r.employee?.bank_name || "",
        r.employee?.account_title || "",
        r.employee?.account_number || "",
        r.employee?.iban || "",
        r.is_paid ? "Paid" : "Unpaid",
        r.paid_date ? formatDate(r.paid_date) : "",
        r.notes || "",
      ]),
    );
  };

  const paidChips: Array<{ key: PaidFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: directoryTotal },
    { key: "paid", label: "Paid", count: summary.paidCount },
    { key: "unpaid", label: "Unpaid", count: summary.unpaidCount },
  ];

  return (
    <>
      <PageHeader
        title="Salaries"
        description="Record monthly pay, track paid vs unpaid, and export payroll history"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefreshing}
              title="Refresh"
            >
              <RefreshCcw
                className={cn("h-4 w-4", isRefreshing && "animate-spin")}
              />
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              Export Excel
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add salary
            </Button>
          </>
        }
      />

      <PageBody className="space-y-5">
        <InventoryKpiGrid
          columns={5}
          loading={statsLoading}
          items={[
            {
              label: "Total salary",
              value: formatMoney(summary.totalAmount),
              icon: DollarSign,
              hint: `${directoryTotal} record${directoryTotal === 1 ? "" : "s"} in filters`,
            },
            {
              label: "Total paid",
              value: formatMoney(summary.paidAmount),
              icon: CheckCircle2,
              tone: "success",
              hint: `${summary.paidCount} paid`,
              onClick: () => {
                setPaidFilter("paid");
                setPage(1);
              },
            },
            {
              label: "Total unpaid",
              value: formatMoney(summary.unpaidAmount),
              icon: XCircle,
              tone: "danger",
              hint: `${summary.unpaidCount} unpaid`,
              onClick: () => {
                setPaidFilter("unpaid");
                setPage(1);
              },
            },
            {
              label: "Loans / advances",
              value: formatMoney(summary.loanAmount || 0),
              icon: Banknote,
              hint: "Taken against pay period",
            },
            {
              label: "Net payable",
              value: formatMoney(
                summary.netPayable ??
                  summary.totalAmount - (summary.loanAmount || 0),
              ),
              icon: Wallet,
              hint: `${summary.employeeCount || 0} employees`,
            },
          ]}
        />

        {employeeTotals ? (
          <Card className="border-[#c9a45a]/40 bg-[#fcf8f2]">
            <CardContent className="flex flex-wrap items-center gap-6 p-4 text-sm">
              <div className="min-w-[160px]">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Employee totals
                </p>
                <p className="font-semibold text-foreground">{employeeTotals.name}</p>
                <p className="text-xs text-muted-foreground">
                  {employeeTotals.code || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total salary</p>
                <p className="font-semibold nums">
                  {formatMoney(employeeTotals.totalSalary)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="font-semibold nums text-emerald-700">
                  {formatMoney(employeeTotals.totalPaid)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Unpaid</p>
                <p className="font-semibold nums text-amber-700">
                  {formatMoney(employeeTotals.totalUnpaid)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Loan</p>
                <p className="font-semibold nums">
                  {formatMoney(employeeTotals.totalLoan)}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="flex flex-col gap-3">
          <Card className="border-border">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-1">
                <Label className="text-xs font-medium text-foreground">
                  View salaries by employee
                </Label>
                <Select
                  value={employeeFilter}
                  onValueChange={(v) => {
                    setEmployeeFilter(v);
                    setPage(1);
                    // Show that person's full history, not only the current year
                    if (v !== "all") {
                      setYearFilter("all");
                      setMonthFilter("all");
                    }
                  }}
                >
                  <SelectTrigger className="h-10 w-full text-sm sm:max-w-md">
                    <SelectValue placeholder="Select an employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All employees</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                        {e.employee_code ? ` (${e.employee_code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Pick a person to see all of their salary records
                </p>
              </div>
              {selectedFilterEmployee ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="h-9 gap-1.5 px-3 text-sm font-normal">
                    {selectedFilterEmployee.name}
                    {selectedFilterEmployee.employee_code
                      ? ` · ${selectedFilterEmployee.employee_code}`
                      : ""}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => {
                      setEmployeeFilter("all");
                      setYearFilter(String(currentYear));
                      setPage(1);
                    }}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Clear employee
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            {paidChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => {
                  setPaidFilter(chip.key);
                  setPage(1);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  paidFilter === chip.key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-foreground hover:bg-muted/50",
                )}
              >
                {chip.label}
                {statsLoading ? (
                  <span className="inline-block h-3 w-5 animate-pulse rounded-full bg-muted" />
                ) : (
                  <span className="nums text-muted-foreground">{chip.count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid min-w-0 flex-1 grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <div className="min-w-0 sm:col-span-2 lg:col-span-1 xl:col-span-1">
                <Label className="mb-1 block text-[11px] text-muted-foreground">
                  Search
                </Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Employee name or code"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="h-9 pl-9"
                  />
                </div>
              </div>
              <div className="min-w-0">
                <Label className="mb-1 block text-[11px] text-muted-foreground">
                  Month
                </Label>
                <Select
                  value={monthFilter}
                  onValueChange={(v) => {
                    setMonthFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All months</SelectItem>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <Label className="mb-1 block text-[11px] text-muted-foreground">
                  Year
                </Label>
                <Select
                  value={yearFilter}
                  onValueChange={(v) => {
                    setYearFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All years</SelectItem>
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <Label className="mb-1 block text-[11px] text-muted-foreground">
                  Paid from
                </Label>
                <Input
                  type="date"
                  className="h-9"
                  value={paidFrom}
                  onChange={(e) => {
                    setPaidFrom(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <div className="min-w-0">
                <Label className="mb-1 block text-[11px] text-muted-foreground">
                  Paid to
                </Label>
                <Input
                  type="date"
                  className="h-9"
                  value={paidTo}
                  onChange={(e) => {
                    setPaidTo(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>

            <div className="flex shrink-0 items-end justify-end gap-2 self-end">
              {hasFilters && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={clearFilters}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Clear
                </Button>
              )}
              <div className="flex h-9 items-center gap-1 rounded-md border border-border p-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === "table" ? "secondary" : "ghost"}
                  className="h-8 px-2.5"
                  onClick={() => setViewMode("table")}
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  className="h-8 px-2.5"
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">
                {selectedFilterEmployee
                  ? `Salaries for ${selectedFilterEmployee.name}`
                  : "Salary records"}{" "}
                <span className="font-normal text-muted-foreground">
                  {isFirstLoad ? "(loading…)" : `(${listMeta.total})`}
                </span>
              </p>
              {isRefreshing && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {isFirstLoad ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="m-4 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12">
                <Wallet className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No salary records found
                </p>
                <p className="text-xs text-muted-foreground">
                  {hasFilters
                    ? "Try clearing filters or add a new salary entry."
                    : "Add the first monthly salary for an employee."}
                </p>
              </div>
            ) : viewMode === "table" ? (
              <div className="overflow-x-auto">
                <Table className="min-w-[1100px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[180px] text-xs uppercase tracking-wide">
                        Employee
                      </TableHead>
                      <TableHead className="min-w-[140px] text-xs uppercase tracking-wide">
                        Account
                      </TableHead>
                      <TableHead className="min-w-[110px] whitespace-nowrap text-xs uppercase tracking-wide">
                        Period
                      </TableHead>
                      <TableHead className="min-w-[90px] whitespace-nowrap text-right text-xs uppercase tracking-wide">
                        Fixed
                      </TableHead>
                      <TableHead className="min-w-[90px] whitespace-nowrap text-right text-xs uppercase tracking-wide">
                        Base
                      </TableHead>
                      <TableHead className="min-w-[90px] whitespace-nowrap text-right text-xs uppercase tracking-wide">
                        Commission
                      </TableHead>
                      <TableHead className="min-w-[90px] whitespace-nowrap text-right text-xs uppercase tracking-wide">
                        Total
                      </TableHead>
                      <TableHead className="min-w-[90px] whitespace-nowrap text-right text-xs uppercase tracking-wide">
                        Net
                      </TableHead>
                      <TableHead className="min-w-[100px] text-xs uppercase tracking-wide">
                        Status
                      </TableHead>
                      <TableHead className="min-w-[100px] text-right text-xs uppercase tracking-wide">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((row) => {
                      const commission = Number(row.commission_amount) || 0;
                      const total =
                        Number(
                          row.total_with_commission ??
                            Number(row.amount) + commission,
                        ) || 0;
                      const net =
                        Number(
                          row.net_payable ??
                            Number(row.amount) - Number(row.loan_amount || 0),
                        ) || 0;
                      const accountLine =
                        [
                          row.employee?.bank_name,
                          row.employee?.account_number || row.employee?.iban,
                        ]
                          .filter(Boolean)
                          .join(" · ") || null;

                      return (
                        <TableRow
                          key={row.id}
                          className="align-middle hover:bg-muted/50"
                        >
                          <TableCell className="align-middle">
                            <p className="truncate font-medium text-foreground">
                              {row.employee?.name || "—"}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {row.employee?.employee_code || "—"}
                              {row.employee?.employee_type?.name
                                ? ` · ${row.employee.employee_type.name}`
                                : ""}
                            </p>
                          </TableCell>
                          <TableCell className="align-middle">
                            {accountLine ? (
                              <div className="min-w-0">
                                <p className="truncate text-sm text-foreground">
                                  {accountLine}
                                </p>
                                {row.employee?.account_title ? (
                                  <p className="truncate text-xs text-muted-foreground">
                                    {row.employee.account_title}
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                No account
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="align-middle whitespace-nowrap text-sm">
                            {formatPeriod(row.month, row.year)}
                          </TableCell>
                          <TableCell className="align-middle whitespace-nowrap text-right nums text-muted-foreground">
                            {formatMoney(row.employee?.monthly_salary || 0)}
                          </TableCell>
                          <TableCell className="align-middle whitespace-nowrap text-right nums font-semibold">
                            {formatMoney(row.amount)}
                          </TableCell>
                          <TableCell className="align-middle whitespace-nowrap text-right nums text-emerald-700">
                            {formatMoney(commission)}
                          </TableCell>
                          <TableCell className="align-middle whitespace-nowrap text-right nums font-medium">
                            {formatMoney(total)}
                          </TableCell>
                          <TableCell className="align-middle whitespace-nowrap text-right nums font-semibold">
                            {formatMoney(net)}
                            {Number(row.loan_amount) > 0 ? (
                              <p className="text-[11px] font-normal text-muted-foreground">
                                Loan {formatMoney(row.loan_amount)}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="align-middle">
                            <Badge
                              variant="outline"
                              className={
                                row.is_paid
                                  ? "border-green-200 bg-green-100 text-green-800"
                                  : "border-amber-200 bg-amber-50 text-amber-800"
                              }
                            >
                              {row.is_paid ? "Paid" : "Unpaid"}
                            </Badge>
                            {row.is_paid ? (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {formatDate(row.paid_date)}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="align-middle text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2.5 text-xs"
                                onClick={() => openDetail(row)}
                              >
                                View
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 w-8 px-0"
                                    disabled={actionId === row.id}
                                  >
                                    {actionId === row.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <MoreHorizontal className="h-4 w-4" />
                                    )}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEdit(row)}>
                                    Edit
                                  </DropdownMenuItem>
                                  {row.is_paid ? (
                                    <DropdownMenuItem
                                      onClick={() => handleMarkUnpaid(row)}
                                    >
                                      Mark unpaid
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem
                                      onClick={() => handleMarkPaid(row)}
                                    >
                                      Mark paid
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setDeleteTarget(row)}
                                  >
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {pageRows.map((row) => (
                  <div
                    key={row.id}
                    className="space-y-3 rounded-lg border border-border bg-background p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">
                          {row.employee?.name || "—"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatPeriod(row.month, row.year)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          row.is_paid
                            ? "border-green-200 bg-green-100 text-green-800"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                        }
                      >
                        {row.is_paid ? "Paid" : "Unpaid"}
                      </Badge>
                    </div>
                    <p className="text-lg font-bold nums">
                      {formatMoney(
                        row.total_with_commission ??
                          Number(row.amount) + Number(row.commission_amount || 0),
                      )}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>
                        <p>Base</p>
                        <p className="nums font-medium text-foreground">
                          {formatMoney(row.amount)}
                        </p>
                      </div>
                      <div>
                        <p>Commission</p>
                        <p className="nums font-medium text-emerald-700">
                          {formatMoney(row.commission_amount || 0)}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="flex items-center gap-1">
                          <CreditCard className="h-3 w-3" />
                          Account
                        </p>
                        <p className="truncate text-foreground">
                          {row.employee?.account_number ||
                            row.employee?.iban ||
                            row.employee?.bank_name ||
                            "No account details"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openDetail(row)}
                      >
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openEdit(row)}
                      >
                        Edit
                      </Button>
                      {!row.is_paid && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          disabled={actionId === row.id}
                          onClick={() => handleMarkPaid(row)}
                        >
                          Mark paid
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {listMeta.total > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Page {pageSafe} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={pageSafe >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </PageBody>

      {/* Create / Edit — 7 fields (employee, month, year, amount, paid toggle,
          paid date, notes), so a DetailSheet with the form in the body. */}
      <DetailSheet
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false);
            setEditing(null);
            setFormError("");
          }
        }}
        size="lg"
      >
        <DetailSheetHeader
          title={editing ? "Edit salary" : "Add salary"}
          subtitle="Monthly pay record for an employee"
          icon={<Wallet className="h-5 w-5" />}
        />
        <DetailSheetBody className="space-y-4">
          <div className="space-y-1">
            <Label className={fieldLabel}>
              Employee <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.employee_id}
              onValueChange={(v) => {
                const emp = employees.find((e) => e.id === v);
                const fixed = Number(emp?.monthly_salary) || 0;
                setForm((f) => ({
                  ...f,
                  employee_id: v,
                  amount:
                    !editing && fixed > 0 ? String(fixed) : f.amount,
                }));
              }}
            >
              <SelectTrigger className={fieldControl}>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                    {e.employee_code ? ` (${e.employee_code})` : ""}
                    {Number(e.monthly_salary) > 0
                      ? ` · ${formatMoney(Number(e.monthly_salary))}/mo`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(() => {
              const emp = selectedFormEmployee;
              if (!emp) return null;
              const rate = Number(emp.commission_rate) || 0;
              const fixed = Number(emp.monthly_salary) || 0;
              return (
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="rounded-md bg-muted/40 px-2.5 py-2">
                      <p className="text-[11px] text-muted-foreground">
                        Fixed monthly salary
                      </p>
                      <p className="nums text-sm font-semibold">
                        {formatMoney(fixed)}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/40 px-2.5 py-2">
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Percent className="h-3 w-3" />
                        Commission addon ({rate}%)
                      </p>
                      <p className="nums text-sm font-semibold text-emerald-700">
                        {formCommissionQuery.isFetching
                          ? "…"
                          : formatMoney(formCommissionAmount)}
                      </p>
                    </div>
                    <div className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2">
                      <p className="text-[11px] text-muted-foreground">
                        Total with commission
                      </p>
                      <p className="nums text-sm font-semibold">
                        {formatMoney(
                          (Number(form.amount) || fixed) + formCommissionAmount,
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5 border-t border-border pt-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <CreditCard className="h-3.5 w-3.5" />
                      Account details
                    </p>
                    <div className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                      <p>
                        <span className="text-muted-foreground">Bank: </span>
                        {emp.bank_name || "—"}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Title: </span>
                        {emp.account_title || "—"}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Account #: </span>
                        {emp.account_number || "—"}
                      </p>
                      <p>
                        <span className="text-muted-foreground">IBAN: </span>
                        {emp.iban || "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className={fieldLabel}>Month</Label>
              <Select
                value={String(form.month)}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, month: Number(v) }))
                }
              >
                <SelectTrigger className={fieldControl}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className={fieldLabel}>Year</Label>
              <Select
                value={String(form.year)}
                onValueChange={(v) => setForm((f) => ({ ...f, year: Number(v) }))}
              >
                <SelectTrigger className={fieldControl}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className={fieldLabel}>
              Base salary amount <span className="text-destructive">*</span>
            </Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="Prefills from employee monthly salary"
              className={fieldControl}
            />
            <p className="text-[11px] text-muted-foreground">
              Uses the employee&apos;s fixed monthly salary. Commission is paid
              separately as an addon.
            </p>
          </div>

          <div className="space-y-1">
            <Label className={fieldLabel}>Loan / advance</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.loan_amount}
              onChange={(e) =>
                setForm((f) => ({ ...f, loan_amount: e.target.value }))
              }
              placeholder="0.00"
              className={fieldControl}
            />
            <p className="text-[11px] text-muted-foreground">
              Optional amount taken as loan against this salary period
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
            <div>
              <p className="text-xs font-semibold text-foreground">
                Mark as paid
              </p>
              <p className="text-xs text-muted-foreground">
                Turn on if payment was already made
              </p>
            </div>
            <Switch
              checked={form.is_paid}
              onCheckedChange={(checked) =>
                setForm((f) => ({
                  ...f,
                  is_paid: checked,
                  paid_date: checked ? f.paid_date || new Date() : undefined,
                }))
              }
            />
          </div>

          {form.is_paid && (
            <div className="space-y-1">
              <Label className={fieldLabel}>Paid date</Label>
              <Input
                type="date"
                className={fieldControl}
                value={
                  form.paid_date
                    ? format(form.paid_date, "yyyy-MM-dd")
                    : ""
                }
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((f) => ({
                    ...f,
                    paid_date: value
                      ? new Date(`${value}T00:00:00`)
                      : undefined,
                  }));
                }}
              />
            </div>
          )}

          <div className="space-y-1">
            <Label className={fieldLabel}>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes"
              className="min-h-[72px] text-sm"
            />
          </div>

          {formError && (
            <p className="text-xs text-destructive" role="alert">
              {formError}
            </p>
          )}
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button
            variant="outline"
            onClick={() => setFormOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <LoadingButton
            onClick={handleSubmit}
            loading={submitting}
            disabled={submitting}
          >
            {editing ? "Update salary" : "Create salary"}
          </LoadingButton>
        </DetailSheetFooter>
      </DetailSheet>

      {/* Detail */}
      <DetailSheet
        open={detailOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDetailOpen(false);
            setDetail(null);
          }
        }}
        size="md"
      >
        <DetailSheetHeader
          title={detail?.employee?.name || "Salary"}
          subtitle={
            detail ? formatPeriod(detail.month, detail.year) : undefined
          }
          icon={<Wallet className="h-5 w-5" />}
        />
        <DetailSheetBody className="space-y-4">
          {detail && (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="font-normal">
                  {formatPeriod(detail.month, detail.year)}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    detail.is_paid
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }
                >
                  {detail.is_paid ? "Paid" : "Unpaid"}
                </Badge>
              </div>

              <div className="space-y-2 rounded-lg border border-border p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Code</span>
                  <span className="text-xs nums">
                    {detail.employee?.employee_code || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone</span>
                  <span>{detail.employee?.phone_number || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Designation</span>
                  <span>{detail.employee?.employee_type?.name || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Department</span>
                  <span>{detail.employee?.department?.name || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Branch</span>
                  <span>{detail.employee?.branch?.name || "—"}</span>
                </div>

                <div className="space-y-2 border-t border-border pt-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <CreditCard className="h-3.5 w-3.5" />
                    Account details
                  </p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bank</span>
                    <span>{detail.employee?.bank_name || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account title</span>
                    <span>{detail.employee?.account_title || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account number</span>
                    <span className="nums">
                      {detail.employee?.account_number || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IBAN</span>
                    <span className="nums">{detail.employee?.iban || "—"}</span>
                  </div>
                </div>

                <div className="space-y-2 border-t border-border pt-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Wallet className="h-3.5 w-3.5" />
                    Pay breakdown
                  </p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fixed monthly</span>
                    <span className="nums">
                      {formatMoney(detail.employee?.monthly_salary || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Base salary</span>
                    <span className="font-semibold nums">
                      {formatMoney(detail.amount)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Commission addon
                      {Number(detail.commission_rate) > 0
                        ? ` (${Number(detail.commission_rate)}%)`
                        : ""}
                    </span>
                    <span className="nums text-emerald-700">
                      {formatMoney(detail.commission_amount || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-foreground">
                      Total with commission
                    </span>
                    <span className="font-bold nums">
                      {formatMoney(
                        detail.total_with_commission ??
                          Number(detail.amount) +
                            Number(detail.commission_amount || 0),
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Loan / advance</span>
                    <span className="nums">
                      {formatMoney(detail.loan_amount || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-foreground">
                      Net salary payable
                    </span>
                    <span className="font-bold nums">
                      {formatMoney(
                        Number(
                          detail.net_payable ??
                            Number(detail.amount) -
                              Number(detail.loan_amount || 0),
                        ),
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between border-t border-border pt-2">
                  <span className="text-muted-foreground">Paid date</span>
                  <span>{formatDate(detail.paid_date)}</span>
                </div>
                {detail.notes && (
                  <div className="border-t border-border pt-2">
                    <p className="mb-1 text-xs text-muted-foreground">Notes</p>
                    <p className="text-foreground">{detail.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DetailSheetBody>
        <DetailSheetFooter>
          {detail && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setDetailOpen(false);
                  openEdit(detail);
                }}
              >
                Edit
              </Button>
              {detail.is_paid ? (
                <Button
                  variant="outline"
                  disabled={actionId === detail.id}
                  onClick={() => handleMarkUnpaid(detail)}
                >
                  Mark unpaid
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={actionId === detail.id}
                  onClick={() => handleMarkPaid(detail)}
                >
                  Mark paid
                </Button>
              )}
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(detail)}
              >
                Delete
              </Button>
            </>
          )}
        </DetailSheetFooter>
      </DetailSheet>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete salary record?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the{" "}
              <span className="font-semibold">
                {deleteTarget
                  ? formatPeriod(deleteTarget.month, deleteTarget.year)
                  : ""}
              </span>{" "}
              entry for{" "}
              <span className="font-semibold">
                {deleteTarget?.employee?.name || "this employee"}
              </span>
              . This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
