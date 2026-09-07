/**
 * The five quote read fields, driven through the kit's own built handlers —
 * so the input schema, the output schema and the guard all run exactly as
 * they do in a request.
 *
 * The repository test beside this one proves the `WHERE` clauses; this one
 * proves the *wiring* above them, which no database can. Two failures live
 * here and nowhere else:
 *
 * - A customer-side field that read an id out of `args` instead of the
 *   session would be the endpoint that reads anybody's quotes. The schema has
 *   no such field, so the assertion is that the id the projection receives is
 *   the session's.
 * - A provider-side field that forgot `assertMayReadWorkspace` would answer a
 *   stranger. The repository's own `provider_id` predicate would still keep
 *   them from reading a *quote*, but `countsForProvider` would happily tell
 *   them how much work another workspace has — and nothing else in the stack
 *   catches that. Each of the three asserts the refusal happens **before the
 *   projection runs**.
 *
 * `assertMayReadWorkspace` itself is the booking read side's, and is tested
 * there — see `read/booking/__tests__/queries.handlers.test.ts`. What is
 * tested here is that this context calls it, on every field that needs it.
 */
import { describe, expect, it } from "bun:test";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import { createQuoteReadHandlers, type QuoteReadModule } from "../graphql/handlers/queries.handlers";
import { quoteReadSchema } from "../graphql/schema/queries";

function ctx(over: Partial<NtizoGraphqlContext> = {}): NtizoGraphqlContext {
  return {
    requesterUserId: "u-session",
    email: null,
    firstName: null,
    lastName: null,
    role: "customer",
    requestId: null,
    ipAddress: null,
    userAgent: null,
    ...over,
  };
}

const memberOf = (pairs: string[]) => ({
  isMember: async (providerId: string, userId: string) => pairs.includes(`${providerId}:${userId}`),
});

function spy(result: unknown) {
  const calls: unknown[] = [];
  return {
    calls,
    execute: async (input: unknown): Promise<unknown> => {
      calls.push(input);
      return result;
    },
  };
}

/** Empty answers in exactly the shapes the fields' own output schemas validate. */
const EMPTY_CUSTOMER_PAGE = { items: [], counts: { open: 0, history: 0 }, hasMore: false };
const EMPTY_PROVIDER_PAGE = {
  items: [],
  counts: { toAnswer: 0, waiting: 0, history: 0 },
  hasMore: false,
};

function makeModule(members: string[] = ["p1:u-session"]) {
  const listMine = spy(EMPTY_CUSTOMER_PAGE);
  const getMine = spy(null);
  const listForProvider = spy(EMPTY_PROVIDER_PAGE);
  const getForProvider = spy(null);
  const countsForProvider = spy({ toAnswer: 0 });

  return {
    listMine,
    getMine,
    listForProvider,
    getForProvider,
    countsForProvider,
    module: {
      quoteRead: {
        adapters: {},
        useCases: {
          listMine,
          getMine,
          listForProvider,
          getForProvider,
          countsForProvider,
          providerRead: memberOf(members),
        },
      },
    } as unknown as QuoteReadModule,
  };
}

function handlerFor(mod: QuoteReadModule, key: string) {
  const found = createQuoteReadHandlers(mod).find((h) => h.key === key);
  if (!found) throw new Error(`no handler mounted for ${key}`);
  return found;
}

describe("quoteReadSchema", () => {
  it("mounts the customer's two reads beside the workspace's three", () => {
    expect(Object.keys(quoteReadSchema.fields.quote).sort()).toEqual([
      "byId",
      "byIdForProvider",
      "countsForProvider",
      "forProvider",
      "mine",
    ]);
  });
});

