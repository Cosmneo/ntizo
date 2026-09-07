import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  quote,
  quoteAttachment,
  quoteProposal,
  type QuoteAttachmentRow,
} from "../../../../../shared/infrastructure/database/quote/schemas";
import {
  service,
  serviceMember,
  serviceTranslation,
} from "../../../../../shared/infrastructure/database/catalog/schemas";
import {
  provider,
  providerMember,
} from "../../../../../shared/infrastructure/database/provider/schemas";
import { profile, user } from "../../../../../shared/infrastructure/database/user/schemas";
import { booking } from "../../../../../shared/infrastructure/database/booking/schemas";
// The one aggregate this reader shares with the booking read side, imported
// rather than copied. `verifiedAggregate`'s own doc comment records that
// there are already three copies of it and that three is one more than a
// duplicate ought to be; a fourth would make the follow-up it asks for
// strictly harder. `read/quote` reaching into `read/booking` is the same
// crossing this context's own GraphQL handlers make for
// `assertMayReadWorkspace` — one read tier, and these two are the pair that
// a quote turns into.
import { verifiedAggregate } from "../../../../booking/infra/repositories/drizzle/booking-read.repository";
import {
  type CustomerQuoteTabKey,
  type ProviderQuoteTabKey,
  type QuoteListRow,
  type QuoteProposalWithMember,
  type QuoteProviderFormFacts,
  type QuoteReadRepositoryPort,
  TAB_STATUSES,
} from "../../../app/ports/outbound/quote-read.repository.port";

/**
 * Both sides of a quote, read straight off `quote` — exactly the columns
 * `QuoteListRow` carries, never a full aggregate through `Quote.restore`.
 * See `bootstrapQuoteRead`'s doc comment for why this reader exists rather
 * than reusing `DrizzleQuoteRepository`, and `QuoteListRow` for why one row
 * shape serves two audiences that are shown very different things.
 */
export class DrizzleQuoteReadRepository implements QuoteReadRepositoryPort {
  async listForCustomer(
    customerId: string,
    tab: CustomerQuoteTabKey,
    limit: number,
    offset: number,
  ): Promise<QuoteListRow[]> {
    const rows = await quoteSelect()
      .where(and(eq(quote.customerId, customerId), inTab(tab)))
      .orderBy(...orderFor(tab))
      .limit(limit)
      .offset(offset);
    return rows.map(toRow);
  }

  /**
   * Both tabs in one grouped read, so the two chips cannot disagree with each
   * other about the same set of rows — the arrangement
   * `DrizzleBookingReadRepository.countsForCustomer` settled on for its three.
   *
   * No `now` here, unlike that one: a quote's tab is decided by its status
   * alone. The clock moves a quote *between* statuses — the sweep expires it —
   * rather than moving it between tabs while it stands still, so there is no
   * instant for this count to be taken at and no instant to inject.
   */
  async countsForCustomer(customerId: string): Promise<{ open: number; history: number }> {
    const rows = await getDb()
      .select({ bucket: customerBucket(), n: count() })
      .from(quote)
      .where(eq(quote.customerId, customerId))
      // `bucket`, the alias the CASE was given — Postgres resolves an
      // unqualified `GROUP BY` name against an output alias when nothing in
      // the FROM list matches it. Naming it here rather than repeating the
      // CASE keeps the two expressions from ever drifting apart.
      .groupBy(sql`bucket`);

    const counts = { open: 0, history: 0 };
    for (const row of rows) {
      // A bucket the CASE cannot produce would be a bug in the CASE, not data
      // to carry: these two names are the whole domain of that expression.
      if (row.bucket === "open" || row.bucket === "history") counts[row.bucket] = Number(row.n);
    }
    return counts;
  }

  /**
   * Ownership in the `WHERE`, never an id lookup followed by an ownership
   * `if` — see `QuoteReadRepositoryPort.findForCustomer`. A quote belonging
   * to somebody else is not fetched and then rejected; it is not fetched.
   */
  async findForCustomer(quoteId: string, customerId: string): Promise<QuoteListRow | null> {
    const rows = await quoteSelect()
      .where(and(eq(quote.id, quoteId), eq(quote.customerId, customerId)))
      .limit(1);
    const row = rows[0];
    return row ? toRow(row) : null;
  }

