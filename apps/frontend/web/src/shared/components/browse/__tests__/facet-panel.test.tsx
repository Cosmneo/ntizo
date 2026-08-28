import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapPin } from "lucide-react";
import { FacetBox, FacetCount, FacetGroup, FacetPanel, facetOptionClass } from "../facet-panel";

describe("FacetPanel", () => {
  it("names itself, so the sidebar is not an unlabelled column of headings", () => {
    render(
      <FacetPanel title="Filters">
        <p>body</p>
      </FacetPanel>,
    );
    expect(screen.getByRole("heading", { name: "Filters" })).toBeInTheDocument();
  });

  it("offers no clear-all when nothing was passed for it", () => {
    // "Clear all" beside no active filter is a control whose only outcome is
    // the page you are already on.
    render(
      <FacetPanel title="Filters">
        <p>body</p>
      </FacetPanel>,
    );
    expect(screen.queryByText("Clear all")).not.toBeInTheDocument();
  });

  it("shows the clear-all the caller passed", () => {
    render(
      <FacetPanel title="Filters" clear={<a href="/services">Clear all</a>}>
        <p>body</p>
      </FacetPanel>,
    );
    expect(screen.getByRole("link", { name: "Clear all" })).toBeInTheDocument();
  });
});

describe("FacetGroup", () => {
  const group = (
    <FacetGroup icon={MapPin} label="City">
      <a href="/x">Maputo</a>
    </FacetGroup>
  );

  it("opens by default, because a collapsed panel hides what the reader came for", () => {
    const { container } = render(group);
    expect(container.querySelector("details")).toHaveAttribute("open");
  });

  it("uses <details>, so it opens with no JavaScript and announces correctly", () => {
    // Server-rendered first paint, keyboard-operable, and correct to a screen
    // reader without a line of ARIA — all of which a hand-rolled disclosure
    // would need a hook and an aria-expanded to approximate, and would get
    // wrong on the server.
    const { container } = render(group);
    expect(container.querySelector("details > summary")).not.toBeNull();
  });

  it("shows a hint only where one was given", () => {
    const { container } = render(group);
    expect(container.querySelector("[data-testid='facet-hint']")).toBeNull();
  });

  it("shows the hint when one was given", () => {
    render(
      <FacetGroup icon={MapPin} label="Language" hint="The language the listing is written in">
        <a href="/x">Portuguese</a>
      </FacetGroup>,
    );
    expect(screen.getByTestId("facet-hint")).toHaveTextContent(
      "The language the listing is written in",
    );
  });
});

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
