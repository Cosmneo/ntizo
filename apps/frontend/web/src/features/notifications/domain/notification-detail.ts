import type { NotificationDTO } from "@ntizo/shared/read-models";
import { formatMoney } from "@/features/wallet/domain/money";

/** The types whose payload describes a booking — the only ones with a line to add. */
const BOOKING_TYPES = new Set([
  "BOOKING_ACCEPTED",
  "BOOKING_DECLINED",
  "BOOKING_CONFIRMED",
  "BOOKING_MARKED_DONE",
  "BOOKING_DISPUTED",
  "BOOKING_DISPUTE_RESOLVED",
  "PROVIDER_BOOKING_RECEIVED",
  "PROVIDER_BOOKING_CONFIRMED",
  "PROVIDER_BOOKING_CANCELLED_BY_CUSTOMER",
  "PROVIDER_BOOKING_CLOSE_REMINDER",
  "PROVIDER_BOOKING_AUTO_CLOSED",
  "ADMIN_BOOKING_AUTO_CLOSED",
]);

/**
 * Who the booking is with, from the reader's side of it.
 *
 * Whichever name the payload carries, not a key chosen by type: the backend
 * puts `providerName` on the copies it sends to customers and administrators
 * and `customerFirstName` on the copies it sends to the workspace (present
 * and `null` when the command had no session to read a name from, see
 * `MarkBookingPaidCommand`) — and one type can go both ways.
 * `BOOKING_DISPUTED` reaches the provider with neither and the admin with
 * the provider's; a lookup by type would have to be wrong for one of them.
 */
function counterpart(payload: Record<string, unknown>): string | null {
  return stringAt(payload, "providerName") ?? stringAt(payload, "customerFirstName");
}

/** The one row whose next step is paying, so the one row whose line says how much. */
const PRICED_TYPES = new Set(["BOOKING_ACCEPTED"]);

const SEPARATOR = " · ";

function stringAt(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function startsAt(payload: Record<string, unknown>, locale: string): string | null {
  const iso = stringAt(payload, "startsAt");
  if (!iso) return null;
  const date = new Date(iso);
  // A payload that says "soon" is a payload; printing "Invalid Date" under a
  // heading is a bug. Leave the slot out.
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function price(payload: Record<string, unknown>, locale: string): string | null {
  const minor = payload["priceMinor"];
  const currency = stringAt(payload, "currency");
  if (typeof minor !== "number" || !Number.isFinite(minor) || !currency) return null;
  return formatMoney(minor, currency, locale);
}

/**
 * The line under a row's sentence: the facts the payload carries that the
 * sentence does not.
 *
 * Only bookings have any. Their payload names the service, the other party,
 * the start time and the price, and a row that says "your booking is
 * confirmed" without saying which one makes the reader open every booking to
 * find out. Messages and support threads carry only a thread id and a
 * subject the sentence already prints, so they return `null` and the cell
 * decides what, if anything, to put there.
 *
 * Every slot is optional and missing slots are simply skipped — never an
 * empty segment, never the string "null" — because the read model calls the
 * payload "deliberately unconstrained" and this is where a wrong assumption
 * about it should fail softly.
 */
export function detailFor(
  notification: Pick<NotificationDTO, "type" | "payload">,
  locale: string,
): string | null {
  const { type, payload } = notification;
  if (!BOOKING_TYPES.has(type)) return null;

  const parts = [
    stringAt(payload, "serviceName"),
    counterpart(payload),
    startsAt(payload, locale),
    PRICED_TYPES.has(type) ? price(payload, locale) : null,
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(SEPARATOR) : null;
}
