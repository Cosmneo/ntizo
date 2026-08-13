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

export interface ReviewRepositoryPort {
  /** This person's own review of this business, or null. Includes a hidden one — they may still edit it. */
  findByAuthor(providerId: string, authorUserId: string): Promise<Review | null>;
  /** Inserts or updates in one statement, on the (provider, author) uniqueness. Returns the row's id. */
  upsert(review: Review): Promise<string>;
  /** True when a row was actually deleted — false when there was nothing of theirs to remove. */
  removeOwn(providerId: string, authorUserId: string): Promise<boolean>;
  /** Published only, newest first. */
  listPublished(providerId: string, limit: number, offset: number): Promise<ReviewRow[]>;
  summary(providerId: string): Promise<ReviewSummary>;
  /** False for a business that does not exist or is not trading — the two are deliberately indistinguishable. */
  isReviewableProvider(providerId: string): Promise<boolean>;
  /** Whether this person holds a `provider_member` row here — owner, admin or staff alike. */
  worksAtProvider(providerId: string, userId: string): Promise<boolean>;
}
