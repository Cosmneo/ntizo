import { describe, expect, it } from "bun:test";
import { ListServicesProjection } from "../app/use-cases/list-services.projection";
import { mapListServicesInput } from "../graphql/handlers/arg-mappers";

const row = (over = {}) => ({
  id: "svc-1",
  providerId: "prov-1",
  providerName: "Barbearia",
  providerSlug: "barbearia",
  providerStatus: "active",
  categoryCode: "hair",
  status: "published",
  sourceLocale: "pt-MZ",
  locationType: "at_provider",
  bookingMode: "priced",
  imageKeys: [],
  defaultOption: { amountMinor: 30000, currency: "MZN", durationMinutes: 30, pricingMode: "fixed" },
  translations: [{ locale: "pt-MZ", name: "Corte de cabelo", description: null }],
  ...over,
});

class FakeRepo {
  lastFilter: unknown;
  constructor(private readonly rows: unknown[]) {}
  async listPublished(filter: unknown) {
    this.lastFilter = filter;
    return this.rows;
  }
}

describe("ListServicesProjection", () => {
  it("resolves the name into the reader's locale", async () => {
    const rows = [row({ translations: [
      { locale: "pt-MZ", name: "Corte de cabelo", description: null },
      { locale: "en-US", name: "Haircut", description: null },
    ] })];
    const out = await new ListServicesProjection(new FakeRepo(rows) as never)
      .execute({ locale: "en-US", limit: 10, offset: 0 });
    expect(out.items[0]!.name).toBe("Haircut");
    expect(out.items[0]!.isFallback).toBe(false);
  });

  it("falls back to the locale the provider wrote in, not the platform's", async () => {
    // The whole point of `sourceLocale`. A photographer writing in English must
    // not have their service shown in Portuguese to an Italian reader just
    // because Portuguese is the platform's default.
    const rows = [row({
      sourceLocale: "en-US",
      translations: [{ locale: "en-US", name: "Haircut", description: null }],
    })];
    const out = await new ListServicesProjection(new FakeRepo(rows) as never)
      .execute({ locale: "it-IT", limit: 10, offset: 0 });
    expect(out.items[0]!.name).toBe("Haircut");
    expect(out.items[0]!.isFallback).toBe(true);
  });

  it("drops a service whose provider is not active", async () => {
    const rows = [row({ providerStatus: "pending" })];
    const out = await new ListServicesProjection(new FakeRepo(rows) as never)
      .execute({ locale: "pt-MZ", limit: 10, offset: 0 });
    expect(out.items).toEqual([]);
  });

  it("reports the next offset only when there is another page", async () => {
    const many = Array.from({ length: 3 }, (_, i) => row({ id: `svc-${i}` }));
    const out = await new ListServicesProjection(new FakeRepo(many) as never)
      .execute({ locale: "pt-MZ", limit: 2, offset: 0 });
    expect(out.items).toHaveLength(2);
    expect(out.nextOffset).toBe(2);
  });

  it("forwards providerId to the repository — a provider's own public page filters to it, not the platform browse", async () => {
    const repo = new FakeRepo([row()]);
    await new ListServicesProjection(repo as never)
      .execute({ locale: "pt-MZ", providerId: "prov-42", limit: 10, offset: 0 });
    expect(repo.lastFilter).toMatchObject({ providerId: "prov-42" });
  });

  it("leaves providerId undefined when no provider was asked for", async () => {
    const repo = new FakeRepo([row()]);
    await new ListServicesProjection(repo as never)
      .execute({ locale: "pt-MZ", limit: 10, offset: 0 });
    expect(repo.lastFilter).toMatchObject({ providerId: undefined });
  });
});

/**
 * The slug, not only the id.
 *
 * A browse card has to link somewhere, and the provider page is addressed by
 * slug (`/providers/$slug`). With only `providerId` a card could name a
 * business it had no way to reach. Publishing the slug exposes nothing new —
 * it is already in that page's own URL.
 */
describe("provider slug", () => {
  it("reaches the DTO so a card can link to the provider", async () => {
    const out = await new ListServicesProjection(new FakeRepo([row()]) as never)
      .execute({ locale: "pt-MZ", limit: 10, offset: 0 });
    expect(out.items[0]!.providerSlug).toBe("barbearia");
  });
});

