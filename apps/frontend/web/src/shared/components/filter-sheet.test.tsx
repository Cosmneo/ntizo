import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterField, FilterSheet } from "./filter-sheet";

function renderSheet(over: Partial<Parameters<typeof FilterSheet>[0]> = {}) {
  const onOpenChange = vi.fn();
  const onClear = vi.fn();
  render(
    <FilterSheet open title="Filter things" canClear={false} onClear={onClear} onOpenChange={onOpenChange} {...over}>
      <FilterField id="filter-kind" label="Kind">
        <select id="filter-kind" aria-label="Kind">
          <option>All</option>
        </select>
      </FilterField>
    </FilterSheet>,
  );
  return { onOpenChange, onClear };
}

describe("FilterSheet", () => {
  it("is a dialog named by its title, holding the caller's fields", () => {
    renderSheet();
    expect(screen.getByRole("dialog", { name: "Filter things" })).toBeInTheDocument();
    expect(screen.getByLabelText("Kind")).toBeInTheDocument();
  });

  it("closes from the top and from the foot", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderSheet();
    await user.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    await user.click(screen.getAllByRole("button", { name: "Close" })[1]!);
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("offers Clear filters only while there is something to clear", async () => {
    const user = userEvent.setup();
    renderSheet({ canClear: false });
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeDisabled();

    const { onClear } = renderSheet({ canClear: true });
    const live = screen.getAllByRole("button", { name: "Clear filters" }).find((b) => !b.hasAttribute("disabled"))!;
    await user.click(live);
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