describe("the customer's own reads take the actor from the session", () => {
  it("stamps `customerId` from the session and defaults the page to the first twenty", async () => {
    const { module, listMine } = makeModule();
    const out = await handlerFor(module, "quote.mine").handler({ tab: "open" }, ctx());

    expect(out).toEqual(EMPTY_CUSTOMER_PAGE);
    expect(listMine.calls).toEqual([{ customerId: "u-session", tab: "open", limit: 20, offset: 0 }]);
  });

  it("passes a page the caller asked for through unchanged", async () => {
    const { module, listMine } = makeModule();
    await handlerFor(module, "quote.mine").handler({ tab: "history", limit: 5, offset: 10 }, ctx());
    expect(listMine.calls[0]).toMatchObject({ tab: "history", limit: 5, offset: 10 });
  });

  it("the detail read takes the quote's id from the caller and the customer's from the session", async () => {
    const { module, getMine } = makeModule();
    const out = await handlerFor(module, "quote.byId").handler({ quoteId: "q1" }, ctx({ requesterUserId: "u-ana" }));

    expect(out).toBeNull();
    expect(getMine.calls).toEqual([{ quoteId: "q1", customerId: "u-ana" }]);
  });

  for (const key of ["quote.mine", "quote.byId"]) {
    it(`${key} refuses an anonymous caller with UNAUTHENTICATED, before the projection runs`, async () => {
      const { module, listMine, getMine } = makeModule();
      const input = key === "quote.mine" ? { tab: "open" } : { quoteId: "q1" };

      await expect(
        handlerFor(module, key).handler(input, ctx({ requesterUserId: null })),
      ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

      expect(listMine.calls).toEqual([]);
      expect(getMine.calls).toEqual([]);
    });
  }
});

describe("every workspace read is gated before it runs", () => {
  const fields = [
    { key: "quote.forProvider", input: { providerId: "p1", tab: "toAnswer" }, spy: "listForProvider" },
    { key: "quote.byIdForProvider", input: { providerId: "p1", quoteId: "q1" }, spy: "getForProvider" },
    { key: "quote.countsForProvider", input: { providerId: "p1" }, spy: "countsForProvider" },
  ] as const;

  for (const field of fields) {
    it(`${field.key} refuses a signed-in stranger with NOT_PROVIDER_MEMBER, before the projection runs`, async () => {
      const made = makeModule(["p2:u-session"]);

      await expect(
        handlerFor(made.module, field.key).handler(field.input, ctx()),
      ).rejects.toMatchObject({ code: "NOT_PROVIDER_MEMBER" });

      expect(made[field.spy].calls).toEqual([]);
    });

    it(`${field.key} refuses an anonymous caller with UNAUTHENTICATED, before the projection runs`, async () => {
      const made = makeModule();

      await expect(
        handlerFor(made.module, field.key).handler(field.input, ctx({ requesterUserId: null })),
      ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

      expect(made[field.spy].calls).toEqual([]);
    });

    it(`${field.key} admits a member of the workspace`, async () => {
      const made = makeModule(["p1:u-session"]);
      await handlerFor(made.module, field.key).handler(field.input, ctx());
      expect(made[field.spy].calls).toHaveLength(1);
    });

    it(`${field.key} admits an administrator without asking about membership`, async () => {
      const made = makeModule([]);
      await handlerFor(made.module, field.key).handler(field.input, ctx({ role: "admin" }));
      expect(made[field.spy].calls).toHaveLength(1);
    });
  }

  it("the list passes the workspace, the tab and the page through, defaulting the page", async () => {
    const { module, listForProvider } = makeModule();
    await handlerFor(module, "quote.forProvider").handler({ providerId: "p1", tab: "waiting" }, ctx());
    expect(listForProvider.calls).toEqual([
      { providerId: "p1", tab: "waiting", limit: 20, offset: 0 },
    ]);
  });

  it("the badge read asks for one workspace and nothing else", async () => {
    const { module, countsForProvider } = makeModule();
    const out = await handlerFor(module, "quote.countsForProvider").handler({ providerId: "p1" }, ctx());
    expect(out).toEqual({ toAnswer: 0 });
    expect(countsForProvider.calls).toEqual([{ providerId: "p1" }]);
  });
});
