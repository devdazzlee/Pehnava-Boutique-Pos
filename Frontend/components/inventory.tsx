"use client"

import { ProductPriceHistory } from "@/components/inventory/product-price-history"
import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { ChevronDown } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import {
  Search,
  Plus,
  Edit,
  Package,
  AlertTriangle,
  Upload,
  X,
  ImageIcon,
  RefreshCw,
  Loader2,
  Trash2,
  Tag,
  Star,
  LayoutGrid,
  List,
  PackageCheck,
  PackageX,
  Globe,
  Check,
  ChevronsUpDown,
} from "lucide-react"
import apiClient from "@/lib/apiClient"
import { usePosData } from "@/hooks/use-pos-data"
import { usePosBranch } from "@/hooks/use-pos-branch"
import { cn } from "@/lib/utils"
import { formatMoneyDisplay } from "@/lib/money"
import {
  getProductBarcodeDisplay,
  previewAutoBarcodeValue,
  sanitizeManualBarcodeValue,
  type LabelBarcodeMode,
} from "@/lib/labelBarcode"

// Image compression utility
const compressImage = (file: File, quality = 0.7, maxWidth = 800, maxHeight = 600): Promise<File> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const img = new Image()

    img.onload = () => {
      // Calculate new dimensions
      let { width, height } = img

      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height
          height = maxHeight
        }
      }

      canvas.width = width
      canvas.height = height

      // Draw and compress
      ctx?.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            })
            resolve(compressedFile)
          } else {
            reject(new Error("Canvas to Blob conversion failed"))
          }
        },
        file.type,
        quality,
      )
    }

    img.onerror = () => reject(new Error("Image load failed"))
    img.src = URL.createObjectURL(file)
  })
}

// Types and Interfaces
interface DropdownOption {
  id: string
  name: string
  percentage?: number // for taxes
  is_active?: boolean
  category_id?: string
}

interface Product {
  id: string
  name: string
  sku: string
  code: string
  label_barcode?: string
  custom_code?: string
  pct_or_hs_code?: string
  description?: string
  purchase_rate: number
  sales_rate_exc_dis_and_tax: number
  sales_rate_inc_dis_and_tax: number
  discount_amount?: number
  min_qty?: number
  max_qty?: number
  is_active: boolean
  display_on_pos: boolean
  display_on_website: boolean
  is_batch: boolean
  auto_fill_on_demand_sheet: boolean
  non_inventory_item: boolean
  is_deal: boolean
  is_featured: boolean
  unit?: DropdownOption
  tax?: DropdownOption
  category?: DropdownOption
  subcategory?: DropdownOption
  supplier?: DropdownOption
  brand?: DropdownOption
  color?: DropdownOption
  size?: DropdownOption
  created_at: string
  updated_at: string
  images?: { image: string }[]
  available_stock?: number
  current_stock?: number
  reserved_stock?: number
  minimum_stock?: number
  maximum_stock?: number
}

const mapStoreProductToCard = (product: any): Product => ({
  id: product.id,
  name: product.name,
  sku: product.sku || "",
  code: product.code || "",
  label_barcode: product.label_barcode || "",
  custom_code: product.custom_code || "",
  pct_or_hs_code: product.pct_or_hs_code,
  description: product.description,
  purchase_rate: Number(product.purchase_rate) || 0,
  sales_rate_exc_dis_and_tax: Number(product.sales_rate_exc_dis_and_tax) || 0,
  sales_rate_inc_dis_and_tax: Number(product.sales_rate_inc_dis_and_tax) || 0,
  discount_amount: product.discount_amount != null ? Number(product.discount_amount) : undefined,
  min_qty: product.min_qty != null ? Number(product.min_qty) : undefined,
  max_qty: product.max_qty != null ? Number(product.max_qty) : undefined,
  is_active: product.is_active ?? true,
  display_on_pos: product.display_on_pos ?? true,
  display_on_website: product.display_on_website ?? true,
  is_batch: product.is_batch ?? false,
  auto_fill_on_demand_sheet: product.auto_fill_on_demand_sheet ?? false,
  non_inventory_item: product.non_inventory_item ?? false,
  is_deal: product.is_deal ?? false,
  is_featured: product.is_featured ?? false,
  unit: { id: product.unitId, name: product.unitName },
  tax: { id: product.taxId, name: product.taxName },
  category: { id: product.categoryId, name: product.category },
  subcategory: { id: product.subcategoryId, name: product.subcategory },
  supplier: { id: product.supplierId, name: product.supplierName },
  brand: { id: product.brandId, name: product.brandName },
  color: { id: product.colorId, name: product.colorName },
  size: { id: product.sizeId, name: product.sizeName },
  available_stock: Number(product.available_stock ?? product.current_stock ?? product.stock ?? 0),
  current_stock: Number(product.current_stock ?? product.stock ?? 0),
  reserved_stock: Number(product.reserved_stock ?? 0),
  minimum_stock: Number(product.minimum_stock ?? product.min_qty ?? 0),
  maximum_stock: Number(product.maximum_stock ?? 0),
  created_at: product.created_at || new Date().toISOString(),
  updated_at: product.updated_at || new Date().toISOString(),
  images: product.images || [],
})

const getProductStock = (product: Product) =>
  Number(product.available_stock ?? product.current_stock ?? 0)

function ProductBarcodeSubline({ product }: { product: Product }) {
  const value = getProductBarcodeDisplay(product)
  return (
    <p className="mt-0.5 flex min-w-0 items-baseline gap-1.5 truncate">
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-gray-400">
        Barcode
      </span>
      <span className="truncate font-mono text-xs font-bold tabular-nums text-gray-900">
        {value || "—"}
      </span>
    </p>
  )
}

const formatRs = (amount: number | string | undefined) =>
  formatMoneyDisplay(Number(amount) || 0)

const formatStockQty = (n: number) => {
  const value = Number(n) || 0
  if (Number.isInteger(value)) return value.toLocaleString()
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

const getProductImageUrl = (product: Product) => {
  const url = product.images?.[0]?.image
  if (!url || typeof url !== "string") return null
  const version = encodeURIComponent(product.updated_at || product.id)
  return `${url}${url.includes("?") ? "&" : "?"}v=${version}`
}

function ProductThumb({
  product,
  className,
  iconClassName,
}: {
  product: Product
  className?: string
  iconClassName?: string
}) {
  const [failed, setFailed] = useState(false)
  const imageUrl = getProductImageUrl(product)

  if (!imageUrl || failed) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center bg-slate-100 text-gray-400",
          className,
        )}
      >
        <ImageIcon className={cn("h-8 w-8", iconClassName)} />
      </div>
    )
  }

  return (
    <img
      src={imageUrl}
      alt={product.name}
      className={cn("h-full w-full object-cover", className)}
      onError={() => setFailed(true)}
    />
  )
}

const getStockTone = (product: Product) => {
  const stock = getProductStock(product)
  const minStock = product.minimum_stock ?? product.min_qty ?? 0
  if (stock < 0) {
    return {
      label: "Negative",
      className: "text-red-700 bg-red-50 border-red-200",
      valueClassName: "text-red-700",
    }
  }
  if (stock <= 0) {
    return {
      label: "Out",
      className: "text-red-700 bg-red-50 border-red-200",
      valueClassName: "text-red-700",
    }
  }
  if (minStock > 0 && stock <= minStock) {
    return {
      label: "Low",
      className: "text-amber-700 bg-amber-50 border-amber-200",
      valueClassName: "text-amber-700",
    }
  }
  return {
    label: "In stock",
    className: "text-green-700 bg-green-50 border-green-200",
    valueClassName: "text-green-700",
  }
}

interface ProductFormData {
  name: string
  unit_id: string
  label_barcode?: string
  pct_or_hs_code?: string
  description?: string
  sku: string
  purchase_rate: number
  sales_rate_exc_dis_and_tax: number
  sales_rate_inc_dis_and_tax: number
  discount_amount?: number
  tax_id?: string
  category_id: string
  subcategory_id?: string
  min_qty?: number
  max_qty?: number
  supplier_id?: string
  brand_id?: string
  color_id?: string
  size_id?: string
  collection?: string
  is_active?: boolean
  display_on_pos?: boolean
  display_on_website?: boolean
  is_batch?: boolean
  auto_fill_on_demand_sheet?: boolean
  non_inventory_item?: boolean
  is_deal?: boolean
  is_featured?: boolean
  images?: (string | File)[]
}

function FormFieldSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

function ProductFormSkeleton({ message = "Preparing form..." }: { message?: string }) {
  return (
    <div className="space-y-6 py-1" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-4 py-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>

      <div className="space-y-4">
        <Skeleton className="h-6 w-44" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormFieldSkeleton />
          <FormFieldSkeleton />
          <FormFieldSkeleton />
          <FormFieldSkeleton />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>

      <div className="space-y-4">
        <Skeleton className="h-6 w-44" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormFieldSkeleton />
          <FormFieldSkeleton />
        </div>
      </div>

      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormFieldSkeleton />
          <FormFieldSkeleton />
        </div>
      </div>

      <div className="space-y-4">
        <Skeleton className="h-6 w-52" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormFieldSkeleton />
          <FormFieldSkeleton />
          <FormFieldSkeleton />
          <FormFieldSkeleton />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Skeleton className="h-10 w-36" />
      </div>
    </div>
  )
}

