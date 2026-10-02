"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Plus,
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  Package,
  Loader2,
  Calendar,
  Edit,
  MapPin,
  Filter,
  Trash2,
  X,
  FileDown,
  Eye,
  AlertTriangle,
  Boxes,
  DollarSign,
  MinusCircle,
  LayoutGrid,
  List,
  ArrowDownToLine,
  ArrowUpFromLine,
  SlidersHorizontal,
  MoreHorizontal,
  Wallet,
  RefreshCw,
  Clock,
  History,
  Warehouse,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { usePosData } from "@/hooks/use-pos-data";
import { useLogoDataUri } from "@/hooks/use-logo-data-uri";
import { useScrollToTopOnPageChange } from "@/hooks/use-scroll-to-top-on-page-change";
import { PageLoader } from "@/components/ui/page-loader";
import { Textarea } from "@/components/ui/textarea";
import {
  ALL_BRANCHES,
  ALL_BRANDS,
  ALL_CATEGORIES,
  ALL_STOCK_STATUS,
  ALL_SUPPLIERS,
  STOCK_STATUS_OPTIONS,
} from "@/components/inventory/stock-ops/constants";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import { StockManagementToolbar } from "@/components/inventory/stock-ops/stock-management-toolbar";
import {
  downloadExcel,
  downloadBrandedPdf,
  getProductBarcode,
  getStockRowImage,
  yieldForUi,
} from "@/components/inventory/stock-ops/export-utils";
import {
  getStockStatusDisplay,
  StockStatusBadge,
} from "@/components/inventory/stock-ops/stock-status-badge";
import {
  StockProductPicker,
  type StockLineItem,
} from "@/components/inventory/stock-ops/stock-product-picker";
import {
  StockOperationDialog,
  STOCK_DLG,
  StockSelectSkeleton,
} from "@/components/inventory/stock-ops/stock-operation-dialog";
import { InventoryCardGrid } from "@/components/inventory/stock-ops/inventory-card-grid";
import { StockRecordCard } from "@/components/inventory/stock-ops/stock-record-card";
import { MovementRecordCard } from "@/components/inventory/stock-ops/movement-record-card";

const DLG = {
  content: "max-w-2xl border border-gray-200 p-0 gap-0 max-h-[90vh] overflow-y-auto",
  header: "px-5 py-4 border-b border-gray-200",
  title: "text-base text-black font-normal",
  desc: "text-sm text-gray-600 font-normal",
  body: "px-5 py-4 space-y-4",
  label: "text-sm text-black font-normal",
  field: "h-9 text-sm text-black border-gray-200",
  footer: "flex justify-end gap-2 px-5 py-4 border-t border-gray-200",
  dropdown:
    "absolute left-0 right-0 z-[100] mt-1 max-h-56 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-md",
  pickRow: "flex w-full flex-col px-3 py-2 text-left hover:bg-gray-50 text-sm text-black",
  pickSku: "text-xs text-gray-500",
};

function validateStockLines(
  lines: StockLineItem[],
  mode: "positive" | "signed",
): string | null {
  if (lines.length === 0) return "Add at least one product";
  for (const line of lines) {
    const q = Number(line.quantity);
    if (!Number.isFinite(q)) {
      return `Invalid quantity for ${line.productName}`;
    }
    if (mode === "signed" && q === 0) {
      return `Change cannot be zero for ${line.productName}`;
    }
    if (mode === "positive" && q <= 0) {
      return `Quantity must be greater than 0 for ${line.productName}`;
    }
  }
  return null;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className="text-sm text-black text-right">{value ?? "-"}</dd>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | number;
  loading?: boolean;
}) {
  return (
    <Card className="p-4 border border-gray-200">
      <p className="text-sm font-semibold text-gray-700">{label}</p>
      {loading ? (
        <div className="h-7 w-20 bg-gray-100 animate-pulse rounded mt-2" />
      ) : (
        <p className="text-xl text-black mt-1">{value}</p>
      )}
    </Card>
  );
}

