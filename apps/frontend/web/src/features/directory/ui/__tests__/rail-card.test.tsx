import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RailCard } from "../rail-card";

describe("RailCard", () => {
  it("renders its children without a label", () => {
    render(<RailCard>Book now</RailCard>);
    expect(screen.getByText("Book now")).toBeInTheDocument();
  });

  it("renders the label before the children, with a gap the shell itself owns", () => {
    // jsdom does not compute layout, so a spacing assertion cannot check
    // rendered pixels — the class name is the only honest handle available
    // here. This asserts the shell (not a future caller of RailCard) is the
    // one supplying the label-to-content gap, per the component's own doc
    // comment.
    render(<RailCard label="Payment protection">Book now</RailCard>);
    const label = screen.getByText("Payment protection");
    expect(label).toBeInTheDocument();
    expect(label.className).toContain("mb-3");
  });

  it("carries a shadow by default", () => {
    const { container } = render(<RailCard>Book now</RailCard>);
    expect(container.firstElementChild?.className).toContain("shadow-[var(--shadow-sm)]");
  });

  it("drops the shadow when flat", () => {
    const { container } = render(<RailCard flat>Book now</RailCard>);
    expect(container.firstElementChild?.className).not.toContain("shadow-[var(--shadow-sm)]");
  });
});
