import { queryOptions } from "@tanstack/react-query";
import type { ProviderPageDTO } from "@ntizo/shared/read-models";
import { publicGraphql } from "@/shared/lib/graphql/public-graphql";

/**
 * Only what the landing's compact card draws.
 *
 * Deliberately narrower than the directory's `PROVIDER_FIELDS`: this card has
 * no description, no trade tags and no service count, and asking for them
 * would put a payload on the home page's first paint that nothing renders.
 */
const CARD_FIELDS = `
  id name slug city district logoUrl photoUrls
  verified ratingAverage reviewCount fromAmountMinor fromCurrency
  categories { code name }`;

const POPULAR = `
  query LandingPopularProviders($input: ProviderListInput!) {
    providerList(input: $input) {
      items { ${CARD_FIELDS} }
      total
    }
  }`;

export const landingProviderQueries = {
  /**
   * The handful the home page puts under "popular".
   *
   * Its own query rather than the directory's first page, for the reason
   * `categoryQueries.preview` gives: the two want different sizes, and sharing
   * a cache entry would make the landing render whatever the directory had
   * last scrolled to — or last filtered down to, which is worse.
   *
   * `sort: "rating"` and `verifiedOnly` together are the whole claim the
   * section makes. "Popular" on a home page is an endorsement, so the two
   * businesses it can honestly apply to are the ones customers scored highest
   * and whose documents an administrator actually checked. Neither is invented
   * here: both come off the row.
   *
   * The locale is in the key because the card prints the category name the
   * server resolved, so the same three providers in two languages are two
   * different payloads.
   */
  popular: (locale: string, limit: number) =>
    queryOptions({
      queryKey: ["public", "providers", "popular", locale, limit] as const,
      queryFn: async (): Promise<ProviderPageDTO> => {
        const d = await publicGraphql<{ providerList: ProviderPageDTO }>(POPULAR, {
          input: { limit, offset: 0, locale, sort: "rating", verifiedOnly: true },
        });
        return d.providerList;
      },
    }),
};
