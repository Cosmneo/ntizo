import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminProviderQueries,
  decideProviderStatus,
  setProviderCommission,
} from "../data/admin-provider.repository";

export function useAdminProviders(input: {
  status?: string;
  search?: string;
}) {
  // Server-side, not filtered in the browser: this is the one list that grows
  // without bound, and deciding which fifty of ten thousand to draw is not a
  // decision the browser can make.
  return useQuery(adminProviderQueries.all(input));
}

export function useAdminProviderDetail(providerId: string) {
  return useQuery(adminProviderQueries.detail(providerId));
}

/**
 * Both admin decisions invalidate the same two things: this provider's file,
 * and the queue it appears in. Approving a business changes its row in the
 * list as much as it changes this page, and leaving the list stale would have
 * an admin approve something and then find it still pending.
 */
function useProviderAdminAction<T>(
  providerId: string,
  run: (value: T) => Promise<void>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "provider", providerId] }),
        qc.invalidateQueries({ queryKey: ["admin", "providers"] }),
      ]);
    },
  });
}

export function useDecideProviderStatus(providerId: string) {
  return useProviderAdminAction<string>(providerId, (status) =>
    decideProviderStatus(providerId, status),
  );
}

export function useSetProviderCommission(providerId: string) {
  return useProviderAdminAction<number>(providerId, (bps) =>
    setProviderCommission(providerId, bps),
  );
}
