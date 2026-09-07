import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
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

  it("puts the favourite on the photograph, in a cell positioned for it", () => {
    // One rule for both shapes: the heart sits on the picture on a tile and
    // on a row alike, so the words' column never gives up width for it. The
    // media node is opaque to this component, so the row wraps it in the
    // positioning context the heart places itself against.
    const { container } = render(
      <ResultRow
        media={<i>MEDIA</i>}
        favourite={<button type="button">Save</button>}
        title={<h3>T</h3>}
        kind={<p>K</p>}
        description={<p>D</p>}
        services={<p>S</p>}
        side={<p>P</p>}
      />,
    );
    const cell = container.querySelector("article")!.firstElementChild as HTMLElement;
    expect(cell.className).toContain("relative");
    expect(within(cell).getByText("MEDIA")).toBeInTheDocument();
    expect(within(cell).getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("leaves the words alone whether the row carries a favourite or not", () => {
    // The claim the design rests on: a saved row and an unsaved one are
    // exactly the same height, because the heart never enters the text
    // column.
    const withHeart = render(<Row favourite={<button type="button">Save</button>} />);
    const words = (result: ReturnType<typeof render>) =>
      result.container.querySelector("article")!.children[1]!.innerHTML;

    const marked = words(withHeart);
    withHeart.unmount();

    expect(marked).toBe(words(render(<Row />)));
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
    expect(classesOf(container)).toContain("border-t");
  });

  it("keeps the hairline unless it is told it is the first row", () => {
    // It was a `first:` variant, which reads the *DOM* parent — and a list of
    // rows is `<ul><li><article>`, so every article is the first child of its
    // own `<li>` and the variant stripped the hairline from every row. Only
    // the page knows which row is first, so the page says so.
    const { container } = render(<Row />);
    expect(classesOf(container)).toContain("border-t");
    expect(classesOf(container)).not.toContain("border-t-0");
  });

  it("drops the hairline on the row it is told is the first", () => {
    const { container } = render(<Row first />);
    // `cn` is `twMerge`, so the override genuinely replaces the hairline
    // rather than racing it in the stylesheet.
    expect(classesOf(container)).toContain("border-t-0");
    expect(classesOf(container)).not.toContain("border-t");
  });
});

/** The row with nothing but its slots filled, so a test can vary one prop. */
function Row({ first, favourite }: { first?: boolean; favourite?: ReactNode }) {
  return (
    <ResultRow
      {...(first === undefined ? {} : { first })}
      {...(favourite === undefined ? {} : { favourite })}
      media={<i />}
      title={<h3>T</h3>}
      kind={<p>K</p>}
      description={<p>D</p>}
      services={<p>S</p>}
      side={<p>P</p>}
    />
  );
}

/**
 * The article's classes as a list, never as a substring match: `border-t-0`
 * contains `border-t`, so a regex on the whole string cannot tell "has a
 * hairline" from "has none".
 */
function classesOf(container: HTMLElement): string[] {
  return container.querySelector("article")!.className.split(/\s+/);
}

describe("ServiceChip", () => {
  it("renders the name and the price", () => {
    render(<ServiceChip name="Corte com barba" price="MZN 800" />);
    expect(screen.getByText("Corte com barba")).toBeInTheDocument();
    expect(screen.getByText("MZN 800")).toBeInTheDocument();
  });
});
