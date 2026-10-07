/**
 * Central query-key registry.
 *
 * Every hook derives its key from here so that:
 *  - identical requests anywhere in the tree share ONE cache entry / network call
 *  - invalidation after a mutation can target a whole resource with one call
 *    (`queryClient.invalidateQueries({ queryKey: qk.products.all })`)
 *
 * Filter objects are part of the key — `qk.products.list({ search: "a" })` and
 * `qk.products.list({ search: "ab" })` are different cache entries, which is
 * exactly what we want for search/pagination.
 */

export type ListParams = Record<string, unknown> & {
  page?: number;
  limit?: number;
  search?: string;
};

export const qk = {
  products: {
    all: ["products"] as const,
    list: (params: ListParams = {}) => ["products", "list", params] as const,
    detail: (id: string) => ["products", "detail", id] as const,
    bestSelling: ["products", "best-selling"] as const,
    posCatalog: ["products", "pos-catalog"] as const,
  },
  customers: {
    all: ["customers"] as const,
    list: (params: ListParams = {}) => ["customers", "list", params] as const,
    detail: (id: string) => ["customers", "detail", id] as const,
    purchases: (id: string) => ["customers", id, "purchases"] as const,
    ledger: (id: string) => ["customers", id, "ledger"] as const,
  },
  suppliers: {
    all: ["suppliers"] as const,
    list: (params: ListParams = {}) => ["suppliers", "list", params] as const,
    detail: (id: string) => ["suppliers", "detail", id] as const,
    purchases: (id: string) => ["suppliers", id, "purchases"] as const,
    ledger: (id: string) => ["suppliers", id, "ledger"] as const,
  },
  categories: {
    all: ["categories"] as const,
    list: (params: ListParams = {}) => ["categories", "list", params] as const,
  },
  branches: {
    all: ["branches"] as const,
    list: (params: ListParams = {}) => ["branches", "list", params] as const,
    detail: (id: string) => ["branches", "detail", id] as const,
  },
  register: {
    status: ["cash-register", "status"] as const,
  },
  orders: {
    all: ["orders"] as const,
    list: (params: ListParams = {}) => ["orders", "list", params] as const,
    detail: (id: string) => ["orders", "detail", id] as const,
  },
  sales: {
    all: ["sales"] as const,
    list: (params: ListParams = {}) => ["sales", "list", params] as const,
    detail: (id: string) => ["sales", "detail", id] as const,
  },
  websiteOrders: {
    all: ["websiteOrders"] as const,
    list: (params: ListParams = {}) => ["websiteOrders", "list", params] as const,
    detail: (id: string) => ["websiteOrders", "detail", id] as const,
  },
  expenses: {
    all: ["expenses"] as const,
    list: (params: ListParams = {}) => ["expenses", "list", params] as const,
    detail: (id: string) => ["expenses", "detail", id] as const,
    report: (params: ListParams = {}) => ["expenses", "report", params] as const,
    categories: ["expense-categories"] as const,
    recurring: ["recurring-expenses"] as const,
  },
  purchaseOrders: {
    all: ["purchase-orders"] as const,
    list: (params: ListParams = {}) => ["purchase-orders", "list", params] as const,
    detail: (id: string) => ["purchase-orders", "detail", id] as const,
  },
  purchaseReturns: {
    all: ["purchase-returns"] as const,
    list: (params: ListParams = {}) => ["purchase-returns", "list", params] as const,
    detail: (id: string) => ["purchase-returns", "detail", id] as const,
  },
  purchaseInvoices: {
    all: ["purchase-invoices"] as const,
    list: (params: ListParams = {}) => ["purchase-invoices", "list", params] as const,
    detail: (id: string) => ["purchase-invoices", "detail", id] as const,
    uninvoiced: (supplierId: string) => ["purchase-invoices", "uninvoiced", supplierId] as const,
  },
  dashboard: {
    stats: ["dashboard", "stats"] as const,
    recentSales: (params: ListParams = {}) => ["dashboard", "recent-sales", params] as const,
  },
  brands: {
    all: ["brands"] as const,
    list: (params: ListParams = {}) => ["brands", "list", params] as const,
  },
  colors: {
    all: ["colors"] as const,
    list: (params: ListParams = {}) => ["colors", "list", params] as const,
  },
  sizes: {
    all: ["sizes"] as const,
    list: (params: ListParams = {}) => ["sizes", "list", params] as const,
  },
  units: {
    all: ["units"] as const,
    list: (params: ListParams = {}) => ["units", "list", params] as const,
  },
  subcategories: {
    all: ["subcategories"] as const,
    list: (params: ListParams = {}) => ["subcategories", "list", params] as const,
  },
  employees: {
    all: ["employees"] as const,
    list: (params: ListParams = {}) => ["employees", "list", params] as const,
    detail: (id: string) => ["employees", "detail", id] as const,
    shiftHistory: (id: string) => ["employees", id, "shift-history"] as const,
  },
  employeeTypes: {
    all: ["employeeTypes"] as const,
    list: (params: ListParams = {}) => ["employeeTypes", "list", params] as const,
  },
  employeeDepartments: {
    all: ["employeeDepartments"] as const,
    list: (params: ListParams = {}) => ["employeeDepartments", "list", params] as const,
  },
  salaries: {
    all: ["salaries"] as const,
    list: (params: ListParams = {}) => ["salaries", "list", params] as const,
    detail: (id: string) => ["salaries", "detail", id] as const,
  },
  shiftAssignments: {
    all: ["shiftAssignments"] as const,
    list: (params: ListParams = {}) => ["shiftAssignments", "list", params] as const,
    detail: (id: string) => ["shiftAssignments", "detail", id] as const,
  },
} as const;

/**
 * Query-key prefixes whose data is small and worth persisting to localStorage
 * so a reload / offline start is instant. Big lists (products, customers, sales)
 * are deliberately excluded — they live in the Dexie offline layer instead.
 */
export const PERSISTED_KEY_PREFIXES = ["categories", "branches"] as const;
