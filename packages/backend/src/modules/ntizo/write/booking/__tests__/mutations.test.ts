import { describe, expect, it } from "bun:test";
import type { z } from "zod";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import {
  acceptBooking,
  adminCompleteBooking,
  adminMarkBookingDone,
  bookingWriteSchema,
  createBooking,
  declineBooking,
  disputeBooking,
  keepBookingOpen,
  markBookingDone,
  resolveBookingDispute,
  submitBooking,
} from "../graphql/schema/mutations";
import {
  createBookingWriteHandlers,
  type BookingWriteModule,
} from "../graphql/handlers/mutations.handlers";

// The kit's `SchemaAdapter` exposes `.validate()`, not `.parse()` — the raw
// zod schema sits behind `_schema`, same accessor `read/booking`'s,
// `read/activity`'s, `read/communication`'s and `read/notification`'s
// equivalent tests use.
const shape = (field: { input: unknown }): z.ZodObject<z.ZodRawShape> =>
  (field.input as unknown as { _schema: z.ZodObject<z.ZodRawShape> })._schema;

/**
 * The input's field names **in declaration order, not sorted**. The order is
 * part of what is being pinned here: a mutation whose fields are read off in
 * the order the schema declares them is one a reader can check against the
 * command it feeds without re-sorting either list in their head.
 */
const shapeKeys = (field: { input: unknown }): string[] => Object.keys(shape(field).shape);

const VALID_CREATE_INPUT = {
  serviceOptionId: "opt-1",
  providerMemberId: "member-1",
  startsAt: "2026-09-04T12:30:00.000Z",
  locale: "pt-MZ",
};

const VALID_SUBMIT_INPUT = {
  bookingId: "bk-1",
  address: {
    label: "Casa",
    line: "Av. Julius Nyerere 812",
    city: "Maputo",
    district: "Sommerschield",
    directions: null,
    lat: null,
    lng: null,
  },
  description: "Sem energia na cozinha",
};

/**
 * The edge refusing obvious nonsense cheaply — `Booking.create` still owns
 * the rule, this only owns catching it before a round trip to the aggregate.
 * No `durationMinutes` case here: there is no such field to send, which is
 * the whole reason a customer cannot book a two-minute house clean by
 * editing a payload — see the schema's own doc comment.
 */
