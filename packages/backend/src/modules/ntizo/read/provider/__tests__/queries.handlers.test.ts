import { describe, expect, it } from "bun:test";
import { createProviderReadHandlers } from "../graphql/handlers/queries.handlers";
import type { ProviderDetailDTO, ProviderListItemDTO } from "@ntizo/shared/read-models";

const listItem: ProviderListItemDTO = {
  id: "p1", name: "Org", slug: "org",
  type: "organization", status: "active", role: "owner",
};

const detail: ProviderDetailDTO = {
  id: "p1", name: "Org", slug: "org", type: "organization", status: "active",
  description: null, ownerUserId: "u1", members: [], invites: [],
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
    expect(handlers.length).toBe(2);
  });

  it("stamps requestedByUserId from the session, never from args", async () => {
    const calls: string[] = [];
    const mod = makeModule(calls);
    // The arg-mapper is the unit under test: args carry no user id.
    const { mapListMyProvidersInput } = await import("../graphql/handlers/arg-mappers");
    const mapped = mapListMyProvidersInput({
      requesterUserId: "u-session", email: null, firstName: null,
      lastName: null, requestId: null, ipAddress: null, userAgent: null,
    });
    expect(mapped.requestedByUserId).toBe("u-session");
    await mod.listMyProviders.execute(mapped);
    expect(calls).toEqual(["list:u-session"]);
  });
});
