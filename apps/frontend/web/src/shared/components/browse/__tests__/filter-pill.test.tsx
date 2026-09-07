import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterPill } from "../filter-pill";

describe("FilterPill", () => {
  it("opens with no JavaScript, because it is a details element", () => {
    const { container } = render(
      <FilterPill label="Price">
        <a href="#">Under 1000</a>
      </FilterPill>,
    );
    expect(container.querySelector("details")).toBeInTheDocument();
    expect(container.querySelector("summary")).toHaveTextContent("Price");
  });

  it("shows the chosen option in place of the group's name once applied", () => {
    render(
      <FilterPill label="How you pay" active="Fixed price">
        <a href="#">x</a>
      </FilterPill>,
    );
    expect(screen.getByText("Fixed price")).toBeInTheDocument();
    expect(screen.queryByText("How you pay")).toBeNull();
  });

  it("puts the remove link outside the summary, so it is not a toggle", () => {
    // A link inside <summary> both navigates and toggles the disclosure; the
    // two race, and which wins depends on the browser.
    const { container } = render(
      <FilterPill label="City" active="Maputo" clear={<a href="/services">×</a>}>
        <a href="#">x</a>
      </FilterPill>,
    );
    expect(container.querySelector("summary a")).toBeNull();
    expect(screen.getByRole("link", { name: "×" })).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const { container } = render(
      <FilterPill label="Price">
        <a href="#">x</a>
      </FilterPill>,
    );
    const details = container.querySelector("details")!;
    details.setAttribute("open", "");
    await userEvent.keyboard("{Escape}");
    expect(details).not.toHaveAttribute("open");
  });

  it("moves only the colours when a filter is applied, never the weight", () => {
    // An applied pill that turned semibold grew, and the pill after it moved.
    const { container: off } = render(
      <FilterPill label="Price">
        <a href="#">x</a>
      </FilterPill>,
    );
    const { container: on } = render(
      <FilterPill label="Price" active="Fixed price">
        <a href="#">x</a>
      </FilterPill>,
    );
    const resting = off.querySelector("summary")!.className;
    const applied = on.querySelector("summary")!.className;
    expect(resting).toContain("font-medium");
    expect(applied).toContain("font-medium");
    expect(applied).not.toContain("font-semibold");
  });
});
