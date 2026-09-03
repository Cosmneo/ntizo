import { describe, expect, it } from "bun:test";
import { getGraphQLErrorCode } from "@cosmneo/onion-lasagna";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import { ThreadNotVisibleError } from "../../../bounded-contexts/communication/domain/exceptions";
import type { ThreadPageDTO, MessagePageDTO } from "@ntizo/shared/read-models";
import {
  createCommunicationReadHandlers,
  type CommunicationReadModule,
} from "../graphql/handlers/queries.handlers";
import type { CommunicationReadBootstrap } from "../bootstrap";
import {
  communicationReadSchema,
  listMyThreads,
  listProviderThreads,
  listThreadMessages,
} from "../graphql/schema/queries";

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

const emptyThreadPage: ThreadPageDTO = { items: [], nextCursor: null };
const emptyMessagePage: MessagePageDTO = { items: [], nextCursor: null };

describe("the communication read schema", () => {
  it("exposes exactly the three fields the frontend needs, and no more", () => {
    const fields = Object.keys(
      (communicationReadSchema as unknown as { fields: { communication: object } }).fields
        .communication,
    ).sort();
    expect(fields).toEqual(["myThreads", "providerThreads", "threadMessages"]);
  });

  /**
   * Checked against the parsed zod shape's key set, not by slicing source
   * text — see `read/activity`'s equivalent test for why a text slice is
   * fragile in a way that matters here.
   */
  it("takes no user id on any input schema — the session is the answer", () => {
    const shapeKeys = (field: { input: unknown }): string[] => {
      const adapter = field.input as { _schema?: { shape?: Record<string, unknown> } };
      return Object.keys(adapter._schema?.shape ?? {}).sort();
    };

    expect(shapeKeys(listMyThreads)).toEqual(["cursor", "limit", "type"]);
    expect(shapeKeys(listProviderThreads)).toEqual(["cursor", "limit", "providerId", "type"]);
    expect(shapeKeys(listThreadMessages)).toEqual(["cursor", "limit", "threadId"]);
  });
});

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
  listMyThreads?: { execute: (input: unknown) => Promise<ThreadPageDTO> };
  listProviderThreads?: { execute: (input: unknown) => Promise<ThreadPageDTO> };
  listThreadMessages?: { execute: (input: unknown) => Promise<MessagePageDTO> };
}): CommunicationReadModule {
  return {
    communicationRead: {
      adapters: {} as never,
      useCases: {
        listMyThreads: overrides.listMyThreads ?? spyUseCase(emptyThreadPage),
        listProviderThreads: overrides.listProviderThreads ?? spyUseCase(emptyThreadPage),
        listThreadMessages: overrides.listThreadMessages ?? spyUseCase(emptyMessagePage),
      },
    } as unknown as CommunicationReadBootstrap,
  };
}

