import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CategoryStrip, categoryItemClass } from "../category-strip";

describe("CategoryStrip", () => {
  it("is navigation, named", () => {
    render(
      <CategoryStrip label="Categories">
        <a href="#">Todos</a>
      </CategoryStrip>,
    );
    expect(screen.getByRole("navigation", { name: "Categories" })).toBeInTheDocument();
  });

  it("keeps its arrows out of the tab order — the chips are already tabbable", () => {
    render(
      <CategoryStrip label="Categories">
        <a href="#">Todos</a>
      </CategoryStrip>,
    );
    expect(screen.getByTestId("strip-arrow-right")).toHaveAttribute("tabindex", "-1");
    expect(screen.getByTestId("strip-arrow-right")).toHaveAttribute("aria-hidden", "true");
  });

  it("changes nothing but colour and the underline when a category is chosen", () => {
    // A chosen chip that grows shifts every chip after it and the row jumps
    // sideways as the selection moves.
    const off = categoryItemClass(false);
    const on = categoryItemClass(true);
    for (const size of ["px-", "py-", "text-[12.5px]", "gap-"]) {
      expect(off.includes(size)).toBe(on.includes(size));
    }
    // The weight is a size: bold glyphs are wider than medium ones in every
    // non-monospace face, so both states carry the same one.
    expect(on).toContain("font-medium");
    expect(off).toContain("font-medium");
    expect(on).not.toContain("font-semibold");
  });
});
