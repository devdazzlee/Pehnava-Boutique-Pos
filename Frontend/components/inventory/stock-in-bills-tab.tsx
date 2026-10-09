"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Loader2,
  Search,
  Receipt,
  Trash2,
  Pencil,
  Plus,
  Save,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty } from "@/components/inventory/stock-ops/export-utils";
import {
  StockProductPicker,
  type StockLineItem,
  type StockPickerProduct,
} from "@/components/inventory/stock-ops/stock-product-picker";
import {
  buildPurchaseNotes,
  parsePurchaseNotes,
} from "@/components/inventory/purchases-notes";
import { billInvoiceLabel } from "@/components/inventory/stock-in-bill-utils";
import {
  StockInDeleteConfirmDialog,
  type StockInDeleteConfirmState,
} from "@/components/inventory/stock-in-delete-confirm-dialog";

type BillListRow = {
  id: string;
  bill_group_id?: string | null;
  purchase_date: string;
  invoice_ref?: string | null;
  quantity: number | string;
  value?: number;
  line_count?: number;
  supplier?: { name?: string | null } | null;
  warehouse_branch?: { name?: string | null } | null;
  lines?: Array<{ product?: { name?: string | null; sku?: string | null } | null }>;
};

type BillLineDetail = {
  id: string;
  product?: { id?: string; name?: string | null; sku?: string | null } | null;
  quantity: number | string;
  cost_price: number | string;
  sale_price?: number | string;
};

type BillDetail = {
  id: string;
  invoice_ref?: string | null;
  purchase_date: string;
  delivery_status?: string | null;
  notes?: string | null;
  supplier?: { name?: string | null } | null;
  warehouse_branch?: { name?: string | null } | null;
  bill_lines?: BillLineDetail[];
  bill_value?: number;
  bill_quantity?: number;
};

interface StockInBillsTabProps {
  products: StockPickerProduct[];
  categories: Array<{ id: string; name: string }>;
  productsLoading?: boolean;
  suppliers: Array<{ id: string; name: string }>;
  branches: Array<{ id: string; name: string }>;
  onDataChanged?: () => void;
}

