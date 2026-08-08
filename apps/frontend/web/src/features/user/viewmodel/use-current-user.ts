import { useQuery } from "@tanstack/react-query";
import { userQueries } from "../data/user.repository";
import type { CurrentUserDTO } from "../domain/current-user";

/** React hook for components. Replaces the three duplicate REST `/me`-fetching hooks. */
export function useCurrentUser() {
  return useQuery(userQueries.me());
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
 */
export async function fetchCurrentUser(): Promise<CurrentUserDTO | null> {
  try {
    const queryFn = userQueries.me().queryFn as () => Promise<CurrentUserDTO>;
    return await queryFn();
  } catch {
    return null;
  }
}
