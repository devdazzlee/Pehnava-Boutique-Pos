// For Local 
// export const API_BASE = "http://localhost:5000/api/v1";

// For Production (VPS)
export const API_BASE = "https://pehnava.acestudiosus.com/api/v1";

// For Local / Development (Vercel API + Neon DB)
// export const API_BASE = "https://pehnava-boutique-pos-ba34.vercel.app/api/v1";

/** Ace Studios footer on thermal receipts (not the store WhatsApp line). */
export const ACE_STUDIOS_CONTACT = "+92 336 2500357";

export const PEHNAWA_DEFAULT_STORE_ADDRESS =
  "Shop No: 18C, Tariq Rd, opposite Tariq Center, P.E.C.H.S Block 2 Block 2 P.E.C.H.S., Karachi, 70400";

// Print API URL - Separate endpoint for printer operations
// Tries local print server first (localhost:3001), then falls back to backend
export const PRINT_API_BASE = "http://localhost:3001";

// Backend printer endpoint - uses API_BASE when local server is unavailable
// This should point to your backend API, NOT the local server
export const PRINT_API_FALLBACK = `${API_BASE}/barcode-generator`;

// API Endpoints
export const API_ENDPOINTS = {
  PRODUCTS: `${API_BASE}/products`, // GET - Paginated product list
  PRODUCT_EXPORT_EXCEL: `${API_BASE}/products/export/excel`, // GET - Export filtered products to Excel
  PRODUCTS_PUBLIC: `${API_BASE}/customer/app/products`, // GET - Search/get products (public/customer)
  PRODUCT_FEATURED: `${API_BASE}/products/featured`, // GET - Get featured products
  PRODUCT_BEST_SELLING: `${API_BASE}/products/best-selling`, // GET - Get best selling products
  PRODUCT_BY_ID: (id: string) => `${API_BASE}/products/${id}`, // GET - Get product by ID
};