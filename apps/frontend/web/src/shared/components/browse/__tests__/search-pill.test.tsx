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

  /**
   * The header this pill sits in is `sticky … z-20`, which is a stacking
   * context: rendered inline, the sheet's `z-[60]` panel only outranked things
   * *inside* the header, and the page's floating control (`z-30`) and the
   * customer bottom bar (`z-40`) painted straight over it. Escaping to
   * `document.body` is the whole fix, so the test asserts where the dialog
   * lands rather than a z-index nothing computes under jsdom.
   */
  it("renders the phone sheet outside the pill, in the document body", async () => {
    const { container } = render(
      <SearchPill {...baseProps} term="" city="Maputo" onApply={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /change your search/i }));

    const dialog = screen.getByRole("dialog");
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
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
