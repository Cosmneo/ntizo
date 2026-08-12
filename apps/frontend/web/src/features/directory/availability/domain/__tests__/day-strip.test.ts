import { describe, expect, test } from "vitest";
import { groupByHour, isPast, weekOf } from "../day-strip";
import type { Start } from "../types";

describe("weekOf", () => {
  test("returns seven dates starting on Monday", () => {
    expect(weekOf("2026-08-12")).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ]);
  });

  test("a Sunday anchor belongs to the week that started six days earlier", () => {
    expect(weekOf("2026-08-16")[0]).toBe("2026-08-10");
  });

  test("crosses a month boundary", () => {
    expect(weekOf("2026-08-31")).toContain("2026-09-06");
  });
});

describe("isPast", () => {
  test("yesterday is past", () => expect(isPast("2026-08-11", "2026-08-12")).toBe(true));
  test("today is not past", () => expect(isPast("2026-08-12", "2026-08-12")).toBe(false));
  test("tomorrow is not past", () => expect(isPast("2026-08-13", "2026-08-12")).toBe(false));
});

/** A minimal `Start`, with only the field `groupByHour` actually reads set explicitly. */
function start(minuteOfDay: number): Start {
  return { minuteOfDay, startsAt: `2026-08-12T${String(minuteOfDay).padStart(4, "0")}`, maxMinutes: null, memberIds: ["m1"] };
}

describe("groupByHour", () => {
  test("puts every start of one hour in one group", () => {
    const starts = [start(540), start(555), start(570), start(585)]; // 09:00, 09:15, 09:30, 09:45
    expect(groupByHour(starts)).toEqual([[start(540), start(555), start(570), start(585)]]);
  });

  test("keeps groups in chronological order", () => {
    // Deliberately out of order on input — 11:00, then 09:00, then 10:00 —
    // so a function that merely preserved input order would fail this.
    const eleven = start(660);
    const nineA = start(540);
    const nineB = start(555);
    const ten = start(600);
    const starts = [eleven, nineA, ten, nineB];

    expect(groupByHour(starts)).toEqual([[nineA, nineB], [ten], [eleven]]);
  });

  test("an empty list gives no groups", () => {
    expect(groupByHour([])).toEqual([]);
  });
});
