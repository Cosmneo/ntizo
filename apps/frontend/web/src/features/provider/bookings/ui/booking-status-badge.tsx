import { useTranslation } from "react-i18next";
import { Badge } from "@ntizo/frontend-ui";
import { STATUS_TONE, type ProviderBookingStatus } from "../domain/status";

/**
 * A booking's status as one pill, in one place.
 *
 * The list and the booking page both draw it, and a status whose colour is
 * decided at each call site is a status that eventually reads "Confirmada" in
 * red on one screen and green on the other. The tone comes from the domain's
 * table and the word from the locale file; nothing about either is decided
 * here.
 */
export function BookingStatusBadge({ status }: { status: ProviderBookingStatus }) {
  const { t } = useTranslation("provider");
  return <Badge tone={STATUS_TONE[status]}>{t(`bookings.status.${status}`)}</Badge>;
}
