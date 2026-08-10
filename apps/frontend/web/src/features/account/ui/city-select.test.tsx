import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CitySelect, citiesForCountry } from "@ntizo/frontend-ui";

function Harness({ country, initial = "" }: { country: string; initial?: string }) {
  const [city, setCity] = useState(initial);
  return (
    <>
      <label htmlFor="city">City</label>
      <CitySelect
        id="city"
        value={city}
        onChange={setCity}
        country={country}
        toggleLabel="Show cities"
      />
    </>
  );
}

describe("CitySelect", () => {
  it("keeps a city that is not in the suggestions", async () => {
    // The whole reason this is an input and not a select. Mozambique has
    // hundreds of places somebody legitimately lives, and a list of twenty
    // that refuses the other ones is a form nobody can complete.
    const user = userEvent.setup();
    render(<Harness country="MZ" />);

    const field = screen.getByLabelText("City");
    await user.type(field, "Namaacha");

    expect(field).toHaveValue("Namaacha");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("offers the country's cities and fills the field when one is chosen", async () => {
    const user = userEvent.setup();
    render(<Harness country="MZ" />);

    await user.type(screen.getByLabelText("City"), "map");
    await user.click(screen.getByRole("option", { name: "Maputo" }));

    expect(screen.getByLabelText("City")).toHaveValue("Maputo");
  });

  it("suggests nothing for a country with no curated list", async () => {
    // An empty dropdown would read as "your city does not exist". A plain
    // input says nothing, which is the truth.
    const user = userEvent.setup();
    render(<Harness country="JP" />);

    await user.click(screen.getByLabelText("City"));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens the whole list from the chevron, not just what matches", async () => {
    // The affordance that says a list exists. Without it the field is a text
    // box, and a list nobody knows about is a list nobody uses.
    const user = userEvent.setup();
    render(<Harness country="MZ" initial="Beira" />);

    await user.click(screen.getByRole("button", { name: "Show cities" }));

    const shown = screen.getAllByRole("option").map((o) => o.textContent);
    expect(shown).toContain("Maputo");
    expect(shown).toContain("Beira");
  });

  it("drops the typed filter when reopened from the chevron", async () => {
    // Reaching the chevron from a field that already has focus and a query is
    // the only path where the button's own state handling runs — focusing an
    // already-focused input fires no focus event to reset it.
    const user = userEvent.setup();
    render(<Harness country="MZ" />);

    await user.type(screen.getByLabelText("City"), "map");
    expect(screen.getAllByRole("option")).toHaveLength(1);

    const chevron = screen.getByRole("button", { name: "Show cities" });
    await user.click(chevron); // closes
    await user.click(chevron); // reopens, unfiltered

    expect(screen.getAllByRole("option").map((o) => o.textContent)).toContain("Matola");
  });

  it("hides the chevron when there is nothing to open", async () => {
    render(<Harness country="JP" />);

    expect(screen.queryByRole("button", { name: "Show cities" })).not.toBeInTheDocument();
  });

  it("picks with the keyboard alone", async () => {
    const user = userEvent.setup();
    render(<Harness country="MZ" />);

    await user.click(screen.getByLabelText("City"));
    await user.keyboard("{ArrowDown}{Enter}");

    // Down once from the top of an unfiltered list lands on the second entry.
    // Read from the list rather than named, so curating the cities does not
    // break a test about the arrow keys.
    expect(screen.getByLabelText("City")).toHaveValue(citiesForCountry("MZ")[1]);
  });

  it("does not offer another country's cities", async () => {
    const user = userEvent.setup();
    render(<Harness country="PT" />);

    await user.type(screen.getByLabelText("City"), "a");

    const shown = screen.getAllByRole("option").map((o) => o.textContent);
    expect(shown).not.toContain("Maputo");
    expect(shown).toContain("Braga");
  });
});
