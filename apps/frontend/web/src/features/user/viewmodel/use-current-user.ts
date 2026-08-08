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
 * Resolves to `null` for a genuine "not signed in" (`userQueries.me()`'s
 * queryFn already narrows that — see user.repository.ts) and REJECTS for
 * everything else (a database blip, a 500, a network failure), instead of
 * blanket-catching like the old REST-era version of this function did.
 *
 * That blanket catch used to be load-bearing for a real bug: a transient
 * backend error while an admin navigated to `/admin` was indistinguishable
 * from "signed out" (both resolved `null` here), so
 * `resolveAdminGuard`/`canAccessAdmin(null)` silently redirected the admin
 * to `/` with no error surfaced anywhere. Now that the backend and
 * `userQueries.me()` can tell the two apart, swallowing everything here
 * again would just reintroduce that bug one layer up — so this function
 * does not add its own catch. Each caller decides for itself whether a
 * thrown error should propagate (`routes/admin/route.tsx` — a broken guard
 * check should be visible, not silently misroute) or degrade to a safe
 * default (`resolveDestinationForSession` in
 * features/provider/viewmodel/post-login.ts — blocking a just-completed
 * sign-in on a transient read failure is worse than landing somewhere
 * slightly less specific).
 */
export async function fetchCurrentUser(): Promise<CurrentUserDTO | null> {
  const queryFn = userQueries.me().queryFn as () => Promise<CurrentUserDTO>;
  return queryFn();
}
