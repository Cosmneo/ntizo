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
    const queryFn = providerQueries.mine().queryFn as () => Promise<ProviderSummary[]>;
    return (await queryFn()).length;
  } catch {
    return 0;
  }
}

export async function hasAnyProvider(): Promise<boolean> {
  return (await countMyProviders()) > 0;
}
