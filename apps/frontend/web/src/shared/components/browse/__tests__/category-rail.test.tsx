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
