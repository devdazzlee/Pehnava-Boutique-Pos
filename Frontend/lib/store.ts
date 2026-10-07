import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import apiClient from './apiClient'
import { offlineDB } from './offline-db'
import { syncManager } from './offline-sync'

interface Product {
  id: string
  name: string
  price: number
  category: string
  stock: number
  categoryId: string
  barcode?: string
  label_barcode?: string
  code?: string // Product code for barcode matching
  current_stock?: number
  available_stock?: number
  reserved_stock?: number
  minimum_stock?: number
  maximum_stock?: number
  sku?: string
  subcategoryId?: string
  subcategory?: string
  unitId?: string
  unitName?: string
  taxId?: string
  taxName?: string
  supplierId?: string
  supplierName?: string
  brandId?: string
  brandName?: string
  colorId?: string
  colorName?: string
  sizeId?: string
  sizeName?: string
  purchase_rate?: number
  sales_rate_exc_dis_and_tax?: number
  sales_rate_inc_dis_and_tax?: number
  discount_amount?: number
  min_qty?: number
  max_qty?: number
  is_active?: boolean
  display_on_pos?: boolean
  display_on_website?: boolean
  is_batch?: boolean
  auto_fill_on_demand_sheet?: boolean
  non_inventory_item?: boolean
  is_deal?: boolean
  is_featured?: boolean
  is_finished_good?: boolean
  is_loose_item?: boolean
  pct_or_hs_code?: string
  description?: string
  created_at?: string
  updated_at?: string
  images?: any[]
}

interface Branch {
  id: string
  name: string
  location?: string
  is_active?: boolean
  branch_type?: string | null
}

interface Category {
  id: string
  name: string
  is_active?: boolean
}

interface Customer {
  id: string
  name: string
  phone?: string
  email?: string
  is_active?: boolean
}

export type ListMeta = {
  total: number
  page: number
  limit: number
  totalPages: number
}

interface StoreState {
  // Data
  products: Product[]
  categories: Category[]
  customers: Customer[]
  branches: Branch[]
  suppliers: any[]
  productsMeta: ListMeta | null
  customersMeta: ListMeta | null
  
  // Loading states
  productsLoading: boolean
  categoriesLoading: boolean
  customersLoading: boolean
  branchesLoading: boolean
  suppliersLoading: boolean
  
  // Last fetch timestamps
  lastProductsFetch: number | null
  lastCategoriesFetch: number | null
  lastCustomersFetch: number | null
  lastBranchesFetch: number | null
  lastSuppliersFetch: number | null
  
  // Actions
  fetchProducts: (options?: {
    force?: boolean
    search?: string
    categoryId?: string
    subcategoryId?: string
    page?: number
    limit?: number
    isActive?: boolean
    displayOnPos?: boolean
    isFeatured?: boolean
    displayOnWebsite?: boolean
    stockStatus?: "out" | "low"
  }) => Promise<void>
  fetchCategories: (force?: boolean) => Promise<void>
  fetchCustomers: (options?: {
    force?: boolean
    search?: string
    page?: number
    limit?: number
    isActive?: boolean
    createdAfter?: string
  }) => Promise<void>
  fetchBranches: (force?: boolean) => Promise<void>
  fetchSuppliers: (options?: { force?: boolean; search?: string; page?: number; limit?: number }) => Promise<void>
  upsertProductFromApi: (rawProduct: any) => void
  removeProductFromStore: (productId: string) => void
  upsertCategoryInStore: (category: Category) => void
  removeCategoryFromStore: (categoryId: string) => void
  clearStore: () => void
}

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000

let categoriesFetchInFlight: Promise<void> | null = null

const aggregateStockFields = (item: any) => {
  if (item.available_stock != null || item.current_stock != null) {
    return {
      stock: item.available_stock ?? item.current_stock ?? 0,
      current_stock: item.current_stock ?? 0,
      available_stock: item.available_stock ?? 0,
      reserved_stock: item.reserved_stock ?? 0,
      minimum_stock: item.minimum_stock ?? 0,
      maximum_stock: item.maximum_stock ?? 0,
    }
  }

  const rows = Array.isArray(item.stock) ? item.stock : []
  let current = 0
  let reserved = 0
  let minimum = 0
  let maximum = 0

  for (const row of rows) {
    current += Number(row.current_quantity ?? 0)
    reserved += Number(row.reserved_quantity ?? 0)
    minimum += Number(row.minimum_quantity ?? 0)
    maximum += Number(row.maximum_quantity ?? 0)
  }

  const available = current - reserved
  return {
    stock: available,
    current_stock: current,
    available_stock: available,
    reserved_stock: reserved,
    minimum_stock: minimum,
    maximum_stock: maximum,
  }
}

