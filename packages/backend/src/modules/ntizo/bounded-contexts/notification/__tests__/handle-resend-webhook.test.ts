import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { NotificationDelivery } from "../domain/aggregates/notification-delivery.aggregate";
import { HandleResendWebhookInternalCommand } from "../app/use-cases/handle-resend-webhook.internal.command";

class FakeSuppressions {
  calls: Array<{ email: string; reason: string; detail: unknown }> = [];
  async isSuppressed() {
    return false;
  }
  async suppress(i: { email: string; reason: string; detail?: unknown }) {
    this.calls.push({ email: i.email, reason: i.reason, detail: i.detail });
  }
}

class FakeDeliveries {
  byProviderMessageId = new Map<string, NotificationDelivery>();
  throwOnLookup = false;
  async save(): Promise<string> {
    throw new Error("not used by this command");
  }
  async update(): Promise<void> {
    throw new Error("not used by this command");
  }
  async findByProviderMessageId(providerMessageId: string): Promise<NotificationDelivery | null> {
    if (this.throwOnLookup) throw new Error("connection dropped");
    return this.byProviderMessageId.get(providerMessageId) ?? null;
  }
}

let suppressions: FakeSuppressions;
let deliveries: FakeDeliveries;
let cmd: HandleResendWebhookInternalCommand;

beforeEach(() => {
  suppressions = new FakeSuppressions();
  deliveries = new FakeDeliveries();
  cmd = new HandleResendWebhookInternalCommand(suppressions as never, deliveries as never);
});

describe("events that stop us writing to an address", () => {
  it("suppresses on a hard bounce", async () => {
    const out = await cmd.execute({
      type: "email.bounced",
      data: { to: ["ana@ntizo.test"], bounce: { type: "Permanent" } },
    });
    expect(out.suppressed).toBe(true);
    expect(suppressions.calls[0]).toMatchObject({ email: "ana@ntizo.test", reason: "bounce" });
  });

  it("suppresses on a complaint", async () => {
    await cmd.execute({ type: "email.complained", data: { to: ["ana@ntizo.test"] } });
    expect(suppressions.calls[0]!.reason).toBe("complaint");
  });

  it("suppresses every recipient the event names", async () => {
    await cmd.execute({
      type: "email.bounced",
      data: { to: ["ana@ntizo.test", "luc@ntizo.test"], bounce: { type: "Permanent" } },
    });
    expect(suppressions.calls.map((c) => c.email).sort()).toEqual([
      "ana@ntizo.test",
      "luc@ntizo.test",
    ]);
  });
});

describe("events that must not", () => {
  it("ignores a delivered event", async () => {
    const out = await cmd.execute({ type: "email.delivered", data: { to: ["ana@ntizo.test"] } });
    expect(out.suppressed).toBe(false);
    expect(suppressions.calls).toEqual([]);
  });

  it("ignores an opened event", async () => {
    await cmd.execute({ type: "email.opened", data: { to: ["ana@ntizo.test"] } });
    expect(suppressions.calls).toEqual([]);
  });

  it("does NOT suppress on a soft bounce", async () => {
    // A full mailbox is temporary. Suppressing permanently for it would lose a
    // real recipient forever over a week they were on holiday — and there is
    // no un-suppression path to rescue them.
    const out = await cmd.execute({
      type: "email.bounced",
      data: { to: ["ana@ntizo.test"], bounce: { type: "Transient" } },
    });
    expect(out.suppressed).toBe(false);
    expect(suppressions.calls).toEqual([]);
  });

  it("ignores an event type nobody anticipated", async () => {
    // A provider adds event types without asking. An unknown one must be a
    // no-op, not a crash that makes them retry it forever.
    const out = await cmd.execute({ type: "email.something.new", data: { to: ["a@b.test"] } });
    expect(out.suppressed).toBe(false);
  });

  it("ignores an event with no recipient", async () => {
    const out = await cmd.execute({
      type: "email.bounced",
      data: { bounce: { type: "Permanent" } },
    });
    expect(out.suppressed).toBe(false);
  });
});

describe("R8: only an explicit Permanent suppresses", () => {
  it("does NOT suppress on Undetermined", async () => {
    const out = await cmd.execute({
      type: "email.bounced",
      data: { to: ["ana@ntizo.test"], bounce: { type: "Undetermined" } },
    });
    expect(out.suppressed).toBe(false);
    expect(suppressions.calls).toEqual([]);
  });

  it("does NOT suppress on an absent bounce.type, and logs it so it is not silent", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const out = await cmd.execute({
        type: "email.bounced",
        data: { to: ["ana@ntizo.test"] },
      });
      expect(out.suppressed).toBe(false);
      expect(suppressions.calls).toEqual([]);
      expect(logged).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls[0]![0]).toBe(
        "[handle-resend-webhook] bounce with unrecognized bounce.type",
      );
      expect(logged.mock.calls[0]![1]).toEqual({
        type: "email.bounced",
        bounceType: undefined,
      });
    } finally {
      logged.mockRestore();
    }
  });

  it("does NOT suppress on an unrecognized bounce.type, and logs it too", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const out = await cmd.execute({
        type: "email.bounced",
        data: { to: ["ana@ntizo.test"], bounce: { type: "SoftBounced" } },
      });
      expect(out.suppressed).toBe(false);
      expect(logged.mock.calls[0]![1]).toEqual({
        type: "email.bounced",
        bounceType: "SoftBounced",
      });
    } finally {
      logged.mockRestore();
    }
  });
});

describe("R7: best-effort correlation never blocks the suppression", () => {
  it("enriches the suppression detail with which notification bounced, when the lookup finds one", async () => {
    deliveries.byProviderMessageId.set(
      "resend-123",
      NotificationDelivery.rehydrate({
        id: "d1",
        notificationId: "n1",
        type: NotificationType.Welcome,
        channel: "EMAIL",
        toEmail: "ana@ntizo.test",
        locale: "pt-MZ",
        status: "sent",
        providerMessageId: "resend-123",
        error: null,
      }),
    );

    await cmd.execute({
      type: "email.bounced",
      data: { to: ["ana@ntizo.test"], email_id: "resend-123", bounce: { type: "Permanent" } },
    });

    expect(suppressions.calls[0]!.detail).toMatchObject({
      notification: { id: "n1", type: NotificationType.Welcome },
    });
  });

  it("still suppresses when the lookup throws — the lookup is best-effort, the suppression is not", async () => {
    deliveries.throwOnLookup = true;
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const out = await cmd.execute({
        type: "email.bounced",
        data: { to: ["ana@ntizo.test"], email_id: "resend-123", bounce: { type: "Permanent" } },
      });
      expect(out.suppressed).toBe(true);
      expect(suppressions.calls[0]).toMatchObject({ email: "ana@ntizo.test", reason: "bounce" });
    } finally {
      logged.mockRestore();
    }
  });
});
