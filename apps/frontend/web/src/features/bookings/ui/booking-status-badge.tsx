import { useTranslation } from "react-i18next";
import { Badge } from "@ntizo/frontend-ui";
import { STATUS_TONE, type CustomerBookingStatus } from "../domain/status";

/**
 * A booking's status as one pill, in one place.
 *
 * The tone comes from the domain's table and the word from the locale file;
 * nothing about either is decided here. The tone-to-class map lives in
 * `Badge` itself, copied verbatim from the provider zone's own badge — the
 * same status must read as the same colour whichever side of the platform
 * is looking at it, even though the *word* and the *tone* it is paired with
 * are each zone's own call (see `STATUS_TONE`'s comment).
 */
export function BookingStatusBadge({
  status,
}: {
  status: CustomerBookingStatus;
}) {
  const { t } = useTranslation("bookings");
  // **A `defaultValue`, because i18next's own default is the raw key.**
  // `CustomerBookingStatus` is every `BookingDTO` status, `DRAFT` included,
  // and `status.DRAFT` exists in none of the eight locales — correctly, since
  // a draft is a checkout half-finished and appears on no customer page. But
  // "correctly absent" and "safe to render" are different claims: before the
  // pages guarded it, `/bookings/<a draft's id>` printed a pill reading
  // `status.DRAFT`. `BookingPage` and `BookingsPage` now refuse to draw a
  // draft at all, so this line should be unreachable; the fallback is what
  // makes that "should" cost a plain token rather than a leaked key id, for
  // this status and for any future one whose word lands late.
  return (
    <Badge tone={STATUS_TONE[status]}>{t(`status.${status}`, { defaultValue: status })}</Badge>
  );
}
