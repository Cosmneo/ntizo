import { z } from "zod";

/**
 * One published review, as anyone reading a provider's page sees it.
 *
 * Deliberately narrower than the row. Absent, and absent on purpose:
 *
 * - `authorUserId` — links a verdict to an account; nothing public needs it,
 *   and publishing it would let a crawler build a per-person review history
 *   across every business on the platform.
 * - `bookingId` — says a specific job happened between two identified parties.
 * - `status` — every row that reaches this schema is published by construction,
 *   so a field saying so can only ever be a hint that hidden ones exist.
 *
 * `authorName` is the display name the author chose, or null. Never the email,
 * never a fallback built from one: somebody who set no name has not agreed to
 * appear under any.
 */
export const reviewPublicReadModel = z.object({
  id: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  authorName: z.string().nullable(),
  /** ISO 8601. */
  createdAt: z.string(),
});

/**
 * What a business's reviews add up to.
 *
 * `average` is null — not 0 — when nobody has reviewed yet. Zero is a score
 * somebody could have given, and a page that renders it as one tells every
 * visitor that a brand-new business is the worst on the platform.
 *
 * The histogram always carries five bars, including the empty ones, so a client
 * never has to invent the scores nobody gave.
 *
 * The bars are spelled out — `one`, `two`, … — rather than keyed `1`–`5`.
 * GraphQL field names cannot start with a digit, and the schema builder rewrites
 * such a key to `_1` while the resolver still returns an object keyed `1`: every
 * bar resolves to null, and a non-null Int field then fails the whole query.
 * Found by querying it, not by reading it.
 */
export const reviewSummaryReadModel = z.object({
  average: z.number().nullable(),
  count: z.number().int().min(0),
  histogram: z.object({
    one: z.number().int().min(0),
    two: z.number().int().min(0),
    three: z.number().int().min(0),
    four: z.number().int().min(0),
    five: z.number().int().min(0),
  }),
});

/**
 * One featured review, as the home page shows it.
 *
 * `reviewPublicReadModel` plus the business it is about — which the provider
 * page never needs, because the reader is already on it, and the home page
 * always does: a testimonial with no attributable subject is a quotation the
 * reader cannot check. The slug is here so the card can link to that business
 * rather than being a dead quote.
 *
 * A comment is required, unlike the base model where it is nullable. A review
 * that is only a score has nothing to feature: the home page's card is built
 * around the words. The query is what enforces it; this type is what says so.
 */
export const featuredReviewReadModel = reviewPublicReadModel.extend({
  comment: z.string().min(1),
  providerName: z.string().min(1),
  providerSlug: z.string().min(1),
});

export type FeaturedReviewDTO = z.infer<typeof featuredReviewReadModel>;

export const providerReviewsReadModel = z.object({
  summary: reviewSummaryReadModel,
  reviews: z.array(reviewPublicReadModel),
});

export type ReviewPublicDTO = z.infer<typeof reviewPublicReadModel>;
export type ReviewSummaryDTO = z.infer<typeof reviewSummaryReadModel>;
export type ProviderReviewsPublicDTO = z.infer<typeof providerReviewsReadModel>;
