import type { Review } from "../../../domain/aggregates/review.aggregate";

/** One published review, as a reader of a provider's page sees it. */
export interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  /** The author's display name, or null where they have not set one. */
  authorName: string | null;
  createdAt: string;
}

/** What a provider's score adds up to. */
export interface ReviewSummary {
  /** Null when nobody has reviewed yet — not 0, which is a score somebody gave. */
  average: number | null;
  count: number;
  /**
   * How many reviews gave each score. Drives the bar chart on a provider's page.
   *
   * Spelled out rather than keyed `1`–`5`: a GraphQL field name cannot begin
   * with a digit, and the numeric spelling emits as `_1` while the resolver
   * still returns `1` — every bar comes back null. See the read model.
   */
  histogram: Readonly<Record<"one" | "two" | "three" | "four" | "five", number>>;
}

/**
 * One featured review, as the home page draws it.
 *
 * Carries the business it is about, which `ReviewRow` does not: a provider
 * page's reader already knows whose reviews they are reading, and the home
 * page's reader has no way of telling without being told.
 *
 * `comment` is non-null here, unlike on `ReviewRow`. A featured review that is
 * only a score has nothing to put on the card, so the query never returns one.
 */
export interface FeaturedReviewRow {
  id: string;
  rating: number;
  comment: string;
  authorName: string | null;
  createdAt: string;
  providerName: string;
  providerSlug: string;
}

/** One review as the administration list shows it — every provider, both statuses. */
export interface AdminReviewRow {
  id: string;
  providerId: string;
  providerName: string;
  providerSlug: string;
  rating: number;
  comment: string | null;
  authorName: string | null;
  status: "published" | "hidden";
  featuredAt: string | null;
  createdAt: string;
}

/** What `upsert` actually did, straight from Postgres — see its own docblock. */
export interface UpsertedReview {
  id: string;
  /**
   * True when this call inserted a fresh row; false when it updated one that
   * was already there.
   *
   * This is not "was `findByAuthor` null" — `findByAuthor` runs outside the
   * write's transaction, so two concurrent submissions can both read
   * "nothing here" and both take the create path, yet only the first one to
   * reach the database actually inserts; the second resolves through
   * `ON CONFLICT ... DO UPDATE`. Whoever decides "does this publish
   * `ReviewCreated`" must ask the write what it did, not the read that ran
   * before it — this field is that answer.
   */
  inserted: boolean;
}

export interface ReviewRepositoryPort {
  /** This person's own review of this business, or null. Includes a hidden one — they may still edit it. */
  findByAuthor(providerId: string, authorUserId: string): Promise<Review | null>;
  /** Inserts or updates in one statement, on the (provider, author) uniqueness. */
  upsert(review: Review): Promise<UpsertedReview>;
  /** True when a row was actually deleted — false when there was nothing of theirs to remove. */
  removeOwn(providerId: string, authorUserId: string): Promise<boolean>;
  /** Published only, newest first. */
  listPublished(providerId: string, limit: number, offset: number): Promise<ReviewRow[]>;
  /**
   * The reviews an administrator put on the home page, most recently featured
   * first.
   *
   * Published *and* featured *and* carrying words. Unfeaturing is not the only
   * way one leaves this list: hiding a review takes it off the home page while
   * leaving the administrator's choice on the row, so unhiding restores it.
   */
  listFeatured(limit: number): Promise<FeaturedReviewRow[]>;
  /** Every review, newest first, for the administration screen. Both statuses. */
  listForAdmin(input: {
    limit: number;
    offset: number;
    featuredOnly?: boolean;
    /** Matches the business name, the author's name, or the words themselves. */
    search?: string;
  }): Promise<{ items: AdminReviewRow[]; total: number; featuredCount: number }>;
  /**
   * Marks one review as shown on the home page, or clears the mark.
   *
   * Returns false when there is no such review — the caller turns that into a
   * not-found rather than reporting a success that changed nothing.
   */
  setFeatured(reviewId: string, featured: boolean): Promise<boolean>;
  summary(providerId: string): Promise<ReviewSummary>;
  /**
   * The provider, if it may be reviewed — active and existing — else null.
   *
   * Null for a business that does not exist and null for one that is not
   * trading — the two are deliberately indistinguishable, so a caller
   * probing ids learns nothing about who works where. Carries the name
   * alongside the yes/no because `SubmitReviewCommand` needs it for
   * `ReviewCreated`'s payload and this is already the one query that loads
   * the row; a second query for the same name, run only on some calls, is
   * the seam a stale read could open (this row is not what changed between
   * the two calls — see `UpsertedReview.inserted` for the field that
   * actually can).
   */
  isReviewableProvider(providerId: string): Promise<{ name: string } | null>;
  /** Whether this person holds a `provider_member` row here — owner, admin or staff alike. */
  worksAtProvider(providerId: string, userId: string): Promise<boolean>;
}
