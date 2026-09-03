import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "../sheet";

/**
 * A harness whose `onOpenChange` is a fresh arrow every render — the shape
 * `week-rules.tsx` actually passes (`onOpenChange={(open) => !open &&
 * setEditing(null)}`) — and a `tick` prop the test bumps via `rerender` to
 * force exactly that: a re-render that never touches `open`, standing in for
 * an unrelated prop update (a refetch) landing while the panel is open.
 * `rerender` on the same element type reuses the component instance, so
 * `open`'s own state survives the bump untouched.
 */
function ChurningHarness({ tick }: { tick: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <Sheet open={open} onOpenChange={(v) => setOpen(v)}>
        <SheetContent side="right" labelledBy="sheet-title">
          <SheetTitle id="sheet-title">Ajuda {tick}</SheetTitle>
          <input aria-label="note" />
        </SheetContent>
      </Sheet>
    </>
  );
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" labelledBy="sheet-title">
          <SheetTitle id="sheet-title">Ajuda</SheetTitle>
          <button type="button">first</button>
          <button type="button">last</button>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * A panel whose control unmounts itself when clicked — what every in-panel
 * screen change is (the Help Center's "my requests", a popular question, a
 * request row, Back). The clicked button leaves the DOM, `document
 * .activeElement` falls back to `document.body`, and the next Tab is the one
 * that used to escape.
 */
function UnmountingHarness() {
  const [open, setOpen] = useState(false);
  const [showGo, setShowGo] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" labelledBy="sheet-title">
          <SheetTitle id="sheet-title">Ajuda</SheetTitle>
          <button type="button">first</button>
          {showGo && (
            <button type="button" onClick={() => setShowGo(false)}>
              go
            </button>
          )}
          <button type="button">last</button>
        </SheetContent>
      </Sheet>
      {/* After the panel in document order, so a Shift+Tab that escapes has
          somewhere outside to land — the site chrome behind the backdrop.
          Without it, Shift+Tab from the body wraps to the document's last
          control, which happens to be inside the panel, and the assertion
          would pass against the untrapped code too. */}
      <button type="button">site footer</button>
    </>
  );
}

describe("Sheet", () => {
  it("is a labelled modal dialog when open", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "open" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "sheet-title");
  });

  it("moves focus into the panel on open and back to the trigger on close", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "open" });
    await user.click(trigger);

    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("wraps Tab from the last control to the first, and Shift+Tab from the first to the last", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "open" }));

    const first = screen.getByRole("button", { name: "first" });
    const last = screen.getByRole("button", { name: "last" });

    // A same-direction assertion ("still inside the panel somewhere") would
    // pass just as well with the wrap ends swapped or the shift branches
    // inverted — this pins the exact landing control each way.
    last.focus();
    await user.tab();
    expect(document.activeElement).toBe(first);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });

  it("pulls Tab back in when the control that had focus unmounted", async () => {
    const user = userEvent.setup();
    render(<UnmountingHarness />);
    const trigger = screen.getByRole("button", { name: "open" });
    await user.click(trigger);

    // The click lands on a button that removes itself — focus has nowhere
    // to go and falls to the body, which is neither the first control, nor
    // the last, nor the panel. Every branch of the trap used to miss it.
    await user.click(screen.getByRole("button", { name: "go" }));
    expect(document.activeElement).toBe(document.body);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "first" }));
    expect(document.activeElement).not.toBe(trigger);
  });

  it("pulls Shift+Tab back in to the last control when focus was lost", async () => {
    const user = userEvent.setup();
    render(<UnmountingHarness />);
    await user.click(screen.getByRole("button", { name: "open" }));
    await user.click(screen.getByRole("button", { name: "go" }));

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "last" }));
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "site footer" }));
  });

  it("closes on a backdrop click", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "open" }));

    await user.click(screen.getByTestId("sheet-backdrop"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps focus put when an unrelated re-render hands it a new onOpenChange closure", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ChurningHarness tick={0} />);
    await user.click(screen.getByRole("button", { name: "open" }));

    const note = screen.getByLabelText("note");
    await user.click(note);
    expect(document.activeElement).toBe(note);

    // Same component instance, a new `tick` — `open` never changes, but
    // `ChurningHarness` re-renders and hands `Sheet` a brand new
    // `onOpenChange` arrow, exactly as a parent re-rendering for any other
    // reason (a refetch) while the panel is open would.
    rerender(<ChurningHarness tick={1} />);

    expect(document.activeElement).toBe(note);
  });
});
