import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminProviderQueries,
  decideProviderStatus,
  reviewDocument,
  setProviderCommission,
  type ReviewDocumentInput,
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

/**
 * Accepting or refusing one document.
 *
 * Invalidates the provider's file rather than patching the row in place: the
 * decision can also clear the whole account's re-verification flag, and a
 * local edit would show the document decided while the banner above it still
 * said the account needed looking at.
 */
export function useReviewDocument(providerId: string) {
  return useProviderAdminAction<ReviewDocumentInput>(providerId, (input) =>
    reviewDocument(input),
  );
}
