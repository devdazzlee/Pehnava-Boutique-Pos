"use client"

import { useState, useEffect, type ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { PageLoader } from "@/components/ui/page-loader"
import {
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet"
import { useLoading } from "@/hooks/use-loading"
import { useToast } from "@/hooks/use-toast"
import {
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  TrendingUp,
  Download,
  Loader2,
  MapPin,
  Building2,
  Wallet,
  CreditCard,
  Smartphone,
  Receipt,
  Boxes,
  Tag,
  UserPlus,
  ArrowUpRight,
  ChevronRight,
  CalendarDays,
} from "lucide-react"
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton"
import apiClient from "@/lib/apiClient"
import { API_BASE } from "@/config/constants"
import { normalizeUserRole, type UserRole } from "@/lib/role-utils"
import { useLogoDataUri } from "@/hooks/use-logo-data-uri"
import { cn } from "@/lib/utils"

const INVENTORY_NAV_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "WAREHOUSE_MANAGER",
  "PURCHASE_MANAGER",
]

interface TopProduct {
  id: string
  name: string
  sku: string
  quantity_sold: number
  order_count: number
  price: number
  category: string
  topBranch: { id: string; name: string; quantity: number } | null
}

interface RecentSale {
  id: string
  saleNumber: string
  totalAmount: string | number
  status: string
  paymentMethod: string
  saleDate: string
  customerName: string
  branch: { id: string; name: string } | null
  productName: string | null
}

interface TodaySale {
  id: string
  sale_number: string
  total_amount: string | number
  status: string
  created_at: string
  branch: { id: string; name: string } | null
}

interface DashboardStats {
  branch: { id: string; name: string } | null
  isAllBranches: boolean
  totalCustomers: number
  newCustomersToday: number
  lowStockProducts: Array<{
    id: string
    current_quantity: number
    product: { name: string; sku: string }
    branch: { id: string; name: string } | null
  }>
  lowStockCount: number
  todaySales: TodaySale[]
  todaySalesCount: number
  todaySalesTotal: number
  paymentBreakdown: Array<{ method: string; total: number; count: number }>
  avgOrderValue: number
  itemsSoldToday: number
  discountToday: number
  taxToday: number
}

interface CustomerRow {
  id: string
  name: string | null
  phone_number: string | null
  email: string | null
  created_at: string
  sale_count?: number
  total_sale_amount?: number
}

interface DashboardHomeProps {
  onNavigate?: (tab: string) => void;
}

type ModalKind = "sales" | "transactions" | "customers" | "lowstock" | null

const PAYMENT_ICON: Record<string, any> = {
  CASH: Wallet,
  CARD: CreditCard,
  ONLINE: Smartphone,
  MOBILE_MONEY: Smartphone,
  BANK_TRANSFER: CreditCard,
  CREDIT: CreditCard,
}

export function DashboardHome({ onNavigate }: DashboardHomeProps) {
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [role, setRole] = useState<UserRole | null>(null)
  const [activeModal, setActiveModal] = useState<ModalKind>(null)
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [customersLoading, setCustomersLoading] = useState(false)
  const [customersFetched, setCustomersFetched] = useState(false)

  const { loading: exportLoading, withLoading: withExportLoading } = useLoading()
  const { toast } = useToast()
  const logoDataUri = useLogoDataUri()
  const canOpenInventory = role ? INVENTORY_NAV_ROLES.includes(role) : false
  const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN"

  const getTopProducts = async () => {
    try {
      const response = await apiClient.get('/products/best-selling')
      if (response?.data?.success) {
        setTopProducts(response.data.data || [])
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Top Products Error",
        description: error.response?.data?.message || "Failed to fetch top products"
      })
    }
  }

  const getRecentSales = async () => {
    try {
      const response = await apiClient.get('/sale/recent', { params: { limit: 20 } })
      if (response?.data?.success) {
        setRecentSales(response.data.data || [])
      } else {
        setRecentSales([])
      }
    } catch (error: any) {
      setRecentSales([])
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.message || "Failed to fetch recent sales"
      })
    }
  }

  const getStats = async () => {
    try {
      const response = await apiClient.get('/dashboard/stats')
      if (response?.data?.success) {
        setStats(response.data.data || null)
      } else {
        setStats(null)
      }
    } catch (error: any) {
      setStats(null)
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.message || "Failed to fetch dashboard stats"
      })
    }
  }

  const loadAllData = async () => {
    await Promise.all([
      getTopProducts(),
      getRecentSales(),
      getStats()
    ])
    setInitialLoading(false)
  }

  useEffect(() => {
    setRole(normalizeUserRole(localStorage.getItem("role")))
    loadAllData()
  }, [])

  useEffect(() => {
    if (activeModal !== "customers" || customersFetched) return
    setCustomersLoading(true)
    apiClient
      .get(`${API_BASE}/customer`)
      .then((res) => {
        const list: CustomerRow[] = res.data?.data || []
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setCustomers(list)
        setCustomersFetched(true)
      })
      .catch((error: any) => {
        toast({
          variant: "destructive",
          title: "Error",
          description: error.response?.data?.message || "Failed to load customers",
        })
      })
      .finally(() => setCustomersLoading(false))
  }, [activeModal, customersFetched])

  type PdfCol = { label: string; width: number; align?: "right" }

  const generateReport = async (): Promise<string> => {
    if (!stats) throw new Error("No dashboard data loaded yet")

    const { jsPDF } = await import("jspdf")
    const doc = new jsPDF({ unit: "mm", format: "a4" })

    const pageWidth = 210
    const pageHeight = 297
    const margin = 14
    const usableWidth = pageWidth - margin * 2
    const bottomLimit = pageHeight - 16
    const generatedAt = new Date()
    const scopeLabel = stats.branch ? stats.branch.name : "All Branches"
    let y = margin

    const shortTime = (d: string) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

    // ---------- Header band ----------
    const bandHeight = 28
    doc.setFillColor(15, 23, 42) // slate-900
    doc.rect(0, 0, pageWidth, bandHeight, "F")

    let textX = margin
    if (logoDataUri) {
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image()
          el.onload = () => resolve(el)
          el.onerror = reject
          el.src = logoDataUri
        })
        const aspect = img.naturalWidth / img.naturalHeight || 2.6
        const maxH = 12
        let imgH = maxH
        let imgW = imgH * aspect
        if (imgW > 46) {
          imgW = 46
          imgH = imgW / aspect
        }
        doc.addImage(logoDataUri, "PNG", margin, (bandHeight - imgH) / 2, imgW, imgH)
        textX = margin + imgW + 5
      } catch {
        // ignore — image load failed; header continues without logo
      }
    }

    doc.setTextColor(255, 255, 255)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(12)
    doc.text("Pehnawa Boutique Pos", textX, 13)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.text("Daily Sales Report", textX, 19.5)

    doc.setFontSize(8)
    doc.text(`Generated ${generatedAt.toLocaleString()}`, pageWidth - margin, 11, { align: "right" })
    doc.text(`Scope: ${scopeLabel}`, pageWidth - margin, 16.5, { align: "right" })
    doc.text(`${stats.totalCustomers} total customers`, pageWidth - margin, 22, { align: "right" })

    y = bandHeight + 8

    // ---------- Summary KPI tiles (mirrors the dashboard's 4 stat cards) ----------
    const kpis: { label: string; value: string; sub: string }[] = [
      { label: "TODAY'S SALES", value: formatCurrency(stats.todaySalesTotal), sub: `${stats.todaySalesCount} transactions` },
      { label: "RECENT TRANSACTIONS", value: String(recentSales.length), sub: "Latest activity" },
      { label: "TOTAL CUSTOMERS", value: String(stats.totalCustomers), sub: `+${stats.newCustomersToday} new today` },
      { label: "LOW STOCK ITEMS", value: String(stats.lowStockCount), sub: "Need restock" },
    ]
    const boxGap = 4
    const boxW = (usableWidth - boxGap * 3) / 4
    const boxH = 22
    kpis.forEach((kpi, i) => {
      const x = margin + i * (boxW + boxGap)
      doc.setDrawColor(226, 232, 240)
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(x, y, boxW, boxH, 2, 2, "FD")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(6.3)
      doc.setTextColor(100, 116, 139)
      doc.text(kpi.label, x + 3, y + 6)
      doc.setFontSize(11)
      doc.setTextColor(15, 23, 42)
      doc.text(kpi.value, x + 3, y + 13)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(6.3)
      doc.setTextColor(100, 116, 139)
      doc.text(kpi.sub, x + 3, y + 18)
    })
    y += boxH + 10

    const ensureSpace = (needed: number) => {
      if (y + needed > bottomLimit) {
        doc.addPage()
        y = margin
      }
    }

    const drawSectionTitle = (title: string) => {
      ensureSpace(12)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(11)
      doc.setTextColor(15, 23, 42)
      doc.text(title, margin, y)
      doc.setDrawColor(37, 99, 235)
      doc.setLineWidth(0.6)
      doc.line(margin, y + 1.6, margin + 10, y + 1.6)
      y += 7
    }

    const drawTableHeader = (cols: PdfCol[]) => {
      doc.setFillColor(241, 245, 249)
      doc.rect(margin, y, usableWidth, 6.5, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7)
      doc.setTextColor(51, 65, 85)
      let x = margin
      cols.forEach((c) => {
        const tx = c.align === "right" ? x + c.width - 2 : x + 2
        doc.text(c.label, tx, y + 4.4, c.align === "right" ? { align: "right" } : undefined)
        x += c.width
      })
      y += 6.5
    }

    const drawTable = (title: string, cols: PdfCol[], rows: (string | number)[][]) => {
      drawSectionTitle(title)
      drawTableHeader(cols)
      if (!rows.length) {
        doc.setFont("helvetica", "italic")
        doc.setFontSize(8)
        doc.setTextColor(148, 163, 184)
        doc.text("No data available", margin + 2, y + 4.5)
        y += 8
        return
      }
      const rowH = 6.2
      rows.forEach((row, idx) => {
        if (y + rowH > bottomLimit) {
          doc.addPage()
          y = margin
          drawTableHeader(cols)
        }
        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252)
          doc.rect(margin, y, usableWidth, rowH, "F")
        }
        doc.setFont("helvetica", "normal")
        doc.setFontSize(7.2)
        doc.setTextColor(30, 41, 59)
        let x = margin
        row.forEach((cell, ci) => {
          const c = cols[ci]
          const tx = c.align === "right" ? x + c.width - 2 : x + 2
          const text = doc.splitTextToSize(String(cell ?? "-"), c.width - 4)[0] ?? ""
          doc.text(text, tx, y + rowH - 1.8, c.align === "right" ? { align: "right" } : undefined)
          x += c.width
        })
        y += rowH
      })
      y += 6
    }

    // ---------- Today's Sales (exact match of the Today's Sales KPI + modal) ----------
    const todaySalesCols: PdfCol[] = isAdmin
      ? [
          { label: "SALE #", width: 42 },
          { label: "BRANCH", width: 38 },
          { label: "TIME", width: 26 },
          { label: "STATUS", width: 26 },
          { label: "AMOUNT", width: usableWidth - 42 - 38 - 26 - 26, align: "right" },
        ]
      : [
          { label: "SALE #", width: 55 },
          { label: "TIME", width: 40 },
          { label: "STATUS", width: 35 },
          { label: "AMOUNT", width: usableWidth - 55 - 40 - 35, align: "right" },
        ]
    const todaySalesRows = stats.todaySales.map((s) =>
      isAdmin
        ? [s.sale_number, s.branch?.name || "-", shortTime(s.created_at), s.status, formatCurrency(s.total_amount)]
        : [s.sale_number, shortTime(s.created_at), s.status, formatCurrency(s.total_amount)],
    )
    drawTable(`Today's Sales — ${formatCurrency(stats.todaySalesTotal)}`, todaySalesCols, todaySalesRows)

    // ---------- Recent Transactions ----------
    const recentCols: PdfCol[] = isAdmin
      ? [
          { label: "CUSTOMER", width: 38 },
          { label: "SALE #", width: 32 },
          { label: "BRANCH", width: 30 },
          { label: "TIME", width: 25 },
          { label: "STATUS", width: 22 },
          { label: "AMOUNT", width: usableWidth - 38 - 32 - 30 - 25 - 22, align: "right" },
        ]
      : [
          { label: "CUSTOMER", width: 48 },
          { label: "SALE #", width: 42 },
          { label: "TIME", width: 30 },
          { label: "STATUS", width: 25 },
          { label: "AMOUNT", width: usableWidth - 48 - 42 - 30 - 25, align: "right" },
        ]
    const recentRows = recentSales.map((sale) =>
      isAdmin
        ? [sale.customerName, sale.saleNumber, sale.branch?.name || "-", shortTime(sale.saleDate), sale.status, formatCurrency(sale.totalAmount)]
        : [sale.customerName, sale.saleNumber, shortTime(sale.saleDate), sale.status, formatCurrency(sale.totalAmount)],
    )
    drawTable("Recent Transactions", recentCols, recentRows)

    // ---------- Top Products ----------
    const topCols: PdfCol[] = isAdmin
      ? [
          { label: "#", width: 8 },
          { label: "PRODUCT", width: 46 },
          { label: "CATEGORY", width: 26 },
          { label: "BRANCH", width: 30 },
          { label: "ORDERS", width: 18 },
          { label: "SOLD", width: 18 },
          { label: "PRICE", width: usableWidth - 8 - 46 - 26 - 30 - 18 - 18, align: "right" },
        ]
      : [
          { label: "#", width: 8 },
          { label: "PRODUCT", width: 64 },
          { label: "CATEGORY", width: 32 },
          { label: "ORDERS", width: 20 },
          { label: "SOLD", width: 20 },
          { label: "PRICE", width: usableWidth - 8 - 64 - 32 - 20 - 20, align: "right" },
        ]
    const topRows = topProducts.map((product, index) =>
      isAdmin
        ? [index + 1, product.name, product.category, product.topBranch?.name || "-", product.order_count, product.quantity_sold, formatCurrency(product.price)]
        : [index + 1, product.name, product.category, product.order_count, product.quantity_sold, formatCurrency(product.price)],
    )
    drawTable("Top Products", topCols, topRows)

    // ---------- Payment Methods Today ----------
    const paymentCols: PdfCol[] = [
      { label: "METHOD", width: 70 },
      { label: "TRANSACTIONS", width: 60 },
      { label: "TOTAL", width: usableWidth - 70 - 60, align: "right" },
    ]
    const paymentRows = stats.paymentBreakdown.map((p) => [
      p.method.charAt(0) + p.method.slice(1).toLowerCase(),
      p.count,
      formatCurrency(p.total),
    ])
    drawTable("Payment Methods Today", paymentCols, paymentRows)

    // ---------- Low Stock Alerts ----------
    const lowStockCols: PdfCol[] = isAdmin
      ? [
          { label: "PRODUCT", width: 62 },
          { label: "SKU", width: 36 },
          { label: "BRANCH", width: 42 },
          { label: "QTY LEFT", width: usableWidth - 62 - 36 - 42, align: "right" },
        ]
      : [
          { label: "PRODUCT", width: 90 },
          { label: "SKU", width: 50 },
          { label: "QTY LEFT", width: usableWidth - 90 - 50, align: "right" },
        ]
    const lowStockRows = stats.lowStockProducts.map((item) =>
      isAdmin
        ? [item.product.name, item.product.sku, item.branch?.name || "-", item.current_quantity]
        : [item.product.name, item.product.sku, item.current_quantity],
    )
    drawTable("Low Stock Alerts", lowStockCols, lowStockRows)

    // ---------- Footer on every page ----------
    const totalPages = doc.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      doc.setDrawColor(226, 232, 240)
      doc.setLineWidth(0.3)
      doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7.5)
      doc.setTextColor(148, 163, 184)
      doc.text("Pehnawa Boutique Pos · Confidential business report", margin, pageHeight - 8)
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: "right" })
    }

    const dateSlug = generatedAt.toISOString().slice(0, 10)
    const scopeSlug = scopeLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    const filename = `pehnawa-boutique-daily-report-${scopeSlug}-${dateSlug}.pdf`
    doc.save(filename)
    return filename
  }

  const handleExportReport = async () => {
    toast({
      title: "Preparing your report",
      description: "Building a PDF from the exact numbers shown on this dashboard...",
    })
    await withExportLoading(async () => {
      try {
        const filename = await generateReport()
        toast({
          variant: "success",
          title: "Report downloaded",
          description: `Saved to your downloads as ${filename}`,
        })
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Export Failed",
          description: "Could not generate the report",
        })
      }
    })
  }

  const formatCurrency = (amount: string | number) => `Rs ${Number(amount).toFixed(2)}`

  const timeAgo = (dateStr: string) => {
    const diffMs = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return "just now"
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const formatMoney = (amount: string | number) =>
    `Rs ${Number(amount || 0).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const paymentTotal = (stats?.paymentBreakdown || []).reduce((sum, p) => sum + Number(p.total || 0), 0)
  const visibleTopProducts = topProducts.slice(0, 6)
  const maxSold = Math.max(1, ...visibleTopProducts.map((p) => Number(p.quantity_sold) || 0))
  const lowStockCount = stats?.lowStockCount || 0

  const quickReports = [
    { id: "today-revenue", label: "Today Revenue", hint: "All completed sales", icon: DollarSign, tone: "bg-slate-900 text-white", accent: "bg-slate-900" },
    { id: "today-cash-sales", label: "Today Cash Sales", hint: "Cash inflows only", icon: Wallet, tone: "bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100", accent: "bg-emerald-500" },
    { id: "today-credit-sales", label: "Today Credit Sales", hint: "Credit invoices", icon: CreditCard, tone: "bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100", accent: "bg-amber-500" },
    { id: "today-expenses", label: "Today Expenses", hint: "Outgoing cash", icon: Receipt, tone: "bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100", accent: "bg-rose-500" },
  ]

  const kpis: Array<{
    key: Exclude<ModalKind, null>
    label: string
    value: string
    meta: string
    icon: any
    tone: string
    alert?: boolean
  }> = [
    {
      key: "sales",
      label: "Today's Sales",
      value: formatMoney(stats?.todaySalesTotal || 0),
      meta: `${plural(stats?.todaySalesCount || 0, "transaction")} today`,
      icon: DollarSign,
      tone: "bg-emerald-50 text-emerald-600",
    },
    {
      key: "transactions",
      label: "Recent Transactions",
      value: String(recentSales.length),
      meta: "Latest sales activity",
      icon: ShoppingCart,
      tone: "bg-blue-50 text-blue-600",
    },
    {
      key: "customers",
      label: "Total Customers",
      value: String(stats?.totalCustomers || 0),
      meta: `+${stats?.newCustomersToday || 0} new today`,
      icon: Users,
      tone: "bg-violet-50 text-violet-600",
    },
    {
      key: "lowstock",
      label: "Low Stock Items",
      value: String(lowStockCount),
      meta: lowStockCount > 0 ? "Need restocking" : "Stock levels healthy",
      icon: Package,
      tone: "bg-amber-50 text-amber-600",
      alert: lowStockCount > 0,
    },
  ]

  const insights = [
    { label: "Sales Today", value: String(stats?.todaySalesCount || 0), icon: Receipt, tone: "bg-emerald-50 text-emerald-600" },
    { label: "Avg Order Value", value: formatMoney(stats?.avgOrderValue || 0), icon: TrendingUp, tone: "bg-blue-50 text-blue-600" },
    { label: "Items Sold", value: String(stats?.itemsSoldToday || 0), icon: Boxes, tone: "bg-violet-50 text-violet-600" },
    { label: "New Customers", value: String(stats?.newCustomersToday || 0), icon: UserPlus, tone: "bg-amber-50 text-amber-600" },
    { label: "Discounts Given", value: formatMoney(stats?.discountToday || 0), icon: Tag, tone: "bg-rose-50 text-rose-600" },
    { label: "Tax Collected", value: formatMoney(stats?.taxToday || 0), icon: DollarSign, tone: "bg-sky-50 text-sky-600" },
  ]

  if (initialLoading && !stats) return <PageLoader message="Loading dashboard..." />

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">
            <CalendarDays className="h-3.5 w-3.5" />
            {todayLabel}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-[28px]">Dashboard</h1>
          <p className="text-sm text-slate-500">Welcome back! Here&apos;s what&apos;s happening today.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm">
            {stats?.branch ? (
              <MapPin className="h-4 w-4 shrink-0 text-slate-500" />
            ) : (
              <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
            )}
            <span className="max-w-[180px] truncate">{stats?.branch ? stats.branch.name : "All Branches"}</span>
          </div>
          <LoadingButton
            onClick={handleExportReport}
            loading={exportLoading}
            loadingText="Generating..."
            className="h-9 w-full shadow-sm sm:w-auto"
          >
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </LoadingButton>
        </div>
      </div>

      {/* Today quick reports */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Quick reports</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 md:gap-4">
          {quickReports.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate?.(item.id)}
                className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
              >
                <span className={cn("absolute inset-y-0 left-0 w-1", item.accent)} aria-hidden />
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", item.tone)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{item.label}</p>
                  <p className="truncate text-xs text-slate-500">{item.hint}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-900" />
              </button>
            )
          })}
        </div>
      </section>

      {/* Stats Cards */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        {initialLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          kpis.map((kpi) => {
            const Icon = kpi.icon
            return (
              <button
                key={kpi.key}
                type="button"
                onClick={() => setActiveModal(kpi.key)}
                className="group flex flex-col rounded-xl border border-slate-200 bg-white text-left shadow-sm transition-all hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
              >
                <div className="flex items-start justify-between gap-3 p-5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
                    <p
                      className={cn(
                        "mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums text-slate-900",
                        kpi.alert && "text-amber-600",
                      )}
                    >
                      {kpi.value}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{kpi.meta}</p>
                  </div>
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", kpi.tone)}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-slate-100 px-5 py-2.5 text-xs font-medium text-slate-600 transition-colors group-hover:text-slate-900">
                  View details
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            )
          })
        )}
      </section>

      {/* Payment Methods + Today's Insights */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-5">
        <Card className="overflow-hidden rounded-xl border-slate-200 lg:col-span-2">
          <PanelHeader
            title="Payment Methods Today"
            description="How customers paid today"
            action={<CountPill>{plural(stats?.todaySalesCount || 0, "sale")}</CountPill>}
          />
          {initialLoading ? (
            <PanelLoader />
          ) : stats?.paymentBreakdown?.length ? (
            <ul className="divide-y divide-slate-100">
              {stats.paymentBreakdown.map((p) => {
                const Icon = PAYMENT_ICON[p.method] || Wallet
                const share = paymentTotal > 0 ? (Number(p.total) / paymentTotal) * 100 : 0
                return (
                  <li key={p.method} className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium capitalize text-slate-900">
                          {p.method.toLowerCase().replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-slate-500">
                          {plural(p.count, "transaction")} · {share.toFixed(0)}%
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{formatMoney(p.total)}</p>
                    </div>
                    <div className="ml-12 mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-slate-900" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState icon={Wallet} title="No sales recorded today" hint="Payment activity will show up here once sales are made." />
          )}
        </Card>

        <Card className="overflow-hidden rounded-xl border-slate-200 lg:col-span-3">
          <PanelHeader title="Today's Insights" description="Key numbers for the day at a glance" />
          {initialLoading ? (
            <PanelLoader />
          ) : (
            <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3">
              {insights.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="flex min-w-0 flex-col gap-3 bg-white p-5">
                    <div className="flex items-center gap-2">
                      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", item.tone)}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <p className="truncate text-xs font-medium text-slate-500">{item.label}</p>
                    </div>
                    <p className="truncate text-xl font-semibold tracking-tight tabular-nums text-slate-900">{item.value}</p>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
        {/* Recent Sales */}
        <Card className="overflow-hidden rounded-xl border-slate-200">
          <PanelHeader
            title="Recent Sales"
            description="Latest completed transactions"
            action={<CountPill>{plural(recentSales.length, "transaction")}</CountPill>}
          />
          {initialLoading ? (
            <PanelLoader label="Loading recent sales..." />
          ) : recentSales.length ? (
            <ul className="divide-y divide-slate-100">
              {recentSales.slice(0, 6).map((sale) => (
                <li key={sale.id} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50/70">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                    {initialsOf(sale.customerName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{sale.customerName}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                      <span className="font-mono text-[11px]">{sale.saleNumber}</span>
                      <span className="text-slate-300">•</span>
                      <span>{timeAgo(sale.saleDate)}</span>
                      {isAdmin && sale.branch && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" />
                            {sale.branch.name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <p className="text-sm font-semibold tabular-nums text-slate-900">{formatMoney(sale.totalAmount)}</p>
                    <StatusPill status={sale.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={ShoppingCart} title="No recent sales" hint="New sales will appear here as they happen." />
          )}
        </Card>

        {/* Top Products */}
        <Card className="overflow-hidden rounded-xl border-slate-200">
          <PanelHeader
            title="Top Products"
            description="Best sellers by quantity sold"
            action={<CountPill>Best sellers</CountPill>}
          />
          {initialLoading ? (
            <PanelLoader label="Loading top products..." />
          ) : visibleTopProducts.length ? (
            <ul className="divide-y divide-slate-100">
              {visibleTopProducts.map((product, index) => (
                <li key={product.id} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50/70">
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums",
                      index === 0
                        ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200"
                        : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-slate-900">{product.name}</p>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{formatMoney(product.price)}</p>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                      <span>{plural(product.order_count, "order")}</span>
                      <span className="text-slate-300">•</span>
                      <span>{product.quantity_sold} sold</span>
                      {isAdmin && product.topBranch && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" />
                            {product.topBranch.name}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${((Number(product.quantity_sold) || 0) / maxSold) * 100}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Package} title="No top products data" hint="Best sellers will be ranked here once items sell." />
          )}
        </Card>
      </div>

      <DetailSheet
        open={activeModal !== null}
        onOpenChange={(open) => !open && setActiveModal(null)}
        size="lg"
      >
        <DetailSheetHeader
          title={
            activeModal === "sales"
              ? "Today's sales"
              : activeModal === "transactions"
                ? "Recent transactions"
                : activeModal === "customers"
                  ? "Customers"
                  : "Low stock items"
          }
          subtitle={
            activeModal === "sales"
              ? `${formatCurrency(stats?.todaySalesTotal || 0)} across ${stats?.todaySalesCount || 0} transactions${stats?.branch ? ` at ${stats.branch.name}` : " — all branches"}`
              : activeModal === "transactions"
                ? `Last ${recentSales.length} sales${isAdmin ? " across all branches" : ""}`
                : activeModal === "customers"
                  ? `${stats?.totalCustomers || 0} total · ${stats?.newCustomersToday || 0} new today`
                  : `${stats?.lowStockCount || 0} items below threshold${stats?.branch ? ` at ${stats.branch.name}` : " — all branches"}`
          }
        />
        <DetailSheetBody className="space-y-2">
          {activeModal === "sales" && (
            stats?.todaySales?.length ? stats.todaySales.map((s) => (
                  <div key={s.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border rounded-lg">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{s.sale_number}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                        <span>{timeAgo(s.created_at)}</span>
                        {isAdmin && s.branch && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin className="h-3 w-3" />
                              {s.branch.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:flex-col sm:items-end sm:text-right shrink-0">
                      <div className="font-semibold text-sm tabular-nums">{formatMoney(s.total_amount)}</div>
                      <StatusPill status={s.status} />
                    </div>
                  </div>
                )) : (
                  <div className="text-center text-muted-foreground py-8">No sales yet today</div>
                )
          )}

          {activeModal === "transactions" && (
            recentSales.length ? recentSales.map((sale) => (
                  <div key={sale.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border rounded-lg">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{sale.customerName}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                        <span>{sale.saleNumber}</span>
                        <span>·</span>
                        <span>{timeAgo(sale.saleDate)}</span>
                        {isAdmin && sale.branch && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin className="h-3 w-3" />
                              {sale.branch.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:flex-col sm:items-end sm:text-right shrink-0">
                      <div className="font-semibold text-sm tabular-nums">{formatMoney(sale.totalAmount)}</div>
                      <StatusPill status={sale.status} />
                    </div>
                  </div>
                )) : (
                  <div className="text-center text-muted-foreground py-8">No recent transactions</div>
                )
          )}

          {activeModal === "customers" && (
            customersLoading ? (
                  <div className="flex flex-col items-center justify-center py-8 space-y-2">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading customers…</span>
                  </div>
                ) : customers.length ? customers.slice(0, 20).map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 p-3 border rounded-lg">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{c.name || "Unnamed Customer"}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.phone_number || c.email || "No contact info"}</div>
                    </div>
                    {typeof c.sale_count === "number" && (
                      <div className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">{c.sale_count} orders</div>
                    )}
                  </div>
                )) : (
                  <div className="text-center text-muted-foreground py-8">No customers found</div>
                )
          )}

          {activeModal === "lowstock" && (
            stats?.lowStockProducts?.length ? stats.lowStockProducts.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 p-3 border rounded-lg">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{item.product.name}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                        <span>{item.product.sku}</span>
                        {isAdmin && item.branch && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin className="h-3 w-3" />
                              {item.branch.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 whitespace-nowrap">
                      {item.current_quantity} left
                    </Badge>
                  </div>
                )) : (
                  <div className="text-center text-muted-foreground py-8">No low stock items</div>
                )
          )}
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={() => setActiveModal(null)}>
            Close
          </Button>
          {(activeModal === "sales" || activeModal === "transactions") && (
            <Button onClick={() => { setActiveModal(null); onNavigate?.("sales-history") }}>
              Open sales history
            </Button>
          )}
          {activeModal === "customers" && (
            <Button onClick={() => { setActiveModal(null); onNavigate?.("customers") }}>
              Open customers
            </Button>
          )}
          {activeModal === "lowstock" && canOpenInventory && (
            <Button onClick={() => { setActiveModal(null); onNavigate?.("inventory-dashboard") }}>
              Open inventory
            </Button>
          )}
        </DetailSheetFooter>
      </DetailSheet>
    </div>
  )
}

function initialsOf(name: string | null | undefined) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "?"
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase()
}

function PanelHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-base font-semibold tracking-tight text-slate-900">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

function CountPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-slate-600">
      {children}
    </span>
  )
}

function StatusPill({ status }: { status?: string | null }) {
  const value = status?.toLowerCase() || "completed"
  const tone =
    value === "completed" || value === "paid"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
      : value === "pending" || value === "partial"
        ? "bg-amber-50 text-amber-700 ring-amber-600/20"
        : value === "cancelled" || value === "refunded" || value === "void"
          ? "bg-rose-50 text-rose-700 ring-rose-600/20"
          : "bg-slate-50 text-slate-600 ring-slate-500/20"
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset", tone)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {value}
    </span>
  )
}

function PanelLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      {label && <span className="text-sm text-slate-500">{label}</span>}
    </div>
  )
}

function EmptyState({ icon: Icon, title, hint }: { icon: any; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
