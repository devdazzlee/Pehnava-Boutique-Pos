"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  PackageMinus,
  FileSpreadsheet,
  Plus,
  List,
  LayoutGrid,
  X,
  Eye,
  DollarSign,
  Boxes,
  AlertTriangle,
  FileText,
  Trash2,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { PageLoader } from "@/components/ui/page-loader";
import { ExcelUploadDialog, type ExcelField } from "@/components/inventory/excel-upload-dialog";
import { STOCK_OUT_REASONS } from "@/components/inventory/stock-ops/constants";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import { StockOpsActions } from "@/components/inventory/stock-ops/stock-ops-actions";
import {
  downloadExcel,
  downloadBrandedPdf,
  formatMoney,
  formatQty,
  yieldForUi,
} from "@/components/inventory/stock-ops/export-utils";
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

type Reason = "SALE" | "DAMAGE" | "LOSS" | "EXPIRED" | "RETURN";

const REASON_OPTIONS = STOCK_OUT_REASONS.filter(
  (r): r is { value: Reason; label: string } =>
    ["SALE", "DAMAGE", "LOSS", "EXPIRED", "RETURN"].includes(r.value),
);

const dispatchSchema = z.object({
  branchId: z.string().min(1, "Pick a branch before saving"),
  reason: z.enum(["SALE", "DAMAGE", "LOSS", "EXPIRED", "RETURN"], {
    errorMap: () => ({ message: "Pick a reason" }),
  }),
  lines: z.array(z.any()).min(1, "Add at least one line to dispatch"),
});

type DispatchFieldErrors = Partial<Record<"branchId" | "reason" | "lines", string>>;

interface DraftLine {
  productId: string;
  productName: string;
  sku?: string;
  quantity: number;
  rate: number;
  available: number;
}

interface MovementRow {
  id: string;
  created_at: string;
  movement_type: string;
  quantity_change: string | number;
  previous_qty?: string | number | null;
  new_qty?: string | number | null;
  unit_cost?: string | number | null;
  notes?: string | null;
  product?: { id: string; name: string; sku?: string | null } | null;
  branch?: { id: string; name: string } | null;
  user?: { email?: string | null } | null;
}

interface StockOutMonthStats {
  totalDispatches: number;
  totalQuantity: number;
  totalValue: number;
  byReason: Record<string, number>;
}

function reasonLabel(type?: string | null) {
  if (!type) return "—";
  return REASON_OPTIONS.find((r) => r.value === type)?.label || type;
}

