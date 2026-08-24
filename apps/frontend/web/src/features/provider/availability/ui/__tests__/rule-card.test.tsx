import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RuleCard } from "../rule-card";
import { WEEKDAY_ORDER, groupRules } from "../../domain/week";
import type { WeeklyRuleDraft } from "../../domain/types";

/**
 * The card is the read view of one group of weekly rows — the rows that share
 * a pair of times. It renders from `groupRules`' own output rather than from a
 * hand-built object so the two cannot drift: a grouping change that broke the
 * card would break this suite in the same commit.
 */

const LOCALE = "en-US";

/** A full `WeeklyRuleDraft` for a card test — shape is never what these tests are about. */
function rule(weekday: number, startMinute: number, endMinute: number): WeeklyRuleDraft {
  return { weekday, startMinute, endMinute, bufferMinutes: null, slotIntervalMinutes: null, capacity: null };
}

function renderCard(rules: WeeklyRuleDraft[], overrides: Partial<Parameters<typeof RuleCard>[0]> = {}) {
  const group = groupRules(rules)[0]!;
  const onEdit = vi.fn();
  const onRemove = vi.fn();
  render(
    <RuleCard
      group={group}
      locale={LOCALE}
      canEdit
      onEdit={onEdit}
      onRemove={onRemove}
      {...overrides}
    />,
  );
  return { group, onEdit, onRemove, card: screen.getByRole("group") };
}

describe("RuleCard", () => {
  it("a rule card names its days and its hours", () => {
    const { card } = renderCard([rule(1, 540, 1020), rule(3, 540, 1020)]);

    // The dial's letters are ambiguous — `en-US` narrow has two S and two T —
    // so the day names live where they cannot be misread: the group's own
    // accessible name, and a `title` per cell.
    expect(card).toHaveAccessibleName("Monday and Wednesday, 09:00 – 17:00");
    expect(within(card).getByTitle("Monday")).toHaveTextContent("M");
    expect(within(card).getByTitle("Wednesday")).toHaveTextContent("W");
    expect(within(card).getByText("09:00 – 17:00")).toBeInTheDocument();
    // …and what those two days add up to, which is the thing the card exists
    // to say that a bare list of rows does not.
    expect(within(card).getByText("16 hours a week.")).toBeInTheDocument();
  });

  /**
   * The dial is always seven cells, so a full week is not a list that grew —
   * it is the same control with nothing unlit. The sentence a screen reader
   * gets is where "Every day" still belongs: seven weekday names read out in
   * sequence is the list nobody wants, in the one place a reader cannot skim
   * past it.
   */
  it("a full week is spoken as 'Every day', not as seven names", () => {
    const { card } = renderCard(WEEKDAY_ORDER.map((weekday) => rule(weekday, 540, 1020)));

    expect(card).toHaveAccessibleName("Every day, 09:00 – 17:00");
    // The negative half is the point: the accessible name must not fall back
    // to reciting the week.
    expect(card).not.toHaveAccessibleName(/Monday/);
  });

  it("the dial shows the days a rule misses, not only the ones it covers", () => {
    const { card } = renderCard(
      WEEKDAY_ORDER.filter((w) => w !== 0).map((weekday) => rule(weekday, 540, 1020)),
    );

    // Sunday is off, and the cell for it is still drawn — a provider hunting
    // for the gap in their week can only see it if the gap is on screen.
    expect(card).toHaveAccessibleName(/Monday.*Saturday, 09:00 – 17:00/);
    expect(card).not.toHaveAccessibleName(/Sunday/);
    expect(within(card).getByTitle("Sunday")).toBeInTheDocument();
  });

  it("the edit and remove controls name the hours they act on", async () => {
    const user = userEvent.setup();
    const { onEdit, onRemove } = renderCard([rule(1, 540, 1020)]);

    // Groups are keyed by their hours, so naming the hours makes each card's
    // pair of controls distinguishable from every other card's on the screen.
    await user.click(screen.getByRole("button", { name: "Edit 09:00 – 17:00" }));
    await user.click(screen.getByRole("button", { name: "Remove 09:00 – 17:00" }));

    expect(onEdit).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("a reader who may not edit gets neither control", () => {
    const { card } = renderCard([rule(1, 540, 1020)], {
      canEdit: false,
    });

    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    // The rule itself is still readable — hiding the controls is not hiding
    // the information.
    expect(within(card).getByText("09:00 – 17:00")).toBeInTheDocument();
  });
});
