"use client";

/**
 * Orders — reference conversion for the POS refactor (see
 * docs/POS_REFACTOR_GUIDE.md). Patterns to copy elsewhere:
 *  - list + detail data via TanStack Query hooks (hooks/queries/use-orders.ts),
 *    no apiClient calls in effects, no Zustand
 *  - the "view a record" modal is a DetailSheet, not a <Dialog>
 *  - the create form is >6 fields with a line-item table, so it is also a
 *    DetailSheet (form in the body), not a <Dialog>
 *  - <PageHeader> / <PageBody>, design tokens, `nums` for money, no emoji
 */

import React, { useMemo, useState } from "react";
import {
  Plus,
  Loader2,
  Trash2,
  Eye,
  RefreshCcw,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

import { useOrders, useOrder, useOrderMutations } from "@/hooks/queries/use-orders";
import { useCustomers } from "@/hooks/queries/use-customers";
import { useProducts } from "@/hooks/queries/use-products";
import { formatProductSearchLabel } from "@/lib/labelBarcode";
import { extractApiError } from "@/lib/api/errors";

const STATUSES = ["PENDING", "PROCESSING", "COMPLETED"] as const;
const PAYMENT_METHODS = ["CASH", "CARD", "MOBILE_MONEY"] as const;

const money = (v: unknown) => `Rs ${(Number(v) || 0).toFixed(2)}`;
const day = (iso: string) => iso.split("T")[0];

type FormItem = { productId: string; quantity: number };
const emptyForm = () => ({
  customerId: "",
  paymentMethod: "CASH" as string,
  items: [{ productId: "", quantity: 1 }] as FormItem[],
});

const Orders: React.FC = () => {
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

  const { orders, isFirstLoad, isRefreshing, refetch } = useOrders(
    statusFilter ? { status: statusFilter } : {},
  );
  const { create, setStatus, cancel } = useOrderMutations();

  // ----- create panel -----
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [customerQuery, setCustomerQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [debouncedCustomerQuery, setDebouncedCustomerQuery] = useState("");
  const [debouncedProductQuery, setDebouncedProductQuery] = useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedCustomerQuery(customerQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [customerQuery]);
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedProductQuery(productQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [productQuery]);

  const { customers } = useCustomers(
    { search: debouncedCustomerQuery || undefined, page: 1, limit: 20 },
    { enabled: isAddOpen },
  );
  const { products } = useProducts(
    { search: debouncedProductQuery || undefined, isActive: true, page: 1, limit: 20 },
    { enabled: isAddOpen },
  );

  // ----- detail panel -----
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailOpen = detailId !== null;
  const { data: detailOrder, isLoading: detailLoading } = useOrder(detailId, {
    enabled: detailOpen,
  });

  const filtered = useMemo(
    () =>
      orders.filter((o) =>
        o.order_number.toLowerCase().includes(searchTerm.trim().toLowerCase()),
      ),
    [orders, searchTerm],
  );

  const stats = useMemo(
    () => ({
      total: orders.length,
      revenue: orders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0),
      pending: orders.filter((o) => o.status === "PENDING").length,
    }),
    [orders],
  );

  const formValid =
    form.customerId && form.items.every((i) => i.productId && i.quantity > 0);

  const submit = () => {
    create.mutate(
      { customerId: form.customerId, paymentMethod: form.paymentMethod, items: form.items },
      {
        onSuccess: () => {
          toast({ title: "Order created" });
          setIsAddOpen(false);
          setForm(emptyForm());
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Could not create order",
            description: extractApiError(e, "Failed to create order"),
          }),
      },
    );
  };

  const changeStatus = (id: string, status: string) =>
    setStatus.mutate(
      { id, status },
      {
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Status update failed",
            description: extractApiError(e, "Failed to update status"),
          }),
      },
    );

  const remove = (id: string) =>
    cancel.mutate(id, {
      onSuccess: () => toast({ title: "Order cancelled" }),
      onError: (e) =>
        toast({
          variant: "destructive",
          title: "Cancel failed",
          description: extractApiError(e, "Failed to cancel order"),
        }),
    });

  return (
    <>
      <PageHeader
        title="Orders"
        description={`${stats.total} order${stats.total === 1 ? "" : "s"}`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefreshing}
            >
              <RefreshCcw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" onClick={() => setIsAddOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New order
            </Button>
          </>
        }
      />

      <PageBody className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(
            [
              { label: "Total orders", value: stats.total, icon: ShoppingBag },
              { label: "Revenue", value: money(stats.revenue), icon: null },
              { label: "Pending", value: stats.pending, icon: null },
            ] as const
          ).map((s) => (
            <Card key={s.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {s.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isFirstLoad ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <div className="text-xl font-semibold nums">{s.value}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search order #"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="status-filter" className="text-xs text-muted-foreground">
              Status
            </Label>
            <Select
              value={statusFilter || "ALL"}
              onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}
            >
              <SelectTrigger id="status-filter" className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s[0] + s.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm">
              Orders <span className="text-muted-foreground">({filtered.length})</span>
            </CardTitle>
            {isRefreshing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </CardHeader>
          <CardContent className="p-0">
            {isFirstLoad ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="m-4 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12">
                <ShoppingBag className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No orders found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs uppercase tracking-wide">Order #</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wide">
                        Total
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">Date</TableHead>
                      <TableHead className="w-[104px] text-xs uppercase tracking-wide">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((o) => (
                      <TableRow key={o.id} className="h-11">
                        <TableCell className="font-medium">{o.order_number}</TableCell>
                        <TableCell className="text-right font-medium nums">
                          {money(o.total_amount)}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={o.status}
                            onValueChange={(v) => changeStatus(o.id, v)}
                          >
                            <SelectTrigger className="h-8 w-[140px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground nums">
                          {day(o.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1.5">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => setDetailId(o.id)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => remove(o.id)}
                              disabled={cancel.isPending}
                            >
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
      </PageBody>

      {/* Create order — form is large (customer + payment + N item rows), so a
          DetailSheet, not a Dialog. */}
      <DetailSheet open={isAddOpen} onOpenChange={setIsAddOpen} size="lg">
        <DetailSheetHeader title="New order" subtitle="Create a customer order" />
        <DetailSheetBody className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Customer</Label>
            <Input
              placeholder="Search customers…"
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              className="h-9"
            />
            <Select
              value={form.customerId || "none"}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, customerId: v === "none" ? "" : v }))
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select customer</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name || c.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Payment method</Label>
            <Select
              value={form.paymentMethod}
              onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((pm) => (
                  <SelectItem key={pm} value={pm}>
                    {pm.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Items</Label>
              <Input
                placeholder="Search products…"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                className="h-8 w-40 text-xs"
              />
            </div>
            {form.items.map((item, idx) => (
              <div key={idx} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Select
                    value={item.productId || "none"}
                    onValueChange={(v) =>
                      setForm((f) => {
                        const items = [...f.items];
                        items[idx] = { ...items[idx], productId: v === "none" ? "" : v };
                        return { ...f, items };
                      })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select product</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {formatProductSearchLabel(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) =>
                    setForm((f) => {
                      const items = [...f.items];
                      items[idx] = { ...items[idx], quantity: Number(e.target.value) };
                      return { ...f, items };
                    })
                  }
                  className="h-9 w-20 nums"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shrink-0"
                  onClick={() =>
                    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
                  }
                  disabled={form.items.length === 1}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setForm((f) => ({ ...f, items: [...f.items, { productId: "", quantity: 1 }] }))
              }
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add item
            </Button>
          </div>
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={() => setIsAddOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!formValid || create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create order
          </Button>
        </DetailSheetFooter>
      </DetailSheet>

      {/* View order */}
      <DetailSheet
        open={detailOpen}
        onOpenChange={(o) => !o && setDetailId(null)}
        size="md"
      >
        <DetailSheetHeader
          title={detailOrder ? detailOrder.order_number : "Order"}
          subtitle={detailOrder ? day(detailOrder.created_at) : undefined}
          icon={<ShoppingBag className="h-5 w-5" />}
        />
        <DetailSheetBody className="space-y-5">
          {detailLoading || !detailOrder ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
                <Field label="Status" value={detailOrder.status} />
                <Field label="Date" value={day(detailOrder.created_at)} />
                <Field
                  label="Total"
                  value={money(detailOrder.total_amount)}
                  strong
                />
                <Field label="Items" value={String(detailOrder.items.length)} />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Line items
                </Label>
                <Table className="mt-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs uppercase tracking-wide">Product</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wide">
                        Qty
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailOrder.items.map((it) => (
                      <TableRow key={it.productId} className="h-10">
                        <TableCell className="text-sm">{it.product.name}</TableCell>
                        <TableCell className="text-right text-sm nums">{it.quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={() => setDetailId(null)}>
            Close
          </Button>
        </DetailSheetFooter>
      </DetailSheet>
    </>
  );
};

function Field({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm ${strong ? "font-semibold nums" : ""}`}>{value}</p>
    </div>
  );
}

export default Orders;
