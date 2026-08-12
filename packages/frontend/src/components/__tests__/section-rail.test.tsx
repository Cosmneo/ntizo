import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProgressRing, SectionRail, type RailSection } from "../section-rail";

const SECTIONS: RailSection[] = [
  { id: "basics", label: "The essentials", status: "done", required: true },
  { id: "pricing", label: "How it is charged", status: "todo", required: true },
  { id: "timing", label: "Timing", status: "todo", required: false },
  { id: "media", label: "Images", status: "error", required: false },
];

describe("SectionRail", () => {
  test("lists every section with its number", () => {
    render(<SectionRail sections={SECTIONS} currentId="basics" onSelect={() => {}} title="Sections" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("The essentials")).toBeInTheDocument();
  });

  test("marks the current section for a screen reader, not only visually", () => {
    render(<SectionRail sections={SECTIONS} currentId="pricing" onSelect={() => {}} title="Sections" />);
    expect(screen.getByRole("button", { name: /How it is charged/ })).toHaveAttribute("aria-current", "step");
  });

  test("selecting a section reports its id", async () => {
    const onSelect = vi.fn();
    render(<SectionRail sections={SECTIONS} currentId="basics" onSelect={onSelect} title="Sections" />);
    await userEvent.click(screen.getByRole("button", { name: /Timing/ }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("timing");
  });

  test("a locked section cannot be selected", async () => {
    const onSelect = vi.fn();
    const locked = [...SECTIONS, { id: "later", label: "Later", status: "todo" as const, required: false, locked: true }];
    render(<SectionRail sections={locked} currentId="basics" onSelect={onSelect} title="Sections" />);
    await userEvent.click(screen.getByRole("button", { name: /Later/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("the status is readable, not colour alone", () => {
    // A status conveyed only by colour is invisible to a third of the reasons
    // people use assistive technology, and to anyone printing the page.
    render(<SectionRail sections={SECTIONS} currentId="basics" onSelect={() => {}} title="Sections" />);
    expect(screen.getByRole("button", { name: /The essentials/ })).toHaveAccessibleName(/done/i);
    expect(screen.getByRole("button", { name: /Images/ })).toHaveAccessibleName(/problem/i);
  });
});

describe("ProgressRing", () => {
  test("renders its label for assistive technology", () => {
    render(<ProgressRing done={2} total={3} label="2 of 3 required sections done" />);
    expect(screen.getByRole("img", { name: "2 of 3 required sections done" })).toBeInTheDocument();
  });

  test("shows the count as text", () => {
    render(<ProgressRing done={2} total={3} label="x" />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  test("a total of zero does not divide by zero", () => {
    render(<ProgressRing done={0} total={0} label="nothing required" />);
    expect(screen.getByRole("img", { name: "nothing required" })).toBeInTheDocument();
  });

  test("done above total is clamped rather than overdrawn", () => {
    render(<ProgressRing done={5} total={3} label="x" />);
    const circle = document.querySelector("circle:last-of-type") as SVGCircleElement;
    expect(Number(circle.getAttribute("stroke-dashoffset"))).toBeGreaterThanOrEqual(0);
  });

  // "renders its label" above only asserts the img role and its name — an
  // svg with `stroke-dashoffset="NaN"` still has both, so it does not
  // notice a `0 / 0` regression that reaches the DOM. This checks the
  // attribute the zero-total guard actually protects.
  test("a total of zero draws a real number, not NaN, into the arc", () => {
    render(<ProgressRing done={0} total={0} label="nothing required" />);
    const circle = document.querySelector("circle:last-of-type") as SVGCircleElement;
    expect(Number.isFinite(Number(circle.getAttribute("stroke-dashoffset")))).toBe(true);
  });
});
