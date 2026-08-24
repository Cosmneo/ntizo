import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { NotificationDelivery } from "../domain/aggregates/notification-delivery.aggregate";
import { UnknownNotificationTypeError } from "../domain/exceptions";

const base = {
  type: NotificationType.Welcome,
  toEmail: "ana@ntizo.test",
  locale: "pt-MZ",
};

describe("NotificationDelivery.queue", () => {
  it("starts queued, with nothing to report yet", () => {
    const d = NotificationDelivery.queue(base);
    expect(d.status).toBe("queued");
    expect(d.providerMessageId).toBeNull();
    expect(d.error).toBeNull();
  });

  it("stands alone when no notification is behind it", () => {
    expect(NotificationDelivery.queue(base).notificationId).toBeNull();
  });

  it("is EMAIL, because that is the only channel built", () => {
    expect(NotificationDelivery.queue(base).channel).toBe("EMAIL");
  });

  it("refuses a type the platform does not define", () => {
    expect(() =>
      NotificationDelivery.queue({ ...base, type: "INVENTED" as NotificationType }),
    ).toThrow(UnknownNotificationTypeError);
  });
});

describe("what a delivery becomes", () => {
  it("carries the provider's id once it is sent, so a bounce can find it", () => {
    const sent = NotificationDelivery.queue(base).markSent("resend_abc123");
    expect(sent.status).toBe("sent");
    expect(sent.providerMessageId).toBe("resend_abc123");
  });

  it("keeps the reason when it fails", () => {
    const failed = NotificationDelivery.queue(base).markFailed("rate limited");
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("rate limited");
  });

  it("records a suppressed address as never having been attempted", () => {
    // Not "failed": nothing was tried. A failure invites a retry; this is a
    // refusal, and the two must not read the same in the audit.
    const s = NotificationDelivery.suppressed(base);
    expect(s.status).toBe("suppressed");
    expect(s.providerMessageId).toBeNull();
    expect(s.error).toBeNull();
  });

  it("does not mutate the delivery it came from", () => {
    const queued = NotificationDelivery.queue(base);
    queued.markSent("resend_abc123");
    expect(queued.status).toBe("queued");
  });
});
