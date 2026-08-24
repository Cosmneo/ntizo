import { DEFAULT_LOCALE } from "@ntizo/shared";
import type { ProviderPageDTO } from "@ntizo/shared/read-models";
import type {
  ListProviderCityFacetsPort,
  ListPublicProvidersInput,
  ListPublicProvidersPort,
} from "../ports/inbound";
import type { ProviderPublicRepositoryPort } from "../ports/outbound/provider-public.repository.port";

/** Hard ceiling on page size — an anonymous endpoint must not let a caller ask for everything. */
export const MAX_PUBLIC_PAGE_SIZE = 50;

export class ListPublicProvidersProjection implements ListPublicProvidersPort {
  constructor(private readonly repo: ProviderPublicRepositoryPort) {}

  async execute(input: ListPublicProvidersInput): Promise<ProviderPageDTO> {
    // Clamped here rather than trusted from the schema: the schema bound is a
    // contract, this is the enforcement. An unauthenticated endpoint is the one
    // place where "the client wouldn't do that" is not an argument.
    const limit = Math.min(Math.max(input.limit, 1), MAX_PUBLIC_PAGE_SIZE);
    const offset = Math.max(input.offset, 0);

    return this.repo.listActive({
      limit,
      offset,
      locale: input.locale ?? DEFAULT_LOCALE,
      // Whitespace-only is treated as no filter, not as a search for spaces —
      // otherwise a stray space in the URL empties the directory. The same
      // rule for every text filter that arrives from a URL.
      search: input.search?.trim() || undefined,
      city: input.city?.trim() || undefined,
      type: input.type,
      categoryCode: input.categoryCode?.trim() || undefined,
      minPriceMinor: input.minPriceMinor,
      maxPriceMinor: input.maxPriceMinor,
      minRating: input.minRating,
      verifiedOnly: input.verifiedOnly,
      sort: input.sort,
    });
  }
}

/**
 * The cities the filter may offer.
 *
 * Its own projection rather than a field on the page, because it does not
 * change when the filters do: a city list that shrank as you filtered would
 * strand somebody who picked Matola with no way back to Maputo.
 */
export class ListProviderCityFacetsProjection implements ListProviderCityFacetsPort {
  constructor(private readonly repo: ProviderPublicRepositoryPort) {}

  execute(): Promise<{ city: string; count: number }[]> {
    return this.repo.listCityFacets();
  }
}
