import type { ServiceDTO } from "@ntizo/shared/read-models";
import { resolveTranslation } from "../../../../bounded-contexts/catalog/domain/translations";
import { mediaUrl } from "../../../../shared/infrastructure/media/media-url";
import type { ServiceReadRepositoryPort } from "../../../../bounded-contexts/catalog/app/ports/outbound/service-read.repository.port";

/** Hard ceiling. Nobody scrolls a hundred cards at once. */
export const MAX_SERVICE_PAGE = 48;

export interface ListServicesInput {
  locale: string;
  categoryCode?: string | undefined;
  /** Scopes the page to one business's own services — a provider's public page, not the platform-wide browse. */
  providerId?: string | undefined;
  /**
   * Where the service happens: `remote`, `at_provider`, `at_customer`,
   * `flexible`. The axis a category cannot answer — "someone who comes to my
   * house" and "somewhere I go" are different needs inside one trade.
   */
  locationType?: string | undefined;
  /**
   * How the customer pays: `fixed`, `hourly` or `quote`. The axis neither a
   * category nor a location can answer — "I want a price now" and "come and
   * tell me what it costs" are different errands inside one trade.
   */
  paymentMode?: string | undefined;
  /** `individual` or `organization`. Absent means both. */
  providerType?: string | undefined;
  /** The provider's city. A `remote` service matches every city — it has none. */
  city?: string | undefined;
  /** A locale the listing is written in — not a language anyone speaks. */
  language?: string | undefined;
  /** Inclusive bounds on the cheapest active option, in minor units. */
  minPriceMinor?: number | undefined;
  maxPriceMinor?: number | undefined;
  /**
   * Free text typed by the customer, matched against the service's name and
   * description in every language and against its provider's name. Trimmed
   * here; blank means no search.
   */
  q?: string | undefined;
  /**
   * `default` is the provider's own order; `newest` is most recently added
   * first; `price` is cheapest first, on the same `fromAmountMinor` the card
   * prints and the price filter matches — so a service can never sort into a
   * position its own visible price contradicts.
   */
  sort?: "default" | "newest" | "price" | undefined;
  limit: number;
  offset: number;
}

export interface ListServicesOutput {
  items: ServiceDTO[];
  /**
   * Where the next page starts, or null at the end.
   *
   * A cursor, the same shape `ListCategoriesOutput` uses: it lets a caller
   * page forward by handing this straight back as the next request's
   * `offset`, without recomputing one from `total`. See `total`'s own
   * comment for why this projection reports both now.
   */
  nextOffset: number | null;
  /**
   * Both a cursor and a total, which the doc comment here used to argue
   * against. The argument was sound while the browse only stepped forward —
   * "is there more and from where" is all a next link needs. It stopped being
   * sound when the page began stating how many results there are and
   * offering numbered pages: `items.length` reports the page size, not the
   * search, and told somebody with 40 matches that they had 24.
   *
   * `total` counts what the *filters* match. This projection then drops rows
   * it cannot render — a service whose translations resolve to nothing in any
   * locale — so across every page the rows shown can be very slightly fewer
   * than `total` claims. That is the honest trade: the alternative is
   * counting by fetching and mapping the whole result set on every request.
   */
  total: number;
}

/**
 * The services a customer browses, already in their language.
 *
 * Visible means published AND the provider is active — checked here rather
 * than trusted from the repository, because that is the rule this class
 * exists to enforce and a fake, a future repository, or a forgotten WHERE
 * clause must not be able to leak a row past it. Evaluated live off the
 * provider's own status rather than a flag copied onto the service: a copied
 * status is two statuses that will disagree.
 *
 * The name falls back to the service's own `sourceLocale`, not the platform
 * default — a photographer writing in English must not be shown in
 * Portuguese to an Italian reader just because Portuguese is what the
 * platform speaks by default. That is the entire reason `resolveTranslation`
 * takes a third argument here, and does not for a category.
 */
export class ListServicesProjection {
  constructor(private readonly repo: ServiceReadRepositoryPort) {}

