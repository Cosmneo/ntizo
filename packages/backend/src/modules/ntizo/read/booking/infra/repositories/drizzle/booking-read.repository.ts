import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { booking } from "../../../../../shared/infrastructure/database/booking/schemas";
import { service } from "../../../../../shared/infrastructure/database/catalog/schemas";
import {
  provider,
  providerDocument,
} from "../../../../../shared/infrastructure/database/provider/schemas";
import { review } from "../../../../../shared/infrastructure/database/review/schemas";
import type {
  BookingListRow,
  BookingReadRepositoryPort,
} from "../../../app/ports/outbound/booking-read.repository.port";

/**
 * A customer's own bookings, read straight off `booking` — exactly the
 * columns `bookingReadModel` carries, never a full row through
 * `Booking.restore`. See `bootstrapBookingRead`'s doc comment for why this
 * reader exists instead of reusing `DrizzleBookingRepository`.
 */
export class DrizzleBookingReadRepository implements BookingReadRepositoryPort {
  async listForCustomer(customerId: string): Promise<BookingListRow[]> {
    const db = getDb();
    const reviewAgg = reviewAggregate(db);
    const verifiedAgg = verifiedAggregate(db);

    const rows = await db
      .select(selectedColumns(reviewAgg, verifiedAgg))
      .from(booking)
      .innerJoin(provider, eq(provider.id, booking.providerId))
      .leftJoin(service, eq(service.id, booking.serviceId))
      .leftJoin(reviewAgg, eq(reviewAgg.providerId, provider.id))
      .leftJoin(verifiedAgg, eq(verifiedAgg.providerId, provider.id))
      .where(eq(booking.customerId, customerId))
      // Newest booking first, ties (two bookings made in the same instant)
      // broken by id so the order is total and stable across calls — the
      // same pairing `DrizzleActivityRepository.listForActor` orders by.
      .orderBy(desc(booking.createdAt), desc(booking.id));

    return rows.map(toRow);
  }

  async findForCustomer(bookingId: string, customerId: string): Promise<BookingListRow | null> {
    const db = getDb();
    const reviewAgg = reviewAggregate(db);
    const verifiedAgg = verifiedAggregate(db);

    const rows = await db
      .select(selectedColumns(reviewAgg, verifiedAgg))
      .from(booking)
      .innerJoin(provider, eq(provider.id, booking.providerId))
      .leftJoin(service, eq(service.id, booking.serviceId))
      .leftJoin(reviewAgg, eq(reviewAgg.providerId, provider.id))
      .leftJoin(verifiedAgg, eq(verifiedAgg.providerId, provider.id))
      // Both halves in the `WHERE`, never an id lookup followed by an
      // ownership `if` — see `BookingReadRepositoryPort.findForCustomer` for
      // why that is the point of this method. A booking belonging to
      // somebody else is not fetched and then rejected; it is not fetched.
      .where(and(eq(booking.id, bookingId), eq(booking.customerId, customerId)))
      .limit(1);

    const row = rows[0];
    return row ? toRow(row) : null;
  }
}

/**
 * The provider's review score, grouped to one row per provider.
 *
 * **A third copy**, not an import. The others are
 * `DrizzleProviderPublicRepository.aggregates().reviews` (`public/provider`)
 * and `reviewAggregate` in the catalogue's own service reader
 * (`bounded-contexts/catalog`); this reader lives in `read/booking`, and an
 * import from either would reach across a context boundary. **All three must
 * change together** — and three is one more than a duplicate ought to be, so
 * there is a follow-up to lift them into `shared/infrastructure/database`,
 * which both of the others already import their tables from.
 *
 * `status = 'published'` is load-bearing here exactly as it is there: without
 * it the rail would average reviews an administrator has not published, and
 * a customer would read one score at checkout and a different one on the
 * provider's page.
 *
 * Exported so a test can pin the `GROUP BY`: joined without it, one booking
 * multiplies into one row per review its provider has ever received.
 */
export function reviewAggregate(db: ReturnType<typeof getDb>) {
  return db
    .select({
      providerId: review.providerId,
      average: sql<string | null>`avg(${review.rating})`.as("review_avg"),
    })
    .from(review)
    .where(eq(review.status, "published"))
    .groupBy(review.providerId)
    .as("review_agg");
}

/**
 * Which providers have at least one document the platform has accepted, one
 * row each. The third copy of the pair described above, on the same terms.
 *
 * `selectDistinct` is load-bearing: a business with three accepted documents
 * must not multiply its bookings. So is `status = "accepted"` — the badge
 * means "the platform has accepted at least one of this business's
 * documents", never "this business uploaded one".
 */
export function verifiedAggregate(db: ReturnType<typeof getDb>) {
  return db
    .selectDistinct({
      providerId: sql<string>`${providerDocument.providerId}`.as("verified_provider_id"),
    })
    .from(providerDocument)
    .where(eq(providerDocument.status, "accepted"))
    .as("verified_agg");
}