function FormDropdown({
  label,
  htmlFor,
  required = false,
  value,
  onValueChange,
  placeholder,
  options,
  allowNone = false,
  noneLabel = "None",
}: {
  label: string
  htmlFor: string
  required?: boolean
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  options: DropdownOption[]
  allowNone?: boolean
  noneLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const selected = useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter((option) => option.name.toLowerCase().includes(needle))
  }, [options, query])

  const triggerLabel =
    allowNone && value === "none"
      ? noneLabel
      : selected?.name ?? placeholder

  const hasSelection = allowNone ? value === "none" || !!selected : !!selected

  return (
    <div>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? " *" : ""}
      </Label>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setQuery("")
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={htmlFor}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={!allowNone && options.length === 0}
            className="h-10 w-full justify-between font-normal"
          >
            <span className={cn("truncate text-left", !hasSelection && "text-muted-foreground")}>
              {triggerLabel}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={`Search ${label.toLowerCase()}…`}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {options.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No options available
                </div>
              ) : (
                <>
                  <CommandEmpty>No matches</CommandEmpty>
                  <CommandGroup>
                    {allowNone ? (
                      <CommandItem
                        value="__none__"
                        onSelect={() => {
                          onValueChange("none")
                          setOpen(false)
                          setQuery("")
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            value === "none" ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {noneLabel}
                      </CommandItem>
                    ) : null}
                    {filtered.map((option) => (
                      <CommandItem
                        key={option.id}
                        value={option.id}
                        onSelect={() => {
                          onValueChange(option.id)
                          setOpen(false)
                          setQuery("")
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            value === option.id ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {option.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

const ProductForm = ({
  onSubmit,
  loading,
  submitText,
  formData,
  formErrors,
  updateFormData,
  units,
  categories,
  subcategories,
  taxes,
  suppliers,
  brands,
  colors,
  sizes,
  imagePreviews,
  handleRemoveImage,
  fileInputRef,
  handleImageSelect,
  stockQtyByBranch,
  setStockQtyByBranch,
  stockBranchIds,
  setStockBranchIds,
  branchOptions,
  stockLabel,
  currentBranchStocks,
  productId,
  productInternalCode,
  barcodeMode,
  setBarcodeMode,
}: {
  productId?: string
  productInternalCode?: string
  barcodeMode: LabelBarcodeMode
  setBarcodeMode: (mode: LabelBarcodeMode) => void
  onSubmit: () => void
  loading: boolean
  submitText: string
  formData: ProductFormData
  formErrors: { sku?: string; pct_or_hs_code?: string }
  updateFormData: (field: keyof ProductFormData, value: any) => void
  units: DropdownOption[]
  categories: DropdownOption[]
  subcategories: DropdownOption[]
  taxes: DropdownOption[]
  suppliers: DropdownOption[]
  brands: DropdownOption[]
  colors: DropdownOption[]
  sizes: DropdownOption[]
  imagePreviews: string[]
  handleRemoveImage: (index: number) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  handleImageSelect: (event: React.ChangeEvent<HTMLInputElement>) => void
  stockQtyByBranch: Record<string, number>
  setStockQtyByBranch: React.Dispatch<React.SetStateAction<Record<string, number>>>
  stockBranchIds: string[]
  setStockBranchIds: (ids: string[]) => void
  branchOptions: Array<{ id: string; name: string; code?: string }>
  stockLabel: string
  currentBranchStocks?: Record<string, number>
}) => {
  const hasErrors = Object.values(formErrors).some((error) => !!error)

  // Raw text state for numeric inputs. We keep it independent of formData
  // so users can naturally type "0.", "1.5", clear to empty, etc., without the
  // displayed string fighting the numeric model. On blur we drop the raw
  // entry so the input falls back to displaying the canonical formData value
  // ("" when zero, the number itself otherwise).
  const [rawNumberInputs, setRawNumberInputs] = useState<Record<string, string>>({})

  const numberDisplayValue = (field: string, value: number | undefined): string => {
    if (rawNumberInputs[field] !== undefined) return rawNumberInputs[field]
    return value && value !== 0 ? String(value) : ""
  }

  const buildNumberHandlers = (
    field: keyof ProductFormData,
    opts: { integer?: boolean } = {},
  ) => {
    const pattern = opts.integer ? /^\d*$/ : /^\d*\.?\d*$/
    return {
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value
        if (v !== "" && !pattern.test(v)) return
        setRawNumberInputs((prev) => ({ ...prev, [field]: v }))
        if (v === "" || v === ".") {
          updateFormData(field, 0)
          return
        }
        const n = opts.integer ? parseInt(v, 10) : parseFloat(v)
        updateFormData(field, Number.isFinite(n) ? n : 0)
      },
      onBlur: () => {
        setRawNumberInputs((prev) => {
          const next = { ...prev }
          delete next[field as string]
          return next
        })
      },
    }
  }

  // Hides native browser number spinners on text-type inputs and keeps focus
  // styling consistent with the rest of the form.
  const numberInputClass =
    "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"

  const autoBarcodePreview = previewAutoBarcodeValue(
    formData.sku,
    productInternalCode || "",
    Math.round(Number(formData.sales_rate_exc_dis_and_tax) || 0),
  )

  return (
    <div className="space-y-6">
      {/* Basic Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Basic Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Product Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => updateFormData("name", e.target.value)}
              placeholder="Enter product name"
            />
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label>Barcode (scan &amp; print)</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={barcodeMode === "auto" ? "default" : "outline"}
                className="h-8"
                onClick={() => {
                  setBarcodeMode("auto")
                  updateFormData("label_barcode", "")
                }}
              >
                Auto (system)
              </Button>
              <Button
                type="button"
                size="sm"
                variant={barcodeMode === "manual" ? "default" : "outline"}
                className="h-8"
                onClick={() => setBarcodeMode("manual")}
              >
                Custom (your code)
              </Button>
            </div>
            {barcodeMode === "auto" ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">
                  Generated from 9-digit SKU or product code (same as Barcode Generator).
                </p>
                <p className="mt-1 font-mono text-sm font-medium text-slate-900">{autoBarcodePreview}</p>
              </div>
            ) : (
              <>
                <Input
                  id="label_barcode"
                  value={formData.label_barcode || ""}
                  onChange={(e) => updateFormData("label_barcode", e.target.value)}
                  placeholder="e.g. TAKAFUL-12 or 123456789"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Saved on the product for POS scan and label print.
                </p>
              </>
            )}
          </div>
          <FormDropdown
            label="Unit"
            htmlFor="unit_id"
            required
            value={formData.unit_id}
            onValueChange={(value) => updateFormData("unit_id", value)}
            placeholder="Select unit"
            options={units}
          />
          <FormDropdown
            label="Category"
            htmlFor="category_id"
            required
            value={formData.category_id}
            onValueChange={(value) => updateFormData("category_id", value)}
            placeholder="Select category"
            options={categories}
          />
          <FormDropdown
            label="Subcategory"
            htmlFor="subcategory_id"
            value={formData.subcategory_id || "none"}
            onValueChange={(value) => updateFormData("subcategory_id", value === "none" ? "" : value)}
            placeholder="Select subcategory"
            options={subcategories}
            allowNone
          />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description || ""}
            onChange={(e) => updateFormData("description", e.target.value)}
            placeholder="Enter product description"
            rows={3}
          />
        </div>
      </div>

      {/* Pricing Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Pricing Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="purchase_rate">Purchase Rate *</Label>
            <Input
              id="purchase_rate"
              type="text"
              inputMode="decimal"
              value={numberDisplayValue("purchase_rate", formData.purchase_rate)}
              {...buildNumberHandlers("purchase_rate")}
              placeholder="0.00"
              className={numberInputClass}
            />
          </div>
          <div>
            <Label htmlFor="sales_rate">Sales Rate *</Label>
            <Input
              id="sales_rate"
              type="text"
              inputMode="decimal"
              value={numberDisplayValue(
                "sales_rate_inc_dis_and_tax",
                formData.sales_rate_inc_dis_and_tax,
              )}
              onChange={(e) => {
                const v = e.target.value
                if (v !== "" && !/^\d*\.?\d*$/.test(v)) return
                setRawNumberInputs((prev) => ({
                  ...prev,
                  sales_rate_inc_dis_and_tax: v,
                  sales_rate_exc_dis_and_tax: v,
                }))
                const n = v === "" || v === "." ? 0 : parseFloat(v)
                const safe = Number.isFinite(n) ? n : 0
                // Mirror the single user-facing price into both DB columns
                // so existing queries (POS, reports) that read either field
                // continue to work without change.
                updateFormData("sales_rate_inc_dis_and_tax", safe)
                updateFormData("sales_rate_exc_dis_and_tax", safe)
              }}
              onBlur={() => {
                setRawNumberInputs((prev) => {
                  const next = { ...prev }
                  delete next.sales_rate_inc_dis_and_tax
                  delete next.sales_rate_exc_dis_and_tax
                  return next
                })
              }}
              placeholder="0.00"
              className={numberInputClass}
            />
          </div>
        </div>
      </div>

      {/* Inventory Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Inventory Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="min_qty">Minimum Quantity</Label>
            <Input
              id="min_qty"
              type="text"
              inputMode="numeric"
              value={numberDisplayValue("min_qty", formData.min_qty)}
              {...buildNumberHandlers("min_qty", { integer: true })}
              placeholder="0"
              className={numberInputClass}
            />
          </div>
          <div>
            <Label htmlFor="max_qty">Maximum Quantity</Label>
            <Input
              id="max_qty"
              type="text"
              inputMode="numeric"
              value={numberDisplayValue("max_qty", formData.max_qty)}
              {...buildNumberHandlers("max_qty", { integer: true })}
              placeholder="0"
              className={numberInputClass}
            />
          </div>
        </div>

        {/* Stock — optional, per branch. When set, fires a POST /stock per
            branch after the product save succeeds (adds to existing branch
            stock + logs a movement). Each branch gets its own quantity —
            checking multiple branches does NOT clone one number into all of
            them. */}
        {(() => {
          const allChecked =
            branchOptions.length > 0 && stockBranchIds.length === branchOptions.length
          const someChecked = stockBranchIds.length > 0 && !allChecked
          const triggerLabel =
            branchOptions.length === 0
              ? "No branches available"
              : stockBranchIds.length === 0
                ? "Select branches"
                : allChecked
                  ? `All branches (${branchOptions.length})`
                  : stockBranchIds.length === 1
                    ? branchOptions.find((b) => b.id === stockBranchIds[0])?.name ||
                      "1 branch"
                    : `${stockBranchIds.length} branches selected`

          const toggleBranch = (id: string, checked: boolean) => {
            if (checked) {
              if (!stockBranchIds.includes(id)) {
                setStockBranchIds([...stockBranchIds, id])
              }
            } else {
              setStockBranchIds(stockBranchIds.filter((x) => x !== id))
            }
          }

          const toggleAll = (checked: boolean) => {
            setStockBranchIds(checked ? branchOptions.map((b) => b.id) : [])
          }

          const qtyRawKey = (branchId: string) => `stock_qty_${branchId}`

          const setQty = (branchId: string, raw: string) => {
            if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return
            setRawNumberInputs((prev) => ({ ...prev, [qtyRawKey(branchId)]: raw }))
            const n = raw === "" || raw === "." ? 0 : parseFloat(raw)
            setStockQtyByBranch((prev) => ({
              ...prev,
              [branchId]: Number.isFinite(n) ? n : 0,
            }))
          }

          const selectedBranches = branchOptions.filter((b) =>
            stockBranchIds.includes(b.id),
          )

          return (
        <div className="space-y-3">
          <div>
            <Label>Branches</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  disabled={branchOptions.length === 0}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate text-left">{triggerLabel}</span>
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
                <div className="flex items-center gap-2 px-2 py-1.5 border-b mb-1">
                  <Checkbox
                    id="stock-branch-all"
                    checked={allChecked || (someChecked && "indeterminate")}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                  />
                  <Label
                    htmlFor="stock-branch-all"
                    className="text-sm font-semibold cursor-pointer flex-1"
                  >
                    All branches
                  </Label>
                  <span className="text-xs text-gray-500">
                    {stockBranchIds.length}/{branchOptions.length}
                  </span>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {branchOptions.map((b) => {
                    const checked = stockBranchIds.includes(b.id)
                    const current = currentBranchStocks?.[b.id]
                    return (
                      <div
                        key={b.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleBranch(b.id, !checked)}
                      >
                        <Checkbox
                          id={`stock-branch-${b.id}`}
                          checked={checked}
                          onCheckedChange={(c) => toggleBranch(b.id, c === true)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Label
                          htmlFor={`stock-branch-${b.id}`}
                          className="text-sm cursor-pointer flex-1 flex items-center justify-between"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span>
                            {b.name}
                            {b.code ? (
                              <span className="text-gray-400"> ({b.code})</span>
                            ) : null}
                          </span>
                          {current !== undefined && (
                            <span
                              className={`text-xs ml-2 ${
                                current > 0 ? "text-emerald-600" : "text-gray-400"
                              }`}
                            >
                              {current}
                            </span>
                          )}
                        </Label>
                      </div>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {selectedBranches.length > 0 && (
            <div>
              <Label>{stockLabel}</Label>
              <div className="border rounded-lg divide-y mt-1">
                {selectedBranches.map((b) => {
                  const current = currentBranchStocks?.[b.id]
                  const key = qtyRawKey(b.id)
                  return (
                    <div key={b.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{b.name}</p>
                        {current !== undefined && (
                          <p className="text-xs text-gray-500">
                            Current: <span className="font-semibold text-gray-700">{current}</span>
                          </p>
                        )}
                      </div>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={
                          rawNumberInputs[key] !== undefined
                            ? rawNumberInputs[key]
                            : stockQtyByBranch[b.id]
                              ? String(stockQtyByBranch[b.id])
                              : ""
                        }
                        onChange={(e) => setQty(b.id, e.target.value)}
                        onBlur={() => {
                          setRawNumberInputs((prev) => {
                            const next = { ...prev }
                            delete next[key]
                            return next
                          })
                        }}
                        placeholder="0"
                        className={`w-28 shrink-0 ${numberInputClass}`}
                      />
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Optional per branch — leave a quantity empty to skip that branch.
                Entering a number adds to that branch&apos;s existing stock.
              </p>
            </div>
          )}
        </div>
          )
        })()}
      </div>

      {/* Additional Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Additional Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormDropdown
            label="Supplier"
            htmlFor="supplier_id"
            value={formData.supplier_id || "none"}
            onValueChange={(value) => updateFormData("supplier_id", value === "none" ? "" : value)}
            placeholder="Select supplier"
            options={suppliers}
            allowNone
          />
          <FormDropdown
            label="Brand"
            htmlFor="brand_id"
            value={formData.brand_id || "none"}
            onValueChange={(value) => updateFormData("brand_id", value === "none" ? "" : value)}
            placeholder="Select brand"
            options={brands}
            allowNone
          />
          <FormDropdown
            label="Color"
            htmlFor="color_id"
            value={formData.color_id || "none"}
            onValueChange={(value) => updateFormData("color_id", value === "none" ? "" : value)}
            placeholder="Select color"
            options={colors}
            allowNone
          />
          <FormDropdown
            label="Size"
            htmlFor="size_id"
            value={formData.size_id || "none"}
            onValueChange={(value) => updateFormData("size_id", value === "none" ? "" : value)}
            placeholder="Select size"
            options={sizes}
            allowNone
          />
          <div>
            <Label htmlFor="collection">Collection</Label>
            <Input
              id="collection"
              value={formData.collection || ""}
              onChange={(e) => updateFormData("collection", e.target.value)}
              placeholder="e.g. Eid 2026, Winter Luxe, Bridal"
              maxLength={80}
            />
          </div>
        </div>
        {productId ? <ProductPriceHistory productId={productId} /> : null}
      </div>

      {/* Product Images */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Product Images</h3>
        <div className="space-y-2">
          {imagePreviews.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
              {imagePreviews.map((preview, index) => (
                <div key={index} className="relative group">
                  <img
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-24 object-cover rounded-lg border"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveImage(index)}
                    disabled={loading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div
            className="w-full h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon className="h-8 w-8 text-gray-400 mb-2" />
            <p className="text-sm text-gray-500">Click or drag to upload images</p>
            <p className="text-xs text-gray-400">PNG, JPG up to 5MB (max 10 images)</p>
          </div>
          <input
            ref={fileInputRef}
            id="images"
            type="file"
            multiple
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
            disabled={loading || imagePreviews.length >= 10}
          />
        </div>
      </div>

      {/* Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => updateFormData("is_active", checked)}
            />
            <Label htmlFor="is_active">Active</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="is_featured"
              checked={formData.is_featured}
              onCheckedChange={(checked) => updateFormData("is_featured", checked)}
            />
            <Label htmlFor="is_featured">Is Featured</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="display_on_website"
              checked={formData.display_on_website ?? true}
              onCheckedChange={(checked) => updateFormData("display_on_website", checked)}
            />
            <Label htmlFor="display_on_website" className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              Show on website
            </Label>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Turn off Show on website to keep the product on POS only (back inventory).
        </p>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button
          onClick={onSubmit}
          disabled={
            // SKU is no longer a UI field — the backend auto-generates it on
            // create. We only require the fields the user actually fills in.
            loading ||
            !formData.name ||
            !formData.unit_id ||
            !formData.category_id ||
            hasErrors
          }
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              {submitText}...
            </>
          ) : (
            submitText
          )}
        </Button>
      </div>
    </div>
  )
}

export default function Inventory() {
  const { toast } = useToast()

  // Global store data
  const {
    products: globalProducts,
    productsMeta,
    categories: globalCategories,
    categoriesLoading,
    productsLoading,
    fetchProducts,
    fetchCategories,
    refreshProducts,
    upsertProductFromApi,
    removeProductFromStore,
  } = usePosData()

  // Branch context — used for the optional "Add Stock" field in the product
  // form. Stock is per-branch, so we need to know which branch to write to.
  const { branches: posBranches, selectedBranchId } = usePosBranch()

  // Product cards are derived from the global store — single source of truth.
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(20)
  const [gotoPage, setGotoPage] = useState<string>("")

  // State for filters
  const [searchTerm, setSearchTerm] = useState("")
  // Sort dropdown — name A→Z / Z→A, stock low/high, price low/high, newest/oldest.
  const [sortBy, setSortBy] = useState<string>("name-asc")
  // Sentinel value for the "no filter" option in the category / subcategory
  // dropdowns. Must not collide with any real ID — using "all" alone broke
  // when a record happened to have id="all" and Radix Select treated two items
  // as selected at once ("All CategoriesAll" in the trigger).
  const [selectedCategory, setSelectedCategory] = useState("__all__")
  const [selectedSubcategory, setSelectedSubcategory] = useState("__all__")
  // Catalog quick filters: status / stock health / featured
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "ACTIVE" | "INACTIVE" | "OUT" | "LOW" | "FEATURED" | "HIDDEN_WEB"
  >("ALL")
  const [viewMode, setViewMode] = useState<"table" | "grid">("table")

  // State for dropdown options (these will be loaded from global store)
  const [units, setUnits] = useState<DropdownOption[]>([])
  const [taxes, setTaxes] = useState<DropdownOption[]>([])
  const [subcategories, setSubcategories] = useState<DropdownOption[]>([])
  const [suppliers, setSuppliers] = useState<DropdownOption[]>([])
  const [brands, setBrands] = useState<DropdownOption[]>([])
  const [colors, setColors] = useState<DropdownOption[]>([])
  const [sizes, setSizes] = useState<DropdownOption[]>([])

  // State for form
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  // Delete-confirmation modal state. We track the product directly (so we can
  // show its name in the dialog) and a separate `isDeleting` flag so the
  // confirm button can show a spinner while the API call is in flight.
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [isDeletingProduct, setIsDeletingProduct] = useState(false)
  const [toggleStatusProductId, setToggleStatusProductId] = useState<string | null>(null)

  // "Add Stock" companion fields — sit alongside the product form. Stock is
  // a separate table row keyed by (product, branch), so we keep it outside
  // ProductFormData and call POST /stock after the product save succeeds.
  // Multi-branch: each selected branch gets its own quantity, keyed by
  // branch_id, so different branches can be stocked with different amounts
  // in a single submit.
  const [stockQtyByBranch, setStockQtyByBranch] = useState<Record<string, number>>({})
  const [stockBranchIds, setStockBranchIds] = useState<string[]>([])
  // Per-branch current stock for the product being edited, keyed by branch_id.
  // Populated from GET /products/:id so the user can see what's already there
  // (and decide whether to top it up). Resets to {} for Add Product.
  const [currentBranchStocks, setCurrentBranchStocks] = useState<
    Record<string, number>
  >({})

  // Tracks the GET /products/:id call fired from openEditDialog. While true,
  // the Edit dialog renders a skeleton instead of the half-populated form so
  // the user never sees fields blink from empty → filled.
  const [isLoadingEditProduct, setIsLoadingEditProduct] = useState(false)
  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    unit_id: "",
    sku: "",
    purchase_rate: 0,
    sales_rate_exc_dis_and_tax: 0,
    sales_rate_inc_dis_and_tax: 0,
    category_id: "",
    is_active: true,
    display_on_pos: true,
    display_on_website: true,
    is_batch: false,
    auto_fill_on_demand_sheet: false,
    non_inventory_item: false,
    is_deal: false,
    is_featured: false,
    images: [],
  })
  const [productBarcodeMode, setProductBarcodeMode] = useState<LabelBarcodeMode>("auto")
  const [formLoading, setFormLoading] = useState(false)
  const [formErrors, setFormErrors] = useState<{ sku?: string; pct_or_hs_code?: string }>({})
  const [dropdownsLoading, setDropdownsLoading] = useState(false)
  const [dropdownsLoadError, setDropdownsLoadError] = useState<string | null>(null)
  const dropdownLoadIdRef = useRef(0)
  const [imagePreviews, setImagePreviews] = useState<string[]>([])     // URLs for display (all are Cloudinary URLs)
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]) // URLs to send in PATCH/POST
  const fileInputRef = useRef<HTMLInputElement>(null)

  const categoryOptions = useMemo(
    () => globalCategories.filter((category) => category.id !== "all"),
    [globalCategories],
  )

  const isFormDropdownsLoading = dropdownsLoading || categoriesLoading

  // API Service Functions
  const apiService = {
    // Dropdown data fetchers.
    // We request a high `limit` so the full reference list is returned in
    // one shot. Without this, the backend defaults to limit=10 — meaning the
    // 11th supplier/brand/color/size never reaches the Edit form, the
    // <Select> value can't find a matching <SelectItem>, and the trigger
    // falls back to the "Select X" placeholder even though the product has
    // a value set.
    async getUnits() {
      const response = await apiClient.get("/units", { params: { limit: 100 } })
      return response.data
    },

    async getTaxes() {
      const response = await apiClient.get("/taxes", { params: { limit: 100 } })
      return response.data
    },

    async getSubcategories() {
      const response = await apiClient.get("/subcategories", { params: { limit: 100 } })
      return response.data
    },

    async getSuppliers() {
      const response = await apiClient.get("/suppliers", {
        params: { page: 1, limit: 100 },
      })
      return response.data
    },

    async getBrands() {
      const response = await apiClient.get("/brands", { params: { limit: 100 } })
      return response.data
    },

    async getColors() {
      const response = await apiClient.get("/colors", { params: { limit: 100 } })
      return response.data
    },

    async getSizes() {
      const response = await apiClient.get("/sizes", { params: { limit: 100 } })
      return response.data
    },

    // Product operations
    async getProducts(params?: {
      page?: number
      limit?: number
      search?: string
      category_id?: string
      subcategory_id?: string
      is_active?: boolean
      display_on_pos?: boolean
      display_on_website?: boolean
    }) {
      const response = await apiClient.get("/products", { params })
      return response.data
    },

    /**
     * Upload a single image file to Cloudinary via backend. Returns the URL.
     */
    async uploadImage(file: File): Promise<string> {
      const fd = new FormData()
      fd.append("image", file)
      const response = await apiClient.post("/products/upload-image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000, // 60s per image
      })
      return response.data.data.url
    },

    async createProduct(productData: ProductFormData, imageUrls: string[]) {
      const { images, ...dataWithoutImages } = productData
      const response = await apiClient.post("/products", {
        ...dataWithoutImages,
        image_urls: imageUrls,
      })
      return response.data
    },

    async updateProduct(id: string, productData: any, imageUrls: string[]) {
      const { images, ...dataWithoutImages } = productData
      const response = await apiClient.patch(`/products/${id}`, {
        ...dataWithoutImages,
        existing_images: imageUrls,
      })
      return response.data
    },

    async toggleProductStatus(id: string) {
      const response = await apiClient.patch(`/products/${id}/toggle-status`)
      return response.data
    },

    async deleteProduct(id: string) {
      const response = await apiClient.delete(`/products/${id}`)
      return response.data
    },

    async addStock(productId: string, branchId: string, quantity: number) {
      // POST /stock upserts: existing stock row for (product, branch) gets
      // `quantity` ADDED; if no row exists yet, one is created with that
      // quantity. Always logs a stock-movement of type PURCHASE.
      const response = await apiClient.post("/stock", {
        productId,
        branchId,
        quantity,
      })
      return response.data
    },

    async getProductById(id: string) {
      const response = await apiClient.get(`/products/${id}`, {
        params: { _t: Date.now() },
      })
      return response.data
    },
  }

  const loadDropdownData = useCallback(async () => {
    const loadId = ++dropdownLoadIdRef.current
    setDropdownsLoading(true)
    setDropdownsLoadError(null)

    try {
      const [
        unitsData,
        taxesData,
        subcategoriesData,
        suppliersData,
        brandsData,
        colorsData,
        sizesData,
      ] = await Promise.all([
        apiClient.get("/units", { params: { limit: 100 } }),
        apiClient.get("/taxes", { params: { limit: 100 } }),
        apiClient.get("/subcategories", { params: { limit: 100 } }),
        apiClient.get("/suppliers", { params: { page: 1, limit: 100 } }),
        apiClient.get("/brands", { params: { limit: 100 } }),
        apiClient.get("/colors", { params: { limit: 100 } }),
        apiClient.get("/sizes", { params: { limit: 100 } }),
        fetchCategories(true),
      ])

      if (loadId !== dropdownLoadIdRef.current) return

      setUnits(unitsData.data?.data || unitsData.data || [])
      setTaxes(taxesData.data?.data || taxesData.data || [])
      setSubcategories(subcategoriesData.data?.data || subcategoriesData.data || [])
      setSuppliers(suppliersData.data?.data || suppliersData.data || [])
      setBrands(brandsData.data?.data || brandsData.data || [])
      setColors(colorsData.data?.data || colorsData.data || [])
      setSizes(sizesData.data?.data || sizesData.data || [])
    } catch (error) {
      if (loadId !== dropdownLoadIdRef.current) return

      console.log("Failed to load dropdown data:", error)
      setDropdownsLoadError("Failed to load form options. Please try again.")
      toast({
        title: "Error",
        description: "Failed to load dropdown data",
        variant: "destructive",
      })
    } finally {
      if (loadId === dropdownLoadIdRef.current) {
        setDropdownsLoading(false)
      }
    }
  }, [fetchCategories, toast])

  // Preload dropdown data on mount so the first modal open is faster.
  useEffect(() => {
    loadDropdownData()
  }, [loadDropdownData])

  useEffect(() => {
    const delay = searchTerm.trim() ? 300 : 0
    const timer = window.setTimeout(() => {
      const limit = Math.min(Math.max(pageSize || 20, 1), 100)
      fetchProducts({
        force: true,
        page: currentPage,
        limit,
        search: searchTerm.trim() || undefined,
        categoryId: selectedCategory !== "__all__" ? selectedCategory : undefined,
        subcategoryId: selectedSubcategory !== "__all__" ? selectedSubcategory : undefined,
        isActive:
          statusFilter === "ACTIVE" ? true : statusFilter === "INACTIVE" ? false : undefined,
        isFeatured: statusFilter === "FEATURED" ? true : undefined,
        displayOnWebsite: statusFilter === "HIDDEN_WEB" ? false : undefined,
        stockStatus: statusFilter === "OUT" ? "out" : statusFilter === "LOW" ? "low" : undefined,
      }).catch(() => undefined)
    }, delay)

    return () => window.clearTimeout(timer)
  }, [
    fetchProducts,
    currentPage,
    pageSize,
    searchTerm,
    selectedCategory,
    selectedSubcategory,
    statusFilter,
  ])

  // Seed the stock branch selection from the user's current POS branch the
  // first time we know it. Don't clobber an explicit user pick afterwards.
  useEffect(() => {
    if (stockBranchIds.length === 0 && selectedBranchId) {
      setStockBranchIds([selectedBranchId])
    }
  }, [selectedBranchId, stockBranchIds.length])

  const filteredProductsAll = useMemo(() => {
    const filtered = [...globalProducts]
    const nameOf = (p: any) => String(p?.name || "").toLowerCase()
    const stockOf = (p: any) => Number(p?.available_stock ?? p?.current_stock ?? p?.stock ?? 0)
    const priceOf = (p: any) => Number(p?.sales_rate_exc_dis_and_tax ?? 0)
    const createdOf = (p: any) => new Date(p?.created_at || 0).getTime()

    switch (sortBy) {
      case "name-asc":
        filtered.sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
        break
      case "name-desc":
        filtered.sort((a, b) => nameOf(b).localeCompare(nameOf(a)))
        break
      case "stock-asc":
        filtered.sort((a, b) => stockOf(a) - stockOf(b))
        break
      case "stock-desc":
        filtered.sort((a, b) => stockOf(b) - stockOf(a))
        break
      case "price-asc":
        filtered.sort((a, b) => priceOf(a) - priceOf(b))
        break
      case "price-desc":
        filtered.sort((a, b) => priceOf(b) - priceOf(a))
        break
      case "newest":
        filtered.sort((a, b) => createdOf(b) - createdOf(a))
        break
      case "oldest":
        filtered.sort((a, b) => createdOf(a) - createdOf(b))
        break
    }

    return filtered
  }, [globalProducts, sortBy])

  const hasActiveFilters =
    searchTerm.trim() !== "" ||
    selectedCategory !== "__all__" ||
    selectedSubcategory !== "__all__" ||
    statusFilter !== "ALL"

  // "Loading" = a fetch is in flight, or none has completed yet (no meta), and
  // we still have nothing to show. Prevents the counts/stats flashing 0 before
  // the first response lands.
  const isCatalogLoading =
    (productsLoading || !productsMeta) && globalProducts.length === 0

  const catalogStats = useMemo(() => {
    let active = 0
    let featured = 0
    let hiddenOnWeb = 0
    let inactive = 0
    let outOfStock = 0
    let lowStock = 0

    for (const product of globalProducts) {
      if (product.is_active) active += 1
      else inactive += 1
      if (product.is_featured) featured += 1
      if (product.display_on_website === false) hiddenOnWeb += 1
      const stock = Number(
        product.available_stock ?? product.current_stock ?? product.stock ?? 0,
      )
      const min = Number(product.minimum_stock ?? product.min_qty ?? 0)
      if (stock <= 0) outOfStock += 1
      else if (min > 0 && stock <= min) lowStock += 1
    }

    return {
      total: productsMeta?.total ?? globalProducts.length,
      active,
      inactive,
      featured,
      hiddenOnWeb,
      outOfStock,
      lowStock,
    }
  }, [globalProducts, productsMeta])

  const subcategoryFilterOptions = useMemo(() => {
    return subcategories
      .filter((sub) => {
        if (!sub.id || !sub.name) return false
        if (String(sub.name).trim().toLowerCase() === "unknown") return false
        if (
          selectedCategory !== "__all__" &&
          sub.category_id &&
          sub.category_id !== selectedCategory
        ) {
          return false
        }
        return true
      })
      .map((sub) => ({ id: sub.id, name: sub.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [subcategories, selectedCategory])

  const filteredProductCount = productsMeta?.total ?? filteredProductsAll.length

  const products = useMemo(
    () => filteredProductsAll.map(mapStoreProductToCard),
    [filteredProductsAll],
  )

  const syncProductInStore = async (productId: string, imageUrls?: string[]) => {
    const detail = await apiService.getProductById(productId)
    const fresh = detail?.data ?? detail
    if (!fresh?.id) return

    upsertProductFromApi({
      ...fresh,
      ...(imageUrls?.length
        ? { ProductImage: imageUrls.map((url) => ({ image: url })) }
        : {}),
    })
  }

  const applyProductPatchToStore = (patchPayload: any, imageUrls: string[]) => {
    if (!patchPayload?.id) return

    upsertProductFromApi({
      ...patchPayload,
      ProductImage: imageUrls.map((url) => ({ image: url })),
      updated_at: patchPayload.updated_at || new Date().toISOString(),
    })
  }

  const handleCreateProduct = async () => {
    setFormLoading(true)
    try {
      const dataToSubmit = {
        ...formData,
        sku: String(formData.sku),
        label_barcode:
          productBarcodeMode === "manual"
            ? sanitizeManualBarcodeValue(formData.label_barcode || "") || undefined
            : undefined,
        pct_or_hs_code: formData.pct_or_hs_code ? String(formData.pct_or_hs_code) : undefined,
      }

      // Images are already uploaded — existingImageUrls has all Cloudinary URLs
      const created = await apiService.createProduct(dataToSubmit, existingImageUrls)
      const createdId = created?.data?.id as string | undefined

      // If the user entered a per-branch stock quantity, write it to that
      // branch — each branch can carry a different quantity. Run them in
      // parallel so saving to N branches is no slower than saving to one.
      // Failures here are surfaced separately so a stock-write hiccup
      // doesn't make the user think the product itself failed to save.
      const branchesToStock = stockBranchIds.filter(
        (bid) => (stockQtyByBranch[bid] ?? 0) > 0,
      )
      if (createdId && branchesToStock.length > 0) {
        const results = await Promise.allSettled(
          branchesToStock.map((bid) =>
            apiService.addStock(createdId, bid, stockQtyByBranch[bid]),
          ),
        )
        const failed = results.filter((r) => r.status === "rejected").length
        if (failed > 0) {
          toast({
            title: "Product saved, but some stock writes failed",
            description: `${failed} of ${branchesToStock.length} branch stock writes failed. Try again from the Stock page.`,
            variant: "destructive",
          })
        }
      }

      toast({
        title: "Success",
        description: "Product created successfully",
      })

      setIsAddDialogOpen(false)
      resetForm()
      if (createdId) {
        await syncProductInStore(createdId)
      } else {
        await refreshProducts()
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create product",
        variant: "destructive",
      })
    } finally {
      setFormLoading(false)
    }
  }

  const handleUpdateProduct = async () => {
    if (!editingProduct) return

    setFormLoading(true)
    try {
      const dataToSubmit = {
        ...formData,
        sku: String(formData.sku),
        label_barcode:
          productBarcodeMode === "manual"
            ? sanitizeManualBarcodeValue(formData.label_barcode || "") || null
            : null,
        custom_code: null,
        pct_or_hs_code: formData.pct_or_hs_code ? String(formData.pct_or_hs_code) : undefined,
      }
      // All images are already Cloudinary URLs — no base64, no large payload
      const updateResponse = await apiService.updateProduct(
        editingProduct.id,
        dataToSubmit,
        existingImageUrls,
      )
      const patchPayload = updateResponse?.data ?? updateResponse
      applyProductPatchToStore(patchPayload, existingImageUrls)

      // Edit-time stock entry is additive (matches POST /stock semantics —
      // a positive number is added to existing branch stock and a
      // stock-movement of type PURCHASE is logged). Each branch can carry a
      // different quantity; fan out across the selected branches in parallel.
      const branchesToStock = stockBranchIds.filter(
        (bid) => (stockQtyByBranch[bid] ?? 0) > 0,
      )
      if (branchesToStock.length > 0) {
        const results = await Promise.allSettled(
          branchesToStock.map((bid) =>
            apiService.addStock(editingProduct.id, bid, stockQtyByBranch[bid]),
          ),
        )
        const failed = results.filter((r) => r.status === "rejected").length
        if (failed > 0) {
          toast({
            title: "Product updated, but some stock writes failed",
            description: `${failed} of ${branchesToStock.length} branch stock writes failed. Try again from the Stock page.`,
            variant: "destructive",
          })
        }
      }

      const updatedProductId = editingProduct.id

      toast({
        title: "Success",
        description: "Product updated successfully",
      })

      setIsEditDialogOpen(false)
      setEditingProduct(null)
      resetForm()

      if (branchesToStock.length > 0) {
        await syncProductInStore(updatedProductId, existingImageUrls)
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update product",
        variant: "destructive",
      })
    } finally {
      setFormLoading(false)
    }
  }

  const handleToggleStatus = async (product: Product) => {
    if (toggleStatusProductId) return

    setToggleStatusProductId(product.id)
    try {
      await apiService.toggleProductStatus(product.id)
      await syncProductInStore(product.id)
      toast({
        title: "Success",
        description: `Product ${product.is_active ? "disabled" : "enabled"} successfully`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update product status",
        variant: "destructive",
      })
    } finally {
      setToggleStatusProductId(null)
    }
  }

  // Called by the AlertDialog's confirm button. The dialog stays open and
  // shows a spinner on the confirm button while the request runs so the user
  // never wonders whether the click registered.
  const confirmDeleteProduct = async () => {
    if (!productToDelete || isDeletingProduct) return
    const product = productToDelete
    setIsDeletingProduct(true)
    try {
      // Wait for the API delete AND the global cache refresh before closing
      // the modal. Closing earlier let the user open a second delete dialog
      // while the first request was still in flight, which both raced the
      // refresh and made it look like the first delete hadn't applied.
      await apiService.deleteProduct(product.id)
      removeProductFromStore(product.id)
      toast({
        title: "Deleted",
        description: `"${product.name}" has been removed.`,
      })
      setProductToDelete(null)
    } catch (error: any) {
      // The backend returns `{ message, errors: [{ message, code }] }`. The
      // top-level `message` is the category ("Cannot delete: …") and the
      // inner one is the detailed reason. Prefer whichever is more specific
      // so the user sees the real cause (e.g. FK violation table) instead of
      // a generic wrapper.
      const data = error?.response?.data
      const description =
        data?.errors?.[0]?.message ||
        data?.message ||
        error?.message ||
        "Failed to delete product"
      toast({
        title: data?.message || "Failed to delete",
        description,
        variant: "destructive",
      })
    } finally {
      setIsDeletingProduct(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      unit_id: "",
      sku: "",
      purchase_rate: 0,
      sales_rate_exc_dis_and_tax: 0,
      sales_rate_inc_dis_and_tax: 0,
      category_id: "",
      is_active: true,
      display_on_pos: true,
      display_on_website: true,
      is_batch: false,
      auto_fill_on_demand_sheet: false,
      non_inventory_item: false,
      is_deal: false,
      is_featured: false,
      images: [],
    })
    setImagePreviews([])
    setExistingImageUrls([])
    setStockQtyByBranch({})
    // Default every branch checked for a fresh Add dialog — a new product
    // generally belongs everywhere, and the user can uncheck branches that
    // don't apply. Quantity per branch is left blank (opt-in per branch).
    setStockBranchIds(posBranches.map((b) => b.id))
    setCurrentBranchStocks({})
    setProductBarcodeMode("auto")
  }

  const closeProductForm = () => {
    resetForm()
    setEditingProduct(null)
    setIsAddDialogOpen(false)
    setIsEditDialogOpen(false)
  }

  const openEditDialog = async (product: Product) => {
    // Open the modal in a "loading" state — we DON'T show the form until the
    // canonical record arrives, so the user never sees fields flash from
    // empty/"Unknown" to their real values.
    setEditingProduct(product)
    setIsEditDialogOpen(true)
    setIsLoadingEditProduct(true)
    setStockQtyByBranch({})
    loadDropdownData()

    const toNum = (v: any): number => {
      if (v === null || v === undefined || v === "") return 0
      const n = typeof v === "string" ? parseFloat(v) : Number(v)
      return Number.isFinite(n) ? n : 0
    }

    try {
      const detail = await apiService.getProductById(product.id)
      const fresh = detail?.data ?? detail
      if (!fresh) throw new Error("Empty product detail response")

      const existingUrls: string[] =
        fresh.ProductImage?.map((img: any) => img.image) ||
        (Array.isArray(fresh.images)
          ? fresh.images.map((img: any) => (typeof img === "string" ? img : img.image))
          : []) ||
        []

      const savedBarcode = (fresh.label_barcode ?? fresh.custom_code ?? "").trim()
      setProductBarcodeMode(savedBarcode ? "manual" : "auto")
      setFormData({
        name: fresh.name ?? "",
        unit_id: fresh.unit?.id ?? "",
        label_barcode: fresh.label_barcode ?? fresh.custom_code ?? "",
        pct_or_hs_code: fresh.pct_or_hs_code ?? "",
        description: fresh.description ?? "",
        sku: fresh.sku ?? product.sku,
        purchase_rate: toNum(fresh.purchase_rate),
        sales_rate_exc_dis_and_tax: toNum(fresh.sales_rate_exc_dis_and_tax),
        sales_rate_inc_dis_and_tax: toNum(fresh.sales_rate_inc_dis_and_tax),
        discount_amount: toNum(fresh.discount_amount),
        tax_id: fresh.tax?.id ?? "",
        category_id: fresh.category?.id ?? "",
        subcategory_id: fresh.subcategory?.id ?? "",
        min_qty: toNum(fresh.min_qty),
        max_qty: toNum(fresh.max_qty),
        supplier_id: fresh.supplier?.id ?? "",
        brand_id: fresh.brand?.id ?? "",
        color_id: fresh.color?.id ?? "",
        size_id: fresh.size?.id ?? "",
        collection: fresh.collection ?? "",
        is_active: fresh.is_active ?? true,
        display_on_pos: fresh.display_on_pos ?? true,
        display_on_website: fresh.display_on_website ?? true,
        is_batch: fresh.is_batch ?? false,
        auto_fill_on_demand_sheet: fresh.auto_fill_on_demand_sheet ?? false,
        non_inventory_item: fresh.non_inventory_item ?? false,
        is_deal: fresh.is_deal ?? false,
        is_featured: fresh.is_featured ?? false,
        images: existingUrls,
      })

      if (fresh.supplier?.id && fresh.supplier?.name) {
        setSuppliers((prev) =>
          prev.some((item) => item.id === fresh.supplier.id)
            ? prev
            : [...prev, { id: fresh.supplier.id, name: fresh.supplier.name }]
        )
      }
      setImagePreviews(existingUrls)
      setExistingImageUrls(existingUrls)

      // Build a per-branch current-stock map so the Branches popover can
      // display "Current: N" beside each option. Backend may return
      // current_quantity as a Decimal-string; coerce to number.
      const branchStockMap: Record<string, number> = {}
      if (Array.isArray(fresh.stock)) {
        for (const s of fresh.stock) {
          if (!s?.branch_id) continue
          const cur = toNum(s.current_quantity)
          const res = toNum(s.reserved_quantity)
          branchStockMap[s.branch_id] = cur - res // available
        }
      }
      setCurrentBranchStocks(branchStockMap)

      // Pre-select branches this product already has stock in (any quantity,
      // including 0). Falls back to the user's current POS branch when this
      // product has no stock rows yet.
      const stockBranches: string[] = Object.keys(branchStockMap)
      if (stockBranches.length > 0) {
        setStockBranchIds(Array.from(new Set(stockBranches)))
      } else if (selectedBranchId) {
        setStockBranchIds([selectedBranchId])
      } else {
        setStockBranchIds([])
      }
    } catch {
      // Hard-fail: close the modal and tell the user. Showing a half-filled
      // form would be worse — they'd save partial data and overwrite the real
      // record.
      setIsEditDialogOpen(false)
      setEditingProduct(null)
      toast({
        title: "Couldn't load product",
        description: "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoadingEditProduct(false)
    }
  }

  const updateFormData = (field: keyof ProductFormData, value: any) => {
    // Functional setState so two consecutive updates in the same tick (e.g.
    // mirroring a single Sales Rate into both DB columns) compose correctly
    // instead of the second call clobbering the first via stale closure.
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return

    setFormLoading(true)
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast({ title: "Error", description: `${file.name} is not an image.`, variant: "destructive" })
          continue
        }
        if (file.size > 5 * 1024 * 1024) {
          toast({ title: "Error", description: `Image ${file.name} is larger than 5MB.`, variant: "destructive" })
          continue
        }

        // Compress the image
        const compressed = await compressImage(file)

        // Upload immediately to Cloudinary via backend — returns a URL
        const url = await apiService.uploadImage(compressed)

        // Store the Cloudinary URL (not base64)
        setImagePreviews((prev) => [...prev, url])
        setExistingImageUrls((prev) => [...prev, url])
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to upload image.", variant: "destructive" })
    } finally {
      setFormLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleRemoveImage = (index: number) => {
    const removedUrl = imagePreviews[index]
    setExistingImageUrls((prev) => prev.filter((url) => url !== removedUrl))
    setImagePreviews((prev) => prev.filter((_, i) => i !== index))
  }

  const totalPages = Math.max(1, productsMeta?.totalPages ?? 1)

  const clearCatalogFilters = () => {
    setSearchTerm("")
    setSelectedCategory("__all__")
    setSelectedSubcategory("__all__")
    setStatusFilter("ALL")
    setCurrentPage(1)
  }

  const statusChips: {
    key: "ALL" | "ACTIVE" | "INACTIVE" | "OUT" | "LOW" | "FEATURED" | "HIDDEN_WEB"
    label: string
    count: number
  }[] = [
    { key: "ALL", label: "All", count: catalogStats.total },
    { key: "ACTIVE", label: "Active", count: catalogStats.active },
    { key: "INACTIVE", label: "Inactive", count: catalogStats.inactive },
    { key: "OUT", label: "Out of stock", count: catalogStats.outOfStock },
    { key: "LOW", label: "Low stock", count: catalogStats.lowStock },
    { key: "FEATURED", label: "Featured", count: catalogStats.featured },
    { key: "HIDDEN_WEB", label: "Hidden on web", count: catalogStats.hiddenOnWeb },
  ]

  const renderProductActions = (product: Product) => (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs"
        onClick={() => openEditDialog(product)}
      >
        <Edit className="mr-1.5 h-3.5 w-3.5" />
        Edit
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={cn(
          "h-8 text-xs min-w-[72px]",
          product.is_active
            ? "text-amber-700 hover:bg-amber-50 hover:text-amber-800"
            : "text-green-700 hover:bg-green-50 hover:text-green-800",
        )}
        onClick={() => handleToggleStatus(product)}
        disabled={toggleStatusProductId === product.id}
      >
        {toggleStatusProductId === product.id ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : product.is_active ? (
          "Disable"
        ) : (
          "Enable"
        )}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
        onClick={() => setProductToDelete(product)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )

  const ProductTableSkeleton = () => (
    <div className="space-y-2 p-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
      ))}
    </div>
  )

  const ProductGridSkeleton = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 p-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-xl border border-gray-200 bg-white p-4"
        >
          <div className="aspect-[4/3] rounded-lg bg-gray-100" />
          <div className="mt-4 h-4 rounded bg-gray-100" />
          <div className="mt-2 h-3 w-2/3 rounded bg-gray-100" />
          <div className="mt-4 h-16 rounded-lg bg-gray-100" />
        </div>
      ))}
    </div>
  )

  if (isAddDialogOpen || isEditDialogOpen) {
    const isEdit = isEditDialogOpen
    const formBusy = (isEdit && isLoadingEditProduct) || isFormDropdownsLoading
    return (
      <div className="p-4 md:p-6 space-y-4 min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between pb-3 border-b">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isEdit ? "Edit product" : "Add product"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isEdit ? "Update catalog details and branch stock." : "Create a product, then return to the catalog."}
            </p>
          </div>
          <Button variant="outline" onClick={closeProductForm} disabled={formLoading}>
            Cancel
          </Button>
        </div>
        {formBusy ? (
          <ProductFormSkeleton
            message={isLoadingEditProduct ? "Loading product details…" : "Preparing form…"}
          />
        ) : dropdownsLoadError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Could not load form options</AlertTitle>
            <AlertDescription className="mt-3 flex flex-col items-start gap-3">
              <span>{dropdownsLoadError}</span>
              <Button type="button" variant="outline" size="sm" onClick={loadDropdownData}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <ProductForm
            onSubmit={isEdit ? handleUpdateProduct : handleCreateProduct}
            loading={formLoading}
            submitText={isEdit ? "Update Product" : "Create Product"}
            formData={formData}
            formErrors={formErrors}
            updateFormData={updateFormData}
            units={units}
            categories={categoryOptions}
            subcategories={subcategories}
            taxes={taxes}
            suppliers={suppliers}
            brands={brands}
            colors={colors}
            sizes={sizes}
            imagePreviews={imagePreviews}
            handleRemoveImage={handleRemoveImage}
            fileInputRef={fileInputRef}
            handleImageSelect={handleImageSelect}
            stockQtyByBranch={stockQtyByBranch}
            setStockQtyByBranch={setStockQtyByBranch}
            stockBranchIds={stockBranchIds}
            setStockBranchIds={setStockBranchIds}
            branchOptions={posBranches}
            stockLabel={isEdit ? "Add Stock" : "Initial Stock"}
            productId={isEdit ? editingProduct?.id : undefined}
            productInternalCode={isEdit ? editingProduct?.code : undefined}
            barcodeMode={productBarcodeMode}
            setBarcodeMode={setProductBarcodeMode}
            currentBranchStocks={currentBranchStocks}
          />
        )}
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-5 min-w-0">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between pb-1 border-b border-gray-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Package className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              Catalog
            </span>
          </div>
          <h1 className="text-2xl md:text-[1.75rem] font-bold text-gray-900 tracking-tight leading-none">
            Product Management
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Browse, edit, and manage your product catalog
            {productsLoading ? (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-gray-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Syncing...
              </span>
            ) : null}
          </p>
        </div>

        <Button
          className="self-start sm:self-auto bg-gray-900 hover:bg-gray-800"
          onClick={() => {
            resetForm()
            setEditingProduct(null)
            loadDropdownData()
            setIsAddDialogOpen(true)
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Product
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isCatalogLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => { setStatusFilter("ALL"); setCurrentPage(1) }}
              className={cn(
                "rounded-xl border bg-white p-3.5 text-left shadow-sm transition-colors hover:border-blue-300",
                statusFilter === "ALL" ? "border-blue-300 ring-1 ring-blue-100" : "border-gray-200",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-gray-600">Total Products</p>
                <Package className="h-3.5 w-3.5 text-gray-400" />
              </div>
              <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">{catalogStats.total}</p>
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter("ACTIVE"); setCurrentPage(1) }}
              className={cn(
                "rounded-xl border p-3.5 text-left shadow-sm transition-colors hover:border-emerald-300",
                statusFilter === "ACTIVE"
                  ? "border-emerald-300 bg-emerald-50/50 ring-1 ring-emerald-100"
                  : "border-emerald-200/80 bg-emerald-50/30",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-gray-600">Active</p>
                <PackageCheck className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <p className="text-2xl font-semibold text-emerald-700 mt-1 tabular-nums">{catalogStats.active}</p>
              <p className="text-[10px] text-gray-500 mt-1">{catalogStats.inactive} inactive</p>
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter("OUT"); setCurrentPage(1) }}
              className={cn(
                "rounded-xl border p-3.5 text-left shadow-sm transition-colors hover:border-red-300",
                statusFilter === "OUT"
                  ? "border-red-300 bg-red-50/50 ring-1 ring-red-100"
                  : "border-red-200/80 bg-red-50/30",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-gray-600">Out of Stock</p>
                <PackageX className="h-3.5 w-3.5 text-red-500" />
              </div>
              <p className="text-2xl font-semibold text-red-700 mt-1 tabular-nums">{catalogStats.outOfStock}</p>
              <p className="text-[10px] text-gray-500 mt-1">{catalogStats.lowStock} low stock</p>
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter("FEATURED"); setCurrentPage(1) }}
              className={cn(
                "rounded-xl border p-3.5 text-left shadow-sm transition-colors hover:border-blue-300",
                statusFilter === "FEATURED"
                  ? "border-blue-300 bg-blue-50/50 ring-1 ring-blue-100"
                  : "border-blue-200/80 bg-blue-50/30",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-gray-600">Featured</p>
                <Star className="h-3.5 w-3.5 text-blue-500" />
              </div>
              <p className="text-2xl font-semibold text-blue-700 mt-1 tabular-nums">{catalogStats.featured}</p>
            </button>
          </>
        )}
      </div>

      {/* Filters — sticky on phones so search stays above the keyboard */}
      <div className="sticky top-14 z-20 -mx-4 space-y-3 border-b border-gray-200 bg-gray-50/95 px-4 py-3 shadow-sm backdrop-blur-sm sm:top-16 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none lg:backdrop-blur-none">
      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3 shadow-sm">
        <div className="flex flex-wrap gap-1.5">
          {statusChips.map((chip) => {
            const active = statusFilter === chip.key
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => {
                  setStatusFilter(chip.key)
                  setCurrentPage(1)
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 h-8 text-xs font-semibold transition-colors",
                  active
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                )}
              >
                {chip.label}
                <span
                  className={cn(
                    "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] tabular-nums",
                    active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500",
                  )}
                >
                  {isCatalogLoading ? (
                    <span
                      className={cn(
                        "my-[3px] h-2 w-3 animate-pulse rounded-full",
                        active ? "bg-white/50" : "bg-gray-300",
                      )}
                    />
                  ) : (
                    chip.count
                  )}
                </span>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-2.5">
          <form
            className="relative min-w-0 sm:col-span-2"
            autoComplete="off"
            action=""
            onSubmit={(e) => {
              e.preventDefault()
              const input = e.currentTarget.querySelector("input")
              if (input instanceof HTMLInputElement) input.blur()
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="search"
              name="product-catalog-search"
              placeholder="Search name, SKU, code, category..."
              value={searchTerm}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="search"
              enterKeyHint="search"
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(1)
              }}
              className="h-10 pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden"
            />
            {searchTerm ? (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                onClick={() => {
                  setSearchTerm("")
                  setCurrentPage(1)
                }}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </form>
          <Select
            value={selectedCategory}
            onValueChange={(v) => {
              setSelectedCategory(v)
              setSelectedSubcategory("__all__")
              setCurrentPage(1)
            }}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Categories</SelectItem>
              {categoryOptions.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={selectedSubcategory}
            onValueChange={(v) => {
              setSelectedSubcategory(v)
              setCurrentPage(1)
            }}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="All Subcategories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Subcategories</SelectItem>
              {subcategoryFilterOptions.map((sub) => (
                <SelectItem key={sub.id} value={sub.id}>
                  {sub.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sortBy}
            onValueChange={(v) => {
              setSortBy(v)
              setCurrentPage(1)
            }}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">Name (A → Z)</SelectItem>
              <SelectItem value="name-desc">Name (Z → A)</SelectItem>
              <SelectItem value="stock-desc">Stock (High → Low)</SelectItem>
              <SelectItem value="stock-asc">Stock (Low → High)</SelectItem>
              <SelectItem value="price-desc">Price (High → Low)</SelectItem>
              <SelectItem value="price-asc">Price (Low → High)</SelectItem>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value))
              setCurrentPage(1)
            }}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Per page" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 per page</SelectItem>
              <SelectItem value="20">20 per page</SelectItem>
              <SelectItem value="50">50 per page</SelectItem>
              <SelectItem value="100">100 per page</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={clearCatalogFilters}>
              Clear filters
            </Button>
          </div>
        )}
      </div>
      </div>

      {/* Products */}
      <Card className="border border-gray-200 shadow-sm overflow-hidden">
        <CardHeader className="py-3 px-4 sm:px-5 border-b border-gray-100">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-gray-900">
                {isCatalogLoading ? "Products" : `Products (${filteredProductCount})`}
              </CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                {isCatalogLoading
                  ? "Loading catalog..."
                  : hasActiveFilters
                    ? `Showing ${filteredProductCount} of ${catalogStats.total}`
                    : "Edit, enable/disable, or delete products"}
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 self-start">
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
        </CardHeader>
        <CardContent className="p-0">
          {isCatalogLoading ? (
            viewMode === "table" ? <ProductTableSkeleton /> : <ProductGridSkeleton />
          ) : filteredProductCount === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                <Package className="h-7 w-7 text-gray-400" />
              </div>
              {hasActiveFilters ? (
                <>
                  <h3 className="mt-4 text-lg font-semibold text-gray-900">No matching products</h3>
                  <p className="mt-1 max-w-sm text-sm text-gray-500">
                    Nothing matches your current search or filters.
                  </p>
                  <Button type="button" variant="outline" size="sm" className="mt-4" onClick={clearCatalogFilters}>
                    Clear filters
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="mt-4 text-lg font-semibold text-gray-900">No products yet</h3>
                  <p className="mt-1 max-w-sm text-sm text-gray-500">
                    Your catalog is empty. Add your first product to get started.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              {viewMode === "table" ? (
                <>
                  <div className="hidden w-full lg:block">
                    <Table className="w-full table-fixed">
                      <TableHeader>
                        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                          <TableHead className="w-[30%] pl-4 pr-3 text-xs font-semibold text-gray-600">
                            Product
                          </TableHead>
                          <TableHead className="w-[14%] px-3 text-xs font-semibold text-gray-600">
                            Category
                          </TableHead>
                          <TableHead className="w-[10%] whitespace-nowrap px-3 text-right text-xs font-semibold text-gray-600">
                            Stock
                          </TableHead>
                          <TableHead className="w-[10%] px-3 text-right text-xs font-semibold text-gray-600">
                            Purchase
                          </TableHead>
                          <TableHead className="w-[10%] px-3 text-right text-xs font-semibold text-gray-600">
                            Sales
                          </TableHead>
                          <TableHead className="w-[10%] px-3 text-xs font-semibold text-gray-600">
                            Status
                          </TableHead>
                          <TableHead className="w-[16%] pl-3 pr-4 text-right text-xs font-semibold text-gray-600">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.map((product) => {
                          const stock = getProductStock(product)
                          const stockTone = getStockTone(product)
                          return (
                            <TableRow key={`${product.id}-${product.updated_at}`}>
                              <TableCell className="py-2.5 pl-4 pr-3">
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-slate-50">
                                    <ProductThumb product={product} iconClassName="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-gray-900">{product.name}</p>
                                    <ProductBarcodeSubline product={product} />
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {product.is_featured ? (
                                        <Badge className="h-5 bg-blue-600 text-[10px] hover:bg-blue-600">Featured</Badge>
                                      ) : null}
                                      {product.display_on_website === false ? (
                                        <Badge variant="outline" className="h-5 border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                                          Hidden on web
                                        </Badge>
                                      ) : null}
                                      <Badge variant="outline" className="h-5 text-[10px] text-gray-600">
                                        {product.unit?.name || "No unit"}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="px-3 py-2.5">
                                <p className="truncate text-sm text-gray-800">
                                  {product.category?.name || "Uncategorized"}
                                </p>
                                {product.subcategory?.name &&
                                product.subcategory.name.trim().toLowerCase() !== "unknown" ? (
                                  <p className="truncate text-[11px] text-gray-500">
                                    {product.subcategory.name}
                                  </p>
                                ) : null}
                              </TableCell>
                              <TableCell className="whitespace-nowrap px-3 py-2.5 text-right">
                                <p className={cn("text-sm font-semibold tabular-nums", stockTone.valueClassName)}>
                                  {formatStockQty(stock)}
                                </p>
                                <p className={cn("text-[11px] whitespace-nowrap", stockTone.valueClassName === "text-red-700" ? "text-red-500" : "text-gray-400")}>
                                  {stockTone.label}
                                </p>
                              </TableCell>
                              <TableCell className="whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums text-gray-800">
                                {formatRs(product.purchase_rate)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-blue-700">
                                {formatRs(product.sales_rate_exc_dis_and_tax)}
                              </TableCell>
                              <TableCell className="px-3 py-2.5">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[10px] font-semibold",
                                    product.is_active
                                      ? "border-green-200 bg-green-50 text-green-800"
                                      : "border-red-200 bg-red-50 text-red-800",
                                  )}
                                >
                                  {product.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-2.5 pl-3 pr-4 text-right">
                                <div className="flex justify-end">
                                  {renderProductActions(product)}
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="lg:hidden divide-y divide-gray-100">
                    {products.map((product) => {
                      const stock = getProductStock(product)
                      const stockTone = getStockTone(product)
                      return (
                        <div key={`${product.id}-${product.updated_at}`} className="p-4 space-y-3">
                          <div className="flex items-start gap-3">
                            <div className="h-14 w-14 rounded-lg overflow-hidden border border-gray-100 shrink-0 bg-slate-50">
                              <ProductThumb product={product} iconClassName="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold text-gray-900 line-clamp-2">{product.name}</p>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "shrink-0 text-[10px]",
                                    product.is_active
                                      ? "bg-green-50 text-green-800 border-green-200"
                                      : "bg-red-50 text-red-800 border-red-200",
                                  )}
                                >
                                  {product.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </div>
                              <ProductBarcodeSubline product={product} />
                              <p className="text-[11px] text-gray-500 mt-0.5">
                                {product.category?.name || "Uncategorized"}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                            <div>
                              <p className="text-[10px] uppercase text-gray-500 font-medium">Stock</p>
                              <p className={cn("text-sm font-bold tabular-nums", stockTone.valueClassName)}>
                                {formatStockQty(stock)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-gray-500 font-medium">Purchase</p>
                              <p className="text-sm font-semibold tabular-nums">{formatRs(product.purchase_rate)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-gray-500 font-medium">Sales</p>
                              <p className="text-sm font-semibold tabular-nums text-blue-700">
                                {formatRs(product.sales_rate_exc_dis_and_tax)}
                              </p>
                            </div>
                          </div>
                          {renderProductActions(product)}
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 p-4">
                  {products.map((product) => {
                    const stock = getProductStock(product)
                    const stockTone = getStockTone(product)
                    return (
                      <div
                        key={`${product.id}-${product.updated_at}`}
                        className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm hover:border-gray-300 hover:shadow-md transition-all"
                      >
                        <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
                          <ProductThumb
                            product={product}
                            className="transition-transform duration-300 group-hover:scale-105"
                            iconClassName="h-10 w-10"
                          />
                          <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
                            <Badge
                              variant="outline"
                              className={cn(
                                "border backdrop-blur-sm text-[10px]",
                                product.is_active
                                  ? "bg-green-100/95 text-green-800 border-green-200"
                                  : "bg-red-100/95 text-red-800 border-red-200",
                              )}
                            >
                              {product.is_active ? "Active" : "Inactive"}
                            </Badge>
                            {product.is_featured ? (
                              <Badge className="bg-blue-600 text-white hover:bg-blue-600 text-[10px]">
                                Featured
                              </Badge>
                            ) : null}
                            {product.display_on_website === false ? (
                              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px] border border-amber-200">
                                Hidden on web
                              </Badge>
                            ) : null}
                          </div>
                          <div className="absolute right-2 top-2">
                            <Badge variant="outline" className={cn("border backdrop-blur-sm text-[10px]", stockTone.className)}>
                              {stockTone.label}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex flex-1 flex-col p-3.5">
                          <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-gray-900">
                            {product.name}
                          </h3>
                          <ProductBarcodeSubline product={product} />
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <Badge variant="secondary" className="gap-1 bg-slate-100 text-slate-700 text-[10px]">
                              <Tag className="h-3 w-3" />
                              {product.category?.name || "Uncategorized"}
                            </Badge>
                            <Badge variant="outline" className="text-gray-600 text-[10px]">
                              {product.unit?.name || "No unit"}
                            </Badge>
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Stock</p>
                              <p className={cn("mt-0.5 text-sm font-bold tabular-nums", stockTone.valueClassName)}>
                                {formatStockQty(stock)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Purchase</p>
                              <p className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
                                {formatRs(product.purchase_rate)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Sales</p>
                              <p className="mt-0.5 text-sm font-semibold tabular-nums text-blue-700">
                                {formatRs(product.sales_rate_exc_dis_and_tax)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3">{renderProductActions(product)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {filteredProductCount > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100">
                  <p className="text-sm text-gray-600">
                    Showing {(currentPage - 1) * pageSize + 1}–
                    {Math.min(currentPage * pageSize, filteredProductCount)} of {filteredProductCount}
                  </p>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-sm"
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        disabled={currentPage === 1 || productsLoading}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-gray-700 px-2">
                        {currentPage} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-sm"
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        disabled={currentPage >= totalPages || productsLoading}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

        {/* Delete-confirmation modal. We don't allow closing while the API
            call is in flight, otherwise the user could fire it twice. */}
        <AlertDialog
          open={productToDelete !== null}
          onOpenChange={(open) => {
            if (!open && !isDeletingProduct) setProductToDelete(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete product</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete{" "}
                <span className="font-semibold text-gray-900">
                  &quot;{productToDelete?.name}&quot;
                </span>
                ? This action cannot be undone and will remove the product
                along with its stock and history.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingProduct}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  // Prevent the default close-on-click; we manage closing
                  // ourselves so the spinner stays visible until the API
                  // resolves.
                  e.preventDefault()
                  confirmDeleteProduct()
                }}
                disabled={isDeletingProduct}
                className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-600"
              >
                {isDeletingProduct ? (
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
    </div>
  )
}
