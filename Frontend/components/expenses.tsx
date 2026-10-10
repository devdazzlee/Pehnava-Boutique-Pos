"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Plus,
  Search,
  RefreshCcw,
  Loader2,
  Check,
  X,
  Trash2,
  Pencil,
  Play,
  Wallet,
  Landmark,
  Clock,
  FileText,
  Paperclip,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ExpenseAttachments, ExpenseAttachmentsDialog } from "@/components/expense-attachments";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import apiClient from "@/lib/apiClient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
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
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import { formatMoney } from "@/components/inventory/stock-ops/export-utils";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { extractApiError } from "@/lib/api/errors";
import { ExpenseCategorySelect } from "@/components/expense-category-select";
import { ExpenseAccountSelect, useExpenseAccounts } from "@/components/expense-account-select";
import { DateField, YmdDatePicker } from "@/components/ui/date-picker";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query/query-keys";

import {
  useExpenses,
  useExpenseReport,
  useExpenseMutations,
  useExpenseCategories,
  useExpenseCategoryMutations,
  useRecurringExpenses,
  useRecurringExpenseMutations,
} from "@/hooks/queries/use-expenses";
import {
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_STATUSES,
  RECURRING_FREQUENCIES,
  type Expense,
  type ExpenseStatus,
  type ExpensePaymentMethod,
  type RecurringExpense,
  fetchExpenses,
} from "@/lib/api/expenses";
import { formatBusinessDate, formatLegacyPosDateTime } from "@/lib/business-timezone";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const fmtDate = (v?: string | null) => (v ? formatBusinessDate(v) : "—");
const fmtDateTime = (v?: string | null) => (v ? formatLegacyPosDateTime(v) : "—");
const titleCase = (s: string) =>
  s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const STATUS_STYLE: Record<ExpenseStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  APPROVED: "border-green-200 bg-green-50 text-green-800",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-800",
};

type TabKey = "expenses" | "recurring" | "categories" | "reports";
const BANKISH: ExpensePaymentMethod[] = ["BANK", "CHEQUE"];

export function Expenses() {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("expenses");

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Record, approve and report on business spend"
      />
      <PageBody className="space-y-5">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["expenses", "Expenses"],
              ["recurring", "Recurring"],
              ["categories", "Categories"],
              ["reports", "Reports"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                tab === key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-foreground hover:bg-muted/50",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "expenses" && <ExpensesTab toast={toast} />}
        {tab === "recurring" && <RecurringTab toast={toast} />}
        {tab === "categories" && <CategoriesTab toast={toast} />}
        {tab === "reports" && <ReportsTab />}
      </PageBody>
    </>
  );
}

/* ============================ Expenses tab ============================ */

type Toast = ReturnType<typeof useToast>["toast"];

