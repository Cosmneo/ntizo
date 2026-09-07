import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandTile } from "../brand-tile";

describe("BrandTile", () => {
  it("stands in for a photograph with the business's initials", () => {
    render(<BrandTile name="Estúdio Mavalane" />);
    expect(screen.getByText("EM")).toBeInTheDocument();
  });

  it("draws no image element at all, so nothing can 404 into a broken icon", () => {
    const { container } = render(<BrandTile name="Estúdio Mavalane" />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("keeps the pattern out of the accessibility tree", () => {
    const { container } = render(<BrandTile name="Casa Limpa" />);
    expect(container.querySelector("[data-testid='tie-pattern']")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("survives a name with no letters rather than rendering an empty tile", () => {
    render(<BrandTile name="   " />);
    expect(screen.getByTestId("brand-tile")).toHaveTextContent("—");
  });
});
