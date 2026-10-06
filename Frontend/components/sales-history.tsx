"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { DateField } from "@/components/ui/date-picker";
import { PageLoader } from "@/components/ui/page-loader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import {
  Search,
  Printer,
  Eye,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MessageCircle,
  Receipt,
  MoreHorizontal,
  Download,
  Trash2,
  Pencil,
  FileSpreadsheet,
  FileText,
  Filter,
  X,
  Building2,
  User,
  CreditCard,
  CalendarIcon,
  RefreshCcw,
  Wallet,
  ShoppingBag,
  Undo2,
  TrendingUp,
  Landmark,
  Tag,
  SlidersHorizontal,
  ChevronUp,
  Package,
  UserCog,
} from "lucide-react";
import {
  format,
  parseISO,
} from "date-fns";
import * as XLSX from "xlsx";
import { isKioskMode } from "@/utils/kiosk-printing";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { printReceiptViaServer, type ReceiptData } from "@/lib/print-server";
import { usePrinterSettings } from "@/hooks/use-printer-settings";
import { useLogoDataUri } from "@/hooks/use-logo-data-uri";
import { useScrollToTopOnPageChange } from "@/hooks/use-scroll-to-top-on-page-change";
import {
  prepareReceiptDataFromSale,
  generateReceiptHtml,
  receiptPageWrapper,
  downloadReceiptPdf,
  shareReceiptOnWhatsApp,
} from "@/lib/receipt";
import { EditSaleDialog } from "@/components/edit-sale-dialog";
import { ChangeSalespersonDialog } from "@/components/change-salesperson-dialog";
import { useSalespeople } from "@/components/salesperson-picker";
import { extractApiError } from "@/lib/api/errors";
import { getSession } from "@/lib/session";
import { useBranches, useBranch } from "@/hooks/queries/use-branches";
import { useSales, useSale, useSalesMutations } from "@/hooks/queries/use-sales";
import {
  fetchSaleById,
  fetchAllSalesForExport,
  type SalesQuery,
} from "@/lib/api/sales";
import {
  businessTodayYmd,
  rangeForPreset,
  startOfBusinessMonthYmd,
  startOfBusinessWeekYmd,
} from "@/lib/business-timezone";

interface SaleItem {
  id: string;
  product_id?: string;
  product: {
    id?: string;
    name: string;
    sku?: string;
    code?: string;
    barcode?: string;
    unit?: { name?: string };
    unit_name?: string;
  };
  quantity: number;
  unit_price?: string;
  discount_amount?: string;
  line_total: string;
}

interface Customer {
  id: string;
  email?: string | null;
  name?: string | null;
  phone_number?: string | null;
  mobile_number?: string | null;
}

interface Branch {
  id: string;
  name: string;
  address?: string;
}

interface Cashier {
  id: string;
  email: string;
  role?: string;
}

interface Sale {
  id: string;
  sale_number: string;
  invoice_number?: string | null;
  sale_date: string;
  total_amount: string;
  subtotal?: string;
  tax_amount?: string;
  discount_amount?: string;
  payment_method: string;
  payment_status?: string;
  status: string;
  notes?: string | null;
  customer: Customer | null;
  sale_items: SaleItem[];
  created_at?: string;
  updated_at?: string;
  branch?: Branch | null;
  user?: Cashier | null;
  salesperson?: { id: string; name: string; employee_code?: string | null } | null;
  payments?: { id: string; method: string; amount: string | number; reference?: string | null }[];
  payment_received?: string | number;
  change_amount?: string | number;
  void_reason?: string | null;
  voided_at?: string | null;
  original_sale_id?: string | null;
  original_sale?: { id: string; sale_number: string } | null;
  return_sales?: Array<{
    id: string;
    sale_number: string;
    sale_date: string;
    total_amount: string;
    status: string;
  }>;
  _count?: { return_sales?: number };
}

interface SalesSummary {
  totalSales: number;
  totalOrders: number;
  completedOrders: number;
  totalRefunds: number;
  refundCount: number;
  averageOrderValue: number;
  totalTaxCollected: number;
  totalDiscounts: number;
}

type DatePreset = "all" | "today" | "yesterday" | "week" | "month" | "custom";
type SortField =
  | "sale_date"
  | "sale_number"
  | "total_amount"
  | "subtotal"
  | "discount_amount"
  | "tax_amount"
  | "payment_method"
  | "payment_status"
  | "status";

const PAYMENT_METHODS = [
  "CASH",
  "CARD",
  "MOBILE_MONEY",
  "BANK_TRANSFER",
  "CREDIT",
] as const;

const PAYMENT_STATUSES = ["PAID", "PARTIAL", "PENDING", "OVERDUE"] as const;
const ORDER_STATUSES = [
  "COMPLETED",
  "PENDING",
  "CANCELLED",
  "REFUNDED",
  "EXCHANGED",
] as const;

const EMPTY_SUMMARY: SalesSummary = {
  totalSales: 0,
  totalOrders: 0,
  completedOrders: 0,
  totalRefunds: 0,
  refundCount: 0,
  averageOrderValue: 0,
  totalTaxCollected: 0,
  totalDiscounts: 0,
};

const formatQty = (value: string | number | undefined | null): string => {
  const n = Number(value) || 0;
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
};

const formatCurrency = (value: string | number | undefined | null): string => {
  if (value === undefined || value === null || value === "") return "Rs 0.00";
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(numValue)) return "Rs 0.00";
  const abs = Math.abs(numValue).toFixed(2);
  return numValue < 0 ? `-Rs ${abs}` : `Rs ${abs}`;
};

const toNumber = (value: string | number | undefined | null): number => {
  if (value === undefined || value === null || value === "") return 0;
  const n = typeof value === "string" ? parseFloat(value) : value;
  return Number.isNaN(n) ? 0 : n;
};

const customerLabel = (sale: Sale): string =>
  sale.customer?.name ||
  sale.customer?.email ||
  sale.customer?.phone_number ||
  sale.customer?.mobile_number ||
  "Guest";

const cashierLabel = (sale: Sale): string =>
  sale.user?.email?.split("@")[0] || sale.user?.email || "—";

const salespersonLabel = (sale: Sale): string => sale.salesperson?.name || "—";

const itemCount = (sale: Sale): number => sale.sale_items?.length || 0;

const totalQuantity = (sale: Sale): number => {
  const sum = (sale.sale_items || []).reduce(
    (acc, item) => acc + Math.abs(Number(item.quantity) || 0),
    0,
  );
  // Avoid float noise (e.g. 0.1 + 0.05 → 0.15000000000000002)
  return Math.round(sum * 1000) / 1000;
};