function ExpensesTab({ toast }: { toast: Toast }) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [method, setMethod] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<string>("20");
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, categoryId, method, status, from, to, pageSize]);

  const listLimit = useMemo(() => {
    const n = Number(pageSize);
    return Number.isFinite(n) && n > 0 ? n : 20;
  }, [pageSize]);

  const { categories } = useExpenseCategories({ isActive: true });
  const { expenses, meta, isFirstLoad, isRefreshing, refetch } = useExpenses({
    page: pageSize === "all" ? 1 : page,
    limit: pageSize === "all" ? undefined : listLimit,
    fetchAll: pageSize === "all",
    search: debounced || undefined,
    categoryId: categoryId === "all" ? undefined : categoryId,
    paymentMethod: method === "all" ? undefined : (method as ExpensePaymentMethod),
    status: status === "all" ? undefined : (status as ExpenseStatus),
    from: from || undefined,
    to: to || undefined,
  });
  const mutations = useExpenseMutations();

  const err = (e: unknown, title: string) =>
    toast({ variant: "destructive", title, description: extractApiError(e, title) });

  const exportExpensesExcel = async () => {
    setExporting(true);
    try {
      const result = await fetchExpenses({
        fetchAll: true,
        search: debounced || undefined,
        categoryId: categoryId === "all" ? undefined : categoryId,
        paymentMethod: method === "all" ? undefined : (method as ExpensePaymentMethod),
        status: status === "all" ? undefined : (status as ExpenseStatus),
        from: from || undefined,
        to: to || undefined,
      });
      const rows = result.data || [];
      const XLSX = await import("xlsx");
      const header = [
        "Date",
        "Particular",
        "Vendor",
        "Category",
        "Account",
        "Method",
        "Status",
        "Amount (Rs)",
        "Notes",
      ];
      const data = rows.map((e) => [
        e.expense_date ? new Date(e.expense_date).toLocaleDateString() : "",
        e.particular,
        e.vendor || "",
        e.category?.name || "",
        e.account ? `${e.account.code} ${e.account.name}` : "",
        titleCase(e.payment_method),
        titleCase(e.status),
        e.amount,
        e.notes || "",
      ]);
      const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Expenses");
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      XLSX.writeFile(wb, `expenses_${stamp}.xlsx`);
      toast({ title: `Exported ${rows.length} expense${rows.length === 1 ? "" : "s"}` });
    } catch (e) {
      err(e, "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [approveTarget, setApproveTarget] = useState<Expense | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Expense | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [receiptsFor, setReceiptsFor] = useState<Expense | null>(null);
  const qc = useQueryClient();

  const summary = meta?.summary;

  return (
    <div className="space-y-4">
      <InventoryKpiGrid
        columns={4}
        loading={isFirstLoad}
        items={[
          { label: "Total (filtered)", value: formatMoney(summary?.totalAmount ?? 0), icon: FileText },
          {
            label: "Pending approval",
            value: formatMoney(summary?.pendingAmount ?? 0),
            icon: Clock,
            tone: (summary?.pendingCount ?? 0) > 0 ? "warning" : undefined,
            hint: `${summary?.pendingCount ?? 0} awaiting`,
          },
          { label: "Approved", value: formatMoney(summary?.approvedAmount ?? 0), icon: Check, tone: "success" },
          { label: "Rejected", value: formatMoney(summary?.rejectedAmount ?? 0), icon: X },
        ]}
      />

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search description, vendor, reference"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9"
          />
        </div>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Method" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            {EXPENSE_PAYMENT_METHODS.map((m) => (
              <SelectItem key={m} value={m}>{titleCase(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {EXPENSE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex min-w-[140px] flex-col gap-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <YmdDatePicker value={from} onChange={setFrom} className="h-9" />
        </div>
        <div className="flex min-w-[140px] flex-col gap-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <YmdDatePicker value={to} onChange={setTo} className="h-9" />
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={() => refetch()} disabled={isRefreshing}>
          <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          disabled={exporting || isFirstLoad}
          onClick={() => void exportExpensesExcel()}
        >
          {exporting ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-4 w-4" />
          )}
          Export
        </Button>
        <Button size="sm" className="h-9" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" />
          New expense
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isFirstLoad ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-11 w-full animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <div className="m-4 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12">
              <FileText className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No expenses match these filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wide">Date</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Description</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Category</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Method</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide">Amount</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                    <TableHead className="w-[150px] text-right text-xs uppercase tracking-wide">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((e) => {
                    const locked = Boolean(e.cashflow_id);
                    return (
                      <TableRow key={e.id} className="h-11 hover:bg-muted/50">
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground nums">
                          {fmtDateTime(e.expense_date)}
                        </TableCell>
                        <TableCell className="max-w-[240px]">
                          <p className="truncate font-medium text-foreground">{e.particular}</p>
                          {e.vendor && (
                            <p className="truncate text-xs text-muted-foreground">{e.vendor}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{e.category?.name ?? "—"}</div>
                          {e.account ? (
                            <div className="text-[11px] text-muted-foreground">
                              <span className="font-mono">{e.account.code}</span> {e.account.name}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            {BANKISH.includes(e.payment_method) ? (
                              <Landmark className="h-3.5 w-3.5" />
                            ) : (
                              <Wallet className="h-3.5 w-3.5" />
                            )}
                            {titleCase(e.payment_method)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold nums">
                          {formatMoney(e.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_STYLE[e.status]}>
                            {titleCase(e.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className={cn("relative h-8 w-8", e._count?.attachments ? "text-[#a67c2e]" : "text-muted-foreground")}
                              title={e._count?.attachments ? `${e._count.attachments} receipt(s)` : "Attach receipt"}
                              onClick={() => setReceiptsFor(e)}
                            >
                              <Paperclip className="h-4 w-4" />
                              {!!e._count?.attachments && (
                                <span className="absolute -right-0.5 -top-0.5 rounded-full bg-[#a67c2e] px-1 text-[9px] font-semibold leading-4 text-white">
                                  {e._count.attachments}
                                </span>
                              )}
                            </Button>
                            {e.status === "PENDING" && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-green-700 hover:text-green-800"
                                  title="Approve"
                                  onClick={() => setApproveTarget(e)}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-rose-700 hover:text-rose-800"
                                  title="Reject"
                                  onClick={() => { setRejectTarget(e); setRejectReason(""); }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {!locked && e.status !== "REJECTED" && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                title="Edit"
                                onClick={() => { setEditing(e); setFormOpen(true); }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {!locked && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                title="Delete"
                                onClick={() => setDeleteTarget(e)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {meta && meta.total > 0 && (
            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {pageSize === "all" ? (
                  <>
                    Showing all{" "}
                    <span className="font-medium text-foreground">{meta.total}</span>{" "}
                    {meta.total === 1 ? "entry" : "entries"}
                  </>
                ) : (
                  <>
                    Page {meta.page} of {meta.totalPages}
                    <span className="mx-1.5 text-muted-foreground/50">•</span>
                    {meta.total} {meta.total === 1 ? "entry" : "entries"}
                  </>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="hidden text-xs text-muted-foreground sm:inline">Rows per page</span>
                <Select
                  value={pageSize}
                  onValueChange={(value) => {
                    setPageSize(value);
                    setPage(1);
                    if (value === "all") void refetch();
                  }}
                >
                  <SelectTrigger className="h-8 w-[88px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50].map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={pageSize === "all" || page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={pageSize === "all" || page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ExpenseAttachmentsDialog
        expense={receiptsFor}
        onOpenChange={(o) => !o && setReceiptsFor(null)}
        onChange={() => qc.invalidateQueries({ queryKey: qk.expenses.all })}
      />

      <ExpenseFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        categories={categories}
        onSave={(body) => {
          const opts = {
            onSuccess: () => { toast({ title: editing ? "Expense updated" : "Expense recorded" }); setFormOpen(false); },
            onError: (e: unknown) => err(e, "Could not save expense"),
          };
          if (editing) mutations.update.mutate({ id: editing.id, body }, opts);
          else mutations.create.mutate(body, opts);
        }}
        saving={mutations.create.isPending || mutations.update.isPending}
      />

      <AlertDialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {approveTarget?.particular} — {formatMoney(approveTarget?.amount ?? 0)}. It will be
              counted in reports as approved spend.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!approveTarget) return;
                mutations.approve.mutate(approveTarget.id, {
                  onSuccess: () => { toast({ title: "Expense approved" }); setApproveTarget(null); },
                  onError: (e) => err(e, "Could not approve"),
                });
              }}
            >
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject expense</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {rejectTarget?.particular} — {formatMoney(rejectTarget?.amount ?? 0)}
            </p>
            <Label className="text-xs text-muted-foreground">Reason (optional)</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why is this being rejected?"
              className="min-h-[80px] text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!rejectTarget) return;
                mutations.reject.mutate(
                  { id: rejectTarget.id, reason: rejectReason.trim() || undefined },
                  {
                    onSuccess: () => { toast({ title: "Expense rejected" }); setRejectTarget(null); },
                    onError: (e) => err(e, "Could not reject"),
                  },
                );
              }}
            >
              Reject expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.particular} — {formatMoney(deleteTarget?.amount ?? 0)}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                mutations.remove.mutate(deleteTarget.id, {
                  onSuccess: () => { toast({ title: "Expense deleted" }); setDeleteTarget(null); },
                  onError: (e) => err(e, "Could not delete"),
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------ expense form sheet ------------------------ */

function ExpenseFormSheet({
  open,
  onOpenChange,
  editing,
  categories,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Expense | null;
  categories: { id: string; name: string }[];
  onSave: (body: any) => void;
  saving: boolean;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState(() => blankExpense());
  const { accounts, loading: accountsLoading } = useExpenseAccounts(open);
  // Open cash register (if any): cash expenses can be taken straight from the drawer.
  const [drawer, setDrawer] = useState<{ branch: string } | null>(null);
  useEffect(() => {
    if (!open || editing) return;
    apiClient
      .get("/cash-register/status")
      .then((r) => {
        const rows: { branch: { name: string }; state: string }[] = r.data?.data?.branches ?? [];
        const live = rows.filter((b) => b.state === "OPEN" || b.state === "LOCKED");
        setDrawer(live.length === 1 ? { branch: live[0].branch.name } : null);
      })
      .catch(() => setDrawer(null));
  }, [open, editing]);
  const [localCategories, setLocalCategories] = useState(categories);
  useEffect(() => {
    if (!open) return;
    setLocalCategories(categories);
    setF(
      editing
        ? {
            particular: editing.particular,
            amount: String(editing.amount),
            category_id: editing.category?.id ?? "",
            account_id: editing.account?.id ?? "",
            payment_method: editing.payment_method,
            bank_account: editing.bank_account ?? "",
            reference: editing.reference ?? "",
            vendor: editing.vendor ?? "",
            notes: editing.notes ?? "",
            expense_date: editing.expense_date.slice(0, 10),
          }
        : blankExpense(),
    );
  }, [open, editing, categories]);

  const showBank = BANKISH.includes(f.payment_method);
  const valid = f.particular.trim().length > 0 && Number(f.amount) > 0;

  return (
    <DetailSheet open={open} onOpenChange={onOpenChange} size="lg">
      <DetailSheetHeader
        title={editing ? "Edit expense" : "New expense"}
        subtitle="Record a business expense for approval"
      />
      <DetailSheetBody className="space-y-4">
        <Field label="Description">
          <Input value={f.particular} onChange={(e) => setF({ ...f, particular: e.target.value })}
            placeholder="What was this for?" className="h-9" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (Rs)">
            <Input type="number" min="0" step="0.01" value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })} className="h-9 nums" />
          </Field>
          <Field label="Date">
            <YmdDatePicker value={f.expense_date} onChange={(value) => setF({ ...f, expense_date: value })} className="h-9" />
          </Field>
        </div>
        <Field
          label="Category"
          hint="Labels for reports and filters. Each category gets a linked ledger account under 521 Expenses Control."
        >
          <ExpenseCategorySelect
            value={f.category_id}
            categories={localCategories}
            onChange={(categoryId) => {
              const linked = accounts.find((a) => a.expense_category_id === categoryId);
              setF({ ...f, category_id: categoryId, account_id: f.account_id || linked?.id || "" });
            }}
            onCategoriesChange={(next) => {
              setLocalCategories(next);
              qc.invalidateQueries({ queryKey: qk.expenses.categories });
            }}
            triggerClassName="h-9"
          />
        </Field>
        <Field label="Expense account (Chart of Accounts)">
          <ExpenseAccountSelect
            value={f.account_id}
            accounts={accounts}
            loading={accountsLoading}
            onChange={(accountId) => setF({ ...f, account_id: accountId })}
            triggerClassName="h-9"
          />
        </Field>
        <Field label="Payment method">
          <Select value={f.payment_method} onValueChange={(v) => setF({ ...f, payment_method: v as ExpensePaymentMethod })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EXPENSE_PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{titleCase(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {!editing && drawer && f.expense_date === new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }) && (
          <p className="rounded-lg bg-[#fcf8f2] px-3 py-2 text-xs text-gray-700">
            {f.payment_method === "CASH"
              ? `This will also show in today's ${drawer.branch} cash register and be taken from the drawer.`
              : `This will also show in today's ${drawer.branch} cash register under ${titleCase(f.payment_method)} (drawer cash stays the same).`}
          </p>
        )}
        {editing?.cashflow_id && (
          <p className="rounded-lg bg-[#fcf8f2] px-3 py-2 text-xs text-gray-600">This expense is recorded in a cash register session.</p>
        )}
        {showBank && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bank account">
              <Input value={f.bank_account} onChange={(e) => setF({ ...f, bank_account: e.target.value })}
                placeholder="Account / bank name" className="h-9" />
            </Field>
            <Field label="Reference / cheque no.">
              <Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} className="h-9" />
            </Field>
          </div>
        )}
        <Field label="Vendor / paid to">
          <Input value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} className="h-9" />
        </Field>
        <Field label="Notes">
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })}
            className="min-h-[70px] text-sm" />
        </Field>
        {editing ? (
          <Field label="Receipts">
            <ExpenseAttachments expenseId={editing.id} compact />
          </Field>
        ) : (
          <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            You can attach the receipt photo or PDF after saving — use the paperclip on the expense row.
          </p>
        )}
      </DetailSheetBody>
      <DetailSheetFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          disabled={!valid || saving}
          onClick={() =>
            onSave({
              particular: f.particular.trim(),
              amount: Number(f.amount),
              category_id: f.category_id || null,
              account_id: f.account_id || null,
              payment_method: f.payment_method,
              bank_account: showBank ? f.bank_account.trim() || null : null,
              reference: f.reference.trim() || null,
              vendor: f.vendor.trim() || null,
              notes: f.notes.trim() || null,
              expense_date: f.expense_date,
            })
          }
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {editing ? "Save changes" : "Record expense"}
        </Button>
      </DetailSheetFooter>
    </DetailSheet>
  );
}

function blankExpense() {
  return {
    particular: "",
    amount: "",
    category_id: "",
    account_id: "",
    payment_method: "CASH" as ExpensePaymentMethod,
    bank_account: "",
    reference: "",
    vendor: "",
    notes: "",
    expense_date: today(),
  };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {hint ? <p className="text-[11px] leading-snug text-muted-foreground/90">{hint}</p> : null}
      {children}
    </div>
  );
}

/* =========================== Recurring tab =========================== */

function RecurringTab({ toast }: { toast: Toast }) {
  const { recurring, isLoading } = useRecurringExpenses();
  const { categories } = useExpenseCategories({ isActive: true });
  const m = useRecurringExpenseMutations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecurringExpense | null>(null);
  const err = (e: unknown, t: string) =>
    toast({ variant: "destructive", title: t, description: extractApiError(e, t) });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Templates that generate an expense on a schedule.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={m.run.isPending}
            onClick={() =>
              m.run.mutate(undefined, {
                onSuccess: (r) =>
                  toast({ title: `Generated ${r.generated} expense${r.generated === 1 ? "" : "s"}` }),
                onError: (e) => err(e, "Could not run recurring expenses"),
              })
            }
          >
            {m.run.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
            Run due now
          </Button>
          <Button size="sm" className="h-9" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" />
            New template
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-11 w-full animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : recurring.length === 0 ? (
            <div className="m-4 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12">
              <RefreshCcw className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No recurring templates yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wide">Description</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide">Amount</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Every</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Next run</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Auto-approve</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Active</TableHead>
                    <TableHead className="w-[90px] text-right text-xs uppercase tracking-wide">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recurring.map((r) => (
                    <TableRow key={r.id} className="h-11 hover:bg-muted/50">
                      <TableCell className="font-medium">{r.particular}</TableCell>
                      <TableCell className="text-right nums">{formatMoney(r.amount)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.interval > 1 ? `${r.interval} × ` : ""}{titleCase(r.frequency)}
                      </TableCell>
                      <TableCell className="text-sm nums">{fmtDate(r.next_run_date)}</TableCell>
                      <TableCell>
                        {r.auto_approve ? (
                          <Badge variant="outline" className="border-green-200 bg-green-50 text-green-800">On</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Off</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={r.is_active}
                          onCheckedChange={() =>
                            m.toggle.mutate(r.id, { onError: (e) => err(e, "Could not update") })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit"
                            onClick={() => { setEditing(r); setFormOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                            title="Delete" onClick={() => setDeleteTarget(r)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <RecurringFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        categories={categories}
        saving={m.create.isPending || m.update.isPending}
        onSave={(body) => {
          const opts = {
            onSuccess: () => { toast({ title: editing ? "Template updated" : "Template created" }); setFormOpen(false); },
            onError: (e: unknown) => err(e, "Could not save template"),
          };
          if (editing) m.update.mutate({ id: editing.id, body }, opts);
          else m.create.mutate(body, opts);
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete recurring template?</AlertDialogTitle>
            <AlertDialogDescription>
              Expenses already generated from "{deleteTarget?.particular}" are kept; only the schedule
              is removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                m.remove.mutate(deleteTarget.id, {
                  onSuccess: () => { toast({ title: "Template deleted" }); setDeleteTarget(null); },
                  onError: (e) => err(e, "Could not delete"),
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RecurringFormSheet({
  open,
  onOpenChange,
  editing,
  categories,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: RecurringExpense | null;
  categories: { id: string; name: string }[];
  onSave: (body: any) => void;
  saving: boolean;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState(() => blankRecurring());
  const { accounts, loading: accountsLoading } = useExpenseAccounts(open);
  const [localCategories, setLocalCategories] = useState(categories);
  useEffect(() => {
    if (!open) return;
    setLocalCategories(categories);
    setF(
      editing
        ? {
            particular: editing.particular,
            amount: String(editing.amount),
            category_id: editing.category?.id ?? "",
            account_id: editing.account?.id ?? "",
            payment_method: editing.payment_method,
            bank_account: editing.bank_account ?? "",
            vendor: editing.vendor ?? "",
            notes: editing.notes ?? "",
            frequency: editing.frequency,
            interval: String(editing.interval),
            start_date: editing.start_date.slice(0, 10),
            end_date: editing.end_date ? editing.end_date.slice(0, 10) : "",
            auto_approve: editing.auto_approve,
          }
        : blankRecurring(),
    );
  }, [open, editing, categories]);

  const showBank = BANKISH.includes(f.payment_method);
  const valid = f.particular.trim().length > 0 && Number(f.amount) > 0;

  return (
    <DetailSheet open={open} onOpenChange={onOpenChange} size="lg">
      <DetailSheetHeader
        title={editing ? "Edit recurring template" : "New recurring template"}
        subtitle="Generates an expense on the schedule below"
      />
      <DetailSheetBody className="space-y-4">
        <Field label="Description">
          <Input value={f.particular} onChange={(e) => setF({ ...f, particular: e.target.value })} className="h-9" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (Rs)">
            <Input type="number" min="0" step="0.01" value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })} className="h-9 nums" />
          </Field>
          <Field label="Payment method">
            <Select value={f.payment_method} onValueChange={(v) => setF({ ...f, payment_method: v as ExpensePaymentMethod })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPENSE_PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{titleCase(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field
          label="Category"
          hint="Labels for reports and filters. Each category gets a linked ledger account under 521 Expenses Control."
        >
          <ExpenseCategorySelect
            value={f.category_id}
            categories={localCategories}
            onChange={(categoryId) => {
              const linked = accounts.find((a) => a.expense_category_id === categoryId);
              setF({ ...f, category_id: categoryId, account_id: f.account_id || linked?.id || "" });
            }}
            onCategoriesChange={(next) => {
              setLocalCategories(next);
              qc.invalidateQueries({ queryKey: qk.expenses.categories });
            }}
            triggerClassName="h-9"
          />
        </Field>
        <Field label="Expense account (Chart of Accounts)">
          <ExpenseAccountSelect
            value={f.account_id}
            accounts={accounts}
            loading={accountsLoading}
            onChange={(accountId) => setF({ ...f, account_id: accountId })}
            triggerClassName="h-9"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Frequency">
            <Select value={f.frequency} onValueChange={(v) => setF({ ...f, frequency: v as typeof f.frequency })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RECURRING_FREQUENCIES.map((x) => <SelectItem key={x} value={x}>{titleCase(x)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Interval">
            <Input type="number" min="1" value={f.interval}
              onChange={(e) => setF({ ...f, interval: e.target.value })} className="h-9 nums" />
          </Field>
        </div>
        {showBank && (
          <Field label="Bank account">
            <Input value={f.bank_account} onChange={(e) => setF({ ...f, bank_account: e.target.value })} className="h-9" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <YmdDatePicker value={f.start_date} onChange={(value) => setF({ ...f, start_date: value })} className="h-9" />
          </Field>
          <Field label="Ends (optional)">
            <YmdDatePicker value={f.end_date} onChange={(value) => setF({ ...f, end_date: value })} className="h-9" />
          </Field>
        </div>
        <Field label="Vendor / paid to">
          <Input value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} className="h-9" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={f.auto_approve} onCheckedChange={(v) => setF({ ...f, auto_approve: v })} />
          Auto-approve generated expenses
        </label>
      </DetailSheetBody>
      <DetailSheetFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          disabled={!valid || saving}
          onClick={() =>
            onSave({
              particular: f.particular.trim(),
              amount: Number(f.amount),
              category_id: f.category_id || null,
              account_id: f.account_id || null,
              payment_method: f.payment_method,
              bank_account: showBank ? f.bank_account.trim() || null : null,
              vendor: f.vendor.trim() || null,
              notes: f.notes.trim() || null,
              frequency: f.frequency,
              interval: Math.max(1, Number(f.interval) || 1),
              start_date: f.start_date,
              end_date: f.end_date || null,
              auto_approve: f.auto_approve,
            })
          }
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {editing ? "Save changes" : "Create template"}
        </Button>
      </DetailSheetFooter>
    </DetailSheet>
  );
}

function blankRecurring() {
  return {
    particular: "",
    amount: "",
    category_id: "",
    account_id: "",
    payment_method: "CASH" as ExpensePaymentMethod,
    bank_account: "",
    vendor: "",
    notes: "",
    frequency: "MONTHLY" as (typeof RECURRING_FREQUENCIES)[number],
    interval: "1",
    start_date: today(),
    end_date: "",
    auto_approve: false,
  };
}

/* =========================== Categories tab =========================== */

function CategoriesTab({ toast }: { toast: Toast }) {
  const { categories, isLoading } = useExpenseCategories();
  const m = useExpenseCategoryMutations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; description: string | null } | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const err = (e: unknown, t: string) =>
    toast({ variant: "destructive", title: t, description: extractApiError(e, t) });

  const openNew = () => { setEditing(null); setName(""); setDescription(""); setDialogOpen(true); };
  const openEdit = (c: { id: string; name: string; description: string | null }) => {
    setEditing(c); setName(c.name); setDescription(c.description ?? ""); setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Group expenses for reporting.</p>
        <Button size="sm" className="h-9" onClick={openNew}>
          <Plus className="mr-1.5 h-4 w-4" />
          New category
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-11 w-full animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <div className="m-4 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12">
              <p className="text-sm text-muted-foreground">No categories yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wide">Name</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Description</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide">In use</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Active</TableHead>
                    <TableHead className="w-[90px] text-right text-xs uppercase tracking-wide">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((c) => (
                    <TableRow key={c.id} className="h-11 hover:bg-muted/50">
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.description || "—"}</TableCell>
                      <TableCell className="text-right text-sm nums">
                        {c.expense_count + c.recurring_count}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={c.is_active}
                          onCheckedChange={() =>
                            m.toggle.mutate(c.id, { onError: (e) => err(e, "Could not update") })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit"
                            onClick={() => openEdit(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive" title="Delete"
                            onClick={() => setDeleteTarget(c)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
            </Field>
            <Field label="Description (optional)">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-9" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={name.trim().length < 2 || m.create.isPending || m.update.isPending}
              onClick={() => {
                const body = { name: name.trim(), description: description.trim() || undefined };
                const opts = {
                  onSuccess: () => { toast({ title: editing ? "Category updated" : "Category created" }); setDialogOpen(false); },
                  onError: (e: unknown) => err(e, "Could not save category"),
                };
                if (editing) m.update.mutate({ id: editing.id, body }, opts);
                else m.create.mutate(body, opts);
              }}
            >
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Only categories with no expenses or templates can be deleted. Otherwise deactivate it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                m.remove.mutate(deleteTarget.id, {
                  onSuccess: () => { toast({ title: "Category deleted" }); setDeleteTarget(null); },
                  onError: (e) => err(e, "Could not delete category"),
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ============================ Reports tab ============================ */

function ReportsTab() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const { data, isLoading } = useExpenseReport({ from, to });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="From">
          <YmdDatePicker value={from} onChange={setFrom} className="h-9" />
        </Field>
        <Field label="To">
          <YmdDatePicker value={to} onChange={setTo} className="h-9" />
        </Field>
      </div>

      {isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <>
          <InventoryKpiGrid
            columns={2}
            items={[
              { label: "Total spend", value: formatMoney(data.summary.total), icon: FileText },
              { label: "Transactions", value: String(data.summary.count), icon: Clock },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <ReportTable
              title="By category"
              rows={data.byCategory.map((r) => ({ label: r.category, amount: r.amount, count: r.count }))}
              total={data.summary.total}
            />
            <ReportTable
              title="By payment method"
              rows={data.byPaymentMethod.map((r) => ({ label: titleCase(r.method), amount: r.amount, count: r.count }))}
              total={data.summary.total}
            />
            <ReportTable
              title="By status"
              rows={data.byStatus.map((r) => ({ label: titleCase(r.status), amount: r.amount, count: r.count }))}
              total={data.summary.total}
            />
            <ReportTable
              title="By month"
              rows={data.byMonth.map((r) => ({ label: r.month, amount: r.amount }))}
              total={data.summary.total}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ReportTable({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { label: string; amount: number; count?: number }[];
  total: number;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">No data</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const pct = total > 0 ? Math.round((r.amount / total) * 100) : 0;
              return (
                <div key={r.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate text-foreground">
                      {r.label}
                      {r.count != null && (
                        <span className="ml-1.5 text-xs text-muted-foreground">({r.count})</span>
                      )}
                    </span>
                    <span className="font-medium nums">{formatMoney(r.amount)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
