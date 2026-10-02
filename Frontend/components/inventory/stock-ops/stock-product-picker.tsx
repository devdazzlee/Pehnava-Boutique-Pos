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
  /** Hard lock: search + add disabled, full overlay. Prefer `lockAdd` for multi-step forms. */
  disabled?: boolean;
  disabledHint?: string;
  /**
   * Soft lock: catalog stays browsable/searchable; adding is blocked and
   * `onAddBlocked` is called so the parent can highlight missing fields.
   */
  lockAdd?: boolean;
  onAddBlocked?: () => void;
  maxGridResults?: number;
  /** split = catalog | cart side-by-side (page forms). stack = vertical (dialogs). */
  layout?: "stack" | "split";
  /** Rendered under the cart list (totals + save). */
  cartFooter?: React.ReactNode;
  /** Shows the resulting on-hand per line: add (+qty), remove (-qty), signed (+change). */
  previewMode?: "add" | "remove" | "signed";
  catalogTitle?: string;
  catalogSubtitle?: string;
  cartTitle?: string;
  emptyCartHint?: string;
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
  lockAdd = false,
  onAddBlocked,
  maxGridResults = 120,
  layout = "stack",
  cartFooter,
  previewMode,
  catalogTitle = "Products",
  catalogSubtitle,
  cartTitle = "Receipt",
  emptyCartHint,
}: StockProductPickerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const addBlocked = disabled || lockAdd;
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
    (product: StockPickerProduct, opts?: { fromSearch?: boolean }) => {
      if (disabled) return;
      if (lockAdd) {
        onAddBlocked?.();
        return;
      }
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
      // Only reset search after keyboard/barcode entry — clicking a row must
      // keep list scroll position (focusing search scrolls the pane to top).
      if (opts?.fromSearch) {
        setSearchTerm("");
        searchRef.current?.focus();
      }
    },
    [disabled, lockAdd, onAddBlocked, lineMap, getCurrentQty, onLinesChange, lines, showUnitCost],
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

    if (exact) addOrBumpProduct(exact, { fromSearch: true });
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

  const catalogToolbar = (
    <>
      {lockAdd && !disabled ? (
        <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <span className="font-semibold">{disabledHint || "Complete the fields above first."}</span>
          <span className="text-amber-800/90"> Then click a product to add it.</span>
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            ref={searchRef}
            placeholder="Search name, SKU, barcode…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            disabled={disabled || loading}
            autoComplete="off"
            className="h-10 border-slate-200 bg-white pl-9 text-sm text-slate-900"
          />
        </div>

        {loading && categoryOptions.length === 0 ? (
          <div className="h-10 w-full animate-pulse rounded-md border border-slate-200 bg-slate-50 sm:w-[180px]" />
        ) : categoryOptions.length > 0 ? (
          <Select
            value={categoryFilter}
            onValueChange={setCategoryFilter}
            disabled={disabled || loading}
          >
            <SelectTrigger className="h-10 w-full border-slate-200 text-sm text-slate-900 sm:w-[180px]">
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

      <div className="flex items-center justify-between pb-1 pt-2 text-[11px] text-slate-500">
        <span>
          {filteredProducts.length} result
          {filteredProducts.length === 1 ? "" : "s"}
          {remoteTotal != null && remoteTotal > filteredProducts.length
            ? ` of ${remoteTotal.toLocaleString()}`
            : ""}
        </span>
        <span className="hidden sm:inline">
          {addBlocked ? "Select details above to add" : "Click to add · Enter = top match"}
        </span>
      </div>
    </>
  );

  const catalogList =
    loading || remoteLoading ? (
      <div className={cn("grid gap-1.5", isSplit ? "grid-cols-1" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7")}>
        {Array.from({ length: isSplit ? 8 : 14 }).map((_, i) => (
          <div key={i} className={cn("animate-pulse rounded-md bg-slate-100", isSplit ? "h-11" : "h-12")} />
        ))}
      </div>
    ) : filteredProducts.length === 0 ? (
      <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center">
        <Package className="mx-auto mb-1.5 h-6 w-6 text-slate-300" />
        <p className="text-xs font-medium text-slate-700">No products found</p>
      </div>
    ) : isSplit ? (
      <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {filteredProducts.map((product) => {
          const selected = lineMap.get(product.id);
          const onHand = getCurrentQty?.(product.id);
          return (
            <button
              key={product.id}
              type="button"
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addOrBumpProduct(product)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                "hover:bg-emerald-50/50 disabled:cursor-not-allowed disabled:opacity-50",
                selected && "bg-emerald-50/70",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-slate-900">{product.name}</p>
                  {selected ? (
                    <span className="shrink-0 rounded bg-emerald-600 px-1.5 py-px text-[10px] font-bold text-white">
                      ×{selected.quantity}
                    </span>
                  ) : null}
                </div>
                <p className="truncate font-mono text-[11px] text-slate-500">
                  {product.sku || product.barcode || "—"}
                  {product.categoryName ? ` · ${product.categoryName}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {product.price != null ? (
                  <p className="text-xs font-semibold tabular-nums text-slate-800">
                    Rs {fmtNum(product.price)}
                  </p>
                ) : null}
                {onHand != null ? (
                  <p
                    className={cn(
                      "text-[10px] font-semibold tabular-nums",
                      onHand <= 0 ? "text-rose-600" : "text-emerald-700",
                    )}
                  >
                    {fmtNum(onHand)} stock
                  </p>
                ) : null}
              </div>
              <Plus
                className={cn(
                  "h-4 w-4 shrink-0",
                  selected ? "text-emerald-600" : "text-slate-300",
                )}
              />
            </button>
          );
        })}
      </div>
    ) : (
      <div className="max-h-[240px] overflow-y-auto -mx-0.5 px-0.5">
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {filteredProducts.map((product) => {
            const selected = lineMap.get(product.id);
            return (
              <button
                key={product.id}
                type="button"
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addOrBumpProduct(product)}
                className={cn(
                  "relative flex min-h-[4rem] flex-col rounded-lg border px-2.5 py-2 text-left transition-colors",
                  "border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/40",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  selected && "border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600",
                )}
              >
                {selected ? (
                  <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check className="h-2 w-2" strokeWidth={3} />
                  </span>
                ) : null}
                <span className="line-clamp-2 pr-4 text-[12px] font-semibold leading-tight text-slate-900">
                  {product.name}
                </span>
                <span className="mt-0.5 truncate font-mono text-[10px] text-slate-500">
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
              </button>
            );
          })}
        </div>
      </div>
    );

  const catalogGrid = (
    <>
      {catalogToolbar}
      {catalogList}
    </>
  );

  const lineEditors = (line: StockLineItem) => (
    <div
      className={cn(
        "mt-3 grid grid-cols-2 items-end gap-2 sm:grid-cols-4",
      )}
    >
      {showCurrentQty ? (
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-slate-400">
            On hand
          </Label>
          <p className="flex h-8 items-center text-sm font-medium tabular-nums text-slate-700">
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

      <div className={!showUnitCost ? "sm:col-span-2" : ""}>
        <Label className="text-[10px] uppercase tracking-wide text-slate-400">
          {quantityLabel}
        </Label>
        <div className="mt-0.5 flex items-center gap-1">
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
            className="h-8 text-center text-sm text-slate-900"
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
        <div>
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
            className="mt-0.5 h-8 text-sm text-slate-900"
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

  /** Dense POS cart rows — one line of controls so both panes stay equal height */
  const splitCartLines = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="divide-y divide-slate-100">
        {lines.map((line) => {
          const qty = Number(line.quantity) || 0;
          const cost = Number(line.unitCost) || 0;
          const onHand = onHandFor(line);
          const after =
            onHand != null && previewMode
              ? previewMode === "remove"
                ? onHand - qty
                : onHand + qty
              : null;
          return (
            <div
              key={line.productId}
              className="flex items-center gap-2 bg-white px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold leading-tight text-slate-900">
                  {line.productName}
                </p>
                <p className="truncate text-[10px] leading-tight text-slate-500">
                  {line.sku ? <span className="font-mono">{line.sku}</span> : null}
                  {showCurrentQty && onHand != null ? (
                    <span className="tabular-nums">
                      {line.sku ? " · " : ""}
                      {fmtNum(onHand)}
                      {after != null ? (
                        <span
                          className={cn(
                            "ml-1 font-semibold",
                            after < 0 ? "text-rose-600" : "text-emerald-700",
                          )}
                        >
                          → {fmtNum(after)}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  {showUnitCost && qty > 0 && cost > 0 ? (
                    <span className="tabular-nums text-slate-400">
                      {" · "}Rs {fmtNum(qty * cost)}
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={disabled}
                  onClick={() => adjustLineQty(line.productId, -1)}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <Input
                  type="number"
                  placeholder={quantityPlaceholder}
                  value={line.quantity}
                  disabled={disabled}
                  onChange={(e) =>
                    updateLine(line.productId, { quantity: e.target.value })
                  }
                  className="h-7 w-12 px-1 text-center text-xs tabular-nums text-slate-900"
                  title={quantityLabel}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={disabled}
                  onClick={() => adjustLineQty(line.productId, 1)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              {showUnitCost ? (
                <Input
                  type="number"
                  placeholder="Cost"
                  value={line.unitCost ?? ""}
                  disabled={disabled}
                  onChange={(e) =>
                    updateLine(line.productId, { unitCost: e.target.value })
                  }
                  className="h-7 w-[4.5rem] shrink-0 px-1.5 text-xs tabular-nums text-slate-900"
                  title={unitCostLabel}
                />
              ) : null}

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
          );
        })}
      </div>
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
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-8 text-center">
          <ShoppingCart className="mb-2 h-7 w-7 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No items yet</p>
          <p className="mt-1 max-w-[220px] text-xs text-slate-500">
            {emptyCartHint ||
              (isSplit
                ? "Click a product on the left to add it here."
                : "Click a product above to add it here.")}
          </p>
        </div>
      ) : isSplit ? (
        splitCartLines
      ) : (
        <div className="max-h-[320px] space-y-2 overflow-y-auto p-3">
          {lines.map((line) => (
            <div
              key={line.productId}
              className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-snug text-slate-900">
                    {line.productName}
                  </p>
                  {line.sku ? (
                    <p className="truncate font-mono text-[11px] text-slate-500">{line.sku}</p>
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
        <div className="shrink-0 border-t border-slate-200 bg-white p-2">
          {cartFooter}
        </div>
      ) : null}
    </>
  );

  if (isSplit) {
    return (
      <div
        className={cn(
          // Forced equal panes: one row, fixed height, both columns min-h-0 so neither can stretch the card.
          "grid h-[min(640px,calc(100vh-12rem))] max-h-[calc(100vh-12rem)] grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:grid-cols-2",
          (disabled || lockAdd) && "border-amber-200/80",
        )}
      >
        {/* Products — left */}
        <section className="relative flex h-full min-h-0 flex-col overflow-hidden border-b border-slate-200 md:border-b-0 md:border-r">
          {disabled ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 px-4">
              <div className="max-w-xs rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center shadow-sm">
                <p className="text-sm font-medium text-amber-900">
                  {disabledHint ||
                    "Complete the required fields above to add products"}
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{catalogTitle}</h3>
              <p className="text-[11px] text-slate-500">
                {catalogSubtitle ||
                  `${products.length.toLocaleString()} products · click to add`}
              </p>
            </div>
            {!addBlocked ? (
              <span className="hidden shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 sm:inline">
                Ready
              </span>
            ) : null}
          </div>

          {/* Search stays fixed — only the product rows scroll */}
          <div className="shrink-0 border-b border-slate-100 px-2.5 pb-2 pt-2">
            {catalogToolbar}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5">
            {catalogList}
          </div>
        </section>

        {/* Receipt / dispatch — right, locked to same height */}
        <section className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50/40">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <ShoppingCart className="h-4 w-4 shrink-0 text-slate-500" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">{cartTitle}</h3>
                <p className="text-[11px] tabular-nums text-slate-500">
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
                className="h-7 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Clear
              </Button>
            ) : null}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {cartBody}
          </div>
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
            <h3 className="text-sm font-semibold text-slate-900">{catalogTitle}</h3>
            <p className="text-[11px] text-slate-500">
              {catalogSubtitle ||
                `${products.length.toLocaleString()} products · click to add`}
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
              <h3 className="text-sm font-semibold text-slate-900">{cartTitle}</h3>
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
