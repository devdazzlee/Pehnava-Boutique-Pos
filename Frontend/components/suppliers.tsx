"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import { DateField, YmdDatePicker } from "@/components/ui/date-picker"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import {
  Search,
  Plus,
  Loader2,
  Edit,
  Eye,
  Trash2,
  Truck,
  CheckCircle2,
  XCircle,
  ShoppingBag,
  Phone,
  Mail,
  MapPin,
  Building,
  Calendar,
  Package,
  List,
  LayoutGrid,
  X,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Scale,
  CalendarIcon,
  RefreshCcw,
  FileText,
  Printer,
} from "lucide-react";
import { z } from "zod";
import { LoadingButton } from "@/components/ui/loading-button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import {
  formatMoney,
  formatQty,
} from "@/components/inventory/stock-ops/export-utils";
import { useScrollToTopOnPageChange } from "@/hooks/use-scroll-to-top-on-page-change";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { extractApiError } from "@/lib/api/errors";
import {
  useSuppliers,
  useSupplierPurchases,
  useSupplierLedger,
  useSupplierStatement,
  useSupplierProducts,
  useSupplierMutations,
} from "@/hooks/queries/use-suppliers";
import { usePurchaseInvoices } from "@/hooks/queries/use-purchase-invoices";
import { useProductCostHistory } from "@/hooks/queries/use-products";

interface Supplier {
  id: string;
  code: string;
  name: string;
  phone_number?: string;
  fax_number?: string;
  mobile_number?: string;
  country?: string;
  city?: string;
  email?: string;
  ntn?: string;
  strn?: string;
  gov_id?: string;
  address?: string;
  display_on_pos: boolean;
  status: string;
  product_count: number;
  purchase_count?: number;
  created_at: string;
}

interface ProductSummaryRow {
  productId: string;
  productName: string;
  sku: string | null;
  totalQty: number;
  totalValue: number;
  purchaseCount: number;
}

interface PurchaseRow {
  id: string;
  purchase_date: string;
  quantity: number;
  cost_price: number;
  line_total: number;
  invoice_ref: string | null;
  notes: string | null;
  delivery_status?: string;
  product: { id: string; name: string; sku: string | null } | null;
  warehouse_branch: { id: string; name: string } | null;
}

interface LedgerEntry {
  id: string;
  date: string;
  type: "PURCHASE" | "INVOICE" | "RETURN" | "PAYMENT";
  description: string;
  reference: string | null;
  debit: number;
  credit: number;
  balance: number;
}

interface LedgerSummary {
  totalPurchased: number;
  totalPaid: number;
  totalReturned?: number;
  balanceDue: number;
  purchaseCount: number;
  returnCount?: number;
  paymentCount: number;
}

interface SupplierProductRow {
  id: string;
  name: string;
  sku: string | null;
  code: string | null;
  is_active: boolean;
  purchase_rate: number;
  sales_rate: number;
  category: string | null;
  unit: string | null;
  purchase_count: number;
}

interface PaymentRow {
  id: string;
  amount: number;
  payment_date: string;
  method: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
  user?: { email: string } | null;
}

const phoneRegex = /^[0-9+\-\s()]+$/;

const optionalPhone = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || (v.length >= 7 && v.length <= 20), {
    message: "Must be 7-20 characters",
  })
  .refine((v) => !v || phoneRegex.test(v), {
    message: "Only digits, +, -, spaces, and ( ) allowed",
  });

const supplierFormSchema = z.object({
  name: z
    .string({ required_error: "Name is required" })
    .trim()
    .min(1, "Name is required")
    .max(100, "Name is too long"),
  phone_number: optionalPhone,
  fax_number: optionalPhone,
  mobile_number: optionalPhone,
  email: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "Invalid email address",
    }),
  country: z.string().trim().optional(),
  city: z.string().trim().optional(),
  ntn: z.string().trim().optional(),
  strn: z.string().trim().optional(),
  gov_id: z.string().trim().optional(),
  address: z.string().trim().optional(),
  display_on_pos: z.boolean().optional(),
});

type SupplierFormErrors = Partial<
  Record<keyof z.infer<typeof supplierFormSchema>, string>
>;

const zodErrorsToMap = (err: z.ZodError): SupplierFormErrors => {
  const map: SupplierFormErrors = {};
  for (const issue of err.errors) {
    const key = issue.path[0] as keyof SupplierFormErrors | undefined;
    if (key && !map[key]) map[key] = issue.message;
  }
  return map;
};

const firstZodError = (err: z.ZodError) =>
  err.errors[0]?.message || "Please fix the highlighted fields";

type SupplierForm = z.infer<typeof supplierFormSchema>;

const emptyForm: SupplierForm = {
  name: "",
  phone_number: "",
  fax_number: "",
  mobile_number: "",
  country: "",
  city: "",
  email: "",
  ntn: "",
  strn: "",
  gov_id: "",
  address: "",
  display_on_pos: true,
};

const PAYMENT_METHODS = [
  "CASH",
  "BANK_TRANSFER",
  "CHEQUE",
  "CARD",
  "OTHER",
] as const;

const PAGE_SIZE = 20;

const supplierFieldLabelClass = "text-xs font-medium text-foreground";
const supplierFieldControlClass = "h-9 text-sm";

type StatusFilter = "all" | "active" | "inactive" | "pos";
type DetailTab = "overview" | "purchases" | "ledger" | "products";

