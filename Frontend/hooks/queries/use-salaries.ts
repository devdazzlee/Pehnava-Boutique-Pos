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
  fetchSalaries,
  createSalary,
  updateSalary,
  deleteSalary,
  markSalaryPaid,
  markSalaryUnpaid,
  type SalaryQuery,
  type SalaryPayload,
  type SalaryRecord,
} from "@/lib/api/salaries";

const EMPTY: SalaryRecord[] = [];

export function useSalaries(
  params: SalaryQuery = {},
  options?: { enabled?: boolean },
) {
  const query = useQuery({
    queryKey: qk.salaries.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchSalaries(params, signal),
    staleTime: STALE_TIME.volatile,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });

  return {
    ...query,
    salaries: query.data?.data ?? EMPTY,
    meta: query.data?.meta ?? null,
    summary: query.data?.summary ?? null,
    employeeTotals: query.data?.employeeTotals ?? null,
    isFirstLoad: query.isPending || query.isPlaceholderData,
    isRefreshing: query.isFetching && !query.isPending && !query.isPlaceholderData,
  };
}

export function useSalaryMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.salaries.all });

  return {
    create: useMutation({
      mutationFn: (body: SalaryPayload) => createSalary(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: SalaryPayload }) =>
        updateSalary(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteSalary(id),
      onSuccess: invalidate,
    }),
    markPaid: useMutation({
      mutationFn: ({ id, body }: { id: string; body?: SalaryPayload }) =>
        markSalaryPaid(id, body),
      onSuccess: invalidate,
    }),
    markUnpaid: useMutation({
      mutationFn: (id: string) => markSalaryUnpaid(id),
      onSuccess: invalidate,
    }),
  };
}
