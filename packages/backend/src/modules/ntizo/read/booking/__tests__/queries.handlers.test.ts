import { describe, expect, it } from "bun:test";
import type { z } from "zod";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import { assertMayReadWorkspace } from "../graphql/handlers/queries.handlers";
import { bookingReadSchema, listProviderBookings } from "../graphql/schema/queries";

// The kit's `SchemaAdapter` exposes `.validate()`, not `.parse()` — the raw
// zod schema sits behind `_schema`, same accessor `read/activity`'s,
// `read/communication`'s and `read/notification`'s equivalent tests use.
const listProviderBookingsInput = (listProviderBookings.input as unknown as { _schema: z.ZodTypeAny })._schema;

function ctx(over: Partial<NtizoGraphqlContext> = {}): NtizoGraphqlContext {
  return {
    requesterUserId: "u-session", email: null, firstName: null, lastName: null,
    role: "customer", requestId: null, ipAddress: null, userAgent: null, ...over,
  };
}

const memberOf = (ids: string[]) => ({ isMember: async (providerId: string, userId: string) => ids.includes(`${providerId}:${userId}`) });

describe("bookingReadSchema", () => {
  it("adds the two provider fields beside the customer's", () => {
    expect(Object.keys(bookingReadSchema.fields.booking).sort()).toEqual(["byId", "byIdForProvider", "forProvider", "mine"]);
  });
  it("takes the tab as one of four words", () => {
    expect(() => listProviderBookingsInput.parse({ providerId: "p", tab: "everything" })).toThrow();
    for (const tab of ["requests", "upcoming", "history", "all"]) {
      expect(listProviderBookingsInput.parse({ providerId: "p", tab })).toMatchObject({ tab });
    }
  });
});

describe("assertMayReadWorkspace", () => {
  it("refuses an anonymous caller with UNAUTHENTICATED", async () => {
    await expect(assertMayReadWorkspace(ctx({ requesterUserId: null }), "p1", memberOf([]))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
  it("refuses a signed-in stranger with NOT_PROVIDER_MEMBER", async () => {
    await expect(assertMayReadWorkspace(ctx(), "p1", memberOf(["p2:u-session"]))).rejects.toMatchObject({ code: "NOT_PROVIDER_MEMBER" });
  });
  it("admits a member, and an admin without asking", async () => {
    await expect(assertMayReadWorkspace(ctx(), "p1", memberOf(["p1:u-session"]))).resolves.toBe("u-session");
    await expect(assertMayReadWorkspace(ctx({ role: "admin" }), "p1", memberOf([]))).resolves.toBe("u-session");
  });
});
