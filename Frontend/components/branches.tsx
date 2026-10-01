"use client"

import { useState, useEffect } from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Building2,
  Warehouse,
  MapPin,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Calendar,
  Settings,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  KeyRound,
  Eye,
} from "lucide-react"
import { toast } from "sonner"
import apiClient from "@/lib/apiClient"
import { PageLoader } from "@/components/ui/page-loader"
import {
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet"
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

interface Branch {
  id: string
  name: string
  code: string
  address?: string
  branch_type?: "WAREHOUSE" | "BRANCH"
  allow_neg_pos_stock: boolean
  allow_neg_stock_grrn: boolean
  allow_neg_transferout: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

// Zod validation schema for Branches
const branchFormSchema = z.object({
  name: z
    .string({ required_error: "Branch name is required" })
    .trim()
    .min(2, "Branch name must be at least 2 characters")
    .max(100, "Branch name is too long"),
  address: z.string().trim().optional(),
  branch_type: z.enum(["BRANCH", "WAREHOUSE"]).default("BRANCH"),
  allow_neg_pos_stock: z.boolean().default(false),
  allow_neg_stock_grrn: z.boolean().default(false),
  allow_neg_transferout: z.boolean().default(false),
  is_active: z.boolean().default(true),
})

type BranchFormErrors = Partial<Record<keyof z.infer<typeof branchFormSchema>, string>>

// Parse axios/backend errors verbatim
const extractApiError = (err: any, fallback: string = "Something went wrong"): string => {
  const data = err?.response?.data
  if (!data) return err?.message || fallback
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const first = data.errors[0]
    if (typeof first === "string") return first
    if (first?.message) return String(first.message)
  }
  if (typeof data.message === "string") return data.message
  return fallback
}

export function Branches() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [searchValue, setSearchValue] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalBranches, setTotalBranches] = useState(0)
  
  // Dialog Open States
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null)
  const [viewTarget, setViewTarget] = useState<Branch | null>(null)

  // Loading States
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Inline Validation Error States
  const [addErrors, setAddErrors] = useState<BranchFormErrors>({})
  const [editErrors, setEditErrors] = useState<BranchFormErrors>({})

  const [newBranch, setNewBranch] = useState<z.infer<typeof branchFormSchema>>({
    name: "",
    address: "",
    branch_type: "BRANCH",
    allow_neg_pos_stock: false,
    allow_neg_stock_grrn: false,
    allow_neg_transferout: false,
    is_active: true,
  })

  // Branch login (the User/BRANCH_MANAGER account tied to this branch)
  const [addLoginEmail, setAddLoginEmail] = useState("")
  const [addLoginPassword, setAddLoginPassword] = useState("")
  const [editLoginEmail, setEditLoginEmail] = useState("")
  const [editLoginEmailOriginal, setEditLoginEmailOriginal] = useState("")
  const [editLoginPassword, setEditLoginPassword] = useState("")
  const [editHasLogin, setEditHasLogin] = useState(false)
  const [loadingCredentials, setLoadingCredentials] = useState(false)

  // Helper to map Zod validation issues
  const zodErrorsToMap = (err: z.ZodError): BranchFormErrors => {
    const map: BranchFormErrors = {}
    for (const issue of err.errors) {
      const key = issue.path[0]
      if (typeof key === "string" && !(key in map)) {
        ;(map as Record<string, string>)[key] = issue.message
      }
    }
    return map
  }

  // Fetch branches from API
  const fetchBranches = async (page = 1, search = "", isActive?: boolean) => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "12",
      })

      if (search) params.append("search", search)
      if (isActive !== undefined) params.append("is_active", isActive.toString())

      const response = await apiClient.get(`/branches?${params}`)
      const responseData = response.data

      if (responseData.success) {
        if (Array.isArray(responseData.data)) {
          setBranches(responseData.data)
          setTotalPages(1)
          setTotalBranches(responseData.data.length)
          setCurrentPage(1)
        } else if (responseData.data && responseData.data.data) {
          setBranches(responseData.data.data || [])
          setTotalPages(responseData.data.meta?.totalPages || 1)
          setTotalBranches(responseData.data.meta?.total || 0)
          setCurrentPage(responseData.data.meta?.page || 1)
        }
      } else {
        setBranches([])
        setTotalPages(1)
        setTotalBranches(0)
        setCurrentPage(1)
      }
    } catch (error: any) {
      console.log("Error fetching branches:", error)
      setBranches([])
      setTotalPages(1)
      setTotalBranches(0)
      setCurrentPage(1)
      toast.error(extractApiError(error, "Failed to load branches"))
    } finally {
      setIsLoading(false)
    }
  }

  // Create branch
  const handleAddBranch = async () => {
    // Client-side schema validation
    const parsed = branchFormSchema.safeParse(newBranch)
    if (!parsed.success) {
      const map = zodErrorsToMap(parsed.error)
      setAddErrors(map)
      toast.error("Please fix the validation errors below.")
      return
    }
    setAddErrors({})

    const loginEmail = addLoginEmail.trim()
    const loginPassword = addLoginPassword.trim()
    if ((loginEmail && !loginPassword) || (loginPassword && !loginEmail)) {
      toast.error("Enter both a username and password to set up the branch login, or leave both blank.")
      return
    }
    if (loginPassword && loginPassword.length < 6) {
      toast.error("Branch login password must be at least 6 characters.")
      return
    }

    try {
      setActionLoading(true)
      const response = await apiClient.post("/branches", parsed.data)

      if (response.data.success) {
        const createdBranch = response.data.data
        toast.success("Branch created successfully", {
          description: `${parsed.data.name} has been added.`,
        })

        if (loginEmail && loginPassword) {
          try {
            await apiClient.put(`/branches/${createdBranch.id}/credentials`, {
              email: loginEmail,
              password: loginPassword,
            })
            toast.success("Branch login created", {
              description: `${loginEmail} can now sign in to ${parsed.data.name}.`,
            })
          } catch (credError: any) {
            toast.error(
              extractApiError(
                credError,
                "Branch created, but the login could not be set up. Add it later from Edit.",
              ),
            )
          }
        }

        // Refresh the list
        await fetchBranches(currentPage, searchTerm, statusFilter === "all" ? undefined : statusFilter === "active")

        // Reset state
        setNewBranch({
          name: "",
          address: "",
          branch_type: "BRANCH",
          allow_neg_pos_stock: false,
          allow_neg_stock_grrn: false,
          allow_neg_transferout: false,
          is_active: true,
        })
        setAddLoginEmail("")
        setAddLoginPassword("")
        setIsAddDialogOpen(false)
      }
    } catch (error: any) {
      console.log("Error creating branch:", error)
      toast.error(extractApiError(error, "Failed to create branch"))
    } finally {
      setActionLoading(false)
    }
  }

  // Update branch
  const handleEditBranch = async () => {
    if (!editingBranch) return

    // Client-side schema validation
    const parsed = branchFormSchema.safeParse({
      name: editingBranch.name,
      address: editingBranch.address || "",
      branch_type: editingBranch.branch_type || "BRANCH",
      allow_neg_pos_stock: editingBranch.allow_neg_pos_stock,
      allow_neg_stock_grrn: editingBranch.allow_neg_stock_grrn,
      allow_neg_transferout: editingBranch.allow_neg_transferout,
      is_active: editingBranch.is_active,
    })

    if (!parsed.success) {
      const map = zodErrorsToMap(parsed.error)
      setEditErrors(map)
      toast.error("Please fix the validation errors below.")
      return
    }
    setEditErrors({})

    const loginEmail = editLoginEmail.trim()
    const loginPassword = editLoginPassword.trim()
    const emailChanged = loginEmail.length > 0 && loginEmail !== editLoginEmailOriginal
    const passwordChanged = loginPassword.length > 0
    if (passwordChanged && loginPassword.length < 6) {
      toast.error("New branch login password must be at least 6 characters.")
      return
    }
    if (!editHasLogin && emailChanged && !passwordChanged) {
      toast.error("Enter a password too — this branch doesn't have a login yet.")
      return
    }

    try {
      setActionLoading(true)
      const response = await apiClient.patch(`/branches/${editingBranch.id}`, parsed.data)

      if (response.data.success) {
        toast.success("Branch updated successfully", {
          description: `${parsed.data.name} changes were saved.`,
        })

        if (emailChanged || passwordChanged) {
          try {
            await apiClient.put(`/branches/${editingBranch.id}/credentials`, {
              ...(emailChanged ? { email: loginEmail } : {}),
              ...(passwordChanged ? { password: loginPassword } : {}),
            })
            toast.success("Branch login updated")
          } catch (credError: any) {
            toast.error(extractApiError(credError, "Failed to update branch login"))
          }
        }

        // Refresh the list
        fetchBranches(currentPage, searchTerm, statusFilter === "all" ? undefined : statusFilter === "active")
        setEditingBranch(null)
      }
    } catch (error: any) {
      console.log("Error updating branch:", error)
      toast.error(extractApiError(error, "Failed to update branch"))
    } finally {
      setActionLoading(false)
    }
  }

  // Delete branch
  const handleDeleteBranch = async () => {
    if (!deleteTarget) return

    try {
      setActionLoading(true)
      const response = await apiClient.delete(`/branches/${deleteTarget.id}`)

      if (response.data.success) {
        toast.success("Branch deleted successfully", {
          description: `${deleteTarget.name} has been removed.`,
        })
        // Refresh list
        await fetchBranches(currentPage, searchTerm, statusFilter === "all" ? undefined : statusFilter === "active")
        setDeleteTarget(null)
      }
    } catch (error: any) {
      console.log("Error deleting branch:", error)
      toast.error(extractApiError(error, "Failed to delete branch"))
    } finally {
      setActionLoading(false)
    }
  }

  // Handle search
  const handleSearch = (value: string) => {
    setSearchValue(value)
    setCurrentPage(1)
  }

  // Handle status filter
  const handleStatusFilter = (value: string) => {
    setStatusFilter(value)
    setCurrentPage(1)
  }

  // Handle pagination
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  // Handle edit dialog open
  const handleEditDialogOpen = async (branch: Branch) => {
    setEditErrors({})
    setEditingBranch({ ...branch })
    setEditLoginPassword("")
    setEditLoginEmail("")
    setEditLoginEmailOriginal("")
    setEditHasLogin(false)
    setLoadingCredentials(true)
    try {
      const res = await apiClient.get(`/branches/${branch.id}/credentials`)
      const data = res.data?.data
      setEditHasLogin(!!data?.hasLogin)
      setEditLoginEmail(data?.email || "")
      setEditLoginEmailOriginal(data?.email || "")
    } catch (error: any) {
      toast.error(extractApiError(error, "Failed to load branch login info"))
    } finally {
      setLoadingCredentials(false)
    }
  }

  // Handle edit dialog close
  const handleEditDialogClose = () => {
    setEditingBranch(null)
  }

  // Debounce searchValue changes to searchTerm
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchValue)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchValue])

  // Fetch branches whenever search, filter, or page changes
  useEffect(() => {
    fetchBranches(currentPage, searchTerm, statusFilter === "all" ? undefined : statusFilter === "active")
  }, [searchTerm, statusFilter, currentPage])

  const activeBranches = branches?.filter((b) => b.is_active).length || 0
  const inactiveBranches = branches?.filter((b) => !b.is_active).length || 0

  if (isLoading && branches.length === 0) {
    return <PageLoader message="Loading branches data..." />
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Branch Management</h1>
          <p className="text-sm md:text-base text-gray-600">Manage your store locations and warehouses</p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Branch
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Locations</CardTitle>
            <Building2 className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBranches}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Locations</CardTitle>
            <Building2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeBranches}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive Locations</CardTitle>
            <Building2 className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{inactiveBranches}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Page</CardTitle>
            <Filter className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {currentPage} / {totalPages}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1 sm:max-w-md">
          {isLoading ? (
            <Loader2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-indigo-500 h-4 w-4 animate-spin" />
          ) : (
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          )}
          <Input
            placeholder="Search by location name or code..."
            value={searchValue}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="inactive">Inactive Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Branches Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {branches.map((branch) => {
          const isWarehouse = branch.branch_type === "WAREHOUSE"
          return (
            <Card key={branch.id} className="hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
              {/* Type Indicator Top Accent Line */}
              <div className={`h-1 w-full ${isWarehouse ? "bg-purple-500" : "bg-indigo-500"}`} />
              
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-sm ${
                      isWarehouse 
                        ? "bg-purple-50 text-purple-600 border-purple-100" 
                        : "bg-indigo-50 text-indigo-600 border-indigo-100"
                    }`}>
                      {isWarehouse ? <Warehouse className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
                    </div>
                    <div>
                      <CardTitle className="text-lg font-bold text-gray-900">{branch.name}</CardTitle>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                          {branch.code}
                        </span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border font-semibold ${
                          isWarehouse 
                            ? "bg-purple-50 text-purple-700 border-purple-200" 
                            : "bg-indigo-50 text-indigo-700 border-indigo-200"
                        }`}>
                          {isWarehouse ? "Warehouse" : "Branch"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <Badge
                    variant="outline"
                    className={`text-xs font-semibold px-2 py-0.5 border ${
                      branch.is_active 
                        ? "bg-green-50 text-green-700 border-green-200" 
                        : "bg-red-50 text-red-700 border-red-200"
                    }`}
                  >
                    {branch.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4 flex-1">
                {/* Location Address */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-indigo-500" />
                    Address
                  </span>
                  <p className="text-sm text-gray-700 leading-relaxed font-medium bg-gray-50/50 p-2 rounded-lg border border-gray-100">
                    {branch.address || <span className="text-gray-400 italic">No address registered</span>}
                  </p>
                </div>

                {/* Metadata creation time */}
                <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-2 bg-white pt-2 border-t border-gray-100">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Created: {new Date(branch.created_at).toLocaleDateString()}</span>
                </div>

                {/* Actions Bottom Bar */}
                <div className="flex items-center justify-end gap-2 pt-2 mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setViewTarget(branch)}
                    title="View location"
                  >
                    <Eye className="h-4 w-4 mr-1.5" />
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEditDialogOpen(branch)}
                    title="Edit Location"
                  >
                    <Edit className="h-4 w-4 mr-1.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeleteTarget(branch)}
                    className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 hover:bg-red-50"
                    title="Delete Location"
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          <div className="flex items-center space-x-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const page = i + 1
              return (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePageChange(page)}
                  disabled={loading}
                >
                  {page}
                </Button>
              )
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages || loading}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <DetailSheet
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAddErrors({})
            setAddLoginEmail("")
            setAddLoginPassword("")
          }
          setIsAddDialogOpen(open)
        }}
        size="lg"
      >
        <DetailSheetHeader
          title="Add branch"
          subtitle="Create a store or warehouse location"
          icon={<Building2 className="h-5 w-5" />}
        />
        <DetailSheetBody className="space-y-4">
          <div>
            <Label htmlFor="name">Branch name *</Label>
            <Input
              id="name"
              value={newBranch.name}
              onChange={(e) => {
                setNewBranch({ ...newBranch, name: e.target.value })
                if (addErrors.name) setAddErrors((p) => ({ ...p, name: undefined }))
              }}
              placeholder="Enter branch name"
              aria-invalid={!!addErrors.name}
              className={addErrors.name ? "border-red-500 focus-visible:ring-red-500" : ""}
            />
            {addErrors.name && (
              <p className="text-sm text-red-600 mt-1" role="alert">{addErrors.name}</p>
            )}
          </div>
          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={newBranch.address || ""}
              onChange={(e) => {
                setNewBranch({ ...newBranch, address: e.target.value })
                if (addErrors.address) setAddErrors((p) => ({ ...p, address: undefined }))
              }}
              placeholder="Enter branch address"
              rows={3}
              aria-invalid={!!addErrors.address}
              className={addErrors.address ? "border-red-500 focus-visible:ring-red-500" : ""}
            />
            {addErrors.address && (
              <p className="text-sm text-red-600 mt-1" role="alert">{addErrors.address}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={newBranch.branch_type || "BRANCH"}
              onValueChange={(v: "WAREHOUSE" | "BRANCH") =>
                setNewBranch({ ...newBranch, branch_type: v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BRANCH">Branch</SelectItem>
                <SelectItem value="WAREHOUSE">Warehouse</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="is_active">Active status</Label>
              <p className="text-xs text-muted-foreground">Enable this location for operations</p>
            </div>
            <Switch
              id="is_active"
              checked={newBranch.is_active}
              onCheckedChange={(checked) => setNewBranch({ ...newBranch, is_active: checked })}
            />
          </div>
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              <Label>Branch login (optional)</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Give this branch its own sign-in now, or set it up later from Edit.
            </p>
            <div>
              <Label htmlFor="add-login-email">Username / Email</Label>
              <Input
                id="add-login-email"
                type="email"
                value={addLoginEmail}
                onChange={(e) => setAddLoginEmail(e.target.value)}
                placeholder="branch@pehnawa.com"
              />
            </div>
            <div>
              <Label htmlFor="add-login-password">Password</Label>
              <Input
                id="add-login-password"
                type="password"
                value={addLoginPassword}
                onChange={(e) => setAddLoginPassword(e.target.value)}
                placeholder="Minimum 6 characters"
              />
            </div>
          </div>
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={actionLoading}>
            Cancel
          </Button>
          <Button onClick={handleAddBranch} disabled={actionLoading}>
            {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add branch
          </Button>
        </DetailSheetFooter>
      </DetailSheet>

      <DetailSheet
        open={!!editingBranch}
        onOpenChange={(open) => {
          if (!open) handleEditDialogClose()
        }}
        size="lg"
      >
        <DetailSheetHeader
          title="Edit branch"
          subtitle={editingBranch?.code}
          icon={<Building2 className="h-5 w-5" />}
        />
        <DetailSheetBody className="space-y-4">
          {editingBranch && (
            <>
              <div>
                <Label htmlFor="edit-name">Branch Name *</Label>
                <Input
                  id="edit-name"
                  value={editingBranch.name}
                  onChange={(e) => {
                    const v = e.target.value
                    setEditingBranch({ ...editingBranch, name: v })
                    setEditErrors((p) => ({
                      ...p,
                      name: !v || v.trim().length < 2 ? "Branch name must be at least 2 characters" : undefined,
                    }))
                  }}
                  aria-invalid={!!editErrors.name}
                  className={editErrors.name ? "border-red-500 focus-visible:ring-red-500" : ""}
                />
                {editErrors.name && (
                  <p className="text-sm text-red-600 mt-1" role="alert">{editErrors.name}</p>
                )}
              </div>

              <div>
                <Label htmlFor="edit-code">Branch Code</Label>
                <Input id="edit-code" value={editingBranch.code} disabled className="bg-gray-100" />
                <p className="text-xs text-gray-500 mt-1">Branch code is auto-generated and cannot be changed</p>
              </div>

              <div>
                <Label htmlFor="edit-address">Address</Label>
                <Textarea
                  id="edit-address"
                  value={editingBranch.address || ""}
                  onChange={(e) => {
                    setEditingBranch({ ...editingBranch, address: e.target.value })
                    if (editErrors.address) setEditErrors((p) => ({ ...p, address: undefined }))
                  }}
                  rows={3}
                  aria-invalid={!!editErrors.address}
                  className={editErrors.address ? "border-red-500 focus-visible:ring-red-500" : ""}
                />
                {editErrors.address && (
                  <p className="text-sm text-red-600 mt-1" role="alert">{editErrors.address}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={editingBranch.branch_type || "BRANCH"}
                  onValueChange={(v: "WAREHOUSE" | "BRANCH") =>
                    setEditingBranch({ ...editingBranch, branch_type: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRANCH">Branch</SelectItem>
                    <SelectItem value="WAREHOUSE">Warehouse</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-100 p-4 bg-gray-50/50">
                <div className="space-y-0.5">
                  <Label htmlFor="edit-is_active" className="text-base font-bold text-gray-900">Active Status</Label>
                  <p className="text-xs text-gray-500 font-medium">Enable or disable this branch/location for system operations</p>
                </div>
                <Switch
                  id="edit-is_active"
                  checked={editingBranch.is_active}
                  onCheckedChange={(checked) => setEditingBranch({ ...editingBranch, is_active: checked })}
                />
              </div>

              <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-blue-600" />
                  <Label className="text-sm font-bold text-gray-900">Branch Login</Label>
                </div>
                {loadingCredentials ? (
                  <p className="text-xs text-gray-500 flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading login info...
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-gray-500 -mt-1">
                      {editHasLogin
                        ? "Update the username or set a new password below."
                        : "No login exists yet for this branch — set one up below."}
                    </p>
                    <div>
                      <Label htmlFor="edit-login-email">Username / Email</Label>
                      <Input
                        id="edit-login-email"
                        type="email"
                        value={editLoginEmail}
                        onChange={(e) => setEditLoginEmail(e.target.value)}
                        placeholder="branch@pehnawa.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-login-password">{editHasLogin ? "New Password" : "Password"}</Label>
                      <Input
                        id="edit-login-password"
                        type="password"
                        value={editLoginPassword}
                        onChange={(e) => setEditLoginPassword(e.target.value)}
                        placeholder={editHasLogin ? "Leave blank to keep current password" : "Minimum 6 characters"}
                      />
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={handleEditDialogClose} disabled={actionLoading}>
            Cancel
          </Button>
          <Button onClick={handleEditBranch} disabled={actionLoading}>
            {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Update branch
          </Button>
        </DetailSheetFooter>
      </DetailSheet>

      <DetailSheet
        open={!!viewTarget}
        onOpenChange={(open) => !open && setViewTarget(null)}
        size="md"
      >
        <DetailSheetHeader
          title={viewTarget?.name ?? "Branch"}
          subtitle={viewTarget?.code}
          icon={
            viewTarget?.branch_type === "WAREHOUSE" ? (
              <Warehouse className="h-5 w-5" />
            ) : (
              <Building2 className="h-5 w-5" />
            )
          }
        />
        <DetailSheetBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Type</p>
              <p className="font-medium">{viewTarget?.branch_type === "WAREHOUSE" ? "Warehouse" : "Branch"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="font-medium">{viewTarget?.is_active ? "Active" : "Inactive"}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Address</p>
            <p className="text-sm mt-1">{viewTarget?.address || "No address registered"}</p>
          </div>
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={() => setViewTarget(null)}>
            Close
          </Button>
          <Button
            onClick={() => {
              if (!viewTarget) return
              setViewTarget(null)
              handleEditDialogOpen(viewTarget)
            }}
          >
            Edit
          </Button>
        </DetailSheetFooter>
      </DetailSheet>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !actionLoading) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the branch and linked records for this location, including stock, sales, purchases, transfers, and cash drawer history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDeleteBranch()
              }}
              disabled={actionLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading ? "Deleting…" : "Delete branch"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
