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
  /** `default` is the provider's own order; `newest` is most recently added first. */
  sort?: "default" | "newest" | undefined;
  limit: number;
  offset: number;
}

export interface ListServicesOutput {
  items: ServiceDTO[];
  /**
   * Where the next page starts, or null at the end.
   *
   * A cursor rather than a total, matching `ListCategoriesOutput`: the page
   * loads as it is scrolled, and what it needs to know is "is there more and
   * from where", not how many there are altogether.
   */
  nextOffset: number | null;
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

    // One more than asked for: whether another page exists is then a length
    // check rather than a second round trip, and the extra row is discarded.
    const rows = await this.repo.listPublished({
      categoryCode: input.categoryCode,
      providerId: input.providerId,
      locationType: input.locationType,
      sort: input.sort,
      limit: limit + 1,
      offset,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items: ServiceDTO[] = [];
    for (const r of page) {
      // The published-and-active rule, enforced here rather than assumed of
      // the rows handed in.
      if (r.status !== "published" || r.providerStatus !== "active") continue;

      const t = resolveTranslation(r.translations, input.locale, r.sourceLocale);
      if (!t) continue;

      items.push({
        id: r.id,
        providerId: r.providerId,
        providerName: r.providerName,
        providerSlug: r.providerSlug,
        categoryCode: r.categoryCode,
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
        isFallback: t.isFallback,
      });
    }

    // Advanced by the page size, not by `items.length`. A row dropped for
    // being unpublished, for its provider going inactive, or for having no
    // readable name still occupied a position in the underlying order, and
    // paging by the shorter number would fetch it again forever.
    return { items, nextOffset: hasMore ? offset + limit : null };
  }
}
