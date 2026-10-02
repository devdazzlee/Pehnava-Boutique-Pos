"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Search,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Boxes,
  Loader2,
  ArrowRightLeft,
  MapPin,
  DollarSign,
  Truck,
  Package,
  List,
  LayoutGrid,
  X,
  Warehouse,
  RefreshCw,
  SlidersHorizontal,
  Wallet,
  PiggyBank,
  MinusCircle,
  TrendingDown,
  WifiOff,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { usePosData } from "@/hooks/use-pos-data";
import { useLogoDataUri } from "@/hooks/use-logo-data-uri";
import { useScrollToTopOnPageChange } from "@/hooks/use-scroll-to-top-on-page-change";
import { cn } from "@/lib/utils";
import {
  StockStatusBadge,
} from "@/components/inventory/stock-ops/stock-status-badge";
import { InventoryCardGrid } from "@/components/inventory/stock-ops/inventory-card-grid";
import { StockRecordCard } from "@/components/inventory/stock-ops/stock-record-card";
import {
  ALL_BRANCHES,
  ALL_BRANDS,
  ALL_CATEGORIES,
  ALL_STOCK_STATUS,
  ALL_SUPPLIERS,
  STOCK_STATUS_OPTIONS,
} from "@/components/inventory/stock-ops/constants";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import { StockOpsActions } from "@/components/inventory/stock-ops/stock-ops-actions";
import { useInventoryDashboard } from "@/components/inventory/stock-ops/use-inventory-dashboard";
import {
  downloadExcel,
  downloadBrandedPdf,
  formatMoney,
  formatQty,
  getProductBarcode,
  getStockRowImage,
  yieldForUi,
} from "@/components/inventory/stock-ops/export-utils";

/** Sentinel values - must not match a real branch/category id from the API. */
const ALL_WAREHOUSES = "__all_warehouses__";
/** Plain ASCII placeholder for empty fields (avoids em-dash encoding issues on Windows). */
const EMPTY = "-";

type StockMeta = {
  total: number;
  totalPages: number;
  totalQuantity: number;
  totalInventoryValue: number;
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  negativeStockCount: number;
};

const EMPTY_META: StockMeta = {
  total: 0,
  totalPages: 1,
  totalQuantity: 0,
  totalInventoryValue: 0,
  totalProducts: 0,
  lowStockCount: 0,
  outOfStockCount: 0,
  negativeStockCount: 0,
};

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-gray-50 last:border-0">
      <dt className="text-sm text-gray-600 shrink-0">{label}</dt>
      <dd className="text-sm text-black text-right">{value ?? EMPTY}</dd>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-black border-b border-gray-200 pb-1.5">
        {title}
      </h3>
      <dl>{children}</dl>
    </div>
  );
}

