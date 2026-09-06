import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ConsolePage } from "./console-page";

describe("ConsolePage", () => {
  it("is the one width by default", () => {
    const { container } = render(<ConsolePage>x</ConsolePage>);
    expect(container.firstChild).toHaveClass("max-w-6xl");
  });
  it("has one documented narrower measure, for reading-width screens", () => {
    const { container } = render(<ConsolePage width="narrow">x</ConsolePage>);
    expect(container.firstChild).toHaveClass("max-w-4xl");
    expect(container.firstChild).not.toHaveClass("max-w-6xl");
  });
});
