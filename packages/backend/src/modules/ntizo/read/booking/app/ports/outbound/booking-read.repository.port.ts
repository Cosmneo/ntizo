import type { CustomerBookingTab } from "@ntizo/shared";
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

  paidAt: Date | null;

  createdAt: Date;
}

export interface BookingReadRepositoryPort {
  /** One tab of the customer's own bookings, paged. `DRAFT` never appears. See `CUSTOMER_TAB_STATUSES`. */
  listForCustomer(
    customerId: string,
    filter: CustomerListFilter,
    limit: number,
    offset: number,
  ): Promise<BookingListRow[]>;
  /** How many `listForCustomer` would return unpaged — the pager's denominator. */
  countForCustomer(customerId: string, filter: CustomerListFilter): Promise<number>;
  /** All three tab counts in one grouped read — the chips are on screen whichever tab is open. */
  countsForCustomer(
    customerId: string,
    now: Date,
  ): Promise<{ waiting: number; upcoming: number; history: number }>;

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

  /** The workspace's bookings for one tab, paged. `DRAFT` never appears. See `PROVIDER_TAB_STATUSES`. */
  listForProvider(
    providerId: string,
    filter: ProviderListFilter,
    limit: number,
    offset: number,
  ): Promise<ProviderBookingRow[]>;
  /** How many `listForProvider` would return unpaged — the list shows "a mostrar 8 de 23". */
  countForProvider(providerId: string, filter: ProviderListFilter): Promise<number>;
  /** One booking, only if it is this workspace's — `providerId` in the WHERE, as `findForCustomer` does. `DRAFT` answers null. */
  findForProvider(bookingId: string, providerId: string): Promise<ProviderBookingRow | null>;
  /** Every `booking_change` row, oldest first. */
  timelineFor(bookingId: string): Promise<ProviderTimelineRow[]>;
  /** The workspace's members with a first name to show, for the list's filter. */
  membersOf(providerId: string): Promise<ProviderMemberOption[]>;
  /**
   * Every number the dashboard shows, for one workspace, as of `now`. Day
   * boundaries are the workspace's own (`provider.timezone`), resolved in
   * Postgres — a "today" computed in the Worker's UTC would be wrong for two
   * hours a day in Maputo and wrong for half of one in a DST market.
   */
  statsForProvider(providerId: string, now: Date): Promise<ProviderStats>;
}

/**
 * The three the list page draws, plus one the dashboard reads: `all` is every
 * booking the workspace was asked about, newest first. It is not a tab — no
 * screen offers it as a choice — but it is the same query with the status
 * clause dropped, so it lives here rather than in a second method.
 */
export type ProviderListTab = "requests" | "upcoming" | "history" | "all";

export interface ProviderListFilter {
  tab: ProviderListTab;
  /** Matches the customer's first name and the service name; null means no search. */
  q: string | null;
  /** `provider_member.id`; null means every member and "anyone". */
  memberId: string | null;
  /** Injected, never `new Date()` inside the query — a test has to be able to say what "upcoming" means. */
  now: Date;
}

/** The statuses each *tab* lists. `all` is absent on purpose: it filters on no status at all. */
export const PROVIDER_TAB_STATUSES: Record<Exclude<ProviderListTab, "all">, readonly string[]> = {
  requests: ["AWAITING_PROVIDER"],
  upcoming: ["PENDING_PAYMENT", "CONFIRMED"],
  history: ["MARKED_DONE", "COMPLETED", "DISPUTED", "DECLINED", "CANCELLED", "EXPIRED"],
};

export interface CustomerListFilter {
  tab: CustomerBookingTab;
  /** Injected, never `new Date()` inside the query — a test has to be able to say when "upcoming" ends. */
  now: Date;
}

/**
 * The statuses each of the customer's tabs lists.
 *
 * `PENDING_PAYMENT` is a *wait*, so it sits with the other wait rather than
 * with the provider's `upcoming`, which groups it with `CONFIRMED` because a
 * provider is preparing for both. The two zones are looking at the same rows
 * and asking different questions of them.
 *
 * `upcoming` is further split by `startsAt` against `now`; `history` takes
 * the confirmed bookings that split leaves behind. The three future statuses
 * are listed under `history` so that whoever builds the transitions into them
 * does not have to revisit this map.
 */
export const CUSTOMER_TAB_STATUSES: Record<CustomerBookingTab, readonly string[]> = {
  waiting: ["AWAITING_PROVIDER", "PENDING_PAYMENT"],
  upcoming: ["CONFIRMED"],
  history: ["MARKED_DONE", "COMPLETED", "DISPUTED", "DECLINED", "CANCELLED", "EXPIRED"],
};

/**
 * One booking as the provider's list and page read it. Every column the
 * detail needs is here too: the list simply does not pass the last few on.
 * One row shape for both queries, so a column wired into only one of them
 * cannot give the same booking two contents.
 */
export interface ProviderBookingRow {
  id: string;
  status: string;
  createdAt: Date;
  customerId: string;
  serviceId: string;
  serviceOptionId: string;
  serviceName: string;
  optionName: string;
  durationMinutes: number;
  locationType: string | null;
  providerMemberId: string | null;
  memberFirstName: string | null;
  customerFirstName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  addressLabel: string | null;
  addressLine: string | null;
  addressCity: string | null;
  addressDistrict: string | null;
  addressDirections: string | null;
  description: string | null;
  paymentRef: string | null;
  priceMinor: number;
  commissionBps: number;
  commissionMinor: number;
  currency: string;
  expiresAt: Date | null;
}

export interface ProviderTimelineRow {
  changedAt: Date;
  changedByUserId: string | null;
  reason: string;
}

export interface ProviderMemberOption {
  id: string;
  firstName: string;
}

/** The dashboard's numbers, before the projection shapes them. `currency` and `today` are null-safe on the projection's side, not here. */
export interface ProviderStatsRow {
  awaitingResponse: number;
  awaitingPayment: number;
  upcomingToday: number;
  upcomingWeek: number;
  completedLast30: number;
  declinedLast30: number;
  revenueLast30Minor: number;
  pipelineMinor: number;
  /**
   * The workspace's own currency, taken off its bookings — `max()` over them,
   * so a workspace that somehow held two would answer with one of the two
   * rather than a total in neither. Null when it has no bookings at all.
   */
  currency: string | null;
  /** The provider's local day for `now`, `YYYY-MM-DD` — the last bucket of the chart. */
  today: string;
}

/** One local day with something in it. Days with nothing are absent — the projection fills them. */
export interface ProviderStatsDayRow {
  date: string;
  requests: number;
  confirmed: number;
}

export interface ProviderStats {
  totals: ProviderStatsRow;
  perDay: ProviderStatsDayRow[];
}
