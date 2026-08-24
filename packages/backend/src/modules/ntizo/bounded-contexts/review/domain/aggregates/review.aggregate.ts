import { RATING_MAX, RATING_MIN } from "../../../../shared/infrastructure/database/review/enums";
import { RatingOutOfRangeError, ReviewCommentTooLongError } from "../exceptions";

/** Long enough for a real account of a job, short enough not to be an essay nobody reads. */
export const COMMENT_MAX = 1000;

export interface ReviewProps {
  readonly id: string | null;
  readonly providerId: string;
  readonly authorUserId: string;
  readonly bookingId: string | null;
  readonly rating: number;
  readonly comment: string | null;
}

/**
 * One customer's verdict on one business.
 *
 * Small, and deliberately so: a review is a score, some words, and who wrote it
 * about whom. What makes it worth an aggregate rather than a bare row is that
 * two of those have rules, and those rules must hold identically whether the
 * review arrives from the public API, from a future import, or from a test.
 *
 * **The score is a whole number from 1 to 5.** Not 4.5 — a half-star is a thing
 * an *average* can be, never a thing a person can give, and allowing it in the
 * write model is how averages stop meaning anything. `Number.isInteger` rather
 * than a range check alone, because `4.5` sits happily inside 1–5.
 *
 * **An empty comment is no comment.** A row holding `""` and a row holding
 * `null` would render differently — one draws an empty quotation, the other
 * draws nothing — for two customers who both said nothing. Normalised once,
 * here, so no reader has to know both spellings.
 *
 * The rating bounds are imported from the same constants the database CHECK is
 * written against, so the two cannot drift into disagreeing about what a valid
 * score is.
 */
export class Review {
  private constructor(private readonly props: ReviewProps) {}

  /**
   * A review as somebody submitted it, validated.
   *
   * `id` is null for one that has never been stored — the repository assigns
   * it, the same way `MemberSchedule` lets its rows be id-less until saved.
   */
  static create(input: {
    id?: string | null;
    providerId: string;
    authorUserId: string;
    bookingId?: string | null;
    rating: number;
    comment?: string | null;
  }): Review {
    if (!Number.isInteger(input.rating) || input.rating < RATING_MIN || input.rating > RATING_MAX) {
      throw new RatingOutOfRangeError(input.rating);
    }

    const trimmed = (input.comment ?? "").trim();
    if (trimmed.length > COMMENT_MAX) throw new ReviewCommentTooLongError(trimmed.length);

    return new Review({
      id: input.id ?? null,
      providerId: input.providerId,
      authorUserId: input.authorUserId,
      bookingId: input.bookingId ?? null,
      rating: input.rating,
      comment: trimmed === "" ? null : trimmed,
    });
  }

  get id(): string | null {
    return this.props.id;
  }
  get providerId(): string {
    return this.props.providerId;
  }
  get authorUserId(): string {
    return this.props.authorUserId;
  }
  get bookingId(): string | null {
    return this.props.bookingId;
  }
  get rating(): number {
    return this.props.rating;
  }
  get comment(): string | null {
    return this.props.comment;
  }

  /**
   * The same review, rescored and reworded.
   *
   * Changing your mind replaces what you said rather than adding a second
   * verdict — the database's own `review_one_per_author_per_provider` says the
   * same thing, and this is the path that respects it. Runs back through
   * `create`, so an edit is validated exactly as strictly as a first submission.
   */
  revise(input: { rating: number; comment?: string | null }): Review {
    return Review.create({
      id: this.props.id,
      providerId: this.props.providerId,
      authorUserId: this.props.authorUserId,
      bookingId: this.props.bookingId,
      rating: input.rating,
      comment: input.comment,
    });
  }
}
