import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { GetServiceProjection } from "../app/use-cases/get-service.projection";
import { mapGetServiceInput } from "../graphql/handlers/arg-mappers";
import { DrizzleServiceReadRepository } from "../../../bounded-contexts/catalog/infrastructure/repositories/drizzle/service-read.repository";
import {
  __resetMediaUrlBaseForTests,
  configureMediaUrlBase,
  mediaUrl,
} from "../../../shared/infrastructure/media/media-url";

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
  beforeEach(() => {
    // Module-level state (`configureMediaUrlBase` is "first call wins"), so
    // it must be cleared before every test rather than assumed absent.
    __resetMediaUrlBaseForTests();
    configureMediaUrlBase("https://media.example.test");
  });

  afterEach(() => {
    __resetMediaUrlBaseForTests();
  });

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
      { id: "m1", firstName: "Ana", avatarKey: null },
      { id: "m2", firstName: "Flávio", avatarKey: "profiles/m2/avatar.jpg" },
    ]);
    const out = await make(row(), performers).execute({ id: "svc-1", locale: "pt-MZ" });
    expect(performers.lastIds).toEqual(["m1", "m2"]);
    expect(out?.performers.map((p) => p.firstName)).toEqual(["Ana", "Flávio"]);
  });

  it("resolves a performer's avatarUrl from their uploaded avatarKey, not a raw URL", async () => {
    // The whole point of this surface: a marketplace-uploaded photo is
    // published here, resolved the same way `mediaUrl()` resolves any other
    // key. If the projection started returning a raw `avatarUrl` field off
    // the row unchanged, this would still pass by coincidence unless the row
    // never carries one at all — see the next test for that guarantee.
    const performers = new FakePerformers([
      { id: "m2", firstName: "Flávio", avatarKey: "profiles/m2/avatar.jpg" },
    ]);
    const out = await make(row(), performers).execute({ id: "svc-1", locale: "pt-MZ" });
    expect(out?.performers[0]?.avatarUrl).toBe(mediaUrl("profiles/m2/avatar.jpg"));
    expect(out?.performers[0]?.avatarUrl).toBe(
      "https://media.example.test/profiles/m2/avatar.jpg",
    );
  });

  it("never publishes a Google sign-in photo: a row with no uploaded avatarKey yields no avatarUrl", async () => {
    // Regression guard for the bug this fixes: before, this projection read
    // `profile.avatarUrl` raw, so a person who only ever signed in with
    // Google — and never uploaded a photo — had their Google picture shown
    // here without ever choosing to publish it. The port no longer even
    // carries an `avatarUrl` field to fall back to; a performer with no
    // `avatarKey` must resolve to `null`, not to some other photo on file.
    const performers = new FakePerformers([
      { id: "m1", firstName: "Ana", avatarKey: null },
    ]);
    const out = await make(row(), performers).execute({ id: "svc-1", locale: "pt-MZ" });
    expect(out?.performers[0]?.avatarUrl).toBeNull();
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

describe("DrizzleServiceReadRepository.getPublishedById", () => {
  // Not exercised by the `GetServiceProjection` tests above: those use a
  // `FakeRepo`, so the guard living in the Drizzle adapter is only reachable
  // through the real class. Genuinely no database involved — the guard
  // returns before the function's first `getDb()` call, so this exercises
  // the actual early return rather than a stub standing in for one.
  it("returns null for an id that is not a well-formed UUID, without reaching Postgres", async () => {
    const repo = new DrizzleServiceReadRepository();
    expect(await repo.getPublishedById("nonexistent-id")).toBeNull();
  });
});
