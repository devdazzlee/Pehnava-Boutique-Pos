"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  startTransition,
} from "react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useLoading } from "@/hooks/use-loading";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Search,
  Trash2,
  CreditCard,
  DollarSign,
  Scan,
  Pencil,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
  Printer,
  Download,
  MessageCircle,
  Mail,
  Check,
  ChevronsUpDown,
  User,
  LayoutGrid,
  X,
  Plus,
  Minus,
  Landmark,
  Smartphone,
  Split,
} from "lucide-react";
import { SplitPaymentDialog, type CheckoutMethod, type TenderResult } from "@/components/pos/split-payment-dialog";
import { toast } from "sonner";
import { SaleExtrasPanel, useSaleExtras } from "@/components/pos/sale-extras";
import { useLogoDataUri } from "@/hooks/use-logo-data-uri";
import {
  downloadReceiptPdf,
  shareReceiptOnWhatsApp,
  formatReceiptQtyParts,
} from "@/lib/receipt";
import apiClient from "@/lib/apiClient";
import { mapApiProductToStoreProduct } from "@/lib/store";
import { offlineDB } from "@/lib/offline-db";
import { syncManager } from "@/lib/offline-sync";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAllPosProducts } from "@/hooks/queries/use-products";
import { useBranchRegisterSaleGate } from "@/hooks/queries/use-register-status";
import { useCategories } from "@/hooks/queries/use-categories";
import { useCustomers, useCustomerMutations } from "@/hooks/queries/use-customers";
import { printReceiptViaServer, type ReceiptData } from "@/lib/print-server";
import {
  formatMoneyDisplay,
  formatMoneyFixed,
  isMoneyLessThan,
  lineTotal,
  moneyChange,
  roundMoney,
  subtractMoney,
  sumMoney,
} from "@/lib/money";
import { usePrinterSettings } from "@/hooks/use-printer-settings";
import { searchFieldDomProps } from "@/hooks/use-dismiss-keyboard-on-scroll";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHoldSales } from "@/hooks/use-hold-sales";
import { SalespersonPicker, useSalespeople, useStickySalesperson } from "@/components/salesperson-picker";
import { usePosBranch } from "@/hooks/use-pos-branch";
import {
  RepeatSaleCombobox,
  type RepeatSalePayload,
} from "@/components/repeat-sale-combobox";

interface CartItem {
  id: string; // Unique cart item ID (product.id + timestamp for separate entries)
  productId?: string; // Original product ID for reference (optional for backward compatibility)
  name: string;
  price: number; // Display price (barcode price if scanned, otherwise original price)
  originalPrice: number; // Original product price (used for line total calculations)
  actualUnitPrice: number; // Actual unit price for calculations (always original product price)
  quantity: number;
  category: string;
  unitId?: string;
  unitName?: string;
  unit?: string;
}

const SALE_DRAFT_KEY = "manpasand_pos_new_sale_draft";

type SaleDraft = {
  cart: CartItem[];
  selectedCustomer: string | null;
  pinnedCustomer: PosCustomer | null;
  globalDiscountType: "percentage" | "fixed";
  globalDiscountValue: string;
  showDiscountRow: boolean;
};

function readSaleDraft(): SaleDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SALE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.cart)) return null;
    return parsed as SaleDraft;
  } catch {
    return null;
  }
}

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  categoryId: string;
  barcode?: string;
  label_barcode?: string;
  custom_code?: string;
  code?: string; // Product code for barcode matching
  sku?: string; // SKU for barcode matching
  available_stock?: number;
  current_stock?: number;
  reserved_stock?: number;
  minimum_stock?: number;
  maximum_stock?: number;
  unitId?: string;
  unitName?: string;
}

// Printer type from global hook
type Printer = ReturnType<typeof usePrinterSettings>["printers"][number];

type PosCustomer = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  phone?: string | null;
  is_active?: boolean;
};

function getCustomerDisplayName(customer: PosCustomer): string {
  return (
    customer.name?.trim() ||
    customer.phone_number ||
    customer.phone ||
    "Unnamed customer"
  );
}

function getCustomerSearchValue(customer: PosCustomer): string {
  const email =
    customer.email && !customer.email.includes("@pos.local") ? customer.email : "";
  return [customer.name, customer.phone_number, customer.phone, email]
    .filter(Boolean)
    .join(" ");
}

const POS_PRODUCT_NAME_PREVIEW_LEN = 44;

