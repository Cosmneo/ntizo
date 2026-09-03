import { describe, expect, it } from "bun:test";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import type { CommunicationBootstrap } from "../../../bounded-contexts/communication/bootstrap";
import {
  createSupportWriteHandlers,
  type SupportWriteModule,
} from "../graphql/handlers/mutations.handlers";
import { supportWriteSchema, reply, resolve, markRead } from "../graphql/schema/mutations";

function ctx(overrides: Partial<NtizoGraphqlContext> = {}): NtizoGraphqlContext {
  return {
    requesterUserId: "u-admin",
    email: null,
    firstName: null,
    lastName: null,
    role: "admin",
    requestId: null,
    ipAddress: null,
    userAgent: null,
    ...overrides,
  };
}

/** Every call (and the exact args it ran with) is recorded, not just the outcome. */
function spyUseCase(result: unknown | ((input: unknown) => unknown)) {
  const calls: unknown[] = [];
  return {
    calls,
    execute: async (input: unknown): Promise<unknown> => {
      calls.push(input);
      return typeof result === "function" ? (result as (input: unknown) => unknown)(input) : result;
    },
  };
}

type UseCaseSpy = ReturnType<typeof spyUseCase>;

function makeModule(overrides: {
  replyToSupportRequest?: UseCaseSpy;
  resolveSupportRequest?: UseCaseSpy;
  markSupportRequestRead?: UseCaseSpy;
}): SupportWriteModule {
  return {
    communication: {
      adapters: {} as never,
      useCases: {
        replyToSupportRequest: overrides.replyToSupportRequest ?? spyUseCase({ id: "m1" }),
        resolveSupportRequest:
          overrides.resolveSupportRequest ?? spyUseCase({ threadId: "t1", status: "resolved" }),
        markSupportRequestRead: overrides.markSupportRequestRead ?? spyUseCase({ marked: 0 }),
      },
    } as unknown as CommunicationBootstrap,
  };
}

describe("the support write schema", () => {
  it("exposes exactly three mutations", () => {
    const fields = Object.keys(
      (supportWriteSchema as unknown as { fields: { support: object } }).fields.support,
    ).sort();
    expect(fields).toEqual(["markRead", "reply", "resolve"]);
  });

  it("takes no admin id on any input schema — the session is the answer", () => {
    const shapeKeys = (field: { input: unknown }): string[] => {
      const adapter = field.input as { _schema?: { shape?: Record<string, unknown> } };
      return Object.keys(adapter._schema?.shape ?? {}).sort();
    };

    expect(shapeKeys(reply)).toEqual(["attachments", "body", "threadId"]);
    expect(shapeKeys(resolve)).toEqual(["threadId"]);
    expect(shapeKeys(markRead)).toEqual(["threadId"]);
  });
});

describe("createSupportWriteHandlers", () => {
  it("builds exactly the three fields", () => {
    const handlers = createSupportWriteHandlers(makeModule({}));
    expect(handlers.map((h) => h.key).sort()).toEqual([
      "support.markRead",
      "support.reply",
      "support.resolve",
    ]);
  });

  describe("non-admin refusal", () => {
    const fields = [
      { key: "support.reply", args: { threadId: "t1", body: "oi" } },
      { key: "support.resolve", args: { threadId: "t1" } },
      { key: "support.markRead", args: { threadId: "t1" } },
    ] as const;

    for (const { key, args } of fields) {
      it(`refuses a customer on ${key} before any use case runs, with code ADMIN_ONLY`, async () => {
        const replySpy = spyUseCase({ id: "m1" });
        const resolveSpy = spyUseCase({ threadId: "t1", status: "resolved" });
        const markReadSpy = spyUseCase({ marked: 0 });
        const handlers = createSupportWriteHandlers(
          makeModule({
            replyToSupportRequest: replySpy,
            resolveSupportRequest: resolveSpy,
            markSupportRequestRead: markReadSpy,
          }),
        );
        const field = handlers.find((h) => h.key === key)!;

        await expect(
          field.handler(args, ctx({ requesterUserId: "u-customer", role: "customer" })),
        ).rejects.toMatchObject({ code: "ADMIN_ONLY" });

        expect(replySpy.calls).toEqual([]);
        expect(resolveSpy.calls).toEqual([]);
        expect(markReadSpy.calls).toEqual([]);
      });

      it(`refuses an anonymous caller on ${key} before any use case runs, with code ADMIN_ONLY`, async () => {
        const replySpy = spyUseCase({ id: "m1" });
        const resolveSpy = spyUseCase({ threadId: "t1", status: "resolved" });
        const markReadSpy = spyUseCase({ marked: 0 });
        const handlers = createSupportWriteHandlers(
          makeModule({
            replyToSupportRequest: replySpy,
            resolveSupportRequest: resolveSpy,
            markSupportRequestRead: markReadSpy,
          }),
        );
        const field = handlers.find((h) => h.key === key)!;

        await expect(
          field.handler(args, ctx({ requesterUserId: null })),
        ).rejects.toMatchObject({ code: "ADMIN_ONLY" });

        expect(replySpy.calls).toEqual([]);
        expect(resolveSpy.calls).toEqual([]);
        expect(markReadSpy.calls).toEqual([]);
      });
    }
  });

  it("reply reaches replyToSupportRequest with the admin's id, never from the input", async () => {
    const replySpy = spyUseCase({ id: "m1" });
    const handlers = createSupportWriteHandlers(makeModule({ replyToSupportRequest: replySpy }));
    const field = handlers.find((h) => h.key === "support.reply")!;
    const attachments = [{ storageKey: "attachment/u-admin/one.png" }];

    const out = await field.handler(
      { threadId: "t1", body: "resposta", attachments, adminUserId: "victim" },
      ctx({ requesterUserId: "u-admin" }),
    );

    expect(out).toEqual({ id: "m1" });
    expect(replySpy.calls).toEqual([
      { threadId: "t1", adminUserId: "u-admin", body: "resposta", attachments },
    ]);
  });

  it("resolve reaches resolveSupportRequest with the admin's id", async () => {
    const resolveSpy = spyUseCase({ threadId: "t1", status: "resolved" });
    const handlers = createSupportWriteHandlers(makeModule({ resolveSupportRequest: resolveSpy }));
    const field = handlers.find((h) => h.key === "support.resolve")!;

    const out = await field.handler({ threadId: "t1" }, ctx({ requesterUserId: "u-admin" }));

    expect(out).toEqual({ threadId: "t1", status: "resolved" });
    expect(resolveSpy.calls).toEqual([{ threadId: "t1", adminUserId: "u-admin" }]);
  });

  it("markRead reaches markSupportRequestRead without an adminUserId", async () => {
    const markReadSpy = spyUseCase({ marked: 3 });
    const handlers = createSupportWriteHandlers(makeModule({ markSupportRequestRead: markReadSpy }));
    const field = handlers.find((h) => h.key === "support.markRead")!;

    const out = await field.handler({ threadId: "t1" }, ctx({ requesterUserId: "u-admin" }));

    expect(out).toEqual({ marked: 3 });
    expect(markReadSpy.calls).toEqual([{ threadId: "t1" }]);
  });
});
