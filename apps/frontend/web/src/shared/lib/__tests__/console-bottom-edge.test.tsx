import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BottomEdgeProvider, useBottomEdgeOwned, useOwnsBottomEdge } from "../console-bottom-edge";

function Probe() {
  return <span data-testid="owned">{String(useBottomEdgeOwned())}</span>;
}
function Claimant() {
  useOwnsBottomEdge();
  return null;
}

describe("the bottom edge", () => {
  it("is nobody's until something claims it", () => {
    render(<BottomEdgeProvider><Probe /></BottomEdgeProvider>);
    expect(screen.getByTestId("owned")).toHaveTextContent("false");
  });

  it("is owned while a claimant is mounted, and released when it unmounts", () => {
    const { rerender } = render(<BottomEdgeProvider><Probe /><Claimant /></BottomEdgeProvider>);
    expect(screen.getByTestId("owned")).toHaveTextContent("true");
    rerender(<BottomEdgeProvider><Probe /></BottomEdgeProvider>);
    expect(screen.getByTestId("owned")).toHaveTextContent("false");
  });

  it("stays owned while any one of two claimants remains — a counter, not a flag", () => {
    const { rerender } = render(<BottomEdgeProvider><Probe /><Claimant /><Claimant /></BottomEdgeProvider>);
    rerender(<BottomEdgeProvider><Probe /><Claimant /></BottomEdgeProvider>);
    expect(screen.getByTestId("owned")).toHaveTextContent("true");
  });

  it("is a no-op outside the provider, so a form in the customer zone can still use the same bar", () => {
    render(<><Probe /><Claimant /></>);
    expect(screen.getByTestId("owned")).toHaveTextContent("false");
  });
});
