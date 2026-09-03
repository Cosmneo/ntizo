import { describe, expect, it } from "bun:test";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import type { MessagePageDTO, SupportRequestPageDTO, SupportRequestSummaryDTO } from "@ntizo/shared/read-models";
import { createSupportReadHandlers, type SupportReadModule } from "../graphql/handlers/queries.handlers";
import type { SupportReadBootstrap } from "../bootstrap";
import { supportReadSchema } from "../graphql/schema/queries";

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

const emptySupportPage: SupportRequestPageDTO = { items: [], nextCursor: null };
const emptyMessagePage: MessagePageDTO = { items: [], nextCursor: null };
const summary: SupportRequestSummaryDTO = {
  threadId: "t1",
  audience: "customer",
  subject: "Reembolso",
  status: "open",
  requesterUserId: "u1",
  requesterName: "Ana",
  providerId: null,
  providerName: "",
  bookingId: null,
  lastMessageAt: "2026-08-20T09:00:00.000Z",
  lastMessagePreview: "",
  unreadForAdmin: 0,
  createdAt: "2026-08-20T09:00:00.000Z",
  resolvedAt: null,
};

/** Every call (and the exact args it ran with) is recorded, not just the outcome. */
function spyUseCase<TInput, TOutput>(output: TOutput) {
  const calls: TInput[] = [];
  return {
    calls,
    execute: async (input: TInput): Promise<TOutput> => {
      calls.push(input);
      return output;
    },
  };
}

function makeModule(overrides: {
  listSupportRequests?: { execute: (input: unknown) => Promise<SupportRequestPageDTO> };
  getSupportRequest?: { execute: (input: unknown) => Promise<SupportRequestSummaryDTO> };
  listSupportRequestMessages?: { execute: (input: unknown) => Promise<MessagePageDTO> };
  countOpenSupportRequests?: { execute: (input?: unknown) => Promise<{ count: number }> };
}): SupportReadModule {
  return {
    supportRead: {
      adapters: {} as never,
      useCases: {
        listSupportRequests: overrides.listSupportRequests ?? spyUseCase(emptySupportPage),
        getSupportRequest: overrides.getSupportRequest ?? spyUseCase(summary),
        listSupportRequestMessages: overrides.listSupportRequestMessages ?? spyUseCase(emptyMessagePage),
        countOpenSupportRequests: overrides.countOpenSupportRequests ?? spyUseCase({ count: 0 }),
      },
    } as unknown as SupportReadBootstrap,
  };
}

describe("the support read schema", () => {
  it("exposes exactly the four fields the admin dashboard needs, and no more", () => {
    const fields = Object.keys(
      (supportReadSchema as unknown as { fields: { support: object } }).fields.support,
    ).sort();
    expect(fields).toEqual(["openCount", "request", "requestMessages", "requests"]);
  });
});

