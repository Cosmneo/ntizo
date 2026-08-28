import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SortDropdown, type SortDropdownOption } from "../sort-dropdown";

type Sort = "newest" | "price";

const OPTIONS: ReadonlyArray<SortDropdownOption<Sort>> = [
  { value: undefined, label: "Suggested" },
  { value: "newest", label: "Newest" },
  { value: "price", label: "Price" },
];

describe("SortDropdown", () => {
  it("names the current order in the trigger's own name, not only in its text", () => {
    // An `aria-label` here used to *replace* the name with the word "Sort",
    // so the one thing this control exists to state was on screen and absent
    // from what the button is called: a screen reader announced no order at
    // all, and voice control could not act on the word it could see
    // (WCAG 2.5.3, Label in Name). Asserting the name rather than the text is
    // the whole point — the old test asserted text under a name of "Sort" and
    // so passed precisely because the name was wrong.
    render(
      <SortDropdown active="newest" options={OPTIONS} sortLabel="Sort" onChoose={() => undefined} />,
    );
    expect(screen.getByRole("button", { name: "Sort: Newest" })).toBeInTheDocument();
  });

  it("reads the default order's own label when the URL says nothing", () => {
    render(
      <SortDropdown active={undefined} options={OPTIONS} sortLabel="Sort" onChoose={() => undefined} />,
    );
    expect(screen.getByRole("button", { name: "Sort: Suggested" })).toBeInTheDocument();
  });

  it("keeps the words on the button inside the name it is called by", () => {
    // The visible label has to be *contained* in the accessible name, in
    // order, or "click Price" does nothing for a voice-control user.
    render(
      <SortDropdown active="price" options={OPTIONS} sortLabel="Sort" onChoose={() => undefined} />,
    );
    const trigger = screen.getByRole("button", { name: /Price$/ });
    expect(trigger).toHaveTextContent("Price");
  });

  it("lists every option, with only the active one checked", () => {
    render(
      <SortDropdown active="price" options={OPTIONS} sortLabel="Sort" onChoose={() => undefined} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Sort:/ }));

    expect(screen.getAllByRole("menuitemradio")).toHaveLength(3);
    expect(screen.getByRole("menuitemradio", { name: "Suggested" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("menuitemradio", { name: "Newest" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("menuitemradio", { name: "Price" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("marks the active order in the brand colour, and no other", () => {
    render(
      <SortDropdown active="price" options={OPTIONS} sortLabel="Sort" onChoose={() => undefined} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Sort:/ }));

    expect(screen.getByRole("menuitemradio", { name: "Price" }).className).toContain(
      "--color-primary",
    );
    expect(screen.getByRole("menuitemradio", { name: "Newest" }).className).not.toContain(
      "--color-primary",
    );
  });

  it("holds every row's width steady, checked or not, so the tick cannot shift the label", () => {
    // The tick is drawn only for the active row, but every row still carries
    // a same-sized placeholder in its place — an absent one would let the
    // label creep rightward on every row that is not currently checked.
    render(
      <SortDropdown active="price" options={OPTIONS} sortLabel="Sort" onChoose={() => undefined} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Sort:/ }));

    const inactive = screen.getByRole("menuitemradio", { name: "Newest" });
    expect(inactive.querySelector('[aria-hidden="true"].h-4.w-4')).toBeTruthy();
  });

  it("chooses the default order as an absent value, never a value of its own", () => {
    const onChoose = vi.fn();
    render(<SortDropdown active="price" options={OPTIONS} sortLabel="Sort" onChoose={onChoose} />);
    fireEvent.click(screen.getByRole("button", { name: /^Sort:/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Suggested" }));

    expect(onChoose).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it("is worked end to end without a mouse", async () => {
    // The trigger here is the design system's `Button`, not a bare <button>,
    // so this is also the check that the menu's keyboard handling survives
    // being cloned onto a forwarding component rather than an element.
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(<SortDropdown active={undefined} options={OPTIONS} sortLabel="Sort" onChoose={onChoose} />);

    const trigger = screen.getByRole("button", { name: /^Sort:/ });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menuitemradio", { name: "Suggested" })).toHaveFocus();

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onChoose).toHaveBeenCalledExactlyOnceWith("price");

    // And the reader is put back on the control they opened, not on <body>.
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("chooses a named order by its value", () => {
    const onChoose = vi.fn();
    render(<SortDropdown active={undefined} options={OPTIONS} sortLabel="Sort" onChoose={onChoose} />);
    fireEvent.click(screen.getByRole("button", { name: /^Sort:/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Newest" }));

    expect(onChoose).toHaveBeenCalledExactlyOnceWith("newest");
  });
});
