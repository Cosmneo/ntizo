import type { CityPublicDTO } from "@ntizo/shared";
import type { SearchCitiesInput, SearchCitiesPort } from "../ports/inbound";
import type { CityPublicRepositoryPort } from "../ports/outbound/city-public.repository.port";

/** Hard ceiling. An anonymous endpoint must not let a caller ask for a country's whole gazetteer. */
export const MAX_CITY_RESULTS = 20;

/** What a caller that says nothing gets. Enough to fill a dropdown without scrolling twice. */
export const DEFAULT_CITY_RESULTS = 10;

export class SearchCitiesProjection implements SearchCitiesPort {
  constructor(private readonly repo: CityPublicRepositoryPort) {}

  async execute(input: SearchCitiesInput): Promise<CityPublicDTO[]> {
    // Clamped here rather than trusted from the schema: the schema bound is a
    // contract, this is the enforcement.
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_CITY_RESULTS, 1), MAX_CITY_RESULTS);
    // Whitespace-only is no filter, not a search for spaces — a stray space
    // must not empty a list the user is halfway through reading.
    const query = input.query?.trim() || undefined;
    // Uppercased here so `mz` and `MZ` are one cache entry and one query plan,
    // rather than the caller's shift key deciding.
    return this.repo.search(input.country.trim().toUpperCase(), query, limit);
  }
}
