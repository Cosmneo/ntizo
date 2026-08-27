import { createFileRoute } from "@tanstack/react-router";
import { ServicesBrowsePage } from "@/features/directory/services/ui/services-browse-page";
import { prefetchBrowseServices } from "@/features/directory/services/viewmodel/use-browse-services";
import { MAX_SEARCH_LENGTH } from "@/features/directory/services/domain/types";
import { LOCALES, PROVIDER_TYPES, SERVICE_PAYMENT_MODES } from "@ntizo/shared";

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
    paymentMode?: string;
    providerType?: string;
    language?: string;
    minPrice?: number;
    maxPrice?: number;
    q?: string;
    sort?: "newest" | "price";
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
    // Checked against the shared lists rather than against literals spelled
    // again here. The location types above predate them and are the reason:
    // a fifth type added to the enum would need finding in this file too, and
    // nothing would fail until somebody noticed the filter did nothing.
    const rawPayment = search["paymentMode"];
    const paymentMode =
      typeof rawPayment === "string" &&
      (SERVICE_PAYMENT_MODES as readonly string[]).includes(rawPayment)
        ? rawPayment
        : undefined;
    const rawProviderType = search["providerType"];
    const providerType =
      typeof rawProviderType === "string" &&
      (PROVIDER_TYPES as readonly string[]).includes(rawProviderType)
        ? rawProviderType
        : undefined;
    const rawLanguage = search["language"];
    const language =
      typeof rawLanguage === "string" && (LOCALES as readonly string[]).includes(rawLanguage)
        ? rawLanguage
        : undefined;
    // Whole units of currency, as a person would type them — the URL is a link
    // somebody reads and sends, and `minPrice=350` is that; `minPrice=35000`
    // is an implementation detail leaking into it. The conversion to minor
    // units happens once, at the query boundary.
    const price = (key: string): number | undefined => {
      const n = Number(search[key]);
      // `>= 0` rather than `> 0`: "free and up" is a bound somebody can set,
      // and it is not the same as having set none.
      return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? Math.floor(n) : undefined;
    };
    const minPrice = price("minPrice");
    const maxPrice = price("maxPrice");
    const rawSort = search["sort"];
    const sort = rawSort === "newest" || rawSort === "price" ? rawSort : undefined;
    const raw = Number(search["offset"]);
    // A negative or non-numeric offset is dropped rather than clamped to 0 and
    // written back — the URL a person typed is not this route's to rewrite.
    const offset = Number.isInteger(raw) && raw > 0 ? raw : 0;
    return {
      ...(category ? { category } : {}),
      ...(locationType ? { locationType } : {}),
      ...(paymentMode ? { paymentMode } : {}),
      ...(providerType ? { providerType } : {}),
      ...(language ? { language } : {}),
      ...(minPrice != null ? { minPrice } : {}),
      ...(maxPrice != null ? { maxPrice } : {}),
      ...(q ? { q } : {}),
      ...(sort ? { sort } : {}),
      ...(offset ? { offset } : {}),
    };
  },
  loaderDeps: ({ search }) => ({
    category: search.category,
    locationType: search.locationType,
    paymentMode: search.paymentMode,
    providerType: search.providerType,
    language: search.language,
    minPrice: search.minPrice,
    maxPrice: search.maxPrice,
    q: search.q,
    sort: search.sort,
    offset: search.offset ?? 0,
  }),
  loader: ({ context, deps }) => prefetchBrowseServices(context.queryClient, deps),
  component: ServicesBrowsePage,
});
