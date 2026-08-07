import { useQuery } from "@tanstack/react-query";
import { listMyProviders, getProvider } from "../lib/provider-api";

export const providerKeys = {
  all: ["providers"] as const,
  mine: ["providers", "mine"] as const,
  detail: (id: string) => ["providers", "detail", id] as const,
};

export function useMyProviders() {
  return useQuery({
    queryKey: providerKeys.mine,
    queryFn: listMyProviders,
  });
}

export function useProviderDetail(id: string | undefined) {
  return useQuery({
    queryKey: providerKeys.detail(id ?? ""),
    queryFn: () => getProvider(id!),
    enabled: !!id,
  });
}
