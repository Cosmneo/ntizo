import { describe, expect, it } from "bun:test";
import { COMMENT_MAX, Review } from "../domain/aggregates/review.aggregate";
import { RatingOutOfRangeError, ReviewCommentTooLongError } from "../domain/exceptions";

/** The two fields that never vary in these tests — a review is about who and whom. */
const WHO = { providerId: "p1", authorUserId: "u1" };

describe("Review.create — the score", () => {
  it("accepts every whole number a person can give", () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      expect(Review.create({ ...WHO, rating }).rating).toBe(rating);
    }
  });

  it("refuses a half star", () => {
    // The trap this rule exists for: 4.5 is inside 1–5, so a bounds check
    // alone lets it through. A half-star is a thing an *average* can be, never
    // a thing a person gives, and allowing it in the write model is how
    // averages stop meaning anything.
    expect(() => Review.create({ ...WHO, rating: 4.5 })).toThrow(RatingOutOfRangeError);
  });

  it("refuses a score outside the scale, at either end", () => {
    expect(() => Review.create({ ...WHO, rating: 0 })).toThrow(RatingOutOfRangeError);
    expect(() => Review.create({ ...WHO, rating: 6 })).toThrow(RatingOutOfRangeError);
    expect(() => Review.create({ ...WHO, rating: -1 })).toThrow(RatingOutOfRangeError);
  });

  it("refuses a score that is not a number at all", () => {
    expect(() => Review.create({ ...WHO, rating: Number.NaN })).toThrow(RatingOutOfRangeError);
  });
});

describe("Review.create — the words", () => {
  it("normalises an empty comment to none", () => {
    // A row holding "" and a row holding null would render differently — one
    // draws an empty quotation, the other draws nothing — for two customers
    // who both said nothing.
    expect(Review.create({ ...WHO, rating: 5, comment: "" }).comment).toBeNull();
    expect(Review.create({ ...WHO, rating: 5, comment: "   " }).comment).toBeNull();
    expect(Review.create({ ...WHO, rating: 5, comment: undefined }).comment).toBeNull();
  });

  it("trims what it keeps", () => {
    expect(Review.create({ ...WHO, rating: 5, comment: "  bom  " }).comment).toBe("bom");
  });

  it("measures the length after trimming, not before", () => {
    // Otherwise a comment padded to the limit with spaces is refused for words
    // it does not contain.
    const padded = `${" ".repeat(50)}${"a".repeat(COMMENT_MAX)}${" ".repeat(50)}`;
    expect(Review.create({ ...WHO, rating: 5, comment: padded }).comment).toHaveLength(COMMENT_MAX);
  });

  it("refuses an essay", () => {
    expect(() =>
      Review.create({ ...WHO, rating: 5, comment: "a".repeat(COMMENT_MAX + 1) }),
    ).toThrow(ReviewCommentTooLongError);
  });
});

describe("Review.revise", () => {
  it("keeps who wrote it, about whom, and which booking earned it", () => {
    const original = Review.create({ ...WHO, bookingId: "b1", rating: 2, comment: "mau" });
    const revised = original.revise({ rating: 5, comment: "resolveram" });

    expect(revised.providerId).toBe("p1");
    expect(revised.authorUserId).toBe("u1");
    // The booking survives the edit: it is what says this verdict came from a
    // real job, and re-earning it is not something changing your mind requires.
    expect(revised.bookingId).toBe("b1");
    expect(revised.rating).toBe(5);
    expect(revised.comment).toBe("resolveram");
  });

  it("validates an edit exactly as strictly as a first submission", () => {
    const original = Review.create({ ...WHO, rating: 4 });
    expect(() => original.revise({ rating: 9 })).toThrow(RatingOutOfRangeError);
  });

  it("leaves the original untouched", () => {
    // A value object: revising returns a new one rather than mutating the one
    // a caller may still be holding.
    const original = Review.create({ ...WHO, rating: 4, comment: "ok" });
    original.revise({ rating: 1, comment: "péssimo" });
    expect(original.rating).toBe(4);
    expect(original.comment).toBe("ok");
  });
});
