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

  /**
   * Identity, not snapshot — see `bookingReadModel`'s own comment on the
   * pair. `NOT NULL` on the table, so never null in a row.
   */
  serviceId: string;
  serviceOptionId: string;

  serviceName: string;
  providerName: string;
  providerSlug: string;
  /**
   * The business's verified badge and score, joined live rather than
   * snapshotted — see `bookingReadModel`'s own comment on the pair for why
   * these two are the one place this row deliberately reports today's answer
   * instead of what was agreed.
   *
   * The average is already a rounded `number` by the time it is a row: the
   * repository coerces Postgres's string-or-null `avg()` on the way out, so
   * nothing downstream has to know that `avg()` is not a number.
   */
  providerVerified: boolean;
  providerRatingAverage: number | null;
  optionName: string;
  durationMinutes: number;

  /**
   * Where the work happens, joined off `service` rather than read off
   * `booking` — there is no such column. Null only ever means the `leftJoin`
   * found nothing, which a `NOT NULL` FK makes unreachable; see
   * `bookingReadModel.locationType` for why the join is left anyway, and for
   * why this one is live where the rest of the agreement is snapshotted.
   */
  locationType: string | null;

  priceMinor: number;
  commissionBps: number;
  commissionMinor: number;
  currency: string;

  startsAt: Date;
  endsAt: Date;

  /**
   * The provider's IANA zone, joined rather than read off `booking` — there
   * is no such column, and this is deliberately not part of the snapshot.
   * See `bookingReadModel.timezone` for the argument, and for the defect a
   * reader that has to fall back to the device's zone reproduces.
   */
  timezone: string;

  // Nullable for the same reason `bookingReadModel` widened: null on a
  // DRAFT means the customer has not reached checkout's step 2 yet, and
  // `Booking.submit` refuses to move a booking past DRAFT without one.
  addressLabel: string | null;
  addressLine: string | null;
  addressCity: string | null;
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

  /**
   * One booking, but only if it is this customer's own.
   *
   * **`customerId` is a parameter of the query, not a check the caller runs
   * afterward**, and that is the whole shape of this method. An
   * implementation that read by id and then compared `row.customerId` would
   * have the wrong customer's booking in memory for the length of that
   * comparison — one `if` away from being returned, logged, or read by
   * whatever gets added between the read and the check. Expressed as a
   * `WHERE` clause there is no such window: the row either belongs to the
   * caller or it never arrives.
   *
   * `null` covers both "no such booking" and "not yours", deliberately
   * undistinguished: telling an unrelated caller which of the two it was
   * would confirm that a given id names a real booking.
   */
  findForCustomer(bookingId: string, customerId: string): Promise<BookingListRow | null>;
}
