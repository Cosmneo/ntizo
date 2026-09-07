import { describe, expect, it } from "vitest";
import type { NotificationDTO } from "@ntizo/shared/read-models";
import { targetFor } from "@/features/notifications/domain/notification-target";

function item(type: string, payload: Record<string, unknown>): NotificationDTO {
  return { id: "n1", type, payload, createdAt: "2026-09-07T08:00:00.000Z", read: false };
}

const CUSTOMER = { kind: "customer" } as const;
const PROVIDER = { kind: "provider", slug: "clean-fresh" } as const;

describe("targetFor", () => {
  it("sends a customer's booking notification to that booking", () => {
    expect(targetFor(item("BOOKING_CONFIRMED", { bookingId: "bk-1" }), CUSTOMER)).toEqual({
      kind: "booking",
      to: "/bookings/$bookingId",
      params: { bookingId: "bk-1" },
    });
  });

  it("sends a workspace's booking notification to the workspace's own booking page", () => {
    expect(targetFor(item("PROVIDER_BOOKING_RECEIVED", { bookingId: "bk-2" }), PROVIDER)).toEqual({
      kind: "booking",
      to: "/provider/$slug/bookings/$bookingId",
      params: { slug: "clean-fresh", bookingId: "bk-2" },
    });
  });

  it("opens the conversation a message notification is about", () => {
    expect(targetFor(item("NEW_MESSAGE", { threadId: "th-1" }), CUSTOMER)).toEqual({
      kind: "thread",
      to: "/messages",
      search: { thread: "th-1" },
    });
    expect(targetFor(item("SUPPORT_REPLY", { threadId: "th-2", subject: "Reembolso" }), PROVIDER)).toEqual({
      kind: "thread",
      to: "/provider/$slug/messages",
      params: { slug: "clean-fresh" },
      search: { thread: "th-2" },
    });
  });

  it("sends the admin's support notifications to the admin's own thread page", () => {
    // These two types are raised only to admins, whatever inbox renders them.
    expect(targetFor(item("SUPPORT_REQUEST_OPENED", { threadId: "th-3" }), CUSTOMER)).toEqual({
      kind: "thread",
      to: "/admin/support/$threadId",
      params: { threadId: "th-3" },
    });
  });

  it("sends a dispute in the personal inbox to the admin's thread, not to a booking the reader does not own", () => {
    // `DisputeBookingCommand` raises BOOKING_DISPUTED to the provider and to
    // administrators — never to the disputing customer. A person's inbox
    // showing one is therefore an admin's, and `/bookings/$bookingId` would
    // land them on "not found"; the thread is theirs to read.
    expect(
      targetFor(item("BOOKING_DISPUTED", { bookingId: "bk-9", threadId: "th-9" }), CUSTOMER),
    ).toEqual({
      kind: "thread",
      to: "/admin/support/$threadId",
      params: { threadId: "th-9" },
    });
    // The provider's copy still opens the workspace's own booking page.
    expect(
      targetFor(item("BOOKING_DISPUTED", { bookingId: "bk-9", threadId: "th-9" }), PROVIDER),
    ).toEqual({
      kind: "booking",
      to: "/provider/$slug/bookings/$bookingId",
      params: { slug: "clean-fresh", bookingId: "bk-9" },
    });
  });

  it("has nowhere to send a type that is only news", () => {
    expect(targetFor(item("WELCOME", {}), CUSTOMER)).toBeNull();
    expect(targetFor(item("PROVIDER_VERIFIED", {}), PROVIDER)).toBeNull();
  });

  it("has nowhere to send a booking notification whose payload lost its id", () => {
    // The read model calls the payload "deliberately unconstrained": a row
    // without the key must render as a plain row, not as a link to nowhere.
    expect(targetFor(item("BOOKING_CONFIRMED", {}), CUSTOMER)).toBeNull();
    expect(targetFor(item("NEW_MESSAGE", { threadId: 42 }), CUSTOMER)).toBeNull();
  });

  it("has nowhere to send a type it has never heard of", () => {
    expect(targetFor(item("INVENTED_TYPE_NOBODY_SHIPPED", { bookingId: "x" }), CUSTOMER)).toBeNull();
  });
});
