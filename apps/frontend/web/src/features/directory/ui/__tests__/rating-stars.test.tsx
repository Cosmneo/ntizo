import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RatingStars } from "../rating-stars";

/**
 * The component that decides what a business's score looks like, including the
 * case the whole review feature has to get right: the one that has no score.
 */
describe("RatingStars", () => {
  it("says a business has no reviews rather than leaving the space blank", () => {
    // A gap where every other card has stars reads as a bad score, which is the
    // opposite of true. The same reason `ratingAverage` is null and not 0 all
    // the way from the database.
    render(<RatingStars average={null} count={0} />);
    expect(screen.getByText("No reviews yet")).toBeInTheDocument();
  });

  it("never draws a zero for a business nobody has reviewed", () => {
    render(<RatingStars average={null} count={0} />);
    expect(screen.queryByText("0,0")).not.toBeInTheDocument();
    expect(screen.queryByText("0.0")).not.toBeInTheDocument();
  });

  it("always shows one decimal, so a 5 does not read as a different kind of number", () => {
    render(<RatingStars average={5} count={12} />);
    expect(screen.getByText("5.0")).toBeInTheDocument();
  });

  it("states the score as a phrase for anyone who cannot see the stars", () => {
    // Five icons read out one by one are not a rating.
    render(<RatingStars average={4.7} count={3} />);
    expect(
      screen.getByLabelText("4.7 out of 5, from 3 reviews"),
    ).toBeInTheDocument();
  });

  it("carries the count beside the score", () => {
    // 4.9 from two people and 4.9 from two hundred are different claims.
    render(<RatingStars average={4.9} count={214} />);
    expect(screen.getByText("(214)")).toBeInTheDocument();
  });
});
