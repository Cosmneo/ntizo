import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import type { Notification } from "../domain/aggregates/notification.aggregate";
import type {
  DeliverNotificationInternalInput,
  DeliverNotificationInternalPort,
} from "../app/ports/inbound/deliver-notification.internal.command.port";
import type {
  InboxPage,
  NotificationRepositoryPort,
} from "../app/ports/outbound/notification.repository.port";
import { RaiseNotificationInternalCommand } from "../app/use-cases/raise-notification.internal.command";

class FakeRepo implements NotificationRepositoryPort {
  saved: Notification[] = [];
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
    return true;
  }
  async markAllReadForUser(): Promise<number> {
    return 0;
  }
  async markAllReadForProvider(): Promise<number> {
    return 0;
  }
}

/**
 * The real deliverer, undecorated: it runs inline and can be awaited, which is
 * what makes "the id reached delivery" observable at all. Production wires the
 * deferring adapter in this slot instead — see `deferred-delivery.test.ts`.
 */
class SpyDeliverer implements DeliverNotificationInternalPort {
  calls: DeliverNotificationInternalInput[] = [];
  fail = false;
  async execute(input: DeliverNotificationInternalInput): Promise<{ deliveryIds: string[] }> {
    if (this.fail) throw new Error("delivery exploded");
    this.calls.push(input);
    return { deliveryIds: ["d1"] };
  }
}

let repo: FakeRepo;
let deliverer: SpyDeliverer;

beforeEach(() => {
  repo = new FakeRepo();
  deliverer = new SpyDeliverer();
});

const input = {
  type: NotificationType.Welcome,
  audience: "user" as const,
  userId: "u1",
  payload: { firstName: "Ana" },
};

describe("raising with a deliverer wired", () => {
  it("writes the inbox row first, then hands the same id to delivery", async () => {
    const cmd = new RaiseNotificationInternalCommand(repo, deliverer);
    const { notificationId } = await cmd.execute(input);
    expect(notificationId).toBe("n1");
    expect(deliverer.calls[0]!.notificationId).toBe("n1");
  });

  it("hands the whole raise through, not just the id", async () => {
    // The delivery input is the raise's own input plus the id — no mapping
    // step, no re-read. The payload the email renders from is the same
    // snapshot the inbox row stored, so the two can never disagree.
    const cmd = new RaiseNotificationInternalCommand(repo, deliverer);
    await cmd.execute(input);
    expect(deliverer.calls[0]).toEqual({
      type: NotificationType.Welcome,
      audience: "user",
      userId: "u1",
      payload: { firstName: "Ana" },
      notificationId: "n1",
    });
  });

  it("carries a workspace audience through by its own id", async () => {
    const cmd = new RaiseNotificationInternalCommand(repo, deliverer);
    await cmd.execute({
      type: NotificationType.ProviderVerified,
      audience: "provider",
      providerId: "p1",
      payload: {},
    });
    expect(deliverer.calls[0]).toEqual({
      type: NotificationType.ProviderVerified,
      audience: "provider",
      providerId: "p1",
      payload: {},
      notificationId: "n1",
    });
  });

  it("still returns the notification when delivery blows up", async () => {
    // The inbox row is the thing that must survive. An email that could not be
    // sent is a worse outcome than no email; a notification lost because of one
    // is worse than both.
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      deliverer.fail = true;
      const cmd = new RaiseNotificationInternalCommand(repo, deliverer);
      await expect(cmd.execute(input)).resolves.toEqual({ notificationId: "n1" });
      expect(repo.saved).toHaveLength(1);
    } finally {
      logged.mockRestore();
    }
  });

  it("says which notification lost its email, rather than swallowing it", async () => {
    // Swallowing is the whole design here, so the log line IS the record —
    // there is no exception left, no status on any row (delivery never got far
    // enough to write one), and nothing else that names what happened. Its own
    // comment says "leave it, or somebody upgrades it back into a bug"; this
    // is what makes that true. The deferred path has the same test.
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      deliverer.fail = true;
      await new RaiseNotificationInternalCommand(repo, deliverer).execute(input);
      expect(logged).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls[0]![0]).toBe("[notification] delivery failed");
      expect(logged.mock.calls[0]![1]).toEqual({
        notificationId: "n1",
        type: NotificationType.Welcome,
        error: "delivery exploded",
      });
    } finally {
      logged.mockRestore();
    }
  });
});

describe("raising with no deliverer", () => {
  it("works exactly as it did in phase 1", async () => {
    // The argument is optional so every existing caller and test keeps
    // working, and so a context that wants inbox-only can have it.
    const cmd = new RaiseNotificationInternalCommand(repo);
    await expect(cmd.execute(input)).resolves.toEqual({ notificationId: "n1" });
  });
});
