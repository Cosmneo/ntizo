import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultsBar } from "../results-bar";
import { ActiveFilterChip, ActiveFilterChips } from "../active-filter-chips";

describe("ResultsBar", () => {
  it("states how many results there are, not how many fit on this page", () => {
    render(
      <ResultsBar summary={<span>8 services in all categories</span>}>
        <button type="button">Suggested</button>
      </ResultsBar>,
    );
    expect(screen.getByText("8 services in all categories")).toBeInTheDocument();
  });

  it("renders the sort control on its own, not wrapped in a second nav landmark", () => {
    // `SortDropdown` is one button with its own accessible name — a setting,
    // not a place to browse to. A `<nav>` around it would announce a menu of
    // destinations that is not there; that landmark belongs to the row of
    // links this replaced, not to a single trigger.
    render(
      <ResultsBar summary={<span>8</span>}>
        <button type="button">Suggested</button>
      </ResultsBar>,
    );
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggested" })).toBeInTheDocument();
  });

  it("lets the count and the trigger sit on one row, wrapping rather than forcing two", () => {
    // The forced `flex-col`/`sm:flex-row` stack this replaced existed because
    // five pills at 360px needed a row of their own; one trigger does not.
    const { container } = render(
      <ResultsBar summary={<span>8</span>}>
        <button type="button">Suggested</button>
      </ResultsBar>,
    );
    const row = container.firstElementChild!;
    expect(row.className).toContain("flex-wrap");
    expect(row.className).not.toContain("flex-col");
  });
});

describe("ActiveFilterChips", () => {
  it("names the row, so it is not an anonymous strip of buttons", () => {
    render(
      <ActiveFilterChips label="Active filters">
        <ActiveFilterChip label="At your place" remove={<a href="/services">×</a>} />
      </ActiveFilterChips>,
    );
    expect(screen.getByRole("list", { name: "Active filters" })).toBeInTheDocument();
  });

  it("gives every chip its own way off", () => {
    // This is the hole in the design it replaces: there was no way to see what
    // was on, and no way to take one thing off without clearing all.
    render(
      <ActiveFilterChips label="Active filters">
        <ActiveFilterChip label="At your place" remove={<a href="/services?a">×</a>} />
        <ActiveFilterChip label="500 – 5000 MZN" remove={<a href="/services?b">×</a>} />
      </ActiveFilterChips>,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("keeps the label beside the control that removes it", () => {
    render(
      <ActiveFilterChips label="Active filters">
        <ActiveFilterChip label="At your place" remove={<a href="/services">×</a>} />
      </ActiveFilterChips>,
    );
    expect(screen.getByText("At your place")).toBeInTheDocument();
  });
});
