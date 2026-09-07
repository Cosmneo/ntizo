import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RatingMark, TILE_TITLE_LINK_CLASS } from "../result-tile";

describe("TILE_TITLE_LINK_CLASS", () => {
  it("puts a focus ring back on the shape it turns the outline off for", () => {
    // The card this label carries has no border to light on `focus-within`,
    // so the ring is drawn on the `::after` that already covers the whole
    // card — and in headline navy, since the ring token is the site's blue,
    // which the header and the search bar's button wear and nothing in the
    // results does.
    expect(TILE_TITLE_LINK_CLASS).toContain("focus-visible:after:ring-2");
    expect(TILE_TITLE_LINK_CLASS).toContain(
      "focus-visible:after:ring-[var(--color-headline)]",
    );
  });
});

describe("RatingMark", () => {
  it("says whose score it is, because the number is not the service's", () => {
    render(
      <RatingMark
        average={4.7}
        count={6}
        locale="pt-MZ"
        label="4,7 out of 5, from 6 reviews of this provider"
      />,
    );
    expect(
      screen.getByLabelText("4,7 out of 5, from 6 reviews of this provider"),
    ).toBeInTheDocument();
  });

  it("prints one decimal, always", () => {
    render(<RatingMark average={5} locale="pt-MZ" label="5,0 out of 5" />);
    expect(screen.getByText("5,0")).toBeInTheDocument();
  });

  it("writes the separator the reader's locale writes, not Portuguese's", () => {
    // A comma for every locale is what the card did before this: an en-US
    // reader met "4,7" on the card and "4.7" on the same provider's page.
    const { unmount } = render(<RatingMark average={4.7} locale="pt-MZ" label="4,7" />);
    expect(screen.getByText("4,7")).toBeInTheDocument();
    unmount();

    render(<RatingMark average={4.7} locale="en-US" label="4.7" />);
    expect(screen.getByText("4.7")).toBeInTheDocument();
  });
});
