"use client";

import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import apiClient from "@/lib/apiClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Package,
  Trash2,
  X,
  Check,
  Minus,
  Plus,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface StockPickerProduct {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  category_id?: string | null;
  categoryId?: string | null;
  /** Optional extras shown on catalog cards / used to prefill unit cost. */
  price?: number | null;
  cost?: number | null;
  categoryName?: string | null;
}

export interface StockLineItem {
  productId: string;
  productName: string;
  sku?: string;
  quantity: string | number;
  unitCost?: string | number;
  currentQty?: number | null;
}

interface StockProductPickerProps {
  products: StockPickerProduct[];
  categories?: Array<{ id: string; name: string }>;
  loading?: boolean;
  lines: StockLineItem[];
  onLinesChange: (lines: StockLineItem[]) => void;
  quantityLabel?: string;
  quantityPlaceholder?: string;
  showUnitCost?: boolean;
  unitCostLabel?: string;
  showCurrentQty?: boolean;
  allowSignedQuantity?: boolean;
  getCurrentQty?: (productId: string) => number | null;
  error?: string;
  disabled?: boolean;
  disabledHint?: string;
  maxGridResults?: number;
  /** split = catalog | cart side-by-side (page forms). stack = vertical (dialogs). */
  layout?: "stack" | "split";
  /** Rendered under the cart list (totals + save). */
  cartFooter?: React.ReactNode;
  /** Shows the resulting on-hand per line: add (+qty), remove (-qty), signed (+change). */
  previewMode?: "add" | "remove" | "signed";
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function matchesProduct(product: StockPickerProduct, term: string) {
  if (!term) return true;
  return (
    product.name.toLowerCase().includes(term) ||
    (product.sku && product.sku.toLowerCase().includes(term)) ||
    (product.barcode && product.barcode.toLowerCase().includes(term))
  );
}

function dedupeCategories(categories: Array<{ id: string; name: string }>) {
  const seen = new Set<string>();
  return categories.filter((c) => {
    const id = (c.id || "").trim();
    const name = (c.name || "").trim().toLowerCase();
    if (!id || id === "all" || name === "all" || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function StockProductPicker({
  products,
  categories = [],
  loading = false,
  lines,
  onLinesChange,
  quantityLabel = "Quantity",
  quantityPlaceholder = "0",
  showUnitCost = false,
  unitCostLabel = "Unit cost",
  showCurrentQty = false,
  allowSignedQuantity = false,
  getCurrentQty,
  error,
  disabled = false,
  disabledHint,
  maxGridResults = 120,
  layout = "stack",
  cartFooter,
  previewMode,
}: StockProductPickerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [remoteProducts, setRemoteProducts] = useState<StockPickerProduct[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteTotal, setRemoteTotal] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const isSplit = layout === "split";

  const categoryOptions = useMemo(() => dedupeCategories(categories), [categories]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setRemoteLoading(true);
      try {
        const res = await apiClient.get("/products", {
          params: {
            page: 1,
            limit: 60,
            is_active: true,
            search: searchTerm.trim() || undefined,
            category_id: categoryFilter !== "all" ? categoryFilter : undefined,
          },
        });
        const raw = Array.isArray(res.data?.data) ? res.data.data : [];
        setRemoteTotal(Number(res.data?.meta?.total ?? raw.length) || raw.length);
        setRemoteProducts(
          raw.map((item: any) => ({
            id: item.id,
            name: item.name,
            sku: item.sku,
            barcode: item.code || item.sku,
            category_id: item.category?.id || item.category_id,
            categoryId: item.category?.id || item.category_id,
            categoryName: item.category?.name ?? null,
            price:
              Number(item.sales_rate_inc_dis_and_tax ?? item.sales_rate_exc_dis_and_tax ?? 0) || null,
            cost: Number(item.purchase_rate ?? 0) || null,
          })),
        );
      } catch {
        setRemoteProducts([]);
      } finally {
        setRemoteLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchTerm, categoryFilter]);

  const filteredProducts = useMemo(() => {
    const catalog = remoteProducts.length > 0 ? remoteProducts : products;
    const term = normalizeSearch(searchTerm);
    return catalog
      .filter((p) => {
        if (
          categoryFilter !== "all" &&
          (p.category_id || p.categoryId) !== categoryFilter
        ) {
          return false;
        }
        return matchesProduct(p, term);
      })
      .slice(0, maxGridResults);
  }, [products, remoteProducts, searchTerm, categoryFilter, maxGridResults]);

  const lineMap = useMemo(
    () => new Map(lines.map((l) => [l.productId, l])),
    [lines],
  );

  const addOrBumpProduct = useCallback(
    (product: StockPickerProduct) => {
      if (disabled) return;
      const existing = lineMap.get(product.id);
      const currentQty = getCurrentQty?.(product.id) ?? null;

      if (existing) {
        const current = Number(existing.quantity) || 0;
        onLinesChange(
          lines.map((l) =>
            l.productId === product.id ? { ...l, quantity: current + 1 } : l,
          ),
        );
      } else {
        onLinesChange([
          ...lines,
          {
            productId: product.id,
            productName: product.name,
            sku: product.sku || undefined,
            quantity: 1,
            // Prefill with the product's purchase rate; still editable per line.
            unitCost: showUnitCost && product.cost ? String(product.cost) : "",
            currentQty,
          },
        ]);
      }
      setSearchTerm("");
      searchRef.current?.focus();
    },
    [disabled, lineMap, getCurrentQty, onLinesChange, lines, showUnitCost],
  );

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const term = normalizeSearch(searchTerm);
    if (!term) return;

    const exact =
      products.find(
        (p) =>
          p.barcode?.toLowerCase() === term || p.sku?.toLowerCase() === term,
      ) || filteredProducts[0];

    if (exact) addOrBumpProduct(exact);
  };

  const updateLine = (
    productId: string,
    patch: Partial<Pick<StockLineItem, "quantity" | "unitCost">>,
  ) => {
    onLinesChange(
      lines.map((l) => (l.productId === productId ? { ...l, ...patch } : l)),
    );
  };

  const adjustLineQty = (productId: string, delta: number) => {
    const line = lineMap.get(productId);
    if (!line) return;
    const current = Number(line.quantity) || 0;
    const next = allowSignedQuantity
      ? current + delta
      : Math.max(0, current + delta);
    updateLine(productId, { quantity: next });
  };

  const removeLine = (productId: string) => {
    onLinesChange(lines.filter((l) => l.productId !== productId));
  };

  const clearAll = () => onLinesChange([]);

  const totalUnits = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const totalCost = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0),
    0,
  );
  const onHandFor = (line: StockLineItem) => {
    const live = getCurrentQty?.(line.productId);
    return live != null ? live : line.currentQty ?? null;
  };
  const fmtNum = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const catalogGrid = (
    <>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            ref={searchRef}
            placeholder="Search name, SKU, barcode…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            disabled={disabled || loading}
            autoComplete="off"
            className="pl-9 h-10 text-sm text-slate-900 bg-white border-slate-200"
          />
        </div>

        {loading && categoryOptions.length === 0 ? (
          <div className="h-10 w-full sm:w-[180px] rounded-md border border-slate-200 bg-slate-50 animate-pulse" />
        ) : categoryOptions.length > 0 ? (
          <Select
            value={categoryFilter}
            onValueChange={setCategoryFilter}
            disabled={disabled || loading}
          >
            <SelectTrigger className="h-10 w-full sm:w-[180px] text-sm text-slate-900 border-slate-200">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all" className="text-sm">
                All categories
              </SelectItem>
              {categoryOptions.map((cat) => (
                <SelectItem key={cat.id} value={cat.id} className="text-sm">
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 pb-1">
        <span>
          {filteredProducts.length} result
          {filteredProducts.length === 1 ? "" : "s"}
          {remoteTotal != null && remoteTotal > filteredProducts.length
            ? ` of ${remoteTotal.toLocaleString()} · type to search the rest`
            : ""}
        </span>
        <span className="hidden sm:inline">Enter = add top match</span>
      </div>

      {loading || remoteLoading ? (
        <div
          className={cn(
            "grid gap-1.5",
            isSplit
              ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
              : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7",
          )}
        >
          {Array.from({ length: isSplit ? 12 : 14 }).map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center">
          <Package className="h-6 w-6 text-slate-300 mx-auto mb-1.5" />
          <p className="text-xs font-medium text-slate-700">No products found</p>
        </div>
      ) : (
        <div
          className={cn(
            "overflow-y-auto -mx-0.5 px-0.5",
            isSplit ? "flex-1 min-h-0" : "max-h-[240px]",
          )}
        >
          <div
            className={cn(
              "grid gap-1.5",
              isSplit
                ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
                : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7",
            )}
          >
            {filteredProducts.map((product) => {
              const selected = lineMap.get(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => addOrBumpProduct(product)}
                  className={cn(
                    "relative flex min-h-[4.25rem] flex-col rounded-lg border px-2.5 py-2 text-left transition-colors",
                    "bg-white border-slate-200 hover:border-slate-400 hover:bg-slate-50",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    selected && "border-slate-800 bg-slate-50 ring-1 ring-slate-800",
                  )}
                >
                  {selected ? (
                    <span className="absolute top-1 right-1 h-3.5 w-3.5 rounded-full bg-slate-800 text-white flex items-center justify-center">
                      <Check className="h-2 w-2" strokeWidth={3} />
                    </span>
                  ) : null}
                  <span className="text-[12px] font-semibold text-slate-900 leading-tight line-clamp-2 pr-4">
                    {product.name}
                  </span>
                  <span className="mt-0.5 text-[10px] font-mono text-slate-500 truncate">
                    {product.sku || product.barcode || "—"}
                  </span>
                  {(() => {
                    const onHand = getCurrentQty?.(product.id);
                    if (product.price == null && onHand == null) return null;
                    return (
                      <span className="mt-auto flex items-center justify-between gap-1 pt-1 text-[10px]">
                        {product.price != null ? (
                          <span className="font-semibold tabular-nums text-slate-700">
                            Rs {fmtNum(product.price)}
                          </span>
                        ) : (
                          <span />
                        )}
                        {onHand != null ? (
                          <span
                            className={cn(
                              "rounded px-1 py-px font-semibold tabular-nums",
                              onHand <= 0
                                ? "bg-rose-50 text-rose-700"
                                : "bg-emerald-50 text-emerald-700",
                            )}
                          >
                            {fmtNum(onHand)} in stock
                          </span>
                        ) : null}
                      </span>
                    );
                  })()}
                  {selected ? (
                    <span className="mt-0.5 inline-flex w-fit items-center rounded bg-slate-200/80 px-1 py-px text-[9px] font-semibold text-slate-700">
                      ×{selected.quantity}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  const lineEditors = (line: StockLineItem) => (
    <div
      className={cn(
        "gap-2 items-end",
        isSplit ? "mt-2 grid grid-cols-2" : "mt-3 grid grid-cols-2 sm:grid-cols-4",
      )}
    >
      {showCurrentQty ? (
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-slate-400">
            On hand
          </Label>
          <p className="h-8 flex items-center text-sm font-medium text-slate-700 tabular-nums">
            {onHandFor(line) != null ? fmtNum(onHandFor(line) as number) : "—"}
            {previewMode && onHandFor(line) != null
              ? (() => {
                  const q = Number(line.quantity) || 0;
                  const base = onHandFor(line) as number;
                  const after = previewMode === "remove" ? base - q : base + q;
                  return (
                    <span
                      className={cn(
                        "ml-1.5 text-xs font-semibold",
                        after < 0 ? "text-rose-600" : "text-emerald-700",
                      )}
                      title="On hand after saving"
                    >
                      → {fmtNum(after)}
                    </span>
                  );
                })()
              : null}
          </p>
        </div>
      ) : null}

      <div className={!showUnitCost && !isSplit ? "sm:col-span-2" : ""}>
        <Label className="text-[10px] uppercase tracking-wide text-slate-400">
          {quantityLabel}
        </Label>
        <div className="flex items-center gap-1 mt-0.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={disabled}
            onClick={() => adjustLineQty(line.productId, -1)}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Input
            type="number"
            placeholder={quantityPlaceholder}
            value={line.quantity}
            disabled={disabled}
            onChange={(e) =>
              updateLine(line.productId, { quantity: e.target.value })
            }
            className="h-8 text-sm text-center text-slate-900"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={disabled}
            onClick={() => adjustLineQty(line.productId, 1)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {showUnitCost ? (
        <div className={isSplit ? "col-span-2" : ""}>
          <Label className="text-[10px] uppercase tracking-wide text-slate-400">
            {unitCostLabel}
          </Label>
          <Input
            type="number"
            placeholder="0.00"
            value={line.unitCost ?? ""}
            disabled={disabled}
            onChange={(e) =>
              updateLine(line.productId, { unitCost: e.target.value })
            }
            className="h-8 mt-0.5 text-sm text-slate-900"
          />
          {Number(line.unitCost) > 0 && Number(line.quantity) > 0 ? (
            <p className="mt-0.5 text-[10px] tabular-nums text-slate-500">
              Line total Rs {fmtNum((Number(line.unitCost) || 0) * (Number(line.quantity) || 0))}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const cartBody = (
    <>
      {error ? (
        <div className="mx-3 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      {lines.length === 0 ? (
        <div
          className={cn(
            "px-4 text-center flex flex-col items-center justify-center",
            isSplit ? "flex-1 py-8" : "py-5",
          )}
        >
          <ShoppingCart className="h-6 w-6 text-slate-300 mb-2" />
          <p className="text-sm font-medium text-slate-700">Cart is empty</p>
          <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
            {isSplit ? "Click a product on the left to add it here." : "Click a product above to add it here."}
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "p-3 space-y-2 overflow-y-auto",
            isSplit ? "flex-1 min-h-0" : "max-h-[320px]",
          )}
        >
          {lines.map((line) => (
            <div
              key={line.productId}
              className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 line-clamp-2 leading-snug">
                    {line.productName}
                  </p>
                  {line.sku ? (
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                      {line.sku}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-slate-400 hover:text-rose-600"
                  disabled={disabled}
                  onClick={() => removeLine(line.productId)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {lineEditors(line)}
            </div>
          ))}
        </div>
      )}

      {cartFooter ? (
        <div className="mt-auto border-t border-slate-100 p-3 shrink-0 bg-white">
          {cartFooter}
        </div>
      ) : null}
    </>
  );

  if (isSplit) {
    return (
      <div
        className={cn(
          "grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.85fr)] gap-0 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden min-h-[520px] lg:h-[min(620px,calc(100vh-280px))]",
          disabled && "border-amber-200",
        )}
      >
        {/* Catalog pane */}
        <section className="relative flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 min-h-0">
          {disabled ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 px-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center max-w-xs shadow-sm">
                <p className="text-sm font-medium text-amber-900">
                  {disabledHint ||
                    "Complete the required fields above to add products"}
                </p>
              </div>
            </div>
          ) : null}

          <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2 shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Catalog</h3>
              <p className="text-[11px] text-slate-500">
                {products.length.toLocaleString()} products
              </p>
            </div>
          </div>

          <div className="p-3 flex flex-col flex-1 min-h-0">{catalogGrid}</div>
        </section>

        {/* Cart pane */}
        <section className="flex flex-col min-h-0 bg-slate-50/30">
          <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <ShoppingCart className="h-4 w-4 text-slate-500 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">This bill</h3>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {lines.length} item{lines.length === 1 ? "" : "s"}
                  {totalUnits > 0 ? ` · ${fmtNum(totalUnits)} units` : ""}
                  {showUnitCost && totalCost > 0 ? ` · Rs ${fmtNum(totalCost)}` : ""}
                </p>
              </div>
            </div>
            {lines.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearAll}
                disabled={disabled}
                className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            ) : null}
          </div>
          {cartBody}
        </section>
      </div>
    );
  }

  /* Stacked (dialogs) */
  return (
    <div className="space-y-3">
      <section
        className={cn(
          "rounded-xl border bg-white shadow-sm overflow-hidden relative",
          disabled ? "border-amber-200" : "border-slate-200",
        )}
      >
        {disabled ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/75 px-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center max-w-sm shadow-sm">
              <p className="text-sm font-medium text-amber-900">
                {disabledHint ||
                  "Complete the required fields above to add products"}
              </p>
            </div>
          </div>
        ) : null}

        <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Catalog</h3>
            <p className="text-[11px] text-slate-500">
              {products.length.toLocaleString()} products · click to add
            </p>
          </div>
        </div>
        <div className="p-3">{catalogGrid}</div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
        <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-slate-500" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Selected</h3>
              <p className="text-[11px] text-slate-500">
                {lines.length} item{lines.length === 1 ? "" : "s"}
                {totalUnits > 0 ? ` · ${fmtNum(totalUnits)} units` : ""}
                {showUnitCost && totalCost > 0 ? ` · Rs ${fmtNum(totalCost)}` : ""}
              </p>
            </div>
          </div>
          {lines.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              disabled={disabled}
              className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          ) : null}
        </div>
        {cartBody}
      </section>
    </div>
  );
}
