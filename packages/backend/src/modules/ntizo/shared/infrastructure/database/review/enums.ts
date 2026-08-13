/**
 * The two states a review can be in.
 *
 * Not a Postgres enum: the column is `text` with a CHECK, the same shape every
 * other status on this schema uses, so adding a state is a migration rather
 * than a type alteration.
 */
export const REVIEW_STATUSES = ["published", "hidden"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** The inclusive bounds the `review_rating_range` CHECK enforces. */
export const RATING_MIN = 1;
export const RATING_MAX = 5;