const getDateRange = (preset: DatePreset): { start?: string; end?: string } => {
  switch (preset) {
    case "today": {
      const range = rangeForPreset("today");
      return { start: range.from, end: range.to };
    }
    case "yesterday": {
      const range = rangeForPreset("yesterday");
      return { start: range.from, end: range.to };
    }
    case "week": {
      const today = businessTodayYmd();
      return { start: startOfBusinessWeekYmd(today), end: today };
    }
    case "month": {
      const today = businessTodayYmd();
      return { start: startOfBusinessMonthYmd(today), end: today };
    }
    default:
      return {};
  }
};

const statusBadgeVariant = (
  status: string,
): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "COMPLETED":
      return "default";
    case "REFUNDED":
    case "CANCELLED":
      return "destructive";
    case "PENDING":
      return "secondary";
    default:
      return "outline";
  }
};

const paymentStatusVariant = (
  status?: string,
): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "PAID":
      return "default";
    case "PARTIAL":
      return "secondary";
    case "OVERDUE":
      return "destructive";
    default:
      return "outline";
  }
};

const orderStatusTone = (status?: string): string => {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
    case "PENDING":
      return "bg-amber-50 text-amber-700 ring-amber-600/20";
    case "CANCELLED":
    case "REFUNDED":
      return "bg-rose-50 text-rose-700 ring-rose-600/20";
    case "EXCHANGED":
      return "bg-violet-50 text-violet-700 ring-violet-600/20";
    default:
      return "bg-slate-50 text-slate-600 ring-slate-500/20";
  }
};

const paymentStatusTone = (status?: string): string => {
  switch (status || "PAID") {
    case "PAID":
      return "bg-sky-50 text-sky-700 ring-sky-600/20";
    case "PARTIAL":
    case "PENDING":
      return "bg-amber-50 text-amber-700 ring-amber-600/20";
    case "OVERDUE":
      return "bg-rose-50 text-rose-700 ring-rose-600/20";
    default:
      return "bg-slate-50 text-slate-600 ring-slate-500/20";
  }
};

const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

function SalePill({
  tone,
  dot = true,
  children,
}: {
  tone: string;
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        tone,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> : null}
      {children}
    </span>
  );
}

