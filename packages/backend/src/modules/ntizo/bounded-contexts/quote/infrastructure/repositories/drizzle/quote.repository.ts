import { and, asc, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  quote,
  quoteProposal,
  type NewQuoteProposalRow,
  type NewQuoteRow,
  type QuoteProposalRow,
  type QuoteRow,
} from "../../../../../shared/infrastructure/database/quote/schemas";
import { QUOTE_DEADLINE_BEARING_STATUSES, type QuoteStatus } from "../../../../../shared/infrastructure/database/quote/enums";
import { Quote, type QuoteProposalProps } from "../../../domain/aggregates/quote.aggregate";
import { QuoteAlreadyOpenError } from "../../../domain/exceptions";
import type { QuoteRepositoryPort } from "../../../app/ports/outbound/quote.repository.port";

const OPEN_QUOTE_CONSTRAINT = "quote_open_per_customer_service_uq";

function isOpenQuoteCollision(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  const constraintName = (error as { constraint_name?: unknown }).constraint_name;
  return code === "23505" && constraintName === OPEN_QUOTE_CONSTRAINT;
}

function toQuoteRow(q: Quote): Omit<NewQuoteRow, "id" | "createdAt" | "updatedAt"> {
  return {
    serviceId: q.serviceId,
    providerId: q.providerId,
    customerId: q.customerId,
    threadId: q.threadId,
    status: q.status,
    expiresAt: q.expiresAt,
    locale: q.locale,
    description: q.description,
    neededBy: q.neededBy,
    addressLabel: q.addressLabel,
    addressLine: q.addressLine,
    addressCity: q.addressCity,
    addressDistrict: q.addressDistrict,
    addressDirections: q.addressDirections,
    addressLat: q.addressLat === null ? null : String(q.addressLat),
    addressLng: q.addressLng === null ? null : String(q.addressLng),
    closedReason: q.closedReason,
    closedNote: q.closedNote,
    closedByUserId: q.closedByUserId,
    expiredCause: q.expiredCause,
    bookingId: q.bookingId,
    requestedAt: q.requestedAt,
    proposedAt: q.proposedAt,
    acceptedAt: q.acceptedAt,
    declinedAt: q.declinedAt,
    rejectedAt: q.rejectedAt,
    withdrawnAt: q.withdrawnAt,
    expiredAt: q.expiredAt,
  };
}

function toProposalRow(quoteId: string, p: QuoteProposalProps): Omit<NewQuoteProposalRow, "id"> {
  return {
    quoteId,
    priceMinor: p.priceMinor,
    currency: p.currency,
    startsAt: p.startsAt,
    durationMinutes: p.durationMinutes,
    endsAt: p.endsAt,
    providerMemberId: p.providerMemberId,
    note: p.note,
    validUntil: p.validUntil,
    createdByUserId: p.createdByUserId,
    supersededAt: p.supersededAt,
    supersededCause: p.supersededCause,
    createdAt: p.createdAt,
  };
}

function toProposalProps(row: QuoteProposalRow): QuoteProposalProps {
  return {
    id: row.id,
    priceMinor: row.priceMinor,
    currency: row.currency,
    startsAt: row.startsAt,
    durationMinutes: row.durationMinutes,
    endsAt: row.endsAt,
    providerMemberId: row.providerMemberId,
    note: row.note,
    validUntil: row.validUntil,
    createdByUserId: row.createdByUserId,
    supersededAt: row.supersededAt,
    supersededCause: row.supersededCause as QuoteProposalProps["supersededCause"],
    createdAt: row.createdAt,
  };
}

function toAggregate(row: QuoteRow, proposals: QuoteProposalRow[]): Quote {
  return Quote.restore({
    id: row.id,
    serviceId: row.serviceId,
    providerId: row.providerId,
    customerId: row.customerId,
    threadId: row.threadId,
    status: row.status as QuoteStatus,
    expiresAt: row.expiresAt,
    locale: row.locale,
    description: row.description,
    neededBy: row.neededBy,
    addressLabel: row.addressLabel,
    addressLine: row.addressLine,
    addressCity: row.addressCity,
    addressDistrict: row.addressDistrict,
    addressDirections: row.addressDirections,
    addressLat: row.addressLat === null ? null : Number(row.addressLat),
    addressLng: row.addressLng === null ? null : Number(row.addressLng),
    closedReason: row.closedReason,
    closedNote: row.closedNote,
    closedByUserId: row.closedByUserId,
    expiredCause: row.expiredCause as Quote["expiredCause"],
    bookingId: row.bookingId,
    requestedAt: row.requestedAt,
    proposedAt: row.proposedAt,
    acceptedAt: row.acceptedAt,
    declinedAt: row.declinedAt,
    rejectedAt: row.rejectedAt,
    withdrawnAt: row.withdrawnAt,
    expiredAt: row.expiredAt,
    proposals: proposals
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(toProposalProps),
  });
}