  async listForProvider(
    providerId: string,
    tab: ProviderQuoteTabKey,
    limit: number,
    offset: number,
  ): Promise<QuoteListRow[]> {
    const rows = await quoteSelect()
      .where(and(eq(quote.providerId, providerId), inTab(tab)))
      .orderBy(...orderFor(tab))
      .limit(limit)
      .offset(offset);
    return rows.map(toRow);
  }

  /** All three tab counts in one grouped read — the chips are on screen whichever tab is open. */
  async countsForProvider(
    providerId: string,
  ): Promise<{ toAnswer: number; waiting: number; history: number }> {
    const rows = await getDb()
      .select({ bucket: providerBucket(), n: count() })
      .from(quote)
      .where(eq(quote.providerId, providerId))
      .groupBy(sql`bucket`);

    const counts = { toAnswer: 0, waiting: 0, history: 0 };
    for (const row of rows) {
      if (row.bucket === "toAnswer" || row.bucket === "waiting" || row.bucket === "history") {
        counts[row.bucket] = Number(row.n);
      }
    }
    return counts;
  }

  /**
   * The workspace's id sits in the `WHERE` beside the quote's own, exactly as
   * `findForCustomer`'s customer does. "Not yours" and "no such quote" are
   * therefore the same answer, and an id cannot be probed by watching which
   * one comes back.
   */
  async findForProvider(quoteId: string, providerId: string): Promise<QuoteListRow | null> {
    const rows = await quoteSelect()
      .where(and(eq(quote.id, quoteId), eq(quote.providerId, providerId)))
      .limit(1);
    const row = rows[0];
    return row ? toRow(row) : null;
  }

  /**
   * Every proposal of these quotes, oldest first — the order `Quote` itself
   * keeps, and the order the detail mappers reverse for a screen that reads
   * newest first.
   *
   * One query for the whole page rather than one per row: a list of twenty
   * quotes is twenty proposals at most, and twenty round trips is what an
   * N+1 costs. Ties broken by id for the reason every other ordered read here
   * breaks its ties — two proposals written in one transaction share
   * `created_at`'s `defaultNow()`, and an order that changes between reads is
   * not a history.
   */
  async proposalsFor(quoteIds: string[]): Promise<Map<string, QuoteProposalWithMember[]>> {
    if (quoteIds.length === 0) return new Map();

    const rows = await getDb()
      .select({
        id: quoteProposal.id,
        quoteId: quoteProposal.quoteId,
        priceMinor: quoteProposal.priceMinor,
        currency: quoteProposal.currency,
        startsAt: quoteProposal.startsAt,
        durationMinutes: quoteProposal.durationMinutes,
        endsAt: quoteProposal.endsAt,
        providerMemberId: quoteProposal.providerMemberId,
        note: quoteProposal.note,
        validUntil: quoteProposal.validUntil,
        createdByUserId: quoteProposal.createdByUserId,
        supersededAt: quoteProposal.supersededAt,
        supersededCause: quoteProposal.supersededCause,
        createdAt: quoteProposal.createdAt,
        memberFirstName: profile.firstName,
        memberEmail: user.email,
      })
      .from(quoteProposal)
      // Left, not inner: a member removed from the workspace must not delete
      // the proposal they made from the customer's history of what they were
      // offered.
      .leftJoin(providerMember, eq(providerMember.id, quoteProposal.providerMemberId))
      .leftJoin(profile, eq(profile.userId, providerMember.userId))
      .leftJoin(user, eq(user.id, providerMember.userId))
      .where(inArray(quoteProposal.quoteId, quoteIds))
      .orderBy(asc(quoteProposal.createdAt), asc(quoteProposal.id));

    const byQuote = new Map<string, QuoteProposalWithMember[]>();
    for (const { memberFirstName, memberEmail, ...rest } of rows) {
      const list = byQuote.get(rest.quoteId) ?? [];
      list.push({ ...rest, memberFirstName: displayFirstName(memberFirstName, memberEmail) });
      byQuote.set(rest.quoteId, list);
    }
    return byQuote;
  }