export function StockInBillsTab({
  products,
  categories,
  productsLoading,
  suppliers,
  branches,
  onDataChanged,
}: StockInBillsTabProps) {
  const [bills, setBills] = useState<BillListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BillDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [invoiceRef, setInvoiceRef] = useState("");
  const [lineEdits, setLineEdits] = useState<
    Array<{ id: string; name: string; quantity: string; costPrice: string }>
  >([]);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addLines, setAddLines] = useState<StockLineItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<StockInDeleteConfirmState | null>(
    null,
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: 1,
        limit: 100,
        groupBy: "bill",
      };
      if (filterSupplier !== "all") params.supplierId = filterSupplier;
      if (filterBranch !== "all") params.branchId = filterBranch;
      if (debouncedSearch) params.search = debouncedSearch;
      const res = await apiClient.get(`${API_BASE}/purchases`, { params });
      setBills(res.data?.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to load bills");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterBranch, filterSupplier]);

  useEffect(() => {
    void fetchBills();
  }, [fetchBills]);

  const loadBillDetail = useCallback(async (anchorId: string) => {
    setSelectedAnchorId(anchorId);
    setDetailLoading(true);
    setEditing(false);
    setAddOpen(false);
    setAddLines([]);
    try {
      const res = await apiClient.get(`${API_BASE}/purchases/${anchorId}`);
      const d = res.data?.data as BillDetail;
      setDetail(d);
      setInvoiceRef(d?.invoice_ref?.trim() || "");
      const lines = d?.bill_lines?.length ? d.bill_lines : d ? [d as unknown as BillLineDetail] : [];
      setLineEdits(
        lines.map((l) => ({
          id: l.id,
          name: l.product?.name || "Product",
          quantity: String(Number(l.quantity) || 0),
          costPrice: String(Number(l.cost_price) || 0),
        })),
      );
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to load bill");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshDetail = useCallback(async () => {
    if (!selectedAnchorId) return;
    await loadBillDetail(selectedAnchorId);
    await fetchBills();
    onDataChanged?.();
  }, [selectedAnchorId, loadBillDetail, fetchBills, onDataChanged]);

  const saveBillEdits = async () => {
    if (!detail || lineEdits.length === 0) return;
    for (const line of lineEdits) {
      const qty = Number(line.quantity);
      const cost = Number(line.costPrice);
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error(`Invalid quantity for ${line.name}`);
        return;
      }
      if (!Number.isFinite(cost) || cost < 0) {
        toast.error(`Invalid cost for ${line.name}`);
        return;
      }
    }

    setSaving(true);
    try {
      const parsed = parsePurchaseNotes(detail.notes);
      const notes = buildPurchaseNotes({
        batchNo: parsed.batchNo,
        expiryDate: parsed.expiryDate,
        source: parsed.source,
        payment: parsed.payment,
        userNotes: parsed.userNotes,
      });
      const purchaseDateIso = detail.purchase_date
        ? new Date(detail.purchase_date).toISOString()
        : undefined;

      await Promise.all(
        lineEdits.map((line) =>
          apiClient.patch(`${API_BASE}/purchases/${line.id}`, {
            quantity: Number(line.quantity),
            costPrice: Number(line.costPrice),
            salePrice: Number(line.costPrice),
            purchaseDate: purchaseDateIso,
            invoiceRef: invoiceRef.trim() || null,
            notes,
            deliveryStatus:
              (detail.delivery_status || "COMPLETE").toUpperCase() === "PARTIAL"
                ? "PARTIAL"
                : "COMPLETE",
          }),
        ),
      );
      toast.success("Bill updated · stock, supplier ledger & payments synced");
      setEditing(false);
      await refreshDetail();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to save bill");
    } finally {
      setSaving(false);
    }
  };

  const requestRemoveLine = (lineId: string, productName: string) => {
    setDeleteConfirm({
      kind: "line",
      id: lineId,
      title: "Remove this line from the bill?",
      description: (
        <>
          <p>
            <span className="font-medium text-slate-800">{productName}</span> will be removed.
          </p>
          <p>Branch stock and supplier ledger will be updated.</p>
        </>
      ),
    });
  };

  const requestDeleteWholeBill = () => {
    if (!selectedAnchorId || !detail) return;
    const label = billInvoiceLabel(detail.invoice_ref);
    setDeleteConfirm({
      kind: "bill",
      anchorId: selectedAnchorId,
      title: "Delete entire supplier bill?",
      description: (
        <>
          <p>
            Bill <span className="font-mono font-medium text-slate-800">{label}</span> and all
            lines will be removed.
          </p>
          <p>Stock and linked payments will be reversed. This cannot be undone.</p>
        </>
      ),
    });
  };

  const confirmDelete = async (target: StockInDeleteConfirmState) => {
    try {
      if (target.kind === "line") {
        await apiClient.delete(`${API_BASE}/purchases/${target.id}`);
        toast.success("Line removed · stock & supplier ledger synced");
        if (lineEdits.length <= 1) {
          setSelectedAnchorId(null);
          setDetail(null);
          await fetchBills();
          onDataChanged?.();
          return;
        }
        await refreshDetail();
      } else {
        await apiClient.delete(`${API_BASE}/purchases/bills/${target.anchorId}`);
        toast.success("Bill deleted · stock & supplier ledger synced");
        setSelectedAnchorId(null);
        setDetail(null);
        await fetchBills();
        onDataChanged?.();
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Could not complete delete");
      throw e;
    }
  };

  const submitAddProducts = async () => {
    if (!selectedAnchorId || addLines.length === 0) return;
    setAdding(true);
    try {
      for (const line of addLines) {
        await apiClient.post(`${API_BASE}/purchases/bills/${selectedAnchorId}/lines`, {
          productId: line.productId,
          quantity: Number(line.quantity) || 0,
          costPrice: Number(line.unitCost) || 0,
        });
      }
      toast.success(
        addLines.length === 1
          ? "Product added to bill"
          : `${addLines.length} products added to bill`,
      );
      setAddOpen(false);
      setAddLines([]);
      await refreshDetail();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to add products");
    } finally {
      setAdding(false);
    }
  };

  const billListHint = useMemo(
    () =>
      selectedAnchorId
        ? "Edit lines, add products, or delete the whole bill on the right."
        : "Select a bill to change products, quantities, or invoice number.",
    [selectedAnchorId],
  );

  return (
    <>
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <Card className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-900">All supplier bills</h2>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">{billListHint}</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="relative sm:col-span-3">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Invoice, product, supplier…"
                className="h-9 pl-8 text-sm"
              />
            </div>
            <Select value={filterSupplier} onValueChange={setFilterSupplier}>
              <SelectTrigger className="h-9 text-sm">
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
            <Select value={filterBranch} onValueChange={setFilterBranch}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="h-9 text-sm"
              onClick={() => void fetchBills()}
              disabled={loading}
            >
              Refresh
            </Button>
          </div>
        </div>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
            </div>
          ) : bills.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">No bills found.</p>
          ) : (
            <ul className="max-h-[min(70vh,640px)] divide-y divide-slate-100 overflow-y-auto">
              {bills.map((b) => {
                const lineCount = Number(b.line_count) || b.lines?.length || 1;
                const qty = Number(b.quantity) || 0;
                const value = b.value != null ? Number(b.value) : 0;
                const selected = selectedAnchorId === b.id;
                const ts = new Date(b.purchase_date);
                return (
                  <li key={b.bill_group_id || b.id}>
                    <button
                      type="button"
                      onClick={() => void loadBillDetail(b.id)}
                      className={cn(
                        "flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-slate-50",
                        selected && "bg-emerald-50/80 ring-1 ring-inset ring-emerald-200",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          Invoice:{" "}
                          <span className="font-mono">{billInvoiceLabel(b.invoice_ref)}</span>
                        </p>
                        <span className="shrink-0 text-xs font-bold tabular-nums text-slate-900">
                          Rs {formatMoney(value)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        {ts.toLocaleDateString()} · {lineCount} line{lineCount === 1 ? "" : "s"} ·{" "}
                        {formatQty(qty)} units
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {b.supplier?.name || "—"} · {b.warehouse_branch?.name || "—"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Bill editor</h2>
            <p className="text-[11px] text-slate-500">
              Change invoice #, edit qty/cost, add or remove products
            </p>
          </div>
          {detail && !detailLoading ? (
            <div className="flex flex-wrap gap-1.5">
              {!editing ? (
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setEditing(true)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Edit
                </Button>
              ) : (
                <>
                  <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>
                    <X className="mr-1 h-3.5 w-3.5" />
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => void saveBillEdits()}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                    Save
                  </Button>
                </>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => {
                  setAddOpen((v) => !v);
                  setAddLines([]);
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add product
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={requestDeleteWholeBill}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Delete bill
              </Button>
            </div>
          ) : null}
        </div>
        <CardContent className="p-0">
          {!selectedAnchorId ? (
            <p className="px-4 py-16 text-center text-sm text-slate-500">
              Select a bill from the list to manage its products.
            </p>
          ) : detailLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
            </div>
          ) : !detail ? (
            <p className="px-4 py-16 text-center text-sm text-red-600">Could not load this bill.</p>
          ) : (
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Supplier invoice #</Label>
                  <Input
                    value={invoiceRef}
                    onChange={(e) => setInvoiceRef(e.target.value)}
                    disabled={!editing}
                    className="h-9 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1 text-sm text-slate-600">
                  <p>
                    <span className="text-slate-500">Supplier · </span>
                    {detail.supplier?.name || "—"}
                  </p>
                  <p>
                    <span className="text-slate-500">Branch · </span>
                    {detail.warehouse_branch?.name || "—"}
                  </p>
                </div>
              </div>

              {addOpen ? (
                <div className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50/40 p-3">
                  <StockProductPicker
                    layout="stack"
                    products={products}
                    categories={categories}
                    loading={productsLoading}
                    lines={addLines}
                    onLinesChange={setAddLines}
                    showUnitCost
                    unitCostLabel="Cost / unit"
                    quantityLabel="Qty"
                    catalogTitle="Add to this bill"
                    cartTitle="New lines"
                    emptyCartHint="Search and pick products to add."
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setAddOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700"
                      disabled={adding || addLines.length === 0}
                      onClick={() => void submitAddProducts()}
                    >
                      {adding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                      Add to bill
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right w-24">Qty</TableHead>
                      <TableHead className="text-right w-28">Cost</TableHead>
                      <TableHead className="text-right w-28">Line total</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineEdits.map((line, idx) => {
                      const qty = Number(line.quantity) || 0;
                      const cost = Number(line.costPrice) || 0;
                      return (
                        <TableRow key={line.id}>
                          <TableCell className="text-sm font-medium text-slate-900">
                            {line.name}
                          </TableCell>
                          <TableCell className="text-right">
                            {editing ? (
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                value={line.quantity}
                                className="ml-auto h-8 w-20 text-right tabular-nums"
                                onChange={(e) =>
                                  setLineEdits((prev) => {
                                    const next = [...prev];
                                    next[idx] = { ...next[idx], quantity: e.target.value };
                                    return next;
                                  })
                                }
                              />
                            ) : (
                              <span className="tabular-nums">{formatQty(qty)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {editing ? (
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                value={line.costPrice}
                                className="ml-auto h-8 w-24 text-right tabular-nums"
                                onChange={(e) =>
                                  setLineEdits((prev) => {
                                    const next = [...prev];
                                    next[idx] = { ...next[idx], costPrice: e.target.value };
                                    return next;
                                  })
                                }
                              />
                            ) : (
                              <span className="tabular-nums">{formatMoney(cost)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {formatMoney(qty * cost)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:bg-red-50"
                              onClick={() => requestRemoveLine(line.id, line.name)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <div className="flex justify-between border-t border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-slate-500">
                    {lineEdits.length} line{lineEdits.length === 1 ? "" : "s"}
                  </span>
                  <span className="font-bold tabular-nums">
                    Rs{" "}
                    {formatMoney(
                      lineEdits.reduce(
                        (s, l) =>
                          s + (Number(l.quantity) || 0) * (Number(l.costPrice) || 0),
                        0,
                      ),
                    )}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                Removing a line or lowering quantity reduces branch stock. You cannot remove stock
                that is no longer on hand, or lines with supplier returns.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>

    <StockInDeleteConfirmDialog
      target={deleteConfirm}
      onOpenChange={(open) => {
        if (!open) setDeleteConfirm(null);
      }}
      onConfirm={confirmDelete}
      confirmLabel="Yes, delete"
    />
    </>
  );
}
