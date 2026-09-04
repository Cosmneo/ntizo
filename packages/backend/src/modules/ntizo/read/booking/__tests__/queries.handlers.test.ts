import { describe, expect, it } from "bun:test";
import type { z } from "zod";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import {
  assertMayReadWorkspace,
  type BookingReadModule,
  createBookingReadHandlers,
} from "../graphql/handlers/queries.handlers";
import {
  bookingReadSchema,
  getProviderStats,
  listAdminBookings,
  listProviderBookings,
} from "../graphql/schema/queries";

// The kit's `SchemaAdapter` exposes `.validate()`, not `.parse()` — the raw
// zod schema sits behind `_schema`, same accessor `read/activity`'s,
// `read/communication`'s and `read/notification`'s equivalent tests use.
const listProviderBookingsInput = (listProviderBookings.input as unknown as { _schema: z.ZodTypeAny })._schema;
const getProviderStatsInput = (getProviderStats.input as unknown as { _schema: z.ZodTypeAny })._schema;
const listAdminBookingsInput = (listAdminBookings.input as unknown as { _schema: z.ZodTypeAny })._schema;

function ctx(over: Partial<NtizoGraphqlContext> = {}): NtizoGraphqlContext {
  return {
    requesterUserId: "u-session", email: null, firstName: null, lastName: null,
    role: "customer", requestId: null, ipAddress: null, userAgent: null, ...over,
  };
}

const memberOf = (ids: string[]) => ({ isMember: async (providerId: string, userId: string) => ids.includes(`${providerId}:${userId}`) });

