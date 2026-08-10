import { createFileRoute } from "@tanstack/react-router";
import { DirectoryPage } from "@/features/directory/ui/directory-page";
import { prefetchDirectory } from "@/features/directory/viewmodel/use-directory";

/**
 * The public provider directory, at /providers.
 *
 * Named `providers.index.tsx`, not `providers.tsx`. With a sibling
 * `providers.$slug.tsx`, the un-suffixed name makes this a LAYOUT for the
 * detail route — and since it renders the listing rather than an <Outlet/>,
 * every /providers/<slug> URL silently rendered the directory instead of the
 * provider. Verified: a nonexistent slug returned the list, hydration payload
 * and all.
 *
 * `ssr: true` and deliberately NOT in vite.config's `pages` list. Prerendering
 * would freeze the listing at build time, and nothing rebuilds the site when a
 * provider registers — a directory that only updates on deploy is worse than
 * one that costs a query per request. `/` stays prerendered because it is a
 * static marketing shell; this is not.
 *
 * `loader` primes the query cache before render so `useSuspenseQuery` resolves
 * on the server and the listings land in the HTML a crawler receives.
 */
export const Route = createFileRoute("/providers/")({
  ssr: true,
  /**
   * `?q=` is the search term, and it lives in the URL rather than in component
   * state on purpose: a results page you cannot link to or reload is not a
   * results page. It is also what makes the term reach the loader, so the
   * filtered list is server-rendered like the unfiltered one.
   */
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const q = typeof search["q"] === "string" ? search["q"].trim() : "";
    return q ? { q } : {};
  },
  loaderDeps: ({ search }) => ({ q: search.q ?? "" }),
  loader: ({ context, deps }) => prefetchDirectory(context.queryClient, deps.q),
  component: DirectoryPage,
});
