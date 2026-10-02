"use client";

import React, { useState, useEffect, useCallback, useMemo, type ComponentType } from "react";
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
  Minus,
  ClipboardCheck,
  CalendarIcon,
  TrendingDown,
  TrendingUp,
  Search,
  X,
  Loader2,
  Package,
  MapPin,
  Scale,
  RefreshCw,
  SlidersHorizontal,
  ListChecks,
  ArrowRight,
  Wallet,
  Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { usePosData } from "@/hooks/use-pos-data";
import { PageLoader } from "@/components/ui/page-loader";
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
  StockSelectSkeleton,
} from "@/components/inventory/stock-ops/stock-operation-dialog";
import { cn } from "@/lib/utils";

type AdjustmentType = "RECONCILIATION" | "ADDITION" | "SUBTRACTION";
type AdjustmentCategory =
  | "CORRECTION"
  | "DAMAGE"
  | "EXPIRED"
  | "THEFT"
  | "RETURN_TO_SUPPLIER"
  | "ADMINISTRATIVE";

const TYPES: {
  value: AdjustmentType;
  label: string;
  short: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  tile: string;
  pill: string;
}[] = [
  {
    value: "RECONCILIATION",
    label: "Stock count",
    short: "Count",
    hint: "Enter what you physically counted — the system works out the difference",
    icon: ClipboardCheck,
    tile: "bg-sky-600 text-white",
    pill: "bg-sky-50 text-sky-700 ring-sky-600/20",
  },
  {
    value: "ADDITION",
    label: "Add stock",
    short: "Added",
    hint: "Increase on-hand, e.g. found items or a miscount",
    icon: Plus,
    tile: "bg-emerald-600 text-white",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  {
    value: "SUBTRACTION",
    label: "Remove stock",
    short: "Removed",
    hint: "Decrease on-hand, e.g. damaged, expired or missing",
    icon: Minus,
    tile: "bg-rose-600 text-white",
    pill: "bg-rose-50 text-rose-700 ring-rose-600/20",
  },
];

const CATEGORIES: { value: AdjustmentCategory; label: string; for: AdjustmentType[] }[] = [
  { value: "CORRECTION", label: "Routine correction", for: ["RECONCILIATION", "ADDITION", "SUBTRACTION"] },
  { value: "DAMAGE", label: "Damaged / broken", for: ["SUBTRACTION", "RECONCILIATION"] },
  { value: "EXPIRED", label: "Expired", for: ["SUBTRACTION", "RECONCILIATION"] },
  { value: "THEFT", label: "Missing / theft", for: ["SUBTRACTION", "RECONCILIATION"] },
  { value: "RETURN_TO_SUPPLIER", label: "Returned to supplier", for: ["SUBTRACTION"] },
  { value: "ADMINISTRATIVE", label: "Administrative", for: ["RECONCILIATION", "ADDITION", "SUBTRACTION"] },
];

const DEFAULT_CATEGORY: Record<AdjustmentType, AdjustmentCategory> = {
  RECONCILIATION: "CORRECTION",
  ADDITION: "CORRECTION",
  SUBTRACTION: "DAMAGE",
};

const DEFAULT_FORM = {
  branchId: "",
  adjustmentType: "RECONCILIATION" as AdjustmentType,
  adjustmentCategory: "CORRECTION" as AdjustmentCategory,
  referenceNo: "",
  reason: "",
};

interface AdjustmentRow {
  id: string;
  adjustment_date: string;
  adjustment_type: AdjustmentType | string;
  adjustment_category: AdjustmentCategory | string;
  system_quantity: string | number;
  physical_count?: string | number | null;
  change_quantity?: string | number | null;
  difference: string | number;
  reason?: string | null;
  reference_no?: string | null;
  product?: { id: string; name: string; sku?: string | null; purchase_rate?: string | number | null } | null;
  branch?: { id: string; name: string } | null;
  user?: { email?: string | null } | null;
}

type Summary = {
  count: number;
  allCount: number;
  typeCounts: Record<string, number>;
  unitsGained: number;
  unitsLost: number;
  netUnits: number;
  valueGained: number;
  valueLost: number;
  netValue: number;
};

const EMPTY_SUMMARY: Summary = {
  count: 0,
  allCount: 0,
  typeCounts: { RECONCILIATION: 0, ADDITION: 0, SUBTRACTION: 0 },
  unitsGained: 0,
  unitsLost: 0,
  netUnits: 0,
  valueGained: 0,
  valueLost: 0,
  netValue: 0,
};

const typeMeta = (t: string) => TYPES.find((x) => x.value === t) || TYPES[0];
const categoryLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label || c;
const money = (n: number) =>
  `Rs ${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const signedQty = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatQty(Math.abs(n))}`;
const signedMoney = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(n)}`;

type BranchStockRow = { qty: number; cost: number; name: string; sku: string };

export function StockAdjustment() {
  const logoDataUri = useLogoDataUri();
  const { products, categories, branches, productsLoading, branchesLoading, fetchProducts, fetchBranches } = usePosData();

  // ---------------- history ----------------
  const [rows, setRows] = useState<AdjustmentRow[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  useScrollToTopOnPageChange(page);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStart, setFilterStart] = useState<Date | undefined>();
  const [filterEnd, setFilterEnd] = useState<Date | undefined>();
  const [exporting, setExporting] = useState(false);
  const [detailRow, setDetailRow] = useState<AdjustmentRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchAdjustments = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: pageSize };
      if (filterBranch !== "all") params.branchId = filterBranch;
      if (filterType !== "all") params.adjustmentType = filterType;
      if (filterCategory !== "all") params.adjustmentCategory = filterCategory;
      if (debouncedSearch) params.search = debouncedSearch;
      if (filterStart) params.startDate = filterStart.toISOString();
      if (filterEnd) {
        const e = new Date(filterEnd);
        e.setHours(23, 59, 59, 999);
        params.endDate = e.toISOString();
      }
      const res = await apiClient.get(`${API_BASE}/stock-adjustments`, { params });
      setRows(res.data?.data || []);
      setTotal(res.data?.meta?.total ?? 0);
      setTotalPages(res.data?.meta?.totalPages ?? 1);
      setSummary({ ...EMPTY_SUMMARY, ...(res.data?.meta?.summary || {}) });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to load adjustment history");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterBranch, filterType, filterCategory, debouncedSearch, filterStart, filterEnd]);

  useEffect(() => {
    fetchAdjustments();
  }, [fetchAdjustments]);

  useEffect(() => {
    fetchProducts();
    fetchBranches();
  }, [fetchProducts, fetchBranches]);

  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) +
    (filterBranch !== "all" ? 1 : 0) +
    (filterType !== "all" ? 1 : 0) +
    (filterCategory !== "all" ? 1 : 0) +
    (filterStart || filterEnd ? 1 : 0);

  const clearFilters = () => {
    setSearchQuery("");
    setFilterBranch("all");
    setFilterType("all");
    setFilterCategory("all");
    setFilterStart(undefined);
    setFilterEnd(undefined);
    setPage(1);
  };

  type DatePreset = "all" | "today" | "7d" | "month";
  const applyDatePreset = (preset: DatePreset) => {
    const now = new Date();
    const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (preset === "all") {
      setFilterStart(undefined);
      setFilterEnd(undefined);
    } else if (preset === "today") {
      setFilterStart(day(now));
      setFilterEnd(day(now));
    } else if (preset === "7d") {
      const from = day(now);
      from.setDate(from.getDate() - 6);
      setFilterStart(from);
      setFilterEnd(day(now));
    } else {
      setFilterStart(new Date(now.getFullYear(), now.getMonth(), 1));
      setFilterEnd(day(now));
    }
    setPage(1);
  };
  const activeDatePreset: DatePreset | null = (() => {
    if (!filterStart && !filterEnd) return "all";
    if (!filterStart || !filterEnd) return null;
    const now = new Date();
    const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    if (!same(filterEnd, now)) return null;
    if (same(filterStart, now)) return "today";
    const seven = new Date(now);
    seven.setDate(seven.getDate() - 6);
    if (same(filterStart, seven)) return "7d";
    if (same(filterStart, new Date(now.getFullYear(), now.getMonth(), 1))) return "month";
    return null;
  })();

  // ---------------- new adjustment ----------------
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [lines, setLines] = useState<StockLineItem[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [branchStock, setBranchStock] = useState<Record<string, BranchStockRow>>({});
  const [branchStockLoading, setBranchStockLoading] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Live on-hand (and cost) for the chosen branch — the server re-reads it on save.
  useEffect(() => {
    if (!form.branchId) {
      setBranchStock({});
      return;
    }
    let cancelled = false;
    setBranchStockLoading(true);
    apiClient
      .get(`${API_BASE}/stock`, { params: { branchId: form.branchId, page: 1, limit: 10000 } })
      .then((res) => {
        if (cancelled) return;
        const map: Record<string, BranchStockRow> = {};
        for (const s of res.data?.data || []) {
          const pid = s.product?.id || s.product_id;
          if (!pid) continue;
          map[pid] = {
            qty: Number(s.current_quantity) || 0,
            cost: Number(s.product?.purchase_rate) || 0,
            name: s.product?.name || "",
            sku: s.product?.sku || s.product?.code || "",
          };
        }
        setBranchStock(map);
      })
      .catch(() => {
        if (!cancelled) toast.error("Couldn't load stock for this branch");
      })
      .finally(() => {
        if (!cancelled) setBranchStockLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.branchId]);

  const onHand = useCallback(
    (productId: string) => (form.branchId ? branchStock[productId]?.qty ?? 0 : null),
    [form.branchId, branchStock],
  );

  const costMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of products as any[]) if (p?.id) map[p.id] = Number(p.purchase_rate) || 0;
    for (const [id, row] of Object.entries(branchStock)) if (row.cost) map[id] = row.cost;
    return map;
  }, [products, branchStock]);

  const lineVariance = useCallback(
    (line: StockLineItem) => {
      const qty = Number(line.quantity);
      if (line.quantity === "" || !Number.isFinite(qty)) return null;
      const system = onHand(line.productId) ?? 0;
      if (form.adjustmentType === "RECONCILIATION") return qty - system;
      if (form.adjustmentType === "ADDITION") return Math.abs(qty);
      return -Math.abs(qty);
    },
    [form.adjustmentType, onHand],
  );

  const preview = useMemo(() => {
    let gained = 0;
    let lost = 0;
    let value = 0;
    let changed = 0;
    let unchanged = 0;
    let negative = 0;
    for (const line of lines) {
      const v = lineVariance(line);
      if (v === null) continue;
      if (v === 0) {
        unchanged += 1;
        continue;
      }
      changed += 1;
      if (v > 0) gained += v;
      else lost += -v;
      value += v * (costMap[line.productId] || 0);
      const after = (onHand(line.productId) ?? 0) + v;
      if (after < 0) negative += 1;
    }
    return { gained, lost, net: gained - lost, value, changed, unchanged, negative };
  }, [lines, lineVariance, costMap, onHand]);

  const openNew = (type: AdjustmentType = "RECONCILIATION") => {
    setForm({ ...DEFAULT_FORM, adjustmentType: type, adjustmentCategory: DEFAULT_CATEGORY[type], branchId: filterBranch !== "all" ? filterBranch : "" });
    setLines([]);
    setFormErrors({});
    setShowNotes(false);
    setDialogOpen(true);
  };

  const setType = (type: AdjustmentType) => {
    setForm((f) => ({
      ...f,
      adjustmentType: type,
      adjustmentCategory: CATEGORIES.find((c) => c.value === f.adjustmentCategory)?.for.includes(type)
        ? f.adjustmentCategory
        : DEFAULT_CATEGORY[type],
    }));
    // Quantities mean different things per type (counted vs. change) — reset them.
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        quantity: type === "RECONCILIATION" ? String(onHand(l.productId) ?? 0) : 1,
      })),
    );
    setFormErrors({});
  };

  const loadAllForCount = () => {
    const entries = Object.entries(branchStock);
    if (!entries.length) {
      toast.error("This branch has no stock records to count");
      return;
    }
    const existing = new Set(lines.map((l) => l.productId));
    const added: StockLineItem[] = entries
      .filter(([id]) => !existing.has(id))
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([id, row]) => ({
        productId: id,
        productName: row.name || "Product",
        sku: row.sku || undefined,
        quantity: String(row.qty),
        unitCost: "",
        currentQty: row.qty,
      }));
    setLines((prev) => [...prev, ...added]);
    toast.success(`Added ${added.length} item${added.length === 1 ? "" : "s"} — change only what you counted differently`);
  };

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!form.branchId) errors.branchId = "Choose a branch";
    if (lines.length === 0) errors.lines = "Add at least one product";
    for (const line of lines) {
      const qty = Number(line.quantity);
      if (line.quantity === "" || !Number.isFinite(qty)) {
        errors.lines = `Enter a quantity for ${line.productName}`;
        break;
      }
      if (qty < 0) {
        errors.lines = `Quantity can't be negative for ${line.productName}`;
        break;
      }
      if (form.adjustmentType !== "RECONCILIATION" && qty === 0) {
        errors.lines = `Quantity must be more than 0 for ${line.productName}`;
        break;
      }
      if (form.adjustmentType === "SUBTRACTION" && qty > (onHand(line.productId) ?? 0)) {
        errors.lines = `${line.productName}: only ${formatQty(onHand(line.productId) ?? 0)} in stock`;
        break;
      }
    }
    // Counts: lines that match the system have nothing to save.
    const toSave =
      form.adjustmentType === "RECONCILIATION" ? lines.filter((l) => lineVariance(l) !== 0) : lines;
    if (!errors.lines && form.adjustmentType === "RECONCILIATION" && toSave.length === 0 && lines.length > 0) {
      errors.lines = "Every counted item matches the system — there's nothing to adjust";
    }
    setFormErrors(errors);
    if (Object.keys(errors).length) {
      toast.error(Object.values(errors)[0]);
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiClient.post(`${API_BASE}/stock-adjustments/batch`, {
        branchId: form.branchId,
        adjustmentType: form.adjustmentType,
        adjustmentCategory: form.adjustmentCategory,
        reason: form.reason.trim() || undefined,
        referenceNo: form.referenceNo.trim() || undefined,
        lines: toSave.map((l) =>
          form.adjustmentType === "RECONCILIATION"
            ? { productId: l.productId, physicalCount: Number(l.quantity) }
            : { productId: l.productId, changeQuantity: Math.abs(Number(l.quantity)) },
        ),
      });
      const ref = res.data?.data?.referenceNo;
      const skipped = lines.length - toSave.length;
      toast.success(
        `Saved ${toSave.length} adjustment${toSave.length === 1 ? "" : "s"}${ref ? ` · ${ref}` : ""}`,
        skipped > 0 ? { description: `${skipped} counted item${skipped === 1 ? "" : "s"} matched the system and were skipped.` } : undefined,
      );
      setDialogOpen(false);
      setLines([]);
      setForm(DEFAULT_FORM);
      setPage(1);
      fetchAdjustments();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Couldn't save the adjustment — nothing was changed");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------- export ----------------
  const exportExcel = async () => {
    if (!rows.length) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      downloadExcel(
        `stock-adjustments-${format(new Date(), "yyyy-MM-dd")}.xlsx`,
        "Adjustments",
        ["Date", "Reference", "Product", "SKU", "Branch", "Type", "Reason", "System qty", "New qty", "Variance", "Value impact", "Note", "By"],
        rows.map((a) => {
          const diff = Number(a.difference) || 0;
          const sys = Number(a.system_quantity) || 0;
          return [
            a.adjustment_date ? new Date(a.adjustment_date).toLocaleString() : "",
            a.reference_no || "",
            a.product?.name || "",
            a.product?.sku || "",
            a.branch?.name || "",
            typeMeta(a.adjustment_type).label,
            categoryLabel(a.adjustment_category),
            sys,
            sys + diff,
            diff,
            diff * (Number(a.product?.purchase_rate) || 0),
            a.reason || "",
            a.user?.email || "",
          ];
        }),
      );
      toast.success("Excel downloaded");
    } catch {
      toast.error("Failed to export Excel");
    } finally {
      setExporting(false);
    }
  };

  const exportPdf = async () => {
    if (!rows.length) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      await downloadBrandedPdf({
        filename: `stock-adjustments-${format(new Date(), "yyyy-MM-dd")}.pdf`,
        title: "Stock Adjustments",
        subtitle: "Stock counts & inventory corrections",
        logoDataUri,
        summary: [
          { label: "Adjustments", value: summary.count.toLocaleString() },
          { label: "Units gained", value: `+${formatQty(summary.unitsGained)}` },
          { label: "Units lost", value: `-${formatQty(summary.unitsLost)}` },
          { label: "Net value", value: signedMoney(summary.netValue) },
        ],
        columns: [
          { header: "Date", width: 1 },
          { header: "Product", width: 2 },
          { header: "Branch", width: 1.2 },
          { header: "Type", width: 1 },
          { header: "Reason", width: 1.2 },
          { header: "Variance", align: "right", width: 0.8 },
          { header: "Value", align: "right", width: 1 },
        ],
        rows: rows.map((a) => {
          const diff = Number(a.difference) || 0;
          return [
            a.adjustment_date ? new Date(a.adjustment_date).toLocaleDateString() : "",
            a.product?.name || "",
            a.branch?.name || "",
            typeMeta(a.adjustment_type).label,
            categoryLabel(a.adjustment_category),
            signedQty(diff),
            signedMoney(diff * (Number(a.product?.purchase_rate) || 0)),
          ];
        }),
      });
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  if (loading && rows.length === 0 && branches.length === 0) {
    return <PageLoader message="Loading stock adjustments..." />;
  }

  const currentType = typeMeta(form.adjustmentType);
  const CurrentIcon = currentType.icon;
  const availableCategories = CATEGORIES.filter((c) => c.for.includes(form.adjustmentType));
  const branchName = branches.find((b) => b.id === form.branchId)?.name;

  const pickerProducts = (products as any[]).map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku ?? null,
    barcode: p.barcode ?? p.code ?? null,
    category_id: p.categoryId ?? null,
    categoryId: p.categoryId ?? null,
    price: Number(p.price) || null,
    cost: Number(p.purchase_rate) || null,
  }));

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-5 p-4 text-black md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
            <Scale className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">Stock Adjustments</h1>
            <p className="truncate text-sm text-slate-500">Count stock, correct quantities and keep an audit trail of every change</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9 bg-white shadow-sm" onClick={fetchAdjustments} disabled={loading} title="Refresh">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <StockOpsActions onExportExcel={exportExcel} onExportPdf={exportPdf} disabled={loading || rows.length === 0} exporting={exporting} />
          <Button variant="outline" className="h-9 bg-white shadow-sm" onClick={() => openNew("SUBTRACTION")}>
            <Minus className="mr-2 h-4 w-4 text-rose-600" />
            Remove
          </Button>
          <Button variant="outline" className="h-9 bg-white shadow-sm" onClick={() => openNew("ADDITION")}>
            <Plus className="mr-2 h-4 w-4 text-emerald-600" />
            Add
          </Button>
          <Button className="h-9 bg-sky-600 text-white shadow-sm hover:bg-sky-700" onClick={() => openNew("RECONCILIATION")}>
            <ClipboardCheck className="mr-2 h-4 w-4" />
            Start stock count
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {[
          {
            label: "Adjustments",
            value: summary.count.toLocaleString(),
            hint: `${summary.typeCounts.RECONCILIATION || 0} counts · ${summary.typeCounts.ADDITION || 0} adds · ${summary.typeCounts.SUBTRACTION || 0} removals`,
            icon: ListChecks,
            tone: "bg-slate-100 text-slate-600",
            accent: "bg-slate-400",
            valueClass: "text-slate-900",
          },
          {
            label: "Units gained",
            value: `+${formatQty(summary.unitsGained)}`,
            hint: `Worth ${money(summary.valueGained)} at cost`,
            icon: TrendingUp,
            tone: "bg-emerald-50 text-emerald-600",
            accent: "bg-emerald-500",
            valueClass: "text-emerald-700",
          },
          {
            label: "Units lost (shrinkage)",
            value: `−${formatQty(summary.unitsLost)}`,
            hint: `Worth ${money(summary.valueLost)} at cost`,
            icon: TrendingDown,
            tone: "bg-rose-50 text-rose-600",
            accent: "bg-rose-500",
            valueClass: "text-rose-700",
          },
          {
            label: "Net value impact",
            value: signedMoney(summary.netValue),
            hint: `Net ${signedQty(summary.netUnits)} units`,
            icon: Wallet,
            tone: summary.netValue < 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600",
            accent: summary.netValue < 0 ? "bg-rose-500" : "bg-emerald-500",
            valueClass: summary.netValue < 0 ? "text-rose-700" : summary.netValue > 0 ? "text-emerald-700" : "text-slate-900",
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <span className={cn("absolute inset-x-0 top-0 h-1", card.accent)} aria-hidden />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-500">{card.label}</p>
                  {loading && rows.length === 0 ? (
                    <div className="mt-2 h-7 w-20 animate-pulse rounded bg-slate-100" />
                  ) : (
                    <p className={cn("mt-2 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl", card.valueClass)}>{card.value}</p>
                  )}
                  <p className="mt-1 truncate text-xs text-slate-500" title={card.hint}>
                    {card.hint}
                  </p>
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
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                Filters
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">{activeFilterCount} active</span>
                ) : null}
              </p>
              <p className="truncate text-xs text-slate-500">{total.toLocaleString()} adjustment{total === 1 ? "" : "s"} match</p>
            </div>
          </div>
          {loading && rows.length > 0 ? (
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
              onClick={clearFilters}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Clear filters
            </Button>
          ) : null}
        </div>
        <div className="space-y-4 border-t border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-indigo-50/30 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold text-indigo-900/80">Type</span>
              {[{ value: "all", label: "All", count: summary.allCount }, ...TYPES.map((t) => ({ value: t.value, label: t.label, count: summary.typeCounts[t.value] || 0 }))].map(
                (chip) => {
                  const active = filterType === chip.value;
                  return (
                    <button
                      key={chip.value}
                      type="button"
                      onClick={() => {
                        setFilterType(chip.value);
                        setPage(1);
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        active ? "border-indigo-600 bg-indigo-600 text-white shadow-sm" : "border-indigo-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700",
                      )}
                    >
                      {chip.label}
                      <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")}>{chip.count}</span>
                    </button>
                  );
                },
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold text-indigo-900/80">Period</span>
              {(
                [
                  { id: "all", label: "All time" },
                  { id: "today", label: "Today" },
                  { id: "7d", label: "7 days" },
                  { id: "month", label: "This month" },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyDatePreset(p.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    activeDatePreset === p.id ? "border-indigo-600 bg-indigo-600 text-white shadow-sm" : "border-indigo-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700",
                  )}
                >
                  {p.label}
                </button>
              ))}
              {activeDatePreset === null ? <span className="rounded-full border border-indigo-600 bg-indigo-600 px-3 py-1 text-xs font-medium text-white">Custom</span> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-3 gap-y-4 border-t border-dashed border-indigo-200 pt-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-1.5 md:col-span-2 xl:col-span-1">
              <Label className="text-xs font-semibold text-indigo-900/80">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Product, SKU, ref, note…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 border-indigo-200/80 bg-white pl-9 text-sm shadow-sm"
                />
              </div>
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
                  <SelectValue />
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
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-indigo-900/80">Reason</Label>
              <Select
                value={filterCategory}
                onValueChange={(v) => {
                  setFilterCategory(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 border-indigo-200/80 bg-white text-sm shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reasons</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
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

      {/* History */}
      <Card className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <ListChecks className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-slate-900">Adjustment history</h2>
              <p className="truncate text-xs text-slate-500">Every change to on-hand stock, with before/after and value impact</p>
            </div>
          </div>
        </div>

        <div className="relative min-h-[260px]">
          {loading && rows.length > 0 ? (
            <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/60 pt-16 backdrop-blur-[1px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-md">
                <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                Updating…
              </div>
            </div>
          ) : null}

          {loading && rows.length === 0 ? (
            <div className="space-y-4 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                <Scale className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-slate-900">{activeFilterCount ? "No adjustments match" : "No adjustments yet"}</p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                {activeFilterCount
                  ? "Try clearing the filters."
                  : "Start a stock count to compare what's on the shelf with the system, or add / remove stock directly."}
              </p>
              {activeFilterCount ? (
                <Button variant="outline" size="sm" className="mt-4 h-8 border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" onClick={clearFilters}>
                  <X className="mr-1 h-3.5 w-3.5" /> Clear filters
                </Button>
              ) : (
                <Button size="sm" className="mt-4 h-8 bg-sky-600 text-white hover:bg-sky-700" onClick={() => openNew("RECONCILIATION")}>
                  <ClipboardCheck className="mr-1 h-3.5 w-3.5" /> Start stock count
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50 [&>th]:h-10 [&>th]:whitespace-nowrap [&>th]:text-[11px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-slate-500">
                    <TableHead className="pl-5">Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Type · reason</TableHead>
                    <TableHead className="text-right">Before → after</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="pr-5">By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((a) => {
                    const meta = typeMeta(a.adjustment_type);
                    const diff = Number(a.difference) || 0;
                    const sys = Number(a.system_quantity) || 0;
                    const value = diff * (Number(a.product?.purchase_rate) || 0);
                    const ts = new Date(a.adjustment_date);
                    return (
                      <TableRow key={a.id} className="cursor-pointer border-slate-100 hover:bg-slate-50/70" onClick={() => setDetailRow(a)}>
                        <TableCell className="whitespace-nowrap py-3 pl-5 text-sm text-slate-700">
                          <div>{format(ts, "dd MMM yyyy")}</div>
                          <div className="text-[11px] text-slate-400">
                            {format(ts, "hh:mm a")}
                            {a.reference_no ? <span className="ml-1 font-mono">· {a.reference_no}</span> : null}
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <p className="max-w-[240px] truncate text-sm font-semibold text-slate-900">{a.product?.name || "—"}</p>
                          <p className="font-mono text-[11px] text-slate-400">{a.product?.sku || "—"}</p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-3 text-sm text-slate-700">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-slate-400" />
                            {a.branch?.name || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", meta.pill)}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                            {meta.label}
                          </span>
                          <p className="mt-0.5 text-[11px] text-slate-500">{categoryLabel(a.adjustment_category)}</p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-3 text-right text-sm tabular-nums text-slate-600">
                          {formatQty(sys)}
                          <ArrowRight className="mx-1 inline h-3 w-3 text-slate-400" />
                          <span className="font-semibold text-slate-900">{formatQty(sys + diff)}</span>
                        </TableCell>
                        <TableCell className={cn("whitespace-nowrap py-3 text-right text-base font-semibold tabular-nums", diff > 0 ? "text-emerald-700" : diff < 0 ? "text-rose-700" : "text-slate-500")}>
                          {signedQty(diff)}
                        </TableCell>
                        <TableCell className={cn("whitespace-nowrap py-3 text-right text-sm tabular-nums", value > 0 ? "text-emerald-700" : value < 0 ? "text-rose-700" : "text-slate-400")}>
                          {value ? signedMoney(value) : "—"}
                        </TableCell>
                        <TableCell className="py-3 pr-5 text-xs text-slate-500">{a.user?.email?.split("@")[0] || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

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

      {/* New adjustment */}
      <StockOperationDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setLines([]);
            setFormErrors({});
          }
        }}
        title={currentType.label}
        description={currentType.hint}
        icon={<CurrentIcon className="h-5 w-5" />}
        iconTone={currentType.tile}
        onSubmit={handleSubmit}
        submitting={submitting}
        submitDisabled={!form.branchId || lines.length === 0}
        submitLabel={
          lines.length === 0
            ? "Save adjustment"
            : form.adjustmentType === "RECONCILIATION"
              ? `Save count · ${preview.changed} change${preview.changed === 1 ? "" : "s"}`
              : `${form.adjustmentType === "ADDITION" ? "Add" : "Remove"} ${formatQty(form.adjustmentType === "ADDITION" ? preview.gained : preview.lost)} units`
        }
        footerHint={
          !form.branchId ? (
            "Choose a branch first"
          ) : lines.length === 0 ? (
            "Add products from the catalog"
          ) : (
            <span className="tabular-nums">
              {preview.gained > 0 ? <span className="font-semibold text-emerald-700">+{formatQty(preview.gained)}</span> : null}
              {preview.gained > 0 && preview.lost > 0 ? " · " : null}
              {preview.lost > 0 ? <span className="font-semibold text-rose-700">−{formatQty(preview.lost)}</span> : null}
              {preview.gained || preview.lost ? " units · " : ""}
              value <span className={cn("font-semibold", preview.value < 0 ? "text-rose-700" : "text-emerald-700")}>{signedMoney(preview.value)}</span>
              {form.adjustmentType === "RECONCILIATION" && preview.unchanged ? (
                <span className="text-slate-400"> · {preview.unchanged} match{preview.unchanged === 1 ? "es" : ""} (skipped)</span>
              ) : null}
            </span>
          )
        }
      >
        <div className="space-y-4">
          {/* Type */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {TYPES.map((t) => {
              const Icon = t.icon;
              const active = form.adjustmentType === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                    active ? "border-slate-900 bg-white shadow-md ring-1 ring-slate-900" : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                >
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", active ? t.tile : "bg-slate-100 text-slate-500")}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">{t.label}</span>
                    <span className="block text-xs leading-snug text-slate-500">{t.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Details row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">
                Branch <span className="text-red-500">*</span>
              </Label>
              {branchesLoading ? (
                <StockSelectSkeleton label="Loading branches" />
              ) : (
                <Select
                  value={form.branchId}
                  onValueChange={(v) => {
                    setForm((f) => ({ ...f, branchId: v }));
                    setFormErrors((e) => ({ ...e, branchId: "" }));
                    setLines([]);
                  }}
                >
                  <SelectTrigger className={cn("h-10 bg-white text-sm", formErrors.branchId ? "border-red-400" : "")}>
                    <SelectValue placeholder="Choose branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Reason</Label>
              <Select value={form.adjustmentCategory} onValueChange={(v) => setForm((f) => ({ ...f, adjustmentCategory: v as AdjustmentCategory }))}>
                <SelectTrigger className="h-10 bg-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableCategories.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Reference</Label>
              <Input
                placeholder="Auto-generated if empty"
                value={form.referenceNo}
                onChange={(e) => setForm((f) => ({ ...f, referenceNo: e.target.value }))}
                className="h-10 bg-white text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Note</Label>
              {showNotes ? (
                <Textarea
                  autoFocus
                  placeholder="What happened? Visible in the audit trail."
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  className="min-h-[40px] resize-none bg-white text-sm"
                />
              ) : (
                <Button type="button" variant="outline" className="h-10 w-full justify-start bg-white text-sm font-normal text-slate-500" onClick={() => setShowNotes(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {form.reason ? form.reason : "Add a note (optional)"}
                </Button>
              )}
            </div>
          </div>

          {/* Stock-count helper */}
          {form.adjustmentType === "RECONCILIATION" ? (
            <div className="flex flex-col gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-sky-900 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                <span>
                  Each product starts at its system quantity — <strong>change only the ones you counted differently</strong>. Items that match are
                  skipped when you save.
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 shrink-0 border-sky-200 bg-white text-sky-700 hover:bg-sky-100"
                disabled={!form.branchId || branchStockLoading}
                onClick={loadAllForCount}
              >
                {branchStockLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ListChecks className="mr-1.5 h-3.5 w-3.5" />}
                Count everything at {branchName || "this branch"}
              </Button>
            </div>
          ) : null}

          {preview.negative > 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <TrendingDown className="h-4 w-4" />
              {preview.negative} line{preview.negative === 1 ? " removes" : "s remove"} more than is in stock. Lower the quantity to continue.
            </div>
          ) : null}

          <StockProductPicker
            layout="split"
            products={pickerProducts}
            categories={categories}
            loading={productsLoading}
            lines={lines}
            onLinesChange={(next) => {
              setLines(next);
              setFormErrors((e) => ({ ...e, lines: "" }));
            }}
            quantityLabel={form.adjustmentType === "RECONCILIATION" ? "Counted" : form.adjustmentType === "ADDITION" ? "Qty to add" : "Qty to remove"}
            previewMode={form.adjustmentType === "RECONCILIATION" ? "set" : form.adjustmentType === "ADDITION" ? "add" : "remove"}
            initialQuantity={form.adjustmentType === "RECONCILIATION" ? (_p, qty) => String(qty ?? 0) : undefined}
            showCurrentQty
            getCurrentQty={onHand}
            disabled={!form.branchId}
            disabledHint="Choose a branch first to see its stock"
            error={formErrors.lines}
            catalogTitle="Products"
            cartTitle={form.adjustmentType === "RECONCILIATION" ? "Count sheet" : "Adjustment"}
            emptyCartHint={
              form.adjustmentType === "RECONCILIATION"
                ? "Pick products to count, or use “Count everything” above."
                : "Pick the products to adjust from the catalog."
            }
          />
        </div>
      </StockOperationDialog>

      {/* Detail */}
      <DetailSheet open={!!detailRow} onOpenChange={(open) => !open && setDetailRow(null)} size="md">
        <DetailSheetHeader title="Adjustment detail" subtitle={detailRow?.reference_no || "Audit record"} />
        <DetailSheetBody>
          {detailRow
            ? (() => {
                const meta = typeMeta(detailRow.adjustment_type);
                const diff = Number(detailRow.difference) || 0;
                const sys = Number(detailRow.system_quantity) || 0;
                const cost = Number(detailRow.product?.purchase_rate) || 0;
                return (
                  <div className="space-y-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", meta.pill)}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                        {meta.label}
                      </span>
                      <span className="text-xs text-slate-500">{new Date(detailRow.adjustment_date).toLocaleString()}</span>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                      <p className="font-semibold text-slate-900">{detailRow.product?.name || "—"}</p>
                      <p className="font-mono text-xs text-slate-500">{detailRow.product?.sku || "—"}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-600">
                        <MapPin className="h-3.5 w-3.5" />
                        {detailRow.branch?.name || "—"}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[
                        { label: "System", value: formatQty(sys), tone: "text-slate-900" },
                        { label: "Variance", value: signedQty(diff), tone: diff > 0 ? "text-emerald-700" : diff < 0 ? "text-rose-700" : "text-slate-500" },
                        { label: "New on hand", value: formatQty(sys + diff), tone: "text-slate-900" },
                      ].map((c) => (
                        <div key={c.label} className="rounded-lg border border-slate-100 p-2.5">
                          <p className="text-[10px] uppercase text-slate-400">{c.label}</p>
                          <p className={cn("mt-0.5 text-lg font-bold tabular-nums", c.tone)}>{c.value}</p>
                        </div>
                      ))}
                    </div>
                    <dl className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                      {[
                        ["Reason", categoryLabel(detailRow.adjustment_category)],
                        ["Value impact", cost ? signedMoney(diff * cost) : "—"],
                        ["Counted", detailRow.physical_count != null ? formatQty(Number(detailRow.physical_count)) : "—"],
                        ["Reference", detailRow.reference_no || "—"],
                        ["Recorded by", detailRow.user?.email || "—"],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3 px-3 py-2">
                          <dt className="text-slate-500">{k}</dt>
                          <dd className="text-right font-medium text-slate-900">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    {detailRow.reason ? (
                      <div className="rounded-lg border border-slate-100 bg-white p-3 text-xs leading-relaxed text-slate-600">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Note</p>
                        {detailRow.reason}
                      </div>
                    ) : null}
                  </div>
                );
              })()
            : null}
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={() => setDetailRow(null)}>
            Close
          </Button>
        </DetailSheetFooter>
      </DetailSheet>
    </div>
  );
}

export default StockAdjustment;
