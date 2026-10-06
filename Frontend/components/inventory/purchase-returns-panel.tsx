"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet";
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
import { Ban, Check, FileText, Loader2, Plus, Search, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty } from "@/components/inventory/stock-ops/export-utils";
import {
  usePurchaseReturns,
  usePurchaseReturnMutations,
} from "@/hooks/queries/use-purchase-returns";
import {
  fetchReturnableBills,
  PR_STATUSES,
  type PurchaseReturn,
  type ReturnableBill,
  type ReturnableBillLine,
} from "@/lib/api/purchase-returns";

type Supplier = { id: string; name: string };
type Branch = { id: string; name: string };

type ReturnDraftLine = {
  purchase_id: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  unit_cost: number;
  returnable_qty: number;
  on_hand: number;
  selected: boolean;
  quantity: string;
};

function titleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function billLabel(b: ReturnableBill) {
  const date = fmtDate(b.purchase_date);
  const inv = b.invoice_ref?.trim() || "No invoice #";
  return `${date} · ${inv} · ${b.line_count} item${b.line_count === 1 ? "" : "s"} · Rs ${formatMoney(b.returnable_value)}`;
}

function billHeadline(b: ReturnableBill) {
  const inv = b.invoice_ref?.trim() || "Direct stock in";
  return `${fmtDate(b.purchase_date)} · ${inv}`;
}

function matchesProductQuery(line: ReturnableBillLine, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    line.product_name.toLowerCase().includes(q) ||
    (line.sku?.toLowerCase().includes(q) ?? false)
  );
}

function matchesBillQuery(b: ReturnableBill, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const inv = (b.invoice_ref || "").toLowerCase();
  const date = fmtDate(b.purchase_date).toLowerCase();
  return inv.includes(q) || date.includes(q) || billLabel(b).toLowerCase().includes(q);
}

type BillPickMode = "bill" | "product";

function maxReturnQty(line: Pick<ReturnDraftLine, "returnable_qty" | "on_hand">) {
  return Math.max(0, Math.min(line.returnable_qty, Math.max(0, line.on_hand)));
}

