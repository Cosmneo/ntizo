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

  it("ignores an event whose `to` is not an array", async () => {
    // Resend's docs say `data.to` is an array. If a future shape drift ever
    // sends a bare string instead, `for...of` over a string iterates one
    // character at a time — without this guard that would call `suppress()`
    // once per character while the real address goes unsuppressed, and there
    // is no un-suppression path to undo the junk rows.
    const out = await cmd.execute({
      type: "email.bounced",
      data: { to: "ana@ntizo.test" as unknown as string[], bounce: { type: "Permanent" } },
    });
    expect(out.suppressed).toBe(false);
    expect(suppressions.calls).toEqual([]);
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
      // toStrictEqual, not toEqual: Bun's `toEqual` treats a missing key the
      // same as a key present with value `undefined`, so it would still pass
      // if `bounceType: kind` were deleted from the logged object entirely —
      // vacuous. toStrictEqual requires the key to actually be there.
      expect(logged.mock.calls[0]![1]).toStrictEqual({
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
      expect(logged.mock.calls[0]![1]).toStrictEqual({
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

  // The next three pin `detail` on every fallback path that returns
  // `event.data ?? null` (no `email_id`, `email_id` present but unmatched,
  // and the lookup throwing). `suppress()` is `ON CONFLICT DO NOTHING`, so a
  // suppression is written exactly once, ever — a `detail` that silently
  // became `null` on any of these paths is unrecoverable, and it is the
  // *only* evidence a bounce investigation has for every address we cannot
  // correlate back to a delivery row (see `email-suppression.schema.ts`'s own
  // doc comment). Without these, a refactor collapsing any one of the three
  // fallback returns to `return null` still leaves every test in this file
  // green.
  it("falls back to the raw event body as detail when there is no email_id to correlate", async () => {
    const event = {
      type: "email.bounced",
      data: { to: ["ana@ntizo.test"], bounce: { type: "Permanent" } },
    };
    await cmd.execute(event);
    expect(suppressions.calls[0]!.detail).toStrictEqual(event.data);
  });

  it("falls back to the raw event body as detail when email_id matches no delivery", async () => {
    const event = {
      type: "email.bounced",
      data: {
        to: ["ana@ntizo.test"],
        email_id: "resend-unknown",
        bounce: { type: "Permanent" },
      },
    };
    await cmd.execute(event); // deliveries.byProviderMessageId is empty — no match
    expect(suppressions.calls[0]!.detail).toStrictEqual(event.data);
  });

  it("still suppresses when the lookup throws, falls back to the raw event body as detail, and logs the failure", async () => {
    deliveries.throwOnLookup = true;
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const event = {
        type: "email.bounced",
        data: {
          to: ["ana@ntizo.test"],
          email_id: "resend-123",
          bounce: { type: "Permanent" },
        },
      };
      const out = await cmd.execute(event);
      expect(out.suppressed).toBe(true);
      expect(suppressions.calls[0]).toMatchObject({ email: "ana@ntizo.test", reason: "bounce" });
      expect(suppressions.calls[0]!.detail).toStrictEqual(event.data);
      expect(logged).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls[0]![0]).toBe(
        "[handle-resend-webhook] provider-message lookup failed",
      );
      expect(logged.mock.calls[0]![1]).toBeInstanceOf(Error);
    } finally {
      logged.mockRestore();
    }
  });
});