export class DrizzleQuoteRepository implements QuoteRepositoryPort {
  private async proposalsFor(quoteIds: string[]): Promise<Map<string, QuoteProposalRow[]>> {
    const map = new Map<string, QuoteProposalRow[]>();
    if (quoteIds.length === 0) return map;
    const rows = await getDb().select().from(quoteProposal).where(inArray(quoteProposal.quoteId, quoteIds));
    for (const row of rows) {
      const list = map.get(row.quoteId) ?? [];
      list.push(row);
      map.set(row.quoteId, list);
    }
    return map;
  }

  async insert(entity: Quote): Promise<Quote> {
    const db = getDb();
    let inserted: QuoteRow;
    try {
      const [row] = await db.insert(quote).values(toQuoteRow(entity)).returning();
      inserted = row!;
    } catch (error) {
      if (isOpenQuoteCollision(error)) throw new QuoteAlreadyOpenError();
      throw error;
    }
    const proposals: QuoteProposalRow[] = [];
    for (const p of entity.proposals) {
      const [row] = await db.insert(quoteProposal).values(toProposalRow(inserted.id, p)).returning();
      proposals.push(row!);
    }
    return toAggregate(inserted, proposals);
  }

  async findById(id: string): Promise<Quote | null> {
    const [row] = await getDb().select().from(quote).where(eq(quote.id, id)).limit(1);
    if (!row) return null;
    const proposals = (await this.proposalsFor([row.id])).get(row.id) ?? [];
    return toAggregate(row, proposals);
  }

  async save(entity: Quote, expectedStatus: Quote["status"]): Promise<Quote | null> {
    const db = getDb();
    const id = entity.id as string;
    const [updated] = await db
      .update(quote)
      .set({ ...toQuoteRow(entity), updatedAt: new Date() })
      .where(and(eq(quote.id, id), eq(quote.status, expectedStatus)))
      .returning();
    if (!updated) return null;

    for (const p of entity.proposals) {
      if (p.id === null) {
        await db.insert(quoteProposal).values(toProposalRow(id, p));
      } else {
        // `isNull(supersededAt)` is the guard that keeps a superseded
        // proposal superseded, and it is not decoration.
        //
        // The quote's own compare-and-swap above cannot see a revision: a
        // revision is `PROPOSED → PROPOSED`, so `eq(quote.status,
        // expectedStatus)` still matches and a command that loaded the quote
        // *before* that revision wins its swap anyway. It then arrives here
        // holding a stale snapshot in which the retired proposal is still
        // live, and an unguarded UPDATE would write `superseded_at = null`
        // straight back over the row the revision had just retired —
        // resurrecting it beside the revision's own live row. Two live
        // proposals, caught only by `quote_proposal_live_uq` as a raw 23505
        // that nothing maps and the client reads as `INTERNAL_ERROR`.
        //
        // With the predicate the row is simply left alone: already
        // superseded by someone else means not this caller's to rewrite.
        // BR-Q4 says a superseded row is never edited, and this is where
        // that holds.
        await db
          .update(quoteProposal)
          .set({ supersededAt: p.supersededAt, supersededCause: p.supersededCause })
          .where(and(eq(quoteProposal.id, p.id), isNull(quoteProposal.supersededAt)));
      }
    }
    // Read the proposals back rather than assembling them from what each
    // write returned. The guarded UPDATE deliberately matches nothing for a
    // row that is already superseded — every earlier proposal of a quote
    // with a history, as well as the racing case above — so the rows those
    // statements return do not, on their own, describe the quote. One
    // SELECT does, and it is the same one `findById` uses.
    const persisted = (await this.proposalsFor([id])).get(id) ?? [];
    return toAggregate(updated, persisted);
  }

  async findDueForSweep(now: Date, limit: number): Promise<Quote[]> {
    const rows = await getDb()
      .select()
      .from(quote)
      .where(
        and(
          inArray(quote.status, [...QUOTE_DEADLINE_BEARING_STATUSES]),
          isNotNull(quote.expiresAt),
          lte(quote.expiresAt, now),
        ),
      )
      .orderBy(asc(quote.expiresAt))
      .limit(limit);
    const proposals = await this.proposalsFor(rows.map((r) => r.id));
    return rows.map((row) => toAggregate(row, proposals.get(row.id) ?? []));
  }
}