describe("createSupportReadHandlers", () => {
  it("builds exactly the four fields", () => {
    const handlers = createSupportReadHandlers(makeModule({}));
    expect(handlers.map((h) => h.key).sort()).toEqual([
      "support.openCount",
      "support.request",
      "support.requestMessages",
      "support.requests",
    ]);
  });

  /**
   * Every field here answers an administrator's question, never a
   * participant's — the context defaults an anonymous caller's role to
   * `customer`, so a role check alone would be reading a value chosen for
   * the absence of a user rather than asserted about one. Both a real
   * `role: "customer"` caller and an anonymous one must be refused, with the
   * SAME code — `ADMIN_ONLY` — before any use case runs.
   */
  describe("admin-only refusal", () => {
    const fields = [
      { key: "support.requests", args: {} },
      { key: "support.request", args: { threadId: "t1" } },
      { key: "support.requestMessages", args: { threadId: "t1" } },
      { key: "support.openCount", args: {} },
    ] as const;

    for (const { key, args } of fields) {
      it(`refuses role: "customer" on ${key}, with code ADMIN_ONLY, before any use case runs`, async () => {
        const listSupportRequests = spyUseCase(emptySupportPage);
        const getSupportRequest = spyUseCase(summary);
        const listSupportRequestMessages = spyUseCase(emptyMessagePage);
        const countOpenSupportRequests = spyUseCase({ count: 0 });
        const handlers = createSupportReadHandlers(
          makeModule({ listSupportRequests, getSupportRequest, listSupportRequestMessages, countOpenSupportRequests }),
        );
        const field = handlers.find((h) => h.key === key)!;

        await expect(
          field.handler(args, ctx({ requesterUserId: "u-customer", role: "customer" })),
        ).rejects.toMatchObject({ code: "ADMIN_ONLY" });

        expect(listSupportRequests.calls).toEqual([]);
        expect(getSupportRequest.calls).toEqual([]);
        expect(listSupportRequestMessages.calls).toEqual([]);
        expect(countOpenSupportRequests.calls).toEqual([]);
      });

      it(`refuses an anonymous caller on ${key}, with code ADMIN_ONLY, before any use case runs`, async () => {
        const listSupportRequests = spyUseCase(emptySupportPage);
        const getSupportRequest = spyUseCase(summary);
        const listSupportRequestMessages = spyUseCase(emptyMessagePage);
        const countOpenSupportRequests = spyUseCase({ count: 0 });
        const handlers = createSupportReadHandlers(
          makeModule({ listSupportRequests, getSupportRequest, listSupportRequestMessages, countOpenSupportRequests }),
        );
        const field = handlers.find((h) => h.key === key)!;

        // The context defaults an anonymous caller's role to "customer" —
        // asserted explicitly here rather than relied upon, so this test
        // still proves something the moment that default ever changes.
        await expect(
          field.handler(args, ctx({ requesterUserId: null, role: "customer" })),
        ).rejects.toMatchObject({ code: "ADMIN_ONLY" });

        expect(listSupportRequests.calls).toEqual([]);
        expect(getSupportRequest.calls).toEqual([]);
        expect(listSupportRequestMessages.calls).toEqual([]);
        expect(countOpenSupportRequests.calls).toEqual([]);
      });
    }
  });

  it("support.requests reaches the use case with the input passed through, for an admin caller", async () => {
    const listSupportRequests = spyUseCase(emptySupportPage);
    const handlers = createSupportReadHandlers(makeModule({ listSupportRequests }));
    const field = handlers.find((h) => h.key === "support.requests")!;

    await field.handler(
      { status: "open", audience: "provider", limit: 10, cursor: "c1" },
      ctx({ requesterUserId: "u-admin", role: "admin" }),
    );

    expect(listSupportRequests.calls).toEqual([{ status: "open", audience: "provider", limit: 10, cursor: "c1" }]);
  });

  it("support.request reaches the use case with the input passed through, for an admin caller", async () => {
    const getSupportRequest = spyUseCase(summary);
    const handlers = createSupportReadHandlers(makeModule({ getSupportRequest }));
    const field = handlers.find((h) => h.key === "support.request")!;

    await field.handler({ threadId: "t1" }, ctx({ requesterUserId: "u-admin", role: "admin" }));

    expect(getSupportRequest.calls).toEqual([{ threadId: "t1" }]);
  });

  it("support.requestMessages reaches the use case with the input passed through, for an admin caller", async () => {
    const listSupportRequestMessages = spyUseCase(emptyMessagePage);
    const handlers = createSupportReadHandlers(makeModule({ listSupportRequestMessages }));
    const field = handlers.find((h) => h.key === "support.requestMessages")!;

    await field.handler({ threadId: "t1", limit: 5, cursor: "m9" }, ctx({ requesterUserId: "u-admin", role: "admin" }));

    expect(listSupportRequestMessages.calls).toEqual([{ threadId: "t1", limit: 5, cursor: "m9" }]);
  });

  it("support.openCount reaches the use case, for an admin caller", async () => {
    const countOpenSupportRequests = spyUseCase({ count: 3 });
    const handlers = createSupportReadHandlers(makeModule({ countOpenSupportRequests }));
    const field = handlers.find((h) => h.key === "support.openCount")!;

    const result = await field.handler({}, ctx({ requesterUserId: "u-admin", role: "admin" }));

    expect(countOpenSupportRequests.calls).toHaveLength(1);
    expect(result).toEqual({ count: 3 });
  });
});
