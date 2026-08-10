import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DatePicker,
  Select,
  parseISO,
  toISO,
  type SelectOption,
} from "@ntizo/frontend-ui";

const FEW: SelectOption[] = [
  { value: "organization", label: "Organisation" },
  { value: "individual", label: "Individual" },
];

const MANY: SelectOption[] = Array.from({ length: 12 }, (_, i) => ({
  value: `v${i}`,
  label: `Option ${i}`,
}));

function SelectHarness({
  options = FEW,
  initial = "",
  searchable,
}: {
  options?: SelectOption[];
  initial?: string;
  searchable?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Select
      id="field"
      value={value}
      onChange={setValue}
      options={options}
      searchable={searchable}
      placeholder="Choose"
      searchPlaceholder="Search"
      noResultsText="Nothing found"
      ariaLabel="Field"
    />
  );
}

describe("Select", () => {
  it("shows the placeholder until something is chosen", async () => {
    const user = userEvent.setup();
    render(<SelectHarness />);

    const trigger = screen.getByRole("button", { name: "Field" });
    expect(trigger).toHaveTextContent("Choose");

    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: /Individual/ }));

    expect(trigger).toHaveTextContent("Individual");
  });

  it("hides the search box on a short list and shows it on a long one", async () => {
    // A search box above two options is furniture; its absence above forty is
    // a scroll nobody should have to do.
    const user = userEvent.setup();
    const { unmount } = render(<SelectHarness />);
    await user.click(screen.getByRole("button", { name: "Field" }));
    expect(screen.queryByPlaceholderText("Search")).not.toBeInTheDocument();
    unmount();

    render(<SelectHarness options={MANY} />);
    await user.click(screen.getByRole("button", { name: "Field" }));
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
  });

  it("filters by label and by value", async () => {
    // Someone who knows the code should not have to remember the interface's
    // wording for it.
    const user = userEvent.setup();
    render(<SelectHarness options={MANY} />);

    await user.click(screen.getByRole("button", { name: "Field" }));
    await user.type(screen.getByPlaceholderText("Search"), "v11");

    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent("Option 11");
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    render(<SelectHarness options={MANY} />);

    await user.click(screen.getByRole("button", { name: "Field" }));
    await user.type(screen.getByPlaceholderText("Search"), "zzzz");

    expect(screen.getByText("Nothing found")).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("opens on the current choice rather than the top of the list", async () => {
    // Otherwise a filled field's first arrow key jumps to somewhere unrelated.
    const user = userEvent.setup();
    render(<SelectHarness options={MANY} initial="v5" />);

    await user.click(screen.getByRole("button", { name: "Field" }));
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByRole("button", { name: "Field" })).toHaveTextContent(
      "Option 6",
    );
  });

  it("returns focus to the trigger after a choice made from the search box", async () => {
    // With a search box the focus genuinely IS elsewhere when the choice
    // lands, and the popover then unmounts under it. Without the handoff the
    // focus falls to <body> and the next Tab restarts at the top of the page.
    // On a short list this proves nothing — the click never leaves the
    // trigger — which is why the long list is the one under test.
    const user = userEvent.setup();
    render(<SelectHarness options={MANY} />);

    const trigger = screen.getByRole("button", { name: "Field" });
    await user.click(trigger);
    expect(document.activeElement).toBe(screen.getByPlaceholderText("Search"));

    await user.click(screen.getByRole("option", { name: /Option 3/ }));
    expect(document.activeElement).toBe(trigger);
  });

  it("steps over a disabled option instead of stopping on it", async () => {
    // An arrow key that appears to do nothing reads as a broken control.
    const user = userEvent.setup();
    render(
      <SelectHarness
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B", disabled: true },
          { value: "c", label: "C" },
        ]}
        initial="a"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Field" }));
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByRole("button", { name: "Field" })).toHaveTextContent(
      "C",
    );
  });
});

