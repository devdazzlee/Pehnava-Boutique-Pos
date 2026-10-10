"use client";

import { useMemo } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { qk } from "@/lib/query/query-keys";
import { STALE_TIME } from "@/lib/query/query-client";
import {
  fetchCategories,
  fetchAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleCategoryStatus,
  ALL_CATEGORY,
  type Category,
  type CategoryPayload,
} from "@/lib/api/categories";

interface Options {
  /** Prepend the "All" sentinel row (POS grid needs it, admin tables don't). */
  withAll?: boolean;
  limit?: number;
  search?: string;
  enabled?: boolean;
}

export function useCategories({
  withAll = false,
  limit,
  search,
  enabled = true,
}: Options = {}) {
  // No explicit limit → load every category (all pages), so new ones always appear.
  const query = useQuery({
    // limit 0 in the cache key = "all categories"
    queryKey: qk.categories.list({ limit: limit ?? 0, search }),
    queryFn: () => (limit ? fetchCategories({ limit, search }) : fetchAllCategories({ search })),
    staleTime: STALE_TIME.reference,
    enabled,
  });

  const categories = useMemo<Category[]>(() => {
    const rows = query.data ?? [];
    return withAll ? [ALL_CATEGORY, ...rows] : rows;
  }, [query.data, withAll]);

  return { ...query, categories };
}

export function useCategoryMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.categories.all });

  return {
    create: useMutation({
      mutationFn: (body: CategoryPayload) => createCategory(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: CategoryPayload }) =>
        updateCategory(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteCategory(id),
      onSuccess: invalidate,
    }),
    toggleStatus: useMutation({
      mutationFn: (id: string) => toggleCategoryStatus(id),
      onSuccess: invalidate,
    }),
  };
}
