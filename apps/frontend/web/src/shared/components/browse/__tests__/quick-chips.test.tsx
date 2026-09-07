import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuickChips, quickChipClass } from "../quick-chips";

describe("QuickChips", () => {
  it("is a list with the given name", () => {
    render(
      <QuickChips label="Quick filters">
        <a href="#">Nearby</a>
      </QuickChips>,
    );
    expect(screen.getByRole("list", { name: "Quick filters" })).toBeInTheDocument();
  });
});

describe("quickChipClass", () => {
  it("differs between active and inactive only in colour tokens, not in size", () => {
    const on = quickChipClass(true);
    const off = quickChipClass(false);
    for (const shared of ["px-3", "py-2", "text-[13px]", "rounded-full", "border"]) {
      expect(on).toContain(shared);
      expect(off).toContain(shared);
    }
    expect(on).not.toBe(off);
  });

  it("never turns bold on choosing a chip — only its colour changes", () => {
    // Bold glyphs are wider than medium ones in essentially every
    // non-monospace font, so a chip that gained weight on selection would
    // shift its own width and every chip after it.
    const on = quickChipClass(true);
    const off = quickChipClass(false);
    expect(on).toContain("font-medium");
    expect(off).toContain("font-medium");
    expect(on).not.toContain("font-semibold");
    expect(off).not.toContain("font-semibold");
  });
});
