"use client";

import React, { useEffect, useMemo, useState } from "react";
import { SalespersonPicker, useSalespeople } from "@/components/salesperson-picker";
import apiClient from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { usePosData } from "@/hooks/use-pos-data";
import { useAllPosProducts } from "@/hooks/queries/use-products";

const PAYMENT_METHODS = [
  "CASH",
  "CARD",
  "MOBILE_MONEY",
  "BANK_TRANSFER",
  "CREDIT",
] as const;

export type EditableSale = {
  id: string;
  sale_number: string;
  payment_method: string;
  payment_status?: string;
  status: string;
  notes?: string | null;
  discount_amount?: string | number | null;
  payment_received?: string | number | null;
  total_amount?: string | number | null;
  customer?: { id: string; name?: string | null; email?: string | null } | null;
  salesperson?: { id: string; name: string } | null;
  sale_items?: Array<{
    id: string;
    product_id?: string;
    quantity: number | string;
    unit_price?: string | number;
    discount_amount?: string | number;
    line_total?: string | number;
    product?: {
      id?: string;
      name?: string;
      sku?: string;
      code?: string;
      barcode?: string;
      price?: number | string;
    };
  }>;
};

type EditLine = {
  key: string;
  productId: string;
  name: string;
  sku?: string;
  quantity: string;
  unitPrice: string;
  lineDiscount: string;
};

type Props = {
  sale: EditableSale | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
};

const toNum = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isNaN(v) ? 0 : v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isNaN(n) ? 0 : n;
  }
  if (typeof v === "object") {
    const anyV = v as { toNumber?: () => number; valueOf?: () => unknown; toString?: () => string };
    if (typeof anyV.toNumber === "function") {
      try {
        return anyV.toNumber();
      } catch {
        /* fall through */
      }
    }
    if (typeof anyV.valueOf === "function") {
      const raw = anyV.valueOf();
      if (typeof raw === "number" || typeof raw === "string") return toNum(raw);
    }
    if (typeof anyV.toString === "function") {
      const s = anyV.toString();
      if (s && s !== "[object Object]") return toNum(s);
    }
  }
  return 0;
};

