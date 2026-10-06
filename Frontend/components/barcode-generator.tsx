"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Printer,
  Search,
  Loader2,
  X,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  AlertTriangle,
  Boxes,
  Check,
  CheckSquare,
  Eye,
  ListChecks,
  Minus,
  MinusSquare,
  MoreHorizontal,
  Package,
  Plus,
  Ruler,
  ScanLine,
  Settings2,
  SlidersHorizontal,
  Tags,
  Upload,
  Wand2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { BarcodeScanIcon } from "@/components/icons/barcode-scan-icon";
import JsBarcode from "jsbarcode";
import { PageLoader } from "./ui/page-loader";
import { useAllPosProducts } from "@/hooks/queries/use-products";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { extractApiError } from "@/lib/api/errors";
import { isKioskMode, silentPrint, enableKioskMode } from "@/utils/kiosk-printing";
import { usePrinterSettings } from "@/hooks/use-printer-settings";
import { encodeLabelBarcodeValue } from "@/lib/labelBarcode";
import {
  checkPrintServer,
  printBarcodeLabelsViaServer,
  type BarcodeLabelItem,
} from "@/lib/print-server";

interface Product {
  id: string;
  code?: string;
  name: string;
  sku?: string;
  barcode?: string;
  sales_rate_exc_dis_and_tax?: number;
  unitName?: string;
  unitId?: string;
  category?: string;
  brandName?: string;
  weight?: string;
  mfgDate?: string;
  expDate?: string;
  is_active?: boolean;
  current_stock?: number;
  stock?: number;
}

interface SelectedProductItem {
  id: string;
  product: Product;
  netWeight: string;
  packageDate: Date;
  expiryDuration: string;
  expiryDate?: Date;
  copies: number;
}

const TABLE_PAGE_SIZE = 20;

/** Physical label stock. `w`/`h` drive the generated PDF; `css` the @page size. */
const LABEL_SIZES: Record<string, { label: string; w: number; h: number; css: string }> = {
  "58x40mm": { label: "58 × 40 mm (standard)", w: 58, h: 40, css: "58mm 40mm" },
  "50x30mm": { label: "50 × 30 mm", w: 50, h: 30, css: "50mm 30mm" },
  "60x40mm": { label: "60 × 40 mm", w: 60, h: 40, css: "60mm 40mm" },
  "40x25mm": { label: "40 × 25 mm (small)", w: 40, h: 25, css: "40mm 25mm" },
  "3x2inch": { label: "3 × 2 in (Zebra)", w: 76.2, h: 50.8, css: "3in 2in" },
  "76x51mm": { label: "76 × 51 mm", w: 76, h: 51, css: "76mm 51mm" },
};
const DEFAULT_LABEL_SIZE = "58x40mm";
const SETTINGS_KEY = "barcode-generator-settings";

