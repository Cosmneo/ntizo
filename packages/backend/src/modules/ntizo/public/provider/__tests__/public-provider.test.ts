import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { providerPublicReadModel } from "@ntizo/shared/read-models";
import type { ProviderPublicDTO } from "@ntizo/shared";
import type {
  ListActiveFilters,
  ProviderPage,
  ProviderPublicRepositoryPort,
} from "../app/ports/outbound/provider-public.repository.port";
import {
  ListPublicProvidersProjection,
  MAX_PUBLIC_PAGE_SIZE,
} from "../app/use-cases/list-public-providers.projection";
import { GetPublicProviderProjection } from "../app/use-cases/get-public-provider.projection";
import {
  DrizzleProviderPublicRepository,
  likePattern,
} from "../infra/repositories/drizzle/provider-public.repository";
import {
  __resetMediaUrlBaseForTests,
  configureMediaUrlBase,
  mediaUrl,
} from "../../../shared/infrastructure/media/media-url";

const dto: ProviderPublicDTO = {
  id: "p1", name: "Org", slug: "org", type: "organization",
  description: null, city: null, district: null, country: null, logoUrl: null,
  verified: false, ratingAverage: null, reviewCount: 0,
  categories: [], serviceCount: 0, fromAmountMinor: null, fromCurrency: null,
};

class FakeRepo implements ProviderPublicRepositoryPort {
  public readonly calls: string[] = [];
  constructor(private readonly result: ProviderPublicDTO | null = dto) {}
  async listActive(filters: ListActiveFilters): Promise<ProviderPage> {
    this.calls.push(`listActive:${filters.limit}:${filters.offset}:${filters.search ?? "-"}`);
    const items = this.result ? [this.result] : [];
    return { items, total: items.length };
  }
  async findActiveBySlug(slug: string): Promise<ProviderPublicDTO | null> {
    this.calls.push(`findActiveBySlug:${slug}`);
    return this.result;
  }
  async listCityFacets(): Promise<{ city: string; count: number }[]> {
    this.calls.push("listCityFacets");
    return [];
  }
}

/**
 * These fields must never reach an anonymous caller. `ownerUserId` links a
 * business to a person; the street, postal code and coordinates are the precise
 * location of someone who may work from home.
 */
const FORBIDDEN_PUBLIC_FIELDS = [
  "ownerUserId", "owner_user_id",
  "addressStreet", "address_street",
  "addressPostalCode", "address_postal_code",
  "addressLat", "address_lat",
  "addressLng", "address_lng",
  "members", "invites",
];

describe("public provider read model", () => {
  it("declares none of the private fields", () => {
    const fields = Object.keys(providerPublicReadModel.shape);
    expect(fields.length).toBeGreaterThan(0);
    for (const forbidden of FORBIDDEN_PUBLIC_FIELDS) {
      expect(fields).not.toContain(forbidden);
    }
  });
});

/**
 * The DTO shape is a contract; the SELECT is the boundary. A repository that
 * read `*` and mapped down would satisfy the model above and leak the day
 * someone widened the mapper — so this asserts the private columns are never
 * read out of the database at all.
 */
describe("public provider repository source", () => {
  const source = readFileSync(
    join(import.meta.dir, "..", "infra", "repositories", "drizzle", "provider-public.repository.ts"),
    "utf8",
  );

  it("never selects a private column", () => {
    expect(source.length).toBeGreaterThan(0);
    for (const forbidden of ["ownerUserId", "addressStreet", "addressPostalCode", "addressLat", "addressLng"]) {
      expect(source).not.toContain(`provider.${forbidden}`);
    }
  });

  it("scopes every query to active providers", () => {
    // Every query that reaches the provider table checks it: the page, the
    // slug lookup and the city facets. A public endpoint that returns a
    // deactivated provider defeats what deactivating is for.
    const statusChecks = source.match(/eq\(provider\.status, "active"\)/g) ?? [];
    expect(statusChecks.length).toBe(3);
  });
});

/**
 * `toDTO` is the one line standing between `provider.logoKey` — a private
 * storage key on a row this repository deliberately selects, precisely so it
 * can be transformed — and an anonymous caller. Neither test above protects
 * it: the read-model test only sees a static `logoUrl: null` fixture, and the
 * "never selects a private column" test can't object to `logoKey`, since
 * selecting it is intentional here. So this calls the mapping itself, with a
 * real row, and pins the three things a future edit could silently break.
 *
 * `toDTO` is `private static`; TypeScript erases that at runtime, so it is
 * reached through a narrow type cast rather than by widening its visibility
 * for a test's convenience.
 */