  /**
   * Every file of these quotes, all three steps together — the mappers
   * partition them by `step` and by `proposalId`, because a screen wants the
   * request's photographs and a proposal's own attachments in different
   * places and one query answers both.
   */
  async attachmentsFor(quoteIds: string[]): Promise<Map<string, QuoteAttachmentRow[]>> {
    if (quoteIds.length === 0) return new Map();

    const rows = await getDb()
      .select({
        id: quoteAttachment.id,
        quoteId: quoteAttachment.quoteId,
        proposalId: quoteAttachment.proposalId,
        step: quoteAttachment.step,
        storageKey: quoteAttachment.storageKey,
        fileName: quoteAttachment.fileName,
        contentType: quoteAttachment.contentType,
        sizeBytes: quoteAttachment.sizeBytes,
        createdAt: quoteAttachment.createdAt,
      })
      .from(quoteAttachment)
      .where(inArray(quoteAttachment.quoteId, quoteIds))
      .orderBy(asc(quoteAttachment.createdAt), asc(quoteAttachment.id));

    const byQuote = new Map<string, QuoteAttachmentRow[]>();
    for (const row of rows) {
      const list = byQuote.get(row.quoteId) ?? [];
      list.push(row);
      byQuote.set(row.quoteId, list);
    }
    return byQuote;
  }

  /**
   * The two facts the proposal form needs and the quote does not carry: this
   * workspace's live commission rate, and which of its members perform this
   * service.
   *
   * The rate is read live rather than snapshotted, because nothing has been
   * agreed yet — the split the form shows is what the provider would receive
   * *if they proposed now*. `Quote` snapshots nothing of it; the booking
   * `accept` creates is what takes a copy, and from then on the sale is fixed.
   *
   * `providerId` is a predicate on the performer join as well as on the rate,
   * so a `serviceId` belonging to another workspace answers with no
   * performers rather than with somebody else's staff. The handler and
   * `findForProvider` have both already established that this quote is this
   * workspace's; this is the third place that cannot be talked out of it.
   */
  async providerFormFacts(providerId: string, serviceId: string): Promise<QuoteProviderFormFacts> {
    const db = getDb();
    const [rateRow, performerRows] = await Promise.all([
      db
        .select({ commissionBps: provider.commissionBps })
        .from(provider)
        .where(eq(provider.id, providerId))
        .limit(1),
      db
        .select({
          id: providerMember.id,
          firstName: profile.firstName,
          email: user.email,
        })
        .from(serviceMember)
        .innerJoin(providerMember, eq(providerMember.id, serviceMember.memberId))
        .leftJoin(profile, eq(profile.userId, providerMember.userId))
        .leftJoin(user, eq(user.id, providerMember.userId))
        .where(
          and(eq(serviceMember.serviceId, serviceId), eq(providerMember.providerId, providerId)),
        )
        .orderBy(asc(providerMember.joinedAt), asc(providerMember.id)),
    ]);

    return {
      // A workspace that has vanished between the quote read and this one has
      // no rate to report; zero is the only honest answer and the screen shows
      // a split of nothing rather than inventing the platform default, which
      // is not this workspace's rate and never was.
      commissionBps: rateRow[0]?.commissionBps ?? 0,
      performers: performerRows.map((p) => ({
        id: p.id,
        firstName: displayFirstName(p.firstName, p.email),
      })),
    };
  }

  /**
   * How many bookings this customer has actually finished on the platform —
   * the one fact about the person, rather than the job, that the provider's
   * page shows. `COMPLETED` only: a booking that was paid and then disputed
   * is not a reference.
   */
  async completedBookingsFor(customerId: string): Promise<number> {
    const [row] = await getDb()
      .select({ n: count() })
      .from(booking)
      .where(and(eq(booking.customerId, customerId), eq(booking.status, "COMPLETED")));
    return Number(row?.n ?? 0);
  }
}

/**
 * Two aliases of `service_translation`, the same trick
 * `DrizzleQuoteServiceReader` and Booking's `service-pricing.reader.ts` use:
 * one joined on the locale the customer asked in, one on the service's own
 * `source_locale`, so a single query can prefer the first and fall back to
 * the second without a second round trip.
 *
 * Module-level, matching `booking-read.repository.ts`'s `memberProfile`:
 * `alias` builds immutable table metadata and reaches for no connection, so
 * there is nothing to rebuild per call — and one shared constant is what
 * makes it impossible for a join and the column it selects to name two
 * different aliases.
 */
const requestedName = alias(serviceTranslation, "quote_read_tr_requested");
const sourceName = alias(serviceTranslation, "quote_read_tr_source");

/**
 * How many files each quote carries, one row per quote.
 *
 * A grouped sub-select rather than a join, for the reason
 * `reviewAggregate`'s `GROUP BY` exists one context over: joined directly,
 * one quote with three attachments would come back as three quotes.
 */
