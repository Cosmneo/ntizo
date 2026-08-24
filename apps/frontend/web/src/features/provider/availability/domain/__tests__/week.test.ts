import { describe, expect, test } from "vitest";
import {
  formatDayList,
  formatHours,
  groupRules,
  labelToMinutes,
  minutesToLabel,
  overlaps,
  weekdayShortLabel,
} from "../week";
import type { WeeklyRuleDraft } from "../types";

/** A full `WeeklyRuleDraft`, shape defaulted to "untouched" unless a test needs otherwise. */
function rule(
  weekday: number,
  startMinute: number,
  endMinute: number,
  shape: Partial<Pick<WeeklyRuleDraft, "bufferMinutes" | "slotIntervalMinutes" | "capacity">> = {},
): WeeklyRuleDraft {
  return {
    weekday,
    startMinute,
    endMinute,
    bufferMinutes: shape.bufferMinutes ?? null,
    slotIntervalMinutes: shape.slotIntervalMinutes ?? null,
    capacity: shape.capacity ?? null,
  };
}

describe("minutesToLabel", () => {
  test("pads to two digits", () => {
    expect(minutesToLabel(540)).toBe("09:00");
    expect(minutesToLabel(485)).toBe("08:05");
  });
  test("midnight at the end of the day reads as 24:00", () => {
    expect(minutesToLabel(1440)).toBe("24:00");
  });
  test("midnight at the start reads as 00:00", () => {
    expect(minutesToLabel(0)).toBe("00:00");
  });
});

describe("labelToMinutes", () => {
  test("reads a valid label", () => expect(labelToMinutes("09:30")).toBe(570));
  test("reads 24:00", () => expect(labelToMinutes("24:00")).toBe(1440));
  test("rejects nonsense", () => {
    expect(labelToMinutes("9h30")).toBeNull();
    expect(labelToMinutes("25:00")).toBeNull();
    expect(labelToMinutes("09:70")).toBeNull();
    expect(labelToMinutes("")).toBeNull();
  });
  test("rejects 24:30 — the regex admits it, the clock does not", () => {
    expect(labelToMinutes("24:30")).toBeNull();
  });
  test("rejects 24:01 — one minute past the boundary", () => {
    expect(labelToMinutes("24:01")).toBeNull();
  });
  test("still accepts 24:00 itself", () => {
    expect(labelToMinutes("24:00")).toBe(1440);
  });
});

describe("overlaps", () => {
  const monday = rule(1, 480, 720);
  test("a row inside another overlaps", () => {
    expect(overlaps([monday], rule(1, 540, 600))).toBe(true);
  });
  test("a row straddling the end overlaps", () => {
    expect(overlaps([monday], rule(1, 660, 840))).toBe(true);
  });
  test("a row starting exactly where the other ends does not overlap", () => {
    expect(overlaps([monday], rule(1, 720, 840))).toBe(false);
  });
  test("the same hours on a different weekday do not overlap", () => {
    expect(overlaps([monday], rule(2, 540, 600))).toBe(false);
  });
});

describe("groupRules", () => {
  const nineToFive = (weekday: number) => rule(weekday, 540, 1020);

  test("rows sharing the same hours become one group", () => {
    const groups = groupRules([nineToFive(1), nineToFive(3), nineToFive(5)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.weekdays).toEqual([1, 3, 5]);
  });

  test("rows with different hours stay apart", () => {
    const groups = groupRules([nineToFive(1), rule(1, 1080, 1200)]);
    expect(groups).toHaveLength(2);
  });

  test("a group's days come out Monday first, with Sunday last", () => {
    const groups = groupRules([nineToFive(0), nineToFive(6), nineToFive(1)]);
    expect(groups[0]?.weekdays).toEqual([1, 6, 0]);
  });

  test("groups come out in clock order, earliest start first", () => {
    const evening = rule(1, 1080, 1200);
    const morning = rule(2, 480, 600);
    expect(groupRules([evening, morning]).map((g) => g.startMinute)).toEqual([480, 1080]);
  });

  test("two groups that start together are ordered by their end", () => {
    const short = rule(1, 540, 600);
    const long = rule(2, 540, 1020);
    expect(groupRules([long, short]).map((g) => g.endMinute)).toEqual([600, 1020]);
  });

  test("a group expands back into one rule per day", () => {
    const [group] = groupRules([nineToFive(1), nineToFive(0)]);
    expect(group?.rules).toEqual([nineToFive(1), nineToFive(0)]);
  });

  test("distinct hours get distinct ids, so a card list can key on them", () => {
    const ids = groupRules([nineToFive(1), rule(1, 540, 600)]).map((g) => g.id);
    expect(new Set(ids).size).toBe(2);
  });

  // The grouping decision this task added: hours alone are not a group's
  // identity, its shape is part of it too. Without this, a Wednesday capped
  // at one booking and every other day left at the default would have
  // collapsed into a single card — and saving that card would have
  // overwritten Wednesday's real capacity with whatever the drawer showed
  // for the group as a whole, which is exactly the silent-data-loss bug this
  // task exists to close.
  test("rows sharing hours but not shape stay apart, so neither's capacity can be silently overwritten", () => {
    const capped = rule(1, 540, 1020, { capacity: 1 });
    const uncapped = rule(3, 540, 1020);
    const groups = groupRules([capped, uncapped]);
    expect(groups).toHaveLength(2);
    // Insertion order survives: `sort`'s comparator ties on identical hours,
    // and `Array.prototype.sort` is stable, so `capped`'s group (seen first)
    // stays first.
    expect(groups.map((g) => g.capacity)).toEqual([1, null]);
  });

  test("a group carries its own shape onto every rule it expands back into", () => {
    const [group] = groupRules([rule(1, 540, 1020, { bufferMinutes: 15, capacity: 3 })]);
    expect(group?.bufferMinutes).toBe(15);
    expect(group?.capacity).toBe(3);
    expect(group?.rules).toEqual([rule(1, 540, 1020, { bufferMinutes: 15, capacity: 3 })]);
  });
});

describe("formatHours", () => {
  test("names a whole number of hours in the reader's language", () => {
    expect(formatHours(480, "en-US")).toBe("8 hours");
    expect(formatHours(480, "pt-PT")).toBe("8 horas");
  });
  test("a half hour is a half hour, not thirty of something", () => {
    expect(formatHours(510, "en-US")).toBe("8.5 hours");
  });
  test("one hour is singular where the language has a singular", () => {
    expect(formatHours(60, "en-US")).toBe("1 hour");
  });
});

describe("formatDayList", () => {
  test("joins the days with the language's own conjunction", () => {
    expect(formatDayList("en-US", [1, 3])).toBe(`${weekdayShortLabel("en-US", 1)} and ${weekdayShortLabel("en-US", 3)}`);
  });
  test("keeps the order it is given rather than re-sorting", () => {
    expect(formatDayList("en-US", [1, 0])).toMatch(/^Mon\b/);
  });
});
