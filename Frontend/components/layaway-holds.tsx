"use client"

import { useState, useMemo, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { YmdDatePicker } from "@/components/ui/date-picker"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { Plus, Search, Clock, DollarSign, Package, Calendar, Eye, CreditCard, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { PageLoader } from "@/components/ui/page-loader"
import { addDays, addWeeks, addMonths, format, parseISO, isBefore, isAfter, differenceInDays } from "date-fns"

interface Layaway {
  id: string
  customer: string
  phone: string
  items: string
  totalAmount: number
  paidAmount: number
  remainingAmount: number
  startDate: string
  dueDate: string
  status: "active" | "completed" | "cancelled" | "overdue"
  paymentPlan: "weekly" | "biweekly" | "monthly" | "custom"
  payments: Payment[]
  nextPaymentDate: string
  nextPaymentAmount: number
}

interface Payment {
  id: string
  date: string
  amount: number
  method: string
  notes?: string
}

interface NewLayaway {
  customer: string
  phone: string
  items: string
  totalAmount: string
  downPayment: string
  paymentPlan: string
  dueDate: string
}

export function LayawayHolds() {
  const { toast } = useToast()
  const today = new Date().toISOString().split("T")[0]
  const [isLoading, setIsLoading] = useState(true)

  const [layaways, setLayaways] = useState<Layaway[]>([
    {
      id: "LAY-001",
      customer: "John Doe",
      phone: "+91 98765 43210",
      items: "iPhone 15 Pro, AirPods",
      totalAmount: 125000,
      paidAmount: 50000,
      remainingAmount: 75000,
      startDate: "2024-01-15",
      dueDate: "2024-03-15",
      status: "active",
      paymentPlan: "monthly",
      payments: [
        {
          id: "PAY-001",
          date: "2024-01-15",
          amount: 25000,
          method: "Cash",
          notes: "Initial down payment",
        },
        {
          id: "PAY-002",
          date: "2024-02-15",
          amount: 25000,
          method: "Card",
          notes: "First monthly payment",
        },
      ],
      nextPaymentDate: "2024-03-15",
      nextPaymentAmount: 25000,
    },
    {
      id: "LAY-002",
      customer: "Jane Smith",
      phone: "+91 87654 32109",
      items: "MacBook Pro",
      totalAmount: 200000,
      paidAmount: 80000,
      remainingAmount: 120000,
      startDate: "2024-01-10",
      dueDate: "2024-04-10",
      status: "active",
      paymentPlan: "weekly",
      payments: [
        {
          id: "PAY-003",
          date: "2024-01-10",
          amount: 40000,
          method: "Card",
          notes: "Initial down payment",
        },
        {
          id: "PAY-004",
          date: "2024-01-17",
          amount: 20000,
          method: "Cash",
          notes: "First weekly payment",
        },
        {
          id: "PAY-005",
          date: "2024-01-24",
          amount: 20000,
          method: "Cash",
          notes: "Second weekly payment",
        },
      ],
      nextPaymentDate: "2024-01-31",
      nextPaymentAmount: 20000,
    },
    {
      id: "LAY-003",
      customer: "Mike Johnson",
      phone: "+91 76543 21098",
      items: "Samsung Galaxy S24 Ultra",
      totalAmount: 150000,
      paidAmount: 30000,
      remainingAmount: 120000,
      startDate: "2024-01-05",
      dueDate: "2024-04-05",
      status: "overdue",
      paymentPlan: "biweekly",
      payments: [
        {
          id: "PAY-006",
          date: "2024-01-05",
          amount: 30000,
          method: "Cash",
          notes: "Initial down payment",
        },
      ],
      nextPaymentDate: "2024-01-19",
      nextPaymentAmount: 20000,
    },
    {
      id: "LAY-004",
      customer: "Sarah Wilson",
      phone: "+91 65432 10987",
      items: "iPad Pro, Apple Pencil",
      totalAmount: 110000,
      paidAmount: 110000,
      remainingAmount: 0,
      startDate: "2023-11-10",
      dueDate: "2024-01-10",
      status: "completed",
      paymentPlan: "monthly",
      payments: [
        {
          id: "PAY-007",
          date: "2023-11-10",
          amount: 30000,
          method: "Card",
          notes: "Initial down payment",
        },
        {
          id: "PAY-008",
          date: "2023-12-10",
          amount: 40000,
          method: "Cash",
          notes: "First monthly payment",
        },
        {
          id: "PAY-009",
          date: "2024-01-10",
          amount: 40000,
          method: "Cash",
          notes: "Final payment",
        },
      ],
      nextPaymentDate: "",
      nextPaymentAmount: 0,
    },
  ])

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isPaymentOpen, setIsPaymentOpen] = useState(false)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [selectedLayaway, setSelectedLayaway] = useState<Layaway | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [newLayaway, setNewLayaway] = useState<NewLayaway>({
    customer: "",
    phone: "",
    items: "",
    totalAmount: "",
    downPayment: "",
    paymentPlan: "",
    dueDate: "",
  })
  const [newPayment, setNewPayment] = useState({
    amount: "",
    method: "cash",
    notes: "",
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800"
      case "completed":
        return "bg-blue-100 text-blue-800"
      case "cancelled":
        return "bg-red-100 text-red-800"
      case "overdue":
        return "bg-orange-100 text-orange-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getPaymentProgress = (paid: number, total: number) => {
    return (paid / total) * 100
  }

  const filteredLayaways = useMemo(() => {
    return layaways.filter((layaway) => {
      const matchesSearch =
        layaway.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        layaway.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        layaway.items.toLowerCase().includes(searchTerm.toLowerCase())

      return matchesSearch
    })
  }, [layaways, searchTerm])

  const getFilteredLayawaysByStatus = (status: string) => {
    if (status === "all") return filteredLayaways
    if (status === "due") {
      return filteredLayaways.filter((layaway) => {
        if (layaway.status !== "active") return false
        const nextPaymentDate = parseISO(layaway.nextPaymentDate)
        const sevenDaysFromNow = addDays(new Date(), 7)
        return isAfter(nextPaymentDate, new Date()) && isBefore(nextPaymentDate, sevenDaysFromNow)
      })
    }
    return filteredLayaways.filter((layaway) => layaway.status === status)
  }

  // Calculate stats
  const activeLayaways = layaways.filter((l) => l.status === "active").length
  const totalValue = layaways.filter((l) => l.status === "active").reduce((sum, l) => sum + l.totalAmount, 0)
  const dueThisWeek = layaways.filter((l) => {
    if (l.status !== "active") return false
    const nextPaymentDate = parseISO(l.nextPaymentDate)
    const sevenDaysFromNow = addDays(new Date(), 7)
    return isAfter(nextPaymentDate, new Date()) && isBefore(nextPaymentDate, sevenDaysFromNow)
  }).length
  const overdueLayaways = layaways.filter((l) => l.status === "overdue").length

  const generateLayawayId = () => {
    const nextId = layaways.length + 1
    return `LAY-${nextId.toString().padStart(3, "0")}`
  }

  const generatePaymentId = () => {
    const allPayments = layaways.flatMap((l) => l.payments)
    const nextId = allPayments.length + 1
    return `PAY-${nextId.toString().padStart(3, "0")}`
  }

  const calculateNextPaymentDate = (startDate: string, paymentPlan: string) => {
    const date = parseISO(startDate)
    switch (paymentPlan) {
      case "weekly":
        return format(addWeeks(date, 1), "yyyy-MM-dd")
      case "biweekly":
        return format(addWeeks(date, 2), "yyyy-MM-dd")
      case "monthly":
        return format(addMonths(date, 1), "yyyy-MM-dd")
      default:
        return format(addMonths(date, 1), "yyyy-MM-dd")
    }
  }

  const calculateNextPaymentAmount = (
    totalAmount: number,
    downPayment: number,
    paymentPlan: string,
    startDate: string,
    dueDate: string,
  ) => {
    const remainingAmount = totalAmount - downPayment
    const start = parseISO(startDate)
    const end = parseISO(dueDate)
    const totalDays = differenceInDays(end, start)

    let numberOfPayments = 0
    switch (paymentPlan) {
      case "weekly":
        numberOfPayments = Math.floor(totalDays / 7)
        break
      case "biweekly":
        numberOfPayments = Math.floor(totalDays / 14)
        break
      case "monthly":
        numberOfPayments = Math.floor(totalDays / 30)
        break
      default:
        numberOfPayments = Math.floor(totalDays / 30)
    }

    // Ensure at least one payment
    numberOfPayments = Math.max(1, numberOfPayments)
    return Math.ceil(remainingAmount / numberOfPayments)
  }

  const handleCreateLayaway = () => {
    if (
      !newLayaway.customer ||
      !newLayaway.phone ||
      !newLayaway.items ||
      !newLayaway.totalAmount ||
      !newLayaway.downPayment ||
      !newLayaway.paymentPlan ||
      !newLayaway.dueDate
    ) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      })
      return
    }

    const totalAmount = Number.parseFloat(newLayaway.totalAmount)
    const downPayment = Number.parseFloat(newLayaway.downPayment)

    if (downPayment > totalAmount) {
      toast({
        title: "Invalid Down Payment",
        description: "Down payment cannot be greater than total amount.",
        variant: "destructive",
      })
      return
    }

    if (isBefore(parseISO(newLayaway.dueDate), parseISO(today))) {
      toast({
        title: "Invalid Due Date",
        description: "Due date must be in the future.",
        variant: "destructive",
      })
      return
    }

    const nextPaymentDate = calculateNextPaymentDate(today, newLayaway.paymentPlan)
    const nextPaymentAmount = calculateNextPaymentAmount(
      totalAmount,
      downPayment,
      newLayaway.paymentPlan,
      today,
      newLayaway.dueDate,
    )

    const layaway: Layaway = {
      id: generateLayawayId(),
      customer: newLayaway.customer,
      phone: newLayaway.phone,
      items: newLayaway.items,
      totalAmount: totalAmount,
      paidAmount: downPayment,
      remainingAmount: totalAmount - downPayment,
      startDate: today,
      dueDate: newLayaway.dueDate,
      status: "active",
      paymentPlan: newLayaway.paymentPlan as any,
      payments: [
        {
          id: generatePaymentId(),
          date: today,
          amount: downPayment,
          method: "Cash",
          notes: "Initial down payment",
        },
      ],
      nextPaymentDate: nextPaymentDate,
      nextPaymentAmount: nextPaymentAmount,
    }

    setLayaways((prev) => [layaway, ...prev])
    setNewLayaway({
      customer: "",
      phone: "",
      items: "",
      totalAmount: "",
      downPayment: "",
      paymentPlan: "",
      dueDate: "",
    })
    setIsCreateOpen(false)

    toast({
      title: "Layaway Created",
      description: `Layaway ${layaway.id} has been created successfully.`,
    })
  }

  const handleMakePayment = () => {
    if (!selectedLayaway) return

    if (!newPayment.amount || !newPayment.method) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      })
      return
    }

    const paymentAmount = Number.parseFloat(newPayment.amount)

    if (paymentAmount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Payment amount must be greater than 0.",
        variant: "destructive",
      })
      return
    }

    if (paymentAmount > selectedLayaway.remainingAmount) {
      toast({
        title: "Invalid Amount",
        description: "Payment amount cannot be greater than remaining amount.",
        variant: "destructive",
      })
      return
    }

    const payment = {
      id: generatePaymentId(),
      date: today,
      amount: paymentAmount,
      method: newPayment.method,
      notes: newPayment.notes,
    }

    const newPaidAmount = selectedLayaway.paidAmount + paymentAmount
    const newRemainingAmount = selectedLayaway.totalAmount - newPaidAmount
    const isCompleted = newRemainingAmount <= 0

    let nextPaymentDate = ""
    let nextPaymentAmount = 0

    if (!isCompleted) {
      nextPaymentDate = calculateNextPaymentDate(today, selectedLayaway.paymentPlan)
      nextPaymentAmount = Math.min(selectedLayaway.nextPaymentAmount, newRemainingAmount)
    }

    setLayaways((prev) =>
      prev.map((layaway) =>
        layaway.id === selectedLayaway.id
          ? {
            ...layaway,
            paidAmount: newPaidAmount,
            remainingAmount: newRemainingAmount,
            status: isCompleted ? "completed" : "active",
            payments: [...layaway.payments, payment],
            nextPaymentDate: isCompleted ? "" : nextPaymentDate,
            nextPaymentAmount: isCompleted ? 0 : nextPaymentAmount,
          }
          : layaway,
      ),
    )

    setNewPayment({
      amount: "",
      method: "cash",
      notes: "",
    })
    setIsPaymentOpen(false)

    toast({
      title: isCompleted ? "Layaway Completed" : "Payment Recorded",
      description: isCompleted
        ? `Layaway ${selectedLayaway.id} has been fully paid and completed.`
        : `Payment of ₹${paymentAmount.toLocaleString()} has been recorded.`,
    })
  }

  const handleCancelLayaway = (layawayId: string) => {
    setLayaways((prev) =>
      prev.map((layaway) => (layaway.id === layawayId ? { ...layaway, status: "cancelled" as const } : layaway)),
    )

    toast({
      title: "Layaway Cancelled",
      description: `Layaway ${layawayId} has been cancelled.`,
    })
    setIsViewOpen(false)
  }

  const handleViewLayaway = (layaway: Layaway) => {
    setSelectedLayaway(layaway)
    setIsViewOpen(true)
  }

  const handleOpenPaymentDialog = (layaway: Layaway) => {
    setSelectedLayaway(layaway)
    setNewPayment({
      amount: layaway.nextPaymentAmount.toString(),
      method: "cash",
      notes: "",
    })
    setIsPaymentOpen(true)
  }

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const renderLayawaysTable = (layawaysData: Layaway[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Layaway ID</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Items</TableHead>
          <TableHead>Total Amount</TableHead>
          <TableHead>Payment Progress</TableHead>
          <TableHead>Remaining</TableHead>
          <TableHead>Due Date</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {layawaysData.length === 0 ? (
          <TableRow>
            <TableCell colSpan={9} className="text-center py-8 text-gray-500">
              No layaways found
            </TableCell>
          </TableRow>
        ) : (
          layawaysData.map((layaway) => (
            <TableRow key={layaway.id}>
              <TableCell className="font-medium">{layaway.id}</TableCell>
              <TableCell>{layaway.customer}</TableCell>
              <TableCell>{layaway.items}</TableCell>
              <TableCell>₹{layaway.totalAmount.toLocaleString()}</TableCell>
              <TableCell>
                <div className="space-y-1">
                  <Progress value={getPaymentProgress(layaway.paidAmount, layaway.totalAmount)} className="h-2" />
                  <div className="text-xs text-gray-500">
                    ₹{layaway.paidAmount.toLocaleString()} / ₹{layaway.totalAmount.toLocaleString()}
                  </div>
                </div>
              </TableCell>
              <TableCell>₹{layaway.remainingAmount.toLocaleString()}</TableCell>
              <TableCell>{layaway.dueDate}</TableCell>
              <TableCell>
                <Badge className={getStatusColor(layaway.status)}>{layaway.status}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  {(layaway.status === "active" || layaway.status === "overdue") && (
                    <Button variant="outline" size="sm" onClick={() => handleOpenPaymentDialog(layaway)}>
                      <CreditCard className="h-3 w-3 mr-1" />
                      Payment
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => handleViewLayaway(layaway)}>
                    <Eye className="h-3 w-3 mr-1" />
                    View
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )

  if (isLoading) {
    return <PageLoader message="Loading layaway holds..." />
  }

  if (isLoading) {
    return <PageLoader message="Loading layaway holds..." />
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Layaway & Holds</h1>
          <p className="text-gray-600">Manage customer layaway plans and product holds</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Layaway
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Layaway Plan</DialogTitle>
              <DialogDescription>Set up a new layaway plan for a customer</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="customer">Customer *</Label>
                  <Input
                    id="customer"
                    placeholder="Customer name"
                    value={newLayaway.customer}
                    onChange={(e) => setNewLayaway((prev) => ({ ...prev, customer: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone *</Label>
                  <Input
                    id="phone"
                    placeholder="Customer phone"
                    value={newLayaway.phone}
                    onChange={(e) => setNewLayaway((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="items">Items *</Label>
                <Input
                  id="items"
                  placeholder="List of items for layaway"
                  value={newLayaway.items}
                  onChange={(e) => setNewLayaway((prev) => ({ ...prev, items: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="total-amount">Total Amount *</Label>
                  <Input
                    id="total-amount"
                    type="number"
                    placeholder="Total cost"
                    value={newLayaway.totalAmount}
                    onChange={(e) => setNewLayaway((prev) => ({ ...prev, totalAmount: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="down-payment">Down Payment *</Label>
                  <Input
                    id="down-payment"
                    type="number"
                    placeholder="Initial payment"
                    value={newLayaway.downPayment}
                    onChange={(e) => setNewLayaway((prev) => ({ ...prev, downPayment: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="payment-plan">Payment Plan *</Label>
                  <Select
                    value={newLayaway.paymentPlan}
                    onValueChange={(value) => setNewLayaway((prev) => ({ ...prev, paymentPlan: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="due-date">Final Due Date *</Label>
                  <YmdDatePicker
                    value={newLayaway.dueDate}
                    onChange={(v) => setNewLayaway((prev) => ({ ...prev, dueDate: v }))}
                    />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateLayaway}>Create Layaway</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Layaways</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeLayaways}</div>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{totalValue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">In layaway plans</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due This Week</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dueThisWeek}</div>
            <p className="text-xs text-muted-foreground">Payment due</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overdueLayaways}</div>
            <p className="text-xs text-muted-foreground">Need attention</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Layaways ({filteredLayaways.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({getFilteredLayawaysByStatus("active").length})</TabsTrigger>
          <TabsTrigger value="due">Due Soon ({getFilteredLayawaysByStatus("due").length})</TabsTrigger>
          <TabsTrigger value="overdue">Overdue ({getFilteredLayawaysByStatus("overdue").length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({getFilteredLayawaysByStatus("completed").length})</TabsTrigger>
        </TabsList>

        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search layaways..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>All Layaway Plans</CardTitle>
              <CardDescription>Manage all customer layaway and payment plans</CardDescription>
            </CardHeader>
            <CardContent>{renderLayawaysTable(getFilteredLayawaysByStatus("all"))}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="active">
          <Card>
            <CardHeader>
              <CardTitle>Active Layaway Plans</CardTitle>
              <CardDescription>Currently active layaway plans</CardDescription>
            </CardHeader>
            <CardContent>{renderLayawaysTable(getFilteredLayawaysByStatus("active"))}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="due">
          <Card>
            <CardHeader>
              <CardTitle>Due Soon</CardTitle>
              <CardDescription>Layaway plans with payments due in the next 7 days</CardDescription>
            </CardHeader>
            <CardContent>{renderLayawaysTable(getFilteredLayawaysByStatus("due"))}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overdue">
          <Card>
            <CardHeader>
              <CardTitle>Overdue Layaways</CardTitle>
              <CardDescription>Layaway plans with overdue payments</CardDescription>
            </CardHeader>
            <CardContent>{renderLayawaysTable(getFilteredLayawaysByStatus("overdue"))}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed">
          <Card>
            <CardHeader>
              <CardTitle>Completed Layaways</CardTitle>
              <CardDescription>Fully paid and completed layaway plans</CardDescription>
            </CardHeader>
            <CardContent>{renderLayawaysTable(getFilteredLayawaysByStatus("completed"))}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* View Layaway Details Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Layaway Details - {selectedLayaway?.id}</DialogTitle>
          </DialogHeader>
          {selectedLayaway && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium mb-2">Customer Information</h3>
                  <div className="space-y-1 text-sm">
                    <div>
                      <strong>Name:</strong> {selectedLayaway.customer}
                    </div>
                    <div>
                      <strong>Phone:</strong> {selectedLayaway.phone}
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-medium mb-2">Layaway Status</h3>
                  <div className="space-y-1 text-sm">
                    <div>
                      <strong>Status:</strong>{" "}
                      <Badge className={getStatusColor(selectedLayaway.status)}>{selectedLayaway.status}</Badge>
                    </div>
                    <div>
                      <strong>Start Date:</strong> {selectedLayaway.startDate}
                    </div>
                    <div>
                      <strong>Due Date:</strong> {selectedLayaway.dueDate}
                    </div>
                    <div>
                      <strong>Payment Plan:</strong>{" "}
                      {selectedLayaway.paymentPlan.charAt(0).toUpperCase() + selectedLayaway.paymentPlan.slice(1)}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">Items & Payment</h3>
                <div className="border rounded-lg p-4">
                  <div className="mb-3">
                    <div className="font-medium">Items:</div>
                    <div className="text-sm">{selectedLayaway.items}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="font-medium">Total Amount:</div>
                      <div className="font-medium">₹{selectedLayaway.totalAmount.toLocaleString()}</div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div>Paid Amount:</div>
                      <div className="text-green-600">₹{selectedLayaway.paidAmount.toLocaleString()}</div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div>Remaining Amount:</div>
                      <div className="text-red-600">₹{selectedLayaway.remainingAmount.toLocaleString()}</div>
                    </div>
                    <div className="pt-2">
                      <Progress
                        value={getPaymentProgress(selectedLayaway.paidAmount, selectedLayaway.totalAmount)}
                        className="h-2"
                      />
                      <div className="text-xs text-gray-500 text-center mt-1">
                        {Math.round(getPaymentProgress(selectedLayaway.paidAmount, selectedLayaway.totalAmount))}%
                        Complete
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {selectedLayaway.status === "active" && selectedLayaway.nextPaymentDate && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    <span className="text-sm text-blue-800">
                      Next payment of ₹{selectedLayaway.nextPaymentAmount.toLocaleString()} due on{" "}
                      {selectedLayaway.nextPaymentDate}
                    </span>
                  </div>
                </div>
              )}

              {selectedLayaway.status === "overdue" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <span className="text-sm text-red-800">
                      Payment of ₹{selectedLayaway.nextPaymentAmount.toLocaleString()} was due on{" "}
                      {selectedLayaway.nextPaymentDate}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-medium mb-2">Payment History</h3>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedLayaway.payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{payment.date}</TableCell>
                          <TableCell>₹{payment.amount.toLocaleString()}</TableCell>
                          <TableCell>{payment.method}</TableCell>
                          <TableCell>{payment.notes || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex space-x-2 pt-4 border-t">
                {(selectedLayaway.status === "active" || selectedLayaway.status === "overdue") && (
                  <>
                    <Button className="flex-1" onClick={() => handleOpenPaymentDialog(selectedLayaway)}>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Make Payment
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleCancelLayaway(selectedLayaway.id)}
                    >
                      Cancel Layaway
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Make Payment Dialog */}
      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Make Payment - {selectedLayaway?.id}</DialogTitle>
            <DialogDescription>Record a payment for this layaway plan</DialogDescription>
          </DialogHeader>
          {selectedLayaway && (
            <div className="space-y-4">
              <div className="space-y-1 text-sm">
                <div>
                  <strong>Customer:</strong> {selectedLayaway.customer}
                </div>
                <div>
                  <strong>Remaining Balance:</strong> ₹{selectedLayaway.remainingAmount.toLocaleString()}
                </div>
                {selectedLayaway.nextPaymentAmount > 0 && (
                  <div>
                    <strong>Suggested Payment:</strong> ₹{selectedLayaway.nextPaymentAmount.toLocaleString()}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-amount">Payment Amount *</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  placeholder="Enter amount"
                  value={newPayment.amount}
                  onChange={(e) => setNewPayment((prev) => ({ ...prev, amount: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-method">Payment Method *</Label>
                <Select
                  value={newPayment.method}
                  onValueChange={(value) => setNewPayment((prev) => ({ ...prev, method: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="bank-transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-notes">Notes</Label>
                <Input
                  id="payment-notes"
                  placeholder="Additional notes"
                  value={newPayment.notes}
                  onChange={(e) => setNewPayment((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsPaymentOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleMakePayment}>Record Payment</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
