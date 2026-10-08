import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  registerApi,
  type BoardRow,
  type RegisterState,
  type SessionDetail,
} from "@/components/register-hub/register-api";
import { qk } from "@/lib/query/query-keys";

/** POS must never sell from a stale register snapshot — refetch after any register mutation. */
export function invalidateRegisterStatus(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: qk.register.status });
}

/** Immediately unblock New Sale while `/status` refetches in the background. */
export function applyRegisterOpenedToCache(
  queryClient: QueryClient,
  branchId: string,
  session: SessionDetail,
) {
  queryClient.setQueryData<{ branches: BoardRow[] }>(qk.register.status, (old) => {
    if (!old?.branches?.length) return old;
    return {
      branches: old.branches.map((b) =>
        b.branch.id !== branchId
          ? b
          : {
              ...b,
              state: "OPEN" as const,
              session: {
                id: session.id,
                openedAt: session.openedAt,
                closedAt: session.closedAt,
                stale: false,
                opening: session.opening,
                expectedCash: session.live?.expectedCash ?? session.expectedCash,
                closing: session.closing,
                variance: session.variance,
                reviewStatus: session.reviewStatus,
                lockedReason: session.lockedReason,
                onDuty: session.activeShift?.cashier ?? null,
                shiftStatus: session.activeShift?.status ?? null,
                handovers: b.session?.handovers ?? 0,
                bills: session.live?.bills ?? b.session?.bills ?? null,
              },
            },
      ),
    };
  });
}

export function registerSaleBlockMessage(state: RegisterState | undefined): string | null {
  switch (state) {
    case "OPEN":
      return null;
    case "LOCKED":
      return "Cash register is locked. Unlock it on Cash Register before selling.";
    case "CLOSED":
      return "Cash register is closed. Reopen it on Cash Register before selling.";
    case "NOT_OPENED":
    default:
      return "Cash register is not open. Open it on Cash Register before selling.";
  }
}

export function useBranchRegisterSaleGate(branchId: string | null | undefined) {
  const query = useQuery({
    queryKey: qk.register.status,
    queryFn: () => registerApi.status(),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    enabled: Boolean(branchId),
  });

  const row = query.data?.branches.find((b) => b.branch.id === branchId);
  const state = row?.state;
  const canSell = state === "OPEN";
  const statusSettled = query.isFetched && !query.isFetching;
  const blockMessage =
    !branchId
      ? null
      : query.isError
        ? "Could not verify cash register status. Check your connection."
        : !statusSettled
          ? null
          : registerSaleBlockMessage(state);

  return {
    canSell: Boolean(branchId) && canSell,
    blockMessage: canSell ? null : blockMessage,
    registerStatusLoading: Boolean(branchId) && !statusSettled,
    registerRow: row,
    ...query,
  };
}
