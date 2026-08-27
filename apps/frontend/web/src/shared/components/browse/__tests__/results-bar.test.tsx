import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultsBar, segmentClass } from "../results-bar";
import { ActiveFilterChip, ActiveFilterChips } from "../active-filter-chips";

describe("ResultsBar", () => {
  it("states how many results there are, not how many fit on this page", () => {
    render(
      <ResultsBar summary={<span>8 services in all categories</span>} sortLabel="Sort">
        <a href="/services">Suggested</a>
      </ResultsBar>,
    );
    expect(screen.getByText("8 services in all categories")).toBeInTheDocument();
  });

  it("names the sort control, so it is not an unlabelled row of links", () => {
    render(
      <ResultsBar summary={<span>8 services</span>} sortLabel="Sort">
        <a href="/services">Suggested</a>
      </ResultsBar>,
    );
    expect(screen.getByRole("navigation", { name: "Sort" })).toBeInTheDocument();
  });

  it("lets the sort scroll sideways rather than wrapping under the count", () => {
    // Five orders at 360px wrap to a second row and push the first result off
    // the screen.
    render(
      <ResultsBar summary={<span>8</span>} sortLabel="Sort">
        <a href="/services">Suggested</a>
      </ResultsBar>,
    );
    expect(screen.getByRole("navigation", { name: "Sort" }).className).toContain("overflow-x-auto");
  });
});

describe("segmentClass", () => {
  it("distinguishes the active order", () => {
    expect(segmentClass(true)).not.toBe(segmentClass(false));
  });

  it("does not paint the active order in the brand blue", () => {
    // Every CTA on the cards below is brand blue. A sort pill in the same
    // colour reads as a second call to action rather than as a setting.
    expect(segmentClass(true)).not.toContain("--color-primary)");
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
