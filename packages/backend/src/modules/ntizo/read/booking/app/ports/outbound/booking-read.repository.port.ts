import type { BookingDTO } from "@ntizo/shared/read-models";

/**
 * Exactly the columns `bookingReadModel` carries, in the shapes Postgres
 * hands back — `Date`, not the ISO strings the DTO crosses the wire with.
 * The projection is what stringifies them; a row is what a `SELECT` returns.
 *
 * Deliberately not a `Booking` aggregate. See `bootstrapBookingRead`'s doc
 * comment for why this reader does not go through
 * `BookingRepositoryPort`/`Booking.restore` the way `read/activity` and
 * `read/notification` reuse their write side's repository.
 */
export interface BookingListRow {
  id: string;
  /** A `BookingStatus` value — see that repository's own doc comment for why the cast off `booking.status` is safe. */
  status: BookingDTO["status"];

  serviceName: string;
  providerName: string;
  providerSlug: string;
  optionName: string;
  durationMinutes: number;

  priceMinor: number;
  commissionBps: number;
  commissionMinor: number;
  currency: string;

  startsAt: Date;
  endsAt: Date;

  addressLabel: string;
  addressLine: string;
  addressCity: string;
  addressDistrict: string | null;
  addressDirections: string | null;

  description: string | null;

  /**
   * Whichever of the three clocks this booking's status is standing on, never
   * cleared once it stops applying — read straight off `booking.expires_at`.
   * See `bookingReadModel` for which status carries which clock, and for why
   * a consumer must check the status before trusting the date.
   */
  expiresAt: Date | null;

  createdAt: Date;
}

export interface BookingReadRepositoryPort {
  /**
   * One customer's own bookings, newest first (by `createdAt`, the order in
   * which they were made — not `startsAt`, which is when the work happens
   * and can run either direction from today).
   *
   * Takes a `customerId` and nothing else: there is no paged variant and no
   * filter, because nothing in this task's scope needs one yet — see
   * `read/catalog`'s `listForProvider` for the same shape of "everything this
   * owner has" query with no pagination of its own.
   */
  listForCustomer(customerId: string): Promise<BookingListRow[]>;
}
