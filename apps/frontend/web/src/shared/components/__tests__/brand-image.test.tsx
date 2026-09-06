import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandImage } from "../brand-image";

describe("BrandImage", () => {
  it("renders a custom fallback in place of the brand mark when there is no photo", () => {
    render(<BrandImage src={null} alt="" fallback={<span data-testid="custom-fallback" />} />);
    expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("media-fallback")).not.toBeInTheDocument();
  });
});
