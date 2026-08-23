import { describe, expect, it } from "bun:test";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import type {
  InboxPage,
  NotificationRepositoryPort,
} from "../../../bounded-contexts/notification/app/ports/outbound/notification.repository.port";
import type { ProviderMemberReaderPort } from "../../../bounded-contexts/notification/app/ports/outbound/provider-member-reader.port";
import type { Notification } from "../../../bounded-contexts/notification/domain/aggregates/notification.aggregate";
import { NotProviderMemberError } from "../../../bounded-contexts/notification/domain/exceptions";
import {
  CountUnreadProjection,
  ListMyNotificationsProjection,
  ListProviderNotificationsProjection,
} from "../app/use-cases/list-notifications.projection";
import {
  createNotificationReadHandlers,
  type NotificationReadModule,
} from "../graphql/handlers/queries.handlers";
import type { NotificationReadBootstrap } from "../bootstrap";
import {
  countMyUnreadNotifications,
  listMyNotifications,
  notificationReadSchema,
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

const emptyPage: InboxPage = { items: [], total: 0 };

/**
 * Every read (and the id it read) is recorded, not just the outcome — the
 * property under test throughout this file is ORDERING: that a refusal
 * happens before any row is touched, not only that a refusal happens.
 */
class FakeNotificationRepository implements NotificationRepositoryPort {
  public readonly calls: string[] = [];
  constructor(
    private readonly page: InboxPage = emptyPage,
    private readonly unread = 0,
  ) {}

  async save(_entity: Notification): Promise<string> {
    this.calls.push("save");
    return "n-new";
  }
  async listForUser(userId: string, limit: number, offset: number): Promise<InboxPage> {
    this.calls.push(`listForUser:${userId}:${limit}:${offset}`);
    return this.page;
  }
  async listForProvider(
    providerId: string,
    readerUserId: string,
    limit: number,
    offset: number,
  ): Promise<InboxPage> {
    this.calls.push(`listForProvider:${providerId}:${readerUserId}:${limit}:${offset}`);
    return this.page;
  }
  async countUnreadForUser(userId: string): Promise<number> {
    this.calls.push(`countUnreadForUser:${userId}`);
    return this.unread;
  }
  async countUnreadForProvider(providerId: string, readerUserId: string): Promise<number> {
    this.calls.push(`countUnreadForProvider:${providerId}:${readerUserId}`);
    return this.unread;
  }
  async markRead(): Promise<boolean> {
    this.calls.push("markRead");
    return true;
  }
  async markAllReadForUser(): Promise<number> {
    this.calls.push("markAllReadForUser");
    return 0;
  }
  async markAllReadForProvider(): Promise<number> {
    this.calls.push("markAllReadForProvider");
    return 0;
  }
}

class FakeProviderMemberReader implements ProviderMemberReaderPort {
  public readonly calls: string[] = [];
  constructor(private readonly member: boolean) {}
  async isMember(providerId: string, userId: string): Promise<boolean> {
    this.calls.push(`isMember:${providerId}:${userId}`);
    return this.member;
  }
}

describe("the notification read schema", () => {
  it("exposes exactly the four fields the frontend needs, and no more", () => {
    const fields = Object.keys(
      (notificationReadSchema as unknown as { fields: { notification: object } }).fields
        .notification,
    ).sort();
    expect(fields).toEqual(["forProvider", "mine", "mineUnreadCount", "providerUnreadCount"]);
  });

  /**
   * Checked against the parsed zod shape's key set, not by slicing the
   * source text between two `indexOf` markers as this test used to. That
   * slice was fragile in a way that mattered: rename either marker and
   * `indexOf` returns -1, silently widening the slice to the whole file —
   * the test keeps passing while checking nothing at all.
   */
  it("takes no user id on the personal fields' input schema — the session is the answer", () => {
    const shapeKeys = (field: { input: unknown }): string[] => {
      const adapter = field.input as { _schema?: { shape?: Record<string, unknown> } };
      return Object.keys(adapter._schema?.shape ?? {}).sort();
    };

    expect(shapeKeys(listMyNotifications)).toEqual(["limit", "offset"]);
    expect(shapeKeys(countMyUnreadNotifications)).toEqual([]);
  });
});

describe("ListMyNotificationsProjection", () => {
  it("defaults to a page of 20 when no limit is given", async () => {
    const repo = new FakeNotificationRepository();
    await new ListMyNotificationsProjection(repo).execute({ requesterUserId: "u1" });
    expect(repo.calls).toEqual(["listForUser:u1:20:0"]);
  });

  it("clamps a limit above the ceiling down to 50", async () => {
    const repo = new FakeNotificationRepository();
    await new ListMyNotificationsProjection(repo).execute({
      requesterUserId: "u1",
      limit: 500,
    });
    expect(repo.calls).toEqual(["listForUser:u1:50:0"]);
  });

  it("floors a negative offset to 0", async () => {
    const repo = new FakeNotificationRepository();
    await new ListMyNotificationsProjection(repo).execute({
      requesterUserId: "u1",
      offset: -5,
    });
    expect(repo.calls).toEqual(["listForUser:u1:20:0"]);
  });

  it("returns the repository's page", async () => {
    const page: InboxPage = { items: [], total: 3 };
    const repo = new FakeNotificationRepository(page);
    const result = await new ListMyNotificationsProjection(repo).execute({
      requesterUserId: "u1",
    });
    expect(result).toEqual(page);
  });
});

describe("ListProviderNotificationsProjection", () => {
  it("refuses a non-member before reading anything", async () => {
    const repo = new FakeNotificationRepository();
    const members = new FakeProviderMemberReader(false);
    await expect(
      new ListProviderNotificationsProjection(repo, members).execute({
        requesterUserId: "u-outsider",
        providerId: "p1",
      }),
    ).rejects.toThrow(NotProviderMemberError);
    expect(repo.calls).toEqual([]);
    expect(members.calls).toEqual(["isMember:p1:u-outsider"]);
  });

  it("gets a member their page, after the membership check", async () => {
    const page: InboxPage = { items: [], total: 7 };
    const repo = new FakeNotificationRepository(page);
    const members = new FakeProviderMemberReader(true);
    const result = await new ListProviderNotificationsProjection(repo, members).execute({
      requesterUserId: "u1",
      providerId: "p1",
    });
    expect(result).toEqual(page);
    expect(members.calls).toEqual(["isMember:p1:u1"]);
    expect(repo.calls).toEqual(["listForProvider:p1:u1:20:0"]);
  });
});

describe("CountUnreadProjection", () => {
  it("counts a person's own unread", async () => {
    const repo = new FakeNotificationRepository(emptyPage, 4);
    const members = new FakeProviderMemberReader(true);
    const result = await new CountUnreadProjection(repo, members).forUser("u1");
    expect(result).toEqual({ count: 4 });
  });

  it("refuses a non-member's provider count, and never counts", async () => {
    const repo = new FakeNotificationRepository();
    const members = new FakeProviderMemberReader(false);
    await expect(
      new CountUnreadProjection(repo, members).forProvider("u-outsider", "p1"),
    ).rejects.toThrow(NotProviderMemberError);
    expect(repo.calls).toEqual([]);
  });

  it("counts a member's provider unread, after the membership check", async () => {
    const repo = new FakeNotificationRepository(emptyPage, 9);
    const members = new FakeProviderMemberReader(true);
    const result = await new CountUnreadProjection(repo, members).forProvider("u1", "p1");
    expect(result).toEqual({ count: 9 });
    expect(members.calls).toEqual(["isMember:p1:u1"]);
  });
});

function makeModule(
  repo: FakeNotificationRepository,
  members: FakeProviderMemberReader,
): NotificationReadModule {
  return {
    notificationRead: {
      adapters: { repo, members } as never,
      useCases: {
        listMine: new ListMyNotificationsProjection(repo),
        listForProvider: new ListProviderNotificationsProjection(repo, members),
        countUnread: new CountUnreadProjection(repo, members),
      },
    } as NotificationReadBootstrap,
  };
}

describe("createNotificationReadHandlers", () => {
  it("builds exactly the four fields", () => {
    const handlers = createNotificationReadHandlers(
      makeModule(new FakeNotificationRepository(), new FakeProviderMemberReader(true)),
    );
    expect(handlers.map((h) => h.key).sort()).toEqual([
      "notification.forProvider",
      "notification.mine",
      "notification.mineUnreadCount",
      "notification.providerUnreadCount",
    ]);
  });

  /**
   * All four fields answer someone's own question — "my inbox", "my unread
   * count", or a workspace's, which still resolves to "am I a member" from
   * the session. None of them has a meaningful answer for a caller with no
   * session, so `requireUser` runs first on every one of them, before the
   * membership check and before any repository read.
   */
  describe("anonymous caller refusal", () => {
    const fields = [
      "notification.mine",
      "notification.mineUnreadCount",
      "notification.forProvider",
      "notification.providerUnreadCount",
    ] as const;

    for (const key of fields) {
      it(`refuses an anonymous caller on ${key} before anything else runs`, async () => {
        const repo = new FakeNotificationRepository();
        const members = new FakeProviderMemberReader(true);
        const handlers = createNotificationReadHandlers(makeModule(repo, members));
        const field = handlers.find((h) => h.key === key)!;

        await expect(
          field.handler({ providerId: "p1" }, ctx({ requesterUserId: null })),
        ).rejects.toThrow("Sign in");

        expect(repo.calls).toEqual([]);
        expect(members.calls).toEqual([]);
      });
    }
  });

  /**
   * The boundary the client actually talks to is the built field's
   * `.handler`, not the projection directly — a regression could leave a
   * handler reading an id off `args` (e.g. `args.input.requesterUserId`)
   * while every projection test above stays fully green. So this exercises
   * the real built handler with a raw args object carrying an
   * attacker-supplied id under an unrelated field name, the same shape
   * `read/user`'s equivalent test uses.
   */
  it("stamps requesterUserId from the session on notification.mine, ignoring any id raw args try to smuggle in", async () => {
    const calls: unknown[] = [];
    const spy = {
      execute: async (input: unknown) => {
        calls.push(input);
        return emptyPage;
      },
    };
    const handlers = createNotificationReadHandlers({
      notificationRead: {
        adapters: {} as never,
        useCases: {
          listMine: spy,
          listForProvider: { execute: async () => emptyPage },
          countUnread: {
            forUser: async () => ({ count: 0 }),
            forProvider: async () => ({ count: 0 }),
          },
        },
      } as unknown as NotificationReadBootstrap,
    });

    const field = handlers.find((h) => h.key === "notification.mine")!;
    const hostileArgs = { requesterUserId: "victim", limit: 5 };
    await field.handler(hostileArgs, ctx({ requesterUserId: "u-session" }));

    expect(calls).toEqual([{ requesterUserId: "u-session", limit: 5, offset: undefined }]);
  });

  it("takes providerId from validated args but requesterUserId only from the session, on notification.forProvider", async () => {
    const calls: unknown[] = [];
    const spy = {
      execute: async (input: unknown) => {
        calls.push(input);
        return emptyPage;
      },
    };
    const handlers = createNotificationReadHandlers({
      notificationRead: {
        adapters: {} as never,
        useCases: {
          listMine: { execute: async () => emptyPage },
          listForProvider: spy,
          countUnread: {
            forUser: async () => ({ count: 0 }),
            forProvider: async () => ({ count: 0 }),
          },
        },
      } as unknown as NotificationReadBootstrap,
    });

    const field = handlers.find((h) => h.key === "notification.forProvider")!;
    const hostileArgs = { providerId: "p1", requesterUserId: "victim" };
    await field.handler(hostileArgs, ctx({ requesterUserId: "u-session" }));

    expect(calls).toEqual([
      { requesterUserId: "u-session", providerId: "p1", limit: undefined, offset: undefined },
    ]);
  });
});
