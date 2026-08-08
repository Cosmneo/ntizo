import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { userQueries } from "../data/user.repository";
import type { CurrentUserDTO } from "../domain/current-user";

/** React hook for components. Replaces the three duplicate REST `/me`-fetching hooks. */
export function useCurrentUser() {
  return useQuery(userQueries.me());
}

/**
 * Call on sign-out. The QueryClient is a module singleton and sign-in
 * navigates client-side, so without this a second user signing in in the
 * same tab within `gcTime` (5 min default) would mount hooks against the
 * first user's still-cached entries.
 *
 * This was originally scoped to just `["user", "me"]`, which fixed the
 * name/email leak but missed `["providers", "mine"]`
 * (`features/provider/data/provider.repository.ts`), which backs
 * `useMyProviders()`/`useActiveProvider()`: `zone-switcher.tsx` combines the
 * *new* user's `me` with the *previous* user's stale `providers.length` in
 * `accessibleZones()`, so a plain customer could transiently inherit a
 * Provider zone link (or a provider transiently lose one). Enumerating a
 * second key here would only fix the two currently-known offenders and
 * repeat the same mistake for the next feature that adds a session-scoped
 * query — every key in this app so far (`["user", ...]`,
 * `["providers", ...]`) is session-scoped, none of it is
 * public/anonymous data that should survive a sign-out, so this clears the
 * whole `QueryClient` instead of maintaining a key-prefix allowlist.
 *
 * Split into a plain function (`clearSessionQueryCache`, directly testable
 * against a real `QueryClient` with no React involved) and a thin hook
 * wrapper, matching the `useQueryClient()`-inside-a-viewmodel-hook
 * convention already used by `provider/viewmodel/use-provider-mutations.ts`
 * and `use-member-mutations.ts`. `ui/` call sites (both sidebar
 * `SidebarUserMenu`s) go through the hook — `clear()` needs no query key
 * from any feature's `data/`, but centralizing it here still keeps
 * sign-out cache handling in one place rather than duplicated per sidebar.
 */
export function clearSessionQueryCache(queryClient: QueryClient) {
  queryClient.clear();
}

export function useClearSessionQueryCache() {
  const queryClient = useQueryClient();
  return () => clearSessionQueryCache(queryClient);
}

/**
 * Imperative fetch for use outside React context (route `beforeLoad` guards,
 * post-login redirect resolution), which can't call hooks. queryOptions()
 * types queryFn against TanStack Query's QueryFunctionContext parameter,
 * which these call sites never supply — same cast
 * `provider/viewmodel/use-providers.ts`'s `countMyProviders()` uses.
 *
 * A failing lookup degrades to `null` (read downstream as "no session")
 * rather than throwing — the old REST fetcher returned `null` on a non-ok
 * response, and callers (post-login redirect resolution, the admin route
 * guard) are written to tolerate that, not to catch a rejected promise.
 * `userQueries.me()`'s queryFn already catches transport failures and
 * resolves `null` itself (see user.repository.ts), so this try/catch is a
 * belt-and-suspenders repeat of that — deliberately, not an oversight: it
 * also swallows errors the old REST code let throw (e.g. a network failure
 * mid-request), which is a semantics change from the pre-GraphQL version
 * but a defensible one, kept consistent with `countMyProviders()`.
 */
export async function fetchCurrentUser(): Promise<CurrentUserDTO | null> {
  try {
    const queryFn = userQueries.me().queryFn as () => Promise<CurrentUserDTO>;
    return await queryFn();
  } catch {
    return null;
  }
}