export function SalesHistory() {
  const { toast } = useToast();
  const { receiptPrinter, getReceiptPrinterObj } = usePrinterSettings();
  const logoDataUri = useLogoDataUri();

  const session = getSession();
  const isAdmin = session.isAdmin;
  const canManageSales = isAdmin || session.role === "BRANCH_MANAGER";

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("all");
  const [paymentStatus, setPaymentStatus] = useState<string>("all");
  const [orderStatus, setOrderStatus] = useState<string>("all");
  const [cashierId, setCashierId] = useState<string>("all");
  const [salespersonFilter, setSalespersonFilter] = useState<string>("all");
  const { people: salespeople } = useSalespeople();
  const [salespersonTarget, setSalespersonTarget] = useState<Sale | null>(null);
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  useScrollToTopOnPageChange(currentPage);
  const [sortBy, setSortBy] = useState<SortField>("sale_date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [viewRowId, setViewRowId] = useState<string | null>(null);
  const viewOpen = viewRowId !== null;
  const [receiptHtml, setReceiptHtml] = useState("");
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [kioskMode, setKioskMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);
  const [editSale, setEditSale] = useState<Sale | null>(null);
  const [reprintSale, setReprintSale] = useState<Sale | null>(null);
  const [actionBusy, setActionBusy] = useState<{
    saleId: string;
    action: string;
  } | null>(null);

  const isSaleBusy = (saleId: string, action?: string) =>
    !!actionBusy &&
    actionBusy.saleId === saleId &&
    (!action || actionBusy.action === action);

  const runSaleAction = async (
    saleId: string,
    action: string,
    fn: () => void | Promise<void>,
  ) => {
    if (actionBusy) return;
    setActionBusy({ saleId, action });
    try {
      await fn();
    } finally {
      setActionBusy(null);
    }
  };

  // Debounced search (guide: 250 ms) feeds the query hook.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setKioskMode(isKioskMode());
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearch,
    datePreset,
    customStart,
    customEnd,
    paymentMethod,
    paymentStatus,
    orderStatus,
    cashierId,
    salespersonFilter,
    branchFilter,
    pageSize,
  ]);

  // ----- branch resolution via shared hooks -----
  const { branches, isLoading: branchesLoading } = useBranches({ isActive: true, enabled: isAdmin });
  const scopedBranchId = !isAdmin && session.branchId ? session.branchId : null;
  const { data: scopedBranch } = useBranch(scopedBranchId);
  const branchInfo = useMemo(() => {
    if (scopedBranchId && scopedBranch) {
      return {
        name: scopedBranch.name || scopedBranchId,
        address: scopedBranch.address || "Karachi",
      };
    }
    return { name: "Pehnawa Boutique", address: "Karachi" };
  }, [scopedBranchId, scopedBranch]);

  const resolveDateParams = useCallback(() => {
    if (datePreset === "custom") {
      return {
        startDate: customStart || undefined,
        endDate: customEnd || undefined,
      };
    }
    const range = getDateRange(datePreset);
    return {
      startDate: range.start,
      endDate: range.end,
    };
  }, [datePreset, customStart, customEnd]);

  // Every filter the old buildParams() produced — reproduced 1:1 as hook params.
  const listParams = useMemo<SalesQuery>(() => {
    const { startDate, endDate } = resolveDateParams();
    const resolvedBranchId = isAdmin
      ? branchFilter !== "all"
        ? branchFilter
        : undefined
      : session.branchId || undefined;
    return {
      page: currentPage,
      limit: pageSize,
      search: debouncedSearch || undefined,
      paymentMethod: paymentMethod !== "all" ? paymentMethod : undefined,
      paymentStatus: paymentStatus !== "all" ? paymentStatus : undefined,
      status: orderStatus !== "all" ? orderStatus : undefined,
      cashierId: cashierId !== "all" ? cashierId : undefined,
      salespersonId: salespersonFilter !== "all" ? salespersonFilter : undefined,
      branchId: resolvedBranchId,
      startDate,
      endDate,
      sortBy,
      sortOrder,
    };
  }, [
    resolveDateParams,
    isAdmin,
    branchFilter,
    session.branchId,
    currentPage,
    pageSize,
    debouncedSearch,
    paymentMethod,
    paymentStatus,
    orderStatus,
    cashierId,
    salespersonFilter,
    sortBy,
    sortOrder,
  ]);

  const {
    sales: rawSales,
    meta,
    summary: rawSummary,
    cashiers,
    isFirstLoad,
    isRefreshing,
    refetch,
    error: listError,
  } = useSales(listParams);

  const sales = rawSales as unknown as Sale[];
  const summary = rawSummary ?? EMPTY_SUMMARY;
  const loading = isFirstLoad || isRefreshing;
  const totalSales = meta?.total ?? sales.length;
  const totalPages = Math.max(1, meta?.totalPages ?? 1);

  const { remove: removeSale, cancel: cancelSaleM } = useSalesMutations();

  useEffect(() => {
    if (listError) {
      toast({
        variant: "destructive",
        title: "Failed to load sales",
        description: extractApiError(listError, "Failed to load sales"),
      });
    }
  }, [listError]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- sale detail (gated on the sheet being open) -----
  const viewRow = useMemo(
    () => sales.find((s) => s.id === viewRowId) ?? null,
    [sales, viewRowId],
  );
  const viewQuery = useSale(viewRowId, { enabled: viewOpen });
  const viewSale: Sale | null =
    (viewQuery.data as unknown as Sale) ?? viewRow ?? null;
  const viewLoading = viewQuery.isLoading && !viewRow;

  useEffect(() => {
    if (viewQuery.error) {
      toast({
        title: "Loaded from list data",
        description: "Could not refresh full sale details.",
      });
    }
  }, [viewQuery.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildReceiptFromSale = useCallback(
    (sale: Sale): ReceiptData => {
      const data = prepareReceiptDataFromSale(sale, {
        name: sale.branch?.name || branchInfo.name,
        address: sale.branch?.address || branchInfo.address,
      });
      if (sale.user?.email) {
        data.cashier = sale.user.email.split("@")[0] || sale.user.email;
      }
      if (sale.salesperson?.name) {
        data.salesperson = sale.salesperson.name;
      }
      const phone =
        sale.customer?.phone_number ||
        sale.customer?.mobile_number ||
        undefined;
      if (phone) data.customerPhone = phone;
      return data;
    },
    [branchInfo.name, branchInfo.address],
  );

  // Rebuild the receipt preview whenever the sale detail or logo changes.
  useEffect(() => {
    if (!viewOpen || !viewSale) return;
    const data = buildReceiptFromSale(viewSale);
    setReceiptData(data);
    setReceiptHtml(receiptPageWrapper(generateReceiptHtml(data, logoDataUri)));
  }, [viewOpen, viewSale, logoDataUri, buildReceiptFromSale]);

  const closeView = () => {
    setViewRowId(null);
    setReceiptHtml("");
    setReceiptData(null);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (debouncedSearch) count += 1;
    if (datePreset !== "all") count += 1;
    if (paymentMethod !== "all") count += 1;
    if (paymentStatus !== "all") count += 1;
    if (orderStatus !== "all") count += 1;
    if (cashierId !== "all") count += 1;
    if (salespersonFilter !== "all") count += 1;
    if (branchFilter !== "all") count += 1;
    return count;
  }, [
    debouncedSearch,
    datePreset,
    paymentMethod,
    paymentStatus,
    orderStatus,
    cashierId,
    salespersonFilter,
    branchFilter,
  ]);

  const clearFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setDatePreset("all");
    setCustomStart("");
    setCustomEnd("");
    setPaymentMethod("all");
    setPaymentStatus("all");
    setOrderStatus("all");
    setCashierId("all");
    setSalespersonFilter("all");
    setBranchFilter("all");
  };

  const openEditSale = (sale: Sale) => {
    // Open immediately so the dialog shows its own loader while fetching.
    setEditSale(sale);
  };

  const fetchSaleDetails = async (sale: Sale): Promise<Sale> => {
    try {
      const detailed = await fetchSaleById(sale.id);
      return (detailed as unknown as Sale) || sale;
    } catch {
      return sale;
    }
  };

  const handleDeleteSale = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    removeSale.mutate(target.id, {
      onSuccess: () => {
        toast({ title: "Sale deleted" });
        setDeleteTarget(null);
        if (viewRowId === target.id) closeView();
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Delete failed",
          description: extractApiError(error, "Unable to delete sale"),
        });
      },
    });
  };

  const openSaleDetails = (sale: Sale) => {
    setViewRowId(sale.id);
  };

  const handlePrintReceipt = async (sale?: Sale) => {
    const target = sale || viewSale;
    if (!target) return;
    await runSaleAction(target.id, "print", async () => {
      const detailed = await fetchSaleDetails(target);
      const data = buildReceiptFromSale(detailed);
      const html = receiptPageWrapper(generateReceiptHtml(data, logoDataUri));
      const printerInfo = getReceiptPrinterObj();
      const printerName = printerInfo?.name || (kioskMode ? "Default Printer" : "");

      if (printerName) {
        try {
          const result = await printReceiptViaServer(
            {
              name: printerName,
              columns: printerInfo?.receiptProfile?.columns || { fontA: 48, fontB: 64 },
            },
            data,
            { copies: 1, cut: true, openDrawer: false },
          );
          if (!result.success) throw new Error(result.error || "Print server error");
          toast({ title: "Receipt sent to printer", description: `Printer: ${printerName}` });
          return;
        } catch (error: any) {
          toast({
            variant: "destructive",
            title: "Printer failed — opening browser print",
            description: error?.message || "Falling back to browser print.",
          });
        }
      } else {
        toast({
          title: "No receipt printer configured",
          description: "Opening browser print instead.",
        });
      }

      const printWindow = window.open("", "_blank", "width=420,height=600");
      if (!printWindow) {
        toast({ title: "Unable to open print window", variant: "destructive" });
        return;
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        try {
          printWindow.print();
        } catch (error) {
          console.error("Print failed", error);
        }
      }, 500);
    });
  };

  const handleBrowserPrint = () => {
    if (!receiptHtml) return;
    const printWindow = window.open("", "_blank", "width=420,height=600");
    if (!printWindow) {
      toast({ title: "Unable to open print window", variant: "destructive" });
      return;
    }
    printWindow.document.open();
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      try {
        printWindow.print();
      } catch (error) {
        console.error("Print failed", error);
      }
    }, 500);
  };

  const handleDownloadPdf = async (sale?: Sale) => {
    const target = sale || viewSale;
    if (!target) return;
    await runSaleAction(target.id, "pdf", async () => {
      try {
        const detailed = await fetchSaleDetails(target);
        const data = buildReceiptFromSale(detailed);
        await downloadReceiptPdf(data, logoDataUri);
        toast({ title: "Receipt PDF downloaded" });
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "PDF download failed",
          description: error?.message || "Unable to generate PDF",
        });
      }
    });
  };

  // Post-edit "Sale updated" dialog — uses the exact same print path as
  // New Sale's success dialog (`handleSuccessPrint`): full printer object is
  // forwarded to the print server, no silent browser-print fallback.
  const handleEditedPrint = async (sale?: Sale) => {
    const target = sale || reprintSale;
    if (!target) return;
    await runSaleAction(target.id, "print", async () => {
      const printerInfo = getReceiptPrinterObj();
      if (!printerInfo) {
        toast({
          variant: "destructive",
          title: "Please select a receipt printer in Printer Settings",
        });
        return;
      }
      try {
        const detailed = await fetchSaleDetails(target);
        const data = buildReceiptFromSale(detailed);
        await printReceiptViaServer(
          {
            ...printerInfo,
            columns:
              printerInfo.receiptProfile?.columns || { fontA: 48, fontB: 64 },
          },
          data,
          { copies: 1, cut: true, openDrawer: false },
        );
        toast({ title: "Receipt sent to printer" });
      } catch (err: any) {
        toast({
          variant: "destructive",
          title: err?.message || "Failed to print receipt",
        });
      }
    });
  };

  const handleCancelSale = () => {
    if (!cancelTarget) return;
    if (!voidReason.trim()) {
      toast({ variant: "destructive", title: "Enter a reason for voiding this bill" });
      return;
    }
    cancelSaleM.mutate({ id: cancelTarget.id, reason: voidReason.trim() }, {
      onSuccess: () => {
        toast({ title: "Bill voided", description: "Items were returned to stock." });
        setCancelTarget(null);
        setVoidReason("");
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Cancel failed",
          description: extractApiError(error, "Unable to cancel sale"),
        });
      },
    });
  };

  const rowsForExport = (list: Sale[]) =>
    list.map((s) => ({
      "Invoice Number": s.invoice_number || s.sale_number,
      "Sale Number": s.sale_number,
      "Date & Time": format(parseISO(s.sale_date), "yyyy-MM-dd HH:mm:ss"),
      Customer: customerLabel(s),
      Cashier: cashierLabel(s),
      Salesperson: salespersonLabel(s),
      Items: itemCount(s),
      Quantity: totalQuantity(s),
      Subtotal: toNumber(s.subtotal),
      Discount: toNumber(s.discount_amount),
      Tax: toNumber(s.tax_amount),
      Total: toNumber(s.total_amount),
      "Payment Method": s.payment_method,
      "Payment Status": s.payment_status || "PAID",
      "Order Status": s.status,
      Branch: s.branch?.name || "—",
      Notes: s.notes || "",
      "Return Count": s._count?.return_sales ?? 0,
    }));

  const handleExport = async (type: "csv" | "xlsx" | "pdf") => {
    setExporting(true);
    try {
      const list = (await fetchAllSalesForExport(listParams)) as unknown as Sale[];
      const rows = rowsForExport(list);
      if (!rows.length) {
        toast({ title: "Nothing to export", variant: "destructive" });
        return;
      }

      if (type === "csv" || type === "xlsx") {
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sales History");
        XLSX.writeFile(workbook, `sales-history.${type === "csv" ? "csv" : "xlsx"}`);
        toast({ title: `Exported ${rows.length} sales` });
        return;
      }

      // Branded printable report
      const logo = logoDataUri || "";
      const branchLabel = !isAdmin
        ? branchInfo.name
        : branchFilter !== "all"
          ? branches.find((b) => b.id === branchFilter)?.name || "Selected branch"
          : "All branches";
      const html = `<!DOCTYPE html>
<html><head><title>Sales History Report</title>
<style>
  @page { margin: 14mm; }
  body { font-family: Georgia, "Times New Roman", serif; color: #111; font-size: 11px; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 12px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img { height: 48px; width: auto; object-fit: contain; }
  .brand h1 { margin: 0; font-size: 20px; letter-spacing: 0.02em; }
  .meta { text-align: right; font-size: 10px; color: #444; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
  .summary div { border: 1px solid #ddd; padding: 8px; border-radius: 6px; }
  .summary span { display: block; color: #666; font-size: 9px; text-transform: uppercase; }
  .summary strong { font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #e5e5e5; padding: 6px 5px; text-align: left; vertical-align: top; }
  th { background: #f7f7f7; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; }
  .footer { margin-top: 16px; font-size: 9px; color: #666; border-top: 1px solid #ddd; padding-top: 8px; }
</style></head><body>
  <div class="header">
    <div class="brand">
      ${logo ? `<img src="${logo}" alt="Logo" />` : ""}
      <div>
        <h1>Pehnawa Boutique Sales History</h1>
        <div>${branchLabel}</div>
      </div>
    </div>
    <div class="meta">
      <div>Generated ${format(new Date(), "PPpp")}</div>
      <div>${rows.length} transactions</div>
    </div>
  </div>
  <div class="summary">
    <div><span>Total Sales</span><strong>${formatCurrency(summary.totalSales)}</strong></div>
    <div><span>Orders</span><strong>${summary.totalOrders}</strong></div>
    <div><span>Avg Order</span><strong>${formatCurrency(summary.averageOrderValue)}</strong></div>
  </div>
  <table>
    <thead><tr>
      <th>Invoice</th><th>Date</th><th>Customer</th><th>Cashier</th>
      <th>Branch</th><th>Payment</th><th>Status</th><th>Total</th>
    </tr></thead>
    <tbody>
      ${list
        .map(
          (s) => `<tr>
        <td>${s.invoice_number || s.sale_number}</td>
        <td>${format(parseISO(s.sale_date), "yyyy-MM-dd HH:mm")}</td>
        <td>${customerLabel(s)}</td>
        <td>${cashierLabel(s)}</td>
        <td>${s.branch?.name || "—"}</td>
        <td>${s.payment_method}</td>
        <td>${s.status}</td>
        <td>${formatCurrency(s.total_amount)}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>
  <div class="footer">Pehnawa Boutique Pos · Confidential sales report · Do not redistribute without authorization</div>
</body></html>`;
      const win = window.open("", "_blank");
      if (!win) throw new Error("Popup blocked");
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 500);
      toast({ title: "Branded PDF report opened" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: error?.message || "Unable to export",
      });
    } finally {
      setExporting(false);
    }
  };

  const pageStart = totalSales === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min((currentPage - 1) * pageSize + sales.length, totalSales);

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const windowSize = 5;
    let start = Math.max(1, currentPage - Math.floor(windowSize / 2));
    let end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    for (let p = start; p <= end; p += 1) pages.push(p);
    return pages;
  }, [currentPage, totalPages]);

  const summaryCards: Array<{
    label: string;
    value: string;
    hint: string;
    icon: React.ComponentType<{ className?: string }>;
    tone: string;
    accent?: string;
    valueClass?: string;
  }> = [
    {
      label: "Total Sales",
      value: formatCurrency(summary.totalSales),
      hint: "Filtered amount",
      icon: Wallet,
      tone: "bg-emerald-50 text-emerald-600",
      accent: "bg-emerald-500",
      valueClass: "text-emerald-700",
    },
    {
      label: "Total Orders",
      value: String(summary.totalOrders),
      hint: "Matching records",
      icon: ShoppingBag,
      tone: "bg-blue-50 text-blue-600",
    },
    {
      label: "Total Refunds",
      value: formatCurrency(summary.totalRefunds),
      hint: `${summary.refundCount} ${summary.refundCount === 1 ? "refund" : "refunds"}`,
      icon: Undo2,
      tone: "bg-rose-50 text-rose-600",
      valueClass: toNumber(summary.totalRefunds) !== 0 ? "text-rose-600" : undefined,
    },
    {
      label: "Avg Order Value",
      value: formatCurrency(summary.averageOrderValue),
      hint: "Completed orders",
      icon: TrendingUp,
      tone: "bg-violet-50 text-violet-600",
    },
    {
      label: "Tax Collected",
      value: formatCurrency(summary.totalTaxCollected),
      hint: "VAT / GST",
      icon: Landmark,
      tone: "bg-sky-50 text-sky-600",
    },
    {
      label: "Discounts",
      value: formatCurrency(summary.totalDiscounts),
      hint: "Applied discounts",
      icon: Tag,
      tone: "bg-amber-50 text-amber-600",
    },
  ];

  const filterLabelClass = "text-xs font-semibold text-indigo-900/80";
  const filterControlClass = "h-9 border-indigo-200/80 bg-white shadow-sm";

  if (editSale) {
    return (
      <EditSaleDialog
        sale={editSale}
        open
        onOpenChange={(open) => {
          if (!open) setEditSale(null);
        }}
        onUpdated={() => {
          refetch();
          if (viewRowId && viewRowId === editSale.id) {
            viewQuery.refetch();
          }
          setReprintSale(editSale);
        }}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Sales History"
        description="Professional sales ledger with filters, exports, and receipt tools"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefreshing}
              title="Refresh"
            >
              <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
              <Filter className="mr-2 h-4 w-4" />
              Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={exporting}>
                  {exporting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("csv")}>
                  <FileText className="mr-2 h-4 w-4" /> Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("xlsx")}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf")}>
                  <Printer className="mr-2 h-4 w-4" /> Export PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <PageBody className="space-y-5">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {isFirstLoad
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={`sum-skel-${i}`} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-6 w-28" />
                </div>
              ))
            : summaryCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.label}
                    className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    {card.accent ? (
                      <span className={cn("absolute inset-y-0 left-0 w-1", card.accent)} aria-hidden />
                    ) : null}
                    <div className="flex items-center justify-between gap-2">
                      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", card.tone)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300" /> : null}
                    </div>
                    <p className="mt-3 truncate text-xs font-medium uppercase tracking-wider text-slate-500">
                      {card.label}
                    </p>
                    <p
                      className={cn(
                        "mt-1 truncate text-lg font-semibold tracking-tight text-slate-900 nums transition-opacity sm:text-xl",
                        card.valueClass,
                        isRefreshing && "opacity-40",
                      )}
                    >
                      {card.value}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{card.hint}</p>
                  </div>
                );
              })}
        </div>

        {/* Filters */}
        {showFilters && (
          <Card className="overflow-hidden rounded-xl border-indigo-100 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                  <SlidersHorizontal className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    Filters
                    {activeFilterCount > 0 ? (
                      <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white nums">
                        {activeFilterCount} active
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    Narrow down sales by date, payment, status{isAdmin ? ", cashier or branch" : " or cashier"}
                  </p>
                </div>
              </div>
              {isRefreshing ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Updating…
                </span>
              ) : null}
              <div className="ml-auto flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearFilters}
                    className="h-8 border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800"
                  >
                    <X className="mr-1 h-3.5 w-3.5" /> Clear filters
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-500"
                  onClick={() => setShowFilters(false)}
                  title="Hide filters"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-4 border-t border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-indigo-50/30 px-4 py-4 sm:px-5">
              <div className="grid grid-cols-1 gap-x-3 gap-y-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1.5 md:col-span-2">
                  <Label className={filterLabelClass}>Search</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      className={cn(filterControlClass, "pl-9")}
                      placeholder="Search invoice #, sale #, customer, barcode notes…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm("")}
                        className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Clear search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className={filterLabelClass}>Date range</Label>
                  <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
                    <SelectTrigger className={filterControlClass}>
                      <SelectValue placeholder="Date range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All dates</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="yesterday">Yesterday</SelectItem>
                      <SelectItem value="week">This Week</SelectItem>
                      <SelectItem value="month">This Month</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className={filterLabelClass}>Cashier</Label>
                  {isFirstLoad && cashiers.length === 0 ? (
                    <Skeleton className="h-9 w-full rounded-md" />
                  ) : (
                    <Select value={cashierId} onValueChange={setCashierId}>
                      <SelectTrigger className={filterControlClass}>
                        <SelectValue placeholder="Cashier" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Cashiers</SelectItem>
                        {cashiers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className={filterLabelClass}>Salesperson</Label>
                  <Select value={salespersonFilter} onValueChange={setSalespersonFilter}>
                    <SelectTrigger className={filterControlClass}>
                      <SelectValue placeholder="Salesperson" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Salespeople</SelectItem>
                      <SelectItem value="none">No salesperson picked</SelectItem>
                      {salespeople.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className={filterLabelClass}>Payment method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className={filterControlClass}>
                      <SelectValue placeholder="Payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Payment Methods</SelectItem>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className={filterLabelClass}>Payment status</Label>
                  <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                    <SelectTrigger className={filterControlClass}>
                      <SelectValue placeholder="Payment status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Payment Statuses</SelectItem>
                      {PAYMENT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className={filterLabelClass}>Order status</Label>
                  <Select value={orderStatus} onValueChange={setOrderStatus}>
                    <SelectTrigger className={filterControlClass}>
                      <SelectValue placeholder="Order status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Order Statuses</SelectItem>
                      {ORDER_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isAdmin && (
                  <div className="space-y-1.5">
                    <Label className={filterLabelClass}>Branch</Label>
                    {branchesLoading && branches.length === 0 ? (
                      <Skeleton className="h-9 w-full rounded-md" />
                    ) : (
                      <Select value={branchFilter} onValueChange={setBranchFilter}>
                        <SelectTrigger className={filterControlClass}>
                          <SelectValue placeholder="Branch" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Branches</SelectItem>
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>

              {datePreset === "custom" && (
                <div className="grid max-w-xl grid-cols-1 gap-3 border-t border-dashed border-indigo-200 pt-4 sm:grid-cols-2 sm:items-end [&_label]:text-xs [&_label]:font-semibold [&_label]:text-indigo-900/80">
                  <DateField
                    label="From"
                    value={customStart}
                    onChange={setCustomStart}
                    triggerClassName={filterControlClass}
                  />
                  <DateField
                    label="To"
                    value={customEnd}
                    onChange={setCustomEnd}
                    triggerClassName={filterControlClass}
                  />
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Sales list */}
        <Card className="relative overflow-hidden rounded-xl border-slate-200 shadow-sm">
          {isRefreshing ? (
            <div className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-slate-100" aria-hidden>
              <div className="h-full w-1/3 animate-[sales-history-progress_1.1s_ease-in-out_infinite] rounded-full bg-slate-900" />
            </div>
          ) : null}
          <style>{`@keyframes sales-history-progress{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-slate-900">
                Sales
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600 nums">
                  {isFirstLoad ? "…" : totalSales}
                </span>
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 nums">
                {isFirstLoad
                  ? "Loading sales…"
                  : `Showing ${pageStart}–${pageEnd} of ${totalSales}${
                      !isAdmin
                        ? " · your branch only"
                        : branchFilter === "all"
                          ? " · all branches"
                          : ""
                    }`}
              </p>
            </div>
            {!showFilters ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800"
                onClick={() => setShowFilters(true)}
              >
                <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                Show filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
              </Button>
            ) : null}
          </div>

          <div className="relative min-h-[320px]" aria-busy={loading}>
            {isRefreshing ? (
              <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/70 pt-24 backdrop-blur-[1px]">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-md">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                  Updating sales…
                </div>
              </div>
            ) : null}

            {isFirstLoad ? (
              <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={`card-skel-${i}`} className="space-y-4 rounded-xl border border-slate-200 p-4">
                    <div className="flex justify-between">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                      <Skeleton className="h-6 w-24" />
                    </div>
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ))}
              </div>
            ) : sales.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-20 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <Receipt className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900">No sales found</h3>
                <p className="mt-1 max-w-sm text-xs text-slate-500">
                  Adjust your search or filters to find transactions.
                </p>
                {activeFilterCount > 0 ? (
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
              <div className="grid grid-cols-1 gap-4 bg-slate-50/50 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
                {sales.map((sale) => {
                  // A refunded ORIGINAL sale is still a sale (shows a REFUNDED
                  // status badge). "Refund"/"Exchange" here mean the row itself
                  // is a return/exchange transaction (has an original_sale_id).
                  const isExchange =
                    !!sale.original_sale_id && sale.status === "EXCHANGED";
                  const isRefund =
                    (!!sale.original_sale_id && !isExchange) ||
                    toNumber(sale.total_amount) < 0;
                  const isNegative = toNumber(sale.total_amount) < 0;
                  const customer = customerLabel(sale);

                  return (
                    <div
                      key={sale.id}
                      className={cn(
                        "group relative flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                        isRefund
                          ? "border-rose-200 hover:border-rose-300"
                          : isExchange
                            ? "border-violet-200 hover:border-violet-300"
                            : "border-slate-200 hover:border-slate-300",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute inset-x-0 top-0 h-1",
                          isRefund ? "bg-rose-500" : isExchange ? "bg-violet-500" : "bg-emerald-500",
                        )}
                        aria-hidden
                      />

                      {/* Head: invoice + amount */}
                      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-5">
                        <button
                          type="button"
                          onClick={() => openSaleDetails(sale)}
                          className="min-w-0 text-left"
                          title="View invoice"
                        >
                          <p className="truncate font-mono text-sm font-semibold text-slate-900 group-hover:text-indigo-700">
                            {sale.invoice_number || sale.sale_number}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 nums">
                            <CalendarIcon className="h-3.5 w-3.5" />
                            {format(parseISO(sale.sale_date), "MMM dd, yyyy · hh:mm a")}
                          </p>
                        </button>
                        <p
                          className={cn(
                            "shrink-0 text-lg font-semibold tracking-tight nums",
                            isNegative ? "text-rose-600" : "text-slate-900",
                          )}
                        >
                          {formatCurrency(sale.total_amount)}
                        </p>
                      </div>

                      {/* Status pills */}
                      <div className="flex flex-wrap items-center gap-1.5 px-4">
                        <SalePill
                          tone={
                            isExchange
                              ? "bg-violet-50 text-violet-700 ring-violet-600/20"
                              : isRefund
                                ? "bg-rose-50 text-rose-700 ring-rose-600/20"
                                : "bg-slate-900 text-white ring-slate-900"
                          }
                          dot={false}
                        >
                          {isExchange ? "Exchange" : isRefund ? "Refund" : "Sale"}
                        </SalePill>
                        <SalePill tone={orderStatusTone(sale.status)}>{sale.status}</SalePill>
                        <SalePill tone={paymentStatusTone(sale.payment_status)}>
                          {sale.payment_status || "PAID"}
                        </SalePill>
                      </div>

                      {/* Details */}
                      <div className="mt-4 space-y-3 px-4 text-sm">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                            {customer === "Guest" ? <User className="h-3.5 w-3.5" /> : initialsOf(customer)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-slate-900">{customer}</p>
                            <p className="truncate text-xs text-slate-500">
                              Cashier · {cashierLabel(sale)}
                              {sale.salesperson ? (
                                <span className="text-[#8a6520]"> · Salesperson · {sale.salesperson.name}</span>
                              ) : null}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="truncate">{sale.branch?.name || "—"}</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                            {(sale.payment_method || "CASH").replace("_", " ")}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5 text-slate-400" />
                            {itemCount(sale) > 0
                              ? `${itemCount(sale)} items · Qty ${formatQty(totalQuantity(sale))}`
                              : "No line items saved"}
                          </span>
                        </div>
                      </div>

                      {/* Amount breakdown */}
                      <div className="mx-4 mt-4 grid grid-cols-3 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-slate-50/70 text-xs">
                        {[
                          { label: "Subtotal", value: sale.subtotal },
                          { label: "Discount", value: sale.discount_amount },
                          { label: "Tax", value: sale.tax_amount },
                        ].map((item) => (
                          <div key={item.label} className="min-w-0 px-2.5 py-2">
                            <p className="text-[11px] text-slate-500">{item.label}</p>
                            <p className="truncate font-semibold text-slate-800 nums">{formatCurrency(item.value)}</p>
                          </div>
                        ))}
                      </div>

                      {/* Actions */}
                      <div className="mt-4 flex items-center gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                        <Button
                          size="sm"
                          className="h-8 flex-1"
                          onClick={() => openSaleDetails(sale)}
                        >
                          <Eye className="mr-1.5 h-4 w-4" />
                          View
                        </Button>
                        {canManageSales && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 bg-white"
                            onClick={() => openEditSale(sale)}
                            disabled={!!sale.original_sale_id || !!actionBusy}
                          >
                            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                          </Button>
                        )}
                        {canManageSales && (
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 border-rose-200 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            disabled={!!actionBusy}
                            onClick={() => setDeleteTarget(sale)}
                            title="Delete sale"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 bg-white"
                              title="More actions"
                              disabled={
                                !!actionBusy && actionBusy.saleId === sale.id
                              }
                            >
                              {actionBusy?.saleId === sale.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault();
                                openSaleDetails(sale);
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View Invoice
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!!actionBusy}
                              onSelect={(e) => {
                                e.preventDefault();
                                handlePrintReceipt(sale);
                              }}
                            >
                              {isSaleBusy(sale.id, "print") ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Printer className="mr-2 h-4 w-4" />
                              )}
                              Print Receipt
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!!actionBusy}
                              onSelect={(e) => {
                                e.preventDefault();
                                handleDownloadPdf(sale);
                              }}
                            >
                              {isSaleBusy(sale.id, "pdf") ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="mr-2 h-4 w-4" />
                              )}
                              Download PDF
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {canManageSales && (
                              <DropdownMenuItem
                                disabled={
                                  !!sale.original_sale_id || !!actionBusy
                                }
                                onSelect={(e) => {
                                  e.preventDefault();
                                  openEditSale(sale);
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" /> Edit Sale
                              </DropdownMenuItem>
                            )}
                            {canManageSales && (
                              <DropdownMenuItem
                                disabled={!!sale.original_sale_id || sale.status === "CANCELLED" || !!actionBusy}
                                onSelect={(e) => {
                                  e.preventDefault();
                                  setSalespersonTarget(sale);
                                }}
                              >
                                <UserCog className="mr-2 h-4 w-4" />
                                {sale.salesperson ? "Change salesperson" : "Set salesperson"}
                              </DropdownMenuItem>
                            )}
                            {canManageSales && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  disabled={!!actionBusy}
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    setDeleteTarget(sale);
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                                {isAdmin && (
                                  <DropdownMenuItem
                                    disabled={
                                      sale.status === "CANCELLED" ||
                                      !!sale.original_sale_id ||
                                      !!actionBusy
                                    }
                                    onSelect={(e) => {
                                      e.preventDefault();
                                      setCancelTarget(sale);
                                    }}
                                  >
                                    Void bill
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="page-size" className="whitespace-nowrap text-xs text-slate-500">
                  Cards per page
                </Label>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => {
                    setPageSize(Number(value));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-[76px]" id="page-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-slate-500 nums">
                Page <span className="font-medium text-slate-900">{currentPage}</span> of{" "}
                <span className="font-medium text-slate-900">{totalPages}</span>
                <span className="mx-1.5 text-slate-300">•</span>
                {totalSales} total
              </p>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage <= 1 || loading}
                onClick={() => setCurrentPage(1)}
                title="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage <= 1 || loading}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                title="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {pageNumbers.map((page) => (
                <Button
                  key={page}
                  variant={page === currentPage ? "default" : "outline"}
                  size="sm"
                  className="h-8 min-w-[36px] nums"
                  disabled={loading}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              ))}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage >= totalPages || loading}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                title="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage >= totalPages || loading}
                onClick={() => setCurrentPage(totalPages)}
                title="Last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </PageBody>

      {/* Invoice / Receipt — DetailSheet (large: tables + receipt preview) */}
      <DetailSheet
        open={viewOpen}
        onOpenChange={(open) => {
          if (!open) closeView();
        }}
        size="xl"
      >
        <DetailSheetHeader
          title={`Invoice ${viewSale?.invoice_number || viewSale?.sale_number || ""}`}
          subtitle="Sale details and branded receipt"
          icon={<Receipt className="h-5 w-5" />}
          actions={
            viewSale ? (
              <div className="flex flex-wrap items-center gap-2">
                {canManageSales && !viewSale.original_sale_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={!!actionBusy}
                    onClick={() => openEditSale(viewSale)}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                  </Button>
                )}
                {canManageSales && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-destructive hover:text-destructive"
                    disabled={!!actionBusy}
                    onClick={() => setDeleteTarget(viewSale)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={!!actionBusy && actionBusy.saleId === viewSale.id}
                    >
                      {actionBusy?.saleId === viewSale.id ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Printer className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Print / Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                      disabled={!!actionBusy}
                      onSelect={(e) => {
                        e.preventDefault();
                        handlePrintReceipt(viewSale);
                      }}
                    >
                      {isSaleBusy(viewSale.id, "print") ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Printer className="mr-2 h-4 w-4" />
                      )}
                      Print Receipt
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleBrowserPrint} disabled={!!actionBusy}>
                      <FileText className="mr-2 h-4 w-4" /> Browser Print
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!!actionBusy}
                      onSelect={(e) => {
                        e.preventDefault();
                        handleDownloadPdf(viewSale);
                      }}
                    >
                      {isSaleBusy(viewSale.id, "pdf") ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-4 w-4" />
                      )}
                      Download PDF
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!!actionBusy}
                      onSelect={async (e) => {
                        e.preventDefault();
                        if (!viewSale) return;
                        await runSaleAction(viewSale.id, "whatsapp", async () => {
                          const detailed = await fetchSaleDetails(viewSale);
                          const data = buildReceiptFromSale(detailed);
                          try {
                            const { fellBack } = await shareReceiptOnWhatsApp(
                              data,
                              logoDataUri,
                              viewSale.customer?.phone_number ||
                                viewSale.customer?.mobile_number ||
                                "",
                            );
                            if (fellBack) {
                              toast({
                                title: "Receipt downloaded",
                                description: "Attach the PDF in WhatsApp chat.",
                              });
                            }
                          } catch (err: any) {
                            toast({
                              title: err?.message || "Failed to share",
                              variant: "destructive",
                            });
                          }
                        });
                      }}
                    >
                      {isSaleBusy(viewSale.id, "whatsapp") ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <MessageCircle className="mr-2 h-4 w-4" />
                      )}
                      WhatsApp
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : undefined
          }
        />

        <DetailSheetBody className="space-y-3">
          {receiptPrinter && (
            <p className="text-xs text-muted-foreground">Printer: {receiptPrinter}</p>
          )}
          {viewLoading || !viewSale ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Date & Time</p>
                    <p className="font-medium text-sm nums">
                      {format(parseISO(viewSale.sale_date), "PPpp")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cashier</p>
                    <p className="font-medium text-sm">{cashierLabel(viewSale)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Salesperson</p>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{salespersonLabel(viewSale)}</p>
                      {canManageSales && !viewSale.original_sale_id && viewSale.status !== "CANCELLED" ? (
                        <button
                          type="button"
                          onClick={() => setSalespersonTarget(viewSale)}
                          className="text-xs font-medium text-[#8a6520] hover:underline"
                        >
                          {viewSale.salesperson ? "Change" : "Set"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Customer</p>
                    <p className="font-medium text-sm">{customerLabel(viewSale)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Branch</p>
                    <p className="font-medium text-sm">{viewSale.branch?.name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Payment</p>
                    <p className="font-medium text-sm">
                      {(viewSale.payments?.length ?? 0) > 1 ? "Split" : viewSale.payment_method} · {viewSale.payment_status || "PAID"}
                    </p>
                    {viewSale.payments?.length ? (
                      <div className="mt-1 space-y-0.5">
                        {viewSale.payments.map((p) => (
                          <p key={p.id} className="flex justify-between gap-3 text-[11px] text-muted-foreground">
                            <span>
                              {p.method.replace("_", " ").toLowerCase()}
                              {p.reference ? ` · ${p.reference}` : ""}
                            </span>
                            <span className="nums font-medium text-foreground">Rs {Number(p.amount).toLocaleString()}</span>
                          </p>
                        ))}
                        {Number(viewSale.total_amount) - Number(viewSale.payment_received ?? 0) > 0.005 ? (
                          <p className="flex justify-between gap-3 text-[11px] text-amber-700">
                            <span>on customer account</span>
                            <span className="nums font-medium">
                              Rs {(Number(viewSale.total_amount) - Number(viewSale.payment_received ?? 0)).toLocaleString()}
                            </span>
                          </p>
                        ) : null}
                        {Number(viewSale.change_amount ?? 0) > 0 ? (
                          <p className="text-[11px] text-muted-foreground">Change given Rs {Number(viewSale.change_amount).toLocaleString()}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Order Status</p>
                    <Badge variant={statusBadgeVariant(viewSale.status)}>{viewSale.status}</Badge>
                    {viewSale.void_reason ? (
                      <p className="mt-1 text-[11px] text-destructive">
                        Voided{viewSale.voided_at ? ` ${format(parseISO(viewSale.voided_at), "dd MMM, HH:mm")}` : ""}: {viewSale.void_reason}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 text-xs uppercase tracking-wide">Item</TableHead>
                        <TableHead className="h-9 text-right text-xs uppercase tracking-wide">Qty</TableHead>
                        <TableHead className="h-9 text-right text-xs uppercase tracking-wide">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(viewSale.sale_items || []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                            No line items
                          </TableCell>
                        </TableRow>
                      ) : (
                        (viewSale.sale_items || []).map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="py-2">{item.product?.name || "Item"}</TableCell>
                            <TableCell className="py-2 text-right nums">{formatQty(item.quantity)}</TableCell>
                            <TableCell className="py-2 text-right nums">
                              {formatCurrency(item.line_total)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-1 rounded-md bg-muted/60 p-3">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span className="nums">{formatCurrency(viewSale.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Discount</span>
                    <span className="nums">{formatCurrency(viewSale.discount_amount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Tax</span>
                    <span className="nums">{formatCurrency(viewSale.tax_amount)}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t pt-2 mt-1">
                    <span>Total</span>
                    <span className="nums">{formatCurrency(viewSale.total_amount)}</span>
                  </div>
                </div>

                {viewSale.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="rounded-md border bg-background p-2 text-xs whitespace-pre-wrap break-words">
                      {viewSale.notes}
                    </p>
                  </div>
                )}

                {(viewSale.return_sales?.length || 0) > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Return History</p>
                    <div className="space-y-1">
                      {viewSale.return_sales!.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between rounded border px-2 py-1.5 text-xs"
                        >
                          <span className="font-mono">{r.sale_number}</span>
                          <span className="nums">{format(parseISO(r.sale_date), "MMM dd, yyyy")}</span>
                          <span className="text-red-600 nums">{formatCurrency(r.total_amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-md border bg-background overflow-hidden">
                <iframe
                  title="Receipt preview"
                  srcDoc={receiptHtml}
                  className="w-full h-[560px] border-0"
                />
              </div>
            </div>
          )}
        </DetailSheetBody>

        <DetailSheetFooter>
          <Button variant="outline" onClick={closeView}>
            Close
          </Button>
        </DetailSheetFooter>
      </DetailSheet>

      {/* Cancel confirm */}
      <ChangeSalespersonDialog
        sale={salespersonTarget}
        people={salespeople}
        onOpenChange={(open) => {
          if (!open) setSalespersonTarget(null);
        }}
        onSaved={() => {
          refetch();
          if (viewRowId) viewQuery.refetch();
        }}
      />

      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open && !cancelSaleM.isPending) setCancelTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void bill {cancelTarget?.invoice_number || cancelTarget?.sale_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The bill is marked CANCELLED, its items go back to stock and it drops out of sales totals.
              Use Return/Exchange instead when the customer is bringing goods back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Reason (required, saved in the audit trail)</Label>
            <Textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. Wrong items rung up, customer cancelled before leaving"
              className="min-h-[70px] text-sm"
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelSaleM.isPending}>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCancelSale();
              }}
              disabled={cancelSaleM.isPending || !voidReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelSaleM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Void bill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !removeSale.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sale?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete {deleteTarget?.sale_number}. This cannot be undone. Stock is not
              restored — use Refund/Return if you need inventory back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeSale.isPending}>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteSale();
              }}
              disabled={removeSale.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeSale.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete Sale
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Offer to regenerate / share the bill right after an edit is saved */}
      <AlertDialog
        open={!!reprintSale}
        onOpenChange={(open) => {
          if (!open) setReprintSale(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sale updated</AlertDialogTitle>
            <AlertDialogDescription>
              Generate the new bill for sale #{reprintSale?.sale_number}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid grid-cols-2 gap-2 py-1">
            <Button
              variant="outline"
              className="h-11 border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
              disabled={!!actionBusy}
              onClick={() => reprintSale && handleDownloadPdf(reprintSale)}
            >
              {reprintSale && isSaleBusy(reprintSale.id, "pdf") ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              PDF
            </Button>
            <Button
              variant="outline"
              className="h-11"
              disabled={!!actionBusy}
              onClick={() => reprintSale && handleEditedPrint(reprintSale)}
            >
              {reprintSale && isSaleBusy(reprintSale.id, "print") ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-2 h-4 w-4" />
              )}
              Print
            </Button>
            <Button
              className="col-span-2 h-11 bg-green-600 text-white hover:bg-green-700"
              disabled={!!actionBusy}
              onClick={async () => {
                if (!reprintSale) return;
                await runSaleAction(reprintSale.id, "whatsapp", async () => {
                  const detailed = await fetchSaleDetails(reprintSale);
                  const data = buildReceiptFromSale(detailed);
                  try {
                    const { fellBack } = await shareReceiptOnWhatsApp(
                      data,
                      logoDataUri,
                      reprintSale.customer?.phone_number ||
                        reprintSale.customer?.mobile_number ||
                        "",
                    );
                    if (fellBack) {
                      toast({
                        title: "Receipt downloaded",
                        description: "Attach the PDF in WhatsApp chat.",
                      });
                    }
                  } catch (err: any) {
                    toast({
                      title: err?.message || "Failed to share",
                      variant: "destructive",
                    });
                  }
                });
              }}
            >
              {reprintSale && isSaleBusy(reprintSale.id, "whatsapp") ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MessageCircle className="mr-2 h-4 w-4" />
              )}
              WhatsApp
            </Button>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!actionBusy}>Done</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
