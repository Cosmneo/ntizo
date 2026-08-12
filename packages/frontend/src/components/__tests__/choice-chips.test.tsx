import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChoiceChips, ChoiceChipsMulti } from "../choice-chips";

const OPTIONS = [
  { value: "a", label: "At the customer" },
  { value: "b", label: "At my place" },
  { value: "c", label: "Remote" },
];

describe("ChoiceChips (single)", () => {
  test("exposes the group as a radiogroup with its legend", () => {
    render(<ChoiceChips name="where" legend="Where it happens" options={OPTIONS} value={null} onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Where it happens" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  test("reports the selected option as checked and the others as not", () => {
    render(<ChoiceChips name="where" legend="Where" options={OPTIONS} value="b" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "At my place" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Remote" })).not.toBeChecked();
  });

  test("clicking a chip reports its value once", async () => {
    const onChange = vi.fn();
    render(<ChoiceChips name="where" legend="Where" options={OPTIONS} value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Remote" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("c");
  });

  // The whole reason this is built on native radios. If this fails, the
  // component has been rewritten with hand-rolled roles and has lost the
  // behaviour the browser was giving for free.
  test("arrow keys move the selection within the group", async () => {
    const onChange = vi.fn();
    render(<ChoiceChips name="where" legend="Where" options={OPTIONS} value="a" onChange={onChange} />);
    screen.getByRole("radio", { name: "At the customer" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  test("the group is one tab stop", async () => {
    render(
      <>
        <button type="button">before</button>
        <ChoiceChips name="where" legend="Where" options={OPTIONS} value="a" onChange={() => {}} />
        <button type="button">after</button>
      </>,
    );
    screen.getByRole("button", { name: "before" }).focus();
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "At the customer" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "after" })).toHaveFocus();
  });

  test("a disabled option cannot be chosen", async () => {
    const onChange = vi.fn();
    const opts = [...OPTIONS, { value: "d", label: "Nowhere", disabled: true }];
    render(<ChoiceChips name="where" legend="Where" options={opts} value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Nowhere" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  // jsdom loads no stylesheet, so a `display:none`/`visibility:hidden` class
  // is invisible to it — the tab-stop tests above pass whether the input is
  // actually clipped or actually removed from the tab order, because jsdom
  // never sees the CSS that would make the difference. This asserts the
  // class contract directly instead: `sr-only` is a promise about how the
  // input is hidden, not just that it is, and only this test enforces it.
  test("the input is clipped, not display:none — anything else drops it from the tab order", () => {
    render(<ChoiceChips name="where" legend="Where" options={OPTIONS} value={null} onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "At the customer" })).toHaveClass("sr-only");
  });

  test("an error is announced with the group", () => {
    render(<ChoiceChips name="where" legend="Where" options={OPTIONS} value={null} onChange={() => {}} error="Pick one" />);
    expect(screen.getByRole("radiogroup", { name: /Where/ })).toHaveAccessibleDescription("Pick one");
  });
});

describe("ChoiceChipsMulti", () => {
  test("renders checkboxes, not radios", () => {
    render(<ChoiceChipsMulti name="langs" legend="Languages" options={OPTIONS} value={[]} onChange={() => {}} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  test("adds to the selection without dropping what was there", async () => {
    const onChange = vi.fn();
    render(<ChoiceChipsMulti name="langs" legend="Languages" options={OPTIONS} value={["a"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Remote" }));
    expect(onChange).toHaveBeenCalledWith(["a", "c"]);
  });

  test("clicking a chosen chip removes it", async () => {
    const onChange = vi.fn();
    render(<ChoiceChipsMulti name="langs" legend="Languages" options={OPTIONS} value={["a", "c"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "At the customer" }));
    expect(onChange).toHaveBeenCalledWith(["c"]);
  });

  test("each chip is its own tab stop, as checkboxes are", async () => {
    render(<ChoiceChipsMulti name="langs" legend="Languages" options={OPTIONS} value={[]} onChange={() => {}} />);
    screen.getByRole("checkbox", { name: "At the customer" }).focus();
    await userEvent.tab();
    expect(screen.getByRole("checkbox", { name: "At my place" })).toHaveFocus();
  });

  test("space toggles the focused chip", async () => {
    const onChange = vi.fn();
    render(<ChoiceChipsMulti name="langs" legend="Languages" options={OPTIONS} value={[]} onChange={onChange} />);
    screen.getByRole("checkbox", { name: "At my place" }).focus();
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  // Same reasoning as the single-select block: the tab-stop test can't see
  // a CSS-visibility regression in jsdom, so the `sr-only` class itself is
  // the thing under test here.
  test("the input is clipped, not display:none — anything else drops it from the tab order", () => {
    render(<ChoiceChipsMulti name="langs" legend="Languages" options={OPTIONS} value={[]} onChange={() => {}} />);
    expect(screen.getByRole("checkbox", { name: "At the customer" })).toHaveClass("sr-only");
  });
});