export default function BarcodeGenerator() {
  const [selectedProducts, setSelectedProducts] = useState<
    SelectedProductItem[]
  >([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [globalExpiryDuration, setGlobalExpiryDuration] = useState("12");
  // Global default net weight + a global copies value so a whole batch can be
  // configured in one click for bulk printing workflows.
  const [globalNetWeight, setGlobalNetWeight] = useState("");
  const [globalCopies, setGlobalCopies] = useState("1");
  const productSearchInputRef = useRef<HTMLInputElement | null>(null);
  // Global printer settings (configured in Printer Settings page)
  const { barcodePrinter, printers: globalPrinters } = usePrinterSettings();
  // 58×40 matches what the PDF always printed before the size picker was wired.
  const [selectedPaperSize, setSelectedPaperSize] = useState(DEFAULT_LABEL_SIZE);
  const [isPrinting, setIsPrinting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [kioskMode, setKioskMode] = useState(false);

  // Product picker table state
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [tablePage, setTablePage] = useState(1);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // What gets printed on the label — wired into generatePDFAndPrint below.
  const [includeProductName, setIncludeProductName] = useState(true);
  const [includePrice, setIncludePrice] = useState(true);
  const [includeSku, setIncludeSku] = useState(false);

  // Bulk Upload tab
  const [bulkParsing, setBulkParsing] = useState(false);
  const bulkFileInputRef = useRef<HTMLInputElement | null>(null);

  // Detect kiosk mode on mount
  useEffect(() => {
    const kiosk = isKioskMode();
    setKioskMode(kiosk);
    if (kiosk) {
      enableKioskMode();
    }
  }, []);

  useEffect(() => {
    productSearchInputRef.current?.focus();
  }, []);

  // Remember label settings between visits (per browser).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.paperSize && LABEL_SIZES[saved.paperSize]) setSelectedPaperSize(saved.paperSize);
        if (typeof saved.includeProductName === "boolean") setIncludeProductName(saved.includeProductName);
        if (typeof saved.includePrice === "boolean") setIncludePrice(saved.includePrice);
        if (typeof saved.includeSku === "boolean") setIncludeSku(saved.includeSku);
        if (typeof saved.expiry === "string") setGlobalExpiryDuration(saved.expiry);
        if (typeof saved.netWeight === "string") setGlobalNetWeight(saved.netWeight);
        if (typeof saved.copies === "string") setGlobalCopies(saved.copies);
      }
    } catch {
      // ignore unreadable settings
    }
    setSettingsLoaded(true);
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          paperSize: selectedPaperSize,
          includeProductName,
          includePrice,
          includeSku,
          expiry: globalExpiryDuration,
          netWeight: globalNetWeight,
          copies: globalCopies,
        }),
      );
    } catch {
      // storage unavailable — settings just won't persist
    }
  }, [
    settingsLoaded,
    selectedPaperSize,
    includeProductName,
    includePrice,
    includeSku,
    globalExpiryDuration,
    globalNetWeight,
    globalCopies,
  ]);

  const expiryOptions = [
    { value: "3", label: "3 Months" },
    { value: "6", label: "6 Months" },
    { value: "12", label: "12 Months" },
    { value: "18", label: "18 Months" },
    { value: "24", label: "24 Months" },
    { value: "36", label: "36 Months" },
  ];

  const paperSizes = Object.entries(LABEL_SIZES).map(([value, size]) => ({ value, label: size.label }));

  // Direct printing function
  const printDirectly = () => {
    window.print();
  };

  // Generate proper barcode using JsBarcode
  const generateBarcodeDataURL = (value: string): string => {
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 80;

    try {
      JsBarcode(canvas, value, {
        format: "CODE128",
        width: 2,
        height: 60,
        displayValue: false,
        margin: 10,
        background: "#ffffff",
        lineColor: "#000000",
      });
      return canvas.toDataURL("image/png");
    } catch (error) {
      console.error("Error generating barcode:", error);
      // Fallback: return empty data URL
      return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    }
  };

  const calculateExpiryDate = (
    packageDate: Date,
    durationMonths: string
  ): Date | undefined => {
    if (!durationMonths) return undefined;
    const months = parseInt(durationMonths, 10);
    if (isNaN(months)) return undefined;
    const expiry = new Date(packageDate);
    expiry.setMonth(expiry.getMonth() + months);
    return expiry;
  };

  const buildSelectedItem = (
    product: Product,
    overrides?: Partial<Pick<SelectedProductItem, "netWeight" | "expiryDuration" | "copies">>,
  ): SelectedProductItem => {
    const expiryDuration = overrides?.expiryDuration || globalExpiryDuration || "12";
    const packageDate = new Date();
    return {
      id: `${Date.now()}-${product.id}`,
      product,
      netWeight: overrides?.netWeight || globalNetWeight || "",
      packageDate,
      expiryDuration,
      expiryDate: calculateExpiryDate(packageDate, expiryDuration),
      copies: Math.max(1, overrides?.copies ?? (parseInt(globalCopies, 10) || 1)),
    };
  };

  const withPrintDefaults = (item: SelectedProductItem): SelectedProductItem => {
    const packageDate = item.packageDate || new Date();
    const expiryDuration = item.expiryDuration || globalExpiryDuration || "12";
    return {
      ...item,
      packageDate,
      expiryDuration,
      expiryDate: item.expiryDate || calculateExpiryDate(packageDate, expiryDuration),
      copies: Math.max(1, item.copies || 1),
    };
  };

  useEffect(() => {
    const delay = searchTerm.trim() ? 150 : 0;
    const t = window.setTimeout(
      () => setDebouncedSearch(searchTerm.trim()),
      delay,
    );
    return () => window.clearTimeout(t);
  }, [searchTerm]);

  const {
    products: rawProducts,
    isFirstLoad,
    isRefreshing,
    error: listError,
  } = useAllPosProducts();
  // Whole cached catalog, filtered in memory — previously only the first 20
  // products were fetched, so search, categories and bulk upload missed items.
  const products = rawProducts as unknown as Product[];

  useEffect(() => {
    if (!listError) return;
    toast({
      variant: "destructive",
      title: "Failed to load data",
      description: extractApiError(
        listError,
        "Could not fetch products from server",
      ),
    });
  }, [listError]); // eslint-disable-line react-hooks/exhaustive-deps

  const parseWeightToGrams = (weightInput: any) => {
    if (!weightInput || weightInput.trim() === "") return 0;

    const input = weightInput.toLowerCase().trim();
    let weight = 0;

    const numberMatch = input.match(/(\d+\.?\d*)/);
    if (!numberMatch) return 0;

    const number = Number.parseFloat(numberMatch[1]);

    if (input.includes("kg")) {
      weight = number * 1000;
    } else if (input.includes("g") && !input.includes("kg")) {
      weight = number;
    } else if (input.includes("ml") || input.includes("l")) {
      if (input.includes("ml")) {
        weight = number;
      } else if (input.includes("l")) {
        weight = number * 1000;
      }
    } else {
      weight = number;
    }

    return weight;
  };

  const calculatePriceByWeight = (netWeightInput: any, basePrice: any) => {
    if (!netWeightInput || !basePrice) return basePrice || 0;

    const input = netWeightInput.toLowerCase().trim();
    const numberMatch = input.match(/(\d+\.?\d*)/);
    if (!numberMatch) return basePrice;

    const weightValue = Number.parseFloat(numberMatch[1]);
    if (weightValue <= 0) return basePrice;

    let multiplier = 1;

    if (input.includes("kg") || input.includes("kilo")) {
      multiplier = weightValue;
    } else if (
      input.includes("g") &&
      !input.includes("kg") &&
      !input.includes("mg")
    ) {
      multiplier = weightValue / 1000;
    } else if (input.includes("mg")) {
      multiplier = weightValue / 1000000;
    } else if (input.includes("lb") || input.includes("pound")) {
      multiplier = weightValue * 0.453592;
    } else if (input.includes("oz") && !input.includes("fl")) {
      multiplier = weightValue * 0.0283495;
    } else if (
      input.includes("l") &&
      !input.includes("ml") &&
      !input.includes("fl")
    ) {
      multiplier = weightValue;
    } else if (input.includes("ml") || input.includes("milliliter")) {
      multiplier = weightValue / 1000;
    } else if (input.includes("ser") || input.includes("seer")) {
      multiplier = weightValue * 0.933105;
    } else if (input.includes("maund")) {
      multiplier = weightValue * 37.3242;
    } else if (
      input.includes("pc") ||
      input.includes("piece") ||
      input.includes("pcs")
    ) {
      multiplier = weightValue;
    } else if (input.includes("dozen")) {
      multiplier = weightValue * 12;
    } else {
      multiplier = weightValue / 1000;
    }

    const finalPrice = basePrice * multiplier;
    return finalPrice.toFixed(2);
  };

  const formatWeightDisplay = (netWeightInput: any) => {
    if (!netWeightInput) return "Not specified";

    // CRITICAL: Preserve the exact input string to avoid any conversion errors
    // Only format if it's a valid weight string, otherwise return as-is
    const input = String(netWeightInput).toLowerCase().trim();
    
    // If input is already a formatted string like "200g", preserve it exactly
    if (input.match(/^\d+\.?\d*\s*(kg|g|mg|lb|oz|l|ml|ser|maund|pc|pcs|piece|dozen)$/i)) {
      // Extract number and unit, but preserve exact format
      const numberMatch = input.match(/(\d+\.?\d*)/);
      const unitMatch = input.match(/(kg|g|mg|lb|oz|l|ml|ser|maund|pc|pcs|piece|dozen)/i);
      
      if (numberMatch && unitMatch) {
        const number = Number.parseFloat(numberMatch[1]);
        const unit = unitMatch[1].toLowerCase();
        
        // Return formatted but preserve the exact number (no rounding)
        if (unit === "kg") return `${number}kg`;
        if (unit === "g") return `${number}g`;
        if (unit === "mg") return `${number}mg`;
        if (unit === "lb") return `${number}lb`;
        if (unit === "oz") return `${number}oz`;
        if (unit === "l") return `${number}L`;
        if (unit === "ml") return `${number}ml`;
        if (unit === "ser" || unit === "seer") return `${number} seer`;
        if (unit === "maund") return `${number} maund`;
        if (unit === "pc" || unit === "pcs" || unit === "piece") return `${number} pcs`;
        if (unit === "dozen") return `${number} dozen`;
      }
    }
    
    // If it's just a number, assume grams
    const numberMatch = input.match(/(\d+\.?\d*)/);
    if (numberMatch) {
      const number = Number.parseFloat(numberMatch[1]);
      return `${number}g`; // Default to grams
    }

    // Return original if can't parse
    return String(netWeightInput);
  };

  // Helper function to determine if unit is weight-based (kg, g, etc.) or piece-based (pc, pcs, etc.)
  const isWeightUnit = (unitName?: string): boolean => {
    if (!unitName) return true; // Default to weight if no unit specified
    const unit = unitName.toLowerCase().trim();
    return (
      unit.includes("kg") ||
      unit.includes("kilo") ||
      unit.includes("gram") ||
      unit.includes("g") ||
      unit.includes("mg") ||
      unit.includes("lb") ||
      unit.includes("pound") ||
      unit.includes("oz") ||
      unit.includes("ounce") ||
      unit.includes("l") ||
      unit.includes("liter") ||
      unit.includes("ml") ||
      unit.includes("milliliter") ||
      unit.includes("ser") ||
      unit.includes("seer") ||
      unit.includes("maund")
    );
  };

  // Generate dropdown options based on unit type
  const getNetWeightOptions = (unitName?: string): Array<{ value: string; label: string }> => {
    const isWeight = isWeightUnit(unitName);
    
    if (isWeight) {
      // Weight-based options (grams and kg)
      return [
        { value: "100g", label: "100g" },
        { value: "200g", label: "200g" },
        { value: "300g", label: "300g" },
        { value: "500g", label: "500g" },
        { value: "600g", label: "600g" },
        { value: "700g", label: "700g" },
        { value: "1000g", label: "1000g" },
        { value: "1kg", label: "1kg" },
        { value: "custom", label: "Custom" },
      ];
    } else {
      // Piece-based options - store with "pc" suffix for proper formatting
      return [
        { value: "1 pc", label: "1 pc" },
        { value: "2 pcs", label: "2 pcs" },
        { value: "3 pcs", label: "3 pcs" },
        { value: "4 pcs", label: "4 pcs" },
        { value: "5 pcs", label: "5 pcs" },
        { value: "6 pcs", label: "6 pcs" },
        { value: "10 pcs", label: "10 pcs" },
        { value: "12 pcs", label: "12 pcs" },
        { value: "custom", label: "Custom" },
      ];
    }
  };

  // Every non-empty category currently in the catalog, for the table filter.
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.is_active !== false && p.category) set.add(p.category);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filteredProducts = useMemo(() => {
    // Inactive products are kept out of the barcode generator — there's no
    // point printing barcodes for items that can't be sold.
    let list = products.filter((p) => p.is_active !== false);

    if (categoryFilter !== "all") {
      list = list.filter((p) => p.category === categoryFilter);
    }

    if (inStockOnly) {
      list = list.filter((p) => (p.current_stock ?? p.stock ?? 0) > 0);
    }

    const term = debouncedSearch.toLowerCase();
    if (term) {
      list = list.filter((p) =>
        [p.name, p.sku, p.code, p.barcode, p.category, p.brandName].some((value) =>
          (value || "").toLowerCase().includes(term),
        ),
      );
    }

    return list;
  }, [products, categoryFilter, inStockOnly, debouncedSearch]);

  // Reset to page 1 whenever the visible set changes, so the user never
  // lands on a page that no longer exists after filtering.
  useEffect(() => {
    setTablePage(1);
  }, [searchTerm, categoryFilter, inStockOnly]);

  const totalTablePages = Math.max(1, Math.ceil(filteredProducts.length / TABLE_PAGE_SIZE));
  const pagedProducts = useMemo(
    () => filteredProducts.slice((tablePage - 1) * TABLE_PAGE_SIZE, tablePage * TABLE_PAGE_SIZE),
    [filteredProducts, tablePage],
  );

  const isProductSelected = (productId: string) =>
    selectedProducts.some((sp) => sp.product.id === productId);

  const handleProductSelect = (productId: string, options?: { keepSearch?: boolean }) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    // If the product is already in the list, bump its copies count instead
    // of rejecting — matches the scan-to-add behaviour and supports the bulk
    // workflow where you re-pick the same item to print extra labels.
    const existing = selectedProducts.find((sp) => sp.product.id === productId);
    if (existing) {
      const nextCopies = (existing.copies || 1) + 1;
      setSelectedProducts((prev) =>
        prev.map((sp) =>
          sp.product.id === productId ? { ...sp, copies: nextCopies } : sp,
        ),
      );
      sonnerToast.success(`${product.name}`, {
        description: `Copies set to ${nextCopies}`,
        position: "top-right",
        duration: 300,
      });
      if (!options?.keepSearch) {
        setSearchTerm("");
        productSearchInputRef.current?.focus();
      }
      return;
    }

    setSelectedProducts((prev) => [...prev, buildSelectedItem(product)]);
    sonnerToast.success(`Added ${product.name}`, {
      description: `SKU ${product.sku || product.code || ""}`.trim(),
      position: "top-right",
      duration: 300,
    });
    if (!options?.keepSearch) {
      setSearchTerm("");
      productSearchInputRef.current?.focus();
    }
  };

  // Table row checkbox — add or remove a single product from the selection.
  const toggleProductRow = (product: Product) => {
    const existingItem = selectedProducts.find((sp) => sp.product.id === product.id);
    if (existingItem) {
      removeProduct(existingItem.id);
    } else {
      handleProductSelect(product.id, { keepSearch: true });
    }
  };

  // Silent bulk-add — used by "select all on this page" and Bulk Upload, so
  // adding many products doesn't spam a toast per item.
  const addProductsBulk = (productsToAdd: Product[]) => {
    if (productsToAdd.length === 0) return 0;
    let addedCount = 0;
    setSelectedProducts((prev) => {
      const existingIds = new Set(prev.map((sp) => sp.product.id));
      const additions: SelectedProductItem[] = productsToAdd
        .filter((p) => !existingIds.has(p.id))
        .map((p) => buildSelectedItem(p));
      addedCount = additions.length;
      return [...prev, ...additions];
    });
    return addedCount;
  };

  const allOnPageSelected =
    pagedProducts.length > 0 && pagedProducts.every((p) => isProductSelected(p.id));

  const toggleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      const pageIds = new Set(pagedProducts.map((p) => p.id));
      setSelectedProducts((prev) => prev.filter((sp) => !pageIds.has(sp.product.id)));
      return;
    }
    const added = addProductsBulk(pagedProducts.filter((p) => !isProductSelected(p.id)));
    if (added > 0) {
      sonnerToast.success(`Added ${added} product${added === 1 ? "" : "s"}`, {
        position: "top-right",
        duration: 800,
      });
    }
  };

  // Scan-to-add: if the user presses Enter and the search matches exactly one
  // product (by SKU, code, or full name), add it immediately. If a product is
  // already selected, bump its copies count instead of duplicating the row.
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const term = searchTerm.trim();
    if (!term) return;
    const lower = term.toLowerCase();
    const exact =
      products.find((p) => (p.sku || "").toLowerCase() === lower) ||
      products.find((p) => (p.code || "").toLowerCase() === lower) ||
      products.find((p) => (p.barcode || "").toLowerCase() === lower) ||
      products.find((p) => p.name.toLowerCase() === lower);
    const match = exact || (filteredProducts.length === 1 ? filteredProducts[0] : null);
    if (!match) return;
    e.preventDefault();
    const already = selectedProducts.find((sp) => sp.product.id === match.id);
    if (already) {
      setSelectedProducts((prev) =>
        prev.map((sp) =>
          sp.product.id === match.id ? { ...sp, copies: sp.copies + 1 } : sp,
        ),
      );
      setSearchTerm("");
      return;
    }
    handleProductSelect(match.id);
  };

  const removeProduct = (itemId: string) => {
    setSelectedProducts((prev) => prev.filter((item) => item.id !== itemId));
  };

  // Bulk Upload tab — parse a CSV/XLSX of SKUs (with optional Net Weight /
  // Expiry Months / Copies columns) and add every matched product at once.
  const downloadBulkTemplate = () => {
    const csv = "SKU,Net Weight,Expiry Months,Copies\nSKU001,500g,12,2\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "barcode_bulk_upload_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBulkParsing(true);
    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const existingIds = new Set(selectedProducts.map((sp) => sp.product.id));
      const additions: SelectedProductItem[] = [];
      let notFound = 0;

      rows.forEach((row) => {
        const skuRaw = String(row.SKU ?? row.sku ?? row.Code ?? row.code ?? "").trim();
        if (!skuRaw) return;
        const lower = skuRaw.toLowerCase();
        const product = products.find(
          (p) =>
            p.is_active !== false &&
            ((p.sku || "").toLowerCase() === lower || (p.code || "").toLowerCase() === lower),
        );
        if (!product) {
          notFound += 1;
          return;
        }
        if (existingIds.has(product.id)) return;
        existingIds.add(product.id);

        const netWeight =
          String(row["Net Weight"] ?? row.NetWeight ?? row.netWeight ?? "").trim() ||
          globalNetWeight ||
          "";
        const expiryDuration =
          String(row["Expiry Months"] ?? row.ExpiryMonths ?? row.expiryMonths ?? "").trim() ||
          globalExpiryDuration ||
          "12";
        const copiesRaw = parseInt(String(row.Copies ?? row.copies ?? ""), 10);
        const copies =
          Number.isFinite(copiesRaw) && copiesRaw > 0
            ? copiesRaw
            : Math.max(1, parseInt(globalCopies, 10) || 1);

        additions.push(
          buildSelectedItem(product, { netWeight, expiryDuration, copies }),
        );
      });

      if (additions.length) {
        setSelectedProducts((prev) => [...prev, ...additions]);
      }

      toast({
        variant: additions.length === 0 ? "destructive" : "default",
        title: additions.length === 0 ? "No products matched" : "Bulk upload processed",
        description:
          additions.length === 0
            ? "None of the SKUs in that file matched a product."
            : `${additions.length} product${additions.length === 1 ? "" : "s"} added` +
              (notFound ? `, ${notFound} row${notFound === 1 ? "" : "s"} didn't match any SKU.` : "."),
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: err?.message || "Could not read that file. Use the CSV template.",
      });
    } finally {
      setBulkParsing(false);
      if (bulkFileInputRef.current) bulkFileInputRef.current.value = "";
    }
  };

  const updateProductData = (
    itemId: string,
    field: keyof SelectedProductItem,
    value: any
  ) => {
    setSelectedProducts((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const updatedItem = { ...item, [field]: value };
          if (field === "expiryDuration") {
            updatedItem.expiryDate = calculateExpiryDate(
              updatedItem.packageDate,
              value
            );
          }
          return updatedItem;
        }
        return item;
      })
    );
  };

  const clearAll = () => {
    setSelectedProducts([]);
    toast({
      title: "Cleared",
      description: "All products have been removed from the list.",
    });
  };

  // Printer loading is handled globally by usePrinterSettings hook

  // Printer detection is now handled globally in Printer Settings page


  const paperSizeForPrintServer = (key: string) => {
    const allowed = ["58x40mm", "50x30mm", "60x40mm", "40x25mm", "3x2inch"] as const;
    if ((allowed as readonly string[]).includes(key)) {
      return key as (typeof allowed)[number];
    }
    return "58x40mm" as const;
  };

  const buildBarcodeLabelItems = (): BarcodeLabelItem[] => {
    return selectedProducts
      .map(withPrintDefaults)
      .flatMap((sp) => {
        const n = Math.max(1, sp.copies || 1);
        const price = Math.round(
          Number(
            calculatePriceByWeight(
              sp.netWeight,
              sp.product.sales_rate_exc_dis_and_tax
            )
          )
        );
        const barcodeValue = encodeLabelBarcodeValue(
          sp.product.sku,
          sp.product.code,
          price
        );
        const netWeight = sp.netWeight
          ? formatWeightDisplay(sp.netWeight)
          : undefined;
        const base: BarcodeLabelItem = {
          id: sp.id,
          name: includeProductName ? sp.product.name : "",
          barcode: barcodeValue,
          netWeight: netWeight || undefined,
          price: includePrice ? price : undefined,
          packageDateISO: sp.packageDate?.toISOString(),
          expiryDateISO: sp.expiryDate?.toISOString(),
        };
        return Array.from({ length: n }, () => ({ ...base }));
      });
  };

  const handlePrintAll = async () => {
    if (selectedProducts.length === 0) {
      toast({
        variant: "destructive",
        title: "No products selected",
        description: "Search and tap a product first, then print.",
      });
      return;
    }

    setIsPrinting(true);
    
    try {
      const printerObj = globalPrinters.find((p) => p.name === barcodePrinter);
      const languageHint = printerObj?.languageHint;
      const serverUp = await checkPrintServer();
      const useRawLabelPrint =
        !!barcodePrinter &&
        serverUp &&
        (languageHint === "epl" || languageHint === "zpl");

      if (useRawLabelPrint) {
        const result = await printBarcodeLabelsViaServer({
          printerName: barcodePrinter!,
          items: buildBarcodeLabelItems(),
          paperSize: paperSizeForPrintServer(selectedPaperSize),
          copies: 1,
          dpi: (printerObj?.labelProfile?.dpi as 203 | 300) ?? 203,
          humanReadable: true,
          printMode: "raw",
          languageHint,
        });
        if (!result.success) {
          throw new Error(result.error || "Label print failed");
        }
        toast({
          title: result.mode === "raw" ? "Labels sent to printer" : "Print opened",
          description:
            result.message ||
            (languageHint === "epl"
              ? "Eltron LP 2844 (EPL, 58×40 mm)"
              : `Printer: ${barcodePrinter}`),
        });
        return;
      }

      // Fallback: PDF in browser (non-EPL/ZPL or print server offline)
      await generatePDFAndPrint();
      toast({
        title: "Print Dialog Opened",
        description: barcodePrinter
          ? `Select "${barcodePrinter}" in the print dialog`
          : "Select your label printer from the print dialog",
      });
    } catch (error: any) {
      console.error('Printing error:', error);
      toast({
        variant: "destructive",
        title: "Print Error",
        description: error.message || "Failed to generate PDF. Please install jspdf: npm install jspdf",
      });
    } finally {
      setIsPrinting(false);
    }
  };

  // Generate PDF in frontend and open for browser print (like boxhero.io)
  const generatePDFAndPrint = async () => {
    // Dynamic import of jsPDF (install: npm install jspdf)
    const { jsPDF } = await import('jspdf');
    
    // Paper size: 58mm x 40mm (landscape/horizontal) - same as boxhero.io
    const size = LABEL_SIZES[selectedPaperSize] || LABEL_SIZES[DEFAULT_LABEL_SIZE];
    const labelWidth = size.w; // mm
    const labelHeight = size.h; // mm
    // Shrink text on small stock so it still fits; never enlarge past the 58×40 design.
    const fontScale = Math.min(1, labelHeight / 40, labelWidth / 58);
    
    // Convert mm to points (1mm = 2.83464567 points)
    const mmToPt = (mm: number) => mm * 2.83464567;
    const widthPt = mmToPt(labelWidth);
    const heightPt = mmToPt(labelHeight);
    
    // Margins (1.5mm on all sides like boxhero.io)
    const margin = 1.5;
    const marginPt = mmToPt(margin);
    const contentWidth = widthPt - (marginPt * 2);
    const contentHeight = heightPt - (marginPt * 2);
    
    // Create PDF document (landscape: width > height)
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'pt',
      format: [widthPt, heightPt]
    });
    
    // Set default text color to pure black for darker text
    doc.setTextColor(0, 0, 0);
    
    // Font sizes - larger and darker for better visibility
    const titleFontSize = 10 * fontScale; // pt
    const labelFontSize = 8 * fontScale; // pt - bold labels (NET WT, PKG, EXP)
    const valueFontSize = 8 * fontScale; // pt
    const priceFontSize = 9 * fontScale; // pt
    
    // Expand each product into N labels based on its copies count, so a
    // single click prints continuous strips from the thermal printer.
    const labelsToRender: SelectedProductItem[] = selectedProducts
      .map(withPrintDefaults)
      .flatMap((sp) => {
        const n = Math.max(1, sp.copies || 1);
        return Array.from({ length: n }, () => sp);
      });

    // Process each label
    for (let labelIdx = 0; labelIdx < labelsToRender.length; labelIdx++) {
      const sp = labelsToRender[labelIdx];
      // Add new page for each label after the first
      if (labelIdx > 0) {
        doc.addPage([widthPt, heightPt], 'landscape');
      }
      
      // Start lower from top - use more of the label space
      let y = marginPt + mmToPt(3); // Start 3mm from top margin (pushed down)
      const leftMargin = marginPt;
      
      // Title (Product Name) - centered, bold, larger, dark
      if (includeProductName) {
        const title = (sp.product.name || '').toUpperCase().trim();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(titleFontSize);
        doc.setTextColor(0, 0, 0); // Pure black for darker text

        // Calculate text width and wrap if needed (max 2 lines)
        const titleLines = doc.splitTextToSize(title, contentWidth * 0.95);
        const titleHeight = Math.min(titleLines.length, 2) * titleFontSize * 1.4;

        // Center the title
        titleLines.slice(0, 2).forEach((line: string, index: number) => {
          const lineWidth = doc.getTextWidth(line);
          const lineX = leftMargin + (contentWidth - lineWidth) / 2;
          doc.text(line, lineX, y + titleFontSize + (index * titleFontSize * 1.4));
        });

        y += titleHeight + mmToPt(0.8); // More spacing
      }

      // SKU line (optional) - small, left-aligned
      if (includeSku) {
        const skuText = `SKU: ${sp.product.sku || sp.product.code || '-'}`;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(labelFontSize);
        doc.setTextColor(0, 0, 0);
        doc.text(skuText, leftMargin, y + labelFontSize);
        y += labelFontSize * 1.5 + mmToPt(0.3);
      }

      // Meta row (Weight & Price) - ALL BOLD AND DARK
      const netWeightValue = sp.netWeight ? formatWeightDisplay(sp.netWeight) : '';
      const price = Math.round(Number(calculatePriceByWeight(sp.netWeight, sp.product.sales_rate_exc_dis_and_tax)));
      const priceText = `RS ${price}`;

      if (netWeightValue || includePrice) {
        if (netWeightValue) {
          // NET WT - ALL BOLD
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(labelFontSize);
          doc.setTextColor(0, 0, 0); // Pure black
          doc.text('NET WT:', leftMargin, y + labelFontSize);

          // Weight value - ALSO BOLD
          const labelWidth = doc.getTextWidth('NET WT: ');
          doc.setFont('helvetica', 'bold'); // Changed to bold
          doc.setFontSize(valueFontSize);
          doc.setTextColor(0, 0, 0);
          doc.text(netWeightValue, leftMargin + labelWidth, y + labelFontSize);
        }

        // Price on the right side in bold
        if (includePrice) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(priceFontSize);
          doc.setTextColor(0, 0, 0);
          const priceWidth = doc.getTextWidth(priceText);
          doc.text(priceText, leftMargin + contentWidth - priceWidth, y + priceFontSize);
        }

        y += labelFontSize * 1.5 + mmToPt(0.5); // More spacing
      }

      // Dates row (PKG & EXP) - ALL BOLD AND DARK
      const pkgDate = formatDate(sp.packageDate);
      const expDate = formatDate(sp.expiryDate);
      
      // PKG label and value - ALL BOLD
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(labelFontSize);
      doc.setTextColor(0, 0, 0);
      doc.text('PKG:', leftMargin, y + labelFontSize);
      const pkgLabelWidth = doc.getTextWidth('PKG: ');
      doc.setFont('helvetica', 'bold'); // Changed to bold
      doc.setFontSize(valueFontSize);
      doc.setTextColor(0, 0, 0);
      doc.text(pkgDate, leftMargin + pkgLabelWidth, y + labelFontSize);
      
      // EXP label and value - ALL BOLD (right side)
      const expLabel = 'EXP:';
      const expFullText = `${expLabel} ${expDate}`;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(labelFontSize);
      doc.setTextColor(0, 0, 0);
      const expLabelWidth = doc.getTextWidth(expLabel);
      const expFullWidth = doc.getTextWidth(expFullText);
      const expX = leftMargin + contentWidth - expFullWidth;
      doc.text(expLabel, expX, y + labelFontSize);
      doc.setFont('helvetica', 'bold'); // Changed to bold
      doc.setFontSize(valueFontSize);
      doc.setTextColor(0, 0, 0);
      doc.text(expDate, expX + expLabelWidth, y + labelFontSize);
      
      y += labelFontSize * 1.5 + mmToPt(0.3); // Less spacing - barcode will be positioned at bottom
      
      // Barcode: 9-digit numeric SKU only; legacy products use SANITIZED-PRICE until SKU is migrated
      const barcodeValue = encodeLabelBarcodeValue(
        sp.product.sku,
        sp.product.code,
        price
      );
      
      try {
        // Generate barcode - LARGER width and height, VERY DARK, with LARGER number
        const canvas = document.createElement('canvas');
        
        // Much higher resolution for better quality and darker rendering
        const barcodeHeightPx = 120; // Increased from 100 for larger barcode
        canvas.height = barcodeHeightPx;
        canvas.width = 600; // Wider canvas for better quality
        
        // Set canvas context for VERY DARK rendering
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#000000'; // Pure black
          ctx.strokeStyle = '#000000'; // Pure black
          ctx.lineWidth = 2; // Thicker lines for darker appearance
        }
        
        // Generate barcode with VERY DARK bars - NO number in image (we'll add large text separately)
        JsBarcode(canvas, barcodeValue, {
          format: "CODE128",
          width: 4.5, // MUCH wider bars for VERY DARK appearance
          height: barcodeHeightPx,
          displayValue: false, // NO number in barcode image - we'll add large text separately below
          margin: 10, // Quiet zones for better scanning
          background: "#FFFFFF",
          lineColor: "#000000" // Pure black - VERY DARK
        });
        
        // Ensure barcode is rendered VERY DARK
        if (ctx) {
          ctx.globalCompositeOperation = 'source-over';
          // Enhance contrast for darker appearance
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            // Make black pixels even darker (ensure pure black)
            if (data[i] < 128) { // If it's dark
              data[i] = 0;     // R
              data[i + 1] = 0; // G
              data[i + 2] = 0; // B
            }
          }
          ctx.putImageData(imageData, 0, 0);
        }
        
        const barcodeDataURL = canvas.toDataURL('image/png', 1.0);

        // Position the barcode *below the dates row* — the old code anchored
        // it from the bottom of the label, which caused it to overlap the
        // PKG/EXP text when the title wrapped or fonts grew.
        const barcodeTopGap = mmToPt(1.5); // gap between dates row and barcode
        const barcodeStartY = y + barcodeTopGap;

        // Reserve room for the barcode number text below the bars.
        const textFontSize = 9;
        const textTopGap = mmToPt(1.5);
        const reservedTextSpace = textFontSize + textTopGap + mmToPt(0.5);

        // Vertical room actually available between the dates row and the
        // bottom margin, minus the text below the barcode.
        const availableHeight =
          heightPt - marginPt - barcodeStartY - reservedTextSpace;

        // Cap width at 90% of content width.
        const targetBarcodeWidthPt = contentWidth * 0.9;

        const barcodeAspectRatio = canvas.width / canvas.height;

        // Start from the width target and derive height; if that overflows the
        // available vertical space, shrink to fit instead.
        let finalBarcodeWidthPt = targetBarcodeWidthPt;
        let finalBarcodeHeightPt = finalBarcodeWidthPt / barcodeAspectRatio;
        if (finalBarcodeHeightPt > availableHeight) {
          finalBarcodeHeightPt = Math.max(availableHeight, mmToPt(6));
          finalBarcodeWidthPt = finalBarcodeHeightPt * barcodeAspectRatio;
          if (finalBarcodeWidthPt > targetBarcodeWidthPt) {
            finalBarcodeWidthPt = targetBarcodeWidthPt;
            finalBarcodeHeightPt = finalBarcodeWidthPt / barcodeAspectRatio;
          }
        }

        const barcodeX = leftMargin + (contentWidth - finalBarcodeWidthPt) / 2;
        const barcodeY = barcodeStartY;

        doc.addImage(
          barcodeDataURL,
          'PNG',
          barcodeX,
          barcodeY,
          finalBarcodeWidthPt,
          finalBarcodeHeightPt,
        );

        // Barcode number — centered under the bars, clear gap, doesn't run
        // past the bottom margin.
        const barcodeTextY = barcodeY + finalBarcodeHeightPt + textTopGap + textFontSize;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(textFontSize);
        doc.setTextColor(0, 0, 0);
        const barcodeTextWidth = doc.getTextWidth(barcodeValue);
        const barcodeTextX = leftMargin + (contentWidth - barcodeTextWidth) / 2;
        doc.text(barcodeValue, barcodeTextX, barcodeTextY);
      } catch (err) {
        console.error('Barcode generation error:', err);
      }
    }
    
    // Generate PDF blob and open in new window for printing
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    
    // Open PDF in new window and trigger print
    const printWindow = window.open(pdfUrl, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 250);
      };
    } else {
      throw new Error('Could not open print window. Please allow pop-ups.');
    }
    
    // Clean up URL after a delay
    setTimeout(() => {
      URL.revokeObjectURL(pdfUrl);
    }, 10000);
  };

  // Browser-based printing - optimized for kiosk mode
  const printWithBrowser = async () => {
    // In kiosk mode: Create minimal print window that closes automatically
    if (kioskMode) {
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      if (!printWindow) {
        throw new Error('Could not open print window');
      }
      
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Print Barcode Labels</title>
          <style>
            @media print {
              @page {
                size: ${(LABEL_SIZES[selectedPaperSize] || LABEL_SIZES[DEFAULT_LABEL_SIZE]).css};
                margin: 0;
              }
              body { margin: 0; padding: 0; }
              .label { 
                page-break-inside: avoid;
                page-break-after: always;
                padding: 5mm;
              }
            }
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 10mm;
            }
            .label {
              border: 1px dashed #ddd;
              padding: 5mm;
              margin-bottom: 10mm;
              text-align: center;
            }
            .title {
              font-weight: bold;
              font-size: 13pt;
              margin-bottom: 2mm;
              text-transform: uppercase;
            }
            .meta {
              font-size: 9pt;
              margin-bottom: 2mm;
            }
            .barcode-container {
              margin: 5mm 0;
            }
            .barcode {
              max-width: 100%;
              height: auto;
            }
            .dates {
              font-size: 9pt;
              border-top: 1px solid #ccc;
              padding-top: 2mm;
              margin-top: 5mm;
            }
          </style>
        </head>
        <body>
          ${selectedProducts.map(withPrintDefaults).map((sp) => {
            const price = Math.round(Number(calculatePriceByWeight(sp.netWeight, sp.product.sales_rate_exc_dis_and_tax)));
            const barcodeValue = encodeLabelBarcodeValue(sp.product.sku, sp.product.code, price);
            const barcodeDataURL = generateBarcodeDataURL(barcodeValue);
            
            return `
              <div class="label">
                <div class="title">${sp.product.name}</div>
                <div class="meta">NET WT: ${formatWeightDisplay(sp.netWeight)} | RS ${price}</div>
                <div class="barcode-container">
                  <img src="${barcodeDataURL}" alt="Barcode" class="barcode" />
                </div>
                <div class="dates">PKG: ${formatDate(sp.packageDate)} | EXP: ${formatDate(sp.expiryDate)}</div>
              </div>
            `;
          }).join('')}
        </body>
        <script>
          window.onload = function() {
            setTimeout(() => {
              window.print();
              // In kiosk mode, close automatically after print
              setTimeout(() => window.close(), 500);
            }, 100);
          };
        </script>
        </html>
      `;

      printWindow.document.write(htmlContent);
      printWindow.document.close();
      setIsPrinting(false);
      return;
    }

    // Normal mode: Standard print window
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error('Could not open print window');
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Barcode Labels</title>
        <style>
          @media print {
            @page {
              size: ${(LABEL_SIZES[selectedPaperSize] || LABEL_SIZES[DEFAULT_LABEL_SIZE]).css};
              margin: 0;
            }
            body { margin: 0; padding: 0; }
            .label { 
              page-break-inside: avoid;
              page-break-after: always;
              padding: 5mm;
            }
          }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 10mm;
          }
          .label {
            border: 1px dashed #ddd;
            padding: 5mm;
            margin-bottom: 10mm;
            text-align: center;
          }
          .title {
            font-weight: bold;
            font-size: 13pt;
            margin-bottom: 2mm;
            text-transform: uppercase;
          }
          .meta {
            font-size: 9pt;
            margin-bottom: 2mm;
          }
          .barcode-container {
            margin: 5mm 0;
          }
          .barcode {
            max-width: 100%;
            height: auto;
          }
          .dates {
            font-size: 9pt;
            border-top: 1px solid #ccc;
            padding-top: 2mm;
            margin-top: 5mm;
          }
        </style>
      </head>
      <body>
        ${selectedProducts.map(withPrintDefaults).map((sp) => {
          const price = Math.round(Number(calculatePriceByWeight(sp.netWeight, sp.product.sales_rate_exc_dis_and_tax)));
          const barcodeValue = encodeLabelBarcodeValue(sp.product.sku, sp.product.code, price);
          const barcodeDataURL = generateBarcodeDataURL(barcodeValue);
          
          return `
            <div class="label">
              <div class="title">${sp.product.name}</div>
              <div class="meta">NET WT: ${formatWeightDisplay(sp.netWeight)} | RS ${price}</div>
              <div class="barcode-container">
                <img src="${barcodeDataURL}" alt="Barcode" class="barcode" />
              </div>
              <div class="dates">PKG: ${formatDate(sp.packageDate)} | EXP: ${formatDate(sp.expiryDate)}</div>
            </div>
          `;
        }).join('')}
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.print();
      
      setTimeout(() => {
        printWindow.close();
        setIsPrinting(false);
        toast({
          title: "Print Dialog Opened",
          description: barcodePrinter ? `Printer: ${barcodePrinter}` : "Select your printer from the dialog",
        });
      }, 100);
    }, 250);
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return "__/__/____";
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const canPrint = selectedProducts.length > 0;

  // Total label count across all selected products — what the printer will
  // actually emit. Drives the print button label so the user knows how many
  // labels a batch will produce before they click.
  const totalLabels = selectedProducts.reduce(
    (sum, item) => sum + Math.max(1, item.copies || 1),
    0,
  );

  const safePreviewIndex = Math.min(previewIndex, Math.max(0, selectedProducts.length - 1));
  const previewItem = selectedProducts[safePreviewIndex];
  const previewPrice = previewItem
    ? Math.round(
        Number(
          calculatePriceByWeight(
            previewItem.netWeight,
            previewItem.product.sales_rate_exc_dis_and_tax,
          ),
        ),
      )
    : 0;
  const previewBarcodeValue = previewItem
    ? encodeLabelBarcodeValue(
        previewItem.product.sku,
        previewItem.product.code,
        previewPrice,
      )
    : "000000000";
  const previewBarcodeSrc = useMemo(
    () => (typeof document === "undefined" ? "" : generateBarcodeDataURL(previewBarcodeValue)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previewBarcodeValue],
  );
  const copiesForProduct = (productId: string) =>
    selectedProducts.find((sp) => sp.product.id === productId)?.copies;

  const stockOf = (product: Product) => Number(product.current_stock ?? product.stock ?? 0);
  const activeCatalog = products.filter((p) => p.is_active !== false);
  const inStockCount = activeCatalog.filter((p) => stockOf(p) > 0).length;
  const labelSize = LABEL_SIZES[selectedPaperSize] || LABEL_SIZES[DEFAULT_LABEL_SIZE];
  const activeFilterCount = (searchTerm.trim() ? 1 : 0) + (categoryFilter !== "all" ? 1 : 0) + (inStockOnly ? 1 : 0);

  const clearFilters = () => {
    setSearchTerm("");
    setCategoryFilter("all");
    setInStockOnly(false);
    productSearchInputRef.current?.focus();
  };

  // One label per unit in stock — the usual "label everything on the shelf" job.
  const setCopiesToStock = (itemId: string) => {
    const item = selectedProducts.find((sp) => sp.id === itemId);
    if (!item) return;
    const stock = Math.floor(stockOf(item.product));
    if (stock < 1) {
      sonnerToast.error("No stock to match", { description: `${item.product.name} has 0 in stock.`, position: "top-right" });
      return;
    }
    updateProductData(itemId, "copies", stock);
  };

  const allCopiesToStock = () => {
    let skipped = 0;
    setSelectedProducts((prev) =>
      prev.map((sp) => {
        const stock = Math.floor(stockOf(sp.product));
        if (stock < 1) {
          skipped += 1;
          return sp;
        }
        return { ...sp, copies: stock };
      }),
    );
    sonnerToast.success("Copies set to stock quantity", {
      description: skipped ? `${skipped} item${skipped === 1 ? "" : "s"} with no stock kept their copies.` : undefined,
      position: "top-right",
    });
  };

  const applyDefaultsToAll = () => {
    const copies = Math.max(1, parseInt(globalCopies, 10) || 1);
    setSelectedProducts((prev) =>
      prev.map((sp) => ({
        ...sp,
        netWeight: globalNetWeight,
        expiryDuration: globalExpiryDuration,
        expiryDate: calculateExpiryDate(sp.packageDate || new Date(), globalExpiryDuration),
        copies,
      })),
    );
    sonnerToast.success("Defaults applied to every item in the queue", { position: "top-right" });
  };

  const printLabelText = isPrinting
    ? "Preparing labels…"
    : `Print ${totalLabels} label${totalLabels === 1 ? "" : "s"}`;

  if (isFirstLoad) {
    return <PageLoader message="Loading Barcode Generator..." />;
  }

  const statCards = [
    {
      label: "Catalog items",
      value: activeCatalog.length.toLocaleString("en-US"),
      hint: `${inStockCount.toLocaleString("en-US")} in stock`,
      icon: Boxes,
      tone: "bg-blue-50 text-blue-600",
      accent: "bg-blue-500",
    },
    {
      label: "In print queue",
      value: selectedProducts.length.toLocaleString("en-US"),
      hint: selectedProducts.length ? "Products selected" : "Tap a product to add it",
      icon: ListChecks,
      tone: "bg-violet-50 text-violet-600",
      accent: "bg-violet-500",
    },
    {
      label: "Labels to print",
      value: totalLabels.toLocaleString("en-US"),
      hint: selectedProducts.length ? "Across all copies" : "Nothing queued yet",
      icon: Tags,
      tone: "bg-emerald-50 text-emerald-600",
      accent: "bg-emerald-500",
    },
    {
      label: "Label size",
      value: `${labelSize.w} × ${labelSize.h}`,
      hint: barcodePrinter ? `Printer: ${barcodePrinter}` : "No barcode printer set",
      icon: Ruler,
      tone: barcodePrinter ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-600",
      accent: barcodePrinter ? "bg-slate-400" : "bg-amber-500",
    },
  ];

  const filterLabel = "text-xs font-semibold text-indigo-900/80";
  const filterControl = "h-10 border-indigo-200/80 bg-white shadow-sm";
  const th = "h-10 whitespace-nowrap bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500";

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-5 overflow-x-hidden p-4 pb-28 md:p-6 md:pb-6 lg:p-8">
      {/* Header */}
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <BarcodeScanIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">Barcode Generator</h1>
            <p className="text-sm text-slate-500">Scan or pick products, set copies, then print labels in one go.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            onClick={clearAll}
            disabled={!canPrint}
            className="hidden h-9 border-rose-200 bg-white text-rose-600 shadow-sm hover:bg-rose-50 hover:text-rose-700 sm:inline-flex"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear queue
          </Button>
          <Button onClick={handlePrintAll} disabled={!canPrint || isPrinting} className="h-9 shadow-sm">
            {isPrinting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
            {printLabelText}
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <span className={cn("absolute inset-x-0 top-0 h-1", card.accent)} aria-hidden />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-500">{card.label}</p>
                  <p className="mt-2 truncate text-xl font-semibold tracking-tight tabular-nums text-slate-900 sm:text-2xl">{card.value}</p>
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
      <Card className="overflow-hidden rounded-xl border-indigo-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                Find products
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                    {activeFilterCount} active
                  </span>
                ) : null}
              </p>
              <p className="truncate text-xs text-slate-500">Scan a barcode and press Enter to add it instantly</p>
            </div>
          </div>
          {isRefreshing ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              Syncing catalog…
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
        <div className="border-t border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-indigo-50/30 px-4 py-4 sm:px-5">
          <div className="grid gap-x-3 gap-y-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
            <div className="min-w-0 space-y-1.5">
              <Label className={filterLabel}>Scan or search</Label>
              <div className="relative">
                <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-400" />
                <Input
                  ref={productSearchInputRef}
                  placeholder="Scan barcode, or type name / SKU / code"
                  value={searchTerm}
                  autoComplete="off"
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className={cn(filterControl, "pl-9 pr-9 text-base md:text-sm")}
                />
                {searchTerm ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm("");
                      productSearchInputRef.current?.focus();
                    }}
                    className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabel}>Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className={filterControl}>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex h-10 cursor-pointer items-center gap-2.5 rounded-lg border border-indigo-200/80 bg-white px-3 shadow-sm">
              <Switch checked={inStockOnly} onCheckedChange={setInStockOnly} />
              <span className="whitespace-nowrap text-sm font-medium text-slate-700">In stock only</span>
            </label>
          </div>
        </div>
      </Card>

      {/* Workspace */}
      <div className="grid min-w-0 grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Product picker */}
        <Card className="min-w-0 overflow-hidden rounded-xl border-slate-200 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Package className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight text-slate-900">Products</h2>
                <p className="truncate text-xs text-slate-500">
                  {filteredProducts.length.toLocaleString("en-US")} {filteredProducts.length === 1 ? "match" : "matches"} · click a row to add, click again for another copy
                </p>
              </div>
            </div>
            {pagedProducts.length > 0 ? (
              <Button variant="outline" size="sm" className="h-8" onClick={toggleSelectAllOnPage}>
                {allOnPageSelected ? <MinusSquare className="mr-1.5 h-3.5 w-3.5" /> : <CheckSquare className="mr-1.5 h-3.5 w-3.5" />}
                {allOnPageSelected ? "Remove page" : "Add whole page"}
              </Button>
            ) : null}
          </div>

          {pagedProducts.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Search className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-slate-900">
                {activeFilterCount ? "No matching products" : "No products in the catalog"}
              </p>
              <p className="mt-1 max-w-xs text-xs text-slate-500">
                {activeFilterCount ? "Check the spelling or scan again, or clear the filters." : "Add products in Inventory first."}
              </p>
              {activeFilterCount ? (
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
              {/* Mobile cards */}
              <div className="space-y-2 p-3 md:hidden">
                {pagedProducts.map((product) => {
                  const selected = isProductSelected(product.id);
                  const copies = copiesForProduct(product.id);
                  const stock = stockOf(product);
                  return (
                    <button
                      type="button"
                      key={product.id}
                      onClick={() => handleProductSelect(product.id, { keepSearch: true })}
                      className={cn(
                        "w-full space-y-1.5 rounded-xl border p-3 text-left transition",
                        selected ? "border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200" : "border-slate-200 bg-white active:bg-slate-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-snug text-slate-900">{product.name}</p>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                          Rs {Number(product.sales_rate_exc_dis_and_tax || 0).toLocaleString("en-US")}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span className="font-mono">{product.sku || product.code || "—"}</span>
                        {product.category ? (
                          <>
                            <span className="text-slate-300">•</span>
                            <span>{product.category}</span>
                          </>
                        ) : null}
                        <span className="text-slate-300">•</span>
                        <StockBadge stock={stock} />
                      </div>
                      <div className="pt-0.5">
                        {selected ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                            <Check className="h-3 w-3" />
                            {copies} label{copies === 1 ? "" : "s"} · tap for +1
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600">
                            <Plus className="h-3 w-3" /> Tap to add
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={cn(th, "w-12 pl-5")}>
                        <Checkbox checked={allOnPageSelected} onCheckedChange={toggleSelectAllOnPage} aria-label="Select all on page" />
                      </TableHead>
                      <TableHead className={th}>Product</TableHead>
                      <TableHead className={th}>Category</TableHead>
                      <TableHead className={cn(th, "text-right")}>Price</TableHead>
                      <TableHead className={cn(th, "text-right")}>Stock</TableHead>
                      <TableHead className={cn(th, "pr-5 text-right")}>In queue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedProducts.map((product) => {
                      const selected = isProductSelected(product.id);
                      const copies = copiesForProduct(product.id);
                      const stock = stockOf(product);
                      return (
                        <TableRow
                          key={product.id}
                          className={cn(
                            "cursor-pointer border-slate-100 transition-colors",
                            selected ? "bg-indigo-50/60 hover:bg-indigo-50" : "hover:bg-slate-50/70",
                          )}
                          onClick={() => handleProductSelect(product.id, { keepSearch: true })}
                          title={selected ? "Click to add another copy" : "Click to add to the print queue"}
                        >
                          <TableCell className="py-3 pl-5" onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={selected} onCheckedChange={() => toggleProductRow(product)} aria-label={`Select ${product.name}`} />
                          </TableCell>
                          <TableCell className="py-3">
                            <p className="max-w-[320px] truncate font-medium text-slate-900">{product.name}</p>
                            <p className="font-mono text-[11px] text-slate-400">{product.sku || product.code || "—"}</p>
                          </TableCell>
                          <TableCell className="py-3">
                            {product.category ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{product.category}</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-3 text-right font-medium tabular-nums text-slate-900">
                            Rs {Number(product.sales_rate_exc_dis_and_tax || 0).toLocaleString("en-US")}
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            <StockBadge stock={stock} />
                          </TableCell>
                          <TableCell className="py-3 pr-5 text-right">
                            {selected ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                                <Check className="h-3 w-3" />
                                {copies}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                                <Plus className="h-3 w-3" /> Add
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {filteredProducts.length > TABLE_PAGE_SIZE ? (
            <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-center tabular-nums sm:text-left">
                Showing {(tablePage - 1) * TABLE_PAGE_SIZE + 1}–{Math.min(tablePage * TABLE_PAGE_SIZE, filteredProducts.length)} of{" "}
                {filteredProducts.length.toLocaleString("en-US")}
              </span>
              <div className="flex items-center justify-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 bg-white px-2.5"
                  onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                  disabled={tablePage === 1}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <span className="px-2 text-xs font-medium tabular-nums">
                  {tablePage} / {totalTablePages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 bg-white px-2.5"
                  onClick={() => setTablePage((p) => Math.min(totalTablePages, p + 1))}
                  disabled={tablePage === totalTablePages}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        {/* Queue + preview (sticky on desktop) */}
        <div className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start">
          {/* Preview */}
          <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Eye className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold tracking-tight text-slate-900">Label preview</h2>
                  <p className="truncate text-xs text-slate-500">{labelSize.label}</p>
                </div>
              </div>
              {selectedProducts.length > 1 ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={safePreviewIndex === 0}
                    onClick={() => setPreviewIndex(Math.max(0, safePreviewIndex - 1))}
                    title="Previous item"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="px-1 text-xs tabular-nums text-slate-500">
                    {safePreviewIndex + 1}/{selectedProducts.length}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={safePreviewIndex >= selectedProducts.length - 1}
                    onClick={() => setPreviewIndex(Math.min(selectedProducts.length - 1, safePreviewIndex + 1))}
                    title="Next item"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="bg-[radial-gradient(circle_at_1px_1px,#e2e8f0_1px,transparent_0)] bg-[length:14px_14px] p-5">
              <div
                className={cn(
                  "mx-auto flex w-full max-w-[300px] flex-col items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white p-3 shadow-md",
                  !previewItem && "opacity-60",
                )}
                style={{ aspectRatio: `${labelSize.w} / ${labelSize.h}` }}
              >
                {includeProductName && (
                  <p className="w-full truncate text-center text-[11px] font-bold uppercase text-slate-900">
                    {previewItem ? previewItem.product.name : "Sample product"}
                  </p>
                )}
                {includeSku && (
                  <p className="max-w-full truncate text-[10px] text-slate-500">
                    SKU: {previewItem ? previewItem.product.sku || previewItem.product.code || "—" : "SAMPLE"}
                  </p>
                )}
                {previewBarcodeSrc ? (
                  <img src={previewBarcodeSrc} alt="Barcode preview" className="h-12 max-w-full object-contain" />
                ) : null}
                <p className="break-all text-center font-mono text-[10px] text-slate-600">{previewBarcodeValue}</p>
                {previewItem && (previewItem.netWeight || previewItem.expiryDate) ? (
                  <p className="text-[9px] text-slate-500">
                    {previewItem.netWeight ? `NET ${formatWeightDisplay(previewItem.netWeight)} · ` : ""}
                    PKG {formatDate(previewItem.packageDate)} · EXP {formatDate(previewItem.expiryDate)}
                  </p>
                ) : null}
                {includePrice && <p className="text-sm font-bold text-slate-900">Rs {previewItem ? previewPrice.toLocaleString("en-US") : 0}</p>}
              </div>
              {!previewItem ? (
                <p className="mt-3 text-center text-xs text-slate-500">Add a product to see its real label.</p>
              ) : null}
            </div>
          </Card>

          {/* Queue */}
          <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <ListChecks className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold tracking-tight text-slate-900">Print queue</h2>
                  <p className="truncate text-xs text-slate-500">
                    {selectedProducts.length
                      ? `${selectedProducts.length} product${selectedProducts.length === 1 ? "" : "s"} · ${totalLabels} label${totalLabels === 1 ? "" : "s"}`
                      : "Empty"}
                  </p>
                </div>
              </div>
              {canPrint ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onSelect={allCopiesToStock}>
                      <Boxes className="mr-2 h-4 w-4" />
                      Copies = stock for all
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={applyDefaultsToAll}>
                      <Wand2 className="mr-2 h-4 w-4" />
                      Apply default settings to all
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={clearAll} className="text-rose-600 focus:text-rose-700">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Clear queue
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>

            {!canPrint ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
                  <ScanLine className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-slate-900">Your queue is empty</p>
                <p className="mt-1 max-w-[260px] text-xs text-slate-500">
                  Scan a barcode, click products in the list, or use bulk upload below.
                </p>
              </div>
            ) : (
              <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto">
                {selectedProducts.map((item, index) => {
                  const stock = Math.floor(stockOf(item.product));
                  return (
                    <li
                      key={item.id}
                      className={cn("space-y-2.5 px-4 py-3", index === safePreviewIndex && selectedProducts.length > 1 && "bg-indigo-50/40")}
                      onMouseEnter={() => setPreviewIndex(index)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{item.product.name}</p>
                          <p className="truncate text-xs text-slate-500">
                            <span className="font-mono">{item.product.sku || item.product.code || "—"}</span> · Rs{" "}
                            {Number(item.product.sales_rate_exc_dis_and_tax || 0).toLocaleString("en-US")} · {stock} in stock
                          </p>
                        </div>
                        <Button
                          onClick={() => removeProduct(item.id)}
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Remove from queue"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-end gap-2">
                        <div>
                          <Label className="text-[11px] text-slate-500">Copies</Label>
                          <div className="flex items-center rounded-md border border-slate-200">
                            <button
                              type="button"
                              className="flex h-8 w-7 items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                              onClick={() => updateProductData(item.id, "copies", Math.max(1, (item.copies || 1) - 1))}
                              disabled={(item.copies || 1) <= 1}
                              aria-label="Fewer copies"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              value={item.copies}
                              onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                updateProductData(item.id, "copies", Number.isFinite(n) && n > 0 ? n : 1);
                              }}
                              className="h-8 w-10 border-x border-slate-200 bg-white text-center text-sm font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <button
                              type="button"
                              className="flex h-8 w-7 items-center justify-center text-slate-500 hover:bg-slate-50"
                              onClick={() => updateProductData(item.id, "copies", (item.copies || 1) + 1)}
                              aria-label="More copies"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <Label className="text-[11px] text-slate-500">Weight</Label>
                          <Input
                            value={item.netWeight}
                            list={`weights-${item.id}`}
                            onChange={(e) => updateProductData(item.id, "netWeight", e.target.value)}
                            placeholder="Optional"
                            className="h-8 text-sm"
                          />
                          <datalist id={`weights-${item.id}`}>
                            {getNetWeightOptions(item.product.unitName)
                              .filter((opt) => opt.value !== "custom")
                              .map((opt) => (
                                <option key={opt.value} value={opt.value} />
                              ))}
                          </datalist>
                        </div>
                        <div className="min-w-0">
                          <Label className="text-[11px] text-slate-500">Expiry</Label>
                          <Select
                            value={item.expiryDuration || "12"}
                            onValueChange={(value) => updateProductData(item.id, "expiryDuration", value)}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {expiryOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {stock > 0 && item.copies !== stock ? (
                        <button
                          type="button"
                          onClick={() => setCopiesToStock(item.id)}
                          className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
                        >
                          Match stock ({stock} labels)
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="border-t border-slate-100 bg-slate-50/60 p-4">
              <Button onClick={handlePrintAll} className="h-11 w-full text-base shadow-sm" disabled={!canPrint || isPrinting}>
                {isPrinting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                {printLabelText}
              </Button>
              {!barcodePrinter ? (
                <p className="mt-2 flex items-center justify-center gap-1 text-center text-[11px] text-amber-700">
                  <AlertTriangle className="h-3 w-3" /> No barcode printer set — the browser print dialog will open.
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      {/* Settings + bulk upload */}
      <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
        <button
          type="button"
          onClick={() => setShowMoreOptions((open) => !open)}
          aria-expanded={showMoreOptions}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50/70"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Settings2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-slate-900">Label settings & bulk upload</h2>
              <p className="truncate text-xs text-slate-500">
                {labelSize.label} · expiry {globalExpiryDuration} months · {globalCopies || 1} cop{(globalCopies || "1") === "1" ? "y" : "ies"} by default ·
                shows {[includeProductName && "name", includeSku && "SKU", includePrice && "price"].filter(Boolean).join(", ") || "barcode only"}
              </p>
            </div>
          </div>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", showMoreOptions && "rotate-180")} />
        </button>

        {showMoreOptions && (
          <div className="grid gap-6 border-t border-slate-100 p-5 lg:grid-cols-2">
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Barcode printer</Label>
                {barcodePrinter ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                    <Printer className="h-4 w-4 text-slate-500" />
                    <span className="break-all font-medium">{barcodePrinter}</span>
                    <span className="text-xs text-slate-500">· change in Printer Settings</span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      No barcode printer configured. Set one in <strong>Printer Settings</strong>.
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Label size</Label>
                  <Select value={selectedPaperSize} onValueChange={setSelectedPaperSize}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paperSizes.map((size) => (
                        <SelectItem key={size.value} value={size.value}>
                          {size.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Default expiry</Label>
                  <Select value={globalExpiryDuration} onValueChange={setGlobalExpiryDuration}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {expiryOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="global-net-weight" className="text-xs text-slate-600">
                    Default weight
                  </Label>
                  <Input
                    id="global-net-weight"
                    className="h-9"
                    value={globalNetWeight}
                    onChange={(e) => setGlobalNetWeight(e.target.value)}
                    placeholder="e.g. 500g"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="global-copies" className="text-xs text-slate-600">
                    Default copies
                  </Label>
                  <Input
                    id="global-copies"
                    className="h-9"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={globalCopies}
                    onChange={(e) => setGlobalCopies(e.target.value)}
                    placeholder="1"
                  />
                </div>
              </div>
              {canPrint ? (
                <Button variant="outline" size="sm" className="h-8" onClick={applyDefaultsToAll}>
                  <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                  Apply these defaults to the whole queue
                </Button>
              ) : null}

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Show on label</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[
                    { id: "include-name", label: "Product name", checked: includeProductName, set: setIncludeProductName },
                    { id: "include-price", label: "Price", checked: includePrice, set: setIncludePrice },
                    { id: "include-sku", label: "SKU", checked: includeSku, set: setIncludeSku },
                  ].map((opt) => (
                    <label
                      key={opt.id}
                      htmlFor={opt.id}
                      className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50"
                    >
                      <span className="text-sm text-slate-700">{opt.label}</span>
                      <Switch id={opt.id} checked={opt.checked} onCheckedChange={opt.set} />
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-slate-400">Settings are remembered on this device.</p>
            </div>

            <div className="flex flex-col justify-between gap-4 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <FileSpreadsheet className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Bulk upload</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Upload a CSV or Excel file with a <span className="font-mono font-medium text-slate-700">SKU</span> column, plus optional{" "}
                    <span className="font-mono">Net Weight</span>, <span className="font-mono">Expiry Months</span> and{" "}
                    <span className="font-mono">Copies</span>. Every matching product is added to the queue at once.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" size="sm" className="h-9 w-full bg-white sm:w-auto" onClick={downloadBulkTemplate}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download template
                </Button>
                <Button size="sm" className="h-9 w-full sm:w-auto" onClick={() => bulkFileInputRef.current?.click()} disabled={bulkParsing}>
                  {bulkParsing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                  {bulkParsing ? "Processing…" : "Choose file"}
                </Button>
              </div>
              <input ref={bulkFileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleBulkFileChange} />
            </div>
          </div>
        )}
      </Card>

      {/* Mobile print bar */}
      {canPrint && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 p-3 backdrop-blur md:hidden">
          <Button onClick={handlePrintAll} className="h-11 w-full" disabled={isPrinting}>
            {isPrinting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
            {printLabelText}
          </Button>
        </div>
      )}
    </div>
  );
}

function StockBadge({ stock }: { stock: number }) {
  const tone =
    stock <= 0
      ? "bg-rose-50 text-rose-700 ring-rose-600/20"
      : stock < 5
        ? "bg-amber-50 text-amber-700 ring-amber-600/20"
        : "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset", tone)}>
      {stock <= 0 ? "Out" : stock.toLocaleString("en-US")}
    </span>
  );
}