function DateHarness({
  initial = "",
  max,
}: {
  initial?: string;
  max?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <DatePicker
      id="dob"
      value={value}
      onChange={setValue}
      locale="en-GB"
      max={max}
      placeholder="Pick a date"
      todayLabel="Today"
      clearLabel="Clear"
      monthLabel="Month"
      yearLabel="Year"
    />
  );
}

describe("DatePicker", () => {
  it("reads a date as three numbers, not as an instant", () => {
    // `new Date("1999-02-06")` is midnight UTC, so west of Greenwich a naive
    // render says the 5th — a birthday that moves by a day for every user in
    // Brazil. Asserted on the parser rather than on a render, because a render
    // test run on a machine in Lisbon passes either way and would have called
    // this fixed while it was broken for a whole market.
    expect(parseISO("1999-02-06")).toEqual({ year: 1999, month: 2, day: 6 });
    expect(parseISO("2020-12-31")).toEqual({ year: 2020, month: 12, day: 31 });
    expect(toISO(1999, 2, 6)).toBe("1999-02-06");
  });

  it("refuses a value that is not a date", () => {
    for (const bad of [
      "",
      "1999-2-6",
      "not-a-date",
      "1999-13-01",
      "1999-02-00",
    ]) {
      expect(parseISO(bad)).toBeNull();
    }
  });

  it("keeps the weekday headings to one column each", async () => {
    // `weekday: "short"` is the whole word in Portuguese — CLDR's abbreviated
    // form for pt is "domingo", "segunda" — so the launch language rendered
    // seven full words on top of each other. Narrow is also what every printed
    // Portuguese calendar uses.
    const user = userEvent.setup();
    render(<DateHarness initial="1999-02-06" />);
    await user.click(screen.getByRole("button", { name: /6 February 1999/ }));

    const headings = document.querySelectorAll("abbr[title]");
    expect(headings).toHaveLength(7);
    for (const h of headings) {
      expect(h.textContent?.length).toBeLessThanOrEqual(2);
      // The letters repeat, so the full name has to be reachable.
      expect(h.getAttribute("title")?.length).toBeGreaterThan(2);
    }
  });

  it("shows the stored date in the reader's format", () => {
    render(<DateHarness initial="1999-02-06" />);
    expect(
      screen.getByRole("button", { name: /6 February 1999/ }),
    ).toBeInTheDocument();
  });

  it("writes back the ISO date the form expects", async () => {
    const user = userEvent.setup();
    render(<DateHarness initial="1999-02-06" />);

    await user.click(screen.getByRole("button", { name: /6 February 1999/ }));
    await user.click(screen.getByRole("button", { name: "15" }));

    expect(
      screen.getByRole("button", { name: /15 February 1999/ }),
    ).toBeInTheDocument();
  });

  it("opens on the chosen month, not on today", async () => {
    // Otherwise every edit of a 1999 birthday starts by navigating back
    // three hundred months.
    const user = userEvent.setup();
    render(<DateHarness initial="1999-02-06" />);

    await user.click(screen.getByRole("button", { name: /6 February 1999/ }));

    expect(screen.getByRole("button", { name: "Year" })).toHaveTextContent(
      "1999",
    );
    expect(screen.getByRole("button", { name: "Month" })).toHaveTextContent(
      "February",
    );
  });

  it("blocks a date past the maximum", async () => {
    const user = userEvent.setup();
    render(<DateHarness initial="2020-06-10" max="2020-06-15" />);

    await user.click(screen.getByRole("button", { name: /10 June 2020/ }));

    expect(screen.getByRole("button", { name: "14" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "16" })).toBeDisabled();
  });

  it("clears back to empty", async () => {
    const user = userEvent.setup();
    render(<DateHarness initial="1999-02-06" />);

    await user.click(screen.getByRole("button", { name: /6 February 1999/ }));
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(
      screen.getByRole("button", { name: /Pick a date/ }),
    ).toBeInTheDocument();
  });
});
