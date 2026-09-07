import type {
  QuoteAttachmentRow,
  QuoteProposalRow,
} from "../../../../../shared/infrastructure/database/quote/schemas";

/**
 * One quote joined to the facts each side's screen needs — the shapes
 * Postgres hands back (`Date`, not the ISO strings the DTO crosses the wire
 * with), exactly as `BookingListRow` is for the booking read side.
 *
 * **One row shape for both audiences, and the audience is decided by the
 * mapper, not by this interface.** `addressLine`, `addressLabel` and
 * `addressDirections` are selected here because the *customer's* detail page
 * renders them; `to-provider-quote-dto.ts` has no field to put them in, and
 * that absence — not a screen, not a flag — is what enforces the reveal rule.
 * See `providerQuoteReadModel`, which carries `addressDistrict` and
 * `addressCity` and nothing else of the address.
 *
 * Deliberately not a `Quote` aggregate: `Quote.restore` re-runs every
 * invariant the write side needs immediately before a command, which is pure
 * cost against a list nobody is about to mutate — and one bad row would throw
 * and take the whole page down. `bootstrapBookingRead`'s doc comment makes
 * the full argument.
 */
export interface QuoteListRow {
  id: string;
  status: string;
  serviceId: string;
  serviceName: string;
  providerId: string;
  providerName: string;
  providerSlug: string;
  providerVerified: boolean;
  timezone: string;
  threadId: string;
  expiresAt: Date | null;
  expiredCause: string | null;
  closedReason: string | null;
  closedNote: string | null;
  bookingId: string | null;
  requestedAt: Date;
  description: string;
  neededBy: string | null;
  addressLabel: string | null;
  addressLine: string | null;
  addressCity: string | null;
  addressDistrict: string | null;
  addressDirections: string | null;
  customerId: string;
  /**
   * The customer's first name off their profile, or **null where they have
   * not set one** — `profile.first_name` is `NOT NULL DEFAULT ''`, and a
   * blank is normalised to null in the repository the way
   * `ProviderBookingRow.customerFirstName` is.
   *
   * Null rather than a fallback, and the fallback that is deliberately *not*
   * taken is the local part of their email address. That string is a real
   * name — "joao.silva" — and handing it to a workspace before any money has
   * moved is the same lead the address, the number and the address itself
   * were kept off `providerQuoteReadModel` to deny. What a nameless customer
   * is called is `to-provider-quote-dto.ts`'s decision, not this row's, and
   * `quoteSelect` does not read `user.email` at all — there is no email here
   * to fall back to.
   */
  customerFirstName: string | null;
  attachmentCount: number;
}

/**
 * A proposal row plus the one joined fact the read models need on it: who
 * would do the work. `quoteProposalReadModel.memberFirstName` is a
 * non-empty-able `string`, so the repository resolves a blank profile name to
 * something printable rather than leaving every reader to.
 */
export interface QuoteProposalWithMember extends QuoteProposalRow {
  memberFirstName: string;
}

/** The two facts the provider's proposal form needs that the quote itself does not carry. */
export interface QuoteProviderFormFacts {
  commissionBps: number;
  performers: { id: string; firstName: string }[];
}

export interface QuoteReadRepositoryPort {
  /**
   * One tab of the customer's own quotes. The customer id is a `WHERE`
   * parameter, never a post-read check.
   *
   * **Most urgent first on `open`, most recent first on `history`** — the two
   * tabs answer different questions. `open` is a to-do list, so it orders by
   * the clock that is running (`expires_at asc`); `history` is a record, so
   * it orders by when the quote was raised (`created_at desc`). Ties broken
   * by id in both, as every other list in this codebase breaks theirs: a
   * total order is what keeps a page boundary from showing one row twice and
   * skipping another.
   */
  listForCustomer(
    customerId: string,
    tab: "open" | "history",
    limit: number,
    offset: number,
  ): Promise<QuoteListRow[]>;
  countsForCustomer(customerId: string): Promise<{ open: number; history: number }>;
  /** Null for a quote that is not this customer's — indistinguishable from missing. */
  findForCustomer(quoteId: string, customerId: string): Promise<QuoteListRow | null>;

  listForProvider(
    providerId: string,
    tab: "toAnswer" | "waiting" | "history",
    limit: number,
    offset: number,
  ): Promise<QuoteListRow[]>;
  countsForProvider(
    providerId: string,
  ): Promise<{ toAnswer: number; waiting: number; history: number }>;
  findForProvider(quoteId: string, providerId: string): Promise<QuoteListRow | null>;

  /** Every proposal of these quotes, oldest first, with the member's first name. */
  proposalsFor(quoteIds: string[]): Promise<Map<string, QuoteProposalWithMember[]>>;
  attachmentsFor(quoteIds: string[]): Promise<Map<string, QuoteAttachmentRow[]>>;
  /** The provider's live rate, and who performs the service — the proposal form's two facts. */
  providerFormFacts(providerId: string, serviceId: string): Promise<QuoteProviderFormFacts>;
  /** How many bookings this customer has completed on the platform. */
  completedBookingsFor(customerId: string): Promise<number>;
}

/**
 * The statuses each tab lists, both sides in one map because `history` is
 * literally shared between them — two copies is how the customer's Histórico
 * and the provider's start disagreeing about whether a withdrawn quote is
 * over.
 *
 * The seven statuses partition exactly: `open` is `toAnswer` ∪ `waiting`, and
 * `history` is the other five. Nothing is in two of the customer's tabs, and
 * nothing is in none of them — `quote-read.repository.test.ts` asserts it
 * against the database rather than against this constant.
 */
export const TAB_STATUSES = {
  open: ["REQUESTED", "PROPOSED"],
  history: ["ACCEPTED", "DECLINED", "REJECTED", "WITHDRAWN", "EXPIRED"],
  toAnswer: ["REQUESTED"],
  waiting: ["PROPOSED"],
} as const;

/** The customer's two tabs. */
export type CustomerQuoteTabKey = "open" | "history";
/** The workspace's three. `history` is the customer's, deliberately the same list. */
export type ProviderQuoteTabKey = "toAnswer" | "waiting" | "history";
