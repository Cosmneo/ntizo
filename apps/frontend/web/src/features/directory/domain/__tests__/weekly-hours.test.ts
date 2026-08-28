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
    // A range uses the short form for its two endpoints (see the
    // pt-PT test below for why); a single day keeps the long one.
    const rows = groupWeekdays(TYPICAL, "en-US");
    expect(rows[0]?.label).toBe("Mon to Fri");
    expect(rows[1]?.label).toBe("Saturday");
    expect(rows[2]?.label).toBe("Sunday");
  });

  it("names a run with the short weekday form in Portuguese, not the long one", () => {
    // The launch market's own language. `weekdayLabel`'s long form is
    // "segunda-feira a sexta-feira", which overruns the 352px rail this
    // renders in — a range must use the short form instead.
    //
    // The string below is what `Intl.DateTimeFormat("pt-PT", { weekday:
    // "short" })` actually returns on the Node build this suite runs on
    // (v20.19.0, ICU 76.1, CLDR 46): "segunda", not the abbreviated "seg."
    // CLDR ships for bare "pt" and for "pt-BR" — confirmed by comparing
    // `pt-PT`/`pt-MZ` against `pt`/`pt-BR` directly under this Node build.
    // Bun's own ICU (74.2) gives "seg." for every pt variant, including
    // pt-PT, so this is specifically a Node/ICU76 CLDR46 regression on the
    // pt-PT and pt-MZ region tags — not a bug in this module, which asks
    // `Intl` correctly and takes back whatever it hands over. Still shorter
    // than the long form's "segunda-feira", so the fix is not wasted here,
    // but whether a real reader sees "seg." or "segunda" depends on the
    // ICU build wherever this renders — worth checking against the
    // deployed SSR runtime before calling the visual bug fully closed.
    const rows = groupWeekdays(TYPICAL, "pt-PT");
    expect(rows[0]?.label).toBe("segunda a sexta");
  });

  it("names a single day with the long form in Portuguese", () => {
    // A single day has no range to compress, so it stays the full word —
    // exactly what the approved design shows. Unaffected by the short-form
    // ICU quirk above: `weekdayLabel`'s long form agrees across pt-PT,
    // pt-MZ, pt-BR and bare pt.
    const rows = groupWeekdays(TYPICAL, "pt-PT");
    expect(rows[1]?.label).toBe("sábado");
    expect(rows[2]?.label).toBe("domingo");
  });

  it("starts the week on Monday, not on Sunday", () => {
    // The DTO is indexed 0 = Sunday; the card is not read that way anywhere
    // this product ships.
    const rows = groupWeekdays(TYPICAL, "en-US");
    expect(rows[0]?.label.startsWith("Mon")).toBe(true);
  });

  it("collapses all seven when every day is the same", () => {
    const every = [0, 1, 2, 3, 4, 5, 6].map((d) => open(d, 480, 1080));
    const rows = groupWeekdays(every, "en-US");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("Mon to Sun");
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
