import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CitySelect } from "@ntizo/frontend-ui";

function Harness({ country }: { country: string }) {
  const [city, setCity] = useState("");
  return (
    <>
      <label htmlFor="city">City</label>
      <CitySelect id="city" value={city} onChange={setCity} country={country} />
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

  it("does not offer another country's cities", async () => {
    const user = userEvent.setup();
    render(<Harness country="PT" />);

    await user.type(screen.getByLabelText("City"), "a");

    const shown = screen.getAllByRole("option").map((o) => o.textContent);
    expect(shown).not.toContain("Maputo");
    expect(shown).toContain("Braga");
  });
});
