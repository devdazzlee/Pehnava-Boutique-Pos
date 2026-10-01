"use client";

import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { z } from "zod";
import {
  Search,
  Plus,
  Loader2,
  Users,
  CheckCircle2,
  XCircle,
  CalendarOff,
  List,
  LayoutGrid,
  X,
  Upload,
  Download,
  Mail,
  MapPin,
  Briefcase,
  User,
  Clock,
  Wallet,
  History,
  RefreshCcw,
  Banknote,
  Filter,
  CreditCard,
  Percent,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingButton } from "@/components/ui/loading-button";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import {
  downloadExcel,
  formatMoney,
} from "@/components/inventory/stock-ops/export-utils";
import {
  ExcelUploadDialog,
  type ExcelField,
} from "@/components/inventory/excel-upload-dialog";
import { useScrollToTopOnPageChange } from "@/hooks/use-scroll-to-top-on-page-change";
import { useToast } from "@/hooks/use-toast";
import { extractApiError, extractApiFieldErrors } from "@/lib/api/errors";
import { importEmployees, type Employee as ApiEmployee } from "@/lib/api/employees";
import {
  useEmployees,
  useEmployee,
  useEmployeeShiftHistory,
  useDepartments,
  useEmployeeMutations,
} from "@/hooks/queries/use-employees";
import {
  useEmployeeTypes,
  useEmployeeTypeMutations,
} from "@/hooks/queries/use-employee-types";
import { useSalaries, useSalaryMutations } from "@/hooks/queries/use-salaries";
import { useShiftAssignmentMutations } from "@/hooks/queries/use-shift-assignments";
import { useQuery } from "@tanstack/react-query";
import { fetchCommissions } from "@/lib/api/commissions";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type EmployeeStatus = "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "TERMINATED";
type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";
type StatusFilter = "all" | EmployeeStatus;
type DetailTab = "overview" | "job" | "personal" | "shifts" | "salary" | "history";
type FormStep = "personal" | "job" | "pay" | "emergency" | "review";
type SortKey = "name" | "join_date" | "status";

interface Employee extends ApiEmployee {
  employee_code?: string | null;
  name: string;
  status: EmployeeStatus;
  is_active: boolean;
  join_date: string | Date | null;
  employee_type_id: string;
  employment_type?: EmploymentType | null;
  date_of_birth?: string | null;
  address?: string | null;
  personal_email?: string | null;
  emergency_name?: string | null;
  emergency_phone?: string | null;
  deactivated_at?: string | null;
  deactivated_reason?: string | null;
  reporting_manager_id?: string | null;
  reporting_manager?: {
    id: string;
    name: string;
    employee_code?: string | null;
  } | null;
  cnic?: string | null;
  gender?: string | null;
  monthly_salary?: number | string | null;
  commission_rate?: number | string | null;
  bank_name?: string | null;
  account_title?: string | null;
  account_number?: string | null;
  iban?: string | null;
  created_at?: string;
}

interface NamedEntity {
  id: string;
  name: string;
  is_active?: boolean;
}

interface ShiftAssignment {
  id: string;
  employee_id: string;
  shift_time: string;
  start_date: string;
  end_date?: string | null;
  break_time?: string | null;
  sales?: number;
}

interface SalaryRow {
  id: string;
  employee_id: string;
  month: number;
  year: number;
  amount: number | string;
  loan_amount?: number | string;
  net_payable?: number | string;
  is_paid: boolean;
  paid_date?: string | null;
  notes?: string | null;
  created_at?: string;
}

interface EmployeeFormValues {
  name: string;
  email: string;
  phone_number: string;
  personal_email: string;
  gender: string;
  cnic: string;
  date_of_birth: Date | null;
  address: string;
  employee_type_id: string;
  department_id: string;
  employment_type: EmploymentType | "";
  join_date: Date | null;
  reporting_manager_id: string;
  status: EmployeeStatus;
  monthly_salary: string;
  commission_rate: string;
  bank_name: string;
  account_title: string;
  account_number: string;
  iban: string;
  emergency_name: string;
  emergency_phone: string;
}

type EmployeeFormErrors = Partial<Record<keyof EmployeeFormValues, string>>;

/* -------------------------------------------------------------------------- */
/* Constants & helpers                                                        */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 20;

const FORM_STEPS: FormStep[] = ["personal", "job", "pay", "emergency", "review"];

const EMPLOYMENT_OPTIONS: { value: EmploymentType; label: string }[] = [
  { value: "FULL_TIME", label: "Full time" },
  { value: "PART_TIME", label: "Part time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "INTERN", label: "Intern" },
];

const STATUS_OPTIONS: { value: EmployeeStatus; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "ON_LEAVE", label: "On leave" },
  { value: "TERMINATED", label: "Terminated" },
];

const GENDER_OPTIONS = ["Male", "Female", "Other"] as const;

const MONTH_NAMES = [
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

const fieldLabelClass = "text-xs font-medium text-foreground";
const fieldControlClass = "h-9 text-sm";

const IMPORT_FIELDS: ExcelField[] = [
  { name: "name", required: true, description: "Full name" },
  { name: "email", required: false, description: "Work email" },
  { name: "phone_number", required: false, description: "Phone" },
  { name: "cnic", required: false, description: "CNIC / national ID" },
  { name: "gender", required: false, description: "Gender" },
  { name: "department", required: false, description: "Department name" },
  { name: "employee_type", required: false, description: "Designation name" },
  { name: "employment_type", required: false, description: "FULL_TIME | PART_TIME | CONTRACT | INTERN" },
  { name: "join_date", required: false, description: "Join date (YYYY-MM-DD)" },
];

const emptyForm = (): EmployeeFormValues => ({
  name: "",
  email: "",
  phone_number: "",
  personal_email: "",
  gender: "",
  cnic: "",
  date_of_birth: null,
  address: "",
  employee_type_id: "",
  department_id: "",
  employment_type: "",
  join_date: null,
  reporting_manager_id: "",
  status: "ACTIVE",
  monthly_salary: "",
  commission_rate: "",
  bank_name: "",
  account_title: "",
  account_number: "",
  iban: "",
  emergency_name: "",
  emergency_phone: "",
});

const toUtcMidnightIso = (d: Date): string =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();

const parseDateValue = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDisplayDate = (value: string | Date | null | undefined): string => {
  const d = parseDateValue(value);
  if (!d) return "—";
  const isCleanUtcMidnight =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  if (isCleanUtcMidnight) {
    return format(
      new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
      "MMM d, yyyy",
    );
  }
  return format(d, "MMM d, yyyy");
};

const employmentLabel = (v?: EmploymentType | null): string =>
  EMPLOYMENT_OPTIONS.find((o) => o.value === v)?.label || "—";

const statusLabel = (s?: EmployeeStatus | null): string =>
  STATUS_OPTIONS.find((o) => o.value === s)?.label || s || "—";

const statusBadgeClass = (status: EmployeeStatus): string => {
  switch (status) {
    case "ACTIVE":
      return "border-green-200 bg-green-100 text-green-800";
    case "ON_LEAVE":
      return "border-amber-200 bg-amber-100 text-amber-800";
    case "INACTIVE":
      return "border-border bg-muted text-muted-foreground";
    case "TERMINATED":
      return "border-red-200 bg-red-100 text-red-800";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
};

const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
};

const cell = (row: Record<string, any>, ...keys: string[]): string => {
  const lowerMap = new Map<string, string>();
  for (const [k, v] of Object.entries(row)) {
    lowerMap.set(k.toLowerCase().replace(/[\s_-]+/g, ""), String(v ?? "").trim());
  }
  for (const key of keys) {
    const normalized = key.toLowerCase().replace(/[\s_-]+/g, "");
    const found = lowerMap.get(normalized);
    if (found) return found;
  }
  return "";
};

const parseJoinDateFlexible = (raw: string): string | undefined => {
  if (!raw.trim()) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return toUtcMidnightIso(d);
};

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || z.string().email().safeParse(v).success, {
    message: "Invalid email address",
  });

const personalStepSchema = z.object({
  name: z
    .string({ required_error: "Full name is required" })
    .trim()
    .min(2, "Full name must be at least 2 characters"),
  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .min(1, "Email is required")
    .email("Email is not valid"),
  phone_number: z.string().trim().optional(),
  personal_email: optionalEmail,
  gender: z.string().trim().optional(),
  cnic: z.string().trim().optional(),
  date_of_birth: z.date().nullable().optional(),
  address: z.string().trim().optional(),
});

const jobStepSchema = z.object({
  employee_type_id: z
    .string({ required_error: "Designation is required" })
    .uuid("Select a designation"),
  department_id: z.string().optional(),
  employment_type: z
    .enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"])
    .optional()
    .or(z.literal("")),
  join_date: z.date({
    required_error: "Join date is required",
    invalid_type_error: "Join date is required",
  }),
  reporting_manager_id: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ON_LEAVE", "TERMINATED"]).optional(),
});

const emergencyStepSchema = z.object({
  emergency_name: z.string().trim().optional(),
  emergency_phone: z.string().trim().optional(),
});

const payStepSchema = z.object({
  monthly_salary: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= 0), {
      message: "Monthly salary must be 0 or more",
    }),
  commission_rate: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) =>
        !v ||
        (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100),
      { message: "Commission rate must be between 0 and 100" },
    ),
  bank_name: z.string().trim().optional(),
  account_title: z.string().trim().optional(),
  account_number: z.string().trim().optional(),
  iban: z.string().trim().optional(),
});

const employeeFormSchema = personalStepSchema
  .merge(jobStepSchema)
  .merge(payStepSchema)
  .merge(emergencyStepSchema);

const zodErrorsToMap = (err: z.ZodError): EmployeeFormErrors => {
  const map: EmployeeFormErrors = {};
  for (const issue of err.errors) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in map)) {
      (map as Record<string, string>)[key] = issue.message;
    }
  }
  return map;
};

const firstZodError = (err: z.ZodError): string =>
  err.errors[0]?.message || "Please check the form fields";

/* -------------------------------------------------------------------------- */
/* Small UI pieces                                                            */
/* -------------------------------------------------------------------------- */

