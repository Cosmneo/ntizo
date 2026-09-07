import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FacetBox, FacetCount, facetOptionClass } from "../facet-panel";

describe("facetOptionClass and its parts", () => {
  it("marks the chosen option without changing its box", () => {
    // A row that gains padding when chosen shifts every row under it, and the
    // list jumps as the reader clicks down it.
    const on = facetOptionClass(true);
    const off = facetOptionClass(false);
    expect(on).not.toBe(off);
    for (const boxAffecting of ["py-1.5", "gap-3"]) {
      expect(on.includes(boxAffecting)).toBe(off.includes(boxAffecting));
    }
  });

  it("hides the tick box from assistive technology", () => {
    // The option is a link carrying aria-pressed. A checkbox role on top of
    // that announces one control twice, in two contradictory ways.
    const { container } = render(<FacetBox active />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("renders a count as a number beside the label", () => {
    render(<FacetCount value={7} />);
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("lines counts up in a column", () => {
    // A column of counts that do not align is a column nobody can compare.
    const { container } = render(<FacetCount value={7} />);
    expect(container.firstElementChild?.className).toContain("tabular-nums");
  });
});
