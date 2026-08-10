import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PhoneInput } from "@ntizo/frontend-ui";

function Harness({
  onValue,
  locale = "en-US",
}: {
  onValue?: (v: string, meta: { isValid: boolean }) => void;
  locale?: string;
}) {
  const [value, setValue] = useState("");
  return (
    <PhoneInput
      value={value}
      onChange={(next, meta) => {
        setValue(next);
        onValue?.(next, meta);
      }}
      defaultCountry="MZ"
      locale={locale}
      placeholder="Phone number"
      searchPlaceholder="Search country"
      noResultsText="No country found"
      countrySelectLabel="Select country"
    />
  );
}

const numberField = () => screen.getByPlaceholderText("Phone number");
const countryButton = () => screen.getByLabelText("Select country");

describe("PhoneInput", () => {
  it("emits E.164 built from the selected country", async () => {
    const user = userEvent.setup();
    let last = "";
    render(<Harness onValue={(v) => (last = v)} />);

    await user.type(numberField(), "841234567");

    expect(last).toBe("+258841234567");
  });

  it("reports validity so the form can reject a half-typed number", async () => {
    const user = userEvent.setup();
    let valid: boolean | undefined;
    render(<Harness onValue={(_, meta) => (valid = meta.isValid)} />);

    await user.type(numberField(), "84");
    expect(valid).toBe(false);

    await user.type(numberField(), "1234567");
    expect(valid).toBe(true);
  });

  it("re-derives the country code when the country changes", async () => {
    const user = userEvent.setup();
    let last = "";
    render(<Harness onValue={(v) => (last = v)} />);

    await user.type(numberField(), "912345678");
    expect(last).toBe("+258912345678");

    await user.click(countryButton());
    await user.type(screen.getByPlaceholderText("Search country"), "Portugal");
    await user.click(screen.getByText("Portugal"));

    // Same digits, new prefix — the typed number is not discarded.
    expect(last).toBe("+351912345678");
  });

  it("names countries in the active language", async () => {
    const user = userEvent.setup();
    render(<Harness locale="pt-PT" />);

    await user.click(countryButton());
    await user.type(screen.getByPlaceholderText("Search country"), "Alemanha");

    expect(screen.getByText("Alemanha")).toBeInTheDocument();
  });

  it("finds a country by its dialling code", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(countryButton());
    await user.type(screen.getByPlaceholderText("Search country"), "+351");

    expect(screen.getByText("Portugal")).toBeInTheDocument();
  });

  it("says so when nothing matches, instead of showing an empty box", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(countryButton());
    await user.type(screen.getByPlaceholderText("Search country"), "zzzzz");

    expect(screen.getByText("No country found")).toBeInTheDocument();
  });
});
