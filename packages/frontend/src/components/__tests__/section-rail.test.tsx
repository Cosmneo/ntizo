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

// The words the rail has no copy of its own for. Passed explicitly at every
// call site — see `SectionStatusLabels`'s doc comment for why there is no
// English default to fall back on.
const STATUS_LABELS = { done: "done", todo: "to do", error: "has a problem", optional: "Optional" };

describe("SectionRail", () => {
  test("lists every section with its number", () => {
    render(<SectionRail sections={SECTIONS} currentId="basics" onSelect={() => {}} title="Sections" statusLabels={STATUS_LABELS} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("The essentials")).toBeInTheDocument();
  });

  test("marks the current section for a screen reader, not only visually", () => {
    render(<SectionRail sections={SECTIONS} currentId="pricing" onSelect={() => {}} title="Sections" statusLabels={STATUS_LABELS} />);
    expect(screen.getByRole("button", { name: /How it is charged/ })).toHaveAttribute("aria-current", "step");
  });

  test("selecting a section reports its id", async () => {
    const onSelect = vi.fn();
    render(<SectionRail sections={SECTIONS} currentId="basics" onSelect={onSelect} title="Sections" statusLabels={STATUS_LABELS} />);
    await userEvent.click(screen.getByRole("button", { name: /Timing/ }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("timing");
  });

  test("a locked section cannot be selected", async () => {
    const onSelect = vi.fn();
    const locked = [...SECTIONS, { id: "later", label: "Later", status: "todo" as const, required: false, locked: true }];
    render(<SectionRail sections={locked} currentId="basics" onSelect={onSelect} title="Sections" statusLabels={STATUS_LABELS} />);
    await userEvent.click(screen.getByRole("button", { name: /Later/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("the status is readable, not colour alone", () => {
    // A status conveyed only by colour is invisible to a third of the reasons
    // people use assistive technology, and to anyone printing the page.
    render(<SectionRail sections={SECTIONS} currentId="basics" onSelect={() => {}} title="Sections" statusLabels={STATUS_LABELS} />);
    expect(screen.getByRole("button", { name: /The essentials/ })).toHaveAccessibleName(/done/i);
    expect(screen.getByRole("button", { name: /Images/ })).toHaveAccessibleName(/problem/i);
  });

  // Same fixture, words a reviewer can't mistake for hardcoded English —
  // proves the rendered words are the ones passed in, not a baked-in set
  // `statusLabels` merely happens to shadow.
  test("renders the supplied labels, not a set baked into the component", () => {
    const labels = { done: "concluída", todo: "por fazer", error: "com problema", optional: "Opcional" };
    render(<SectionRail sections={SECTIONS} currentId="basics" onSelect={() => {}} title="Sections" statusLabels={labels} />);
    expect(screen.getByRole("button", { name: /The essentials/ })).toHaveAccessibleName(/concluída/i);
    expect(screen.getByRole("button", { name: /Timing/ })).toHaveAccessibleName(/Opcional/);
    expect(screen.getByRole("button", { name: /Images/ })).toHaveAccessibleName(/com problema/i);
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

  // Renamed from the brief's "does not divide by zero": this only checks
  // that the ring still renders with a total of zero, not the arithmetic —
  // "a total of zero draws a real number, not NaN, into the arc" below is
  // the one that actually guards the division.
  test("renders even when nothing is required", () => {
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
