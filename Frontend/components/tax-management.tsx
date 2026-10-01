"use client"

// you site huustle start here 
// connect with your buisness partner  phone number
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { YmdDatePicker } from "@/components/ui/date-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Calculator, Plus, Edit, Trash2, FileText, Download, Percent } from "lucide-react"
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton"

interface TaxRate {
  id: string
  name: string
  rate: number
  type: "percentage" | "fixed"
  category: string
  status: "active" | "inactive"
  startDate: string
  endDate?: string
}

interface TaxReport {
  period: string
  totalSales: number
  taxableAmount: number
  taxCollected: number
  exemptAmount: number
}

export function TaxManagement() {
  const [isLoading, setIsLoading] = useState(true);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([
    {
      id: "1",
      name: "State Sales Tax",
      rate: 6.5,
      type: "percentage",
      category: "Sales Tax",
      status: "active",
      startDate: "2024-01-01",
    },
    {
      id: "2",
      name: "City Tax",
      rate: 1.5,
      type: "percentage",
      category: "Local Tax",
      status: "active",
      startDate: "2024-01-01",
    },
    {
      id: "3",
      name: "Food Tax",
      rate: 2.0,
      type: "percentage",
      category: "Food & Beverage",
      status: "active",
      startDate: "2024-01-01",
    },
    {
      id: "4",
      name: "Luxury Tax",
      rate: 10.0,
      type: "percentage",
      category: "Luxury Items",
      status: "inactive",
      startDate: "2024-01-01",
      endDate: "2024-12-31",
    },
  ])

  const [taxReports] = useState<TaxReport[]>([
    {
      period: "January 2024",
      totalSales: 28475.5,
      taxableAmount: 26850.25,
      taxCollected: 2148.02,
      exemptAmount: 1625.25,
    },
    {
      period: "December 2023",
      totalSales: 31250.75,
      taxableAmount: 29500.5,
      taxCollected: 2360.04,
      exemptAmount: 1750.25,
    },
    {
      period: "November 2023",
      totalSales: 27890.25,
      taxableAmount: 26100.0,
      taxCollected: 2088.0,
      exemptAmount: 1790.25,
    },
  ])

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingTaxRate, setEditingTaxRate] = useState<TaxRate | null>(null)
  const [newTaxRate, setNewTaxRate] = useState<Partial<TaxRate>>({})
  const [autoCalculateTax, setAutoCalculateTax] = useState(true)
  const [includeTaxInPrice, setIncludeTaxInPrice] = useState(false)

  const categories = ["Sales Tax", "Local Tax", "Food & Beverage", "Luxury Items", "Service Tax", "Other"]

  const handleAddTaxRate = () => {
    if (newTaxRate.name && newTaxRate.rate && newTaxRate.category) {
      const taxRate: TaxRate = {
        id: Date.now().toString(),
        name: newTaxRate.name,
        rate: newTaxRate.rate,
        type: newTaxRate.type || "percentage",
        category: newTaxRate.category,
        status: "active",
        startDate: newTaxRate.startDate || new Date().toISOString().split("T")[0],
        endDate: newTaxRate.endDate,
      }
      setTaxRates([...taxRates, taxRate])
      setNewTaxRate({})
      setIsAddDialogOpen(false)
    }
  }

  const handleEditTaxRate = () => {
    if (editingTaxRate) {
      setTaxRates(taxRates.map((t) => (t.id === editingTaxRate.id ? editingTaxRate : t)))
      setEditingTaxRate(null)
    }
  }

  const handleDeleteTaxRate = (id: string) => {
    setTaxRates(taxRates.filter((t) => t.id !== id))
  }

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const activeTaxRates = taxRates.filter((t) => t.status === "active")
  const totalTaxRate = activeTaxRates.reduce((sum, rate) => sum + rate.rate, 0)
  const currentMonthTax = taxReports[0]?.taxCollected || 0
  const lastMonthTax = taxReports[1]?.taxCollected || 0
  const taxGrowth = lastMonthTax > 0 ? ((currentMonthTax - lastMonthTax) / lastMonthTax) * 100 : 0

  const handleExportReport = () => {
    // Create CSV content
    const headers = ["Period", "Total Sales", "Taxable Amount", "Tax Collected", "Exempt Amount"]
    const csvContent = [
      headers.join(","),
      ...taxReports.map((report) =>
        [
          report.period,
          report.totalSales.toFixed(2),
          report.taxableAmount.toFixed(2),
          report.taxCollected.toFixed(2),
          report.exemptAmount.toFixed(2),
        ].join(","),
      ),
    ].join("\n")

    // Create and download the file using native methods
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    const currentDate = new Date().toISOString().split("T")[0]
    link.href = url
    link.download = `tax-report-${currentDate}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const [viewingReport, setViewingReport] = useState<TaxReport | null>(null)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tax Management</h1>
          <p className="text-gray-600">Configure tax rates and generate tax reports</p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={handleExportReport}>
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Tax Rate
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Tax Rate</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Tax Name</Label>
                  <Input
                    id="name"
                    value={newTaxRate.name || ""}
                    onChange={(e) => setNewTaxRate({ ...newTaxRate, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="rate">Tax Rate</Label>
                    <Input
                      id="rate"
                      type="number"
                      step="0.01"
                      value={newTaxRate.rate || ""}
                      onChange={(e) => setNewTaxRate({ ...newTaxRate, rate: Number.parseFloat(e.target.value) })}
                      placeholder="6.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="type">Type</Label>
                    <Select onValueChange={(value: any) => setNewTaxRate({ ...newTaxRate, type: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="fixed">Fixed Amount</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select onValueChange={(value) => setNewTaxRate({ ...newTaxRate, category: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startDate">Start Date</Label>
                    <YmdDatePicker
                      value={newTaxRate.startDate || ""}
                      onChange={(v) => setNewTaxRate({ ...newTaxRate, startDate: v })}
                      />
                  </div>
                  <div>
                    <Label htmlFor="endDate">End Date (Optional)</Label>
                    <YmdDatePicker
                      value={newTaxRate.endDate || ""}
                      onChange={(v) => setNewTaxRate({ ...newTaxRate, endDate: v })}
                      />
                  </div>
                </div>
                <Button onClick={handleAddTaxRate} className="w-full">
                  Add Tax Rate
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Tax Rate</CardTitle>
                <Percent className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalTaxRate.toFixed(2)}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">This Month Tax</CardTitle>
                <Calculator className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">${currentMonthTax.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Last Month Tax</CardTitle>
                <Calculator className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${lastMonthTax.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Growth</CardTitle>
                <Calculator className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${taxGrowth >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {taxGrowth >= 0 ? "+" : ""}
                  {taxGrowth.toFixed(1)}%
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tax Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Tax Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="auto-calculate">Auto Calculate Tax</Label>
                <p className="text-sm text-gray-500">Automatically calculate tax on sales</p>
              </div>
              <Switch id="auto-calculate" checked={autoCalculateTax} onCheckedChange={setAutoCalculateTax} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="include-tax">Include Tax in Price</Label>
                <p className="text-sm text-gray-500">Display prices with tax included</p>
              </div>
              <Switch id="include-tax" checked={includeTaxInPrice} onCheckedChange={setIncludeTaxInPrice} />
            </div>
            <div className="pt-4">
              <h4 className="font-medium mb-2">Tax Calculation Preview</h4>
              <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>$100.00</span>
                </div>
                {activeTaxRates.map((rate) => (
                  <div key={rate.id} className="flex justify-between text-sm">
                    <span>
                      {rate.name} ({rate.rate}%):
                    </span>
                    <span>${((100 * rate.rate) / 100).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-medium border-t pt-2">
                  <span>Total:</span>
                  <span>${(100 + (100 * totalTaxRate) / 100).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tax Reports Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Tax Reports Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {taxReports.slice(0, 3).map((report, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{report.period}</h4>
                    <Button size="sm" variant="outline" onClick={() => setViewingReport(report)}>
                      <FileText className="h-3 w-3 mr-1" />
                      View
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Total Sales:</span>
                      <div className="font-medium">${report.totalSales.toFixed(2)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Tax Collected:</span>
                      <div className="font-medium text-green-600">${report.taxCollected.toFixed(2)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Taxable Amount:</span>
                      <div className="font-medium">${report.taxableAmount.toFixed(2)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Exempt Amount:</span>
                      <div className="font-medium">${report.exemptAmount.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tax Rates Table */}
      <Card>
        <CardHeader>
          <CardTitle>Tax Rates</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tax Name</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {taxRates.map((taxRate) => (
                <TableRow key={taxRate.id}>
                  <TableCell className="font-medium">{taxRate.name}</TableCell>
                  <TableCell>
                    {taxRate.rate}
                    {taxRate.type === "percentage" ? "%" : " $"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{taxRate.category}</Badge>
                  </TableCell>
                  <TableCell>{taxRate.startDate}</TableCell>
                  <TableCell>{taxRate.endDate || "No end date"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={taxRate.status === "active" ? "default" : "secondary"}
                      className={taxRate.status === "active" ? "bg-green-100 text-green-800" : ""}
                    >
                      {taxRate.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button size="sm" variant="outline" onClick={() => setEditingTaxRate(taxRate)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteTaxRate(taxRate.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Tax Rate Dialog */}
      <Dialog open={!!editingTaxRate} onOpenChange={() => setEditingTaxRate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tax Rate</DialogTitle>
          </DialogHeader>
          {editingTaxRate && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Tax Name</Label>
                <Input
                  id="edit-name"
                  value={editingTaxRate.name}
                  onChange={(e) => setEditingTaxRate({ ...editingTaxRate, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-rate">Tax Rate</Label>
                  <Input
                    id="edit-rate"
                    type="number"
                    step="0.01"
                    value={editingTaxRate.rate}
                    onChange={(e) => setEditingTaxRate({ ...editingTaxRate, rate: Number.parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-status">Status</Label>
                  <Select
                    value={editingTaxRate.status}
                    onValueChange={(value: any) => setEditingTaxRate({ ...editingTaxRate, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleEditTaxRate} className="w-full">
                Update Tax Rate
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Report Dialog */}
      <Dialog open={!!viewingReport} onOpenChange={() => setViewingReport(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tax Report: {viewingReport?.period}</DialogTitle>
          </DialogHeader>
          {viewingReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Total Sales</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">${viewingReport.totalSales.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Tax Collected</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-green-600">${viewingReport.taxCollected.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Taxable Amount</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">${viewingReport.taxableAmount.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Exempt Amount</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">${viewingReport.exemptAmount.toFixed(2)}</p>
                  </CardContent>
                </Card>
              </div>

              <div>
                <h4 className="font-medium mb-2">Tax Breakdown</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tax Name</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeTaxRates.map((tax) => (
                      <TableRow key={tax.id}>
                        <TableCell>{tax.name}</TableCell>
                        <TableCell>{tax.rate}%</TableCell>
                        <TableCell>${((viewingReport.taxableAmount * tax.rate) / 100).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={2} className="font-bold">
                        Total Tax
                      </TableCell>
                      <TableCell className="font-bold">${viewingReport.taxCollected.toFixed(2)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setViewingReport(null)}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    const reportData = `
Period: ${viewingReport.period}
Total Sales: $${viewingReport.totalSales.toFixed(2)}
Taxable Amount: $${viewingReport.taxableAmount.toFixed(2)}
Tax Collected: $${viewingReport.taxCollected.toFixed(2)}
Exempt Amount: $${viewingReport.exemptAmount.toFixed(2)}
                  `
                    const blob = new Blob([reportData], { type: "text/plain;charset=utf-8" })
                    const url = URL.createObjectURL(blob)
                    const link = document.createElement("a")
                    link.href = url
                    link.download = `tax-report-${viewingReport.period}.txt`
                    document.body.appendChild(link)
                    link.click()
                    document.body.removeChild(link)
                    URL.revokeObjectURL(url)
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Report
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
