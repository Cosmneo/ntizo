import { describe, expect, it } from "bun:test";
import { ListServicesProjection } from "../app/use-cases/list-services.projection";
import { mapListServicesInput } from "../graphql/handlers/arg-mappers";

const row = (over = {}) => ({
  id: "svc-1",
  providerId: "prov-1",
  providerName: "Barbearia",
  providerSlug: "barbearia",
  providerStatus: "active",
  providerType: "individual",
  categoryCode: "hair",
  categoryTranslations: [{ locale: "pt-MZ", name: "Cabeleireiro", description: null }],
  status: "published",
  sourceLocale: "pt-MZ",
  locationType: "at_provider",
  bookingMode: "priced",
  imageKeys: [],
  defaultOption: { amountMinor: 30000, currency: "MZN", durationMinutes: 30, pricingMode: "fixed" },
  fromAmountMinor: 30000,
  optionCount: 1,
  translations: [{ locale: "pt-MZ", name: "Corte de cabelo", description: null }],
  ...over,
});

class FakeRepo {
  listedWith: unknown;
  countedWith: unknown;
  // `total` defaults to `rows.length` so every existing test — none of which
  // cares about the count — can go on constructing a `FakeRepo` with one
  // argument.
  constructor(
    private readonly rows: unknown[],
    private readonly total: number = rows.length,
  ) {}
  async listPublished(filter: unknown) {
    this.listedWith = filter;
    return this.rows;
  }
  async countPublished(filter: unknown) {
    this.countedWith = filter;
    return this.total;
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
    expect(repo.listedWith).toMatchObject({ providerId: "prov-42" });
  });

  it("leaves providerId undefined when no provider was asked for", async () => {
    const repo = new FakeRepo([row()]);
    await new ListServicesProjection(repo as never)
      .execute({ locale: "pt-MZ", limit: 10, offset: 0 });
    expect(repo.listedWith).toMatchObject({ providerId: undefined });
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
    expect((repo.listedWith as { locationType?: string }).locationType).toBe("remote");
  });

  it("passes the sort through to the repository", async () => {
    const repo = new FakeRepo([row()]);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      sort: "newest",
      limit: 10,
      offset: 0,
    });
    expect((repo.listedWith as { sort?: string }).sort).toBe("newest");
  });

  it("passes the search term through to the repository", async () => {
    const repo = new FakeRepo([row()]);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      q: "corte",
      limit: 10,
      offset: 0,
    });
    expect((repo.listedWith as { q?: string }).q).toBe("corte");
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
    expect((repo.listedWith as { q?: string }).q).toBe("corte");
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
    expect((repo.listedWith as { q?: string }).q).toBeUndefined();
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
    expect((repo.listedWith as { locationType?: string }).locationType).toBeUndefined();
  });

  it("hands the payment mode and the provider type to the repository", async () => {
    // The same trap `locationType` fell into: the projection carrying a filter
    // it was never given is indistinguishable from a filter that works.
    const repo = new FakeRepo([row()]);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      paymentMode: "hourly",
      providerType: "organization",
      limit: 10,
      offset: 0,
    });
    const filter = repo.listedWith as {
      paymentMode?: string;
      providerType?: string;
    };
    expect(filter.paymentMode).toBe("hourly");
    expect(filter.providerType).toBe("organization");
  });

  it("hands the language and the price bounds to the repository", async () => {
    const repo = new FakeRepo([row()]);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      language: "en-US",
      minPriceMinor: 10000,
      maxPriceMinor: 50000,
      limit: 10,
      offset: 0,
    });
    const filter = repo.listedWith as {
      language?: string;
      minPriceMinor?: number;
      maxPriceMinor?: number;
    };
    expect(filter.language).toBe("en-US");
    expect(filter.minPriceMinor).toBe(10000);
    expect(filter.maxPriceMinor).toBe(50000);
  });

  it("passes a zero lower bound through rather than dropping it", async () => {
    // `0` is falsy. A filter built with `if (min)` would silently discard
    // "from free", which is a bound somebody can legitimately set.
    const repo = new FakeRepo([row()]);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      minPriceMinor: 0,
      limit: 10,
      offset: 0,
    });
    expect((repo.listedWith as { minPriceMinor?: number }).minPriceMinor).toBe(0);
  });

  it("asks for neither when neither was given", async () => {
    const repo = new FakeRepo([row()]);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      limit: 10,
      offset: 0,
    });
    const filter = repo.listedWith as {
      paymentMode?: string;
      providerType?: string;
    };
    expect(filter.paymentMode).toBeUndefined();
    expect(filter.providerType).toBeUndefined();
  });
});