  async execute(input: ListServicesInput): Promise<ListServicesOutput> {
    const limit = Math.min(Math.max(input.limit, 1), MAX_SERVICE_PAGE);
    const offset = Math.max(input.offset, 0);
    // Trimmed here rather than in the repository, and blank normalised to "no
    // search at all". A phone keyboard leaves a trailing space after an
    // autocompleted word, and `%  corte %` matches nothing; a string of
    // spaces is truthy, and would narrow the browse to names containing a
    // space.
    const q = input.q?.trim();
    // Trimmed and blank-normalised for the same reason `q` is: a picker leaves
    // a trailing space, and a string of spaces is truthy — it would narrow the
    // browse to a city nobody is in.
    const city = input.city?.trim() || undefined;

    // The same object both calls receive, so a filter added to one can never
    // be forgotten by the other.
    const filters = {
      categoryCode: input.categoryCode,
      providerId: input.providerId,
      locationType: input.locationType,
      paymentMode: input.paymentMode,
      providerType: input.providerType,
      city,
      language: input.language,
      minPriceMinor: input.minPriceMinor,
      maxPriceMinor: input.maxPriceMinor,
      q: q ? q : undefined,
    };

    // Concurrently: the count and the page are independent queries, and
    // awaiting them in sequence adds a round trip to every browse.
    //
    // One more than asked for: whether another page exists is then a length
    // check rather than a second round trip, and the extra row is discarded.
    const [rows, total] = await Promise.all([
      this.repo.listPublished({ ...filters, sort: input.sort, limit: limit + 1, offset }),
      this.repo.countPublished(filters),
    ]);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items: ServiceDTO[] = [];
    for (const r of page) {
      // The published-and-active rule, enforced here rather than assumed of
      // the rows handed in.
      if (r.status !== "published" || r.providerStatus !== "active") continue;

      const t = resolveTranslation(r.translations, input.locale, r.sourceLocale);
      if (!t) continue;

      // Two arguments, not three: a category is platform data with no author,
      // so it falls back to the platform's default language — where a service
      // falls back to whichever language its own provider wrote it in. The
      // code is the last resort rather than a reason to drop the service:
      // a card with a raw `plumbing` on it is worse than the alternative only
      // until you consider the alternative, which is the service vanishing
      // from the browse because somebody forgot to translate its category.
      const c = resolveTranslation(r.categoryTranslations, input.locale);

      items.push({
        id: r.id,
        providerId: r.providerId,
        providerName: r.providerName,
        providerSlug: r.providerSlug,
        // Constrained to the two values by the column's own CHECK; narrowed
        // the same way `DrizzleProviderPublicRepository` narrows it.
        providerType: r.providerType as ServiceDTO["providerType"],
        // Both of the next two are straight from the row: the repository's
        // own mapper has already done the real work — turning the nullable
        // join id into this boolean (`verifiedAggregate`, `service-read.
        // repository.ts`) and Postgres's `avg()` string into a number or
        // null (`coerceReviewAggregate`, same file).
        providerVerified: r.providerVerified,
        providerRatingAverage: r.providerRatingAverage,
        providerReviewCount: r.providerReviewCount,
        categoryCode: r.categoryCode,
        categoryName: c?.name ?? r.categoryCode,
        name: t.name,
        description: t.description,
        locationType: r.locationType,
        bookingMode: r.bookingMode,
        // Filtered after mapping, not before: `mediaUrl` returns null where
        // nothing serves the bucket, and a key with no URL is an image this
        // screen cannot show rather than an image that is not there.
        imageUrls: (r.imageKeys ?? [])
          .map((k) => mediaUrl(k))
          .filter((u): u is string => u !== null),
        defaultOption: r.defaultOption,
        fromAmountMinor: r.fromAmountMinor,
        optionCount: r.optionCount,
        isFallback: t.isFallback,
      });
    }

    // Advanced by the page size, not by `items.length`. A row dropped for
    // being unpublished, for its provider going inactive, or for having no
    // readable name still occupied a position in the underlying order, and
    // paging by the shorter number would fetch it again forever.
    return { items, nextOffset: hasMore ? offset + limit : null, total };
  }
}
