import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OtpInput } from "@ntizo/frontend-ui";

/**
 * Controlled wrapper, matching how VerifyPhone drives the component. Testing
 * it uncontrolled would let the boxes hold state the real screen never gives
 * them, and would hide the sequential-entry invariant entirely.
 */
function Harness({ onComplete }: { onComplete?: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <OtpInput
      value={value}
      onChange={setValue}
      onComplete={onComplete}
      digitLabel={(position, total) => `Digit ${position} of ${total}`}
    />
  );
}

function boxes() {
  return Array.from({ length: 6 }, (_, i) =>
    screen.getByLabelText(`Digit ${i + 1} of 6`),
  ) as HTMLInputElement[];
}

describe("OtpInput", () => {
  it("fills boxes left to right as digits are typed", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(boxes()[0]!);
    await user.keyboard("123");

    expect(boxes().map((b) => b.value)).toEqual(["1", "2", "3", "", "", ""]);
  });

  it("puts the caret back on the first empty box when a later one is clicked", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(boxes()[0]!);
    await user.keyboard("12");
    await user.click(boxes()[4]!);

    // Asserting on focus, not on the resulting digits: `insert` always
    // appends to the value, so the digits come out contiguous either way and
    // a value-based assertion here passes even with the redirect deleted.
    // What the redirect actually prevents is the caret sitting in box 5 while
    // the next keystroke lands in box 3.
    expect(document.activeElement).toBe(boxes()[2]);
  });

  it("spreads a pasted code across every box and reports completion once", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);

    await user.click(boxes()[0]!);
    await user.paste("123456");

    expect(boxes().map((b) => b.value)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(onComplete).toHaveBeenCalledExactlyOnceWith("123456");
  });

  it("ignores the separators in a pasted code copied out of a message", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(boxes()[0]!);
    await user.paste("12 34-56");

    expect(boxes().map((b) => b.value)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("removes the last digit on backspace", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(boxes()[0]!);
    await user.keyboard("123");
    await user.keyboard("{Backspace}");

    expect(boxes().map((b) => b.value)).toEqual(["1", "2", "", "", "", ""]);
  });

  it("does not fire completion while the code is short", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);

    await user.click(boxes()[0]!);
    await user.keyboard("12345");

    expect(onComplete).not.toHaveBeenCalled();
  });
});