describe("bookingReadSchema", () => {
  it("mounts the dashboard's read beside the list's, and the administrator's queue beside both", () => {
    expect(Object.keys(bookingReadSchema.fields.booking).sort()).toEqual([
      "byId",
      "byIdForProvider",
      "forProvider",
      "mine",
      "needsAttentionForAdmin",
      "statsForProvider",
    ]);
  });
  it("takes the administrator's tab as one of three words, and nothing else as required", () => {
    expect(() => listAdminBookingsInput.parse({ tab: "everything" })).toThrow();
    expect(() => listAdminBookingsInput.parse({})).toThrow();
    for (const tab of ["unclosed", "in_window", "disputed"]) {
      expect(listAdminBookingsInput.parse({ tab })).toMatchObject({ tab });
    }
    // The page is the caller's to ask for, within the ceiling the projection
    // also clamps to — two guards on one number, and the edge is the cheaper.
    expect(() => listAdminBookingsInput.parse({ tab: "unclosed", limit: 51 })).toThrow();
    expect(() => listAdminBookingsInput.parse({ tab: "unclosed", offset: -1 })).toThrow();
    expect(listAdminBookingsInput.parse({ tab: "unclosed", limit: 50, offset: 100 })).toMatchObject({
      limit: 50,
      offset: 100,
    });
  });
  it("takes the tab as one of four words", () => {
    expect(() => listProviderBookingsInput.parse({ providerId: "p", tab: "everything" })).toThrow();
    for (const tab of ["requests", "upcoming", "history", "all"]) {
      expect(listProviderBookingsInput.parse({ providerId: "p", tab })).toMatchObject({ tab });
    }
  });
  it("the stats read takes a workspace and nothing else", () => {
    expect(() => getProviderStatsInput.parse({})).toThrow();
    expect(getProviderStatsInput.parse({ providerId: "p1" })).toEqual({ providerId: "p1" });
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

/** An empty page, so the field's own output schema is what validates the answer. */
const EMPTY_PAGE = { items: [], total: 0, nextOffset: null };

function spyProjection(result: unknown = EMPTY_PAGE) {
  const calls: unknown[] = [];
  return {
    calls,
    execute: async (input: unknown): Promise<unknown> => {
      calls.push(input);
      return result;
    },
  };
}

function makeModule(listForAdmin = spyProjection()) {
  return {
    listForAdmin,
    module: {
      bookingRead: { adapters: {}, useCases: { listForAdmin } },
    } as unknown as BookingReadModule,
  };
}

/**
 * The queue's field, driven through the kit's own built handler — so the
 * input schema, the output schema and the guard all run exactly as they do in
 * a request.
 *
 * `booking.needsAttentionForAdmin` is the whole administrative surface of the
 * queue: `ListAdminBookingsProjection` takes no requester and the repository
 * takes no owner id, by design — an administrator's queue is the one read
 * that deliberately spans every workspace. There is no second check further
 * in to catch a mistake made here.
 */
describe("booking.needsAttentionForAdmin", () => {
  const handlerFor = (mod: BookingReadModule) => {
    const found = createBookingReadHandlers(mod).find((h) => h.key === "booking.needsAttentionForAdmin");
    if (!found) throw new Error("no handler mounted for booking.needsAttentionForAdmin");
    return found;
  };

  const adminCtx = () => ctx({ requesterUserId: "u-admin", role: "admin" });

  it("asks the projection for the tab, defaulting the page to the first twenty", async () => {
    const { module, listForAdmin } = makeModule();

    const before = Date.now();
    const out = await handlerFor(module).handler({ tab: "disputed" }, adminCtx());
    const after = Date.now();

    expect(out).toEqual(EMPTY_PAGE);
    expect(listForAdmin.calls).toHaveLength(1);
    expect(listForAdmin.calls[0]).toMatchObject({ tab: "disputed", limit: 20, offset: 0 });
    // **The instant this request ran**, bracketed by the test's own clock —
    // not merely "a Date". `unclosed`'s predicate is `endsAt < now`, so a
    // handler passing any fixed instant (an epoch zero, a constant) would
    // empty or fill the tab wholesale while still handing the projection
    // something of the right type. See `AdminBookingFilter.now`.
    const { now } = listForAdmin.calls[0] as { now: Date };
    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });

  it("passes a page the caller asked for through unchanged", async () => {
    const { module, listForAdmin } = makeModule();

    await handlerFor(module).handler({ tab: "unclosed", limit: 5, offset: 10 }, adminCtx());

    expect(listForAdmin.calls[0]).toMatchObject({ tab: "unclosed", limit: 5, offset: 10 });
  });

  /**
   * The four callers that must all be refused, and refused *identically*.
   *
   * The queue spans every workspace, so a refusal that varied — by message,
   * by code, or by running the read first and failing later — would be an
   * oracle: somebody could learn what is in the queue from the shape of being
   * told they may not see it. Each case asserts the projection was never
   * reached, and the case below asserts all four refusals are the same
   * refusal.
   */
  const refused = [
    { name: "a customer", over: { requesterUserId: "u-cust", role: "customer" } as const },
    {
      name: "a provider",
      over: { requesterUserId: "u-member", role: "individual_provider" } as const,
    },
    { name: "an anonymous caller", over: { requesterUserId: null, role: "customer" } as const },
    // The half a role check alone would not have: the context schema admits
    // `role: "admin"` with a null `requesterUserId`, because an anonymous
    // request is given a role rather than none.
    { name: "an admin role with nobody behind it", over: { requesterUserId: null, role: "admin" } as const },
  ];

  for (const who of refused) {
    it(`refuses ${who.name} with ADMIN_ONLY, before the projection runs`, async () => {
      const { module, listForAdmin } = makeModule();

      await expect(
        handlerFor(module).handler({ tab: "unclosed" }, ctx(who.over)),
      ).rejects.toMatchObject({ code: "ADMIN_ONLY" });

      expect(listForAdmin.calls).toEqual([]);
    });
  }

  it("refuses all four with the same message and the same code", async () => {
    const { module } = makeModule();
    const seen = new Set<string>();

    for (const who of refused) {
      try {
        await handlerFor(module).handler({ tab: "disputed" }, ctx(who.over));
        throw new Error(`${who.name} was not refused`);
      } catch (error) {
        const { code, message } = error as { code?: string; message?: string };
        seen.add(`${code}|${message}`);
      }
    }

    expect(seen.size).toBe(1);
    expect([...seen][0]).toBe("ADMIN_ONLY|Only administrators may read the booking queue");
  });
});
