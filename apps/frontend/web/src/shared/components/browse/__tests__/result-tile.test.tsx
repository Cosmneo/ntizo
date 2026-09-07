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
    render(<TileMedia src="https://cdn/photo.jpg" name="Estúdio Mavalane" />);
    expect(screen.getByRole("presentation")).toHaveAttribute("src", "https://cdn/photo.jpg");
  });

  it("falls back to the brand tile, not to an empty box", () => {
    render(<TileMedia src={null} name="Estúdio Mavalane" />);
    expect(screen.getByTestId("brand-tile")).toBeInTheDocument();
  });
});

describe("RatingMark", () => {
  it("says whose score it is, because the number is not the service's", () => {
    render(<RatingMark average={4.7} count={6} label="4.7 out of 5, from 6 reviews of this provider" />);
    expect(screen.getByLabelText("4.7 out of 5, from 6 reviews of this provider")).toBeInTheDocument();
  });

  it("prints one decimal, always", () => {
    render(<RatingMark average={5} label="5.0 out of 5" />);
    expect(screen.getByText("5,0")).toBeInTheDocument();
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
});
