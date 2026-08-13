import { describe, expect, it } from "bun:test";
import { GetServiceProjection } from "../app/use-cases/get-service.projection";
import { mapGetServiceInput } from "../graphql/handlers/arg-mappers";

const row = (over = {}) => ({
  id: "svc-1",
  providerId: "prov-1",
  providerName: "Barbearia",
  providerSlug: "barbearia",
  providerStatus: "active",
  providerType: "organization",
  providerLogoKey: null,
  providerCity: "Maputo",
  providerDistrict: "Malhazine",
  categoryCode: "hair",
  categoryTranslations: [{ locale: "pt-MZ", name: "Cabeleireiro", description: null }],
  status: "published",
  sourceLocale: "pt-MZ",
  locationType: "at_customer",
  bookingMode: "priced",
  imageKeys: [],
  defaultOption: null,
  fromAmountMinor: 35000,
  optionCount: 3,
  memberIds: ["m1", "m2"],
  options: [
    { id: "o1", amountMinor: 35000, currency: "MZN", durationMinutes: 60, minMinutes: null, stepMinutes: null, pricingMode: "fixed", isDefault: false, sortOrder: 0, translations: [{ locale: "pt-MZ", name: "Cerimónia" }] },
    { id: "o2", amountMinor: 50000, currency: "MZN", durationMinutes: 120, minMinutes: null, stepMinutes: null, pricingMode: "fixed", isDefault: true, sortOrder: 1, translations: [{ locale: "pt-MZ", name: "Cerimónia + Copo d'água" }] },
  ],
  translations: [{ locale: "pt-MZ", name: "Fotografia de casamentos", description: "Seis anos de experiência." }],
  ...over,
});

class FakeRepo {
  constructor(private readonly r: unknown) {}
  async getPublishedById() { return this.r; }
}
class FakePerformers {
  lastIds: string[] = [];
  constructor(private readonly rows: unknown[] = []) {}
  async byMemberIds(ids: string[]) { this.lastIds = ids; return this.rows; }
}

const make = (r: unknown, p = new FakePerformers()) =>
  new GetServiceProjection(new FakeRepo(r) as never, p as never);

describe("GetServiceProjection", () => {
  it("returns the service with its packages, cheapest first", async () => {
    const out = await make(row()).execute({ id: "svc-1", locale: "pt-MZ" });
    expect(out?.name).toBe("Fotografia de casamentos");
    expect(out?.options.map((o) => o.amountMinor)).toEqual([35000, 50000]);
    expect(out?.options[0]?.name).toBe("Cerimónia");
  });

  it("returns null when there is no such service", async () => {
    expect(await make(null).execute({ id: "nope", locale: "pt-MZ" })).toBeNull();
  });

  it("returns null for an unpublished service", async () => {
    // Not an error, and not a different null from "missing": telling them
    // apart lets anyone probe ids for services nobody published.
    expect(await make(row({ status: "draft" })).execute({ id: "svc-1", locale: "pt-MZ" })).toBeNull();
  });

  it("returns null when the provider is not active", async () => {
    expect(await make(row({ providerStatus: "suspended" })).execute({ id: "svc-1", locale: "pt-MZ" })).toBeNull();
  });

  it("resolves option names by the service's own source locale, not the platform's", async () => {
    // An option is the provider's writing, like the service's name. A reader
    // in Italian gets the provider's English, not the platform's Portuguese.
    const out = await make(row({
      sourceLocale: "en-US",
      translations: [{ locale: "en-US", name: "Wedding photography", description: null }],
      options: [{ id: "o1", amountMinor: 35000, currency: "MZN", durationMinutes: 60, minMinutes: null, stepMinutes: null, pricingMode: "fixed", isDefault: true, sortOrder: 0, translations: [{ locale: "en-US", name: "Ceremony" }] }],
    })).execute({ id: "svc-1", locale: "it-IT" });
    expect(out?.options[0]?.name).toBe("Ceremony");
  });

  it("asks the performer port for exactly this service's members", async () => {
    const performers = new FakePerformers([
      { id: "m1", firstName: "Ana", avatarUrl: null },
      { id: "m2", firstName: "Flávio", avatarUrl: "https://cdn/x.jpg" },
    ]);
    const out = await make(row(), performers).execute({ id: "svc-1", locale: "pt-MZ" });
    expect(performers.lastIds).toEqual(["m1", "m2"]);
    expect(out?.performers.map((p) => p.firstName)).toEqual(["Ana", "Flávio"]);
  });

  it("carries a quote service through with no packages", async () => {
    const out = await make(row({ bookingMode: "quote", options: [] }))
      .execute({ id: "svc-1", locale: "pt-MZ" });
    expect(out?.options).toEqual([]);
    expect(out?.bookingMode).toBe("quote");
  });
});

describe("mapGetServiceInput", () => {
  it("passes the id and the locale through", () => {
    expect(mapGetServiceInput({ id: "svc-1", locale: "en-US" })).toEqual({
      id: "svc-1",
      locale: "en-US",
    });
  });

  it("falls back to the platform's language when none was asked for", () => {
    // A zod `.default()` does not survive into the generated GraphQL schema,
    // so the fallback has to run here or not at all.
    expect(mapGetServiceInput({ id: "svc-1" })).toEqual({
      id: "svc-1",
      locale: "pt-MZ",
    });
  });
});