function reasonTone(type?: string | null) {
  switch ((type || "").toUpperCase()) {
    case "DAMAGE":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "EXPIRED":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "LOSS":
      return "bg-orange-50 text-orange-800 border-orange-200";
    case "RETURN":
      return "bg-sky-50 text-sky-800 border-sky-200";
    case "SALE":
      return "bg-slate-100 text-slate-700 border-slate-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function parseDispatchNotes(notes?: string | null) {
  if (!notes) return { documentRef: "", rate: "", userNotes: "" };
  const parts = notes.split(" | ");
  let documentRef = "";
  let rate = "";
  const remaining: string[] = [];
  parts.forEach((p) => {
    if (p.startsWith("Ref: ")) {
      documentRef = p.replace("Ref: ", "");
    } else if (p.startsWith("Rate: ")) {
      rate = p.replace("Rate: ", "");
    } else {
      remaining.push(p);
    }
  });
  return {
    documentRef,
    rate,
    userNotes: remaining.join(" | "),
  };
}

function removedQty(row: MovementRow) {
  return Math.abs(Number(row.quantity_change) || 0);
}

function lineRate(row: MovementRow) {
  const fromField = Number(row.unit_cost);
  if (Number.isFinite(fromField) && fromField > 0) return fromField;
  const parsed = Number(parseDispatchNotes(row.notes).rate);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function StockOut({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  void onNavigate;
  const logoDataUri = useLogoDataUri();
  const {
    products,
    branches,
    categories,
    productsLoading,
    branchesLoading,
    fetchProducts,
    fetchBranches,
  } = usePosData();

  const [tab, setTab] = useState<"history" | "new">("history");

  // ------- history -------
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;
  useScrollToTopOnPageChange(page);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterReason, setFilterReason] = useState<string>("all");
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [filterStart, setFilterStart] = useState<Date | undefined>(undefined);
  const [filterEnd, setFilterEnd] = useState<Date | undefined>(undefined);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [exporting, setExporting] = useState(false);

  const [monthStats, setMonthStats] = useState<StockOutMonthStats>({
    totalDispatches: 0,
    totalQuantity: 0,
    totalValue: 0,
    byReason: {},
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // ------- detail modal -------
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<MovementRow | null>(null);

  const openDetail = (row: MovementRow) => {
    setDetailRow(row);
    setDetailOpen(true);
  };

  const fetchHistory = useCallback(
    async (pg = page) => {
      setHistoryLoading(true);
      try {
        const params: Record<string, string | number> = {
          page: pg,
          limit: PAGE_SIZE,
        };
        if (filterReason !== "all") params.reason = filterReason;
        if (filterBranch !== "all") params.branchId = filterBranch;
        if (filterStart) params.startDate = filterStart.toISOString();
        if (filterEnd) {
          const e = new Date(filterEnd);
          e.setHours(23, 59, 59, 999);
          params.endDate = e.toISOString();
        }
        const res = await apiClient.get(`${API_BASE}/stock-out`, { params });
        setRows(res.data?.data || []);
        setTotal(res.data?.meta?.total ?? 0);
        setTotalPages(res.data?.meta?.totalPages ?? 1);
      } catch (e: any) {
        toast.error(e?.response?.data?.message || "Failed to load stock-out history");
      } finally {
        setHistoryLoading(false);
      }
    },
    [filterReason, filterBranch, filterStart, filterEnd, page],
  );

  useEffect(() => {
    fetchProducts();
    fetchBranches();
  }, [fetchProducts, fetchBranches]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterBranch !== "all") params.branchId = filterBranch;
      const res = await apiClient.get(`${API_BASE}/stock-out/stats`, { params });
      const data = res.data?.data || {};
      setMonthStats({
        totalDispatches: Number(data.totalDispatches) || 0,
        totalQuantity: Number(data.totalQuantity) || 0,
        totalValue: Number(data.totalValue) || 0,
        byReason: data.byReason || {},
      });
    } catch {
      setMonthStats({
        totalDispatches: 0,
        totalQuantity: 0,
        totalValue: 0,
        byReason: {},
      });
    } finally {
      setStatsLoading(false);
    }
  }, [filterBranch]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const product = (r.product?.name || "").toLowerCase();
      const sku = (r.product?.sku || "").toLowerCase();
      const branch = (r.branch?.name || "").toLowerCase();
      const notes = (r.notes || "").toLowerCase();
      const reason = reasonLabel(r.movement_type).toLowerCase();
      return (
        product.includes(q) ||
        sku.includes(q) ||
        branch.includes(q) ||
        notes.includes(q) ||
        reason.includes(q)
      );
    });
  }, [rows, searchQuery]);

  const pageTotals = useMemo(() => {
    let units = 0;
    let value = 0;
    for (const r of filteredRows) {
      const qty = removedQty(r);
      units += qty;
      value += qty * lineRate(r);
    }
    return { units, value };
  }, [filteredRows]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    filterReason !== "all" ||
    filterBranch !== "all" ||
    !!filterStart ||
    !!filterEnd;

  const clearFilters = () => {
    setSearchQuery("");
    setFilterReason("all");
    setFilterBranch("all");
    setFilterStart(undefined);
    setFilterEnd(undefined);
    setPage(1);
  };

  const exportHeaders = [
    "Date",
    "Product",
    "SKU",
    "Branch",
    "Reason",
    "Qty removed",
    "Rate",
    "Value",
    "Previous qty",
    "New qty",
    "Notes",
    "User",
  ];

  const buildExportRows = () =>
    filteredRows.map((r) => {
      const qty = removedQty(r);
      const rate = lineRate(r);
      return [
        r.created_at ? new Date(r.created_at).toLocaleString() : "",
        r.product?.name || "",
        r.product?.sku || "",
        r.branch?.name || "",
        reasonLabel(r.movement_type),
        qty,
        rate,
        qty * rate,
        Number(r.previous_qty) || 0,
        Number(r.new_qty) || 0,
        r.notes || "",
        r.user?.email || "",
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
        `stock-out-${Date.now()}.xlsx`,
        "Stock Out",
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
        const qty = removedQty(r);
        const rate = lineRate(r);
        return [
          r.created_at ? new Date(r.created_at).toLocaleDateString() : "",
          r.product?.name || "",
          r.branch?.name || "",
          reasonLabel(r.movement_type),
          formatQty(qty),
          formatMoney(rate),
          formatMoney(qty * rate),
        ];
      });

      await downloadBrandedPdf({
        filename: `stock-out-${Date.now()}.pdf`,
        title: "Stock Out — Dispatches",
        subtitle: "Outbound stock movements",
        logoDataUri,
        summary: [
          { label: "Records", value: filteredRows.length.toLocaleString() },
          {
            label: "This month",
            value: monthStats.totalDispatches.toLocaleString(),
          },
          { label: "Month value", value: formatMoney(monthStats.totalValue) },
        ],
        columns: [
          { header: "Date", width: 1.1 },
          { header: "Product", width: 2.2 },
          { header: "Branch", width: 1.3 },
          { header: "Reason", width: 1.4 },
          { header: "Qty", align: "right", width: 0.8 },
          { header: "Rate", align: "right", width: 1 },
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

  // ------- new dispatch form -------
  const [reason, setReason] = useState<Reason>("DAMAGE");
  const [branchId, setBranchId] = useState<string>("");
  const [documentRef, setDocumentRef] = useState<string>("");
  const [dispatchDate, setDispatchDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState<string>("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<DispatchFieldErrors>({});
  const [excelDialogOpen, setExcelDialogOpen] = useState(false);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [pulseDetails, setPulseDetails] = useState(false);

  const clearError = (key: keyof DispatchFieldErrors) =>
    setFormErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  useEffect(() => {
    if (!branchId && branches.length > 0) {
      setBranchId(branches[0].id);
    }
  }, [branches, branchId]);

  useEffect(() => {
    if (!branchId) {
      setStockMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get(`${API_BASE}/stock`, {
          params: { branchId, limit: 5000 },
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
  }, [branchId]);

  const pickerLines: StockLineItem[] = useMemo(
    () =>
      lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        sku: l.sku,
        quantity: l.quantity,
        unitCost: l.rate,
        currentQty: l.available,
      })),
    [lines],
  );

  const onPickerLinesChange = (next: StockLineItem[]) => {
    setLines(
      next.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        sku: l.sku,
        quantity: Number(l.quantity) || 0,
        rate: Number(l.unitCost) || 0,
        available: l.currentQty ?? stockMap[l.productId] ?? 0,
      })),
    );
    clearError("lines");
  };

  const STOCK_OUT_FIELDS: ExcelField[] = [
    {
      name: "Name",
      required: true,
      description: "Product name in your catalog. Aliases: Product, Product Name.",
    },
    {
      name: "Quantity",
      required: true,
      description: "Units to dispatch (must be > 0). Aliases: Qty, quantity.",
    },
    {
      name: "Rate",
      description: "Optional unit price for the line. Aliases: Price, Unit Price.",
    },
  ];

  const productNameIndex = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of products) {
      const key = String(p.name || "").trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, p);
    }
    return map;
  }, [products]);

  const availabilityCacheRef = useRef(new Map<string, number>());

  const processRow = async (
    row: Record<string, any>,
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!branchId) {
      return { ok: false, error: "Pick a branch first" };
    }

    const pick = (keys: string[]) => {
      const normalized: Record<string, any> = {};
      for (const k of Object.keys(row)) normalized[k.trim().toLowerCase()] = row[k];
      for (const k of keys) {
        const key = k.toLowerCase();
        if (normalized[key] !== undefined && normalized[key] !== "") {
          return normalized[key];
        }
      }
      return undefined;
    };

    const name = String(pick(["name", "product", "product name"]) || "").trim();
    if (!name) return { ok: false, error: "Missing product name" };
    const qty = Number(pick(["quantity", "qty"]));
    if (!Number.isFinite(qty) || qty <= 0) {
      return { ok: false, error: "Invalid or missing quantity" };
    }
    const rate = Number(pick(["rate", "price", "unit price"]) || 0) || 0;

    const match = productNameIndex.get(name.toLowerCase());
    if (!match) return { ok: false, error: "Product name not found in catalog" };

    let available = availabilityCacheRef.current.get(match.id);
    if (available === undefined) {
      try {
        const res = await apiClient.get(
          `${API_BASE}/stock/product/${match.id}/branch/${branchId}`,
        );
        available = Number(res.data?.data?.current_quantity ?? 0);
      } catch {
        available = 0;
      }
      availabilityCacheRef.current.set(match.id, available);
    }

    if (qty > (available || 0)) {
      return {
        ok: false,
        error: `Only ${available} in stock — can't dispatch ${qty}`,
      };
    }

    setLines((prev) => {
      const byId = new Map(prev.map((l) => [l.productId, { ...l }]));
      const ex = byId.get(match.id);
      if (ex) {
        ex.quantity += qty;
        if (rate) ex.rate = rate;
      } else {
        byId.set(match.id, {
          productId: match.id,
          productName: match.name,
          sku: match.sku,
          quantity: qty,
          rate,
          available: available || 0,
        });
      }
      return Array.from(byId.values());
    });

    return { ok: true };
  };

  const resetUploadCaches = () => {
    availabilityCacheRef.current = new Map<string, number>();
    setUnmatched([]);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Name", "Quantity", "Rate"],
      ["Sample Product A", 10, 100],
      ["Sample Product B", 5, 250],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Out");
    XLSX.writeFile(wb, "stock-out-template.xlsx");
  };

  const totals = useMemo(() => {
    const lineCount = lines.length;
    const units = lines.reduce((s, l) => s + l.quantity, 0);
    const value = lines.reduce((s, l) => s + l.quantity * (l.rate || 0), 0);
    return { lineCount, units, value };
  }, [lines]);

  const overstockLines = useMemo(
    () => lines.filter((l) => l.quantity > l.available),
    [lines],
  );

  const detailsReady = Boolean(branchId && reason);
  const canSave =
    detailsReady && lines.length > 0 && overstockLines.length === 0 && !saving;

  const resetDraft = () => {
    setLines([]);
    setNotes("");
    setDocumentRef("");
    setReason("DAMAGE");
    setDispatchDate(new Date());
    setFormErrors({});
    setUnmatched([]);
    setShowMoreDetails(false);
  };

  const handleSave = async () => {
    if (saving) return;

    const parsed = dispatchSchema.safeParse({ branchId, reason, lines });
    if (!parsed.success) {
      const next: DispatchFieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof DispatchFieldErrors;
        if (key && !next[key]) next[key] = issue.message;
      }
      setFormErrors(next);
      return;
    }

    if (overstockLines.length > 0) {
      toast.error(
        `${overstockLines.length} line${overstockLines.length === 1 ? "" : "s"} exceed available stock`,
      );
      return;
    }

    setFormErrors({});
    setSaving(true);
    try {
      await apiClient.post(`${API_BASE}/stock-out/bulk`, {
        branchId,
        reason,
        documentRef: documentRef || undefined,
        dispatchDate: dispatchDate.toISOString(),
        notes: notes || undefined,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          rate: l.rate || undefined,
        })),
      });
      toast.success(
        `Dispatched ${lines.length} line${lines.length === 1 ? "" : "s"}`,
      );
      setLines([]);
      setNotes("");
      setDocumentRef("");
      setTab("history");
      setPage(1);
      fetchHistory(1);
      fetchStats();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to save dispatch");
    } finally {
      setSaving(false);
    }
  };

  if (productsLoading && products.length === 0 && branches.length === 0) {
    return <PageLoader message="Loading stock out..." />;
  }

  return (
    <div className="p-4 md:p-6 space-y-5 text-black min-w-0">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between pb-1 border-b border-gray-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-rose-600 mb-1">
            <PackageMinus className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              Inventory
            </span>
          </div>
          <h1 className="text-2xl md:text-[1.75rem] font-bold text-gray-900 tracking-tight leading-none">
            Stock Out
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Record damage, expiry, loss, supplier returns, and dispatches
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          {tab === "history" ? (
            <Button size="sm" className="h-9 text-sm" onClick={() => setTab("new")}>
              <Plus className="h-4 w-4 mr-1.5" />
              New dispatch
            </Button>
          ) : null}
          <StockOpsActions
            onExportExcel={exportExcel}
            onExportPdf={exportPdf}
            disabled={historyLoading || filteredRows.length === 0}
            exporting={exporting}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-sm text-black"
            onClick={() => setExcelDialogOpen(true)}
          >
            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            Import lines
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "history" | "new")}
        className="space-y-5"
      >
        <TabsList className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm h-10 shrink-0 w-full max-w-xs grid grid-cols-2">
          <TabsTrigger
            value="history"
            className="rounded-lg h-8 text-xs sm:text-sm data-[state=active]:bg-gray-900 data-[state=active]:text-white"
          >
            History
          </TabsTrigger>
          <TabsTrigger
            value="new"
            className="rounded-lg h-8 text-xs sm:text-sm data-[state=active]:bg-gray-900 data-[state=active]:text-white"
          >
            New dispatch
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-0 space-y-5 focus-visible:outline-none">
          <InventoryKpiGrid
            columns={4}
            loading={statsLoading}
            items={[
              {
                label: "Dispatches (month)",
                value: monthStats.totalDispatches.toLocaleString(),
                icon: Trash2,
                hint: "This calendar month",
              },
              {
                label: "Qty removed (month)",
                value: formatQty(monthStats.totalQuantity),
                icon: Boxes,
              },
              {
                label: "Value (month)",
                value: formatMoney(monthStats.totalValue),
                icon: DollarSign,
              },
              {
                label: "Records shown",
                value: total.toLocaleString(),
                icon: FileText,
                hint: "Matching current filters",
              },
            ]}
          />

          {/* Reason quick chips */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setFilterReason("all");
                setPage(1);
              }}
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filterReason === "all"
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
              )}
            >
              All
              {statsLoading ? (
                <span
                  className={cn(
                    "ml-1.5 inline-block h-3 w-5 animate-pulse rounded-full",
                    filterReason === "all" ? "bg-white/30" : "bg-gray-200",
                  )}
                />
              ) : (
                <span className="ml-1.5 tabular-nums opacity-70">
                  {monthStats.totalDispatches}
                </span>
              )}
            </button>
            {REASON_OPTIONS.map((r) => {
              const count = monthStats.byReason[r.value] || 0;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => {
                    setFilterReason(r.value);
                    setPage(1);
                  }}
                  className={cn(
                    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filterReason === r.value
                      ? "border-gray-900 bg-gray-900 text-white"
                      : cn("bg-white hover:bg-gray-50", reasonTone(r.value)),
                  )}
                >
                  {r.label}
                  {statsLoading ? (
                    <span
                      className={cn(
                        "ml-1.5 inline-block h-3 w-5 animate-pulse rounded-full",
                        filterReason === r.value ? "bg-white/30" : "bg-gray-200",
                      )}
                    />
                  ) : (
                    <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filters */}
          <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
              <div className="relative md:col-span-2 xl:col-span-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search product, SKU, branch, notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-10 text-sm text-black"
                />
              </div>

              <Select
                value={filterReason}
                onValueChange={(v) => {
                  setFilterReason(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 min-w-0 text-sm text-black">
                  <SelectValue placeholder="All reasons" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-sm">
                    All reasons
                  </SelectItem>
                  {REASON_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value} className="text-sm">
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filterBranch}
                onValueChange={(v) => {
                  setFilterBranch(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 text-sm text-black">
                  <SelectValue placeholder="All branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-sm">
                    All branches
                  </SelectItem>
                  {branches.map((b: any) => (
                    <SelectItem key={b.id} value={b.id} className="text-sm">
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-10 w-full justify-start text-left text-sm font-normal text-black"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-gray-500" />
                    {filterStart ? (
                      format(filterStart, "dd MMM yyyy")
                    ) : (
                      <span className="text-gray-400">From date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={filterStart}
                    onSelect={(d) => {
                      setFilterStart(d);
                      setPage(1);
                    }}
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-10 w-full justify-start text-left text-sm font-normal text-black"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-gray-500" />
                    {filterEnd ? (
                      format(filterEnd, "dd MMM yyyy")
                    ) : (
                      <span className="text-gray-400">To date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={filterEnd}
                    onSelect={(d) => {
                      setFilterEnd(d);
                      setPage(1);
                    }}
                  />
                </PopoverContent>
              </Popover>

              {hasActiveFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 text-sm text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                  onClick={clearFilters}
                >
                  <X className="h-4 w-4 mr-1.5" />
                  Clear filters
                </Button>
              ) : null}
            </div>

            <p className="text-xs text-gray-500">
              {historyLoading && rows.length === 0 ? (
                "Loading records…"
              ) : (
                <>
                  Showing {filteredRows.length.toLocaleString()} of {total.toLocaleString()}{" "}
                  records
                  {searchQuery.trim() ? " (client search on this page)" : ""}
                  {" · "}
                  Page qty {formatQty(pageTotals.units)} · Page value{" "}
                  {formatMoney(pageTotals.value)}
                </>
              )}
            </p>
          </div>

          {/* List header + view toggle */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Dispatch history</h2>
              <p className="text-xs text-gray-500">
                Outbound movements with availability-checked deductions
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 self-start">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 h-8 text-xs font-medium transition-colors",
                  viewMode === "table"
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-50",
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
                  viewMode === "grid"
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-50",
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Grid
              </button>
            </div>
          </div>

          <Card className="border border-gray-200 overflow-hidden bg-white shadow-sm">
            <CardContent className="p-0 relative">
              {historyLoading && rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  <p className="text-sm text-gray-500 mt-3">Loading dispatches...</p>
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                  <PackageMinus className="h-8 w-8 text-gray-300 mb-3" />
                  <p className="text-sm font-medium text-gray-900">No stock-out records</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {hasActiveFilters
                      ? "Try clearing filters or adjusting your search."
                      : "Save a dispatch from New dispatch to see it here."}
                  </p>
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
                          <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                            <TableHead className="text-xs font-semibold text-gray-600 pl-3 pr-2">
                              Date
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 px-2">
                              Product
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 px-2">
                              Branch
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 px-2">
                              Reason
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 text-right px-2">
                              Qty
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 text-right px-2">
                              Rate
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 text-right px-2">
                              Value
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 text-right pl-2 pr-3">
                              Action
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredRows.map((r) => {
                            const qty = removedQty(r);
                            const rate = lineRate(r);
                            const ts = new Date(r.created_at);
                            const parsed = parseDispatchNotes(r.notes);
                            return (
                              <TableRow key={r.id}>
                                <TableCell className="py-2.5 pl-3 pr-2 whitespace-nowrap text-sm text-gray-700">
                                  <div>{ts.toLocaleDateString()}</div>
                                  <div className="text-[11px] text-gray-400">
                                    {ts.toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </div>
                                </TableCell>
                                <TableCell className="py-2.5 px-2">
                                  <p className="text-sm font-medium text-gray-900 line-clamp-1">
                                    {r.product?.name || "—"}
                                  </p>
                                  {parsed.documentRef ? (
                                    <p className="text-[11px] text-gray-400 font-mono">
                                      Ref {parsed.documentRef}
                                    </p>
                                  ) : r.product?.sku ? (
                                    <p className="text-[11px] text-gray-400 font-mono">
                                      {r.product.sku}
                                    </p>
                                  ) : null}
                                </TableCell>
                                <TableCell className="py-2.5 px-2 text-sm text-gray-700">
                                  {r.branch?.name || "—"}
                                </TableCell>
                                <TableCell className="py-2.5 px-2">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[10px] font-semibold",
                                      reasonTone(r.movement_type),
                                    )}
                                  >
                                    {reasonLabel(r.movement_type)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="py-2.5 px-2 text-sm text-right tabular-nums font-medium text-rose-600">
                                  −{formatQty(qty)}
                                </TableCell>
                                <TableCell className="py-2.5 px-2 text-sm text-right tabular-nums text-gray-700">
                                  {rate > 0 ? formatMoney(rate) : "—"}
                                </TableCell>
                                <TableCell className="py-2.5 px-2 text-sm text-right tabular-nums font-medium text-gray-900">
                                  {rate > 0 ? formatMoney(qty * rate) : "—"}
                                </TableCell>
                                <TableCell className="py-2.5 pl-2 pr-3 text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={() => openDetail(r)}
                                  >
                                    <Eye className="h-3.5 w-3.5 mr-1" />
                                    View
                                  </Button>
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
                        const ts = new Date(r.created_at);
                        const qty = removedQty(r);
                        const rate = lineRate(r);
                        const value = qty * rate;
                        const parsed = parseDispatchNotes(r.notes);
                        return (
                          <TransactionRecordCard
                            key={r.id}
                            date={`${ts.toLocaleDateString(undefined, {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })} · ${ts.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`}
                            title={r.product?.name || "Stock out"}
                            subtitle={
                              parsed.documentRef
                                ? `Ref ${parsed.documentRef}`
                                : r.product?.sku
                                  ? `SKU ${r.product.sku}`
                                  : undefined
                            }
                            amount={rate > 0 ? formatMoney(value) : `−${formatQty(qty)}`}
                            amountLabel={rate > 0 ? "Value" : "Qty"}
                            meta={
                              <div className="space-y-1">
                                <p>
                                  <span className="text-gray-400">Branch · </span>
                                  <span className="font-medium text-gray-800">
                                    {r.branch?.name || "—"}
                                  </span>
                                </p>
                                {r.user?.email ? (
                                  <p>
                                    <span className="text-gray-400">By · </span>
                                    <span className="font-medium text-gray-800">
                                      {r.user.email}
                                    </span>
                                  </p>
                                ) : null}
                              </div>
                            }
                            badge={
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                  reasonTone(r.movement_type),
                                )}
                              >
                                {reasonLabel(r.movement_type)}
                              </span>
                            }
                            highlights={[
                              {
                                label: "Qty",
                                value: `−${formatQty(qty)}`,
                                tone: "danger",
                              },
                              {
                                label: "Rate",
                                value: rate > 0 ? formatMoney(rate) : "—",
                              },
                              {
                                label: "After",
                                value: formatQty(Number(r.new_qty) || 0),
                              },
                            ]}
                            actions={
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => openDetail(r)}
                              >
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                View
                              </Button>
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
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-gray-200">
                <p className="text-sm text-black">
                  Showing {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, total)} of {total}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm text-black"
                    onClick={() => setPage(1)}
                    disabled={page === 1 || historyLoading}
                  >
                    First
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm text-black"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1 || historyLoading}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-black px-3">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm text-black"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages || historyLoading}
                  >
                    Next
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm text-black"
                    onClick={() => setPage(totalPages)}
                    disabled={page >= totalPages || historyLoading}
                  >
                    Last
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </TabsContent>

        <TabsContent value="new" className="mt-0 space-y-3 focus-visible:outline-none">
          {unmatched.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-sm font-medium text-amber-900 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                {unmatched.length} row{unmatched.length === 1 ? "" : "s"} skipped
              </p>
            </div>
          ) : null}

          <div
            className={cn(
              "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow",
              pulseDetails && "ring-2 ring-amber-400 ring-offset-2",
            )}
          >
            <div className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-rose-50/70 via-white to-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">New stock out</h2>
                  {detailsReady && lines.length > 0 ? (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                      {lines.length} item{lines.length === 1 ? "" : "s"} · Rs {formatMoney(totals.value)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {!detailsReady
                    ? "Choose reason and branch, then add products"
                    : lines.length === 0
                      ? "Click products below to build this dispatch"
                      : "Review quantities and save"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs text-black"
                  onClick={() => setExcelDialogOpen(true)}
                  disabled={!branchId}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
                  Import lines
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-slate-600"
                  onClick={resetDraft}
                  disabled={saving}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Reset
                </Button>
              </div>
            </div>

            <div className="space-y-3 p-3 sm:p-4">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">
                    Reason <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={reason}
                    onValueChange={(v) => {
                      setReason(v as Reason);
                      clearError("reason");
                      setPulseDetails(false);
                    }}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-9 text-sm text-black",
                        formErrors.reason && "border-red-500",
                        pulseDetails && !reason && "border-amber-500 ring-2 ring-amber-200",
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REASON_OPTIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value} className="text-sm">
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formErrors.reason ? (
                    <p className="text-[11px] text-red-600">{formErrors.reason}</p>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">
                    From branch <span className="text-red-500">*</span>
                  </Label>
                  {branchesLoading || (!branchId && branches.length === 0) ? (
                    <StockSelectSkeleton label="Loading branches" className="h-9" />
                  ) : (
                    <Select
                      value={branchId}
                      onValueChange={(v) => {
                        setBranchId(v);
                        clearError("branchId");
                        setPulseDetails(false);
                      }}
                    >
                      <SelectTrigger
                        className={cn(
                          "h-9 text-sm text-black",
                          formErrors.branchId && "border-red-500",
                          pulseDetails && !branchId && "border-amber-500 ring-2 ring-amber-200",
                        )}
                      >
                        <SelectValue placeholder="Select branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((b: any) => (
                          <SelectItem key={b.id} value={b.id} className="text-sm">
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {formErrors.branchId ? (
                    <p className="text-[11px] text-red-600">{formErrors.branchId}</p>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">
                    Date <span className="text-red-500">*</span>
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-9 w-full justify-start text-left text-sm font-normal text-black"
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5 text-gray-500" />
                        {format(dispatchDate, "dd MMM yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dispatchDate}
                        onSelect={(d) => d && setDispatchDate(d)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Document ref</Label>
                  <Input
                    placeholder="Gate pass / invoice"
                    value={documentRef}
                    onChange={(e) => setDocumentRef(e.target.value)}
                    className="h-9 text-sm text-black"
                  />
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
                {showMoreDetails ? "Hide notes" : "Notes & extras"}
              </button>

              {showMoreDetails ? (
                <div className="border-t border-dashed border-slate-200 pt-3">
                  <Label className="text-xs text-slate-600">Notes</Label>
                  <Input
                    placeholder="Driver, vehicle, approval…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-1 h-9 text-sm text-black"
                  />
                </div>
              ) : null}

              {overstockLines.length > 0 ? (
                <div className="flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {overstockLines.length} line
                  {overstockLines.length === 1 ? "" : "s"} exceed available stock
                </div>
              ) : null}
            </div>
          </div>

          <StockProductPicker
            layout="split"
            products={products}
            categories={categories}
            loading={productsLoading}
            lines={pickerLines}
            onLinesChange={onPickerLinesChange}
            quantityLabel="Qty out"
            showUnitCost
            unitCostLabel="Rate (Rs)"
            showCurrentQty
            previewMode="remove"
            lockAdd={!detailsReady}
            onAddBlocked={() => {
              setPulseDetails(true);
              toast.message("Choose reason and branch first", {
                description: "Step 1 above — then click a product to add it.",
              });
              window.setTimeout(() => setPulseDetails(false), 2200);
            }}
            disabledHint={
              !reason && !branchId
                ? "Choose a reason and branch above"
                : !reason
                  ? "Choose a stock-out reason above"
                  : "Choose which branch to dispatch from"
            }
            catalogTitle="Products"
            catalogSubtitle="Search and click a row to add"
            cartTitle="This dispatch"
            emptyCartHint="Click a product on the left to add it."
            getCurrentQty={(id) => (branchId ? (stockMap[id] ?? 0) : null)}
            error={formErrors.lines}
            cartFooter={
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] font-semibold", reasonTone(reason))}
                    >
                      {reasonLabel(reason)}
                    </Badge>
                    <p className="text-[11px] tabular-nums text-slate-500">
                      <span className="font-semibold text-slate-900">{totals.lineCount}</span> line
                      {totals.lineCount === 1 ? "" : "s"} ·{" "}
                      <span className="font-semibold text-rose-700">−{formatQty(totals.units)}</span>
                    </p>
                  </div>
                  <p className="text-lg font-bold tabular-nums tracking-tight text-slate-900">
                    Rs {formatMoney(totals.value)}
                  </p>
                </div>
                {!detailsReady ? (
                  <p className="text-[10px] text-amber-700">Choose reason and branch above</p>
                ) : overstockLines.length > 0 ? (
                  <p className="text-[10px] text-rose-700">Fix quantities over stock</p>
                ) : lines.length === 0 ? (
                  <p className="text-[10px] text-amber-700">Add at least one product</p>
                ) : Object.keys(formErrors).length > 0 ? (
                  <p className="text-[10px] text-red-600">Fix highlighted fields</p>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 flex-1"
                    onClick={() => setTab("history")}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!canSave}
                    className="h-9 flex-[1.5] bg-rose-600 text-white hover:bg-rose-700"
                  >
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {saving
                      ? "Saving…"
                      : `Save${totals.value > 0 ? ` · Rs ${formatMoney(totals.value)}` : ""}`}
                  </Button>
                </div>
              </div>
            }
          />
        </TabsContent>
      </Tabs>

      {/* Detail dialog */}
      <DetailSheet open={detailOpen} onOpenChange={setDetailOpen} size="md">
        <DetailSheetHeader
          title="Dispatch detail"
          subtitle="Outbound stock movement record"
        />
        <DetailSheetBody>
          {detailRow ? (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-semibold",
                    reasonTone(detailRow.movement_type),
                  )}
                >
                  {reasonLabel(detailRow.movement_type)}
                </Badge>
                <span className="text-xs text-gray-500">
                  {new Date(detailRow.created_at).toLocaleString()}
                </span>
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 space-y-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">
                    Product
                  </p>
                  <p className="font-semibold text-gray-900">
                    {detailRow.product?.name || "—"}
                  </p>
                  {detailRow.product?.sku ? (
                    <p className="text-xs font-mono text-gray-500">
                      {detailRow.product.sku}
                    </p>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">
                      Branch
                    </p>
                    <p className="font-medium text-gray-800">
                      {detailRow.branch?.name || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">
                      User
                    </p>
                    <p className="font-medium text-gray-800">
                      {detailRow.user?.email || "—"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-gray-100 p-2.5 text-center">
                  <p className="text-[10px] uppercase text-gray-400">Removed</p>
                  <p className="text-base font-bold text-rose-600 tabular-nums mt-0.5">
                    −{formatQty(removedQty(detailRow))}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 p-2.5 text-center">
                  <p className="text-[10px] uppercase text-gray-400">Before</p>
                  <p className="text-base font-semibold tabular-nums mt-0.5">
                    {formatQty(Number(detailRow.previous_qty) || 0)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 p-2.5 text-center">
                  <p className="text-[10px] uppercase text-gray-400">After</p>
                  <p className="text-base font-semibold tabular-nums mt-0.5">
                    {formatQty(Number(detailRow.new_qty) || 0)}
                  </p>
                </div>
              </div>

              {lineRate(detailRow) > 0 ? (
                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <span className="text-gray-600">
                    Rate {formatMoney(lineRate(detailRow))}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatMoney(removedQty(detailRow) * lineRate(detailRow))}
                  </span>
                </div>
              ) : null}

              {detailRow.notes ? (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                    Notes
                  </p>
                  <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {detailRow.notes}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={() => setDetailOpen(false)}>
            Close
          </Button>
        </DetailSheetFooter>
      </DetailSheet>

      <ExcelUploadDialog
        open={excelDialogOpen}
        onOpenChange={(open) => {
          setExcelDialogOpen(open);
          if (open) {
            resetUploadCaches();
            if (tab !== "new") setTab("new");
          }
        }}
        title="Load dispatch lines from Excel"
        description={
          <>
            Each row adds a line to the dispatch draft. Products must already exist —
            names are matched case-insensitively. Pick a branch before uploading so
            available stock can be checked.
          </>
        }
        fields={STOCK_OUT_FIELDS}
        nameColumns={[
          "Name",
          "name",
          "Product",
          "product",
          "Product Name",
          "product name",
        ]}
        footnote={
          <>
            Rows with unknown product names are skipped. Empty name rows are ignored.
            Stock is not deducted until you save.
          </>
        }
        onRow={processRow}
        onBatchComplete={({ ok, failed, total: rowTotal }) => {
          if (failed === 0) {
            toast.success(
              `Added ${ok} of ${rowTotal} line${rowTotal === 1 ? "" : "s"} to the draft`,
            );
          } else if (ok === 0) {
            toast.error(`No rows could be added (${failed} failed)`);
          } else {
            toast.warning(`Added ${ok} of ${rowTotal}, ${failed} failed`);
          }
        }}
        onDownloadTemplate={downloadTemplate}
      />
    </div>
  );
}
