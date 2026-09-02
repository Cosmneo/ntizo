import { describe, expect, test } from "vitest";
import {
  dayLoad,
  endOfStart,
  fullDayStarts,
  isPast,
  memberDayFree,
  splitByHalfDay,
  startsByDate,
  weekOf,
} from "../day-strip";
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

  test("a non-Monday anchor whose backward walk crosses into the previous month", () => {
    // "2026-08-31" (the existing month-boundary test above) is itself a
    // Monday, so its own backward walk is a no-op (`daysSinceMonday === 0`)
    // and only the forward loop is exercised. "2026-09-02" is a Wednesday —
    // walking back two days crosses from September into August.
    expect(weekOf("2026-09-02")[0]).toBe("2026-08-31");
  });
});

describe("isPast", () => {
  test("yesterday is past", () => expect(isPast("2026-08-11", "2026-08-12")).toBe(true));
  test("today is not past", () => expect(isPast("2026-08-12", "2026-08-12")).toBe(false));
  test("tomorrow is not past", () => expect(isPast("2026-08-13", "2026-08-12")).toBe(false));
});

/** A minimal `Start`, with only the fields these functions actually read set meaningfully. */
function start(minuteOfDay: number): Start {
  return {
    minuteOfDay,
    startsAt: `2026-08-12T${String(minuteOfDay).padStart(4, "0")}`,
    maxMinutes: null,
    seatsLeft: 1,
    memberIds: ["m1"],
  };
}

describe("startsByDate", () => {
  test("counts each day's bookable starts", () => {
    const counts = startsByDate([
      { date: "2026-08-12", starts: [start(540), start(600)] },
      { date: "2026-08-13", starts: [] },
    ]);
    expect(counts.get("2026-08-12")).toBe(2);
    expect(counts.get("2026-08-13")).toBe(0);
  });

  test("counts starts, never seats", () => {
    // **The number on a day card is how many appointments can be asked for,
    // not how many people the provider could take.** Summing `seatsLeft`
    // would report six free times where there are two, and would republish a
    // capacity figure this screen has no business restating.
    const busy: Start = { ...start(540), seatsLeft: 5 };
    expect(startsByDate([{ date: "2026-08-12", starts: [busy, start(600)] }]).get("2026-08-12")).toBe(2);
  });

  test("a date nobody mentioned is simply absent", () => {
    expect(startsByDate([]).get("2026-08-12")).toBeUndefined();
  });
});

describe("fullDayStarts", () => {
  test("is the busiest day in the window", () => {
    expect(fullDayStarts([2, 11, 0, 7])).toBe(11);
  });

  test("is zero when the whole window is closed", () => {
    expect(fullDayStarts([0, 0])).toBe(0);
    expect(fullDayStarts([])).toBe(0);
  });
});

describe("dayLoad", () => {
  test("nothing free is closed", () => {
    expect(dayLoad(0, 12)).toBe("closed");
  });

  test("the fullest day is always comfortable", () => {
    expect(dayLoad(12, 12)).toBe("open");
  });

  test("a small provider at full strength is not nearly full", () => {
    // **The reason this is a fraction and not a threshold.** Four free times
    // is a whole day's work for a provider who publishes four, and an
    // absolute rule ("under five is nearly gone") would paint their every day
    // red.
    expect(dayLoad(4, 4)).toBe("open");
  });

  test("a large provider down to four is nearly gone", () => {
    // The same four, on a provider whose normal day is thirty. Both of these
    // pass only under a rule that reads the provider's own scale.
    expect(dayLoad(4, 30)).toBe("scarce");
  });

  test("the two thresholds sit at two thirds and one third, both strict", () => {
    expect(dayLoad(9, 12)).toBe("open");
    // Exactly two thirds is already the middle band, not the top one.
    expect(dayLoad(8, 12)).toBe("limited");
    expect(dayLoad(5, 12)).toBe("limited");
    // And exactly one third is already the bottom one.
    expect(dayLoad(4, 12)).toBe("scarce");
  });

  test("a provider offering three a day can still reach every band", () => {
    // Thirds rather than 80/20, and strict comparisons rather than inclusive
    // ones, for exactly this: on a three-start day all three bands have to be
    // reachable, or a provider like this jumps from "plenty" to "hurry" with
    // nothing in between.
    expect(dayLoad(3, 3)).toBe("open");
    expect(dayLoad(2, 3)).toBe("limited");
    expect(dayLoad(1, 3)).toBe("scarce");
  });

  test("a scale of zero is answered rather than divided by", () => {
    expect(dayLoad(1, 0)).toBe("open");
  });
});