function attachmentCountAggregate(db: ReturnType<typeof getDb>) {
  return db
    .select({
      quoteId: quoteAttachment.quoteId,
      n: sql<string>`count(*)`.as("attachment_count"),
    })
    .from(quoteAttachment)
    .groupBy(quoteAttachment.quoteId)
    .as("quote_attachment_agg");
}

/**
 * The one selection every query here shares — built once and used by all four
 * reads, so a column wired into the list and not into the detail cannot give
 * the same quote two contents depending on which page it was reached through.
 * `booking-read.repository.ts`'s `selectedColumns` and `providerSelect` are
 * the precedent, and they are the precedent because that is exactly the
 * defect they were written to prevent.
 *
 * `provider` is an `innerJoin`: `quote.provider_id` is `NOT NULL` and
 * references it, so that join can never drop a row, and the timezone it
 * carries is what every instant below means nothing without.
 *
 * Everything else is a left join, deliberately even where a `NOT NULL` FK
 * would allow an inner one. The two outcomes are not comparable: a left join
 * that never finds nothing costs one nullable column this file already
 * coerces, while an inner join that ever fails to match removes a quote from
 * its own customer's list and tells them nothing was ever sent — with nothing
 * anywhere failing. That is `selectedColumns`' argument for
 * `service.location_type`, and it applies to every one of these.
 */
function quoteSelect() {
  const db = getDb();
  const verifiedAgg = verifiedAggregate(db);
  const attachmentAgg = attachmentCountAggregate(db);

  return db
    .select({
      id: quote.id,
      status: quote.status,
      serviceId: quote.serviceId,
      /**
       * The name in the locale the customer asked in, falling back to the one
       * the provider actually wrote — the two-step
       * `DrizzleQuoteServiceReader` takes, for the reason it gives: a customer
       * reading in a locale nobody translated into still gets a name, not an
       * empty service.
       */
      requestedName: requestedName.name,
      sourceName: sourceName.name,
      providerId: quote.providerId,
      providerName: provider.name,
      providerSlug: provider.slug,
      /** Null when the left join found nothing — see `verifiedAggregate`. */
      providerVerifiedId: verifiedAgg.providerId,
      timezone: provider.timezone,
      threadId: quote.threadId,
      expiresAt: quote.expiresAt,
      expiredCause: quote.expiredCause,
      closedReason: quote.closedReason,
      closedNote: quote.closedNote,
      bookingId: quote.bookingId,
      requestedAt: quote.requestedAt,
      description: quote.description,
      neededBy: quote.neededBy,
      /**
       * The address in full. **Selected here and dropped in
       * `to-provider-quote-dto.ts`**, which has no field for most of it — the
       * customer's own detail page renders every one of these. See
       * `QuoteListRow` and that mapper for why the line is drawn in the shape
       * of the provider's read model rather than in this query.
       */
      addressLabel: quote.addressLabel,
      addressLine: quote.addressLine,
      addressCity: quote.addressCity,
      addressDistrict: quote.addressDistrict,
      addressDirections: quote.addressDirections,
      customerId: quote.customerId,
      customerFirstName: profile.firstName,
      customerEmail: user.email,
      /** `count(*)` is a string out of Postgres; `toRow` is what makes it a number. */
      attachmentCount: attachmentAgg.n,
    })
    .from(quote)
    .innerJoin(provider, eq(provider.id, quote.providerId))
    .leftJoin(service, eq(service.id, quote.serviceId))
    .leftJoin(
      requestedName,
      and(eq(requestedName.serviceId, quote.serviceId), eq(requestedName.locale, quote.locale)),
    )
    .leftJoin(
      sourceName,
      and(eq(sourceName.serviceId, quote.serviceId), eq(sourceName.locale, service.sourceLocale)),
    )
    .leftJoin(profile, eq(profile.userId, quote.customerId))
    .leftJoin(user, eq(user.id, quote.customerId))
    .leftJoin(verifiedAgg, eq(verifiedAgg.providerId, quote.providerId))
    .leftJoin(attachmentAgg, eq(attachmentAgg.quoteId, quote.id));
}

type SelectedQuoteRow = Awaited<ReturnType<ReturnType<typeof quoteSelect>["execute"]>>[number];