function truncatePosProductName(name: string, maxLen = POS_PRODUCT_NAME_PREVIEW_LEN): string {
  const trimmed = name.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1).trimEnd()}…`;
}

/** Merchant-facing code: explicit custom_code, else legacy product code (e.g. PA-114). */
function getProductCustomCode(product: Product): string | null {
  const custom = product.custom_code?.trim();
  if (custom) return custom;
  const legacy = product.code?.trim();
  return legacy || null;
}

/** Scan / label barcode (9-digit SKU when no label barcode). Avoid duplicating the code column. */
function getProductScanBarcode(product: Product): string | null {
  const label = product.label_barcode?.trim();
  if (label) return label;
  const sku = product.sku?.trim();
  const codeLine = getProductCustomCode(product);
  if (sku && sku !== codeLine) return sku;
  return null;
}

interface CustomerSearchComboboxProps {
  customers: PosCustomer[];
  loading?: boolean;
  value: string | null;
  onChange: (customerId: string | null) => void;
  onCreated?: (customer: PosCustomer) => void;
  onSearch?: (query: string) => void;
  disabled?: boolean;
}

function CustomerSearchCombobox({
  customers,
  loading = false,
  value,
  onChange,
  onCreated,
  onSearch,
  disabled = false,
}: CustomerSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone_number: "",
    email: "",
    address: "",
    default_discount_percent: "",
  });
  const { create: createCustomerMutation } = useCustomerMutations();

  const activeCustomers = useMemo(
    () => customers.filter((customer) => customer.is_active !== false),
    [customers],
  );

  const selectedCustomer =
    activeCustomers.find((customer) => customer.id === value) ||
    customers.find((customer) => customer.id === value) ||
    null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className="h-11 w-full justify-between bg-white text-sm font-normal sm:h-10"
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <User className="h-4 w-4 shrink-0 text-gray-500" />
            <span className="truncate">
              {loading
                ? "Loading customers..."
                : selectedCustomer
                  ? getCustomerDisplayName(selectedCustomer)
                  : "Walk-in customer"}
            </span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1rem)] p-0 sm:max-w-none"
        align="start"
        collisionPadding={8}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name, phone, or email..."
            onValueChange={(query) => onSearch?.(query)}
          />
          <CommandList className="max-h-[min(50dvh,20rem)]">
            <CommandEmpty>No customer found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="walk-in customer"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="min-h-11 sm:min-h-0"
              >
                <Check
                  className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")}
                />
                Walk-in customer
              </CommandItem>
              {activeCustomers.map((customer) => (
                <CommandItem
                  key={customer.id}
                  value={`${customer.id} ${getCustomerSearchValue(customer)}`}
                  onSelect={() => {
                    onChange(customer.id);
                    setOpen(false);
                  }}
                  className="min-h-11 sm:min-h-0"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === customer.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0 flex flex-col">
                    <span className="truncate font-medium">{getCustomerDisplayName(customer)}</span>
                    {(customer.phone_number || customer.phone || customer.email) && (
                      <span className="truncate text-xs text-muted-foreground">
                        {[
                          customer.phone_number || customer.phone,
                          customer.email && !customer.email.includes("@pos.local")
                            ? customer.email
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <button
            type="button"
            className="flex w-full items-center gap-2 border-t border-slate-200 px-3 py-3 text-left text-sm font-semibold text-blue-700 hover:bg-blue-50"
            onClick={() => {
              setOpen(false);
              setAddOpen(true);
            }}
          >
            <Plus className="h-4 w-4 shrink-0" />
            Add customer
          </button>
        </Command>
      </PopoverContent>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[90dvh] sm:max-w-md sm:gap-4 sm:p-6 max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <DialogHeader className="shrink-0 px-4 pb-2 pt-4 pr-10 text-left sm:px-0 sm:pt-0 sm:pr-8">
            <DialogTitle>Add customer</DialogTitle>
            <DialogDescription>
              Name and phone are required. The new customer is selected for this sale.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={async (event) => {
              event.preventDefault();
              const name = newCustomer.name.trim();
              const phone = newCustomer.phone_number.trim();
              const email = newCustomer.email.trim();
              const address = newCustomer.address.trim();
              const discountRaw = newCustomer.default_discount_percent.trim();

              if (!name) {
                toast.error("Customer name is required");
                return;
              }
              if (!/^[0-9+\-\s]{7,20}$/.test(phone)) {
                toast.error("Enter a valid phone number (at least 7 digits)");
                return;
              }
              if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                toast.error("Enter a valid email or leave it blank");
                return;
              }
              const discount = discountRaw === "" ? undefined : Number(discountRaw);
              if (
                discount !== undefined &&
                (Number.isNaN(discount) || discount < 0 || discount > 100)
              ) {
                toast.error("Discount must be between 0 and 100");
                return;
              }

              setSavingCustomer(true);
              try {
                const result = await createCustomerMutation.mutateAsync({
                  name,
                  phone_number: phone,
                  email: email || undefined,
                  address: address || undefined,
                  default_discount_percent: discount,
                  is_active: true,
                });
                const created = ((result as { customer?: PosCustomer })?.customer ??
                  result) as PosCustomer;
                if (!created?.id) {
                  toast.error("Customer was saved but could not be selected");
                  return;
                }
                onChange(created.id);
                onCreated?.({
                  id: created.id,
                  name: created.name || name,
                  phone_number: created.phone_number || phone,
                  phone: created.phone || created.phone_number || phone,
                  email: created.email || email || null,
                  is_active: created.is_active !== false,
                });
                setNewCustomer({
                  name: "",
                  phone_number: "",
                  email: "",
                  address: "",
                  default_discount_percent: "",
                });
                setAddOpen(false);
                toast.success(`${created.name || name} added`);
              } catch (error: any) {
                toast.error(
                  error?.response?.data?.message ||
                    error?.message ||
                    "Could not add customer",
                );
              } finally {
                setSavingCustomer(false);
              }
            }}
          >
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-2 sm:px-1">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700" htmlFor="new-sale-customer-name">
                Name
              </label>
              <Input
                id="new-sale-customer-name"
                className="h-11 text-base sm:h-10 sm:text-sm"
                value={newCustomer.name}
                onChange={(e) => setNewCustomer((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Customer name"
                autoComplete="name"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700" htmlFor="new-sale-customer-phone">
                Phone
              </label>
              <Input
                id="new-sale-customer-phone"
                className="h-11 text-base sm:h-10 sm:text-sm"
                value={newCustomer.phone_number}
                onChange={(e) =>
                  setNewCustomer((prev) => ({ ...prev, phone_number: e.target.value }))
                }
                placeholder="03xx xxxxxxx"
                inputMode="tel"
                autoComplete="tel"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700" htmlFor="new-sale-customer-email">
                Email
              </label>
              <Input
                id="new-sale-customer-email"
                className="h-11 text-base sm:h-10 sm:text-sm"
                value={newCustomer.email}
                onChange={(e) => setNewCustomer((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Optional"
                inputMode="email"
                autoComplete="email"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700" htmlFor="new-sale-customer-address">
                Address
              </label>
              <Input
                id="new-sale-customer-address"
                className="h-11 text-base sm:h-10 sm:text-sm"
                value={newCustomer.address}
                onChange={(e) => setNewCustomer((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Optional"
                autoComplete="street-address"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700" htmlFor="new-sale-customer-discount">
                Default discount %
              </label>
              <Input
                id="new-sale-customer-discount"
                className="h-11 text-base sm:h-10 sm:text-sm"
                value={newCustomer.default_discount_percent}
                onChange={(e) =>
                  setNewCustomer((prev) => ({
                    ...prev,
                    default_discount_percent: e.target.value,
                  }))
                }
                placeholder="0"
                inputMode="decimal"
              />
            </div>
            </div>
            <DialogFooter className="mt-0 shrink-0 gap-2 border-t border-slate-200 px-4 py-3 sm:mt-2 sm:border-0 sm:px-0 sm:py-0">
              <Button
                type="submit"
                className="h-11 w-full text-base sm:h-10 sm:w-auto sm:text-sm"
                disabled={savingCustomer}
              >
                {savingCustomer ? "Saving..." : "Save customer"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full text-base sm:h-10 sm:w-auto sm:text-sm"
                onClick={() => setAddOpen(false)}
                disabled={savingCustomer}
              >
                Cancel
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Popover>
  );
}

type PosCategoryOption = {
  id: string;
  name: string;
  count: number;
};

interface CategoryFilterComboboxProps {
  categories: PosCategoryOption[];
  loading?: boolean;
  value: string;
  onChange: (categoryId: string) => void;
  disabled?: boolean;
}

function CategoryFilterCombobox({
  categories,
  loading = false,
  value,
  onChange,
  disabled = false,
}: CategoryFilterComboboxProps) {
  const [open, setOpen] = useState(false);
  const selectedCategory =
    categories.find((category) => category.id === value) || categories[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading || categories.length === 0}
          className="h-11 w-full justify-between bg-white text-sm font-normal sm:h-10"
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <LayoutGrid className="h-4 w-4 shrink-0 text-gray-500" />
            <span className="truncate">
              {loading
                ? "Loading categories..."
                : selectedCategory?.name || "All categories"}
            </span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1rem)] p-0 sm:w-[320px] sm:max-w-none"
        align="start"
        collisionPadding={8}
      >
        <Command>
          <CommandInput placeholder="Search categories..." />
          <CommandList className="max-h-[min(50dvh,18rem)] sm:max-h-72">
            <CommandEmpty>No category found.</CommandEmpty>
            <CommandGroup>
              {categories.map((category) => (
                <CommandItem
                  key={category.id}
                  value={`${category.id} ${category.name}`}
                  onSelect={() => {
                    onChange(category.id);
                    setOpen(false);
                  }}
                  className="min-h-11 sm:min-h-0"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === category.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <span className="truncate">{category.name}</span>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      {category.count}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}


function wrappedLineCount(text: string, charsPerLine: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  const limit = Math.max(8, charsPerLine);
  let lines = 1;
  let used = 0;
  for (const word of words) {
    if (word.length > limit) {
      if (used > 0) {
        lines += 1;
        used = 0;
      }
      const chunks = Math.ceil(word.length / limit);
      lines += chunks - 1;
      used = word.length % limit;
      continue;
    }
    const next = used === 0 ? word.length : used + 1 + word.length;
    if (next <= limit) {
      used = next;
    } else {
      lines += 1;
      used = word.length;
    }
  }
  return lines;
}

function productRowHeight(names: string[], cardWidth: number, mobile: boolean) {
  const fontPx = mobile ? 14 : 13;
  const linePx = mobile ? 20 : 18;
  const inner = Math.max(48, cardWidth - (mobile ? 24 : 20));
  const charsPerLine = Math.max(8, Math.floor(inner / (fontPx * 0.58)));
  let lines = 1;
  for (const name of names) {
    lines = Math.max(lines, wrappedLineCount(name, charsPerLine));
  }
  // Padding + price row, plus a little extra so the last line is never clipped.
  const chrome = mobile ? 64 : 56;
  return chrome + lines * linePx;
}

export function NewSale() {
  const [cart, setCart] = useState<CartItem[]>([]);
  // Track input values as strings to allow decimal point typing
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [quantityModes, setQuantityModes] = useState<Record<string, "preset" | "custom">>({});
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentMethodPending, setPaymentMethodPending] = useState<CheckoutMethod | null>(null);
  const [tenderedAmount, setTenderedAmount] = useState("");
  const [calculatedChange, setCalculatedChange] = useState(0);
  const [paymentError, setPaymentError] = useState("");
  const {
    branchLoading,
    selectedBranchId,
    branchInfo,
    hasBranch,
  } = usePosBranch();
  const { canSell: registerOpenForSale, blockMessage: registerBlockMessage } =
    useBranchRegisterSaleGate(selectedBranchId);
  const salesAllowed = hasBranch && registerOpenForSale;
  const { holdSales, holdSale, retrieveHoldSale, deleteHoldSale, holdSalesLoading, refreshHoldSales } =
    useHoldSales(selectedBranchId);

  const requireRegisterOpen = useCallback((): boolean => {
    if (salesAllowed) return true;
    toast.error(
      registerBlockMessage ||
        "Cash register is not open. Open it on Cash Register before selling.",
    );
    return false;
  }, [salesAllowed, registerBlockMessage]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Refs for price and quantity inputs for keyboard navigation
  const priceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const quantityInputRefs = useRef<Record<string, HTMLElement | null>>({});
  const quantityEnterConfirmedRef = useRef<string | null>(null);
  const quantityFocusLineIdRef = useRef<string | null>(null);
  const activeCartLineIdRef = useRef<string | null>(null);
  const cartRef = useRef(cart);
  const quantityInputsRef = useRef(quantityInputs);
  const searchDropdownRef = useRef<HTMLDivElement | null>(null);
  const searchDropdownItemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [highlightedProductIndex, setHighlightedProductIndex] = useState(0);
  const lastAddedProductId = useRef<string | null>(null);
  const [activeCartLineId, setActiveCartLineId] = useState<string | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  // Refs for cart items and scrollable container
  const cartItemRefs = useRef<Record<string, HTMLElement | null>>({});
  const cartScrollContainerRef = useRef<HTMLDivElement | null>(null);
  // Ref to track scan timeout for rapid scanning
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to prevent duplicate processing of the same scan
  const lastProcessedScanRef = useRef<string>('');
  const isProcessingScanRef = useRef<boolean>(false);
  const enterKeyPressedRef = useRef<boolean>(false);
  // Synchronous guard against duplicate sale submissions. `paymentLoading` is
  // React state and updates a tick late, so a stuck Enter key / barcode
  // scanner can fire handlePayment many times before the button disables,
  // creating a burst of identical sales. This ref blocks re-entry immediately.
  const saleInFlightRef = useRef<boolean>(false);
  // Track when user is actively interacting with other inputs (prevent auto-refocus)
  const userInteractionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUserInteractingRef = useRef<boolean>(false);
  const customerSearchTimerRef = useRef<number | null>(null);
  const [lastTransactionId, setLastTransactionId] = useState<string | null>(
    null
  );
  const [saleSuccessOpen, setSaleSuccessOpen] = useState(false);
  const [completedReceiptData, setCompletedReceiptData] =
    useState<ReceiptData | null>(null);
  const [completedSaleNumber, setCompletedSaleNumber] = useState("");
  const [completedTotalReceived, setCompletedTotalReceived] = useState(0);
  const [completedCustomerPhone, setCompletedCustomerPhone] = useState("");
  const [completedCustomerEmail, setCompletedCustomerEmail] = useState("");
  const logoDataUri = useLogoDataUri();
  const { loading: paymentLoading, withLoading: withPaymentLoading } =
    useLoading();
  const [scanLoading, setScanLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  // Employee credited with the sale for commission; remembered between bills on this device.
  const { people: salespeople, loading: salespeopleLoading } = useSalespeople();
  const [salespersonId, setSalespersonId] = useStickySalesperson();
  const [pinnedCustomer, setPinnedCustomer] = useState<PosCustomer | null>(null);
  const [saleDraftReady, setSaleDraftReady] = useState(false);
  // Global printer settings (configured in Printer Settings page)
  const { receiptPrinter, getReceiptPrinterObj, printers } = usePrinterSettings();
  const [showHeldSales, setShowHeldSales] = useState(false);
  const [isHoldingSale, setIsHoldingSale] = useState(false);
  const [isViewingHeldSales, setIsViewingHeldSales] = useState(false);
  const [deleteTargetHoldSale, setDeleteTargetHoldSale] = useState<number | null>(null);
  const [isDeletingHoldSale, setIsDeletingHoldSale] = useState(false);
  const [resumingHoldIndex, setResumingHoldIndex] = useState<number | null>(null);

  const [repeatConflict, setRepeatConflict] = useState<RepeatSalePayload | null>(
    null,
  );
  const [globalDiscountType, setGlobalDiscountType] = useState<"percentage" | "fixed">("fixed");
  const [globalDiscountValue, setGlobalDiscountValue] = useState<string>("");
  const [showDiscountRow, setShowDiscountRow] = useState(false);
  const [priceEditLineId, setPriceEditLineId] = useState<string | null>(null);
  const [qtySheetLineId, setQtySheetLineId] = useState<string | null>(null);
  const [qtySheetValue, setQtySheetValue] = useState("");
  // True once the cashier edits the discount by hand — stops the customer's
  // default discount from overwriting their change.
  const discountTouchedRef = useRef(false);
  const autoDiscountCustomerRef = useRef<string | null>(null);

  const [customerSearch, setCustomerSearch] = useState("");

  const { categories, isLoading: categoriesLoading } = useCategories({ withAll: true });

  // The entire sellable catalog, fetched once per session and cached. Search and
  // category switches filter it in memory (see `filteredProducts` below), so
  // they are instant — no server round trip per keystroke.
  const {
    products,
    isFirstLoad: productsLoading,
    isRefreshing: productsRefreshing,
  } = useAllPosProducts();

  const { customers, isLoading: customersLoading } = useCustomers({
    search: customerSearch || undefined,
    page: 1,
    limit: 20,
  });

  const customersForPicker = useMemo(() => {
    if (!pinnedCustomer) return customers;
    if (customers.some((customer) => customer.id === pinnedCustomer.id)) {
      return customers;
    }
    return [pinnedCustomer, ...customers];
  }, [customers, pinnedCustomer]);

  // Clear any pending scan timeout on unmount.
  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
    };
  }, []);

  // Apply the selected customer's default discount automatically (overridable).
  useEffect(() => {
    if (discountTouchedRef.current) return;
    const cust = selectedCustomer
      ? customers.find((c) => c.id === selectedCustomer)
      : null;
    const pct = Number((cust as any)?.default_discount_percent) || 0;
    if (pct > 0) {
      setGlobalDiscountType("percentage");
      setGlobalDiscountValue(String(pct));
      setShowDiscountRow(true);
      autoDiscountCustomerRef.current = selectedCustomer;
    } else if (autoDiscountCustomerRef.current) {
      // Previous customer's auto-discount no longer applies.
      setGlobalDiscountValue("");
      setShowDiscountRow(false);
      autoDiscountCustomerRef.current = null;
    }
  }, [selectedCustomer, customers]);

  // Restore the in-progress sale after a refresh, then keep it saved.
  useEffect(() => {
    const draft = readSaleDraft();
    if (draft) {
      if (draft.cart.length > 0) setCart(draft.cart);
      if (draft.selectedCustomer) setSelectedCustomer(draft.selectedCustomer);
      if (draft.pinnedCustomer?.id) setPinnedCustomer(draft.pinnedCustomer);
      if (draft.globalDiscountType === "percentage" || draft.globalDiscountType === "fixed") {
        setGlobalDiscountType(draft.globalDiscountType);
      }
      if (draft.globalDiscountValue) {
        setGlobalDiscountValue(draft.globalDiscountValue);
        setShowDiscountRow(true);
        discountTouchedRef.current = true;
      } else if (draft.showDiscountRow) {
        setShowDiscountRow(true);
      }
    }
    setSaleDraftReady(true);
  }, []);

  useEffect(() => {
    if (!saleDraftReady) return;
    try {
      if (cart.length === 0 && !selectedCustomer) {
        localStorage.removeItem(SALE_DRAFT_KEY);
        return;
      }
      const draft: SaleDraft = {
        cart,
        selectedCustomer,
        pinnedCustomer,
        globalDiscountType,
        globalDiscountValue,
        showDiscountRow,
      };
      localStorage.setItem(SALE_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Ignore private-mode or full storage.
    }
  }, [
    saleDraftReady,
    cart,
    selectedCustomer,
    pinnedCustomer,
    globalDiscountType,
    globalDiscountValue,
    showDiscountRow,
  ]);

  // Load cart duplicated from Sales History
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("duplicate_sale_cart");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      sessionStorage.removeItem("duplicate_sale_cart");
      if (!Array.isArray(parsed?.items) || parsed.items.length === 0) return;

      setCart(
        parsed.items.map((item: any, index: number) => ({
          id: String(item.id || `dup-${Date.now()}-${index}`),
          productId: item.productId,
          name: String(item.name || "Item"),
          price: Number(item.price) || 0,
          originalPrice: Number(item.originalPrice ?? item.price) || 0,
          actualUnitPrice: Number(item.actualUnitPrice ?? item.price) || 0,
          quantity: Number(item.quantity) || 1,
          category: String(item.category || "all"),
          unitId: item.unitId,
          unitName: item.unitName,
          unit: item.unit,
        })),
      );
      if (parsed.customerId) {
        setSelectedCustomer(parsed.customerId);
      }
    } catch {
      sessionStorage.removeItem("duplicate_sale_cart");
    }
  }, []);

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  useEffect(() => {
    quantityInputsRef.current = quantityInputs;
  }, [quantityInputs]);

  useEffect(() => {
    activeCartLineIdRef.current = activeCartLineId;
  }, [activeCartLineId]);

  useEffect(() => {
    if (cart.length === 0) {
      setMobileCartOpen(false);
    }
  }, [cart.length]);

  useEffect(() => {
    if (!mobileCartOpen || cart.length === 0) return;

    const html = document.documentElement;
    const body = document.body;
    const main = document.getElementById("app-main-scroll");
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      mainOverflow: main instanceof HTMLElement ? main.style.overflow : "",
    };

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (main instanceof HTMLElement) main.style.overflow = "hidden";

    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      if (main instanceof HTMLElement) main.style.overflow = prev.mainOverflow;
    };
  }, [mobileCartOpen, cart.length]);

  const setCartSync = (updater: (prev: CartItem[]) => CartItem[]) => {
    setCart((prev) => {
      const next = updater(prev);
      cartRef.current = next;
      return next;
    });
  };

  // Keep search input always focused on desktop (barcode scanners).
  // On phones, never steal focus — that would reopen the keyboard after scroll-to-dismiss.
  useEffect(() => {
    const IDLE_TIMEOUT = 2000; // 2 seconds of inactivity before refocusing search
    const INTERACTION_TIMEOUT = 500; // 500ms to detect if user is still interacting
    const isTouchUi = () =>
      window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;

    const markUserInteracting = () => {
      isUserInteractingRef.current = true;
      // Clear any pending refocus
      if (userInteractionTimeoutRef.current) {
        clearTimeout(userInteractionTimeoutRef.current);
        userInteractionTimeoutRef.current = null;
      }
      // Reset interaction flag after a short delay
      setTimeout(() => {
        isUserInteractingRef.current = false;
      }, INTERACTION_TIMEOUT);
    };

    const isInteractiveElement = (element: HTMLElement | null): boolean => {
      if (!element) return false;
      
      // Check data attributes for special inputs
      if (element.getAttribute('data-price-input') === 'true' ||
          element.getAttribute('data-quantity-input') === 'true' ||
          element.getAttribute('data-quantity-select') === 'true' ||
          element.getAttribute('data-amount-input') === 'true' ||
          element.getAttribute('data-discount-select') === 'true' ||
          element.getAttribute('data-quick-qty') === 'true' ||
          element.closest('[data-quick-qty="true"]') ||
          element.closest('[data-product-search-dropdown]') ||
          element.closest('[data-radix-select-content]')) {
        return true;
      }
      
      // Check element types
      const tagName = element.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
        return true;
      }
      
      // Check if it's inside a select dropdown (for Radix UI or custom selects)
      if (element.closest('[role="listbox"]') || 
          element.closest('[role="combobox"]') ||
          element.closest('[data-radix-select-content]') ||
          element.closest('select')) {
        return true;
      }
      
      // Check if it's a button (but allow clicking buttons)
      if (tagName === 'BUTTON' || element.closest('button')) {
        return true;
      }
      
      return false;
    };

    const scheduleRefocus = () => {
      if (isTouchUi()) return;

      // Clear any existing timeout
      if (userInteractionTimeoutRef.current) {
        clearTimeout(userInteractionTimeoutRef.current);
      }
      
      // Only refocus if user is not actively interacting
      if (!isUserInteractingRef.current && searchInputRef.current && !paymentDialogOpen) {
        userInteractionTimeoutRef.current = setTimeout(() => {
          const activeElement = document.activeElement as HTMLElement;
          
          // Don't refocus if user is still on an interactive element
          if (!isInteractiveElement(activeElement) && activeElement !== searchInputRef.current) {
            if (searchInputRef.current && !paymentDialogOpen) {
              searchInputRef.current.focus();
            }
          }
        }, IDLE_TIMEOUT);
      }
    };

    // Refocus on click anywhere (but respect interactive elements)
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // If clicking on interactive element, mark as interacting
      if (isInteractiveElement(target)) {
        markUserInteracting();
        return;
      }
      
      // Schedule refocus after idle period
      scheduleRefocus();
    };

    // Refocus when window regains focus (tab switching back)
    const handleFocus = () => {
      scheduleRefocus();
    };

    // Global keyboard listener to capture barcode scans even when search is not focused
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Skip if in payment dialog
      if (paymentDialogOpen) {
        return;
      }

      const activeElement = document.activeElement as HTMLElement;
      
      // If typing in any interactive input (price/quantity), allow it
      if (isInteractiveElement(activeElement)) {
        markUserInteracting();
        return;
      }
      
      // If typing anywhere else (or search is not focused), focus search and capture the key
      if (searchInputRef.current) {
        // If it's a printable character (not a control key)
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
          // If search is not focused, focus it and append the character
          if (activeElement !== searchInputRef.current) {
            e.preventDefault();
            e.stopPropagation();
            searchInputRef.current.focus();
            // Append the character to the input value
            const currentValue = searchInputRef.current.value || '';
            searchInputRef.current.value = currentValue + e.key;
            // Trigger onChange manually to update state
            const event = new Event('input', { bubbles: true });
            searchInputRef.current.dispatchEvent(event);
            // Also update state directly
            setSearchTerm(currentValue + e.key);
          }
        }
        // Handle Enter key - process the scan
        else if (e.key === 'Enter' && activeElement !== searchInputRef.current) {
          const currentValue = searchInputRef.current.value || '';
          if (currentValue.trim().length > 0) {
            e.preventDefault();
            e.stopPropagation();
            searchInputRef.current.focus();
            handleScannerInput(currentValue);
          }
        }
      }
    };

    window.addEventListener('click', handleClick);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('keydown', handleGlobalKeyDown);
    
    // Initial focus
    if (searchInputRef.current && !isTouchUi()) {
      searchInputRef.current.focus();
    }

    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('keydown', handleGlobalKeyDown);
      // Clear timeout on unmount
      if (userInteractionTimeoutRef.current) {
        clearTimeout(userInteractionTimeoutRef.current);
      }
    };
  }, [paymentDialogOpen]);

  // Build a search index once per catalog change: each row keeps a single
  // lowercased haystack string so a keystroke is one `includes()`, not four
  // `toLowerCase()` calls per product.
  const productIndex = useMemo(
    () =>
      products.map((product) => ({
        product,
        hay: `${product.name ?? ""}|${product.code ?? ""}|${
          product.custom_code ?? ""
        }|${product.barcode ?? ""}|${product.sku ?? ""}|${
          product.label_barcode ?? ""
        }`.toLowerCase(),
      })),
    [products],
  );

  // Client-side filtering — instant, no API call. Memoised so it only re-runs
  // when the catalog, the search term, or the category actually changes.
  const filteredProducts = useMemo(() => {
    const needle = searchTerm.toLowerCase().trim();
    const out: typeof products = [];
    for (const { product, hay } of productIndex) {
      // Inactive products are never sellable from the POS screen.
      if (product.is_active === false) continue;
      if (selectedCategory !== "all" && product.categoryId !== selectedCategory) continue;
      if (needle && !hay.includes(needle)) continue;
      out.push(product);
    }
    return out;
  }, [productIndex, searchTerm, selectedCategory]);

  const [serverSearchProducts, setServerSearchProducts] = useState<Product[]>([]);
  const [serverSearchLoading, setServerSearchLoading] = useState(false);

  useEffect(() => {
    const q = searchTerm.trim();
    if (q.length < 3) {
      setServerSearchProducts([]);
      return;
    }
    const needle = q.toLowerCase();
    const hasLocal = productIndex.some(({ hay }) => hay.includes(needle));
    if (hasLocal) {
      setServerSearchProducts([]);
      return;
    }
    const timer = setTimeout(async () => {
      setServerSearchLoading(true);
      try {
        const res = await apiClient.get("/products", {
          params: {
            search: q,
            limit: 40,
            is_active: true,
            display_on_pos: true,
          },
        });
        const raw = Array.isArray(res.data?.data) ? res.data.data : [];
        setServerSearchProducts(raw.map(mapApiProductToStoreProduct) as Product[]);
      } catch {
        setServerSearchProducts([]);
      } finally {
        setServerSearchLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm, productIndex]);

  const gridProducts = useMemo(() => {
    const base =
      filteredProducts.length > 0 ? filteredProducts : serverSearchProducts;
    if (selectedCategory === "all") return base;
    return base.filter((p) => p.categoryId === selectedCategory);
  }, [filteredProducts, serverSearchProducts, selectedCategory]);

  // Only the first catalog load blocks the grid; background refreshes are silent.
  const isProductQueryPending = productsLoading;

  // --- Product grid virtualization -----------------------------------------
  // Below the threshold we render the plain CSS grid (proven, zero risk). Above
  // it, only the visible rows are mounted so the catalog can be any size.
  const VIRTUALIZE_THRESHOLD = 120;
  // Row height follows the longest name in that row, then stays fixed while
  // scrolling so prices do not jump.
  const productScrollRef = useRef<HTMLDivElement>(null);
  const productGridRef = useRef<HTMLDivElement>(null);
  const [gridColumns, setGridColumns] = useState(4);
  const [gridWidth, setGridWidth] = useState(0);
  const [gridScrollMargin, setGridScrollMargin] = useState(0);

  // Phones stay at 2 columns. Desktop widths keep the previous 4 / 5 / 6 layout.
  useEffect(() => {
    const el = productScrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const compute = () => {
      const w = el.clientWidth;
      setGridColumns(w < 480 ? 2 : w < 680 ? 4 : w < 1000 ? 5 : 6);
      setGridWidth(w);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const virtualizeGrid = gridProducts.length > VIRTUALIZE_THRESHOLD;
  const gridRowCount = Math.ceil(gridProducts.length / gridColumns);
  const gridRowHeights = useMemo(() => {
    const cols = Math.max(1, gridColumns);
    const mobile = cols <= 2;
    const gap = 8;
    const width = gridWidth > 0 ? gridWidth : mobile ? 360 : 1100;
    const cardWidth = (width - gap * (cols - 1)) / cols;
    const heights: number[] = [];
    for (let row = 0; row < gridRowCount; row++) {
      const names = gridProducts
        .slice(row * cols, row * cols + cols)
        .map((product) => product.name || "");
      heights.push(productRowHeight(names, cardWidth, mobile));
    }
    return heights;
  }, [gridProducts, gridColumns, gridWidth, gridRowCount]);
  const gridRowHeightsRef = useRef(gridRowHeights);
  gridRowHeightsRef.current = gridRowHeights;
  const estimateRowSize = useCallback((index: number) => {
    return gridRowHeightsRef.current[index] ?? 84;
  }, []);

  // Measure once when the grid mounts / columns change — not on every scroll.
  useLayoutEffect(() => {
    if (!virtualizeGrid) return;
    const grid = productGridRef.current;
    const scroll = productScrollRef.current;
    if (!grid || !scroll) return;
    setGridScrollMargin(
      grid.getBoundingClientRect().top -
        scroll.getBoundingClientRect().top +
        scroll.scrollTop,
    );
  }, [virtualizeGrid, gridColumns, productsLoading, receiptPrinter]);

  const rowVirtualizer = useVirtualizer({
    count: virtualizeGrid ? gridRowCount : 0,
    getScrollElement: () => productScrollRef.current,
    estimateSize: estimateRowSize,
    overscan: 8,
    gap: 8,
    scrollMargin: gridScrollMargin,
  });

  const rowVirtualizerRef = useRef(rowVirtualizer);
  rowVirtualizerRef.current = rowVirtualizer;
  useLayoutEffect(() => {
    rowVirtualizerRef.current.measure();
  }, [gridRowHeights]);

  const renderProductCard = (product: Product) => {
    const cartItems = cart.filter(
      (item) =>
        (item as CartItem).productId === product.id || item.id === product.id,
    );
    const totalQty = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const inCart = totalQty > 0;

    return (
      <button
        key={product.id}
        type="button"
        onClick={() => handleProductClick(product)}
        className={cn(
          "group relative flex h-full min-h-[4.75rem] flex-col rounded-xl border bg-white p-3 text-left transition-colors duration-100 sm:min-h-[4.5rem] sm:p-2.5",
          "active:scale-[0.98] sm:hover:border-blue-300 sm:hover:bg-blue-50/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
          inCart
            ? "border-blue-500 bg-blue-50/50 ring-1 ring-blue-500"
            : "border-slate-200",
        )}
      >
        {inCart && (
          <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-bold tabular-nums text-white shadow-sm sm:h-5 sm:min-w-[1.25rem] sm:text-[11px]">
            {formatQuantityValue(totalQty)}
          </span>
        )}

        <span className="break-words text-sm font-semibold leading-snug text-slate-900 sm:text-[13px] sm:font-medium">
          {truncatePosProductName(product.name, 56)}
        </span>

        {(getProductCustomCode(product) || getProductScanBarcode(product)) && (
          <p className="mt-1 space-x-1.5 text-[10px] leading-tight text-slate-500 sm:text-[11px]">
            {getProductCustomCode(product) ? (
              <span className="font-mono font-medium text-slate-600">
                {getProductCustomCode(product)}
              </span>
            ) : null}
            {getProductCustomCode(product) && getProductScanBarcode(product) ? (
              <span className="text-slate-300">·</span>
            ) : null}
            {getProductScanBarcode(product) ? (
              <span className="font-mono text-slate-400">{getProductScanBarcode(product)}</span>
            ) : null}
          </p>
        )}

        <div className="mt-auto flex items-baseline justify-between gap-2 border-t border-slate-100 pt-1.5">
          {product.category ? (
            <span className="hidden truncate text-[11px] text-slate-400 sm:inline">
              {product.category}
            </span>
          ) : (
            <span className="hidden text-[11px] text-slate-300 sm:inline">—</span>
          )}
          <span className="ml-auto shrink-0 text-base font-bold tabular-nums text-slate-900 sm:text-[15px]">
            <span className="text-xs font-medium text-slate-400 sm:text-[11px]">Rs </span>
            {formatMoney(product.price)}
          </span>
        </div>
      </button>
    );
  };

  const SEARCH_DROPDOWN_LIMIT = 25;

  const searchDropdownProducts = useMemo(() => {
    if (!searchTerm.trim()) return [];
    return gridProducts.slice(0, SEARCH_DROPDOWN_LIMIT);
  }, [gridProducts, searchTerm]);

  const searchDropdownOverflowCount = useMemo(() => {
    if (!searchTerm.trim()) return 0;
    return Math.max(0, gridProducts.length - SEARCH_DROPDOWN_LIMIT);
  }, [gridProducts.length, searchTerm]);

  useEffect(() => {
    if (!productSearchOpen) return;
    const highlightedEl = searchDropdownItemRefs.current[highlightedProductIndex];
    if (!highlightedEl) return;
    highlightedEl.scrollIntoView({ block: "nearest" });
  }, [highlightedProductIndex, productSearchOpen, searchDropdownProducts.length]);

  const focusSearchInput = useCallback((options?: { clear?: boolean; allowTouch?: boolean }) => {
    setProductSearchOpen(false);
    setHighlightedProductIndex(0);
    if (options?.clear) setSearchTerm("");
    const focusNow = () => {
      const el = searchInputRef.current;
      if (!el || paymentDialogOpen) return;
      const isTouch =
        window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
      // Idle/page-load focus stays desktop-only. The search → qty → search
      // loop passes allowTouch so Android/iOS Next keeps the keyboard open.
      if (isTouch && !options?.allowTouch) return;
      el.focus({ preventScroll: true });
      el.select();
    };
    // Focus in the same key event so iOS/Android do not dismiss the keyboard.
    if (options?.allowTouch) focusNow();
    requestAnimationFrame(focusNow);
  }, [paymentDialogOpen]);

  useEffect(() => {
    focusSearchInput();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const posCategories = useMemo(() => {
    const activeProducts = products.filter((product) => product.is_active !== false);
    const counts = new Map<string, number>();

    activeProducts.forEach((product) => {
      const categoryId = product.categoryId || "unknown";
      counts.set(categoryId, (counts.get(categoryId) || 0) + 1);
    });

    return categories
      .filter((category) => category.id === "all" || category.is_active !== false)
      .map((category) => ({
        ...category,
        count:
          category.id === "all"
            ? activeProducts.length
            : counts.get(category.id) || 0,
      }))
      .filter((category) => category.id === "all" || category.count > 0)
      .sort((a, b) => {
        if (a.id === "all") return -1;
        if (b.id === "all") return 1;
        if (a.name.toLowerCase() === "unknown") return 1;
        if (b.name.toLowerCase() === "unknown") return -1;
        return a.name.localeCompare(b.name);
      });
  }, [categories, products]);

  const selectedCategoryLabel =
    posCategories.find((category) => category.id === selectedCategory)?.name ||
    "All categories";

  const addToCart = (product: Product, quantity: number = 1, customPrice?: number) => {
    if (!requireRegisterOpen()) return;

    // For testing: Allow negative sales (stock can go below 0)
    // Comment out stock validation for testing purposes
    /*
    const availableStock = product.available_stock ?? product.stock
    const currentQuantity = cart.find((item) => item.id === product.id)?.quantity || 0
    if (currentQuantity >= availableStock) {
      toast({
        variant: "destructive",
        title: "Insufficient Stock",
        description: `Only ${availableStock} units available for ${product.name}`,
      })
      return
    }
    */

    // When custom price is provided, it represents the TOTAL PRICE from barcode
    // Calculate quantity: barcodePrice / originalPrice
    // Original price is the price of 1 unit
    // Barcode price is the total price
    const originalProductPrice = product.price;
    
    // Calculate quantity from scanned price if custom price is provided
    let finalQuantity = quantity;
    let displayPrice = originalProductPrice; // Price to display in price field
    let actualUnitPrice = originalProductPrice; // Actual unit price for line total calculations (always original)
    
    if (customPrice !== undefined && originalProductPrice > 0) {
      // Calculate quantity: barcodePrice / originalPrice
      finalQuantity = customPrice / originalProductPrice;
      const minFromUnit = isWeightUnit(product.unitName) ? 0.01 : 1;
      finalQuantity = Math.max(minFromUnit, finalQuantity);
      
      // Show the scanned price (barcode price) in the price field for display
      displayPrice = customPrice; // Display barcode price in price field
      // But keep actualUnitPrice as original for calculations
      actualUnitPrice = originalProductPrice; // Always use original price for line total
    } else {
      // If no custom price, ensure minimum quantity of 1
      finalQuantity = Math.max(1, quantity);
    }

    const affectedLineId = `${product.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const nextCart: CartItem[] = [
      ...cartRef.current,
      {
        id: affectedLineId,
        productId: product.id,
        name: product.name,
        price: displayPrice,
        originalPrice: originalProductPrice,
        actualUnitPrice: actualUnitPrice,
        quantity: finalQuantity,
        category: product.category,
        unitId: product.unitId,
        unitName: product.unitName,
        unit: product.unitName,
      },
    ];

    // Commit any in-progress qty on the previous line before switching.
    const previousLineId = activeCartLineIdRef.current;
    if (previousLineId) {
      applyTypedOverlayToCart(previousLineId);
      clearQuantityOverlay(previousLineId);
    }

    setCartSync(() => nextCart);

    lastAddedProductId.current = affectedLineId;
    activeCartLineIdRef.current = affectedLineId;
    quantityFocusLineIdRef.current = affectedLineId;
    setActiveCartLineId(affectedLineId);
    // Toast removed as per user request - no toast when selecting products
  };

  // Helper function to format quantity with unit
  const formatQuantityWithUnit = (quantity: number, unitName?: string): string => {
    if (!unitName) return quantity.toFixed(2);
    
    const unitLower = unitName.toLowerCase();
    const qty = quantity;
    const formatSmart = (value: number, maxDecimals = 2) =>
      Number(value.toFixed(maxDecimals)).toString();
    
    // For weight units (kgs, kg, kilograms)
    if (unitLower.includes('kg') || unitLower.includes('kilogram')) {
      if (qty >= 1) {
        return `${formatSmart(qty)} kg`;
      } else {
        // Convert to grams for values less than 1kg
        const grams = qty * 1000;
        return `${grams.toFixed(0)} g`;
      }
    }
    
    // For gram units
    if (unitLower.includes('gram') || unitLower === 'g') {
      if (qty >= 1000) {
        const kg = qty / 1000;
        return `${formatSmart(kg)} kg`;
      } else {
        return `${qty.toFixed(0)} g`;
      }
    }
    
    // For piece units (pcs, pieces, piece)
    if (unitLower.includes('pc') || unitLower.includes('piece')) {
      return `${qty.toFixed(0)} pcs`;
    }
    
    // For other units, show with unit name
    return `${formatSmart(qty)} ${unitName}`;
  };

  const formatMoney = (value: number) => formatMoneyDisplay(value);

  const formatQuantityValue = (value: number) => {
    if (Number.isInteger(value)) return String(value);
    return Number(value.toFixed(3)).toString();
  };

  const normalizeStoredQuantity = (value: number) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return 0.01;
    return Math.max(0.01, Number(parsed.toFixed(3)));
  };

  const isWeightUnit = (unitName?: string): boolean => {
    if (!unitName) return false;
    const unitLower = unitName.toLowerCase();
    return (
      unitLower.includes("kg") ||
      unitLower.includes("kilogram") ||
      unitLower.includes("gram") ||
      unitLower === "g"
    );
  };

  const isPieceUnit = (unitName?: string): boolean => {
    if (!unitName) return false;
    const unitLower = unitName.toLowerCase();
    return unitLower.includes("pc") || unitLower.includes("piece");
  };

  const getQuantityPresetOptions = (unitName?: string) => {
    if (isWeightUnit(unitName)) {
      return [
        { value: "0.25", label: "250g", quantity: 0.25 },
        { value: "0.50", label: "500g", quantity: 0.5 },
        { value: "0.75", label: "750g", quantity: 0.75 },
        { value: "1.00", label: "1 KG", quantity: 1 },
        { value: "1.50", label: "1.5 KG", quantity: 1.5 },
        { value: "2.00", label: "2 KG", quantity: 2 },
      ];
    }

    if (isPieceUnit(unitName)) {
      return [
        { value: "1", label: "1", quantity: 1 },
        { value: "2", label: "2", quantity: 2 },
        { value: "3", label: "3", quantity: 3 },
        { value: "5", label: "5", quantity: 5 },
        { value: "10", label: "10", quantity: 10 },
      ];
    }

    return [
      { value: "0.50", label: "0.5", quantity: 0.5 },
      { value: "1.00", label: "1", quantity: 1 },
      { value: "2.00", label: "2", quantity: 2 },
    ];
  };

  const getPresetValueForQuantity = (quantity: number, unitName?: string): string => {
    const presets = getQuantityPresetOptions(unitName);
    const matched = presets.find((preset) => Math.abs(preset.quantity - quantity) < 0.0001);
    return matched?.value ?? "custom";
  };

  // Helper function to get quantity increment based on unit
  const getQuantityIncrement = (unitName?: string): number => {
    if (!unitName) return 1;
    const unitLower = unitName.toLowerCase();
    
    // For weight units (kgs, kg, kilograms, gram, grams, g)
    if (unitLower.includes('kg') || unitLower.includes('kilogram') || 
        unitLower.includes('gram') || unitLower === 'g') {
      // Increment by 0.1 (100 grams) for weight units
      return 0.1;
    }
    
    // For piece units (pcs, pieces, piece)
    if (unitLower.includes('pc') || unitLower.includes('piece')) {
      return 1;
    }
    
    // Default increment
    return 1;
  };

  const computeQuantityAfterChange = (
    currentQuantity: number,
    direction: 1 | -1,
    unitName?: string,
    mode: "preset" | "custom" = "custom",
  ): number => {
    let targetQuantity = currentQuantity;

    if (mode === "preset" && isWeightUnit(unitName)) {
      const presets = getQuantityPresetOptions(unitName).map((preset) => preset.quantity);
      const presetMin = Math.min(...presets);
      const presetMax = Math.max(...presets);
      targetQuantity =
        direction > 0
          ? Math.min(presetMax, Math.max(presetMin, currentQuantity * 2))
          : Math.max(presetMin, currentQuantity / 2);
      targetQuantity = presets.reduce((best, candidate) =>
        Math.abs(candidate - targetQuantity) < Math.abs(best - targetQuantity) ? candidate : best,
      presets[0]);
    } else {
      const increment = getQuantityIncrement(unitName);
      targetQuantity = currentQuantity + (direction > 0 ? increment : -increment);
    }

    const normalizedQuantity = normalizeStoredQuantity(targetQuantity);
    return normalizedQuantity;
  };

  const updateQuantity = (id: string, change: number) => {
    const item = cart.find((item) => item.id === id);
    // Find product by productId if item has it, otherwise fallback to id (for backward compatibility)
    const product = item && (item as any).productId 
      ? products.find((p) => p.id === (item as any).productId)
      : products.find((p) => p.id === id);

    // For testing: Allow negative sales (stock can go below 0)
    // Comment out stock validation for testing purposes
    /*
    if (item && product) {
      const newQuantity = item.quantity + change
      const availableStock = product.available_stock ?? product.stock

      if (newQuantity > availableStock) {
        toast({
          variant: "destructive",
          title: "Insufficient Stock",
          description: `Only ${availableStock} units available`,
        })
        return
      }
    }
    */

    // Get unit-aware increment
    const unitName = item?.unitName || item?.unit || product?.unitName;
    const currentQuantity = Number(item?.quantity || 0);
    const mode = quantityModes[id] ?? "preset";
    let targetQuantity = currentQuantity;

    // Keep weight preset flow simple for sellers:
    // 250g -> 500g, 1kg -> 2kg (and reverse on minus).
    if (mode === "preset" && isWeightUnit(unitName)) {
      const presets = getQuantityPresetOptions(unitName).map((preset) => preset.quantity);
      const presetMin = Math.min(...presets);
      const presetMax = Math.max(...presets);
      targetQuantity =
        change > 0
          ? Math.min(presetMax, Math.max(presetMin, currentQuantity * 2))
          : Math.max(presetMin, currentQuantity / 2);

      // Snap to nearest preset value to avoid float precision mismatches.
      targetQuantity = presets.reduce((best, candidate) =>
        Math.abs(candidate - targetQuantity) < Math.abs(best - targetQuantity) ? candidate : best,
      presets[0]);
    } else {
    const increment = getQuantityIncrement(unitName);
    const actualChange = change > 0 ? increment : -increment;
      targetQuantity = currentQuantity + actualChange;
    }

    setCart(
      cart.map((item) => {
        if (item.id === id) {
          return { ...item, quantity: normalizeStoredQuantity(targetQuantity) };
        }
        return item;
      })
    );
  };

  const updateQuantityManual = (id: string, newQuantity: number) => {
    const validQuantity = normalizeStoredQuantity(newQuantity);
    setCartSync((prev) =>
      prev.map((line) => (line.id === id ? { ...line, quantity: validQuantity } : line)),
    );
  };

  const parseCustomQuantityInput = (rawValue: string, unitName?: string): number | null => {
    const value = rawValue.trim().toLowerCase().replace(/\s+/g, "");
    if (!value) return null;

    if (isWeightUnit(unitName)) {
      const match = value.match(/^(\d*\.?\d+)(kg|kgs|g|gram|grams)?$/);
      if (!match) return null;
      const numericValue = parseFloat(match[1]);
      if (Number.isNaN(numericValue) || numericValue < 0) return null;
      const unitSuffix = match[2];

      if (unitSuffix === "g" || unitSuffix === "gram" || unitSuffix === "grams") {
        return numericValue / 1000;
      }

      if (unitSuffix === "kg" || unitSuffix === "kgs") {
        return numericValue;
      }

      // Plain number without suffix = quantity in the product's unit (kg).
      // Use an explicit suffix for grams, e.g. "250g" or "0.25".
      return numericValue;
    }

    const numericOnly = value.match(/^(\d*\.?\d+)$/);
    if (!numericOnly) return null;
    const parsed = parseFloat(numericOnly[1]);
    if (Number.isNaN(parsed) || parsed < 0) return null;
    return parsed;
  };

  const clearQuantityOverlay = (lineId: string) => {
    setQuantityInputs((prev) => {
      if (!(lineId in prev)) return prev;
      const next = { ...prev };
      delete next[lineId];
      quantityInputsRef.current = next;
      return next;
    });
  };

  const applyTypedOverlayToCart = (lineId: string) => {
    const pending = quantityInputsRef.current[lineId];
    if (pending === undefined || pending.trim() === "") return;
    const line = cartRef.current.find((l) => l.id === lineId);
    if (!line) return;
    const product = line.productId
      ? products.find((p) => p.id === line.productId)
      : undefined;
    const unitName = line.unitName || line.unit || product?.unitName;
    const parsed = parseCustomQuantityInput(pending.trim(), unitName);
    if (parsed === null || parsed <= 0) return;
    updateQuantityManual(lineId, parsed);
  };

  const switchActiveCartLine = (newId: string | null) => {
    const prevId = activeCartLineIdRef.current;
    if (prevId && prevId !== newId) {
      applyTypedOverlayToCart(prevId);
      clearQuantityOverlay(prevId);
    }
    activeCartLineIdRef.current = newId;
    setActiveCartLineId(newId);
  };

  const bumpQuantity = (id: string, direction: 1 | -1) => {
    activeCartLineIdRef.current = id;
    setActiveCartLineId(id);
    clearQuantityOverlay(id);
    setCartSync((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        const unitName = line.unitName || line.unit;
        const mode = quantityModes[id] ?? "preset";
        return {
          ...line,
          quantity: computeQuantityAfterChange(line.quantity, direction, unitName, mode),
        };
      }),
    );
  };

  const updateItemPrice = (id: string, newPrice: number) => {
    // Ensure price is valid (>= 0)
    const validPrice = Math.max(0, Number(newPrice));
    setCart(
      cart.map((item) => {
        if (item.id === id) {
          return { ...item, price: validPrice };
        }
        return item;
      })
    );
  };

  const isPriceOverridden = (item: CartItem) => {
    const effectivePrice = Number(item.actualUnitPrice ?? item.price ?? 0);
    const basePrice = Number(item.originalPrice ?? 0);
    return Math.abs(effectivePrice - basePrice) > 0.0001;
  };

  // Runtime selling price for this sale only.
  // Do not fall back to originalPrice when building print/sale payloads.
  const getSellingPrice = (item: CartItem) => {
    const fromEdited = Number(item.actualUnitPrice);
    if (!Number.isNaN(fromEdited) && fromEdited >= 0) return fromEdited;

    const fromDisplay = Number(item.price);
    if (!Number.isNaN(fromDisplay) && fromDisplay >= 0) return fromDisplay;

    return 0;
  };

  const holdCurrentSale = async () => {
    if (cart.length === 0 || !hasBranch) {
      return;
    }
    if (!requireRegisterOpen()) return;

    setIsHoldingSale(true);
    const held = await holdSale(cart, selectedCustomer || undefined);
    if (held) {
      setCart([]);
      setGlobalDiscountValue("");
      setSelectedCustomer(null);
      setPinnedCustomer(null);
    }
    setIsHoldingSale(false);
  };

  const buildCartFromRepeat = (payload: RepeatSalePayload): CartItem[] =>
    payload.items.map((item, index) => ({
      id: `repeat_${item.productId}_${Date.now()}_${index}`,
      productId: item.productId,
      name: item.name,
      price: item.price,
      originalPrice: item.price,
      actualUnitPrice: item.price,
      quantity: item.quantity,
      category: "all",
      unitId: item.unitId,
      unitName: item.unitName,
      unit: item.unitName,
    }));

  const applyRepeatSale = (
    payload: RepeatSalePayload,
    mode: "replace" | "merge",
  ) => {
    if (!requireRegisterOpen()) return;
    const incoming = buildCartFromRepeat(payload);
    setCartSync((prev) => {
      if (mode === "replace") return incoming;
      const merged = prev.map((line) => ({ ...line }));
      incoming.forEach((item) => {
        const match = merged.find(
          (line) => line.productId && line.productId === item.productId,
        );
        if (match) {
          match.quantity += item.quantity;
        } else {
          merged.push(item);
        }
      });
      return merged;
    });
    if (payload.customerId) {
      setSelectedCustomer(payload.customerId);
    }
    const label = payload.saleNumber ? ` from sale #${payload.saleNumber}` : "";
    toast.success(
      `${mode === "replace" ? "Loaded" : "Added"} ${incoming.length} item${
        incoming.length === 1 ? "" : "s"
      }${label}`,
    );
  };

  const handleRepeatSale = (payload: RepeatSalePayload) => {
    if (cartRef.current.length === 0) {
      applyRepeatSale(payload, "replace");
      return;
    }
    setRepeatConflict(payload);
  };

  const handleRetrieveHoldSale = async (index: number) => {
    if (!requireRegisterOpen()) return;
    if (cart.length > 0) {
      const shouldReplace = window.confirm(
        "Current cart will be replaced. Continue?"
      );
      if (!shouldReplace) return;
    }
    setResumingHoldIndex(index);
    const heldSale = await retrieveHoldSale(index);
    if (heldSale) {
      setCart(
        heldSale.items.map((item) => ({
          ...item,
          originalPrice: Number(item.originalPrice ?? item.price ?? 0),
          actualUnitPrice: Number(item.actualUnitPrice ?? item.price ?? 0),
        }))
      );
      setSelectedCustomer(heldSale.customerId);
      setPinnedCustomer(
        heldSale.customer
          ? {
              id: heldSale.customer.id,
              name: heldSale.customer.name,
              email: heldSale.customer.email,
              phone_number: heldSale.customer.phone_number,
              phone: heldSale.customer.phone,
              is_active: heldSale.customer.is_active,
            }
          : null,
      );
      if (heldSale.customerId) {
        setCustomerSearch("");
      }
    }
    setResumingHoldIndex(null);
  };

  const handleViewHeldSales = async () => {
    if (showHeldSales) {
      setShowHeldSales(false);
      return;
    }

    setIsViewingHeldSales(true);
    await refreshHoldSales();
    setShowHeldSales(true);
    setIsViewingHeldSales(false);
    const element = document.getElementById('held-sales-list');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Printer loading is handled globally by usePrinterSettings hook

  const removeFromCart = (id: string) => {
    setCart(cart.filter((item) => item.id !== id));
    setQuantityInputs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setQuantityModes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const clearCart = () => {
    setCart([]);
    setQuantityInputs({});
    setQuantityModes({});
    setGlobalDiscountValue("");
    setShowDiscountRow(false);
    discountTouchedRef.current = false;
    autoDiscountCustomerRef.current = null;
    setActiveCartLineId(null);
    setPriceEditLineId(null);
    activeCartLineIdRef.current = null;
  };

  const subtotal = sumMoney(
    ...cart.map((item) => lineTotal(getSellingPrice(item), item.quantity)),
  );

  const parsedDiscount = parseFloat(globalDiscountValue) || 0;
  const globalDiscountAmount = roundMoney(
    globalDiscountType === "percentage"
      ? (subtotal * parsedDiscount) / 100
      : parsedDiscount,
  );

  // Promotions, loyalty points and gift cards (the server re-checks them at checkout).
  const saleExtras = useSaleExtras({
    lines: cart.map((item) => ({
      productId: item.productId || item.id.split("_")[0],
      quantity: item.quantity,
      price: getSellingPrice(item),
    })),
    subtotal,
    manualDiscount: globalDiscountAmount,
    customerId: selectedCustomer,
    branchId: selectedBranchId,
  });

  // Amount still to collect after discounts, points and gift cards.
  const total = Math.max(
    0,
    subtractMoney(subtotal, roundMoney(globalDiscountAmount + saleExtras.extraDiscount + saleExtras.giftCardTotal)),
  );
  
  const totalQuantity = cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  useEffect(() => {
    if (!paymentDialogOpen) {
      return;
    }

    const numericValue = parseFloat(tenderedAmount);
    if (Number.isNaN(numericValue)) {
      setCalculatedChange(0);
      return;
    }

    setCalculatedChange(moneyChange(numericValue, total));
  }, [paymentDialogOpen, tenderedAmount, total]);

  const generateTransactionId = () => {
    return `SALE-${Date.now().toString().slice(-4)}`;
  };

  const currentCashierName = () => {
    try {
      const email = localStorage.getItem("userEmail") || localStorage.getItem("savedUsername") || "";
      if (email) return email.includes("@") ? email.split("@")[0] : email;
      const token = localStorage.getItem("token");
      if (token) {
        const payload = JSON.parse(atob(token.split(".")[1] || ""));
        const fromJwt = payload?.email || payload?.username || "";
        if (fromJwt) {
          try {
            localStorage.setItem("userEmail", String(fromJwt));
          } catch {
            /* ignore */
          }
          return String(fromJwt).includes("@") ? String(fromJwt).split("@")[0] : String(fromJwt);
        }
      }
      return "Cashier";
    } catch {
      return "Cashier";
    }
  };

  const buildReceiptDataForServer = (
    transactionId: string,
    method: string,
    cartSnapshot: CartItem[],
    amountPaid: number,
    changeAmount: number,
    timestamp: string
  ): ReceiptData => {
    const customer = selectedCustomer
      ? customers.find((c) => c.id === selectedCustomer)
      : null;
    const salesperson = salespersonId
      ? salespeople.find((p) => p.id === salespersonId)
      : null;
    const customerName = customer?.name?.trim() || customer?.email || "Walk-in";
    const customerPhone =
      customer?.phone_number?.trim() ||
      customer?.phone?.trim() ||
      "";

    return {
      storeName: branchInfo.name,
      tagline: "Elegance, crafted for every moment.",
      address: branchInfo.address,
      transactionId,
      timestamp,
      cashier: currentCashierName(),
      salesperson: salesperson?.name || undefined,
      customerType: customerName,
      customerPhone: customerPhone || undefined,
      items: cartSnapshot.map((item) => {
        const unitLabel =
          (item as any)?.unit?.name ||
          (item as any)?.unitName ||
          (item as any)?.unit_name ||
          (typeof (item as any)?.unit === "string" ? (item as any).unit : undefined) ||
          undefined;
        const unitPrice = getSellingPrice(item);
        const rawQty = Number(item.quantity) || 0;
        const parts = formatReceiptQtyParts(rawQty, unitLabel);
        return {
          name: item.name,
          quantity: parts.quantity,
          price: unitPrice,
          unit: parts.unit,
          lineTotal: unitPrice * rawQty,
        };
      }),
      subtotal,
      discount: globalDiscountAmount + saleExtras.extraDiscount > 0 ? roundMoney(globalDiscountAmount + saleExtras.extraDiscount) : undefined,
      // Bill total; any gift card part is shown as already paid.
      total: roundMoney(total + saleExtras.giftCardTotal),
      paymentMethod: saleExtras.giftCardTotal > 0 ? `GIFT CARD ${Math.round(saleExtras.giftCardTotal)} + ${method.toUpperCase()}` : method === "Cash" ? "CASH" : method === "Card" ? "CARD" : method.toUpperCase(),
      amountPaid,
      changeAmount: changeAmount > 0 ? changeAmount : undefined,
      thankYouMessage: "Thank you for shopping!",
      footerMessage: "Visit us again soon!",
    };
  };

  const handleStartNewSale = () => {
    setSaleSuccessOpen(false);
    setCompletedReceiptData(null);
    setCompletedSaleNumber("");
    setCompletedTotalReceived(0);
    setCompletedCustomerPhone("");
    setCompletedCustomerEmail("");
    setCart([]);
    setGlobalDiscountValue("");
    setShowDiscountRow(false);
    discountTouchedRef.current = false;
    autoDiscountCustomerRef.current = null;
    setSelectedCustomer(null);
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const handleSuccessPrint = async () => {
    if (!completedReceiptData) return;
    const printerInfo = getReceiptPrinterObj();
    if (!printerInfo) {
      toast.error("Please select a receipt printer in Printer Settings");
      return;
    }
    try {
      await printReceiptViaServer(
        {
          ...printerInfo,
          columns: printerInfo.receiptProfile?.columns || { fontA: 48, fontB: 64 },
        },
        completedReceiptData,
        { copies: 1, cut: true, openDrawer: false }
      );
      toast.success("Receipt sent to printer");
    } catch (err: any) {
      toast.error(err?.message || "Failed to print receipt");
    }
  };

  const handleSuccessDownloadPdf = async () => {
    if (!completedReceiptData) return;
    try {
      await downloadReceiptPdf(completedReceiptData, logoDataUri);
    } catch (err: any) {
      toast.error(err?.message || "Failed to download receipt");
    }
  };

  const handleSuccessShareWhatsApp = async () => {
    if (!completedReceiptData) return;
    try {
      const { fellBack } = await shareReceiptOnWhatsApp(
        completedReceiptData,
        logoDataUri,
        completedCustomerPhone
      );
      if (fellBack) {
        toast.success("Receipt downloaded", {
          description:
            "Your browser doesn't support direct file share. Attach the PDF in the WhatsApp chat.",
        });
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to share receipt");
    }
  };

  const handleSuccessEmail = async () => {
    if (!completedReceiptData) return;
    try {
      await downloadReceiptPdf(completedReceiptData, logoDataUri);
      const customer = customers.find((c) => c.id === selectedCustomer);
      const email = completedCustomerEmail || customer?.email || "";
      const subject = encodeURIComponent(
        `Receipt ${completedSaleNumber} — ${branchInfo.name}`
      );
      const body = encodeURIComponent(
        `Sale ${completedSaleNumber} completed.\nTotal received: Rs ${formatMoneyDisplay(completedTotalReceived)}\n\nThe receipt PDF has been downloaded. Please attach it to this email.`
      );
      window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_self");
    } catch (err: any) {
      toast.error(err?.message || "Failed to prepare email");
    }
  };


  const resetPaymentState = () => {
    setPaymentDialogOpen(false);
    setPaymentMethodPending(null);
    setTenderedAmount("");
    setCalculatedChange(0);
    setPaymentError("");
  };

  const handlePaymentDialogOpenChange = (open: boolean) => {
    if (open) {
      setPaymentDialogOpen(true);
      return;
    }
    resetPaymentState();
  };

  const startPayment = (method: CheckoutMethod) => {
    if (!hasBranch) {
      return;
    }
    if (!requireRegisterOpen()) return;

    setPaymentMethodPending(method);
    setTenderedAmount(formatMoneyFixed(total));
    setPaymentError("");
    setCalculatedChange(0);
    setPaymentDialogOpen(true);
  };

  const handleTenderedInputChange = (value: string) => {
    setTenderedAmount(value);
    if (paymentError) {
      setPaymentError("");
    }
  };

  const confirmPayment = async () => {
    if (!paymentMethodPending) {
      return;
    }

    const amountNumber = parseFloat(tenderedAmount);
    if (Number.isNaN(amountNumber)) {
      setPaymentError("Enter a valid amount received.");
      return;
    }

    if (isMoneyLessThan(amountNumber, total)) {
      setPaymentError("Received amount cannot be less than the payable total.");
      return;
    }

    const change = moneyChange(amountNumber, total);
    setPaymentError("");

    // On success, handlePayment itself closes this dialog right before
    // opening the success modal (see comment there) — nothing left to do
    // here. On failure it deliberately stays open so the error is visible.
    await handlePayment(paymentMethodPending, amountNumber, change);
  };

  const handlePayment = async (
    method: string,
    amountPaid: number,
    changeAmount: number,
    tender?: TenderResult
  ) => {
    // Block re-entry synchronously — a stuck Enter / scanner can call this
    // several times before `paymentLoading` re-renders the buttons disabled.
    if (saleInFlightRef.current) {
      console.warn("Sale submission already in progress — ignoring duplicate");
      return false;
    }
    if (!requireRegisterOpen()) {
      return false;
    }
    saleInFlightRef.current = true;

    const cartSnapshot = cart.map((item) => ({ ...item }));

    try {
      return await withPaymentLoading(async () => {
      try {
        // Prepare items for API
        const saleItems = cartSnapshot.map((item) => {
          // Use productId if available, otherwise fallback to extracting from id
          // (for backward compatibility, though productId should always be set)
          const productId = item.productId || item.id.split('_')[0];
          if (!productId) {
            throw new Error(`Missing product ID for item: ${item.name}`);
          }
          const effectivePrice = getSellingPrice(item);
          return {
            productId,
            quantity: item.quantity,
            price: effectivePrice,
          };
        });

        const branchId = selectedBranchId;

        if (!branchId) {
          throw new Error("A branch must be selected before creating a sale.");
        }

        // Prepare payload
        const payload: any = {
          items: saleItems,
          paymentMethod: tender?.primary ?? (method === "Cash" ? "CASH" : "CARD"),
          branchId,
          discountAmount: globalDiscountAmount,
        };
        if (selectedCustomer) {
          payload.customerId = selectedCustomer;
        }
        if (salespersonId) {
          payload.salespersonId = salespersonId;
        }
        if (tender) {
          payload.payments = tender.payments;
        }
        Object.assign(payload, saleExtras.payload);

        // Check if online
        const isOnline = syncManager.canMakeRequest();
        
        let saleData: any;
        let transactionId: string;
        
        if (isOnline) {
          // Online: Call create sale API
          try {
            const saleResponse = await apiClient.post("/sale", payload);
            saleData = saleResponse.data.data;
            transactionId = saleData.sale_number || generateTransactionId();
          } catch (error: any) {
            const status = error?.response?.status;
            if (status && status < 500) {
              toast.error(error?.response?.data?.message || "The sale was not accepted");
              throw error;
            }
            if (saleExtras.active) {
              toast.error("Can't reach the server — remove promotions, points or gift cards to save this sale offline.");
              throw error;
            }
            // If API call fails, fall back to offline mode
            console.warn("API call failed, saving offline:", error);
            transactionId = generateTransactionId();
            saleData = {
              sale_number: transactionId,
              id: `offline_${transactionId}`,
              _pending: true,
              _offline: true
            };
            
            // Save sale to IndexedDB for later sync
            await offlineDB.saveSale({
              id: transactionId,
              products: saleItems,
              total: total,
              customer: selectedCustomer ? { id: selectedCustomer } : null,
              payment: {
                method: tender?.primary ?? (method === "Cash" ? "CASH" : "CARD"),
                payments: tender?.payments,
                amountPaid,
                changeAmount
              },
              employeeId: localStorage.getItem("userId") || undefined,
              branchId: branchId || undefined,
              timestamp: Date.now(),
              synced: false,
              discountAmount: globalDiscountAmount,
              salespersonId: salespersonId || undefined,
            });
            // Synced later by syncManager.syncSales() — do NOT also queue via
            // offlineAPIClient.post, that made every offline sale post twice.
          }
        } else {
          // Offline: Generate local sale ID and save to IndexedDB
          transactionId = generateTransactionId();
          saleData = {
            sale_number: transactionId,
            id: `offline_${transactionId}`,
            _pending: true,
            _offline: true
          };
          
          // Save sale to IndexedDB for later sync
          await offlineDB.saveSale({
            id: transactionId,
            products: saleItems,
            total: total,
            customer: selectedCustomer ? { id: selectedCustomer } : null,
            payment: {
              method: tender?.primary ?? (method === "Cash" ? "CASH" : "CARD"),
              payments: tender?.payments,
              amountPaid,
              changeAmount
            },
            employeeId: localStorage.getItem("userId") || undefined,
            branchId: branchId || undefined,
            timestamp: Date.now(),
            synced: false,
            discountAmount: globalDiscountAmount,
            salespersonId: salespersonId || undefined,
          });
          // Synced later by syncManager.syncSales() — do NOT also queue via
          // offlineAPIClient.post, that made every offline sale post twice.

          console.log("💾 Sale saved offline, will sync when connection restored");
        }
        const receiptDataForServer = buildReceiptDataForServer(
          transactionId,
          method,
          cartSnapshot,
          amountPaid,
          changeAmount,
          new Date().toISOString()
        );

        const customerAtSale = selectedCustomer
          ? customers.find((c) => c.id === selectedCustomer)
          : null;

        saleExtras.reset();
        setCompletedReceiptData(receiptDataForServer);
        setCompletedSaleNumber(transactionId);
        setCompletedTotalReceived(amountPaid);
        setCompletedCustomerPhone(
          customerAtSale?.phone ||
            customerAtSale?.phone_number ||
            ""
        );
        setCompletedCustomerEmail(customerAtSale?.email || "");
        // Close the payment dialog and open the success modal in the same
        // tick — closing it in the caller (after this promise resolves)
        // left both dialogs mounted for a render, stacking two overlays.
        resetPaymentState();
        setSaleSuccessOpen(true);

        // Save transaction to local storage (simulate database)
        const transactions = JSON.parse(
          localStorage.getItem("transactions") || "[]"
        );
        transactions.push(receiptData);
        localStorage.setItem("transactions", JSON.stringify(transactions));

        setLastTransactionId(transactionId);

        // Always auto-print the receipt — there's no user toggle for this.
        try {
          // Get printer from global settings (Printer Settings page)
          const printerToUse = getReceiptPrinterObj();
          if (!printerToUse) {
            throw new Error("No receipt printer configured. Go to Printer Settings to select one.");
          }

          const printerObj = {
            ...printerToUse,
            columns: printerToUse.receiptProfile?.columns || { fontA: 48, fontB: 64 },
          };

          const job = {
            copies: 1,
            cut: true,
            openDrawer: false,
          };

          await printReceiptViaServer(
            printerObj,
            receiptDataForServer,
            job
          );
        } catch (printError) {
          console.error("Print error:", printError);
        }

        setTimeout(() => {
          setCart([]);
          setGlobalDiscountValue("");
          setShowDiscountRow(false);
          discountTouchedRef.current = false;
          autoDiscountCustomerRef.current = null;
        }, 300);

        return true;
      } catch (error) {
        console.error("Payment error:", error);
        // Payment failed - no toast shown
        return false;
      }
      });
    } finally {
      saleInFlightRef.current = false;
    }
  };

  // Create optimized lookup maps for O(1) product access
  // Build comprehensive barcode map indexing by barcode, code, and SKU
  // This ensures products can be found by any identifier
  const barcodeMap = useMemo(() => {
    const map = new Map<string, Product>();
    const exactMatches = new Map<string, Product>(); // Track exact matches separately
    
    products.forEach(product => {
      // Index by label barcode, barcode, code, SKU
      if (product.label_barcode) {
        const lb = product.label_barcode.toLowerCase().trim();
        if (lb) {
          exactMatches.set(lb, product);
          map.set(lb, product);
        }
      }
      if (product.barcode) {
        const barcodeLower = product.barcode.toLowerCase().trim();
        if (barcodeLower) {
          exactMatches.set(barcodeLower, product);
          map.set(barcodeLower, product);
        }
      }
      
      // Index by code (if exists) - this is critical for CODE-PRICE format scanning
      if (product.code) {
        const codeLower = product.code.toLowerCase().trim();
        if (codeLower) {
          exactMatches.set(codeLower, product);
          map.set(codeLower, product);
        }
      }
      
      // Index by SKU (if exists)
      if (product.sku) {
        const skuLower = product.sku.toLowerCase().trim();
        if (skuLower) {
          exactMatches.set(skuLower, product);
          map.set(skuLower, product);
        }
      }

      if (product.custom_code) {
        const customLower = product.custom_code.toLowerCase().trim();
        if (customLower) {
          exactMatches.set(customLower, product);
          map.set(customLower, product);
        }
      }
    });
    
    // Store exact matches map for priority lookup
    (map as any).exactMatches = exactMatches;
    
    return map;
  }, [products]);

  const findProductByBarcode = (barcode: string): Product | null => {
    if (!barcode) return null;
    
    const searchKey = barcode.toLowerCase().trim();
    if (!searchKey) return null;
    
    const exactMatches = (barcodeMap as any).exactMatches as Map<string, Product>;
    
    // CRITICAL: Try exact match FIRST - this prevents wrong product matches
    // Exact match has highest priority to avoid prefix matching issues
    if (exactMatches) {
      const exactMatch = exactMatches.get(searchKey);
      if (exactMatch) {
        console.log('Exact match found:', searchKey, '->', exactMatch.name);
        return exactMatch;
      }
    }
    
    // Try exact match from main map
    const exactMatch = barcodeMap.get(searchKey);
    if (exactMatch) {
      console.log('Exact match found (main map):', searchKey, '->', exactMatch.name);
      return exactMatch;
    }
    
    // Only if no exact match, try linear search for startsWith matches
    // This ensures we find the most specific match first
    let bestMatch: Product | null = null;
    let bestMatchLength = 0;
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      
      // Check barcode field
      if (product.barcode) {
        const barcodeLower = product.barcode.toLowerCase().trim();
        if (barcodeLower === searchKey) {
          // Exact match - return immediately
          return product;
        }
        if (barcodeLower.startsWith(searchKey) && barcodeLower.length > bestMatchLength) {
          bestMatch = product;
          bestMatchLength = barcodeLower.length;
        }
      }
      
      // Check code field
      if (product.code) {
        const codeLower = product.code.toLowerCase().trim();
        if (codeLower === searchKey) {
          // Exact match - return immediately
          return product;
        }
        if (codeLower.startsWith(searchKey) && codeLower.length > bestMatchLength) {
          bestMatch = product;
          bestMatchLength = codeLower.length;
        }
      }
      
      // Check SKU field
      if (product.sku) {
        const skuLower = product.sku.toLowerCase().trim();
        if (skuLower === searchKey) {
          // Exact match - return immediately
          return product;
        }
        if (skuLower.startsWith(searchKey) && skuLower.length > bestMatchLength) {
          bestMatch = product;
          bestMatchLength = skuLower.length;
        }
      }
    }
    
    if (bestMatch) {
      console.log('Best match found:', searchKey, '->', bestMatch.name);
      return bestMatch;
    }
    
    console.warn('No product found for barcode:', searchKey);
    return null;
  };

  const handleBarcodeScan = async () => {
    setScanLoading(true);
    try {
      // Simulate barcode scanning
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Simulate finding a product by barcode
      const randomProduct =
        products[Math.floor(Math.random() * products.length)];
      await addToCart(randomProduct);
    } catch (error) {
      // Scan failed - no toast shown
    } finally {
      setScanLoading(false);
    }
  };

  const lookupProductFromApi = async (code: string): Promise<Product | null> => {
    try {
      const res = await apiClient.get("/products", {
        params: {
          search: code,
          limit: 20,
          is_active: true,
          display_on_pos: true,
        },
      });
      const raw = Array.isArray(res.data?.data) ? res.data.data : [];
      const mapped = raw.map(mapApiProductToStoreProduct) as Product[];
      const key = code.toLowerCase().trim();
      const exact = mapped.find((item) =>
        [item.code, item.sku, item.barcode, item.label_barcode].some(
          (value) => value?.toLowerCase().trim() === key,
        ),
      );
      return exact || mapped[0] || null;
    } catch {
      return null;
    }
  };

  const handleScannerInput = (scannedValue: string) => {
    void processScannerInput(scannedValue);
  };

  const processScannerInput = async (scannedValue: string) => {
    // Prevent duplicate processing of the same scan
    const trimmedValue = scannedValue.trim();
    
    // Skip if already processing or if this is the same value we just processed
    if (isProcessingScanRef.current || lastProcessedScanRef.current === trimmedValue) {
      return;
    }
    
    // Mark as processing and store the value
    isProcessingScanRef.current = true;
    lastProcessedScanRef.current = trimmedValue;
    
    // Process immediately - zero delays, zero async operations
    
    // Full-string match first (custom label_barcode, 9-digit SKU, or exact code)
    let product = findProductByBarcode(trimmedValue.toLowerCase());
    if (product) {
      let scanPrice: number | undefined;
      const dash = trimmedValue.indexOf("-");
      if (dash > 0) {
        const tail = trimmedValue.substring(dash + 1).replace(/[^\d.]/g, "");
        const p = parseFloat(tail);
        if (!Number.isNaN(p) && p >= 0 && Number.isFinite(p)) scanPrice = p;
      }
      addToCart(product, 1, scanPrice);
      isProcessingScanRef.current = false;
      lastProcessedScanRef.current = "";
      const input = searchInputRef.current;
      if (input) {
        input.value = "";
        isUserInteractingRef.current = false;
        setTimeout(() => {
          if (input && !paymentDialogOpen) {
            input.focus();
            input.select();
          }
        }, 10);
        startTransition(() => setSearchTerm(""));
      }
      return;
    }

    // Ultra-fast parsing - single pass extraction
    const dashIndex = trimmedValue.indexOf('-');
    let productCode: string;
    let customPrice: number | undefined = undefined;
    
    if (dashIndex > 0) {
      // Extract code and price in one operation
      productCode = trimmedValue.substring(0, dashIndex).trim();
      const priceStr = trimmedValue.substring(dashIndex + 1).trim();
      // Parse price - handle both integer and decimal values
      // Remove any non-numeric characters except decimal point
      const cleanPriceStr = priceStr.replace(/[^\d.]/g, '');
      const parsedPrice = parseFloat(cleanPriceStr);
      if (!isNaN(parsedPrice) && parsedPrice >= 0 && isFinite(parsedPrice)) {
        customPrice = parsedPrice;
        console.log('Barcode scan - Code:', productCode, 'Raw price string:', priceStr, 'Parsed price:', customPrice);
      } else {
        console.error('Failed to parse price from:', priceStr, 'Cleaned:', cleanPriceStr, 'Parsed:', parsedPrice);
      }
    } else {
      productCode = trimmedValue.trim();
    }

    // Product lookup - use exact code first, then fallback to best match
    const codeLower = productCode.toLowerCase().trim();
    product = null;
    
    // CRITICAL: Try multiple matching strategies to find the correct product
    // 1. First try exact match on the full code (highest priority)
    product = findProductByBarcode(codeLower);
    console.log('Step 1 - Exact code match:', codeLower, 'Found:', product?.name || 'NOT FOUND');

    if (!product) {
      product = await lookupProductFromApi(productCode);
      console.log('Step 1b - API lookup:', codeLower, 'Found:', product?.name || 'NOT FOUND');
    }
    
    // 2. If not found and we have a price, try matching by price number in product name
    // This handles cases like "ROA432910-180" where "180" is in product name "Roasted Cashew Nuts (180)"
    if (!product && customPrice !== undefined) {
      const priceNumber = Math.round(customPrice).toString();
      // Look for products where name contains the price number in parentheses or as suffix
      const priceMatch = products.find(p => {
        const nameLower = p.name.toLowerCase();
        // Match patterns like "(180)", " 180", or ending with "180"
        return nameLower.includes(`(${priceNumber})`) || 
               nameLower.includes(` ${priceNumber} `) || 
               nameLower.endsWith(` ${priceNumber}`) ||
               nameLower.match(new RegExp(`[^0-9]${priceNumber}[^0-9]`));
      });
      if (priceMatch) {
        product = priceMatch;
        console.log('Step 2 - Price number match:', priceNumber, 'Found:', product.name);
      }
    }
    
    // 3. If not found and code contains numbers, try matching by extracting numeric part
    if (!product && /\d/.test(codeLower)) {
      const numericMatch = codeLower.match(/\d+/);
      if (numericMatch) {
        const numericPart = numericMatch[0];
        product = findProductByBarcode(numericPart);
        console.log('Step 3 - Numeric part match:', numericPart, 'Found:', product?.name || 'NOT FOUND');
      }
    }
    
    // 4. If still not found, try matching product name contains the code
    if (!product) {
      const codeInName = products.find(p => {
        const nameLower = p.name.toLowerCase();
        return nameLower.includes(`(${codeLower})`) || 
               nameLower.includes(` ${codeLower} `) || 
               nameLower.endsWith(` ${codeLower}`);
      });
      if (codeInName) {
        product = codeInName;
        console.log('Step 4 - Name pattern match:', codeLower, 'Found:', product.name);
      }
    }
    
    console.log('FINAL RESULT - Code:', codeLower, 'Price:', customPrice, 'Found Product:', product?.name || 'NOT FOUND', 'ID:', product?.id);
    
    if (!product) {
      console.error('Product not found for scanned code:', productCode, 'Price:', customPrice);
      // Reset processing flag to allow next scan
      isProcessingScanRef.current = false;
      lastProcessedScanRef.current = '';
      return; // Exit early - don't add to cart
    }
    // Add to cart immediately if found (synchronous, no delays)
    if (product) {
      console.log('✅ SUCCESS - Adding to cart:', {
        scannedCode: productCode,
        scannedPrice: customPrice,
        matchedProduct: product.name,
        productId: product.id,
        productCode: product.code,
        productSKU: product.sku,
        productBarcode: product.barcode,
        productPrice: product.price
      });
      addToCart(product, 1, customPrice);
    } else {
      console.error('Product not found for code:', productCode);
    }
    
    // Clear input instantly via direct DOM manipulation (fastest method)
    const input = searchInputRef.current;
    if (input) {
      input.value = '';
      // Reset interaction flag and refocus search input after processing scan
      isUserInteractingRef.current = false;
      setTimeout(() => {
        if (input && !paymentDialogOpen) {
          input.focus();
          input.select();
        }
      }, 10);
      // Use startTransition for non-urgent state update
      startTransition(() => {
        setSearchTerm("");
      });
    } else {
      setSearchTerm("");
    }
    
    // Brief loading indicator (50ms - just enough for visual feedback)
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      // Reset processing flag after a short delay to allow next scan
      setTimeout(() => {
        isProcessingScanRef.current = false;
        lastProcessedScanRef.current = '';
      }, 100);
    }, 50);
  };

  const selectProductForSale = (product: Product) => {
    addToCart(product, 1);
    setProductSearchOpen(false);
    setSearchTerm("");
    setHighlightedProductIndex(0);
  };

  const handleProductClick = (product: Product) => {
    selectProductForSale(product);
  };

  // Enter on desktop and Next/Search on the phone keyboard both land here.
  const commitSearchEntry = () => {
    // Keydown Enter and the form's Next/submit can both fire for one tap.
    if (enterKeyPressedRef.current) return;
    const trimmed = searchTerm.trim();
    if (!trimmed) return;
    enterKeyPressedRef.current = true;

    const isNumericBarcode =
      /^\d{8,}$/.test(trimmed) ||
      /^\d{12,13}$/.test(trimmed) ||
      /^\d{8}$/.test(trimmed);
    const isCodePriceFormat = trimmed.includes("-") && trimmed.length > 3;

    const added =
      isNumericBarcode ||
      isCodePriceFormat ||
      searchDropdownProducts.length > 0;

    if (searchDropdownProducts.length === 1 && searchDropdownProducts[0]) {
      selectProductForSale(searchDropdownProducts[0]);
    } else if (isNumericBarcode || isCodePriceFormat) {
      handleScannerInput(trimmed);
    } else if (searchDropdownProducts.length > 0) {
      const product =
        searchDropdownProducts[highlightedProductIndex] ??
        searchDropdownProducts[0];
      selectProductForSale(product);
    }

    if (added) {
      focusSearchInput({ clear: true, allowTouch: true });
    }

    setTimeout(() => {
      enterKeyPressedRef.current = false;
    }, 100);
  };

  const handleCategoryChange = async (categoryId: string) => {
    setSelectedCategory(categoryId);
    // No need to set loading state as we're using cached data
  };

  // Global keyboard shortcuts - DISABLED during scanning to prevent interference
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable all shortcuts when scanning is active
      if (isScanning) {
        return;
      }
      
      // Don't handle shortcuts when typing in inputs or dialogs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // If it's the search input, allow normal typing
        if (target === searchInputRef.current) {
          return;
        }
        // For other inputs, only handle special shortcuts
        // 'C' for Cash, 'D' for Card when in payment dialog
        if (paymentDialogOpen) {
          if (e.key === 'c' || e.key === 'C') {
            e.preventDefault();
            if (!paymentMethodPending) {
              startPayment("Cash");
            }
            return;
          }
          if (e.key === 'd' || e.key === 'D') {
            e.preventDefault();
            if (!paymentMethodPending) {
              startPayment("Card");
            }
            return;
          }
        }
        return;
      }

      // Global shortcuts (when not in input)
      // Ctrl+Enter for Cash payment
      if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (cart.length > 0 && total > 0 && !paymentDialogOpen) {
          startPayment("Cash");
        }
        return;
      }

      // Shift+Enter for Card payment
      if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (cart.length > 0 && total > 0 && !paymentDialogOpen) {
          startPayment("Card");
        }
        return;
      }

      // 'C' for Cash payment
      if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (cart.length > 0 && total > 0 && !paymentDialogOpen) {
          startPayment("Cash");
        }
        return;
      }

      // 'D' for Card payment
      if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (cart.length > 0 && total > 0 && !paymentDialogOpen) {
          startPayment("Card");
        }
        return;
      }

      // Any alphabet key (a-z, A-Z) focuses search input - DISABLED to prevent interference with scanning
      // Commented out to prevent focus issues during scanning
      /*
      if (/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (searchInputRef.current) {
          e.preventDefault();
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
      }
      */
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cart, total, paymentDialogOpen, paymentMethodPending, startPayment, isScanning]);

  return (
    <div className="relative flex min-h-full flex-col lg:h-full lg:min-h-0 lg:flex-row">
      {mobileCartOpen && cart.length > 0 && (
        <button
          type="button"
          aria-label="Close cart"
          className="fixed inset-0 z-20 bg-black/40 touch-none overscroll-none lg:hidden"
          onClick={() => setMobileCartOpen(false)}
          onTouchMove={(event) => event.preventDefault()}
        />
      )}

      {/* Products Section */}
      <div
        ref={productScrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-auto p-3 sm:p-4 md:p-6 [overflow-anchor:none]",
          cart.length > 0 && "pb-28 sm:pb-40 lg:pb-6",
          mobileCartOpen && cart.length > 0 && "max-lg:overflow-hidden max-lg:pointer-events-none",
        )}
      >
        <div className="mb-2 sm:mb-4 md:mb-6">
          {hasBranch && registerBlockMessage ? (
            <div
              className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-950 sm:mb-4"
              role="status"
            >
              <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Sales paused — cash register not ready</p>
                <p className="text-xs text-amber-800">{registerBlockMessage}</p>
              </div>
            </div>
          ) : null}
          <div className="mb-2 hidden flex-col gap-3 sm:mb-4 sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0 pl-10 lg:pl-0">
              <h1 className="text-lg font-bold text-gray-900 sm:text-xl">New Sale</h1>
              {lastTransactionId && (
                <p className="text-sm text-green-600">
                  Last transaction: {lastTransactionId}
                </p>
              )}
            </div>
            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <RepeatSaleCombobox
                branchId={selectedBranchId}
                disabled={paymentLoading || branchLoading || !salesAllowed}
                onRepeat={handleRepeatSale}
              />
              {cart.length > 0 && (
                <Button
                  variant="outline"
                  onClick={holdCurrentSale}
                  disabled={isHoldingSale || branchLoading || !salesAllowed}
                >
                  {isHoldingSale ? "Saving..." : "Hold Sale"}
                </Button>
              )}
              {holdSales.length > 0 && (
                <div className="flex items-center">
                  <Badge
                    variant="secondary"
                    className="mr-2 bg-blue-100 text-blue-800"
                  >
                    {holdSales.length} held
                  </Badge>
                  <Button
                    variant="outline"
                    onClick={handleViewHeldSales}
                    disabled={isViewingHeldSales || holdSalesLoading || branchLoading || !salesAllowed}
                  >
                    {isViewingHeldSales || holdSalesLoading ? "Loading..." : "View Held Sales"}
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="mb-3 grid grid-cols-1 gap-2.5 sm:mb-4 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:mb-2 sm:text-xs">
                Customer
              </label>
              <CustomerSearchCombobox
                customers={customersForPicker}
                loading={customersLoading}
                value={selectedCustomer}
                onChange={(customerId) => {
                  setSelectedCustomer(customerId);
                  if (!customerId) setPinnedCustomer(null);
                  else {
                    const picked = customersForPicker.find((c) => c.id === customerId);
                    if (picked) setPinnedCustomer(picked);
                  }
                }}
                onCreated={(customer) => {
                  setSelectedCustomer(customer.id);
                  setPinnedCustomer(customer);
                }}
                onSearch={(query) => {
                  if (customerSearchTimerRef.current) {
                    window.clearTimeout(customerSearchTimerRef.current);
                  }
                  customerSearchTimerRef.current = window.setTimeout(() => {
                    setCustomerSearch(query.trim());
                  }, 250);
                }}
                disabled={paymentLoading}
              />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:mb-2 sm:text-xs">
                Salesperson
              </label>
              <SalespersonPicker
                value={salespersonId}
                onChange={setSalespersonId}
                people={salespeople}
                loading={salespeopleLoading}
                disabled={paymentLoading}
              />
            </div>
            <div className="min-w-0 sm:col-span-2 xl:col-span-1">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:mb-2 sm:text-xs">
                Category
              </label>
              <CategoryFilterCombobox
                categories={posCategories}
                loading={categoriesLoading || productsLoading}
                value={selectedCategory}
                onChange={handleCategoryChange}
                disabled={paymentLoading}
              />
            </div>
          </div>
          {!hasBranch && !branchLoading && (
            <p className="mb-4 max-w-sm text-sm text-amber-700">
              Branch is not configured. Hold Sale and checkout may fail until a branch is assigned.
            </p>
          )}
          <div className="mb-2 sm:hidden">
            <RepeatSaleCombobox
              branchId={selectedBranchId}
              disabled={paymentLoading || branchLoading || !salesAllowed}
              className="h-9 w-full bg-white text-sm font-normal"
              onRepeat={handleRepeatSale}
            />
          </div>
          <div className="mb-2 sm:mb-3">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:mb-2 sm:text-xs">
              Product search
            </label>
            <div className="relative w-full">
              <div className="relative w-full">
                <Search className={`pointer-events-none absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 ${isScanning ? 'text-blue-500 animate-pulse' : 'text-gray-400'}`} />
                {isScanning && (
                  <LoadingSpinner size="sm" className="absolute right-3 top-1/2 transform -translate-y-1/2" />
                )}
                <form
                  autoComplete="off"
                  action=""
                  onSubmit={(e) => {
                    e.preventDefault();
                    // Phone keyboards submit the form on Next instead of keydown Enter.
                    commitSearchEntry();
                  }}
                >
                <Input
                  ref={searchInputRef}
                  type="text"
                  name="pos-product-search"
                  placeholder={isScanning ? "Scanning…" : "Scan or search…"}
                  value={searchTerm}
                  {...searchFieldDomProps}
                  enterKeyHint="next"
                  onFocus={() => {
                    if (searchTerm.trim()) setProductSearchOpen(true);
                  }}
                  onBlur={(e) => {
                    const relatedTarget = e.relatedTarget as HTMLElement;
                    if (relatedTarget && (
                      relatedTarget.closest('[data-product-search-dropdown]') ||
                      relatedTarget.getAttribute('data-price-input') === 'true' ||
                      relatedTarget.getAttribute('data-quantity-input') === 'true' ||
                      relatedTarget.getAttribute('data-quick-qty') === 'true' ||
                      relatedTarget.closest('[data-quick-qty="true"]') ||
                      relatedTarget.getAttribute('data-quantity-select') === 'true' ||
                      relatedTarget.getAttribute('data-amount-input') === 'true' ||
                      relatedTarget.tagName === 'SELECT' ||
                      relatedTarget.closest('select')
                    )) {
                      return;
                    }
                    setProductSearchOpen(false);
                  }}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearchTerm(value);
                    setHighlightedProductIndex(0);
                    setProductSearchOpen(value.trim().length > 0);

                    if (scanTimeoutRef.current) {
                      clearTimeout(scanTimeoutRef.current);
                      scanTimeoutRef.current = null;
                    }

                    if (value.includes('-') && value.length > 6) {
                      const parts = value.split('-');
                      if (parts.length >= 2) {
                        const codePart = parts[0].trim();
                        const pricePart = parts.slice(1).join('-').trim();
                        if (codePart.length > 0 && /^\d{3,}(\.\d+)?$/.test(pricePart)) {
                          if (enterKeyPressedRef.current) {
                            enterKeyPressedRef.current = false;
                            return;
                          }
                          if (scanTimeoutRef.current) {
                            clearTimeout(scanTimeoutRef.current);
                          }
                          scanTimeoutRef.current = setTimeout(() => {
                            const currentValue = searchInputRef.current?.value || '';
                            if (currentValue === value && value.includes('-')) {
                              const finalParts = currentValue.split('-');
                              if (finalParts.length >= 2 && finalParts[1].trim().length > 0) {
                                handleScannerInput(currentValue);
                              }
                            }
                            scanTimeoutRef.current = null;
                          }, 300);
                        }
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    const trimmed = searchTerm.trim();

                    if (e.key === "Escape") {
                      e.preventDefault();
                      setProductSearchOpen(false);
                      setHighlightedProductIndex(0);
                      return;
                    }

                    if (e.key === "ArrowDown" && searchDropdownProducts.length > 0) {
                      e.preventDefault();
                      setProductSearchOpen(true);
                      setHighlightedProductIndex((i) =>
                        Math.min(i + 1, searchDropdownProducts.length - 1),
                      );
                      return;
                    }

                    if (e.key === "ArrowUp" && searchDropdownProducts.length > 0) {
                      e.preventDefault();
                      setProductSearchOpen(true);
                      setHighlightedProductIndex((i) => Math.max(i - 1, 0));
                      return;
                    }

                    if (e.key === "Enter" || e.key === "NumpadEnter" || e.key === "Go") {
                      e.preventDefault();
                      commitSearchEntry();
                      return;
                    }
                  }}
                  className={cn(
                    "h-11 border-gray-200 pl-9 text-base shadow-sm focus-visible:ring-1 focus-visible:ring-blue-400 focus-visible:ring-offset-0 sm:h-10 sm:pl-10 sm:text-sm [&::-webkit-search-cancel-button]:hidden",
                    isScanning && "border-blue-500 bg-blue-50/50 pr-10",
                  )}
                />
                </form>

                {productSearchOpen && searchDropdownProducts.length > 0 && (
                  <div
                    ref={searchDropdownRef}
                    data-product-search-dropdown
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[min(50dvh,20rem)] w-full overflow-y-auto overscroll-contain rounded-md border border-gray-200 bg-white py-1 shadow-lg sm:max-h-72"
                  >
                    {searchDropdownProducts.map((product, index) => {
                      const customCode = getProductCustomCode(product);
                      const barcode = getProductScanBarcode(product);
                      return (
                      <button
                        key={product.id}
                        ref={(el) => {
                          searchDropdownItemRefs.current[index] = el;
                        }}
                        type="button"
                        role="option"
                        aria-selected={index === highlightedProductIndex}
                        className={cn(
                          "grid w-full grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-2 gap-y-0.5 px-3 py-2.5 text-left text-sm transition-colors sm:gap-x-3",
                          index === highlightedProductIndex
                            ? "bg-blue-50 text-blue-900"
                            : "hover:bg-slate-50",
                        )}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setHighlightedProductIndex(index)}
                        onClick={() => selectProductForSale(product)}
                      >
                        <span
                          className="col-span-full min-w-0 truncate font-medium sm:col-span-1"
                          title={product.name}
                        >
                          {truncatePosProductName(product.name, 56)}
                        </span>
                        <span className="hidden shrink-0 font-mono text-[11px] text-slate-500 sm:col-auto sm:block sm:text-xs">
                          {customCode || "—"}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-slate-400 sm:text-[11px]">
                          {barcode || (customCode ? "" : "—")}
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-blue-600 tabular-nums sm:text-sm">
                          Rs {product.price.toLocaleString()}
                        </span>
                        {(customCode || barcode) && (
                          <span className="col-span-full flex flex-wrap gap-x-2 text-[10px] text-slate-500 sm:hidden">
                            {customCode ? (
                              <span className="font-mono">{customCode}</span>
                            ) : null}
                            {barcode ? (
                              <span className="font-mono text-slate-400">{barcode}</span>
                            ) : null}
                          </span>
                        )}
                      </button>
                    );})}
                    {searchDropdownOverflowCount > 0 && (
                      <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
                        +{searchDropdownOverflowCount} more — type a more specific name or code
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-1.5 hidden flex-wrap items-center gap-2 text-sm text-gray-600 sm:mt-3 sm:flex">
              <span className="flex items-center gap-1.5">
                {(isProductQueryPending || serverSearchLoading) && gridProducts.length === 0 ? (
                  <>
                    Searching…
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                  </>
                ) : (
                  <>
                    {gridProducts.length} product
                    {gridProducts.length === 1 ? "" : "s"}
                    {selectedCategory !== "all" ? ` in ${selectedCategoryLabel}` : ""}
                    {(isProductQueryPending || productsRefreshing) && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                    )}
                  </>
                )}
              </span>
              {selectedCategory !== "all" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => handleCategoryChange("all")}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Clear category
                </Button>
              )}
            </div>
          </div>
        </div>

          {/* Printer info - configured globally in Printer Settings */}
          {receiptPrinter && (
            <div className="mb-2 hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:mb-4 sm:flex">
              <Printer className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="font-medium text-slate-700">{receiptPrinter}</span>
              <span className="text-slate-400">· change in Printer Settings</span>
            </div>
          )}

        {/* Products Grid */}
        {productsLoading ||
        (isProductQueryPending && filteredProducts.length === 0) ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl border border-slate-200 bg-white p-3 sm:p-2.5"
              >
                <div className="mb-1 h-5 rounded-md bg-slate-100 sm:h-6" />
                <div className="h-2 w-3/4 rounded bg-slate-100" />
                <div className="mt-1.5 flex justify-between border-t border-slate-100 pt-1.5">
                  <div className="h-2 w-8 rounded bg-slate-100" />
                  <div className="h-3 w-10 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : gridProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-16">
            <LayoutGrid className="mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No products found</p>
            <p className="mt-1 max-w-sm px-4 text-center text-xs text-slate-400">
              {selectedCategory !== "all"
                ? `Try another category or clear "${selectedCategoryLabel}"`
                : searchTerm.trim()
                  ? "Custom barcodes are saved when you print labels in Barcode Generator (Custom mode). Print once, then search or scan here."
                  : "Try a different search term"}
            </p>
          </div>
        ) : !virtualizeGrid ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2 lg:grid-cols-5 xl:grid-cols-6">
            {gridProducts.map((product) => renderProductCard(product))}
          </div>
        ) : (
          <div
            ref={productGridRef}
            className="[overflow-anchor:none]"
            style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const start = virtualRow.index * gridColumns;
              const rowItems = gridProducts.slice(start, start + gridColumns);
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  className="grid items-stretch gap-2"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${gridRowHeights[virtualRow.index] ?? 84}px`,
                    gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                    transform: `translateY(${virtualRow.start - gridScrollMargin}px)`,
                  }}
                >
                  {rowItems.map((product) => renderProductCard(product))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart Section */}
      <div
        className={cn(
          "flex w-full min-h-0 flex-col overflow-hidden bg-white lg:h-full lg:w-[360px] lg:shrink-0 lg:border-l lg:border-slate-200",
          cart.length === 0
            ? "max-lg:hidden"
            : cn(
                "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:border-t max-lg:border-slate-200",
                mobileCartOpen
                  ? "max-lg:h-[min(85dvh,100%)] max-lg:max-h-[min(85dvh,100%)] max-lg:rounded-t-2xl max-lg:shadow-2xl"
                  : "max-lg:shadow-[0_-8px_30px_-12px_rgba(15,23,42,0.3)]",
              ),
        )}
      >
        <div className="shrink-0 border-b border-slate-200 px-2 py-1.5 sm:px-3 sm:py-2.5">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-left lg:hidden"
            onClick={() => setMobileCartOpen((open) => !open)}
          >
            <div className="min-w-0">
              <h2 className="text-xs font-semibold text-slate-900 sm:text-sm">Cart</h2>
              <p className="text-[10px] text-slate-500">
                {cart.length} line{cart.length === 1 ? "" : "s"} · Rs {formatMoney(total)}
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              {mobileCartOpen ? "Hide" : "View"}
              {mobileCartOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronUp className="h-3 w-3" />
              )}
            </span>
          </button>

          {!mobileCartOpen && (
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 lg:hidden">
              <Button
                size="sm"
                onClick={() => startPayment("Cash")}
                disabled={paymentLoading || branchLoading || !salesAllowed}
                className="h-9 text-xs font-semibold"
              >
                <DollarSign className="mr-1.5 h-3.5 w-3.5" />
                Cash
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => startPayment("Card")}
                disabled={paymentLoading || branchLoading || !salesAllowed}
                className="h-9 text-xs font-semibold"
              >
                <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                Card
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => startPayment("Split")}
                disabled={paymentLoading || branchLoading || !salesAllowed}
                className="col-span-2 h-8 text-xs"
              >
                <Split className="mr-1.5 h-3.5 w-3.5" />
                Bank · Wallet · Split payment
              </Button>
            </div>
          )}

          {mobileCartOpen && (
            <div className="mt-2 flex gap-2 lg:hidden">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCart}
                className="h-7 flex-1 px-2 text-[11px] text-slate-600"
              >
                Clear
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={holdCurrentSale}
                className="h-7 flex-1 px-2 text-[11px]"
                disabled={isHoldingSale || branchLoading || !salesAllowed}
              >
                {isHoldingSale ? "…" : "Hold"}
              </Button>
            </div>
          )}

          <div className="hidden lg:block">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Cart</h2>
              <p className="text-[10px] text-slate-500">
                {cart.length === 0
                  ? "Search or scan to add items"
                  : `${cart.length} line${cart.length === 1 ? "" : "s"} · use quick qty to adjust`}
              </p>
            </div>
            {cart.length > 0 && (
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearCart}
                  className="h-7 px-2 text-[11px] text-slate-600"
                >
                  Clear
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={holdCurrentSale}
                  className="h-7 px-2 text-[11px]"
                  disabled={isHoldingSale || branchLoading || !salesAllowed}
                >
                  {isHoldingSale ? "…" : "Hold"}
                </Button>
              </div>
            )}
          </div>

          {holdSales.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleViewHeldSales}
              className="mt-2 h-7 w-full justify-between px-2 text-[11px] text-slate-600"
              disabled={isViewingHeldSales || holdSalesLoading || branchLoading || !salesAllowed}
            >
              <span>
                {isViewingHeldSales || holdSalesLoading
                  ? "Loading…"
                  : `Held sales (${holdSales.length})`}
              </span>
              {showHeldSales ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          )}

          {showHeldSales && holdSalesLoading && (
            <p className="mt-2 text-[11px] text-slate-400">Loading held sales…</p>
          )}

          {holdSales.length > 0 && showHeldSales && !holdSalesLoading && (
            <div id="held-sales-list" className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
              {holdSales.map((sale, index) => {
                const saleTotal = sumMoney(
                  ...sale.items.map((item) =>
                    lineTotal(getSellingPrice(item as CartItem), item.quantity),
                  ),
                );
                return (
                  <div
                    key={sale.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium text-slate-800">
                        #{index + 1} · {sale.items.length} items
                        {sale.customer?.name || sale.customerId ? " · " : ""}
                        {sale.customer?.name || (sale.customerId ? "Customer" : "Walk-in")}
                      </p>
                      <p className="text-[10px] tabular-nums text-slate-500">
                        Rs {formatMoney(saleTotal)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => handleRetrieveHoldSale(index)}
                      disabled={resumingHoldIndex === index}
                    >
                      {resumingHoldIndex === index ? "…" : "Resume"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-red-500 hover:bg-red-50"
                      disabled={isDeletingHoldSale}
                      onClick={() => setDeleteTargetHoldSale(index)}
                    >
                      {isDeletingHoldSale && deleteTargetHoldSale === index ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-hidden",
            !mobileCartOpen && "max-lg:hidden",
          )}
        >
          <div
            ref={cartScrollContainerRef}
            className="h-full min-h-0 overflow-y-auto overscroll-contain px-2 py-2 touch-pan-y [-webkit-overflow-scrolling:touch]"
            onWheel={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
          >
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Scan className="mb-2 h-8 w-8 text-slate-200" />
                <p className="text-xs font-medium text-slate-500">No items yet</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {cart.map((item) => {
                  const unitName = item.unitName || item.unit;
                  const effectiveUnitPrice = getSellingPrice(item);
                  const lineAmount = lineTotal(effectiveUnitPrice, item.quantity);
                  const isActive = activeCartLineId === item.id;
                  const qtyDisplay =
                    quantityInputs[item.id] ?? formatQuantityValue(item.quantity);

                  return (
                    <li
                      key={item.id}
                      ref={(el) => {
                        cartItemRefs.current[item.id] = el;
                      }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => switchActiveCartLine(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            switchActiveCartLine(item.id);
                          }
                        }}
                        className={cn(
                          "group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 transition-colors",
                          isActive
                            ? "bg-blue-50 ring-1 ring-inset ring-blue-200"
                            : "hover:bg-slate-50",
                        )}
                      >
                        <div className="flex h-11 shrink-0 items-center rounded-md border border-slate-200 bg-white lg:h-8">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 rounded-none rounded-l-md text-slate-600 lg:h-8 lg:w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              bumpQuantity(item.id, -1);
                            }}
                          >
                            <Minus className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
                          </Button>
                          <button
                            type="button"
                            className="h-11 min-w-[2.75rem] px-1 text-center text-base font-bold tabular-nums text-slate-900 lg:hidden"
                            onClick={(e) => {
                              e.stopPropagation();
                              switchActiveCartLine(item.id);
                              setQtySheetValue(formatQuantityValue(item.quantity));
                              setQtySheetLineId(item.id);
                            }}
                          >
                            {formatQuantityValue(item.quantity)}
                          </button>
                          <Input
                            type="text"
                            inputMode="decimal"
                            aria-label={`Quantity for ${item.name}`}
                            data-quantity-input="true"
                            value={qtyDisplay}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={(e) => {
                              switchActiveCartLine(item.id);
                              e.currentTarget.select();
                            }}
                            onChange={(e) => {
                              const value = e.target.value;
                              setQuantityInputs((prev) => {
                                const next = { ...prev, [item.id]: value };
                                quantityInputsRef.current = next;
                                return next;
                              });
                            }}
                            onBlur={() => {
                              applyTypedOverlayToCart(item.id);
                              clearQuantityOverlay(item.id);
                            }}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === "Enter") {
                                e.preventDefault();
                                applyTypedOverlayToCart(item.id);
                                clearQuantityOverlay(item.id);
                                (e.currentTarget as HTMLInputElement).blur();
                              }
                            }}
                            className="hidden h-8 w-12 rounded-none border-0 bg-transparent px-0 text-center text-sm font-bold tabular-nums text-slate-900 shadow-none focus-visible:ring-1 focus-visible:ring-blue-400 focus-visible:ring-offset-0 lg:block"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 rounded-none rounded-r-md text-slate-600 lg:h-8 lg:w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              bumpQuantity(item.id, 1);
                            }}
                          >
                            <Plus className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
                          </Button>
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium leading-tight text-slate-900">
                            {item.name}
                          </p>
                          <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                            Rs {formatMoney(effectiveUnitPrice)} each
                            {isPriceOverridden(item) && (
                              <span className="ml-1 font-medium text-amber-600">· custom</span>
                            )}
                          </p>
                        </div>

                        <span className="shrink-0 text-[13px] font-bold tabular-nums text-slate-900">
                          {formatMoney(lineAmount)}
                        </span>

                        <div className="flex shrink-0 items-center">
                          <Popover
                            open={priceEditLineId === item.id}
                            onOpenChange={(open) =>
                              setPriceEditLineId(open ? item.id : null)
                            }
                          >
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-400 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-52 p-3"
                              align="end"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                Unit price
                              </p>
                              <Input
                                ref={(el) => {
                                  priceInputRefs.current[item.id] = el;
                                  if (el) el.setAttribute("data-price-input", "true");
                                }}
                                type="text"
                                inputMode="decimal"
                                autoFocus
                                value={
                                  priceInputs[item.id] !== undefined
                                    ? priceInputs[item.id]
                                    : item.actualUnitPrice === 0
                                      ? ""
                                      : String(item.actualUnitPrice || item.price)
                                }
                                onFocus={() => {
                                  isUserInteractingRef.current = true;
                                  switchActiveCartLine(item.id);
                                }}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setPriceInputs((prev) => ({ ...prev, [item.id]: value }));
                                  if (value === "") {
                                    setCartSync((prev) =>
                                      prev.map((cartItem) =>
                                        cartItem.id === item.id
                                          ? { ...cartItem, actualUnitPrice: 0, price: 0 }
                                          : cartItem,
                                      ),
                                    );
                                    return;
                                  }
                                  if (/^(\d*\.?\d*)$/.test(value) && value !== ".") {
                                    const numValue = parseFloat(value);
                                    if (!isNaN(numValue) && numValue >= 0) {
                                      setCartSync((prev) =>
                                        prev.map((cartItem) =>
                                          cartItem.id === item.id
                                            ? {
                                                ...cartItem,
                                                actualUnitPrice: numValue,
                                                price: numValue,
                                              }
                                            : cartItem,
                                        ),
                                      );
                                    }
                                  }
                                }}
                                onBlur={(e) => {
                                  const value = e.target.value.trim();
                                  setPriceInputs((prev) => {
                                    const next = { ...prev };
                                    delete next[item.id];
                                    return next;
                                  });
                                  if (value === "" || value === "." || value === "0") {
                                    setCartSync((prev) =>
                                      prev.map((cartItem) =>
                                        cartItem.id === item.id
                                          ? {
                                              ...cartItem,
                                              actualUnitPrice: cartItem.originalPrice,
                                              price: cartItem.originalPrice,
                                            }
                                          : cartItem,
                                      ),
                                    );
                                  } else {
                                    const numValue = parseFloat(value);
                                    if (!isNaN(numValue) && numValue >= 0) {
                                      setCartSync((prev) =>
                                        prev.map((cartItem) =>
                                          cartItem.id === item.id
                                            ? {
                                                ...cartItem,
                                                actualUnitPrice: numValue,
                                                price: numValue,
                                              }
                                            : cartItem,
                                        ),
                                      );
                                    }
                                  }
                                  setTimeout(() => {
                                    isUserInteractingRef.current = false;
                                  }, 300);
                                }}
                                className="h-8 text-sm font-semibold tabular-nums"
                              />
                              {isPriceOverridden(item) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="mt-2 h-7 w-full text-[11px] text-amber-700"
                                  onClick={() => {
                                    setCartSync((prev) =>
                                      prev.map((cartItem) =>
                                        cartItem.id === item.id
                                          ? {
                                              ...cartItem,
                                              actualUnitPrice: cartItem.originalPrice,
                                              price: cartItem.originalPrice,
                                            }
                                          : cartItem,
                                      ),
                                    );
                                    setPriceEditLineId(null);
                                  }}
                                >
                                  Reset to default
                                </Button>
                              )}
                            </PopoverContent>
                          </Popover>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromCart(item.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <Dialog
          open={qtySheetLineId !== null}
          onOpenChange={(open) => {
            if (!open) setQtySheetLineId(null);
          }}
        >
          <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-sm sm:gap-4 sm:p-6 max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {(() => {
              const sheetLine = cart.find((line) => line.id === qtySheetLineId);
              if (!sheetLine) return null;
              const unitName = sheetLine.unitName || sheetLine.unit;
              const presets = getQuantityPresetOptions(unitName);
              const applySheetQuantity = () => {
                const parsed = parseCustomQuantityInput(qtySheetValue, unitName);
                if (parsed === null || parsed <= 0) {
                  toast.error("Enter a valid quantity");
                  return;
                }
                updateQuantityManual(sheetLine.id, parsed);
                clearQuantityOverlay(sheetLine.id);
                setQtySheetLineId(null);
              };
              const nudgeSheetQuantity = (direction: 1 | -1) => {
                const current =
                  parseCustomQuantityInput(qtySheetValue, unitName) ?? sheetLine.quantity;
                const next = computeQuantityAfterChange(current, direction, unitName, "custom");
                setQtySheetValue(formatQuantityValue(next));
              };
              return (
                <>
                  <DialogHeader className="shrink-0 px-4 pb-2 pt-4 pr-10 text-left sm:px-0 sm:pt-0">
                    <DialogTitle className="truncate">{sheetLine.name}</DialogTitle>
                    <DialogDescription>
                      Rs {formatMoney(getSellingPrice(sheetLine))} each
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 px-4 pb-4 sm:px-0 sm:pb-0">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-14 w-14 shrink-0 text-xl"
                        onClick={() => nudgeSheetQuantity(-1)}
                      >
                        <Minus className="h-5 w-5" />
                      </Button>
                      <Input
                        autoFocus
                        type="text"
                        inputMode="decimal"
                        data-quantity-input="true"
                        value={qtySheetValue}
                        onChange={(e) => setQtySheetValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            applySheetQuantity();
                          }
                        }}
                        className="h-14 text-center text-2xl font-bold tabular-nums"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="h-14 w-14 shrink-0 text-xl"
                        onClick={() => nudgeSheetQuantity(1)}
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {presets.map((preset) => (
                        <Button
                          key={preset.value}
                          type="button"
                          variant="outline"
                          className="h-11"
                          onClick={() => setQtySheetValue(formatQuantityValue(preset.quantity))}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                    <Button type="button" className="h-12 w-full text-base" onClick={applySheetQuantity}>
                      Set quantity
                    </Button>
                  </div>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {cart.length > 0 && (
          <div
            className={cn(
              "shrink-0 border-t border-slate-200 bg-white px-2 py-2 shadow-[0_-4px_20px_-12px_rgba(15,23,42,0.15)] sm:px-3 sm:py-3 max-lg:pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]",
              !mobileCartOpen && "max-lg:hidden",
            )}
          >
            <div className="overflow-hidden rounded-lg border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/60 shadow-sm sm:rounded-xl">
              <div className="space-y-1.5 p-2 sm:space-y-2 sm:p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Subtotal</span>
                  <span className="text-sm font-semibold tabular-nums text-slate-800">
                    {formatMoney(subtotal)}
                  </span>
                </div>

                {!showDiscountRow && globalDiscountAmount === 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      discountTouchedRef.current = true;
                      setShowDiscountRow(true);
                    }}
                    className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
                  >
                    + Add discount
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="shrink-0 text-xs text-slate-500">Discount</span>
                    <div className="flex h-8 w-[9.5rem] shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/15">
                      <Select
                        value={globalDiscountType}
                        onValueChange={(value) => {
                          discountTouchedRef.current = true;
                          setGlobalDiscountType(value as "percentage" | "fixed");
                        }}
                      >
                        <SelectTrigger
                          data-discount-select="true"
                          className="h-8 w-[3.25rem] shrink-0 rounded-none border-0 border-r border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 shadow-none focus:ring-0 focus:ring-offset-0 [&>svg]:h-3.5 [&>svg]:w-3.5"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end" className="min-w-[4.5rem]">
                          <SelectItem value="fixed" className="text-xs">
                            Rs
                          </SelectItem>
                          <SelectItem value="percentage" className="text-xs">
                            %
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={globalDiscountValue}
                        onChange={(e) => {
                          discountTouchedRef.current = true;
                          setGlobalDiscountValue(e.target.value);
                        }}
                        data-amount-input="true"
                        className="h-8 flex-1 rounded-none border-0 bg-transparent px-2.5 text-right text-xs font-medium tabular-nums shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                  </div>
                )}

                {globalDiscountAmount > 0 && (
                  <div className="flex items-center justify-between text-xs font-medium text-emerald-700">
                    <span>Saved</span>
                    <span className="tabular-nums">−{formatMoney(globalDiscountAmount)}</span>
                  </div>
                )}

                <SaleExtrasPanel extras={saleExtras} />
              </div>

              <div className="flex items-center justify-between border-t border-slate-200/80 bg-blue-600 px-2 py-2 text-white sm:px-3 sm:py-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-100 sm:text-xs">
                  Payable
                </span>
                <span className="text-lg font-bold tabular-nums sm:text-xl">{formatMoney(total)}</span>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-3 sm:gap-2">
              <Button
                size="lg"
                onClick={() => startPayment("Cash")}
                disabled={paymentLoading || branchLoading || !salesAllowed}
                className="h-10 text-sm font-semibold sm:h-11"
              >
                <DollarSign className="mr-2 h-4 w-4" />
                Cash
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => startPayment("Card")}
                disabled={paymentLoading || branchLoading || !salesAllowed}
                className="h-10 text-sm font-semibold sm:h-11"
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Card
              </Button>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:gap-2">
              {([
                ["Bank", Landmark],
                ["Wallet", Smartphone],
                ["Split", Split],
              ] as const).map(([method, Icon]) => (
                <Button
                  key={method}
                  size="sm"
                  variant="outline"
                  onClick={() => startPayment(method)}
                  disabled={paymentLoading || branchLoading || !salesAllowed}
                  className="h-8 text-xs font-medium text-slate-600"
                >
                  <Icon className="mr-1.5 h-3.5 w-3.5" />
                  {method}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      <SplitPaymentDialog
        open={paymentDialogOpen}
        total={total}
        initialMethod={paymentMethodPending}
        customerName={
          selectedCustomer
            ? customers.find((c) => c.id === selectedCustomer)?.name ||
              pinnedCustomer?.name ||
              "this customer"
            : null
        }
        loading={paymentLoading}
        error={paymentError}
        onCancel={resetPaymentState}
        onConfirm={(result) => {
          setPaymentError("");
          void handlePayment(result.label, result.amountPaid, result.change, result);
        }}
      />

      <Dialog
        open={saleSuccessOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleStartNewSale();
          }
        }}
      >
        <DialogContent className="max-w-md text-center sm:rounded-2xl">
          <div className="flex flex-col items-center pt-2 pb-1">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <DialogHeader className="mt-4 space-y-2 text-center sm:text-center">
              <DialogTitle className="text-2xl font-bold">
                Payment Successful
              </DialogTitle>
              <DialogDescription className="text-base text-gray-600">
                Sale{" "}
                <span className="font-semibold text-gray-900">
                  #{completedSaleNumber}
                </span>{" "}
                completed successfully.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 w-full rounded-xl bg-slate-50 px-6 py-5">
              <p className="text-sm font-medium text-gray-500">Total Received</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">
                Rs {formatMoneyDisplay(completedTotalReceived)}
              </p>
            </div>

            <div className="mt-6 grid w-full grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-12 border-blue-200 text-blue-700 hover:bg-blue-50"
                onClick={handleSuccessDownloadPdf}
                disabled={!completedReceiptData}
              >
                <Download className="mr-2 h-4 w-4" />
                PDF
              </Button>
              <Button
                variant="outline"
                className="h-12"
                onClick={handleSuccessPrint}
                disabled={!completedReceiptData || !receiptPrinter}
              >
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
              <Button
                className="h-12 bg-[#25D366] text-white hover:bg-[#1ebe57]"
                onClick={handleSuccessShareWhatsApp}
                disabled={!completedReceiptData}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                WhatsApp
              </Button>
              <Button
                className="h-12 bg-orange-500 text-white hover:bg-orange-600"
                onClick={handleSuccessEmail}
                disabled={!completedReceiptData}
              >
                <Mail className="mr-2 h-4 w-4" />
                Email
              </Button>
            </div>

            <button
              type="button"
              onClick={handleStartNewSale}
              className="mt-6 text-sm font-semibold text-gray-700 underline-offset-4 hover:text-gray-900 hover:underline"
            >
              Start New Sale
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTargetHoldSale !== null} onOpenChange={(open) => !open && !isDeletingHoldSale && setDeleteTargetHoldSale(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Hold Sale</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to discard this held sale permanently? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingHoldSale}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              disabled={isDeletingHoldSale}
              onClick={async (e) => {
                e.preventDefault();
                if (deleteTargetHoldSale !== null) {
                  setIsDeletingHoldSale(true);
                  try {
                    await deleteHoldSale(deleteTargetHoldSale);
                  } finally {
                    setIsDeletingHoldSale(false);
                    setDeleteTargetHoldSale(null);
                  }
                }
              }}
            >
              {isDeletingHoldSale ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={repeatConflict !== null}
        onOpenChange={(open) => !open && setRepeatConflict(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cart already has items</AlertDialogTitle>
            <AlertDialogDescription>
              {repeatConflict
                ? `Sale #${repeatConflict.saleNumber || ""} has ${
                    repeatConflict.items.length
                  } item${repeatConflict.items.length === 1 ? "" : "s"}. Replace the current cart, or add these on top of it?`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                if (repeatConflict) applyRepeatSale(repeatConflict, "merge");
                setRepeatConflict(null);
              }}
            >
              Add to cart
            </Button>
            <AlertDialogAction
              onClick={() => {
                if (repeatConflict) applyRepeatSale(repeatConflict, "replace");
                setRepeatConflict(null);
              }}
            >
              Replace cart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}