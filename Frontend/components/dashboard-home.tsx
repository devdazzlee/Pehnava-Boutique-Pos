"use client"

import { useState, useEffect } from "react"
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

  if (initialLoading && !stats) return <PageLoader message="Loading dashboard..." />

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm md:text-base text-gray-600">
            Welcome back! Here's what's happening today.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm shrink-0">
            {stats?.branch ? <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0" /> : <Building2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
            <span className="truncate max-w-[160px]">{stats?.branch ? stats.branch.name : "All Branches"}</span>
          </div>
          <LoadingButton
            onClick={handleExportReport}
            loading={exportLoading}
            loadingText="Generating..."
            className="w-full sm:w-auto"
          >
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </LoadingButton>
        </div>
      </div>

      {/* Today quick reports */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        {[
          { id: "today-revenue", label: "Today Revenue", hint: "All completed sales", icon: DollarSign, tone: "bg-slate-900 text-white" },
          { id: "today-cash-sales", label: "Today Cash Sales", hint: "Cash inflows only", icon: Wallet, tone: "bg-emerald-600 text-white" },
          { id: "today-credit-sales", label: "Today Credit Sales", hint: "Credit invoices", icon: CreditCard, tone: "bg-amber-600 text-white" },
          { id: "today-expenses", label: "Today Expenses", hint: "Outgoing cash", icon: Receipt, tone: "bg-rose-600 text-white" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card
              key={item.id}
              className={cn("cursor-pointer border-0 shadow-sm transition hover:opacity-95", item.tone)}
              onClick={() => onNavigate?.(item.id)}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-white/15 p-2">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">{item.label}</p>
                  <p className="text-xs opacity-90">{item.hint}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {initialLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setActiveModal("sales")}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Today's Sales</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(stats?.todaySalesTotal || 0)}</div>
                <p className="text-xs text-blue-600 mt-1">{stats?.todaySalesCount || 0} transactions today →</p>
              </CardContent>
            </Card>

            <Card
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setActiveModal("transactions")}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Recent Transactions</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{recentSales.length}</div>
                <p className="text-xs text-blue-600 mt-1">View details →</p>
              </CardContent>
            </Card>

            <Card
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setActiveModal("customers")}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalCustomers || 0}</div>
                <p className="text-xs text-blue-600 mt-1">+{stats?.newCustomersToday || 0} new today →</p>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setActiveModal("lowstock")}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
                <Package className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{stats?.lowStockCount || 0}</div>
                <p className="text-xs text-blue-600 mt-1">View details →</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Payment Methods + Today's Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Payment Methods Today
              <Badge variant="secondary">{stats?.todaySalesCount || 0} sales</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {initialLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : stats?.paymentBreakdown?.length ? (
              <div className="space-y-3">
                {stats.paymentBreakdown.map((p) => {
                  const Icon = PAYMENT_ICON[p.method] || Wallet
                  return (
                    <div key={p.method} className="flex items-center gap-3 p-3 border rounded-lg">
                      <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium capitalize truncate">{p.method.toLowerCase().replace(/_/g, " ")}</p>
                        <p className="text-xs text-gray-500">{p.count} transactions</p>
                      </div>
                      <div className="text-sm font-semibold shrink-0">{formatCurrency(p.total)}</div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-4">No sales recorded today</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s Insights</CardTitle>
          </CardHeader>
          <CardContent>
            {initialLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                    <Receipt className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">Sales Today</p>
                    <p className="text-lg font-semibold tabular-nums">{stats?.todaySalesCount || 0}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">Avg Order Value</p>
                    <p className="text-lg font-semibold tabular-nums truncate">{formatCurrency(stats?.avgOrderValue || 0)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                    <Boxes className="h-4 w-4 text-violet-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">Items Sold</p>
                    <p className="text-lg font-semibold tabular-nums">{stats?.itemsSoldToday || 0}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                    <UserPlus className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">New Customers</p>
                    <p className="text-lg font-semibold tabular-nums">{stats?.newCustomersToday || 0}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="h-9 w-9 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
                    <Tag className="h-4 w-4 text-rose-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">Discounts Given</p>
                    <p className="text-lg font-semibold tabular-nums truncate">{formatCurrency(stats?.discountToday || 0)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="h-9 w-9 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
                    <DollarSign className="h-4 w-4 text-sky-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">Tax Collected</p>
                    <p className="text-lg font-semibold tabular-nums truncate">{formatCurrency(stats?.taxToday || 0)}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Recent Sales */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Recent Sales
              <Badge variant="secondary">{recentSales.length} transactions</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {initialLoading ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-2">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  <span className="text-sm text-gray-500">Loading recent sales...</span>
                </div>
              ) : (
                <>
                  {recentSales.slice(0, 6).map((sale) => (
                    <div
                      key={sale.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{sale.customerName}</div>
                        <div className="text-xs text-gray-500 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                          <span>{sale.saleNumber}</span>
                          <span>·</span>
                          <span>{timeAgo(sale.saleDate)}</span>
                          {isAdmin && sale.branch && (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-0.5 text-blue-600">
                                <MapPin className="h-3 w-3" />
                                {sale.branch.name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:flex-col sm:items-end sm:text-right shrink-0">
                        <div className="font-medium">{formatCurrency(sale.totalAmount)}</div>
                        <Badge
                          variant="default"
                          className="bg-green-100 text-green-800 hover:bg-green-100"
                        >
                          {sale.status?.toLowerCase() || "completed"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {recentSales.length === 0 && (
                    <div className="text-center text-gray-500 py-4">No recent sales</div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Top Products
              <Badge variant="secondary">Best sellers</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {initialLoading ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-2">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  <span className="text-sm text-gray-500">Loading top products...</span>
                </div>
              ) : (
                <>
                  {topProducts.slice(0, 6).map((product, index) => (
                    <div
                      key={product.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <Badge variant="secondary" className="shrink-0">#{index + 1}</Badge>
                        <div className="min-w-0">
                          <div className="font-medium flex items-center space-x-2 truncate">
                            <span className="truncate">{product.name}</span>
                            <TrendingUp className="h-3 w-3 text-green-600 shrink-0" />
                          </div>
                          <div className="text-xs text-gray-500 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <span>{product.order_count} orders · {product.quantity_sold} sold</span>
                            {isAdmin && product.topBranch && (
                              <>
                                <span>·</span>
                                <span className="inline-flex items-center gap-0.5 text-blue-600">
                                  <MapPin className="h-3 w-3" />
                                  {product.topBranch.name}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="font-medium shrink-0 pl-9 sm:pl-0">{formatCurrency(product.price)}</div>
                    </div>
                  ))}
                  {topProducts.length === 0 && (
                    <div className="text-center text-gray-500 py-4">No top products data</div>
                  )}
                </>
              )}
            </div>
          </CardContent>
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
                      <div className="font-medium text-sm">{formatCurrency(s.total_amount)}</div>
                      <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
                        {s.status?.toLowerCase()}
                      </Badge>
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
                      <div className="font-medium text-sm">{formatCurrency(sale.totalAmount)}</div>
                      <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
                        {sale.status?.toLowerCase() || "completed"}
                      </Badge>
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
