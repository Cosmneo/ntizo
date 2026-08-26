import { describe, expect, it, spyOn } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { infraStore } from "../../../../../shared/infrastructure/stores/infra-store";
import type {
  DeliverNotificationInternalInput,
  DeliverNotificationInternalPort,
} from "../app/ports/inbound/deliver-notification.internal.command.port";
import type {
  InboxPage,
  NotificationRepositoryPort,
} from "../app/ports/outbound/notification.repository.port";
import { DeferredNotificationDelivery } from "../infrastructure/inbound-adapters/deferred-notification-delivery.adapter";
import { RaiseNotificationInternalCommand } from "../app/use-cases/raise-notification.internal.command";
import type { Notification } from "../domain/aggregates/notification.aggregate";

/** `infraStore.waitUntil` needs a request scope; no field here is ever read. */
const TEST_ENV = {
  STAGE: "local" as const,
  LOG_LEVEL: "info",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "s",
  RESEND_API_KEY: "",
  EMAIL_FROM: "a@b.c",
  APP_URL: "https://ntizo.test",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
};

const INPUT: DeliverNotificationInternalInput = {
  notificationId: "n1",
  type: NotificationType.Welcome,
  audience: "user",
  userId: "u1",
  payload: { firstName: "Ana" },
};

class SlowDeliverer implements DeliverNotificationInternalPort {
  ran = false;
  constructor(private readonly outcome: "ok" | "throw" = "ok") {}
  async execute(): Promise<{ deliveryIds: string[] }> {
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.ran = true;
    if (this.outcome === "throw") throw new Error("resend is down");
    return { deliveryIds: ["d1"] };
  }
}

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

describe("DeferredNotificationDelivery", () => {
  it("returns before the delivery it started has finished", async () => {
    await infraStore.runAsync(TEST_ENV, async () => {
      const inner = new SlowDeliverer();
      await new DeferredNotificationDelivery(inner).execute(INPUT);
      // This is the whole point: the caller is already past it.
      expect(inner.ran).toBe(false);
      await infraStore.settleDeferredWork();
      expect(inner.ran).toBe(true);
    });
  });

  it("hands the promise to the platform's waitUntil", async () => {
    const scheduled: Promise<unknown>[] = [];
    await infraStore.runAsync(TEST_ENV, async () => {
      infraStore.setWaitUntil((p) => {
        scheduled.push(p);
      });
      await new DeferredNotificationDelivery(new SlowDeliverer()).execute(INPUT);
      expect(scheduled).toHaveLength(1);
      await infraStore.settleDeferredWork();
    });
  });

  it("logs a failed delivery itself, because nobody upstream can still see it", async () => {
    // The raise command's try/catch is blind here by construction: its `await`
    // resolved before this failed. If this catch were missing, the failure
    // would be an unhandled rejection and nothing would name the notification.
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const scheduled: Promise<unknown>[] = [];
      await infraStore.runAsync(TEST_ENV, async () => {
        infraStore.setWaitUntil((p) => {
          scheduled.push(p);
        });
        await new DeferredNotificationDelivery(new SlowDeliverer("throw")).execute(INPUT);
        // Resolves, never rejects — a rejection reaching ctx.waitUntil is an
        // unhandled rejection in the isolate.
        await expect(Promise.all(scheduled)).resolves.toBeDefined();
      });
      expect(logged).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls[0]![0]).toBe("[notification] deferred delivery failed");
      expect(logged.mock.calls[0]![1]).toMatchObject({
        notificationId: "n1",
        type: NotificationType.Welcome,
        error: "resend is down",
      });
    } finally {
      logged.mockRestore();
    }
  });

  it("keeps the raise fast and intact when delivery is deferred and then fails", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      await infraStore.runAsync(TEST_ENV, async () => {
        const repo = new FakeRepo();
        const inner = new SlowDeliverer("throw");
        const raise = new RaiseNotificationInternalCommand(
          repo,
          new DeferredNotificationDelivery(inner),
        );
        const result = await raise.execute({
          type: NotificationType.Welcome,
          audience: "user",
          userId: "u1",
          payload: { firstName: "Ana" },
        });
        expect(result).toEqual({ notificationId: "n1" });
        expect(inner.ran).toBe(false);
        await infraStore.settleDeferredWork();
        expect(repo.saved).toHaveLength(1);
      });
    } finally {
      logged.mockRestore();
    }
  });

  it("still runs the work outside a Worker, where no waitUntil was registered", async () => {
    // A test, a script, `app.request()`. Nothing to hand the promise to, but
    // the work must still happen and must still be waitable.
    await infraStore.runAsync(TEST_ENV, async () => {
      const inner = new SlowDeliverer();
      await new DeferredNotificationDelivery(inner).execute(INPUT);
      await infraStore.settleDeferredWork();
      expect(inner.ran).toBe(true);
    });
  });
});
