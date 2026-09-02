import { beforeEach, describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { NotifyUnreadInternalCommand } from "../app/use-cases/notify-unread.internal.command";
import type {
  DueMessage,
  MessagePage,
  MessageRepositoryPort,
} from "../app/ports/outbound/message.repository.port";
import type {
  RaiseNotificationInput,
  RaiseNotificationInternalPort,
} from "../app/ports/outbound/raise-notification.port";
import type { AdminUserReaderPort } from "../app/ports/outbound/admin-user-reader.port";

const NOW = new Date("2026-08-27T10:02:00.000Z");
const customerId = "customer-1";
const providerId = "provider-1";
const staffId = "staff-1";

/** One due message, defaulted to "sent by the customer" unless overridden. */
function dueMessage(id: string, patch: Partial<DueMessage> = {}): DueMessage {
  return {
    id,
    threadId: `${id}-thread`,
    threadType: "inquiry",
    senderSide: "customer",
    customerUserId: customerId,
    providerId,
    subject: null,
    ...patch,
  };
}

/**
 * A `claimDueForNotice` that behaves the way the real, DB-backed one does:
 * a message `markNotified` was called for drops out of the next claim. That
 * is what makes "the next sweep skips it" an actual test of the command
 * rather than of the fake — a fake that always returned the same fixed list
 * would make that test pass no matter what the command did with `markNotified`.
 */
class FakeMessageRepository implements MessageRepositoryPort {
  readonly notifiedAt = new Map<string, Date>();
  readonly claimCalls: { limit: number; now: Date }[] = [];

  constructor(private readonly due: DueMessage[]) {}

  async insert(): Promise<string> {
    throw new Error("not used by this test");
  }

  async listForThread(): Promise<MessagePage> {
    return { items: [], nextCursor: null };
  }

  async markReadForViewer(): Promise<number> {
    return 0;
  }

  async claimDueForNotice(limit: number, now: Date): Promise<DueMessage[]> {
    this.claimCalls.push({ limit, now });
    return this.due.filter((m) => !this.notifiedAt.has(m.id)).slice(0, limit);
  }

  async markNotified(messageId: string, at: Date): Promise<void> {
    this.notifiedAt.set(messageId, at);
  }

  async countUnreadForViewer(): Promise<Map<string, number>> {
    return new Map();
  }

  async markReadForPlatform(): Promise<never> {
    throw new Error("not used by this test");
  }

  async countUnreadForPlatform(): Promise<never> {
    throw new Error("not used by this test");
  }
}

class FakeRaiseNotification implements RaiseNotificationInternalPort {
  readonly calls: RaiseNotificationInput[] = [];
  private shouldFail: ((input: RaiseNotificationInput) => boolean) | null = null;

  /** The next `execute` whose payload matches `predicate` throws instead of succeeding. */
  failOn(predicate: (input: RaiseNotificationInput) => boolean): void {
    this.shouldFail = predicate;
  }

  async execute(input: RaiseNotificationInput): Promise<{ notificationId: string }> {
    this.calls.push(input);
    if (this.shouldFail?.(input)) throw new Error("delivery exploded");
    return { notificationId: crypto.randomUUID() };
  }
}

class FakeAdminUserReader implements AdminUserReaderPort {
  constructor(private readonly ids: string[]) {}
  async findAdminUserIds(): Promise<string[]> {
    return this.ids;
  }
}

let raised: FakeRaiseNotification;
/** Unused by the inquiry-only tests below — support requests are the only path that reads it. */
const admins = new FakeAdminUserReader(["admin-1", "admin-2"]);

beforeEach(() => {
  raised = new FakeRaiseNotification();
});

describe("who gets told", () => {
  it("notifies the provider when the customer sent the message", async () => {
    const messages = new FakeMessageRepository([dueMessage("m1", { senderSide: "customer" })]);
    const notify = new NotifyUnreadInternalCommand(messages, raised, admins, () => NOW);

    const result = await notify.execute({ limit: 10 });

    expect(result).toEqual({ notified: 1, failed: 0 });
    expect(raised.calls).toEqual([
      {
        type: NotificationType.NewMessage,
        audience: "provider",
        providerId,
        payload: { threadId: "m1-thread" },
      },
    ]);
  });

  it("notifies the customer when a provider team member sent the message", async () => {
    const messages = new FakeMessageRepository([dueMessage("m1", { senderSide: "provider" })]);
    const notify = new NotifyUnreadInternalCommand(messages, raised, admins, () => NOW);

    await notify.execute({ limit: 10 });

    expect(raised.calls).toEqual([
      {
        type: NotificationType.NewMessage,
        audience: "user",
        userId: customerId,
        payload: { threadId: "m1-thread" },
      },
    ]);
  });

  // Mutation guard: a command that always notified "provider" (or always
  // "user") would still pass either test above on its own — each seeds only
  // one direction. Seeding one of each in the SAME sweep is what an
  // inverted or constant-audience bug cannot survive.
  it("gets both directions right within the same sweep, not just one at a time", async () => {
    const messages = new FakeMessageRepository([
      dueMessage("from-customer", { senderSide: "customer" }),
      dueMessage("from-staff", { senderSide: "provider" }),
    ]);
    const notify = new NotifyUnreadInternalCommand(messages, raised, admins, () => NOW);

    await notify.execute({ limit: 10 });

    expect(raised.calls).toHaveLength(2);
    expect(raised.calls[0]).toMatchObject({ audience: "provider", providerId });
    expect(raised.calls[1]).toMatchObject({ audience: "user", userId: customerId });
  });
});

describe("claiming", () => {
  it("passes the caller's limit and clock straight through to claimDueForNotice", async () => {
    const messages = new FakeMessageRepository([]);
    const notify = new NotifyUnreadInternalCommand(messages, raised, admins, () => NOW);

    await notify.execute({ limit: 7 });

    expect(messages.claimCalls).toEqual([{ limit: 7, now: NOW }]);
  });

  it("marks what it notified so the next sweep skips it", async () => {
    const messages = new FakeMessageRepository([dueMessage("m1"), dueMessage("m2")]);
    const notify = new NotifyUnreadInternalCommand(messages, raised, admins, () => NOW);

    const first = await notify.execute({ limit: 10 });
    expect(first).toEqual({ notified: 2, failed: 0 });

    const second = await notify.execute({ limit: 10 });
    expect(second).toEqual({ notified: 0, failed: 0 });
    // Not called again for either message on the second sweep.
    expect(raised.calls).toHaveLength(2);
  });
});

describe("resilience", () => {
  it("keeps going when one message fails, and marks only the ones that actually succeeded", async () => {
    const messages = new FakeMessageRepository([
      dueMessage("m1"),
      dueMessage("m2"),
      dueMessage("m3"),
    ]);
    // m2 sits between two messages that must still succeed — a loop that
    // aborts on the first thrown error would never reach m3.
    raised.failOn((input) => input.payload["threadId"] === "m2-thread");
    const notify = new NotifyUnreadInternalCommand(messages, raised, admins, () => NOW);

    const result = await notify.execute({ limit: 10 });

    expect(result).toEqual({ notified: 2, failed: 1 });
    expect(raised.calls).toHaveLength(3);
    expect(messages.notifiedAt.has("m1")).toBe(true);
    expect(messages.notifiedAt.has("m3")).toBe(true);
    // The one that failed must not be marked — see the class doc comment:
    // `markNotified` is only reached after `raiseNotification.execute`
    // resolved. Left unmarked, the next sweep will retry exactly this one.
    expect(messages.notifiedAt.has("m2")).toBe(false);
  });
});

describe("support requests", () => {
  const admins = new FakeAdminUserReader(["admin-1", "admin-2"]);

  it("a requester's unread message tells every admin, once each", async () => {
    const messages = new FakeMessageRepository([
      dueMessage("m1", { threadType: "support", senderSide: "customer", providerId: null, subject: "Reembolso" }),
    ]);
    const notify = new NotifyUnreadInternalCommand(messages, raised, admins, () => NOW);

    const result = await notify.execute({ limit: 10 });

    expect(result).toEqual({ notified: 1, failed: 0 });
    expect(raised.calls).toEqual([
      { type: NotificationType.SupportRequestMessage, audience: "user", userId: "admin-1", payload: { threadId: "m1-thread", subject: "Reembolso", requestAudience: "customer" } },
      { type: NotificationType.SupportRequestMessage, audience: "user", userId: "admin-2", payload: { threadId: "m1-thread", subject: "Reembolso", requestAudience: "customer" } },
    ]);
    expect(messages.notifiedAt.has("m1")).toBe(true);
  });

  it("a platform reply tells the customer on a personal request, and the provider on a provider request", async () => {
    const messages = new FakeMessageRepository([
      dueMessage("personal", { threadType: "support", senderSide: "platform", providerId: null, subject: "A" }),
      dueMessage("prov", { threadType: "support", senderSide: "platform", customerUserId: staffId, providerId, subject: "B" }),
    ]);
    await new NotifyUnreadInternalCommand(messages, raised, admins, () => NOW).execute({ limit: 10 });

    expect(raised.calls).toEqual([
      { type: NotificationType.SupportReply, audience: "user", userId: customerId, payload: { threadId: "personal-thread", subject: "A", requestAudience: "customer" } },
      { type: NotificationType.SupportReply, audience: "provider", providerId, payload: { threadId: "prov-thread", subject: "B", requestAudience: "provider", providerId } },
    ]);
  });

  it("a member's message on a provider request still goes to the admins, with the provider named", async () => {
    const messages = new FakeMessageRepository([
      dueMessage("m", { threadType: "support", senderSide: "provider", customerUserId: staffId, providerId, subject: "C" }),
    ]);
    await new NotifyUnreadInternalCommand(messages, raised, new FakeAdminUserReader(["admin-1"]), () => NOW).execute({ limit: 10 });
    expect(raised.calls).toEqual([
      { type: NotificationType.SupportRequestMessage, audience: "user", userId: "admin-1", payload: { threadId: "m-thread", subject: "C", requestAudience: "provider", providerId } },
    ]);
  });

  it("an inquiry is untouched by all of this", async () => {
    const messages = new FakeMessageRepository([dueMessage("i", { senderSide: "provider" })]);
    await new NotifyUnreadInternalCommand(messages, raised, admins, () => NOW).execute({ limit: 10 });
    expect(raised.calls).toEqual([{ type: NotificationType.NewMessage, audience: "user", userId: customerId, payload: { threadId: "i-thread" } }]);
  });

  it("with no admins at all, the message is marked notified rather than retried forever", async () => {
    const messages = new FakeMessageRepository([dueMessage("m", { threadType: "support", senderSide: "customer", providerId: null, subject: "x" })]);
    const result = await new NotifyUnreadInternalCommand(messages, raised, new FakeAdminUserReader([]), () => NOW).execute({ limit: 10 });
    expect(result).toEqual({ notified: 1, failed: 0 });
    expect(raised.calls).toHaveLength(0);
    expect(messages.notifiedAt.has("m")).toBe(true);
  });

  it("one admin failing does not lose the notice for the others, and the message is still marked", async () => {
    raised.failOn((input) => input.audience === "user" && input.userId === "admin-1");
    const messages = new FakeMessageRepository([dueMessage("m", { threadType: "support", senderSide: "customer", providerId: null, subject: "x" })]);
    const result = await new NotifyUnreadInternalCommand(messages, raised, admins, () => NOW).execute({ limit: 10 });
    expect(result).toEqual({ notified: 1, failed: 0 });
    expect(raised.calls).toHaveLength(2);
    expect(messages.notifiedAt.has("m")).toBe(true);
  });

  it("every admin failing counts the message as failed and leaves it for the next sweep", async () => {
    raised.failOn(() => true);
    const messages = new FakeMessageRepository([dueMessage("m", { threadType: "support", senderSide: "customer", providerId: null, subject: "x" })]);
    const result = await new NotifyUnreadInternalCommand(messages, raised, admins, () => NOW).execute({ limit: 10 });
    expect(result).toEqual({ notified: 0, failed: 1 });
    expect(messages.notifiedAt.has("m")).toBe(false);
  });
});
