"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { YmdDatePicker } from "@/components/ui/date-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, Plus, Edit, Trash2, Tag, Percent, Calendar, Gift } from "lucide-react"
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton"

interface Promotion {
  id: string
  name: string
  description: string
  type: "percentage" | "fixed" | "bogo"
  value: number
  startDate: string
  endDate: string
  status: "active" | "inactive" | "expired"
  usageCount: number
  maxUsage?: number
  minPurchase?: number
}

export function Promotions() {
  const [promotions, setPromotions] = useState<Promotion[]>([
    {
      id: "1",
      name: "Weekend Special",
      description: "10% off on all fruits and vegetables",
      type: "percentage",
      value: 10,
      startDate: "2024-01-13",
      endDate: "2024-01-14",
      status: "expired",
      usageCount: 45,
      maxUsage: 100,
      minPurchase: 20,
    },
    {
      id: "2",
      name: "Buy 2 Get 1 Free",
      description: "Buy 2 dairy products, get 1 free",
      type: "bogo",
      value: 1,
      startDate: "2024-01-15",
      endDate: "2024-01-31",
      status: "active",
      usageCount: 12,
      maxUsage: 50,
    },
    {
      id: "3",
      name: "New Year Discount",
      description: "$5 off on purchases above $50",
      type: "fixed",
      value: 5,
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      status: "active",
      usageCount: 28,
      minPurchase: 50,
    },
    {
      id: "4",
      name: "Student Discount",
      description: "15% off for students with valid ID",
      type: "percentage",
      value: 15,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      status: "active",
      usageCount: 67,
      minPurchase: 10,
    },
  ])

  const [searchTerm, setSearchTerm] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null)
  const [newPromotion, setNewPromotion] = useState<Partial<Promotion>>({})

  const filteredPromotions = promotions.filter(
    (promotion) =>
      promotion.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      promotion.description.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const handleAddPromotion = () => {
    if (newPromotion.name && newPromotion.type && newPromotion.value) {
      const promotion: Promotion = {
        id: Date.now().toString(),
        name: newPromotion.name,
        description: newPromotion.description || "",
        type: newPromotion.type,
        value: newPromotion.value,
        startDate: newPromotion.startDate || new Date().toISOString().split("T")[0],
        endDate: newPromotion.endDate || new Date().toISOString().split("T")[0],
        status: "active",
        usageCount: 0,
        maxUsage: newPromotion.maxUsage,
        minPurchase: newPromotion.minPurchase,
      }
      setPromotions([...promotions, promotion])
      setNewPromotion({})
      setIsAddDialogOpen(false)
    }
  }

  const handleEditPromotion = () => {
    if (editingPromotion) {
      setPromotions(promotions.map((p) => (p.id === editingPromotion.id ? editingPromotion : p)))
      setEditingPromotion(null)
    }
  }

  const handleDeletePromotion = (id: string) => {
    setPromotions(promotions.filter((p) => p.id !== id))
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800"
      case "inactive":
        return "bg-gray-100 text-gray-800"
      case "expired":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getPromotionDisplay = (promotion: Promotion) => {
    switch (promotion.type) {
      case "percentage":
        return `${promotion.value}% OFF`
      case "fixed":
        return `$${promotion.value} OFF`
      case "bogo":
        return `Buy ${promotion.value + 1} Get ${promotion.value} Free`
      default:
        return promotion.value.toString()
    }
  }

  const activePromotions = promotions.filter((p) => p.status === "active").length
  const totalUsage = promotions.reduce((sum, p) => sum + p.usageCount, 0)

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Promotions & Discounts</h1>
          <p className="text-sm md:text-base text-gray-600">Manage promotional campaigns and discount codes</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Promotion
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Promotion</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Promotion Name</Label>
                <Input
                  id="name"
                  value={newPromotion.name || ""}
                  onChange={(e) => setNewPromotion({ ...newPromotion, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newPromotion.description || ""}
                  onChange={(e) => setNewPromotion({ ...newPromotion, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="type">Promotion Type</Label>
                  <Select onValueChange={(value: any) => setNewPromotion({ ...newPromotion, type: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage Discount</SelectItem>
                      <SelectItem value="fixed">Fixed Amount Off</SelectItem>
                      <SelectItem value="bogo">Buy One Get One</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="value">Value</Label>
                  <Input
                    id="value"
                    type="number"
                    value={newPromotion.value || ""}
                    onChange={(e) => setNewPromotion({ ...newPromotion, value: Number.parseFloat(e.target.value) })}
                    placeholder={newPromotion.type === "percentage" ? "10" : "5"}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startDate">Start Date</Label>
                  <YmdDatePicker
                    value={newPromotion.startDate || ""}
                    onChange={(v) => setNewPromotion({ ...newPromotion, startDate: v })}
                    />
                </div>
                <div>
                  <Label htmlFor="endDate">End Date</Label>
                  <YmdDatePicker
                    value={newPromotion.endDate || ""}
                    onChange={(v) => setNewPromotion({ ...newPromotion, endDate: v })}
                    />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="maxUsage">Max Usage (Optional)</Label>
                  <Input
                    id="maxUsage"
                    type="number"
                    value={newPromotion.maxUsage || ""}
                    onChange={(e) => setNewPromotion({ ...newPromotion, maxUsage: Number.parseInt(e.target.value) })}
                    placeholder="Unlimited"
                  />
                </div>
                <div>
                  <Label htmlFor="minPurchase">Min Purchase (Optional)</Label>
                  <Input
                    id="minPurchase"
                    type="number"
                    value={newPromotion.minPurchase || ""}
                    onChange={(e) =>
                      setNewPromotion({ ...newPromotion, minPurchase: Number.parseFloat(e.target.value) })
                    }
                    placeholder="No minimum"
                  />
                </div>
              </div>
              <Button onClick={handleAddPromotion} className="w-full">
                Create Promotion
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
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
                <CardTitle className="text-sm font-medium">Total Promotions</CardTitle>
                <Tag className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{promotions.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Promotions</CardTitle>
                <Tag className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{activePromotions}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Usage</CardTitle>
                <Gift className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalUsage}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Usage</CardTitle>
                <Percent className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {promotions.length > 0 ? Math.round(totalUsage / promotions.length) : 0}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search promotions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Promotions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Promotions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <div className="inline-block min-w-full align-middle">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Promotion</TableHead>
                    <TableHead className="min-w-[150px]">Type & Value</TableHead>
                    <TableHead className="min-w-[180px]">Duration</TableHead>
                    <TableHead className="min-w-[100px]">Usage</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                    <TableHead className="min-w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
            <TableBody>
              {filteredPromotions.map((promotion) => (
                <TableRow key={promotion.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{promotion.name}</div>
                      <div className="text-sm text-gray-500">{promotion.description}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className="font-mono">
                        {getPromotionDisplay(promotion)}
                      </Badge>
                      {promotion.minPurchase && (
                        <span className="text-xs text-gray-500">Min: ${promotion.minPurchase}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-1 text-sm">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {promotion.startDate} to {promotion.endDate}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div>{promotion.usageCount} used</div>
                      {promotion.maxUsage && <div className="text-gray-500">of {promotion.maxUsage} max</div>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(promotion.status)}>{promotion.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button size="sm" variant="outline" onClick={() => setEditingPromotion(promotion)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeletePromotion(promotion.id)}
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Promotion Dialog */}
      <Dialog open={!!editingPromotion} onOpenChange={() => setEditingPromotion(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Promotion</DialogTitle>
          </DialogHeader>
          {editingPromotion && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Promotion Name</Label>
                <Input
                  id="edit-name"
                  value={editingPromotion.name}
                  onChange={(e) => setEditingPromotion({ ...editingPromotion, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editingPromotion.description}
                  onChange={(e) => setEditingPromotion({ ...editingPromotion, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-type">Promotion Type</Label>
                  <Select
                    value={editingPromotion.type}
                    onValueChange={(value: any) => setEditingPromotion({ ...editingPromotion, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage Discount</SelectItem>
                      <SelectItem value="fixed">Fixed Amount Off</SelectItem>
                      <SelectItem value="bogo">Buy One Get One</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-value">Value</Label>
                  <Input
                    id="edit-value"
                    type="number"
                    value={editingPromotion.value}
                    onChange={(e) =>
                      setEditingPromotion({ ...editingPromotion, value: Number.parseFloat(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-startDate">Start Date</Label>
                  <YmdDatePicker
                    value={editingPromotion.startDate}
                    onChange={(v) => setEditingPromotion({ ...editingPromotion, startDate: v })}
                    />
                </div>
                <div>
                  <Label htmlFor="edit-endDate">End Date</Label>
                  <YmdDatePicker
                    value={editingPromotion.endDate}
                    onChange={(v) => setEditingPromotion({ ...editingPromotion, endDate: v })}
                    />
                </div>
              </div>
              <Button onClick={handleEditPromotion} className="w-full">
                Update Promotion
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