describe("DrizzleProviderPublicRepository.toDTO", () => {
  type PublicProviderRow = {
    id: string;
    name: string;
    slug: string;
    type: string;
    description: string | null;
    city: string | null;
    district: string | null;
    country: string | null;
    logoKey: string | null;
    ratingAverage: string | null;
    reviewCount: number;
    serviceCount: number;
    fromAmountMinor: number | null;
    fromCurrency: string | null;
    verified: boolean;
  };

  const raw = (
    DrizzleProviderPublicRepository as unknown as {
      toDTO(row: PublicProviderRow, categories: { code: string; name: string }[]): ProviderPublicDTO;
    }
  ).toDTO;
  /** The categories argument is not what these tests are about — always empty. */
  const toDTO = (row: PublicProviderRow) => raw(row, []);

  const row: PublicProviderRow = {
    id: "p1",
    name: "Org",
    slug: "org",
    type: "organization",
    description: null,
    city: null,
    district: null,
    country: null,
    logoKey: null,
    ratingAverage: null,
    reviewCount: 0,
    serviceCount: 0,
    fromAmountMinor: null,
    fromCurrency: null,
    verified: false,
  };

  beforeEach(() => {
    // Module-level state (`configureMediaUrlBase` is "first call wins"), so
    // it must be cleared before every test rather than assumed absent.
    __resetMediaUrlBaseForTests();
    configureMediaUrlBase("https://media.example.test");
  });

  afterEach(() => {
    // Cleared again after, so a later test file sharing this module's
    // registry doesn't inherit a base this file configured.
    __resetMediaUrlBaseForTests();
  });

  it("resolves a present logoKey to the same URL mediaUrl() produces for it", () => {
    const key = "providers/p1/logo.jpg";
    const result = toDTO({ ...row, logoKey: key });
    // Equal to the resolved value itself, not merely non-null: a mapping
    // that returned the raw key unchanged would also be non-null.
    expect(result.logoUrl).toBe(mediaUrl(key));
    expect(result.logoUrl).toBe("https://media.example.test/providers/p1/logo.jpg");
  });

  it("never carries logoKey, in any form, once mapped", () => {
    const result = toDTO({ ...row, logoKey: "providers/p1/logo.jpg" }) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(result, "logoKey")).toBe(false);
    expect(Object.keys(result)).not.toContain("logoKey");
  });

  it("maps a null logoKey to a null logoUrl", () => {
    const result = toDTO({ ...row, logoKey: null });
    expect(result.logoUrl).toBeNull();
  });
});

describe("ListPublicProvidersProjection", () => {
  it("clamps the page size, whatever the caller asks for", async () => {
    const repo = new FakeRepo();
    await new ListPublicProvidersProjection(repo).execute({ limit: 10_000, offset: -5 });
    expect(repo.calls).toEqual([`listActive:${MAX_PUBLIC_PAGE_SIZE}:0:-`]);
  });

  it("refuses a page size below one rather than passing it through", async () => {
    const repo = new FakeRepo();
    await new ListPublicProvidersProjection(repo).execute({ limit: 0, offset: 0 });
    expect(repo.calls).toEqual(["listActive:1:0:-"]);
  });
});

describe("GetPublicProviderProjection", () => {
  it("returns null for a slug with no active provider, rather than throwing", async () => {
    // Missing and deactivated must be indistinguishable from outside: telling
    // them apart reveals which businesses exist but are hidden.
    const result = await new GetPublicProviderProjection(new FakeRepo(null)).execute({ slug: "gone" });
    expect(result).toBeNull();
  });
});

describe("ListPublicProvidersProjection — search", () => {
  it("passes a trimmed term down to the repository", async () => {
    const repo = new FakeRepo();
    await new ListPublicProvidersProjection(repo).execute({
      limit: 20,
      offset: 0,
      search: "  canaliza  ",
    });
    expect(repo.calls).toEqual(["listActive:20:0:canaliza"]);
  });

  it("treats a whitespace-only term as no filter, not as a search for spaces", async () => {
    // A stray space in the URL would otherwise empty the directory.
    const repo = new FakeRepo();
    await new ListPublicProvidersProjection(repo).execute({
      limit: 20,
      offset: 0,
      search: "   ",
    });
    expect(repo.calls).toEqual(["listActive:20:0:-"]);
  });

  it("treats an absent term as no filter", async () => {
    const repo = new FakeRepo();
    await new ListPublicProvidersProjection(repo).execute({ limit: 20, offset: 0 });
    expect(repo.calls).toEqual(["listActive:20:0:-"]);
  });

  it("still clamps the page size when searching", async () => {
    // The ceiling is not something a search term gets to bypass.
    const repo = new FakeRepo();
    await new ListPublicProvidersProjection(repo).execute({
      limit: 9999,
      offset: 0,
      search: "x",
    });
    expect(repo.calls).toEqual([`listActive:${MAX_PUBLIC_PAGE_SIZE}:0:x`]);
  });
});

describe("likePattern", () => {
  it("wraps a plain term in wildcards", () => {
    expect(likePattern("agua")).toBe("%agua%");
  });

  it("escapes the wildcards a user typed, so they match literally", () => {
    // Unescaped, "%" matches every row and "_" matches any single character —
    // a search for "100%" would return the whole directory.
    expect(likePattern("100%")).toBe("%100\\%%");
    expect(likePattern("a_b")).toBe("%a\\_b%");
  });

  it("escapes the escape character itself", () => {
    // Done first, or the backslashes added above would themselves be escaped.
    expect(likePattern("a\\b")).toBe("%a\\\\b%");
  });
});
