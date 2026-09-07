import { describe, expect, it } from "bun:test";
import type { ProviderPageDTO, ProviderPublicDTO, ServiceDTO } from "@ntizo/shared/read-models";
import {
  MAX_SERVICE_PAGE,
  type ListServicesInput,
  type ListServicesOutput,
} from "../../../public/catalog/app/use-cases/list-services.projection";
import {
  MAX_PUBLIC_PAGE_SIZE,
  type ListPublicProvidersProjection,
} from "../../../public/provider/app/use-cases/list-public-providers.projection";
import type { ListPublicProvidersInput } from "../../../public/provider/app/ports/inbound";
import { DelegatedServiceCardReader } from "../infra/readers/service-card-reader.adapter";
import { DelegatedProviderCardReader } from "../infra/readers/provider-card-reader.adapter";
import { chunk } from "../infra/readers/chunk";

function serviceCard(id: string): ServiceDTO {
  return {
    id,
    providerId: "p",
    providerName: "n",
    providerSlug: "s",
    providerType: "individual",
    providerVerified: false,
    providerRatingAverage: null,
    providerReviewCount: 0,
    categoryCode: "c",
    categoryName: "C",
    name: id,
    description: null,
    locationType: "remote",
    bookingMode: "priced",
    imageUrls: [],
    defaultOption: null,
    fromAmountMinor: null,
    optionCount: 0,
    isFallback: false,
  };
}

function providerCard(id: string): ProviderPublicDTO {
  return {
    id,
    name: id,
    slug: id,
    type: "individual",
    description: null,
    city: null,
    district: null,
    country: null,
    logoUrl: null,
    photoUrls: [],
    verified: false,
    ratingAverage: null,
    reviewCount: 0,
    categories: [],
    // Empty because these readers never look at it: a cover mosaic needs a
    // picture, and the entries page renders whatever the directory hands it.
    // The field is required on the model, so it has to be stated.
    services: [],
    serviceCount: 0,
    fromAmountMinor: null,
    fromCurrency: null,
  };
}

/** Answers whatever it was asked for, and records every call it received. */
class FakeServicesProjection {
  public readonly calls: ListServicesInput[] = [];
  async execute(input: ListServicesInput): Promise<ListServicesOutput> {
    this.calls.push(input);
    // Exactly what `ListServicesProjection` would do with its own clamp: never
    // more rows than the limit it was given.
    const limit = Math.min(Math.max(input.limit, 1), MAX_SERVICE_PAGE);
    const items = (input.ids ?? []).slice(0, limit).map(serviceCard);
    return { items, nextOffset: null, total: items.length };
  }
}

class FakeProvidersProjection {
  public readonly calls: ListPublicProvidersInput[] = [];
  async execute(input: ListPublicProvidersInput): Promise<ProviderPageDTO> {
    this.calls.push(input);
    const limit = Math.min(Math.max(input.limit, 1), MAX_PUBLIC_PAGE_SIZE);
    const items = (input.ids ?? []).slice(0, limit).map(providerCard);
    return { items, total: items.length };
  }
}

const ids = (n: number, prefix = "x"): string[] => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe("chunk", () => {
  it("splits into runs of at most the size given", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("keeps a batch that fits as a single run", () => {
    // The property that keeps "one call per kind" true for every page the
    // product can actually produce.
    expect(chunk(ids(48), MAX_SERVICE_PAGE)).toHaveLength(1);
  });

  it("loses nothing and reorders nothing", () => {
    expect(chunk(ids(101), 7).flat()).toEqual(ids(101));
  });

  it("returns nothing for an empty batch", () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it("refuses a size that could never terminate", () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe("DelegatedServiceCardReader", () => {
  it("asks nothing at all for an empty batch", async () => {
    const projection = new FakeServicesProjection();
    expect(await new DelegatedServiceCardReader(projection).findByIds({ ids: [], locale: "pt-MZ" })).toEqual([]);
    expect(projection.calls).toEqual([]);
  });

  it("resolves a page of favourites in one call", async () => {
    const projection = new FakeServicesProjection();
    const out = await new DelegatedServiceCardReader(projection).findByIds({ ids: ids(24), locale: "pt-MZ" });
    expect(projection.calls).toHaveLength(1);
    expect(out.map((s) => s.id)).toEqual(ids(24));
  });

  it("states the limit rather than leaning on a page size", async () => {
    // A default page size here would resolve the first 24 of a 50-favourite
    // page and report the other 26 as deleted.
    const projection = new FakeServicesProjection();
    await new DelegatedServiceCardReader(projection).findByIds({ ids: ids(37), locale: "pt-MZ" });
    expect(projection.calls[0]).toMatchObject({ limit: 37, offset: 0, locale: "pt-MZ" });
  });

  /**
   * The clamp mismatch this adapter exists to survive: a list page may ask for
   * 50 entries, and `MAX_SERVICE_PAGE` is 48. Truncating would drop two saved
   * listings and they would read to the client as deleted — a listing
   * vanishing from a page with no error anywhere.
   */
  it("does not lose the rows past the delegated projection's own page ceiling", async () => {
    const projection = new FakeServicesProjection();
    const out = await new DelegatedServiceCardReader(projection).findByIds({
      ids: ids(MAX_SERVICE_PAGE + 2),
      locale: "pt-MZ",
    });
    expect(out).toHaveLength(MAX_SERVICE_PAGE + 2);
    expect(projection.calls).toHaveLength(2);
  });

  it("resolves an unbounded batch of cover targets without truncating it", async () => {
    // Nothing caps how many lists a person may have, so nothing caps how many
    // cover targets one `favouriteListMine` resolves.
    const projection = new FakeServicesProjection();
    const out = await new DelegatedServiceCardReader(projection).findByIds({ ids: ids(200), locale: "pt-MZ" });
    expect(out).toHaveLength(200);
  });
});

describe("DelegatedProviderCardReader", () => {
  it("asks nothing at all for an empty batch", async () => {
    const projection = new FakeProvidersProjection();
    const reader = new DelegatedProviderCardReader(projection as unknown as ListPublicProvidersProjection);
    expect(await reader.findByIds({ ids: [], locale: "pt-MZ" })).toEqual([]);
    expect(projection.calls).toEqual([]);
  });

  it("resolves a page of favourites in one call, in the reader's language", async () => {
    const projection = new FakeProvidersProjection();
    const reader = new DelegatedProviderCardReader(projection as unknown as ListPublicProvidersProjection);
    const out = await reader.findByIds({ ids: ids(24, "p"), locale: "pt-MZ" });
    expect(projection.calls).toHaveLength(1);
    expect(projection.calls[0]).toMatchObject({ limit: 24, offset: 0, locale: "pt-MZ" });
    expect(out.map((p) => p.id)).toEqual(ids(24, "p"));
  });

  it("does not lose the rows past the directory's own page ceiling", async () => {
    const projection = new FakeProvidersProjection();
    const reader = new DelegatedProviderCardReader(projection as unknown as ListPublicProvidersProjection);
    const out = await reader.findByIds({ ids: ids(MAX_PUBLIC_PAGE_SIZE + 3, "p"), locale: "pt-MZ" });
    expect(out).toHaveLength(MAX_PUBLIC_PAGE_SIZE + 3);
    expect(projection.calls).toHaveLength(2);
  });
});
