import type { NotificationDTO } from "@ntizo/shared/read-models";

/**
 * Which zone is drawing the inbox — the thing that decides *where* a row's
 * target lives, not *what* it is.
 *
 * Its own type rather than `InboxScope` from the viewmodel: the boundaries
 * lint forbids `domain` importing `viewmodel`, and the two answer different
 * questions anyway. A scope says which query feeds the list (a person's, a
 * workspace's); a zone says which routes surround it, and the workspace's
 * routes need the slug the scope does not carry.
 */
export type InboxZone = { kind: "customer" } | { kind: "provider"; slug: string };

export interface NotificationTarget {
  /** What kind of thing the row opens — the cell picks its fallback sentence by this. */
  kind: "booking" | "thread";
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
}

/**
 * The bookings a person is told about in their own inbox: every one of these
 * has a page under `/bookings/$bookingId` in the customer zone. Provider-side
 * types are listed separately because their page is under the workspace.
 */
const CUSTOMER_BOOKING_TYPES = new Set([
  "BOOKING_ACCEPTED",
  "BOOKING_DECLINED",
  "BOOKING_CONFIRMED",
  "BOOKING_MARKED_DONE",
  "BOOKING_DISPUTE_RESOLVED",
]);

/**
 * Raised to the provider and to administrators — never to the customer who
 * opened the dispute (`DisputeBookingCommand`). So a person's inbox showing
 * one is an admin's, and the booking page under `/bookings` would tell them
 * "not found" for a booking they do not own; the dispute's thread is what
 * they can read. In a workspace it is one of the workspace's bookings.
 */
const DISPUTE_TYPE = "BOOKING_DISPUTED";

const PROVIDER_BOOKING_TYPES = new Set([
  "PROVIDER_BOOKING_RECEIVED",
  "PROVIDER_BOOKING_CONFIRMED",
  "PROVIDER_BOOKING_CANCELLED_BY_CUSTOMER",
  "PROVIDER_BOOKING_CLOSE_REMINDER",
  "PROVIDER_BOOKING_AUTO_CLOSED",
]);

/** Conversations the reader takes part in, in whichever zone they are reading. */
const THREAD_TYPES = new Set(["NEW_MESSAGE", "SUPPORT_REPLY", "SUPPORT_REQUEST_RESOLVED"]);

/** Raised to admins only; their thread page is the admin's, whatever inbox shows the row. */
const ADMIN_THREAD_TYPES = new Set(["SUPPORT_REQUEST_OPENED", "SUPPORT_REQUEST_MESSAGE"]);

function stringAt(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Where a row goes when it is clicked, or `null` when it is only news.
 *
 * A lookup that reads the payload rather than trusting the type alone: the
 * read model calls the payload "deliberately unconstrained", so a booking
 * notification whose `bookingId` is missing or not a string renders as a plain
 * row instead of a link to `/bookings/undefined`. An unknown type is `null`
 * for the same reason `presentationFor` falls back — a deploy skew must not
 * turn into a broken link.
 *
 * The zone decides the route family. A booking notification in a person's
 * inbox opens `/bookings/$bookingId`; the same notification type never
 * appears in a workspace inbox, and the provider-side types never appear in
 * a person's — but both are keyed by zone rather than by type so that a row
 * rendered in the wrong zone still points somewhere that exists.
 */
export function targetFor(
  notification: Pick<NotificationDTO, "type" | "payload">,
  zone: InboxZone,
): NotificationTarget | null {
  const { type, payload } = notification;

  if (type === DISPUTE_TYPE && zone.kind === "customer") {
    const threadId = stringAt(payload, "threadId");
    if (!threadId) return null;
    return { kind: "thread", to: "/admin/support/$threadId", params: { threadId } };
  }

  if (CUSTOMER_BOOKING_TYPES.has(type) || PROVIDER_BOOKING_TYPES.has(type) || type === DISPUTE_TYPE) {
    const bookingId = stringAt(payload, "bookingId");
    if (!bookingId) return null;
    return zone.kind === "provider"
      ? {
          kind: "booking",
          to: "/provider/$slug/bookings/$bookingId",
          params: { slug: zone.slug, bookingId },
        }
      : { kind: "booking", to: "/bookings/$bookingId", params: { bookingId } };
  }

  if (ADMIN_THREAD_TYPES.has(type)) {
    const threadId = stringAt(payload, "threadId");
    if (!threadId) return null;
    return { kind: "thread", to: "/admin/support/$threadId", params: { threadId } };
  }

  if (THREAD_TYPES.has(type)) {
    const threadId = stringAt(payload, "threadId");
    if (!threadId) return null;
    return zone.kind === "provider"
      ? {
          kind: "thread",
          to: "/provider/$slug/messages",
          params: { slug: zone.slug },
          search: { thread: threadId },
        }
      : { kind: "thread", to: "/messages", search: { thread: threadId } };
  }

  return null;
}
