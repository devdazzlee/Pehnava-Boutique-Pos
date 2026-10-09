"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import {
  Search,
  CalendarIcon,
  Loader2,
  PackagePlus,
  FileSpreadsheet,
  Receipt,
  Plus,
  List,
  LayoutGrid,
  X,
  Eye,
  Pencil,
  Download,
  DollarSign,
  Boxes,
  ShoppingCart,
  FileText,
  ChevronDown,
  RotateCcw,
  Undo2,
  Layers,
  Rows3,
  Trash2,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { PageLoader } from "@/components/ui/page-loader";
import { ExcelUploadDialog, type ExcelField } from "@/components/inventory/excel-upload-dialog";
import { STOCK_IN_SOURCES } from "@/components/inventory/stock-ops/constants";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import { useInventoryDashboard } from "@/components/inventory/stock-ops/use-inventory-dashboard";
import { StockOpsActions } from "@/components/inventory/stock-ops/stock-ops-actions";
import {
  downloadExcel,
  downloadBrandedPdf,
  formatMoney,
  formatQty,
  yieldForUi,
} from "@/components/inventory/stock-ops/export-utils";
import { downloadStockInReceiptPdf } from "@/lib/stock-in-receipt-pdf";
import { StockSelectSkeleton } from "@/components/inventory/stock-ops/stock-operation-dialog";
import { useLogoDataUri } from "@/hooks/use-logo-data-uri";
import { useScrollToTopOnPageChange } from "@/hooks/use-scroll-to-top-on-page-change";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { z } from "zod";
import { usePosData } from "@/hooks/use-pos-data";
import {
  StockProductPicker,
  type StockLineItem,
} from "@/components/inventory/stock-ops/stock-product-picker";
import { InventoryCardGrid } from "@/components/inventory/stock-ops/inventory-card-grid";
import { TransactionRecordCard } from "@/components/inventory/stock-ops/transaction-record-card";
import { PurchaseReturnsPanel } from "@/components/inventory/purchase-returns-panel";
import { StockInBillsTab } from "@/components/inventory/stock-in-bills-tab";
import {
  StockInDeleteConfirmDialog,
  type StockInDeleteConfirmState,
} from "@/components/inventory/stock-in-delete-confirm-dialog";
import {
  buildPurchaseNotes,
  parsePurchaseNotes,
} from "@/components/inventory/purchases-notes";
import {
  billInvoiceLabel,
  formatBillProductSummary,
} from "@/components/inventory/stock-in-bill-utils";

const purchaseSchema = z.object({
  supplierId: z.string().min(1, "Choose a supplier"),
  warehouseBranchId: z.string().min(1, "Pick a warehouse or branch"),
  lines: z.array(z.any()).min(1, "Add at least one product line before saving"),
});

type PurchaseFieldErrors = Partial<
  Record<"supplierId" | "warehouseBranchId" | "lines", string>
>;

interface Product {
  id: string;
  name: string;
  sku?: string | null;
}

interface Supplier {
  id: string;
  name: string;
  code?: string | null;
}

interface Branch {
  id: string;
  name: string;
  branch_type?: string | null;
}

interface DraftLine {
  productId: string;
  productName: string;
  sku?: string;
  quantity: number;
  costPrice: number;
}

/** One supplier bill bucket — lines share the same bill_group_id when saved. */
interface StockInBillDraft {
  id: string;
  invoiceRef: string;
  lines: DraftLine[];
}

