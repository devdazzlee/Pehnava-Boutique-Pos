"use client"

import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet"
import { PageHeader } from "@/components/ui/page-header"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Plus, Search, Eye, CheckCircle, XCircle, Loader2, Minus, X, ChevronLeft, ChevronRight, Printer, Download, MessageCircle, RotateCcw, DollarSign, CreditCard, ArrowLeftRight, Package, Filter } from "lucide-react"
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
  format,
} from "date-fns"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DatePicker } from "@/components/ui/date-picker"
import apiClient from "@/lib/apiClient"
import { useLogoDataUri } from "@/hooks/use-logo-data-uri"
import { useScrollToTopOnPageChange } from "@/hooks/use-scroll-to-top-on-page-change"
import {
  prepareReturnReceiptDataFromSale,
  downloadReceiptPdf,
  shareReceiptOnWhatsApp,
  type ReceiptData,
} from "@/lib/receipt"
import { printReceiptViaServer } from "@/lib/print-server"
import { usePrinterSettings } from "@/hooks/use-printer-settings"
import {
  RETURN_REASONS,
  REFUND_METHODS,
  EXCHANGE_PAYMENT_OPTIONS,
  INVENTORY_DISPOSITIONS,
  type InventoryDisposition,
  type ReturnReason,
  type RefundMethod,
  type ExchangeBalanceAction,
  type ExchangePaymentOption,
} from "@/components/returns/constants"
import {
  normalizeSaleSearchTerm,
  formatMoney,
  getIneligibleSaleReason,
  getReturnStatusLabel,
  isReturnQuantityDraft,
  isIncompleteReturnQuantityDraft,
  parseReturnQuantityInput,
  validateReturnQuantity,
  exceedsReturnableQuantity,
  RETURN_QTY_INVALID_TOAST_TITLE,
  getReturnQuantityExceededMessage,
  buildReturnTransactionSummary,
  computePaymentSettlement,
  paymentSettlementFromTransactionSummary,
  getReturnReasonLabel,
} from "@/components/returns/utils"
import { PaymentSettlementPanel } from "@/components/returns/payment-settlement-panel"

interface Sale {
  id: string
  sale_number: string
  customer?: {
    name: string
    email: string
  }
  sale_date: string
  total_amount: number
  subtotal?: number
  discount_amount?: number
  sale_items: Array<{
    id: string
    product: {
      id: string
      name: string
      sku: string
    }
    quantity: number
    unit_price: number
    line_total: number
  }>
}

interface ReturnItem {
  id: string
  sale_number: string
  original_sale_id?: string | null
  original_sale_number?: string | null
  original_sale_total?: number | null
  customer?: {
    name: string
    email: string
  }
  sale_date: string
  total_amount: number
  status: "PENDING" | "COMPLETED" | "CANCELLED" | "REFUNDED" | "EXCHANGED"
  payment_method: string
  notes?: string
  sale_items: Array<{
    id: string
    product: {
      id: string
      name: string
      sku: string
    }
    quantity: number
    unit_price: number
    line_total: number
    item_type: "ORIGINAL" | "RETURN" | "EXCHANGE"
  }>
}

interface NewReturn {
  saleId: string
  customerId?: string
  returnType: "REFUND" | "EXCHANGE"
  refundMethod?: string
  returnedItems: Array<{
    productId: string
    quantity: number
    disposition?: InventoryDisposition
  }>
  exchangedItems: Array<{
    productId: string
    quantity: number
    price: number
  }>
  notes: string
}

interface ReturnedItemPayload {
  productId: string
  quantity: number
  disposition?: InventoryDisposition
}

interface Product {
  id: string
  name: string
  sku: string
  sales_rate_exc_dis_and_tax: number
  sales_rate_inc_dis_and_tax: number
  purchase_rate: number
  available_stock?: number
  current_stock?: number
  // Backend can expose unit either as a relation { name } or as a flat
  // unit_name string depending on the endpoint. Accept both shapes.
  unit?: { name?: string | null } | null
  unit_name?: string | null
  category?: { id?: string; name?: string | null } | null
  category_id?: string | null
}

const getProductSalePrice = (product: Product) =>
  Number(
    product.sales_rate_inc_dis_and_tax ||
      product.sales_rate_exc_dis_and_tax ||
      product.purchase_rate ||
      0,
  )

const getProductCategoryKey = (product: Product) =>
  String(product.category?.id || product.category_id || "unknown")

const getProductCategoryLabel = (product: Product) =>
  product.category?.name?.trim() || "Unknown"

interface ExchangeItem {
  productId: string
  productName: string
  sku: string
  quantity: number
  price: number
  unit?: string
}

interface SelectedReturnItem {
  productId: string
  productName: string
  sku: string
  originalQuantity: number
  remainingQuantity: number
  returnQuantity: number
  selected: boolean
  unitPrice: number
  disposition: InventoryDisposition
}

const normalizeSaleRecord = (sale: any): Sale => ({
  id: String(sale?.id || ""),
  sale_number: String(sale?.sale_number || ""),
  customer: sale?.customer
    ? {
        name: String(sale.customer.name || ""),
        email: String(sale.customer.email || ""),
      }
    : undefined,
  sale_date:
    typeof sale?.sale_date === "string"
      ? sale.sale_date
      : new Date(sale?.sale_date || Date.now()).toISOString(),
  total_amount: Number(sale?.total_amount || 0),
  subtotal: Number(sale?.subtotal || 0),
  discount_amount: Number(sale?.discount_amount || 0),
  sale_items: Array.isArray(sale?.sale_items)
    ? sale.sale_items
        .filter((item: any) => !item?.item_type || item.item_type === "ORIGINAL")
        .map((item: any) => ({
        id: String(item?.id || ""),
        product: {
          id: String(item?.product?.id || item?.product_id || ""),
          name: String(item?.product?.name || "Unnamed Product"),
          sku: String(item?.product?.sku || ""),
        },
        quantity: Number(item?.quantity || 0),
        unit_price: Number(item?.unit_price || 0),
        line_total: Number(item?.line_total || 0),
      }))
    : [],
})

const normalizeReturnTransaction = (sale: any): ReturnItem => ({
  id: String(sale?.id || ""),
  sale_number: String(sale?.sale_number || ""),
  original_sale_id: sale?.original_sale_id ?? null,
  original_sale_number: sale?.original_sale?.sale_number
    ? String(sale.original_sale.sale_number)
    : null,
  original_sale_total:
    sale?.original_sale?.total_amount != null
      ? Number(sale.original_sale.total_amount)
      : null,
  customer: sale?.customer
    ? {
        name: String(sale.customer.name || ""),
        email: String(sale.customer.email || ""),
      }
    : undefined,
  sale_date:
    typeof sale?.sale_date === "string"
      ? sale.sale_date
      : typeof sale?.created_at === "string"
        ? sale.created_at
        : new Date().toISOString(),
  total_amount: Number(sale?.total_amount || 0),
  status: (sale?.status || "REFUNDED") as ReturnItem["status"],
  payment_method: String(sale?.payment_method || "CASH"),
  notes: sale?.notes ?? undefined,
  sale_items: Array.isArray(sale?.sale_items)
    ? sale.sale_items.map((item: any) => ({
        id: String(item?.id || ""),
        product: {
          id: String(item?.product?.id || item?.product_id || ""),
          name: String(item?.product?.name || "Unnamed Product"),
          sku: String(item?.product?.sku || ""),
        },
        quantity: Number(item?.quantity || 0),
        unit_price: Number(item?.unit_price || 0),
        line_total: Number(item?.line_total || 0),
        item_type: (item?.item_type || "RETURN") as "ORIGINAL" | "RETURN" | "EXCHANGE",
      }))
    : [],
})

const matchesSaleSearch = (sale: any, term: string) => {
  if (!term) return true
  const saleNumber = String(sale?.sale_number || "").toLowerCase()
  const customerName = String(sale?.customer?.name || "").toLowerCase()
  const customerEmail = String(sale?.customer?.email || "").toLowerCase()
  return (
    saleNumber.includes(term) ||
    customerName.includes(term) ||
    customerEmail.includes(term)
  )
}

const findIneligibleSaleMatch = (sales: any[], searchTerm: string) => {
  const term = normalizeSaleSearchTerm(searchTerm).toLowerCase()
  if (!term) return null
  const exactMatch =
    sales.find(
      (sale: any) =>
        String(sale?.sale_number || "").toLowerCase() === term ||
        String(sale?.customer?.email || "").toLowerCase() === term ||
        String(sale?.customer?.name || "").toLowerCase() === term,
    ) || sales.find((sale: any) => matchesSaleSearch(sale, term))
  if (!exactMatch || exactMatch.status === "COMPLETED") return null
  return {
    saleNumber: String(exactMatch.sale_number || ""),
    status: String(exactMatch.status || ""),
    reason: getIneligibleSaleReason(exactMatch.status),
  }
}

function ReturnsPageSkeleton({ isExchanges }: { isExchanges: boolean }) {
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-gray-200 shadow-sm">
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <Skeleton className="h-10 xl:col-span-2" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <Card>
          <CardContent className="pt-6 space-y-3">
            <Skeleton className="h-4 w-full" />
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>

      <span className="sr-only">
        Loading {isExchanges ? "exchanges" : "returns"}…
      </span>
    </div>
  )
}

function SelectedSaleDetailsSkeleton() {
  return (
    <div className="rounded-md bg-gray-50 p-3 sm:p-4 space-y-3 min-w-0 overflow-hidden">
      <Skeleton className="h-5 w-40 max-w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-[85%] max-w-full" />
      <Skeleton className="h-4 w-28 max-w-full" />
      <Skeleton className="h-4 w-20 max-w-full" />
    </div>
  )
}

function ReturnProductsTableSkeleton() {
  return (
    <div className="min-w-0 space-y-3">
      {/* Mobile card skeleton */}
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-lg border p-3 space-y-3">
            <div className="flex items-start gap-3">
              <Skeleton className="h-4 w-4 mt-1 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-[75%] max-w-full" />
                <Skeleton className="h-3 w-[50%] max-w-full" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>

      {/* Desktop table skeleton */}
      <div className="hidden md:block rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Purchased</TableHead>
              <TableHead>Returnable</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Inventory</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 2 }).map((_, index) => (
              <TableRow key={index}>
                <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                <TableCell><Skeleton className="h-8 w-28" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export type ReturnsModuleTab = "returns" | "exchanges"

export type ReturnsModuleProps = {
  initialTab?: ReturnsModuleTab
  hideModuleTabs?: boolean
}

type DatePreset = "all" | "today" | "yesterday" | "week" | "month" | "custom"

const HISTORY_PAYMENT_METHODS = [
  "CASH",
  "CARD",
  "MOBILE_MONEY",
  "BANK_TRANSFER",
  "CREDIT",
  "STORE_CREDIT",
] as const

const getHistoryDateRange = (preset: DatePreset): { start?: Date; end?: Date } => {
  const now = new Date()
  switch (preset) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) }
    case "yesterday": {
      const yesterday = subDays(now, 1)
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) }
    }
    case "week":
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
      }
    case "month":
      return { start: startOfMonth(now), end: endOfMonth(now) }
    default:
      return {}
  }
}