describe("splitByHalfDay", () => {
  test("noon belongs to the afternoon", () => {
    const { morning, afternoon } = splitByHalfDay([start(719), start(720)]);
    expect(morning).toEqual([start(719)]);
    expect(afternoon).toEqual([start(720)]);
  });

  test("a provider who opens at 06:00 has a morning that starts there", () => {
    // The heading's range is read off these arrays, which is what stops it
    // claiming "08:00 às 12:00" over somebody who opens two hours earlier.
    const { morning } = splitByHalfDay([start(360), start(420)]);
    expect(morning[0]?.minuteOfDay).toBe(360);
  });

  test("an afternoon-only provider gets an empty morning rather than a missing one", () => {
    const { morning, afternoon } = splitByHalfDay([start(840)]);
    expect(morning).toEqual([]);
    expect(afternoon).toHaveLength(1);
  });

  test("no starts at all splits into two empty halves", () => {
    expect(splitByHalfDay([])).toEqual({ morning: [], afternoon: [] });
  });
});

describe("endOfStart", () => {
  test("adds the package's length to the start", () => {
    expect(endOfStart("2026-09-04T09:00:00.000Z", 90)).toBe("2026-09-04T10:30:00.000Z");
  });

  test("crosses midnight in UTC without touching the civil date maths", () => {
    expect(endOfStart("2026-09-04T23:30:00.000Z", 60)).toBe("2026-09-05T00:30:00.000Z");
  });
});

describe("memberDayFree", () => {
  /** A start at `minuteOfDay`, free for exactly the people named. */
  function shared(minuteOfDay: number, memberIds: string[]): Start {
    return { ...start(minuteOfDay), memberIds, seatsLeft: 4 };
  }

  test("counts only the starts that name the person", () => {
    const day = [shared(540, ["m1", "m2"]), shared(600, ["m2"]), shared(660, ["m1"])];
    expect(memberDayFree(day, "m1").count).toBe(2);
    expect(memberDayFree(day, "m2").count).toBe(2);
  });

  test("undefined is anyone — the whole day, not one person's share", () => {
    const day = [shared(540, ["m1"]), shared(600, ["m2"]), shared(660, ["m2"])];
    expect(memberDayFree(day, undefined).count).toBe(3);
  });

  test("counts moments, never the seats behind them", () => {
    // `seatsLeft` is 4 on every fixture here on purpose: a sum of seats would
    // answer 8 where two bookable moments is the honest answer, and it would
    // publish the provider's capacity in a place that asked "who".
    expect(memberDayFree([shared(540, ["m1"]), shared(600, ["m1"])], "m1").count).toBe(2);
  });

  test("the next one is the earliest by the clock, not the first in the array", () => {
    // The read model promises a day's set of starts; nothing in it promises an
    // order. A `starts[0]` rule reads the same as this one on any sorted
    // fixture, which is why this one is deliberately not sorted.
    const day = [shared(660, ["m1"]), shared(540, ["m1"])];
    expect(memberDayFree(day, "m1").nextStartsAt).toBe(start(540).startsAt);
  });

  test("a person free at nothing has no next one to name", () => {
    expect(memberDayFree([shared(540, ["m1"])], "m2")).toEqual({
      count: 0,
      nextStartsAt: null,
    });
  });

  test("a day with no starts at all is empty for anyone", () => {
    expect(memberDayFree([], undefined)).toEqual({ count: 0, nextStartsAt: null });
  });
});
