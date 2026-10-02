"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet";
import {
  Plus,
  Truck,
  Printer,
  ArrowRight,
  CalendarIcon,
  History,
  CheckCircle2,
  Clock,
  Search,
  List,
  LayoutGrid,
  X,
  Eye,
  Loader2,
  Package,
  RefreshCw,
  ArrowRightLeft,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { usePosData } from "@/hooks/use-pos-data";
import { PageLoader } from "@/components/ui/page-loader";
import { InventoryCardGrid } from "@/components/inventory/stock-ops/inventory-card-grid";
import { TransactionRecordCard } from "@/components/inventory/stock-ops/transaction-record-card";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import { StockOpsActions } from "@/components/inventory/stock-ops/stock-ops-actions";
import {
  downloadExcel,
  downloadBrandedPdf,
  formatQty,
  yieldForUi,
} from "@/components/inventory/stock-ops/export-utils";
import { useLogoDataUri } from "@/hooks/use-logo-data-uri";
import { useScrollToTopOnPageChange } from "@/hooks/use-scroll-to-top-on-page-change";
import {
  StockProductPicker,
  type StockLineItem,
} from "@/components/inventory/stock-ops/stock-product-picker";
import {
  StockOperationDialog,
  STOCK_DLG,
  StockSelectSkeleton,
} from "@/components/inventory/stock-ops/stock-operation-dialog";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const TRANSFER_REASONS = [
  "Stock Replenishment",
  "Branch Support",
  "Damage Return",
  "Seasonal Redistribution",
  "Other",
] as const;

const DEFAULT_TRANSFER_FORM = {
  fromBranchId: "",
  toBranchId: "",
  notes: "",
  reason: "Stock Replenishment",
  carrierName: "",
  vehicleNo: "",
  estimatedArrival: "",
};

type TransferStatus = "PENDING" | "DISPATCHED" | "RECEIVED" | "CANCELLED";

interface TransferRow {
  id: string;
  reference_no?: string | null;
  transfer_date: string;
  quantity: string | number;
  status: TransferStatus | string;
  reason?: string | null;
  carrier_name?: string | null;
  vehicle_no?: string | null;
  estimated_arrival?: string | null;
  notes?: string | null;
  product?: { id: string; name: string; sku?: string | null } | null;
  from_branch?: { id: string; name: string } | null;
  to_branch?: { id: string; name: string } | null;
  user?: { email?: string | null } | null;
}

function validateTransferLines(lines: StockLineItem[]): string | null {
  if (lines.length === 0) return "Add at least one product";
  for (const line of lines) {
    const q = Number(line.quantity);
    if (!Number.isFinite(q) || q <= 0) {
      return `Quantity must be greater than 0 for ${line.productName}`;
    }
  }
  return null;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  DISPATCHED: "In transit",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        statusTone(status),
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function statusTone(s: string) {
  switch (s) {
    case "PENDING":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "DISPATCHED":
      return "bg-sky-50 text-sky-800 border-sky-200";
    case "RECEIVED":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "CANCELLED":
      return "bg-rose-50 text-rose-800 border-rose-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

export function Transfers() {
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

  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  useScrollToTopOnPageChange(page);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [statusMeta, setStatusMeta] = useState({
    counts: { PENDING: 0, DISPATCHED: 0, RECEIVED: 0, CANCELLED: 0 } as Record<string, number>,
    all: 0,
    unitsInTransit: 0,
  });
  const [cancelTarget, setCancelTarget] = useState<TransferRow | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);
  const [filterFrom, setFilterFrom] = useState("all");
  const [filterTo, setFilterTo] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterStart, setFilterStart] = useState<Date | undefined>();
  const [filterEnd, setFilterEnd] = useState<Date | undefined>();
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [exporting, setExporting] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [transferLines, setTransferLines] = useState<StockLineItem[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [stocks, setStocks] = useState<Record<string, number>>({});
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [form, setForm] = useState(DEFAULT_TRANSFER_FORM);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<TransferRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchTransfers = useCallback(
    async (pg = page) => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = {
          page: pg,
          limit: pageSize,
        };
        if (debouncedSearch) params.search = debouncedSearch;
        if (filterFrom !== "all") params.fromBranchId = filterFrom;
        if (filterTo !== "all") params.toBranchId = filterTo;
        if (filterStatus !== "all") params.status = filterStatus;
        if (filterStart) params.startDate = filterStart.toISOString();
        if (filterEnd) {
          const e = new Date(filterEnd);
          e.setHours(23, 59, 59, 999);
          params.endDate = e.toISOString();
        }
        const res = await apiClient.get(`${API_BASE}/transfers`, { params });
        setTransfers(res.data?.data || []);
        setTotal(res.data?.meta?.total ?? res.data?.data?.length ?? 0);
        setTotalPages(res.data?.meta?.totalPages ?? 1);
        const meta = res.data?.meta || {};
        setStatusMeta({
          counts: { PENDING: 0, DISPATCHED: 0, RECEIVED: 0, CANCELLED: 0, ...(meta.statusCounts || {}) },
          all: Number(meta.allCount ?? meta.total ?? 0),
          unitsInTransit: Number(meta.unitsInTransit ?? 0),
        });
      } catch (e: any) {
        toast.error(e?.response?.data?.message || "Failed to load transfers");
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, debouncedSearch, filterFrom, filterTo, filterStatus, filterStart, filterEnd],
  );

  const fetchStockLevels = useCallback(async () => {
    try {
      const res = await apiClient.get(`${API_BASE}/stock`, {
        params: { limit: 5000 },
      });
      const map: Record<string, number> = {};
      (res.data?.data || []).forEach((s: any) => {
        const pid = s.product_id || s.product?.id;
        const bid = s.branch_id || s.branch?.id;
        if (pid && bid) map[`${pid}-${bid}`] = Number(s.current_quantity || 0);
      });
      setStocks(map);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchBranches();
    fetchStockLevels();
  }, [fetchProducts, fetchBranches, fetchStockLevels]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  const getStockQty = useCallback(
    (productId: string) => {
      if (!form.fromBranchId) return null;
      return stocks[`${productId}-${form.fromBranchId}`] ?? 0;
    },
    [form.fromBranchId, stocks],
  );

  const resetTransferForm = useCallback(() => {
    setForm(DEFAULT_TRANSFER_FORM);
    setTransferLines([]);
    setFormErrors({});
    setShowMoreDetails(false);
  }, []);

  // Search, status and the rest are applied by the server.
  const filteredRows = transfers;

  const stats = useMemo(
    () => ({
      total,
      pending: statusMeta.counts.PENDING || 0,
      dispatched: statusMeta.counts.DISPATCHED || 0,
      received: statusMeta.counts.RECEIVED || 0,
      cancelled: statusMeta.counts.CANCELLED || 0,
    }),
    [statusMeta, total],
  );

  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) +
    (filterFrom !== "all" ? 1 : 0) +
    (filterTo !== "all" ? 1 : 0) +
    (filterStatus !== "all" ? 1 : 0) +
    (filterStart || filterEnd ? 1 : 0);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    filterFrom !== "all" ||
    filterTo !== "all" ||
    filterStatus !== "all" ||
    !!filterStart ||
    !!filterEnd;

  const clearFilters = () => {
    setSearchQuery("");
    setFilterFrom("all");
    setFilterTo("all");
    setFilterStatus("all");
    setFilterStart(undefined);
    setFilterEnd(undefined);
    setPage(1);
  };

  const detailsReady = Boolean(
    form.fromBranchId &&
      form.toBranchId &&
      form.fromBranchId !== form.toBranchId,
  );

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!form.fromBranchId) errors.fromBranchId = "Source branch is required";
    if (!form.toBranchId) errors.toBranchId = "Destination branch is required";
    if (
      form.fromBranchId &&
      form.toBranchId &&
      form.fromBranchId === form.toBranchId
    ) {
      errors.toBranchId = "Source and destination must be different";
    }

    const lineErr = validateTransferLines(transferLines);
    if (lineErr) errors.lines = lineErr;

    if (!errors.lines && form.fromBranchId) {
      for (const line of transferLines) {
        const qty = Number(line.quantity);
        const available = getStockQty(line.productId) ?? 0;
        if (qty > available) {
          errors.lines = `Insufficient stock for ${line.productName}. Available: ${available}`;
          break;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    setSubmitting(true);
    let ok = 0;
    let fail = 0;
    let lastError: string | null = null;

    try {
      for (const line of transferLines) {
        try {
          await apiClient.post(`${API_BASE}/transfers`, {
            productId: line.productId,
            fromBranchId: form.fromBranchId,
            toBranchId: form.toBranchId,
            quantity: Number(line.quantity),
            notes: form.notes || undefined,
            reason: form.reason || undefined,
            carrierName: form.carrierName || undefined,
            vehicleNo: form.vehicleNo || undefined,
            estimatedArrival: form.estimatedArrival || undefined,
          });
          ok++;
        } catch (e: any) {
          fail++;
          lastError = e?.response?.data?.message || "Failed to create transfer";
        }
      }

      if (ok > 0) {
        toast.success(`Created ${ok} transfer${ok === 1 ? "" : "s"}`);
        setDialogOpen(false);
        resetTransferForm();
        setPage(1);
        fetchTransfers(1);
        fetchStockLevels();
      }
      if (fail > 0) {
        toast.error(
          lastError || `Failed to create ${fail} transfer${fail === 1 ? "" : "s"}`,
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    setStatusBusyId(id);
    try {
      await apiClient.patch(`${API_BASE}/transfers/${id}/status`, { status });
      toast.success(
        status === "RECEIVED"
          ? "Received — stock added to the destination branch"
          : status === "CANCELLED"
            ? "Cancelled — stock returned to the source branch"
            : `Marked as ${(STATUS_LABEL[status] || status).toLowerCase()}`,
      );
      fetchTransfers();
      fetchStockLevels();
      if (detailRow?.id === id) {
        setDetailRow((prev) => (prev ? { ...prev, status } : prev));
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to update status");
    } finally {
      setStatusBusyId(null);
    }
  };

  const openDetail = async (row: TransferRow) => {
    setDetailOpen(true);
    setDetailRow(row);
    setDetailLoading(true);
    try {
      const res = await apiClient.get(`${API_BASE}/transfers/${row.id}`);
      if (res.data?.data) setDetailRow(res.data.data);
    } catch {
      /* keep list row */
    } finally {
      setDetailLoading(false);
    }
  };

  const printSlip = (t: TransferRow) => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>Transfer ${t.reference_no || t.id}</title></head>
      <body style="font-family: system-ui,sans-serif; padding: 32px; color: #111;">
        <h1 style="margin:0 0 4px;font-size:20px;">Pehnawa Boutique — Transfer slip</h1>
        <p style="margin:0 0 24px;color:#666;font-size:13px;">${t.reference_no || t.id}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:13px;margin-bottom:24px;">
          <div>
            <p><strong>From:</strong> ${t.from_branch?.name || "—"}</p>
            <p><strong>To:</strong> ${t.to_branch?.name || "—"}</p>
            <p><strong>Date:</strong> ${new Date(t.transfer_date).toLocaleString()}</p>
          </div>
          <div>
            <p><strong>Status:</strong> ${t.status}</p>
            <p><strong>Reason:</strong> ${t.reason || "—"}</p>
            <p><strong>Carrier:</strong> ${t.carrier_name || "—"} · ${t.vehicle_no || "—"}</p>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f8fafc;text-align:left;">
              <th style="padding:10px;border-bottom:1px solid #e2e8f0;">Product</th>
              <th style="padding:10px;border-bottom:1px solid #e2e8f0;">SKU</th>
              <th style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;">Qty</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px;border-bottom:1px solid #f1f5f9;">${t.product?.name || "—"}</td>
              <td style="padding:10px;border-bottom:1px solid #f1f5f9;font-family:monospace;">${t.product?.sku || "—"}</td>
              <td style="padding:10px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;">${t.quantity}</td>
            </tr>
          </tbody>
        </table>
        ${t.notes ? `<p style="margin-top:20px;font-size:13px;"><strong>Notes:</strong> ${t.notes}</p>` : ""}
        <div style="margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:40px;text-align:center;font-size:11px;color:#64748b;">
          <div style="border-top:1px solid #cbd5e1;padding-top:8px;">Dispatch signature</div>
          <div style="border-top:1px solid #cbd5e1;padding-top:8px;">Receive signature</div>
        </div>
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  const exportExcel = async () => {
    if (filteredRows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      downloadExcel(
        `transfers-${Date.now()}.xlsx`,
        "Transfers",
        [
          "Date",
          "Reference",
          "Product",
          "SKU",
          "From",
          "To",
          "Qty",
          "Status",
          "Reason",
          "Carrier",
          "Vehicle",
        ],
        filteredRows.map((t) => [
          t.transfer_date ? new Date(t.transfer_date).toLocaleString() : "",
          t.reference_no || "",
          t.product?.name || "",
          t.product?.sku || "",
          t.from_branch?.name || "",
          t.to_branch?.name || "",
          Number(t.quantity) || 0,
          t.status || "",
          t.reason || "",
          t.carrier_name || "",
          t.vehicle_no || "",
        ]),
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
      await downloadBrandedPdf({
        filename: `transfers-${Date.now()}.pdf`,
        title: "Stock Transfers",
        subtitle: "Inter-branch inventory movements",
        logoDataUri,
        summary: [
          { label: "Records", value: filteredRows.length.toLocaleString() },
          { label: "Pending", value: String(stats.pending) },
          { label: "In transit", value: String(stats.dispatched) },
        ],
        columns: [
          { header: "Date", width: 1.1 },
          { header: "Product", width: 2 },
          { header: "From", width: 1.3 },
          { header: "To", width: 1.3 },
          { header: "Qty", align: "right", width: 0.7 },
          { header: "Status", width: 1.1 },
        ],
        rows: filteredRows.map((t) => [
          t.transfer_date
            ? new Date(t.transfer_date).toLocaleDateString()
            : "",
          t.product?.name || "",
          t.from_branch?.name || "",
          t.to_branch?.name || "",
          formatQty(Number(t.quantity) || 0),
          t.status || "",
        ]),
      });
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  const arrivalDate = form.estimatedArrival
    ? new Date(form.estimatedArrival)
    : undefined;

  const statusActions = (t: TransferRow, compact = false) => (
    <div className="flex flex-wrap items-center gap-1.5 justify-end">
      <Button
        size="sm"
        variant="ghost"
        className={cn("h-8", compact ? "px-2" : "text-xs")}
        onClick={(e) => {
          e.stopPropagation();
          openDetail(t);
        }}
      >
        <Eye className="h-3.5 w-3.5 mr-1" />
        {!compact ? "View" : null}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 w-8 p-0"
        onClick={(e) => {
          e.stopPropagation();
          printSlip(t);
        }}
        title="Print slip"
      >
        <Printer className="h-3.5 w-3.5" />
      </Button>
      {t.status === "PENDING" ? (
        <Button
          size="sm"
          className="h-8 bg-sky-600 text-xs text-white hover:bg-sky-700"
          disabled={statusBusyId === t.id}
          onClick={(e) => {
            e.stopPropagation();
            updateStatus(t.id, "DISPATCHED");
          }}
        >
          {statusBusyId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (
            <>
              <Truck className="mr-1 h-3.5 w-3.5" />
              Dispatch
            </>
          )}
        </Button>
      ) : null}
      {t.status === "DISPATCHED" ? (
        <Button
          size="sm"
          className="h-8 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
          disabled={statusBusyId === t.id}
          onClick={(e) => {
            e.stopPropagation();
            updateStatus(t.id, "RECEIVED");
          }}
        >
          {statusBusyId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (
            <>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Receive
            </>
          )}
        </Button>
      ) : null}
      {t.status === "PENDING" || t.status === "DISPATCHED" ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          title="Cancel transfer"
          disabled={statusBusyId === t.id}
          onClick={(e) => {
            e.stopPropagation();
            setCancelTarget(t);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );

  if (loading && transfers.length === 0 && branches.length === 0) {
    return <PageLoader message="Loading transfers..." />;
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-5 p-4 text-black md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <Truck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">Transfers</h1>
            <p className="truncate text-sm text-slate-500">Move stock between branches · dispatch, track and receive</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 bg-white shadow-sm"
            onClick={() => {
              fetchTransfers();
              fetchStockLevels();
            }}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <StockOpsActions
            onExportExcel={exportExcel}
            onExportPdf={exportPdf}
            disabled={loading || filteredRows.length === 0}
            exporting={exporting}
          />
          <Button className="h-9 bg-blue-600 text-white shadow-sm hover:bg-blue-700" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New transfer
          </Button>
        </div>
      </div>

      {/* New transfer modal */}
      <StockOperationDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetTransferForm();
        }}
        title="New transfer"
        description="Move products from one branch to another in a single bill."
        icon={<ArrowRightLeft className="h-5 w-5" />}
        iconTone="bg-blue-600 text-white"
        onSubmit={handleSubmit}
        submitting={submitting}
        submitDisabled={!detailsReady || transferLines.length === 0}
        submitLabel={
          transferLines.length > 0
            ? `Create ${transferLines.length} transfer${transferLines.length === 1 ? "" : "s"}`
            : "Create transfer"
        }
        footerHint={
          !detailsReady
            ? "Select from & to branches first"
            : transferLines.length > 0
              ? `${transferLines.length} product${transferLines.length === 1 ? "" : "s"} selected`
              : "Add products from the catalog"
        }
      >
        <div className="space-y-4">
          {/* Route: From → To */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-1 items-end gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              {(
                [
                  {
                    key: "fromBranchId" as const,
                    label: "From",
                    placeholder: "Choose source branch",
                    other: form.toBranchId,
                    tone: "bg-slate-100 text-slate-600",
                  },
                  null,
                  {
                    key: "toBranchId" as const,
                    label: "To",
                    placeholder: "Choose destination branch",
                    other: form.fromBranchId,
                    tone: "bg-blue-100 text-blue-600",
                  },
                ] as const
              ).map((side, i) => {
                if (!side) {
                  return (
                    <div key="swap" className="flex justify-center md:pb-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-full border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                        title="Swap branches"
                        disabled={!form.fromBranchId && !form.toBranchId}
                        onClick={() => {
                          const from = form.toBranchId;
                          const to = form.fromBranchId;
                          setForm((f) => ({ ...f, fromBranchId: from, toBranchId: to }));
                          setFormErrors({});
                          setTransferLines((prev) =>
                            prev.map((l) => ({ ...l, currentQty: from ? stocks[`${l.productId}-${from}`] ?? 0 : null })),
                          );
                        }}
                      >
                        <ArrowRightLeft className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                }
                const value = form[side.key];
                const unitsAt = (branchId: string) =>
                  Object.entries(stocks).reduce(
                    (sum, [k, q]) => (k.endsWith(`-${branchId}`) && q > 0 ? sum + 1 : sum),
                    0,
                  );
                return (
                  <div key={side.key} className="min-w-0 space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <span className={cn("flex h-5 w-5 items-center justify-center rounded", side.tone)}>
                        {i === 0 ? <ArrowRight className="h-3 w-3 -rotate-45" /> : <ArrowRight className="h-3 w-3 rotate-45" />}
                      </span>
                      {side.label} <span className="text-red-500">*</span>
                    </Label>
                    {branchesLoading ? (
                      <StockSelectSkeleton label="Loading branches" />
                    ) : (
                      <Select
                        value={value}
                        onValueChange={(v) => {
                          setForm((f) => ({ ...f, [side.key]: v }));
                          setFormErrors((e) => ({ ...e, [side.key]: "" }));
                          if (side.key === "fromBranchId") {
                            setTransferLines((prev) =>
                              prev.map((l) => ({ ...l, currentQty: stocks[`${l.productId}-${v}`] ?? 0 })),
                            );
                          }
                        }}
                      >
                        <SelectTrigger
                          className={cn(
                            "h-11 text-sm font-medium",
                            formErrors[side.key] ? "border-red-400" : "border-slate-200",
                            value && side.key === "toBranchId" && "border-blue-300 bg-blue-50/40",
                          )}
                        >
                          <SelectValue placeholder={side.placeholder} />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={b.id} disabled={b.id === side.other}>
                              <span className="flex w-full items-center justify-between gap-3">
                                <span>{b.name}</span>
                                <span className="text-[11px] tabular-nums text-slate-400">
                                  {unitsAt(b.id)} in stock
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {formErrors[side.key] ? <p className="text-xs text-red-500">{formErrors[side.key]}</p> : null}
                  </div>
                );
              })}
            </div>
            <div className="flex items-start gap-2 border-t border-blue-100 bg-blue-50/60 px-4 py-2 text-xs text-blue-900">
              <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
              <span>
                Stock leaves <strong>{branches.find((b) => b.id === form.fromBranchId)?.name || "the source"}</strong> when you
                create the transfer and is added to{" "}
                <strong>{branches.find((b) => b.id === form.toBranchId)?.name || "the destination"}</strong> when it&apos;s marked{" "}
                <strong>Received</strong>.
              </span>
            </div>
          </div>

          {/* Details: one row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Reason</Label>
              <Select value={form.reason} onValueChange={(v) => setForm((f) => ({ ...f, reason: v }))}>
                <SelectTrigger className="h-10 bg-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSFER_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Estimated arrival</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-10 w-full justify-start bg-white text-left text-sm font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4 text-slate-500" />
                    {arrivalDate ? format(arrivalDate, "dd MMM yyyy") : <span className="text-slate-400">Optional</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={arrivalDate}
                    onSelect={(d) => setForm((f) => ({ ...f, estimatedArrival: d ? d.toISOString() : "" }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Carrier</Label>
              <Input
                placeholder="Courier / driver (optional)"
                value={form.carrierName}
                onChange={(e) => setForm((f) => ({ ...f, carrierName: e.target.value }))}
                className="h-10 bg-white text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Vehicle</Label>
              <Input
                placeholder="Plate number (optional)"
                value={form.vehicleNo}
                onChange={(e) => setForm((f) => ({ ...f, vehicleNo: e.target.value }))}
                className="h-10 bg-white text-sm"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowMoreDetails((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            <Plus className={cn("h-3.5 w-3.5 transition-transform", showMoreDetails && "rotate-45")} />
            {showMoreDetails ? "Hide notes" : form.notes ? "Edit notes" : "Add notes"}
          </button>
          {showMoreDetails ? (
            <Textarea
              placeholder="Optional remarks for the receiving branch…"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="min-h-[64px] resize-none bg-white text-sm"
            />
          ) : null}

          <StockProductPicker
            layout="split"
            products={(products || []).map((p: any) => ({
              id: p.id,
              name: p.name,
              sku: p.sku ?? null,
              barcode: p.barcode ?? p.code ?? null,
              category_id: p.categoryId ?? null,
              categoryId: p.categoryId ?? null,
              price: Number(p.price) || null,
              cost: Number(p.purchase_rate) || null,
            }))}
            categories={categories}
            loading={productsLoading}
            lines={transferLines}
            onLinesChange={(next) => {
              setTransferLines(
                next.map((l) => ({
                  ...l,
                  currentQty: getStockQty(l.productId),
                })),
              );
              setFormErrors((e) => ({ ...e, lines: "" }));
            }}
            quantityLabel="Qty to transfer"
            previewMode="remove"
            showCurrentQty
            getCurrentQty={getStockQty}
            disabled={!form.fromBranchId}
            disabledHint="Choose the branch you're sending from to see its stock"
            error={formErrors.lines}
          />
        </div>
      </StockOperationDialog>

      {/* Summary cards (status cards filter the list) */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {[
          {
            key: "PENDING",
            label: "Pending",
            value: stats.pending,
            hint: "Created, not yet dispatched",
            icon: Clock,
            tone: "bg-amber-50 text-amber-600",
            accent: "bg-amber-500",
          },
          {
            key: "DISPATCHED",
            label: "In transit",
            value: stats.dispatched,
            hint: `${formatQty(statusMeta.unitsInTransit)} units on the way`,
            icon: Truck,
            tone: "bg-sky-50 text-sky-600",
            accent: "bg-sky-500",
          },
          {
            key: "RECEIVED",
            label: "Received",
            value: stats.received,
            hint: "Stock added at destination",
            icon: CheckCircle2,
            tone: "bg-emerald-50 text-emerald-600",
            accent: "bg-emerald-500",
          },
          {
            key: "all",
            label: "All transfers",
            value: statusMeta.all,
            hint: stats.cancelled ? `${stats.cancelled} cancelled` : "Matching your filters",
            icon: History,
            tone: "bg-slate-100 text-slate-600",
            accent: "bg-slate-400",
          },
        ].map((card) => {
          const Icon = card.icon;
          const selected = filterStatus === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => {
                setFilterStatus(selected && card.key !== "all" ? "all" : card.key);
                setPage(1);
              }}
              className={cn(
                "relative min-w-0 overflow-hidden rounded-xl border bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-5",
                selected ? "border-blue-400 ring-2 ring-blue-500/30" : "border-slate-200",
              )}
            >
              <span className={cn("absolute inset-x-0 top-0 h-1", card.accent)} aria-hidden />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-500">{card.label}</p>
                  {loading && transfers.length === 0 ? (
                    <div className="mt-2 h-7 w-14 animate-pulse rounded bg-slate-100" />
                  ) : (
                    <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{card.value.toLocaleString()}</p>
                  )}
                  <p className="mt-1 truncate text-xs text-slate-500">{selected && card.key !== "all" ? "Filtering · click to clear" : card.hint}</p>
                </div>
                <div className={cn("hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:flex", card.tone)}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </button>
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
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">{activeFilterCount} active</span>
                ) : null}
              </p>
              <p className="truncate text-xs text-slate-500">
                {total.toLocaleString()} transfer{total === 1 ? "" : "s"} match
              </p>
            </div>
          </div>
          {loading && transfers.length > 0 ? (
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
            <span className="mr-1 text-xs font-semibold text-indigo-900/80">Status</span>
            {[
              { value: "all", label: "All", count: statusMeta.all },
              { value: "PENDING", label: "Pending", count: stats.pending },
              { value: "DISPATCHED", label: "In transit", count: stats.dispatched },
              { value: "RECEIVED", label: "Received", count: stats.received },
              { value: "CANCELLED", label: "Cancelled", count: stats.cancelled },
            ].map((chip) => {
              const active = filterStatus === chip.value;
              return (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => {
                    setFilterStatus(chip.value);
                    setPage(1);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                      : "border-indigo-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700",
                  )}
                >
                  {chip.label}
                  <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")}>
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-x-3 gap-y-4 border-t border-dashed border-indigo-200 pt-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-1.5 md:col-span-2 xl:col-span-1">
              <Label className="text-xs font-semibold text-indigo-900/80">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Product, ref, branch, carrier…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 border-indigo-200/80 bg-white pl-9 text-sm shadow-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-indigo-900/80">From</Label>
              <Select
                value={filterFrom}
                onValueChange={(v) => {
                  setFilterFrom(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 border-indigo-200/80 bg-white text-sm shadow-sm">
                  <SelectValue placeholder="Any source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any source</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-indigo-900/80">To</Label>
              <Select
                value={filterTo}
                onValueChange={(v) => {
                  setFilterTo(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 border-indigo-200/80 bg-white text-sm shadow-sm">
                  <SelectValue placeholder="Any destination" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any destination</SelectItem>
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
                { label: "From date", value: filterStart, set: setFilterStart },
                { label: "To date", value: filterEnd, set: setFilterEnd },
              ] as const
            ).map((f) => (
              <div key={f.label} className="space-y-1.5">
                <Label className="text-xs font-semibold text-indigo-900/80">{f.label}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-10 w-full justify-start border-indigo-200/80 bg-white text-left text-sm font-normal shadow-sm">
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
              <ArrowRightLeft className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-slate-900">Transfer history</h2>
              <p className="truncate text-xs text-slate-500">Dispatch sends goods · Receive adds them at the destination</p>
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
        <CardContent className="p-0 relative">
          {loading && transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <p className="text-sm text-gray-500 mt-3">Loading transfers...</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <Package className="h-8 w-8 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-900">No transfers found</p>
              <p className="text-xs text-gray-500 mt-1">
                {hasActiveFilters
                  ? "Try clearing filters or adjusting your search."
                  : "Create a transfer to move stock between branches."}
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
                <Button size="sm" className="mt-4 h-8 bg-blue-600 text-white hover:bg-blue-700" onClick={() => setDialogOpen(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> New transfer
                </Button>
              )}
            </div>
          ) : (
            <>
              {loading ? (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/70">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                </div>
              ) : null}

              {viewMode === "table" ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 hover:bg-slate-50 [&>th]:h-10 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-slate-500">
                        <TableHead className="text-xs font-semibold text-gray-600 pl-3">
                          Date
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">
                          Product
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">
                          Route
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right">
                          Qty
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">
                          Status
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right pr-3">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((t) => {
                        const ts = new Date(t.transfer_date);
                        return (
                          <TableRow
                            key={t.id}
                            className="cursor-pointer border-slate-100 hover:bg-slate-50/70"
                            onClick={() => openDetail(t)}
                          >
                            <TableCell className="py-2.5 pl-3 whitespace-nowrap text-sm text-gray-700">
                              <div>{ts.toLocaleDateString()}</div>
                              <div className="text-[11px] text-gray-400">
                                {ts.toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5">
                              <p className="text-sm font-medium text-gray-900 line-clamp-1">
                                {t.product?.name || "—"}
                              </p>
                              <p className="text-[11px] font-mono text-gray-400">
                                {t.reference_no || t.product?.sku || "—"}
                              </p>
                            </TableCell>
                            <TableCell className="py-2.5 text-sm">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">{t.from_branch?.name || "—"}</span>
                                <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
                                <span className="rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-800">{t.to_branch?.name || "—"}</span>
                              </span>
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-right tabular-nums font-medium">
                              {formatQty(Number(t.quantity) || 0)}
                            </TableCell>
                            <TableCell className="py-2.5">
                              <StatusPill status={t.status} />
                            </TableCell>
                            <TableCell className="py-2.5 pr-3">
                              {statusActions(t)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <InventoryCardGrid empty={false} loading={false}>
                  {filteredRows.map((t) => {
                    const ts = new Date(t.transfer_date);
                    return (
                      <TransactionRecordCard
                        key={t.id}
                        date={`${ts.toLocaleDateString(undefined, {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })} · ${ts.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`}
                        title={t.product?.name || "Transfer"}
                        subtitle={
                          t.reference_no
                            ? `Ref ${t.reference_no}`
                            : t.product?.sku
                              ? `SKU ${t.product.sku}`
                              : undefined
                        }
                        amount={formatQty(Number(t.quantity) || 0)}
                        amountLabel="Qty"
                        meta={
                          <span className="inline-flex items-center gap-1.5">
                            {t.from_branch?.name || "—"}
                            <ArrowRight className="h-3 w-3" />
                            {t.to_branch?.name || "—"}
                          </span>
                        }
                        badge={
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                              statusTone(t.status),
                            )}
                          >
                            {STATUS_LABEL[t.status] || t.status}
                          </span>
                        }
                        highlights={[
                          { label: "Reason", value: t.reason || "—" },
                          { label: "Carrier", value: t.carrier_name || "—" },
                          { label: "Vehicle", value: t.vehicle_no || "—" },
                        ]}
                        actions={statusActions(t, true)}
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
                  {((page - 1) * pageSize + 1).toLocaleString()}–{Math.min(page * pageSize, total).toLocaleString()}
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
              <Button variant="outline" size="sm" className="h-8 bg-white px-2.5" onClick={() => setPage(1)} disabled={page === 1 || loading}>
                First
              </Button>
              <Button variant="outline" size="sm" className="h-8 bg-white px-2.5" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1 || loading}>
                Prev
              </Button>
              <span className="px-2 text-xs tabular-nums">
                Page {page} of {Math.max(1, totalPages)}
              </span>
              <Button variant="outline" size="sm" className="h-8 bg-white px-2.5" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages || loading}>
                Next
              </Button>
              <Button variant="outline" size="sm" className="h-8 bg-white px-2.5" onClick={() => setPage(totalPages)} disabled={page >= totalPages || loading}>
                Last
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {/* Detail dialog */}
      <DetailSheet open={detailOpen} onOpenChange={setDetailOpen} size="md">
        <DetailSheetHeader
          title="Transfer detail"
          subtitle={detailRow?.reference_no || "Movement record"}
        />
        <DetailSheetBody>
          {detailLoading && !detailRow ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : detailRow ? (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={detailRow.status} />
                <span className="text-xs text-gray-500">
                  {new Date(detailRow.transfer_date).toLocaleString()}
                </span>
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 space-y-2">
                <p className="font-semibold text-gray-900">
                  {detailRow.product?.name || "—"}
                </p>
                {detailRow.product?.sku ? (
                  <p className="text-xs font-mono text-gray-500">
                    {detailRow.product.sku}
                  </p>
                ) : null}
                <div className="flex items-center gap-2 text-sm text-gray-700 pt-1">
                  <span>{detailRow.from_branch?.name || "—"}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                  <span>{detailRow.to_branch?.name || "—"}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-gray-100 p-2.5">
                  <p className="text-[10px] uppercase text-gray-400">Qty</p>
                  <p className="text-base font-bold tabular-nums mt-0.5">
                    {formatQty(Number(detailRow.quantity) || 0)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 p-2.5">
                  <p className="text-[10px] uppercase text-gray-400">Reason</p>
                  <p className="text-xs font-medium mt-1 line-clamp-2">
                    {detailRow.reason || "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 p-2.5">
                  <p className="text-[10px] uppercase text-gray-400">Carrier</p>
                  <p className="text-xs font-medium mt-1 line-clamp-2">
                    {detailRow.carrier_name || "—"}
                  </p>
                </div>
              </div>

              {detailRow.notes ? (
                <p className="text-xs text-gray-600 leading-relaxed">
                  {detailRow.notes}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-1">
                {statusActions(detailRow)}
              </div>
            </div>
          ) : null}
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={() => setDetailOpen(false)}>
            Close
          </Button>
        </DetailSheetFooter>
      </DetailSheet>

      {/* Cancel confirmation */}
      {cancelTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <X className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900">Cancel this transfer?</h3>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">{formatQty(Number(cancelTarget.quantity) || 0)}</span> ×{" "}
                  {cancelTarget.product?.name || "product"} will be returned to{" "}
                  <span className="font-medium text-slate-900">{cancelTarget.from_branch?.name || "the source branch"}</span>. This can&apos;t be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={statusBusyId === cancelTarget.id}>
                Keep transfer
              </Button>
              <Button
                className="bg-rose-600 text-white hover:bg-rose-700"
                disabled={statusBusyId === cancelTarget.id}
                onClick={async () => {
                  const target = cancelTarget;
                  await updateStatus(target.id, "CANCELLED");
                  setCancelTarget(null);
                }}
              >
                {statusBusyId === cancelTarget.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Cancel transfer
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}