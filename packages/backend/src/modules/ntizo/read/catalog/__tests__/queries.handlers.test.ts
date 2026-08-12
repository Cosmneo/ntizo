import { describe, expect, it } from "bun:test";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import { createCatalogReadHandlers } from "../graphql/handlers/queries.handlers";
import { ListMyServicesProjection } from "../app/use-cases/list-my-services.projection";
import type {
  ServiceOwnerRow,
  ServiceReadRepositoryPort,
} from "../../../bounded-contexts/catalog/app/ports/outbound/service-read.repository.port";

function ctx(overrides: Partial<NtizoGraphqlContext> = {}): NtizoGraphqlContext {
  return {
    requesterUserId: "u-session",
    email: null,
    firstName: null,
    lastName: null,
    role: "customer",
    requestId: null,
    ipAddress: null,
    userAgent: null,
    ...overrides,
  };
}

/**
 * Records every call so the authorization gate's ORDERING can be asserted,
 * not just its outcome — a future change that reorders, removes, or
 * short-circuits the `isProviderMember` check must fail these tests.
 *
 * Backs BOTH `mod.serviceRead` and (through a real `ListMyServicesProjection`
 * wrapping it) `mod.listMyServices`, so one `calls` array shows the true
 * order across the membership check and the fetch — a spy on the projection
 * alone couldn't do that, and `CatalogReadModule.listMyServices` is typed as
 * the concrete class, not a duck-typed interface, so a bare object literal
 * doesn't satisfy it anyway.
 */
class FakeServiceReadRepository implements ServiceReadRepositoryPort {
  public readonly calls: string[] = [];
  constructor(private readonly membership: boolean) {}

  async listForProvider(providerId: string): Promise<ServiceOwnerRow[]> {
    this.calls.push(`listForProvider:${providerId}`);
    return [];
  }

  async isProviderMember(providerId: string, userId: string): Promise<boolean> {
    this.calls.push(`isProviderMember:${providerId}:${userId}`);
    return this.membership;
  }

  async listPublished(): Promise<never[]> {
    this.calls.push("listPublished");
    return [];
  }
}

function makeModule(repo: FakeServiceReadRepository) {
  return {
    listCategoriesForAdmin: { execute: async () => [] } as never,
    listMyServices: new ListMyServicesProjection(repo),
    serviceRead: repo,
  };
}

describe("createCatalogReadHandlers", () => {
  it("builds a handler for every read field", () => {
    const handlers = createCatalogReadHandlers(makeModule(new FakeServiceReadRepository(true)));
    // Two: the admin category list and the provider's own service list.
    expect(handlers.length).toBe(2);
  });

  /**
   * `service.mine`'s membership check lives in the handler body, not in a
   * projection (the kit's `argsMapper` is synchronous, so it cannot ask this
   * question — see the comment on the handler itself). That makes the built
   * field returned by `createCatalogReadHandlers` the only place this gate
   * can be exercised directly, the same way
   * `read/user/__tests__/queries.handlers.test.ts` calls `handlers[0].handler`
   * to reach an inline check that has nowhere else to live.
   */
  describe("service.mine authorization gate", () => {
    it("refuses an anonymous caller before checking membership or fetching anything", async () => {
      const repo = new FakeServiceReadRepository(true);
      const handlers = createCatalogReadHandlers(makeModule(repo));
      const field = handlers.find((h) => h.key === "service.mine")!;

      await expect(
        field.handler({ providerId: "p1" }, ctx({ requesterUserId: null })),
      ).rejects.toThrow("Sign in");

      // The security property is ORDERING: nothing downstream of the
      // anonymous check ran — not the membership query, not the fetch.
      expect(repo.calls).toEqual([]);
    });

    it("refuses an authenticated non-member after checking membership, but never fetches", async () => {
      const repo = new FakeServiceReadRepository(false);
      const handlers = createCatalogReadHandlers(makeModule(repo));
      const field = handlers.find((h) => h.key === "service.mine")!;

      await expect(
        field.handler({ providerId: "p1" }, ctx({ requesterUserId: "u-outsider" })),
      ).rejects.toThrow("This workspace is not one you belong to");

      expect(repo.calls).toEqual(["isProviderMember:p1:u-outsider"]);
    });

    it("lets a member through, checking membership before fetching", async () => {
      const repo = new FakeServiceReadRepository(true);
      const handlers = createCatalogReadHandlers(makeModule(repo));
      const field = handlers.find((h) => h.key === "service.mine")!;

      const result = await field.handler(
        { providerId: "p1" },
        ctx({ requesterUserId: "u1" }),
      );

      expect(result).toEqual([]);
      expect(repo.calls).toEqual(["isProviderMember:p1:u1", "listForProvider:p1"]);
    });
  });
});

