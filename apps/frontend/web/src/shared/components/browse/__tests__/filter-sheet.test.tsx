import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterSheet } from "../filter-sheet";

describe("FilterSheet", () => {
  it("says what pressing the button will show", () => {
    // "Apply" makes you tap to find out what you did.
    render(
      <FilterSheet
        open
        title="Filters"
        apply="Show 38 results"
        onApply={vi.fn()}
        clear={<a href="#">Clear</a>}
        onOpenChange={vi.fn()}
      >
        <p>groups</p>
      </FilterSheet>,
    );
    expect(screen.getByRole("button", { name: "Show 38 results" })).toBeInTheDocument();
  });

  it("is a dialog with a name, not an unlabelled box of controls", () => {
    render(
      <FilterSheet open title="Filters" apply="Show 38" onApply={vi.fn()} clear={null} onOpenChange={vi.fn()}>
        <p>g</p>
      </FilterSheet>,
    );
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
  });

  it("closes on a choice but not on a click into the price field", async () => {
    const onOpenChange = vi.fn();
    render(
      <FilterSheet open title="Filters" apply="Show" onApply={vi.fn()} clear={null} onOpenChange={onOpenChange}>
        <a href="#">An option</a>
        <input aria-label="Min" />
      </FilterSheet>,
    );
    await userEvent.click(screen.getByLabelText("Min"));
    expect(onOpenChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("link", { name: "An option" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
