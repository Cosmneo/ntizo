import { useQuery, useQueryClient } from "@tanstack/react-query";
import { userQueries } from "../data/user.repository";
import type { CurrentUserDTO } from "../domain/current-user";

/** React hook for components. Replaces the three duplicate REST `/me`-fetching hooks. */
export function useCurrentUser() {
  return useQuery(userQueries.me());
}

/**
 * Call on sign-out. The QueryClient is a module singleton and sign-in
 * navigates client-side, so without this a second user signing in in the
 * same tab within `gcTime` (5 min default) would mount `useCurrentUser()`
 * against the first user's still-cached `["user", "me"]` entry — rendering
 * their name, email, and zone links until revalidation lands. Exposed as a
 * hook (not a bare function taking a QueryClient) to match the
 * `useQueryClient()`-inside-a-viewmodel-hook convention already used by
 * `provider/viewmodel/use-provider-mutations.ts` and
 * `use-member-mutations.ts`; `ui/` call sites (both sidebar
 * `SidebarUserMenu`s) can't reach `data/` to build the query key
 * themselves.
 */
export function useClearCurrentUserCache() {
  const queryClient = useQueryClient();
  return () => queryClient.removeQueries({ queryKey: userQueries.me().queryKey });
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
