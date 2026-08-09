import { createFileRoute } from "@tanstack/react-router";
import { DirectoryPage } from "@/features/directory/ui/directory-page";
import { prefetchDirectory } from "@/features/directory/viewmodel/use-directory";

/**
 * The public provider directory.
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
export const Route = createFileRoute("/providers")({
  ssr: true,
  loader: ({ context }) => prefetchDirectory(context.queryClient),
  component: DirectoryPage,
});
