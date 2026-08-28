import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CitySelect } from "@ntizo/frontend-ui";

const MAPUTO = ["Maputo", "Matola", "Beira", "Nampula"];

function Harness({
  cities = MAPUTO,
  initial = "",
  loading = false,
  autoFocus = false,
}: {
  cities?: string[];
  initial?: string;
  loading?: boolean;
  autoFocus?: boolean;
}) {
  const [city, setCity] = useState(initial);
  return (
    <>
      <label htmlFor="city">City</label>
      <CitySelect
        id="city"
        value={city}
        onChange={setCity}
        cities={cities}
        loading={loading}
        autoFocus={autoFocus}
        toggleLabel="Show cities"
        noResultsText="No city found"
        loadingText="Searching…"
      />
    </>
  );
}

describe("CitySelect", () => {
  it("keeps a city the gazetteer does not offer", async () => {
    // The reason this is an input and not a select. 235 000 places is not all
    // of them: a settlement too new or too small to have been surveyed is not
    // in any gazetteer, and the person who lives there still has to book.
    const user = userEvent.setup();
    render(<Harness cities={[]} />);

    const field = screen.getByLabelText("City");
    await user.type(field, "Namaacha");

    expect(field).toHaveValue("Namaacha");
  });

  it("fills the field from the list", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByLabelText("City"));
    await user.click(screen.getByRole("option", { name: "Matola" }));

    expect(screen.getByLabelText("City")).toHaveValue("Matola");
  });

  it("opens the list from the chevron", async () => {
    // The affordance that says a list exists. Without it the field is a text
    // box, and a list nobody knows about is a list nobody uses.
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Show cities" }));

    expect(screen.getAllByRole("option")).toHaveLength(MAPUTO.length);
  });

  it("says why the list is empty rather than showing a blank popover", async () => {
    // Empty and silent reads as broken. The two reasons it can be empty ask
    // for different patience, so they say different things.
    const user = userEvent.setup();
    const { rerender } = render(<Harness cities={[]} loading />);

    await user.click(screen.getByLabelText("City"));
    expect(screen.getByText("Searching…")).toBeInTheDocument();

    rerender(<Harness cities={[]} loading={false} />);
    expect(screen.getByText("No city found")).toBeInTheDocument();
  });

  it("picks with the keyboard alone", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByLabelText("City"));
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByLabelText("City")).toHaveValue(MAPUTO[1]);
  });

  it("opens its own list as soon as it mounts focused", () => {
    // For a field that gets swapped into place by a click on something else
    // — the hero search card's city button, for one — that earlier click
    // cannot also focus the control it reveals. `autoFocus` closes that gap:
    // focusing the input is what opens the list, so mounting focused makes the
    // swap-in itself the one click that opens it.
    render(<Harness autoFocus />);
    expect(screen.getByLabelText("City")).toHaveFocus();
    expect(screen.getAllByRole("option")).toHaveLength(MAPUTO.length);
  });

  it("stays closed when nothing asked it to focus", () => {
    // The default, and every existing caller: a field already on screen in a
    // form has no reason to pop its list open unasked.
    render(<Harness />);
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("moves the highlight back to the top when the offered set changes", async () => {
    // Otherwise the highlight sits at whatever row happens to occupy that
    // index in the new list, which is not the row the user was looking at.
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);

    await user.click(screen.getByLabelText("City"));
    await user.keyboard("{ArrowDown}{ArrowDown}");

    rerender(<Harness cities={["Pemba", "Tete"]} />);
    await user.keyboard("{Enter}");

    expect(screen.getByLabelText("City")).toHaveValue("Pemba");
  });
});
