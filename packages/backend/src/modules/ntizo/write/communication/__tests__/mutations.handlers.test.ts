import { describe, expect, it } from "bun:test";
import { getGraphQLErrorCode } from "@cosmneo/onion-lasagna";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import type { CommunicationBootstrap } from "../../../bounded-contexts/communication/bootstrap";
import {
  ThreadNotVisibleError,
  ProviderNotContactableError,
} from "../../../bounded-contexts/communication/domain/exceptions";
import {
  createCommunicationWriteHandlers,
  type CommunicationWriteModule,
} from "../graphql/handlers/mutations.handlers";
import {
  communicationWriteSchema,
  startThread,
  send,
  markRead,
  openSupportRequest,
} from "../graphql/schema/mutations";

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
  startThread?: UseCaseSpy;
  sendMessage?: UseCaseSpy;
  markThreadRead?: UseCaseSpy;
  openSupportRequest?: UseCaseSpy;
  replyToSupportRequest?: UseCaseSpy;
  resolveSupportRequest?: UseCaseSpy;
  markSupportRequestRead?: UseCaseSpy;
}): CommunicationWriteModule {
  return {
    communication: {
      adapters: {} as never,
      useCases: {
        startThread: overrides.startThread ?? spyUseCase({ id: "t1", created: false }),
        sendMessage: overrides.sendMessage ?? spyUseCase({ id: "m1" }),
        markThreadRead: overrides.markThreadRead ?? spyUseCase({ marked: 0 }),
        openSupportRequest: overrides.openSupportRequest ?? spyUseCase({ threadId: "t1" }),
        replyToSupportRequest: overrides.replyToSupportRequest ?? spyUseCase({ id: "m1" }),
        resolveSupportRequest:
          overrides.resolveSupportRequest ?? spyUseCase({ threadId: "t1", status: "resolved" }),
        markSupportRequestRead: overrides.markSupportRequestRead ?? spyUseCase({ marked: 0 }),
        internal: {
          notifyUnread: {
            execute: async () => {
              throw new Error("not reachable from a GraphQL mutation");
            },
          },
        },
      },
    } as unknown as CommunicationBootstrap,
  };
}

describe("the communication write schema", () => {
  it("exposes exactly four mutations", () => {
    const fields = Object.keys(
      (communicationWriteSchema as unknown as { fields: { communication: object } }).fields
        .communication,
    ).sort();
    expect(fields).toEqual(["markRead", "openSupportRequest", "send", "startThread"]);
  });

  /**
   * Checked against the parsed zod shape's key set, not by slicing source
   * text — same reasoning `read/communication`'s equivalent test gives.
   * None declares a way to name a different subject: `customerUserId`,
   * `senderUserId`, and `viewerUserId` all come from the session, never the
   * wire.
   */
  it("takes no user id on any input schema — the session is the answer", () => {
    const shapeKeys = (field: { input: unknown }): string[] => {
      const adapter = field.input as { _schema?: { shape?: Record<string, unknown> } };
      return Object.keys(adapter._schema?.shape ?? {}).sort();
    };

    expect(shapeKeys(startThread)).toEqual(["providerId"]);
    expect(shapeKeys(send)).toEqual(["attachments", "body", "threadId"]);
    expect(shapeKeys(markRead)).toEqual(["threadId"]);
    expect(shapeKeys(openSupportRequest)).toEqual([
      "attachments",
      "audience",
      "body",
      "bookingId",
      "providerId",
      "subject",
    ]);
  });
});