const money = (n: number) =>
  `Rs ${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const mapSaleItemsToLines = (saleItems: EditableSale["sale_items"] | any[]): EditLine[] => {
  const items = Array.isArray(saleItems) ? saleItems : [];
  return items
    .map((item: any, index: number) => {
      const productId =
        item.product_id ||
        item.productId ||
        item.product?.id ||
        item.product?.product_id ||
        "";
      const qty = Math.abs(toNum(item.quantity));
      const lineTotal = Math.abs(toNum(item.line_total ?? item.lineTotal));
      let unit = Math.abs(toNum(item.unit_price ?? item.unitPrice ?? item.price));
      if (!unit && qty > 0 && lineTotal > 0) {
        unit = lineTotal / qty;
      }
      if (!productId && !item.product?.name) return null;
      return {
        key: String(item.id || `${productId || "line"}-${index}`),
        productId: String(productId || ""),
        name: item.product?.name || item.name || "Item",
        sku:
          item.product?.sku ||
          item.product?.code ||
          item.product?.barcode ||
          item.sku ||
          undefined,
        quantity: String(qty || 1),
        unitPrice: String(unit || 0),
        lineDiscount: String(Math.abs(toNum(item.discount_amount ?? item.discountAmount))),
      } as EditLine;
    })
    .filter(Boolean) as EditLine[];
};

export function EditSaleDialog({ sale, open, onOpenChange, onUpdated }: Props) {
  const { toast } = useToast();
  const { customers, fetchCustomers } = usePosData();
  // Full sellable catalog (not the store's capped 20-item page) so "Add
  // product" search actually searches every product, not just the first page.
  const { products, isFirstLoad: productsLoading } = useAllPosProducts({ enabled: open });
  const [loadingSale, setLoadingSale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [customerId, setCustomerId] = useState<string>("walkin");
  const [salespersonId, setSalespersonId] = useState<string | null>(null);
  const { people: salespeople, loading: salespeopleLoading } = useSalespeople();
  const [paidAmount, setPaidAmount] = useState("0");
  const [orderDiscount, setOrderDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditLine[]>([]);
  const [loadedSaleNumber, setLoadedSaleNumber] = useState("");
  const [originalTotal, setOriginalTotal] = useState(0);
  const [missingLineItems, setMissingLineItems] = useState(false);

  const applySaleToForm = (detailed: any) => {
    setLoadedSaleNumber(detailed?.sale_number || sale?.sale_number || "");
    setPaymentMethod(detailed?.payment_method || "CASH");
    setCustomerId(detailed?.customer?.id || "walkin");
    setSalespersonId(detailed?.salesperson?.id || detailed?.salesperson_id || null);
    const total = toNum(detailed?.total_amount);
    setOriginalTotal(total);
    setPaidAmount(
      String(
        toNum(detailed?.payment_received) > 0
          ? toNum(detailed.payment_received)
          : total,
      ),
    );
    setOrderDiscount(String(toNum(detailed?.discount_amount)));
    setNotes(detailed?.notes || "");
    setProductQuery("");
    const mapped = mapSaleItemsToLines(detailed?.sale_items || detailed?.items || []);
    setLines(mapped);
    setMissingLineItems(mapped.length === 0 && total > 0);
  };

  useEffect(() => {
    if (!open) return;
    fetchCustomers(true).catch(() => undefined);
  }, [open, fetchCustomers]);

  useEffect(() => {
    if (!open || !sale?.id) return;
    let cancelled = false;

    const load = async () => {
      setLoadingSale(true);
      // Show whatever we already have while fetching
      applySaleToForm(sale);
      try {
        const res = await apiClient.get(`/sale/${sale.id}`);
        if (cancelled) return;
        const detailed = res.data?.data;
        if (detailed) {
          applySaleToForm(detailed);
        }
      } catch (error: any) {
        if (!cancelled) {
          toast({
            variant: "destructive",
            title: "Could not refresh sale details",
            description: error?.response?.data?.message || error?.message,
          });
        }
      } finally {
        if (!cancelled) setLoadingSale(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sale?.id]);

  const productMatches = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q || q.length < 1) return [];
    const list = Array.isArray(products) ? products : [];
    return list
      .filter((p: any) => {
        const hay = [
          p.name,
          p.sku,
          p.code,
          p.barcode,
          p.product_code,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [productQuery, products]);

  const totals = useMemo(() => {
    const lineRows = lines.map((line) => {
      const qty = Math.max(0, toNum(line.quantity));
      const price = Math.max(0, toNum(line.unitPrice));
      const disc = Math.max(0, toNum(line.lineDiscount));
      const lineTotal = Math.max(0, qty * price - disc);
      return { ...line, qty, price, disc, lineTotal };
    });
    const subtotal = lineRows.reduce((s, r) => s + r.lineTotal, 0);
    const lineDiscounts = lineRows.reduce((s, r) => s + r.disc, 0);
    const orderDisc = Math.max(0, toNum(orderDiscount));
    const tax = 0;
    const grand = Math.max(0, subtotal - orderDisc + tax);
    const paid = Math.max(0, toNum(paidAmount));
    return {
      lineRows,
      subtotal,
      lineDiscounts,
      orderDisc,
      tax,
      grand,
      remaining: Math.max(0, grand - paid),
    };
  }, [lines, orderDiscount, paidAmount]);

  const addProduct = (product: any) => {
    const productId = product.id;
    if (!productId) return;
    const price = toNum(product.price ?? product.selling_price ?? product.unit_price);
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (existing) {
        return prev.map((l) =>
          l.productId === productId
            ? { ...l, quantity: String(Math.max(1, toNum(l.quantity) + 1)) }
            : l,
        );
      }
      return [
        ...prev,
        {
          key: `${productId}-${Date.now()}`,
          productId,
          name: product.name || "Item",
          sku: product.sku || product.code || product.barcode,
          quantity: "1",
          unitPrice: String(price || 0),
          lineDiscount: "0",
        },
      ];
    });
    setProductQuery("");
  };

  const tryAddFromQuery = () => {
    if (productMatches[0]) {
      addProduct(productMatches[0]);
      return;
    }
    toast({
      variant: "destructive",
      title: "Product not found",
      description: "Scan or search a valid product name, SKU, or barcode.",
    });
  };

  const updateLine = (key: string, patch: Partial<EditLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const handleSave = async () => {
    if (!sale) return;
    if (!lines.length) {
      toast({
        variant: "destructive",
        title: "Add at least one product",
        description: "This sale has no line items. Add products before updating.",
      });
      return;
    }
    const missingProductId = lines.some((l) => !l.productId);
    if (missingProductId) {
      toast({
        variant: "destructive",
        title: "Invalid products",
        description: "Every line must be a real product from search (not a blank row).",
      });
      return;
    }
    const invalid = lines.some(
      (l) => toNum(l.quantity) <= 0 || toNum(l.unitPrice) < 0,
    );
    if (invalid) {
      toast({
        variant: "destructive",
        title: "Invalid line items",
        description: "Each product needs a quantity > 0 and a valid price.",
      });
      return;
    }

    setSaving(true);
    try {
      await apiClient.patch(`/sale/${sale.id}`, {
        paymentMethod,
        paymentStatus: "PAID",
        status: sale.status === "CANCELLED" ? "COMPLETED" : sale.status,
        notes,
        discountAmount: toNum(orderDiscount),
        customerId: customerId === "walkin" ? null : customerId,
        salespersonId: salespersonId || null,
        paymentReceived: toNum(paidAmount),
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: toNum(l.quantity),
          price: toNum(l.unitPrice),
          discountAmount: toNum(l.lineDiscount),
        })),
      });
      toast({ title: "Sale updated", description: "Products, totals, and stock were saved." });
      onOpenChange(false);
      onUpdated();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error?.response?.data?.message || error?.message || "Unable to update sale",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!open || !sale) return null;

  return (
    <div className="flex flex-col min-h-0">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Edit Sale #{loadedSaleNumber || sale.sale_number}
            {loadingSale && (
              <span className="inline-flex items-center gap-1.5 text-xs font-normal text-gray-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </span>
            )}
          </span>
        }
        description="Add/remove products, adjust quantity, pricing, discounts, payment and notes."
        actions={
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
        }
      />

      <div className="space-y-3 px-4 py-4 sm:px-6">
          {missingLineItems && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <p className="font-medium">No products were saved on this sale</p>
              <p className="mt-1 text-xs text-amber-800">
                This invoice has a total of {money(originalTotal)} but no line items in the database
                (common for older/offline sales). Search and add the products below, set qty/price,
                then click <strong>Update Sale</strong> to restore details and stock.
              </p>
            </div>
          )}

          {loadingSale && lines.length === 0 && !missingLineItems && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading sale products…
            </div>
          )}
          <div>
            <Label className="text-xs text-gray-500">Salesperson (commission)</Label>
            <SalespersonPicker
              value={salespersonId}
              onChange={setSalespersonId}
              people={salespeople}
              loading={salespeopleLoading}
              disabled={saving}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-gray-500">Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="walkin">Walk-in Customer</SelectItem>
                  {(customers || []).slice(0, 200).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name || c.email || c.phone_number || c.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Paid Amount</Label>
              <Input
                className="h-9"
                type="number"
                min="0"
                step="0.01"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <Label className="text-xs text-gray-500">Add product</Label>
              <span className="text-[11px] text-gray-400">Scan barcode, SKU, or type name</span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                className="pl-9 h-9"
                placeholder="Search name, SKU, barcode — press Enter to add"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    tryAddFromQuery();
                  }
                }}
              />
            </div>
            {productsLoading && productQuery.trim() && (
              <p className="mt-1 text-[11px] text-gray-400">Loading product catalog…</p>
            )}
            {productMatches.length > 0 && (
              <div className="mt-1 rounded-md border bg-white shadow-sm max-h-40 overflow-auto">
                {productMatches.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                    onClick={() => addProduct(p)}
                  >
                    <span className="truncate">
                      {p.name}
                      <span className="ml-2 text-xs text-gray-400">
                        {p.sku || p.code || p.barcode || ""}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-gray-600">
                      {money(toNum(p.price ?? p.selling_price))}
                      <Plus className="inline ml-1 h-3.5 w-3.5" />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-md border overflow-hidden">
            <div className="flex items-center justify-between border-b bg-gray-50 px-3 py-2">
              <p className="text-sm font-medium">Line items ({lines.length})</p>
            </div>
            <div className="max-h-[38vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white border-b text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Product</th>
                    <th className="px-2 py-2 text-left font-medium w-24">Qty</th>
                    <th className="px-2 py-2 text-left font-medium w-28">Unit Price</th>
                    <th className="px-2 py-2 text-left font-medium w-24">Line Disc.</th>
                    <th className="px-2 py-2 text-right font-medium w-28">Subtotal</th>
                    <th className="px-2 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                        No products yet. Search above to add items.
                      </td>
                    </tr>
                  ) : (
                    lines.map((line) => {
                      const lineTotal = Math.max(
                        0,
                        toNum(line.quantity) * toNum(line.unitPrice) - toNum(line.lineDiscount),
                      );
                      return (
                        <tr key={line.key} className="border-b last:border-0">
                          <td className="px-3 py-2 align-top">
                            <p className="font-medium leading-tight">{line.name}</p>
                            {line.sku && (
                              <p className="text-[11px] text-gray-400 font-mono">{line.sku}</p>
                            )}
                          </td>
                          <td className="px-2 py-2 align-top">
                            <Input
                              className="h-8"
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={line.quantity}
                              onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                            />
                            <p className="mt-0.5 text-[10px] text-gray-400">Type quantity</p>
                          </td>
                          <td className="px-2 py-2 align-top">
                            <Input
                              className="h-8"
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.unitPrice}
                              onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                            />
                          </td>
                          <td className="px-2 py-2 align-top">
                            <Input
                              className="h-8"
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.lineDiscount}
                              onChange={(e) =>
                                updateLine(line.key, { lineDiscount: e.target.value })
                              }
                            />
                          </td>
                          <td className="px-2 py-2 align-top text-right font-semibold tabular-nums">
                            {money(lineTotal)}
                          </td>
                          <td className="px-2 py-2 align-top">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600"
                              onClick={() => removeLine(line.key)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs text-gray-500">Notes</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes for this edit"
              />
              <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                Saving recalculates totals, updates stock, and adjusts customer credit (if applicable).
              </div>
            </div>
            <div className="rounded-md border bg-gray-50 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-medium">{money(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Line discounts</span>
                <span>- {money(totals.lineDiscounts)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Order discount</span>
                <Input
                  className="h-8 w-28 text-right"
                  type="number"
                  min="0"
                  step="0.01"
                  value={orderDiscount}
                  onChange={(e) => setOrderDiscount(e.target.value)}
                />
              </div>
              <div className="flex justify-between">
                <span>Tax</span>
                <span>{money(totals.tax)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-bold">
                <span>Grand Total</span>
                <span>{money(totals.grand)}</span>
              </div>
              <div
                className={cn(
                  "flex justify-between text-sm font-medium",
                  totals.remaining > 0 ? "text-amber-700" : "text-emerald-700",
                )}
              >
                <span>Remaining Balance</span>
                <span>{money(totals.remaining)}</span>
              </div>
            </div>
          </div>
      </div>

      <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Update Sale
          </Button>
      </div>
    </div>
  );
}
