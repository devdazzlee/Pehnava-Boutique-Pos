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
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Search, Calendar, Package, Clock, Users, Eye, CheckCircle, XCircle, Phone } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton"
import { isBefore, parseISO, isToday } from "date-fns"

interface Reservation {
  id: string
  customer: string
  phone: string
  product: string
  quantity: number
  reserveDate: string
  pickupDate: string
  deposit: number
  totalAmount: number
  status: "pending" | "confirmed" | "ready" | "completed" | "cancelled" | "expired"
  notes: string
  email?: string
  createdBy?: string
}

interface NewReservation {
  customer: string
  phone: string
  product: string
  quantity: string
  pickupDate: string
  deposit: string
  notes: string
}

export function Reservations() {
  const { toast } = useToast()
  const today = new Date().toISOString().split("T")[0]
  const [isLoading, setIsLoading] = useState(true);

  const [reservations, setReservations] = useState<Reservation[]>([
    {
      id: "RES-001",
      customer: "John Doe",
      phone: "+91 98765 43210",
      product: "iPhone 15 Pro",
      quantity: 1,
      reserveDate: "2024-01-15",
      pickupDate: "2024-01-20",
      deposit: 5000,
      totalAmount: 120000,
      status: "confirmed",
      notes: "Customer prefers space black color",
      email: "john.doe@example.com",
    },
    {
      id: "RES-002",
      customer: "Jane Smith",
      phone: "+91 87654 32109",
      product: "Samsung Galaxy S24",
      quantity: 2,
      reserveDate: "2024-01-14",
      pickupDate: "2024-01-18",
      deposit: 3000,
      totalAmount: 80000,
      status: "pending",
      notes: "Call before pickup",
      email: "jane.smith@example.com",
    },
    {
      id: "RES-003",
      customer: "Mike Johnson",
      phone: "+91 76543 21098",
      product: "MacBook Pro",
      quantity: 1,
      reserveDate: "2024-01-10",
      pickupDate: today,
      deposit: 10000,
      totalAmount: 150000,
      status: "ready",
      notes: "16-inch model with M2 Pro chip",
      email: "mike.j@example.com",
    },
    {
      id: "RES-004",
      customer: "Sarah Wilson",
      phone: "+91 65432 10987",
      product: "iPad Pro",
      quantity: 1,
      reserveDate: "2024-01-05",
      pickupDate: "2024-01-10",
      deposit: 4000,
      totalAmount: 85000,
      status: "expired",
      notes: "12.9-inch with Apple Pencil",
      email: "sarah.w@example.com",
    },
    {
      id: "RES-005",
      customer: "Robert Brown",
      phone: "+91 54321 09876",
      product: "AirPods Pro",
      quantity: 2,
      reserveDate: "2024-01-12",
      pickupDate: today,
      deposit: 2000,
      totalAmount: 25000,
      status: "ready",
      notes: "With engraving",
      email: "robert.b@example.com",
    },
    {
      id: "RES-006",
      customer: "Emily Davis",
      phone: "+91 43210 98765",
      product: "Apple Watch Series 9",
      quantity: 1,
      reserveDate: "2024-01-08",
      pickupDate: "2024-01-12",
      deposit: 3000,
      totalAmount: 45000,
      status: "completed",
      notes: "Stainless steel case with Milanese loop",
      email: "emily.d@example.com",
    },
  ])

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [newReservation, setNewReservation] = useState<NewReservation>({
    customer: "",
    phone: "",
    product: "",
    quantity: "1",
    pickupDate: "",
    deposit: "",
    notes: "",
  })

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    description: string
    action: () => void
    variant?: "default" | "destructive"
  }>({
    isOpen: false,
    title: "",
    description: "",
    action: () => { },
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800"
      case "confirmed":
        return "bg-green-100 text-green-800"
      case "ready":
        return "bg-blue-100 text-blue-800"
      case "completed":
        return "bg-gray-100 text-gray-800"
      case "cancelled":
        return "bg-red-100 text-red-800"
      case "expired":
        return "bg-orange-100 text-orange-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const filteredReservations = useMemo(() => {
    return reservations.filter((reservation) => {
      const matchesSearch =
        reservation.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        reservation.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        reservation.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
        reservation.phone.toLowerCase().includes(searchTerm.toLowerCase())

      return matchesSearch
    })
  }, [reservations, searchTerm])

  const getFilteredReservationsByStatus = (status: string) => {
    if (status === "all") return filteredReservations
    if (status === "overdue") {
      return filteredReservations.filter(
        (reservation) =>
          (reservation.status === "confirmed" || reservation.status === "ready") &&
          isBefore(parseISO(reservation.pickupDate), parseISO(today)),
      )
    }
    return filteredReservations.filter((reservation) => reservation.status === status)
  }

  // Calculate stats
  const activeReservations = reservations.filter(
    (r) => r.status === "pending" || r.status === "confirmed" || r.status === "ready",
  ).length
  const todayPickups = reservations.filter((r) => r.pickupDate === today).length
  const overdueReservations = reservations.filter(
    (r) => (r.status === "confirmed" || r.status === "ready") && isBefore(parseISO(r.pickupDate), parseISO(today)),
  ).length
  const totalValue = reservations
    .filter((r) => r.status !== "cancelled" && r.status !== "completed")
    .reduce((sum, r) => sum + r.totalAmount, 0)

  const generateReservationId = () => {
    const nextId = reservations.length + 1
    return `RES-${nextId.toString().padStart(3, "0")}`
  }

  const getProductPrice = (product: string) => {
    switch (product) {
      case "iPhone 15 Pro":
        return 120000
      case "Samsung Galaxy S24":
        return 80000
      case "MacBook Pro":
        return 150000
      case "iPad Pro":
        return 85000
      case "AirPods Pro":
        return 25000
      case "Apple Watch Series 9":
        return 45000
      default:
        return 0
    }
  }

  const showConfirmDialog = (
    title: string,
    description: string,
    action: () => void,
    variant: "default" | "destructive" = "default",
  ) => {
    setConfirmDialog({
      isOpen: true,
      title,
      description,
      action,
      variant,
    })
  }

  const handleConfirmReservation = (reservationId: string) => {
    showConfirmDialog(
      "Confirm Reservation",
      "Are you sure you want to confirm this reservation? This will notify the customer that their order is confirmed.",
      () => {
        setReservations((prev) =>
          prev.map((reservation) =>
            reservation.id === reservationId ? { ...reservation, status: "confirmed" as const } : reservation,
          ),
        )
        toast({
          title: "Reservation Confirmed",
          description: `Reservation ${reservationId} has been confirmed.`,
        })
        setConfirmDialog({ ...confirmDialog, isOpen: false })
      },
    )
  }

  const handleReadyReservation = (reservationId: string) => {
    showConfirmDialog(
      "Mark as Ready",
      "Are you sure you want to mark this reservation as ready for pickup? The customer will be notified.",
      () => {
        setReservations((prev) =>
          prev.map((reservation) =>
            reservation.id === reservationId ? { ...reservation, status: "ready" as const } : reservation,
          ),
        )
        toast({
          title: "Reservation Ready",
          description: `Reservation ${reservationId} is marked as ready for pickup.`,
        })
        setConfirmDialog({ ...confirmDialog, isOpen: false })
      },
    )
  }

  const handleCompleteReservation = (reservationId: string) => {
    showConfirmDialog(
      "Complete Reservation",
      "Are you sure you want to complete this reservation? This action will mark the pickup as finished and close the reservation.",
      () => {
        setReservations((prev) =>
          prev.map((reservation) =>
            reservation.id === reservationId ? { ...reservation, status: "completed" as const } : reservation,
          ),
        )
        toast({
          title: "Reservation Completed",
          description: `Reservation ${reservationId} has been completed.`,
        })
        setIsViewOpen(false)
        setConfirmDialog({ ...confirmDialog, isOpen: false })
      },
    )
  }

  const handleCancelReservation = (reservationId: string) => {
    showConfirmDialog(
      "Cancel Reservation",
      "Are you sure you want to cancel this reservation? This action cannot be easily undone.",
      () => {
        setReservations((prev) =>
          prev.map((reservation) =>
            reservation.id === reservationId ? { ...reservation, status: "cancelled" as const } : reservation,
          ),
        )
        toast({
          title: "Reservation Cancelled",
          description: `Reservation ${reservationId} has been cancelled.`,
        })
        setIsViewOpen(false)
        setConfirmDialog({ ...confirmDialog, isOpen: false })
      },
      "destructive",
    )
  }

  // New revert functions
  const handleRevertToPending = (reservationId: string) => {
    showConfirmDialog(
      "Revert to Pending",
      "Are you sure you want to revert this reservation back to pending status?",
      () => {
        setReservations((prev) =>
          prev.map((reservation) =>
            reservation.id === reservationId ? { ...reservation, status: "pending" as const } : reservation,
          ),
        )
        toast({
          title: "Reservation Reverted",
          description: `Reservation ${reservationId} has been reverted to pending.`,
        })
        setIsViewOpen(false)
        setConfirmDialog({ ...confirmDialog, isOpen: false })
      },
    )
  }

  const handleRevertToConfirmed = (reservationId: string) => {
    showConfirmDialog(
      "Revert to Confirmed",
      "Are you sure you want to revert this reservation back to confirmed status?",
      () => {
        setReservations((prev) =>
          prev.map((reservation) =>
            reservation.id === reservationId ? { ...reservation, status: "confirmed" as const } : reservation,
          ),
        )
        toast({
          title: "Reservation Reverted",
          description: `Reservation ${reservationId} has been reverted to confirmed.`,
        })
        setIsViewOpen(false)
        setConfirmDialog({ ...confirmDialog, isOpen: false })
      },
    )
  }

  const handleRevertToReady = (reservationId: string) => {
    showConfirmDialog(
      "Revert to Ready",
      "Are you sure you want to revert this reservation back to ready for pickup status?",
      () => {
        setReservations((prev) =>
          prev.map((reservation) =>
            reservation.id === reservationId ? { ...reservation, status: "ready" as const } : reservation,
          ),
        )
        toast({
          title: "Reservation Reverted",
          description: `Reservation ${reservationId} has been reverted to ready for pickup.`,
        })
        setIsViewOpen(false)
        setConfirmDialog({ ...confirmDialog, isOpen: false })
      },
    )
  }

  const handleCreateReservation = () => {
    if (
      !newReservation.customer ||
      !newReservation.phone ||
      !newReservation.product ||
      !newReservation.quantity ||
      !newReservation.pickupDate ||
      !newReservation.deposit
    ) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      })
      return
    }

    const quantity = Number.parseInt(newReservation.quantity)
    const deposit = Number.parseFloat(newReservation.deposit)
    const productPrice = getProductPrice(newReservation.product)
    const totalAmount = productPrice * quantity

    if (deposit > totalAmount) {
      toast({
        title: "Invalid Deposit",
        description: "Deposit amount cannot be greater than total amount.",
        variant: "destructive",
      })
      return
    }

    const reservation: Reservation = {
      id: generateReservationId(),
      customer: newReservation.customer,
      phone: newReservation.phone,
      product: newReservation.product,
      quantity: quantity,
      reserveDate: today,
      pickupDate: newReservation.pickupDate,
      deposit: deposit,
      totalAmount: totalAmount,
      status: "pending",
      notes: newReservation.notes,
      createdBy: "Current User",
    }

    setReservations((prev) => [reservation, ...prev])
    setNewReservation({
      customer: "",
      phone: "",
      product: "",
      quantity: "1",
      pickupDate: "",
      deposit: "",
      notes: "",
    })
    setIsCreateOpen(false)

    toast({
      title: "Reservation Created",
      description: `Reservation ${reservation.id} has been created successfully.`,
    })
  }

  const handleViewReservation = (reservation: Reservation) => {
    setSelectedReservation(reservation)
    setIsViewOpen(true)
  }

  const renderReservationsTable = (reservationsData: Reservation[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Reservation ID</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead>Reserve Date</TableHead>
          <TableHead>Pickup Date</TableHead>
          <TableHead>Deposit</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reservationsData.length === 0 ? (
          <TableRow>
            <TableCell colSpan={10} className="text-center py-8 text-gray-500">
              No reservations found
            </TableCell>
          </TableRow>
        ) : (
          reservationsData.map((reservation) => (
            <TableRow key={reservation.id}>
              <TableCell className="font-medium">{reservation.id}</TableCell>
              <TableCell>{reservation.customer}</TableCell>
              <TableCell>{reservation.product}</TableCell>
              <TableCell>{reservation.quantity}</TableCell>
              <TableCell>{reservation.reserveDate}</TableCell>
              <TableCell
                className={
                  isToday(parseISO(reservation.pickupDate))
                    ? "font-medium text-blue-600"
                    : isBefore(parseISO(reservation.pickupDate), parseISO(today))
                      ? "font-medium text-red-600"
                      : ""
                }
              >
                {reservation.pickupDate}
              </TableCell>
              <TableCell>₹{reservation.deposit.toLocaleString()}</TableCell>
              <TableCell>₹{reservation.totalAmount.toLocaleString()}</TableCell>
              <TableCell>
                <Badge className={getStatusColor(reservation.status)}>{reservation.status}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleViewReservation(reservation)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                  {(reservation.status === "confirmed" || reservation.status === "ready") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCompleteReservation(reservation.id)}
                      className="text-green-600 hover:text-green-700"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Reservations</h1>
          <p className="text-gray-600">Manage product reservations and special orders</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Reservation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Reservation</DialogTitle>
              <DialogDescription>Reserve products for customers</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="customer">Customer *</Label>
                  <Input
                    id="customer"
                    placeholder="Customer name"
                    value={newReservation.customer}
                    onChange={(e) => setNewReservation((prev) => ({ ...prev, customer: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone *</Label>
                  <Input
                    id="phone"
                    placeholder="Customer phone"
                    value={newReservation.phone}
                    onChange={(e) => setNewReservation((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="product">Product *</Label>
                  <Select
                    value={newReservation.product}
                    onValueChange={(value) => setNewReservation((prev) => ({ ...prev, product: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="iPhone 15 Pro">iPhone 15 Pro - ₹120,000</SelectItem>
                      <SelectItem value="Samsung Galaxy S24">Samsung Galaxy S24 - ₹80,000</SelectItem>
                      <SelectItem value="MacBook Pro">MacBook Pro - ₹150,000</SelectItem>
                      <SelectItem value="iPad Pro">iPad Pro - ₹85,000</SelectItem>
                      <SelectItem value="AirPods Pro">AirPods Pro - ₹25,000</SelectItem>
                      <SelectItem value="Apple Watch Series 9">Apple Watch Series 9 - ₹45,000</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    value={newReservation.quantity}
                    onChange={(e) => setNewReservation((prev) => ({ ...prev, quantity: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pickup-date">Expected Pickup Date *</Label>
                  <YmdDatePicker
                    value={newReservation.pickupDate}
                    onChange={(v) => setNewReservation((prev) => ({ ...prev, pickupDate: v }))}
                    />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deposit">Deposit Amount *</Label>
                  <Input
                    id="deposit"
                    type="number"
                    placeholder="Enter deposit"
                    value={newReservation.deposit}
                    onChange={(e) => setNewReservation((prev) => ({ ...prev, deposit: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Special instructions or customer preferences"
                  value={newReservation.notes}
                  onChange={(e) => setNewReservation((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateReservation}>Create Reservation</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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
                <CardTitle className="text-sm font-medium">Active Reservations</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activeReservations}</div>
                <p className="text-xs text-muted-foreground">Awaiting pickup</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Today's Pickups</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{todayPickups}</div>
                <p className="text-xs text-muted-foreground">Scheduled today</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overdue</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overdueReservations}</div>
                <p className="text-xs text-muted-foreground">Past pickup date</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Value</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₹{totalValue.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Reserved inventory</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Reservations ({filteredReservations.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({getFilteredReservationsByStatus("pending").length})</TabsTrigger>
          <TabsTrigger value="confirmed">Confirmed ({getFilteredReservationsByStatus("confirmed").length})</TabsTrigger>
          <TabsTrigger value="ready">Ready for Pickup ({getFilteredReservationsByStatus("ready").length})</TabsTrigger>
          <TabsTrigger value="overdue">Overdue ({getFilteredReservationsByStatus("overdue").length})</TabsTrigger>
        </TabsList>

        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search reservations..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>All Reservations</CardTitle>
              <CardDescription>Manage all product reservations and special orders</CardDescription>
            </CardHeader>
            <CardContent>{renderReservationsTable(getFilteredReservationsByStatus("all"))}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Pending Reservations</CardTitle>
              <CardDescription>Reservations awaiting confirmation</CardDescription>
            </CardHeader>
            <CardContent>{renderReservationsTable(getFilteredReservationsByStatus("pending"))}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="confirmed">
          <Card>
            <CardHeader>
              <CardTitle>Confirmed Reservations</CardTitle>
              <CardDescription>Reservations that have been confirmed</CardDescription>
            </CardHeader>
            <CardContent>{renderReservationsTable(getFilteredReservationsByStatus("confirmed"))}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ready">
          <Card>
            <CardHeader>
              <CardTitle>Ready for Pickup</CardTitle>
              <CardDescription>Reservations ready for customer pickup</CardDescription>
            </CardHeader>
            <CardContent>{renderReservationsTable(getFilteredReservationsByStatus("ready"))}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overdue">
          <Card>
            <CardHeader>
              <CardTitle>Overdue Reservations</CardTitle>
              <CardDescription>Reservations past their pickup date</CardDescription>
            </CardHeader>
            <CardContent>{renderReservationsTable(getFilteredReservationsByStatus("overdue"))}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* View Reservation Details Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reservation Details - {selectedReservation?.id}</DialogTitle>
          </DialogHeader>
          {selectedReservation && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium mb-2">Customer Information</h3>
                  <div className="space-y-1 text-sm">
                    <div>
                      <strong>Name:</strong> {selectedReservation.customer}
                    </div>
                    <div className="flex items-center">
                      <strong>Phone:</strong>{" "}
                      <a
                        href={`tel:${selectedReservation.phone}`}
                        className="text-blue-600 hover:underline flex items-center ml-1"
                      >
                        {selectedReservation.phone} <Phone className="h-3 w-3 ml-1" />
                      </a>
                    </div>
                    {selectedReservation.email && (
                      <div>
                        <strong>Email:</strong>{" "}
                        <a href={`mailto:${selectedReservation.email}`} className="text-blue-600 hover:underline">
                          {selectedReservation.email}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="font-medium mb-2">Reservation Status</h3>
                  <div className="space-y-1 text-sm">
                    <div>
                      <strong>Status:</strong>{" "}
                      <Badge className={getStatusColor(selectedReservation.status)}>{selectedReservation.status}</Badge>
                    </div>
                    <div>
                      <strong>Reserved On:</strong> {selectedReservation.reserveDate}
                    </div>
                    <div>
                      <strong>Pickup Date:</strong>{" "}
                      <span
                        className={
                          isToday(parseISO(selectedReservation.pickupDate))
                            ? "font-medium text-blue-600"
                            : isBefore(parseISO(selectedReservation.pickupDate), parseISO(today))
                              ? "font-medium text-red-600"
                              : ""
                        }
                      >
                        {selectedReservation.pickupDate}
                      </span>
                    </div>
                    {selectedReservation.createdBy && (
                      <div>
                        <strong>Created By:</strong> {selectedReservation.createdBy}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">Product Information</h3>
                <div className="border rounded-lg p-4">
                  <div className="flex justify-between items-center py-2">
                    <div>
                      <div className="font-medium">{selectedReservation.product}</div>
                      <div className="text-sm text-gray-500">Quantity: {selectedReservation.quantity}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">₹{selectedReservation.totalAmount.toLocaleString()}</div>
                      <div className="text-sm text-gray-500">
                        Unit Price: ₹{(selectedReservation.totalAmount / selectedReservation.quantity).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="border-t mt-2 pt-2">
                    <div className="flex justify-between items-center">
                      <div className="font-medium">Deposit Paid</div>
                      <div className="font-medium">₹{selectedReservation.deposit.toLocaleString()}</div>
                    </div>
                    <div className="flex justify-between items-center text-sm text-gray-500">
                      <div>Balance Due</div>
                      <div>₹{(selectedReservation.totalAmount - selectedReservation.deposit).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              </div>

              {selectedReservation.notes && (
                <div>
                  <h3 className="font-medium mb-2">Notes</h3>
                  <div className="bg-gray-50 p-3 rounded-lg text-sm">{selectedReservation.notes}</div>
                </div>
              )}

              <div className="flex space-x-2">
                {selectedReservation.status === "pending" && (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      handleConfirmReservation(selectedReservation.id)
                    }}
                  >
                    Confirm Reservation
                  </Button>
                )}
                {selectedReservation.status === "confirmed" && (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      handleReadyReservation(selectedReservation.id)
                    }}
                  >
                    Mark as Ready
                  </Button>
                )}
                {(selectedReservation.status === "confirmed" || selectedReservation.status === "ready") && (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      handleCompleteReservation(selectedReservation.id)
                    }}
                  >
                    Complete Pickup
                  </Button>
                )}

                {/* Revert Options */}
                {selectedReservation.status === "completed" && (
                  <div className="flex space-x-2 w-full">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleRevertToReady(selectedReservation.id)}
                    >
                      Revert to Ready
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleRevertToConfirmed(selectedReservation.id)}
                    >
                      Revert to Confirmed
                    </Button>
                  </div>
                )}

                {selectedReservation.status === "ready" && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleRevertToConfirmed(selectedReservation.id)}
                  >
                    Revert to Confirmed
                  </Button>
                )}

                {(selectedReservation.status === "confirmed" || selectedReservation.status === "ready") && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleRevertToPending(selectedReservation.id)}
                  >
                    Revert to Pending
                  </Button>
                )}

                {selectedReservation.status !== "completed" && selectedReservation.status !== "cancelled" && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      handleCancelReservation(selectedReservation.id)
                    }}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel Reservation
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, isOpen: open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
            <DialogDescription>{confirmDialog.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}>
              Cancel
            </Button>
            <Button
              variant={confirmDialog.variant === "destructive" ? "destructive" : "default"}
              onClick={confirmDialog.action}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
