import { and, asc, desc, eq, like } from "drizzle-orm";
import type { CityPublicDTO } from "@ntizo/shared";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { city } from "../../../../../shared/infrastructure/database/reference/schemas";
import type { CityPublicRepositoryPort } from "../../../app/ports/outbound/city-public.repository.port";

/**
 * Folds a query to the form `city.search_name` is stored in.
 *
 * The same fold the seed applies, and it has to be: a fold applied to one side
 * only is worse than none, because it would silently stop matching the rows it
 * was meant to reach. NFD splits "ã" into "a" plus a combining tilde and the
 * property escape drops the mark.
 *
 * Exported for its own test — the behaviour is invisible until somebody types
 * an accent, which in this market is most people.
 */
export function foldForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Escapes LIKE's metacharacters before the prefix is appended.
 *
 * Without it, a search for "_" matches every city and "%" matches all of them
 * too — those wildcards are the user's typing, not their intent. Postgres
 * treats backslash as the escape by default, so it is escaped first or it
 * would escape the escapes.
 */
export function prefixPattern(term: string): string {
  return `${foldForSearch(term).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export class DrizzleCityPublicRepository implements CityPublicRepositoryPort {
  private static readonly COLUMNS = {
    id: city.geonameId,
    name: city.name,
    country: city.country,
    admin1: city.admin1,
  };

  async search(
    country: string,
    query: string | undefined,
    limit: number,
  ): Promise<CityPublicDTO[]> {
    const where = query
      ? and(eq(city.country, country), like(city.searchName, prefixPattern(query)))
      : eq(city.country, country);

    return getDb()
      .select(DrizzleCityPublicRepository.COLUMNS)
      .from(city)
      // Population first, so opening the field in Mozambique offers Maputo
      // rather than Angoche. Name breaks the tie because most of the gazetteer
      // has a population of zero, and without it those rows come back in
      // whatever order the heap happens to hold them — a list that reshuffles
      // between two identical requests.
      .orderBy(desc(city.population), asc(city.name))
      .where(where)
      .limit(limit);
  }
}