export function StockView({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const {
    stats: dashboardStats,
    branchSummary,
    loading: dashboardLoading,
    refresh: refreshDashboard,
  } = useInventoryDashboard();
  const logoDataUri = useLogoDataUri();
  const {
    branches,
    categories,
    suppliers,
    fetchBranches,
    fetchCategories,
    fetchSuppliers,
  } = usePosData();

  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);

  const [stocks, setStocks] = useState<any[]>([]);
  const [stockMeta, setStockMeta] = useState<StockMeta>(EMPTY_META);
  const [hasStockMeta, setHasStockMeta] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [supplierFilter, setSupplierFilter] = useState(ALL_SUPPLIERS);
  const [detailRow, setDetailRow] = useState<any | null>(null);
  const [detailProduct, setDetailProduct] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [branchFilter, setBranchFilter] = useState(ALL_BRANCHES);
  const [warehouseFilter, setWarehouseFilter] = useState(ALL_WAREHOUSES);
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [brandFilter, setBrandFilter] = useState(ALL_BRANDS);
  const [stockStatusFilter, setStockStatusFilter] = useState(ALL_STOCK_STATUS);
  const [search, setSearch] = useState("");
  const [skuSearch, setSkuSearch] = useState("");
  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [exporting, setExporting] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  useScrollToTopOnPageChange(currentPage);

  const combinedSearch = useMemo(
    () => [search, skuSearch, barcodeSearch].filter(Boolean).join(" ").trim(),
    [search, skuSearch, barcodeSearch],
  );

  const activeLocationId =
    branchFilter !== ALL_BRANCHES
      ? branchFilter
      : warehouseFilter !== ALL_WAREHOUSES
        ? warehouseFilter
        : "";

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: currentPage,
        limit: itemsPerPage,
        branchId: activeLocationId,
        categoryId: categoryFilter === ALL_CATEGORIES ? "" : categoryFilter,
        brandId: brandFilter === ALL_BRANDS ? "" : brandFilter,
        supplierId: supplierFilter === ALL_SUPPLIERS ? "" : supplierFilter,
        search: combinedSearch,
      };
      if (stockStatusFilter && stockStatusFilter !== ALL_STOCK_STATUS) {
        params.stockStatus = stockStatusFilter;
      }

      const res = await apiClient.get(`${API_BASE}/stock`, { params });
      const meta = res.data?.meta || {};
      setStocks(res.data?.data || []);
      setStockMeta({
        total: Number(meta.total || 0),
        totalPages: Number(meta.totalPages || 1),
        totalQuantity: Number(meta.totalQuantity || 0),
        totalInventoryValue: Number(meta.totalInventoryValue || 0),
        totalProducts: Number(meta.totalProducts || 0),
        lowStockCount: Number(meta.lowStockCount || 0),
        outOfStockCount: Number(meta.outOfStockCount || 0),
        negativeStockCount: Number(meta.negativeStockCount || 0),
      });
      setHasStockMeta(true);
      setLoadError(null);
    } catch (e: any) {
      const message =
        e?.response?.data?.message ||
        (e?.response ? "The server returned an error" : "Can't reach the server — check your connection");
      setLoadError(message);
      toast.error(message);
      setStocks([]);
      setStockMeta(EMPTY_META);
    } finally {
      setLoading(false);
    }
  }, [
    activeLocationId,
    categoryFilter,
    brandFilter,
    supplierFilter,
    combinedSearch,
    stockStatusFilter,
    currentPage,
    itemsPerPage,
  ]);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  useEffect(() => {
    fetchBranches();
    fetchCategories();
    fetchSuppliers();
    apiClient
      .get(`${API_BASE}/brands`, { params: { limit: 100 } })
      .then((res) => setBrands(res.data?.data || res.data || []))
      .catch(() => setBrands([]));
  }, [fetchBranches, fetchCategories, fetchSuppliers]);

  const warehouses = useMemo(
    () => branches.filter((b) => (b.branch_type || "").toUpperCase() === "WAREHOUSE"),
    [branches],
  );

  const locationCards = useMemo(() => branchSummary, [branchSummary]);

  const hasActiveFilters =
    Boolean(search || skuSearch || barcodeSearch) ||
    branchFilter !== ALL_BRANCHES ||
    warehouseFilter !== ALL_WAREHOUSES ||
    categoryFilter !== ALL_CATEGORIES ||
    brandFilter !== ALL_BRANDS ||
    supplierFilter !== ALL_SUPPLIERS ||
    stockStatusFilter !== ALL_STOCK_STATUS;

  const activeFilterCount =
    [search, skuSearch, barcodeSearch].filter((v) => v.trim()).length +
    (activeLocationId ? 1 : 0) +
    (categoryFilter !== ALL_CATEGORIES ? 1 : 0) +
    (brandFilter !== ALL_BRANDS ? 1 : 0) +
    (supplierFilter !== ALL_SUPPLIERS ? 1 : 0) +
    (stockStatusFilter !== ALL_STOCK_STATUS ? 1 : 0);

  const supplierOptions = useMemo(
    () =>
      (suppliers || [])
        .filter((sup: any) => sup?.id && sup?.name)
        .map((sup: any) => ({ id: sup.id as string, name: sup.name as string })),
    [suppliers],
  );

  const retry = () => {
    fetchStocks();
    refreshDashboard();
  };

  /** One location picker instead of separate branch + warehouse selects. */
  const setLocation = (id: string) => {
    if (id === ALL_BRANCHES) {
      setBranchFilter(ALL_BRANCHES);
      setWarehouseFilter(ALL_WAREHOUSES);
      setCurrentPage(1);
      return;
    }
    if (activeLocationId !== id) selectLocation(id);
  };

  const clearFilters = () => {
    setSearch("");
    setSkuSearch("");
    setBarcodeSearch("");
    setBranchFilter(ALL_BRANCHES);
    setWarehouseFilter(ALL_WAREHOUSES);
    setCategoryFilter(ALL_CATEGORIES);
    setBrandFilter(ALL_BRANDS);
    setSupplierFilter(ALL_SUPPLIERS);
    setStockStatusFilter(ALL_STOCK_STATUS);
    setCurrentPage(1);
  };

  const selectLocation = (branchId: string) => {
    const branch = branches.find((b) => b.id === branchId);
    const isWarehouse = (branch?.branch_type || "").toUpperCase() === "WAREHOUSE";
    if (activeLocationId === branchId) {
      setBranchFilter(ALL_BRANCHES);
      setWarehouseFilter(ALL_WAREHOUSES);
    } else if (isWarehouse) {
      setWarehouseFilter(branchId);
      setBranchFilter(ALL_BRANCHES);
    } else {
      setBranchFilter(branchId);
      setWarehouseFilter(ALL_WAREHOUSES);
    }
    setCurrentPage(1);
  };

  const buildExportRows = () =>
    stocks.map((s) => {
      const qty = Number(s.current_quantity || 0);
      const reserved = Number(s.reserved_quantity || 0);
      const cost = Number(s.product?.purchase_rate || 0);
      return [
        s.product?.name || "",
        s.product?.sku || "",
        getProductBarcode(s.product),
        s.branch?.name || "",
        qty - reserved,
        reserved,
        qty * cost,
        s.last_updated ? new Date(s.last_updated).toLocaleString() : "",
      ];
    });

  const exportHeaders = [
    "Product",
    "SKU",
    "Barcode",
    "Branch",
    "Available",
    "Reserved",
    "Inventory Value",
    "Last Updated",
  ];

  const exportExcel = async () => {
    if (stocks.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      downloadExcel(
        `stock-by-location-${Date.now()}.xlsx`,
        "Stock",
        exportHeaders,
        buildExportRows(),
      );
      toast.success("Excel downloaded");
    } catch {
      toast.error("Failed to export Excel");
    } finally {
      setExporting(false);
    }
  };

  const exportPdf = async () => {
    if (stocks.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      const locationLabel =
        branches.find((b) => b.id === activeLocationId)?.name || "All locations";

      const pdfRows = stocks.map((s) => {
        const qty = Number(s.current_quantity || 0);
        const reserved = Number(s.reserved_quantity || 0);
        const cost = Number(s.product?.purchase_rate || 0);
        return [
          s.product?.name || "",
          s.product?.sku || "",
          s.branch?.name || "",
          formatQty(qty - reserved),
          formatMoney(qty * cost),
        ];
      });

      await downloadBrandedPdf({
        filename: `stock-by-location-${Date.now()}.pdf`,
        title: "Stock by Location",
        subtitle: locationLabel,
        logoDataUri,
        summary: [
          { label: "Records", value: stocks.length.toLocaleString() },
          { label: "Quantity", value: formatQty(stockMeta.totalQuantity) },
          {
            label: "Inventory Value",
            value: formatMoney(stockMeta.totalInventoryValue),
          },
        ],
        columns: [
          { header: "Product", width: 2.4 },
          { header: "SKU", width: 1.2 },
          { header: "Location", width: 1.4 },
          { header: "Available", align: "right", width: 1 },
          { header: "Value", align: "right", width: 1.1 },
        ],
        rows: pdfRows,
      });
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  const getCategoryLabel = useCallback(
    (
      rowProduct?: { category_id?: string; category?: { name?: string } },
      full?: Record<string, unknown> | null,
    ) => {
      const fromFull = (full?.category as { name?: string } | undefined)?.name;
      if (fromFull && fromFull !== "Unknown") return fromFull;
      if (rowProduct?.category?.name && rowProduct.category.name !== "Unknown") {
        return rowProduct.category.name;
      }
      const categoryId = (full?.category_id as string) || rowProduct?.category_id;
      if (categoryId) {
        const match = categories.find((c) => c.id === categoryId);
        if (match?.name && match.name !== "Unknown") return match.name;
      }
      return "Uncategorized";
    },
    [categories],
  );

  const openDetail = useCallback(async (row: any) => {
    setDetailRow(row);
    setDetailProduct(null);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await apiClient.get(`${API_BASE}/products/${row.product.id}`);
      setDetailProduct(res.data?.data ?? res.data ?? null);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setDetailError(
        err?.response?.data?.message || "Could not load product details",
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = () => {
    setDetailRow(null);
    setDetailProduct(null);
    setDetailLoading(false);
    setDetailError(null);
  };

  const detailMinStock = detailRow
    ? Number(
        detailRow.minimum_quantity ??
          detailProduct?.min_qty ??
          detailRow.product?.min_qty ??
          0,
      )
    : 0;

  const detailMaxStock = detailRow
    ? Number(detailRow.maximum_quantity ?? detailProduct?.max_qty ?? 0)
    : 0;

  const detailAvailable =
    detailRow &&
    Number(detailRow.current_quantity || 0) -
      Number(detailRow.reserved_quantity || 0);

  const totalPages = Math.max(1, stockMeta.totalPages);

  const visibleCategories = useMemo(
    () => categories.filter((c) => (c.name || "").trim().toLowerCase() !== "unknown"),
    [categories],
  );

  const statsReady = hasStockMeta && !loadError;
  const allCount = stockMeta.totalProducts || stockMeta.total;
  const inStockCount = Math.max(0, allCount - stockMeta.outOfStockCount - stockMeta.lowStockCount);
  const retailTotal = (branchSummary || []).reduce((sum, b) => sum + Number(b.retail || 0), 0);
  const locationValueTotal = (branchSummary || []).reduce((sum, b) => sum + Math.abs(Number(b.value) || 0), 0);
  const activeLocationName = activeLocationId
    ? branches.find((b) => b.id === activeLocationId)?.name || "Selected location"
    : "All locations";
  const filterLabelCls = "text-xs font-semibold text-indigo-900/80";
  const filterControlCls = "h-10 border-indigo-200/80 bg-white text-sm shadow-sm";
  const thCls = "h-10 whitespace-nowrap px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500";

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-5 p-4 text-black md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <MapPin className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">Stock by Location</h1>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-slate-500">
              <Warehouse className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{activeLocationName}</span>
              <span className="hidden text-slate-300 xl:inline">•</span>
              <span className="hidden truncate xl:inline">Quantities, value and alerts for every branch and warehouse</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 bg-white shadow-sm"
            onClick={retry}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button variant="outline" className="h-9 bg-white shadow-sm" onClick={() => onNavigate?.("transfers")}>
            <ArrowRightLeft className="mr-2 h-4 w-4 text-blue-600" />
            Transfers
            {dashboardStats.pendingTransferCount > 0 ? (
              <span className="ml-1.5 rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold tabular-nums text-white">
                {dashboardStats.pendingTransferCount}
              </span>
            ) : null}
          </Button>
          <StockOpsActions
            onExportExcel={exportExcel}
            onExportPdf={exportPdf}
            disabled={loading || stocks.length === 0}
            exporting={exporting}
          />
        </div>
      </div>

      {/* Error banner */}
      {loadError ? (
        <div className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div className="text-sm">
              <p className="font-semibold text-rose-900">Couldn&apos;t load stock</p>
              <p className="text-rose-800">{loadError}. The figures below are not your real stock.</p>
            </div>
          </div>
          <Button size="sm" className="h-8 shrink-0 bg-rose-600 text-white hover:bg-rose-700" onClick={retry}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      ) : null}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {[
          {
            label: "Stock value (cost)",
            value: `Rs ${formatMoney(stockMeta.totalInventoryValue)}`,
            hint: activeLocationId ? activeLocationName : "All locations",
            icon: Wallet,
            tone: "bg-indigo-50 text-indigo-600",
            accent: "bg-indigo-500",
          },
          {
            label: "Retail value",
            value: `Rs ${formatMoney(activeLocationId ? Number(branchSummary.find((b) => b.branchId === activeLocationId)?.retail || 0) : retailTotal)}`,
            hint: "On-hand × selling price",
            icon: PiggyBank,
            tone: "bg-emerald-50 text-emerald-600",
            accent: "bg-emerald-500",
          },
          {
            label: "Units on hand",
            value: formatQty(stockMeta.totalQuantity),
            hint: `${allCount.toLocaleString()} products · ${inStockCount.toLocaleString()} in stock`,
            icon: Boxes,
            tone: "bg-sky-50 text-sky-600",
            accent: "bg-sky-500",
          },
          {
            label: "Locations",
            value: (branchSummary.length || dashboardStats.totalLocations || 0).toLocaleString(),
            hint: `${(dashboardStats.pendingTransferCount || 0).toLocaleString()} transfer${dashboardStats.pendingTransferCount === 1 ? "" : "s"} pending`,
            icon: MapPin,
            tone: "bg-violet-50 text-violet-600",
            accent: "bg-violet-500",
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <span className={cn("absolute inset-x-0 top-0 h-1", card.accent)} aria-hidden />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-500">{card.label}</p>
                  {!statsReady && loading ? (
                    <div className="mt-2 h-7 w-28 animate-pulse rounded bg-slate-100" />
                  ) : (
                    <p className={cn("mt-2 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl", loadError ? "text-slate-300" : "text-slate-900")}>
                      {loadError ? "—" : card.value}
                    </p>
                  )}
                  <p className="mt-1 truncate text-xs text-slate-500">{card.hint}</p>
                </div>
                <div className={cn("hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:flex", card.tone)}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Alert tiles */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {[
          { key: "low", label: "Low stock", value: stockMeta.lowStockCount, hint: "At or below minimum", icon: AlertTriangle, on: "border-amber-200 bg-amber-50/60", iconOn: "bg-amber-100 text-amber-600", valueOn: "text-amber-700" },
          { key: "out", label: "Out of stock", value: stockMeta.outOfStockCount, hint: "Zero on hand", icon: MinusCircle, on: "border-rose-200 bg-rose-50/60", iconOn: "bg-rose-100 text-rose-600", valueOn: "text-rose-700" },
          { key: "negative", label: "Negative stock", value: stockMeta.negativeStockCount, hint: "Needs an adjustment", icon: TrendingDown, on: "border-rose-200 bg-rose-50/60", iconOn: "bg-rose-100 text-rose-600", valueOn: "text-rose-700" },
        ].map((tile) => {
          const Icon = tile.icon;
          const active = statsReady && tile.value > 0;
          const selected = stockStatusFilter === tile.key;
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => {
                setStockStatusFilter(selected ? ALL_STOCK_STATUS : tile.key);
                setCurrentPage(1);
              }}
              className={cn(
                "group flex min-w-0 items-center gap-3 rounded-xl border p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-4",
                active ? tile.on : "border-slate-200 bg-white",
                selected && "ring-2 ring-indigo-500/40",
              )}
            >
              <span className={cn("hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:flex", active ? tile.iconOn : "bg-slate-100 text-slate-400")}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-slate-600">{tile.label}</span>
                <span className={cn("block text-xl font-semibold tabular-nums", active ? tile.valueOn : "text-slate-400")}>
                  {statsReady ? tile.value.toLocaleString() : "—"}
                </span>
                <span className="hidden truncate text-[11px] text-slate-500 sm:block">
                  {selected ? "Filtering · click to clear" : tile.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Location cards */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900">Locations</h2>
            <p className="text-xs text-slate-500">Click a branch or warehouse to see only its stock</p>
          </div>
          {activeLocationId ? (
            <Button variant="outline" size="sm" className="h-8 bg-white" onClick={() => setLocation(ALL_BRANCHES)}>
              <X className="mr-1 h-3.5 w-3.5" />
              Show all locations
            </Button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {dashboardLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
                <div className="h-7 w-28 animate-pulse rounded bg-slate-100" />
                <div className="h-1.5 w-full animate-pulse rounded bg-slate-100" />
              </div>
            ))
          ) : locationCards.length === 0 ? (
            <div className="col-span-full flex flex-col items-center rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
              <Warehouse className="mb-2 h-6 w-6 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">
                {loadError ? "Locations couldn't be loaded" : "No locations with stock yet"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {loadError ? "Use Try again above." : "Add stock to a branch or warehouse to see it here."}
              </p>
            </div>
          ) : (
            locationCards.map((loc) => {
              const active = activeLocationId === loc.branchId;
              const isWarehouse = (loc.type || "").toUpperCase() === "WAREHOUSE";
              const share = locationValueTotal ? (Math.abs(Number(loc.value) || 0) / locationValueTotal) * 100 : 0;
              return (
                <button
                  key={loc.branchId}
                  type="button"
                  onClick={() => selectLocation(loc.branchId)}
                  className={cn(
                    "group rounded-xl border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                    active ? "border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-500/30" : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", isWarehouse ? "bg-violet-100 text-violet-600" : "bg-indigo-100 text-indigo-600")}>
                        {isWarehouse ? <Warehouse className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{loc.name}</p>
                        <p className="text-[11px] text-slate-500">{isWarehouse ? "Warehouse" : "Branch"}</p>
                      </div>
                    </div>
                    {active ? (
                      <span className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">Viewing</span>
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" />
                    )}
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <p className={cn("truncate text-lg font-semibold tabular-nums", Number(loc.value) < 0 ? "text-rose-600" : "text-slate-900")}>
                        Rs {formatMoney(loc.value)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        cost · retail Rs {formatMoney(Number(loc.retail || 0))}
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-[11px] tabular-nums text-slate-400">{share.toFixed(0)}% of value</p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${share}%` }} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                      {Number(loc.items || 0).toLocaleString()} SKUs
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                      {formatQty(Number(loc.quantity || 0))} units
                    </span>
                    {Number(loc.lowCount || 0) > 0 ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                        {loc.lowCount} low
                      </span>
                    ) : null}
                    {Number(loc.outCount || 0) > 0 ? (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
                        {loc.outCount} out
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="overflow-hidden rounded-xl border border-indigo-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                Filters
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">{activeFilterCount} active</span>
                ) : null}
              </p>
              <p className="truncate text-xs text-slate-500">
                {!hasStockMeta && loading
                  ? "Loading totals…"
                  : `${stockMeta.total.toLocaleString()} rows · ${formatQty(stockMeta.totalQuantity)} units · Rs ${formatMoney(stockMeta.totalInventoryValue)}`}
              </p>
            </div>
          </div>
          {loading && hasStockMeta ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating…
            </span>
          ) : null}
          {hasActiveFilters ? (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-8 border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800"
              onClick={clearFilters}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Clear filters
            </Button>
          ) : null}
        </div>
        <div className="space-y-4 border-t border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-indigo-50/30 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("mr-1", filterLabelCls)}>Status</span>
            {STOCK_STATUS_OPTIONS.map((opt) => {
              const active = stockStatusFilter === opt.value;
              const count = !hasStockMeta
                ? null
                : opt.value === ALL_STOCK_STATUS
                  ? allCount
                  : opt.value === "in"
                    ? inStockCount
                    : opt.value === "low"
                      ? stockMeta.lowStockCount
                      : opt.value === "out"
                        ? stockMeta.outOfStockCount
                        : opt.value === "negative"
                          ? stockMeta.negativeStockCount
                          : null;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setStockStatusFilter(opt.value);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                      : "border-indigo-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700",
                  )}
                >
                  {opt.label}
                  {count != null ? (
                    <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")}>
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-x-3 gap-y-4 border-t border-dashed border-indigo-200 pt-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label className={filterLabelCls}>Product name</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search by name…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={cn(filterControlCls, "pl-9")}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabelCls}>SKU</Label>
              <Input
                placeholder="e.g. 400674448"
                value={skuSearch}
                onChange={(e) => {
                  setSkuSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className={cn(filterControlCls, "font-mono")}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabelCls}>Barcode / code</Label>
              <Input
                placeholder="Scan or type…"
                value={barcodeSearch}
                onChange={(e) => {
                  setBarcodeSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className={cn(filterControlCls, "font-mono")}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabelCls}>Location</Label>
              <Select value={activeLocationId || ALL_BRANCHES} onValueChange={setLocation}>
                <SelectTrigger className={filterControlCls}>
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_BRANCHES}>All locations</SelectItem>
                  {branches.filter((b) => (b.branch_type || "").toUpperCase() !== "WAREHOUSE").length > 0 ? (
                    <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Branches</div>
                  ) : null}
                  {branches
                    .filter((b) => (b.branch_type || "").toUpperCase() !== "WAREHOUSE")
                    .map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  {warehouses.length > 0 ? (
                    <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Warehouses</div>
                  ) : null}
                  {warehouses.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabelCls}>Category</Label>
              <Select
                value={categoryFilter}
                onValueChange={(v) => {
                  setCategoryFilter(v);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className={filterControlCls}>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
                  {visibleCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabelCls}>Brand</Label>
              <Select
                value={brandFilter}
                onValueChange={(v) => {
                  setBrandFilter(v);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className={filterControlCls}>
                  <SelectValue placeholder="All brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_BRANDS}>All brands</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabelCls}>Supplier</Label>
              <Select
                value={supplierFilter}
                onValueChange={(v) => {
                  setSupplierFilter(v);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className={filterControlCls}>
                  <SelectValue placeholder="All suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SUPPLIERS}>All suppliers</SelectItem>
                  {supplierOptions.map((sup) => (
                    <SelectItem key={sup.id} value={sup.id}>
                      {sup.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Stock list */}
      <Card className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Package className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-slate-900">Stock list</h2>
              <p className="truncate text-xs text-slate-500">
                {activeLocationName} · {stockMeta.total.toLocaleString()} record{stockMeta.total === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            {(
              [
                { id: "table", label: "Table", icon: List },
                { id: "grid", label: "Grid", icon: LayoutGrid },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setViewMode(opt.id)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                    viewMode === opt.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
        <CardContent className="relative min-h-[280px] p-0">
          {loading && stocks.length === 0 ? (
            <div className="space-y-4 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-10 w-10 animate-pulse rounded-lg bg-slate-100" />
                  <div className="h-4 flex-1 animate-pulse rounded bg-slate-100" />
                  <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
                  <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
                <WifiOff className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-slate-900">Stock couldn&apos;t be loaded</p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">{loadError}</p>
              <Button size="sm" className="mt-4 h-8" onClick={retry}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Try again
              </Button>
            </div>
          ) : stocks.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Package className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-slate-900">No stock found</p>
              <p className="mt-1 text-xs text-slate-500">Adjust the filters or pick another location.</p>
              {hasActiveFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 h-8 border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800"
                  onClick={clearFilters}
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Clear filters
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              {loading ? (
                <div className="absolute inset-0 z-20 flex items-start justify-center bg-white/60 pt-20 backdrop-blur-[1px]">
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-md">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                    Updating…
                  </div>
                </div>
              ) : null}

              {viewMode === "table" ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 hover:bg-slate-50">
                        <TableHead className={cn(thCls, "pl-5")}>Product</TableHead>
                        <TableHead className={thCls}>Location</TableHead>
                        <TableHead className={cn(thCls, "text-right")}>On hand</TableHead>
                        <TableHead className={cn(thCls, "w-32")}>Level</TableHead>
                        <TableHead className={cn(thCls, "text-right")}>Cost / Sell</TableHead>
                        <TableHead className={cn(thCls, "text-right")}>Value</TableHead>
                        <TableHead className={thCls}>Status</TableHead>
                        <TableHead className={cn(thCls, "pr-5 text-right")}>Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stocks.map((s) => {
                        const qty = Number(s.current_quantity || 0);
                        const reserved = Number(s.reserved_quantity || 0);
                        const available = qty - reserved;
                        const cost = Number(s.product?.purchase_rate || 0);
                        const sell = Number(s.product?.sales_rate_inc_dis_and_tax || 0);
                        const minQty = Number(s.minimum_quantity ?? s.product?.min_qty ?? 10);
                        const imageUrl = getStockRowImage(s.product);
                        const categoryName = getCategoryLabel(s.product);
                        const isWarehouse = (s.branch?.branch_type || "").toUpperCase() === "WAREHOUSE";
                        const levelPct = minQty > 0 ? Math.max(0, Math.min(100, (Math.max(qty, 0) / (minQty * 2)) * 100)) : qty > 0 ? 100 : 0;
                        return (
                          <TableRow key={s.id} className="cursor-pointer border-slate-100 hover:bg-slate-50/70" onClick={() => openDetail(s)}>
                            <TableCell className="py-3 pl-5 pr-2">
                              <div className="flex min-w-0 items-center gap-3">
                                {imageUrl ? (
                                  <img src={imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-slate-100 object-cover" />
                                ) : (
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-100">
                                    <Package className="h-4 w-4 text-slate-400" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="max-w-[240px] truncate text-sm font-semibold text-slate-900">{s.product?.name || EMPTY}</p>
                                  <p className="truncate text-[11px] text-slate-500">
                                    <span className="font-mono">{s.product?.sku || getProductBarcode(s.product) || EMPTY}</span>
                                    {" · "}
                                    {categoryName}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap px-2 py-3 text-sm text-slate-700">
                              <span className="inline-flex items-center gap-1">
                                {isWarehouse ? <Warehouse className="h-3.5 w-3.5 text-violet-500" /> : <MapPin className="h-3.5 w-3.5 text-slate-400" />}
                                {s.branch?.name || EMPTY}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap px-2 py-3 text-right">
                              <p className={cn("text-base font-semibold tabular-nums", qty < 0 || available < 0 ? "text-rose-600" : "text-slate-900")}>
                                {formatQty(qty)}
                              </p>
                              {reserved > 0 ? (
                                <p className="text-[10px] text-slate-500">
                                  {formatQty(reserved)} reserved · {formatQty(available)} free
                                </p>
                              ) : null}
                            </TableCell>
                            <TableCell className="px-2 py-3">
                              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={cn("h-full rounded-full", qty <= 0 ? "bg-rose-500" : qty <= minQty ? "bg-amber-400" : "bg-emerald-500")}
                                  style={{ width: `${qty <= 0 ? 3 : levelPct}%` }}
                                />
                              </div>
                              <p className="mt-1 text-[10px] text-slate-400">min {formatQty(minQty)}</p>
                            </TableCell>
                            <TableCell className="whitespace-nowrap px-2 py-3 text-right text-sm tabular-nums">
                              <p className="text-slate-500">{formatMoney(cost)}</p>
                              <p className="font-semibold text-slate-900">{sell ? formatMoney(sell) : EMPTY}</p>
                            </TableCell>
                            <TableCell className="whitespace-nowrap px-2 py-3 text-right text-sm tabular-nums">
                              <p className="font-semibold text-slate-900">{formatMoney(qty * cost)}</p>
                              {sell ? <p className="text-[10px] text-emerald-700">retail {formatMoney(Math.max(qty, 0) * sell)}</p> : null}
                            </TableCell>
                            <TableCell className="px-2 py-3">
                              <StockStatusBadge qty={qty} minQty={minQty} />
                            </TableCell>
                            <TableCell className="whitespace-nowrap py-3 pl-2 pr-5 text-right text-xs text-slate-500">
                              {s.last_updated ? new Date(s.last_updated).toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : EMPTY}
                              <ChevronRight className="ml-1 inline h-3.5 w-3.5 text-slate-300" />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <InventoryCardGrid empty={false}>
                  {stocks.map((s) => {
                    const qty = Number(s.current_quantity || 0);
                    const reserved = Number(s.reserved_quantity || 0);
                    const cost = Number(s.product?.purchase_rate || 0);
                    const minQty = Number(s.minimum_quantity ?? s.product?.min_qty ?? 0);
                    return (
                      <StockRecordCard
                        key={s.id}
                        productName={s.product?.name || EMPTY}
                        sku={s.product?.sku}
                        barcode={getProductBarcode(s.product)}
                        category={getCategoryLabel(s.product)}
                        branch={s.branch?.name}
                        imageUrl={getStockRowImage(s.product)}
                        cost={cost}
                        quantity={qty}
                        reserved={reserved}
                        available={qty - reserved}
                        value={qty * cost}
                        minQty={minQty}
                        onView={() => openDetail(s)}
                      />
                    );
                  })}
                </InventoryCardGrid>
              )}
            </>
          )}

          {stocks.length > 0 ? (
            <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-sm text-slate-600 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <p className="tabular-nums">
                  Showing{" "}
                  <span className="font-medium text-slate-900">
                    {((currentPage - 1) * itemsPerPage + 1).toLocaleString()}–{Math.min(currentPage * itemsPerPage, stockMeta.total).toLocaleString()}
                  </span>{" "}
                  of <span className="font-medium text-slate-900">{stockMeta.total.toLocaleString()}</span>
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">Rows</span>
                  <Select
                    value={String(itemsPerPage)}
                    onValueChange={(v) => {
                      setItemsPerPage(Number(v));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 w-[72px] bg-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[25, 50, 100].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8 bg-white px-2.5" disabled={currentPage <= 1 || loading} onClick={() => setCurrentPage(1)}>
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 bg-white px-2.5"
                  disabled={currentPage <= 1 || loading}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pg = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                  return (
                    <Button
                      key={pg}
                      variant={pg === currentPage ? "default" : "outline"}
                      size="sm"
                      className={cn("h-8 min-w-[34px] px-2 tabular-nums", pg !== currentPage && "bg-white")}
                      onClick={() => setCurrentPage(pg)}
                      disabled={loading}
                    >
                      {pg}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 bg-white px-2.5"
                  disabled={currentPage >= totalPages || loading}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 bg-white px-2.5"
                  disabled={currentPage >= totalPages || loading}
                  onClick={() => setCurrentPage(totalPages)}
                >
                  Last
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Row details */}
      <DetailSheet
        open={!!detailRow}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
        size="xl"
      >
        <DetailSheetHeader
          title="Stock details"
          subtitle={
            detailRow
              ? `${detailRow.product?.name} at ${detailRow.branch?.name}`
              : undefined
          }
        />
        <DetailSheetBody>
          {detailLoading ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <p className="text-sm text-gray-600">Loading product details...</p>
            </div>
          ) : detailError ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-gray-600">{detailError}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 text-sm text-black"
                onClick={() => detailRow && openDetail(detailRow)}
              >
                Try again
              </Button>
            </div>
          ) : detailRow ? (
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <DetailSection title="Product">
                  <DetailRow label="Name" value={detailRow.product?.name} />
                  <DetailRow
                    label="SKU"
                    value={
                      (detailProduct?.sku as string) || detailRow.product?.sku
                    }
                  />
                  <DetailRow
                    label="Barcode"
                    value={(detailProduct?.code as string) || EMPTY}
                  />
                  <DetailRow
                    label="Category"
                    value={getCategoryLabel(detailRow.product, detailProduct)}
                  />
                  <DetailRow
                    label="Subcategory"
                    value={
                      (detailProduct?.subcategory as { name?: string })?.name &&
                      (detailProduct?.subcategory as { name?: string }).name !==
                        "Unknown"
                        ? (detailProduct?.subcategory as { name?: string }).name
                        : EMPTY
                    }
                  />
                  <DetailRow
                    label="Brand"
                    value={
                      (detailProduct?.brand as { name?: string })?.name || EMPTY
                    }
                  />
                  <DetailRow
                    label="Unit"
                    value={
                      (detailProduct?.unit as { name?: string })?.name || EMPTY
                    }
                  />
                  <DetailRow
                    label="Supplier"
                    value={
                      (detailProduct?.supplier as { name?: string })?.name &&
                      (detailProduct?.supplier as { name?: string }).name !==
                        "Unknown"
                        ? (detailProduct?.supplier as { name?: string }).name
                        : EMPTY
                    }
                  />
                  <DetailRow
                    label="Tax"
                    value={
                      (detailProduct?.tax as { name?: string })?.name || EMPTY
                    }
                  />
                  <DetailRow
                    label="Product active"
                    value={detailProduct?.is_active === false ? "No" : "Yes"}
                  />
                </DetailSection>

                <DetailSection title="Stock at this branch">
                  <DetailRow label="Branch" value={detailRow.branch?.name} />
                  <DetailRow
                    label="Quantity on hand"
                    value={formatQty(detailRow.current_quantity)}
                  />
                  <DetailRow
                    label="Reserved"
                    value={formatQty(detailRow.reserved_quantity ?? 0)}
                  />
                  <DetailRow
                    label="Available to sell"
                    value={formatQty(detailAvailable)}
                  />
                  <DetailRow
                    label="Minimum stock"
                    value={formatQty(detailMinStock)}
                  />
                  <DetailRow
                    label="Maximum stock"
                    value={
                      detailMaxStock > 0 ? formatQty(detailMaxStock) : EMPTY
                    }
                  />
                  <DetailRow
                    label="Reorder level"
                    value={
                      detailRow.reorder_level != null
                        ? formatQty(detailRow.reorder_level)
                        : EMPTY
                    }
                  />
                  <DetailRow
                    label="Last updated"
                    value={
                      detailRow.last_updated
                        ? new Date(detailRow.last_updated).toLocaleString()
                        : EMPTY
                    }
                  />
                  <DetailRow
                    label="Stock status"
                    value={
                      detailRow ? (
                        <StockStatusBadge
                          qty={Number(detailRow.current_quantity || 0)}
                          minQty={detailMinStock}
                          showIcon
                        />
                      ) : (
                        EMPTY
                      )
                    }
                  />
                </DetailSection>

                <DetailSection title="Pricing">
                  <DetailRow
                    label="Purchase rate"
                    value={formatMoney(detailProduct?.purchase_rate)}
                  />
                  <DetailRow
                    label="Sales rate (ex. tax)"
                    value={formatMoney(
                      detailProduct?.sales_rate_exc_dis_and_tax,
                    )}
                  />
                  <DetailRow
                    label="Sales rate (inc. tax)"
                    value={formatMoney(
                      detailProduct?.sales_rate_inc_dis_and_tax,
                    )}
                  />
                  <DetailRow
                    label="Discount %"
                    value={
                      detailProduct?.discount_percentage != null
                        ? `${detailProduct.discount_percentage}%`
                        : EMPTY
                    }
                  />
                </DetailSection>

                <DetailSection title="Identifiers">
                  <DetailRow
                    label="HS / PCT code"
                    value={(detailProduct?.pct_or_hs_code as string) || EMPTY}
                  />
                  <DetailRow
                    label="Size"
                    value={
                      (detailProduct?.size as { name?: string })?.name || EMPTY
                    }
                  />
                  <DetailRow
                    label="Color"
                    value={
                      (detailProduct?.color as { name?: string })?.name || EMPTY
                    }
                  />
                  <DetailRow
                    label="Weight"
                    value={
                      detailProduct?.weight != null
                        ? `${detailProduct.weight} ${(detailProduct?.weight_unit as string) || ""}`.trim()
                        : EMPTY
                    }
                  />
                </DetailSection>
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-5 mt-2 border-t border-gray-200">
                {onNavigate ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm text-black"
                    onClick={() => {
                      closeDetail();
                      onNavigate("transfers");
                    }}
                  >
                    <ArrowRightLeft className="h-4 w-4 mr-1.5" />
                    Transfer stock
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-sm text-black"
                  onClick={closeDetail}
                >
                  Close
                </Button>
              </div>
            </div>
          ) : null}
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={closeDetail}>
            Close
          </Button>
        </DetailSheetFooter>
      </DetailSheet>
    </div>
  );
}
