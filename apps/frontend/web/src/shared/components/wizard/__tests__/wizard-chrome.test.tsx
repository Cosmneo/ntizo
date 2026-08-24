import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WizardLayout } from "../wizard-chrome";

/**
 * The chrome after it stopped knowing the onboarding wizard's steps.
 *
 * Every one of these assertions used to be impossible: `StepRail` read
 * `STEP_ORDER` and `isReachable` from `features/onboarding/domain/screen-model`
 * at the module level, so there was exactly one step list in the app and no
 * way to render a second wizard against a different one. The tests below are
 * about that seam — the step list, the reachability rule and the frame all
 * arriving as props — not about the pixels, which did not change.
 */

// Plain strings, not a literal union: the whole point of the extraction is
// that the chrome does not know any particular wizard's step type.
const STEPS: readonly string[] = ["one", "two", "three"];

const LABELS: Record<string, string> = {
  one: "First thing",
  two: "Second thing",
  three: "Third thing",
};

const STATUS_LABELS = { done: "Done", active: "In progress", stepPrefix: "Step" };

function renderLayout(overrides: Partial<Parameters<typeof WizardLayout>[0]> = {}) {
  const onSeek = vi.fn();
  render(
    <WizardLayout
      steps={STEPS}
      current="two"
      onSeek={onSeek}
      labels={LABELS}
      statusLabels={STATUS_LABELS}
      isReachable={(target, from) => STEPS.indexOf(target) <= STEPS.indexOf(from)}
      backLabel="Back"
      {...overrides}
    >
      <p>The current screen</p>
    </WizardLayout>,
  );
  return { onSeek };
}

describe("WizardLayout", () => {
  it("draws one rail row per step it was given", () => {
    renderLayout();

    for (const label of Object.values(LABELS)) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders a step list it has never seen before", () => {
    // The point of the extraction: a second wizard with its own steps.
    renderLayout({
      steps: ["basics", "review"],
      current: "basics",
      labels: { basics: "Essentials", review: "Check and publish" },
      isReachable: () => true,
    });

    expect(screen.getByText("Essentials")).toBeInTheDocument();
    expect(screen.getByText("Check and publish")).toBeInTheDocument();
    expect(screen.queryByText("First thing")).not.toBeInTheDocument();
  });

  it("counts the steps it was given, not a fixed total", () => {
    renderLayout();

    expect(screen.getByText("Step 2/3")).toBeInTheDocument();
  });

  it("seeks to a step the reachability rule allows", async () => {
    const { onSeek } = renderLayout();

    await userEvent.click(screen.getByText("First thing"));

    expect(onSeek).toHaveBeenCalledWith("one");
  });

  it("refuses a step the reachability rule forbids", async () => {
    const { onSeek } = renderLayout();

    await userEvent.click(screen.getByText("Third thing"));

    expect(onSeek).not.toHaveBeenCalled();
  });

  it("asks the caller's rule, not a built-in backwards-only one", async () => {
    // A saved service lets someone jump forward. The old rail could not.
    const { onSeek } = renderLayout({ isReachable: () => true });

    await userEvent.click(screen.getByText("Third thing"));

    expect(onSeek).toHaveBeenCalledWith("three");
  });

  it("shows the brand slot its caller passes", () => {
    // Twice, and deliberately: once above the desktop rail and once as the
    // phone header's left-hand slot, each hidden at the other's breakpoint.
    // The logo did the same before the extraction.
    renderLayout({ brand: <span>Back to services</span> });

    expect(screen.getAllByText("Back to services")).toHaveLength(2);
  });

  it("gives the phone header to the way back when there is one", () => {
    // With a step behind it, the phone's left-hand slot is Back, not the brand
    // — one row cannot hold both.
    renderLayout({ brand: <span>Back to services</span>, onBack: vi.fn() });

    expect(screen.getAllByText("Back to services")).toHaveLength(1);
    expect(screen.getByText("Back")).toBeInTheDocument();
  });

  it("fills the viewport when framed as a screen", () => {
    const { container } = render(
      <WizardLayout
        steps={STEPS}
        current="one"
        onSeek={vi.fn()}
        labels={LABELS}
        statusLabels={STATUS_LABELS}
        isReachable={() => true}
        backLabel="Back"
        frame="screen"
      >
        <p>Content</p>
      </WizardLayout>,
    );

    expect(container.firstElementChild).toHaveClass("min-h-svh");
  });

  it("fills only its container when framed as an inset", () => {
    // Inside the provider shell the viewport already belongs to the shell;
    // a second `min-h-svh` would push the wizard past the bottom of `main`.
    const { container } = render(
      <WizardLayout
        steps={STEPS}
        current="one"
        onSeek={vi.fn()}
        labels={LABELS}
        statusLabels={STATUS_LABELS}
        isReachable={() => true}
        backLabel="Back"
        frame="inset"
      >
        <p>Content</p>
      </WizardLayout>,
    );

    expect(container.firstElementChild).not.toHaveClass("min-h-svh");
  });

  it("renders the current screen's content", () => {
    renderLayout();

    expect(screen.getByText("The current screen")).toBeInTheDocument();
  });

  it("marks the current rail row as the current step", () => {
    // The rail is a list of destinations and one of them is where you are.
    // Sighted users read that off the filled marker; without `aria-current`
    // a screen reader hears seven interchangeable buttons.
    renderLayout();

    expect(screen.getByRole("button", { name: /Second thing/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("marks only the current row", () => {
    renderLayout();

    expect(screen.getByRole("button", { name: /First thing/ })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("button", { name: /Third thing/ })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