export function ReturnsModule({
  initialTab = "returns",
  hideModuleTabs = false,
}: ReturnsModuleProps = {}) {
  const showReturnQuantityExceededToast = (
    enteredQuantity: number,
    remainingQuantity: number,
    productName: string,
  ) => {
    toast.error(RETURN_QTY_INVALID_TOAST_TITLE, {
      description: getReturnQuantityExceededMessage(
        enteredQuantity,
        remainingQuantity,
        productName,
      ),
    })
  }

  const [returns, setReturns] = useState<ReturnItem[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [allSalesForMetrics, setAllSalesForMetrics] = useState<any[]>([])
  const [loading, setLoading] = useState(true) // Start with true to show loader on initial load
  const [salesLoading, setSalesLoading] = useState(false)
  const [saleDetailsLoading, setSaleDetailsLoading] = useState(false)
  const [processingReturn, setProcessingReturn] = useState(false) // Separate loading state for process return button
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [selectedReturnItems, setSelectedReturnItems] = useState<SelectedReturnItem[]>([])
  // Track return quantity input values as strings to allow decimal point typing
  const [returnQuantityInputs, setReturnQuantityInputs] = useState<Record<string, string>>({})
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [exchangeItems, setExchangeItems] = useState<ExchangeItem[]>([])
  // Per-row draft text for the quantity input so the user can clear the field
  // without it snapping back to "0" and concatenating their next keystroke
  // (e.g. clearing then typing "22" was producing "022").
  const [exchangeQtyDrafts, setExchangeQtyDrafts] = useState<Record<string, string>>({})
  const [exchangeProductSearch, setExchangeProductSearch] = useState("")
  const [exchangeCategoryFilter, setExchangeCategoryFilter] = useState("all")
  const exchangeProductSearchRef = useRef<HTMLInputElement | null>(null)

  const [isProcessOpen, setIsProcessOpen] = useState(false)
  const [saleDropdownOpen, setSaleDropdownOpen] = useState(false)
  const [selectedReturn, setSelectedReturn] = useState<ReturnItem | null>(null)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [returnDetailsAfterCompletion, setReturnDetailsAfterCompletion] = useState(false)
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null)
  const logoDataUri = useLogoDataUri()
  const { receiptPrinter, getReceiptPrinterObj, printers } = usePrinterSettings()
  const [searchTerm, setSearchTerm] = useState("")
  const [datePreset, setDatePreset] = useState<DatePreset>("all")
  const [customStart, setCustomStart] = useState<Date | undefined>(undefined)
  const [customEnd, setCustomEnd] = useState<Date | undefined>(undefined)
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all")
  const [amountMin, setAmountMin] = useState("")
  const [amountMax, setAmountMax] = useState("")
  const [showFilters, setShowFilters] = useState(true)
  const [saleSearch, setSaleSearch] = useState("")
  const [saleSearchPending, setSaleSearchPending] = useState(false)
  const [moduleTab, setModuleTab] = useState<ReturnsModuleTab>(initialTab)

  useEffect(() => {
    setModuleTab(initialTab)
  }, [initialTab])
  const [returnScope, setReturnScope] = useState<"FULL" | "PARTIAL">("FULL")
  const [returnReason, setReturnReason] = useState<ReturnReason | "">("")
  const [exchangeBalanceAction, setExchangeBalanceAction] =
    useState<ExchangeBalanceAction>("collect")
  const [exchangePaymentOption, setExchangePaymentOption] =
    useState<ExchangePaymentOption>("cash")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [returnTransactions, setReturnTransactions] = useState<ReturnItem[]>([])
  const [itemSearch, setItemSearch] = useState("")
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(25)
  useScrollToTopOnPageChange(currentPage)
  const saleSearchInputRef = useRef<HTMLInputElement | null>(null)
  const saleDropdownRef = useRef<HTMLDivElement | null>(null)
  const latestSalesRequestRef = useRef(0)
  const saleSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [newReturn, setNewReturn] = useState<NewReturn>({
    saleId: "",
    customerId: "",
    returnType: "REFUND",
    refundMethod: "",
    returnedItems: [],
    exchangedItems: [],
    notes: "",
  })
  // Inline validation errors, keyed by field name. Toasts disappear; an
  // inline message right under the input tells the user exactly what's
  // wrong, the moment they click "Process Return".
  const [formErrors, setFormErrors] = useState<{
    sale?: string
    refundMethod?: string
    items?: string
    exchangeItems?: string
  }>({})

  // Fetch products for exchange (full catalog — was hard-capped at 20, so most
  // dresses never appeared in Process Exchange on production).
  const fetchProducts = async (search = "") => {
    setProductsLoading(true)
    try {
      const userRole = localStorage.getItem("role")
      const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN"

      const params: Record<string, string | number | boolean> = {
        page: 1,
        limit: 2000,
        is_active: true,
      }
      const q = search.trim()
      if (q) params.search = q

      if (!isAdmin) {
        const branchStr = localStorage.getItem("branch")
        if (branchStr && branchStr !== "Not Found") {
          try {
            const branchObj = JSON.parse(branchStr)
            params.branch_id = branchObj.id || branchStr
          } catch {
            params.branch_id = branchStr
          }
        }
      }

      const response = await apiClient.get("/products", { params })
      setProducts(response.data?.data || [])
    } catch (error: any) {
      console.error("Error fetching products:", error)
    } finally {
      setProductsLoading(false)
    }
  }

  // Fetch sales and returns data
  const fetchSales = async (search = "", options?: { keepPending?: boolean }) => {
    const normalizedSearch = normalizeSaleSearchTerm(search)
    const requestId = ++latestSalesRequestRef.current

    setSalesLoading(true)
    try {
      const response = await apiClient.get("/sale/for-returns", {
        params: { search: normalizedSearch }
      })

      if (requestId !== latestSalesRequestRef.current) {
        return
      }

      setSales(response.data.data || [])
    } catch (error) {
      if (requestId === latestSalesRequestRef.current) {
        toast.error("Failed to fetch sales", {
          description: "Could not load sales data",
        })
      }
    } finally {
      if (requestId === latestSalesRequestRef.current) {
        setSalesLoading(false)
        if (!options?.keepPending) {
          setSaleSearchPending(false)
        }
      }
    }
  }

  const triggerSaleSearch = (value: string, options?: { immediate?: boolean }) => {
    const normalizedValue = normalizeSaleSearchTerm(value)

    setSaleSearch(normalizedValue)
    setSaleDropdownOpen(true)
    setSaleSearchPending(true)

    if (saleSearchDebounceRef.current) {
      clearTimeout(saleSearchDebounceRef.current)
      saleSearchDebounceRef.current = null
    }

    if (!isProcessOpen) {
      setSaleSearchPending(false)
      return
    }

    if (options?.immediate) {
      fetchSales(normalizedValue)
      return
    }

    saleSearchDebounceRef.current = setTimeout(() => {
      fetchSales(normalizedValue)
      saleSearchDebounceRef.current = null
    }, normalizedValue ? 250 : 0)
  }

  const fetchReturns = async () => {
    setLoading(true)
    try {
      const [txnRes, salesRes] = await Promise.all([
        apiClient.get("/sale/return-transactions"),
        apiClient.get("/sale"),
      ])
      const transactions = txnRes.data?.data || []
      setReturnTransactions(transactions)
      setReturns(transactions)
      setAllSalesForMetrics(salesRes.data?.data || [])
    } catch (error) {
      toast.error("Failed to fetch returns", {
        description: "Could not load returns data",
      })
    } finally {
      setLoading(false)
    }
  }

  const getAlreadyReturnedForSale = useCallback(
    (saleId: string) => {
      const map = new Map<string, number>()
      returnTransactions
        .filter((t) => t.original_sale_id === saleId || (t as any).original_sale_id === saleId)
        .forEach((txn) => {
          txn.sale_items
            ?.filter((i) => i.item_type === "RETURN")
            .forEach((item) => {
              const pid = (item as any).product?.id || (item as any).product_id
              if (!pid) return
              const qty = Math.abs(Number(item.quantity))
              map.set(pid, (map.get(pid) || 0) + qty)
            })
        })
      return map
    },
    [returnTransactions],
  )

  useEffect(() => {
    if (!isProcessOpen) {
      if (saleSearchDebounceRef.current) {
        clearTimeout(saleSearchDebounceRef.current)
        saleSearchDebounceRef.current = null
      }
      return
    }

    fetchSales(saleSearch)

    return () => {
      if (saleSearchDebounceRef.current) {
        clearTimeout(saleSearchDebounceRef.current)
        saleSearchDebounceRef.current = null
      }
    }
  }, [isProcessOpen])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        saleDropdownRef.current &&
        !saleDropdownRef.current.contains(event.target as Node)
      ) {
        setSaleDropdownOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    fetchReturns()
    fetchSales()
    fetchProducts()
  }, [])

  // Re-fetch exchange catalog when search changes (server search covers full inventory)
  useEffect(() => {
    if (moduleTab !== "exchanges") return
    const t = window.setTimeout(() => {
      void fetchProducts(exchangeProductSearch)
    }, 300)
    return () => window.clearTimeout(t)
  }, [exchangeProductSearch, moduleTab])

  useEffect(() => {
    if (!isProcessOpen) {
      setSaleSearch("")
      setSaleSearchPending(false)
      setSaleDropdownOpen(false)
      setExchangeProductSearch("")
      setExchangeCategoryFilter("all")
      setExchangeItems([])
      setSelectedReturnItems([])
      setReturnQuantityInputs({})
      setItemSearch("")
      setConfirmOpen(false)
      setNewReturn({
        saleId: "",
        customerId: "",
        returnType: moduleTab === "exchanges" ? "EXCHANGE" : "REFUND",
        refundMethod: "",
        returnedItems: [],
        exchangedItems: [],
        notes: "",
      })
      setSelectedSale(null)
      setSaleDetailsLoading(false)
      setReturnScope("FULL")
      setReturnReason("")
      setFormErrors({})
      setExchangePaymentOption("cash")
      setExchangeBalanceAction("collect")
    } else {
      setNewReturn((prev) => ({
        ...prev,
        returnType: moduleTab === "exchanges" ? "EXCHANGE" : "REFUND",
      }))
    }
  }, [isProcessOpen, moduleTab])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PENDING":
        return "bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
      case "COMPLETED":
        return "bg-green-100 text-green-800 hover:bg-green-100"
      case "CANCELLED":
        return "bg-red-100 text-red-800 hover:bg-red-100"
      case "REFUNDED":
        return "bg-blue-100 text-blue-800 hover:bg-blue-100"
      case "EXCHANGED":
        return "bg-purple-100 text-purple-800 hover:bg-purple-100"
      default:
        return "bg-gray-100 text-gray-800 hover:bg-gray-100"
    }
  }

  const availablePaymentMethods = useMemo(() => {
    const fromData = new Set(
      returns
        .map((r) => String(r.payment_method || "").toUpperCase())
        .filter(Boolean),
    )
    HISTORY_PAYMENT_METHODS.forEach((m) => fromData.add(m))
    return Array.from(fromData).sort()
  }, [returns])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (normalizeSaleSearchTerm(searchTerm)) count += 1
    if (datePreset !== "all") count += 1
    if (paymentMethodFilter !== "all") count += 1
    if (amountMin.trim()) count += 1
    if (amountMax.trim()) count += 1
    return count
  }, [searchTerm, datePreset, paymentMethodFilter, amountMin, amountMax])

  const clearHistoryFilters = () => {
    setSearchTerm("")
    setDatePreset("all")
    setCustomStart(undefined)
    setCustomEnd(undefined)
    setPaymentMethodFilter("all")
    setAmountMin("")
    setAmountMax("")
  }

  const filteredReturns = useMemo(() => {
    const normalizedTerm = normalizeSaleSearchTerm(searchTerm).toLowerCase()
    const minAmount = amountMin.trim() ? Number(amountMin) : null
    const maxAmount = amountMax.trim() ? Number(amountMax) : null

    let rangeStart: Date | undefined
    let rangeEnd: Date | undefined
    if (datePreset === "custom") {
      if (customStart) rangeStart = startOfDay(customStart)
      if (customEnd) rangeEnd = endOfDay(customEnd)
    } else {
      const range = getHistoryDateRange(datePreset)
      rangeStart = range.start
      rangeEnd = range.end
    }

    return returns.filter((returnItem) => {
      const matchesSearch =
        !normalizedTerm ||
        returnItem.id.toLowerCase().includes(normalizedTerm) ||
        returnItem.sale_number.toLowerCase().includes(normalizedTerm) ||
        (returnItem.original_sale_number || "").toLowerCase().includes(normalizedTerm) ||
        (returnItem.customer?.name || "").toLowerCase().includes(normalizedTerm) ||
        (returnItem.customer?.email || "").toLowerCase().includes(normalizedTerm) ||
        (returnItem.payment_method || "").toLowerCase().includes(normalizedTerm) ||
        (returnItem.notes || "").toLowerCase().includes(normalizedTerm)

      if (!matchesSearch) return false

      if (paymentMethodFilter !== "all") {
        if (String(returnItem.payment_method || "").toUpperCase() !== paymentMethodFilter) {
          return false
        }
      }

      const saleDate = new Date(returnItem.sale_date)
      if (rangeStart && saleDate < rangeStart) return false
      if (rangeEnd && saleDate > rangeEnd) return false

      const amount = Math.abs(Number(returnItem.total_amount) || 0)
      if (minAmount !== null && !Number.isNaN(minAmount) && amount < minAmount) return false
      if (maxAmount !== null && !Number.isNaN(maxAmount) && amount > maxAmount) return false

      return true
    })
  }, [
    returns,
    searchTerm,
    datePreset,
    customStart,
    customEnd,
    paymentMethodFilter,
    amountMin,
    amountMax,
  ])

  const searchableSales = useMemo(() => {
    const eligibleSalesFromCache = allSalesForMetrics
      .filter((sale: any) => sale?.status === "COMPLETED")
      .map(normalizeSaleRecord)

    const eligibleSalesFromSearch = sales.map(normalizeSaleRecord)
    const dedupedSales = new Map<string, Sale>()

    ;[...eligibleSalesFromSearch, ...eligibleSalesFromCache].forEach((sale) => {
      if (!sale.id) return
      dedupedSales.set(sale.id, sale)
    })

    return Array.from(dedupedSales.values())
  }, [allSalesForMetrics, sales])

  // When searching by bill # on Returns/Exchanges: if no completed history for
  // this tab, surface matching ORIGINAL sales so staff can start the flow.
  const pageSearchMatchingSales = useMemo(() => {
    const term = normalizeSaleSearchTerm(searchTerm).toLowerCase()
    if (!term) return []

    const historyMatches =
      moduleTab === "exchanges"
        ? filteredReturns.filter((returnItem) => returnItem.status === "EXCHANGED")
        : filteredReturns.filter((returnItem) => returnItem.status === "REFUNDED")
    if (historyMatches.length > 0) return []

    return searchableSales.filter((sale) => matchesSaleSearch(sale, term)).slice(0, 5)
  }, [filteredReturns, moduleTab, searchableSales, searchTerm])

  const pageSearchIneligibleSaleMatch = useMemo(() => {
    if (
      !normalizeSaleSearchTerm(searchTerm) ||
      pageSearchMatchingSales.length > 0
    ) {
      return null
    }

    const historyMatches =
      moduleTab === "exchanges"
        ? filteredReturns.filter((returnItem) => returnItem.status === "EXCHANGED")
        : filteredReturns.filter((returnItem) => returnItem.status === "REFUNDED")
    if (historyMatches.length > 0) return null

    return findIneligibleSaleMatch(allSalesForMetrics, searchTerm)
  }, [
    allSalesForMetrics,
    filteredReturns,
    moduleTab,
    pageSearchMatchingSales.length,
    searchTerm,
  ])

  const filteredSales = useMemo(() => {
    const term = normalizeSaleSearchTerm(saleSearch).toLowerCase()
    if (!term) return searchableSales

    return searchableSales.filter((sale) => matchesSaleSearch(sale, term))
  }, [saleSearch, searchableSales])

  const ineligibleSaleMatch = useMemo(() => {
    if (!normalizeSaleSearchTerm(saleSearch) || filteredSales.length > 0) {
      return null
    }

    return findIneligibleSaleMatch(allSalesForMetrics, saleSearch)
  }, [allSalesForMetrics, filteredSales.length, saleSearch])

  const refundHistory = useMemo(
    () => filteredReturns.filter((returnItem) => returnItem.status === "REFUNDED"),
    [filteredReturns],
  )

  const exchangeHistory = useMemo(
    () => filteredReturns.filter((returnItem) => returnItem.status === "EXCHANGED"),
    [filteredReturns],
  )

  const activeHistory =
    moduleTab === "exchanges" ? exchangeHistory : refundHistory

  // Reset to page 1 when search/filters or tab changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, datePreset, customStart, customEnd, paymentMethodFilter, amountMin, amountMax, moduleTab])

  // Prepare ReceiptData (same shape as sales-history) whenever a return is
  // opened. The data feeds the Print / Download / Share actions — there's no
  // on-screen receipt preview here; the original card view stays as-is.
  useEffect(() => {
    if (selectedReturn && isViewOpen) {
      const data = prepareReturnReceiptDataFromSale(
        {
          ...(selectedReturn as any),
          original_sale: selectedReturn.original_sale_number
            ? {
                sale_number: selectedReturn.original_sale_number,
                total_amount: selectedReturn.original_sale_total,
              }
            : (selectedReturn as any).original_sale,
        },
        { name: "Pehnawa Boutique", address: "Karachi" },
        {
          transactionLabel: selectedReturn.sale_number,
          originalSaleNumber: selectedReturn.original_sale_number || undefined,
        },
      )
      setReceiptData(data)
    } else {
      setReceiptData(null)
    }
  }, [selectedReturn, isViewOpen])

  const handleServerPrint = async () => {
    if (!receiptData) return
    const printerInfo = getReceiptPrinterObj()
    if (!printerInfo) {
      toast.error("Please select a receipt printer in Printer Settings")
      return
    }
    try {
      await printReceiptViaServer(
        {
          ...printerInfo,
          columns: printerInfo.receiptProfile?.columns || { fontA: 48, fontB: 64 },
        },
        receiptData,
        { copies: 1, cut: true, openDrawer: false },
      )
      toast.success("Receipt sent to printer")
    } catch (err: any) {
      toast.error(err?.message || "Failed to print receipt")
    }
  }

  const handleDownloadReceipt = async () => {
    if (!receiptData) return
    try {
      await downloadReceiptPdf(receiptData, logoDataUri)
    } catch (err: any) {
      toast.error(err?.message || "Failed to download receipt")
    }
  }

  const handleShareReceiptOnWhatsApp = async () => {
    if (!receiptData) return
    try {
      const { fellBack } = await shareReceiptOnWhatsApp(
        receiptData,
        logoDataUri,
        (selectedReturn as any)?.customer?.phone_number ||
          (selectedReturn as any)?.customer?.mobile_number ||
          "",
      )
      if (fellBack) {
        toast.success("Receipt downloaded", {
          description:
            "Your browser doesn't support direct file share. Attach the PDF in the WhatsApp chat.",
        })
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to share receipt")
    }
  }

  const statsScopeLabel = useMemo(() => {
    if (datePreset === "today") return "Today"
    if (datePreset === "yesterday") return "Yesterday"
    if (datePreset === "week") return "This week"
    if (datePreset === "month") return "This month"
    if (datePreset === "custom") {
      if (customStart && customEnd) {
        return `${format(customStart, "MMM d, yyyy")} → ${format(customEnd, "MMM d, yyyy")}`
      }
      if (customStart) return `From ${format(customStart, "MMM d, yyyy")}`
      if (customEnd) return `Until ${format(customEnd, "MMM d, yyyy")}`
      return "Custom range"
    }
    if (activeFilterCount > 0) return "Matching filters"
    return "All time"
  }, [datePreset, customStart, customEnd, activeFilterCount])

  const totalRefundCount = refundHistory.length
  const totalRefundValue = refundHistory.reduce(
    (sum, r) => sum + Math.abs(Number(r.total_amount) || 0),
    0,
  )
  const averageRefundValue =
    totalRefundCount > 0 ? totalRefundValue / totalRefundCount : 0
  const returnRate =
    allSalesForMetrics.length > 0
      ? ((totalRefundCount / allSalesForMetrics.length) * 100).toFixed(1)
      : "0.0"

  const totalExchangeCount = exchangeHistory.length
  const totalExchangeValue = exchangeHistory.reduce(
    (sum, r) => sum + Math.abs(Number(r.total_amount) || 0),
    0,
  )
  const averageExchangeValue =
    totalExchangeCount > 0 ? totalExchangeValue / totalExchangeCount : 0
  const exchangeRate =
    allSalesForMetrics.length > 0
      ? ((totalExchangeCount / allSalesForMetrics.length) * 100).toFixed(1)
      : "0.0"

  // Handle exchange product selection
  const handleExchangeProductSelect = (productId: string) => {
    const product = products.find((p) => p.id === productId)
    if (!product) return

    const price = getProductSalePrice(product)
    
    // Check if product already in exchange items
    const existingItem = exchangeItems.find((item) => item.productId === productId)
    if (existingItem) {
      // Increment quantity
      setExchangeItems((prev) =>
        prev.map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      )
    } else {
      // Add new exchange item — capture the unit (kg / pcs / etc.) so we can
      // show it next to the quantity input.
      const unitLabel =
        product.unit?.name || product.unit_name || undefined
      setExchangeItems((prev) => [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantity: 1,
          price: price,
          unit: unitLabel || undefined,
        },
      ])
    }

    // Update newReturn.exchangedItems
    const updatedExchangeItems = existingItem
      ? exchangeItems.map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      : [
          ...exchangeItems,
          {
            productId: product.id,
            quantity: 1,
            price: price,
          },
        ]

    setNewReturn((prev) => ({
      ...prev,
      exchangedItems: updatedExchangeItems,
    }))
  }

  // Handle exchange item quantity change
  const handleExchangeQuantityChange = (productId: string, quantity: number) => {
    // Keep the row even when quantity is 0 so the user can finish typing a
    // value like "0.5" without the row disappearing on the first "0".
    // Use removeExchangeItem to explicitly drop a row.
    const safeQty = Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;
    setExchangeItems((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, quantity: safeQty } : item,
      ),
    );
    setNewReturn((prev) => ({
      ...prev,
      exchangedItems: prev.exchangedItems.map((item) =>
        item.productId === productId ? { ...item, quantity: safeQty } : item,
      ),
    }));
  };

  const removeExchangeItem = (productId: string) => {
    setExchangeItems((prev) => prev.filter((item) => item.productId !== productId));
    setNewReturn((prev) => ({
      ...prev,
      exchangedItems: prev.exchangedItems.filter((item) => item.productId !== productId),
    }));
  };

  // Filter products for exchange
  const exchangeCategories = useMemo(() => {
    const map = new Map<string, string>()
    for (const product of products) {
      const key = getProductCategoryKey(product)
      if (!map.has(key)) {
        map.set(key, getProductCategoryLabel(product))
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [products])

  const filteredExchangeProducts = useMemo(() => {
    let list = products
    if (exchangeCategoryFilter !== "all") {
      list = list.filter(
        (product) => getProductCategoryKey(product) === exchangeCategoryFilter,
      )
    }
    const searchLower = exchangeProductSearch.trim().toLowerCase()
    if (searchLower) {
      list = list.filter(
        (product) =>
          product.name.toLowerCase().includes(searchLower) ||
          product.sku.toLowerCase().includes(searchLower),
      )
    }
    return list
  }, [products, exchangeProductSearch, exchangeCategoryFilter])

  const handleExchangeSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    const firstMatch = filteredExchangeProducts[0]
    if (firstMatch) {
      handleExchangeProductSelect(firstMatch.id)
    }
  }

  const handleProcessReturn = async () => {
    // Filter out items with quantity 0 before validation
    const validReturnedItems = newReturn.returnedItems.filter(item => item.quantity > 0)

    // Collect ALL validation problems in one pass and render them inline,
    // next to the offending field. Toasts vanish; inline errors stay until
    // the user fixes them.
    const nextErrors: typeof formErrors = {}

    if (!newReturn.saleId) {
      nextErrors.sale = "Please select a sale."
    }

    if (newReturn.returnType === "REFUND" && !newReturn.refundMethod) {
      nextErrors.refundMethod = "Please select a refund method."
    }

    if (newReturn.returnType === "EXCHANGE") {
      if (newReturn.exchangedItems.length === 0) {
        nextErrors.exchangeItems = "Please add at least one item for exchange."
      } else if (newReturn.exchangedItems.some((it) => !it.quantity || it.quantity <= 0)) {
        nextErrors.exchangeItems = "Exchange item quantity must be greater than 0."
      }
    }

    if (validReturnedItems.length === 0 && newReturn.exchangedItems.length === 0) {
      nextErrors.items = "Please select at least one item to return or exchange."
    }

    const hasInvalidQuantity = selectedReturnItems.some((item) => {
      if (!item.selected || item.returnQuantity <= 0) return false
      return !validateReturnQuantity(
        item.returnQuantity,
        item.remainingQuantity,
        item.productName,
      ).ok
    })
    if (hasInvalidQuantity) {
      nextErrors.items = "One or more return quantities exceed the returnable amount."
    }

    setFormErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      toast.error("Please fix the highlighted fields", {
        description: Object.values(nextErrors)[0],
      })
      return
    }

    setConfirmOpen(true)
  }

  const applySaleDetails = useCallback(
    (sale: Sale, saleId: string, mode?: "REFUND" | "EXCHANGE") => {
      setSelectedSale(sale)
      const returnType = mode || (moduleTab === "exchanges" ? "EXCHANGE" : "REFUND")
      setNewReturn((prev) => ({ ...prev, saleId, returnType }))

      const alreadyReturned = getAlreadyReturnedForSale(saleId)
      const items: SelectedReturnItem[] = (sale.sale_items || [])
        .map((item) => {
          const purchased = item.quantity
          const prior = alreadyReturned.get(item.product.id) || 0
          const remaining = Math.max(0, purchased - prior)
          return {
            productId: item.product.id,
            productName: item.product.name,
            sku: item.product.sku,
            originalQuantity: purchased,
            remainingQuantity: remaining,
            returnQuantity: remaining,
            selected: true,
            unitPrice: item.unit_price,
            disposition: "RESTOCK" as InventoryDisposition,
          }
        })
        .filter((i) => i.productId && i.remainingQuantity > 0)

      setSelectedReturnItems(items)
      setReturnScope("FULL")

      if (items.length === 0) {
        toast.error("No returnable items", {
          description: "This sale has no products left to refund.",
        })
      }

      const returnedItems = items.map((i) => ({
        productId: i.productId,
        quantity: i.returnQuantity,
      }))
      setNewReturn((prev) => ({
        ...prev,
        returnedItems,
      }))
    },
    [getAlreadyReturnedForSale, moduleTab],
  )

  const handleSaleSelect = async (saleId: string, mode?: "REFUND" | "EXCHANGE") => {
    if (saleSearchDebounceRef.current) {
      clearTimeout(saleSearchDebounceRef.current)
      saleSearchDebounceRef.current = null
    }

    setSaleSearchPending(false)
    const cachedSale = searchableSales.find((s) => s.id === saleId)
    setSaleDropdownOpen(false)
    setSaleSearch(cachedSale?.sale_number || "")
    requestAnimationFrame(() => {
      saleSearchInputRef.current?.blur()
    })

    setSaleDetailsLoading(true)
    setSelectedSale(null)
    setSelectedReturnItems([])
    setNewReturn((prev) => ({
      ...prev,
      saleId,
      returnType: mode || (moduleTab === "exchanges" ? "EXCHANGE" : "REFUND"),
      returnedItems: [],
    }))

    try {
      const response = await apiClient.get(`/sale/${saleId}`)
      const sale = normalizeSaleRecord(response.data?.data ?? response.data)
      applySaleDetails(sale, saleId, mode)
    } catch (error: any) {
      setNewReturn((prev) => ({ ...prev, saleId: "" }))
      toast.error("Failed to load sale", {
        description: error.response?.data?.message || "Could not fetch sale details",
      })
    } finally {
      setSaleDetailsLoading(false)
    }
  }

  const handleSaleSearchPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedValue = event.clipboardData.getData("text")
    if (!pastedValue) {
      return
    }

    event.preventDefault()
    triggerSaleSearch(pastedValue, { immediate: true })
  }

  const handleStartReturnForSale = (saleId: string) => {
    setModuleTab("returns")
    setIsProcessOpen(true)
    void handleSaleSelect(saleId, "REFUND")
  }

  const handleStartExchangeForSale = (saleId: string) => {
    setModuleTab("exchanges")
    setIsProcessOpen(true)
    void handleSaleSelect(saleId, "EXCHANGE")
  }

  // Open refund flow when navigated from Sales History
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const { getPendingRefund, clearPendingRefund } = await import("@/lib/pending-refund")
      const pending = getPendingRefund()
      if (!pending?.saleId) return

      setModuleTab("returns")
      setIsProcessOpen(true)
      setSaleSearch(pending.saleNumber || "")

      try {
        await handleSaleSelect(pending.saleId, "REFUND")
        if (!cancelled) {
          clearPendingRefund()
        }
      } catch {
        if (!cancelled) {
          clearPendingRefund()
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
    // intentionally run once on mount when arriving from Sales History
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openProcessDialog = () => {
    setNewReturn((prev) => ({
      ...prev,
      returnType: moduleTab === "exchanges" ? "EXCHANGE" : "REFUND",
    }))
    setIsProcessOpen(true)
  }

  const closeProcessView = () => {
    if (processingReturn) return
    setFormErrors({})
    setIsProcessOpen(false)
  }

  const syncReturnedItemsToForm = (items: SelectedReturnItem[]) => {
    setNewReturn((prev) => ({
      ...prev,
      returnedItems: items
        .filter((i) => i.returnQuantity > 0)
        .map((i) => ({
          productId: i.productId,
          quantity: i.returnQuantity,
          disposition: i.disposition,
        })),
    }))
  }

  const getReturnQtyStep = (quantity: number) =>
    Number.isInteger(quantity) ? 1 : 0.1

  const commitReturnQuantityInput = (productId: string, rawValue: string) => {
    const item = selectedReturnItems.find((i) => i.productId === productId)
    if (!item) return

    const parsed = parseReturnQuantityInput(rawValue)

    if (parsed === null) {
      const trimmed = rawValue.trim()
      if (trimmed === "" || trimmed === "0" || trimmed === ".") {
        if (returnScope === "PARTIAL") {
          handleReturnItemToggle(productId, false)
        }
      }
      return
    }

    if (!applyReturnQuantity(productId, parsed)) {
      setReturnQuantityInputs((prev) => ({
        ...prev,
        [productId]: item.returnQuantity > 0 ? String(item.returnQuantity) : "",
      }))
    }
  }

  const handleReturnQuantityInputChange = (productId: string, rawValue: string) => {
    if (!isReturnQuantityDraft(rawValue)) {
      return
    }

    const item = selectedReturnItems.find((i) => i.productId === productId)
    if (!item) return

    if (isIncompleteReturnQuantityDraft(rawValue)) {
      setReturnQuantityInputs((prev) => ({
        ...prev,
        [productId]: rawValue,
      }))
      return
    }

    const parsed = parseReturnQuantityInput(rawValue)
    if (parsed !== null && parsed > item.remainingQuantity) {
      showReturnQuantityExceededToast(
        parsed,
        item.remainingQuantity,
        item.productName,
      )
      setReturnQuantityInputs((prev) => ({
        ...prev,
        [productId]: item.returnQuantity > 0 ? String(item.returnQuantity) : "",
      }))
      return
    }

    setReturnQuantityInputs((prev) => ({
      ...prev,
      [productId]: rawValue,
    }))
  }

  const applyReturnQuantity = (
    productId: string,
    quantity: number,
    options?: { showToast?: boolean },
  ): boolean => {
    const item = selectedReturnItems.find((i) => i.productId === productId)
    if (!item) return false

    const validation = validateReturnQuantity(
      quantity,
      item.remainingQuantity,
      item.productName,
    )

    if (!validation.ok) {
      if (options?.showToast !== false) {
        toast.error(RETURN_QTY_INVALID_TOAST_TITLE, {
          description: validation.message,
        })
      }
      return false
    }

    const validQuantity = validation.quantity
    const selected = returnScope === "FULL" ? true : validQuantity > 0

    setSelectedReturnItems((prev) => {
      const updatedItems = prev.map((i) =>
        i.productId === productId
          ? { ...i, returnQuantity: validQuantity, selected }
          : i,
      )
      syncReturnedItemsToForm(updatedItems)
      return updatedItems
    })

    setReturnQuantityInputs((prev) => {
      const next = { ...prev }
      delete next[productId]
      return next
    })

    return true
  }

  const handleReturnQuantityChange = (
    productId: string,
    quantity: number,
    options?: { showToast?: boolean },
  ) => applyReturnQuantity(productId, quantity, options)

  const handleReturnScopeChange = (scope: "FULL" | "PARTIAL") => {
    setReturnScope(scope)
    setReturnQuantityInputs({})

    if (scope === "FULL") {
      setSelectedReturnItems((prev) => {
        const updatedItems = prev.map((item) => ({
          ...item,
          selected: true,
          returnQuantity: item.remainingQuantity,
        }))
        syncReturnedItemsToForm(updatedItems)
        return updatedItems
      })
    } else {
      setSelectedReturnItems((prev) => {
        const updatedItems = prev.map((item) => ({
          ...item,
          selected: false,
          returnQuantity: 0,
        }))
        syncReturnedItemsToForm(updatedItems)
        return updatedItems
      })
    }
  }

  const handleReturnItemToggle = (productId: string, checked: boolean) => {
    if (returnScope === "FULL") return
    const item = selectedReturnItems.find((i) => i.productId === productId)
    if (!item) return

    setReturnQuantityInputs((prev) => {
      const next = { ...prev }
      delete next[productId]
      return next
    })

    setSelectedReturnItems((prev) => {
      const updatedItems = prev.map((i) => {
        if (i.productId !== productId) return i
        if (!checked) {
          return { ...i, selected: false, returnQuantity: 0 }
        }
        const initialQty = i.remainingQuantity <= 1 ? i.remainingQuantity : 1
        return { ...i, selected: true, returnQuantity: initialQty }
      })
      syncReturnedItemsToForm(updatedItems)
      return updatedItems
    })
  }

  const handleDispositionChange = (productId: string, disposition: InventoryDisposition) => {
    setSelectedReturnItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, disposition } : i)),
    )
    setNewReturn((prev) => ({
      ...prev,
      returnedItems: prev.returnedItems.map((r) =>
        r.productId === productId ? { ...r, disposition } : r,
      ),
    }))
  }

  // Ratio of what the customer actually paid to the pre-order-discount
  // subtotal. e.g. Rs 430 of goods with a Rs 30 order discount -> 400/430.
  const orderDiscountFactor = useMemo(() => {
    if (!selectedSale) return 1
    const netSubtotal =
      (selectedSale.sale_items || []).reduce(
        (s, i) => s + (Number(i.line_total) || 0),
        0,
      ) || Number(selectedSale.subtotal) || 0
    const discount = Number(selectedSale.discount_amount) || 0
    if (netSubtotal <= 0 || discount <= 0) return 1
    return Math.max(0, (netSubtotal - discount) / netSubtotal)
  }, [selectedSale])

  // Returned-items value BEFORE the order discount is prorated out (Rs 430).
  const returnRefundGross = useMemo(() => {
    const originalById = new Map(
      (selectedSale?.sale_items || []).map((i) => [i.product.id, i]),
    )
    const gross = selectedReturnItems
      .filter((item) => item.selected && item.returnQuantity > 0)
      .reduce((sum, item) => {
        const orig = originalById.get(item.productId)
        const perUnit =
          orig && Number(orig.quantity) > 0
            ? Number(orig.line_total) / Number(orig.quantity)
            : item.unitPrice
        return sum + item.returnQuantity * perUnit
      }, 0)
    return Math.round(gross * 100) / 100
  }, [selectedReturnItems, selectedSale])

  // Actual refund after prorating the original order discount (Rs 400).
  const returnRefundTotal = useMemo(
    () => Math.round(returnRefundGross * orderDiscountFactor * 100) / 100,
    [returnRefundGross, orderDiscountFactor],
  )

  const exchangeTotal = useMemo(() => {
    return exchangeItems.reduce((sum, item) => sum + item.quantity * item.price, 0)
  }, [exchangeItems])

  const exchangeBalance = useMemo(() => {
    return exchangeTotal - returnRefundTotal
  }, [exchangeTotal, returnRefundTotal])

  useEffect(() => {
    if (exchangeBalance < 0 && exchangeBalanceAction === "collect") {
      setExchangeBalanceAction("refund")
    }
  }, [exchangeBalance, exchangeBalanceAction])

  const filteredSelectedItems = useMemo(() => {
    const t = itemSearch.toLowerCase().trim()
    if (!t) return selectedReturnItems
    return selectedReturnItems.filter(
      (i) =>
        i.productName.toLowerCase().includes(t) ||
        i.sku.toLowerCase().includes(t),
    )
  }, [selectedReturnItems, itemSearch])

  const selectedReturnSummary = useMemo(() => {
    if (!selectedReturn) return null
    return buildReturnTransactionSummary({
      ...selectedReturn,
      original_sale_total: selectedReturn.original_sale_total,
    })
  }, [selectedReturn])

  const paymentSettlement = useMemo(() => {
    if (!selectedSale) return null
    return computePaymentSettlement({
      transactionType: newReturn.returnType === "EXCHANGE" ? "EXCHANGE" : "RETURN",
      returnScope,
      originalOrderAmount: Math.abs(Number(selectedSale.total_amount)),
      returnedItemsValue: returnRefundTotal,
      returnedItemsGrossValue: returnRefundGross,
      replacementItemsValue: exchangeTotal,
    })
  }, [
    selectedSale,
    newReturn.returnType,
    returnScope,
    returnRefundTotal,
    returnRefundGross,
    exchangeTotal,
  ])

  const handleViewReturn = (returnItem: ReturnItem) => {
    setReturnDetailsAfterCompletion(false)
    setSelectedReturn(returnItem)
    setIsViewOpen(true)
  }

  const openCompletedReturnDetails = (sale: unknown) => {
    if (!sale || typeof sale !== "object") return
    setReturnDetailsAfterCompletion(true)
    setSelectedReturn(normalizeReturnTransaction(sale))
    setIsViewOpen(true)
  }

  const submitReturnOrExchange = async () => {
    setConfirmOpen(false)
    setProcessingReturn(true)
    try {
      const validReturnedItems = newReturn.returnedItems.filter((item) => item.quantity > 0)
      const payload: Record<string, unknown> = {
        transactionType: newReturn.returnType === "EXCHANGE" ? "EXCHANGE" : "RETURN",
        returnScope,
        returnedItems: validReturnedItems.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          disposition:
            selectedReturnItems.find((s) => s.productId === item.productId)?.disposition ||
            "RESTOCK",
        })),
        notes: newReturn.notes || "",
      }

      if (returnReason) {
        payload.returnReason = returnReason
      }

      if (newReturn.returnType === "EXCHANGE" && newReturn.exchangedItems.length > 0) {
        payload.exchangedItems = newReturn.exchangedItems.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          price: Number(item.price),
        }))
        payload.exchangeBalanceAction = exchangeBalanceAction
      }

      if (newReturn.returnType === "REFUND" && newReturn.refundMethod) {
        payload.refundMethod = newReturn.refundMethod
      }

      if (newReturn.customerId) {
        payload.customerId = newReturn.customerId
      }

      const response = await apiClient.patch(`/sale/${newReturn.saleId}/refund`, payload)
      const createdReturn = response.data?.data ?? response.data

      const isExchange = newReturn.returnType === "EXCHANGE"
      toast.success(isExchange ? "Exchange completed" : "Return completed", {
        description: isExchange
          ? "Exchange has been processed successfully."
          : "Return has been processed successfully.",
      })

      setIsProcessOpen(false)
      setNewReturn({
        saleId: "",
        customerId: "",
        returnType: "REFUND",
        refundMethod: "",
        returnedItems: [],
        exchangedItems: [],
        notes: "",
      })
      setSelectedReturnItems([])
      setExchangeItems([])
      setExchangeProductSearch("")
      setSelectedSale(null)
      setFormErrors({})
      setSearchTerm("")
      fetchReturns()
      fetchSales()
      openCompletedReturnDetails(createdReturn)
    } catch (error: any) {
      let errorMessage = "An error occurred while processing."
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      }
      toast.error(
        newReturn.returnType === "EXCHANGE"
          ? "Failed to process exchange"
          : "Failed to process return",
        { description: errorMessage },
      )
    } finally {
      setProcessingReturn(false)
    }
  }

  const renderReturnsTable = (
    returnsData: ReturnItem[],
    options?: { emptyMessage?: string; recordLabel?: string },
  ) => {
    const recordLabel = options?.recordLabel ?? "returns"
    // Paginate the data
    const totalPages = pageSize === 0 ? 1 : Math.ceil(returnsData.length / pageSize)
    const startIndex = pageSize === 0 ? 0 : (currentPage - 1) * pageSize
    const endIndex = pageSize === 0 ? returnsData.length : startIndex + pageSize
    const paginatedData = returnsData.slice(startIndex, endIndex)
    const hasSearchTerm = Boolean(normalizeSaleSearchTerm(searchTerm))
    const hasActiveFilters = activeFilterCount > 0
    const emptyStateMessage =
      options?.emptyMessage ??
      (hasSearchTerm && pageSearchMatchingSales.length > 0
        ? "No return history found for this search. Matching sales are shown above."
        : hasSearchTerm && pageSearchIneligibleSaleMatch
          ? "No return history found for this search. Sale status details are shown above."
          : hasActiveFilters
            ? "No returns match your filters."
            : "No returns found")
    
    return (
      <>
        {returnsData.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-gray-500">
            {emptyStateMessage}
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {paginatedData.map((returnItem) => (
                <Card key={returnItem.id} className="border-gray-200 shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-base truncate">{returnItem.sale_number}</p>
                        <p className="text-sm text-gray-600 truncate">
                          {returnItem.customer?.name || returnItem.customer?.email || "N/A"}
                        </p>
                      </div>
                      <Badge className={cn("shrink-0", getStatusColor(returnItem.status))}>
                        {getReturnStatusLabel(returnItem.status)}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-gray-500">Date</p>
                        <p className="font-medium">
                          {new Date(returnItem.sale_date).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Amount</p>
                        <p className="font-semibold">
                          Rs {Math.abs(Number(returnItem.total_amount)).toLocaleString()}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-gray-500">Payment Method</p>
                        <p className="font-medium capitalize">{returnItem.payment_method}</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => handleViewReturn(returnItem)}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View details
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Sale ID</TableHead>
                    <TableHead className="min-w-[150px]">Customer</TableHead>
                    <TableHead className="min-w-[120px]">Date</TableHead>
                    <TableHead className="min-w-[100px]">Amount</TableHead>
                    <TableHead className="min-w-[130px]">Payment Method</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                    <TableHead className="min-w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.map((returnItem) => (
                    <TableRow key={returnItem.id}>
                      <TableCell className="font-medium">{returnItem.sale_number}</TableCell>
                      <TableCell>
                        {returnItem.customer?.name || returnItem.customer?.email || "N/A"}
                      </TableCell>
                      <TableCell>{new Date(returnItem.sale_date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        Rs {Math.abs(Number(returnItem.total_amount)).toLocaleString()}
                      </TableCell>
                      <TableCell className="capitalize">{returnItem.payment_method}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(returnItem.status)}>
                          {getReturnStatusLabel(returnItem.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewReturn(returnItem)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

      {/* Pagination */}
      {returnsData.length > 0 && (
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Label htmlFor="returns-page-size" className="text-sm font-medium whitespace-nowrap">
              Items per page:
            </Label>
            <Select 
              value={String(pageSize)} 
              onValueChange={value => { 
                setPageSize(Number(value)); 
                setCurrentPage(1); 
              }}
            >
              <SelectTrigger className="w-24 sm:w-32" id="returns-page-size">
                <SelectValue placeholder="Page Size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="0">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <span className="text-xs sm:text-sm text-gray-600">
            Showing {startIndex + 1} to {Math.min(endIndex, returnsData.length)} of {returnsData.length} {recordLabel}
          </span>
        </div>

        {pageSize !== 0 && totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="hidden sm:inline-flex"
            >
              First
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let page: number;
                if (totalPages <= 5) {
                  page = i + 1;
                } else if (currentPage <= 3) {
                  page = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  page = totalPages - 4 + i;
                } else {
                  page = currentPage - 2 + i;
                }
                return (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                    className="min-w-[36px] px-2"
                  >
                    {page}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="hidden sm:inline-flex"
            >
              Last
            </Button>
          </div>
        )}
      </div>
    )}
      </>
    )
  }

  if (loading) {
    return <ReturnsPageSkeleton isExchanges={moduleTab === "exchanges"} />
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {!isProcessOpen && (
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">
            {moduleTab === "exchanges" ? "Exchanges" : "Returns"}
          </h1>
          <p className="text-sm md:text-base text-gray-600">
            {moduleTab === "exchanges"
              ? "Process full or partial exchanges with price difference handling."
              : "Process full or partial returns with refund options and inventory disposition."}
          </p>
        </div>
        {(moduleTab === "returns" || moduleTab === "exchanges") && (
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 shrink-0 w-full lg:w-auto">
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setShowFilters((v) => !v)}
            >
              <Filter className="mr-2 h-4 w-4" />
              Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </Button>
            <Button className="w-full sm:w-auto" onClick={openProcessDialog}>
              {moduleTab === "exchanges" ? (
                <>
                  <ArrowLeftRight className="w-4 h-4 mr-2" />
                  Process Exchange
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Process Return
                </>
              )}
            </Button>
          </div>
        )}
      </div>
      )}

      {isProcessOpen && (
        <div className="space-y-4 min-w-0">
          <PageHeader
            title={newReturn.returnType === "EXCHANGE" ? "Process Exchange" : "Process Return"}
            description={
              newReturn.returnType === "EXCHANGE"
                ? "Return selected items and issue replacement products. Price difference is calculated automatically."
                : "Return items from an original sale and issue a refund."
            }
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={closeProcessView}
                disabled={processingReturn || saleDetailsLoading}
              >
                Cancel
              </Button>
            }
          />
            <div className="space-y-4 min-w-0">
              <div className="space-y-2" ref={saleDropdownRef}>
                <Label htmlFor="sale-search">Select Sale *</Label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    ref={saleSearchInputRef}
                    id="sale-search"
                    placeholder="Search by sale #, customer name, or email"
                    value={saleSearch}
                    onFocus={() => setSaleDropdownOpen(true)}
                    autoComplete="off"
                    onPaste={handleSaleSearchPaste}
                    onChange={(e) => {
                      triggerSaleSearch(e.target.value)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        triggerSaleSearch(saleSearch, { immediate: true })
                      }
                    }}
                    className="pl-9 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-gray-300"
                  />
                  {saleDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                      {salesLoading || saleSearchPending ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                          <span className="ml-2 text-sm text-gray-500">Searching sales...</span>
                        </div>
                      ) : filteredSales.length === 0 && ineligibleSaleMatch ? (
                        <div className="px-3 py-6 text-center">
                          <XCircle className="mx-auto mb-2 h-8 w-8 text-amber-400" />
                          <p className="text-sm font-medium text-gray-700">
                            {ineligibleSaleMatch.saleNumber} is {ineligibleSaleMatch.status}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {ineligibleSaleMatch.reason}
                          </p>
                        </div>
                      ) : filteredSales.length === 0 ? (
                        <div className="px-3 py-10 text-center">
                          <Search className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                          <p className="text-sm text-gray-500 font-medium">No matching sales found</p>
                          <p className="text-xs text-gray-400 mt-1">Try a different sale # or customer info</p>
                        </div>
                      ) : (
                        filteredSales.map((sale) => (
                          <button
                            key={sale.id}
                            type="button"
                            className={`w-full shrink-0 px-3 py-2.5 text-left text-sm transition hover:bg-blue-50 ${
                              newReturn.saleId === sale.id
                                ? "bg-blue-50 font-semibold text-blue-900"
                                : "text-gray-800"
                            }`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleSaleSelect(sale.id)}
                          >
                            <div className="flex flex-col">
                              <span>{sale.sale_number}</span>
                              <span className="text-xs text-gray-500">
                                {sale.customer?.name || sale.customer?.email || "No customer"} • Rs{" "}
                                {Math.abs(Number(sale.total_amount)).toLocaleString()}
                              </span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {saleDetailsLoading && <SelectedSaleDetailsSkeleton />}

              {!saleDetailsLoading && selectedSale && (
                <div className="rounded-md bg-gray-50 p-4">
                  <h4 className="font-medium mb-2">Selected Sale Details</h4>
                  <div className="text-sm space-y-1">
                    <div><strong>Sale Number:</strong> {selectedSale.sale_number}</div>
                    <div><strong>Customer:</strong> {selectedSale.customer?.name || selectedSale.customer?.email || "N/A"}</div>
                    <div><strong>Original order amount:</strong> Rs {Math.abs(Number(selectedSale.total_amount)).toLocaleString()}</div>
                    <div><strong>Items in order:</strong> {selectedSale.sale_items.length}</div>
                  </div>
                </div>
              )}

              {(saleDetailsLoading || selectedSale) && (
                <>
              {/* Return scope */}
              <div className="space-y-2">
                <Label>
                  {newReturn.returnType === "EXCHANGE" ? "Exchange type *" : "Return type *"}
                </Label>
                <Tabs
                  value={returnScope}
                  onValueChange={(value) => handleReturnScopeChange(value as "FULL" | "PARTIAL")}
                  className="w-full"
                >
                  <TabsList className="grid h-auto min-h-10 w-full grid-cols-2 gap-1 p-1">
                    <TabsTrigger
                      value="FULL"
                      disabled={saleDetailsLoading}
                      className="w-full whitespace-normal px-2 py-2 text-xs sm:text-sm"
                    >
                      {newReturn.returnType === "EXCHANGE"
                        ? "Full order exchange"
                        : "Full order return"}
                    </TabsTrigger>
                    <TabsTrigger
                      value="PARTIAL"
                      disabled={saleDetailsLoading}
                      className="w-full whitespace-normal px-2 py-2 text-xs sm:text-sm"
                    >
                      {newReturn.returnType === "EXCHANGE" ? "Partial exchange" : "Partial return"}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="return-reason">Return reason (optional)</Label>
                  <Select
                    value={returnReason || undefined}
                    onValueChange={(v) => setReturnReason(v as ReturnReason)}
                    disabled={saleDetailsLoading}
                  >
                    <SelectTrigger id="return-reason">
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {RETURN_REASONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {newReturn.returnType === "REFUND" && (
                  <div className="space-y-2">
                    <Label htmlFor="refund-method">Refund option *</Label>
                    <Select
                      value={newReturn.refundMethod || ""}
                      disabled={saleDetailsLoading}
                      onValueChange={(value) => {
                        setNewReturn((prev) => ({ ...prev, refundMethod: value }))
                        if (formErrors.refundMethod) {
                          setFormErrors((prev) => ({ ...prev, refundMethod: undefined }))
                        }
                      }}
                    >
                      <SelectTrigger
                        id="refund-method"
                        aria-invalid={formErrors.refundMethod ? true : undefined}
                        className={
                          formErrors.refundMethod
                            ? "border-red-500 focus:ring-red-500 focus-visible:ring-red-500"
                            : ""
                        }
                      >
                        <SelectValue placeholder="Select refund method" />
                      </SelectTrigger>
                      <SelectContent>
                        {REFUND_METHODS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formErrors.refundMethod && (
                      <p className="text-sm text-red-600 mt-1" role="alert">
                        {formErrors.refundMethod}
                      </p>
                    )}
                  </div>
                )}

                {newReturn.returnType === "EXCHANGE" && (
                  <div className="space-y-2">
                    <Label htmlFor="exchange-payment-option">Exchange payment option *</Label>
                    <Select
                      value={exchangePaymentOption}
                      disabled={saleDetailsLoading}
                      onValueChange={(value) => {
                        setExchangePaymentOption(value as ExchangePaymentOption)
                        if (value === "store_credit") {
                          setExchangeBalanceAction("store_credit")
                        } else {
                          setExchangeBalanceAction("collect")
                        }
                      }}
                    >
                      <SelectTrigger id="exchange-payment-option">
                        <SelectValue placeholder="Select payment option" />
                      </SelectTrigger>
                      <SelectContent>
                        {EXCHANGE_PAYMENT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
                </>
              )}

              {formErrors.items && (
                <p className="text-sm text-red-600" role="alert">
                  {formErrors.items}
                </p>
              )}
              {formErrors.exchangeItems && (
                <p className="text-sm text-red-600" role="alert">
                  {formErrors.exchangeItems}
                </p>
              )}

              {(saleDetailsLoading || selectedSale) && (
                <div className="space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <Label>Products from original order</Label>
                    <Input
                      placeholder="Filter by name or SKU"
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      className="w-full sm:max-w-xs h-8 text-sm"
                      disabled={saleDetailsLoading}
                    />
                  </div>

                  {saleDetailsLoading ? (
                    <ReturnProductsTableSkeleton />
                  ) : selectedReturnItems.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-500">
                      No returnable items remain on this sale.
                    </div>
                  ) : (
                    <>
                      {/* Mobile product cards */}
                      <div className="space-y-3 md:hidden">
                        {filteredSelectedItems.map((item) => {
                          const isItemSelected = item.selected
                          const qtyDisabled =
                            saleDetailsLoading || returnScope === "FULL" || !isItemSelected
                          const qtyDraft = returnQuantityInputs[item.productId]
                          const qtyHasError =
                            qtyDraft !== undefined &&
                            exceedsReturnableQuantity(qtyDraft, item.remainingQuantity)

                          return (
                            <div
                              key={item.productId}
                              className={cn(
                                "rounded-lg border p-3 space-y-3",
                                isItemSelected ? "border-blue-300 bg-blue-50/40" : "bg-white",
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  checked={isItemSelected}
                                  disabled={saleDetailsLoading || returnScope === "FULL"}
                                  onCheckedChange={(checked) =>
                                    handleReturnItemToggle(item.productId, checked === true)
                                  }
                                  aria-label={`Select ${item.productName} for return`}
                                  className="mt-1"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-sm leading-snug">{item.productName}</p>
                                  <p className="text-xs text-gray-500 mt-0.5">SKU: {item.sku}</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                  <p className="text-xs text-gray-500">Purchased</p>
                                  <p className="font-medium">{item.originalQuantity}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500">Returnable</p>
                                  <p className="font-medium">{item.remainingQuantity}</p>
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <p className="text-xs text-gray-500">Qty to return</p>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const step = getReturnQtyStep(item.remainingQuantity)
                                      const nextQty = Number(
                                        Math.max(0, item.returnQuantity - step).toFixed(3),
                                      )
                                      if (nextQty <= 0 && returnScope === "PARTIAL") {
                                        handleReturnItemToggle(item.productId, false)
                                        return
                                      }
                                      handleReturnQuantityChange(item.productId, nextQty)
                                    }}
                                    disabled={qtyDisabled || item.returnQuantity <= 0}
                                  >
                                    <Minus className="w-3 h-3" />
                                  </Button>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    disabled={qtyDisabled}
                                    value={
                                      returnQuantityInputs[item.productId] !== undefined
                                        ? returnQuantityInputs[item.productId]
                                        : item.returnQuantity === 0
                                          ? ""
                                          : String(item.returnQuantity)
                                    }
                                    onChange={(e) => {
                                      handleReturnQuantityInputChange(item.productId, e.target.value)
                                    }}
                                    onBlur={(e) => {
                                      commitReturnQuantityInput(item.productId, e.target.value)
                                    }}
                                    aria-invalid={qtyHasError || undefined}
                                    className={cn(
                                      "flex-1 text-center h-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                                      qtyHasError &&
                                        "border-red-500 focus-visible:ring-red-500",
                                    )}
                                  />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const step = getReturnQtyStep(item.remainingQuantity)
                                      handleReturnQuantityChange(
                                        item.productId,
                                        Number(
                                          Math.min(
                                            item.remainingQuantity,
                                            item.returnQuantity + step,
                                          ).toFixed(3),
                                        ),
                                      )
                                    }}
                                    disabled={
                                      qtyDisabled || item.returnQuantity >= item.remainingQuantity
                                    }
                                  >
                                    <Plus className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <p className="text-xs text-gray-500">Inventory</p>
                                <Select
                                  value={item.disposition}
                                  disabled={!isItemSelected || saleDetailsLoading}
                                  onValueChange={(v) =>
                                    handleDispositionChange(
                                      item.productId,
                                      v as InventoryDisposition,
                                    )
                                  }
                                >
                                  <SelectTrigger className="h-9 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {INVENTORY_DISPOSITIONS.map((d) => (
                                      <SelectItem key={d.value} value={d.value}>
                                        {d.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Desktop product table */}
                      <div className="hidden md:block rounded-lg border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10" />
                            <TableHead>Product</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>Purchased</TableHead>
                            <TableHead>Returnable</TableHead>
                            <TableHead>Qty</TableHead>
                            <TableHead>Inventory</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredSelectedItems.map((item) => {
                            const isItemSelected = item.selected
                            const qtyDisabled =
                              saleDetailsLoading || returnScope === "FULL" || !isItemSelected
                            const qtyDraft = returnQuantityInputs[item.productId]
                            const qtyHasError =
                              qtyDraft !== undefined &&
                              exceedsReturnableQuantity(qtyDraft, item.remainingQuantity)

                            return (
                            <TableRow key={item.productId}>
                              <TableCell>
                                <Checkbox
                                  checked={isItemSelected}
                                  disabled={saleDetailsLoading || returnScope === "FULL"}
                                  onCheckedChange={(checked) =>
                                    handleReturnItemToggle(item.productId, checked === true)
                                  }
                                  aria-label={`Select ${item.productName} for return`}
                                />
                              </TableCell>
                              <TableCell className="font-medium">{item.productName}</TableCell>
                              <TableCell>{item.sku}</TableCell>
                              <TableCell>{item.originalQuantity}</TableCell>
                              <TableCell>{item.remainingQuantity}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const step = getReturnQtyStep(item.remainingQuantity)
                                      const nextQty = Number(
                                        Math.max(0, item.returnQuantity - step).toFixed(3),
                                      )
                                      if (nextQty <= 0 && returnScope === "PARTIAL") {
                                        handleReturnItemToggle(item.productId, false)
                                        return
                                      }
                                      handleReturnQuantityChange(item.productId, nextQty)
                                    }}
                                    disabled={qtyDisabled || item.returnQuantity <= 0}
                                  >
                                    <Minus className="w-3 h-3" />
                                  </Button>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    disabled={qtyDisabled}
                                    value={
                                      returnQuantityInputs[item.productId] !== undefined
                                        ? returnQuantityInputs[item.productId]
                                        : item.returnQuantity === 0
                                          ? ""
                                          : String(item.returnQuantity)
                                    }
                                    onChange={(e) => {
                                      handleReturnQuantityInputChange(item.productId, e.target.value)
                                    }}
                                    onBlur={(e) => {
                                      commitReturnQuantityInput(item.productId, e.target.value)
                                    }}
                                    aria-invalid={qtyHasError || undefined}
                                    className={cn(
                                      "w-16 text-center h-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                                      qtyHasError &&
                                        "border-red-500 focus-visible:ring-red-500",
                                    )}
                                  />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const step = getReturnQtyStep(item.remainingQuantity)
                                      handleReturnQuantityChange(
                                        item.productId,
                                        Number(Math.min(item.remainingQuantity, item.returnQuantity + step).toFixed(3)),
                                      )
                                    }}
                                    disabled={qtyDisabled || item.returnQuantity >= item.remainingQuantity}
                                  >
                                    <Plus className="w-3 h-3" />
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={item.disposition}
                                  disabled={!isItemSelected || saleDetailsLoading}
                                  onValueChange={(v) => handleDispositionChange(item.productId, v as InventoryDisposition)}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {INVENTORY_DISPOSITIONS.map((d) => (
                                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            </TableRow>
                          )})}
                        </TableBody>
                      </Table>
                    </div>
                    </>
                  )}
                </div>
              )}

              {/* Replacement products — card grid (Exchange only) */}
              {newReturn.returnType === "EXCHANGE" && (saleDetailsLoading || selectedSale) && (
                <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-gray-500" />
                      <Label className="text-base font-semibold">Replacement products</Label>
                    </div>
                    <Badge variant="secondary">{products.length} in catalog</Badge>
                  </div>

                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      ref={exchangeProductSearchRef}
                      id="exchange-product-search"
                      placeholder="Search name or SKU — Enter to add match"
                      value={exchangeProductSearch}
                      autoComplete="off"
                      onChange={(e) => setExchangeProductSearch(e.target.value)}
                      onKeyDown={handleExchangeSearchKeyDown}
                      className="pl-9"
                      disabled={productsLoading}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={exchangeCategoryFilter === "all" ? "default" : "outline"}
                      onClick={() => setExchangeCategoryFilter("all")}
                      disabled={productsLoading}
                    >
                      All
                    </Button>
                    {exchangeCategories.map((category) => (
                      <Button
                        key={category.id}
                        type="button"
                        size="sm"
                        variant={exchangeCategoryFilter === category.id ? "default" : "outline"}
                        onClick={() => setExchangeCategoryFilter(category.id)}
                        disabled={productsLoading}
                        className="whitespace-nowrap"
                      >
                        {category.name}
                      </Button>
                    ))}
                  </div>

                  <p className="text-xs text-gray-500">
                    Tap a card to add · {filteredExchangeProducts.length} shown
                  </p>

                  {productsLoading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                      {Array.from({ length: 10 }).map((_, index) => (
                        <Skeleton key={index} className="h-24 rounded-md" />
                      ))}
                    </div>
                  ) : filteredExchangeProducts.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-500">
                      No matching products found.
                    </div>
                  ) : (
                    <div className="max-h-[320px] overflow-y-auto rounded-lg border border-gray-100 p-2">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                        {filteredExchangeProducts.map((product) => {
                          const selectedItem = exchangeItems.find(
                            (item) => item.productId === product.id,
                          )
                          const price = getProductSalePrice(product)

                          return (
                            <button
                              key={product.id}
                              type="button"
                              onClick={() => handleExchangeProductSelect(product.id)}
                              className={cn(
                                "flex min-h-[5.5rem] flex-col rounded-md border p-2 text-left transition hover:border-blue-400 hover:bg-blue-50/60",
                                selectedItem && "border-blue-500 bg-blue-50 shadow-sm",
                              )}
                            >
                              <span className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2">
                                {product.name}
                              </span>
                              <span className="mt-1 text-sm font-bold text-blue-600">
                                Rs {formatMoney(price)}
                              </span>
                              <span className="mt-auto pt-1 text-[10px] text-gray-500 truncate">
                                {product.sku || "—"}
                              </span>
                              {selectedItem && selectedItem.quantity > 0 && (
                                <Badge className="mt-1 w-fit bg-blue-600 text-[10px] px-1.5 py-0">
                                  Qty {selectedItem.quantity}
                                </Badge>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {exchangeItems.length > 0 && (
                    <div className="space-y-3 rounded-lg border p-4">
                      <Label>Selected replacement items</Label>
                      {exchangeItems.map((item) => (
                        <div
                          key={item.productId}
                          className="flex flex-col gap-3 rounded border bg-gray-50/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex-1">
                            <div className="font-medium">{item.productName}</div>
                            <div className="text-sm text-gray-500">
                              SKU: {item.sku} • Rs {formatMoney(item.price)}
                            </div>
                            <div className="text-sm font-semibold text-green-700 mt-0.5">
                              Subtotal: Rs {formatMoney(item.quantity * item.price)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleExchangeQuantityChange(
                                  item.productId,
                                  Math.max(0, Number((item.quantity - 1).toFixed(3))),
                                )
                              }
                              disabled={item.quantity <= 0}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.001"
                              min="0"
                              value={
                                exchangeQtyDrafts[item.productId] ?? String(item.quantity)
                              }
                              onChange={(e) => {
                                const v = e.target.value
                                setExchangeQtyDrafts((d) => ({
                                  ...d,
                                  [item.productId]: v,
                                }))
                                if (v === "") {
                                  handleExchangeQuantityChange(item.productId, 0)
                                  return
                                }
                                const n = Number(v)
                                if (Number.isFinite(n) && n >= 0) {
                                  handleExchangeQuantityChange(item.productId, n)
                                }
                              }}
                              onBlur={() => {
                                setExchangeQtyDrafts((d) => {
                                  const { [item.productId]: _drop, ...rest } = d
                                  return rest
                                })
                              }}
                              className="w-20 text-center font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            {item.unit && (
                              <span className="text-sm text-gray-500 min-w-[2rem]">{item.unit}</span>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleExchangeQuantityChange(
                                  item.productId,
                                  Number((item.quantity + 1).toFixed(3)),
                                )
                              }
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => removeExchangeItem(item.productId)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )}

              {!saleDetailsLoading && selectedSale && paymentSettlement && (
                <PaymentSettlementPanel
                  settlement={paymentSettlement}
                  title="Customer payment details"
                  showSettlementMethod={newReturn.returnType === "EXCHANGE"}
                  exchangeBalanceAction={exchangeBalanceAction}
                  onExchangeBalanceActionChange={setExchangeBalanceAction}
                />
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes about the return"
                  value={newReturn.notes}
                  onChange={(e) => setNewReturn((prev) => ({ ...prev, notes: e.target.value }))}
                  disabled={saleDetailsLoading}
                />
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end sticky bottom-0 bg-background border-t pt-4 pb-1">
              <Button 
                variant="outline" 
                className="w-full sm:w-auto"
                onClick={closeProcessView}
                disabled={processingReturn || saleDetailsLoading}
              >
                Cancel
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={handleProcessReturn}
                disabled={processingReturn || saleDetailsLoading}
              >
                {processingReturn && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {processingReturn
                  ? newReturn.returnType === "EXCHANGE"
                    ? "Processing exchange..."
                    : "Processing refund..."
                  : "Review & confirm"}
              </Button>
            </div>
        </div>
      )}

      {!isProcessOpen && (
      <>
      {!hideModuleTabs && (
        <Tabs
          value={moduleTab}
          onValueChange={(v) => setModuleTab(v as ReturnsModuleTab)}
          className="space-y-4"
        >
          <TabsList className="grid w-full max-w-md grid-cols-2 h-auto">
            <TabsTrigger value="returns" className="text-sm">Returns</TabsTrigger>
            <TabsTrigger value="exchanges" className="text-sm">Exchanges</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {(moduleTab === "returns" || moduleTab === "exchanges") && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {moduleTab === "returns" ? (
              <>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Returns</CardTitle>
                    <RotateCcw className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totalRefundCount}</div>
                    <p className="text-xs text-muted-foreground">{statsScopeLabel}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Return Value</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      Rs {totalRefundValue.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">{statsScopeLabel}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg. Return</CardTitle>
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      Rs {Math.round(averageRefundValue).toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">Per return</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Return Rate</CardTitle>
                    <RotateCcw className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{returnRate}%</div>
                    <p className="text-xs text-muted-foreground">Of total sales</p>
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Exchanges</CardTitle>
                    <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totalExchangeCount}</div>
                    <p className="text-xs text-muted-foreground">{statsScopeLabel}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Exchange Value</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      Rs {totalExchangeValue.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">{statsScopeLabel}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg. Exchange</CardTitle>
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      Rs {Math.round(averageExchangeValue).toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">Per exchange</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Exchange Rate</CardTitle>
                    <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{exchangeRate}%</div>
                    <p className="text-xs text-muted-foreground">Of total sales</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {showFilters && (
            <Card className="border-gray-200 shadow-sm">
              <CardContent className="pt-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <div className="relative xl:col-span-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      className="pl-9"
                      placeholder={
                        moduleTab === "exchanges"
                          ? "Search exchange #, original sale #, customer…"
                          : "Search return #, original sale #, customer…"
                      }
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  <div>
                    <Select
                      value={datePreset}
                      onValueChange={(v) => setDatePreset(v as DatePreset)}
                    >
                      <SelectTrigger>
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

                  <div>
                    <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Payment method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Payment Methods</SelectItem>
                        {availablePaymentMethods.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs text-gray-500">Min amount (Rs)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="e.g. 500"
                      value={amountMin}
                      onChange={(e) => setAmountMin(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-gray-500">Max amount (Rs)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="e.g. 5000"
                      value={amountMax}
                      onChange={(e) => setAmountMax(e.target.value)}
                    />
                  </div>
                </div>

                {datePreset === "custom" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">From</Label>
                      <DatePicker
                        date={customStart}
                        onDateChange={setCustomStart}
                        placeholder="Pick start date"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">To</Label>
                      <DatePicker
                        date={customEnd}
                        onDateChange={setCustomEnd}
                        placeholder="Pick end date"
                      />
                    </div>
                  </div>
                )}

                {activeFilterCount > 0 && (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearHistoryFilters}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <X className="mr-1 h-4 w-4" /> Clear filters
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {(moduleTab === "returns" || moduleTab === "exchanges") &&
            normalizeSaleSearchTerm(searchTerm) &&
            activeHistory.length === 0 &&
            pageSearchMatchingSales.length > 0 && (
              <Alert className="border-green-200 bg-green-50 text-green-950">
                <CheckCircle className="h-4 w-4 text-green-700" />
                <AlertTitle>
                  {moduleTab === "exchanges"
                    ? "Matching sales ready for exchange"
                    : "Matching sales ready for return"}
                </AlertTitle>
                <AlertDescription>
                  {moduleTab === "exchanges"
                    ? "These sales can be exchanged. Start the exchange flow directly from here."
                    : "These sales have not been returned yet. You can start the return flow directly from here."}
                </AlertDescription>
                <div className="mt-4 space-y-3">
                  {pageSearchMatchingSales.map((sale) => (
                    <div
                      key={sale.id}
                      className="flex flex-col gap-3 rounded-lg border border-green-200 bg-white/80 p-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{sale.sale_number}</span>
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                            {moduleTab === "exchanges" ? "READY FOR EXCHANGE" : "READY FOR RETURN"}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 truncate">
                          {sale.customer?.name || sale.customer?.email || "Walk-in customer"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(sale.sale_date).toLocaleDateString()} | Rs{" "}
                          {Math.abs(Number(sale.total_amount)).toLocaleString()}
                        </div>
                      </div>
                      <Button
                        className="w-full md:w-auto shrink-0"
                        onClick={() =>
                          moduleTab === "exchanges"
                            ? handleStartExchangeForSale(sale.id)
                            : handleStartReturnForSale(sale.id)
                        }
                      >
                        {moduleTab === "exchanges" ? "Process Exchange" : "Process Return"}
                      </Button>
                    </div>
                  ))}
                </div>
              </Alert>
            )}

          {(moduleTab === "returns" || moduleTab === "exchanges") &&
            normalizeSaleSearchTerm(searchTerm) &&
            activeHistory.length === 0 &&
            pageSearchMatchingSales.length === 0 &&
            pageSearchIneligibleSaleMatch && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                <XCircle className="h-4 w-4 text-amber-700" />
                <AlertTitle>
                  {pageSearchIneligibleSaleMatch.saleNumber} is {pageSearchIneligibleSaleMatch.status}
                </AlertTitle>
                <AlertDescription>{pageSearchIneligibleSaleMatch.reason}</AlertDescription>
              </Alert>
            )}

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">
              {moduleTab === "exchanges" ? "Exchange history" : "Return history"}
            </h2>
            <p className="text-sm text-gray-600">
              Completed {moduleTab === "exchanges" ? "exchange" : "return"} transactions (
              {activeHistory.length}
              {activeFilterCount > 0 ? " matching filters" : ""}) — click the eye icon for
              line-item details
            </p>
            <Card>
              <CardContent className="pt-6">
                {renderReturnsTable(activeHistory, {
                  emptyMessage:
                    moduleTab === "exchanges"
                      ? normalizeSaleSearchTerm(searchTerm) &&
                        pageSearchMatchingSales.length > 0
                        ? "No exchange history found for this search. Matching sales are shown above."
                        : activeFilterCount > 0
                          ? "No exchange history matches your filters."
                          : "No exchanges found"
                      : activeFilterCount > 0
                        ? normalizeSaleSearchTerm(searchTerm) &&
                          pageSearchMatchingSales.length > 0
                          ? "No return history matches your filters. Matching sales are shown above."
                          : "No return history matches your filters."
                        : undefined,
                  recordLabel: moduleTab === "exchanges" ? "exchanges" : "returns",
                })}
              </CardContent>
            </Card>
          </div>
        </>
      )}
      </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg max-h-[90dvh] overflow-y-auto overflow-x-hidden min-w-0 p-4 sm:p-6">
          <DialogHeader className="pr-6">
            <DialogTitle>Confirm {newReturn.returnType === "EXCHANGE" ? "exchange" : "return"}</DialogTitle>
            <DialogDescription>Review payment details before completing.</DialogDescription>
          </DialogHeader>
          {paymentSettlement ? (
            <PaymentSettlementPanel settlement={paymentSettlement} title="Confirm payment details" />
          ) : (
            <p className="text-sm text-gray-500">Select a sale and items to see payment details.</p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button className="w-full sm:w-auto" onClick={submitReturnOrExchange} disabled={processingReturn}>
              {processingReturn && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm & complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View return / exchange details */}
      <DetailSheet
        open={isViewOpen}
        onOpenChange={(open) => {
          setIsViewOpen(open)
          if (!open) {
            setReturnDetailsAfterCompletion(false)
          }
        }}
        size="xl"
      >
        <DetailSheetHeader
          title={
            returnDetailsAfterCompletion
              ? selectedReturn?.status === "EXCHANGED"
                ? "Exchange completed"
                : "Return completed"
              : selectedReturnSummary?.transactionType === "EXCHANGE"
                ? `Exchange Details — ${selectedReturn?.sale_number || selectedReturn?.id}`
                : `Return Details — ${selectedReturn?.sale_number || selectedReturn?.id}`
          }
          subtitle={
            returnDetailsAfterCompletion
              ? "Transaction completed successfully. Review the breakdown below, then print or share the receipt."
              : "Full return / exchange breakdown with items and settlement."
          }
        />
        <DetailSheetBody>
          {selectedReturn && selectedReturnSummary && (
            <div className="space-y-4">
              {returnDetailsAfterCompletion && (
                <Alert className="border-green-200 bg-green-50 text-green-950">
                  <CheckCircle className="h-4 w-4 text-green-700" />
                  <AlertTitle>
                    {selectedReturnSummary.transactionType === "EXCHANGE"
                      ? "Exchange processed successfully"
                      : "Return processed successfully"}
                  </AlertTitle>
                  <AlertDescription>
                    Receipt #{selectedReturn.sale_number}
                    {selectedReturn.original_sale_number
                      ? ` · Original sale ${selectedReturn.original_sale_number}`
                      : ""}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <Card>
                  <CardContent className="pt-4 space-y-1">
                    <p className="text-xs font-semibold uppercase text-gray-500">Transaction</p>
                    <p className="font-semibold">{selectedReturn.sale_number}</p>
                    <p className="text-gray-600">
                      {new Date(selectedReturn.sale_date).toLocaleString()}
                    </p>
                    <Badge className={getStatusColor(selectedReturn.status)}>
                      {getReturnStatusLabel(selectedReturn.status)}
                    </Badge>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 space-y-1">
                    <p className="text-xs font-semibold uppercase text-gray-500">Customer</p>
                    <p className="font-semibold">
                      {selectedReturn.customer?.name ||
                        selectedReturn.customer?.email ||
                        "Walk-in"}
                    </p>
                    {selectedReturn.original_sale_number && (
                      <p className="text-gray-600">
                        Original sale: {selectedReturn.original_sale_number}
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 space-y-1">
                    <p className="text-xs font-semibold uppercase text-gray-500">Type</p>
                    <p className="font-semibold">
                      {selectedReturnSummary.transactionType === "EXCHANGE"
                        ? "Exchange"
                        : "Return / Refund"}
                    </p>
                    {selectedReturnSummary.returnScope && (
                      <p className="text-gray-600">
                        {selectedReturnSummary.returnScope === "FULL"
                          ? "Full order"
                          : "Partial"}
                      </p>
                    )}
                    {selectedReturnSummary.returnReason && (
                      <p className="text-gray-600">
                        Reason: {getReturnReasonLabel(selectedReturnSummary.returnReason)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <PaymentSettlementPanel
                settlement={paymentSettlementFromTransactionSummary(selectedReturnSummary)}
                title="Customer payment details"
              />
              <p className="text-sm text-gray-600 -mt-2">
                Settlement: {selectedReturnSummary.settlementLabel}
              </p>

              {selectedReturnSummary.returnedItems.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base sm:text-lg text-red-800">
                      Returned items ({selectedReturnSummary.returnedItems.length})
                    </CardTitle>
                    <CardDescription>Items taken back from the customer</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {/* Mobile cards */}
                    <div className="space-y-3 p-4 md:hidden">
                      {selectedReturnSummary.returnedItems.map((item, index) => (
                        <div key={`return-m-${index}`} className="rounded-lg border bg-gray-50 p-3 space-y-2">
                          <p className="font-semibold text-sm">{item.productName}</p>
                          <p className="text-xs text-gray-500">SKU: {item.sku}</p>
                          <div className="grid grid-cols-3 gap-2 text-sm pt-1 border-t">
                            <div>
                              <p className="text-xs text-gray-500">Qty</p>
                              <p className="font-medium">{item.quantity}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Unit</p>
                              <p className="font-medium">{formatMoney(item.unitPrice)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-500">Credit</p>
                              <p className="font-semibold text-red-600">-{formatMoney(item.lineTotal)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Unit price</TableHead>
                            <TableHead className="text-right">Credit</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedReturnSummary.returnedItems.map((item, index) => (
                            <TableRow key={`return-${index}`}>
                              <TableCell className="font-medium">{item.productName}</TableCell>
                              <TableCell className="text-gray-500">{item.sku}</TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell className="text-right">
                                {formatMoney(item.unitPrice)}
                              </TableCell>
                              <TableCell className="text-right font-semibold text-red-600">
                                -{formatMoney(item.lineTotal)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {selectedReturnSummary.replacementItems.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base sm:text-lg text-blue-800">
                      Replacement items ({selectedReturnSummary.replacementItems.length})
                    </CardTitle>
                    <CardDescription>New items given to the customer</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {/* Mobile cards */}
                    <div className="space-y-3 p-4 md:hidden">
                      {selectedReturnSummary.replacementItems.map((item, index) => (
                        <div key={`exchange-m-${index}`} className="rounded-lg border bg-gray-50 p-3 space-y-2">
                          <p className="font-semibold text-sm">{item.productName}</p>
                          <p className="text-xs text-gray-500">SKU: {item.sku}</p>
                          <div className="grid grid-cols-3 gap-2 text-sm pt-1 border-t">
                            <div>
                              <p className="text-xs text-gray-500">Qty</p>
                              <p className="font-medium">{item.quantity}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Unit</p>
                              <p className="font-medium">{formatMoney(item.unitPrice)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-500">Amount</p>
                              <p className="font-semibold">{formatMoney(item.lineTotal)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Unit price</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedReturnSummary.replacementItems.map((item, index) => (
                            <TableRow key={`exchange-${index}`}>
                              <TableCell className="font-medium">{item.productName}</TableCell>
                              <TableCell className="text-gray-500">{item.sku}</TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell className="text-right">
                                {formatMoney(item.unitPrice)}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {formatMoney(item.lineTotal)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {selectedReturnSummary.userNotes && (
                <div className="space-y-2">
                  <h3 className="font-medium text-sm">Notes</h3>
                  <div className="bg-gray-50 p-3 rounded-lg text-sm">
                    {selectedReturnSummary.userNotes}
                  </div>
                </div>
              )}
            </div>
          )}
        </DetailSheetBody>
        <DetailSheetFooter>
            <div className="flex flex-col-reverse sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full sm:justify-end">
              <Button variant="outline" onClick={() => setIsViewOpen(false)} size="sm" className="w-full sm:w-auto">
                Close
              </Button>
              {printers.length > 0 && (
                <Button
                  onClick={handleServerPrint}
                  disabled={!receiptPrinter || !receiptData}
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleDownloadReceipt}
                disabled={!receiptData}
                size="sm"
                className="w-full sm:w-auto"
              >
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
              <Button
                onClick={handleShareReceiptOnWhatsApp}
                disabled={!receiptData}
                className="bg-[#25D366] hover:bg-[#1ebe57] text-white w-full sm:w-auto"
                size="sm"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                Share on WhatsApp
              </Button>
            </div>
        </DetailSheetFooter>
      </DetailSheet>
    </div>
  )
}
