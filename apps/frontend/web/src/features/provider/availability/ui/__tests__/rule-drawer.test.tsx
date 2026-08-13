import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RuleDrawer } from "../rule-drawer";
import type { WeeklyRuleDraft } from "../../domain/types";

/**
 * The drawer edits one group of weekly rows: a set of days and one pair of
 * times, with a sentence at its foot naming what that produces.
 *
 * It is rendered already open and given `onSubmit` directly, so every test
 * here observes the two things that matter — whether a rule was handed back,
 * and what the reader was told when it was not — rather than whether a panel
 * animated.
 */

const MONDAY_MORNING: WeeklyRuleDraft = { weekday: 1, startMinute: 480, endMinute: 720 };

function renderDrawer(overrides: Partial<Parameters<typeof RuleDrawer>[0]> = {}) {
  const onSubmit = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <RuleDrawer
      open
      onOpenChange={onOpenChange}
      locale="en-US"
      initial={null}
      others={[]}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return {
    onSubmit,
    onOpenChange,
    start: screen.getByLabelText("Start"),
    end: screen.getByLabelText("End"),
    done: screen.getByRole("button", { name: "Done" }),
    day: (name: string) => screen.getByRole("checkbox", { name }),
  };
}

describe("RuleDrawer", () => {
  it("the drawer refuses a rule that ends before it starts, under the field", async () => {
    const user = userEvent.setup();
    const d = renderDrawer();

    await user.click(d.day("Monday"));
    await user.clear(d.end);
    await user.type(d.end, "08:00");
    await user.click(d.done);

    expect(d.onSubmit).not.toHaveBeenCalled();
    // "Under the field" is a wiring claim, not a layout one: the message has
    // to be the fields' own accessible description, or a reader who never
    // sees the page is told nothing.
    expect(d.end).toHaveAccessibleDescription("The end time must be after the start time.");
  });

  it("the drawer refuses a rule overlapping an existing one for the same weekday", async () => {
    const user = userEvent.setup();
    const d = renderDrawer({ others: [MONDAY_MORNING] });

    // The default 09:00–17:00 runs straight through 08:00–12:00.
    await user.click(d.day("Monday"));
    await user.click(d.done);

    expect(d.onSubmit).not.toHaveBeenCalled();
    expect(d.start).toHaveAccessibleDescription(
      "This time overlaps another one already set for this day.",
    );
  });

  it("the same hours on a day that has none are accepted", async () => {
    const user = userEvent.setup();
    const d = renderDrawer({ others: [MONDAY_MORNING] });

    // The other half of the refusal above. Without it, an `overlaps` that
    // always answered true would pass that test and this suite would be
    // saying nothing about the guard at all.
    await user.click(d.day("Tuesday"));
    await user.click(d.done);

    expect(d.onSubmit).toHaveBeenCalledWith([
      {
        weekday: 2,
        startMinute: 540,
        endMinute: 1020,
        bufferMinutes: null,
        slotIntervalMinutes: null,
        capacity: null,
      },
    ]);
  });

  it("a rule with no day chosen is refused rather than saved empty", async () => {
    const user = userEvent.setup();
    const d = renderDrawer();

    await user.click(d.done);

    expect(d.onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Pick at least one day.")).toBeInTheDocument();
  });

  it("the drawer's preview sentence names the resulting hours", async () => {
    const user = userEvent.setup();
    const d = renderDrawer();

    await user.click(d.day("Monday"));
    await user.click(d.day("Wednesday"));

    expect(
      screen.getByText("Monday and Wednesday, 09:00 – 17:00 — 16 hours a week."),
    ).toBeInTheDocument();

    // And it follows the fields rather than being written once: shortening
    // the day halves the week.
    await user.clear(d.end);
    await user.type(d.end, "13:00");

    expect(
      screen.getByText("Monday and Wednesday, 09:00 – 13:00 — 8 hours a week."),
    ).toBeInTheDocument();
  });

  it("editing an existing group opens on that group's own days and hours", async () => {
    const user = userEvent.setup();
    const d = renderDrawer({
      initial: {
        id: "480-720",
        startMinute: 480,
        endMinute: 720,
        weekdays: [1, 0],
        rules: [MONDAY_MORNING, { weekday: 0, startMinute: 480, endMinute: 720 }],
      },
      // The group under edit is never its own overlap — it is being replaced.
      others: [],
    });

    expect(d.start).toHaveValue("08:00");
    expect(d.end).toHaveValue("12:00");
    expect(d.day("Monday")).toBeChecked();
    expect(d.day("Sunday")).toBeChecked();
    expect(d.day("Tuesday")).not.toBeChecked();

    await user.click(d.done);
    expect(d.onSubmit).toHaveBeenCalledWith([
      {
        weekday: 1,
        startMinute: 480,
        endMinute: 720,
        bufferMinutes: null,
        slotIntervalMinutes: null,
        capacity: null,
      },
      {
        weekday: 0,
        startMinute: 480,
        endMinute: 720,
        bufferMinutes: null,
        slotIntervalMinutes: null,
        capacity: null,
      },
    ]);
  });

  it("a time that is not a time is refused before anything else is checked", async () => {
    const user = userEvent.setup();
    const d = renderDrawer();

    await user.click(d.day("Monday"));
    await user.clear(d.start);
    await user.type(d.start, "9h");
    await user.click(d.done);

    expect(d.onSubmit).not.toHaveBeenCalled();
    expect(d.start).toHaveAccessibleDescription("Enter a valid time, in the format 09:00.");
  });

  it("offers the three shape fields, each stating its default", async () => {
    renderDrawer();

    expect(screen.getByLabelText("Buffer time")).toHaveAttribute("placeholder", "Use default: 0 min");
    // Not `getByLabelText` — a `<fieldset>`/`<legend>` pair is not a labellable
    // element by the HTML spec `ChoiceChips` builds on, so its accessible name
    // is only reachable through the `radiogroup` role, exactly how
    // `choice-chips.test.tsx` in the shared package itself asserts it.
    expect(screen.getByRole("radiogroup", { name: "Time grid" })).toBeInTheDocument();
    expect(screen.getByLabelText("Capacity")).toHaveAttribute(
      "placeholder",
      "Use default: 1 booking",
    );
  });

  it("leaves an untouched field null rather than writing the default into it", async () => {
    const user = userEvent.setup();
    // "I did not say" and "I said 30" must stay different, or the day the
    // default changes every untouched rule silently keeps the old one.
    const d = renderDrawer();
    await user.click(d.day("Monday"));
    await user.click(d.done);

    expect(d.onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({ bufferMinutes: null, slotIntervalMinutes: null, capacity: null }),
    ]);
  });

  it("offers 'no slots' as a grid choice", async () => {
    const user = userEvent.setup();
    const d = renderDrawer();

    await user.click(d.day("Monday"));
    await user.click(screen.getByRole("radio", { name: "No slots" }));
    await user.click(d.done);

    expect(d.onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({ slotIntervalMinutes: 0 }),
    ]);
  });

  it("refuses a capacity below one", async () => {
    const user = userEvent.setup();
    const d = renderDrawer();

    await user.click(d.day("Monday"));
    await user.type(screen.getByLabelText("Capacity"), "0");
    await user.click(d.done);

    expect(d.onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("At least one booking must fit.")).toBeInTheDocument();
  });
});
