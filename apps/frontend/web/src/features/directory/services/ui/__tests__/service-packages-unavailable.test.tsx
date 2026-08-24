import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServicePackagesUnavailable } from "../service-packages-unavailable";

describe("ServicePackagesUnavailable", () => {
  it("explains that the service has no bookable package right now", () => {
    render(<ServicePackagesUnavailable />);
    expect(
      screen.getByText("This service doesn't currently have a bookable package. Please check back soon."),
    ).toBeInTheDocument();
  });

  it("never reuses the quote notice's copy or its 'contact provider' button", () => {
    // A `priced` service already has a price — telling the reader to contact
    // the provider "to get one" would be wrong advice, not a mislabelled
    // button, which is why this notice offers no action at all.
    render(<ServicePackagesUnavailable />);
    expect(screen.queryByText(/priced by quote/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
