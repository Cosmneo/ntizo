import { describe, expect, it } from "bun:test";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import type { NotificationBootstrap } from "../../../bounded-contexts/notification/bootstrap";
import {
  createNotificationWriteHandlers,
  type NotificationWriteModule,
} from "../graphql/handlers/mutations.handlers";
import { notificationWriteSchema } from "../graphql/schema/mutations";

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

describe("the notification write schema", () => {
  it("exposes four separately-named intentions", () => {
    const fields = Object.keys(
      (notificationWriteSchema as unknown as { fields: { notification: object } }).fields
        .notification,
    ).sort();
    expect(fields).toEqual(["markAllProviderRead", "markAllRead", "markProviderRead", "markRead"]);
  });
});

interface UseCaseSpy {
  readonly execute: (input: unknown) => Promise<unknown>;
}

function makeSpy(result: unknown, calls: unknown[]): UseCaseSpy {
  return {
    execute: async (input: unknown) => {
      calls.push(input);
      return result;
    },
  };
}

/**
 * Only the two use cases the handlers actually call need to be real (or
 * spied); `internal.raiseNotification` is never reachable from a GraphQL
 * mutation, so a stub that would throw if called is enough to prove that.
 */
function makeModule(overrides: {
  markNotificationRead?: UseCaseSpy;
  markAllNotificationsRead?: UseCaseSpy;
}): NotificationWriteModule {
  return {
    notification: {
      adapters: {} as never,
      useCases: {
        markNotificationRead:
          overrides.markNotificationRead ?? makeSpy({ ok: true as const }, []),
        markAllNotificationsRead:
          overrides.markAllNotificationsRead ?? makeSpy({ marked: 0 }, []),
        internal: {
          raiseNotification: {
            execute: async () => {
              throw new Error("not reachable from a GraphQL mutation");
            },
          },
        },
      },
    } as unknown as NotificationBootstrap,
  };
}

describe("createNotificationWriteHandlers", () => {
  it("builds exactly the four fields", () => {
    const handlers = createNotificationWriteHandlers(makeModule({}));
    expect(handlers.map((h) => h.key).sort()).toEqual([
      "notification.markAllProviderRead",
      "notification.markAllRead",
      "notification.markProviderRead",
      "notification.markRead",
    ]);
  });

  /**
   * Every field is a fully-authenticated write against somebody's inbox, so
   * `requireUser` runs first on all four, before the use case is ever
   * touched. A single args object carrying both a `notificationId` and a
   * `providerId` is valid input for every field here — zod strips whatever
   * a given field's schema does not declare — so refusal can be tested with
   * one shared payload rather than one per field.
   */
  describe("anonymous caller refusal", () => {
    const fields = [
      "notification.markRead",
      "notification.markAllRead",
      "notification.markProviderRead",
      "notification.markAllProviderRead",
    ] as const;
    const validForAnyField = { notificationId: "n1", providerId: "p1" };

    for (const key of fields) {
      it(`refuses an anonymous caller on ${key} before the use case runs`, async () => {
        const markReadCalls: unknown[] = [];
        const markAllCalls: unknown[] = [];
        const handlers = createNotificationWriteHandlers(
          makeModule({
            markNotificationRead: makeSpy({ ok: true as const }, markReadCalls),
            markAllNotificationsRead: makeSpy({ marked: 0 }, markAllCalls),
          }),
        );
        const field = handlers.find((h) => h.key === key)!;

        await expect(
          field.handler(validForAnyField, ctx({ requesterUserId: null })),
        ).rejects.toThrow("Sign in");

        expect(markReadCalls).toEqual([]);
        expect(markAllCalls).toEqual([]);
      });
    }
  });

  /**
   * `markRead` and `markProviderRead` deliberately call the same command
   * (see the handler file's comment) — this is what proves that wiring:
   * both fields reach `markNotificationRead`, each stamped with the
   * session's id and its own `notificationId`.
   */
  it("markRead and markProviderRead both call markNotificationRead", async () => {
    const calls: unknown[] = [];
    const handlers = createNotificationWriteHandlers(
      makeModule({ markNotificationRead: makeSpy({ ok: true as const }, calls) }),
    );

    const markRead = handlers.find((h) => h.key === "notification.markRead")!;
    const markProviderRead = handlers.find((h) => h.key === "notification.markProviderRead")!;

    await markRead.handler({ notificationId: "n1" }, ctx({ requesterUserId: "u-session" }));
    await markProviderRead.handler({ notificationId: "n2" }, ctx({ requesterUserId: "u-session" }));

    expect(calls).toEqual([
      { requesterUserId: "u-session", notificationId: "n1" },
      { requesterUserId: "u-session", notificationId: "n2" },
    ]);
  });

  /**
   * `markAllRead` and `markAllProviderRead` also call the same command, and
   * `providerId` is the only thing that tells the two inboxes apart. A swap
   * here would silently mark the wrong inbox, so this pins both sides: the
   * personal field passes `undefined`, the workspace field passes the id.
   */
  it("markAllRead passes providerId undefined; markAllProviderRead passes it through", async () => {
    const calls: unknown[] = [];
    const handlers = createNotificationWriteHandlers(
      makeModule({ markAllNotificationsRead: makeSpy({ marked: 0 }, calls) }),
    );

    const markAllRead = handlers.find((h) => h.key === "notification.markAllRead")!;
    const markAllProviderRead = handlers.find(
      (h) => h.key === "notification.markAllProviderRead",
    )!;

    await markAllRead.handler({}, ctx({ requesterUserId: "u-session" }));
    await markAllProviderRead.handler(
      { providerId: "p1" },
      ctx({ requesterUserId: "u-session" }),
    );

    expect(calls).toEqual([
      { requesterUserId: "u-session" },
      { requesterUserId: "u-session", providerId: "p1" },
    ]);
  });

  /**
   * The boundary the client actually talks to is the built field's
   * `.handler`, not the command directly — a regression could leave a
   * handler reading an id off `args` (e.g. `args.input.requesterUserId`)
   * while a unit test against the command stays fully green. So this
   * exercises the real built handler with a raw args object carrying an
   * attacker-supplied id under an unrelated field name, the same shape the
   * read tier's equivalent test uses.
   */
  it("stamps requesterUserId from the session on notification.markRead, ignoring any id raw args try to smuggle in", async () => {
    const calls: unknown[] = [];
    const handlers = createNotificationWriteHandlers(
      makeModule({ markNotificationRead: makeSpy({ ok: true as const }, calls) }),
    );
    const field = handlers.find((h) => h.key === "notification.markRead")!;
    const hostileArgs = { notificationId: "n1", requesterUserId: "victim" };
    await field.handler(hostileArgs, ctx({ requesterUserId: "u-session" }));

    expect(calls).toEqual([{ requesterUserId: "u-session", notificationId: "n1" }]);
  });

  it("stamps requesterUserId from the session on notification.markAllProviderRead, ignoring any id raw args try to smuggle in", async () => {
    const calls: unknown[] = [];
    const handlers = createNotificationWriteHandlers(
      makeModule({ markAllNotificationsRead: makeSpy({ marked: 0 }, calls) }),
    );
    const field = handlers.find((h) => h.key === "notification.markAllProviderRead")!;
    const hostileArgs = { providerId: "p1", requesterUserId: "victim" };
    await field.handler(hostileArgs, ctx({ requesterUserId: "u-session" }));

    expect(calls).toEqual([{ requesterUserId: "u-session", providerId: "p1" }]);
  });
});