interface Product {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  category_id?: string;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface Stock {
  id: string;
  product: Product & {
    purchase_rate?: number | string;
    sales_rate_inc_dis_and_tax?: number | string;
    brand?: { id: string; name: string } | null;
    category?: { id: string; name: string } | null;
    supplier?: { id: string; name: string } | null;
    ProductImage?: { image: string }[];
    code?: string;
  };
  branch: Branch;
  current_quantity: number;
  reserved_quantity?: number | string;
  last_updated: string;
}

interface StockManagementProps {
  onNavigate?: (tab: string) => void;
}

interface Movement {
  id: string;
  product: Product;
  branch: Branch;
  movement_type: string;
  quantity_change: number;
  previous_qty: number;
  new_qty: number;
  created_at: string;
  notes?: string;
  user?: { email: string };
}

export function StockManagement({ onNavigate }: StockManagementProps) {
  const logoDataUri = useLogoDataUri();

  // Global store data — shared catalog across Stock In / Out / Management
  const { 
    products: globalProducts, 
    categories,
    branches,
    suppliers,
    branchesLoading,
    suppliersLoading,
    isAnyLoading: globalLoading,
    fetchProducts,
    fetchBranches,
    fetchSuppliers,
    refreshAllData: triggerGlobalRefresh,
  } = usePosData();
  
  // Data lists
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [allStocks, setAllStocks] = useState<Stock[]>([]);
  const [history, setHistory] = useState<Movement[]>([]);
  const [todayMovements, setTodayMovements] = useState<Movement[]>([]);
  
  // Pagination and meta — single source of truth for KPIs + chips + table
  const [totalStocks, setTotalStocks] = useState(0);
  const [stockMeta, setStockMeta] = useState({
    page: 1,
    limit: 20,
    totalPages: 1,
    totalQuantity: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    negativeStockCount: 0,
    totalInventoryValue: 0,
    totalProducts: 0,
  });
  const [hasStockMeta, setHasStockMeta] = useState(false);

  // UI state
  const [branchFilter, setBranchFilter] = useState<string>(ALL_BRANCHES);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);
  const [brandFilter, setBrandFilter] = useState<string>(ALL_BRANDS);
  const [supplierFilter, setSupplierFilter] = useState<string>(ALL_SUPPLIERS);
  const [stockStatusFilter, setStockStatusFilter] = useState<string>(ALL_STOCK_STATUS);
  const [searchTerm, setSearchTerm] = useState("");
  const [skuSearch, setSkuSearch] = useState("");
  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Apply the filter bar to Movement Log + Today too - currently only the
  // Stock List respects it. Filter is client-side over the already-fetched
  // arrays. SKU + name search, branch by id, category via product.category_id.
  const filterMovement = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return (m: Movement) => {
      if (branchFilter !== ALL_BRANCHES && m.branch?.id !== branchFilter) return false;
      if (
        categoryFilter !== ALL_CATEGORIES &&
        m.product?.category_id !== categoryFilter
      )
        return false;
      if (term) {
        const name = (m.product?.name || "").toLowerCase();
        const sku = (m.product?.sku || "").toLowerCase();
        if (!name.includes(term) && !sku.includes(term)) return false;
      }
      return true;
    };
  }, [branchFilter, categoryFilter, searchTerm]);
  const filteredHistory = useMemo(
    () => history.filter(filterMovement),
    [history, filterMovement],
  );
  const filteredTodayMovements = useMemo(
    () => todayMovements.filter(filterMovement),
    [todayMovements, filterMovement],
  );
  const [isTransferring, setIsTransferring] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewRow, setViewRow] = useState<Stock | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewProduct, setViewProduct] = useState<Record<string, unknown> | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);

  // Multi-product line items per operation modal
  const [addLines, setAddLines] = useState<StockLineItem[]>([]);
  const [adjustLines, setAdjustLines] = useState<StockLineItem[]>([]);
  const [removeLines, setRemoveLines] = useState<StockLineItem[]>([]);
  const [transferLines, setTransferLines] = useState<StockLineItem[]>([]);

  // Pagination for stock table
  const [stockPage, setStockPage] = useState(1);
  const [stockPageSize, setStockPageSize] = useState(20);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [activeTab, setActiveTab] = useState("stock");
  useScrollToTopOnPageChange(stockPage);
  const [exporting, setExporting] = useState(false);

  // Dialog state
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);

  // --- Per-field validation errors ---------------------------------------â”€â”€
  type FieldErrors = Record<string, string>;
  const [addErrors,      setAddErrors]      = useState<FieldErrors>({});
  const [adjustErrors,   setAdjustErrors]   = useState<FieldErrors>({});
  const [removeErrors,   setRemoveErrors]   = useState<FieldErrors>({});
  const [transferErrors, setTransferErrors] = useState<FieldErrors>({});

  // Form metadata (branch, reason, notes - quantities live on line items)
  const [transferForm, setTransferForm] = useState({
    fromBranchId: "",
    toBranchId: "",
    notes: "",
  });

  const [addForm, setAddForm] = useState({
    branchId: "",
    supplierId: "",
    invoiceRef: "",
    notes: "",
  });

  const [adjustForm, setAdjustForm] = useState({
    branchId: "",
    reason: "CORRECTION",
    notes: "",
  });

  const [removeForm, setRemoveForm] = useState({
    branchId: "",
    reason: "WASTE",
    notes: "",
  });

  // Full on-hand map per branch for the operation dialogs. The table only
  // holds the current page, so looking quantities up there showed 0 for any
  // product that wasn't on screen.
  const [branchStock, setBranchStock] = useState<Record<string, Record<string, number>>>({});
  const branchStockLoading = useRef<Set<string>>(new Set());
  const loadBranchStock = useCallback(async (branchId: string) => {
    if (!branchId || branchStockLoading.current.has(branchId)) return;
    branchStockLoading.current.add(branchId);
    try {
      const res = await apiClient.get(`${API_BASE}/stock`, {
        params: { branchId, page: 1, limit: 10000 },
      });
      const map: Record<string, number> = {};
      for (const row of res.data?.data || []) {
        const pid = row.product?.id || row.product_id;
        if (pid) map[pid] = Number(row.current_quantity) || 0;
      }
      setBranchStock((prev) => ({ ...prev, [branchId]: map }));
    } catch {
      branchStockLoading.current.delete(branchId);
    }
  }, []);
  const invalidateBranchStock = useCallback(() => {
    branchStockLoading.current.clear();
    setBranchStock({});
  }, []);

  const getStockQty = useCallback(
    (productId: string, branchId: string) => {
      const cached = branchStock[branchId];
      if (cached) return cached[productId] ?? 0;
      const row = allStocks.find(
        (s) => s.product?.id === productId && s.branch?.id === branchId,
      );
      return row ? Number(row.current_quantity) : 0;
    },
    [allStocks, branchStock],
  );

  const refreshLineStock = useCallback(
    (
      lines: StockLineItem[],
      branchId: string,
      setter: React.Dispatch<React.SetStateAction<StockLineItem[]>>,
    ) => {
      if (!branchId) return;
      setter(
        lines.map((l) => ({
          ...l,
          currentQty: getStockQty(l.productId, branchId),
        })),
      );
    },
    [getStockQty],
  );

  useEffect(() => {
    [
      addForm.branchId,
      adjustForm.branchId,
      removeForm.branchId,
      transferForm.fromBranchId,
      transferForm.toBranchId,
    ]
      .filter(Boolean)
      .forEach((id) => loadBranchStock(id));
  }, [
    addForm.branchId,
    adjustForm.branchId,
    removeForm.branchId,
    transferForm.fromBranchId,
    transferForm.toBranchId,
    loadBranchStock,
  ]);

  // Catalog for the pickers, with price / cost / category for richer cards.
  const pickerProducts = useMemo(
    () =>
      (globalProducts || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku ?? null,
        barcode: p.barcode ?? p.code ?? null,
        category_id: p.categoryId ?? null,
        categoryId: p.categoryId ?? null,
        categoryName: p.category ?? null,
        price: Number(p.price) || null,
        cost: Number(p.purchase_rate) || null,
      })),
    [globalProducts],
  );

  const supplierOptions = useMemo(
    () =>
      (suppliers || [])
        .filter((s: any) => s?.id && s?.name)
        .map((s: any) => ({ id: s.id, name: s.name })),
    [suppliers],
  );

  // Shared POS store for products/branches/suppliers (cache-aware). Brands stay local.
  useEffect(() => {
    let cancelled = false;
    const loadMeta = async () => {
      setIsInitialLoading(true);
      setBrandsLoading(true);
      try {
        await Promise.all([
          fetchProducts(),
          fetchBranches(),
          fetchSuppliers(),
        ]);
        const brandRes = await apiClient.get(`${API_BASE}/brands`, {
          params: { limit: 100 },
        });
        if (!cancelled) {
          setBrands(brandRes.data?.data || brandRes.data || []);
        }
      } catch (e: any) {
        console.error(e);
        toast.error("Failed to load catalog metadata");
      } finally {
        if (!cancelled) {
          setBrandsLoading(false);
          setIsInitialLoading(false);
        }
      }
    };
    loadMeta();
    return () => {
      cancelled = true;
    };
  }, [fetchProducts, fetchBranches, fetchSuppliers]);

  const showErrorToast = (e: any) => {
    console.error("Inventory Operation Error:", e);
    const message = e.response?.data?.message || e.message || "An unexpected operation failure occurred";
    toast.error(message);
  };

  // Reset to page 1 when search changes
  useEffect(() => {
    setStockPage(1);
  }, [searchTerm, skuSearch, barcodeSearch, brandFilter, supplierFilter, stockStatusFilter]);

  const combinedSearch = useMemo(() => {
    return [searchTerm, skuSearch, barcodeSearch].filter(Boolean).join(" ").trim();
  }, [searchTerm, skuSearch, barcodeSearch]);

  const refreshAllData = useCallback(async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: stockPage.toString(),
          limit: stockPageSize.toString(),
        });
        
        if (branchFilter && branchFilter !== ALL_BRANCHES) params.append('branchId', branchFilter);
        if (categoryFilter && categoryFilter !== ALL_CATEGORIES) params.append('categoryId', categoryFilter);
        if (brandFilter && brandFilter !== ALL_BRANDS) params.append('brandId', brandFilter);
        if (supplierFilter && supplierFilter !== ALL_SUPPLIERS) params.append('supplierId', supplierFilter);
        if (stockStatusFilter && stockStatusFilter !== ALL_STOCK_STATUS) params.append('stockStatus', stockStatusFilter);
        if (combinedSearch) params.append('search', combinedSearch);
        
        const [sRes, hRes, tRes] = await Promise.all([
          apiClient.get(`${API_BASE}/stock?${params}`),
          apiClient.get(`${API_BASE}/stock/history?${params}`),
          apiClient.get(`${API_BASE}/stock/today?${params}`),
        ]);
        
        setAllStocks(sRes.data.data || []);
        setTotalStocks(sRes.data.meta?.total || 0);
        if (sRes.data.meta) {
          setStockMeta(sRes.data.meta);
          setHasStockMeta(true);
        }
        setHistory(hRes.data.data || []);
        setTodayMovements(tRes.data.data || []);
      } catch (e: any) {
        toast.error("Failed to load stock data");
      } finally {
        setIsLoading(false);
      }
    }, [
      branchFilter,
      categoryFilter,
      brandFilter,
      supplierFilter,
      stockStatusFilter,
      combinedSearch,
      stockPage,
      stockPageSize,
    ]);

  useEffect(() => {
    refreshAllData();
  }, [refreshAllData]);

  const buildExportRows = useCallback(() => {
    return allStocks.map((s) => {
      const qty = Number(s.current_quantity || 0);
      const reserved = Number(s.reserved_quantity || 0);
      const cost = Number(s.product?.purchase_rate || 0);
      const sell = Number(s.product?.sales_rate_inc_dis_and_tax || 0);
      return [
        s.product?.name || "",
        s.product?.sku || "",
        getProductBarcode(s.product),
        s.product?.category?.name || categories.find((c) => c.id === s.product?.category_id)?.name || "",
        s.product?.brand?.name || "",
        cost,
        sell,
        qty,
        reserved,
        qty - reserved,
        qty * cost,
        s.branch?.name || "",
      ];
    });
  }, [allStocks, categories]);

  const exportHeaders = [
    "Product",
    "SKU",
    "Barcode",
    "Category",
    "Brand",
    "Cost Price",
    "Selling Price",
    "Current Stock",
    "Reserved",
    "Available",
    "Inventory Value",
    "Branch",
  ];

  const handleExportExcel = async () => {
    if (allStocks.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      downloadExcel(
        `inventory_export_${new Date().toISOString().split("T")[0]}.xlsx`,
        "Inventory",
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

  const handleExportPdf = async () => {
    if (allStocks.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      const branchLabel =
        branchFilter === ALL_BRANCHES
          ? "All branches"
          : branches.find((b) => b.id === branchFilter)?.name || "Selected branch";

      const pdfRows = allStocks.map((s) => {
        const qty = Number(s.current_quantity || 0);
        const reserved = Number(s.reserved_quantity || 0);
        const available = qty - reserved;
        const cost = Number(s.product?.purchase_rate || 0);
        return [
          s.product?.name || "",
          s.product?.sku || getProductBarcode(s.product) || "",
          s.branch?.name || "",
          formatQty(available),
          formatMoney(cost),
          formatMoney(qty * cost),
        ];
      });

      await downloadBrandedPdf({
        filename: `inventory_export_${new Date().toISOString().split("T")[0]}.pdf`,
        title: "Stock Management Report",
        subtitle: branchLabel,
        logoDataUri,
        summary: [
          { label: "Records", value: totalStocks.toLocaleString() },
          { label: "Quantity", value: formatQty(stockMeta.totalQuantity || 0) },
          {
            label: "Inventory Value",
            value: formatMoney(stockMeta.totalInventoryValue || 0),
          },
          {
            label: "Low Stock",
            value: (stockMeta.lowStockCount || 0).toLocaleString(),
          },
        ],
        columns: [
          { header: "Product", width: 2.2 },
          { header: "SKU", width: 1.1 },
          { header: "Branch", width: 1.3 },
          { header: "Available", align: "right", width: 0.9 },
          { header: "Cost", align: "right", width: 0.9 },
          { header: "Value", align: "right", width: 1 },
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
  // Derived analytics — same stockMeta as the table (no separate dashboard race)
  const paginationOptions = [20, 50, 100, 500];
  const totalUnits = stockMeta.totalQuantity || 0;
  const alerts = stockMeta.lowStockCount || 0;
  const totalStockPages = stockMeta.totalPages || 1;
  const statsLoading = !hasStockMeta && isLoading;
  const allStatusCount = stockMeta.totalProducts || totalStocks;
  const inStockCount = Math.max(
    0,
    allStatusCount - (stockMeta.outOfStockCount || 0) - (stockMeta.lowStockCount || 0),
  );

  const runBatchStockOps = async (
    lines: StockLineItem[],
    worker: (line: StockLineItem) => Promise<void>,
  ) => {
    let ok = 0;
    let fail = 0;
    let lastError: unknown = null;
    for (const line of lines) {
      try {
        await worker(line);
        ok++;
      } catch (e) {
        fail++;
        lastError = e;
      }
    }
    return { ok, fail, lastError };
  };

  const handleAddStock = async () => {
    const errors: FieldErrors = {};
    if (!addForm.branchId) errors.branchId = "Branch is required";
    const lineErr = validateStockLines(addLines, "positive");
    if (lineErr) errors.lines = lineErr;
    if (Object.keys(errors).length > 0) {
      setAddErrors(errors);
      return;
    }
    setAddErrors({});
    setIsTransferring(true);
    try {
      const { ok, fail, lastError } = await runBatchStockOps(addLines, (line) =>
        apiClient.post(`${API_BASE}/stock`, {
          productId: line.productId,
          branchId: addForm.branchId,
          quantity: Number(line.quantity),
          supplierId: addForm.supplierId || undefined,
          unitCost: line.unitCost ? Number(line.unitCost) : undefined,
          invoiceRef: addForm.invoiceRef || undefined,
          notes: addForm.notes || undefined,
        }),
      );
      if (ok > 0) {
        setIsAddOpen(false);
        clearProductUI();
        invalidateBranchStock();
        refreshAllData();
        toast.success(`Stock added for ${ok} product${ok === 1 ? "" : "s"}`);
      }
      if (fail > 0) showErrorToast(lastError);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleAdjustStock = async () => {
    const errors: FieldErrors = {};
    if (!adjustForm.branchId) errors.branchId = "Branch is required";
    const lineErr = validateStockLines(adjustLines, "signed");
    if (lineErr) errors.lines = lineErr;
    if (Object.keys(errors).length > 0) {
      setAdjustErrors(errors);
      return;
    }
    setAdjustErrors({});
    setIsTransferring(true);
    try {
      const { ok, fail, lastError } = await runBatchStockOps(adjustLines, (line) =>
        apiClient.patch(`${API_BASE}/stock/adjust`, {
          productId: line.productId,
          branchId: adjustForm.branchId,
          quantityChange: Number(line.quantity),
          reason: adjustForm.reason || undefined,
          notes: adjustForm.notes || undefined,
        }),
      );
      if (ok > 0) {
        setIsAdjustOpen(false);
        clearProductUI();
        invalidateBranchStock();
        refreshAllData();
        toast.success(`Stock adjusted for ${ok} product${ok === 1 ? "" : "s"}`);
      }
      if (fail > 0) showErrorToast(lastError);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleRemoveStock = async () => {
    const errors: FieldErrors = {};
    if (!removeForm.branchId) errors.branchId = "Branch is required";
    const lineErr = validateStockLines(removeLines, "positive");
    if (lineErr) errors.lines = lineErr;
    if (Object.keys(errors).length > 0) {
      setRemoveErrors(errors);
      return;
    }
    setRemoveErrors({});
    setIsTransferring(true);
    try {
      const { ok, fail, lastError } = await runBatchStockOps(removeLines, (line) =>
        apiClient.delete(`${API_BASE}/stock/remove`, {
          data: {
            productId: line.productId,
            branchId: removeForm.branchId,
            quantity: Number(line.quantity),
            reason: removeForm.reason,
            notes: removeForm.notes || undefined,
          },
        }),
      );
      if (ok > 0) {
        setIsRemoveOpen(false);
        clearProductUI();
        invalidateBranchStock();
        refreshAllData();
        toast.success(`Stock removed for ${ok} product${ok === 1 ? "" : "s"}`);
      }
      if (fail > 0) showErrorToast(lastError);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleTransfer = async () => {
    const errors: FieldErrors = {};
    if (!transferForm.fromBranchId) errors.fromBranchId = "From branch is required";
    if (!transferForm.toBranchId) errors.toBranchId = "To branch is required";
    if (
      transferForm.fromBranchId &&
      transferForm.toBranchId &&
      transferForm.fromBranchId === transferForm.toBranchId
    ) {
      errors.toBranchId = "From and To branch must be different";
    }
    const lineErr = validateStockLines(transferLines, "positive");
    if (lineErr) errors.lines = lineErr;
    if (Object.keys(errors).length > 0) {
      setTransferErrors(errors);
      return;
    }
    setTransferErrors({});
    setIsTransferring(true);
    try {
      const { ok, fail, lastError } = await runBatchStockOps(transferLines, (line) =>
        apiClient.post(`${API_BASE}/stock/transfer`, {
          productId: line.productId,
          fromBranchId: transferForm.fromBranchId,
          toBranchId: transferForm.toBranchId,
          quantity: Number(line.quantity),
          notes: transferForm.notes,
        }),
      );
      if (ok > 0) {
        setIsTransferOpen(false);
        clearProductUI();
        invalidateBranchStock();
        refreshAllData();
        toast.success(`Stock transferred for ${ok} product${ok === 1 ? "" : "s"}`);
      }
      if (fail > 0) showErrorToast(lastError);
    } finally {
      setIsTransferring(false);
    }
  };

  const getMovementBadge = (type: string) => {
    const incoming = ["PURCHASE", "TRANSFER_IN", "RETURN"];
    const outgoing = ["SALE", "TRANSFER_OUT", "DAMAGE", "EXPIRED", "LOSS", "PURCHASE_RETURN"];
    const label = type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    const tone = incoming.includes(type)
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
      : outgoing.includes(type)
        ? "bg-rose-50 text-rose-700 ring-rose-600/20"
        : type === "ADJUSTMENT"
          ? "bg-amber-50 text-amber-700 ring-amber-600/20"
          : "bg-slate-100 text-slate-700 ring-slate-500/20";
    return (
      <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", tone)}>
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
        {label}
      </span>
    );
  };

  const formatQty = (value: number) => {
    const num = Number(value || 0);
    if (Number.isInteger(num)) return num.toLocaleString();
    return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const getStockStatusMeta = (qty: number, minQty = 10) => getStockStatusDisplay(qty, minQty);

  const openStockView = useCallback(async (row: Stock) => {
    setViewRow(row);
    setViewOpen(true);
    setViewLoading(true);
    setViewProduct(null);
    setViewError(null);
    try {
      const res = await apiClient.get(`${API_BASE}/products/${row.product.id}`);
      setViewProduct(res.data?.data ?? res.data ?? null);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setViewError(err?.response?.data?.message || "Could not load product details");
    } finally {
      setViewLoading(false);
    }
  }, []);

  const closeStockView = () => {
    setViewOpen(false);
    setViewRow(null);
    setViewProduct(null);
    setViewError(null);
    setViewLoading(false);
  };

  const viewMovements = useMemo(() => {
    if (!viewRow) return [];
    return history
      .filter(
        (m) =>
          m.product?.id === viewRow.product.id &&
          m.branch?.id === viewRow.branch?.id,
      )
      .slice(0, 10);
  }, [history, viewRow]);

  const formatMoney = (v: unknown) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "-";
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const clearProductUI = () => {
    setAddLines([]);
    setAdjustLines([]);
    setRemoveLines([]);
    setTransferLines([]);
    setAddForm({ branchId: "", supplierId: "", invoiceRef: "", notes: "" });
    setAdjustForm({ branchId: "", reason: "CORRECTION", notes: "" });
    setRemoveForm({ branchId: "", reason: "WASTE", notes: "" });
    setTransferForm({ fromBranchId: "", toBranchId: "", notes: "" });
  };

  const activeFilterCount =
    (searchTerm.trim() ? 1 : 0) +
    (skuSearch.trim() ? 1 : 0) +
    (barcodeSearch.trim() ? 1 : 0) +
    (branchFilter !== ALL_BRANCHES ? 1 : 0) +
    (categoryFilter !== ALL_CATEGORIES ? 1 : 0) +
    (brandFilter !== ALL_BRANDS ? 1 : 0) +
    (supplierFilter !== ALL_SUPPLIERS ? 1 : 0) +
    (stockStatusFilter !== ALL_STOCK_STATUS ? 1 : 0);

  const clearAllStockFilters = () => {
    setSearchTerm("");
    setSkuSearch("");
    setBarcodeSearch("");
    setBranchFilter(ALL_BRANCHES);
    setCategoryFilter(ALL_CATEGORIES);
    setBrandFilter(ALL_BRANDS);
    setSupplierFilter(ALL_SUPPLIERS);
    setStockStatusFilter(ALL_STOCK_STATUS);
    setStockPage(1);
  };

  const filterLabelCls = "text-xs font-semibold text-indigo-900/80";
  const filterControlCls = "h-10 border-indigo-200/80 bg-white text-sm shadow-sm";

  type StockOp = "add" | "adjust" | "remove" | "transfer";
  const openOperation = (kind: StockOp, row?: Stock) => {
    clearProductUI();
    const branchId = row?.branch?.id || (branchFilter !== ALL_BRANCHES ? branchFilter : "");
    const lines: StockLineItem[] = row
      ? [
          {
            productId: row.product.id,
            productName: row.product.name,
            sku: row.product.sku,
            quantity: kind === "adjust" ? "" : 1,
            unitCost:
              kind === "add" && Number(row.product.purchase_rate) > 0
                ? String(Number(row.product.purchase_rate))
                : "",
            currentQty: Number(row.current_quantity) || 0,
          },
        ]
      : [];
    if (kind === "add") {
      setAddForm((f) => ({ ...f, branchId }));
      setAddLines(lines);
      setIsAddOpen(true);
    } else if (kind === "adjust") {
      setAdjustForm((f) => ({ ...f, branchId }));
      setAdjustLines(lines);
      setIsAdjustOpen(true);
    } else if (kind === "remove") {
      setRemoveForm((f) => ({ ...f, branchId }));
      setRemoveLines(lines);
      setIsRemoveOpen(true);
    } else {
      setTransferForm((f) => ({ ...f, fromBranchId: branchId }));
      setTransferLines(lines);
      setIsTransferOpen(true);
    }
  };

  const thCls = "h-10 whitespace-nowrap px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500";

  const renderRowActions = (row: Stock) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="outline" className="h-8 w-8" title="Stock actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="truncate text-xs font-normal text-slate-500">
          {row.product.name} · {row.branch?.name}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openOperation("add", row)}>
          <ArrowDownToLine className="mr-2 h-4 w-4 text-emerald-600" /> Add stock
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openOperation("adjust", row)}>
          <SlidersHorizontal className="mr-2 h-4 w-4 text-amber-600" /> Adjust count
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openOperation("transfer", row)}>
          <ArrowRightLeft className="mr-2 h-4 w-4 text-blue-600" /> Transfer
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openOperation("remove", row)} className="text-rose-600 focus:text-rose-700">
          <ArrowUpFromLine className="mr-2 h-4 w-4" /> Remove stock
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const sumUnits = (lines: StockLineItem[]) => lines.reduce((t, l) => t + (Number(l.quantity) || 0), 0);
  const opHint = (lines: StockLineItem[], withCost = false) => {
    if (lines.length === 0) return "Pick products from the catalog to begin";
    const cost = lines.reduce((t, l) => t + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
    return (
      <span className="tabular-nums">
        <strong className="text-slate-900">{lines.length}</strong> product{lines.length === 1 ? "" : "s"} ·{" "}
        <strong className="text-slate-900">{formatQty(sumUnits(lines))}</strong> units
        {withCost && cost > 0 ? (
          <>
            {" "}· cost <strong className="text-slate-900">Rs {formatMoney(cost)}</strong>
          </>
        ) : null}
      </span>
    );
  };

  if (isInitialLoading) {
    return (
      <PageLoader message="Loading stock..." />
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-5 p-4 text-black md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <Warehouse className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">Stock Management</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {branchFilter === ALL_BRANCHES
                  ? "All branches"
                  : branches.find((b) => b.id === branchFilter)?.name || "Selected branch"}
              </span>
              <span className="text-slate-300">•</span>
              <span>Levels, valuation, operations and movement history</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 bg-white shadow-sm"
            onClick={() => refreshAllData()}
            disabled={isLoading}
            title="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
          <Button variant="outline" className="h-9 bg-white shadow-sm" onClick={() => openOperation("transfer")}>
            <ArrowRightLeft className="mr-2 h-4 w-4 text-blue-600" />
            Transfer
          </Button>
          <Button variant="outline" className="h-9 bg-white shadow-sm" onClick={() => openOperation("adjust")}>
            <SlidersHorizontal className="mr-2 h-4 w-4 text-amber-600" />
            Adjust
          </Button>
          <Button variant="outline" className="h-9 bg-white shadow-sm" onClick={() => openOperation("remove")}>
            <ArrowUpFromLine className="mr-2 h-4 w-4 text-rose-600" />
            Remove
          </Button>
          <StockManagementToolbar
            className="flex flex-wrap items-center gap-2"
            onAddStock={() => openOperation("add")}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
            exportDisabled={allStocks.length === 0}
            exporting={exporting}
          />
        </div>
      </div>

      <StockOperationDialog
        open={isAddOpen}
        onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) {
            clearProductUI();
            setAddErrors({});
          }
        }}
        title="Add stock"
        description="Receive quantity for one or more products at a branch."
        icon={<ArrowDownToLine className="h-5 w-5" />}
        iconTone="bg-emerald-600 text-white"
        onSubmit={handleAddStock}
        submitting={isTransferring}
        submitLabel={addLines.length > 0 ? `Add ${formatQty(sumUnits(addLines))} units` : "Save"}
        footerHint={opHint(addLines, true)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>Branch</Label>
            {branchesLoading ? (
              <StockSelectSkeleton label="Loading branches" />
            ) : (
              <Select
                value={addForm.branchId}
                onValueChange={(v) => {
                  setAddForm({ ...addForm, branchId: v });
                  setAddErrors((e) => ({ ...e, branchId: "" }));
                  refreshLineStock(addLines, v, setAddLines);
                }}
              >
                <SelectTrigger className={`h-9 border text-sm text-black ${addErrors.branchId ? "border-red-400" : "border-gray-200"}`}>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="text-sm">
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {addErrors.branchId && <p className="text-xs text-red-500">{addErrors.branchId}</p>}
          </div>
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>Supplier (optional)</Label>
            {suppliersLoading ? (
              <StockSelectSkeleton label="Loading suppliers" />
            ) : (
              <Select value={addForm.supplierId} onValueChange={(v) => setAddForm({ ...addForm, supplierId: v })}>
                <SelectTrigger className="h-9 border border-gray-200 text-sm text-black">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {supplierOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-sm">
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>Invoice / GRN reference (optional)</Label>
            <Input
              placeholder="e.g. INV-1024"
              value={addForm.invoiceRef}
              onChange={(e) => setAddForm({ ...addForm, invoiceRef: e.target.value })}
              className="h-9 text-sm text-black"
            />
          </div>
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>Notes (optional)</Label>
            <Input
              placeholder="Delivery note, vehicle, etc."
              value={addForm.notes}
              onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
              className="h-9 text-sm text-black"
            />
          </div>
        </div>

        <StockProductPicker
          products={pickerProducts}
          categories={categories}
          layout="split"
          loading={globalLoading}
          lines={addLines}
          onLinesChange={(next) => {
            setAddLines(next);
            setAddErrors((e) => ({ ...e, lines: "" }));
            if (addForm.branchId) {
              refreshLineStock(next, addForm.branchId, setAddLines);
            }
          }}
          quantityLabel="Qty to add"
          previewMode="add"
          disabled={!addForm.branchId}
          disabledHint="Select a branch first to see stock and add products"
          showUnitCost
          showCurrentQty
          getCurrentQty={(id) => (addForm.branchId ? getStockQty(id, addForm.branchId) : null)}
          error={addErrors.lines}
        />
      </StockOperationDialog>

      <StockOperationDialog
        open={isAdjustOpen}
        onOpenChange={(open) => {
          setIsAdjustOpen(open);
          if (!open) {
            clearProductUI();
            setAdjustErrors({});
          }
        }}
        title="Adjust stock"
        description="Correct counted quantities — use + to add, − to reduce."
        icon={<SlidersHorizontal className="h-5 w-5" />}
        iconTone="bg-amber-500 text-white"
        onSubmit={handleAdjustStock}
        submitting={isTransferring}
        submitLabel={adjustLines.length > 0 ? `Save ${adjustLines.length} adjustment${adjustLines.length === 1 ? "" : "s"}` : "Save"}
        footerHint={opHint(adjustLines)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>Branch</Label>
            {branchesLoading ? (
              <StockSelectSkeleton label="Loading branches" />
            ) : (
              <Select
                value={adjustForm.branchId}
                onValueChange={(v) => {
                  setAdjustForm({ ...adjustForm, branchId: v });
                  setAdjustErrors((e) => ({ ...e, branchId: "" }));
                  refreshLineStock(adjustLines, v, setAdjustLines);
                }}
              >
                <SelectTrigger className={`h-9 border text-sm text-black ${adjustErrors.branchId ? "border-red-400" : "border-gray-200"}`}>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="text-sm">
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {adjustErrors.branchId && <p className="text-xs text-red-500">{adjustErrors.branchId}</p>}
          </div>
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>Reason</Label>
            <Select value={adjustForm.reason} onValueChange={(v) => setAdjustForm({ ...adjustForm, reason: v })}>
              <SelectTrigger className="h-9 border border-gray-200 text-sm text-black">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CORRECTION" className="text-sm">Correction</SelectItem>
                <SelectItem value="LOST" className="text-sm">Lost / Unaccounted</SelectItem>
                <SelectItem value="FOUND" className="text-sm">Found / Surprise Entry</SelectItem>
                <SelectItem value="PROMOTIONAL" className="text-sm">Promotional Redistribution</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label className={STOCK_DLG.label}>Notes (optional)</Label>
          <Textarea
            placeholder="Add any additional details..."
            value={adjustForm.notes}
            onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
            className="text-sm text-black min-h-[64px] resize-none border-gray-200"
          />
        </div>

        <StockProductPicker
          products={pickerProducts}
          categories={categories}
          layout="split"
          loading={globalLoading}
          lines={adjustLines}
          onLinesChange={(next) => {
            setAdjustLines(next);
            setAdjustErrors((e) => ({ ...e, lines: "" }));
            if (adjustForm.branchId) {
              refreshLineStock(next, adjustForm.branchId, setAdjustLines);
            }
          }}
          quantityLabel="Change (+ / −)"
          quantityPlaceholder="e.g. -5 or 10"
          allowSignedQuantity
          previewMode="signed"
          disabled={!adjustForm.branchId}
          disabledHint="Select a branch first to see current stock"
          showCurrentQty
          getCurrentQty={(id) => (adjustForm.branchId ? getStockQty(id, adjustForm.branchId) : null)}
          error={adjustErrors.lines}
        />
      </StockOperationDialog>

      <StockOperationDialog
        open={isRemoveOpen}
        onOpenChange={(open) => {
          setIsRemoveOpen(open);
          if (!open) {
            clearProductUI();
            setRemoveErrors({});
          }
        }}
        title="Remove stock"
        description="Take quantity out for damage, waste, loss or expiry."
        icon={<ArrowUpFromLine className="h-5 w-5" />}
        iconTone="bg-rose-600 text-white"
        onSubmit={handleRemoveStock}
        submitting={isTransferring}
        submitLabel={removeLines.length > 0 ? `Remove ${formatQty(sumUnits(removeLines))} units` : "Save"}
        footerHint={opHint(removeLines)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>Branch</Label>
            {branchesLoading ? (
              <StockSelectSkeleton label="Loading branches" />
            ) : (
              <Select
                value={removeForm.branchId}
                onValueChange={(v) => {
                  setRemoveForm({ ...removeForm, branchId: v });
                  setRemoveErrors((e) => ({ ...e, branchId: "" }));
                  refreshLineStock(removeLines, v, setRemoveLines);
                }}
              >
                <SelectTrigger className={`h-9 border text-sm text-black ${removeErrors.branchId ? "border-red-400" : "border-gray-200"}`}>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="text-sm">
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {removeErrors.branchId && <p className="text-xs text-red-500">{removeErrors.branchId}</p>}
          </div>
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>Reason</Label>
            <Select value={removeForm.reason} onValueChange={(v) => setRemoveForm({ ...removeForm, reason: v })}>
              <SelectTrigger className="h-9 border border-gray-200 text-sm text-black">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DAMAGE" className="text-sm">Damaged / Defected</SelectItem>
                <SelectItem value="WASTE" className="text-sm">Wastage / Garbage</SelectItem>
                <SelectItem value="THEFT" className="text-sm">Theft / Loss</SelectItem>
                <SelectItem value="EXPIRED" className="text-sm">Expired Goods</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label className={STOCK_DLG.label}>Notes (optional)</Label>
          <Textarea
            placeholder="Add reference, batch, vehicle, etc."
            value={removeForm.notes}
            onChange={(e) => setRemoveForm({ ...removeForm, notes: e.target.value })}
            className="text-sm text-black min-h-[64px] resize-none border-gray-200"
          />
        </div>

        <StockProductPicker
          products={pickerProducts}
          categories={categories}
          layout="split"
          loading={globalLoading}
          lines={removeLines}
          onLinesChange={(next) => {
            setRemoveLines(next);
            setRemoveErrors((e) => ({ ...e, lines: "" }));
            if (removeForm.branchId) {
              refreshLineStock(next, removeForm.branchId, setRemoveLines);
            }
          }}
          quantityLabel="Qty to remove"
          previewMode="remove"
          disabled={!removeForm.branchId}
          disabledHint="Select a branch first to see what is in stock"
          showCurrentQty
          getCurrentQty={(id) => (removeForm.branchId ? getStockQty(id, removeForm.branchId) : null)}
          error={removeErrors.lines}
        />
      </StockOperationDialog>

      <StockOperationDialog
        open={isTransferOpen}
        onOpenChange={(open) => {
          setIsTransferOpen(open);
          if (!open) {
            clearProductUI();
            setTransferErrors({});
          }
        }}
        title="Transfer stock"
        description="Move quantity for one or more products between branches."
        icon={<ArrowRightLeft className="h-5 w-5" />}
        iconTone="bg-blue-600 text-white"
        onSubmit={handleTransfer}
        submitting={isTransferring}
        submitLabel={transferLines.length > 0 ? `Transfer ${formatQty(sumUnits(transferLines))} units` : "Save"}
        footerHint={opHint(transferLines)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>From branch</Label>
            {branchesLoading ? (
              <StockSelectSkeleton label="Loading branches" />
            ) : (
              <Select
                value={transferForm.fromBranchId}
                onValueChange={(v) => {
                  setTransferForm({ ...transferForm, fromBranchId: v });
                  setTransferErrors((e) => ({ ...e, fromBranchId: "" }));
                  if (v) refreshLineStock(transferLines, v, setTransferLines);
                }}
              >
                <SelectTrigger className={`h-9 border text-sm text-black ${transferErrors.fromBranchId ? "border-red-400" : "border-gray-200"}`}>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id} disabled={b.id === transferForm.toBranchId} className="text-sm">
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {transferErrors.fromBranchId && <p className="text-xs text-red-500">{transferErrors.fromBranchId}</p>}
          </div>
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>To branch</Label>
            {branchesLoading ? (
              <StockSelectSkeleton label="Loading branches" />
            ) : (
              <Select
                value={transferForm.toBranchId}
                onValueChange={(v) => {
                  setTransferForm({ ...transferForm, toBranchId: v });
                  setTransferErrors((e) => ({ ...e, toBranchId: "" }));
                }}
              >
                <SelectTrigger className={`h-9 border text-sm text-black ${transferErrors.toBranchId ? "border-red-400" : "border-gray-200"}`}>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id} disabled={b.id === transferForm.fromBranchId} className="text-sm">
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {transferErrors.toBranchId && <p className="text-xs text-red-500">{transferErrors.toBranchId}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <Label className={STOCK_DLG.label}>Notes (optional)</Label>
          <Input
            placeholder="Carrier name or reference..."
            value={transferForm.notes}
            onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
            className="h-9 text-sm text-black"
          />
        </div>

        <StockProductPicker
          products={pickerProducts}
          categories={categories}
          layout="split"
          loading={globalLoading}
          lines={transferLines}
          onLinesChange={(next) => {
            setTransferLines(next);
            setTransferErrors((e) => ({ ...e, lines: "" }));
            if (transferForm.fromBranchId) {
              refreshLineStock(next, transferForm.fromBranchId, setTransferLines);
            }
          }}
          quantityLabel="Qty to transfer"
          previewMode="remove"
          disabled={!transferForm.fromBranchId}
          disabledHint="Choose the branch you are sending from first"
          showCurrentQty
          getCurrentQty={(id) =>
            transferForm.fromBranchId ? getStockQty(id, transferForm.fromBranchId) : null
          }
          error={transferErrors.lines}
        />
      </StockOperationDialog>


      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
        {[
          {
            label: "Products tracked",
            value: allStatusCount.toLocaleString(),
            hint: `${inStockCount.toLocaleString()} in stock`,
            icon: Package,
            tone: "bg-indigo-50 text-indigo-600",
            accent: "bg-indigo-500",
          },
          {
            label: "Units on hand",
            value: formatQty(stockMeta.totalQuantity || 0),
            hint: "Across the current filters",
            icon: Boxes,
            tone: "bg-sky-50 text-sky-600",
            accent: "bg-sky-500",
          },
          {
            label: "Stock value (cost)",
            value: `Rs ${formatMoney(stockMeta.totalInventoryValue || 0)}`,
            hint: "Quantity × purchase rate",
            icon: Wallet,
            tone: "bg-emerald-50 text-emerald-600",
            accent: "bg-emerald-500",
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className={cn("absolute inset-x-0 top-0 h-1", card.accent)} aria-hidden />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{card.label}</p>
                  {statsLoading ? (
                    <div className="mt-2 h-8 w-28 animate-pulse rounded bg-slate-100" />
                  ) : (
                    <p className="mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{card.value}</p>
                  )}
                  <p className="mt-1 truncate text-xs text-slate-500">{card.hint}</p>
                </div>
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", card.tone)}>
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
          {
            key: "low",
            label: "Low stock",
            value: stockMeta.lowStockCount || 0,
            hint: "At or below minimum",
            icon: AlertTriangle,
            on: "border-amber-200 bg-amber-50/60",
            iconOn: "bg-amber-100 text-amber-600",
            valueOn: "text-amber-700",
          },
          {
            key: "out",
            label: "Out of stock",
            value: stockMeta.outOfStockCount || 0,
            hint: "Zero on hand",
            icon: MinusCircle,
            on: "border-rose-200 bg-rose-50/60",
            iconOn: "bg-rose-100 text-rose-600",
            valueOn: "text-rose-700",
          },
          {
            key: "negative",
            label: "Negative stock",
            value: stockMeta.negativeStockCount || 0,
            hint: "Needs an adjustment",
            icon: TrendingDown,
            on: "border-rose-200 bg-rose-50/60",
            iconOn: "bg-rose-100 text-rose-600",
            valueOn: "text-rose-700",
          },
        ].map((tile) => {
          const Icon = tile.icon;
          const active = tile.value > 0;
          const selected = stockStatusFilter === tile.key;
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => {
                setStockStatusFilter(selected ? ALL_STOCK_STATUS : tile.key);
                setActiveTab("stock");
                setStockPage(1);
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
                {statsLoading ? (
                  <span className="mt-1 block h-6 w-10 animate-pulse rounded bg-slate-100" />
                ) : (
                  <span className={cn("block text-xl font-semibold tabular-nums", active ? tile.valueOn : "text-slate-400")}>
                    {tile.value.toLocaleString()}
                  </span>
                )}
                <span className="hidden truncate text-[11px] text-slate-500 sm:block">
                  {selected ? "Filtering · click to clear" : tile.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="overflow-hidden rounded-xl border border-indigo-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <Filter className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                Filters
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                    {activeFilterCount} active
                  </span>
                ) : null}
              </p>
              <p className="truncate text-xs text-slate-500">
                {statsLoading || (isLoading && !hasStockMeta)
                  ? "Loading totals…"
                  : `${totalStocks.toLocaleString()} rows · ${formatQty(stockMeta.totalQuantity || 0)} units · Rs ${formatMoney(stockMeta.totalInventoryValue || 0)}`}
              </p>
            </div>
          </div>
          {isLoading && hasStockMeta ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating…
            </span>
          ) : null}
          {activeFilterCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-8 border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800"
              onClick={clearAllStockFilters}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Clear filters
            </Button>
          ) : null}
        </div>
        <div className="space-y-4 border-t border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-indigo-50/30 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold text-indigo-900/80">Status</span>
            {STOCK_STATUS_OPTIONS.map((opt) => {
              const active = stockStatusFilter === opt.value;
              const count = !hasStockMeta
                ? null
                : opt.value === ALL_STOCK_STATUS
                  ? allStatusCount
                  : opt.value === "in"
                    ? inStockCount
                    : opt.value === "low"
                      ? stockMeta.lowStockCount || 0
                      : opt.value === "out"
                        ? stockMeta.outOfStockCount || 0
                        : opt.value === "negative"
                          ? stockMeta.negativeStockCount || 0
                          : null;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setStockStatusFilter(opt.value);
                    setStockPage(1);
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
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[10px] tabular-nums",
                        active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500",
                      )}
                    >
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
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={cn(filterControlCls, "pl-9")}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabelCls}>SKU</Label>
              <Input placeholder="e.g. 400674448" value={skuSearch} onChange={(e) => setSkuSearch(e.target.value)} className={cn(filterControlCls, "font-mono")} />
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabelCls}>Barcode / code</Label>
              <Input placeholder="Scan or type…" value={barcodeSearch} onChange={(e) => setBarcodeSearch(e.target.value)} className={cn(filterControlCls, "font-mono")} />
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabelCls}>Branch</Label>
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className={filterControlCls}>
                  <SelectValue placeholder="All branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_BRANCHES}>All branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabelCls}>Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className={filterControlCls}>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
                  {categories.map((c: { id: string; name: string }) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabelCls}>Brand</Label>
              <Select value={brandFilter} onValueChange={setBrandFilter}>
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
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className={filterControlCls}>
                  <SelectValue placeholder="All suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SUPPLIERS}>All suppliers</SelectItem>
                  {supplierOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="grid h-11 w-full max-w-lg shrink-0 grid-cols-3 rounded-xl border border-slate-200 bg-slate-100/80 p-1">
            <TabsTrigger value="stock" className="h-9 gap-1.5 rounded-lg text-xs font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:text-sm">
              <Package className="h-4 w-4" />
              Stock list
              <span className="hidden rounded-full bg-slate-200/80 px-1.5 text-[10px] tabular-nums text-slate-600 sm:inline">{totalStocks.toLocaleString()}</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="h-9 gap-1.5 rounded-lg text-xs font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:text-sm">
              <History className="h-4 w-4" />
              Movements
              <span className="hidden rounded-full bg-slate-200/80 px-1.5 text-[10px] tabular-nums text-slate-600 sm:inline">{filteredHistory.length.toLocaleString()}</span>
            </TabsTrigger>
            <TabsTrigger value="today" className="h-9 gap-1.5 rounded-lg text-xs font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:text-sm">
              <Clock className="h-4 w-4" />
              Today
              <span className="hidden rounded-full bg-slate-200/80 px-1.5 text-[10px] tabular-nums text-slate-600 sm:inline">{filteredTodayMovements.length.toLocaleString()}</span>
            </TabsTrigger>
          </TabsList>

          <div className="inline-flex self-start rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 h-8 text-xs font-medium transition-colors",
                viewMode === "table" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50",
              )}
            >
              <List className="h-3.5 w-3.5" />
              Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 h-8 text-xs font-medium transition-colors",
                viewMode === "grid" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Grid
            </button>
          </div>
        </div>

        <TabsContent value="stock" className="mt-0 outline-none">
          <Card className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-semibold tracking-tight text-slate-900">Inventory list</CardTitle>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {isLoading && allStocks.length === 0
                      ? "Loading records…"
                      : `${totalStocks.toLocaleString()} stock records`}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 relative min-h-[280px]">
              {isLoading && allStocks.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[280px] py-16 px-6">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  <p className="text-sm text-gray-500 mt-3">Loading stock...</p>
                </div>
              ) : allStocks.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[280px] py-16 px-6 text-center">
                  <Package className="h-8 w-8 text-gray-300 mb-3" />
                  <p className="text-sm font-medium text-gray-900">No stock found</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Adjust filters or add stock to see records here.
                  </p>
                </div>
              ) : (
                <>
                  {isLoading ? (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
                      <div className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                        <p className="text-xs text-gray-500">Updating...</p>
                      </div>
                    </div>
                  ) : null}

                  {viewMode === "table" ? (
                <>
                  <div className="hidden lg:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableHead className={cn(thCls, "pl-5")}>Product</TableHead>
                          <TableHead className={thCls}>Location</TableHead>
                          <TableHead className={cn(thCls, "text-right")}>On hand</TableHead>
                          <TableHead className={cn(thCls, "w-32")}>Level</TableHead>
                          <TableHead className={cn(thCls, "text-right")}>Cost / Sell</TableHead>
                          <TableHead className={cn(thCls, "text-right")}>Margin</TableHead>
                          <TableHead className={cn(thCls, "text-right")}>Value</TableHead>
                          <TableHead className={thCls}>Status</TableHead>
                          <TableHead className={cn(thCls, "pr-5 text-right")}>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allStocks.map((s) => {
                          const qty = Number(s.current_quantity || 0);
                          const reserved = Number(s.reserved_quantity || 0);
                          const available = qty - reserved;
                          const cost = Number(s.product?.purchase_rate || 0);
                          const sell = Number(s.product?.sales_rate_inc_dis_and_tax || 0);
                          const minQty = Number((s.product as { min_qty?: number }).min_qty ?? 10);
                          const status = getStockStatusDisplay(qty, minQty);
                          const imageUrl = getStockRowImage(s.product);
                          const categoryName =
                            s.product.category?.name ||
                            categories.find((c) => c.id === s.product.category_id)?.name ||
                            "Uncategorized";
                          const marginPct = sell > 0 ? ((sell - cost) / sell) * 100 : null;
                          const levelPct = minQty > 0 ? Math.max(0, Math.min(100, (Math.max(qty, 0) / (minQty * 2)) * 100)) : qty > 0 ? 100 : 0;
                          return (
                            <TableRow key={s.id} className="border-slate-100 hover:bg-slate-50/70">
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
                                    <button
                                      type="button"
                                      onClick={() => openStockView(s)}
                                      className="block max-w-[240px] truncate text-left text-sm font-semibold text-slate-900 hover:text-indigo-700"
                                    >
                                      {s.product.name}
                                    </button>
                                    <p className="truncate text-[11px] text-slate-500">
                                      <span className="font-mono">{s.product.sku || getProductBarcode(s.product) || "—"}</span>
                                      {" · "}
                                      {categoryName === "Unknown" ? "Uncategorized" : categoryName}
                                      {s.product.brand?.name ? ` · ${s.product.brand.name}` : ""}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="whitespace-nowrap px-2 py-3 text-sm text-slate-700">
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                                  {s.branch?.name || "—"}
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
                                    className={cn(
                                      "h-full rounded-full",
                                      qty <= 0 ? "bg-rose-500" : qty <= minQty ? "bg-amber-400" : "bg-emerald-500",
                                    )}
                                    style={{ width: `${qty <= 0 ? 3 : levelPct}%` }}
                                  />
                                </div>
                                <p className="mt-1 text-[10px] text-slate-400">min {formatQty(minQty)}</p>
                              </TableCell>
                              <TableCell className="whitespace-nowrap px-2 py-3 text-right text-sm tabular-nums">
                                <p className="text-slate-500">{formatMoney(cost)}</p>
                                <p className="font-semibold text-slate-900">{formatMoney(sell)}</p>
                              </TableCell>
                              <TableCell className="whitespace-nowrap px-2 py-3 text-right text-sm tabular-nums">
                                {marginPct == null ? (
                                  <span className="text-slate-300">—</span>
                                ) : (
                                  <span className={cn("font-semibold", marginPct < 0 ? "text-rose-600" : marginPct < 20 ? "text-amber-600" : "text-emerald-600")}>
                                    {marginPct.toFixed(0)}%
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap px-2 py-3 text-right text-sm tabular-nums">
                                <p className="font-semibold text-slate-900">{formatMoney(qty * cost)}</p>
                                <p className="text-[10px] text-emerald-700">retail {formatMoney(Math.max(qty, 0) * sell)}</p>
                              </TableCell>
                              <TableCell className="px-2 py-3">
                                <Badge variant="outline" className={cn("whitespace-nowrap text-[10px] font-semibold", status.className)}>
                                  {status.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-3 pl-2 pr-5 text-right">
                                <div className="inline-flex items-center gap-1">
                                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openStockView(s)}>
                                    <Eye className="mr-1 h-3.5 w-3.5" />
                                    View
                                  </Button>
                                  {renderRowActions(s)}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="lg:hidden divide-y divide-gray-100">
                    {allStocks.map((s) => {
                      const qty = Number(s.current_quantity || 0);
                      const reserved = Number(s.reserved_quantity || 0);
                      const available = qty - reserved;
                      const cost = Number(s.product?.purchase_rate || 0);
                      const sell = Number(s.product?.sales_rate_inc_dis_and_tax || 0);
                      const minQty = Number((s.product as { min_qty?: number }).min_qty ?? 10);
                      const imageUrl = getStockRowImage(s.product);
                      return (
                        <StockRecordCard
                          key={s.id}
                          productName={s.product.name}
                          sku={s.product.sku}
                          barcode={getProductBarcode(s.product)}
                          category={
                            s.product.category?.name ||
                            categories.find((c) => c.id === s.product.category_id)?.name
                          }
                          brand={s.product.brand?.name}
                          branch={s.branch?.name}
                          imageUrl={imageUrl}
                          cost={cost}
                          sell={sell}
                          quantity={qty}
                          reserved={reserved}
                          available={available}
                          value={qty * cost}
                          minQty={minQty}
                          onView={() => openStockView(s)}
                          className="rounded-none border-0 border-b shadow-none"
                        />
                      );
                    })}
                  </div>
                </>
              ) : (
                <InventoryCardGrid
                  empty={false}
                  loading={false}
                >
                  {allStocks.map((s) => {
                    const qty = Number(s.current_quantity || 0);
                    const reserved = Number(s.reserved_quantity || 0);
                    const available = qty - reserved;
                    const cost = Number(s.product?.purchase_rate || 0);
                    const sell = Number(s.product?.sales_rate_inc_dis_and_tax || 0);
                    const minQty = Number(
                      (s.product as { min_qty?: number }).min_qty ?? 10,
                    );
                    const imageUrl = getStockRowImage(s.product);
                    return (
                      <StockRecordCard
                        key={s.id}
                        productName={s.product.name}
                        sku={s.product.sku}
                        barcode={getProductBarcode(s.product)}
                        category={
                          s.product.category?.name ||
                          categories.find((c) => c.id === s.product.category_id)?.name
                        }
                        brand={s.product.brand?.name}
                        branch={s.branch?.name}
                        imageUrl={imageUrl}
                        cost={cost}
                        sell={sell}
                        quantity={qty}
                        reserved={reserved}
                        available={available}
                        value={qty * cost}
                        minQty={minQty}
                        onView={() => openStockView(s)}
                      />
                    );
                  })}
                </InventoryCardGrid>
                  )}
                </>
              )}

              {/* Pagination - First / Prev / Page X of Y / Next / Last with
                  an inline rows-per-page selector and a "Showing 1-20 of N"
                  caption. Same pattern as the other inventory tables. */}
              {totalStocks > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-3 border-t border-gray-200">
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-black">
                      Showing {(stockPage - 1) * stockPageSize + 1} to{" "}
                      {Math.min(stockPage * stockPageSize, totalStocks)} of {totalStocks}
                    </p>
                    <span className="text-gray-300">|</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-gray-600">Rows:</span>
                      <Select
                        value={String(stockPageSize)}
                        onValueChange={(v) => {
                          setStockPageSize(Number(v));
                          setStockPage(1);
                        }}
                      >
                        <SelectTrigger className="h-8 w-[72px] text-sm text-black">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {paginationOptions.map((size) => (
                            <SelectItem key={size} value={String(size)} className="text-sm">
                              {size}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-sm text-black"
                      onClick={() => setStockPage(1)}
                      disabled={stockPage === 1}
                    >
                      First
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-sm text-black"
                      onClick={() => setStockPage((p) => Math.max(1, p - 1))}
                      disabled={stockPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-black px-3">
                      Page {stockPage} of {totalStockPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-sm text-black"
                      onClick={() =>
                        setStockPage((p) => Math.min(totalStockPages, p + 1))
                      }
                      disabled={stockPage >= totalStockPages}
                    >
                      Next
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-sm text-black"
                      onClick={() => setStockPage(totalStockPages)}
                      disabled={stockPage >= totalStockPages}
                    >
                      Last
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Movement History Tab Content */}
        <TabsContent value="history" className="mt-0 outline-none">
          <Card className="border border-slate-200 shadow-sm rounded-xl overflow-hidden bg-white">
            <CardHeader className="px-4 py-3 border-b border-gray-100">
              <CardTitle className="text-sm font-semibold text-gray-900">Movement Log</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                {filteredHistory.length.toLocaleString()} movements
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {filteredHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                  <Package className="h-8 w-8 text-gray-300 mb-3" />
                  <p className="text-sm font-medium text-gray-900">No movement history</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Stock changes will appear here once recorded.
                  </p>
                </div>
              ) : viewMode === "table" ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                        <TableHead className="text-xs font-semibold text-gray-600 pl-3">Date</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">Product</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">Branch</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">Type</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right">Change</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right">Before</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right">After</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 pr-3">User</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHistory.map((m) => {
                        const change = Number(m.quantity_change);
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="py-2.5 pl-3 text-xs text-gray-600 whitespace-nowrap">
                              {new Date(m.created_at).toLocaleString([], {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm font-medium text-gray-900 max-w-[200px] truncate">
                              {m.product.name}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-gray-700 whitespace-nowrap">
                              {m.branch?.name || "—"}
                            </TableCell>
                            <TableCell className="py-2.5">{getMovementBadge(m.movement_type)}</TableCell>
                            <TableCell
                              className={cn(
                                "py-2.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap",
                                change > 0 ? "text-emerald-600" : "text-rose-600",
                              )}
                            >
                              {change > 0 ? "+" : ""}
                              {formatQty(change)}
                            </TableCell>
                            <TableCell className="py-2.5 text-right text-sm tabular-nums text-gray-700 whitespace-nowrap">
                              {formatQty(Number(m.previous_qty))}
                            </TableCell>
                            <TableCell className="py-2.5 text-right text-sm tabular-nums text-gray-900 whitespace-nowrap">
                              {formatQty(Number(m.new_qty))}
                            </TableCell>
                            <TableCell className="py-2.5 pr-3 text-xs text-gray-500">
                              {m.user?.email?.split("@")[0] || "System"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <InventoryCardGrid empty={false}>
                  {filteredHistory.map((m) => (
                    <MovementRecordCard
                      key={m.id}
                      date={new Date(m.created_at).toLocaleString([], {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                      productName={m.product.name}
                      branch={m.branch?.name}
                      movementType={getMovementBadge(m.movement_type)}
                      quantityChange={Number(m.quantity_change)}
                      previousQty={Number(m.previous_qty)}
                      newQty={Number(m.new_qty)}
                      user={m.user?.email?.split("@")[0] || "System"}
                    />
                  ))}
                </InventoryCardGrid>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Today's Movement Tab */}
        <TabsContent value="today" className="mt-0 outline-none">
          <Card className="border border-slate-200 shadow-sm rounded-xl overflow-hidden bg-white">
            <CardHeader className="px-4 py-3 border-b border-gray-100">
              <CardTitle className="text-sm font-semibold text-gray-900">Today</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                {filteredTodayMovements.length.toLocaleString()} events today
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {filteredTodayMovements.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                  <Package className="h-8 w-8 text-gray-300 mb-3" />
                  <p className="text-sm font-medium text-gray-900">No events today</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Today&apos;s stock movements will show up here.
                  </p>
                </div>
              ) : viewMode === "table" ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                        <TableHead className="text-xs font-semibold text-gray-600 pl-3">Time</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">Product</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">Branch</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">Type</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right">Change</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right">After</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 pr-3">Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTodayMovements.map((m) => {
                        const change = Number(m.quantity_change);
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="py-2.5 pl-3 text-xs text-gray-600 whitespace-nowrap">
                              {new Date(m.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm font-medium text-gray-900 max-w-[200px] truncate">
                              {m.product.name}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-gray-700 whitespace-nowrap">
                              {m.branch?.name || "—"}
                            </TableCell>
                            <TableCell className="py-2.5">{getMovementBadge(m.movement_type)}</TableCell>
                            <TableCell
                              className={cn(
                                "py-2.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap",
                                change > 0 ? "text-emerald-600" : "text-rose-600",
                              )}
                            >
                              {change > 0 ? "+" : ""}
                              {formatQty(change)}
                            </TableCell>
                            <TableCell className="py-2.5 text-right text-sm tabular-nums text-gray-900 whitespace-nowrap">
                              {formatQty(Number(m.new_qty))}
                            </TableCell>
                            <TableCell className="py-2.5 pr-3 text-xs text-gray-500 max-w-[180px] truncate">
                              {m.notes || "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <InventoryCardGrid empty={false}>
                  {filteredTodayMovements.map((m) => (
                    <MovementRecordCard
                      key={m.id}
                      date={new Date(m.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      productName={m.product.name}
                      branch={m.branch?.name}
                      movementType={getMovementBadge(m.movement_type)}
                      quantityChange={Number(m.quantity_change)}
                      newQty={Number(m.new_qty)}
                      notes={m.notes || undefined}
                    />
                  ))}
                </InventoryCardGrid>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DetailSheet
        open={viewOpen}
        onOpenChange={(open) => {
          if (!open) closeStockView();
        }}
        size="xl"
      >
        <DetailSheetHeader
          title="Stock details"
          subtitle={
            viewRow
              ? `${viewRow.product?.name ?? "Product"} | ${viewRow.branch?.name ?? "Branch"}`
              : "Product and branch stock information"
          }
        />
        <DetailSheetBody>

          {viewLoading ? (
            <div className="flex flex-col items-center justify-center py-16 px-5 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
              <p className="text-sm text-gray-600">Loading details...</p>
            </div>
          ) : viewError ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-gray-600">{viewError}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 text-sm text-black"
                onClick={() => viewRow && openStockView(viewRow)}
              >
                Try again
              </Button>
            </div>
          ) : viewRow ? (
            <div className={DLG.body}>
              <dl>
                <DetailRow label="Product" value={viewRow.product?.name} />
                <DetailRow
                  label="SKU"
                  value={
                    (viewProduct?.sku as string) ||
                    viewRow.product?.sku ||
                    "-"
                  }
                />
                <DetailRow
                  label="Barcode"
                  value={(viewProduct?.code as string) || viewRow.product?.barcode || "-"}
                />
                <DetailRow label="Branch" value={viewRow.branch?.name} />
                <DetailRow
                  label="Category"
                  value={
                    (viewProduct?.category as { name?: string })?.name ||
                    categories.find((c) => c.id === viewRow.product?.category_id)?.name ||
                    "-"
                  }
                />
                <DetailRow
                  label="Subcategory"
                  value={(viewProduct?.subcategory as { name?: string })?.name || "-"}
                />
                <DetailRow
                  label="Unit"
                  value={(viewProduct?.unit as { name?: string })?.name || "-"}
                />
                <DetailRow
                  label="Quantity on hand"
                  value={formatQty(Number(viewRow.current_quantity || 0))}
                />
                <DetailRow
                  label="Minimum stock"
                  value={formatQty(Number(viewProduct?.min_qty ?? 0))}
                />
                <DetailRow
                  label="Maximum stock"
                  value={formatQty(Number(viewProduct?.max_qty ?? 0))}
                />
                <DetailRow
                  label="Purchase rate"
                  value={formatMoney(viewProduct?.purchase_rate)}
                />
                <DetailRow
                  label="Sales rate"
                  value={formatMoney(
                    viewProduct?.sales_rate_inc_dis_and_tax ??
                      viewProduct?.sales_rate_exc_dis_and_tax,
                  )}
                />
                <DetailRow
                  label="Status"
                  value={
                    getStockStatusMeta(
                      Number(viewRow.current_quantity || 0),
                      Number(viewProduct?.min_qty ?? 10),
                    ).label
                  }
                />
                <DetailRow
                  label="Last updated"
                  value={new Date(viewRow.last_updated).toLocaleString()}
                />
                <DetailRow
                  label="Active"
                  value={viewProduct?.is_active === false ? "No" : "Yes"}
                />
              </dl>

              {viewMovements.length > 0 && (
                <div className="pt-2 border-t border-gray-200">
                  <p className="text-sm text-gray-600 mb-2">Recent movements at this branch</p>
                  <ul className="space-y-2 max-h-40 overflow-y-auto">
                    {viewMovements.map((m) => (
                      <li
                        key={m.id}
                        className="text-sm text-black flex justify-between gap-2 border-b border-gray-50 pb-2 last:border-0"
                      >
                        <span className="text-gray-600 shrink-0">
                          {new Date(m.created_at).toLocaleString()}
                        </span>
                        <span>
                          {m.movement_type.replace(/_/g, " ")}{" "}
                          {m.quantity_change > 0 ? "+" : ""}
                          {formatQty(Number(m.quantity_change))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={closeStockView}>
            Close
          </Button>
        </DetailSheetFooter>
      </DetailSheet>

      <style>{`
        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number] {
          -moz-appearance: textfield;
        }
      `}</style>
    </div>
  );
}
