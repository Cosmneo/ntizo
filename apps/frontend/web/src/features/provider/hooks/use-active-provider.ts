import { useEffect, useMemo, useState, useCallback } from "react";
import { useMyProviders } from "./use-providers";
import type { ProviderSummary } from "../types";

const STORAGE_KEY = "ntizo.activeProviderId";

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function useActiveProvider() {
  const query = useMyProviders();
  const providers: ProviderSummary[] = query.data ?? [];
  const [activeId, setActiveId] = useState<string | null>(() => readStored());

  useEffect(() => {
    if (providers.length === 0) return;
    setActiveId((prev) => {
      if (prev && providers.some((p) => p.id === prev)) return prev;
      const next = providers[0]?.id ?? null;
      if (next) window.localStorage.setItem(STORAGE_KEY, next);
      else window.localStorage.removeItem(STORAGE_KEY);
      return next;
    });
  }, [providers]);

  const setActive = useCallback((id: string) => {
    setActiveId(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const activeProvider = useMemo(
    () => providers.find((p) => p.id === activeId) ?? null,
    [providers, activeId],
  );

  return {
    providers,
    activeProvider,
    setActive,
    loading: query.isLoading,
    error: query.error ? String(query.error) : null,
    refresh: () => query.refetch(),
  };
}
