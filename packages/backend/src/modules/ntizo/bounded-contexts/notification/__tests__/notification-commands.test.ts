import { beforeEach, describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { Notification } from "../domain/aggregates/notification.aggregate";
import type {
  InboxPage,
  NotificationRepositoryPort,
} from "../app/ports/outbound/notification.repository.port";
import type { ProviderMemberReaderPort } from "../app/ports/outbound/provider-member-reader.port";
import { RaiseNotificationInternalCommand } from "../app/use-cases/raise-notification.internal.command";
import {
  MarkAllNotificationsReadCommand,
  MarkNotificationReadCommand,
} from "../app/use-cases/mark-read.command";
import { NotificationNotFoundError, NotProviderMemberError } from "../domain/exceptions";

class InMemoryRepo implements NotificationRepositoryPort {
  saved: Notification[] = [];
  markable = true;
  markedAll = 0;

  async save(entity: Notification): Promise<string> {
    this.saved.push(entity);
    return `n${this.saved.length}`;
  }
  async listForUser(): Promise<InboxPage> {
    return { items: [], total: 0 };
  }
  async listForProvider(): Promise<InboxPage> {
    return { items: [], total: 0 };
  }
  async countUnreadForUser(): Promise<number> {
    return 0;
  }
  async countUnreadForProvider(): Promise<number> {
    return 0;
  }
  async markRead(): Promise<boolean> {
    return this.markable;
  }
  async markAllReadForUser(): Promise<number> {
    return this.markedAll;
  }
  async markAllReadForProvider(): Promise<number> {
    return this.markedAll;
  }
}

class Members implements ProviderMemberReaderPort {
  constructor(private readonly answer: boolean) {}
  async isMember(): Promise<boolean> {
    return this.answer;
  }
}

let repo: InMemoryRepo;
beforeEach(() => {
  repo = new InMemoryRepo();
});

describe("RaiseNotificationInternalCommand", () => {
  it("stores a personal notification addressed to the person", async () => {
    const cmd = new RaiseNotificationInternalCommand(repo);
    const { notificationId } = await cmd.execute({
      type: NotificationType.Welcome,
      audience: "user",
      userId: "u1",
      payload: { firstName: "Ana" },
    });
    expect(notificationId).toBe("n1");
    expect(repo.saved[0]!.audience).toBe("user");
    expect(repo.saved[0]!.userId).toBe("u1");
  });

  it("stores a workspace notification addressed to the business", async () => {
    const cmd = new RaiseNotificationInternalCommand(repo);
    await cmd.execute({
      type: NotificationType.ProviderVerified,
      audience: "provider",
      providerId: "p1",
      payload: {},
    });
    expect(repo.saved[0]!.providerId).toBe("p1");
    expect(repo.saved[0]!.userId).toBeNull();
  });
});

describe("MarkNotificationReadCommand", () => {
  it("confirms when the item was marked", async () => {
    const cmd = new MarkNotificationReadCommand(repo);
    expect(await cmd.execute({ requesterUserId: "u1", notificationId: "n1" })).toEqual({ ok: true });
  });

  it("reports nothing marked rather than confirming a no-op", async () => {
    repo.markable = false;
    const cmd = new MarkNotificationReadCommand(repo);
    await expect(cmd.execute({ requesterUserId: "u1", notificationId: "nope" })).rejects.toThrow(
      NotificationNotFoundError,
    );
  });
});

describe("MarkAllNotificationsReadCommand", () => {
  it("marks a personal inbox without asking about membership", async () => {
    repo.markedAll = 3;
    const cmd = new MarkAllNotificationsReadCommand(repo, new Members(false));
    expect(await cmd.execute({ requesterUserId: "u1" })).toEqual({ marked: 3 });
  });

  it("refuses a workspace the caller does not belong to", async () => {
    const cmd = new MarkAllNotificationsReadCommand(repo, new Members(false));
    await expect(cmd.execute({ requesterUserId: "u1", providerId: "p1" })).rejects.toThrow(
      NotProviderMemberError,
    );
  });

  it("marks a workspace the caller does belong to", async () => {
    repo.markedAll = 2;
    const cmd = new MarkAllNotificationsReadCommand(repo, new Members(true));
    expect(await cmd.execute({ requesterUserId: "u1", providerId: "p1" })).toEqual({ marked: 2 });
  });
});
