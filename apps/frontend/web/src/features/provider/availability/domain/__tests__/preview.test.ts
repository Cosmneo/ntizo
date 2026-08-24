import { describe, expect, test } from "vitest";
import { mergeWeeks, previewWeek, weekDates, type PreviewDay } from "../preview";

// 2026-08-10 is a Monday; 08-12 a Wednesday; 08-15 a Saturday; 08-16 a Sunday.
const WEEK = weekDates("2026-08-10");
const MORNING = { weekday: 3, startMinute: 480, endMinute: 720 };
const day = (days: PreviewDay[], date: string) => days.find((d) => d.date === date)!;

describe("weekDates", () => {
  test("returns seven consecutive civil dates from the one given", () => {
    expect(WEEK).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ]);
  });

  test("crosses a month boundary", () => {
    expect(weekDates("2026-08-31").at(-1)).toBe("2026-09-06");
  });
});

describe("previewWeek", () => {
  test("a weekday with a rule shows that rule's hours", () => {
    const days = previewWeek({ dates: WEEK, weekly: [MORNING], exceptions: [], closures: [] });
    expect(day(days, "2026-08-12").intervals).toEqual([{ start: 480, end: 720 }]);
  });

  test("a weekday with no rule is empty and says why", () => {
    const days = previewWeek({ dates: WEEK, weekly: [MORNING], exceptions: [], closures: [] });
    const thursday = day(days, "2026-08-13");
    expect(thursday.intervals).toEqual([]);
    expect(thursday.reason).toBe("no-rule");
  });

  test("two rules on one weekday merge into one interval", () => {
    const days = previewWeek({
      dates: WEEK,
      weekly: [MORNING, { weekday: 3, startMinute: 660, endMinute: 1080 }],
      exceptions: [],
      closures: [],
    });
    expect(day(days, "2026-08-12").intervals).toEqual([{ start: 480, end: 1080 }]);
  });

  test("a date inside a house closure is empty and blames the closure", () => {
    const days = previewWeek({
      dates: WEEK,
      weekly: [MORNING],
      exceptions: [],
      closures: [{ fromDate: "2026-08-11", toDate: "2026-08-13" }],
    });
    const wednesday = day(days, "2026-08-12");
    expect(wednesday.intervals).toEqual([]);
    expect(wednesday.reason).toBe("house-closure");
  });

  test("a closure's ends are both inclusive", () => {
    const days = previewWeek({
      dates: WEEK,
      weekly: [MORNING],
      exceptions: [],
      closures: [{ fromDate: "2026-08-12", toDate: "2026-08-12" }],
    });
    expect(day(days, "2026-08-12").intervals).toEqual([]);
  });

  test("a closed exception empties the day and blames the member's own calendar", () => {
    const days = previewWeek({
      dates: WEEK,
      weekly: [MORNING],
      exceptions: [
        { onDate: "2026-08-12", kind: "closed", startMinute: null, endMinute: null },
      ],
      closures: [],
    });
    const wednesday = day(days, "2026-08-12");
    expect(wednesday.intervals).toEqual([]);
    expect(wednesday.reason).toBe("member-closed");
  });

  test("a custom exception replaces the weekly hours rather than adding to them", () => {
    const days = previewWeek({
      dates: WEEK,
      weekly: [MORNING],
      exceptions: [
        { onDate: "2026-08-12", kind: "custom", startMinute: 900, endMinute: 1020 },
      ],
      closures: [],
    });
    expect(day(days, "2026-08-12").intervals).toEqual([{ start: 900, end: 1020 }]);
  });

  test("a house closure beats a custom exception on the same date", () => {
    const days = previewWeek({
      dates: WEEK,
      weekly: [MORNING],
      exceptions: [
        { onDate: "2026-08-12", kind: "custom", startMinute: 900, endMinute: 1020 },
      ],
      closures: [{ fromDate: "2026-08-12", toDate: "2026-08-12" }],
    });
    expect(day(days, "2026-08-12").reason).toBe("house-closure");
  });

  test("an exception on another date leaves this one alone", () => {
    const days = previewWeek({
      dates: WEEK,
      weekly: [MORNING],
      exceptions: [
        { onDate: "2026-08-19", kind: "closed", startMinute: null, endMinute: null },
      ],
      closures: [],
    });
    expect(day(days, "2026-08-12").intervals).toEqual([{ start: 480, end: 720 }]);
  });
});

describe("mergeWeeks", () => {
  const ana = previewWeek({ dates: WEEK, weekly: [MORNING], exceptions: [], closures: [] });
  const beto = previewWeek({
    dates: WEEK,
    weekly: [{ weekday: 3, startMinute: 900, endMinute: 1080 }],
    exceptions: [],
    closures: [],
  });

  test("unions two members' hours into the team view", () => {
    expect(day(mergeWeeks([ana, beto]), "2026-08-12").intervals).toEqual([
      { start: 480, end: 720 },
      { start: 900, end: 1080 },
    ]);
  });

  test("overlapping members merge into one stretch, not two", () => {
    const carla = previewWeek({
      dates: WEEK,
      weekly: [{ weekday: 3, startMinute: 660, endMinute: 960 }],
      exceptions: [],
      closures: [],
    });
    expect(day(mergeWeeks([ana, carla]), "2026-08-12").intervals).toEqual([
      { start: 480, end: 960 },
    ]);
  });

  test("a day is empty only when it is empty for everyone", () => {
    const onlyBeto = previewWeek({
      dates: WEEK,
      weekly: [{ weekday: 3, startMinute: 900, endMinute: 1080 }],
      exceptions: [
        { onDate: "2026-08-12", kind: "closed", startMinute: null, endMinute: null },
      ],
      closures: [],
    });
    // Ana still works that Wednesday, so the team view is not empty.
    expect(day(mergeWeeks([ana, onlyBeto]), "2026-08-12").intervals).toEqual([
      { start: 480, end: 720 },
    ]);
  });

  test("a reason survives only when every member agrees on it", () => {
    const bothClosed = previewWeek({
      dates: WEEK,
      weekly: [MORNING],
      exceptions: [
        { onDate: "2026-08-12", kind: "closed", startMinute: null, endMinute: null },
      ],
      closures: [],
    });
    expect(day(mergeWeeks([bothClosed, bothClosed]), "2026-08-12").reason).toBe("member-closed");
    // Ana has no rule that Thursday, Beto is closed — no single reason to give.
    const betoClosedThursday = previewWeek({
      dates: WEEK,
      weekly: [MORNING],
      exceptions: [
        { onDate: "2026-08-13", kind: "closed", startMinute: null, endMinute: null },
      ],
      closures: [],
    });
    expect(day(mergeWeeks([ana, betoClosedThursday]), "2026-08-13").reason).toBeNull();
  });

  test("an empty list of weeks gives an empty week", () => {
    expect(mergeWeeks([])).toEqual([]);
  });
});
