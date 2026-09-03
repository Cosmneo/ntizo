import { useInfiniteQuery } from "@tanstack/react-query";
import { messagingQueries } from "@/features/messaging/data/messaging.repository";
import type { Thread } from "@/features/messaging/domain/types";
import { messagingErrorCode } from "@/features/messaging/viewmodel/messaging-error";
import type { HelpAudience } from "@/features/help-center/domain/help-audience";

/**
 * The requests this audience can see: the person's own, or the workspace's.
 *
 * Both are the inbox queries with `type: "support"` — plan A's
 * `listForCustomer` already keeps a provider request out of the opener's
 * personal inbox, so "mine" and "the provider's" are genuinely two lists,
 * not one filtered twice.
 *
 * A provider audience with no id yet (the workspace is still resolving)
 * asks for nothing: `enabled` is false on that query, and the panel shows
 * its loading state rather than a wrong empty list.
 */
export function useSupportRequests(audience: HelpAudience, providerId: string | null) {
  const asProvider = audience === "provider";
  // `forProvider` and `mine` each return an `infiniteQueryOptions` object
  // whose `queryKey` is a differently-shaped literal tuple (five elements
  // vs. four) — a real difference, not a cosmetic one, since `forProvider`
  // is keyed per-provider and `mine` is not. TypeScript refuses to unify
  // the two into one options type for a single `useInfiniteQuery` overload
  // (it sees the `enabled` selector's `Query<..., TQueryKey>` parameter as
  // two unrelated instantiations), even though every field this hook
  // actually reads back (`data`, `error`, `isPending`, `hasNextPage`,
  // `fetchNextPage`) is identical either way — both list the same
  // `ThreadPageDTO` page shape. The cast below only widens the *options*
  // argument's queryKey type to unblock that overload resolution; it
  // changes nothing about which query key is actually used at runtime.
  const query = useInfiniteQuery(
    (asProvider
      ? messagingQueries.forProvider(providerId ?? "", "support")
      : messagingQueries.mine("support")) as ReturnType<typeof messagingQueries.mine>,
  );

  const requests: Thread[] = query.data?.pages.flatMap((page) => page.items) ?? [];

  return {
    requests,
    loading: query.isPending,
    hasMore: query.hasNextPage,
    loadMore: () => void query.fetchNextPage(),
    errorCode: messagingErrorCode(query.error),
  };
}
