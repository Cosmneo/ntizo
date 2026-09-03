import type { BookingDTO } from "@ntizo/shared/read-models";
import { CUSTOMER_BOOKING_TABS, type CustomerBookingTab } from "@ntizo/shared";

export type CustomerBookingStatus = BookingDTO["status"];
export type BadgeTone = "info" | "success" | "danger" | "warning" | "neutral";
export { CUSTOMER_BOOKING_TABS, type CustomerBookingTab };

/** Rows per page; the repository and the pager share it. */
export const CUSTOMER_BOOKINGS_PAGE_SIZE = 20;

/**
 * The chip's colour per status, from the customer's side.
 *
 * Warning is spent on the one status where somebody else is deciding, info on
 * the one where the customer is. It differs from the provider's table for
 * that reason and not by accident: there, `PENDING_PAYMENT` is information
 * about a customer, and here it is the customer's own task.
 */
export const STATUS_TONE: Record<CustomerBookingStatus, BadgeTone> = {
  DRAFT: "neutral",
  AWAITING_PROVIDER: "warning",
  PENDING_PAYMENT: "info",
  CONFIRMED: "success",
  MARKED_DONE: "neutral",
  COMPLETED: "neutral",
  DISPUTED: "danger",
  DECLINED: "danger",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
};

/** Enough to say over the phone; not a second id. */
export function shortReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/**
 * The deadline this booking is actually running, or null.
 *
 * `expiresAt` is one column meaning three things and it is never cleared, so
 * a countdown driven off the date alone shows an expired timer on a booking
 * that is paid and confirmed. Read the status first — see
 * `bookingReadModel.expiresAt`'s own comment.
 */
export function deadlineOf(
  b: Pick<BookingDTO, "status" | "expiresAt">,
): string | null {
  if (b.status !== "AWAITING_PROVIDER" && b.status !== "PENDING_PAYMENT")
    return null;
  return b.expiresAt;
}

/** "1h42" or "20 min"; null once the deadline is behind us. */
export function timeLeftWording(deadlineIso: string, now: Date): string | null {
  const minutes = Math.floor(
    (new Date(deadlineIso).getTime() - now.getTime()) / 60_000,
  );
  if (minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

export function canCancel(status: CustomerBookingStatus): boolean {
  return status === "AWAITING_PROVIDER" || status === "PENDING_PAYMENT";
}

export function canPay(status: CustomerBookingStatus): boolean {
  return status === "PENDING_PAYMENT";
}
