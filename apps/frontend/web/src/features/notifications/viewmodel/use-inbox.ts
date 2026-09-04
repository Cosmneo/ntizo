import { useCallback } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { InboxPageDTO } from "@ntizo/shared/read-models";
import { notificationQueries } from "@/features/notifications/data/notifications.repository";

/** Which inbox a component is looking at. The only thing that differs between them. */
export type InboxScope = { kind: "mine" } | { kind: "provider"; providerId: string };

/**
 * The only path from `ui/` to this feature's `data/` layer.
 *
 * `ui` importing `data` directly is what the boundaries lint forbids, and this
 * indirection is the one legal route rather than decoration.
 *
 * **Both queries are called on every render; only one is ever `enabled`.**
 * `notificationQueries.mine(...)` and `.forProvider(...)` carry differently
 * shaped query keys (two segments vs. three), and a plain
 * `scope.kind === "mine" ? optionsA : optionsB` fed straight into one
 * `useInfiniteQuery` call does not type-check — TanStack Query's `enabled` is
 * typed per query key, and the union of two incompatible `enabled` types has
 * no common supertype short of `any`. Calling both hooks unconditionally and
 * disabling the one the scope does not need sidesteps that without a cast,
 * and it is also what the rules of hooks require: which branch runs cannot
 * depend on a value that can change between renders.
 *
 * **`page.items` is every page fetched so far, flattened.** The inbox used to
 * take a fixed `offset` that no caller ever varied, so it showed the first
 * twenty rows and then a sentence admitting there were more — the reader had
 * no way to reach row twenty-one. `total` comes off the newest page rather
 * than the first: it is a live count, and the first page's copy of it goes
 * stale the moment anything arrives.
 *
 * `loadMore` is wrapped in `useCallback` because the page hands it to an
 * `IntersectionObserver` effect. `fetchNextPage` is itself stable, but a
 * fresh arrow on every render would tear that observer down and rebuild it on
 * every render too — the same trap `useCurrentSection` documents.
 */
export function useInbox(scope: InboxScope) {
  const providerId = scope.kind === "provider" ? scope.providerId : "";

  const mine = useInfiniteQuery({
    ...notificationQueries.mine(),
    enabled: scope.kind === "mine",
  });
  const provider = useInfiniteQuery({
    ...notificationQueries.forProvider(providerId),
    enabled: scope.kind === "provider" && providerId.length > 0,
  });

  const query = scope.kind === "mine" ? mine : provider;
  const { fetchNextPage } = query;
  const loadMore = useCallback(() => void fetchNextPage(), [fetchNextPage]);

  const pages = query.data?.pages ?? [];
  const page: InboxPageDTO = {
    items: pages.flatMap((fetched) => fetched.items),
    total: pages.at(-1)?.total ?? 0,
  };

  return {
    page,
    isPending: query.isPending,
    isError: query.isError,
    hasMore: query.hasNextPage,
    // The *next* page only. A fetch already on its way must not blank the
    // rows the reader is looking at, which is what `isPending` would do.
    isLoadingMore: query.isFetchingNextPage,
    loadMore,
  };
}
