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

  it("an item is a chip: rounded, hairline at rest, navy when chosen, same padding and weight in both states", () => {
    // The filter pills' own shape, because these are the same kind of thing:
    // a row of choices over a list. The icon-over-label item with a 2px
    // underline it replaces was a fifth vocabulary on a page that already had
    // four, and read as a tab bar borrowed from another product.
    const off = categoryItemClass(false);
    const on = categoryItemClass(true);

    expect(off).toContain("rounded-full");
    expect(off).toContain("border-[var(--color-border)]");
    expect(off).toContain("font-medium");
    expect(off).not.toContain("border-b-2");

    expect(on).toContain("bg-[var(--color-navy-surface)]");
    expect(on).toContain("text-[var(--color-navy-on)]");
    expect(on).toContain("font-medium");

    // A chosen chip that grows shifts every chip after it and the row jumps
    // sideways as the selection moves — so the height, the padding and the
    // weight are the same in both states, and only the colours move. The
    // weight is a size too: bold glyphs are wider than medium ones in every
    // non-monospace face.
    for (const size of ["px-3.5", "h-9"]) {
      expect(off).toContain(size);
      expect(on).toContain(size);
    }
    expect(on).not.toContain("font-semibold");
  });

  it("carries no band of its own", () => {
    // The chips are the shape now, so the row needs no hairline under it to
    // say where it ends — and a band there would draw a second line right
    // under the header's own.
    render(
      <CategoryStrip label="Categories">
        <a href="#">Todos</a>
      </CategoryStrip>,
    );
    expect(screen.getByRole("navigation", { name: "Categories" }).className).not.toContain(
      "border-b",
    );
  });
});
