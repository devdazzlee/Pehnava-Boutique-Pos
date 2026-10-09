"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  RefreshCcw,
  Loader2,
  Trash2,
  Pencil,
  Eye,
  PackageCheck,
  X,
  Ban,
  FileText,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateField, YmdDatePicker } from "@/components/ui/date-picker"
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { LoadingButton } from "@/components/ui/loading-button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { extractApiError } from "@/lib/api/errors";

import { useSuppliers } from "@/hooks/queries/use-suppliers";
import { useBranches } from "@/hooks/queries/use-branches";
import { useProducts } from "@/hooks/queries/use-products";
import { formatProductSearchLabel } from "@/lib/labelBarcode";
import {
  usePurchaseOrders,
  usePurchaseOrder,
  usePurchaseOrderMutations,
} from "@/hooks/queries/use-purchase-orders";
import { usePurchaseReturns, usePurchaseReturnMutations } from "@/hooks/queries/use-purchase-returns";
import {
  usePurchaseInvoices,
  usePurchaseInvoice,
  useUninvoicedPurchases,
  usePurchaseInvoiceMutations,
} from "@/hooks/queries/use-purchase-invoices";
import { PO_STATUSES, type PurchaseOrder, type PurchaseOrderStatus } from "@/lib/api/purchase-orders";
import { PR_STATUSES, type PurchaseReturn } from "@/lib/api/purchase-returns";
import {
  PI_STATUSES,
  type PurchaseInvoice,
  type PurchaseInvoiceStatus,
} from "@/lib/api/purchase-invoices";

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : "—");
const titleCase = (s: string) =>
  s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const PO_STATUS_STYLE: Record<string, string> = {
  PENDING: "border-slate-200 bg-slate-50 text-slate-700",
  APPROVED: "border-sky-200 bg-sky-50 text-sky-800",
  ORDERED: "border-blue-200 bg-blue-50 text-blue-800",
  PARTIALLY_RECEIVED: "border-amber-200 bg-amber-50 text-amber-800",
  RECEIVED: "border-green-200 bg-green-50 text-green-800",
  CANCELLED: "border-rose-200 bg-rose-50 text-rose-800",
};

const NEXT_STATUS: Partial<Record<PurchaseOrderStatus, PurchaseOrderStatus>> = {
  PENDING: "APPROVED",
  APPROVED: "ORDERED",
};

type Tab = "orders" | "invoices" | "returns";
type Toast = ReturnType<typeof useToast>["toast"];

const TAB_LABEL: Record<Tab, string> = {
  orders: "Purchase orders",
  invoices: "Invoices",
  returns: "Purchase returns",
};

export function PurchaseOrders() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("orders");
  return (
    <>
      <PageHeader
        title="Purchase Management"
        description="Create a purchase order, receive goods into stock, then raise a supplier invoice. Stock In is a separate shortcut for deliveries without a PO."
      />
      <PageBody className="space-y-5">
        <div
          role="tablist"
          aria-label="Purchase management sections"
          className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1"
        >
          {(["orders", "invoices", "returns"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "rounded-md px-3.5 py-2 text-sm font-medium transition-colors",
                tab === k
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {TAB_LABEL[k]}
            </button>
          ))}
        </div>
        {tab === "orders" && <OrdersTab toast={toast} />}
        {tab === "invoices" && <InvoicesTab toast={toast} />}
        {tab === "returns" && <ReturnsTab toast={toast} />}
      </PageBody>
    </>
  );
}

/* --------------------------- shared: product picker --------------------------- */