export const mapApiProductToStoreProduct = (item: any): Product => {
  const stockFields = aggregateStockFields(item)

  return {
    id: item.id,
    name: item.name,
    price: Number(item.sales_rate_inc_dis_and_tax ?? item.sales_rate_exc_dis_and_tax ?? item.purchase_rate ?? 0),
    category: item.category?.name,
    categoryId: item.category?.id,
    label_barcode: item.label_barcode || undefined,
    barcode: item.label_barcode || item.barcode || item.sku || item.code,
    code: item.code,
    ...stockFields,
    sku: item.sku,
    subcategoryId: item.subcategory?.id,
    subcategory: item.subcategory?.name,
    unitId: item.unit?.id,
    unitName: item.unit?.name,
    taxId: item.tax?.id,
    taxName: item.tax?.name,
    supplierId: item.supplier?.id,
    supplierName: item.supplier?.name,
    brandId: item.brand?.id,
    brandName: item.brand?.name,
    colorId: item.color?.id,
    colorName: item.color?.name,
    sizeId: item.size?.id,
    sizeName: item.size?.name,
    purchase_rate: Number(item.purchase_rate) || 0,
    sales_rate_exc_dis_and_tax: Number(item.sales_rate_exc_dis_and_tax) || 0,
    sales_rate_inc_dis_and_tax: Number(item.sales_rate_inc_dis_and_tax) || 0,
    discount_amount: item.discount_amount ? Number(item.discount_amount) : undefined,
    min_qty: item.min_qty ? Number(item.min_qty) : undefined,
    max_qty: item.max_qty ? Number(item.max_qty) : undefined,
    is_active: item.is_active ?? true,
    display_on_pos: item.display_on_pos ?? true,
    display_on_website: item.display_on_website ?? true,
    is_batch: item.is_batch ?? false,
    auto_fill_on_demand_sheet: item.auto_fill_on_demand_sheet ?? false,
    non_inventory_item: item.non_inventory_item ?? false,
    is_deal: item.is_deal ?? false,
    is_featured: item.is_featured ?? false,
    pct_or_hs_code: item.pct_or_hs_code,
    description: item.description,
    created_at: item.created_at,
    updated_at: item.updated_at,
    images:
      item.ProductImage?.map((img: { image: string }) => ({ id: img.image, image: img.image })) ||
      item.images ||
      [],
  }
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      products: [],
      categories: [],
      customers: [],
      branches: [],
      suppliers: [],
      productsMeta: null,
      customersMeta: null,
      productsLoading: false,
      categoriesLoading: false,
      customersLoading: false,
      branchesLoading: false,
      suppliersLoading: false,
      lastProductsFetch: null,
      lastCategoriesFetch: null,
      lastCustomersFetch: null,
      lastBranchesFetch: null,
      lastSuppliersFetch: null,

      // Fetch products with caching and full-database search support
      fetchProducts: async (options?: {
        force?: boolean
        search?: string
        categoryId?: string
        subcategoryId?: string
        page?: number
        limit?: number
        isActive?: boolean
        displayOnPos?: boolean
        isFeatured?: boolean
        displayOnWebsite?: boolean
        stockStatus?: "out" | "low"
      }) => {
        const {
          force = false,
          search,
          categoryId,
          subcategoryId,
          page = 1,
          limit = 20,
          isActive,
          displayOnPos,
          isFeatured,
          displayOnWebsite,
          stockStatus,
        } = options ?? {}
        const state = get()
        const now = Date.now()
        const hasFilters =
          Boolean(search) ||
          Boolean(categoryId) ||
          Boolean(subcategoryId) ||
          page > 1 ||
          isActive !== undefined ||
          displayOnPos !== undefined ||
          isFeatured !== undefined ||
          displayOnWebsite !== undefined ||
          Boolean(stockStatus)

        if (!hasFilters && !force) {
          if (
            state.products.length > 0 &&
            state.lastProductsFetch &&
            now - state.lastProductsFetch < CACHE_DURATION
          ) {
            return
          }
        }

        set({ productsLoading: true })

        try {
          const isOnline = syncManager.canMakeRequest()
          
          if (!isOnline) {
            const offlineProducts = await offlineDB.getProducts()
            if (offlineProducts.length > 0) {
              const mappedProducts = offlineProducts.map(p => mapApiProductToStoreProduct(p.data || p))
              set({
                products: mappedProducts.slice(0, limit),
                productsLoading: false,
                lastProductsFetch: now,
                productsMeta: {
                  total: mappedProducts.length,
                  page: 1,
                  limit,
                  totalPages: Math.max(1, Math.ceil(mappedProducts.length / limit)),
                },
              })
              return
            }
          }
          
          const userRole = localStorage.getItem("role")
          const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN"
          
          let branchId = null
          if (!isAdmin) {
            try {
              const branchStr = localStorage.getItem("branch")
              if (branchStr && branchStr !== "Not Found") {
                const branchObj = JSON.parse(branchStr)
                branchId = branchObj.id || branchStr
              }
            } catch (e) {
              branchId = localStorage.getItem("branch")
              if (branchId === "Not Found") {
                branchId = null
              }
            }
          }

          const params: Record<string, any> = {
            page,
            limit,
            ...(branchId && !isAdmin ? { branch_id: branchId } : {}),
          }

          if (force) params._t = Date.now()
          if (search) params.search = search
          if (categoryId) params.category_id = categoryId
          if (subcategoryId) params.subcategory_id = subcategoryId
          if (isActive !== undefined) params.is_active = isActive
          if (displayOnPos !== undefined) params.display_on_pos = displayOnPos
          if (isFeatured !== undefined) params.is_featured = isFeatured
          if (displayOnWebsite !== undefined) params.display_on_website = displayOnWebsite
          if (stockStatus) params.stock_status = stockStatus

          const res = await apiClient.get("/products", { params })
          const rawProducts = Array.isArray(res.data?.data) ? res.data.data : []
          const apiProducts = rawProducts.map(mapApiProductToStoreProduct)
          const meta = res.data?.meta || {
            total: apiProducts.length,
            page,
            limit,
            totalPages: 1,
          }

          if (apiProducts.length > 0) {
            await offlineDB.saveProducts(rawProducts)
          }

          set({
            products: apiProducts,
            productsMeta: meta,
            productsLoading: false,
            lastProductsFetch: now,
          })
        } catch (error) {
          console.log('Failed to fetch products:', error)
          
          if (syncManager.canMakeRequest()) {
            try {
              const offlineProducts = await offlineDB.getProducts()
              if (offlineProducts.length > 0) {
                const mappedProducts = offlineProducts.map(p => mapApiProductToStoreProduct(p.data || p))
                set({
                  products: mappedProducts.slice(0, limit),
                  productsLoading: false,
                  lastProductsFetch: now,
                })
                return
              }
            } catch (offlineError) {
              console.error('Failed to load from offline cache:', offlineError)
            }
          }
          
          set({ productsLoading: false })
          throw error
        }
      },

      // Fetch categories with caching
      fetchCategories: async (force = false) => {
        const state = get()
        const now = Date.now()
        
        if (!force && 
            state.categories.length > 0 && 
            state.lastCategoriesFetch && 
            (now - state.lastCategoriesFetch) < CACHE_DURATION) {
          return
        }

        if (categoriesFetchInFlight) {
          return categoriesFetchInFlight
        }

        categoriesFetchInFlight = (async () => {
          set({ categoriesLoading: true })
          
          try {
            const res = await apiClient.get("/categories", { params: { page: 1, limit: 50 } })
            const categories = [{ id: "all", name: "All" }, ...res.data.data]
            
            set({ 
              categories, 
              categoriesLoading: false,
              lastCategoriesFetch: Date.now()
            })
            
            console.log(`Loaded ${categories.length} categories`)
          } catch (error) {
            console.log('Failed to fetch categories:', error)
            set({ categoriesLoading: false })
            throw error
          } finally {
            categoriesFetchInFlight = null
          }
        })()

        return categoriesFetchInFlight
      },

      // Fetch customers with caching
      fetchCustomers: async (options?: {
        force?: boolean
        search?: string
        page?: number
        limit?: number
        isActive?: boolean
        createdAfter?: string
      }) => {
        const force = typeof options === "boolean" ? options : Boolean(options?.force)
        const search = typeof options === "object" ? options?.search : undefined
        const page = typeof options === "object" ? options?.page ?? 1 : 1
        const limit = typeof options === "object" ? options?.limit ?? 20 : 20
        const isActive = typeof options === "object" ? options?.isActive : undefined
        const createdAfter = typeof options === "object" ? options?.createdAfter : undefined
        const state = get()
        const now = Date.now()
        
        if (!force && !search && page === 1 && isActive === undefined && !createdAfter &&
            state.customers.length > 0 && 
            state.lastCustomersFetch && 
            (now - state.lastCustomersFetch) < CACHE_DURATION) {
          return
        }

        set({ customersLoading: true })
        
        try {
          const res = await apiClient.get("/customer", {
            params: {
              page,
              limit,
              ...(search ? { search } : {}),
              ...(isActive !== undefined ? { is_active: isActive } : {}),
              ...(createdAfter ? { created_after: createdAfter } : {}),
            },
          })
          
          set({ 
            customers: res.data.data, 
            customersMeta: res.data.meta || null,
            customersLoading: false,
            lastCustomersFetch: now
          })
        } catch (error) {
          console.log('Failed to fetch customers:', error)
          set({ customersLoading: false })
          throw error
        }
      },

      // Fetch branches with caching
      fetchBranches: async (force = false) => {
        const state = get()
        const now = Date.now()
        
        if (!force && 
            state.branches.length > 0 && 
            state.lastBranchesFetch && 
            (now - state.lastBranchesFetch) < CACHE_DURATION) {
          // Audit: Cache hit within duration
          return
        }

        set({ branchesLoading: true })
        
        try {
          const res = await apiClient.get("/branches", { params: { page: 1, limit: 50 } })
          const branchesRaw = res.data?.data || res.data || []
          const branches = branchesRaw.map((b: any) => ({
             id: b.id,
             name: b.name,
             location: b.location,
             is_active: b.is_active ?? true,
             branch_type: b.branch_type ?? null,
          }))
          
          set({ 
            branches, 
            branchesLoading: false,
            lastBranchesFetch: now
          })
          
          console.log(`Loaded ${branches.length} branches`)
        } catch (error) {
          console.log('Failed to fetch branches:', error)
          set({ branchesLoading: false })
          throw error
        }
      },

      // Fetch suppliers with caching
      fetchSuppliers: async (options?: { force?: boolean; search?: string; page?: number; limit?: number }) => {
        const force = typeof options === "boolean" ? options : Boolean(options?.force)
        const search = typeof options === "object" ? options?.search : undefined
        const page = typeof options === "object" ? options?.page ?? 1 : 1
        const limit = typeof options === "object" ? options?.limit ?? 20 : 20
        const state = get()
        const now = Date.now()
        
        if (!force && !search && page === 1 &&
            state.suppliers.length > 0 && 
            state.lastSuppliersFetch && 
            (now - state.lastSuppliersFetch) < CACHE_DURATION) {
          return
        }

        set({ suppliersLoading: true })
        
        try {
          const res = await apiClient.get("/suppliers", {
            params: { page, limit, ...(search ? { search } : {}) },
          })
          const suppliers = res.data.data || []
          
          set({ 
            suppliers, 
            suppliersLoading: false,
            lastSuppliersFetch: now
          })
        } catch (error) {
          console.log('Failed to fetch suppliers:', error)
          set({ suppliersLoading: false })
          throw error
        }
      },

      upsertProductFromApi: (rawProduct: any) => {
        if (!rawProduct?.id) return

        const mapped = mapApiProductToStoreProduct(rawProduct)
        set((state) => {
          const index = state.products.findIndex((product) => product.id === mapped.id)
          if (index === -1) {
            return {
              products: [mapped, ...state.products],
              lastProductsFetch: Date.now(),
            }
          }

          const nextProducts = [...state.products]
          nextProducts[index] = mapped
          return {
            products: nextProducts,
            lastProductsFetch: Date.now(),
          }
        })
      },

      removeProductFromStore: (productId: string) => {
        set((state) => ({
          products: state.products.filter((product) => product.id !== productId),
          lastProductsFetch: Date.now(),
        }))
      },

      upsertCategoryInStore: (category: Category) => {
        if (!category?.id || category.id === "all") return

        set((state) => {
          const realCategories = state.categories.filter((c) => c.id !== "all")
          const index = realCategories.findIndex((c) => c.id === category.id)
          const nextCategory = {
            id: category.id,
            name: category.name,
            is_active: category.is_active,
          }

          const nextReal =
            index === -1
              ? [...realCategories, nextCategory]
              : realCategories.map((c, i) => (i === index ? { ...c, ...nextCategory } : c))

          return {
            categories: [{ id: "all", name: "All" }, ...nextReal],
            lastCategoriesFetch: Date.now(),
          }
        })
      },

      removeCategoryFromStore: (categoryId: string) => {
        if (!categoryId || categoryId === "all") return

        set((state) => ({
          categories: state.categories.filter((c) => c.id !== categoryId),
          lastCategoriesFetch: Date.now(),
        }))
      },

      // Clear all cached data
      clearStore: () => {
        set({
          products: [],
          categories: [],
          customers: [],
          branches: [],
          suppliers: [],
          lastProductsFetch: null,
          lastCategoriesFetch: null,
          lastCustomersFetch: null,
          lastBranchesFetch: null,
          lastSuppliersFetch: null,
        })
      },
    }),
    {
      name: 'pos-store',
      version: 4,
      migrate: (persistedState) => {
        const state = (persistedState || {}) as Partial<StoreState>
        return {
          ...state,
          products: [],
          categories: [],
          customers: [],
          suppliers: [],
          lastCategoriesFetch: null,
          lastProductsFetch: null,
          lastCustomersFetch: null,
          lastSuppliersFetch: null,
        } as StoreState
      },
      partialize: (state) => ({
        // List pages are fetched fresh so we never persist a stale full catalog.
        branches: state.branches,
        lastBranchesFetch: state.lastBranchesFetch,
      }),
    }
  )
)