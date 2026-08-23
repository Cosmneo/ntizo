import { useQuery } from "@tanstack/react-query";
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
 * shaped query keys (three segments vs. four), and a plain
 * `scope.kind === "mine" ? optionsA : optionsB` fed straight into one
 * `useQuery` call does not type-check — TanStack Query's `enabled` is typed
 * per query key, and the union of two incompatible `enabled` types has no
 * common supertype short of `any`. Calling both hooks unconditionally and
 * disabling the one the scope does not need sidesteps that without a cast,
 * and it is also what the rules of hooks require: which branch runs cannot
 * depend on a value that can change between renders.
 */
export function useInbox(scope: InboxScope, offset = 0) {
  const providerId = scope.kind === "provider" ? scope.providerId : "";

  const mine = useQuery({ ...notificationQueries.mine(offset), enabled: scope.kind === "mine" });
  const provider = useQuery({
    ...notificationQueries.forProvider(providerId, offset),
    enabled: scope.kind === "provider" && providerId.length > 0,
  });

  const query = scope.kind === "mine" ? mine : provider;
  const page: InboxPageDTO = query.data ?? { items: [], total: 0 };
  return { page, isPending: query.isPending, isError: query.isError };
}
