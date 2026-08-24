import { useQuery } from "@tanstack/react-query";
import { notificationQueries } from "@/features/notifications/data/notifications.repository";
import type { InboxScope } from "@/features/notifications/viewmodel/use-inbox";

/**
 * The badge's number.
 *
 * Returns 0 rather than undefined while loading: a bell that flashes a number
 * on every navigation is worse than one that is briefly, quietly wrong.
 *
 * Both counts are queried on every render, only one `enabled` — see the
 * matching comment on `useInbox` for why a straight ternary into one
 * `useQuery` call does not type-check here.
 */
export function useUnreadCount(scope: InboxScope): number {
  const providerId = scope.kind === "provider" ? scope.providerId : "";

  const mine = useQuery({
    ...notificationQueries.mineUnreadCount(),
    enabled: scope.kind === "mine",
  });
  const provider = useQuery({
    ...notificationQueries.providerUnreadCount(providerId),
    enabled: scope.kind === "provider" && providerId.length > 0,
  });

  const query = scope.kind === "mine" ? mine : provider;
  return query.data ?? 0;
}