describe("createCommunicationWriteHandlers", () => {
  it("builds exactly the four fields", () => {
    const handlers = createCommunicationWriteHandlers(makeModule({}));
    expect(handlers.map((h) => h.key).sort()).toEqual([
      "communication.markRead",
      "communication.openSupportRequest",
      "communication.send",
      "communication.startThread",
    ]);
  });

  /**
   * Every field is a fully-authenticated write, so `requireUser` runs first
   * on all three, before any use case is touched — same property
   * `read/communication`'s equivalent test proves for the read side.
   */
  describe("anonymous caller refusal", () => {
    const fields = [
      { key: "communication.startThread", args: { providerId: "p1" } },
      { key: "communication.send", args: { threadId: "t1", body: "oi" } },
      { key: "communication.markRead", args: { threadId: "t1" } },
    ] as const;

    for (const { key, args } of fields) {
      it(`refuses an anonymous caller on ${key} before any use case runs, with wire code FORBIDDEN`, async () => {
        const startThreadSpy = spyUseCase({ id: "t1", created: false });
        const sendSpy = spyUseCase({ id: "m1" });
        const markReadSpy = spyUseCase({ marked: 0 });
        const handlers = createCommunicationWriteHandlers(
          makeModule({
            startThread: startThreadSpy,
            sendMessage: sendSpy,
            markThreadRead: markReadSpy,
          }),
        );
        const field = handlers.find((h) => h.key === key)!;

        let caught: unknown;
        try {
          await field.handler(args, ctx({ requesterUserId: null }));
        } catch (err) {
          caught = err;
        }
        // Asserts the wire CODE the kit emits, not `instanceof` — an
        // `instanceof` check stays green even if the emitted code silently
        // dropped to INTERNAL_ERROR. `ForbiddenError` always flattens to
        // "FORBIDDEN" on the wire regardless of the `code` string it was
        // constructed with (`getGraphQLErrorCode` — the `code` we passed,
        // "UNAUTHENTICATED", survives only as `originalCode`).
        expect(getGraphQLErrorCode(caught)).toBe("FORBIDDEN");

        expect(startThreadSpy.calls).toEqual([]);
        expect(sendSpy.calls).toEqual([]);
        expect(markReadSpy.calls).toEqual([]);
      });
    }
  });

  /**
   * `startThread` is idempotent — the repository resolves it as an upsert,
   * so calling it twice for the same pair returns the same thread. This
   * proves the handler passes that straight through: it stamps
   * `customerUserId` from the session identically both times and forwards
   * whatever the use case answers without touching it.
   */
  it("startThread returns the same thread the second time", async () => {
    const existing = { id: "thread-1", created: false };
    const startThreadSpy = spyUseCase(() => existing);
    const handlers = createCommunicationWriteHandlers(makeModule({ startThread: startThreadSpy }));
    const field = handlers.find((h) => h.key === "communication.startThread")!;

    const a = (await field.handler({ providerId: "p1" }, ctx())) as { id: string };
    const b = (await field.handler({ providerId: "p1" }, ctx())) as { id: string };

    expect(b.id).toBe(a.id);
    expect(startThreadSpy.calls).toEqual([
      { customerUserId: "u-session", providerId: "p1" },
      { customerUserId: "u-session", providerId: "p1" },
    ]);
  });

  it("startThread takes providerId from validated args but customerUserId only from the session", async () => {
    const startThreadSpy = spyUseCase({ id: "t1", created: true });
    const handlers = createCommunicationWriteHandlers(makeModule({ startThread: startThreadSpy }));
    const field = handlers.find((h) => h.key === "communication.startThread")!;

    const hostileArgs = { providerId: "p1", customerUserId: "victim" };
    await field.handler(hostileArgs, ctx({ requesterUserId: "u-session" }));

    expect(startThreadSpy.calls).toEqual([{ customerUserId: "u-session", providerId: "p1" }]);
  });

  /**
   * The boundary the client actually talks to is the built field's
   * `.handler`, not the command directly — a regression could leave a
   * handler reading an id off `args.raw` (or some other unvalidated spot)
   * while the command's own tests stay fully green. `field.handler` receives
   * RAW, pre-validation args the same way `read/communication`'s and
   * `write/notification`'s equivalent tests exercise it, so a flat object
   * carrying an attacker id under an unrelated key is exactly what a real
   * malicious request would send. zod strips that unrelated key out of
   * `args.input`; the handler never reads `args.raw` at all.
   */
  it("send takes the sender from the session, never from the input", async () => {
    const sendSpy = spyUseCase({ id: "m1" });
    const handlers = createCommunicationWriteHandlers(makeModule({ sendMessage: sendSpy }));
    const field = handlers.find((h) => h.key === "communication.send")!;

    const hostileArgs = { threadId: "t1", body: "olá", senderUserId: "victim" };
    await field.handler(hostileArgs, ctx({ requesterUserId: "u-session" }));

    expect(sendSpy.calls).toEqual([{ threadId: "t1", senderUserId: "u-session", body: "olá" }]);
  });

  it("markRead takes the viewer from the session, never from the input", async () => {
    const markReadSpy = spyUseCase({ marked: 2 });
    const handlers = createCommunicationWriteHandlers(makeModule({ markThreadRead: markReadSpy }));
    const field = handlers.find((h) => h.key === "communication.markRead")!;

    const hostileArgs = { threadId: "t1", viewerUserId: "victim" };
    await field.handler(hostileArgs, ctx({ requesterUserId: "u-session" }));

    expect(markReadSpy.calls).toEqual([{ threadId: "t1", viewerUserId: "u-session" }]);
  });

  /**
   * A second session sends only as itself, never as the first session — no
   * argument names who the sender is, so this drives the built handler with
   * two different sessions back to back and confirms the sender id sent to
   * the command tracks the session, never the previous call.
   */
  it("a second caller's session sends only as that caller, never the first caller's", async () => {
    const sendSpy = spyUseCase({ id: "m1" });
    const handlers = createCommunicationWriteHandlers(makeModule({ sendMessage: sendSpy }));
    const field = handlers.find((h) => h.key === "communication.send")!;

    await field.handler({ threadId: "t1", body: "oi" }, ctx({ requesterUserId: "user-a" }));
    await field.handler({ threadId: "t1", body: "oi" }, ctx({ requesterUserId: "user-b" }));

    expect(sendSpy.calls).toEqual([
      { threadId: "t1", senderUserId: "user-a", body: "oi" },
      { threadId: "t1", senderUserId: "user-b", body: "oi" },
    ]);
  });

  /**
   * `send`'s body bound is `.trim().max(4000)` — deliberately no
   * `.min(1)`, unlike before Task 6b. A blank (or all-whitespace) body must
   * now REACH the use case rather than being refused at this schema edge:
   * `Message.compose` is what decides whether a message carries anything,
   * because it alone knows whether an attachment rode along too. If
   * `.min(1)` ever comes back, this reds — a blank body would be refused as
   * VALIDATION_ERROR before `sendSpy` is ever called.
   */
  it("passes a blank body straight through to the use case, trimmed, rather than refusing it here", async () => {
    const sendSpy = spyUseCase({ id: "m1" });
    const handlers = createCommunicationWriteHandlers(makeModule({ sendMessage: sendSpy }));
    const field = handlers.find((h) => h.key === "communication.send")!;

    await field.handler({ threadId: "t1", body: "   " }, ctx());

    expect(sendSpy.calls).toEqual([{ threadId: "t1", senderUserId: "u-session", body: "" }]);
  });

  /**
   * The exact case Task 6b exists to un-break: a photograph with no
   * caption. `.min(1)` refused this at the schema edge before the use case
   * ever ran — Task 2's `Message.compose` rule (an attachment can stand in
   * for a body) was dead code as long as it did. This is "the
   * photo-with-no-caption test" the brief's mutation table names: reinstate
   * `.min(1)` on `body` and this reds, because zod refuses the whole input
   * before `sendSpy` is ever called.
   */
  it("accepts an empty body when the message carries an attachment, and forwards the descriptor unchanged", async () => {
    const sendSpy = spyUseCase({ id: "m1" });
    const handlers = createCommunicationWriteHandlers(makeModule({ sendMessage: sendSpy }));
    const field = handlers.find((h) => h.key === "communication.send")!;
    const attachments = [{ storageKey: "attachment/u-session/one.png" }];

    await field.handler({ threadId: "t1", body: "", attachments }, ctx());

    expect(sendSpy.calls).toEqual([
      { threadId: "t1", senderUserId: "u-session", body: "", attachments },
    ]);
  });

  /**
   * `attachments`' bound (`.max(5)`, matching `MAX_ATTACHMENTS`) reaches
   * the emitted field the same way `body`'s `.max(4000)` does — refused at
   * the schema edge, before the use case runs, as a cheap duplicate of
   * `Message.compose`'s own count check.
   */
  it("rejects more than five attachments as VALIDATION_ERROR (the wire code), before the use case runs", async () => {
    const sendSpy = spyUseCase({ id: "m1" });
    const handlers = createCommunicationWriteHandlers(makeModule({ sendMessage: sendSpy }));
    const field = handlers.find((h) => h.key === "communication.send")!;
    const tooMany = Array.from({ length: 6 }, (_, i) => ({
      storageKey: `attachment/u-session/${i}.png`,
    }));

    let caught: unknown;
    try {
      await field.handler({ threadId: "t1", body: "olá", attachments: tooMany }, ctx());
    } catch (err) {
      caught = err;
    }
    expect(getGraphQLErrorCode(caught)).toBe("VALIDATION_ERROR");
    expect(sendSpy.calls).toEqual([]);
  });

  /**
   * The exact boundary `Message.compose` / `MESSAGE_BODY_MAX` defines,
   * proven at the schema edge rather than only asserted in a doc comment.
   * `.max(4000)` on a *trimmed* string means the 4000th character is still
   * accepted — this is the case a coarser "some long string is rejected"
   * test would not catch, and the one the reviewer found untested: swapping
   * `.max(4000)` for `.max(40000)` left every existing test green.
   */
  it("accepts a body of exactly 4000 characters", async () => {
    const sendSpy = spyUseCase({ id: "m1" });
    const handlers = createCommunicationWriteHandlers(makeModule({ sendMessage: sendSpy }));
    const field = handlers.find((h) => h.key === "communication.send")!;

    const body = "a".repeat(4000);
    await field.handler({ threadId: "t1", body }, ctx());

    expect(sendSpy.calls).toEqual([{ threadId: "t1", senderUserId: "u-session", body }]);
  });

  /**
   * The other side of the same boundary: one character over refuses as
   * VALIDATION_ERROR at the schema edge, before the use case ever runs —
   * not as `MessageBodyTooLongError` (UNPROCESSABLE) from `Message.compose`
   * one layer down. A client branching on the wire code sees a different
   * kind of error depending on which layer catches an over-long body, so
   * this pins the schema as the layer that catches it here.
   */
  it("rejects a body of 4001 characters as VALIDATION_ERROR (the wire code), before the use case runs", async () => {
    const sendSpy = spyUseCase({ id: "m1" });
    const handlers = createCommunicationWriteHandlers(makeModule({ sendMessage: sendSpy }));
    const field = handlers.find((h) => h.key === "communication.send")!;

    const body = "a".repeat(4001);
    let caught: unknown;
    try {
      await field.handler({ threadId: "t1", body }, ctx());
    } catch (err) {
      caught = err;
    }
    expect(getGraphQLErrorCode(caught)).toBe("VALIDATION_ERROR");
    expect(sendSpy.calls).toEqual([]);
  });

  /**
   * `ThreadNotVisibleError` is the same refusal a nonexistent thread and a
   * thread that is not the caller's both produce — proven here through the
   * whole built handler, asserting the wire CODE
   * (`getGraphQLErrorCode`), not `instanceof`: `toBeInstanceOf` stays green
   * even if the emitted code silently dropped to INTERNAL_ERROR because a
   * base class changed underneath it. `ThreadNotVisibleError` extends the
   * kit's `UnprocessableError`, which maps to "UNPROCESSABLE".
   */
  it("propagates ThreadNotVisibleError from communication.send as UNPROCESSABLE on the wire", async () => {
    const sendSpy = spyUseCase(() => {
      throw new ThreadNotVisibleError();
    });
    const handlers = createCommunicationWriteHandlers(makeModule({ sendMessage: sendSpy }));
    const field = handlers.find((h) => h.key === "communication.send")!;

    let caught: unknown;
    try {
      await field.handler({ threadId: "t1", body: "oi" }, ctx({ requesterUserId: "u-stranger" }));
    } catch (err) {
      caught = err;
    }
    expect(getGraphQLErrorCode(caught)).toBe("UNPROCESSABLE");
    expect(sendSpy.calls).toEqual([{ threadId: "t1", senderUserId: "u-stranger", body: "oi" }]);
  });

  it("propagates ThreadNotVisibleError from communication.markRead as UNPROCESSABLE on the wire", async () => {
    const markReadSpy = spyUseCase(() => {
      throw new ThreadNotVisibleError();
    });
    const handlers = createCommunicationWriteHandlers(makeModule({ markThreadRead: markReadSpy }));
    const field = handlers.find((h) => h.key === "communication.markRead")!;

    let caught: unknown;
    try {
      await field.handler({ threadId: "t1" }, ctx({ requesterUserId: "u-stranger" }));
    } catch (err) {
      caught = err;
    }
    expect(getGraphQLErrorCode(caught)).toBe("UNPROCESSABLE");
  });

  /**
   * `startThread`'s equivalent of the two `ThreadNotVisibleError`
   * propagation tests above: `ProviderNotContactableError`
   * (`StartThreadCommand`'s refusal for a provider that is missing or not
   * active — the spec's Errors table lists this case explicitly) must
   * reach the caller through the built handler, not just the command's own
   * tests. Asserts the wire CODE, not `instanceof` — `toBeInstanceOf` stays
   * green even if the emitted code silently dropped to INTERNAL_ERROR
   * because a base class changed underneath it.
   * `ProviderNotContactableError` extends the kit's `UnprocessableError`,
   * which maps to "UNPROCESSABLE" — same code `ThreadNotVisibleError` maps
   * to, since both are refusals of the shape "this is not something you
   * may act on", not a validation failure or a missing resource.
   */
  it("propagates ProviderNotContactableError from communication.startThread as UNPROCESSABLE on the wire", async () => {
    const startThreadSpy = spyUseCase(() => {
      throw new ProviderNotContactableError();
    });
    const handlers = createCommunicationWriteHandlers(makeModule({ startThread: startThreadSpy }));
    const field = handlers.find((h) => h.key === "communication.startThread")!;

    let caught: unknown;
    try {
      await field.handler({ providerId: "p-inactive" }, ctx({ requesterUserId: "u-session" }));
    } catch (err) {
      caught = err;
    }
    expect(getGraphQLErrorCode(caught)).toBe("UNPROCESSABLE");
    expect(startThreadSpy.calls).toEqual([
      { customerUserId: "u-session", providerId: "p-inactive" },
    ]);
  });
});

