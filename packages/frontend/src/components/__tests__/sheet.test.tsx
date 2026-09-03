import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "../sheet";

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

  it("keeps Tab inside the panel", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "open" }));

    const last = screen.getByRole("button", { name: "last" });
    last.focus();
    await user.tab();

    // Wrapped back into the panel rather than escaping to the document.
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("closes on a backdrop click", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "open" }));

    await user.click(screen.getByTestId("sheet-backdrop"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
