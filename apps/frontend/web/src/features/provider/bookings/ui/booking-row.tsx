import { Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import type { ProviderBookingDTO } from "@ntizo/shared/read-models";
import type {
  CollectionColumn,
  CollectionRow,
} from "@/shared/components/collection-card";
import { compactSlotWording } from "@/features/checkout/domain/slot-wording";
import { formatMoney } from "@/features/wallet/domain/money";
import { timeLeftWording } from "../domain/status";
import { BookingStatusBadge } from "./booking-status-badge";

/**
 * The list's five columns. The dashboard passes a subset — a column the card
 * does not receive is not drawn, and the cell for it is simply never read.
 */
export function bookingColumns(t: TFunction<"provider">): CollectionColumn[] {
  return [
    { key: "customer", label: t("bookings.col.customer"), className: "pl-5" },
    { key: "service", label: t("bookings.col.service"), skeletonWidth: "w-40" },
    { key: "when", label: t("bookings.col.when"), skeletonWidth: "w-28" },
    {
      key: "price",
      label: t("bookings.col.price"),
      align: "right",
      skeletonWidth: "w-20",
    },
    {
      key: "status",
      label: t("bookings.col.status"),
      skeletonWidth: "w-24",
      skeletonShape: "badge",
      className: "pr-5",
    },
  ];
}

/**
 * One row, built once for the two screens that show bookings in a table. The
 * list and the dashboard differ in which columns they ask for, never in what
 * a row says.
 *
 * `now` is passed in rather than read here, because the countdown must be
 * measured from the moment the page was answered — every row on screen then
 * counts down from one instant, and a re-render for an unrelated reason
 * cannot move the clock a minute while nothing about the data changed.
 */
export function bookingRow(
  b: ProviderBookingDTO,
  ctx: { slug: string; locale: string; now: Date; t: TFunction<"provider"> },
): CollectionRow {
  const { slug, locale, now, t } = ctx;
  const slot = compactSlotWording(b.startsAt, b.endsAt, locale, b.timezone);
  const left = b.respondBy ? timeLeftWording(b.respondBy, now) : null;
  return {
    key: b.id,
    // The customer's name *is* the way into the booking: the row has no other
    // link, and a whole-row click handler is not one — it cannot be tabbed
    // to, opened in a new tab, or read out as a destination.
    primary: (
      <Link
        to="/provider/$slug/bookings/$bookingId"
        params={{ slug, bookingId: b.id }}
        className="type-body-medium block font-semibold hover:underline"
      >
        {b.customerFirstName}
      </Link>
    ),
    cells: {
      service: `${b.serviceName} · ${b.memberFirstName ?? t("bookings.memberAnyone")}`,
      when: (
        <span className="tabular-nums">
          {slot.date} · {slot.start}
        </span>
      ),
      price: (
        <span className="tabular-nums">
          {formatMoney(b.priceMinor, b.currency, locale)}
        </span>
      ),
      status: (
        <span className="inline-flex items-center gap-2">
          <BookingStatusBadge status={b.status} />
          {left && (
            <span className="type-caption text-[var(--color-muted-foreground)]">
              {left}
            </span>
          )}
        </span>
      ),
    },
  };
}
