import { queryOptions } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import type { CurrentUserDTO } from "../domain/current-user";

// Verified against the live schema (packages/backend read/user/graphql):
// `user: { me: getCurrentUser }` compiles to field `userMe`, taking a
// required-but-empty `JSON!` input — same shape as `provider.mine`, so this
// mirrors provider.repository.ts's MINE document rather than inventing a
// second convention.
const ME = `
  query UserMe($input: JSON!) {
    userMe(input: $input) {
      id email role status createdAt name firstName lastName displayName avatarUrl phoneNumber bio language timezone
    }
  }`;

/** Query definitions. Components consume these via useQuery(userQueries.me()). */
export const userQueries = {
  me: () =>
    queryOptions({
      queryKey: ["user", "me"] as const,
      queryFn: async (): Promise<CurrentUserDTO | null> => {
        try {
          const d = await sessionGraphql<{ userMe: CurrentUserDTO }>(ME, {
            input: {},
          });
          return d.userMe;
        } catch {
          // Must resolve to `null`, not throw. TanStack Query v5 keeps
          // `data` at its last *successful* value when a refetch's queryFn
          // throws — status flips to "error" but the stale user stays put.
          // Concretely: session expires while the tab is open,
          // refetchOnWindowFocus fires on refocus, the request 401s, and
          // without this catch zone-switcher.tsx / both
          // sidebar-user-menu.tsx keep rendering the signed-out user's name
          // and zone links. Resolving `null` instead makes the refetch a
          // *successful* "no user" result, matching the REST fetcher this
          // replaced (which returned `null` on any non-ok response) and
          // what every consumer (`user?.`, `if (!user)`) already expects.
          return null;
        }
      },
    }),
};
