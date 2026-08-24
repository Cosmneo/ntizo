import type { CityPublicDTO } from "@ntizo/shared";

/**
 * Reference-data reads. No requester, because there is nothing to scope by:
 * every caller sees the same cities, and a gazetteer has no owner.
 */
export interface CityPublicRepositoryPort {
  /**
   * Cities of one country, largest first.
   *
   * `query` matches the start of the name, accent- and case-blind. A prefix
   * rather than a substring on purpose: "ma" should surface Maputo and Matola,
   * not every city on earth with an "ma" buried in it, and the prefix is what
   * the index can actually answer.
   */
  search(country: string, query: string | undefined, limit: number): Promise<CityPublicDTO[]>;
}