/**
 * One selected row as `QuoteListRow` describes it.
 *
 * Three shapes are normalised here rather than left to the projections, for
 * the reason `toRow` gives one context over: `count(*)` is a string, the
 * verified join answers with an id or nothing, and a name arrives in two
 * columns. None of those shapes should survive past the repository that
 * produced them.
 *
 * `status` stays the plain `string` the column is: the tabs are what narrow
 * it and they do so in the `WHERE`, and the DTO mappers are where it becomes
 * a union again — the same split `toProviderRow` keeps.
 */
function toRow(row: SelectedQuoteRow): QuoteListRow {
  return {
    id: row.id,
    status: row.status,
    serviceId: row.serviceId,
    // `""` is unreachable through a `NOT NULL` FK and an untranslated service
    // that `DrizzleQuoteServiceReader` already refuses to quote on — but it
    // is what a left join that found nothing means, and a list is not the
    // place to throw over it.
    serviceName: row.requestedName ?? row.sourceName ?? "",
    providerId: row.providerId,
    providerName: row.providerName,
    providerSlug: row.providerSlug,
    providerVerified: row.providerVerifiedId !== null,
    timezone: row.timezone,
    threadId: row.threadId,
    expiresAt: row.expiresAt,
    expiredCause: row.expiredCause,
    closedReason: row.closedReason,
    closedNote: row.closedNote,
    bookingId: row.bookingId,
    requestedAt: row.requestedAt,
    description: row.description,
    neededBy: row.neededBy,
    addressLabel: row.addressLabel,
    addressLine: row.addressLine,
    addressCity: row.addressCity,
    addressDistrict: row.addressDistrict,
    addressDirections: row.addressDirections,
    customerId: row.customerId,
    customerFirstName: displayFirstName(row.customerFirstName, row.customerEmail),
    attachmentCount: Number(row.attachmentCount ?? 0),
  };
}

/**
 * A name to print for somebody whose profile has none.
 *
 * `profile.first_name` is `NOT NULL DEFAULT ''`, so "has not filled it in" and
 * "is not there" arrive as the same blank — and both read models promise a
 * plain `string` that a card renders as a heading. The local part of the
 * address they registered with is the one other thing the platform reliably
 * knows about them, and it is what the workspace would otherwise see a gap
 * for. `""` only where the left join found no account at all, which a
 * `NOT NULL` FK makes unreachable.
 */
function displayFirstName(firstName: string | null, address: string | null): string {
  const named = firstName?.trim();
  if (named) return named;
  const local = address?.split("@")[0]?.trim();
  return local ?? "";
}

/** The statuses one tab holds — the whole of what separates the five list reads. */
function inTab(tab: CustomerQuoteTabKey | ProviderQuoteTabKey) {
  return inArray(quote.status, [...TAB_STATUSES[tab]]);
}

/**
 * Most urgent first while a clock is running; most recent first once it has
 * stopped.
 *
 * The three live tabs (`open`, `toAnswer`, `waiting`) hold exactly the two
 * statuses that carry a deadline, and both screens exist to empty them — so
 * they order by the deadline. `history` has no deadline left to order by:
 * every status in it clears `expires_at`, which is why it orders by when the
 * quote was raised instead.
 *
 * Ties broken by id in both, as every other list here breaks theirs. That is
 * what makes the order *total*, and a total order is what keeps a page
 * boundary from showing one row twice and skipping another.
 */
function orderFor(tab: CustomerQuoteTabKey | ProviderQuoteTabKey) {
  if (tab === "history") return [desc(quote.createdAt), desc(quote.id)];
  return [asc(quote.expiresAt), asc(quote.id)];
}

/**
 * One CASE, so both counts are one trip and cannot disagree with each other.
 *
 * `else 'history'` rather than a second `in (...)`: the seven statuses are
 * partitioned by `quote_status_known`, so everything that is not one of the
 * two live ones is one of the five closed ones. A status added to the table
 * without a tab would land in `history` — visible and wrong, rather than
 * invisible and wrong, which is the failure worth having.
 */
function customerBucket() {
  return sql<string>`case
    when ${quote.status} in ('REQUESTED','PROPOSED') then 'open'
    else 'history'
  end`.as("bucket");
}

/** The workspace's three, on the same terms — and `history` is deliberately the customer's own five. */
function providerBucket() {
  return sql<string>`case
    when ${quote.status} = 'REQUESTED' then 'toAnswer'
    when ${quote.status} = 'PROPOSED' then 'waiting'
    else 'history'
  end`.as("bucket");
}