describe("ListServicesProjection — price order", () => {
  it("passes the price order through to the repository", async () => {
    const repo = new FakeRepo([row()], 1);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      sort: "price",
      limit: 24,
      offset: 0,
    });
    expect(repo.listedWith).toMatchObject({ sort: "price" });
  });

  it("puts a service with no price last rather than treating it as free", async () => {
    // A quote service has no price to compare. Sorted as zero it takes the
    // top of "cheapest first" — the one position it cannot honestly hold.
    const repo = new FakeRepo(
      [
        row({ id: "quote", bookingMode: "quote", fromAmountMinor: null, defaultOption: null }),
        row({ id: "cheap", fromAmountMinor: 20_000 }),
      ],
      2,
    );
    const out = await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      sort: "price",
      limit: 24,
      offset: 0,
    });
    // The projection preserves the repository's order — the assertion that
    // matters is the SQL one below; this one guards against the projection
    // quietly re-sorting what it was handed.
    expect(out.items.map((i) => i.id)).toEqual(["quote", "cheap"]);
  });
});

describe("ListServicesProjection category name", () => {
  it("resolves the category into the reader's locale", async () => {
    const rows = [row({ categoryTranslations: [
      { locale: "pt-MZ", name: "Cabeleireiro", description: null },
      { locale: "en-US", name: "Hairdressing", description: null },
    ] })];
    const out = await new ListServicesProjection(new FakeRepo(rows) as never)
      .execute({ locale: "en-US", limit: 10, offset: 0 });
    expect(out.items[0]!.categoryName).toBe("Hairdressing");
  });

  it("falls back to the platform default, not to the provider's language", async () => {
    // A category is platform data with no author, so `sourceLocale` — which is
    // the service's, not the category's — must not reach this resolution. A
    // service written in English does not make its category English.
    const rows = [row({
      sourceLocale: "en-US",
      translations: [{ locale: "en-US", name: "Haircut", description: null }],
      categoryTranslations: [
        { locale: "pt-MZ", name: "Cabeleireiro", description: null },
      ],
    })];
    const out = await new ListServicesProjection(new FakeRepo(rows) as never)
      .execute({ locale: "it-IT", limit: 10, offset: 0 });
    // Two fallback rules on one row, and they land in different languages:
    // the service follows its author to English, the category follows the
    // platform to Portuguese.
    expect(out.items[0]!.name).toBe("Haircut");
    expect(out.items[0]!.categoryName).toBe("Cabeleireiro");
  });

  it("shows the code rather than dropping a service with an untranslated category", async () => {
    // The service is still bookable. Losing it from the browse because an
    // administrator has not named its category yet would be a far worse
    // failure than a card reading "hair".
    const rows = [row({ categoryTranslations: [] })];
    const out = await new ListServicesProjection(new FakeRepo(rows) as never)
      .execute({ locale: "pt-MZ", limit: 10, offset: 0 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.categoryName).toBe("hair");
  });

  it("carries the cheapest price and the option count onto the card", async () => {
    // The card leads with the cheapest, not the default: a provider leading
    // with their 800 package must not make their 300 one invisible to somebody
    // who asked for something under 500.
    const rows = [row({
      defaultOption: { amountMinor: 80000, currency: "MZN", durationMinutes: 60, pricingMode: "fixed" },
      fromAmountMinor: 30000,
      optionCount: 3,
    })];
    const out = await new ListServicesProjection(new FakeRepo(rows) as never)
      .execute({ locale: "pt-MZ", limit: 10, offset: 0 });
    expect(out.items[0]!.fromAmountMinor).toBe(30000);
    expect(out.items[0]!.optionCount).toBe(3);
  });

  it("carries a quote service through with no price at all", async () => {
    const rows = [row({ bookingMode: "quote", defaultOption: null, fromAmountMinor: null, optionCount: 0 })];
    const out = await new ListServicesProjection(new FakeRepo(rows) as never)
      .execute({ locale: "pt-MZ", limit: 10, offset: 0 });
    expect(out.items[0]!.fromAmountMinor).toBeNull();
    expect(out.items[0]!.optionCount).toBe(0);
  });

  it("carries the provider type onto the card", async () => {
    const rows = [row({ providerType: "organization" })];
    const out = await new ListServicesProjection(new FakeRepo(rows) as never)
      .execute({ locale: "pt-MZ", limit: 10, offset: 0 });
    expect(out.items[0]!.providerType).toBe("organization");
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
        city: "Maputo",
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
      city: "Maputo",
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
      city: undefined,
      q: undefined,
      sort: undefined,
      limit: 24,
      offset: 0,
    });
  });
});