export function PurchaseReturnsPanel({
  suppliers,
  branches,
}: {
  suppliers: Supplier[];
  branches: Branch[];
  /** @deprecated Returns are bill-linked; catalog products are not used. */
  products?: unknown;
  productsLoading?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [supplierId, setSupplierId] = useState("all");
  const [status, setStatus] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PurchaseReturn | null>(null);

  const { purchaseReturns, meta, isFirstLoad, isRefreshing, refetch } = usePurchaseReturns({
    page,
    limit: 20,
    supplierId: supplierId === "all" ? undefined : supplierId,
    status: status === "all" ? undefined : (status as (typeof PR_STATUSES)[number]),
  });
  const m = usePurchaseReturnMutations();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Purchase returns</h2>
          <p className="text-xs text-slate-500">
            Return items from a previous supplier bill — not from the full catalog
          </p>
        </div>
        <Button
          size="sm"
          className="h-9 bg-rose-600 text-white hover:bg-rose-700"
          onClick={() => setFormOpen(true)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New return
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-600">Supplier</Label>
          <Select
            value={supplierId}
            onValueChange={(v) => {
              setSupplierId(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-[200px] bg-white">
              <SelectValue placeholder="Supplier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suppliers</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-600">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-[150px] bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PR_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {titleCase(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => refetch()}
          disabled={isRefreshing}
        >
          {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
        {meta?.summary?.totalReturned != null ? (
          <p className="ml-auto text-xs text-slate-500">
            Returned value{" "}
            <span className="font-semibold tabular-nums text-slate-900">
              Rs {formatMoney(meta.summary.totalReturned)}
            </span>
          </p>
        ) : null}
      </div>

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {isFirstLoad ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
              <p className="text-sm text-slate-500">Loading returns…</p>
            </div>
          ) : purchaseReturns.length === 0 ? (
            <div className="m-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 py-12">
              <Undo2 className="h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-800">No purchase returns yet</p>
              <p className="text-xs text-slate-500">
                Pick a previous supplier bill, then return only those items
              </p>
              <Button size="sm" className="mt-2 h-8" onClick={() => setFormOpen(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                New return
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="pl-5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Return #
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Supplier
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Branch
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Date
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Reason
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Amount
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Status
                    </TableHead>
                    <TableHead className="pr-4 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseReturns.map((r) => (
                    <TableRow key={r.id} className="border-slate-100">
                      <TableCell className="pl-5 font-mono text-xs text-slate-800">
                        {r.return_number}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-slate-900">
                        {r.supplier?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {r.branch?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-slate-600">
                        {fmtDate(r.return_date)}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm text-slate-600">
                        {r.reason || "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums text-slate-900">
                        Rs {formatMoney(r.total_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-semibold",
                            r.status === "COMPLETED" &&
                              "border-emerald-200 bg-emerald-50 text-emerald-800",
                            r.status === "CANCELLED" &&
                              "border-rose-200 bg-rose-50 text-rose-800",
                            r.status === "PENDING" &&
                              "border-amber-200 bg-amber-50 text-amber-800",
                          )}
                        >
                          {titleCase(r.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex justify-end">
                          {r.status === "COMPLETED" ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-rose-700"
                              title="Cancel return"
                              onClick={() => setCancelTarget(r)}
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {meta && meta.totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
              <p className="text-xs text-slate-500">
                Page {meta.page} of {meta.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ReturnFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        suppliers={suppliers}
        branches={branches}
        saving={m.create.isPending}
        onSave={(body) => {
          m.create.mutate(body, {
            onSuccess: () => {
              toast.success("Purchase return recorded");
              setFormOpen(false);
            },
            onError: (e: any) =>
              toast.error(e?.response?.data?.message || "Could not record return"),
          });
        }}
      />

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {cancelTarget?.return_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Returned stock will be added back to the branch and the supplier payable restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!cancelTarget) return;
                m.cancel.mutate(cancelTarget.id, {
                  onSuccess: () => {
                    toast.success("Return cancelled");
                    setCancelTarget(null);
                  },
                  onError: (e: any) =>
                    toast.error(e?.response?.data?.message || "Could not cancel"),
                });
              }}
            >
              Cancel return
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function toDraftLines(
  lines: ReturnableBillLine[],
  options?: { onlyMatchingProductQuery?: string },
): ReturnDraftLine[] {
  const q = options?.onlyMatchingProductQuery?.trim().toLowerCase();
  return lines.map((l) => {
    const max = maxReturnQty(l);
    const productMatch = !q || matchesProductQuery(l, q);
    const selected = max > 0 && productMatch;
    return {
      purchase_id: l.purchase_id,
      product_id: l.product_id,
      product_name: l.product_name,
      sku: l.sku,
      unit_cost: l.unit_cost,
      returnable_qty: l.returnable_qty,
      on_hand: l.on_hand,
      selected,
      quantity: selected ? String(max) : "0",
    };
  });
}

function ReturnFormSheet({
  open,
  onOpenChange,
  suppliers,
  branches,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suppliers: Supplier[];
  branches: Branch[];
  onSave: (body: {
    supplier_id: string;
    branch_id: string;
    return_date?: string;
    reason?: string | null;
    items: {
      product_id: string;
      quantity: number;
      unit_cost: number;
      purchase_id: string;
    }[];
  }) => void;
  saving: boolean;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [reason, setReason] = useState("");
  const [bills, setBills] = useState<ReturnableBill[]>([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [billId, setBillId] = useState("");
  const [draftLines, setDraftLines] = useState<ReturnDraftLine[]>([]);
  const [billPickMode, setBillPickMode] = useState<BillPickMode>("product");
  const [billSearch, setBillSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setSupplierId("");
    setBranchId(branches[0]?.id ?? "");
    setReason("");
    setBills([]);
    setBillId("");
    setDraftLines([]);
    setBillPickMode("product");
    setBillSearch("");
    setProductSearch("");
  }, [open, branches]);

  useEffect(() => {
    if (!open || !supplierId || !branchId) {
      setBills([]);
      setBillId("");
      setDraftLines([]);
      return;
    }

    const ac = new AbortController();
    setBillsLoading(true);
    setBillId("");
    setDraftLines([]);
    setBillSearch("");
    setProductSearch("");

    void fetchReturnableBills(supplierId, branchId, ac.signal)
      .then((rows) => {
        setBills(rows);
      })
      .catch((e: any) => {
        if (ac.signal.aborted) return;
        setBills([]);
        toast.error(e?.response?.data?.message || "Could not load supplier bills");
      })
      .finally(() => {
        if (!ac.signal.aborted) setBillsLoading(false);
      });

    return () => ac.abort();
  }, [open, supplierId, branchId]);

  const selectedBill = useMemo(
    () => bills.find((b) => b.bill_group_id === billId) || null,
    [bills, billId],
  );

  const billsFilteredByBillSearch = useMemo(
    () => bills.filter((b) => matchesBillQuery(b, billSearch)),
    [bills, billSearch],
  );

  const billsByProductSearch = useMemo(() => {
    const q = productSearch.trim();
    if (!q) {
      return bills.map((bill) => ({ bill, matches: bill.lines }));
    }
    return bills
      .map((bill) => ({
        bill,
        matches: bill.lines.filter((l) => matchesProductQuery(l, q)),
      }))
      .filter((row) => row.matches.length > 0);
  }, [bills, productSearch]);

  const selectReturnBill = (bill: ReturnableBill, productQueryForPreselect?: string) => {
    setBillId(bill.bill_group_id);
    setDraftLines(
      toDraftLines(bill.lines, {
        onlyMatchingProductQuery: productQueryForPreselect,
      }),
    );
  };

  const selectedLines = draftLines.filter((l) => l.selected && Number(l.quantity) > 0);
  const total = selectedLines.reduce(
    (a, l) => a + (Number(l.quantity) || 0) * l.unit_cost,
    0,
  );

  const lineErrors = draftLines.filter((l) => {
    if (!l.selected) return false;
    const qty = Number(l.quantity) || 0;
    const max = maxReturnQty(l);
    return qty <= 0 || qty > max + 1e-9;
  });

  const valid =
    Boolean(supplierId && branchId && billId) &&
    selectedLines.length > 0 &&
    lineErrors.length === 0;

  const stepDone = {
    supplier: Boolean(supplierId && branchId),
    bill: Boolean(billId),
    lines: selectedLines.length > 0,
  };

  return (
    <DetailSheet open={open} onOpenChange={onOpenChange} size="xl">
      <DetailSheetHeader
        title="New purchase return"
        subtitle="Return only items from a previous supplier bill"
      />
      <DetailSheetBody className="space-y-4">
        <ol className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {(
            [
              { n: 1, label: "Supplier & branch", done: stepDone.supplier, active: !stepDone.supplier },
              { n: 2, label: "Pick bill", done: stepDone.bill, active: stepDone.supplier && !stepDone.bill },
              { n: 3, label: "Qty to return", done: stepDone.lines, active: stepDone.bill && !stepDone.lines },
            ] as const
          ).map((step, idx) => (
            <li key={step.n} className="flex items-center gap-1">
              {idx > 0 ? <span className="mx-1 text-slate-300">→</span> : null}
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium",
                  step.done
                    ? "bg-emerald-100 text-emerald-800"
                    : step.active
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-500",
                )}
              >
                {step.done ? <Check className="h-3 w-3" strokeWidth={3} /> : step.n}
                {step.label}
              </span>
            </li>
          ))}
        </ol>

        <div className="grid grid-cols-1 gap-2.5 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs text-slate-600">
              Supplier <span className="text-red-500">*</span>
            </Label>
            <Select
              value={supplierId}
              onValueChange={(v) => {
                setSupplierId(v);
                setBillId("");
                setDraftLines([]);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Choose supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-600">
              From branch <span className="text-red-500">*</span>
            </Label>
            <Select
              value={branchId}
              onValueChange={(v) => {
                setBranchId(v);
                setBillId("");
                setDraftLines([]);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-600">Reason</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Damaged / wrong item / expired"
              className="h-9"
            />
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/40 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-500" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Find supplier bill</p>
                <p className="text-[11px] text-slate-500">
                  Search by product name or by bill / invoice — then pick the bill to return from
                </p>
              </div>
            </div>
            {billId && selectedBill ? (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                Selected · {billHeadline(selectedBill)}
              </Badge>
            ) : null}
          </div>

          {!supplierId || !branchId ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Choose supplier and branch to load their purchase bills.
            </p>
          ) : billsLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading bills…
            </div>
          ) : bills.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-500">
              No returnable bills for this supplier at this branch.
            </p>
          ) : (
            <>
              <div
                role="tablist"
                aria-label="How to find a bill"
                className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={billPickMode === "product"}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    billPickMode === "product"
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900",
                  )}
                  onClick={() => setBillPickMode("product")}
                >
                  By product
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={billPickMode === "bill"}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    billPickMode === "bill"
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900",
                  )}
                  onClick={() => setBillPickMode("bill")}
                >
                  By bill / invoice
                </button>
              </div>

              {billPickMode === "product" ? (
                <div className="space-y-2">
                  <Label className="text-xs text-slate-600">
                    Product name or SKU
                  </Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder='e.g. "dress", Maria B, SKU…'
                      className="h-9 bg-white pl-9"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Shows every bill that received this product so you know which delivery to return
                    from.
                  </p>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
                    {(productSearch.trim()
                      ? billsByProductSearch
                      : bills.map((bill) => ({ bill, matches: bill.lines }))
                    ).map(({ bill, matches }) => {
                      const selected = bill.bill_group_id === billId;
                      return (
                        <div
                          key={bill.bill_group_id}
                          className={cn(
                            "rounded-lg border bg-white p-3 transition-colors",
                            selected
                              ? "border-emerald-400 ring-1 ring-emerald-200"
                              : "border-slate-200 hover:border-slate-300",
                          )}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">
                                {bill.invoice_ref?.trim() || "Direct stock in"}
                              </p>
                              <p className="text-xs text-slate-500">{billHeadline(bill)}</p>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {bill.line_count} line{bill.line_count === 1 ? "" : "s"} · Rs{" "}
                                {formatMoney(bill.returnable_value)} returnable
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant={selected ? "default" : "outline"}
                              className={cn(
                                "h-8 shrink-0 text-xs",
                                selected && "bg-emerald-600 hover:bg-emerald-700",
                              )}
                              onClick={() =>
                                selectReturnBill(
                                  bill,
                                  productSearch.trim() ? productSearch : undefined,
                                )
                              }
                            >
                              {selected ? "Selected" : "Use this bill"}
                            </Button>
                          </div>
                          <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                            {(productSearch.trim() ? matches : matches.slice(0, 4)).map((line) => (
                              <li
                                key={line.purchase_id}
                                className="flex flex-wrap items-center justify-between gap-x-2 text-xs text-slate-700"
                              >
                                <span className="min-w-0 truncate font-medium">
                                  {line.product_name}
                                  {line.sku ? (
                                    <span className="ml-1 font-mono font-normal text-slate-400">
                                      {line.sku}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="shrink-0 tabular-nums text-slate-500">
                                  returnable {formatQty(line.returnable_qty)} · on hand{" "}
                                  {formatQty(line.on_hand)}
                                </span>
                              </li>
                            ))}
                            {!productSearch.trim() && matches.length > 4 ? (
                              <li className="text-[11px] text-slate-400">
                                +{matches.length - 4} more — search a product to narrow down
                              </li>
                            ) : null}
                          </ul>
                        </div>
                      );
                    })}
                    {productSearch.trim() && billsByProductSearch.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-500">
                        No bills contain &quot;{productSearch.trim()}&quot; for this supplier at
                        this branch.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs text-slate-600">Invoice # or date</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={billSearch}
                      onChange={(e) => setBillSearch(e.target.value)}
                      placeholder="Search invoice reference or date…"
                      className="h-9 bg-white pl-9"
                    />
                  </div>
                  <div className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
                    {billsFilteredByBillSearch.map((b) => {
                      const selected = b.bill_group_id === billId;
                      return (
                        <button
                          key={b.bill_group_id}
                          type="button"
                          onClick={() => selectReturnBill(b)}
                          className={cn(
                            "flex w-full flex-col rounded-lg border px-3 py-2.5 text-left transition-colors",
                            selected
                              ? "border-emerald-400 bg-emerald-50/80 ring-1 ring-emerald-200"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                          )}
                        >
                          <span className="text-sm font-medium text-slate-900">
                            {b.invoice_ref?.trim() || "Direct stock in"}
                          </span>
                          <span className="text-xs text-slate-500">{billLabel(b)}</span>
                        </button>
                      );
                    })}
                    {billSearch.trim() && billsFilteredByBillSearch.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-500">
                        No bills match &quot;{billSearch.trim()}&quot;.
                      </p>
                    ) : null}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {selectedBill ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-slate-900">Bill lines</p>
                <p className="text-[11px] text-slate-500">
                  Tick items and set qty (max = min of returnable &amp; on hand)
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  setDraftLines((rows) =>
                    rows.map((r) => {
                      const max = maxReturnQty(r);
                      return { ...r, selected: max > 0, quantity: max > 0 ? String(max) : "0" };
                    }),
                  )
                }
              >
                Select all returnable
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 pl-3" />
                    <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">
                      Product
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-500">
                      Bought
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-500">
                      Left
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-500">
                      On hand
                    </TableHead>
                    <TableHead className="w-28 text-right text-[11px] uppercase tracking-wider text-slate-500">
                      Return qty
                    </TableHead>
                    <TableHead className="pr-3 text-right text-[11px] uppercase tracking-wider text-slate-500">
                      Credit
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draftLines.map((line) => {
                    const max = maxReturnQty(line);
                    const qty = Number(line.quantity) || 0;
                    const over = line.selected && (qty <= 0 || qty > max + 1e-9);
                    const source = selectedBill.lines.find((l) => l.purchase_id === line.purchase_id);
                    return (
                      <TableRow
                        key={line.purchase_id}
                        className={cn(!line.selected && "opacity-60", over && "bg-rose-50/50")}
                      >
                        <TableCell className="pl-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={line.selected}
                            disabled={max <= 0}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setDraftLines((rows) =>
                                rows.map((r) =>
                                  r.purchase_id === line.purchase_id
                                    ? {
                                        ...r,
                                        selected: checked,
                                        quantity: checked
                                          ? r.quantity === "0"
                                            ? String(max)
                                            : r.quantity
                                          : "0",
                                      }
                                    : r,
                                ),
                              );
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium text-slate-900">{line.product_name}</p>
                          {line.sku ? (
                            <p className="font-mono text-[11px] text-slate-500">{line.sku}</p>
                          ) : null}
                          <p className="text-[11px] tabular-nums text-slate-500">
                            Cost Rs {formatMoney(line.unit_cost)}
                          </p>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-slate-700">
                          {formatQty(source?.purchased_qty ?? 0)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-medium text-emerald-700">
                          {formatQty(line.returnable_qty)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-slate-700">
                          {formatQty(line.on_hand)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            max={max}
                            step="0.01"
                            disabled={!line.selected || max <= 0}
                            value={line.quantity}
                            onChange={(e) => {
                              const next = e.target.value;
                              setDraftLines((rows) =>
                                rows.map((r) =>
                                  r.purchase_id === line.purchase_id
                                    ? { ...r, quantity: next, selected: true }
                                    : r,
                                ),
                              );
                            }}
                            className={cn(
                              "ml-auto h-8 w-24 text-right text-sm tabular-nums",
                              over && "border-rose-500",
                            )}
                          />
                        </TableCell>
                        <TableCell className="pr-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                          {line.selected ? formatMoney(qty * line.unit_cost) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {lineErrors.length > 0 ? (
              <p className="border-t border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                Fix return qty — cannot exceed returnable or stock on hand.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end text-sm">
          <span className="text-slate-500">Credit to supplier&nbsp;</span>
          <span className="font-semibold tabular-nums text-slate-900">
            Rs {formatMoney(total)}
          </span>
        </div>
      </DetailSheetBody>
      <DetailSheetFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          disabled={!valid || saving}
          className="bg-rose-600 text-white hover:bg-rose-700"
          onClick={() =>
            onSave({
              supplier_id: supplierId,
              branch_id: branchId,
              reason: reason.trim() || null,
              items: selectedLines.map((l) => ({
                product_id: l.product_id,
                quantity: Number(l.quantity),
                unit_cost: l.unit_cost,
                purchase_id: l.purchase_id,
              })),
            })
          }
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Record return
        </Button>
      </DetailSheetFooter>
    </DetailSheet>
  );
}
