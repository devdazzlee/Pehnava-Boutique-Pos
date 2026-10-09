import { useState, useEffect, useCallback } from "react";
import apiClient from "@/lib/apiClient";
import { normalizeBranchId } from "@/lib/branch-utils";

interface CartItem {
  id: string;
  name: string;
  barcodeDisplay?: string;
  price: number;
  originalPrice: number;
  actualUnitPrice?: number;
  quantity: number;
  category: string;
  discount?: number;
  unitId?: string;
  unitName?: string;
  unit?: string;
  productId?: string;
}

interface HoldSaleCustomer {
  id: string;
  name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  phone?: string | null;
  is_active?: boolean;
}

interface HoldSaleRecord {
  id: string;
  items: CartItem[];
  subtotal: number;
  totalItems: number;
  branchId: string;
  branchName: string;
  createdAt: string;
  customerId: string | null;
  customer: HoldSaleCustomer | null;
}

export function useHoldSales(branchIdOverride?: string) {
  const [holdSales, setHoldSales] = useState<HoldSaleRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const getBranchId = useCallback(() => {
    if (branchIdOverride && branchIdOverride.trim()) {
      return branchIdOverride.trim();
    }

    if (typeof window === "undefined") return "";
    return normalizeBranchId(localStorage.getItem("branch"));
  }, [branchIdOverride]);

  const normalizeItem = (item: any): CartItem => ({
    id: item.id,
    productId: item.productId,
    name: item.name,
    barcodeDisplay: item.barcodeDisplay ? String(item.barcodeDisplay) : undefined,
    price: Number(item.price || 0),
    originalPrice: Number(item.originalPrice ?? item.price ?? 0),
    actualUnitPrice: Number(item.actualUnitPrice ?? item.price ?? 0),
    quantity: Number(item.quantity || 0),
    category: item.category || "",
    discount: Number(item.discount || 0),
    unitId: item.unitId,
    unitName: item.unitName,
    unit: item.unit,
  });

  const mapHoldSale = (holdSale: any): HoldSaleRecord => {
    const customer = holdSale.customer
      ? {
          id: String(holdSale.customer.id),
          name: holdSale.customer.name ?? null,
          email: holdSale.customer.email ?? null,
          phone_number: holdSale.customer.phone_number ?? holdSale.customer.phone ?? null,
          phone: holdSale.customer.phone ?? holdSale.customer.phone_number ?? null,
          is_active: holdSale.customer.is_active,
        }
      : null;
    const customerId =
      holdSale.customer_id ||
      holdSale.customerId ||
      customer?.id ||
      null;

    return {
      id: holdSale.id,
      items: Array.isArray(holdSale.items) ? holdSale.items.map(normalizeItem) : [],
      subtotal: Number(holdSale.subtotal || 0),
      totalItems: Number(holdSale.total_items || 0),
      branchId: holdSale.branch_id || "",
      branchName: holdSale.branch?.name || "Unknown Branch",
      createdAt: holdSale.created_at || new Date().toISOString(),
      customerId: customerId ? String(customerId) : null,
      customer,
    };
  };

  const refreshHoldSales = useCallback(async () => {
    const branchId = getBranchId();
    if (!branchId || branchId === "Not Found") {
      setHoldSales([]);
      return;
    }

    try {
      setLoading(true);
      const response = await apiClient.get("/sale/hold", { params: { branchId } });
      const holds = Array.isArray(response?.data?.data)
        ? response.data.data.map(mapHoldSale)
        : [];
      setHoldSales(holds);
    } catch (error) {
      console.error("Failed to load hold sales from API:", error);
      setHoldSales([]);
    } finally {
      setLoading(false);
    }
  }, [getBranchId]);

  useEffect(() => {
    refreshHoldSales();
  }, [refreshHoldSales]);

  const holdSale = useCallback(async (cart: CartItem[], customerId?: string) => {
    if (!cart.length) return false;

    const branchId = getBranchId();
    if (!branchId || branchId === "Not Found") return false;

    try {
      const response = await apiClient.post("/sale/hold", {
        branchId,
        customerId: customerId || null,
        items: cart,
      });
      const created = response?.data?.data ? mapHoldSale(response.data.data) : null;
      if (created) {
        setHoldSales((prev) => [created, ...prev]);
        return true;
      }
      await refreshHoldSales();
      return true;
    } catch (error) {
      console.error("Failed to hold sale in DB:", error);
      return false;
    }
  }, [getBranchId, refreshHoldSales]);

  const retrieveHoldSale = useCallback(async (index: number): Promise<HoldSaleRecord | null> => {
    if (index < 0 || index >= holdSales.length) return null;
    const holdSaleRecord = holdSales[index];
    const branchId = getBranchId();

    try {
      const response = await apiClient.post(`/sale/hold/${holdSaleRecord.id}/retrieve`, {
        branchId,
      });
      const retrieved = response?.data?.data ? mapHoldSale(response.data.data) : holdSaleRecord;
      setHoldSales((prev) => prev.filter((item) => item.id !== holdSaleRecord.id));
      return retrieved;
    } catch (error) {
      console.error("Failed to retrieve hold sale from DB:", error);
      return null;
    }
  }, [getBranchId, holdSales]);

  const deleteHoldSale = useCallback(async (index: number) => {
    if (index < 0 || index >= holdSales.length) return;
    const holdSaleRecord = holdSales[index];
    const branchId = getBranchId();

    try {
      await apiClient.delete(`/sale/hold/${holdSaleRecord.id}`, {
        data: { branchId },
      });
      setHoldSales((prev) => prev.filter((item) => item.id !== holdSaleRecord.id));
    } catch (error) {
      console.error("Failed to delete hold sale from DB:", error);
    }
  }, [getBranchId, holdSales]);

  const clearAllHoldSales = useCallback(async () => {
    const holdIds = holdSales.map((sale) => sale.id);
    const branchId = getBranchId();
    for (const holdId of holdIds) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await apiClient.delete(`/sale/hold/${holdId}`, {
          data: { branchId },
        });
      } catch (error) {
        console.error("Failed to delete hold sale from DB:", error);
      }
    }
    setHoldSales([]);
  }, [getBranchId, holdSales]);

  return {
    holdSales,
    holdSale,
    retrieveHoldSale,
    deleteHoldSale,
    clearAllHoldSales,
    refreshHoldSales,
    holdSalesLoading: loading,
  };
}

