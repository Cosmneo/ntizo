import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrustList } from "../trust-list";

describe("TrustList", () => {
  it("renders nothing for an empty list", () => {
    const { container } = render(<TrustList items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one item per claim", () => {
    render(<TrustList items={["Verificado pela Ntizo.", "As mensagens ficam guardadas."]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
