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
  return <Badge tone={STATUS_TONE[status]}>{t(`status.${status}`)}</Badge>;
}
