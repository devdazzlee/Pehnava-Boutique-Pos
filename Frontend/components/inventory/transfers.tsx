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
          limit: PAGE_SIZE,
        };
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
      } catch (e: any) {
        toast.error(e?.response?.data?.message || "Failed to load transfers");
      } finally {
        setLoading(false);
      }
    },
    [page, filterFrom, filterTo, filterStatus, filterStart, filterEnd],
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

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return transfers;
    return transfers.filter((t) => {
      return (
        (t.product?.name || "").toLowerCase().includes(q) ||
        (t.product?.sku || "").toLowerCase().includes(q) ||
        (t.reference_no || "").toLowerCase().includes(q) ||
        (t.from_branch?.name || "").toLowerCase().includes(q) ||
        (t.to_branch?.name || "").toLowerCase().includes(q) ||
        (t.carrier_name || "").toLowerCase().includes(q)
      );
    });
  }, [transfers, searchQuery]);

  const stats = useMemo(() => {
    const all = transfers;
    return {
      total,
      pending: all.filter((t) => t.status === "PENDING").length,
      dispatched: all.filter((t) => t.status === "DISPATCHED").length,
      received: all.filter((t) => t.status === "RECEIVED").length,
    };
  }, [transfers, total]);

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
      toast.success(`Marked as ${status.toLowerCase()}`);
      fetchTransfers();
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
        onClick={() => openDetail(t)}
      >
        <Eye className="h-3.5 w-3.5 mr-1" />
        {!compact ? "View" : null}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 w-8 p-0"
        onClick={() => printSlip(t)}
        title="Print slip"
      >
        <Printer className="h-3.5 w-3.5" />
      </Button>
      {t.status === "PENDING" ? (
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={statusBusyId === t.id}
          onClick={() => updateStatus(t.id, "DISPATCHED")}
        >
          {statusBusyId === t.id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Dispatch"
          )}
        </Button>
      ) : null}
      {t.status === "DISPATCHED" ? (
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={statusBusyId === t.id}
          onClick={() => updateStatus(t.id, "RECEIVED")}
        >
          {statusBusyId === t.id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Receive"
          )}
        </Button>
      ) : null}
    </div>
  );

  if (loading && transfers.length === 0 && branches.length === 0) {
    return <PageLoader message="Loading transfers..." />;
  }

  return (
    <div className="p-4 md:p-6 space-y-5 text-black min-w-0">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between pb-1 border-b border-gray-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
            <Truck className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              Logistics
            </span>
          </div>
          <h1 className="text-2xl md:text-[1.75rem] font-bold text-gray-900 tracking-tight leading-none">
            Transfers
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Move stock between branches and track dispatch / receive
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <Button size="sm" className="h-9 text-sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New transfer
          </Button>
          <StockOpsActions
            onExportExcel={exportExcel}
            onExportPdf={exportPdf}
            disabled={loading || filteredRows.length === 0}
            exporting={exporting}
          />
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={STOCK_DLG.label}>
                From branch <span className="text-red-500">*</span>
              </Label>
              {branchesLoading ? (
                <StockSelectSkeleton label="Loading branches" />
              ) : (
                <Select
                  value={form.fromBranchId}
                  onValueChange={(v) => {
                    setForm((f) => ({ ...f, fromBranchId: v }));
                    setFormErrors((e) => ({ ...e, fromBranchId: "" }));
                    setTransferLines((prev) =>
                      prev.map((l) => ({
                        ...l,
                        currentQty: stocks[`${l.productId}-${v}`] ?? 0,
                      })),
                    );
                  }}
                >
                  <SelectTrigger
                    className={cn(
                      "h-10 text-sm text-black",
                      formErrors.fromBranchId && "border-red-400",
                    )}
                  >
                    <SelectValue placeholder="Source branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem
                        key={b.id}
                        value={b.id}
                        disabled={b.id === form.toBranchId}
                        className="text-sm"
                      >
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {formErrors.fromBranchId ? (
                <p className="text-xs text-red-500">{formErrors.fromBranchId}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label className={STOCK_DLG.label}>
                To branch <span className="text-red-500">*</span>
              </Label>
              {branchesLoading ? (
                <StockSelectSkeleton label="Loading branches" />
              ) : (
                <Select
                  value={form.toBranchId}
                  onValueChange={(v) => {
                    setForm((f) => ({ ...f, toBranchId: v }));
                    setFormErrors((e) => ({ ...e, toBranchId: "" }));
                  }}
                >
                  <SelectTrigger
                    className={cn(
                      "h-10 text-sm text-black",
                      formErrors.toBranchId && "border-red-400",
                    )}
                  >
                    <SelectValue placeholder="Destination branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem
                        key={b.id}
                        value={b.id}
                        disabled={b.id === form.fromBranchId}
                        className="text-sm"
                      >
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {formErrors.toBranchId ? (
                <p className="text-xs text-red-500">{formErrors.toBranchId}</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={STOCK_DLG.label}>Reason</Label>
              <Select
                value={form.reason}
                onValueChange={(v) => setForm((f) => ({ ...f, reason: v }))}
              >
                <SelectTrigger className="h-10 text-sm text-black">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSFER_REASONS.map((r) => (
                    <SelectItem key={r} value={r} className="text-sm">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={STOCK_DLG.label}>Estimated arrival</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-10 w-full justify-start text-left text-sm font-normal text-black"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-gray-500" />
                    {arrivalDate ? (
                      format(arrivalDate, "dd MMM yyyy")
                    ) : (
                      <span className="text-gray-400">Optional</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={arrivalDate}
                    onSelect={(d) =>
                      setForm((f) => ({
                        ...f,
                        estimatedArrival: d ? d.toISOString() : "",
                      }))
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowMoreDetails((v) => !v)}
            className="text-xs font-medium text-gray-500 hover:text-gray-800"
          >
            {showMoreDetails ? "Hide" : "Show"} carrier & notes
          </button>

          {showMoreDetails ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-3">
              <div className="space-y-1.5">
                <Label className={STOCK_DLG.label}>Carrier</Label>
                <Input
                  placeholder="Courier name"
                  value={form.carrierName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, carrierName: e.target.value }))
                  }
                  className="h-9 text-sm text-black bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className={STOCK_DLG.label}>Vehicle</Label>
                <Input
                  placeholder="Plate number"
                  value={form.vehicleNo}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, vehicleNo: e.target.value }))
                  }
                  className="h-9 text-sm text-black bg-white"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className={STOCK_DLG.label}>Notes</Label>
                <Textarea
                  placeholder="Optional remarks…"
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  className="text-sm text-black min-h-[64px] resize-none bg-white"
                />
              </div>
            </div>
          ) : null}

          <StockProductPicker
            layout="split"
            products={products}
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
            showCurrentQty
            getCurrentQty={getStockQty}
            disabled={!form.fromBranchId}
            disabledHint="Select a source branch above to unlock the catalog"
            error={formErrors.lines}
          />
        </div>
      </StockOperationDialog>

      <InventoryKpiGrid
        columns={4}
        loading={loading && transfers.length === 0}
        items={[
          {
            label: "Total (filtered)",
            value: total.toLocaleString(),
            icon: History,
          },
          {
            label: "Pending (page)",
            value: stats.pending.toLocaleString(),
            icon: Clock,
            tone: "warning",
          },
          {
            label: "In transit (page)",
            value: stats.dispatched.toLocaleString(),
            icon: Truck,
          },
          {
            label: "Received (page)",
            value: stats.received.toLocaleString(),
            icon: CheckCircle2,
            tone: "success",
          },
        ]}
      />

      {/* Status chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { value: "all", label: "All" },
          { value: "PENDING", label: "Pending" },
          { value: "DISPATCHED", label: "In transit" },
          { value: "RECEIVED", label: "Received" },
        ].map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => {
              setFilterStatus(s.value);
              setPage(1);
            }}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filterStatus === s.value
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          <div className="relative md:col-span-2 xl:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search product, ref, branch, carrier…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 text-sm text-black"
            />
          </div>

          <Select
            value={filterFrom}
            onValueChange={(v) => {
              setFilterFrom(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-10 text-sm text-black">
              <SelectValue placeholder="From branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-sm">
                All source branches
              </SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id} className="text-sm">
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filterTo}
            onValueChange={(v) => {
              setFilterTo(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-10 text-sm text-black">
              <SelectValue placeholder="To branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-sm">
                All destinations
              </SelectItem>
              {branches.map((b) => (
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
              className="h-10 text-sm text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={clearFilters}
            >
              <X className="h-4 w-4 mr-1.5" />
              Clear filters
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-gray-500">
          Showing {filteredRows.length.toLocaleString()} of {total.toLocaleString()}{" "}
          records
          {searchQuery.trim() ? " (client search on this page)" : ""}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Transfer history</h2>
          <p className="text-xs text-gray-500">
            Dispatch and receive stock movements between locations
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
                      <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
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
                          <TableRow key={t.id}>
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
                            <TableCell className="py-2.5 text-sm text-gray-700">
                              <span className="inline-flex items-center gap-1.5">
                                {t.from_branch?.name || "—"}
                                <ArrowRight className="h-3 w-3 text-gray-400" />
                                {t.to_branch?.name || "—"}
                              </span>
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-right tabular-nums font-medium">
                              {formatQty(Number(t.quantity) || 0)}
                            </TableCell>
                            <TableCell className="py-2.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-semibold",
                                  statusTone(t.status),
                                )}
                              >
                                {t.status}
                              </Badge>
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
                            {t.status}
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
                disabled={page === 1 || loading}
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-sm text-black"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1 || loading}
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
                disabled={page >= totalPages || loading}
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-sm text-black"
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages || loading}
              >
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
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-semibold",
                    statusTone(detailRow.status),
                  )}
                >
                  {detailRow.status}
                </Badge>
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
    </div>
  );
}