function isActiveSupplier(s: Supplier) {
  return (s.status || "").toLowerCase() === "active";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface SupplierFormFieldsProps {
  idPrefix: string;
  form: SupplierForm;
  errors: SupplierFormErrors;
  onFieldChange: <K extends keyof SupplierForm>(
    key: K,
    value: SupplierForm[K],
  ) => void;
  disabled?: boolean;
}

function SupplierFormFields({
  idPrefix,
  form,
  errors,
  onFieldChange,
  disabled = false,
}: SupplierFormFieldsProps) {
  const renderInput = (
    key: keyof SupplierForm,
    label: string,
    placeholder: string,
    required = false,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`${idPrefix}-${key}`} className={supplierFieldLabelClass}>
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        id={`${idPrefix}-${key}`}
        value={(form[key] as string) ?? ""}
        onChange={(e) =>
          onFieldChange(key, e.target.value as SupplierForm[typeof key])
        }
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={errors[key] ? true : undefined}
        className={cn(
          supplierFieldControlClass,
          errors[key] && "border-destructive focus-visible:ring-destructive",
        )}
      />
      {errors[key] && (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {renderInput("name", "Name", "Enter name", true)}
        {renderInput("phone_number", "Phone", "Enter phone")}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {renderInput("fax_number", "Fax", "Enter fax")}
        {renderInput("mobile_number", "Mobile", "Enter mobile")}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {renderInput("email", "Email", "Enter email")}
        {renderInput("country", "Country", "Enter country")}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {renderInput("city", "City", "Enter city")}
        {renderInput("ntn", "NTN", "Enter ntn")}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {renderInput("strn", "STRN", "Enter strn")}
        {renderInput("gov_id", "Gov ID", "Enter gov id")}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id={`${idPrefix}-display_on_pos`}
          checked={form.display_on_pos ?? true}
          onCheckedChange={(checked) =>
            onFieldChange("display_on_pos", checked === true)
          }
          disabled={disabled}
        />
        <Label
          htmlFor={`${idPrefix}-display_on_pos`}
          className="cursor-pointer text-sm font-normal text-foreground"
        >
          Display on POS
        </Label>
      </div>

      <div className="space-y-1">
        <Label
          htmlFor={`${idPrefix}-address`}
          className={supplierFieldLabelClass}
        >
          Address
        </Label>
        <Input
          id={`${idPrefix}-address`}
          value={form.address || ""}
          onChange={(e) => onFieldChange("address", e.target.value)}
          placeholder="Enter address"
          disabled={disabled}
          className={supplierFieldControlClass}
        />
      </div>
    </div>
  );
}

const Suppliers: React.FC = () => {
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [page, setPage] = useState(1);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [current, setCurrent] = useState<Supplier | null>(null);

  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [errors, setErrors] = useState<SupplierFormErrors>({});

  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]>("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentInvoiceId, setPaymentInvoiceId] = useState("");
  const [paymentKind, setPaymentKind] = useState<"settle" | "upfront">(
    "settle",
  );
  const [paymentDeleteId, setPaymentDeleteId] = useState<string | null>(null);
  // Cost-history dialog (from the Products tab)
  const [costProductId, setCostProductId] = useState<string | null>(null);

  useScrollToTopOnPageChange(page);

  // Debounced search feeds the query hook (guide: 250 ms).
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const listParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      isActive:
        statusFilter === "active"
          ? true
          : statusFilter === "inactive"
            ? false
            : undefined,
      displayOnPos: statusFilter === "pos" ? true : undefined,
    }),
    [page, debouncedSearch, statusFilter],
  );

  const {
    suppliers: rawSuppliers,
    meta,
    isFirstLoad,
    isRefreshing,
    refetch,
    error: listError,
  } = useSuppliers(listParams);

  const allCountQuery = useSuppliers({ page: 1, limit: 1 });
  const activeCountQuery = useSuppliers({ page: 1, limit: 1, isActive: true });
  const inactiveCountQuery = useSuppliers({ page: 1, limit: 1, isActive: false });
  const posCountQuery = useSuppliers({ page: 1, limit: 1, displayOnPos: true });
  const statsLoading =
    allCountQuery.isPending ||
    activeCountQuery.isPending ||
    inactiveCountQuery.isPending;
  const stats = {
    total: allCountQuery.meta?.total ?? 0,
    activeCount: activeCountQuery.meta?.total ?? 0,
    inactiveCount: inactiveCountQuery.meta?.total ?? 0,
    posCount: posCountQuery.meta?.total ?? 0,
  };

  const list = rawSuppliers as unknown as Supplier[];
  const loading = isFirstLoad;
  const listMeta = meta ?? {
    total: 0,
    page: 1,
    limit: PAGE_SIZE,
    totalPages: 1,
  };

  const { create, update, remove, addPayment, deletePayment } =
    useSupplierMutations();
  const submitting = create.isPending || update.isPending;

  // ----- detail panel data (gated on the sheet being open) -----
  const detailId = detailOpen && current ? current.id : null;
  const purchasesQuery = useSupplierPurchases(detailId);
  const ledgerQuery = useSupplierLedger(detailId);
  const productsQuery = useSupplierProducts(detailId, {
    enabled: detailTab === "products",
  });
  const openInvoicesQuery = usePurchaseInvoices(
    { supplierId: detailId ?? undefined, limit: 100 },
    { enabled: !!detailId && detailTab === "ledger" },
  );
  const openInvoices = useMemo(
    () => (openInvoicesQuery.data?.data ?? []).filter((i) => i.status !== "PAID"),
    [openInvoicesQuery.data],
  );
  const costHistoryQuery = useProductCostHistory(costProductId, {
    enabled: !!costProductId,
  });

  // ----- statement (its own modal, date-ranged, printable) -----
  const [statementOpen, setStatementOpen] = useState(false);
  const stmtMonthStart = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  };
  const stmtToday = () => new Date().toISOString().slice(0, 10);
  const [stmtFrom, setStmtFrom] = useState(stmtMonthStart);
  const [stmtTo, setStmtTo] = useState(stmtToday);
  const statementQuery = useSupplierStatement(
    statementOpen && current ? current.id : null,
    { from: stmtFrom || undefined, to: stmtTo || undefined },
    { enabled: statementOpen },
  );
  const printStatement = () => {
    const s = statementQuery.data;
    if (!s) return;
    const shop = localStorage.getItem("branchName") || "Pehnawa Boutique";
    const rows = [
      `<tr><td>${stmtFrom || "—"}</td><td>Opening balance</td><td></td><td></td><td class="r">${formatMoney(
        s.summary?.openingBalance || 0,
      )}</td></tr>`,
      ...(s.entries as LedgerEntry[]).map(
        (e) =>
          `<tr><td>${formatDate(e.date)}</td><td>${e.description}</td><td class="r">${
            e.debit ? formatMoney(e.debit) : ""
          }</td><td class="r">${e.credit ? formatMoney(e.credit) : ""}</td><td class="r">${formatMoney(
            e.balance,
          )}</td></tr>`,
      ),
      `<tr class="tot"><td colspan="2">Closing balance</td><td class="r">${formatMoney(
        s.summary?.totalDebit || 0,
      )}</td><td class="r">${formatMoney(s.summary?.totalCredit || 0)}</td><td class="r">${formatMoney(
        s.summary?.closingBalance || 0,
      )}</td></tr>`,
    ].join("");
    const html = `<!doctype html><html><head><title>Statement</title><style>
      *{font-family:Arial,Helvetica,sans-serif;font-size:12px}body{margin:16px;color:#111}
      h1{font-size:15px;margin:0;text-align:center}.sub{text-align:center;color:#666;margin:2px 0 12px}
      .meta div{display:flex;gap:8px}.meta span:first-child{color:#666;min-width:70px}
      table{width:100%;border-collapse:collapse}th,td{padding:4px 6px;border-bottom:1px solid #ddd;text-align:left}
      th{color:#666}.r{text-align:right}.tot td{font-weight:700;border-top:2px solid #333}
      @media print{body{margin:0}}
    </style></head><body>
      <h1>${shop}</h1><div class="sub">Supplier Account Statement</div>
      <div class="meta">
        <div><span>Supplier</span><b>${s.supplier?.name || "—"}</b></div>
        <div><span>Phone</span>${s.supplier?.phone_number || "—"}</div>
        <div><span>Period</span>${stmtFrom || "—"} to ${stmtTo || "—"}</div>
      </div>
      <table><thead><tr><th>Date</th><th>Description</th><th class="r">Debit</th><th class="r">Credit</th><th class="r">Balance</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}<\/script>
    </body></html>`;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) {
      toast({ variant: "destructive", title: "Enable pop-ups to print the statement" });
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  const purchasesLoading = purchasesQuery.isLoading;
  const ledgerLoading = ledgerQuery.isLoading;

  const { purchases, productSummary, purchaseSummary } = useMemo(() => {
    const data = (purchasesQuery.data ?? {}) as any;
    return {
      purchases: (data.purchases || []) as PurchaseRow[],
      productSummary: (data.productSummary || []) as ProductSummaryRow[],
      purchaseSummary: (data.summary || {
        purchaseCount: 0,
        productCount: 0,
        totalQuantity: 0,
        totalValue: 0,
      }) as {
        purchaseCount: number;
        productCount: number;
        totalQuantity: number;
        totalValue: number;
      },
    };
  }, [purchasesQuery.data]);

  const { ledgerSummary, ledgerEntries, payments } = useMemo(() => {
    const data = (ledgerQuery.data ?? {}) as any;
    return {
      ledgerSummary: ledgerQuery.data
        ? ((data.summary || null) as LedgerSummary | null)
        : null,
      ledgerEntries: (data.entries || []) as LedgerEntry[],
      payments: (data.payments || []) as PaymentRow[],
    };
  }, [ledgerQuery.data]);

  useEffect(() => {
    if (listError) {
      toast({
        variant: "destructive",
        title: "Failed to load suppliers",
        description: extractApiError(listError, "Failed to load suppliers"),
      });
    }
  }, [listError]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (purchasesQuery.error) {
      toast({
        variant: "destructive",
        title: "Failed to load purchases",
        description: extractApiError(
          purchasesQuery.error,
          "Failed to load purchases",
        ),
      });
    }
  }, [purchasesQuery.error]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ledgerQuery.error) {
      toast({
        variant: "destructive",
        title: "Failed to load ledger",
        description: extractApiError(ledgerQuery.error, "Failed to load ledger"),
      });
    }
  }, [ledgerQuery.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetPaymentForm = () => {
    setPaymentAmount("");
    setPaymentDate(new Date());
    setPaymentMethod("CASH");
    setPaymentReference("");
    setPaymentNotes("");
    setPaymentInvoiceId("");
    setPaymentKind("settle");
  };

  useEffect(() => {
    if (paymentKind !== "settle") return;
    const due = Number(ledgerSummary?.balanceDue || 0);
    if (due <= 0) return;
    setPaymentAmount((prev) =>
      prev === "" ? String(Number(due.toFixed(2))) : prev,
    );
  }, [paymentKind, ledgerSummary?.balanceDue]);

  const openDetail = (s: Supplier, tab: DetailTab = "overview") => {
    setCurrent(s);
    setDetailTab(tab);
    setDetailOpen(true);
    resetPaymentForm();
  };

  const handleSearchChange = (v: string) => {
    setSearch(v);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPage(1);
  };

  const openAdd = () => {
    setForm(emptyForm);
    setErrors({});
    setCurrent(null);
    setAddOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setCurrent(s);
    setForm({
      name: s.name,
      phone_number: s.phone_number || "",
      fax_number: s.fax_number || "",
      mobile_number: s.mobile_number || "",
      country: s.country || "",
      city: s.city || "",
      email: s.email || "",
      ntn: s.ntn || "",
      strn: s.strn || "",
      gov_id: s.gov_id || "",
      address: s.address || "",
      display_on_pos: s.display_on_pos,
    });
    setErrors({});
    setEditOpen(true);
  };

  const setField = <K extends keyof SupplierForm>(
    key: K,
    value: SupplierForm[K],
  ) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((p) => ({ ...p, [key]: undefined }));
  };

  const closeForm = () => {
    setAddOpen(false);
    setEditOpen(false);
    setErrors({});
    if (!detailOpen) setCurrent(null);
  };

  const submit = () => {
    const parsed = supplierFormSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(zodErrorsToMap(parsed.error));
      toast({ variant: "destructive", title: firstZodError(parsed.error) });
      return;
    }
    setErrors({});

    const data = parsed.data;
    const payload: Record<string, any> = {
      name: data.name,
      display_on_pos: data.display_on_pos ?? true,
      status: current?.status === "inactive" ? "inactive" : "active",
    };
    (
      [
        "phone_number",
        "fax_number",
        "mobile_number",
        "email",
        "country",
        "city",
        "ntn",
        "strn",
        "gov_id",
        "address",
      ] as const
    ).forEach((k) => {
      const v = data[k];
      if (v && v.length > 0) payload[k] = v;
      else if (current) payload[k] = null;
    });

    const onError = (e: unknown) =>
      toast({
        variant: "destructive",
        title: "Could not save supplier",
        description: extractApiError(e, "Failed to save supplier"),
      });

    if (current && editOpen) {
      update.mutate(
        { id: current.id, body: payload },
        {
          onSuccess: () => {
            toast({ title: "Supplier updated" });
            setEditOpen(false);
            if (!detailOpen) setCurrent(null);
          },
          onError,
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast({ title: "Supplier created" });
          setAddOpen(false);
        },
        onError,
      });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    remove.mutate(target.id, {
      onSuccess: () => {
        toast({ title: "Supplier deleted" });
        setDeleteTarget(null);
        if (current?.id === target.id) {
          setDetailOpen(false);
          setCurrent(null);
        }
      },
      onError: (e) =>
        toast({
          variant: "destructive",
          title: "Could not delete supplier",
          description: extractApiError(e, "Failed to delete supplier"),
        }),
    });
  };

  const submitPayment = () => {
    if (!current) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "Enter a valid payment amount" });
      return;
    }
    const kindNote =
      paymentKind === "upfront"
        ? "Upfront / advance payment"
        : "Settle supplier credit";
    addPayment.mutate(
      {
        id: current.id,
        body: {
          amount,
          paymentDate: paymentDate ? paymentDate.toISOString() : undefined,
          method: paymentMethod,
          reference: paymentReference.trim() || undefined,
          purchaseInvoiceId: paymentInvoiceId || undefined,
          notes:
            [kindNote, paymentNotes.trim()].filter(Boolean).join(" · ") ||
            undefined,
        },
      },
      {
        onSuccess: () => {
          toast({
            title:
              paymentKind === "upfront"
                ? "Upfront payment recorded"
                : "Credit payment recorded",
          });
          resetPaymentForm();
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Could not record payment",
            description: extractApiError(e, "Failed to record payment"),
          }),
      },
    );
  };

  const confirmDeletePayment = () => {
    if (!current || !paymentDeleteId) return;
    deletePayment.mutate(
      { id: current.id, paymentId: paymentDeleteId },
      {
        onSuccess: () => {
          toast({ title: "Payment deleted" });
          setPaymentDeleteId(null);
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Could not delete payment",
            description: extractApiError(e, "Failed to delete payment"),
          }),
      },
    );
  };

  const filtered = list;
  const totalPages = Math.max(1, listMeta.totalPages);
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered;

  const hasFilters = Boolean(search.trim()) || statusFilter !== "all";

  const statusChips: Array<{
    key: StatusFilter;
    label: string;
    count: number;
  }> = [
    { key: "all", label: "All", count: stats.total },
    { key: "active", label: "Active", count: stats.activeCount },
    { key: "inactive", label: "Inactive", count: stats.inactiveCount },
    { key: "pos", label: "On POS", count: stats.posCount },
  ];

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Manage suppliers, purchase history, and payables ledger"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefreshing}
              title="Refresh"
            >
              <RefreshCcw
                className={cn("h-4 w-4", isRefreshing && "animate-spin")}
              />
            </Button>
            <Button size="sm" onClick={openAdd}>
              <Plus className="mr-1.5 h-4 w-4" />
              New supplier
            </Button>
          </>
        }
      />

      <PageBody className="space-y-5">
        <InventoryKpiGrid
          columns={4}
          loading={statsLoading}
          items={[
            {
              label: "Total Suppliers",
              value: stats.total.toLocaleString(),
              icon: Truck,
              hint: "All suppliers in the system",
              onClick: () => {
                setStatusFilter("all");
                setPage(1);
              },
            },
            {
              label: "Active",
              value: stats.activeCount.toLocaleString(),
              icon: CheckCircle2,
              tone: "success",
              hint: "Available for purchases",
              onClick: () => {
                setStatusFilter("active");
                setPage(1);
              },
            },
            {
              label: "Inactive",
              value: stats.inactiveCount.toLocaleString(),
              icon: XCircle,
              tone: "danger",
              hint: "Disabled from new purchases",
              onClick: () => {
                setStatusFilter("inactive");
                setPage(1);
              },
            },
            {
              label: "Shown on POS",
              value: stats.posCount.toLocaleString(),
              icon: ShoppingBag,
              hint: "Visible in POS selection",
              onClick: () => {
                setStatusFilter("pos");
                setPage(1);
              },
            },
          ]}
        />

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {statusChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => {
                  setStatusFilter(chip.key);
                  setPage(1);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  statusFilter === chip.key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-foreground hover:bg-muted/50",
                )}
              >
                {chip.label}
                {statsLoading ? (
                  <span className="inline-block h-3 w-5 animate-pulse rounded-full bg-muted" />
                ) : (
                  <span className="nums text-muted-foreground">{chip.count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, code, phone, or email"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="h-9 pl-9"
              />
            </div>
            {hasFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={clearFilters}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Clear
              </Button>
            )}
            <div className="ml-auto flex items-center gap-1 rounded-md border border-border p-0.5">
              <Button
                type="button"
                size="sm"
                variant={viewMode === "table" ? "secondary" : "ghost"}
                className="h-8 px-2.5"
                onClick={() => setViewMode("table")}
                title="Table view"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                className="h-8 px-2.5"
                onClick={() => setViewMode("grid")}
                title="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">
                Supplier List{" "}
                <span className="font-normal text-muted-foreground">
                  {loading ? "(loading…)" : `(${listMeta.total})`}
                </span>
              </p>
              {isRefreshing && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-11 w-full animate-pulse rounded bg-muted"
                  />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="m-4 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12">
                <Truck className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No suppliers found
                </p>
                <p className="text-xs text-muted-foreground">
                  Try clearing filters or create a new supplier.
                </p>
              </div>
            ) : viewMode === "table" ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[100px] text-xs uppercase tracking-wide">
                        Code
                      </TableHead>
                      <TableHead className="min-w-[160px] text-xs uppercase tracking-wide">
                        Name
                      </TableHead>
                      <TableHead className="min-w-[120px] text-xs uppercase tracking-wide">
                        Contact
                      </TableHead>
                      <TableHead className="min-w-[140px] text-xs uppercase tracking-wide">
                        Email
                      </TableHead>
                      <TableHead className="min-w-[70px] text-xs uppercase tracking-wide">
                        POS
                      </TableHead>
                      <TableHead className="min-w-[90px] text-xs uppercase tracking-wide">
                        Status
                      </TableHead>
                      <TableHead className="min-w-[220px] text-right text-xs uppercase tracking-wide">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((s) => {
                      const active = isActiveSupplier(s);
                      return (
                        <TableRow key={s.id} className="h-11 hover:bg-muted/50">
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {s.code}
                          </TableCell>
                          <TableCell className="font-medium text-foreground">
                            {s.name}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {s.mobile_number || s.phone_number || "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {s.email || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                s.display_on_pos
                                  ? "border-primary/30 bg-primary/10 text-primary"
                                  : "border-border bg-muted text-muted-foreground"
                              }
                            >
                              {s.display_on_pos ? "Yes" : "No"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                active
                                  ? "border-green-200 bg-green-100 text-green-800"
                                  : "border-red-200 bg-red-100 text-red-800"
                              }
                            >
                              {active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                onClick={() => openDetail(s, "overview")}
                                title="View"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2.5 text-xs"
                                onClick={() => openDetail(s, "purchases")}
                              >
                                Purchases
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2.5 text-xs"
                                onClick={() => openDetail(s, "ledger")}
                              >
                                Ledger
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                onClick={() => openEdit(s)}
                                title="Edit"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget(s)}
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {pageRows.map((s) => {
                  const active = isActiveSupplier(s);
                  return (
                    <div
                      key={s.id}
                      className="space-y-3 rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">
                            {s.name}
                          </p>
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                            {s.code}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            active
                              ? "shrink-0 border-green-200 bg-green-100 text-green-800"
                              : "shrink-0 border-red-200 bg-red-100 text-red-800"
                          }
                        >
                          {active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>{s.mobile_number || s.phone_number || "No phone"}</p>
                        <p className="truncate">{s.email || "No email"}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => openDetail(s, "overview")}
                        >
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => openDetail(s, "purchases")}
                        >
                          Purchases
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => openDetail(s, "ledger")}
                        >
                          Ledger
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => openEdit(s)}
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {listMeta.total > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Page {pageSafe} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={pageSafe >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </PageBody>

      {/* Add / Edit — form has > 6 fields, so a DetailSheet with the form in
          the body (guide §2). */}
      <DetailSheet
        open={addOpen || editOpen}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
        size="lg"
      >
        <DetailSheetHeader
          title={editOpen && current ? "Edit supplier" : "Create supplier"}
          subtitle="Supplier contact, tax IDs and POS visibility"
        />
        <DetailSheetBody>
          <SupplierFormFields
            idPrefix={editOpen ? "edit" : "add"}
            form={form}
            errors={errors}
            onFieldChange={setField}
            disabled={submitting}
          />
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={closeForm} disabled={submitting}>
            Cancel
          </Button>
          <LoadingButton
            onClick={submit}
            loading={submitting}
            disabled={submitting}
          >
            {editOpen && current ? "Update supplier" : "Create supplier"}
          </LoadingButton>
        </DetailSheetFooter>
      </DetailSheet>

      {/* Detail: Overview / Purchases / Ledger */}
      <DetailSheet
        open={detailOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDetailOpen(false);
            setCurrent(null);
            resetPaymentForm();
          }
        }}
        size="xl"
      >
        <DetailSheetHeader
          title={current?.name || "Supplier"}
          subtitle={
            current ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  {current.code}
                </span>
                <Badge
                  variant="outline"
                  className={
                    isActiveSupplier(current)
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }
                >
                  {isActiveSupplier(current) ? "Active" : "Inactive"}
                </Badge>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Since {formatDate(current.created_at)}
                </span>
              </span>
            ) : undefined
          }
          icon={<Truck className="h-5 w-5" />}
        >
          <Tabs
            value={detailTab}
            onValueChange={(v) => setDetailTab(v as DetailTab)}
          >
            <TabsList className="h-9 w-full justify-start gap-4 rounded-none border-0 bg-transparent p-0">
              {(
                [
                  { key: "overview", label: "Overview" },
                  { key: "purchases", label: "Purchases" },
                  { key: "ledger", label: "Ledger" },
                  { key: "products", label: "Products" },
                ] as const
              ).map((t) => (
                <TabsTrigger
                  key={t.key}
                  value={t.key}
                  className="rounded-none border-b-2 border-transparent bg-transparent px-0 pb-2 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </DetailSheetHeader>

        <DetailSheetBody className="space-y-4">
          {current && detailTab === "overview" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-lg border border-border p-4">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  Contact
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Mobile</span>
                    <span className="font-medium text-foreground">
                      {current.mobile_number || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Phone</span>
                    <span className="font-medium text-foreground">
                      {current.phone_number || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" /> Email
                    </span>
                    <span className="break-all text-right font-medium text-foreground">
                      {current.email || "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border p-4">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  Address
                </h3>
                <p className="text-sm leading-relaxed text-foreground">
                  {current.address || "No address provided."}
                </p>
                {(current.city || current.country) && (
                  <p className="text-xs font-medium text-muted-foreground">
                    {[current.city, current.country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-3 rounded-lg border border-border p-4">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Building className="h-3.5 w-3.5" />
                  Tax & IDs
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">NTN</span>
                    <span className="font-mono text-xs font-semibold">
                      {current.ntn || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">STRN</span>
                    <span className="font-mono text-xs font-semibold">
                      {current.strn || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gov ID</span>
                    <span className="font-mono text-xs font-semibold">
                      {current.gov_id || "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border p-4">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Scale className="h-3.5 w-3.5" />
                  Quick balances
                </h3>
                {ledgerLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Purchased</span>
                      <span className="nums font-semibold">
                        {formatMoney(ledgerSummary?.totalPurchased || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Paid</span>
                      <span className="nums font-semibold text-green-700">
                        {formatMoney(ledgerSummary?.totalPaid || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-2">
                      <span className="font-medium text-foreground">
                        Balance due
                      </span>
                      <span
                        className={cn(
                          "nums font-bold",
                          (ledgerSummary?.balanceDue || 0) > 0
                            ? "text-red-700"
                            : "text-green-700",
                        )}
                      >
                        {formatMoney(ledgerSummary?.balanceDue || 0)}
                      </span>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 flex-1 text-xs"
                        onClick={() => setDetailTab("purchases")}
                      >
                        View purchases
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 flex-1 text-xs"
                        onClick={() => setDetailTab("ledger")}
                      >
                        Open ledger
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {current && detailTab === "purchases" && (
            <div className="space-y-4">
              <InventoryKpiGrid
                columns={4}
                loading={purchasesLoading}
                items={[
                  {
                    label: "Purchase lines",
                    value: purchaseSummary.purchaseCount.toLocaleString(),
                    icon: Package,
                  },
                  {
                    label: "Products",
                    value: purchaseSummary.productCount.toLocaleString(),
                    icon: ShoppingBag,
                  },
                  {
                    label: "Total qty",
                    value: formatQty(purchaseSummary.totalQuantity),
                    icon: Truck,
                  },
                  {
                    label: "Total value",
                    value: formatMoney(purchaseSummary.totalValue),
                    icon: Wallet,
                  },
                ]}
              />

              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  Products bought from this supplier
                </h3>
                {purchasesLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading purchases…
                  </div>
                ) : productSummary.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                    No purchases recorded for this supplier yet.
                  </p>
                ) : (
                  <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-border">
                    <Table className="min-w-[640px]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs uppercase tracking-wide">
                            Product
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide">
                            SKU
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
                            Qty
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
                            Value
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
                            Lines
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {productSummary.map((row) => (
                          <TableRow key={row.productId}>
                            <TableCell className="font-medium">
                              {row.productName}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {row.sku || "—"}
                            </TableCell>
                            <TableCell className="nums text-right">
                              {formatQty(row.totalQty)}
                            </TableCell>
                            <TableCell className="nums text-right">
                              {formatMoney(row.totalValue)}
                            </TableCell>
                            <TableCell className="nums text-right">
                              {row.purchaseCount}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  Purchase history
                </h3>
                {purchasesLoading ? null : purchases.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No line items.
                  </p>
                ) : (
                  <div className="max-h-[360px] w-full min-w-0 overflow-x-auto rounded-lg border border-border">
                    <Table className="min-w-[860px]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs uppercase tracking-wide">
                            Date
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide">
                            Product
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
                            Qty
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
                            Cost
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
                            Line total
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide">
                            Branch
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide">
                            Invoice
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {purchases.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="whitespace-nowrap text-sm">
                              {formatDate(p.purchase_date)}
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              {p.product?.name || "—"}
                            </TableCell>
                            <TableCell className="nums text-right">
                              {formatQty(p.quantity)}
                            </TableCell>
                            <TableCell className="nums text-right">
                              {formatMoney(p.cost_price)}
                            </TableCell>
                            <TableCell className="nums text-right font-medium">
                              {formatMoney(p.line_total)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {p.warehouse_branch?.name || "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {p.invoice_ref || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}

          {current && detailTab === "ledger" && (
            <div className="space-y-4">
              <InventoryKpiGrid
                columns={4}
                loading={ledgerLoading}
                items={[
                  {
                    label: "Total purchased",
                    value: formatMoney(ledgerSummary?.totalPurchased || 0),
                    icon: ArrowUpRight,
                    hint: `${ledgerSummary?.purchaseCount || 0} purchase lines`,
                  },
                  {
                    label: "Total paid",
                    value: formatMoney(ledgerSummary?.totalPaid || 0),
                    icon: ArrowDownLeft,
                    tone: "success",
                    hint: `${ledgerSummary?.paymentCount || 0} payments`,
                  },
                  {
                    label: "Balance due",
                    value: formatMoney(ledgerSummary?.balanceDue || 0),
                    icon: Scale,
                    tone:
                      (ledgerSummary?.balanceDue || 0) > 0
                        ? "danger"
                        : "success",
                    hint:
                      (ledgerSummary?.balanceDue || 0) > 0
                        ? "Still owed to this supplier"
                        : "Settled / advance on books",
                  },
                  {
                    label: "Payments",
                    value: (
                      ledgerSummary?.paymentCount || 0
                    ).toLocaleString(),
                    icon: Wallet,
                  },
                ]}
              />

              <div className="space-y-3 rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Record payment
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Pay down the balance due or record an upfront / advance
                      payment
                    </p>
                  </div>
                  {(ledgerSummary?.balanceDue || 0) > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => {
                        setPaymentKind("settle");
                        setPaymentAmount(
                          String(
                            Number(
                              (ledgerSummary?.balanceDue || 0).toFixed(2),
                            ),
                          ),
                        );
                      }}
                    >
                      Pay full balance
                    </Button>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPaymentKind("settle")}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-xs transition-colors",
                      paymentKind === "settle"
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span className="block font-semibold text-foreground">
                      Settle credit
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Pay amount you still owe
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentKind("upfront")}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-xs transition-colors",
                      paymentKind === "upfront"
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span className="block font-semibold text-foreground">
                      Upfront / advance
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Pay before next stock-in
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1 min-w-0">
                    <Label className={supplierFieldLabelClass}>
                      Amount <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="Enter amount"
                      className={cn(supplierFieldControlClass, "nums")}
                    />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <Label className={supplierFieldLabelClass}>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            supplierFieldControlClass,
                            "w-full min-w-0 justify-start px-3 font-normal overflow-hidden",
                            !paymentDate && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {paymentDate
                              ? format(paymentDate, "MMM d, yyyy")
                              : "Pick date"}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={paymentDate}
                          onSelect={setPaymentDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1 min-w-0">
                    <Label className={supplierFieldLabelClass}>Method</Label>
                    <Select
                      value={paymentMethod}
                      onValueChange={(v) =>
                        setPaymentMethod(
                          v as (typeof PAYMENT_METHODS)[number],
                        )
                      }
                    >
                      <SelectTrigger className={supplierFieldControlClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 min-w-0">
                    <Label className={supplierFieldLabelClass}>Reference</Label>
                    <Input
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Cheque / txn ref"
                      className={supplierFieldControlClass}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className={supplierFieldLabelClass}>
                    Against invoice (optional)
                  </Label>
                  <Select
                    value={paymentInvoiceId || "none"}
                    onValueChange={(v) =>
                      setPaymentInvoiceId(v === "none" ? "" : v)
                    }
                  >
                    <SelectTrigger className={supplierFieldControlClass}>
                      <SelectValue placeholder="Not linked to an invoice" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        Not linked to an invoice
                      </SelectItem>
                      {openInvoices.map((inv) => (
                        <SelectItem key={inv.id} value={inv.id}>
                          {inv.invoice_number} · bal {formatMoney(inv.balance_due)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {openInvoices.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No open invoices — the payment lands on the running balance.
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className={supplierFieldLabelClass}>Notes</Label>
                  <Textarea
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="Optional notes"
                    className="min-h-[72px] text-sm"
                  />
                </div>
                {(ledgerSummary?.balanceDue || 0) > 0 &&
                paymentKind === "settle" ? (
                  <p className="text-xs text-muted-foreground">
                    Current balance due:{" "}
                    <span className="nums font-semibold text-red-700">
                      {formatMoney(ledgerSummary?.balanceDue || 0)}
                    </span>
                    {Number(paymentAmount) > 0
                      ? ` · after this payment ≈ ${formatMoney(
                          Math.max(
                            0,
                            (ledgerSummary?.balanceDue || 0) -
                              (Number(paymentAmount) || 0),
                          ),
                        )}`
                      : null}
                  </p>
                ) : null}
                <LoadingButton
                  onClick={submitPayment}
                  loading={addPayment.isPending}
                  className="h-9"
                  disabled={addPayment.isPending}
                >
                  Record payment
                </LoadingButton>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  Ledger entries
                </h3>
                {ledgerLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading ledger…
                  </div>
                ) : ledgerEntries.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                    No purchases or payments yet. Balance due starts when you
                    record stock-in purchases for this supplier.
                  </p>
                ) : (
                  <div className="max-h-[420px] w-full min-w-0 overflow-x-auto rounded-lg border border-border">
                    <Table className="min-w-[920px]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs uppercase tracking-wide">
                            Date
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide">
                            Type
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide">
                            Description
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide">
                            Ref
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
                            Debit
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
                            Credit
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
                            Balance
                          </TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ledgerEntries.map((e) => {
                          const paymentId =
                            e.type === "PAYMENT"
                              ? e.id.replace(/^payment-/, "")
                              : null;
                          return (
                            <TableRow key={e.id}>
                              <TableCell className="whitespace-nowrap text-sm">
                                {formatDate(e.date)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={
                                    e.type === "PURCHASE"
                                      ? "border-amber-200 bg-amber-50 text-amber-800"
                                      : e.type === "INVOICE"
                                        ? "border-sky-200 bg-sky-50 text-sky-800"
                                        : e.type === "RETURN"
                                          ? "border-violet-200 bg-violet-50 text-violet-800"
                                          : "border-green-200 bg-green-50 text-green-800"
                                  }
                                >
                                  {e.type === "PURCHASE"
                                    ? "Goods received"
                                    : e.type === "INVOICE"
                                      ? "Invoice"
                                      : e.type === "RETURN"
                                        ? "Return"
                                        : "Payment"}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-[280px] text-sm">
                                {e.description}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {e.reference || "—"}
                              </TableCell>
                              <TableCell className="nums text-right text-sm">
                                {e.debit > 0 ? formatMoney(e.debit) : "—"}
                              </TableCell>
                              <TableCell className="nums text-right text-sm text-green-700">
                                {e.credit > 0 ? formatMoney(e.credit) : "—"}
                              </TableCell>
                              <TableCell className="nums text-right text-sm font-semibold">
                                {formatMoney(e.balance)}
                              </TableCell>
                              <TableCell>
                                {paymentId && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 text-destructive"
                                    title="Delete payment"
                                    onClick={() =>
                                      setPaymentDeleteId(paymentId)
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {payments.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Tip: delete a payment only to correct a mistake. Balance
                  updates immediately.
                </p>
              )}
            </div>
          )}

          {current && detailTab === "products" && (
            <div className="space-y-3">
              {productsQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-11 animate-pulse rounded bg-muted" />
                  ))}
                </div>
              ) : (productsQuery.data?.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed py-10">
                  <Package className="h-7 w-7 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    No products are assigned to this supplier
                  </p>
                </div>
              ) : (
                <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-border">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs uppercase tracking-wide">Product</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide">SKU</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide">Category</TableHead>
                        <TableHead className="text-right text-xs uppercase tracking-wide">Buy rate</TableHead>
                        <TableHead className="text-right text-xs uppercase tracking-wide">Sell rate</TableHead>
                        <TableHead className="text-right text-xs uppercase tracking-wide">Purchases</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(productsQuery.data as SupplierProductRow[]).map((p) => (
                        <TableRow
                          key={p.id}
                          className="h-11 cursor-pointer hover:bg-muted/50"
                          onClick={() => setCostProductId(p.id)}
                          title="View cost history"
                        >
                          <TableCell className="font-medium">
                            {p.name}
                            {!p.is_active && (
                              <Badge variant="outline" className="ml-2 border-border text-muted-foreground">
                                Inactive
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {p.sku || p.code || "—"}
                          </TableCell>
                          <TableCell className="text-sm">{p.category || "—"}</TableCell>
                          <TableCell className="text-right nums">{formatMoney(p.purchase_rate)}</TableCell>
                          <TableCell className="text-right nums">{formatMoney(p.sales_rate)}</TableCell>
                          <TableCell className="text-right text-sm nums">{p.purchase_count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DetailSheetBody>

        <DetailSheetFooter>
          <Button
            variant="outline"
            onClick={() => {
              setDetailOpen(false);
              setCurrent(null);
              resetPaymentForm();
            }}
          >
            Close
          </Button>
          <Button
            variant="outline"
            onClick={() => setStatementOpen(true)}
            disabled={!current}
          >
            <FileText className="mr-1.5 h-4 w-4" />
            Statement
          </Button>
          <Button onClick={() => current && openEdit(current)}>
            <Edit className="mr-1.5 h-4 w-4" />
            Edit
          </Button>
        </DetailSheetFooter>
      </DetailSheet>

      {/* Supplier account statement — date-ranged, printable */}
      <Dialog open={statementOpen} onOpenChange={setStatementOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Account statement</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap items-end gap-3">
            <DateField label="From" value={stmtFrom} onChange={setStmtFrom} triggerClassName="h-9 w-40" />
            <DateField label="To" value={stmtTo} onChange={setStmtTo} triggerClassName="h-9 w-40" />
            <Button
              variant="outline"
              className="h-9"
              onClick={printStatement}
              disabled={statementQuery.isLoading || !statementQuery.data}
            >
              <Printer className="mr-1.5 h-4 w-4" />
              Print
            </Button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border p-4 text-sm">
            {statementQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-6 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : statementQuery.data ? (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Date</th>
                    <th className="py-1.5 pr-2 font-medium">Description</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Debit</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Credit</th>
                    <th className="py-1.5 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/60">
                    <td className="py-1.5 pr-2 nums">{stmtFrom || "—"}</td>
                    <td className="py-1.5 pr-2 font-medium">Opening balance</td>
                    <td /><td />
                    <td className="py-1.5 text-right nums">
                      {formatMoney(statementQuery.data.summary?.openingBalance || 0)}
                    </td>
                  </tr>
                  {(statementQuery.data.entries as LedgerEntry[]).map((e) => (
                    <tr key={e.id} className="border-b border-border/60">
                      <td className="py-1.5 pr-2 nums">{formatDate(e.date)}</td>
                      <td className="py-1.5 pr-2">{e.description}</td>
                      <td className="py-1.5 pr-2 text-right nums">{e.debit ? formatMoney(e.debit) : ""}</td>
                      <td className="py-1.5 pr-2 text-right nums">{e.credit ? formatMoney(e.credit) : ""}</td>
                      <td className="py-1.5 text-right nums">{formatMoney(e.balance)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-1.5 pr-2" colSpan={2}>Closing balance</td>
                    <td className="py-1.5 pr-2 text-right nums">
                      {formatMoney(statementQuery.data.summary?.totalDebit || 0)}
                    </td>
                    <td className="py-1.5 pr-2 text-right nums">
                      {formatMoney(statementQuery.data.summary?.totalCredit || 0)}
                    </td>
                    <td className="py-1.5 text-right nums">
                      {formatMoney(statementQuery.data.summary?.closingBalance || 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">Could not load the statement.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Product cost history — opened from the Products tab */}
      <Dialog open={!!costProductId} onOpenChange={(o) => !o && setCostProductId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Cost history
              {costHistoryQuery.data ? ` · ${costHistoryQuery.data.product.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          {costHistoryQuery.isLoading || !costHistoryQuery.data ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-6 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2 text-sm">
                {(
                  [
                    ["Latest", costHistoryQuery.data.summary.latestCost],
                    ["Weighted avg", costHistoryQuery.data.summary.weightedAvgCost],
                    ["Lowest", costHistoryQuery.data.summary.minCost],
                    ["Highest", costHistoryQuery.data.summary.maxCost],
                  ] as const
                ).map(([label, val]) => (
                  <div key={label} className="rounded-md border border-border p-2">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-semibold nums">{formatMoney(val)}</p>
                  </div>
                ))}
              </div>
              <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs uppercase tracking-wide">Date</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">Supplier</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wide">Qty</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wide">Unit cost</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wide">Avg after</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costHistoryQuery.data.entries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                          No purchases recorded for this product yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      costHistoryQuery.data.entries.map((e) => (
                        <TableRow key={e.id} className="h-10">
                          <TableCell className="text-sm text-muted-foreground nums">
                            {formatDate(e.purchase_date)}
                          </TableCell>
                          <TableCell className="text-sm">{e.supplier?.name ?? "—"}</TableCell>
                          <TableCell className="text-right text-sm nums">{e.quantity}</TableCell>
                          <TableCell className="text-right text-sm nums">{formatMoney(e.unit_cost)}</TableCell>
                          <TableCell className="text-right text-sm font-medium nums">
                            {formatMoney(e.weighted_avg_cost)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete supplier?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-semibold">
                {deleteTarget?.name || "this supplier"}
              </span>
              . Linked products will be moved to the default supplier. Payments
              for this supplier will also be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {remove.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!paymentDeleteId}
        onOpenChange={(open) => {
          if (!open && !deletePayment.isPending) setPaymentDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the payment from the supplier ledger and increases
              the balance due. Only do this to correct an entry error.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePayment.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDeletePayment();
              }}
              disabled={deletePayment.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePayment.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete payment"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Suppliers;
