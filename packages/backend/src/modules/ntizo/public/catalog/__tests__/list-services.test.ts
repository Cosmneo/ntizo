import { describe, expect, it } from "bun:test";
import { ListServicesProjection } from "../app/use-cases/list-services.projection";

const row = (over = {}) => ({
  id: "svc-1",
  providerId: "prov-1",
  providerName: "Barbearia",
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
