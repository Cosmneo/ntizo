import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackageChooser } from "../package-chooser";

const opt = (over = {}) => ({
  id: "o1", name: "Cerimónia", amountMinor: 35000, currency: "MZN",
  durationMinutes: 60, minMinutes: null, stepMinutes: null,
  pricingMode: "fixed", isDefault: false, ...over,
});

describe("PackageChooser", () => {
  it("selects the provider's default package on arrival", () => {
    render(<PackageChooser locale="pt-MZ" options={[
      opt(), opt({ id: "o2", name: "Dia completo", amountMinor: 85000, isDefault: true }),
    ]} />);
    expect(screen.getByRole("radio", { name: /Dia completo/ })).toBeChecked();
  });

  it("falls back to the cheapest when none is marked default", () => {
    render(<PackageChooser locale="pt-MZ" options={[
      opt({ id: "o1", amountMinor: 35000 }), opt({ id: "o2", name: "Dia", amountMinor: 85000 }),
    ]} />);
    expect(screen.getByRole("radio", { name: /Cerimónia/ })).toBeChecked();
  });

  it("recalculates the total when another package is chosen", async () => {
    // The whole point of the component: a chooser whose total does not follow
    // the choice is worse than no total at all.
    render(<PackageChooser locale="pt-MZ" options={[
      opt({ amountMinor: 50000, isDefault: true }),
      opt({ id: "o2", name: "Dia completo", amountMinor: 85000 }),
    ]} />);
    await userEvent.click(screen.getByRole("radio", { name: /Dia completo/ }));
    // 850 + 85 = 935. Asserted on digits so the currency format is not the test.
    expect(screen.getByTestId("booking-total").textContent).toMatch(/935/);
  });

  it("renders nothing at all with no packages", () => {
    // A quote service. An empty chooser with a 0,00 total would invite
    // somebody to book a price the provider has not set.
    const { container } = render(<PackageChooser locale="pt-MZ" options={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