describe("createCommunicationReadHandlers", () => {
  it("builds exactly the three fields", () => {
    const handlers = createCommunicationReadHandlers(makeModule({}));
    expect(handlers.map((h) => h.key).sort()).toEqual([
      "communication.myThreads",
      "communication.providerThreads",
      "communication.threadMessages",
    ]);
  });

  /**
   * Every field answers someone's own question — "my inbox", a workspace's
   * inbox (which still resolves to "am I a member" from the session), or a
   * conversation's messages (gated on the session too). None has a
   * meaningful answer for a caller with no session, so `requireUser` runs
   * first on every one of them, before any use case executes.
   */
  describe("anonymous caller refusal", () => {
    const fields = [
      { key: "communication.myThreads", args: {} },
      { key: "communication.providerThreads", args: { providerId: "p1" } },
      { key: "communication.threadMessages", args: { threadId: "t1" } },
    ] as const;

    for (const { key, args } of fields) {
      it(`refuses an anonymous caller on ${key} before any use case runs, with code UNAUTHENTICATED`, async () => {
        const myThreads = spyUseCase(emptyThreadPage);
        const providerThreads = spyUseCase(emptyThreadPage);
        const threadMessages = spyUseCase(emptyMessagePage);
        const handlers = createCommunicationReadHandlers(
          makeModule({ listMyThreads: myThreads, listProviderThreads: providerThreads, listThreadMessages: threadMessages }),
        );
        const field = handlers.find((h) => h.key === key)!;

        await expect(field.handler(args, ctx({ requesterUserId: null }))).rejects.toMatchObject({
          code: "UNAUTHENTICATED",
        });

        expect(myThreads.calls).toEqual([]);
        expect(providerThreads.calls).toEqual([]);
        expect(threadMessages.calls).toEqual([]);
      });
    }
  });

  /**
   * The boundary the client actually talks to is the built field's
   * `.handler`, not the projection directly — a regression could leave a
   * handler reading an id off `args.raw` (or off some other unvalidated
   * spot) while the projection's own tests stay fully green. `field.handler`
   * receives RAW, pre-validation args (the kit validates and wraps them into
   * `{ input, raw }` internally before calling the field's callback — see
   * `@cosmneo/onion-lasagna`'s `create-graphql-routes.ts`), so a flat object
   * carrying an attacker id under an unrelated key is exactly what a real
   * malicious request would send. zod strips that unrelated key out of
   * `args.input`; it survives only in `args.raw`, which this handler never
   * reads.
   */
  it("stamps requesterUserId from the session on communication.myThreads, ignoring any id raw args try to smuggle in", async () => {
    const myThreads = spyUseCase(emptyThreadPage);
    const handlers = createCommunicationReadHandlers(makeModule({ listMyThreads: myThreads }));
    const field = handlers.find((h) => h.key === "communication.myThreads")!;

    const hostileArgs = { requesterUserId: "victim", actorUserId: "victim", limit: 5 };
    await field.handler(hostileArgs, ctx({ requesterUserId: "u-session" }));

    expect(myThreads.calls).toEqual([{ requesterUserId: "u-session", limit: 5, cursor: undefined }]);
  });

  /** The Help Center's "my requests" list is `communication.myThreads` narrowed by `type` — this is the wire proof the argument actually reaches the use case. */
  it("passes type through on communication.myThreads", async () => {
    const myThreads = spyUseCase(emptyThreadPage);
    const handlers = createCommunicationReadHandlers(makeModule({ listMyThreads: myThreads }));
    const field = handlers.find((h) => h.key === "communication.myThreads")!;

    await field.handler({ type: "support" }, ctx({ requesterUserId: "u-session" }));

    expect(myThreads.calls).toEqual([
      { requesterUserId: "u-session", limit: undefined, cursor: undefined, type: "support" },
    ]);
  });

  it("takes providerId from validated args but requesterUserId only from the session, on communication.providerThreads", async () => {
    const providerThreads = spyUseCase(emptyThreadPage);
    const handlers = createCommunicationReadHandlers(makeModule({ listProviderThreads: providerThreads }));
    const field = handlers.find((h) => h.key === "communication.providerThreads")!;

    const hostileArgs = { providerId: "p1", requesterUserId: "victim" };
    await field.handler(hostileArgs, ctx({ requesterUserId: "u-session" }));

    expect(providerThreads.calls).toEqual([
      { requesterUserId: "u-session", providerId: "p1", limit: undefined, cursor: undefined },
    ]);
  });

  it("takes threadId from validated args but requesterUserId only from the session, on communication.threadMessages", async () => {
    const threadMessages = spyUseCase(emptyMessagePage);
    const handlers = createCommunicationReadHandlers(makeModule({ listThreadMessages: threadMessages }));
    const field = handlers.find((h) => h.key === "communication.threadMessages")!;

    const hostileArgs = { threadId: "t1", requesterUserId: "victim" };
    await field.handler(hostileArgs, ctx({ requesterUserId: "u-session" }));

    expect(threadMessages.calls).toEqual([
      { requesterUserId: "u-session", threadId: "t1", limit: undefined, cursor: undefined },
    ]);
  });

  /**
   * A second session reads only its own inbox, never the first session's —
   * there is no user-id argument to tamper with, so this drives the built
   * handler with two different sessions back to back and confirms the actor
   * id sent to the projection tracks the session, never the previous call.
   */
  it("a second caller's session reads only that caller's own inbox, never the first caller's", async () => {
    const myThreads = spyUseCase(emptyThreadPage);
    const handlers = createCommunicationReadHandlers(makeModule({ listMyThreads: myThreads }));
    const field = handlers.find((h) => h.key === "communication.myThreads")!;

    await field.handler({}, ctx({ requesterUserId: "user-a" }));
    await field.handler({}, ctx({ requesterUserId: "user-b" }));

    expect(myThreads.calls).toEqual([
      { requesterUserId: "user-a", limit: undefined, cursor: undefined },
      { requesterUserId: "user-b", limit: undefined, cursor: undefined },
    ]);
  });

  /**
   * `limit`'s `.min(1).max(50)` reaches the emitted field (unlike a zod
   * `.default()`, which does not) — a caller sending an out-of-range limit
   * gets a `VALIDATION_ERROR`, never a silently clamped page. Real
   * `field.handler` end-to-end, not a hand-rolled zod `.parse()` call, so
   * this exercises the actual validation the kit runs before any use case.
   *
   * Asserts the wire code via `getGraphQLErrorCode`, not
   * `toBeInstanceOf(ObjectValidationError)` — an `instanceof` check stays
   * green even if the thrown class stopped mapping to `VALIDATION_ERROR`;
   * what a client actually sees is the string this function produces.
   */
  it("rejects a limit outside 1..50 as VALIDATION_ERROR (the wire code), on the built handler", async () => {
    const myThreads = spyUseCase(emptyThreadPage);
    const handlers = createCommunicationReadHandlers(makeModule({ listMyThreads: myThreads }));
    const field = handlers.find((h) => h.key === "communication.myThreads")!;

    let caught: unknown;
    try {
      await field.handler({ limit: 51 }, ctx({ requesterUserId: "u-session" }));
    } catch (err) {
      caught = err;
    }
    expect(getGraphQLErrorCode(caught)).toBe("VALIDATION_ERROR");
    expect(myThreads.calls).toEqual([]);
  });

  /**
   * `communication.providerThreads` refuses a caller who is not a member of
   * the requested provider — proven here through the whole built handler,
   * not just the projection, with a real `ThreadNotVisibleError` bubbling up
   * from a use case that actually enforces it.
   */
  it("propagates ThreadNotVisibleError from communication.providerThreads to the built handler's caller", async () => {
    const providerThreads = {
      calls: [] as unknown[],
      execute: async (input: unknown) => {
        providerThreads.calls.push(input);
        throw new ThreadNotVisibleError();
      },
    };
    const handlers = createCommunicationReadHandlers(makeModule({ listProviderThreads: providerThreads }));
    const field = handlers.find((h) => h.key === "communication.providerThreads")!;

    await expect(
      field.handler({ providerId: "p1" }, ctx({ requesterUserId: "u-stranger" })),
    ).rejects.toThrow(ThreadNotVisibleError);
    expect(providerThreads.calls).toEqual([
      { requesterUserId: "u-stranger", providerId: "p1", limit: undefined, cursor: undefined },
    ]);
  });
});