/**
 * A service with a single option looks identical whether it was assembled
 * from three keyed queries or from a naive join — the row multiplication a
 * join would cause only shows up once there is more than one child row to
 * multiply against. This fixture is deliberately non-trivial: three options,
 * each with two translations, so a projection that flattened rather than
 * grouped (the shape a join-then-map bug would produce) has somewhere to go
 * wrong.
 */
const cardinalityRow: ServiceOwnerRow = {
  id: "s1",
  providerId: "p1",
  categoryId: "c1",
  categoryCode: "plumbing",
  sourceLocale: "pt-MZ",
  locationType: "at_provider",
  bookingMode: "priced",
  status: "draft",
  imageKeys: [],
  sortOrder: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  bufferMinutes: 0,
  slotIntervalMinutes: 30,
  memberIds: ["m1"],
  options: [
    {
      id: "o1",
      pricingMode: "fixed",
      amountMinor: 1000,
      currency: "MZN",
      durationMinutes: 30,
      minMinutes: null,
      stepMinutes: null,
      isDefault: true,
      sortOrder: 0,
      isActive: true,
      translations: [
        { locale: "pt-MZ", name: "Opção 1 PT" },
        { locale: "en-US", name: "Option 1 EN" },
      ],
    },
    {
      id: "o2",
      pricingMode: "fixed",
      amountMinor: 2000,
      currency: "MZN",
      durationMinutes: 45,
      minMinutes: null,
      stepMinutes: null,
      isDefault: false,
      sortOrder: 1,
      isActive: true,
      translations: [
        { locale: "pt-MZ", name: "Opção 2 PT" },
        { locale: "en-US", name: "Option 2 EN" },
      ],
    },
    {
      id: "o3",
      pricingMode: "hourly",
      amountMinor: 500,
      currency: "MZN",
      durationMinutes: null,
      minMinutes: 30,
      stepMinutes: 15,
      isDefault: false,
      sortOrder: 2,
      isActive: true,
      translations: [
        { locale: "pt-MZ", name: "Opção 3 PT" },
        { locale: "en-US", name: "Option 3 EN" },
      ],
    },
  ],
  translations: [
    { locale: "pt-MZ", name: "Serviço de teste", description: null },
    { locale: "en-US", name: "Test service", description: null },
  ],
  quoteForm: null,
};

class FixedServiceReadRepository implements ServiceReadRepositoryPort {
  async listForProvider(): Promise<ServiceOwnerRow[]> {
    return [cardinalityRow];
  }
  async isProviderMember(): Promise<boolean> {
    return true;
  }
  async listPublished(): Promise<never[]> {
    return [];
  }
}

describe("ListMyServicesProjection cardinality", () => {
  it("keeps one service carrying three options, not three services or duplicated options", async () => {
    const projection = new ListMyServicesProjection(new FixedServiceReadRepository());

    const result = await projection.execute({ providerId: "p1" });

    // Exactly one service — a join-then-map bug that fans a service out per
    // child row would fail this first, before the option count even matters.
    expect(result.length).toBe(1);
    expect(result[0]!.id).toBe("s1");
    expect(result[0]!.options.length).toBe(3);
    expect(result[0]!.options.map((o) => o.id)).toEqual(["o1", "o2", "o3"]);
    // Each option keeps its own two translations rather than the six a
    // per-translation fan-out (or a per-option fan-out losing the second
    // locale) would produce.
    for (const option of result[0]!.options) {
      expect(option.translations.length).toBe(2);
    }
    expect(result[0]!.translations.length).toBe(2);
  });
});
