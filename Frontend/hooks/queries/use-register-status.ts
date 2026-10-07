import { useQuery } from "@tanstack/react-query";
import {
  registerApi,
  type RegisterState,
} from "@/components/register-hub/register-api";
import { qk } from "@/lib/query/query-keys";

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
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    enabled: Boolean(branchId),
  });

  const row = query.data?.branches.find((b) => b.branch.id === branchId);
  const state = row?.state;
  const canSell = state === "OPEN";
  const blockMessage =
    !branchId
      ? null
      : query.isError
        ? "Could not verify cash register status. Check your connection."
        : query.isLoading && !row
          ? null
          : registerSaleBlockMessage(state);

  return {
    canSell: Boolean(branchId) && canSell,
    blockMessage: canSell ? null : blockMessage,
    registerRow: row,
    ...query,
  };
}
