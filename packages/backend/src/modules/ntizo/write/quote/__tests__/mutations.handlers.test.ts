import { describe, expect, it } from "bun:test";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import type { QuoteBootstrap } from "../../../bounded-contexts/quote/bootstrap";
import {
  createQuoteWriteHandlers,
  type QuoteWriteModule,
} from "../graphql/handlers/mutations.handlers";
import { quoteWriteSchema } from "../graphql/schema/mutations";

function ctx(overrides: Partial<NtizoGraphqlContext> = {}): NtizoGraphqlContext {
  return {
    requesterUserId: "u-cust",
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
  | "requestQuote"
  | "proposeQuote"
  | "declineQuote"
  | "rejectQuote"
  | "withdrawQuote"
  | "acceptQuote";

function makeModule(overrides: Partial<Record<SpiedUseCase, UseCaseSpy>> = {}): {
  module: QuoteWriteModule;
  spies: Record<SpiedUseCase, UseCaseSpy>;
} {
  const spies: Record<SpiedUseCase, UseCaseSpy> = {
    requestQuote:
      overrides.requestQuote ?? spyUseCase({ quoteId: "q-1", respondBy: "2026-09-09T00:00:00.000Z" }),
    proposeQuote: overrides.proposeQuote ?? spyUseCase({ quoteId: "q-1", validUntil: "2026-09-08T00:00:00.000Z" }),
    declineQuote: overrides.declineQuote ?? spyUseCase({ quoteId: "q-1" }),
    rejectQuote: overrides.rejectQuote ?? spyUseCase({ quoteId: "q-1" }),
    withdrawQuote: overrides.withdrawQuote ?? spyUseCase({ quoteId: "q-1" }),
    acceptQuote: overrides.acceptQuote ?? spyUseCase({ bookingId: "bk-1", payBy: "2026-09-08T00:00:00.000Z" }),
  };
  return {
    spies,
    module: {
      quote: { adapters: {} as never, useCases: spies },
    } as unknown as QuoteWriteModule,
  };
}

describe("the quote write schema", () => {
  it("exposes exactly the six mutations the door was built for", () => {
    const fields = Object.keys(
      (quoteWriteSchema as unknown as { fields: { quote: object } }).fields.quote,
    ).sort();
    expect(fields).toEqual(["accept", "decline", "propose", "reject", "request", "withdraw"]);
  });
});

describe("createQuoteWriteHandlers", () => {
  const handlerFor = (mod: QuoteWriteModule, key: string) => {
    const found = createQuoteWriteHandlers(mod).find((h) => h.key === key);
    if (!found) throw new Error(`no handler mounted for ${key}`);
    return found;
  };

  it("mounts a handler for every field the schema declares", () => {
    const { module } = makeModule();
    expect(
      createQuoteWriteHandlers(module)
        .map((h) => h.key)
        .sort(),
    ).toEqual([
      "quote.accept",
      "quote.decline",
      "quote.propose",
      "quote.reject",
      "quote.request",
      "quote.withdraw",
    ]);
  });

  /**
   * Every one of the six refuses a caller with no session, before any use
   * case runs — the entire security surface each field has, since every
   * further check (membership, ownership, quote state) is a database read
   * done inside the command, not here.
   */
  describe("anonymous refusal", () => {
    const fields = [
      {
        key: "quote.request",
        args: { serviceId: "svc-1", description: "precisa de limpeza", locale: "pt-MZ" },
      },
      {
        key: "quote.propose",
        args: {
          quoteId: "q-1",
          priceMinor: 50000,
          startsAt: "2026-09-10T09:00:00.000Z",
          durationMinutes: 60,
          providerMemberId: "member-1",
        },
      },
      { key: "quote.decline", args: { quoteId: "q-1", reason: "not_available" } },
      { key: "quote.reject", args: { quoteId: "q-1", reason: "too_expensive" } },
      { key: "quote.withdraw", args: { quoteId: "q-1" } },
      { key: "quote.accept", args: { quoteId: "q-1" } },
    ] as const;

    for (const { key, args } of fields) {
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

  /**
   * The one fact every handler has to get right: the actor is the session's
   * `requesterUserId`, never a name the client volunteered. Each case sends a
   * forged person-identifying field alongside the real session and asserts
   * the command only ever sees the session's id.
   */
  describe("the actor comes from the session, never from the client", () => {
    it("quote.request reaches requestQuote as the session's customer", async () => {
      const { module, spies } = makeModule();

      const out = await handlerFor(module, "quote.request").handler(
        {
          serviceId: "svc-1",
          // Trimmed by the input schema's own `.trim()` before the handler
          // ever sees it — the call below asserts the trimmed value.
          description: "  precisa de limpeza  ",
          locale: "pt-MZ",
          customerId: "someone-else",
        },
        ctx({ requesterUserId: "u-cust" }),
      );

      expect(out).toEqual({ quoteId: "q-1", respondBy: "2026-09-09T00:00:00.000Z" });
      expect(spies.requestQuote.calls).toEqual([
        {
          customerId: "u-cust",
          serviceId: "svc-1",
          description: "precisa de limpeza",
          neededBy: null,
          address: null,
          attachments: [],
          locale: "pt-MZ",
        },
      ]);
    });

    it("quote.request maps the address fields through and converts an omitted one to null", async () => {
      const { module, spies } = makeModule();
      const address = {
        label: "Casa",
        line: "Av. Julius Nyerere 812",
        city: "Maputo",
        district: "Sommerschield",
        directions: null,
        lat: null,
        lng: null,
      };

      await handlerFor(module, "quote.request").handler(
        { serviceId: "svc-1", description: "x", locale: "pt-MZ", address },
        ctx({ requesterUserId: "u-cust" }),
      );

      expect((spies.requestQuote.calls[0] as { address: unknown }).address).toEqual(address);
    });

    it("quote.propose reaches proposeQuote as the session's member, with the requested member as a separate field", async () => {
      const { module, spies } = makeModule();

      await handlerFor(module, "quote.propose").handler(
        {
          quoteId: "q-1",
          priceMinor: 50000,
          startsAt: "2026-09-10T09:00:00.000Z",
          durationMinutes: 60,
          providerMemberId: "member-colleague",
          requesterUserId: "someone-else",
        },
        ctx({ requesterUserId: "u-member", role: "individual_provider" }),
      );

      expect(spies.proposeQuote.calls).toEqual([
        {
          quoteId: "q-1",
          requesterUserId: "u-member",
          priceMinor: 50000,
          startsAt: new Date("2026-09-10T09:00:00.000Z"),
          durationMinutes: 60,
          providerMemberId: "member-colleague",
          note: null,
          attachments: [],
        },
      ]);
    });

    /**
     * `ProposeQuoteCommand.execute` answers `null` when the compare-and-swap
     * lost — a colleague's proposal already landed. That is not a failure:
     * the handler answers with the quote id and a null validity rather than
     * throwing or fabricating a deadline for a proposal that never went
     * live.
     */
    it("quote.propose answers a lost race with the quote id and a null validUntil, not an error", async () => {
      const { module, spies } = makeModule({ proposeQuote: spyUseCase(null) });

      const out = await handlerFor(module, "quote.propose").handler(
        {
          quoteId: "q-9",
          priceMinor: 50000,
          startsAt: "2026-09-10T09:00:00.000Z",
          durationMinutes: 60,
          providerMemberId: "member-1",
        },
        ctx({ requesterUserId: "u-member", role: "individual_provider" }),
      );

      expect(out).toEqual({ quoteId: "q-9", validUntil: null });
      expect(spies.proposeQuote.calls.length).toBe(1);
    });

    it("quote.decline reaches declineQuote as the session's member, never the client's claim", async () => {
      const { module, spies } = makeModule();

      const out = await handlerFor(module, "quote.decline").handler(
        { quoteId: "q-1", reason: "outside_area", requesterUserId: "someone-else" },
        ctx({ requesterUserId: "u-member", role: "individual_provider" }),
      );

      expect(out).toEqual({ quoteId: "q-1" });
      expect(spies.declineQuote.calls).toEqual([
        { quoteId: "q-1", requesterUserId: "u-member", reason: "outside_area", note: null, attachments: [] },
      ]);
    });

    it("quote.reject reaches rejectQuote as the session's customer", async () => {
      const { module, spies } = makeModule();

      const out = await handlerFor(module, "quote.reject").handler(
        { quoteId: "q-1", reason: "too_expensive", customerId: "someone-else" },
        ctx({ requesterUserId: "u-cust" }),
      );

      expect(out).toEqual({ quoteId: "q-1" });
      expect(spies.rejectQuote.calls).toEqual([
        { quoteId: "q-1", requesterUserId: "u-cust", reason: "too_expensive", note: null, attachments: [] },
      ]);
    });

    it("quote.withdraw reaches withdrawQuote as the session's customer", async () => {
      const { module, spies } = makeModule();

      const out = await handlerFor(module, "quote.withdraw").handler(
        { quoteId: "q-1", customerId: "someone-else" },
        ctx({ requesterUserId: "u-cust" }),
      );

      expect(out).toEqual({ quoteId: "q-1" });
      expect(spies.withdrawQuote.calls).toEqual([
        { quoteId: "q-1", requesterUserId: "u-cust", note: null, attachments: [] },
      ]);
    });

    it("quote.accept reaches acceptQuote as the session's customer, and maps the address when supplied", async () => {
      const { module, spies } = makeModule();
      const address = {
        label: "Casa",
        line: "Av. Julius Nyerere 812",
        city: "Maputo",
        district: null,
        directions: null,
        lat: null,
        lng: null,
      };

      const out = await handlerFor(module, "quote.accept").handler(
        { quoteId: "q-1", address, requesterUserId: "someone-else" },
        ctx({ requesterUserId: "u-cust" }),
      );

      expect(out).toEqual({ bookingId: "bk-1", payBy: "2026-09-08T00:00:00.000Z" });
      expect(spies.acceptQuote.calls).toEqual([
        { quoteId: "q-1", requesterUserId: "u-cust", address },
      ]);
    });

    it("quote.accept passes a null address when the client sends none", async () => {
      const { module, spies } = makeModule();

      await handlerFor(module, "quote.accept").handler(
        { quoteId: "q-1" },
        ctx({ requesterUserId: "u-cust" }),
      );

      expect(spies.acceptQuote.calls).toEqual([{ quoteId: "q-1", requesterUserId: "u-cust", address: null }]);
    });
  });

  /**
   * `declineQuote`, `rejectQuote` and `withdrawQuote` can lose the very same
   * compare-and-swap `proposeQuote` can — `closeQuote`'s save returns `null`
   * when the quote already moved. Their output has no second field to signal
   * it on, and losing the race there means the quote is already closed,
   * which is the caller's own intended end-state either way — so the handler
   * answers with the id regardless of whether this call was the one that
   * actually wrote it.
   */
  describe("a lost close race answers with the id, not an error", () => {
    it("quote.decline", async () => {
      const { module } = makeModule({ declineQuote: spyUseCase(null) });
      const out = await handlerFor(module, "quote.decline").handler(
        { quoteId: "q-1", reason: "not_available" },
        ctx({ requesterUserId: "u-member", role: "individual_provider" }),
      );
      expect(out).toEqual({ quoteId: "q-1" });
    });

    it("quote.reject", async () => {
      const { module } = makeModule({ rejectQuote: spyUseCase(null) });
      const out = await handlerFor(module, "quote.reject").handler(
        { quoteId: "q-1", reason: "wrong_time" },
        ctx({ requesterUserId: "u-cust" }),
      );
      expect(out).toEqual({ quoteId: "q-1" });
    });

    it("quote.withdraw", async () => {
      const { module } = makeModule({ withdrawQuote: spyUseCase(null) });
      const out = await handlerFor(module, "quote.withdraw").handler(
        { quoteId: "q-1" },
        ctx({ requesterUserId: "u-cust" }),
      );
      expect(out).toEqual({ quoteId: "q-1" });
    });
  });
});
