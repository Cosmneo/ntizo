import { describe, expect, it } from "bun:test";
import type { CityPublicDTO } from "@ntizo/shared";
import {
  foldForSearch,
  prefixPattern,
} from "../infra/repositories/drizzle/city-public.repository";
import {
  MAX_CITY_RESULTS,
  DEFAULT_CITY_RESULTS,
  SearchCitiesProjection,
} from "../app/use-cases/search-cities.projection";
import type { CityPublicRepositoryPort } from "../app/ports/outbound/city-public.repository.port";

describe("foldForSearch", () => {
  it("folds accents so a plain keyboard finds an accented city", () => {
    // The market this launches in types on phone keyboards. Requiring a
    // circumflex to find the city you live in is requiring most people to fail.
    expect(foldForSearch("São Luís")).toBe("sao luis");
    expect(foldForSearch("Évora")).toBe("evora");
    expect(foldForSearch("Chókwè")).toBe("chokwe");
    expect(foldForSearch("Angra do Heroísmo")).toBe("angra do heroismo");
  });

  it("matches the fold the seed applies to the stored column", () => {
    // The two folds have to agree or the search silently stops matching rows
    // it was written to reach. Same input, same output, both sides.
    for (const name of ["Gurúè", "Xai-Xai", "Tōkamachi", "Maputo"]) {
      expect(foldForSearch(name)).toBe(name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase());
    }
  });
});

describe("prefixPattern", () => {
  it("anchors to the start rather than matching anywhere", () => {
    // A substring match would surface every city on earth with "ma" buried in
    // it, and the index cannot answer it either.
    expect(prefixPattern("Ma")).toBe("ma%");
  });

  it("escapes the wildcards a user can type", () => {
    // "%" and "_" are LIKE metacharacters. Left raw, searching for "%" returns
    // every city — the wildcard is the user's typing, not their intent.
    expect(prefixPattern("%")).toBe("\\%%");
    expect(prefixPattern("_")).toBe("\\_%");
    // The backslash goes first, or it would escape the escapes.
    expect(prefixPattern("\\")).toBe("\\\\%");
  });
});

class FakeRepo implements CityPublicRepositoryPort {
  calls: Array<{ country: string; query: string | undefined; limit: number }> = [];
  async search(country: string, query: string | undefined, limit: number): Promise<CityPublicDTO[]> {
    this.calls.push({ country, query, limit });
    return [];
  }
}

describe("SearchCitiesProjection", () => {
  it("clamps a caller asking for the whole gazetteer", async () => {
    // An anonymous endpoint is the one place where "the client wouldn't do
    // that" is not an argument.
    const repo = new FakeRepo();
    await new SearchCitiesProjection(repo).execute({ country: "MZ", limit: 10_000 });
    expect(repo.calls[0]?.limit).toBe(MAX_CITY_RESULTS);
  });

  it("supplies the default when the caller sends no limit", async () => {
    // GraphQL exposes `limit` as optional because a zod `.default()` does not
    // survive the translation; this is where the default actually lives.
    const repo = new FakeRepo();
    await new SearchCitiesProjection(repo).execute({ country: "MZ" });
    expect(repo.calls[0]?.limit).toBe(DEFAULT_CITY_RESULTS);
  });

  it("treats a whitespace-only query as no filter", async () => {
    // A stray space must not empty a list somebody is halfway through reading.
    const repo = new FakeRepo();
    await new SearchCitiesProjection(repo).execute({ country: "MZ", query: "   " });
    expect(repo.calls[0]?.query).toBeUndefined();
  });

  it("normalises the country so the caller's shift key does not fork the cache", async () => {
    const repo = new FakeRepo();
    const projection = new SearchCitiesProjection(repo);
    await projection.execute({ country: "mz" });
    await projection.execute({ country: " MZ " });
    expect(repo.calls.map((c) => c.country)).toEqual(["MZ", "MZ"]);
  });
});
