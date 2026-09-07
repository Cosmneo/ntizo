import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FloatingControls } from "../floating-controls";

describe("FloatingControls", () => {
  it("sits above the customer bottom bar, not under it", () => {
    // MobileNav is `fixed bottom-0 z-40` below md. A control at bottom-0 was
    // painted over completely and could not be pressed at all.
    render(
      <FloatingControls>
        <button type="button">Filters</button>
      </FloatingControls>,
    );
    expect(screen.getByTestId("floating-controls").className).toContain("safe-area-inset-bottom");
  });
});