describe("ListServicesProjection — total", () => {
  it("reports how many matched, not how many fit on the page", async () => {
    // `items.length` told somebody with 40 matches that they had 24, which is
    // the page size talking rather than the search. It is also what made
    // numbered paging impossible.
    const repo = new FakeRepo([row(), row({ id: "svc-2" })], 40);
    const out = await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      limit: 24,
      offset: 0,
    });
    expect(out.total).toBe(40);
    expect(out.items).toHaveLength(2);
  });

  it("counts with the same filters it lists with", async () => {
    // A count that ignored the filters would say 400 above a page of three.
    const repo = new FakeRepo([row()], 1);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      categoryCode: "hair",
      locationType: "at_customer",
      minPriceMinor: 50_000,
      q: "corte",
      limit: 24,
      offset: 0,
    });
    expect(repo.countedWith).toMatchObject({
      categoryCode: "hair",
      locationType: "at_customer",
      minPriceMinor: 50_000,
      q: "corte",
    });
  });

  it("does not ask the count to page or sort", async () => {
    // `limit`, `offset` and `sort` cannot change how many rows match, and
    // passing them invites an implementation that applies them.
    const repo = new FakeRepo([row()], 1);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      sort: "newest",
      limit: 24,
      offset: 48,
    });
    expect(repo.countedWith).not.toHaveProperty("limit");
    expect(repo.countedWith).not.toHaveProperty("offset");
    expect(repo.countedWith).not.toHaveProperty("sort");
  });

  it("trims the search term for the count exactly as it does for the list", async () => {
    // A phone keyboard leaves a trailing space, and `%  corte %` matches
    // nothing — a count and a list that disagree about that show "0 services"
    // above a page of results.
    const repo = new FakeRepo([row()], 1);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      q: "  corte  ",
      limit: 24,
      offset: 0,
    });
    expect(repo.countedWith).toMatchObject({ q: "corte" });
  });

  it("reports zero rather than omitting the number when nothing matches", async () => {
    const repo = new FakeRepo([], 0);
    const out = await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      limit: 24,
      offset: 0,
    });
    expect(out.total).toBe(0);
    expect(out.nextOffset).toBeNull();
  });
});

describe("ListServicesProjection — city", () => {
  it("passes the city through to the repository", async () => {
    const repo = new FakeRepo([row()], 1);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      city: "Maputo",
      limit: 24,
      offset: 0,
    });
    expect(repo.listedWith).toMatchObject({ city: "Maputo" });
  });

  it("trims the city, so a trailing space from a picker is not a different place", async () => {
    const repo = new FakeRepo([row()], 1);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      city: "  Maputo  ",
      limit: 24,
      offset: 0,
    });
    expect(repo.listedWith).toMatchObject({ city: "Maputo" });
  });

  it("treats a blank city as no filter at all", async () => {
    // `?city=` is a URL somebody can produce by clearing the field.
    const repo = new FakeRepo([row()], 1);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      city: "   ",
      limit: 24,
      offset: 0,
    });
    expect((repo.listedWith as { city?: string }).city).toBeUndefined();
  });

  it("counts with the city too", async () => {
    const repo = new FakeRepo([row()], 1);
    await new ListServicesProjection(repo as never).execute({
      locale: "pt-MZ",
      city: "Maputo",
      limit: 24,
      offset: 0,
    });
    expect(repo.countedWith).toMatchObject({ city: "Maputo" });
  });
});

describe("ListServicesProjection — the provider's rating", () => {
  it("carries the business's score onto the card", async () => {
    const repo = new FakeRepo([row({ providerRatingAverage: 4.7, providerReviewCount: 6 })], 1);
    const out = await new ListServicesProjection(repo as never)
      .execute({ locale: "pt-MZ", limit: 24, offset: 0 });
    expect(out.items[0]).toMatchObject({ providerRatingAverage: 4.7, providerReviewCount: 6 });
  });

  it("gives null, never zero, for a business nobody has reviewed", async () => {
    // Zero is a score a person could have given. Printing it for an
    // unreviewed business tells every visitor it is the worst on the
    // platform — the same reason `providerPublicReadModel.ratingAverage` is
    // nullable, and this field must not undo that decision at the card.
    const repo = new FakeRepo([row({ providerRatingAverage: null, providerReviewCount: 0 })], 1);
    const out = await new ListServicesProjection(repo as never)
      .execute({ locale: "pt-MZ", limit: 24, offset: 0 });
    expect(out.items[0]!.providerRatingAverage).toBeNull();
    expect(out.items[0]!.providerReviewCount).toBe(0);
  });

  it("carries a number straight through, never Postgres's own string", async () => {
    // `avg()` comes back as a string on a numeric column, and a string
    // reaching `serviceReadModel` fails output validation for the WHOLE page,
    // not one row — so the coercion lives in the repository's row mapper
    // (`service-read.repository.ts`), the same place `fromAmountMinor`'s
    // `min()` is coerced. This fixture is already a number for the same
    // reason `fromAmountMinor: 30000` is above: `FakeRepo` stands in for the
    // repository's own contract, which promises a number, never a string —
    // the projection itself does no further coercion, exactly as it does
    // none for `fromAmountMinor`.
    const repo = new FakeRepo([row({ providerRatingAverage: 4.7, providerReviewCount: 6 })], 1);
    const out = await new ListServicesProjection(repo as never)
      .execute({ locale: "pt-MZ", limit: 24, offset: 0 });
    expect(typeof out.items[0]!.providerRatingAverage).toBe("number");
  });
});
