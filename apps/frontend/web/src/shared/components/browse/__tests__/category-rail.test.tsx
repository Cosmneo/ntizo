import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CategoryRail, categoryChipClass } from "../category-rail";

const rail = (
  <CategoryRail label="Filter by category">
    <a href="/services">All</a>
  </CategoryRail>
);

describe("CategoryRail", () => {
  it("is navigation, and says what it navigates", () => {
    // An unnamed <nav> on a page that already has two others is three
    // identical landmarks a screen-reader user has to open to tell apart.
    render(rail);
    expect(screen.getByRole("navigation", { name: "Filter by category" })).toBeInTheDocument();
  });

  it("keeps the chips on one line rather than wrapping to a second row", () => {
    // A band that grows taller pushes the results down by a different amount
    // at every screen width, and the categories past the fold are the rarer
    // ones.
    const { container } = render(rail);
    const scroller = container.querySelector("[data-testid='rail-scroller']")!;
    expect(scroller.className).toContain("overflow-x-auto");
    expect(scroller.className).not.toContain("flex-wrap");
  });

  it("paints its band from a static element, so the search card can hang over it", () => {
    // The hero's card straddles this band's top edge by 16px and has to be
    // drawn in front of it. A positioned element painted after the card wins on
    // tree order alone — put `relative` on the <nav> itself and the tinted band
    // covers the card's bottom, which reads as the card being clipped in half.
    // The positioned wrapper the fades and arrows need is inside, and carries
    // no background of its own.
    render(rail);
    const nav = screen.getByRole("navigation", { name: "Filter by category" });
    expect(nav.className).not.toContain("relative");
    expect(nav.className).toContain("bg-[var(--color-surface-raised)]");
    expect(nav.firstElementChild!.className).toContain("relative");
  });

  it("hides its scroll arrows from assistive technology", () => {
    // They scroll a container a keyboard user already walks with Tab, and the
    // container scrolls to follow focus. Announcing them adds two stops that
    // do nothing new.
    const { container } = render(rail);
    const arrows = container.querySelectorAll("[data-testid^='rail-arrow']");
    expect(arrows.length).toBe(2);
    for (const arrow of arrows) {
      expect(arrow).toHaveAttribute("aria-hidden", "true");
      expect(arrow).toHaveAttribute("tabindex", "-1");
    }
  });

  it("anchors the arrows to the content column, not the full-width band", () => {
    // `left-3`/`right-3` against the band puts an arrow 12px from the browser
    // chrome on a wide screen while the chips it scrolls start hundreds of
    // pixels further in. `page-shell` is the same width utility the chips and
    // the header use, so an arrow measured against it lands beside the row it
    // controls at every viewport instead of at the edge of the glass.
    const { container } = render(rail);
    const leftArrow = container.querySelector("[data-testid='rail-arrow-left']")!;
    const rightArrow = container.querySelector("[data-testid='rail-arrow-right']")!;
    const column = leftArrow.parentElement!;
    expect(rightArrow.parentElement).toBe(column);
    expect(column.className).toContain("page-shell");
    expect(column.className).toContain("absolute");
    expect(column.className).toContain("inset-x-0");
    // Not the scroller itself — a distinct, absolutely positioned layer
    // measured against the same column width.
    const scroller = container.querySelector("[data-testid='rail-scroller']")!;
    expect(column).not.toBe(scroller);
  });

  it("keeps the arrows centred on the chip row, not on the taller band the extra top padding makes", () => {
    // The scroller pads its top more than its bottom (`pt-10`/`pb-4`) to open
    // a gap under the hero's search card. Naively centring the arrow layer on
    // the whole band with `inset-0` would centre the arrows on that now
    // taller, asymmetric box instead — floating them above the chips, which
    // is the exact defect this locks down. The fix insets the layer's top by
    // the same amount the padding grew by (`pt-10` minus `pb-4` = 24px =
    // `top-6`), which shrinks it back to the old symmetric box and puts
    // `top-1/2` back on the chip row's real centre. If the padding split
    // changes, this offset has to change with it.
    const { container } = render(rail);
    const scroller = container.querySelector("[data-testid='rail-scroller']")!;
    const leftArrow = container.querySelector("[data-testid='rail-arrow-left']")!;
    const column = leftArrow.parentElement!;
    expect(scroller.className).toContain("pt-10");
    expect(scroller.className).toContain("pb-4");
    expect(column.className).toContain("top-6");
    expect(column.className).toContain("bottom-0");
    expect(column.className).not.toContain("inset-0");
  });

  it("gives the row enough padding to keep a chip from ever landing under an arrow", () => {
    // The arrows are measured against this same `page-shell` edge as the row
    // (previous test), which means without give somewhere a chip can scroll
    // right underneath one — that's the bug this guards. `sm:` only: below
    // that breakpoint there are no arrows to clear, so an unconditional
    // `px-14` would wrongly push the first chip away from the sidebar below
    // it on a phone, where the row is supposed to stay flush with the
    // content column exactly as it is today.
    const { container } = render(rail);
    const scroller = container.querySelector("[data-testid='rail-scroller']")!;
    expect(scroller.className).toContain("sm:px-14");
    expect(scroller.className).not.toMatch(/(?:^|\s)px-14(?:\s|$)/);
  });

  it("keeps the edge fades on the same column as the arrows", () => {
    // A fade starting at the screen edge while its arrow sits at the column
    // edge would be two different measurements of the same row — the fade
    // has to move with the arrow or the two disagree about where the row
    // starts. `span[aria-hidden]` rather than a selector rooted at
    // `.page-shell`: the fade's own class list is what has to prove it moved,
    // not a query that already assumes it did.
    const { container } = render(rail);
    const fades = container.querySelectorAll("span[aria-hidden='true']");
    expect(fades.length).toBe(2);
    const leftArrow = container.querySelector("[data-testid='rail-arrow-left']")!;
    for (const fade of fades) {
      expect(fade.parentElement).toBe(leftArrow.parentElement);
      expect(fade.parentElement!.className).toContain("page-shell");
    }
  });

  it("does not let the arrows' box swallow clicks meant for the chips", () => {
    // The box that carries the arrows now spans the whole centred column
    // instead of a corner-sized square — without `pointer-events-none` on it,
    // a transparent layer that size would sit above every chip and eat the
    // clicks this rail exists to enable. Each arrow opts back in for itself.
    const { container } = render(rail);
    const leftArrow = container.querySelector("[data-testid='rail-arrow-left']")!;
    const column = leftArrow.parentElement!;
    expect(column.className).toContain("pointer-events-none");
    for (const arrow of container.querySelectorAll("[data-testid^='rail-arrow']")) {
      expect(arrow.className).toContain("pointer-events-auto");
    }
  });
});

describe("categoryChipClass", () => {
  it("distinguishes the chosen category from the rest", () => {
    expect(categoryChipClass(true)).not.toBe(categoryChipClass(false));
  });

  it("does not change the chip's box when it is chosen", () => {
    // A selected chip that gains a border width shifts every chip after it,
    // and the whole row jumps sideways as the selection moves.
    const on = categoryChipClass(true);
    const off = categoryChipClass(false);
    for (const boxAffecting of ["px-4", "py-2", "border"]) {
      expect(on.includes(boxAffecting)).toBe(off.includes(boxAffecting));
    }
  });
});
