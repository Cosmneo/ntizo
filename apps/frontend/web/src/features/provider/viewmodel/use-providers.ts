import { useQuery } from "@tanstack/react-query";
import { providerQueries } from "../data/provider.repository";

export function useMyProviders() {
  return useQuery(providerQueries.mine());
}

export function useProviderDetail(id: string | undefined) {
  return useQuery({
    ...providerQueries.byId(id ?? ""),
    enabled: !!id,
  });
}
