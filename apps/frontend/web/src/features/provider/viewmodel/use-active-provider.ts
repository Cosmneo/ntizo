import { useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { ACTIVE_PROVIDER_KEY, useMyProviders } from "./use-providers";
import type { ProviderSummary } from "../domain/types";

/**
 * Which workspace the provider zone is showing.
 *
 * The URL is canonical and storage is only a hint — the same order the
 * reference project settled on, and for a reason that shows up the first time
 * someone opens two workspaces in two tabs: a single storage key cannot
 * represent two answers, so the tabs overwrite each other and each silently
 * renders the other's data. A path segment can.
 *
 * Storage still earns its place: `/provider` and the account pages carry no
 * slug, and landing on the workspace you used last beats landing on whichever
 * one sorts first.
 */
export function useActiveProvider() {
  const query = useMyProviders();
  const navigate = useNavigate();
  // `strict: false` reads params from whichever route is matched, so this hook
  // works both under `/provider/$slug` and on pages that have no slug at all.
  const { slug } = useParams({ strict: false }) as { slug?: string };
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // `query.data ?? []` allocates a new array on every render while the query is
  // loading or errored, which would change the identity of every dep array
  // below on each render. Memoising keeps the effect from re-firing forever —
  // the same failure mode that made usePageHeader loop.
  const providers: ProviderSummary[] = useMemo(() => query.data ?? [], [query.data]);

  const activeProvider = useMemo(() => {
    const fromUrl = slug ? providers.find((p) => p.slug === slug) : undefined;
    if (fromUrl) return fromUrl;
    const stored =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(ACTIVE_PROVIDER_KEY);
    return providers.find((p) => p.id === stored) ?? providers[0] ?? null;
  }, [providers, slug]);

  // Mirror a slug that resolved into storage, so the pages without one
  // remember. An effect rather than render, because writing during render is a
  // side effect React is entitled to run twice.
  useEffect(() => {
    if (!slug) return;
    const matched = providers.find((p) => p.slug === slug);
    if (matched) window.localStorage.setItem(ACTIVE_PROVIDER_KEY, matched.id);
  }, [providers, slug]);

  const setActive = useCallback(
    (id: string) => {
      const target = providers.find((p) => p.id === id);
      if (!target) return;
      window.localStorage.setItem(ACTIVE_PROVIDER_KEY, target.id);

      // Stay on the same page, in the other workspace. Switching from Settings
      // used to land on Overview, which loses your place for no reason —
      // "show me the other one's settings" is almost always what the switch
      // means when it is made from a settings page.
      const page = pathname.match(/^\/provider\/[^/]+\/([^/?#]+)/)?.[1];
      const to =
        page === "members"
          ? "/provider/$slug/members"
          : page === "settings"
            ? "/provider/$slug/settings"
            : "/provider/$slug/overview";

      // The URL is the state. `replace` keeps a switcher click out of the back
      // button's history, where it reads as a page the user never visited.
      void navigate({ to, params: { slug: target.slug }, replace: true });
    },
    [navigate, providers, pathname],
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
