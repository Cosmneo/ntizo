import { createFileRoute } from "@tanstack/react-router";
import { ServicesBrowsePage } from "@/features/directory/services/ui/services-browse-page";
import { prefetchBrowseServices } from "@/features/directory/services/viewmodel/use-browse-services";
import { MAX_SEARCH_LENGTH } from "@/features/directory/services/domain/types";

/**
 * Every published service on the platform, at /services.
 *
 * Named `services.index.tsx` rather than `services.tsx` — the same trap
 * `providers.index.tsx` documents. Without the suffix this becomes a LAYOUT
 * for any future `/services/<something>`, and since it renders a listing
 * rather than an `<Outlet/>`, every such URL would silently render the browse
 * page instead.
 *
 * `ssr: true` and deliberately NOT prerendered: a catalogue frozen at build
 * time goes stale the moment a provider publishes, and nothing rebuilds the
 * site when they do.
 */
export const Route = createFileRoute("/services/")({
  ssr: true,
  /**
   * Both live in the URL rather than in component state: a results page you
   * cannot link to or reload is not a results page, and this is also what
   * carries them into the loader so page two is server-rendered like page one.
   */
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    category?: string;
    locationType?: string;
    q?: string;
    sort?: "newest";
    offset?: number;
  } => {
    const category =
      typeof search["category"] === "string" ? search["category"].trim() : "";
    // Trimmed and capped to the 100 the GraphQL schema accepts. A longer
    // string would fail validation at the server and blank the page, and the
    // person who pasted it has no way to see why — better to search the
    // first hundred characters of what they pasted.
    const q =
      typeof search["q"] === "string" ? search["q"].trim().slice(0, MAX_SEARCH_LENGTH) : "";
    // Validated against the closed set the database's CHECK enforces, not
    // passed through: an unknown value would reach the server as a filter
    // matching nothing, and the page would go blank with no way to tell why.
    const raw2 = search["locationType"];
    const locationType =
      raw2 === "remote" || raw2 === "at_provider" || raw2 === "at_customer" || raw2 === "flexible"
        ? raw2
        : undefined;
    const sort = search["sort"] === "newest" ? ("newest" as const) : undefined;
    const raw = Number(search["offset"]);
    // A negative or non-numeric offset is dropped rather than clamped to 0 and
    // written back — the URL a person typed is not this route's to rewrite.
    const offset = Number.isInteger(raw) && raw > 0 ? raw : 0;
    return {
      ...(category ? { category } : {}),
      ...(locationType ? { locationType } : {}),
      ...(q ? { q } : {}),
      ...(sort ? { sort } : {}),
      ...(offset ? { offset } : {}),
    };
  },
  loaderDeps: ({ search }) => ({
    category: search.category,
    locationType: search.locationType,
    q: search.q,
    sort: search.sort,
    offset: search.offset ?? 0,
  }),
  loader: ({ context, deps }) => prefetchBrowseServices(context.queryClient, deps),
  component: ServicesBrowsePage,
});
