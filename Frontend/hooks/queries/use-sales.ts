"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { qk } from "@/lib/query/query-keys";
import { STALE_TIME } from "@/lib/query/query-client";
import {
  fetchSales,
  fetchSaleById,
  deleteSale,
  cancelSale,
  type SalesQuery,
  type SaleRecord,
  type SaleCashier,
} from "@/lib/api/sales";

const EMPTY_SALES: SaleRecord[] = [];
const EMPTY_CASHIERS: SaleCashier[] = [];

export function useSales(params: SalesQuery) {
  const query = useQuery({
    queryKey: qk.sales.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchSales(params, signal),
    staleTime: STALE_TIME.volatile,
    placeholderData: keepPreviousData,
  });

  return {
    ...query,
    sales: query.data?.data ?? EMPTY_SALES,
    meta: query.data?.meta ?? null,
    summary: query.data?.summary ?? null,
    cashiers: query.data?.cashiers ?? EMPTY_CASHIERS,
    isFirstLoad: query.isLoading,
    isRefreshing: query.isFetching && !query.isLoading,
  };
}

/** Sale detail — gate with `enabled` so it only loads while the sheet is open. */
export function useSale(id: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.sales.detail(id ?? ""),
    queryFn: ({ signal }) => fetchSaleById(id as string, signal),
    staleTime: STALE_TIME.volatile,
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}

export function useSalesMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.sales.all });

  return {
    remove: useMutation({ mutationFn: (id: string) => deleteSale(id), onSuccess: invalidate }),
    cancel: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelSale(id, reason),
      onSuccess: invalidate,
    }),
  };
}