function ProductPicker({
  onPick,
}: {
  onPick: (p: { id: string; name: string; price: number }) => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { products, isFetching } = useProducts(
    { search: debounced || undefined, isActive: true, page: 1, limit: 15 },
    { enabled: open && debounced.length > 0 },
  );

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search a product to add…"
          className="h-9 pl-9"
        />
      </div>
      {open && debounced.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {isFetching && products.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
          ) : products.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No matches</p>
          ) : (
            products.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick({ id: p.id, name: p.name, price: Number(p.price) || 0 });
                  setQ("");
                  setOpen(false);
                }}
              >
                <span className="min-w-0 truncate">
                  {formatProductSearchLabel({
                    name: p.name,
                    label_barcode: p.label_barcode,
                    custom_code: p.custom_code,
                    sku: p.sku,
                    code: p.code,
                    barcode: p.barcode,
                    price: p.price,
                    sales_rate_exc_dis_and_tax: p.sales_rate_exc_dis_and_tax,
                  })}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground nums">
                  {formatMoney(Number(p.price) || 0)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ================================ Orders tab ================================ */

function OrdersTab({ toast }: { toast: Toast }) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [supplierId, setSupplierId] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, supplierId, status]);

  const { suppliers } = useSuppliers({ page: 1, limit: 200, isActive: true });
  const { purchaseOrders, meta, isFirstLoad, isRefreshing, refetch } = usePurchaseOrders({
    page,
    limit: 20,
    search: debounced || undefined,
    supplierId: supplierId === "all" ? undefined : supplierId,
    status: status === "all" ? undefined : (status as PurchaseOrderStatus),
  });
  const m = usePurchaseOrderMutations();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseOrder | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PurchaseOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | null>(null);
  const [statusTarget, setStatusTarget] = useState<{
    po: PurchaseOrder;
    next: PurchaseOrderStatus;
  } | null>(null);

  const err = (e: unknown, t: string) =>
    toast({ variant: "destructive", title: t, description: extractApiError(e, t) });

  const busyId =
    (m.setStatus.isPending && m.setStatus.variables?.id) ||
    (m.cancel.isPending && m.cancel.variables) ||
    (m.remove.isPending && m.remove.variables) ||
    (m.receive.isPending && m.receive.variables?.id) ||
    null;

  return (
    <div className="space-y-4">
      <InventoryKpiGrid
        columns={2}
        loading={isFirstLoad}
        items={[
          {
            label: "Outstanding value",
            value: formatMoney(meta?.summary.outstandingValue ?? 0),
            icon: FileText,
            hint: "Open + partially received POs",
          },
          { label: "Open orders", value: String(meta?.summary.openCount ?? 0), icon: PackageCheck },
        ]}
      />

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search PO number or supplier" value={search}
            onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9" />
        </div>
        <Select value={supplierId} onValueChange={setSupplierId}>
          <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Supplier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All suppliers</SelectItem>
            {suppliers.map((s: any) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PO_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <LoadingButton
          variant="outline"
          size="sm"
          className="h-9"
          loading={isRefreshing}
          onClick={() => refetch()}
          aria-label="Refresh"
        >
          <RefreshCcw className="h-4 w-4" />
        </LoadingButton>
        <Button size="sm" className="h-9" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" />
          New order
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
          ) : purchaseOrders.length === 0 ? (
            <div className="m-4 flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
              <FileText className="h-9 w-9 text-muted-foreground/50" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">No purchase orders yet</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  Create a PO when you order from a supplier. Receiving against a PO adds stock.
                  Direct Stock In receipts do not appear here.
                </p>
              </div>
              <Button
                size="sm"
                className="mt-1"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Create first order
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wide">PO #</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Supplier</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Date</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Received</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide">Total</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                    <TableHead className="min-w-[280px] text-right text-xs uppercase tracking-wide">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrders.map((po) => {
                    const ordered = po.purchase_order_items.reduce((a, i) => a + i.ordered_quantity, 0);
                    const received = po.purchase_order_items.reduce((a, i) => a + i.received_quantity, 0);
                    const canReceive = !["RECEIVED", "CANCELLED"].includes(po.status);
                    const canEdit = ["PENDING", "APPROVED", "ORDERED"].includes(po.status);
                    const next = NEXT_STATUS[po.status];
                    const rowBusy = busyId === po.id;
                    return (
                      <TableRow key={po.id} className="h-12 hover:bg-muted/50">
                        <TableCell className="font-mono text-xs">{po.po_number}</TableCell>
                        <TableCell className="text-sm font-medium">{po.supplier?.name ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground nums">{fmtDate(po.order_date)}</TableCell>
                        <TableCell className="text-sm nums">
                          {received} / {ordered}
                        </TableCell>
                        <TableCell className="text-right font-semibold nums">{formatMoney(po.total_amount)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={PO_STATUS_STYLE[po.status]}>
                            {titleCase(po.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs"
                              disabled={rowBusy}
                              onClick={() => setViewId(po.id)}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" />
                              View
                            </Button>
                            {next && (
                              <LoadingButton
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 text-xs"
                                loading={m.setStatus.isPending && m.setStatus.variables?.id === po.id}
                                disabled={rowBusy}
                                onClick={() => setStatusTarget({ po, next })}
                              >
                                Mark {titleCase(next)}
                              </LoadingButton>
                            )}
                            {canReceive && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 text-xs text-green-800 border-green-200 hover:bg-green-50"
                                disabled={rowBusy}
                                onClick={() => setReceiveTarget(po)}
                              >
                                <PackageCheck className="mr-1 h-3.5 w-3.5" />
                                Receive
                              </Button>
                            )}
                            {canEdit && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2 text-xs"
                                disabled={rowBusy}
                                onClick={() => {
                                  setEditing(po);
                                  setFormOpen(true);
                                }}
                              >
                                <Pencil className="mr-1 h-3.5 w-3.5" />
                                Edit
                              </Button>
                            )}
                            {canReceive && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2 text-xs text-rose-700"
                                disabled={rowBusy}
                                onClick={() => setCancelTarget(po)}
                              >
                                <Ban className="mr-1 h-3.5 w-3.5" />
                                Cancel
                              </Button>
                            )}
                            {po.status === "PENDING" && received === 0 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2 text-xs text-destructive"
                                disabled={rowBusy}
                                onClick={() => setDeleteTarget(po)}
                              >
                                <Trash2 className="mr-1 h-3.5 w-3.5" />
                                Delete
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
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">Page {meta.page} of {meta.totalPages} · {meta.total} total</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8" disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                <Button size="sm" variant="outline" className="h-8" disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <POFormSheet
        open={formOpen}
        onOpenChange={(open) => {
          if (!open && (m.create.isPending || m.update.isPending)) return;
          setFormOpen(open);
        }}
        editing={editing}
        suppliers={suppliers}
        saving={m.create.isPending || m.update.isPending}
        onSave={(body) => {
          const opts = {
            onSuccess: () => {
              toast({ title: editing ? "Purchase order updated" : "Purchase order created" });
              setFormOpen(false);
            },
            onError: (e: unknown) => err(e, "Could not save purchase order"),
          };
          if (editing) m.update.mutate({ id: editing.id, body }, opts);
          else m.create.mutate(body, opts);
        }}
      />

      <POViewSheet id={viewId} onClose={() => setViewId(null)} />

      <ReceiveSheet
        po={receiveTarget}
        onClose={() => {
          if (m.receive.isPending) return;
          setReceiveTarget(null);
        }}
        saving={m.receive.isPending}
        onReceive={(body) => {
          if (!receiveTarget) return;
          m.receive.mutate(
            { id: receiveTarget.id, body },
            {
              onSuccess: () => {
                toast({ title: "Stock received into inventory" });
                setReceiveTarget(null);
              },
              onError: (e) => err(e, "Could not receive"),
            },
          );
        }}
      />

      <AlertDialog
        open={!!statusTarget}
        onOpenChange={(o) => {
          if (!o && !m.setStatus.isPending) setStatusTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mark {statusTarget?.po.po_number} as {statusTarget ? titleCase(statusTarget.next) : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget?.next === "APPROVED"
                ? "Confirms this draft is approved and ready to place with the supplier."
                : "Marks the order as placed with the supplier. You can receive stock after this."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={m.setStatus.isPending}>Go back</AlertDialogCancel>
            <AlertDialogAction
              disabled={m.setStatus.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!statusTarget) return;
                m.setStatus.mutate(
                  { id: statusTarget.po.id, status: statusTarget.next },
                  {
                    onSuccess: () => {
                      toast({ title: `Marked ${titleCase(statusTarget.next)}` });
                      setStatusTarget(null);
                    },
                    onError: (errVal) => err(errVal, "Could not update status"),
                  },
                );
              }}
            >
              {m.setStatus.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating…
                </>
              ) : (
                `Confirm ${statusTarget ? titleCase(statusTarget.next) : ""}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(o) => {
          if (!o && !m.cancel.isPending) setCancelTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {cancelTarget?.po_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The order stays on record for history but can no longer receive stock. This cannot be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={m.cancel.isPending}>Keep order</AlertDialogCancel>
            <AlertDialogAction
              disabled={m.cancel.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (!cancelTarget) return;
                m.cancel.mutate(cancelTarget.id, {
                  onSuccess: () => {
                    toast({ title: "Purchase order cancelled" });
                    setCancelTarget(null);
                  },
                  onError: (e2) => err(e2, "Could not cancel"),
                });
              }}
            >
              {m.cancel.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling…
                </>
              ) : (
                "Cancel order"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o && !m.remove.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.po_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This draft order will be permanently removed. Only pending orders with no receipts can be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={m.remove.isPending}>Keep draft</AlertDialogCancel>
            <AlertDialogAction
              disabled={m.remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (!deleteTarget) return;
                m.remove.mutate(deleteTarget.id, {
                  onSuccess: () => {
                    toast({ title: "Purchase order deleted" });
                    setDeleteTarget(null);
                  },
                  onError: (e2) => err(e2, "Could not delete"),
                });
              }}
            >
              {m.remove.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete permanently"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* --------------------------- PO create / edit sheet --------------------------- */

type LineDraft = { product_id: string; name: string; ordered_quantity: string; unit_cost: string };

function POFormSheet({
  open,
  onOpenChange,
  editing,
  suppliers,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: PurchaseOrder | null;
  suppliers: any[];
  onSave: (body: any) => void;
  saving: boolean;
}) {
  const { branches } = useBranches({ isActive: true });
  const [supplierId, setSupplierId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [expected, setExpected] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setSupplierId(editing.supplier?.id ?? "");
      setBranchId(editing.branch?.id ?? "");
      setOrderDate(editing.order_date.slice(0, 10));
      setExpected(editing.expected_delivery ? editing.expected_delivery.slice(0, 10) : "");
      setTaxAmount(String(editing.tax_amount));
      setNotes(editing.notes ?? "");
      setLines(
        editing.purchase_order_items.map((it) => ({
          product_id: it.product_id,
          name: it.product?.name ?? "Product",
          ordered_quantity: String(it.ordered_quantity),
          unit_cost: String(it.unit_cost),
        })),
      );
    } else {
      setSupplierId("");
      setBranchId(branches[0]?.id ?? "");
      setOrderDate(today());
      setExpected("");
      setTaxAmount("0");
      setNotes("");
      setLines([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const subtotal = useMemo(
    () => lines.reduce((a, l) => a + (Number(l.ordered_quantity) || 0) * (Number(l.unit_cost) || 0), 0),
    [lines],
  );
  const total = subtotal + (Number(taxAmount) || 0);
  const valid =
    supplierId &&
    branchId &&
    lines.length > 0 &&
    lines.every((l) => l.product_id && Number(l.ordered_quantity) > 0 && Number(l.unit_cost) >= 0);

  return (
    <DetailSheet open={open} onOpenChange={onOpenChange} size="xl">
      <DetailSheetHeader
        title={editing ? `Edit ${editing.po_number}` : "New purchase order"}
        subtitle="Order goods from a supplier"
      />
      <DetailSheetBody className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId} disabled={!!editing}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Deliver to (warehouse / branch)</Label>
            <Select value={branchId} onValueChange={setBranchId} disabled={!!editing}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>
                {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DateField label="Order date" value={orderDate} onChange={setOrderDate} triggerClassName="h-9" />
          <DateField label="Expected delivery" value={expected} onChange={setExpected} triggerClassName="h-9" />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Line items</Label>
          <ProductPicker
            onPick={(p) => {
              setLines((ls) =>
                ls.some((l) => l.product_id === p.id)
                  ? ls
                  : [...ls, { product_id: p.id, name: p.name, ordered_quantity: "1", unit_cost: String(p.price) }],
              );
            }}
          />
          {lines.length === 0 ? (
            <p className="rounded-md border border-dashed py-4 text-center text-xs text-muted-foreground">
              Search above to add products
            </p>
          ) : (
            <div className="space-y-1.5">
              {lines.map((l, idx) => (
                <div key={l.product_id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{l.name}</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={l.ordered_quantity}
                    onChange={(e) =>
                      setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, ordered_quantity: e.target.value } : x)))
                    }
                    className="h-8 w-20 nums"
                    aria-label="Quantity"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={l.unit_cost}
                    onChange={(e) =>
                      setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, unit_cost: e.target.value } : x)))
                    }
                    className="h-8 w-24 nums"
                    aria-label="Unit cost"
                  />
                  <span className="w-24 shrink-0 text-right text-sm nums">
                    {formatMoney((Number(l.ordered_quantity) || 0) * (Number(l.unit_cost) || 0))}
                  </span>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0"
                    onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Tax amount</Label>
            <Input type="number" min="0" step="0.01" value={taxAmount}
              onChange={(e) => setTaxAmount(e.target.value)} className="h-9 nums" />
          </div>
          <div className="flex items-end justify-end pb-1 text-sm">
            <span className="text-muted-foreground">Subtotal&nbsp;</span>
            <span className="font-medium nums">{formatMoney(subtotal)}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="text-muted-foreground">Total&nbsp;</span>
            <span className="font-semibold nums">{formatMoney(total)}</span>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[70px] text-sm" />
        </div>
      </DetailSheetBody>
      <DetailSheetFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <LoadingButton
          loading={saving}
          loadingText={editing ? "Saving…" : "Creating…"}
          disabled={!valid || saving}
          onClick={() =>
            onSave({
              supplier_id: supplierId,
              branch_id: branchId,
              order_date: orderDate,
              expected_delivery: expected || null,
              tax_amount: Number(taxAmount) || 0,
              notes: notes.trim() || null,
              items: lines.map((l) => ({
                product_id: l.product_id,
                ordered_quantity: Number(l.ordered_quantity),
                unit_cost: Number(l.unit_cost),
              })),
            })
          }
        >
          {editing ? "Save changes" : "Create order"}
        </LoadingButton>
      </DetailSheetFooter>
    </DetailSheet>
  );
}

/* ------------------------------- PO view sheet ------------------------------- */

function POViewSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: po, isLoading } = usePurchaseOrder(id, { enabled: !!id });
  return (
    <DetailSheet open={!!id} onOpenChange={(o) => !o && onClose()} size="lg">
      <DetailSheetHeader
        title={po ? po.po_number : "Purchase order"}
        subtitle={po ? `${po.supplier?.name} · ${fmtDate(po.order_date)}` : undefined}
        icon={<FileText className="h-5 w-5" />}
      />
      <DetailSheetBody className="space-y-4">
        {isLoading || !po ? (
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded bg-muted" />
            <div className="h-40 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Status</p><p>{titleCase(po.status)}</p></div>
              <div><p className="text-xs text-muted-foreground">Deliver to</p><p>{po.branch?.name ?? "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Expected</p><p className="nums">{fmtDate(po.expected_delivery)}</p></div>
              <div><p className="text-xs text-muted-foreground">Received</p><p className="nums">{fmtDate(po.delivery_date)}</p></div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wide">Product</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide">Ordered</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide">Received</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide">Unit cost</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {po.purchase_order_items.map((it) => (
                  <TableRow key={it.id} className="h-10">
                    <TableCell className="text-sm">{it.product?.name ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm nums">{it.ordered_quantity}</TableCell>
                    <TableCell className="text-right text-sm nums">{it.received_quantity}</TableCell>
                    <TableCell className="text-right text-sm nums">{formatMoney(it.unit_cost)}</TableCell>
                    <TableCell className="text-right text-sm nums">{formatMoney(it.total_cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end gap-4 text-sm">
              <span className="text-muted-foreground">Subtotal {formatMoney(po.subtotal)}</span>
              <span className="text-muted-foreground">Tax {formatMoney(po.tax_amount)}</span>
              <span className="font-semibold">Total {formatMoney(po.total_amount)}</span>
            </div>
            {po.notes && <p className="text-sm text-muted-foreground">{po.notes}</p>}
          </>
        )}
      </DetailSheetBody>
      <DetailSheetFooter>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </DetailSheetFooter>
    </DetailSheet>
  );
}

/* ------------------------------- receive sheet ------------------------------- */

function ReceiveSheet({
  po,
  onClose,
  onReceive,
  saving,
}: {
  po: PurchaseOrder | null;
  onClose: () => void;
  onReceive: (body: { invoice_ref?: string; notes?: string; lines: { item_id: string; quantity: number }[] }) => void;
  saving: boolean;
}) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [invoiceRef, setInvoiceRef] = useState("");
  useEffect(() => {
    if (!po) return;
    const next: Record<string, string> = {};
    for (const it of po.purchase_order_items) {
      const outstanding = it.ordered_quantity - it.received_quantity;
      next[it.id] = outstanding > 0 ? String(outstanding) : "0";
    }
    setQty(next);
    setInvoiceRef("");
  }, [po]);

  if (!po) return null;
  const lines = po.purchase_order_items
    .map((it) => ({
      item_id: it.id,
      outstanding: it.ordered_quantity - it.received_quantity,
      quantity: Number(qty[it.id]) || 0,
      name: it.product?.name ?? "Product",
    }))
    .filter((l) => l.outstanding > 0);
  const anything = lines.some((l) => l.quantity > 0);
  const overReceiving = lines.some((l) => l.quantity > l.outstanding + 1e-9);

  return (
    <DetailSheet
      open={!!po}
      onOpenChange={(o) => {
        if (!o && saving) return;
        if (!o) onClose();
      }}
      size="lg"
    >
      <DetailSheetHeader title={`Receive ${po.po_number}`} subtitle={po.supplier?.name} icon={<PackageCheck className="h-5 w-5" />} />
      <DetailSheetBody className="space-y-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Supplier invoice / GRN reference</Label>
          <Input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)}
            placeholder={po.po_number} className="h-9" />
        </div>
        {lines.length === 0 ? (
          <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            Everything on this order has already been received.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs uppercase tracking-wide">Product</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wide">Outstanding</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wide">Receive now</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.item_id} className="h-11">
                  <TableCell className="text-sm">{l.name}</TableCell>
                  <TableCell className="text-right text-sm nums">{l.outstanding}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min="0"
                      max={l.outstanding}
                      step="0.01"
                      value={qty[l.item_id] ?? ""}
                      onChange={(e) => setQty((q) => ({ ...q, [l.item_id]: e.target.value }))}
                      className="ml-auto h-8 w-24 nums"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {overReceiving && (
          <p className="text-xs text-destructive">One or more quantities exceed what's outstanding.</p>
        )}
      </DetailSheetBody>
      <DetailSheetFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <LoadingButton
          loading={saving}
          loadingText="Receiving…"
          disabled={!anything || overReceiving || saving}
          onClick={() =>
            onReceive({
              invoice_ref: invoiceRef.trim() || undefined,
              lines: lines.filter((l) => l.quantity > 0).map((l) => ({ item_id: l.item_id, quantity: l.quantity })),
            })
          }
        >
          Receive into stock
        </LoadingButton>
      </DetailSheetFooter>
    </DetailSheet>
  );
}

/* =============================== Returns tab =============================== */

function ReturnsTab({ toast }: { toast: Toast }) {
  const [supplierId, setSupplierId] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [supplierId, status]);

  const { suppliers } = useSuppliers({ page: 1, limit: 200, isActive: true });
  const { purchaseReturns, meta, isFirstLoad, isRefreshing, refetch } = usePurchaseReturns({
    page,
    limit: 20,
    supplierId: supplierId === "all" ? undefined : supplierId,
    status: status === "all" ? undefined : (status as any),
  });
  const m = usePurchaseReturnMutations();
  const [formOpen, setFormOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PurchaseReturn | null>(null);
  const err = (e: unknown, t: string) =>
    toast({ variant: "destructive", title: t, description: extractApiError(e, t) });

  return (
    <div className="space-y-4">
      <InventoryKpiGrid
        columns={1}
        loading={isFirstLoad}
        items={[
          { label: "Returned to suppliers (filtered)", value: formatMoney(meta?.summary.totalReturned ?? 0), icon: Undo2 },
        ]}
      />

      <div className="flex flex-wrap items-end gap-2">
        <Select value={supplierId} onValueChange={setSupplierId}>
          <SelectTrigger className="h-9 w-[200px]"><SelectValue placeholder="Supplier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All suppliers</SelectItem>
            {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PR_STATUSES.map((s) => <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-9" onClick={() => refetch()} disabled={isRefreshing}>
          <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
        </Button>
        <Button size="sm" className="h-9" onClick={() => setFormOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New return
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isFirstLoad ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-11 w-full animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : purchaseReturns.length === 0 ? (
            <div className="m-4 flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
              <Undo2 className="h-9 w-9 text-muted-foreground/50" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">No purchase returns</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  Returns are recorded from Stock In → Returns, linked to a previous supplier bill.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wide">Return #</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Supplier</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Date</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Reason</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide">Amount</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                    <TableHead className="w-[80px] text-right text-xs uppercase tracking-wide">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseReturns.map((r) => (
                    <TableRow key={r.id} className="h-11 hover:bg-muted/50">
                      <TableCell className="font-mono text-xs">{r.return_number}</TableCell>
                      <TableCell className="text-sm font-medium">{r.supplier?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground nums">{fmtDate(r.return_date)}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{r.reason || "—"}</TableCell>
                      <TableCell className="text-right font-semibold nums">{formatMoney(r.total_amount)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            r.status === "COMPLETED"
                              ? "border-green-200 bg-green-50 text-green-800"
                              : r.status === "CANCELLED"
                                ? "border-rose-200 bg-rose-50 text-rose-800"
                                : "border-amber-200 bg-amber-50 text-amber-800"
                          }
                        >
                          {titleCase(r.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          {r.status === "COMPLETED" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs text-rose-700"
                              disabled={m.cancel.isPending && m.cancel.variables === r.id}
                              onClick={() => setCancelTarget(r)}
                            >
                              <Ban className="mr-1 h-3.5 w-3.5" />
                              Cancel
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">Page {meta.page} of {meta.totalPages}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8" disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                <Button size="sm" variant="outline" className="h-8" disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ReturnFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        suppliers={suppliers}
        saving={m.create.isPending}
        onSave={(body) => {
          m.create.mutate(body, {
            onSuccess: () => { toast({ title: "Purchase return recorded" }); setFormOpen(false); },
            onError: (e) => err(e, "Could not record return"),
          });
        }}
      />

      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(o) => {
          if (!o && !m.cancel.isPending) setCancelTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {cancelTarget?.return_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The returned stock will be added back to the branch and the supplier's payable restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={m.cancel.isPending}>Keep return</AlertDialogCancel>
            <AlertDialogAction
              disabled={m.cancel.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (!cancelTarget) return;
                m.cancel.mutate(cancelTarget.id, {
                  onSuccess: () => {
                    toast({ title: "Return cancelled" });
                    setCancelTarget(null);
                  },
                  onError: (e2) => err(e2, "Could not cancel"),
                });
              }}
            >
              {m.cancel.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling…
                </>
              ) : (
                "Cancel return"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ReturnFormSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suppliers: any[];
  onSave: (body: any) => void;
  saving: boolean;
}) {
  return (
    <DetailSheet open={open} onOpenChange={onOpenChange} size="lg">
      <DetailSheetHeader
        title="New purchase return"
        subtitle="Returns must be linked to a previous supplier bill"
      />
      <DetailSheetBody className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Use Stock In → Returns</p>
          <p className="mt-1 text-xs text-amber-900/90">
            Pick the supplier, choose a previous bill, then return only those purchased lines.
            Free catalog returns are blocked so quantities stay tied to real purchases.
          </p>
        </div>
      </DetailSheetBody>
      <DetailSheetFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DetailSheetFooter>
    </DetailSheet>
  );
}

/* =============================== Invoices tab =============================== */

const PI_STATUS_STYLE: Record<string, string> = {
  UNPAID: "border-rose-200 bg-rose-50 text-rose-800",
  PARTIALLY_PAID: "border-amber-200 bg-amber-50 text-amber-800",
  PAID: "border-green-200 bg-green-50 text-green-800",
};

function InvoicesTab({ toast }: { toast: Toast }) {
  const [supplierId, setSupplierId] = useState("all");
  const [status, setStatus] = useState("all");
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [supplierId, status, overdue]);

  const { suppliers } = useSuppliers({ page: 1, limit: 200, isActive: true });
  const { invoices, meta, isFirstLoad, isRefreshing, refetch } = usePurchaseInvoices({
    page,
    limit: 20,
    supplierId: supplierId === "all" ? undefined : supplierId,
    status: status === "all" ? undefined : (status as PurchaseInvoiceStatus),
    overdue: overdue || undefined,
  });
  const m = usePurchaseInvoiceMutations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseInvoice | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseInvoice | null>(null);
  const err = (e: unknown, t: string) =>
    toast({ variant: "destructive", title: t, description: extractApiError(e, t) });
  const aging = meta?.summary.aging;

  return (
    <div className="space-y-4">
      <InventoryKpiGrid
        columns={4}
        loading={isFirstLoad}
        items={[
          { label: "Outstanding payable", value: formatMoney(meta?.summary.outstanding ?? 0), icon: FileText },
          { label: "Current", value: formatMoney(aging?.current ?? 0), icon: PackageCheck },
          { label: "1–60 days", value: formatMoney((aging?.d1_30 ?? 0) + (aging?.d31_60 ?? 0)), icon: PackageCheck, tone: "warning" },
          { label: "60+ days", value: formatMoney(aging?.d60_plus ?? 0), icon: Ban, tone: "danger" },
        ]}
      />

      <div className="flex flex-wrap items-end gap-2">
        <Select value={supplierId} onValueChange={setSupplierId}>
          <SelectTrigger className="h-9 w-[200px]"><SelectValue placeholder="Supplier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All suppliers</SelectItem>
            {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PI_STATUSES.map((s) => <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />
          Overdue only
        </label>
        <Button variant="outline" size="sm" className="h-9" onClick={() => refetch()} disabled={isRefreshing}>
          <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
        </Button>
        <Button size="sm" className="h-9" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" />
          New invoice
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isFirstLoad ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-11 w-full animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="m-4 flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
              <FileText className="h-9 w-9 text-muted-foreground/50" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">No purchase invoices</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  After stock is received, create an invoice against those deliveries so the supplier balance is tracked.
                </p>
              </div>
              <Button
                size="sm"
                className="mt-1"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Create invoice
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wide">Invoice #</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Supplier</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Date</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Due</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide">Total</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide">Balance</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                    <TableHead className="w-[110px] text-right text-xs uppercase tracking-wide">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => {
                    const overdueRow =
                      inv.status !== "PAID" && inv.due_date && new Date(inv.due_date) < new Date();
                    return (
                      <TableRow key={inv.id} className="h-11 hover:bg-muted/50">
                        <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                        <TableCell className="text-sm font-medium">{inv.supplier?.name ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground nums">{fmtDate(inv.invoice_date)}</TableCell>
                        <TableCell className={cn("text-sm nums", overdueRow ? "font-semibold text-rose-700" : "text-muted-foreground")}>
                          {fmtDate(inv.due_date)}
                        </TableCell>
                        <TableCell className="text-right font-semibold nums">{formatMoney(inv.total_amount)}</TableCell>
                        <TableCell className="text-right nums">{formatMoney(inv.balance_due)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={PI_STATUS_STYLE[inv.status]}>
                            {titleCase(inv.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs"
                              onClick={() => setViewId(inv.id)}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" />
                              View
                            </Button>
                            {inv.amount_paid === 0 && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-xs"
                                  onClick={() => {
                                    setEditing(inv);
                                    setFormOpen(true);
                                  }}
                                >
                                  <Pencil className="mr-1 h-3.5 w-3.5" />
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-xs text-destructive"
                                  disabled={m.remove.isPending && m.remove.variables === inv.id}
                                  onClick={() => setDeleteTarget(inv)}
                                >
                                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                                  Delete
                                </Button>
                              </>
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
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">Page {meta.page} of {meta.totalPages}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8" disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                <Button size="sm" variant="outline" className="h-8" disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <InvoiceFormSheet
        open={formOpen}
        onOpenChange={(open) => {
          if (!open && (m.create.isPending || m.update.isPending)) return;
          setFormOpen(open);
        }}
        editing={editing}
        suppliers={suppliers}
        saving={m.create.isPending || m.update.isPending}
        onSave={(body) => {
          const opts = {
            onSuccess: () => { toast({ title: editing ? "Invoice updated" : "Invoice created" }); setFormOpen(false); },
            onError: (e: unknown) => err(e, "Could not save invoice"),
          };
          if (editing) m.update.mutate({ id: editing.id, body }, opts);
          else m.create.mutate(body, opts);
        }}
      />

      <InvoiceViewSheet id={viewId} onClose={() => setViewId(null)} />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o && !m.remove.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invoice {deleteTarget?.invoice_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The linked deliveries return to "uninvoiced". Only possible while no payment is recorded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={m.remove.isPending}>Keep invoice</AlertDialogCancel>
            <AlertDialogAction
              disabled={m.remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (!deleteTarget) return;
                m.remove.mutate(deleteTarget.id, {
                  onSuccess: () => {
                    toast({ title: "Invoice deleted" });
                    setDeleteTarget(null);
                  },
                  onError: (e2) => err(e2, "Could not delete"),
                });
              }}
            >
              {m.remove.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete permanently"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InvoiceFormSheet({
  open,
  onOpenChange,
  editing,
  suppliers,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: PurchaseInvoice | null;
  suppliers: any[];
  onSave: (body: any) => void;
  saving: boolean;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setSupplierId(editing.supplier?.id ?? "");
      setInvoiceNumber(editing.invoice_number);
      setInvoiceDate(editing.invoice_date.slice(0, 10));
      setDueDate(editing.due_date ? editing.due_date.slice(0, 10) : "");
      setTaxAmount(String(editing.tax_amount));
      setDiscountAmount(String(editing.discount_amount));
      setNotes(editing.notes ?? "");
      setPicked(new Set(editing.purchases.map((p) => p.id)));
    } else {
      setSupplierId("");
      setInvoiceNumber("");
      setInvoiceDate(today());
      setDueDate("");
      setTaxAmount("0");
      setDiscountAmount("0");
      setNotes("");
      setPicked(new Set());
    }
  }, [open, editing]);

  const { data: uninvoiced = [], isLoading } = useUninvoicedPurchases(supplierId || null, {
    enabled: open && !!supplierId,
  });
  // In edit mode the invoice's own deliveries are already linked, so also list them.
  const rows = useMemo(() => {
    if (!editing) return uninvoiced;
    const own = editing.purchases.map((p) => ({
      id: p.id,
      product: p.product,
      quantity: p.quantity,
      cost_price: p.cost_price,
      line_total: p.line_total,
      purchase_date: p.purchase_date,
      invoice_ref: null,
      po_number: null,
    }));
    const seen = new Set(own.map((r) => r.id));
    return [...own, ...uninvoiced.filter((r) => !seen.has(r.id))];
  }, [editing, uninvoiced]);

  const subtotal = rows
    .filter((r) => picked.has(r.id))
    .reduce((a, r) => a + r.line_total, 0);
  const total = subtotal + (Number(taxAmount) || 0) - (Number(discountAmount) || 0);
  const valid = supplierId && invoiceNumber.trim() && picked.size > 0 && total >= 0;

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <DetailSheet open={open} onOpenChange={onOpenChange} size="xl">
      <DetailSheetHeader
        title={editing ? `Edit invoice ${editing.invoice_number}` : "New purchase invoice"}
        subtitle="Bill the supplier for received deliveries"
      />
      <DetailSheetBody className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Supplier</Label>
            <Select value={supplierId} onValueChange={(v) => { setSupplierId(v); setPicked(new Set()); }} disabled={!!editing}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Supplier invoice number</Label>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Invoice date</Label>
            <YmdDatePicker value={invoiceDate} onChange={setInvoiceDate} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Due date</Label>
            <YmdDatePicker value={dueDate} onChange={setDueDate} className="h-9" />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Deliveries to bill</Label>
          {!supplierId ? (
            <p className="rounded-md border border-dashed py-4 text-center text-xs text-muted-foreground">
              Pick a supplier first
            </p>
          ) : isLoading ? (
            <div className="h-24 animate-pulse rounded bg-muted" />
          ) : rows.length === 0 ? (
            <p className="rounded-md border border-dashed py-4 text-center text-xs text-muted-foreground">
              No uninvoiced deliveries for this supplier
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead className="text-xs uppercase tracking-wide">Product</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Received</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide">Qty</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide">Cost</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className="h-10 cursor-pointer" onClick={() => toggle(r.id)}>
                      <TableCell>
                        <input type="checkbox" checked={picked.has(r.id)} readOnly />
                      </TableCell>
                      <TableCell className="text-sm">{r.product?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground nums">{fmtDate(r.purchase_date)}</TableCell>
                      <TableCell className="text-right text-sm nums">{r.quantity}</TableCell>
                      <TableCell className="text-right text-sm nums">{formatMoney(r.cost_price)}</TableCell>
                      <TableCell className="text-right text-sm nums">{formatMoney(r.line_total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Tax</Label>
            <Input type="number" min="0" step="0.01" value={taxAmount}
              onChange={(e) => setTaxAmount(e.target.value)} className="h-9 nums" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Discount</Label>
            <Input type="number" min="0" step="0.01" value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)} className="h-9 nums" />
          </div>
        </div>
        <div className="flex justify-end gap-4 text-sm">
          <span className="text-muted-foreground">Subtotal {formatMoney(subtotal)}</span>
          <span className="font-semibold">Total {formatMoney(total)}</span>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px] text-sm" />
        </div>
      </DetailSheetBody>
      <DetailSheetFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <LoadingButton
          loading={saving}
          loadingText={editing ? "Saving…" : "Creating…"}
          disabled={!valid || saving}
          onClick={() =>
            onSave({
              supplier_id: supplierId,
              invoice_number: invoiceNumber.trim(),
              invoice_date: invoiceDate,
              due_date: dueDate || null,
              tax_amount: Number(taxAmount) || 0,
              discount_amount: Number(discountAmount) || 0,
              notes: notes.trim() || null,
              purchase_ids: [...picked],
            })
          }
        >
          {editing ? "Save changes" : "Create invoice"}
        </LoadingButton>
      </DetailSheetFooter>
    </DetailSheet>
  );
}

function InvoiceViewSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: inv, isLoading } = usePurchaseInvoice(id, { enabled: !!id });
  return (
    <DetailSheet open={!!id} onOpenChange={(o) => !o && onClose()} size="lg">
      <DetailSheetHeader
        title={inv ? inv.invoice_number : "Invoice"}
        subtitle={inv ? `${inv.supplier?.name} · ${fmtDate(inv.invoice_date)}` : undefined}
        icon={<FileText className="h-5 w-5" />}
      />
      <DetailSheetBody className="space-y-4">
        {isLoading || !inv ? (
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded bg-muted" />
            <div className="h-40 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Status</p><p>{titleCase(inv.status)}</p></div>
              <div><p className="text-xs text-muted-foreground">Due</p><p className="nums">{fmtDate(inv.due_date)}</p></div>
              <div><p className="text-xs text-muted-foreground">Balance</p><p className="font-semibold nums">{formatMoney(inv.balance_due)}</p></div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wide">Product</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide">Qty</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide">Cost</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inv.purchases.map((p) => (
                  <TableRow key={p.id} className="h-10">
                    <TableCell className="text-sm">{p.product?.name ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm nums">{p.quantity}</TableCell>
                    <TableCell className="text-right text-sm nums">{formatMoney(p.cost_price)}</TableCell>
                    <TableCell className="text-right text-sm nums">{formatMoney(p.line_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-col items-end gap-0.5 text-sm">
              <span className="text-muted-foreground">Subtotal {formatMoney(inv.subtotal)}</span>
              <span className="text-muted-foreground">Tax {formatMoney(inv.tax_amount)}</span>
              <span className="text-muted-foreground">Discount {formatMoney(inv.discount_amount)}</span>
              <span className="font-semibold">Total {formatMoney(inv.total_amount)}</span>
              <span className="text-green-700">Paid {formatMoney(inv.amount_paid)}</span>
            </div>
            {inv.notes && <p className="text-sm text-muted-foreground">{inv.notes}</p>}
            <p className="text-xs text-muted-foreground">
              Record payments against this invoice from the supplier's Ledger tab.
            </p>
          </>
        )}
      </DetailSheetBody>
      <DetailSheetFooter>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </DetailSheetFooter>
    </DetailSheet>
  );
}
