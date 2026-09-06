import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultRow, ServiceChip } from "../result-row";

describe("ResultRow", () => {
  it("renders its six slots, in document order", () => {
    const { container } = render(
      <ResultRow
        media={<i>MEDIA</i>}
        title={<h3>TITLE</h3>}
        kind={<p>KIND</p>}
        description={<p>DESCRIPTION</p>}
        services={<p>SERVICES</p>}
        side={<p>SIDE</p>}
      />,
    );
    const texts = ["MEDIA", "TITLE", "KIND", "DESCRIPTION", "SERVICES", "SIDE"];
    for (const text of texts) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    // In document order: each slot's text appears strictly after the one
    // before it.
    const article = container.querySelector("article")!;
    const html = article.innerHTML;
    let lastIndex = -1;
    for (const text of texts) {
      const index = html.indexOf(text);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it("draws no border box and no shadow — a hairline between rows, nothing else", () => {
    const { container } = render(
      <ResultRow
        media={<i />}
        title={<h3>T</h3>}
        kind={<p>K</p>}
        description={<p>D</p>}
        services={<p>S</p>}
        side={<p>P</p>}
      />,
    );
    const article = container.querySelector("article")!;
    expect(article.className).not.toMatch(/shadow-|rounded-\[var\(--radius-card\)\]/);
    // The one separation it does draw: a hairline on top, not a full border.
    expect(article.className).toMatch(/\bborder-t\b/);
  });
});

describe("ServiceChip", () => {
  it("renders the name and the price", () => {
    render(<ServiceChip name="Corte com barba" price="MZN 800" />);
    expect(screen.getByText("Corte com barba")).toBeInTheDocument();
    expect(screen.getByText("MZN 800")).toBeInTheDocument();
  });
});
