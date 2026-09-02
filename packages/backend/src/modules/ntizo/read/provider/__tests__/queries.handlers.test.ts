import { describe, expect, it } from "bun:test";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import { createProviderReadHandlers } from "../graphql/handlers/queries.handlers";
import { GetProviderDetailProjection } from "../app/use-cases/get-provider-detail.projection";
import { mapGetProviderDetailInput } from "../graphql/handlers/arg-mappers";
import { ProviderNotFoundError } from "../../../bounded-contexts/provider/domain/exceptions";
import type { ProviderReadRepositoryPort } from "../app/ports/outbound/provider-read.repository.port";
import type { ProviderDetailDTO, ProviderListItemDTO } from "@ntizo/shared/read-models";

const listItem: ProviderListItemDTO = {
  id: "p1", name: "Org", slug: "org",
  type: "organization", status: "active", role: "owner",
};

const detail: ProviderDetailDTO = {
  id: "p1", name: "Org", slug: "org", type: "organization", status: "active",
  description: null,
  address: null,
  logo: null,
  photos: [],
  documents: [],
  reverificationRequestedAt: null, commissionBps: 1200, ownerUserId: "u1", members: [], invites: [],
};

function makeModule(calls: string[] = []) {
  return {
    calls,
    listMyProviders: {
      execute: async (input: { requestedByUserId: string }) => {
        calls.push(`list:${input.requestedByUserId}`);
        return [listItem];
      },
    },
    listProvidersForAdmin: { async execute() { return []; } },
    getProviderDetailForAdmin: { async execute() { return {}; } } as never,
  getProviderDetail: {
      execute: async (input: { providerId: string; requestedByUserId: string }) => {
        calls.push(`detail:${input.providerId}:${input.requestedByUserId}`);
        return detail;
      },
    },
  };
}

describe("createProviderReadHandlers", () => {
  it("builds a handler for every read field", () => {
    const handlers = createProviderReadHandlers(makeModule());
    expect(Array.isArray(handlers)).toBe(true);
    // Three: the two member-scoped reads plus the admin queue.
    // Four now: my list, my detail, the admin list and the admin detail.
    expect(handlers.length).toBe(4);
  });

  it("stamps requestedByUserId from the session, never from args", async () => {
    const calls: string[] = [];
    const mod = makeModule(calls);
    // The arg-mapper is the unit under test: args carry no user id.
    const { mapListMyProvidersInput } = await import("../graphql/handlers/arg-mappers");
    const mapped = mapListMyProvidersInput({
      requesterUserId: "u-session", email: null, firstName: null,
      lastName: null, role: "customer",
      requestId: null, ipAddress: null, userAgent: null,
    });
    expect(mapped.requestedByUserId).toBe("u-session");
    await mod.listMyProviders.execute(mapped);
    expect(calls).toEqual(["list:u-session"]);
  });
});

/**
 * A fake repository that records every call so the authorization gate's
 * *ordering* can be asserted, not just its outcome — a future change that
 * reorders or removes the isMember check must fail these tests.
 */
class FakeProviderReadRepository implements ProviderReadRepositoryPort {
  public readonly calls: string[] = [];

  constructor(
    private readonly membership: boolean,
    private readonly detailToReturn: ProviderDetailDTO | null,
  ) {}

  async listForUser(): Promise<ProviderListItemDTO[]> {
    throw new Error("not used in these tests");
  }

  async isMember(providerId: string, userId: string): Promise<boolean> {
    this.calls.push(`isMember:${providerId}:${userId}`);
    return this.membership;
  }

  async findDetailById(providerId: string): Promise<ProviderDetailDTO | null> {
    this.calls.push(`findDetailById:${providerId}`);
    return this.detailToReturn;
  }
}

describe("GetProviderDetailProjection authorization gate", () => {
  it("rejects a non-member and never calls findDetailById", async () => {
    const repo = new FakeProviderReadRepository(false, detail);
    const projection = new GetProviderDetailProjection(repo);

    await expect(
      projection.execute({ providerId: "p1", requestedByUserId: "u-outsider" }),
    ).rejects.toThrow("[read/provider] not a member of this provider");

    // The security property is ORDERING: isMember ran, findDetailById never did.
    expect(repo.calls).toEqual(["isMember:p1:u-outsider"]);
  });

  it("returns the detail for a member", async () => {
    const repo = new FakeProviderReadRepository(true, detail);
    const projection = new GetProviderDetailProjection(repo);

    const result = await projection.execute({ providerId: "p1", requestedByUserId: "u1" });

    expect(result).toEqual(detail);
    expect(repo.calls).toEqual(["isMember:p1:u1", "findDetailById:p1"]);
  });

  it("throws when a member requests a provider that no longer exists", async () => {
    const repo = new FakeProviderReadRepository(true, null);
    const projection = new GetProviderDetailProjection(repo);

    await expect(
      projection.execute({ providerId: "p1", requestedByUserId: "u1" }),
    ).rejects.toThrow(ProviderNotFoundError);
  });
});

describe("mapGetProviderDetailInput", () => {
  it("takes providerId from args and requestedByUserId from the session, never from args", () => {
    const ctx: NtizoGraphqlContext = {
      requesterUserId: "u-session", email: null, firstName: null,
      lastName: null, role: "customer",
      requestId: null, ipAddress: null, userAgent: null,
    };
    // Extra field on args simulates a hostile/buggy client trying to smuggle
    // its own requestedByUserId in — the mapper must ignore it entirely.
    const suspiciousArgs = { providerId: "p1", requestedByUserId: "attacker-supplied" };

    const mapped = mapGetProviderDetailInput(suspiciousArgs, ctx);

    expect(mapped).toEqual({ providerId: "p1", requestedByUserId: "u-session" });
  });
});