function dateToYmd(value: Date | null): string {
  if (!value || Number.isNaN(value.getTime())) return "";
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function ymdToLocalDate(value: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function DatePickerField({
  id,
  value,
  onChange,
  disabled,
  placeholder = "Pick a date",
  error,
}: {
  id?: string;
  value: Date | null;
  onChange: (d: Date | null) => void;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div className="space-y-1">
      <Input
        id={id}
        type="date"
        value={dateToYmd(value)}
        onChange={(e) => onChange(ymdToLocalDate(e.target.value))}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          fieldControlClass,
          error && "border-destructive focus-visible:ring-destructive",
        )}
      />
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium text-foreground">
        {value || "—"}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export function EmployeeManagement() {
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [employmentFilter, setEmploymentFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeFormValues>(emptyForm);
  const [formErrors, setFormErrors] = useState<EmployeeFormErrors>({});
  const [formStep, setFormStep] = useState<FormStep>("personal");
  const [submitError, setSubmitError] = useState("");
  const [newDesignation, setNewDesignation] = useState("");
  const [newDepartment, setNewDepartment] = useState("");
  const [newManager, setNewManager] = useState("");
  const [addingManager, setAddingManager] = useState(false);
  const [extraManagers, setExtraManagers] = useState<Employee[]>([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<Employee | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");

  const [shiftTime, setShiftTime] = useState("09:00-17:00");
  const [shiftStart, setShiftStart] = useState<Date | null>(new Date());
  const [shiftBreak, setShiftBreak] = useState("1 hour");

  const [salaryMonth, setSalaryMonth] = useState(String(new Date().getMonth() + 1));
  const [salaryYear, setSalaryYear] = useState(String(new Date().getFullYear()));
  const [salaryAmount, setSalaryAmount] = useState("");
  const [salaryNotes, setSalaryNotes] = useState("");
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [salaryFilterPaid, setSalaryFilterPaid] = useState<"all" | "paid" | "unpaid">("all");
  const [salaryFilterMonth, setSalaryFilterMonth] = useState("all");
  const [salaryFilterYear, setSalaryFilterYear] = useState("all");
  const [salaryPaidFrom, setSalaryPaidFrom] = useState("");
  const [salaryPaidTo, setSalaryPaidTo] = useState("");

  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null);
  const [deactivateReason, setDeactivateReason] = useState("");
  const [deactivateStatus, setDeactivateStatus] = useState<
    "INACTIVE" | "TERMINATED"
  >("INACTIVE");
  const [reactivateTarget, setReactivateTarget] = useState<Employee | null>(null);

  const [importOpen, setImportOpen] = useState(false);

  useScrollToTopOnPageChange(page);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  /* ---------- data ---------- */

  const listParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      departmentId: departmentFilter !== "all" ? departmentFilter : undefined,
      employeeTypeId: typeFilter !== "all" ? typeFilter : undefined,
      employmentType: employmentFilter !== "all" ? employmentFilter : undefined,
    }),
    [page, debouncedSearch, statusFilter, departmentFilter, typeFilter, employmentFilter],
  );

  const {
    employees: rawList,
    meta,
    isFirstLoad,
    isRefreshing,
    refetch,
    error: listError,
  } = useEmployees(listParams);

  const allCountQuery = useEmployees({ page: 1, limit: 1 });
  const activeCountQuery = useEmployees({ page: 1, limit: 1, status: "ACTIVE" });
  const inactiveCountQuery = useEmployees({
    page: 1,
    limit: 1,
    status: "INACTIVE",
  });
  const onLeaveCountQuery = useEmployees({
    page: 1,
    limit: 1,
    status: "ON_LEAVE",
  });
  const terminatedCountQuery = useEmployees({
    page: 1,
    limit: 1,
    status: "TERMINATED",
  });
  const statsLoading =
    allCountQuery.isPending ||
    activeCountQuery.isPending ||
    inactiveCountQuery.isPending ||
    onLeaveCountQuery.isPending ||
    terminatedCountQuery.isPending;

  const list = rawList as unknown as Employee[];
  const listMeta = meta ?? { total: 0, page: 1, limit: PAGE_SIZE, totalPages: 1 };

  // Full roster for reporting-manager dropdown (not limited to current table page)
  const { employees: managerPoolRaw, refetch: refetchManagers } = useEmployees({
    page: 1,
    limit: 100,
    status: "ACTIVE",
    fetchAll: true,
  });
  const managerPool = managerPoolRaw as unknown as Employee[];

  const { departments: rawDepartments } = useDepartments();
  const { employeeTypes: rawTypes } = useEmployeeTypes();
  const departments = rawDepartments as unknown as NamedEntity[];
  const employeeTypes = rawTypes as unknown as NamedEntity[];

  const employeeMutations = useEmployeeMutations();
  const employeeTypeMutations = useEmployeeTypeMutations();
  const salaryMutations = useSalaryMutations();
  const shiftMutations = useShiftAssignmentMutations();

  const submitting =
    (employeeMutations.create.isPending && !addingManager) ||
    employeeMutations.update.isPending;
  const deactivating = employeeMutations.deactivate.isPending;
  const reactivating = employeeMutations.reactivate.isPending;
  const addingDesignation = employeeTypeMutations.create.isPending;
  const addingDepartment = employeeMutations.createDepartment.isPending;
  const shiftSaving = shiftMutations.create.isPending;
  const endingShift = employeeMutations.endCurrentShift.isPending;
  const salarySaving = salaryMutations.create.isPending;

  useEffect(() => {
    if (listError) {
      toast({
        variant: "destructive",
        title: "Failed to load employees",
        description: extractApiError(listError, "Could not fetch employees."),
      });
    }
  }, [listError]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- detail data (gated on the sheet being open) ---------- */

  const detailQuery = useEmployee(detailId, { enabled: detailOpen });
  const current: Employee | null =
    (detailQuery.data as unknown as Employee) ?? detailRow ?? null;
  const detailLoading = detailQuery.isLoading && !detailRow;

  const shiftHistoryQuery = useEmployeeShiftHistory(detailId, {
    enabled:
      detailOpen && (detailTab === "shifts" || detailTab === "overview"),
  });
  const shifts = (shiftHistoryQuery.history as ShiftAssignment[]) ?? [];
  const shiftsLoading = shiftHistoryQuery.isLoading;
  const activeShift = shifts.find((s) => !s.end_date);

  const salaryFilterYears = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, i) => String(y - i));
  }, []);

  const salariesQuery = useSalaries(
    {
      employeeId: detailId ?? undefined,
      limit: 100,
      isPaid:
        salaryFilterPaid === "paid"
          ? true
          : salaryFilterPaid === "unpaid"
            ? false
            : undefined,
      month: salaryFilterMonth !== "all" ? salaryFilterMonth : undefined,
      year: salaryFilterYear !== "all" ? salaryFilterYear : undefined,
      paidFrom: salaryPaidFrom || undefined,
      paidTo: salaryPaidTo || undefined,
    },
    { enabled: detailOpen && detailTab === "salary" && !!detailId },
  );
  const salaries = (salariesQuery.salaries as unknown as SalaryRow[]) ?? [];
  const salariesLoading = salariesQuery.isLoading;
  const salarySummary = useMemo(() => {
    const fromApi = salariesQuery.summary;
    if (fromApi) {
      return {
        totalAmount: Number(fromApi.totalAmount) || 0,
        paidAmount: Number(fromApi.paidAmount) || 0,
        unpaidAmount: Number(fromApi.unpaidAmount) || 0,
        loanAmount: Number(fromApi.loanAmount) || 0,
        paidCount: Number(fromApi.paidCount) || 0,
        unpaidCount: Number(fromApi.unpaidCount) || 0,
      };
    }
    let totalAmount = 0;
    let paidAmount = 0;
    let unpaidAmount = 0;
    let loanAmount = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    for (const row of salaries) {
      const amount = Number(row.amount) || 0;
      const loan = Number(row.loan_amount) || 0;
      totalAmount += amount;
      loanAmount += loan;
      if (row.is_paid) {
        paidAmount += amount;
        paidCount += 1;
      } else {
        unpaidAmount += amount;
        unpaidCount += 1;
      }
    }
    return {
      totalAmount,
      paidAmount,
      unpaidAmount,
      loanAmount,
      paidCount,
      unpaidCount,
    };
  }, [salaries, salariesQuery.summary]);

  const fixedMonthlySalary = Number(current?.monthly_salary) || 0;
  const commissionRate = Number(current?.commission_rate) || 0;

  const periodCommissionQuery = useQuery({
    queryKey: [
      "employee-period-commission",
      detailId,
      salaryMonth,
      salaryYear,
    ],
    queryFn: ({ signal }) =>
      fetchCommissions(
        {
          employeeId: detailId!,
          month: salaryMonth,
          year: salaryYear,
          limit: 1,
        },
        signal,
      ),
    enabled:
      detailOpen &&
      detailTab === "salary" &&
      !!detailId &&
      !!salaryMonth &&
      !!salaryYear,
  });
  const periodCommission = periodCommissionQuery.data?.data?.[0] ?? null;
  const periodCommissionAmount = Number(periodCommission?.amount) || 0;

  useEffect(() => {
    if (!detailOpen || detailTab !== "salary" || !current) return;
    const fixed = Number(current.monthly_salary) || 0;
    if (fixed > 0) {
      setSalaryAmount(String(fixed));
    }
  }, [detailOpen, detailTab, current?.id, current?.monthly_salary]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (detailQuery.error) {
      toast({
        variant: "destructive",
        title: "Failed to load employee",
        description: extractApiError(detailQuery.error, "Could not fetch details."),
      });
    }
  }, [detailQuery.error]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- derived list ---------- */

  const stats = {
    total: allCountQuery.meta?.total ?? 0,
    active: activeCountQuery.meta?.total ?? 0,
    inactive: inactiveCountQuery.meta?.total ?? 0,
    onLeave: onLeaveCountQuery.meta?.total ?? 0,
    terminated: terminatedCountQuery.meta?.total ?? 0,
  };

  const sorted = useMemo(() => {
    const rows = [...list];
    rows.sort((a, b) => {
      if (sortKey === "name") {
        return (a.name || "").localeCompare(b.name || "", undefined, {
          sensitivity: "base",
        });
      }
      if (sortKey === "status") {
        return (a.status || "").localeCompare(b.status || "");
      }
      const da = parseDateValue(a.join_date)?.getTime() ?? 0;
      const db = parseDateValue(b.join_date)?.getTime() ?? 0;
      return db - da;
    });
    return rows;
  }, [list, sortKey]);

  const totalPages = Math.max(1, listMeta.totalPages);
  const pageSafe = Math.min(page, totalPages);
  const pageRows = sorted;

  const hasFilters =
    statusFilter !== "all" ||
    departmentFilter !== "all" ||
    typeFilter !== "all" ||
    employmentFilter !== "all" ||
    search.trim().length > 0;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDepartmentFilter("all");
    setTypeFilter("all");
    setEmploymentFilter("all");
    setPage(1);
  };

  const statusChips: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: stats.total },
    { key: "ACTIVE", label: "Active", count: stats.active },
    { key: "INACTIVE", label: "Inactive", count: stats.inactive },
    { key: "ON_LEAVE", label: "On leave", count: stats.onLeave },
    { key: "TERMINATED", label: "Terminated", count: stats.terminated },
  ];

  /* ---------- form helpers ---------- */

  const setField = (patch: Partial<EmployeeFormValues>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    if (submitError) setSubmitError("");
  };

  const clearError = (field: keyof EmployeeFormErrors) => {
    setFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormErrors({});
    setSubmitError("");
    setFormStep("personal");
    setNewDesignation("");
    setNewDepartment("");
    setNewManager("");
    setExtraManagers([]);
    setFormOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setForm({
      name: emp.name || "",
      email: emp.email || "",
      phone_number: emp.phone_number || "",
      personal_email: emp.personal_email || "",
      gender: emp.gender || "",
      cnic: emp.cnic || "",
      date_of_birth: parseDateValue(emp.date_of_birth),
      address: emp.address || "",
      employee_type_id: emp.employee_type_id || emp.employee_type?.id || "",
      department_id: emp.department_id || emp.department?.id || "",
      employment_type: emp.employment_type || "",
      join_date: parseDateValue(emp.join_date) || new Date(),
      reporting_manager_id:
        emp.reporting_manager_id || emp.reporting_manager?.id || "",
      status: emp.status || "ACTIVE",
      monthly_salary:
        emp.monthly_salary != null && emp.monthly_salary !== ""
          ? String(emp.monthly_salary)
          : "",
      commission_rate:
        emp.commission_rate != null && emp.commission_rate !== ""
          ? String(emp.commission_rate)
          : "",
      bank_name: emp.bank_name || "",
      account_title: emp.account_title || "",
      account_number: emp.account_number || "",
      iban: emp.iban || "",
      emergency_name: emp.emergency_name || "",
      emergency_phone: emp.emergency_phone || "",
    });
    setFormErrors({});
    setSubmitError("");
    setFormStep("personal");
    setNewDesignation("");
    setNewDepartment("");
    setNewManager("");
    setExtraManagers([]);
    setFormOpen(true);
  };

  const validateStep = (step: FormStep): boolean => {
    let result: z.SafeParseReturnType<any, any>;
    if (step === "personal") {
      result = personalStepSchema.safeParse(form);
    } else if (step === "job") {
      result = jobStepSchema.safeParse({
        ...form,
        department_id: form.department_id || undefined,
        reporting_manager_id: form.reporting_manager_id || undefined,
        employment_type: form.employment_type || undefined,
      });
    } else if (step === "pay") {
      result = payStepSchema.safeParse(form);
    } else if (step === "emergency") {
      result = emergencyStepSchema.safeParse(form);
    } else {
      result = employeeFormSchema.safeParse({
        ...form,
        department_id: form.department_id || undefined,
        reporting_manager_id: form.reporting_manager_id || undefined,
        employment_type: form.employment_type || undefined,
      });
    }
    if (!result.success) {
      const map = zodErrorsToMap(result.error);
      setFormErrors(map);
      setSubmitError(firstZodError(result.error));
      toast({
        variant: "destructive",
        title: "Please fix the form",
        description: firstZodError(result.error),
      });
      // Jump to the step that owns the first invalid field
      const firstKey = Object.keys(map)[0];
      if (firstKey === "name" || firstKey === "email" || firstKey === "personal_email") {
        setFormStep("personal");
      } else if (
        firstKey === "employee_type_id" ||
        firstKey === "join_date" ||
        firstKey === "department_id" ||
        firstKey === "reporting_manager_id" ||
        firstKey === "employment_type"
      ) {
        setFormStep("job");
      } else if (
        firstKey === "monthly_salary" ||
        firstKey === "commission_rate" ||
        firstKey === "bank_name" ||
        firstKey === "account_title" ||
        firstKey === "account_number" ||
        firstKey === "iban"
      ) {
        setFormStep("pay");
      } else if (firstKey === "emergency_name" || firstKey === "emergency_phone") {
        setFormStep("emergency");
      }
      return false;
    }
    setFormErrors({});
    setSubmitError("");
    return true;
  };

  const goNext = () => {
    const idx = FORM_STEPS.indexOf(formStep);
    if (formStep !== "review" && !validateStep(formStep)) return;
    if (idx < FORM_STEPS.length - 1) setFormStep(FORM_STEPS[idx + 1]!);
  };

  const goBack = () => {
    const idx = FORM_STEPS.indexOf(formStep);
    if (idx > 0) setFormStep(FORM_STEPS[idx - 1]!);
  };

  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      email: form.email.trim(),
      employee_type_id: form.employee_type_id,
      join_date: toUtcMidnightIso(form.join_date || new Date()),
    };
    if (form.phone_number.trim()) payload.phone_number = form.phone_number.trim();
    if (form.personal_email.trim())
      payload.personal_email = form.personal_email.trim();
    if (form.gender.trim()) payload.gender = form.gender.trim();
    if (form.cnic.trim()) payload.cnic = form.cnic.trim();
    if (form.address.trim()) payload.address = form.address.trim();
    if (form.date_of_birth)
      payload.date_of_birth = toUtcMidnightIso(form.date_of_birth);
    if (form.department_id) payload.department_id = form.department_id;
    if (form.employment_type) payload.employment_type = form.employment_type;
    if (form.reporting_manager_id) {
      payload.reporting_manager_id = form.reporting_manager_id;
    }
    if (form.emergency_name.trim())
      payload.emergency_name = form.emergency_name.trim();
    if (form.emergency_phone.trim()) {
      payload.emergency_phone = form.emergency_phone.trim();
    }
    if (form.monthly_salary.trim() !== "") {
      payload.monthly_salary = Number(form.monthly_salary);
    } else if (editing) {
      payload.monthly_salary = 0;
    }
    if (form.commission_rate.trim() !== "") {
      payload.commission_rate = Number(form.commission_rate);
    } else if (editing) {
      payload.commission_rate = 0;
    }
    payload.bank_name = form.bank_name.trim() || null;
    payload.account_title = form.account_title.trim() || null;
    payload.account_number = form.account_number.trim() || null;
    payload.iban = form.iban.trim() || null;
    if (editing) payload.status = form.status;
    return payload;
  };

  const submitForm = () => {
    if (!validateStep("review")) return;
    setSubmitError("");
    const payload = buildPayload();
    const onError = (err: unknown) => {
      const message = extractApiError(err, "Server rejected the request.");
      const fieldErrors = extractApiFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setFormErrors((prev) => ({ ...prev, ...fieldErrors }));
        if (fieldErrors.name || fieldErrors.email || fieldErrors.personal_email) {
          setFormStep("personal");
        } else if (
          fieldErrors.employee_type_id ||
          fieldErrors.join_date ||
          fieldErrors.department_id ||
          fieldErrors.reporting_manager_id
        ) {
          setFormStep("job");
        } else if (
          fieldErrors.monthly_salary ||
          fieldErrors.commission_rate ||
          fieldErrors.bank_name ||
          fieldErrors.account_title ||
          fieldErrors.account_number ||
          fieldErrors.iban
        ) {
          setFormStep("pay");
        }
      }
      setSubmitError(message);
      toast({
        variant: "destructive",
        title: editing ? "Failed to update employee" : "Failed to add employee",
        description: message,
      });
    };

    if (editing) {
      employeeMutations.update.mutate(
        { id: editing.id, body: payload },
        {
          onSuccess: () => {
            toast({
              title: "Employee updated",
              description: `${form.name.trim()} has been updated.`,
            });
            setSubmitError("");
            setFormOpen(false);
            setEditing(null);
            setForm(emptyForm());
          },
          onError,
        },
      );
    } else {
      employeeMutations.create.mutate(payload, {
        onSuccess: () => {
          toast({
            title: "Employee added",
            description: `${form.name.trim()} has been added.`,
          });
          setSubmitError("");
          setFormOpen(false);
          setForm(emptyForm());
        },
        onError,
      });
    }
  };

  const handleAddDesignation = async () => {
    const name = newDesignation.trim();
    if (name.length < 2) {
      toast({ variant: "destructive", title: "Enter a designation name" });
      return;
    }
    try {
      const created = (await employeeTypeMutations.create.mutateAsync({
        name,
      })) as NamedEntity;
      if (created?.id) {
        setField({ employee_type_id: created.id });
        clearError("employee_type_id");
      }
      setNewDesignation("");
      toast({ title: "Designation added" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to add designation",
        description: extractApiError(err, "Could not create designation."),
      });
    }
  };

  const handleAddDepartment = async () => {
    const name = newDepartment.trim();
    if (name.length < 2) {
      toast({ variant: "destructive", title: "Enter a department name" });
      return;
    }
    try {
      const created = (await employeeMutations.createDepartment.mutateAsync(
        name,
      )) as NamedEntity;
      if (created?.id) setField({ department_id: created.id });
      setNewDepartment("");
      toast({ title: "Department added" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to add department",
        description: extractApiError(err, "Could not create department."),
      });
    }
  };

  const handleAddManager = async () => {
    const name = newManager.trim();
    if (name.length < 2) {
      toast({ variant: "destructive", title: "Enter a manager name" });
      return;
    }
    const typeId = form.employee_type_id || employeeTypes[0]?.id;
    if (!typeId) {
      toast({
        variant: "destructive",
        title: "Add a designation first",
        description: "A designation is required before creating a manager.",
      });
      return;
    }
    setAddingManager(true);
    try {
      const created = (await employeeMutations.create.mutateAsync({
        name,
        join_date: toUtcMidnightIso(new Date()),
        employee_type_id: typeId,
        department_id: form.department_id || undefined,
        employment_type: "FULL_TIME",
        status: "ACTIVE",
      })) as Employee;
      const createdId = created?.id;
      if (!createdId) {
        throw new Error("Manager was created but no id was returned");
      }
      const managerRow: Employee = {
        ...created,
        id: createdId,
        name: created.name || name,
        employee_code: created.employee_code ?? null,
      };
      setExtraManagers((prev) =>
        prev.some((m) => m.id === createdId) ? prev : [managerRow, ...prev],
      );
      setField({ reporting_manager_id: createdId });
      setNewManager("");
      await refetchManagers();
      toast({
        title: "Reporting manager added",
        description: `${name} was created and selected.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to add manager",
        description: extractApiError(err, "Could not create reporting manager."),
      });
    } finally {
      setAddingManager(false);
    }
  };

  /* ---------- detail / actions ---------- */

  const openDetail = (emp: Employee, tab: DetailTab = "overview") => {
    setDetailRow(emp);
    setDetailId(emp.id);
    setDetailTab(tab);
    setSalaryFilterPaid("all");
    setSalaryFilterMonth("all");
    setSalaryFilterYear("all");
    setSalaryPaidFrom("");
    setSalaryPaidTo("");
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailId(null);
    setDetailRow(null);
  };

  const confirmDeactivate = () => {
    if (!deactivateTarget) return;
    if (!deactivateReason.trim()) {
      toast({ variant: "destructive", title: "Reason is required" });
      return;
    }
    employeeMutations.deactivate.mutate(
      {
        id: deactivateTarget.id,
        reason: deactivateReason.trim(),
        status: deactivateStatus,
      },
      {
        onSuccess: () => {
          toast({ title: "Employee deactivated" });
          setDeactivateTarget(null);
          setDeactivateReason("");
        },
        onError: (err) =>
          toast({
            variant: "destructive",
            title: "Failed to deactivate",
            description: extractApiError(err, "Could not deactivate employee."),
          }),
      },
    );
  };

  const confirmReactivate = () => {
    if (!reactivateTarget) return;
    employeeMutations.reactivate.mutate(reactivateTarget.id, {
      onSuccess: () => {
        toast({ title: "Employee reactivated" });
        setReactivateTarget(null);
      },
      onError: (err) =>
        toast({
          variant: "destructive",
          title: "Failed to reactivate",
          description: extractApiError(err, "Could not reactivate employee."),
        }),
    });
  };

  const assignShift = () => {
    if (!current) return;
    if (!shiftTime.trim()) {
      toast({ variant: "destructive", title: "Shift time is required" });
      return;
    }
    if (!shiftStart) {
      toast({ variant: "destructive", title: "Start date is required" });
      return;
    }
    const body: Record<string, unknown> = {
      employee_id: current.id,
      shift_time: shiftTime.trim(),
      start_date: toUtcMidnightIso(shiftStart),
    };
    if (shiftBreak.trim()) body.break_time = shiftBreak.trim();
    shiftMutations.create.mutate(body, {
      onSuccess: () => {
        toast({ title: "Shift assigned" });
        setShiftTime("09:00-17:00");
        setShiftBreak("1 hour");
        shiftHistoryQuery.refetch();
      },
      onError: (err) =>
        toast({
          variant: "destructive",
          title: "Failed to assign shift",
          description: extractApiError(err, "Could not assign shift."),
        }),
    });
  };

  const endCurrentShift = () => {
    if (!current) return;
    employeeMutations.endCurrentShift.mutate(current.id, {
      onSuccess: () => {
        toast({ title: "Current shift ended" });
        shiftHistoryQuery.refetch();
      },
      onError: (err) =>
        toast({
          variant: "destructive",
          title: "Failed to end shift",
          description: extractApiError(err, "Could not end current shift."),
        }),
    });
  };

  const createSalary = () => {
    if (!current) return;
    const month = Number(salaryMonth);
    const year = Number(salaryYear);
    const amount =
      Number(salaryAmount) || Number(current.monthly_salary) || 0;
    if (!month || month < 1 || month > 12) {
      toast({ variant: "destructive", title: "Select a valid month" });
      return;
    }
    if (!year || year < 2020) {
      toast({ variant: "destructive", title: "Enter a valid year" });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        variant: "destructive",
        title: "Set monthly salary first",
        description:
          "Add a fixed monthly salary on the employee profile (Pay & account step).",
      });
      return;
    }
    salaryMutations.create.mutate(
      {
        employee_id: current.id,
        month,
        year,
        amount,
        notes: salaryNotes.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast({ title: "Salary record created" });
          setSalaryNotes("");
          if (Number(current.monthly_salary) > 0) {
            setSalaryAmount(String(current.monthly_salary));
          }
          salariesQuery.refetch();
        },
        onError: (err) =>
          toast({
            variant: "destructive",
            title: "Failed to create salary",
            description: extractApiError(err, "Could not create salary record."),
          }),
      },
    );
  };

  const markSalaryPaid = (row: SalaryRow) => {
    setMarkingPaidId(row.id);
    salaryMutations.update.mutate(
      {
        id: row.id,
        body: { is_paid: true, paid_date: new Date().toISOString() },
      },
      {
        onSuccess: () => {
          toast({ title: "Marked as paid" });
          salariesQuery.refetch();
        },
        onError: (err) =>
          toast({
            variant: "destructive",
            title: "Failed to mark paid",
            description: extractApiError(err, "Could not update salary."),
          }),
        onSettled: () => setMarkingPaidId(null),
      },
    );
  };

  /* ---------- import / export ---------- */

  const mapImportRow = (
    row: Record<string, any>,
  ): Record<string, unknown> | null => {
    const name = cell(row, "name", "full_name", "employee_name");
    if (!name || name.length < 2) return null;

    const departmentName = cell(row, "department", "department_name");
    const typeName = cell(
      row,
      "employee_type",
      "designation",
      "employee_type_name",
      "type",
    );
    const employmentRaw = cell(row, "employment_type", "employment")
      .toUpperCase()
      .replace(/[\s-]+/g, "_");

    const department_id = departmentName
      ? departments.find(
          (d) => d.name.toLowerCase() === departmentName.toLowerCase(),
        )?.id
      : cell(row, "department_id") || undefined;

    const employee_type_id = typeName
      ? employeeTypes.find(
          (t) => t.name.toLowerCase() === typeName.toLowerCase(),
        )?.id
      : cell(row, "employee_type_id") || undefined;

    const employment_type = (
      ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"] as EmploymentType[]
    ).includes(employmentRaw as EmploymentType)
      ? (employmentRaw as EmploymentType)
      : undefined;

    const joinRaw = cell(row, "join_date", "joindate", "date_joined");
    const payload: Record<string, unknown> = {
      name,
      email: cell(row, "email", "work_email") || undefined,
      phone_number: cell(row, "phone_number", "phone", "mobile") || undefined,
      cnic: cell(row, "cnic", "national_id") || undefined,
      gender: cell(row, "gender") || undefined,
      join_date: parseJoinDateFlexible(joinRaw),
    };
    if (department_id) payload.department_id = department_id;
    if (employee_type_id) payload.employee_type_id = employee_type_id;
    if (employment_type) payload.employment_type = employment_type;
    return payload;
  };

  const handleImportRow = async (
    row: Record<string, any>,
  ): Promise<{ ok: boolean; error?: string }> => {
    const mapped = mapImportRow(row);
    if (!mapped) {
      return { ok: false, error: "Name is required (min 2 characters)" };
    }
    try {
      await importEmployees({ rows: [mapped] });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: extractApiError(err, "Import failed") };
    }
  };

  const downloadImportTemplate = () => {
    downloadExcel(
      "employee-import-template.xlsx",
      "Employees",
      [
        "name",
        "email",
        "phone_number",
        "cnic",
        "gender",
        "department",
        "employee_type",
        "employment_type",
        "join_date",
      ],
      [
        [
          "Ali Khan",
          "ali@example.com",
          "03001234567",
          "42101-1234567-1",
          "Male",
          "Sales",
          "Cashier",
          "FULL_TIME",
          "2024-01-15",
        ],
      ],
    );
  };

  const handleExport = () => {
    if (sorted.length === 0) {
      toast({ variant: "destructive", title: "Nothing to export" });
      return;
    }
    downloadExcel(
      `employees-${format(new Date(), "yyyy-MM-dd")}.xlsx`,
      "Employees",
      [
        "code",
        "name",
        "email",
        "phone",
        "designation",
        "department",
        "status",
        "employment_type",
        "join_date",
      ],
      sorted.map((e) => [
        e.employee_code || "",
        e.name || "",
        e.email || "",
        e.phone_number || "",
        e.employee_type?.name || "",
        e.department?.name || "",
        e.status || "",
        e.employment_type || "",
        formatDisplayDate(e.join_date) === "—"
          ? ""
          : formatDisplayDate(e.join_date),
      ]),
    );
    toast({ title: `Exported ${sorted.length} employees` });
  };

  const managerOptions = useMemo(() => {
    const byId = new Map<string, Employee>();
    for (const emp of [...extraManagers, ...managerPool, ...list]) {
      if (!emp?.id) continue;
      if (editing && emp.id === editing.id) continue;
      if (!byId.has(emp.id)) byId.set(emp.id, emp);
    }
    return Array.from(byId.values()).sort((a, b) =>
      (a.name || "").localeCompare(b.name || ""),
    );
  }, [extraManagers, managerPool, list, editing]);

  const typeNameById = (id?: string | null) =>
    employeeTypes.find((t) => t.id === id)?.name || "—";
  const deptNameById = (id?: string | null) =>
    departments.find((d) => d.id === id)?.name || "—";
  const managerNameById = (id?: string | null) =>
    managerOptions.find((e) => e.id === id)?.name ||
    list.find((e) => e.id === id)?.name ||
    "—";

  /* ---------- render ---------- */

  return (
    <>
      <PageHeader
        title="Employees"
        description="Manage your roster, shift assignments, and salary records"
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              Import Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-1.5 h-4 w-4" />
              Export
            </Button>
            <Button size="sm" onClick={openAdd}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add employee
            </Button>
          </>
        }
      />

      <PageBody className="space-y-5">
        <InventoryKpiGrid
          columns={4}
          loading={statsLoading}
          items={[
            {
              label: "Total",
              value: stats.total.toLocaleString(),
              icon: Users,
              hint: "All employees",
              onClick: () => {
                setStatusFilter("all");
                setPage(1);
              },
            },
            {
              label: "Active",
              value: stats.active.toLocaleString(),
              icon: CheckCircle2,
              tone: "success",
              hint: "Currently on roster",
              onClick: () => {
                setStatusFilter("ACTIVE");
                setPage(1);
              },
            },
            {
              label: "Inactive",
              value: stats.inactive.toLocaleString(),
              icon: XCircle,
              tone: "danger",
              hint: "Deactivated staff",
              onClick: () => {
                setStatusFilter("INACTIVE");
                setPage(1);
              },
            },
            {
              label: "On leave",
              value: stats.onLeave.toLocaleString(),
              icon: CalendarOff,
              tone: "warning",
              hint: "Temporarily away",
              onClick: () => {
                setStatusFilter("ON_LEAVE");
                setPage(1);
              },
            },
          ]}
        />

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </p>
              <div className="flex flex-wrap gap-2">
                {statusChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => {
                      setStatusFilter(chip.key);
                      setPage(1);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      statusFilter === chip.key
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
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Search employees
                  </Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      name="employee_directory_search"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-form-type="other"
                      placeholder="Name, code, email, or phone…"
                      value={search}
                      disabled={formOpen}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                      className="h-9 pl-9"
                    />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {hasFilters ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={clearFilters}
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" />
                      Clear filters
                    </Button>
                  ) : null}
                  <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={viewMode === "table" ? "secondary" : "ghost"}
                      className="h-8 px-2.5"
                      onClick={() => setViewMode("table")}
                      title="Table view"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={viewMode === "grid" ? "secondary" : "ghost"}
                      className="h-8 px-2.5"
                      onClick={() => setViewMode("grid")}
                      title="Grid view"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Narrow list
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Department
                  </Label>
                  <Select
                    value={departmentFilter}
                    onValueChange={(v) => {
                      setDepartmentFilter(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All departments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All departments</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Designation
                  </Label>
                  <Select
                    value={typeFilter}
                    onValueChange={(v) => {
                      setTypeFilter(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All designations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All designations</SelectItem>
                      {employeeTypes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Employment type
                  </Label>
                  <Select
                    value={employmentFilter}
                    onValueChange={(v) => {
                      setEmploymentFilter(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All employment types</SelectItem>
                      {EMPLOYMENT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Sort by
                  </Label>
                  <Select
                    value={sortKey}
                    onValueChange={(v) => setSortKey(v as SortKey)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="join_date">Join date</SelectItem>
                      <SelectItem value="status">Status</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">
                Employee list{" "}
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
            ) : sorted.length === 0 ? (
              <div className="m-4 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12">
                <Users className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No employees found</p>
                <p className="text-xs text-muted-foreground">
                  Try clearing filters or add a new employee.
                </p>
              </div>
            ) : viewMode === "table" ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[220px] text-xs uppercase tracking-wide">Employee</TableHead>
                      <TableHead className="min-w-[120px] text-xs uppercase tracking-wide">Designation</TableHead>
                      <TableHead className="min-w-[120px] text-xs uppercase tracking-wide">Department</TableHead>
                      <TableHead className="min-w-[110px] text-xs uppercase tracking-wide">Employment</TableHead>
                      <TableHead className="min-w-[110px] text-xs uppercase tracking-wide">Join date</TableHead>
                      <TableHead className="min-w-[100px] text-xs uppercase tracking-wide">Status</TableHead>
                      <TableHead className="min-w-[320px] text-right text-xs uppercase tracking-wide">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((emp) => (
                      <TableRow key={emp.id} className="h-11 hover:bg-muted/50">
                        <TableCell>
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar className="h-9 w-9 shrink-0">
                              <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
                                {initials(emp.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">
                                {emp.name}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {emp.employee_code || "—"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-foreground">
                          {emp.employee_type?.name || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-foreground">
                          {emp.department?.name || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-foreground">
                          {employmentLabel(emp.employment_type)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground nums">
                          {formatDisplayDate(emp.join_date)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={statusBadgeClass(emp.status)}
                          >
                            {statusLabel(emp.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => openDetail(emp, "overview")}
                            >
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => openEdit(emp)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => openDetail(emp, "shifts")}
                            >
                              Shifts
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => openDetail(emp, "salary")}
                            >
                              Salary
                            </Button>
                            {emp.status === "ACTIVE" ||
                            emp.status === "ON_LEAVE" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2.5 text-xs text-destructive hover:text-destructive"
                                onClick={() => {
                                  setDeactivateTarget(emp);
                                  setDeactivateReason("");
                                  setDeactivateStatus("INACTIVE");
                                }}
                              >
                                Deactivate
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2.5 text-xs text-green-700 hover:text-green-800"
                                onClick={() => setReactivateTarget(emp)}
                              >
                                Reactivate
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {pageRows.map((emp) => (
                  <div
                    key={emp.id}
                    className="space-y-3 rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
                            {initials(emp.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">
                            {emp.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {emp.employee_code || "—"}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(statusBadgeClass(emp.status), "shrink-0")}
                      >
                        {statusLabel(emp.status)}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>Designation: {emp.employee_type?.name || "—"}</p>
                      <p>Department: {emp.department?.name || "—"}</p>
                      <p>Joined: {formatDisplayDate(emp.join_date)}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openDetail(emp, "overview")}
                      >
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openEdit(emp)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openDetail(emp, "shifts")}
                      >
                        Shifts
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openDetail(emp, "salary")}
                      >
                        Salary
                      </Button>
                      {emp.status === "ACTIVE" || emp.status === "ON_LEAVE" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs text-destructive hover:text-destructive"
                          onClick={() => {
                            setDeactivateTarget(emp);
                            setDeactivateReason("");
                            setDeactivateStatus("INACTIVE");
                          }}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs text-green-700 hover:text-green-800"
                          onClick={() => setReactivateTarget(emp)}
                        >
                          Reactivate
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
                  Showing {(pageSafe - 1) * PAGE_SIZE + 1}–
                  {Math.min(pageSafe * PAGE_SIZE, listMeta.total)} of{" "}
                  {listMeta.total}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground nums">
                    {pageSafe} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
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

      {/* Add / Edit — multi-step form, > 6 fields, so a DetailSheet with the
          form in the body (guide §2). */}
      <DetailSheet
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false);
            setEditing(null);
            setFormErrors({});
            setFormStep("personal");
          }
        }}
        size="lg"
      >
        <DetailSheetHeader
          title={editing ? "Edit employee" : "Add employee"}
          subtitle={`Step ${FORM_STEPS.indexOf(formStep) + 1} of ${
            FORM_STEPS.length
          }: ${
            formStep === "personal"
              ? "Personal"
              : formStep === "job"
                ? "Job"
                : formStep === "pay"
                  ? "Pay & account"
                  : formStep === "emergency"
                    ? "Emergency"
                    : "Review"
          }`}
          icon={<Users className="h-5 w-5" />}
        >
          <div className="flex gap-1 pb-3">
            {FORM_STEPS.map((s) => (
              <div
                key={s}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  FORM_STEPS.indexOf(s) <= FORM_STEPS.indexOf(formStep)
                    ? "bg-primary"
                    : "bg-muted",
                )}
              />
            ))}
          </div>
        </DetailSheetHeader>

        <DetailSheetBody className="space-y-3">
          {submitError ? (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              <p className="font-semibold">Could not save employee</p>
              <p className="mt-0.5 text-red-700">{submitError}</p>
            </div>
          ) : null}
          <form
            autoComplete="off"
            onSubmit={(e) => e.preventDefault()}
            className="space-y-3"
          >
          {formStep === "personal" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>
                    Full name<span className="text-destructive">*</span>
                  </Label>
                  <Input
                    name="employee_full_name"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    value={form.name}
                    onChange={(e) => {
                      setField({ name: e.target.value });
                      clearError("name");
                    }}
                    className={cn(
                      fieldControlClass,
                      formErrors.name && "border-destructive",
                    )}
                    placeholder="Enter full name"
                    disabled={submitting}
                  />
                  <FieldError message={formErrors.name} />
                </div>
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>
                    Email<span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="email"
                    name="employee_work_email"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    value={form.email}
                    onChange={(e) => {
                      setField({ email: e.target.value });
                      clearError("email");
                    }}
                    className={cn(
                      fieldControlClass,
                      formErrors.email && "border-destructive",
                    )}
                    placeholder="work@email.com"
                    disabled={submitting}
                  />
                  <FieldError message={formErrors.email} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>Phone</Label>
                  <Input
                    name="employee_phone"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    value={form.phone_number}
                    onChange={(e) => setField({ phone_number: e.target.value })}
                    className={fieldControlClass}
                    placeholder="Phone number"
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>Personal email</Label>
                  <Input
                    type="email"
                    name="employee_personal_email"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    value={form.personal_email}
                    onChange={(e) => {
                      setField({ personal_email: e.target.value });
                      clearError("personal_email");
                    }}
                    className={cn(
                      fieldControlClass,
                      formErrors.personal_email && "border-destructive",
                    )}
                    placeholder="personal@email.com"
                    disabled={submitting}
                  />
                  <FieldError message={formErrors.personal_email} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>Gender</Label>
                  <Select
                    value={form.gender || undefined}
                    onValueChange={(v) => setField({ gender: v })}
                    disabled={submitting}
                  >
                    <SelectTrigger className={fieldControlClass}>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>CNIC</Label>
                  <Input
                    value={form.cnic}
                    onChange={(e) => setField({ cnic: e.target.value })}
                    className={fieldControlClass}
                    placeholder="National ID"
                    disabled={submitting}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>Date of birth</Label>
                  <DatePickerField
                    value={form.date_of_birth}
                    onChange={(d) => setField({ date_of_birth: d })}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>Address</Label>
                  <Input
                    value={form.address}
                    onChange={(e) => setField({ address: e.target.value })}
                    className={fieldControlClass}
                    placeholder="Address"
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>
          )}

          {formStep === "job" && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className={fieldLabelClass}>
                  Designation<span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.employee_type_id || undefined}
                  onValueChange={(v) => {
                    setField({ employee_type_id: v });
                    clearError("employee_type_id");
                  }}
                  disabled={submitting}
                >
                  <SelectTrigger
                    className={cn(
                      fieldControlClass,
                      formErrors.employee_type_id && "border-destructive",
                    )}
                  >
                    <SelectValue placeholder="Select designation" />
                  </SelectTrigger>
                  <SelectContent>
                    {employeeTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={formErrors.employee_type_id} />
                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Or add new:
                  </span>
                  <Input
                    value={newDesignation}
                    onChange={(e) => setNewDesignation(e.target.value)}
                    placeholder="e.g. Cashier"
                    disabled={submitting || addingDesignation}
                    className={cn(fieldControlClass, "flex-1")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 shrink-0 px-3 text-xs"
                    onClick={handleAddDesignation}
                    disabled={submitting || addingDesignation}
                  >
                    {addingDesignation ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Add"
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className={fieldLabelClass}>Department</Label>
                <Select
                  value={form.department_id || undefined}
                  onValueChange={(v) => setField({ department_id: v })}
                  disabled={submitting}
                >
                  <SelectTrigger className={fieldControlClass}>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Or add new:
                  </span>
                  <Input
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
                    placeholder="e.g. Sales"
                    disabled={submitting || addingDepartment}
                    className={cn(fieldControlClass, "flex-1")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 shrink-0 px-3 text-xs"
                    onClick={handleAddDepartment}
                    disabled={submitting || addingDepartment}
                  >
                    {addingDepartment ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Add"
                    )}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>Employment type</Label>
                  <Select
                    value={form.employment_type || undefined}
                    onValueChange={(v) =>
                      setField({ employment_type: v as EmploymentType })
                    }
                    disabled={submitting}
                  >
                    <SelectTrigger className={fieldControlClass}>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>
                    Join date<span className="text-destructive">*</span>
                  </Label>
                  <DatePickerField
                    value={form.join_date}
                    onChange={(d) => {
                      setField({ join_date: d });
                      clearError("join_date");
                    }}
                    disabled={submitting}
                    error={formErrors.join_date}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>Reporting manager</Label>
                  <Select
                    value={form.reporting_manager_id || undefined}
                    onValueChange={(v) => setField({ reporting_manager_id: v })}
                    disabled={submitting || addingManager}
                  >
                    <SelectTrigger className={fieldControlClass}>
                      <SelectValue placeholder="Select manager" />
                    </SelectTrigger>
                    <SelectContent>
                      {managerOptions.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                          {m.employee_code ? ` (${m.employee_code})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Or add new:
                    </span>
                    <Input
                      value={newManager}
                      onChange={(e) => setNewManager(e.target.value)}
                      placeholder="e.g. Manager name"
                      disabled={submitting || addingManager}
                      className={cn(fieldControlClass, "flex-1")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAddManager();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 shrink-0 px-3 text-xs"
                      onClick={handleAddManager}
                      disabled={submitting || addingManager}
                    >
                      {addingManager ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Add"
                      )}
                    </Button>
                  </div>
                </div>
                {editing && (
                  <div className="space-y-1">
                    <Label className={fieldLabelClass}>Status</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v) =>
                        setField({ status: v as EmployeeStatus })
                      }
                      disabled={submitting}
                    >
                      <SelectTrigger className={fieldControlClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          )}

          {formStep === "pay" && (
            <div className="space-y-4">
              <div className="space-y-3 rounded-lg border border-border p-4">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" />
                  Compensation
                </h3>
                <p className="text-xs text-muted-foreground">
                  Set a fixed monthly salary. Commission is calculated separately
                  and added on top when paying.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className={fieldLabelClass}>Monthly salary</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.monthly_salary}
                      onChange={(e) => {
                        setField({ monthly_salary: e.target.value });
                        clearError("monthly_salary");
                      }}
                      className={cn(fieldControlClass, "nums")}
                      placeholder="e.g. 50000"
                      disabled={submitting}
                    />
                    {formErrors.monthly_salary ? (
                      <p className="text-xs text-destructive">
                        {formErrors.monthly_salary}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <Label className={fieldLabelClass}>
                      Commission rate (%)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={form.commission_rate}
                      onChange={(e) => {
                        setField({ commission_rate: e.target.value });
                        clearError("commission_rate");
                      }}
                      className={cn(fieldControlClass, "nums")}
                      placeholder="e.g. 2.5"
                      disabled={submitting}
                    />
                    {formErrors.commission_rate ? (
                      <p className="text-xs text-destructive">
                        {formErrors.commission_rate}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Addon on top of fixed salary from sales
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border p-4">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <CreditCard className="h-3.5 w-3.5" />
                  Account details
                  <span className="font-normal normal-case tracking-normal text-muted-foreground/80">
                    (optional)
                  </span>
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className={fieldLabelClass}>Bank name</Label>
                    <Input
                      value={form.bank_name}
                      onChange={(e) => setField({ bank_name: e.target.value })}
                      className={fieldControlClass}
                      placeholder="e.g. HBL"
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className={fieldLabelClass}>Account title</Label>
                    <Input
                      value={form.account_title}
                      onChange={(e) =>
                        setField({ account_title: e.target.value })
                      }
                      className={fieldControlClass}
                      placeholder="Account holder name"
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className={fieldLabelClass}>Account number</Label>
                    <Input
                      value={form.account_number}
                      onChange={(e) =>
                        setField({ account_number: e.target.value })
                      }
                      className={fieldControlClass}
                      placeholder="Account number"
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className={fieldLabelClass}>IBAN</Label>
                    <Input
                      value={form.iban}
                      onChange={(e) => setField({ iban: e.target.value })}
                      className={fieldControlClass}
                      placeholder="PK00XXXX..."
                      disabled={submitting}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {formStep === "emergency" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className={fieldLabelClass}>Emergency contact name</Label>
                <Input
                  value={form.emergency_name}
                  onChange={(e) => setField({ emergency_name: e.target.value })}
                  className={fieldControlClass}
                  placeholder="Contact name"
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1">
                <Label className={fieldLabelClass}>Emergency phone</Label>
                <Input
                  value={form.emergency_phone}
                  onChange={(e) => setField({ emergency_phone: e.target.value })}
                  className={fieldControlClass}
                  placeholder="Contact phone"
                  disabled={submitting}
                />
              </div>
            </div>
          )}

          {formStep === "review" && (
            <div className="space-y-3 rounded-lg border border-border p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Review details
              </p>
              <ReadOnlyRow label="Name" value={form.name} />
              <ReadOnlyRow label="Email" value={form.email} />
              <ReadOnlyRow label="Phone" value={form.phone_number || "—"} />
              <ReadOnlyRow
                label="Designation"
                value={typeNameById(form.employee_type_id)}
              />
              <ReadOnlyRow
                label="Department"
                value={deptNameById(form.department_id)}
              />
              <ReadOnlyRow
                label="Employment"
                value={employmentLabel(form.employment_type || null)}
              />
              <ReadOnlyRow
                label="Join date"
                value={
                  form.join_date ? format(form.join_date, "MMM d, yyyy") : "—"
                }
              />
              <ReadOnlyRow
                label="Manager"
                value={managerNameById(form.reporting_manager_id)}
              />
              <ReadOnlyRow
                label="Monthly salary"
                value={
                  form.monthly_salary.trim()
                    ? formatMoney(Number(form.monthly_salary))
                    : "—"
                }
              />
              <ReadOnlyRow
                label="Commission rate"
                value={
                  form.commission_rate.trim()
                    ? `${form.commission_rate}%`
                    : "—"
                }
              />
              <ReadOnlyRow
                label="Bank account"
                value={
                  form.account_number.trim() || form.iban.trim()
                    ? [form.bank_name, form.account_title, form.account_number || form.iban]
                        .filter(Boolean)
                        .join(" · ")
                    : "—"
                }
              />
              <ReadOnlyRow label="Emergency" value={form.emergency_name || "—"} />
              {editing && (
                <ReadOnlyRow label="Status" value={statusLabel(form.status)} />
              )}
            </div>
          )}
          </form>
        </DetailSheetBody>

        <DetailSheetFooter>
          {submitError ? (
            <p className="mr-auto max-w-[220px] text-xs text-destructive sm:max-w-xs">
              {submitError}
            </p>
          ) : null}
          {formStep !== "personal" && (
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              disabled={submitting}
            >
              Back
            </Button>
          )}
          {formStep !== "review" ? (
            <Button type="button" onClick={goNext} disabled={submitting}>
              Continue
            </Button>
          ) : (
            <LoadingButton loading={submitting} onClick={submitForm}>
              {editing ? "Update employee" : "Create employee"}
            </LoadingButton>
          )}
        </DetailSheetFooter>
      </DetailSheet>

      {/* Employee detail — DetailSheet with tabs (guide §2). */}
      <DetailSheet
        open={detailOpen}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
        size="xl"
      >
        <DetailSheetHeader
          title={current?.name || "Employee"}
          subtitle={
            current ? (
              <span className="flex flex-wrap items-center gap-2">
                <span>{current.employee_code || "No code"}</span>
                <Badge
                  variant="outline"
                  className={statusBadgeClass(current.status)}
                >
                  {statusLabel(current.status)}
                </Badge>
                {current.employee_type?.name && (
                  <span className="inline-flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    {current.employee_type.name}
                  </span>
                )}
              </span>
            ) : undefined
          }
          icon={<User className="h-5 w-5" />}
          actions={
            current ? (
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => openEdit(current)}
                >
                  Edit
                </Button>
                {current.status === "ACTIVE" || current.status === "ON_LEAVE" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-destructive hover:text-destructive"
                    onClick={() => {
                      setDeactivateTarget(current);
                      setDeactivateReason("");
                      setDeactivateStatus("INACTIVE");
                    }}
                  >
                    Deactivate
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-green-700 hover:text-green-800"
                    onClick={() => setReactivateTarget(current)}
                  >
                    Reactivate
                  </Button>
                )}
              </div>
            ) : undefined
          }
        >
          <Tabs
            value={detailTab}
            onValueChange={(v) => setDetailTab(v as DetailTab)}
          >
            <TabsList className="h-9 w-full justify-start gap-4 overflow-x-auto rounded-none border-0 bg-transparent p-0">
              {(
                [
                  { key: "overview", label: "Overview" },
                  { key: "job", label: "Job" },
                  { key: "personal", label: "Personal" },
                  { key: "shifts", label: "Shifts" },
                  { key: "salary", label: "Salary" },
                  { key: "history", label: "History" },
                ] as const
              ).map((t) => (
                <TabsTrigger
                  key={t.key}
                  value={t.key}
                  className="rounded-none border-b-2 border-transparent bg-transparent px-0 pb-2 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </DetailSheetHeader>

        <DetailSheetBody className="space-y-4">
          {detailLoading || !current ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              {detailTab === "overview" && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <User className="h-3.5 w-3.5" />
                      Identity
                    </h3>
                    <ReadOnlyRow label="Name" value={current.name} />
                    <ReadOnlyRow
                      label="Code"
                      value={current.employee_code || "—"}
                    />
                    <ReadOnlyRow label="Email" value={current.email || "—"} />
                    <ReadOnlyRow
                      label="Phone"
                      value={current.phone_number || "—"}
                    />
                  </div>
                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Briefcase className="h-3.5 w-3.5" />
                      Role
                    </h3>
                    <ReadOnlyRow
                      label="Status"
                      value={
                        <Badge
                          variant="outline"
                          className={statusBadgeClass(current.status)}
                        >
                          {statusLabel(current.status)}
                        </Badge>
                      }
                    />
                    <ReadOnlyRow
                      label="Department"
                      value={current.department?.name || "—"}
                    />
                    <ReadOnlyRow
                      label="Designation"
                      value={current.employee_type?.name || "—"}
                    />
                    <ReadOnlyRow
                      label="Join date"
                      value={formatDisplayDate(current.join_date)}
                    />
                  </div>
                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Wallet className="h-3.5 w-3.5" />
                      Pay
                    </h3>
                    <ReadOnlyRow
                      label="Monthly salary"
                      value={formatMoney(Number(current.monthly_salary) || 0)}
                    />
                    <ReadOnlyRow
                      label="Commission rate"
                      value={`${Number(current.commission_rate) || 0}%`}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Commission is an addon on top of fixed salary
                    </p>
                  </div>
                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <CreditCard className="h-3.5 w-3.5" />
                      Account details
                    </h3>
                    <ReadOnlyRow
                      label="Bank"
                      value={current.bank_name || "—"}
                    />
                    <ReadOnlyRow
                      label="Account title"
                      value={current.account_title || "—"}
                    />
                    <ReadOnlyRow
                      label="Account number"
                      value={current.account_number || "—"}
                    />
                    <ReadOnlyRow label="IBAN" value={current.iban || "—"} />
                  </div>
                  {(current.deactivated_reason || current.deactivated_at) && (
                    <div className="space-y-2 rounded-lg border border-red-100 bg-red-50/40 p-4 md:col-span-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-red-700">
                        Deactivation
                      </h3>
                      <ReadOnlyRow
                        label="Deactivated at"
                        value={formatDisplayDate(current.deactivated_at)}
                      />
                      <ReadOnlyRow
                        label="Reason"
                        value={current.deactivated_reason || "—"}
                      />
                    </div>
                  )}
                </div>
              )}

              {detailTab === "job" && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(current)}
                    >
                      Edit
                    </Button>
                  </div>
                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <ReadOnlyRow
                      label="Designation"
                      value={current.employee_type?.name || "—"}
                    />
                    <ReadOnlyRow
                      label="Department"
                      value={current.department?.name || "—"}
                    />
                    <ReadOnlyRow
                      label="Employment type"
                      value={employmentLabel(current.employment_type)}
                    />
                    <ReadOnlyRow
                      label="Join date"
                      value={formatDisplayDate(current.join_date)}
                    />
                    <ReadOnlyRow
                      label="Reporting manager"
                      value={
                        current.reporting_manager
                          ? `${current.reporting_manager.name}${
                              current.reporting_manager.employee_code
                                ? ` (${current.reporting_manager.employee_code})`
                                : ""
                            }`
                          : "—"
                      }
                    />
                    <ReadOnlyRow
                      label="Status"
                      value={statusLabel(current.status)}
                    />
                  </div>
                </div>
              )}

              {detailTab === "personal" && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(current)}
                    >
                      Edit
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-3 rounded-lg border border-border p-4">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />
                        Contact
                      </h3>
                      <ReadOnlyRow label="Email" value={current.email || "—"} />
                      <ReadOnlyRow
                        label="Personal email"
                        value={current.personal_email || "—"}
                      />
                      <ReadOnlyRow
                        label="Phone"
                        value={current.phone_number || "—"}
                      />
                    </div>
                    <div className="space-y-3 rounded-lg border border-border p-4">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <User className="h-3.5 w-3.5" />
                        Profile
                      </h3>
                      <ReadOnlyRow label="Gender" value={current.gender || "—"} />
                      <ReadOnlyRow label="CNIC" value={current.cnic || "—"} />
                      <ReadOnlyRow
                        label="Date of birth"
                        value={formatDisplayDate(current.date_of_birth)}
                      />
                    </div>
                    <div className="space-y-3 rounded-lg border border-border p-4 md:col-span-2">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        Address & emergency
                      </h3>
                      <ReadOnlyRow
                        label="Address"
                        value={current.address || "—"}
                      />
                      <ReadOnlyRow
                        label="Emergency name"
                        value={current.emergency_name || "—"}
                      />
                      <ReadOnlyRow
                        label="Emergency phone"
                        value={current.emergency_phone || "—"}
                      />
                    </div>
                  </div>
                </div>
              )}

              {detailTab === "shifts" && (
                <div className="space-y-4">
                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      Assign shift
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label className={fieldLabelClass}>Shift time</Label>
                        <Input
                          value={shiftTime}
                          onChange={(e) => setShiftTime(e.target.value)}
                          placeholder="09:00-17:00"
                          className={fieldControlClass}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className={fieldLabelClass}>Start date</Label>
                        <DatePickerField
                          value={shiftStart}
                          onChange={setShiftStart}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className={fieldLabelClass}>Break time</Label>
                        <Input
                          value={shiftBreak}
                          onChange={(e) => setShiftBreak(e.target.value)}
                          placeholder="1 hour"
                          className={fieldControlClass}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <LoadingButton
                        loading={shiftSaving}
                        className="h-9 text-sm"
                        onClick={assignShift}
                      >
                        Assign shift
                      </LoadingButton>
                      <LoadingButton
                        loading={endingShift}
                        variant="outline"
                        className="h-9 text-sm"
                        onClick={endCurrentShift}
                        disabled={!activeShift}
                      >
                        End current shift
                      </LoadingButton>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-border">
                    <div className="border-b border-border px-4 py-3">
                      <p className="text-sm font-semibold text-foreground">
                        Shift history
                      </p>
                    </div>
                    {shiftsLoading ? (
                      <div className="space-y-2 p-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    ) : shifts.length === 0 ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        No shift assignments yet.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="text-xs uppercase tracking-wide">Shift</TableHead>
                              <TableHead className="text-xs uppercase tracking-wide">Start</TableHead>
                              <TableHead className="text-xs uppercase tracking-wide">End</TableHead>
                              <TableHead className="text-xs uppercase tracking-wide">Break</TableHead>
                              <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {shifts.map((s) => (
                              <TableRow key={s.id} className="h-10">
                                <TableCell className="font-medium">
                                  {s.shift_time}
                                </TableCell>
                                <TableCell className="nums">
                                  {formatDisplayDate(s.start_date)}
                                </TableCell>
                                <TableCell className="nums">
                                  {s.end_date
                                    ? formatDisplayDate(s.end_date)
                                    : "—"}
                                </TableCell>
                                <TableCell>{s.break_time || "—"}</TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={
                                      s.end_date
                                        ? "border-border bg-muted text-muted-foreground"
                                        : "border-green-200 bg-green-100 text-green-800"
                                    }
                                  >
                                    {s.end_date ? "Ended" : "Current"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {detailTab === "salary" && (
                <div className="space-y-4">
                  <InventoryKpiGrid
                    columns={4}
                    loading={salariesLoading && salaries.length === 0}
                    items={[
                      {
                        label: "Total salary",
                        value: formatMoney(salarySummary.totalAmount),
                        icon: Wallet,
                        hint: `${salaries.length} record${salaries.length === 1 ? "" : "s"}`,
                        onClick: () => setSalaryFilterPaid("all"),
                      },
                      {
                        label: "Total paid",
                        value: formatMoney(salarySummary.paidAmount),
                        icon: CheckCircle2,
                        tone: "success",
                        hint: `${salarySummary.paidCount} paid`,
                        onClick: () => setSalaryFilterPaid("paid"),
                      },
                      {
                        label: "Total unpaid",
                        value: formatMoney(salarySummary.unpaidAmount),
                        icon: XCircle,
                        tone: "danger",
                        hint: `${salarySummary.unpaidCount} unpaid`,
                        onClick: () => setSalaryFilterPaid("unpaid"),
                      },
                      {
                        label: "Loans / advances",
                        value: formatMoney(salarySummary.loanAmount),
                        icon: Banknote,
                        hint: "Against pay periods",
                      },
                    ]}
                  />

                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Filter className="h-3.5 w-3.5" />
                        Filter salary records
                      </h3>
                      {(salaryFilterPaid !== "all" ||
                        salaryFilterMonth !== "all" ||
                        salaryFilterYear !== "all" ||
                        salaryPaidFrom ||
                        salaryPaidTo) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            setSalaryFilterPaid("all");
                            setSalaryFilterMonth("all");
                            setSalaryFilterYear("all");
                            setSalaryPaidFrom("");
                            setSalaryPaidTo("");
                          }}
                        >
                          <X className="mr-1.5 h-3.5 w-3.5" />
                          Clear filters
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { key: "all", label: "All" },
                          { key: "paid", label: "Paid" },
                          { key: "unpaid", label: "Unpaid" },
                        ] as const
                      ).map((chip) => (
                        <button
                          key={chip.key}
                          type="button"
                          onClick={() => setSalaryFilterPaid(chip.key)}
                          className={cn(
                            "inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                            salaryFilterPaid === chip.key
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                          )}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1">
                        <Label className={fieldLabelClass}>Month</Label>
                        <Select
                          value={salaryFilterMonth}
                          onValueChange={setSalaryFilterMonth}
                        >
                          <SelectTrigger className={fieldControlClass}>
                            <SelectValue placeholder="All months" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All months</SelectItem>
                            {MONTH_NAMES.map((m, i) => (
                              <SelectItem key={m} value={String(i + 1)}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className={fieldLabelClass}>Year</Label>
                        <Select
                          value={salaryFilterYear}
                          onValueChange={setSalaryFilterYear}
                        >
                          <SelectTrigger className={fieldControlClass}>
                            <SelectValue placeholder="All years" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All years</SelectItem>
                            {salaryFilterYears.map((y) => (
                              <SelectItem key={y} value={y}>
                                {y}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className={fieldLabelClass}>Paid from</Label>
                        <Input
                          type="date"
                          value={salaryPaidFrom}
                          onChange={(e) => setSalaryPaidFrom(e.target.value)}
                          className={fieldControlClass}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className={fieldLabelClass}>Paid to</Label>
                        <Input
                          type="date"
                          value={salaryPaidTo}
                          onChange={(e) => setSalaryPaidTo(e.target.value)}
                          className={fieldControlClass}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <Wallet className="h-3.5 w-3.5" />
                          Add salary record
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Uses the employee&apos;s fixed monthly salary. Commission
                          is an addon on top (managed in Commission Management).
                        </p>
                      </div>
                      {fixedMonthlySalary <= 0 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => current && openEdit(current)}
                        >
                          Set monthly salary
                        </Button>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">
                          Fixed monthly salary
                        </p>
                        <p className="nums text-sm font-semibold">
                          {formatMoney(fixedMonthlySalary)}
                        </p>
                      </div>
                      <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Percent className="h-3 w-3" />
                          Commission addon ({commissionRate}%)
                        </p>
                        <p className="nums text-sm font-semibold text-emerald-700">
                          {periodCommissionQuery.isFetching
                            ? "…"
                            : formatMoney(periodCommissionAmount)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {periodCommission
                            ? `${MONTH_NAMES[Number(salaryMonth) - 1] || ""} ${salaryYear}`
                            : "No commission record for this period"}
                        </p>
                      </div>
                      <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">
                          Total with commission
                        </p>
                        <p className="nums text-sm font-semibold">
                          {formatMoney(
                            (Number(salaryAmount) || fixedMonthlySalary) +
                              periodCommissionAmount,
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                      <div className="space-y-1">
                        <Label className={fieldLabelClass}>Month</Label>
                        <Select
                          value={salaryMonth}
                          onValueChange={setSalaryMonth}
                        >
                          <SelectTrigger className={fieldControlClass}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MONTH_NAMES.map((m, i) => (
                              <SelectItem key={m} value={String(i + 1)}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className={fieldLabelClass}>Year</Label>
                        <Input
                          type="number"
                          value={salaryYear}
                          onChange={(e) => setSalaryYear(e.target.value)}
                          className={cn(fieldControlClass, "nums")}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className={fieldLabelClass}>
                          Base salary amount
                        </Label>
                        <Input
                          type="number"
                          value={salaryAmount}
                          onChange={(e) => setSalaryAmount(e.target.value)}
                          className={cn(fieldControlClass, "nums")}
                          placeholder={
                            fixedMonthlySalary > 0
                              ? String(fixedMonthlySalary)
                              : "Set on profile"
                          }
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Prefills from fixed monthly salary
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className={fieldLabelClass}>Notes</Label>
                        <Input
                          value={salaryNotes}
                          onChange={(e) => setSalaryNotes(e.target.value)}
                          className={fieldControlClass}
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                    <LoadingButton
                      loading={salarySaving}
                      className="h-9 text-sm"
                      onClick={createSalary}
                      disabled={fixedMonthlySalary <= 0 && !Number(salaryAmount)}
                    >
                      Save salary
                    </LoadingButton>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-border">
                    <div className="border-b border-border px-4 py-3">
                      <p className="text-sm font-semibold text-foreground">
                        Salary history
                      </p>
                    </div>
                    {salariesLoading ? (
                      <div className="space-y-2 p-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    ) : salaries.length === 0 ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        {salaryFilterPaid !== "all" ||
                        salaryFilterMonth !== "all" ||
                        salaryFilterYear !== "all" ||
                        salaryPaidFrom ||
                        salaryPaidTo
                          ? "No salary records match these filters."
                          : "No salary records yet."}
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="text-xs uppercase tracking-wide">Period</TableHead>
                              <TableHead className="text-xs uppercase tracking-wide">Amount</TableHead>
                              <TableHead className="text-xs uppercase tracking-wide">Paid</TableHead>
                              <TableHead className="text-xs uppercase tracking-wide">Paid date</TableHead>
                              <TableHead className="text-xs uppercase tracking-wide">Notes</TableHead>
                              <TableHead className="text-right text-xs uppercase tracking-wide">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {salaries.map((row) => (
                              <TableRow key={row.id} className="h-10">
                                <TableCell className="font-medium">
                                  {MONTH_NAMES[(row.month || 1) - 1] || row.month}{" "}
                                  {row.year}
                                </TableCell>
                                <TableCell className="nums">
                                  {formatMoney(row.amount)}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={
                                      row.is_paid
                                        ? "border-green-200 bg-green-100 text-green-800"
                                        : "border-amber-200 bg-amber-100 text-amber-800"
                                    }
                                  >
                                    {row.is_paid ? "Paid" : "Unpaid"}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {row.paid_date
                                    ? formatDisplayDate(row.paid_date)
                                    : "—"}
                                </TableCell>
                                <TableCell className="max-w-[160px] truncate">
                                  {row.notes || "—"}
                                </TableCell>
                                <TableCell className="text-right">
                                  {!row.is_paid && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 text-xs"
                                      disabled={markingPaidId === row.id}
                                      onClick={() => markSalaryPaid(row)}
                                    >
                                      {markingPaidId === row.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        "Mark paid"
                                      )}
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {detailTab === "history" && (
                <div className="space-y-3 rounded-lg border border-border p-4">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <History className="h-3.5 w-3.5" />
                    Employment history
                  </h3>
                  <ReadOnlyRow
                    label="Created at"
                    value={formatDisplayDate(current.created_at)}
                  />
                  <ReadOnlyRow
                    label="Status"
                    value={statusLabel(current.status)}
                  />
                  <ReadOnlyRow
                    label="Deactivated at"
                    value={formatDisplayDate(current.deactivated_at)}
                  />
                  <ReadOnlyRow
                    label="Deactivation reason"
                    value={current.deactivated_reason || "—"}
                  />
                  <ReadOnlyRow
                    label="Join date"
                    value={formatDisplayDate(current.join_date)}
                  />
                </div>
              )}
            </>
          )}
        </DetailSheetBody>

        <DetailSheetFooter>
          <Button variant="outline" onClick={closeDetail}>
            Close
          </Button>
          {current && (
            <Button onClick={() => openEdit(current)}>Edit</Button>
          )}
        </DetailSheetFooter>
      </DetailSheet>

      {/* Deactivate confirm */}
      <AlertDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeactivateTarget(null);
            setDeactivateReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate employee?</AlertDialogTitle>
            <AlertDialogDescription>
              Soft-deactivate{" "}
              <span className="font-medium text-foreground">
                {deactivateTarget?.name}
              </span>
              . They will no longer appear as active on the roster.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className={fieldLabelClass}>
                Status<span className="text-destructive">*</span>
              </Label>
              <Select
                value={deactivateStatus}
                onValueChange={(v) =>
                  setDeactivateStatus(v as "INACTIVE" | "TERMINATED")
                }
              >
                <SelectTrigger className={fieldControlClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="TERMINATED">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className={fieldLabelClass}>
                Reason<span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={deactivateReason}
                onChange={(e) => setDeactivateReason(e.target.value)}
                placeholder="Why is this employee being deactivated?"
                className="min-h-[80px] text-sm"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deactivating || !deactivateReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                confirmDeactivate();
              }}
            >
              {deactivating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reactivate confirm */}
      <AlertDialog
        open={!!reactivateTarget}
        onOpenChange={(open) => {
          if (!open) setReactivateTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivate employee?</AlertDialogTitle>
            <AlertDialogDescription>
              Restore{" "}
              <span className="font-medium text-foreground">
                {reactivateTarget?.name}
              </span>{" "}
              to the active roster.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reactivating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={reactivating}
              onClick={(e) => {
                e.preventDefault();
                confirmReactivate();
              }}
            >
              {reactivating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Reactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk import — focused upload task, stays a Dialog (guide §2). */}
      <ExcelUploadDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import employees from Excel"
        description={
          <>
            Upload a spreadsheet to create employees in bulk. Department and
            designation columns are matched by name against your existing
            lookups.
          </>
        }
        fields={IMPORT_FIELDS}
        footnote={
          <>
            Accepted headers include <span className="font-medium">name</span>,{" "}
            <span className="font-medium">email</span>,{" "}
            <span className="font-medium">phone_number</span>,{" "}
            <span className="font-medium">department</span>,{" "}
            <span className="font-medium">employee_type</span>, and{" "}
            <span className="font-medium">employment_type</span>.
          </>
        }
        nameColumns={["name", "Name", "full_name", "employee_name"]}
        onRow={handleImportRow}
        onBatchComplete={({ ok, failed, total }) => {
          refetch();
          if (failed === 0) {
            toast({
              title: `Imported ${ok} of ${total} employee${
                total === 1 ? "" : "s"
              }`,
            });
          } else if (ok === 0) {
            toast({
              variant: "destructive",
              title: `All ${total} rows failed — see the list for details`,
            });
          } else {
            toast({
              title: `Imported ${ok} of ${total}, ${failed} failed`,
            });
          }
        }}
        onDownloadTemplate={downloadImportTemplate}
      />
    </>
  );
}
