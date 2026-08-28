import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ServiceDetailOptionDTO } from "@ntizo/shared/read-models";
import { ServiceOptions } from "../service-options";

function option(over: Partial<ServiceDetailOptionDTO> = {}): ServiceDetailOptionDTO {
  return {
    id: "opt-1",
    name: "Diagnóstico e reparação",
    amountMinor: 120000,
    currency: "MZN",
    durationMinutes: 60,
    minMinutes: null,
    stepMinutes: null,
    pricingMode: "fixed",
    isDefault: true,
    ...over,
  };
}

const THREE = [
  option(),
  option({
    id: "opt-2",
    name: "Diagnóstico alargado",
    amountMinor: 190000,
    durationMinutes: 120,
    isDefault: false,
  }),
  option({ id: "opt-3", name: "Urgência fora de horas", amountMinor: 240000, isDefault: false }),
];

describe("ServiceOptions", () => {
  it("renders nothing for a single option", () => {
    // One radio in a group of one is a control that cannot be operated. A
    // service with one package says its price once, in the rail.
    const { container } = render(
      <ServiceOptions options={[option()]} selectedId="opt-1" onSelect={() => {}} locale="en-US" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for no options at all", () => {
    const { container } = render(
      <ServiceOptions options={[]} selectedId="" onSelect={() => {}} locale="en-US" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("is a radiogroup with one radio per option", () => {
    render(<ServiceOptions options={THREE} selectedId="opt-1" onSelect={() => {}} locale="en-US" />);
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("checks the selected option, and only that one", () => {
    render(<ServiceOptions options={THREE} selectedId="opt-2" onSelect={() => {}} locale="en-US" />);
    const checked = screen
      .getAllByRole("radio")
      .filter((radio) => radio.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveTextContent("Diagnóstico alargado");
  });

  it("reports the id of whichever option is chosen", async () => {
    const onSelect = vi.fn();
    render(<ServiceOptions options={THREE} selectedId="opt-1" onSelect={onSelect} locale="en-US" />);
    await userEvent.click(screen.getByRole("radio", { name: /Urgência fora de horas/ }));
    expect(onSelect).toHaveBeenCalledWith("opt-3");
  });

  it("prints each option's own price and length", () => {
    render(<ServiceOptions options={THREE} selectedId="opt-1" onSelect={() => {}} locale="en-US" />);
    // `formatAmount` is Intl currency formatting, so the group separator is
    // the locale's — matched loosely on purpose; the digits are the claim.
    expect(screen.getByText(/1[.,\s]?200/)).toBeInTheDocument();
    expect(screen.getByText(/1[.,\s]?900/)).toBeInTheDocument();
    expect(screen.getByText(/2[.,\s]?400/)).toBeInTheDocument();
    expect(screen.getByText(/120 min/)).toBeInTheDocument();
  });
});