/**
 * The filters a services marketplace actually needs.
 *
 * Where a service happens is the question that separates "someone who comes to
 * my house" from "somewhere I go" from "over the internet" — the distinctive
 * axis of this business, and the one a category alone cannot answer.
 *
 * Asserted on the filter the projection hands the repository rather than on
 * the rows it gets back: a fake that ignored the filter and returned
 * everything would make a "filters correctly" test pass while the database
 * did nothing.
 */
describe("browse filters", () => {
  it("passes the location type through to the repository", async () => {
    const repo = new FakeRepo([row()]);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      locationType: "remote",
      limit: 10,
      offset: 0,
    });
    expect((repo.lastFilter as { locationType?: string }).locationType).toBe("remote");
  });

  it("passes the sort through to the repository", async () => {
    const repo = new FakeRepo([row()]);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      sort: "newest",
      limit: 10,
      offset: 0,
    });
    expect((repo.lastFilter as { sort?: string }).sort).toBe("newest");
  });

  it("passes the search term through to the repository", async () => {
    const repo = new FakeRepo([row()]);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      q: "corte",
      limit: 10,
      offset: 0,
    });
    expect((repo.lastFilter as { q?: string }).q).toBe("corte");
  });

  it("trims the search term before the repository sees it", async () => {
    // A phone keyboard adds a trailing space after an autocompleted word, and
    // `%  corte %` matches nothing at all.
    const repo = new FakeRepo([row()]);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      q: "  corte  ",
      limit: 10,
      offset: 0,
    });
    expect((repo.lastFilter as { q?: string }).q).toBe("corte");
  });

  it("treats a blank search as no search at all", async () => {
    // Not `""`: the repository builds its `where` from truthiness, so an
    // empty string is already harmless — but a string of spaces is truthy,
    // and would filter the browse down to services with a space in the name.
    const repo = new FakeRepo([row()]);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      q: "   ",
      limit: 10,
      offset: 0,
    });
    expect((repo.lastFilter as { q?: string }).q).toBeUndefined();
  });

  it("asks for no location type when none was given", async () => {
    // `undefined`, not an empty string: the repository builds a `where` from
    // truthiness, and `""` would filter for services whose location type is
    // the empty string — of which there are none, so the page would go blank.
    const repo = new FakeRepo([row()]);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      limit: 10,
      offset: 0,
    });
    expect((repo.lastFilter as { locationType?: string }).locationType).toBeUndefined();
  });
});

/**
 * Every argument the query accepts has to survive the hop into the use case.
 *
 * The mapper names its fields one by one, so a field added to the GraphQL
 * schema and not to the mapper is accepted by validation and then silently
 * dropped — the query succeeds, the filter does nothing, and the page looks
 * like it has no matching data rather than like it is broken. That is exactly
 * how `locationType` and `sort` shipped doing nothing: the projection passed
 * them on faithfully and was never handed them.
 *
 * Asserted as a whole object rather than field by field, so the next field
 * added to the schema and forgotten here fails this test rather than joining
 * them.
 */
describe("mapListServicesInput", () => {
  it("carries every argument through", () => {
    expect(
      mapListServicesInput({
        locale: "en-US",
        categoryCode: "hair",
        providerId: "prov-1",
        locationType: "remote",
        q: "corte",
        sort: "newest",
        limit: 12,
        offset: 24,
      }),
    ).toEqual({
      locale: "en-US",
      categoryCode: "hair",
      providerId: "prov-1",
      locationType: "remote",
      q: "corte",
      sort: "newest",
      limit: 12,
      offset: 24,
    });
  });

  it("fills in the defaults the schema deliberately leaves out", () => {
    // `.optional()` rather than `.default()` in the schema, because a zod
    // default does not survive into the GraphQL schema — so the fallback has
    // to run here, and this is what proves it does.
    expect(mapListServicesInput({})).toEqual({
      locale: "pt-MZ",
      categoryCode: undefined,
      providerId: undefined,
      locationType: undefined,
      q: undefined,
      sort: undefined,
      limit: 24,
      offset: 0,
    });
  });
});
