import {
  and,
  asc,
  type AnyColumn,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  booking,
  bookingChange,
} from "../../../../../shared/infrastructure/database/booking/schemas";
import { service } from "../../../../../shared/infrastructure/database/catalog/schemas";
import {
  provider,
  providerDocument,
  providerMember,
} from "../../../../../shared/infrastructure/database/provider/schemas";
import { review } from "../../../../../shared/infrastructure/database/review/schemas";
import { profile, user } from "../../../../../shared/infrastructure/database/user/schemas";
import {
  type BookingListRow,
  type BookingReadRepositoryPort,
  PROVIDER_TAB_STATUSES,
  type ProviderBookingRow,
  type ProviderListFilter,
  type ProviderMemberOption,
  type ProviderTimelineRow,
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

  async listForProvider(
    providerId: string,
    filter: ProviderListFilter,
    limit: number,
    offset: number,
  ): Promise<ProviderBookingRow[]> {
    const rows = await providerSelect()
      .where(providerWhere(providerId, filter))
      .orderBy(...providerOrder(filter.tab))
      .limit(limit)
      .offset(offset);

    return rows.map(toProviderRow);
  }

  async countForProvider(providerId: string, filter: ProviderListFilter): Promise<number> {
    // The one join `providerWhere` can reach for — the customer's profile,
    // which the search matches on. Everything else the list selects is
    // display, and a count has nothing to display.
    const [row] = await getDb()
      .select({ n: count() })
      .from(booking)
      .leftJoin(profile, eq(profile.userId, booking.customerId))
      .where(providerWhere(providerId, filter));

    return Number(row?.n ?? 0);
  }

  async findForProvider(bookingId: string, providerId: string): Promise<ProviderBookingRow | null> {
    const rows = await providerSelect()
      // Ownership in the WHERE, as `findForCustomer` — and a draft is not
      // the provider's to see, so it is excluded here rather than after.
      .where(
        and(
          eq(booking.id, bookingId),
          eq(booking.providerId, providerId),
          sql`${booking.status} <> 'DRAFT'`,
          askedOfProvider(),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? toProviderRow(row) : null;
  }

  async timelineFor(bookingId: string): Promise<ProviderTimelineRow[]> {
    return getDb()
      .select({
        changedAt: bookingChange.changedAt,
        changedByUserId: bookingChange.changedByUserId,
        reason: bookingChange.reason,
      })
      .from(bookingChange)
      .where(eq(bookingChange.bookingId, bookingId))
      // Ties broken by id for the same reason the lists break theirs: two
      // hops in one transaction share `changedAt`'s `defaultNow()`, and an
      // order that changes between reads is not a history.
      .orderBy(asc(bookingChange.changedAt), asc(bookingChange.id));
  }

  async membersOf(providerId: string): Promise<ProviderMemberOption[]> {
    const rows = await getDb()
      .select({ id: providerMember.id, firstName: profile.firstName, email: user.email })
      .from(providerMember)
      .leftJoin(profile, eq(profile.userId, providerMember.userId))
      .leftJoin(user, eq(user.id, providerMember.userId))
      .where(eq(providerMember.providerId, providerId))
      .orderBy(asc(providerMember.joinedAt));

    // A member with no first name is named by the local part of their
    // email, which is what the members page falls back to as well.
    return rows.map((r) => ({
      id: r.id,
      firstName:
        r.firstName && r.firstName.trim() !== "" ? r.firstName : (r.email ?? "").split("@")[0] || "—",
    }));
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

/**
 * `profile`, joined a second time under its own name — the customer's row and
 * the assigned member's row are both `user.profile`, and a query that joined
 * that table twice without renaming one of them would be ambiguous SQL.
 *
 * Module-level, matching `service-pricing.reader.ts`'s own pair of aliases:
 * `alias` builds immutable table metadata and reaches for no connection, so
 * there is nothing to rebuild per call — and one shared constant is what
 * makes it impossible for the join and the selected column to name two
 * different aliases.
 */
const memberProfile = alias(profile, "member_profile");

/**
 * The provider's joined select, whole — built once and used by both
 * `listForProvider` and `findForProvider`, which add only the `WHERE` (and
 * the list's order and page) that differ.
 *
 * Two copies of this chain is exactly the defect `selectedColumns` above was
 * written to prevent, one level up: a join added to the list and not to the
 * detail would give the same booking two contents depending on which page the
 * provider reached it through.
 *
 * `provider` is an `innerJoin` for the reason `selectedColumns` gives —
 * `booking.provider_id` is `NOT NULL` and references it, so it cannot drop a
 * row — and the rest are left joins so that a booking whose customer has no
 * profile row, or whose member has been removed, still reaches the provider
 * who has to answer it rather than silently vanishing from their list.
 */
function providerSelect() {
  return getDb()
    .select(providerColumns())
    .from(booking)
    .innerJoin(provider, eq(provider.id, booking.providerId))
    .leftJoin(service, eq(service.id, booking.serviceId))
    .leftJoin(profile, eq(profile.userId, booking.customerId))
    .leftJoin(user, eq(user.id, booking.customerId))
    .leftJoin(providerMember, eq(providerMember.id, booking.providerMemberId))
    .leftJoin(memberProfile, eq(memberProfile.userId, providerMember.userId));
}

/**
 * The provider's WHERE: this workspace, never a draft, the tab's statuses,
 * the tab's side of `now` for the two live statuses, an optional member and
 * an optional search. `unaccent` is not installed, so the search lowers both
 * sides and strips the accents the launch market's names actually carry.
 */
function providerWhere(providerId: string, filter: ProviderListFilter) {
  const live = inArray(booking.status, [...PROVIDER_TAB_STATUSES.upcoming]);
  const byTab =
    filter.tab === "all"
      ? undefined
      : filter.tab === "requests"
        ? inArray(booking.status, [...PROVIDER_TAB_STATUSES.requests])
        : filter.tab === "upcoming"
          ? and(live, gte(booking.startsAt, filter.now))
          : or(inArray(booking.status, [...PROVIDER_TAB_STATUSES.history]), and(live, lt(booking.startsAt, filter.now)));
  const byMember =
    filter.memberId === null ? undefined : eq(booking.providerMemberId, filter.memberId);
  const needle = filter.q?.trim();
  const bySearch =
    needle === undefined || needle === ""
      ? undefined
      : or(
          ilike(unaccented(profile.firstName), `%${unaccentedJs(needle)}%`),
          ilike(unaccented(booking.serviceName), `%${unaccentedJs(needle)}%`),
        );
  return and(
    eq(booking.providerId, providerId),
    sql`${booking.status} <> 'DRAFT'`,
    askedOfProvider(),
    byTab,
    byMember,
    bySearch,
  );
}

/**
 * A booking the provider was actually asked about: one that left `DRAFT`
 * through `submit`, which writes this change row in the same transaction as
 * the hop (see `SubmitBookingCommand`).
 *
 * **The `<> 'DRAFT'` guard beside this one is not enough on its own.** A draft
 * whose checkout hold ran out, or one superseded by the customer starting a
 * second checkout (`CreateBookingCommand`), is moved to `EXPIRED` by
 * `Booking.expire` — and `EXPIRED` is one of `PROVIDER_TAB_STATUSES.history`.
 * Without this clause every abandoned step-1 checkout would surface in the
 * provider's history as an "Expirada" row carrying the customer's first name
 * and the service, inflate the tab's total, and answer `findForProvider`. Such
 * a row has the *status* of a finished booking and none of its history: nobody
 * ever asked the provider anything, which is the same reason a live `DRAFT` is
 * hidden from them.
 *
 * A correlated `EXISTS` rather than a join, because this is a test on the
 * booking and not a column to select: a join to an append-only log would
 * multiply a booking by its number of change rows.
 */
function askedOfProvider() {
  return exists(
    getDb()
      .select({ one: sql`1` })
      .from(bookingChange)
      .where(
        and(
          eq(bookingChange.bookingId, booking.id),
          eq(bookingChange.reason, "submitted_by_customer"),
        ),
      ),
  );
}

/**
 * The accents names in the launch markets carry — Portuguese, Spanish and
 * French — and what each one folds to. **Both folds below read this one pair**,
 * character for character, so a needle and a column can never be folded
 * differently.
 *
 * That is the whole point of the pair being declared once, and it is not
 * theoretical. These two folds were written independently at first: the SQL
 * side listed 23 characters and the JS side stripped every Unicode combining
 * mark via `normalize("NFD")`. `ñ` is a combining mark in NFD and was *not* in
 * the 23, so the JS side over-stripped: a provider searching a customer named
 * "Nuño" folded the needle to "nuno" while the column stayed "nuño", and the
 * search missed the row — whether they typed the name exactly as it is spelled
 * or without the tilde. "Peña" and "Muñoz" the same. Two alphabets that are
 * *nearly* the same produce silent false negatives on precisely the names
 * whose spelling made somebody reach for the search box.
 *
 * A character outside this pair is left alone by both sides, which is a miss
 * the two agree on rather than a disagreement: an exactly-typed name still
 * finds its own row. Widening the alphabet is a matter of adding to both
 * strings together, and they must stay the same length.
 */
const ACCENTED = "áàâãäéèêëíìîïóòôõöúùûüçñýÿ";
const PLAIN = "aaaaaeeeeiiiiooooouuuucnyy";

/** `ACCENTED` → `PLAIN`, one character to one, for the JS side of the fold. */
const FOLD: ReadonlyMap<string, string> = new Map(
  [...ACCENTED].map((accented, i) => [accented, PLAIN[i]!] as const),
);

/**
 * The column, lowercased and folded through `ACCENTED`/`PLAIN` by Postgres
 * itself. `unaccent` is a contrib extension this database does not have;
 * `translate` needs none, and takes the same alphabet the needle is folded
 * with as two ordinary bind parameters.
 */
function unaccented(column: AnyColumn) {
  return sql<string>`translate(lower(${column}), ${ACCENTED}, ${PLAIN})`;
}

/**
 * The needle, folded through the same pair — never `normalize("NFD")`, which
 * would strip marks `translate` keeps and put the two sides back into
 * different alphabets. See `ACCENTED` for the search that went missing when
 * they were.
 */
function unaccentedJs(value: string): string {
  return [...value.toLowerCase()].map((character) => FOLD.get(character) ?? character).join("");
}

/** Requests newest first; upcoming soonest first; history most recent first. Ties broken by id, as `listForCustomer` does. */
function providerOrder(tab: ProviderListFilter["tab"]) {
  // `all` orders like `requests` — both answer "what happened lately".
  if (tab === "requests" || tab === "all") return [desc(booking.createdAt), desc(booking.id)];
  if (tab === "upcoming") return [asc(booking.startsAt), asc(booking.id)];
  return [desc(booking.startsAt), desc(booking.id)];
}

/**
 * Exactly the columns `ProviderBookingRow` carries — never `select()` with no
 * argument, for the reason `selectedColumns` above gives, and one selection
 * for the list and the detail alike for the same reason again.
 *
 * Six are not `booking`'s. `service.location_type` and `provider.timezone`
 * are joined for the reasons `selectedColumns` records. The other four are
 * the two people a provider has to be able to reach: the customer's first
 * name, phone and email — needed to turn up at the right door and call ahead
 * if they cannot — and the assigned member's first name, off the aliased
 * second copy of `profile` described above.
 */
function providerColumns() {
  return {
    id: booking.id,
    status: booking.status,
    createdAt: booking.createdAt,
    customerId: booking.customerId,
    serviceId: booking.serviceId,
    serviceOptionId: booking.serviceOptionId,
    serviceName: booking.serviceName,
    optionName: booking.optionName,
    durationMinutes: booking.durationMinutes,
    locationType: service.locationType,
    providerMemberId: booking.providerMemberId,
    memberFirstName: memberProfile.firstName,
    customerFirstName: profile.firstName,
    customerPhone: profile.phoneNumber,
    customerEmail: user.email,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    timezone: provider.timezone,
    addressLabel: booking.addressLabel,
    addressLine: booking.addressLine,
    addressCity: booking.addressCity,
    addressDistrict: booking.addressDistrict,
    addressDirections: booking.addressDirections,
    description: booking.description,
    paymentRef: booking.paymentRef,
    priceMinor: booking.priceMinor,
    commissionBps: booking.commissionBps,
    commissionMinor: booking.commissionMinor,
    currency: booking.currency,
    expiresAt: booking.expiresAt,
  };
}

/**
 * One selected row as `ProviderBookingRow` describes it.
 *
 * No `status` cast, unlike `toRow` above: this row's `status` stays the plain
 * `string` the column is, because the provider's tabs are the thing that
 * narrows it and they do so in the `WHERE`, not in a type. The `DTO` mapper
 * Task 3 builds is where it becomes a union again.
 *
 * The one thing this does normalise is a blank first name. `profile`'s own
 * `.default("")` means "this person has not filled their name in", and an
 * empty string reaching a page renders as a nameless gap; null is what the
 * read model already means by "no name to show", so it is what a blank
 * becomes here rather than at every reader that prints one.
 */
function toProviderRow(
  row: Omit<ProviderBookingRow, "memberFirstName" | "customerFirstName"> & {
    memberFirstName: string | null;
    customerFirstName: string | null;
  },
): ProviderBookingRow {
  return {
    ...row,
    memberFirstName:
      row.memberFirstName && row.memberFirstName.trim() !== "" ? row.memberFirstName : null,
    customerFirstName:
      row.customerFirstName && row.customerFirstName.trim() !== "" ? row.customerFirstName : null,
  };
}