/**
 * Postgres's `avg()` is a string, and null on an empty group. Neither is the
 * `number | null` `bookingReadModel` promises, and a string reaching it fails
 * output validation for the whole response rather than the one field.
 *
 * Rounded to one decimal to match `coerceReviewAggregate` in the catalogue's
 * reader and `toDTO` on the provider page: `review.rating` is an integer with
 * a 1–5 CHECK, so `avg()` returns `4.666666666666667`, and without the same
 * rounding in all three the same business would be a different number on the
 * checkout rail than on its own page.
 */
function coerceRating(average: string | null): number | null {
  return average === null ? null : Math.round(Number(average) * 10) / 10;
}

/**
 * Exactly the columns `BookingListRow` carries — never `select()` with no
 * argument, which would widen silently every time the table gains one.
 *
 * Built once and used by both queries so the two can never disagree about
 * what a row is: a column added to the read model and wired into only one of
 * them would give the same booking different content depending on whether the
 * customer reached it through the list or through its own page. A function
 * rather than a constant only because the aggregate subqueries are built per
 * call.
 *
 * **Four columns are not `booking`'s.** `provider.timezone` is joined in —
 * the booking table has no zone of its own, and the instants below mean
 * nothing without one — with an `innerJoin` rather than a left one, because
 * `booking.provider_id` is `NOT NULL` and references `provider.id`, so that
 * join can never drop a row.
 *
 * Two more are the business's live review score and verified badge,
 * `leftJoin`ed: an inner join would silently hide every booking whose
 * provider has no reviews or no accepted document, which is most of them, and
 * the customer's list would simply come back short with nothing failing. See
 * `bookingReadModel` for why these two alone are read live *by design*.
 *
 * The fourth is `service.location_type`, which checkout's rail turns into
 * "Em sua casa · 240 min" and into whether it may claim the travel is
 * included. **`leftJoin`ed even though the FK would let it be inner**, and
 * deliberately not on the same reasoning as `provider` above: that reasoning
 * is right and the bet is still not worth taking, because the two outcomes
 * are not comparable. A left join that never finds nothing costs one nullable
 * field the consumer already handles. An inner join that ever fails to match
 * removes the booking from its own customer's checkout, which then tells them
 * nothing is being held for them — and nothing anywhere fails. A mutation
 * check that flipped the *rating*'s left join to inner was applied on this
 * branch, and it was caught, not silent:
 * `list-my-bookings.projection.test.ts`'s `GetMyBookingProjection` case
 * fails when the booking vanishes.
 */
function selectedColumns(
  reviewAgg: ReturnType<typeof reviewAggregate>,
  verifiedAgg: ReturnType<typeof verifiedAggregate>,
) {
  return {
    id: booking.id,
    status: booking.status,
    serviceId: booking.serviceId,
    serviceOptionId: booking.serviceOptionId,
    serviceName: booking.serviceName,
    providerName: booking.providerName,
    providerSlug: booking.providerSlug,
    providerRatingAverage: reviewAgg.average,
    /** Null when the left join found nothing — see `verifiedAggregate`. */
    providerVerifiedId: verifiedAgg.providerId,
    optionName: booking.optionName,
    durationMinutes: booking.durationMinutes,
    /**
     * Off `service`, not `booking` — the booking table has no such column.
     * Null only where the left join found nothing, which the `NOT NULL` FK
     * makes unreachable; see `selectedColumns`' own note on the joins.
     */
    locationType: service.locationType,
    priceMinor: booking.priceMinor,
    commissionBps: booking.commissionBps,
    commissionMinor: booking.commissionMinor,
    currency: booking.currency,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    timezone: provider.timezone,
    addressLabel: booking.addressLabel,
    addressLine: booking.addressLine,
    addressCity: booking.addressCity,
    addressDistrict: booking.addressDistrict,
    addressDirections: booking.addressDirections,
    description: booking.description,
    expiresAt: booking.expiresAt,
    createdAt: booking.createdAt,
  };
}

/**
 * One selected row as `BookingListRow` describes it.
 *
 * `status` is `text`, kept honest by the `booking_status_known` CHECK
 * constraint rather than a Postgres enum — see `booking.schema.ts`. That
 * constraint is what makes this cast safe: a row reaching here already had
 * its status validated against `BOOKING_STATUSES` by Postgres, at write
 * time. The same reasoning `DrizzleBookingRepository`'s `toAggregate` relies
 * on for the identical cast.
 *
 * The two joined trust columns are turned into what the read model promises
 * here rather than left to the projection: `avg()` is a string and the
 * verified join answers with an id or nothing, and neither shape should
 * survive past the repository that produced it.
 */
function toRow(
  row: Omit<BookingListRow, "status" | "providerVerified" | "providerRatingAverage"> & {
    status: string;
    providerRatingAverage: string | null;
    providerVerifiedId: string | null;
  },
): BookingListRow {
  const { providerVerifiedId, ...rest } = row;
  return {
    ...rest,
    status: row.status as BookingListRow["status"],
    providerRatingAverage: coerceRating(row.providerRatingAverage),
    providerVerified: providerVerifiedId !== null,
  };
}
