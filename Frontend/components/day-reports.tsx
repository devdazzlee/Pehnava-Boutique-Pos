"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Inbox,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateField } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { CompactReportFilters } from "@/components/report-filters-shell";
import { ExpenseCategorySelect } from "@/components/expense-category-select";
import { Skeleton } from "@/components/ui/skeleton";
import { ymd, rangeForPreset } from "@/lib/business-timezone";
import {
  EXPENSE_PAYMENT_METHODS,
  approveExpense,
  createExpense,
  fetchExpenseById,
  fetchExpenseCategories,
  updateExpense,
  type ExpensePaymentMethod,
} from "@/lib/api/expenses";

type DayView = "revenue" | "cash" | "credit" | "expenses";
type Preset = "all" | "today" | "yesterday" | "last7" | "last30" | "custom";

interface DayReportData {
  view: DayView;
  period: { from: string; to: string };
  scopeLabel: string;
  isAdmin: boolean;
  branches: { id: string; name: string; code: string }[];
  summary: {
    periodTotal: number;
    entries: number;
    average: number;
    highest: number;
    cashShare: number;
    creditShare: number;
    salesTotal: number;
    paymentsTotal: number;
  };
  rows: Array<{
    id: string;
    type: string;
    reference: string;
    customer: string;
    paymentMethod: string;
    status: string;
    date: string;
    enteredAt?: string;
    amount: number;
    details?: string;
    particular?: string;
    description?: string;
    branch?: { id: string; name: string; code: string } | null;
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const VIEWS: { id: DayView; label: string; icon: typeof Wallet }[] = [
  { id: "revenue", label: "Today Revenue", icon: Banknote },
  { id: "cash", label: "Today Cash Sales", icon: Wallet },
  { id: "credit", label: "Today Credit Sales", icon: CreditCard },
  { id: "expenses", label: "Today Expenses", icon: Receipt },
];

const PRESETS: { id: Preset; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 Days" },
  { id: "last30", label: "Last 30 Days" },
  { id: "custom", label: "Custom Range" },
];

const rangeFor = (preset: Exclude<Preset, "custom">) => rangeForPreset(preset);

const periodDisplay = (preset: Preset, from: string, to: string) => {
  if (preset === "all") return "All dates";
  const start = format(new Date(`${from}T00:00:00`), "dd MMM yyyy");
  if (from === to) return start;
  return `${start} – ${format(new Date(`${to}T00:00:00`), "dd MMM yyyy")}`;
};

const money = (value: number) =>
  `Rs ${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const VIEW_TONE: Record<DayView, { icon: string; accent: string; text: string }> = {
  revenue: { icon: "bg-slate-900 text-white", accent: "bg-slate-900", text: "text-slate-900" },
  cash: { icon: "bg-emerald-600 text-white", accent: "bg-emerald-500", text: "text-emerald-700" },
  credit: { icon: "bg-amber-500 text-white", accent: "bg-amber-500", text: "text-amber-700" },
  expenses: { icon: "bg-rose-600 text-white", accent: "bg-rose-500", text: "text-rose-700" },
};

const paymentBadge = (method: string) => {
  const upper = (method || "").toUpperCase();
  if (upper === "CASH") return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (upper === "CREDIT") return "bg-amber-50 text-amber-700 ring-amber-600/20";
  return "bg-blue-50 text-blue-700 ring-blue-600/20";
};

const statusBadge = (status: string) => {
  const upper = (status || "").toUpperCase();
  if (upper === "PAID" || upper === "COMPLETED") return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (upper === "PENDING" || upper === "PARTIAL") return "bg-amber-50 text-amber-700 ring-amber-600/20";
  if (upper === "CANCELLED" || upper === "REFUNDED" || upper === "VOID") return "bg-rose-50 text-rose-700 ring-rose-600/20";
  return "bg-slate-50 text-slate-600 ring-slate-500/20";
};

const initialsOf = (name: string | null | undefined) => {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        tone,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}

export function DayReports({
  lockedView = "revenue",
  onNavigateView,
  onBack,
}: {
  lockedView?: DayView;
  onNavigateView?: (view: DayView) => void;
  onBack?: () => void;
}) {
  const { toast } = useToast();
  const initial = rangeFor("today");
  const [view, setView] = useState<DayView>(lockedView);
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [report, setReport] = useState<DayReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editingExpenseApproved, setEditingExpenseApproved] = useState(false);
  const [loadingEditExpenseId, setLoadingEditExpenseId] = useState<string | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const emptyExpenseForm = () => ({
    particular: "",
    amount: "",
    category_id: "",
    payment_method: "CASH" as ExpensePaymentMethod,
    vendor: "",
    notes: "",
    expense_date: ymd(new Date()),
  });
  const [expenseForm, setExpenseForm] = useState({
    particular: "",
    amount: "",
    category_id: "",
    payment_method: "CASH" as ExpensePaymentMethod,
    vendor: "",
    notes: "",
    expense_date: ymd(new Date()),
  });

  useEffect(() => {
    setView(lockedView);
    setPage(1);
  }, [lockedView]);

  useEffect(() => {
    if (view !== "expenses") return;
    fetchExpenseCategories({ isActive: true })
      .then((rows) => setCategories((rows || []).map((row: any) => ({ id: row.id, name: row.name }))))
      .catch(() => setCategories([]));
  }, [view]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        from,
        to,
        view,
        page,
        limit,
      };
      if (search.trim()) params.search = search.trim();
      if (branchId !== "all") params.branchId = branchId;
      const response = await apiClient.get("/dashboard/day-report", { params });
      setReport(response.data.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load day report",
        description: error?.response?.data?.message || error?.message || "Try again",
      });
    } finally {
      setLoading(false);
    }
  }, [from, to, view, page, limit, search, branchId, toast]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const applyPreset = (next: Preset) => {
    setPreset(next);
    setPage(1);
    if (next === "custom") return;
    const range = rangeFor(next);
    setFrom(range.from);
    setTo(range.to);
    setDraftFrom(range.from);
    setDraftTo(range.to);
  };

  const applyCustom = () => {
    if (draftTo < draftFrom) {
      toast({ variant: "destructive", title: "To Date cannot be earlier than From Date" });
      return;
    }
    setPreset("custom");
    setFrom(draftFrom);
    setTo(draftTo);
    setPage(1);
  };

  const clearFilters = () => {
    const range = rangeFor("today");
    setPreset("today");
    setFrom(range.from);
    setTo(range.to);
    setDraftFrom(range.from);
    setDraftTo(range.to);
    setSearch("");
    setBranchId("all");
    setPage(1);
  };

  const active = VIEWS.find((item) => item.id === view) || VIEWS[0];
  const ActiveIcon = active.icon;

  const subtitle = useMemo(() => {
    if (view === "expenses") return "Outgoing cash";
    if (view === "cash") return "Cash inflows";
    if (view === "credit") return "Credit invoices";
    return "All completed sales";
  }, [view]);

  const searchPlaceholder =
    view === "expenses"
      ? "Search particular or description..."
      : view === "cash"
        ? "Search sale #, customer, or reference..."
        : "Search sale # or customer...";

  const summaryCards =
    view === "revenue"
      ? [
          { label: "Period total", value: money(report?.summary.periodTotal || 0), hint: report?.scopeLabel || "All locations", tone: "blue" },
          { label: "Entries", value: String(report?.summary.entries || 0), hint: "Transactions" },
          { label: "Average", value: money(report?.summary.average || 0), hint: "Per entry" },
          {
            label: "Cash share",
            value: money(report?.summary.cashShare || 0),
            hint: `Credit ${money(report?.summary.creditShare || 0)}`,
          },
        ]
      : view === "cash"
        ? [
            { label: "Period total", value: money(report?.summary.periodTotal || 0), hint: report?.scopeLabel || "All locations", tone: "green" },
            { label: "Entries", value: String(report?.summary.entries || 0), hint: "Sales + ledger payments" },
            { label: "Average", value: money(report?.summary.average || 0), hint: "Per entry" },
            {
              label: "Breakdown",
              value: money(report?.summary.salesTotal || 0),
              hint: `Sales · Payments ${money(report?.summary.paymentsTotal || 0)}`,
              tone: "green",
            },
          ]
        : view === "credit"
          ? [
              { label: "Period total", value: money(report?.summary.periodTotal || 0), hint: report?.scopeLabel || "All locations", tone: "amber" },
              { label: "Entries", value: String(report?.summary.entries || 0), hint: "Transactions" },
              { label: "Average", value: money(report?.summary.average || 0), hint: "Per entry" },
              { label: "Highest entry", value: money(report?.summary.highest || 0), hint: "Single largest amount" },
            ]
          : [
              { label: "Period total", value: money(report?.summary.periodTotal || 0), hint: report?.scopeLabel || "All locations", tone: "rose" },
              { label: "Entries", value: String(report?.summary.entries || 0), hint: "Expense records" },
              { label: "Average", value: money(report?.summary.average || 0), hint: "Per entry" },
              { label: "Highest entry", value: money(report?.summary.highest || 0), hint: "Single largest amount" },
            ];

  const amountClass =
    view === "credit" ? "text-amber-700" : view === "expenses" ? "text-rose-700" : "text-slate-900";

  // First paint / view switch: no data yet → skeletons (never fake zeros).
  // Later refreshes keep the last good report visible while loading.
  // Switching report tabs: the old rows belong to a different table shape, so
  // show skeletons instead of briefly rendering mismatched data.
  const isInitialLoad = loading && (!report || (Boolean(report.view) && report.view !== view));
  // Filter / page changes: keep the current results in place (no layout jump)
  // and overlay a loader until fresh data arrives.
  const isRefreshing = loading && !isInitialLoad;
  const tableCols = view === "expenses" ? 5 : 6;

  const resetExpenseDialog = () => {
    setEditingExpenseId(null);
    setEditingExpenseApproved(false);
    setExpenseForm(emptyExpenseForm());
  };

  const formatExpenseDateField = (value: string | Date) => {
    if (typeof value === "string") return value.slice(0, 10);
    return format(new Date(value), "yyyy-MM-dd");
  };

  const openAddExpenseDialog = () => {
    resetExpenseDialog();
    setAddOpen(true);
  };

  const openEditExpenseDialog = async (expenseId: string) => {
    setLoadingEditExpenseId(expenseId);
    try {
      const expense = await fetchExpenseById(expenseId);
      if (expense.status === "REJECTED") {
        sonnerToast.error("Rejected expenses cannot be edited.");
        return;
      }
      if (expense.cashflow_id) {
        sonnerToast.error(
          "This expense is tied to the cash register drawer and cannot be edited here.",
        );
        return;
      }
      setEditingExpenseId(expense.id);
      setEditingExpenseApproved(expense.status === "APPROVED");
      setExpenseForm({
        particular: expense.particular,
        amount: String(expense.amount),
        category_id: expense.category?.id ?? "",
        payment_method: expense.payment_method,
        vendor: expense.vendor ?? "",
        notes: expense.notes ?? "",
        expense_date: formatExpenseDateField(expense.expense_date),
      });
      setAddOpen(true);
    } catch (error: any) {
      sonnerToast.error(
        error?.response?.data?.message || error?.message || "Could not load expense",
      );
    } finally {
      setLoadingEditExpenseId(null);
    }
  };

  const saveExpense = async () => {
    const particular = expenseForm.particular.trim();
    const amount = Number(expenseForm.amount);
    if (!particular || !(amount > 0)) {
      toast({
        variant: "destructive",
        title: "Missing details",
        description: "Enter a description and a valid amount.",
      });
      return;
    }
    setSavingExpense(true);
    const payload = {
      particular,
      amount,
      category_id: expenseForm.category_id || null,
      payment_method: expenseForm.payment_method,
      vendor: expenseForm.vendor.trim() || null,
      notes: expenseForm.notes.trim() || null,
      expense_date: expenseForm.expense_date || ymd(new Date()),
    };
    try {
      if (editingExpenseId) {
        await updateExpense(editingExpenseId, payload);
        toast({ title: "Expense updated" });
      } else {
        const created = await createExpense(payload);
        try {
          if (created?.id) await approveExpense(created.id);
        } catch {
          // Expense is saved even if approval is restricted for this role.
        }
        toast({ title: "Expense added" });
      }
      setAddOpen(false);
      resetExpenseDialog();
      await load();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: editingExpenseId ? "Could not update expense" : "Could not add expense",
        description: error?.response?.data?.message || error?.message || "Try again",
      });
    } finally {
      setSavingExpense(false);
    }
  };

  const tone = VIEW_TONE[view];
  const rows = report?.rows || [];
  const currentPage = report?.pagination.page || 1;
  const totalPages = report?.pagination.totalPages || 1;
  const totalEntries = report?.pagination.total || 0;
  const thClass = "h-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500";
  const recordsTitle =
    view === "expenses" ? "Expense Records" : view === "cash" ? "Cash Inflow Records" : "Sales Records";

  // Always show the shop's (Pakistan) date & time, whatever time zone this computer is set to.
  const shopDate = (v: string) => new Date(v).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi", day: "2-digit", month: "short", year: "numeric" });
  const shopTime = (v: string) => new Date(v).toLocaleTimeString("en-US", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit" });
  const renderDate = (value: string, timeFrom?: string) => (
    <>
      <div className="text-sm text-slate-900">{shopDate(value)}</div>
      <div className="text-xs text-slate-500">{shopTime(timeFrom || value)}</div>
    </>
  );

  const renderCustomer = (name: string) => (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
        {initialsOf(name)}
      </span>
      <span className="truncate text-slate-900">{name}</span>
    </div>
  );

  const renderEmpty = (colSpan: number, message: string) => (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="py-14">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Inbox className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-slate-900">{message}</p>
          <p className="mt-1 text-xs text-slate-500">Try a different date range, location or search term.</p>
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6 lg:p-8">
      <style>{`@keyframes day-report-progress{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3.5">
          <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm", tone.icon)}>
            <ActiveIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">{active.label}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
              <span>{subtitle}</span>
              <span className="text-slate-300">•</span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {periodDisplay(preset, from, to)}
              </span>
              <span className="text-slate-300">•</span>
              {isInitialLoad ? (
                <Skeleton className="h-4 w-32" />
              ) : (
                <span className="inline-flex items-center gap-1">
                  {report?.isAdmin ? <ShieldCheck className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                  {report?.isAdmin ? "Admin view" : "Branch view"} · {report?.scopeLabel || "All locations"}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-9 bg-white shadow-sm" onClick={() => onBack?.()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Dashboard
          </Button>
          <Button variant="outline" className="h-9 bg-white shadow-sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          {view === "expenses" ? (
            <Button className="h-9 shadow-sm" onClick={openAddExpenseDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Expense
            </Button>
          ) : null}
        </div>
      </div>

      {/* View switcher */}
      <div className="-mx-4 overflow-x-auto px-4 scrollbar-none md:mx-0 md:px-0">
        <div role="tablist" className="inline-flex min-w-max gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1">
          {VIEWS.map((item) => {
            const Icon = item.icon;
            const selected = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20",
                  selected
                    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                    : "text-slate-600 hover:bg-white/60 hover:text-slate-900",
                )}
                onClick={() => {
                  if (onNavigateView) onNavigateView(item.id);
                  else {
                    setView(item.id);
                    setPage(1);
                  }
                }}
              >
                <Icon className={cn("h-4 w-4", selected ? VIEW_TONE[item.id].text : "text-slate-400")} />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 md:gap-4">
        {isInitialLoad
          ? Array.from({ length: 4 }).map((_, index) => (
              <Card key={`summary-skel-${index}`} className="rounded-xl border-slate-200">
                <CardContent className="space-y-3 p-5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-8 w-28" />
                  <Skeleton className="h-3 w-24" />
                </CardContent>
              </Card>
            ))
          : summaryCards.map((card) => {
              const highlighted = Boolean(card.tone);
              return (
                <Card
                  key={card.label}
                  className="relative overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm"
                >
                  {isRefreshing ? (
                    <Loader2 className="absolute right-4 top-4 h-4 w-4 animate-spin text-slate-300" aria-hidden />
                  ) : null}
                  {highlighted ? <span className={cn("absolute inset-y-0 left-0 w-1", tone.accent)} aria-hidden /> : null}
                  <CardContent className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{card.label}</p>
                    <p
                      className={cn(
                        "mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums transition-opacity",
                        highlighted ? tone.text : "text-slate-900",
                        isRefreshing && "opacity-40",
                      )}
                    >
                      {card.value}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">{card.hint}</p>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      <CompactReportFilters
        defaultOpen
        loading={isRefreshing}
        summary={`${periodDisplay(preset, from, to)} · ${report?.scopeLabel || "All locations"}`}
        actions={
          <>
            {preset === "custom" ? (
              <Button size="sm" className="h-8" onClick={applyCustom}>
                Apply
              </Button>
            ) : null}
            <Button size="sm" variant="outline" className="h-8 border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800" onClick={clearFilters}>
              <X className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          </>
        }
        primary={
          <>
            <div className="space-y-1 sm:col-span-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-9 pl-9"
                  placeholder={searchPlaceholder}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Date range</Label>
              <Select value={preset} onValueChange={(value) => applyPreset(value as Preset)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Location</Label>
              {!report ? (
                <Skeleton className="h-9 w-full rounded-md" />
              ) : (
                <Select
                  value={branchId}
                  onValueChange={(value) => {
                    setBranchId(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    {(report?.branches || []).map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <DateField
              label="From date"
              value={draftFrom}
              onChange={(value) => {
                setDraftFrom(value);
                setPreset("custom");
              }}
            />
            <DateField
              label="To date"
              value={draftTo}
              onChange={(value) => {
                setDraftTo(value);
                setPreset("custom");
              }}
            />
          </>
        }
      />

      {/* Records */}
      <Card className="relative overflow-hidden rounded-xl border-slate-200 shadow-sm">
        {isRefreshing ? (
          <div className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-slate-100" aria-hidden>
            <div className="h-full w-1/3 animate-[day-report-progress_1.1s_ease-in-out_infinite] rounded-full bg-slate-900" />
          </div>
        ) : null}
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-slate-900">{recordsTitle}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{periodDisplay(preset, from, to)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-slate-600">
                {isInitialLoad ? "…" : `${totalEntries} ${totalEntries === 1 ? "entry" : "entries"}`}
              </span>
            </div>
          </div>

          {isInitialLoad ? (
            <div className="space-y-4 p-5">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={`row-skel-${index}`} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-28" />
                  {tableCols > 4 ? <Skeleton className="h-4 w-20" /> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="relative min-h-[280px]" aria-busy={isRefreshing}>
              {isRefreshing ? (
                <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/70 pt-20 backdrop-blur-[1px]">
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-md">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                    Loading records…
                  </div>
                </div>
              ) : null}
              {view === "expenses" ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={cn(thClass, "pl-5")}>Date</TableHead>
                      <TableHead className={thClass}>Particular</TableHead>
                      <TableHead className={thClass}>Description</TableHead>
                      <TableHead className={cn(thClass, "pr-5 text-right")}>Amount</TableHead>
                      <TableHead className={cn(thClass, "w-[72px] pr-5 text-right")}>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0
                      ? renderEmpty(5, "No expenses found for the selected filters.")
                      : rows.map((row) => (
                          <TableRow key={row.id} className="border-slate-100 hover:bg-slate-50/70">
                            <TableCell className="py-3 pl-5">{renderDate(row.date, row.enteredAt)}</TableCell>
                            <TableCell className="py-3 font-medium text-slate-900">{row.particular || row.reference}</TableCell>
                            <TableCell className="py-3 text-slate-600">{row.description || row.details || "—"}</TableCell>
                            <TableCell className={cn("py-3 text-right font-semibold tabular-nums", amountClass)}>
                              {money(row.amount)}
                            </TableCell>
                            <TableCell className="py-3 pr-5 text-right">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-slate-600 hover:text-slate-900"
                                title="Edit expense"
                                aria-label="Edit expense"
                                disabled={loadingEditExpenseId === row.id}
                                onClick={() => void openEditExpenseDialog(row.id)}
                              >
                                {loadingEditExpenseId === row.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Pencil className="h-4 w-4" />
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              ) : view === "cash" ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={cn(thClass, "pl-5")}>Type</TableHead>
                      <TableHead className={thClass}>Reference</TableHead>
                      <TableHead className={thClass}>Customer</TableHead>
                      <TableHead className={thClass}>Date</TableHead>
                      <TableHead className={thClass}>Details</TableHead>
                      <TableHead className={cn(thClass, "pr-5 text-right")}>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0
                      ? renderEmpty(6, "No cash sales found for the selected filters.")
                      : rows.map((row) => (
                          <TableRow key={row.id} className="border-slate-100 hover:bg-slate-50/70">
                            <TableCell className="py-3 pl-5">
                              <Pill tone="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Sale</Pill>
                            </TableCell>
                            <TableCell className="py-3 font-mono text-xs font-medium text-slate-700">{row.reference}</TableCell>
                            <TableCell className="py-3">{renderCustomer(row.customer)}</TableCell>
                            <TableCell className="py-3">{renderDate(row.date, row.enteredAt)}</TableCell>
                            <TableCell className="py-3">
                              <Pill tone={paymentBadge(row.paymentMethod)}>{row.paymentMethod}</Pill>
                            </TableCell>
                            <TableCell className={cn("py-3 pr-5 text-right font-semibold tabular-nums", amountClass)}>
                              {money(row.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={cn(thClass, "pl-5")}>Sale #</TableHead>
                      <TableHead className={thClass}>Customer</TableHead>
                      <TableHead className={thClass}>Payment</TableHead>
                      <TableHead className={thClass}>Status</TableHead>
                      <TableHead className={thClass}>Date</TableHead>
                      <TableHead className={cn(thClass, "pr-5 text-right")}>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0
                      ? renderEmpty(6, "No sales found for the selected filters.")
                      : rows.map((row) => (
                          <TableRow key={row.id} className="border-slate-100 hover:bg-slate-50/70">
                            <TableCell className="py-3 pl-5 font-mono text-xs font-medium text-slate-700">{row.reference}</TableCell>
                            <TableCell className="py-3">{renderCustomer(row.customer)}</TableCell>
                            <TableCell className="py-3">
                              <Pill tone={paymentBadge(row.paymentMethod)}>{row.paymentMethod}</Pill>
                            </TableCell>
                            <TableCell className="py-3">
                              <Pill tone={statusBadge(row.status)}>{row.status}</Pill>
                            </TableCell>
                            <TableCell className="py-3">{renderDate(row.date, row.enteredAt)}</TableCell>
                            <TableCell className={cn("py-3 pr-5 text-right font-semibold tabular-nums", amountClass)}>
                              {money(row.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {isInitialLoad ? (
                <Skeleton className="h-4 w-40" />
              ) : (
                <p>
                  Page <span className="font-medium text-slate-900">{currentPage}</span> of{" "}
                  <span className="font-medium text-slate-900">{totalPages}</span>
                  <span className="mx-1.5 text-slate-300">•</span>
                  {totalEntries} {totalEntries === 1 ? "entry" : "entries"}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="hidden text-xs text-slate-500 sm:inline">Rows per page</span>
              <Select
                value={String(limit)}
                onValueChange={(value) => {
                  setLimit(Number(value));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[76px] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50].map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 bg-white px-2.5"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 bg-white px-2.5"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) resetExpenseDialog();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingExpenseId ? "Edit Expense" : "Add Expense"}</DialogTitle>
            {editingExpenseId && editingExpenseApproved ? (
              <DialogDescription>
                This expense is already approved. Saving will update reports and totals.
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="space-y-1">
              <Label>Description</Label>
              <Input
                value={expenseForm.particular}
                onChange={(e) => setExpenseForm((prev) => ({ ...prev, particular: e.target.value }))}
                placeholder="What was this for?"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount (Rs)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Date</Label>
                <DateField
                  value={expenseForm.expense_date}
                  onChange={(value) => setExpenseForm((prev) => ({ ...prev, expense_date: value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <ExpenseCategorySelect
                value={expenseForm.category_id}
                categories={categories}
                onChange={(categoryId) =>
                  setExpenseForm((prev) => ({ ...prev, category_id: categoryId }))
                }
                onCategoriesChange={setCategories}
              />
            </div>
            <div className="space-y-1">
              <Label>Payment method</Label>
              <Select
                value={expenseForm.payment_method}
                onValueChange={(value) =>
                  setExpenseForm((prev) => ({
                    ...prev,
                    payment_method: value as ExpensePaymentMethod,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Vendor / paid to</Label>
              <Input
                value={expenseForm.vendor}
                onChange={(e) => setExpenseForm((prev) => ({ ...prev, vendor: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Input
                value={expenseForm.notes}
                onChange={(e) => setExpenseForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddOpen(false);
                resetExpenseDialog();
              }}
              disabled={savingExpense}
            >
              Cancel
            </Button>
            <Button onClick={saveExpense} disabled={savingExpense}>
              {savingExpense ? "Saving…" : editingExpenseId ? "Save changes" : "Save Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
