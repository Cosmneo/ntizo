import type { ProviderPublicDTO } from "@ntizo/shared";
import type { ProviderPublicDetailDTO } from "@ntizo/shared/read-models";

/** How the directory narrows and orders the list. Every field but the paging ones is optional. */
export interface ListActiveFilters {
  limit: number;
  offset: number;
  /** Which language the category names come back in. */
  locale: string;
  /** Free text over the fields the public DTO already exposes. Absent means no filter, never "match nothing". */
  search?: string | undefined;
  city?: string | undefined;
  type?: string | undefined;
  /** A `category.code`, matched against the businesses that publish a service in it. */
  categoryCode?: string | undefined;
  /** Inclusive bounds on the cheapest published option, in minor units. */
  minPriceMinor?: number | undefined;
  maxPriceMinor?: number | undefined;
  /** A business with no reviews has no average, so it fails this rather than scoring zero. */
  minRating?: number | undefined;
  verifiedOnly?: boolean | undefined;
  sort?: "relevance" | "rating" | "reviews" | "price" | "name" | undefined;
}

export interface ProviderPage {
  items: ProviderPublicDTO[];
  /** How many match the filters, not how many are on this page. */
  total: number;
}

/**
 * The public read port. Separate from `ProviderReadRepositoryPort` on purpose:
 * that one answers "what may THIS member see", and every method on it takes a
 * requester. This one answers "what may ANYONE see", and takes none — so there
 * is no requester parameter to forget to check.
 */
export interface ProviderPublicRepositoryPort {
  /**
   * Active providers only, filtered and ordered in the database.
   *
   * Every narrowing is pushed down rather than applied to the returned page:
   * a client-side filter over a server-side page hands back 3 of 20 rows and
   * calls it a full page, and prints a count that is about the page rather than
   * about the query.
   */
  listActive(filters: ListActiveFilters): Promise<ProviderPage>;
  /** Active provider by slug, or null. An inactive one is indistinguishable from a missing one. */
  findActiveBySlug(slug: string, locale: string): Promise<ProviderPublicDetailDTO | null>;
  /** The cities that currently have a listed business, with how many — the filter's own options. */
  listCityFacets(): Promise<{ city: string; count: number }[]>;
}
