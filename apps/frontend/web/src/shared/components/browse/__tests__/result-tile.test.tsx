import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RatingMark,
  ResultTile,
  TileMedia,
  TILE_TITLE_LINK_CLASS,
} from "../result-tile";

describe("TILE_TITLE_LINK_CLASS", () => {
  it("puts a focus ring back on the shape it turns the outline off for", () => {
    // The card this replaces could afford `focus-visible:outline-none`
    // because its `<article>` lit a border on `focus-within`. The borderless
    // tile has no border to light, so the ring is drawn on the `::after` that
    // already covers the whole tile — and in headline navy, since the ring
    // token is the blue this page spends on the header's search button.
    expect(TILE_TITLE_LINK_CLASS).toContain("focus-visible:after:ring-2");
    expect(TILE_TITLE_LINK_CLASS).toContain(
      "focus-visible:after:ring-[var(--color-headline)]",
    );
  });
});

describe("TileMedia", () => {
  it("shows the photograph when there is one", () => {
    render(<TileMedia src="https://cdn/photo.jpg" />);
    expect(screen.getByRole("presentation")).toHaveAttribute("src", "https://cdn/photo.jpg");
  });

  it("falls back to the site's placeholder, not to an empty box", () => {
    // The same pale-blue mark the landing cards show, not a listing-only
    // navy tile: a reader who meets a missing photo on the home page and on
    // this list should meet the same thing twice.
    render(<TileMedia src={null} />);
    expect(screen.getByTestId("media-fallback")).toBeInTheDocument();
  });

  it("gives the placeholder the box the photograph would have filled", () => {
    // `MediaFallback` sets no size of its own by design, so it has to wear
    // the `<img>`'s own sizing class or it collapses to the mark's height.
    render(<TileMedia src={null} />);
    expect(screen.getByTestId("media-fallback").className).toContain("h-full");
    expect(screen.getByTestId("media-fallback").className).toContain("w-full");
  });

  it("is square on a phone and four-by-three from sm, because the tile changes shape", () => {
    const { container } = render(<TileMedia src={null} />);
    const box = container.firstElementChild!;
    expect(box.className).toContain("aspect-square");
    expect(box.className).toContain("sm:aspect-[4/3]");
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
    // A comma for every locale is what the tile did before this: an en-US
    // reader met "4,7" on the tile and "4.7" on the same provider's page.
    const { unmount } = render(<RatingMark average={4.7} locale="pt-MZ" label="4,7" />);
    expect(screen.getByText("4,7")).toBeInTheDocument();
    unmount();

    render(<RatingMark average={4.7} locale="en-US" label="4.7" />);
    expect(screen.getByText("4.7")).toBeInTheDocument();
  });
});

describe("ResultTile", () => {
  it("draws no border and no shadow — the photograph separates it", () => {
    const { container } = render(
      <ResultTile media={<i />} title={<h3>T</h3>} byline={<p>B</p>} price={<p>P</p>} />,
    );
    const article = container.querySelector("article")!;
    expect(article.className).not.toMatch(/border|shadow|rounded-\[var\(--radius-card\)\]/);
  });

  it("is a 116px-square row on a phone and the stacked tile from sm", () => {
    // The spec's whole reason for the phone redesign: four results a screen
    // against the one a stacked tile gave. jsdom has no layout, so the
    // columns are asserted as the class that declares them.
    const { container } = render(
      <ResultTile media={<i />} title={<h3>T</h3>} byline={<p>B</p>} price={<p>P</p>} />,
    );
    const article = container.querySelector("article")!;
    expect(article.className).toContain("grid-cols-[116px_minmax(0,1fr)]");
    expect(article.className).toContain("sm:block");
  });
});