describe("communication.openSupportRequest", () => {
  it("stamps the requester from the session and passes the rest through", async () => {
    const openSupportRequestSpy = spyUseCase({ threadId: "t1" });
    const handlers = createCommunicationWriteHandlers(
      makeModule({ openSupportRequest: openSupportRequestSpy }),
    );
    const field = handlers.find((h) => h.key === "communication.openSupportRequest")!;

    const out = await field.handler(
      { audience: "provider", providerId: "p1", subject: "Comissão", body: "x", bookingId: "b1" },
      ctx({ requesterUserId: "u-session" }),
    );

    expect(out).toEqual({ threadId: "t1" });
    expect(openSupportRequestSpy.calls).toEqual([
      {
        requesterUserId: "u-session",
        audience: "provider",
        providerId: "p1",
        subject: "Comissão",
        body: "x",
        bookingId: "b1",
        attachments: undefined,
      },
    ]);
  });

  it("refuses an anonymous caller", async () => {
    const openSupportRequestSpy = spyUseCase({ threadId: "t1" });
    const handlers = createCommunicationWriteHandlers(
      makeModule({ openSupportRequest: openSupportRequestSpy }),
    );
    const field = handlers.find((h) => h.key === "communication.openSupportRequest")!;

    await expect(
      field.handler(
        { audience: "customer", subject: "x", body: "x" },
        ctx({ requesterUserId: null }),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(openSupportRequestSpy.calls).toEqual([]);
  });
});
