import type { ProviderPageDTO, ProviderPublicDetailDTO } from "@ntizo/shared/read-models";

export interface ListPublicProvidersInput {
  /**
   * Narrows to these specific businesses, passed straight to
   * `ListActiveFilters.ids`.
   *
   * Not reachable from the public GraphQL field — no schema declares it — and
   * deliberately so: it exists for the read side of `favourite`, which turns a
   * page of saved provider ids into cards through this projection rather than
   * around it, so "listed" keeps one definition. An empty array matches
   * nothing, never everything.
   */
  ids?: string[] | undefined;
  limit: number;
  offset: number;
  /** Which language category names come back in. Absent falls back to the platform default. */
  locale?: string | undefined;
  /** Free-text filter. Absent means "no filter", never "match nothing". */
  search?: string | undefined;
  city?: string | undefined;
  type?: string | undefined;
  categoryCode?: string | undefined;
  minPriceMinor?: number | undefined;
  maxPriceMinor?: number | undefined;
  minRating?: number | undefined;
  verifiedOnly?: boolean | undefined;
  sort?: "relevance" | "rating" | "reviews" | "price" | "name" | undefined;
}

export interface ListPublicProvidersPort {
  execute(input: ListPublicProvidersInput): Promise<ProviderPageDTO>;
}

export interface GetPublicProviderInput {
  slug: string;
  locale?: string | undefined;
}

export interface GetPublicProviderPort {
  execute(input: GetPublicProviderInput): Promise<ProviderPublicDetailDTO | null>;
}

export interface ListProviderCityFacetsPort {
  execute(): Promise<{ city: string; count: number }[]>;
}