function createEmptyStockInBill(): StockInBillDraft {
  return {
    id: `bill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    invoiceRef: "",
    lines: [],
  };
}

interface PurchaseRow {
  id: string;
  purchase_date: string;
  invoice_ref?: string | null;
  bill_group_id?: string | null;
  quantity: string | number;
  cost_price: string | number;
  value?: number;
  line_count?: number;
  delivery_status?: string | null;
  notes?: string | null;
  purchase_invoice_id?: string | null;
  product?: Product | null;
  supplier?: { id: string; name: string } | null;
  warehouse_branch?: { id: string; name: string } | null;
  user?: { email?: string | null } | null;
  lines?: Array<{
    id: string;
    product?: Product | null;
    quantity: number;
    cost_price: number;
    value: number;
  }>;
}

interface PurchaseMonthStats {
  totalPurchases: number;
  totalQuantity: number;
  totalValue: number;
}

function isUnknownName(name?: string | null) {
  return (name || "").trim().toLowerCase() === "unknown";
}

type EditLineForm = {
  id: string;
  productName: string;
  quantity: string;
  costPrice: string;
  salePrice: string;
};

type EditPurchaseForm = {
  invoiceRef: string;
  purchaseDate: string;
  deliveryStatus: "PARTIAL" | "COMPLETE";
  batchNo: string;
  expiryDate: string;
  source: string;
  payment: string;
  userNotes: string;
  lines: EditLineForm[];
};

export function Purchases({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  void onNavigate;
  const { stats: dashboardStats, loading: dashboardLoading } = useInventoryDashboard();
  const {
    products,
    categories,
    suppliers,
    branches,
    productsLoading,
    suppliersLoading,
    branchesLoading,
    fetchProducts,
    fetchSuppliers,
    fetchBranches,
    fetchCategories,
    refreshProducts,
  } = usePosData();
  const logoDataUri = useLogoDataUri();

  const metaLoading = productsLoading || suppliersLoading || branchesLoading;

  const visibleSuppliers = useMemo(
    () => suppliers.filter((s) => !isUnknownName(s.name)),
    [suppliers],
  );

  const visibleCategories = useMemo(
    () => categories.filter((c) => !isUnknownName(c.name)),
    [categories],
  );

  // Shared POS store — cache-aware. Reuses products/suppliers/branches across
  // Stock In / Out / Management instead of re-hitting APIs on every tab open.
  useEffect(() => {
    void Promise.all([
      fetchProducts(),
      fetchSuppliers(),
      fetchBranches(),
      fetchCategories(),
    ]);
  }, [fetchProducts, fetchSuppliers, fetchBranches, fetchCategories]);

  const [tab, setTab] = useState<"history" | "bills" | "new" | "returns">("history");
  const [historyGroupMode, setHistoryGroupMode] = useState<"bill" | "line">("bill");

  // ------- history -------
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const PAGE_SIZE = pageSize;
  useScrollToTopOnPageChange(page);

  const [searchQuery, setSearchQuery] = useState("");
  // Search runs on the server now (it used to filter only the current page).
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filteredTotals, setFilteredTotals] = useState({ quantity: 0, value: 0 });
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [filterStart, setFilterStart] = useState<Date | undefined>(undefined);
  const [filterEnd, setFilterEnd] = useState<Date | undefined>(undefined);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [exporting, setExporting] = useState(false);

  const [monthStats, setMonthStats] = useState<PurchaseMonthStats>({
    totalPurchases: 0,
    totalQuantity: 0,
    totalValue: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // ------- detail modal -------
  const [detailOpen, setDetailOpen] = useState(false);
  const [purchaseDetail, setPurchaseDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingDetail, setEditingDetail] = useState(false);
  const [editForm, setEditForm] = useState<EditPurchaseForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [receiptDownloading, setReceiptDownloading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<StockInDeleteConfirmState | null>(
    null,
  );

  const buildEditFormFromDetail = useCallback((detail: any): EditPurchaseForm => {
    const billLines: any[] = Array.isArray(detail?.bill_lines)
      ? detail.bill_lines
      : detail
        ? [detail]
        : [];
    const parsed = parsePurchaseNotes(detail?.notes);
    const dateSrc = detail?.purchase_date ? new Date(detail.purchase_date) : new Date();
    const yyyy = dateSrc.getFullYear();
    const mm = String(dateSrc.getMonth() + 1).padStart(2, "0");
    const dd = String(dateSrc.getDate()).padStart(2, "0");
    return {
      invoiceRef: detail?.invoice_ref || "",
      purchaseDate: `${yyyy}-${mm}-${dd}`,
      deliveryStatus:
        (detail?.delivery_status || "COMPLETE").toUpperCase() === "PARTIAL"
          ? "PARTIAL"
          : "COMPLETE",
      batchNo: parsed.batchNo,
      expiryDate: parsed.expiryDate,
      source: parsed.source,
      payment: parsed.payment,
      userNotes: parsed.userNotes,
      lines: billLines.map((line) => ({
        id: line.id,
        productName: line.product?.name || "Product",
        quantity: String(Number(line.quantity) || 0),
        costPrice: String(Number(line.cost_price) || 0),
        salePrice: String(Number(line.sale_price) || Number(line.cost_price) || 0),
      })),
    };
  }, []);

  const handleViewPurchase = useCallback(async (id: string, startEditing = false) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setPurchaseDetail(null);
    setEditingDetail(false);
    setEditForm(null);
    try {
      const res = await apiClient.get(`${API_BASE}/purchases/${id}`);
      const detail = res.data?.data || null;
      setPurchaseDetail(detail);
      if (startEditing && detail) {
        setEditForm(buildEditFormFromDetail(detail));
        setEditingDetail(true);
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to load purchase details");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }, [buildEditFormFromDetail]);

  const startEditingPurchase = useCallback(() => {
    if (!purchaseDetail) return;
    setEditForm(buildEditFormFromDetail(purchaseDetail));
    setEditingDetail(true);
  }, [purchaseDetail, buildEditFormFromDetail]);

  const cancelEditingPurchase = useCallback(() => {
    setEditingDetail(false);
    setEditForm(null);
  }, []);

  const fetchHistory = useCallback(
    async (pg = page) => {
      setHistoryLoading(true);
      try {
        const params: any = { page: pg, limit: PAGE_SIZE, groupBy: historyGroupMode };
        if (filterSupplier !== "all") params.supplierId = filterSupplier;
        if (filterBranch !== "all") params.branchId = filterBranch;
        if (debouncedSearch) params.search = debouncedSearch;
        if (filterStart) params.startDate = filterStart.toISOString();
        if (filterEnd) {
          const e = new Date(filterEnd);
          e.setHours(23, 59, 59, 999);
          params.endDate = e.toISOString();
        }
        const res = await apiClient.get(`${API_BASE}/purchases`, { params });
        setRows(res.data?.data || []);
        setTotal(res.data?.meta?.total ?? 0);
        setTotalPages(res.data?.meta?.totalPages ?? 1);
        setFilteredTotals({
          quantity: Number(res.data?.meta?.totalQuantity ?? 0),
          value: Number(res.data?.meta?.totalValue ?? 0),
        });
      } catch (e: any) {
        toast.error(e?.response?.data?.message || "Failed to load purchases");
      } finally {
        setHistoryLoading(false);
      }
    },
    [filterSupplier, filterBranch, filterStart, filterEnd, page, debouncedSearch, PAGE_SIZE, historyGroupMode],
  );

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await apiClient.get(`${API_BASE}/purchases/stats`);
      const data = res.data?.data || {};
      setMonthStats({
        totalPurchases: Number(data.totalPurchases) || 0,
        totalQuantity: Number(data.totalQuantity) || 0,
        totalValue: Number(data.totalValue) || 0,
      });
    } catch {
      setMonthStats({ totalPurchases: 0, totalQuantity: 0, totalValue: 0 });
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const saveEditedPurchase = useCallback(async () => {
    if (!editForm || editForm.lines.length === 0) return;

    for (const line of editForm.lines) {
      const qty = Number(line.quantity);
      const cost = Number(line.costPrice);
      const sale = Number(line.salePrice);
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error(`Enter a valid quantity for ${line.productName}`);
        return;
      }
      if (!Number.isFinite(cost) || cost < 0) {
        toast.error(`Enter a valid cost for ${line.productName}`);
        return;
      }
      if (!Number.isFinite(sale) || sale < 0) {
        toast.error(`Enter a valid sale price for ${line.productName}`);
        return;
      }
    }

    setEditSaving(true);
    try {
      const notes = buildPurchaseNotes({
        batchNo: editForm.batchNo,
        expiryDate: editForm.expiryDate,
        source: editForm.source,
        payment: editForm.payment,
        userNotes: editForm.userNotes,
      });
      const purchaseDateIso = editForm.purchaseDate
        ? new Date(`${editForm.purchaseDate}T12:00:00`).toISOString()
        : undefined;

      await Promise.all(
        editForm.lines.map((line) =>
          apiClient.patch(`${API_BASE}/purchases/${line.id}`, {
            quantity: Number(line.quantity),
            costPrice: Number(line.costPrice),
            salePrice: Number(line.salePrice),
            purchaseDate: purchaseDateIso,
            invoiceRef: editForm.invoiceRef.trim() || null,
            notes,
            deliveryStatus: editForm.deliveryStatus,
          }),
        ),
      );

      toast.success("Updated · stock, supplier ledger & cash records synced");
      setEditingDetail(false);
      setEditForm(null);
      const primaryId = editForm.lines[0]?.id || purchaseDetail?.id;
      if (primaryId) {
        const res = await apiClient.get(`${API_BASE}/purchases/${primaryId}`);
        setPurchaseDetail(res.data?.data || null);
      }
      fetchHistory();
      fetchStats();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to update purchase");
    } finally {
      setEditSaving(false);
    }
  }, [editForm, purchaseDetail?.id, fetchHistory, fetchStats]);

  const requestDeletePurchaseLine = useCallback((purchaseId: string, label: string) => {
    setDeleteConfirm({
      kind: "line",
      id: purchaseId,
      title: "Remove this stock-in line?",
      description: (
        <>
          <p>
            <span className="font-medium text-slate-800">{label}</span> will be removed from
            stock-in.
          </p>
          <p>
            Branch stock, supplier ledger, and any auto payment linked to this bill will be
            updated.
          </p>
        </>
      ),
    });
  }, []);

  const requestDeleteBillFromHistory = useCallback(
    (anchorId: string, invoiceLabel: string) => {
      setDeleteConfirm({
        kind: "bill",
        anchorId,
        title: "Delete entire supplier bill?",
        description: (
          <>
            <p>
              Bill <span className="font-mono font-medium text-slate-800">{invoiceLabel}</span>{" "}
              and all its lines will be removed.
            </p>
            <p>Received stock and linked stock-in payments will be reversed. This cannot be undone.</p>
          </>
        ),
      });
    },
    [],
  );

  const confirmStockInDelete = useCallback(
    async (target: StockInDeleteConfirmState) => {
      try {
        if (target.kind === "line") {
          await apiClient.delete(`${API_BASE}/purchases/${target.id}`);
          toast.success("Line removed · stock & supplier ledger synced");
          if (detailOpen && purchaseDetail?.id === target.id) {
            setDetailOpen(false);
            setPurchaseDetail(null);
            setEditingDetail(false);
            setEditForm(null);
          }
        } else {
          await apiClient.delete(`${API_BASE}/purchases/bills/${target.anchorId}`);
          toast.success("Bill deleted · stock & supplier ledger synced");
          setDetailOpen(false);
          setPurchaseDetail(null);
          setEditingDetail(false);
          setEditForm(null);
        }
        await fetchHistory();
        await fetchStats();
      } catch (e: any) {
        toast.error(
          e?.response?.data?.message ||
            (target.kind === "line"
              ? "Could not remove this line (check returns, supplier invoice, or stock on hand)"
              : "Could not delete this bill"),
        );
        throw e;
      }
    },
    [detailOpen, purchaseDetail?.id, fetchHistory, fetchStats],
  );

  const downloadPurchaseReceipt = useCallback(async () => {
    if (!purchaseDetail) return;
    setReceiptDownloading(true);
    await yieldForUi();
    try {
      const parsed = parsePurchaseNotes(purchaseDetail.notes);
      const billLines: any[] = Array.isArray(purchaseDetail.bill_lines)
        ? purchaseDetail.bill_lines
        : [purchaseDetail];
      const billQty =
        Number(purchaseDetail.bill_quantity) ||
        billLines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
      const billValue =
        Number(purchaseDetail.bill_value) ||
        billLines.reduce(
          (s, l) => s + (Number(l.quantity) || 0) * (Number(l.cost_price) || 0),
          0,
        );
      const ts = new Date(purchaseDetail.purchase_date);
      const dateLabel = `${ts.toLocaleDateString(undefined, { dateStyle: "medium" })} · ${ts.toLocaleTimeString(undefined, { timeStyle: "short" })}`;
      const supplierName =
        purchaseDetail.supplier?.name && !isUnknownName(purchaseDetail.supplier.name)
          ? purchaseDetail.supplier.name
          : "—";
      const ref =
        (purchaseDetail.invoice_ref || "").trim() ||
        `SI-${String(purchaseDetail.id || "").slice(0, 8).toUpperCase()}`;
      const status = (purchaseDetail.delivery_status || "COMPLETE").toUpperCase();

      await downloadStockInReceiptPdf({
        reference: ref,
        status,
        supplier: supplierName,
        branch: purchaseDetail.warehouse_branch?.name || "—",
        dateLabel,
        recordedBy: purchaseDetail.user?.email || "—",
        source: parsed.source || undefined,
        payment: parsed.payment || undefined,
        batchNo: parsed.batchNo || undefined,
        expiryDate: parsed.expiryDate || undefined,
        notes: parsed.userNotes || undefined,
        billQty,
        billTotal: billValue,
        logoDataUri,
        lines: billLines.map((line: any) => {
          const qty = Number(line.quantity) || 0;
          const cost = Number(line.cost_price) || 0;
          return {
            name: line.product?.name || "—",
            sku: line.product?.sku || undefined,
            qty,
            cost,
            total: qty * cost,
          };
        }),
      });
      toast.success("Receipt downloaded");
    } catch {
      toast.error("Failed to download receipt");
    } finally {
      setReceiptDownloading(false);
    }
  }, [purchaseDetail, logoDataUri]);

  // Rows are already filtered (incl. search) by the server.
  const filteredRows = rows;

  const activeHistoryFilterCount =
    (searchQuery.trim() ? 1 : 0) +
    (filterSupplier !== "all" ? 1 : 0) +
    (filterBranch !== "all" ? 1 : 0) +
    (filterStart || filterEnd ? 1 : 0);

  type DatePreset = "all" | "today" | "7d" | "month";
  const applyDatePreset = (preset: DatePreset) => {
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (preset === "all") {
      setFilterStart(undefined);
      setFilterEnd(undefined);
    } else if (preset === "today") {
      setFilterStart(startOfDay(now));
      setFilterEnd(startOfDay(now));
    } else if (preset === "7d") {
      const from = startOfDay(now);
      from.setDate(from.getDate() - 6);
      setFilterStart(from);
      setFilterEnd(startOfDay(now));
    } else {
      setFilterStart(new Date(now.getFullYear(), now.getMonth(), 1));
      setFilterEnd(startOfDay(now));
    }
    setPage(1);
  };
  const activeDatePreset: DatePreset | null = (() => {
    if (!filterStart && !filterEnd) return "all";
    if (!filterStart || !filterEnd) return null;
    const now = new Date();
    const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    if (!sameDay(filterEnd, now)) return null;
    if (sameDay(filterStart, now)) return "today";
    const seven = new Date(now);
    seven.setDate(seven.getDate() - 6);
    if (sameDay(filterStart, seven)) return "7d";
    if (sameDay(filterStart, new Date(now.getFullYear(), now.getMonth(), 1))) return "month";
    return null;
  })();

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    filterSupplier !== "all" ||
    filterBranch !== "all" ||
    !!filterStart ||
    !!filterEnd;

  const clearFilters = () => {
    setSearchQuery("");
    setFilterSupplier("all");
    setFilterBranch("all");
    setFilterStart(undefined);
    setFilterEnd(undefined);
    setPage(1);
  };

  const exportHeaders = [
    "Date",
    "Product",
    "Supplier",
    "Branch",
    "Qty",
    "Cost",
    "Value",
    "Invoice",
    "Status",
  ];

  const buildExportRows = () =>
    filteredRows.map((r) => {
      const qty = Number(r.quantity) || 0;
      const cost = Number(r.cost_price) || 0;
      return [
        r.purchase_date ? new Date(r.purchase_date).toLocaleString() : "",
        r.product?.name || "",
        r.supplier?.name || "",
        r.warehouse_branch?.name || "",
        qty,
        cost,
        qty * cost,
        r.invoice_ref || "",
        r.delivery_status || "COMPLETE",
      ];
    });

  const exportExcel = async () => {
    if (filteredRows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      downloadExcel(
        `purchases-${Date.now()}.xlsx`,
        "Purchases",
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
    if (filteredRows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      const pdfRows = filteredRows.map((r) => {
        const qty = Number(r.quantity) || 0;
        const cost = Number(r.cost_price) || 0;
        return [
          r.purchase_date
            ? new Date(r.purchase_date).toLocaleDateString()
            : "",
          r.product?.name || "",
          r.supplier?.name || "",
          r.warehouse_branch?.name || "",
          formatQty(qty),
          formatMoney(cost),
          formatMoney(qty * cost),
        ];
      });

      await downloadBrandedPdf({
        filename: `purchases-${Date.now()}.pdf`,
        title: "Stock In — Purchases",
        subtitle: "Supplier delivery history",
        logoDataUri,
        summary: [
          { label: "Records", value: filteredRows.length.toLocaleString() },
          {
            label: "This month",
            value: monthStats.totalPurchases.toLocaleString(),
          },
          { label: "Month value", value: formatMoney(monthStats.totalValue) },
        ],
        columns: [
          { header: "Date", width: 1.1 },
          { header: "Product", width: 2.2 },
          { header: "Supplier", width: 1.4 },
          { header: "Branch", width: 1.2 },
          { header: "Qty", align: "right", width: 0.8 },
          { header: "Cost", align: "right", width: 1 },
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

  // ------- Excel import -------
  const [excelDialogOpen, setExcelDialogOpen] = useState(false);

  const downloadStockInTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      [
        "Product Name",
        "Unit",
        "Category",
        "Purchase Rate",
        "Sales Rate",
        "Min Stock",
        "Stock",
      ],
      ["Sample Product A", "PCS", "Grocery", 80, 100, 10, 50],
      ["Sample Product B", "Kg", "Grocery", 250, 320, 5, 20],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock In");
    XLSX.writeFile(wb, "stock-in-template.xlsx");
  };

  const STOCK_IN_FIELDS: ExcelField[] = [
    {
      name: "Product Name",
      required: true,
      description: 'Same as Add Product. Column can also be "Name".',
    },
    {
      name: "Unit",
      description: 'Same as Select unit — unit name (e.g. PCS). Auto-created if new.',
    },
    {
      name: "Category",
      description: "Same as Select category — category name. Auto-created if new.",
    },
    {
      name: "Purchase Rate",
      required: true,
      description: "Same as Add Product (required). Aliases: Buy Price (Rs), purchase_rate.",
    },
    {
      name: "Sales Rate",
      required: true,
      description:
        'Same as Add Product (required). Aliases: Sell Price (Rs), selling_price, sales_rate_inc_dis_and_tax, or column "Sales Rate".',
    },
    {
      name: "Min Stock",
      description:
        "Same as Add Product. Defaults to 10 on Stock In Excel import if omitted; 0 if empty in this bulk dialog.",
    },
    {
      name: "Stock",
      description:
        "Same as Add Product — opening quantity. Aliases: Initial Stock Qty, Opening Stock, Quantity, stock.",
    },
  ];

  // ------- new entry form -------
  const [supplierId, setSupplierId] = useState<string>("");
  const [warehouseBranchId, setWarehouseBranchId] = useState<string>("");
  const [purchaseDate, setPurchaseDate] = useState<Date>(new Date());
  const [referenceNumber, setReferenceNumber] = useState<string>("");
  const [stockInSource, setStockInSource] = useState<string>("SUPPLIER_DELIVERY");
  const [batchNo, setBatchNo] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState<string>("");
  const initialStockInBills = useMemo(() => {
    const first = createEmptyStockInBill();
    return { bills: [first], activeId: first.id };
  }, []);
  const [billDrafts, setBillDrafts] = useState<StockInBillDraft[]>(
    initialStockInBills.bills,
  );
  const [activeBillId, setActiveBillId] = useState<string>(
    initialStockInBills.activeId,
  );
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<PurchaseFieldErrors>({});
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [pulseDetails, setPulseDetails] = useState(false);
  /** Cash = pay full now · Credit = pay later · Mix = partial now */
  const [paymentMode, setPaymentMode] = useState<"CASH" | "CREDIT" | "MIX">(
    "CASH",
  );
  const [paidNowInput, setPaidNowInput] = useState("");
  const [settleMethod, setSettleMethod] = useState<
    "CASH" | "BANK_TRANSFER" | "CHEQUE" | "CARD" | "OTHER"
  >("CASH");
  const [settleReference, setSettleReference] = useState("");

  const clearError = (key: keyof PurchaseFieldErrors) =>
    setFormErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  useEffect(() => {
    if (!warehouseBranchId && branches.length > 0) {
      const warehouse =
        branches.find((b) => (b.branch_type || "").toUpperCase() === "WAREHOUSE") ||
        branches[0];
      if (warehouse) setWarehouseBranchId(warehouse.id);
    }
  }, [branches, warehouseBranchId]);

  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!warehouseBranchId) {
      setStockMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get(`${API_BASE}/stock`, {
          params: { branchId: warehouseBranchId, limit: 5000 },
        });
        if (cancelled) return;
        const map: Record<string, number> = {};
        (res.data?.data || []).forEach((s: any) => {
          const pid = s.product_id || s.product?.id;
          if (pid) map[pid] = Number(s.current_quantity || 0);
        });
        setStockMap(map);
      } catch {
        if (!cancelled) setStockMap({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [warehouseBranchId]);

  const activeBill = useMemo(
    () => billDrafts.find((b) => b.id === activeBillId) ?? billDrafts[0],
    [billDrafts, activeBillId],
  );
  const lines = activeBill?.lines ?? [];

  const billsWithLines = useMemo(
    () => billDrafts.filter((b) => b.lines.length > 0),
    [billDrafts],
  );

  const allDraftLines = useMemo(
    () => billDrafts.flatMap((b) => b.lines),
    [billDrafts],
  );

  const pickerLines: StockLineItem[] = useMemo(
    () =>
      lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        sku: l.sku,
        quantity: l.quantity,
        unitCost: l.costPrice,
        currentQty: stockMap[l.productId] ?? 0,
      })),
    [lines, stockMap],
  );

  const onPickerLinesChange = (next: StockLineItem[]) => {
    const targetBillId = activeBill?.id ?? activeBillId;
    setBillDrafts((prev) =>
      prev.map((bill) => {
        if (bill.id !== targetBillId) return bill;
        return {
          ...bill,
          lines: next.map((l) => ({
            productId: l.productId,
            productName: l.productName,
            sku: l.sku,
            quantity: Number(l.quantity) || 0,
            costPrice: Number(l.unitCost) || 0,
          })),
        };
      }),
    );
    clearError("lines");
  };

  const setActiveBillInvoiceRef = (invoiceRef: string) => {
    const targetBillId = activeBill?.id ?? activeBillId;
    setBillDrafts((prev) =>
      prev.map((bill) =>
        bill.id === targetBillId ? { ...bill, invoiceRef } : bill,
      ),
    );
  };

  const addStockInBill = () => {
    const next = createEmptyStockInBill();
    setBillDrafts((prev) => [...prev, next]);
    setActiveBillId(next.id);
  };

  const removeActiveStockInBill = () => {
    if (billDrafts.length <= 1) return;
    const targetId = activeBill?.id ?? activeBillId;
    setBillDrafts((prev) => {
      const next = prev.filter((b) => b.id !== targetId);
      if (next.length === 0) {
        const fresh = createEmptyStockInBill();
        setActiveBillId(fresh.id);
        return [fresh];
      }
      if (!next.some((b) => b.id === activeBillId)) {
        setActiveBillId(next[0].id);
      }
      return next;
    });
  };

  const totals = useMemo(() => {
    const lineCount = allDraftLines.length;
    const units = allDraftLines.reduce((s, l) => s + l.quantity, 0);
    const value = allDraftLines.reduce((s, l) => s + l.quantity * l.costPrice, 0);
    return { lineCount, units, value };
  }, [allDraftLines]);

  const paidNowAmount = useMemo(() => {
    if (paymentMode === "CASH") return totals.value;
    if (paymentMode === "CREDIT") return 0;
    const n = Number(paidNowInput);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [paymentMode, paidNowInput, totals.value]);

  const creditRemaining = Math.max(0, totals.value - paidNowAmount);

  const detailsReady = Boolean(supplierId && warehouseBranchId);
  const paymentValid =
    paymentMode !== "MIX" ||
    (paidNowAmount > 0 && paidNowAmount < totals.value);
  const multiBillMixBlocked =
    paymentMode === "MIX" && billsWithLines.length > 1;

  const canSave =
    detailsReady &&
    billsWithLines.length > 0 &&
    !saving &&
    paymentValid &&
    !multiBillMixBlocked;

  const resetDraft = () => {
    const fresh = createEmptyStockInBill();
    setBillDrafts([fresh]);
    setActiveBillId(fresh.id);
    setNotes("");
    setReferenceNumber("");
    setBatchNo("");
    setExpiryDate(undefined);
    setStockInSource("SUPPLIER_DELIVERY");
    setPurchaseDate(new Date());
    setFormErrors({});
    setShowMoreDetails(false);
    setPaymentMode("CASH");
    setPaidNowInput("");
    setSettleMethod("CASH");
    setSettleReference("");
  };

  const handleSave = async () => {
    if (saving) return;

    if (multiBillMixBlocked) {
      toast.error(
        "For multiple supplier bills in one save, use Paid or Credit (not Part paid).",
      );
      return;
    }

    const parsed = purchaseSchema.safeParse({
      supplierId,
      warehouseBranchId,
      lines: allDraftLines,
    });
    if (!parsed.success) {
      const next: PurchaseFieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof PurchaseFieldErrors;
        if (key && !next[key]) next[key] = issue.message;
      }
      setFormErrors(next);
      return;
    }
    setFormErrors({});

    if (paymentMode === "MIX") {
      if (paidNowAmount <= 0) {
        toast.error("Enter how much you paid now for a mix payment");
        return;
      }
      if (paidNowAmount >= totals.value) {
        toast.error("For full payment, choose Cash instead of Mix");
        return;
      }
    }

    setSaving(true);
    try {
      const sourceLabel =
        STOCK_IN_SOURCES.find((s) => s.value === stockInSource)?.label ||
        stockInSource;
      const composedNotes = [
        `Source: ${sourceLabel}`,
        referenceNumber ? `Ref: ${referenceNumber}` : "",
        batchNo ? `Batch: ${batchNo}` : "",
        expiryDate ? `Expiry: ${format(expiryDate, "PPP")}` : "",
        notes || "",
      ]
        .filter(Boolean)
        .join(" | ");

      let savedBills = 0;
      for (const bill of billsWithLines) {
        const billTotal = bill.lines.reduce(
          (s, l) => s + l.quantity * l.costPrice,
          0,
        );
        const res = await apiClient.post(`${API_BASE}/purchases/bulk`, {
          supplierId,
          warehouseBranchId,
          purchaseDate: purchaseDate.toISOString(),
          invoiceRef: bill.invoiceRef.trim() || undefined,
          notes: composedNotes || undefined,
          batchNo: batchNo || undefined,
          expiryDate: expiryDate ? expiryDate.toISOString() : undefined,
          paymentMode,
          paidAmount:
            paymentMode === "MIX" ? paidNowAmount : undefined,
          paymentMethod:
            paymentMode === "CREDIT" ? undefined : settleMethod,
          paymentReference:
            paymentMode === "CREDIT"
              ? undefined
              : settleReference.trim() || undefined,
          lines: bill.lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            costPrice: l.costPrice,
          })),
        });
        savedBills += 1;
        if (billsWithLines.length === 1) {
          const result = res.data?.data || {};
          const paid = Number(result.paidAmount) || paidNowAmount;
          const remaining =
            Number(result.creditRemaining) ?? creditRemaining;
          if (paymentMode === "CASH") {
            toast.success(`Saved & paid in full (${formatMoney(paid)})`);
          } else if (paymentMode === "CREDIT") {
            toast.success(
              `Saved on credit (${formatMoney(billTotal)} balance due)`,
            );
          } else {
            toast.success(
              `Saved · paid ${formatMoney(paid)} · remaining ${formatMoney(remaining)}`,
            );
          }
        }
      }

      if (savedBills > 1) {
        toast.success(
          `Saved ${savedBills} supplier bills · ${formatQty(totals.units)} units · Rs ${formatMoney(totals.value)} total`,
        );
      }

      const fresh = createEmptyStockInBill();
      setBillDrafts([fresh]);
      setActiveBillId(fresh.id);
      setNotes("");
      setReferenceNumber("");
      setStockInSource("SUPPLIER_DELIVERY");
      setBatchNo("");
      setExpiryDate(undefined);
      setPaymentMode("CASH");
      setPaidNowInput("");
      setSettleMethod("CASH");
      setSettleReference("");
      setTab("history");
      setPage(1);
      fetchHistory(1);
      fetchStats();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to save purchase");
    } finally {
      setSaving(false);
    }
  };

  if (metaLoading && products.length === 0 && suppliers.length === 0 && branches.length === 0) {
    return <PageLoader message="Loading stock in..." />;
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-none space-y-5 p-4 text-black md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <PackagePlus className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">Stock In</h1>
            <p className="truncate text-sm text-slate-500">Record supplier deliveries and purchase receipts (GRN)</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" className="h-9 bg-white shadow-sm" onClick={() => setExcelDialogOpen(true)}>
            <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />
            Import products
          </Button>
          <StockOpsActions
            onExportExcel={exportExcel}
            onExportPdf={exportPdf}
            disabled={historyLoading || filteredRows.length === 0}
            exporting={exporting}
          />
          {tab === "history" ? (
            <Button className="h-9 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700" onClick={() => setTab("new")}>
              <Plus className="mr-2 h-4 w-4" />
              New receipt
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "history" | "bills" | "new" | "returns")}
        className="space-y-5"
      >
        <TabsList className="grid h-11 w-full max-w-2xl grid-cols-4 rounded-xl border border-slate-200 bg-slate-100/80 p-1">
          <TabsTrigger
            value="history"
            className="h-9 gap-1.5 rounded-lg text-sm font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
          >
            <Receipt className="h-4 w-4" />
            History
            <span className="rounded-full bg-slate-200/80 px-1.5 text-[10px] tabular-nums text-slate-600">
              {total.toLocaleString()}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="bills"
            className="h-9 gap-1.5 rounded-lg text-sm font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
          >
            <Layers className="h-4 w-4" />
            Manage bills
          </TabsTrigger>
          <TabsTrigger
            value="new"
            className="h-9 gap-1.5 rounded-lg text-sm font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
          >
            <Plus className="h-4 w-4" />
            New receipt
            {allDraftLines.length > 0 ? (
              <span className="rounded-full bg-emerald-600 px-1.5 text-[10px] font-semibold tabular-nums text-white">
                {allDraftLines.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger
            value="returns"
            className="h-9 gap-1.5 rounded-lg text-sm font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
          >
            <Undo2 className="h-4 w-4" />
            Returns
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-0 space-y-5 focus-visible:outline-none">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
            {[
              {
                label: "Receipts this month",
                value: monthStats.totalPurchases.toLocaleString(),
                hint: "Purchase lines recorded",
                icon: ShoppingCart,
                tone: "bg-emerald-50 text-emerald-600",
                accent: "bg-emerald-500",
              },
              {
                label: "Units in this month",
                value: formatQty(monthStats.totalQuantity),
                hint: "Received into stock",
                icon: Boxes,
                tone: "bg-sky-50 text-sky-600",
                accent: "bg-sky-500",
              },
              {
                label: "Spend this month",
                value: `Rs ${formatMoney(monthStats.totalValue)}`,
                hint: `Stock value now Rs ${formatMoney(dashboardStats.totalInventoryValue)}`,
                icon: DollarSign,
                tone: "bg-indigo-50 text-indigo-600",
                accent: "bg-indigo-500",
              },
              {
                label: activeHistoryFilterCount ? "Matching filters" : "All receipts",
                value: total.toLocaleString(),
                hint: `${formatQty(filteredTotals.quantity)} units · Rs ${formatMoney(filteredTotals.value)}`,
                icon: FileText,
                tone: "bg-amber-50 text-amber-600",
                accent: "bg-amber-500",
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <span className={cn("absolute inset-x-0 top-0 h-1", card.accent)} aria-hidden />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-500">{card.label}</p>
                      {statsLoading || dashboardLoading ? (
                        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-slate-100" />
                      ) : (
                        <p className="mt-2 truncate text-xl font-semibold tracking-tight tabular-nums text-slate-900 sm:text-2xl">{card.value}</p>
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

          {/* Filters */}
          <div className="overflow-hidden rounded-xl border border-indigo-100 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                  <Search className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    Filters
                    {activeHistoryFilterCount > 0 ? (
                      <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                        {activeHistoryFilterCount} active
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {total.toLocaleString()} receipts · {formatQty(filteredTotals.quantity)} units · Rs {formatMoney(filteredTotals.value)}
                  </p>
                </div>
              </div>
              {historyLoading && rows.length > 0 ? (
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
                <span className="mr-1 text-xs font-semibold text-indigo-900/80">Period</span>
                {(
                  [
                    { id: "all", label: "All time" },
                    { id: "today", label: "Today" },
                    { id: "7d", label: "Last 7 days" },
                    { id: "month", label: "This month" },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyDatePreset(p.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      activeDatePreset === p.id
                        ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                        : "border-indigo-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
                {activeDatePreset === null ? (
                  <span className="rounded-full border border-indigo-600 bg-indigo-600 px-3 py-1 text-xs font-medium text-white">Custom</span>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-x-3 gap-y-4 border-t border-dashed border-indigo-200 pt-4 md:grid-cols-2 xl:grid-cols-5">
                <div className="space-y-1.5 md:col-span-2 xl:col-span-1">
                  <Label className="text-xs font-semibold text-indigo-900/80">Search</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Product, SKU, invoice, supplier…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-10 border-indigo-200/80 bg-white pl-9 text-sm shadow-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-indigo-900/80">Supplier</Label>
                  <Select
                    value={filterSupplier}
                    onValueChange={(v) => {
                      setFilterSupplier(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="h-10 border-indigo-200/80 bg-white text-sm shadow-sm">
                      <SelectValue placeholder="All suppliers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All suppliers</SelectItem>
                      {visibleSuppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-indigo-900/80">Branch</Label>
                  <Select
                    value={filterBranch}
                    onValueChange={(v) => {
                      setFilterBranch(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="h-10 border-indigo-200/80 bg-white text-sm shadow-sm">
                      <SelectValue placeholder="All branches" />
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
                </div>
                {(
                  [
                    { label: "From", value: filterStart, set: setFilterStart },
                    { label: "To", value: filterEnd, set: setFilterEnd },
                  ] as const
                ).map((f) => (
                  <div key={f.label} className="space-y-1.5">
                    <Label className="text-xs font-semibold text-indigo-900/80">{f.label}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-10 w-full justify-start border-indigo-200/80 bg-white text-left text-sm font-normal shadow-sm"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 text-slate-500" />
                          {f.value ? format(f.value, "dd MMM yyyy") : <span className="text-slate-400">Any date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={f.value}
                          onSelect={(d) => {
                            f.set(d);
                            setPage(1);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Card className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Receipt className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold tracking-tight text-slate-900">Purchase history</h2>
                  <p className="truncate text-xs text-slate-500">
                    {historyGroupMode === "bill"
                      ? "One row per supplier bill · Edit/Del syncs stock, supplier ledger & payments"
                      : "One row per product line · Edit/Del syncs stock, supplier ledger & payments"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
                  {(
                    [
                      { id: "bill" as const, label: "Bill wise", icon: Layers },
                      { id: "line" as const, label: "Line wise", icon: Rows3 },
                    ] as const
                  ).map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setHistoryGroupMode(opt.id);
                          setPage(1);
                        }}
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                          historyGroupMode === opt.id
                            ? "bg-emerald-600 text-white"
                            : "text-slate-600 hover:bg-slate-50",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {opt.label}
                      </button>
                    );
                  })}
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
            </div>
            <CardContent className="relative min-h-[240px] p-0">
              {historyLoading && rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  <p className="text-sm text-gray-500 mt-3">Loading purchases...</p>
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                  <Receipt className="h-8 w-8 text-gray-300 mb-3" />
                  <p className="text-sm font-medium text-gray-900">No purchases found</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {hasActiveFilters
                      ? "Try clearing filters or adjusting your search."
                      : "Record a supplier delivery to see it here."}
                  </p>
                  {hasActiveFilters ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4 h-8 border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800"
                      onClick={clearFilters}
                    >
                      <X className="mr-1 h-3.5 w-3.5" /> Clear filters
                    </Button>
                  ) : (
                    <Button size="sm" className="mt-4 h-8 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setTab("new")}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> New receipt
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {historyLoading ? (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
                      <div className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                        <p className="text-xs text-gray-500">Updating...</p>
                      </div>
                    </div>
                  ) : null}

                  {viewMode === "table" ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50 hover:bg-slate-50 [&>th]:h-10 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-slate-500">
                            <TableHead className="pl-5 pr-2">
                              Date
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 px-2">
                              {historyGroupMode === "bill" ? "Bill / items" : "Product"}
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 px-2">
                              Supplier
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 px-2">
                              Branch
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 text-right px-2">
                              Qty
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 text-right px-2">
                              {historyGroupMode === "bill" ? "Avg cost" : "Cost"}
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 text-right px-2">
                              Value
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 px-2">
                              Status
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 text-right pl-2 pr-3">
                              Action
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredRows.map((r) => {
                            const qty = Number(r.quantity) || 0;
                            const cost = Number(r.cost_price) || 0;
                            const value =
                              r.value != null ? Number(r.value) || 0 : qty * cost;
                            const ts = new Date(r.purchase_date);
                            const lineCount = Number(r.line_count) || r.lines?.length || 1;
                            const billSummary =
                              historyGroupMode === "bill"
                                ? formatBillProductSummary(r.lines, lineCount)
                                : null;
                            return (
                              <TableRow
                                key={r.bill_group_id || r.id}
                                className="cursor-pointer border-slate-100 hover:bg-slate-50/70"
                                onClick={() => handleViewPurchase(r.id)}
                              >
                                <TableCell className="whitespace-nowrap py-3 pl-5 pr-2 text-sm text-slate-700">
                                  <div>{ts.toLocaleDateString()}</div>
                                  <div className="text-[11px] text-gray-400">
                                    {ts.toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </div>
                                </TableCell>
                                <TableCell className="py-2.5 px-2 min-w-[200px] max-w-[320px]">
                                  {historyGroupMode === "bill" ? (
                                    <>
                                      <p className="text-sm leading-snug">
                                        <span className="font-medium text-slate-500">
                                          Invoice:{" "}
                                        </span>
                                        <span className="font-semibold font-mono text-slate-900">
                                          {billInvoiceLabel(r.invoice_ref)}
                                        </span>
                                      </p>
                                      <p className="mt-0.5 text-[11px] font-medium tabular-nums text-slate-600">
                                        {lineCount} line{lineCount === 1 ? "" : "s"} ·{" "}
                                        {formatQty(qty)} units
                                      </p>
                                      {billSummary ? (
                                        <p
                                          className="mt-0.5 text-[11px] leading-snug text-slate-500 line-clamp-2"
                                          title={billSummary}
                                        >
                                          {billSummary}
                                        </p>
                                      ) : lineCount === 1 ? (
                                        <p className="mt-0.5 text-[11px] font-medium text-slate-700 line-clamp-2">
                                          {r.product?.name || r.lines?.[0]?.product?.name || "—"}
                                          {r.product?.sku || r.lines?.[0]?.product?.sku ? (
                                            <span className="ml-1 font-mono font-normal text-slate-500">
                                              · {r.product?.sku || r.lines?.[0]?.product?.sku}
                                            </span>
                                          ) : null}
                                        </p>
                                      ) : null}
                                    </>
                                  ) : (
                                    <>
                                      <p className="text-sm font-medium text-gray-900 line-clamp-2">
                                        {r.product?.name || "—"}
                                      </p>
                                      {r.product?.sku ? (
                                        <p className="mt-0.5 text-[11px] text-slate-600">
                                          <span className="font-medium text-slate-500">
                                            Barcode:{" "}
                                          </span>
                                          <span className="font-mono font-semibold">
                                            {r.product.sku}
                                          </span>
                                        </p>
                                      ) : null}
                                      {r.invoice_ref ? (
                                        <p className="mt-0.5 text-[11px] text-slate-600">
                                          <span className="font-medium text-slate-500">
                                            Invoice:{" "}
                                          </span>
                                          <span className="font-mono font-semibold">
                                            {r.invoice_ref}
                                          </span>
                                        </p>
                                      ) : null}
                                    </>
                                  )}
                                </TableCell>
                                <TableCell className="py-2.5 px-2 text-sm text-gray-700">
                                  {r.supplier?.name || "—"}
                                </TableCell>
                                <TableCell className="py-2.5 px-2 text-sm text-gray-700">
                                  {r.warehouse_branch?.name || "—"}
                                </TableCell>
                                <TableCell className="py-2.5 px-2 text-sm text-right tabular-nums text-gray-900">
                                  {formatQty(qty)}
                                </TableCell>
                                <TableCell className="py-2.5 px-2 text-sm text-right tabular-nums text-gray-700">
                                  {cost > 0 ? formatMoney(cost) : "—"}
                                </TableCell>
                                <TableCell className="py-2.5 px-2 text-sm text-right tabular-nums font-medium text-gray-900">
                                  {formatMoney(value)}
                                </TableCell>
                                <TableCell className="py-2.5 px-2">
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                                      (r.delivery_status || "COMPLETE").toUpperCase() === "COMPLETE"
                                        ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                                        : "bg-amber-50 text-amber-700 ring-amber-600/20",
                                    )}
                                  >
                                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                                    {(r.delivery_status || "COMPLETE").charAt(0) + (r.delivery_status || "COMPLETE").slice(1).toLowerCase()}
                                  </span>
                                </TableCell>
                                <TableCell className="py-2.5 pl-2 pr-3 text-right">
                                  <div className="flex items-center justify-end gap-0.5">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2 text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleViewPurchase(r.id);
                                      }}
                                    >
                                      <Eye className="h-3.5 w-3.5 mr-1" />
                                      View
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2 text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleViewPurchase(r.id, true);
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5 mr-1" />
                                      Edit
                                    </Button>
                                    {historyGroupMode === "line" ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                                        disabled={Boolean(r.purchase_invoice_id)}
                                        title={
                                          r.purchase_invoice_id
                                            ? "On a supplier invoice — unlink in Suppliers first"
                                            : "Remove line (syncs stock & ledger)"
                                        }
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          requestDeletePurchaseLine(
                                            r.id,
                                            r.product?.name || "this line",
                                          );
                                        }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                                        Del
                                      </Button>
                                    ) : (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                                        title="Delete whole bill (syncs stock & ledger)"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          requestDeleteBillFromHistory(
                                            r.id,
                                            billInvoiceLabel(r.invoice_ref),
                                          );
                                        }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                                        Del
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
                  ) : (
                    <InventoryCardGrid empty={false} loading={false}>
                      {filteredRows.map((r) => {
                        const ts = new Date(r.purchase_date);
                        const qty = Number(r.quantity) || 0;
                        const cost = Number(r.cost_price) || 0;
                        const value =
                          r.value != null ? Number(r.value) || 0 : qty * cost;
                        const lineCount =
                          Number(r.line_count) || r.lines?.length || 1;
                        const status = (r.delivery_status || "COMPLETE").toUpperCase();
                        const gridTitle =
                          historyGroupMode === "bill" && lineCount > 1
                            ? billInvoiceLabel(r.invoice_ref)
                            : r.product?.name || "Purchase line";
                        const gridSubtitle =
                          historyGroupMode === "bill" && lineCount > 1
                            ? `${lineCount} lines · ${formatQty(qty)} units`
                            : r.invoice_ref
                              ? `Invoice: ${r.invoice_ref}`
                              : r.product?.sku
                                ? `Barcode: ${r.product.sku}`
                                : undefined;
                        return (
                          <TransactionRecordCard
                            key={r.bill_group_id || r.id}
                            date={`${ts.toLocaleDateString(undefined, {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })} · ${ts.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`}
                            title={gridTitle}
                            subtitle={gridSubtitle}
                            amount={formatMoney(value)}
                            amountLabel="Value"
                            meta={
                              <div className="space-y-1">
                                <p>
                                  <span className="text-gray-400">Supplier · </span>
                                  <span className="font-medium text-gray-800">
                                    {r.supplier?.name || "—"}
                                  </span>
                                </p>
                                <p>
                                  <span className="text-gray-400">Branch · </span>
                                  <span className="font-medium text-gray-800">
                                    {r.warehouse_branch?.name || "—"}
                                  </span>
                                </p>
                              </div>
                            }
                            badge={
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                  status === "COMPLETE"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-amber-50 text-amber-700 border border-amber-200",
                                )}
                              >
                                {status}
                              </span>
                            }
                            highlights={[
                              { label: "Qty", value: formatQty(qty) },
                              { label: "Cost", value: formatMoney(cost) },
                              {
                                label: "Value",
                                value: formatMoney(value),
                                tone: "success",
                              },
                            ]}
                            actions={
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => handleViewPurchase(r.id)}
                                >
                                  <Eye className="h-3.5 w-3.5 mr-1" />
                                  View
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => handleViewPurchase(r.id, true)}
                                >
                                  <Pencil className="h-3.5 w-3.5 mr-1" />
                                  Edit
                                </Button>
                                {historyGroupMode === "line" ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs text-red-600 hover:bg-red-50"
                                    disabled={Boolean(r.purchase_invoice_id)}
                                    onClick={() =>
                                      requestDeletePurchaseLine(
                                        r.id,
                                        r.product?.name || "this line",
                                      )
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                                    Delete
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs text-red-600 hover:bg-red-50"
                                    onClick={() =>
                                      requestDeleteBillFromHistory(
                                        r.id,
                                        billInvoiceLabel(r.invoice_ref),
                                      )
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                                    Delete bill
                                  </Button>
                                )}
                              </div>
                            }
                          />
                        );
                      })}
                    </InventoryCardGrid>
                  )}
                </>
              )}
            </CardContent>

            {total > 0 ? (
              <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-sm text-slate-600 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="tabular-nums">
                    Showing{" "}
                    <span className="font-medium text-slate-900">
                      {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, total).toLocaleString()}
                    </span>{" "}
                    of <span className="font-medium text-slate-900">{total.toLocaleString()}</span>
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">Rows</span>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => {
                        setPageSize(Number(v));
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="h-8 w-[72px] bg-white text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[20, 50, 100].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-8 bg-white px-2.5" onClick={() => setPage(1)} disabled={page === 1 || historyLoading}>
                    First
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 bg-white px-2.5" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1 || historyLoading}>
                    Prev
                  </Button>
                  <span className="px-2 text-xs tabular-nums">
                    Page {page} of {Math.max(1, totalPages)}
                  </span>
                  <Button variant="outline" size="sm" className="h-8 bg-white px-2.5" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages || historyLoading}>
                    Next
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 bg-white px-2.5" onClick={() => setPage(totalPages)} disabled={page >= totalPages || historyLoading}>
                    Last
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </TabsContent>

        <TabsContent value="new" className="mt-0 space-y-3 focus-visible:outline-none">
          {/* Guided receipt: step strip + compact delivery fields */}
          <div
            className={cn(
              "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow",
              pulseDetails && "ring-2 ring-amber-400 ring-offset-2",
            )}
          >
            <div className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50/60 via-white to-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">New supplier receipt</h2>
                  {detailsReady && allDraftLines.length > 0 ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      {billsWithLines.length} bill{billsWithLines.length === 1 ? "" : "s"} ·{" "}
                      {allDraftLines.length} item{allDraftLines.length === 1 ? "" : "s"} · Rs{" "}
                      {formatMoney(totals.value)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {!detailsReady
                    ? "Choose supplier and branch, then add products"
                    : allDraftLines.length === 0
                      ? "Pick a bill below, then add products — they stay grouped by bill"
                      : "Set payment and save when ready"}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 text-xs text-slate-600"
                onClick={resetDraft}
                disabled={saving}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Reset
              </Button>
            </div>

            <div className="space-y-3 p-3 sm:p-4">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">
                    Supplier <span className="text-red-500">*</span>
                  </Label>
                  {metaLoading ? (
                    <StockSelectSkeleton label="Loading suppliers" className="h-9" />
                  ) : (
                    <Select
                      value={supplierId}
                      onValueChange={(v) => {
                        setSupplierId(v);
                        clearError("supplierId");
                        setPulseDetails(false);
                      }}
                    >
                      <SelectTrigger
                        className={cn(
                          "h-9 text-sm text-black",
                          formErrors.supplierId && "border-red-500",
                          pulseDetails && !supplierId && "border-amber-500 ring-2 ring-amber-200",
                        )}
                      >
                        <SelectValue placeholder="Choose supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {visibleSuppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id} className="text-sm">
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {formErrors.supplierId ? (
                    <p className="text-[11px] text-red-600">{formErrors.supplierId}</p>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">
                    Receive into branch <span className="text-red-500">*</span>
                  </Label>
                  {metaLoading ? (
                    <StockSelectSkeleton label="Loading branches" className="h-9" />
                  ) : (
                    <Select
                      value={warehouseBranchId}
                      onValueChange={(v) => {
                        setWarehouseBranchId(v);
                        clearError("warehouseBranchId");
                        setPulseDetails(false);
                      }}
                    >
                      <SelectTrigger
                        className={cn(
                          "h-9 text-sm text-black",
                          formErrors.warehouseBranchId && "border-red-500",
                          pulseDetails && !warehouseBranchId && "border-amber-500 ring-2 ring-amber-200",
                        )}
                      >
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
                  {formErrors.warehouseBranchId ? (
                    <p className="text-[11px] text-red-600">
                      {formErrors.warehouseBranchId}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">
                    Received on <span className="text-red-500">*</span>
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-9 w-full justify-start text-left text-sm font-normal text-black"
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5 text-gray-500" />
                        {format(purchaseDate, "dd MMM yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={purchaseDate}
                        onSelect={(d) => d && setPurchaseDate(d)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Source</Label>
                  <Select value={stockInSource} onValueChange={setStockInSource}>
                    <SelectTrigger className="h-9 text-sm text-black">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STOCK_IN_SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value} className="text-sm">
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

              </div>

              <button
                type="button"
                onClick={() => setShowMoreDetails((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800"
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    showMoreDetails && "rotate-180",
                  )}
                />
                {showMoreDetails ? "Hide" : "PO, batch, expiry & notes"}
              </button>

              {showMoreDetails ? (
                <div className="grid grid-cols-1 gap-2.5 border-t border-dashed border-slate-200 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">PO / Ref</Label>
                    <Input
                      placeholder="Delivery note"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      className="h-9 text-sm text-black"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Batch / lot</Label>
                    <Input
                      placeholder="Lot #"
                      value={batchNo}
                      onChange={(e) => setBatchNo(e.target.value)}
                      className="h-9 text-sm text-black"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Expiry</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-9 w-full justify-start text-left text-sm font-normal text-black"
                        >
                          <CalendarIcon className="mr-2 h-3.5 w-3.5 text-gray-500" />
                          {expiryDate ? (
                            format(expiryDate, "dd MMM yyyy")
                          ) : (
                            <span className="text-gray-400">None</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={expiryDate}
                          onSelect={setExpiryDate}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                    <Label className="text-xs text-slate-600">Notes</Label>
                    <Input
                      placeholder="Optional notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="h-9 text-sm text-black"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900">
                  Which supplier bill are you filling?
                </p>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  Products you add from the list go into the selected bill. All lines on one
                  bill share one bill ID in history (Bill wise view).
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 border-emerald-300 bg-white text-xs"
                onClick={addStockInBill}
                disabled={!detailsReady || saving}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                New bill
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {billDrafts.map((bill, index) => {
                const selected = bill.id === (activeBill?.id ?? activeBillId);
                const count = bill.lines.length;
                const label =
                  bill.invoiceRef.trim() ||
                  (billDrafts.length > 1 ? `Bill ${index + 1}` : "This bill");
                return (
                  <button
                    key={bill.id}
                    type="button"
                    disabled={!detailsReady}
                    onClick={() => setActiveBillId(bill.id)}
                    className={cn(
                      "inline-flex max-w-full flex-col rounded-lg border px-3 py-2 text-left transition-colors",
                      selected
                        ? "border-emerald-600 bg-white shadow-sm ring-1 ring-emerald-600/30"
                        : "border-slate-200 bg-white/80 hover:border-emerald-300",
                      !detailsReady && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span className="truncate text-xs font-semibold text-slate-900">
                      {label}
                    </span>
                    <span className="text-[10px] tabular-nums text-slate-500">
                      {count} line{count === 1 ? "" : "s"}
                      {selected ? " · adding here" : ""}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-1">
                <Label className="text-xs text-slate-600">
                  Supplier invoice # (this bill)
                </Label>
                <Input
                  placeholder="e.g. INV-1024 — optional but helps find this bill later"
                  value={activeBill?.invoiceRef ?? ""}
                  onChange={(e) => setActiveBillInvoiceRef(e.target.value)}
                  disabled={!detailsReady}
                  className="h-9 bg-white text-sm text-black"
                />
              </div>
              {billDrafts.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 shrink-0 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={removeActiveStockInBill}
                  disabled={saving}
                >
                  Remove selected bill
                </Button>
              ) : null}
            </div>
          </div>

          {/* Split workspace: products | receipt */}
          <StockProductPicker
            layout="split"
            products={products}
            categories={visibleCategories}
            loading={productsLoading}
            lines={pickerLines}
            onLinesChange={onPickerLinesChange}
            quantityLabel="Qty received"
            showUnitCost
            unitCostLabel="Cost / unit"
            showCurrentQty
            lockAdd={!detailsReady}
            onAddBlocked={() => {
              setPulseDetails(true);
              toast.message("Choose supplier and branch first", {
                description: "Step 1 above — then click a product to add it.",
              });
              window.setTimeout(() => setPulseDetails(false), 2200);
            }}
            disabledHint={
              !supplierId && !warehouseBranchId
                ? "Choose a supplier and branch above"
                : !supplierId
                  ? "Choose a supplier above"
                  : "Choose which branch receives this stock"
            }
            catalogTitle="Products"
            catalogSubtitle={
              billDrafts.length > 1
                ? `Adds to: ${
                    activeBill?.invoiceRef.trim() ||
                    `Bill ${Math.max(0, billDrafts.findIndex((b) => b.id === activeBill?.id)) + 1}`
                  }`
                : "Search and click a row to add to this bill"
            }
            cartTitle={
              activeBill?.invoiceRef.trim()
                ? `Bill · ${activeBill.invoiceRef.trim()}`
                : billDrafts.length > 1
                  ? `Bill ${billDrafts.findIndex((b) => b.id === activeBill?.id) + 1}`
                  : "This bill"
            }
            emptyCartHint="Select a bill above, then click a product to add it here."
            getCurrentQty={(id) =>
              warehouseBranchId ? (stockMap[id] ?? 0) : null
            }
            error={formErrors.lines}
            cartFooter={
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] tabular-nums text-slate-500">
                    <span className="font-semibold text-slate-900">{totals.lineCount}</span> line
                    {totals.lineCount === 1 ? "" : "s"} ·{" "}
                    <span className="font-semibold text-slate-900">{formatQty(totals.units)}</span> units
                  </p>
                  <p className="text-lg font-bold tabular-nums tracking-tight text-slate-900">
                    Rs {formatMoney(totals.value)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
                    {(
                      [
                        { key: "CASH" as const, label: "Paid" },
                        { key: "CREDIT" as const, label: "Credit" },
                        { key: "MIX" as const, label: "Part" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          setPaymentMode(opt.key);
                          if (opt.key !== "MIX") setPaidNowInput("");
                        }}
                        className={cn(
                          "rounded px-2 py-0.5 text-[11px] font-semibold transition-colors",
                          paymentMode === opt.key
                            ? "bg-slate-900 text-white shadow-sm"
                            : "text-slate-600 hover:bg-white",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {paymentMode === "MIX" ? (
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paidNowInput}
                      onChange={(e) => setPaidNowInput(e.target.value)}
                      placeholder="Paid now"
                      className="h-7 w-24 bg-white text-xs tabular-nums"
                    />
                  ) : null}

                  {paymentMode !== "CREDIT" ? (
                    <>
                      <Select value={settleMethod} onValueChange={(v) => setSettleMethod(v as typeof settleMethod)}>
                        <SelectTrigger className="h-7 w-[7.5rem] bg-white text-[11px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CASH">Cash</SelectItem>
                          <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                          <SelectItem value="CHEQUE">Cheque</SelectItem>
                          <SelectItem value="CARD">Card</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={settleReference}
                        onChange={(e) => setSettleReference(e.target.value)}
                        placeholder="Txn ref"
                        className="h-7 min-w-0 flex-1 bg-white text-xs"
                      />
                    </>
                  ) : null}

                  <p className="ml-auto text-[10px] tabular-nums text-slate-500">
                    Now{" "}
                    <span className="font-semibold text-emerald-700">Rs {formatMoney(paidNowAmount)}</span>
                    {" · "}Credit{" "}
                    <span className={cn("font-semibold", creditRemaining > 0 ? "text-rose-700" : "text-slate-800")}>
                      Rs {formatMoney(creditRemaining)}
                    </span>
                  </p>
                </div>

                {!detailsReady ? (
                  <p className="text-[10px] text-amber-700">Choose supplier and branch above</p>
                ) : allDraftLines.length === 0 ? (
                  <p className="text-[10px] text-amber-700">Add at least one product to a bill</p>
                ) : multiBillMixBlocked ? (
                  <p className="text-[10px] text-amber-700">
                    Multiple bills: use Paid or Credit (not Part paid)
                  </p>
                ) : paymentMode === "MIX" && !paymentValid ? (
                  <p className="text-[10px] text-red-600">Part paid must be between 0 and total</p>
                ) : Object.keys(formErrors).length > 0 ? (
                  <p className="text-[10px] text-red-600">Fix highlighted fields</p>
                ) : null}

                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="h-9 flex-1" onClick={() => setTab("history")}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!canSave}
                    className="h-9 flex-[1.5] bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {saving
                      ? "Saving…"
                      : billsWithLines.length > 1
                        ? `Save ${billsWithLines.length} bills · Rs ${formatMoney(totals.value)}`
                        : `Save${totals.value > 0 ? ` · Rs ${formatMoney(totals.value)}` : ""}`}
                  </Button>
                </div>
              </div>
            }
          />
        </TabsContent>

        <TabsContent value="bills" className="mt-0 focus-visible:outline-none">
          <StockInBillsTab
            products={products}
            categories={visibleCategories}
            productsLoading={productsLoading}
            suppliers={visibleSuppliers}
            branches={branches}
            onDataChanged={() => {
              void fetchHistory();
              void fetchStats();
            }}
          />
        </TabsContent>

        <TabsContent value="returns" className="mt-0 focus-visible:outline-none">
          <PurchaseReturnsPanel
            suppliers={visibleSuppliers}
            branches={branches}
            products={products}
            productsLoading={productsLoading}
          />
        </TabsContent>
      </Tabs>

      <ExcelUploadDialog
        open={excelDialogOpen}
        onOpenChange={setExcelDialogOpen}
        title="Import new products from Excel"
        description={
          <>
            Upload a spreadsheet to add new products with prices and opening stock. This
            updates the product catalog only — it does not create a supplier receipt.
          </>
        }
        fields={STOCK_IN_FIELDS}
        footnote={
          <>
            Optional columns: Subcategory, Brand, Supplier, Tax, SKU, Description. Item
            codes are auto-generated when SKU is omitted. Header aliases such as{" "}
            <span className="font-medium">Name</span>,{" "}
            <span className="font-medium">purchase_rate</span>, and{" "}
            <span className="font-medium">sales_rate_inc_dis_and_tax</span> are also
            accepted.
          </>
        }
        onRow={async (row) => {
          try {
            await apiClient.post(`${API_BASE}/products/import-row`, { row });
            return { ok: true };
          } catch (err: any) {
            return {
              ok: false,
              error:
                err?.response?.data?.message ||
                err?.response?.data?.errors?.[0]?.message ||
                err?.message ||
                "Failed",
            };
          }
        }}
        onBatchComplete={({ ok, failed, total }) => {
          void refreshProducts();
          if (failed === 0) {
            toast.success(`Imported ${ok} of ${total} product${total === 1 ? "" : "s"}`);
          } else if (ok === 0) {
            toast.error(`All ${total} rows failed — see the list for details`);
          } else {
            toast.warning(`Imported ${ok} of ${total}, ${failed} failed`);
          }
        }}
        onDownloadTemplate={downloadStockInTemplate}
      />

      {/* Detail dialog */}
      <DetailSheet
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) {
            setEditingDetail(false);
            setEditForm(null);
          }
        }}
        size="lg"
      >
        <DetailSheetHeader
          title={editingDetail ? "Edit purchase" : "Stock In receipt"}
          subtitle={
            purchaseDetail?.invoice_ref
              ? `Ref ${purchaseDetail.invoice_ref}`
              : purchaseDetail?.product?.name
                ? `${purchaseDetail.product.name}`
                : "Supplier delivery details"
          }
        />
        <DetailSheetBody>

          {detailLoading ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <p className="text-sm text-gray-600">Loading purchase details...</p>
            </div>
          ) : purchaseDetail ? (
            (() => {
              const {
                batchNo: detailBatch,
                expiryDate: detailExpiry,
                source,
                payment,
                userNotes,
              } =
                parsePurchaseNotes(purchaseDetail.notes);
              const ts = new Date(purchaseDetail.purchase_date);
              const billLines: any[] = Array.isArray(purchaseDetail.bill_lines)
                ? purchaseDetail.bill_lines
                : [purchaseDetail];
              const billQty =
                Number(purchaseDetail.bill_quantity) ||
                billLines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
              const billValue =
                Number(purchaseDetail.bill_value) ||
                billLines.reduce(
                  (s, l) => s + (Number(l.quantity) || 0) * (Number(l.cost_price) || 0),
                  0,
                );

              if (editingDetail && editForm) {
                const editBillQty = editForm.lines.reduce(
                  (s, l) => s + (Number(l.quantity) || 0),
                  0,
                );
                const editBillValue = editForm.lines.reduce(
                  (s, l) =>
                    s + (Number(l.quantity) || 0) * (Number(l.costPrice) || 0),
                  0,
                );
                return (
                  <div className="px-6 py-5 space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-gray-500">Invoice / reference</Label>
                        <Input
                          value={editForm.invoiceRef}
                          onChange={(e) =>
                            setEditForm((f) =>
                              f ? { ...f, invoiceRef: e.target.value } : f,
                            )
                          }
                          placeholder="Optional invoice ref"
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-gray-500">Purchase date</Label>
                        <Input
                          type="date"
                          value={editForm.purchaseDate}
                          onChange={(e) =>
                            setEditForm((f) =>
                              f ? { ...f, purchaseDate: e.target.value } : f,
                            )
                          }
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-gray-500">Delivery status</Label>
                        <Select
                          value={editForm.deliveryStatus}
                          onValueChange={(v) =>
                            setEditForm((f) =>
                              f
                                ? {
                                    ...f,
                                    deliveryStatus: v as "PARTIAL" | "COMPLETE",
                                  }
                                : f,
                            )
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="COMPLETE">Complete</SelectItem>
                            <SelectItem value="PARTIAL">Partial</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <DetailRow
                        label="Branch / Supplier"
                        value={`${purchaseDetail.warehouse_branch?.name || "—"} · ${
                          purchaseDetail.supplier?.name &&
                          !isUnknownName(purchaseDetail.supplier.name)
                            ? purchaseDetail.supplier.name
                            : "—"
                        }`}
                      />
                    </div>

                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2 border-b border-gray-200">
                        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Line items
                        </span>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-white hover:bg-white">
                            <TableHead className="text-xs font-semibold text-gray-600">
                              Product
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 text-right w-28">
                              Qty
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 text-right w-32">
                              Cost
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 text-right w-32">
                              Sale
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 text-right">
                              Total
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {editForm.lines.map((line, idx) => {
                            const lqty = Number(line.quantity) || 0;
                            const lcost = Number(line.costPrice) || 0;
                            return (
                              <TableRow key={line.id}>
                                <TableCell className="text-sm font-medium text-gray-900">
                                  {line.productName}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    min={0.01}
                                    step="any"
                                    value={line.quantity}
                                    onChange={(e) =>
                                      setEditForm((f) => {
                                        if (!f) return f;
                                        const lines = [...f.lines];
                                        lines[idx] = {
                                          ...lines[idx],
                                          quantity: e.target.value,
                                        };
                                        return { ...f, lines };
                                      })
                                    }
                                    className="h-8 text-right tabular-nums"
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={line.costPrice}
                                    onChange={(e) =>
                                      setEditForm((f) => {
                                        if (!f) return f;
                                        const lines = [...f.lines];
                                        lines[idx] = {
                                          ...lines[idx],
                                          costPrice: e.target.value,
                                        };
                                        return { ...f, lines };
                                      })
                                    }
                                    className="h-8 text-right tabular-nums"
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={line.salePrice}
                                    onChange={(e) =>
                                      setEditForm((f) => {
                                        if (!f) return f;
                                        const lines = [...f.lines];
                                        lines[idx] = {
                                          ...lines[idx],
                                          salePrice: e.target.value,
                                        };
                                        return { ...f, lines };
                                      })
                                    }
                                    className="h-8 text-right tabular-nums"
                                  />
                                </TableCell>
                                <TableCell className="text-sm font-semibold text-right tabular-nums">
                                  {formatMoney(lqty * lcost)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      <div className="bg-slate-50 px-4 py-3 flex justify-between items-center border-t border-gray-200">
                        <span className="text-xs text-gray-500">
                          {formatQty(editBillQty)} units · {editForm.lines.length} line
                          {editForm.lines.length === 1 ? "" : "s"}
                        </span>
                        <span className="text-sm font-bold tabular-nums text-gray-900">
                          Rs {formatMoney(editBillValue)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-gray-500">Batch number</Label>
                        <Input
                          value={editForm.batchNo}
                          onChange={(e) =>
                            setEditForm((f) =>
                              f ? { ...f, batchNo: e.target.value } : f,
                            )
                          }
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-gray-500">Expiry date</Label>
                        <Input
                          type="date"
                          value={editForm.expiryDate}
                          onChange={(e) =>
                            setEditForm((f) =>
                              f ? { ...f, expiryDate: e.target.value } : f,
                            )
                          }
                          className="h-9"
                        />
                      </div>
                      <div className="sm:col-span-2 space-y-1.5">
                        <Label className="text-xs text-gray-500">Notes</Label>
                        <Textarea
                          value={editForm.userNotes}
                          onChange={(e) =>
                            setEditForm((f) =>
                              f ? { ...f, userNotes: e.target.value } : f,
                            )
                          }
                          rows={3}
                        />
                      </div>
                    </div>

                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      Changing quantity adjusts on-hand stock by the difference. You cannot
                      reduce below stock already sold or returned.
                    </p>
                  </div>
                );
              }

              return (
                <div className="px-5 sm:px-6 py-5 space-y-5">
                  {/* Receipt header card */}
                  <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 sm:p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Document reference
                        </p>
                        <p className="mt-1 truncate font-mono text-lg font-semibold text-slate-900">
                          {purchaseDetail.invoice_ref || "— (Direct stock in)"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {ts.toLocaleDateString(undefined, { dateStyle: "full" })}
                          {" · "}
                          {ts.toLocaleTimeString(undefined, { timeStyle: "short" })}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {billLines.length > 1 ? (
                          <Badge
                            variant="outline"
                            className="border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700"
                          >
                            {billLines.length} lines
                          </Badge>
                        ) : null}
                        <Badge
                          variant="outline"
                          className={cn(
                            "px-2.5 py-0.5 text-xs font-semibold",
                            (purchaseDetail.delivery_status || "COMPLETE").toUpperCase() ===
                              "COMPLETE"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-700",
                          )}
                        >
                          {purchaseDetail.delivery_status || "COMPLETE"}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          Supplier
                        </p>
                        <p className="mt-0.5 text-sm font-medium text-slate-900">
                          {purchaseDetail.supplier?.name &&
                          !isUnknownName(purchaseDetail.supplier.name)
                            ? purchaseDetail.supplier.name
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          Branch
                        </p>
                        <p className="mt-0.5 text-sm font-medium text-slate-900">
                          {purchaseDetail.warehouse_branch?.name || "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          Recorded by
                        </p>
                        <p className="mt-0.5 truncate text-sm font-medium text-slate-900">
                          {purchaseDetail.user?.email || "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          Bill total
                        </p>
                        <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
                          Rs {formatMoney(billValue)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Payment / source chips */}
                  {(source || payment) && (
                    <div className="flex flex-wrap gap-2">
                      {source ? (
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                          Source · {source}
                        </span>
                      ) : null}
                      {payment ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
                          Payment · {payment}
                        </span>
                      ) : null}
                    </div>
                  )}

                  {/* Line items */}
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                        {billLines.length > 1 ? "Bill lines" : "Line item"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {formatQty(billQty)} units
                      </span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-white">
                          <TableHead className="text-xs font-semibold text-slate-600">
                            Product
                          </TableHead>
                          <TableHead className="text-center text-xs font-semibold text-slate-600">
                            SKU
                          </TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-600">
                            Qty
                          </TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-600">
                            Cost
                          </TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-600">
                            Total
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {billLines.map((line: any) => {
                          const lqty = Number(line.quantity) || 0;
                          const lcost = Number(line.cost_price) || 0;
                          return (
                            <TableRow key={line.id} className="border-slate-100">
                              <TableCell className="text-sm font-medium text-slate-900">
                                {line.product?.name || "—"}
                              </TableCell>
                              <TableCell className="text-center font-mono text-xs text-slate-500">
                                {line.product?.sku || "—"}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {formatQty(lqty)}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums text-slate-700">
                                {formatMoney(lcost)}
                              </TableCell>
                              <TableCell className="text-right text-sm font-semibold tabular-nums text-slate-900">
                                {formatMoney(lqty * lcost)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="text-xs text-slate-500">
                        {formatQty(billQty)} units · {billLines.length} line
                        {billLines.length === 1 ? "" : "s"}
                      </span>
                      <div className="text-right">
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">
                          Grand total
                        </p>
                        <p className="text-base font-bold tabular-nums text-slate-900">
                          Rs {formatMoney(billValue)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {(detailBatch || detailExpiry || userNotes) && (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Additional details
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        {detailBatch ? (
                          <DetailRow label="Batch number" value={detailBatch} />
                        ) : null}
                        {detailExpiry ? (
                          <DetailRow label="Expiry date" value={detailExpiry} />
                        ) : null}
                      </div>
                      {userNotes ? (
                        <div>
                          <p className="text-xs text-slate-500">Notes</p>
                          <p className="mt-0.5 text-sm leading-relaxed text-slate-800">
                            {userNotes}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <p className="text-sm font-medium">Failed to retrieve details</p>
            </div>
          )}
        </DetailSheetBody>
        <DetailSheetFooter className="[&_button]:max-w-full [&_button]:shrink">
          {editingDetail ? (
            <>
              <Button
                variant="outline"
                onClick={cancelEditingPurchase}
                disabled={editSaving}
              >
                Cancel
              </Button>
              <Button onClick={saveEditedPurchase} disabled={editSaving || detailLoading}>
                {editSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setDetailOpen(false)}>
                Close
              </Button>
              {purchaseDetail ? (
                <>
                  <Button
                    variant="outline"
                    onClick={downloadPurchaseReceipt}
                    disabled={receiptDownloading}
                  >
                    {receiptDownloading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    {receiptDownloading ? "Preparing…" : "Download receipt"}
                  </Button>
                  <Button onClick={startEditingPurchase}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  {Array.isArray(purchaseDetail.bill_lines) &&
                  purchaseDetail.bill_lines.length === 1 ? (
                    <Button
                      variant="destructive"
                      disabled={Boolean(purchaseDetail.purchase_invoice_id)}
                      onClick={() =>
                        requestDeletePurchaseLine(
                          purchaseDetail.id,
                          purchaseDetail.bill_lines[0]?.product?.name ||
                            purchaseDetail.product?.name ||
                            "this line",
                        )
                      }
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete line
                    </Button>
                  ) : purchaseDetail.bill_lines?.length > 1 ? (
                    <Button
                      variant="destructive"
                      onClick={() =>
                        requestDeleteBillFromHistory(
                          purchaseDetail.id,
                          billInvoiceLabel(purchaseDetail.invoice_ref),
                        )
                      }
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete whole bill
                    </Button>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </DetailSheetFooter>
      </DetailSheet>

      <StockInDeleteConfirmDialog
        target={deleteConfirm}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null);
        }}
        onConfirm={confirmStockInDelete}
        confirmLabel="Yes, delete"
      />
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-900 mt-0.5 break-words">{value}</p>
    </div>
  );
}
