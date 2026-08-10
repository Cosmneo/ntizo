import type { CityPublicDTO } from "@ntizo/shared";

export interface SearchCitiesInput {
  /** ISO 3166-1 alpha-2. Required: a city list with no country is 235 000 rows. */
  country: string;
  /** Prefix. Absent means "the country's largest", never "match nothing". */
  query?: string | undefined;
  /** Absent means the projection's default. */
  limit?: number | undefined;
}

export interface SearchCitiesPort {
  execute(input: SearchCitiesInput): Promise<CityPublicDTO[]>;
}
