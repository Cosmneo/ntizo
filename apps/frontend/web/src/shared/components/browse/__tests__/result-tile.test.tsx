import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RatingMark, ResultTile, TileMedia } from "../result-tile";

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
