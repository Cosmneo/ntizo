import { describe, expect, it } from "vitest";
import { groupWeekdays, hasAnyHours } from "../weekly-hours";
import type { WeeklyHoursDTO } from "@ntizo/shared/read-models";

const closed = (weekday: number): WeeklyHoursDTO => ({ weekday, intervals: [] });
const open = (weekday: number, startMinute: number, endMinute: number): WeeklyHoursDTO => ({
  weekday, intervals: [{ startMinute, endMinute }],
});

/** Mon-Fri 08:00-18:00, Sat 09:00-14:00, Sun closed — the mockup's provider. */
const TYPICAL: WeeklyHoursDTO[] = [
  closed(0), open(1, 480, 1080), open(2, 480, 1080), open(3, 480, 1080),
  open(4, 480, 1080), open(5, 480, 1080), open(6, 540, 840),
];

describe("groupWeekdays", () => {
  it("collapses a run of identical weekdays into one row", () => {
    const rows = groupWeekdays(TYPICAL, "pt-PT");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.intervals).toEqual([{ startMinute: 480, endMinute: 1080 }]);
    expect(rows[1]?.intervals).toEqual([{ startMinute: 540, endMinute: 840 }]);
    expect(rows[2]?.intervals).toEqual([]);
  });

  it("names a run as a range and a single day as itself", () => {
    const rows = groupWeekdays(TYPICAL, "en-US");
    expect(rows[0]?.label).toBe("Monday to Friday");
    expect(rows[1]?.label).toBe("Saturday");
    expect(rows[2]?.label).toBe("Sunday");
  });

  it("starts the week on Monday, not on Sunday", () => {
    // The DTO is indexed 0 = Sunday; the card is not read that way anywhere
    // this product ships.
    const rows = groupWeekdays(TYPICAL, "en-US");
    expect(rows[0]?.label.startsWith("Monday")).toBe(true);
  });

  it("collapses all seven when every day is the same", () => {
    const every = [0, 1, 2, 3, 4, 5, 6].map((d) => open(d, 480, 1080));
    const rows = groupWeekdays(every, "en-US");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("Monday to Sunday");
  });

  it("collapses nothing when every day differs", () => {
    const varied = [0, 1, 2, 3, 4, 5, 6].map((d) => open(d, 480 + d * 30, 1080));
    expect(groupWeekdays(varied, "en-US")).toHaveLength(7);
  });

  it("collapses all seven when every day is closed", () => {
    const rows = groupWeekdays([0, 1, 2, 3, 4, 5, 6].map(closed), "en-US");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.intervals).toEqual([]);
  });

  it("keeps a day with two intervals distinct from one with a single span", () => {
    const split: WeeklyHoursDTO[] = [
      closed(0),
      { weekday: 1, intervals: [{ startMinute: 480, endMinute: 720 }, { startMinute: 840, endMinute: 1080 }] },
      open(2, 480, 1080),
      closed(3), closed(4), closed(5), closed(6),
    ];
    const rows = groupWeekdays(split, "en-US");
    expect(rows[0]?.intervals).toHaveLength(2);
    expect(rows[1]?.intervals).toHaveLength(1);
  });

  it("gives every row a stable, unique key", () => {
    const keys = groupWeekdays(TYPICAL, "en-US").map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("hasAnyHours", () => {
  it("is false when no weekday has an interval", () => {
    expect(hasAnyHours([0, 1, 2, 3, 4, 5, 6].map(closed))).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(hasAnyHours([])).toBe(false);
  });

  it("is true as soon as one weekday opens", () => {
    expect(hasAnyHours(TYPICAL)).toBe(true);
  });
});
