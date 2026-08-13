import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServiceQuoteNotice } from "../service-quote-notice";

describe("ServiceQuoteNotice", () => {
  it("explains that the price is not knowable until the provider has seen the job", () => {
    render(<ServiceQuoteNotice />);
    // The exact English copy of `availabilityQuoteNotice` — reused rather than
    // duplicated, so this test also pins that the reuse stays wired.
    expect(
      screen.getByText(
        "This service is priced by quote. Contact the provider to get a price before it can be scheduled.",
      ),
    ).toBeInTheDocument();
  });

  it("offers to contact the provider, disabled rather than a working link", () => {
    render(<ServiceQuoteNotice />);
    const button = screen.getByRole("button", { name: /Contact provider/ });
    expect(button).toBeDisabled();
    expect(button.tagName).toBe("BUTTON");
  });
});