describe("booking.create input", () => {
  it("accepts a well-formed booking request", () => {
    const result = createBooking.input!.validate(VALID_CREATE_INPUT);
    expect(result.success).toBe(true);
  });

  it("rejects a startsAt that is not a date", () => {
    const result = createBooking.input!.validate({ ...VALID_CREATE_INPUT, startsAt: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("has no customerId field — the customer comes from the session, not the client", () => {
    const result = createBooking.input!.validate({
      ...VALID_CREATE_INPUT,
      customerId: "someone-else",
    });
    // Not stripped silently: the input schema has no such key at all, so a
    // client attempting this either sees the field ignored (extra keys are
    // dropped by a plain z.object) or, if this ever becomes `.strict()`,
    // refused outright. Either way `customerId` never reaches the command
    // through this input.
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).customerId).toBeUndefined();
    }
  });

  it("has no address and no description field — both belong to booking.submit", () => {
    // This is what makes the whole flow reachable: step 1 creates a draft
    // that holds the slot before the customer has given an address. Removed
    // rather than made optional — an optional field nothing ever sets is a
    // field somebody eventually sets wrongly — so a client sending either
    // gets it dropped here and never reaches `CreateBookingInput`, which has
    // no such property to receive it.
    const result = createBooking.input!.validate({
      ...VALID_CREATE_INPUT,
      address: { label: "Casa", line: "Av. Julius Nyerere 812", city: "Maputo" },
      description: "Sem energia na cozinha",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as Record<string, unknown>;
      expect(data.address).toBeUndefined();
      expect(data.description).toBeUndefined();
    }
  });
});

/**
 * Step 2's two fields — the address and the optional note about what needs
 * doing — arriving together on the hop that sends the request. Same division
 * of labour as `booking.create`'s input: this refuses obvious nonsense before
 * a round trip, and `Booking.submit` is where the rule is defined —
 * `SubmitBookingCommand` keeps no second copy of it deliberately.
 */
describe("booking.submit input", () => {
  it("accepts a well-formed submission", () => {
    const result = submitBooking.input!.validate(VALID_SUBMIT_INPUT);
    expect(result.success).toBe(true);
  });

  it("rejects a missing address", () => {
    const { address: _address, ...withoutAddress } = VALID_SUBMIT_INPUT;
    const result = submitBooking.input!.validate(withoutAddress);
    expect(result.success).toBe(false);
  });

  /**
   * Each required component refused on its own, not one example standing in
   * for all three: a schema that had lost the bound on `city` alone would
   * still pass a test that only ever omitted `label`.
   *
   * This is also what keeps `Booking.requireNonBlank` — which calls `.trim()`
   * on its argument — from ever meeting an `undefined` and throwing a raw
   * `TypeError` instead of `BookingFieldBlankError`. The kit validates every
   * input against this schema before the handler runs, so a payload missing a
   * component is refused at the boundary and never reaches the aggregate.
   */
  for (const missing of ["label", "line", "city"] as const) {
    it(`rejects an address with no ${missing}`, () => {
      const { [missing]: _dropped, ...rest } = VALID_SUBMIT_INPUT.address;
      const result = submitBooking.input!.validate({ ...VALID_SUBMIT_INPUT, address: rest });
      expect(result.success).toBe(false);
    });

    it(`rejects a blank ${missing}`, () => {
      const result = submitBooking.input!.validate({
        ...VALID_SUBMIT_INPUT,
        address: { ...VALID_SUBMIT_INPUT.address, [missing]: "   " },
      });
      expect(result.success).toBe(false);
    });
  }

  it("rejects a missing bookingId", () => {
    const { bookingId: _bookingId, ...withoutId } = VALID_SUBMIT_INPUT;
    const result = submitBooking.input!.validate(withoutId);
    expect(result.success).toBe(false);
  });

  it("accepts a null description — the customer need not explain the job", () => {
    const result = submitBooking.input!.validate({ ...VALID_SUBMIT_INPUT, description: null });
    expect(result.success).toBe(true);
  });

  /**
   * **An omitted optional key is not the same input as an explicit null, and
   * Zod treats them differently.** `.nullable()` on its own accepts `null`
   * and rejects `undefined`; GraphQL lets a document leave a nullable input
   * field out entirely, so a client that simply does not send `district`
   * would have had its whole mutation refused. `.optional()` beside
   * `.nullable()` is what makes the omission mean what it reads as.
   *
   * Every optional field on its own, not one example standing in for the
   * set: dropping `.optional()` from a single one of them has to turn this
   * red. Three clients are about to be written against this surface.
   */
  it("accepts a submission that omits every optional key", () => {
    const result = submitBooking.input!.validate({
      bookingId: "bk-1",
      address: { label: "Casa", line: "Av. Julius Nyerere 812", city: "Maputo" },
    });
    expect(result.success).toBe(true);
  });

  for (const omitted of ["district", "directions", "lat", "lng"] as const) {
    it(`accepts an address that omits ${omitted}`, () => {
      const { [omitted]: _dropped, ...rest } = VALID_SUBMIT_INPUT.address;
      const result = submitBooking.input!.validate({ ...VALID_SUBMIT_INPUT, address: rest });
      expect(result.success).toBe(true);
    });
  }

  it("accepts a submission that omits description", () => {
    const { description: _description, ...withoutDescription } = VALID_SUBMIT_INPUT;
    const result = submitBooking.input!.validate(withoutDescription);
    expect(result.success).toBe(true);
  });

  it("accepts an empty description — the aggregate is what normalises it to null", () => {
    // `.max(1000)` with no `.min(1)`, so `""` is a payload the wire takes.
    // That is deliberate — an empty note is the same fact as no note — and it
    // is why `Booking.submit` has a blank-to-null branch with its own tests
    // rather than relying on this schema to make one unreachable.
    const result = submitBooking.input!.validate({ ...VALID_SUBMIT_INPUT, description: "" });
    expect(result.success).toBe(true);
  });

  it("has no customerId field — the customer comes from the session, not the client", () => {
    // Without this, `booking.submit` would be the mutation that sends
    // somebody else's draft to a provider, starting their response clock on a
    // request the customer never made. The command's own authorisation check
    // is the other half; this is the half that removes the temptation.
    const result = submitBooking.input!.validate({
      ...VALID_SUBMIT_INPUT,
      customerId: "someone-else",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).customerId).toBeUndefined();
    }
  });
});

/**
 * The provider's yes and no. Both take only the booking id the person comes
 * from `requireUser(ctx)`, never from this input, for the same reason
 * `booking.create` and `booking.submit` have no `customerId` field — see
 * those schemas' own doc comments.
 */
describe("accept and decline", () => {
  it("take only the booking id — the person comes from the session", () => {
    expect(shapeKeys(acceptBooking)).toEqual(["bookingId"]);
    expect(shapeKeys(declineBooking)).toEqual(["bookingId", "reason"]);
  });

  it("refuses a free-text reason", () => {
    expect(() => shape(declineBooking).parse({ bookingId: "b", reason: "I am busy" })).toThrow();
    expect(shape(declineBooking).parse({ bookingId: "b", reason: "outside_area" })).toMatchObject({
      reason: "outside_area",
    });
  });
});

/**
 * The six hops that close a booking, mounted beside the four that open one.
 *
 * Two facts about this surface are security rather than style, and both are
 * pinned by tests below rather than by the reading of a handler:
 *
 * 1. **Every mutation hardcodes its own `reason`, and no input carries one.**
 *    `MarkBookingDoneCommand` skips its membership check for
 *    `marked_done_by_admin` and `marked_done_by_platform` — that exemption is
 *    safe only while nothing maps client input onto a reason. A `reason`
 *    field here would let any signed-in stranger close any provider's booking
 *    by naming the exempt token.
 * 2. **No mutation can pass `requesterUserId: null`.** A null there does not
 *    fail closed in that command: it skips the membership check entirely and
 *    records the platform as the actor. Null is the sweep's value, and the
 *    sweep is not an edge — so every handler resolves a real user id from the
 *    session and refuses when there is none.
 */
describe("the six ways a booking can end", () => {
  it("mounts the six ways a booking can end", () => {
    expect(Object.keys(bookingWriteSchema.fields.booking).sort()).toEqual([
      "accept",
      "adminComplete",
      "adminMarkDone",
      "create",
      "decline",
      "dispute",
      "markDone",
      "resolveDispute",
      "stillOngoing",
      "submit",
    ]);
  });

  it("takes a dispute's message and its attachments", () => {
    expect(shapeKeys(disputeBooking)).toEqual(["bookingId", "message", "attachments"]);
    expect(() => shape(disputeBooking).parse({ bookingId: "b", message: "" })).toThrow();
  });

  it("asks an administrator which way the dispute went", () => {
    expect(shapeKeys(resolveBookingDispute)).toEqual(["bookingId", "upheld", "note"]);
  });

  /**
   * The first of the two security facts, asserted at the schema rather than
   * only at the handler: there is no field to send. `z.object` strips unknown
   * keys, so a client naming an exempt reason has it dropped here before any
   * handler could read it — and the handlers do not read one anyway.
   */
  it("has no reason field on any of the six — every reason is the handler's own", () => {
    expect(shapeKeys(markBookingDone)).toEqual(["bookingId"]);
    expect(shapeKeys(keepBookingOpen)).toEqual(["bookingId"]);
    expect(shapeKeys(adminMarkBookingDone)).toEqual(["bookingId"]);
    expect(shapeKeys(adminCompleteBooking)).toEqual(["bookingId"]);

    for (const field of [
      markBookingDone,
      keepBookingOpen,
      adminMarkBookingDone,
      adminCompleteBooking,
    ]) {
      const parsed = shape(field).parse({
        bookingId: "b",
        reason: "marked_done_by_platform",
      }) as Record<string, unknown>;
      expect(parsed.reason).toBeUndefined();
    }
  });

  /**
   * The second fact, at the schema: no mutation lets the caller say who they
   * are. `requesterUserId`, `adminUserId` and `changedByUserId` are all names
   * the commands behind these fields take — none of them is a field here.
   */
  it("lets nobody name the actor — the session is the only answer", () => {
    const fields = [
      markBookingDone,
      keepBookingOpen,
      disputeBooking,
      adminMarkBookingDone,
      adminCompleteBooking,
      resolveBookingDispute,
    ];
    for (const field of fields) {
      const keys = shapeKeys(field);
      expect(keys).not.toContain("requesterUserId");
      expect(keys).not.toContain("adminUserId");
      expect(keys).not.toContain("changedByUserId");
    }
  });

  it("bounds a dispute's message and the number of files it carries", () => {
    const ok = shape(disputeBooking).parse({
      bookingId: "b",
      message: "  nada funciona  ",
    }) as Record<string, unknown>;
    // Trimmed by the schema, and the default is the empty list rather than
    // `undefined` — `DisputeBookingInput.attachments` is required.
    expect(ok.message).toBe("nada funciona");
    expect(ok.attachments).toEqual([]);

    expect(() =>
      shape(disputeBooking).parse({ bookingId: "b", message: "x".repeat(2001) }),
    ).toThrow();

    const one = {
      storageKey: "attachment/u-1/a",
      fileName: "a.png",
      contentType: "image/png",
      sizeBytes: 12,
    };
    expect(() =>
      shape(disputeBooking).parse({ bookingId: "b", message: "oi", attachments: Array(6).fill(one) }),
    ).toThrow();
    expect(
      shape(disputeBooking).parse({ bookingId: "b", message: "oi", attachments: Array(5).fill(one) }),
    ).toMatchObject({ attachments: Array(5).fill(one) });
    // The upload route answers with exactly these four keys and the client
    // hands them back unchanged — so a descriptor missing one of them is
    // refused here rather than reaching the port that carries it.
    expect(() =>
      shape(disputeBooking).parse({
        bookingId: "b",
        message: "oi",
        attachments: [{ storageKey: "k", fileName: "a.png", contentType: "image/png" }],
      }),
    ).toThrow();
  });

  it("takes a decision and an optional note from the administrator", () => {
    expect(shape(resolveBookingDispute).parse({ bookingId: "b", upheld: true })).toEqual({
      bookingId: "b",
      upheld: true,
      // Defaulted rather than left undefined: `ResolveBookingDisputeInput.note`
      // is `string | null` and required, so the boundary is what collapses an
      // omitted key and an explicit null into the one thing the domain has.
      note: null,
    });
    expect(() => shape(resolveBookingDispute).parse({ bookingId: "b" })).toThrow();
    expect(() => shape(resolveBookingDispute).parse({ bookingId: "b", upheld: "yes" })).toThrow();
  });
});

/** Every call, and the exact args it ran with — not just whether it ran. */
function spyUseCase(result: unknown = null) {
  const calls: unknown[] = [];
  return {
    calls,
    execute: async (input: unknown): Promise<unknown> => {
      calls.push(input);
      return result;
    },
  };
}

type UseCaseSpy = ReturnType<typeof spyUseCase>;

type SpiedUseCase =
  | "createBooking"
  | "submitBooking"
  | "acceptBooking"
  | "declineBooking"
  | "markBookingDone"
  | "keepBookingOpen"
  | "completeBooking"
  | "disputeBooking"
  | "resolveBookingDispute";

function makeModule(overrides: Partial<Record<SpiedUseCase, UseCaseSpy>> = {}): {
  module: BookingWriteModule;
  spies: Record<SpiedUseCase, UseCaseSpy>;
} {
  const spies: Record<SpiedUseCase, UseCaseSpy> = {
    createBooking:
      overrides.createBooking ??
      spyUseCase({ bookingId: "bk-1", expiresAt: "2026-09-04T13:00:00.000Z" }),
    submitBooking:
      overrides.submitBooking ??
      spyUseCase({ bookingId: "bk-1", respondBy: "2026-09-05T13:00:00.000Z" }),
    acceptBooking: overrides.acceptBooking ?? spyUseCase(null),
    declineBooking: overrides.declineBooking ?? spyUseCase(null),
    markBookingDone: overrides.markBookingDone ?? spyUseCase(null),
    keepBookingOpen: overrides.keepBookingOpen ?? spyUseCase(undefined),
    completeBooking: overrides.completeBooking ?? spyUseCase(null),
    disputeBooking: overrides.disputeBooking ?? spyUseCase({ threadId: "thr-1" }),
    resolveBookingDispute: overrides.resolveBookingDispute ?? spyUseCase(null),
  };
  return {
    spies,
    module: {
      booking: { adapters: {} as never, useCases: spies },
    } as unknown as BookingWriteModule,
  };
}

function ctx(overrides: Partial<NtizoGraphqlContext> = {}): NtizoGraphqlContext {
  return {
    requesterUserId: "u-member",
    email: null,
    firstName: null,
    lastName: null,
    role: "individual_provider",
    requestId: null,
    ipAddress: null,
    userAgent: null,
    ...overrides,
  };
}

/**
 * The handlers, driven through the kit's own built field — so the input
 * schema, the output schema and the guard all run exactly as they do in a
 * request. `field.handler(rawArgs, ctx)` validates `rawArgs` against the
 * mutation's input and the answer against its output, which is why a return
 * shape that disagreed with the schema fails here rather than in production.
 */
describe("createBookingWriteHandlers", () => {
  const handlerFor = (mod: BookingWriteModule, key: string) => {
    const found = createBookingWriteHandlers(mod).find((h) => h.key === key);
    if (!found) throw new Error(`no handler mounted for ${key}`);
    return found;
  };

  it("mounts a handler for every field the schema declares", () => {
    const { module } = makeModule();
    expect(
      createBookingWriteHandlers(module)
        .map((h) => h.key)
        .sort(),
    ).toEqual([
      "booking.accept",
      "booking.adminComplete",
      "booking.adminMarkDone",
      "booking.create",
      "booking.decline",
      "booking.dispute",
      "booking.markDone",
      "booking.resolveDispute",
      "booking.stillOngoing",
      "booking.submit",
    ]);
  });

  describe("the provider's and the customer's three", () => {
    it("markDone reaches the command as the provider, with the provider's reason", async () => {
      const { module, spies } = makeModule();

      const out = await handlerFor(module, "booking.markDone").handler(
        // `reason` sent by the client and dropped by the schema; the handler
        // never reads one. Written out as the exempt token on purpose — this
        // is the escalation the hardcoding exists to make impossible.
        { bookingId: "bk-9", reason: "marked_done_by_platform", requesterUserId: "victim" },
        ctx({ requesterUserId: "u-member" }),
      );

      expect(out).toEqual({ bookingId: "bk-9" });
      expect(spies.markBookingDone.calls).toEqual([
        { bookingId: "bk-9", requesterUserId: "u-member", reason: "marked_done_by_provider" },
      ]);
    });

    it("stillOngoing reaches the command as the provider", async () => {
      const { module, spies } = makeModule();

      const out = await handlerFor(module, "booking.stillOngoing").handler(
        { bookingId: "bk-9", requesterUserId: "victim" },
        ctx({ requesterUserId: "u-member" }),
      );

      expect(out).toEqual({ bookingId: "bk-9" });
      expect(spies.keepBookingOpen.calls).toEqual([
        { bookingId: "bk-9", requesterUserId: "u-member" },
      ]);
    });

    it("dispute reaches the command as the customer and answers with the thread it opened", async () => {
      const attachments = [
        {
          storageKey: "attachment/u-cust/1-abc",
          fileName: "parede.jpg",
          contentType: "image/jpeg",
          sizeBytes: 4096,
        },
      ];
      const { module, spies } = makeModule({ disputeBooking: spyUseCase({ threadId: "thr-77" }) });

      const out = await handlerFor(module, "booking.dispute").handler(
        { bookingId: "bk-9", message: "  a parede continua molhada  ", attachments },
        ctx({ requesterUserId: "u-cust", role: "customer" }),
      );

      // The thread id is the command's answer, never an echo of anything the
      // caller sent — there is no `threadId` field on the input to echo.
      expect(out).toEqual({ bookingId: "bk-9", threadId: "thr-77" });
      expect(spies.disputeBooking.calls).toEqual([
        {
          bookingId: "bk-9",
          requesterUserId: "u-cust",
          message: "a parede continua molhada",
          attachments,
        },
      ]);
    });

    /**
     * The zod default, which is what keeps `undefined` out of
     * `DisputeBookingInput.attachments` — a required field on that interface.
     * It is *not* a claim that the wire lets the key be omitted: the SDL
     * renders `attachments` as a non-null list with no GraphQL default, so a
     * document that leaves it out is refused at validation before any of this
     * runs. See the schema's own doc comment.
     */
    it("dispute defaults to no attachments rather than undefined", async () => {
      const { module, spies } = makeModule();

      await handlerFor(module, "booking.dispute").handler(
        { bookingId: "bk-9", message: "nada funciona" },
        ctx({ requesterUserId: "u-cust", role: "customer" }),
      );

      expect(spies.disputeBooking.calls).toEqual([
        { bookingId: "bk-9", requesterUserId: "u-cust", message: "nada funciona", attachments: [] },
      ]);
    });

    /**
     * The wrong person, on the three fields this edge deliberately does not
     * check. `MarkBookingDoneCommand` refuses a caller who does not belong to
     * the booking's provider and `DisputeBookingCommand` refuses anybody but
     * the booking's own customer — both against the database, which is why the
     * check is theirs and not this synchronous edge's. What this edge owes
     * them is the *session's* user id and the reason that keeps the check
     * switched on, and that is what is asserted: a stranger gets as far as the
     * command, under their own name, with `marked_done_by_provider` on it.
     *
     * Written down because "the edge lets this through" reads like a hole
     * until you can see which id and which reason it lets through.
     */
    it("hands a stranger to the command under their own name, with the check still on", async () => {
      const { module, spies } = makeModule();

      await handlerFor(module, "booking.markDone").handler(
        { bookingId: "bk-9" },
        ctx({ requesterUserId: "u-stranger", role: "customer" }),
      );
      await handlerFor(module, "booking.dispute").handler(
        { bookingId: "bk-9", message: "nao sou o cliente" },
        ctx({ requesterUserId: "u-stranger", role: "individual_provider" }),
      );

      expect(spies.markBookingDone.calls).toEqual([
        // `marked_done_by_provider` is the one reason the command checks
        // membership for — a stranger reaching it under an exempt token is
        // the escalation, and this is where it would show up.
        { bookingId: "bk-9", requesterUserId: "u-stranger", reason: "marked_done_by_provider" },
      ]);
      expect(spies.disputeBooking.calls).toEqual([
        {
          bookingId: "bk-9",
          requesterUserId: "u-stranger",
          message: "nao sou o cliente",
          attachments: [],
        },
      ]);
    });

    /**
     * The fact the whole surface rests on: `requesterUserId: null` is the
     * sweep's value, and none of these three doors can produce it. A null
     * reaching `MarkBookingDoneCommand` would skip the membership check and
     * record the platform as the actor — so the refusal has to happen here,
     * before the command is called at all.
     */
    for (const { key, args } of [
      { key: "booking.markDone", args: { bookingId: "bk-9" } },
      { key: "booking.stillOngoing", args: { bookingId: "bk-9" } },
      { key: "booking.dispute", args: { bookingId: "bk-9", message: "nada funciona" } },
    ] as const) {
      it(`refuses an anonymous caller on ${key} before any use case runs, with code UNAUTHENTICATED`, async () => {
        const { module, spies } = makeModule();

        await expect(
          handlerFor(module, key).handler(args, ctx({ requesterUserId: null, role: "customer" })),
        ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

        for (const spy of Object.values(spies)) {
          expect(spy.calls).toEqual([]);
        }
      });
    }
  });

  describe("the administrator's three", () => {
    const adminCtx = () => ctx({ requesterUserId: "u-admin", role: "admin" });

    it("adminMarkDone reaches the same command as the administrator, with the administrator's reason", async () => {
      const { module, spies } = makeModule();

      const out = await handlerFor(module, "booking.adminMarkDone").handler(
        { bookingId: "bk-9", reason: "marked_done_by_provider" },
        adminCtx(),
      );

      expect(out).toEqual({ bookingId: "bk-9" });
      // The same hop as `booking.markDone`, a different door: the reason is
      // the door's, and `requesterUserId` is the administrator rather than
      // the null that would have skipped the membership check anyway.
      expect(spies.markBookingDone.calls).toEqual([
        { bookingId: "bk-9", requesterUserId: "u-admin", reason: "marked_done_by_admin" },
      ]);
    });

    it("adminComplete reaches completeBooking with the administrator's reason and name", async () => {
      const { module, spies } = makeModule();

      const out = await handlerFor(module, "booking.adminComplete").handler(
        { bookingId: "bk-9", reason: "completed_by_timer", changedByUserId: "victim" },
        adminCtx(),
      );

      expect(out).toEqual({ bookingId: "bk-9" });
      expect(spies.completeBooking.calls).toEqual([
        { bookingId: "bk-9", reason: "completed_by_admin", changedByUserId: "u-admin" },
      ]);
    });

    it("resolveDispute reaches the command with the administrator's id, the decision and the note", async () => {
      const { module, spies } = makeModule();

      const out = await handlerFor(module, "booking.resolveDispute").handler(
        {
          bookingId: "bk-9",
          upheld: true,
          note: "  o trabalho nao foi feito  ",
          adminUserId: "victim",
        },
        adminCtx(),
      );

      expect(out).toEqual({ bookingId: "bk-9" });
      expect(spies.resolveBookingDispute.calls).toEqual([
        { bookingId: "bk-9", adminUserId: "u-admin", upheld: true, note: "o trabalho nao foi feito" },
      ]);
    });

    it("resolveDispute passes a null note when the administrator wrote none", async () => {
      const { module, spies } = makeModule();

      await handlerFor(module, "booking.resolveDispute").handler(
        { bookingId: "bk-9", upheld: false },
        adminCtx(),
      );

      expect(spies.resolveBookingDispute.calls).toEqual([
        { bookingId: "bk-9", adminUserId: "u-admin", upheld: false, note: null },
      ]);
    });

    /**
     * `CompleteBookingCommand` and `ResolveBookingDisputeCommand` hold no
     * authorisation of their own by design, and `MarkBookingDoneCommand`
     * deliberately skips membership for `marked_done_by_admin`. This edge is
     * therefore the entire security surface of all three — asserted for a
     * signed-in non-administrator and for nobody at all, on each door.
     */
    const adminFields = [
      { key: "booking.adminMarkDone", args: { bookingId: "bk-9" } },
      { key: "booking.adminComplete", args: { bookingId: "bk-9" } },
      { key: "booking.resolveDispute", args: { bookingId: "bk-9", upheld: true } },
    ] as const;

    for (const { key, args } of adminFields) {
      for (const who of [
        { name: "a customer", over: { requesterUserId: "u-cust", role: "customer" } as const },
        // The role that owns the booking's provider is still not an
        // administrator: it may mark its own booking done through
        // `booking.markDone`, and must not reach the door that skips the
        // membership check.
        {
          name: "a provider",
          over: { requesterUserId: "u-member", role: "individual_provider" } as const,
        },
        { name: "an anonymous caller", over: { requesterUserId: null, role: "customer" } as const },
      ]) {
        it(`refuses ${who.name} on ${key} before any use case runs, with code ADMIN_ONLY`, async () => {
          const { module, spies } = makeModule();

          await expect(handlerFor(module, key).handler(args, ctx(who.over))).rejects.toMatchObject({
            code: "ADMIN_ONLY",
          });

          for (const spy of Object.values(spies)) {
            expect(spy.calls).toEqual([]);
          }
        });
      }

      /**
       * The half of `requireAdmin` a role check alone would not have: a
       * context carrying `role: "admin"` with no user behind it. The context
       * schema admits that pair — `requesterUserId` is nullable and `role` is
       * required — so nothing but this clause stands between it and a command
       * that would then be handed `undefined` as the administrator's name.
       */
      it(`refuses an admin role with nobody behind it on ${key}, with code ADMIN_ONLY`, async () => {
        const { module, spies } = makeModule();

        await expect(
          handlerFor(module, key).handler(args, ctx({ requesterUserId: null, role: "admin" })),
        ).rejects.toMatchObject({ code: "ADMIN_ONLY" });

        for (const spy of Object.values(spies)) {
          expect(spy.calls).toEqual([]);
        }
      });
    }
  });
});
