import { useQuery } from "@tanstack/react-query";
import { providerQueries } from "../data/provider.repository";
import type { ProviderSummary } from "../domain/types";

export function useMyProviders() {
  return useQuery(providerQueries.mine());
}

export function useProviderDetail(id: string | undefined) {
  return useQuery({
    ...providerQueries.byId(id ?? ""),
    enabled: !!id,
  });
}

/**
 * Imperative count for use outside React context (route `beforeLoad` guards,
 * post-login redirect resolution), which can't call hooks. queryOptions()
 * types queryFn against TanStack Query's QueryFunctionContext parameter,
 * which these call sites never supply — same cast the repository's own test
 * uses. A failing lookup degrades to zero rather than throwing.
 */
export async function countMyProviders(): Promise<number> {
  try {
    const queryFn = providerQueries.mine().queryFn as () => Promise<
      ProviderSummary[]
    >;
    return (await queryFn()).length;
  } catch {
    return 0;
  }
}

export async function hasAnyProvider(): Promise<boolean> {
  return (await countMyProviders()) > 0;
}

/** Where `localStorage` remembers the last workspace. Shared with the hook. */
export const ACTIVE_PROVIDER_KEY = "ntizo.activeProviderId";

/**
 * Which workspace `/provider` should land on.
 *
 * Storage is consulted, but only as a hint: it names an id, and a stored id
 * that no longer belongs to this account — a workspace left, a device shared —
 * falls back to the first rather than to a 404. The URL that results is
 * canonical from then on.
 */
export async function preferredProviderSlug(): Promise<string | null> {
  try {
    const queryFn = providerQueries.mine().queryFn as () => Promise<
      ProviderSummary[]
    >;
    const providers = await queryFn();
    if (providers.length === 0) return null;
    const stored =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(ACTIVE_PROVIDER_KEY);
    return (providers.find((p) => p.id === stored) ?? providers[0])!.slug;
  } catch {
    return null;
  }
}
