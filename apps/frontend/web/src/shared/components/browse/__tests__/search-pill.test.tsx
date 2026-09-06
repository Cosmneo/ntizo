import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchPill } from "../search-pill";

/**
 * The props every test starts from. `onApply` is overwritten per test that
 * cares about it — `setup()` below does that — but the rest is the same
 * fixture throughout: a service search with "Maputo" already chosen.
 */
const baseProps = {
  termLabel: "Service",
  termPlaceholder: "What do you need?",
  cityLabel: "City",
  cityPlaceholder: "Anywhere",
  cities: ["Maputo", "Beira"],
};

describe("SearchPill", () => {
  function setup(onApply = vi.fn()) {
    render(
      <SearchPill {...baseProps} term="" city="Maputo" onApply={onApply} />,
    );
    return onApply;
  }

  it("submits both fields together, from the drafts", async () => {
    // Composing the next search from the URL instead of the drafts is what
    // threw away a typed term the moment the other field was touched.
    const onApply = setup();
    const form = within(screen.getByRole("search"));
    await userEvent.click(form.getByRole("button", { name: /service/i }));
    await userEvent.type(screen.getByLabelText("Service"), "corte");
    // The desktop submit button and the phone trigger both carry "search" in
    // their accessible name — the trigger's comes from `searchPillOpen`, on
    // purpose (see the component's own doc comment) — so this is scoped to
    // the form to reach the right one.
    await userEvent.click(form.getByRole("button", { name: /search/i }));
    expect(onApply).toHaveBeenCalledWith({ term: "corte", city: "Maputo" });
  });

  it("submits on Enter, because it is a real form", async () => {
    const onApply = setup();
    const form = within(screen.getByRole("search"));
    await userEvent.click(form.getByRole("button", { name: /service/i }));
    await userEvent.type(screen.getByLabelText("Service"), "corte{Enter}");
    expect(onApply).toHaveBeenCalled();
  });

  it("returns focus to the field's button when Escape closes it", async () => {
    setup();
    const form = within(screen.getByRole("search"));
    const button = form.getByRole("button", { name: /service/i });
    await userEvent.click(button);
    await userEvent.keyboard("{Escape}");
    expect(form.getByRole("button", { name: /service/i })).toHaveFocus();
  });

  it("puts the URL back into both fields when it changes underneath", () => {
    const { rerender } = render(
      <SearchPill {...baseProps} term="corte" city="Maputo" onApply={vi.fn()} />,
    );
    rerender(<SearchPill {...baseProps} term="" city="" onApply={vi.fn()} />);
    const form = within(screen.getByRole("search"));
    expect(form.getByRole("button", { name: /service/i })).toHaveTextContent(
      "What do you need?",
    );
  });
});
