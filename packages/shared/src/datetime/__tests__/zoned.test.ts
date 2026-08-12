import { describe, expect, test } from "vitest";
import {
  addDays,
  daysBetween,
  isValidTimeZone,
  localDateAt,
  localDateTimeToInstant,
  offsetMinutesAt,
  weekdayOf,
} from "../zoned";

describe("offsetMinutesAt", () => {
  test("Maputo is +02:00 all year", () => {
    expect(offsetMinutesAt("Africa/Maputo", Date.UTC(2026, 0, 15))).toBe(120);
    expect(offsetMinutesAt("Africa/Maputo", Date.UTC(2026, 6, 15))).toBe(120);
  });

  test("UTC reports zero", () => {
    expect(offsetMinutesAt("UTC", Date.UTC(2026, 0, 15))).toBe(0);
  });

  test("Lisbon is +00:00 in winter and +01:00 in summer", () => {
    expect(offsetMinutesAt("Europe/Lisbon", Date.UTC(2026, 0, 15))).toBe(0);
    expect(offsetMinutesAt("Europe/Lisbon", Date.UTC(2026, 6, 15))).toBe(60);
  });

  test("a half-hour zone is reported in minutes", () => {
    expect(offsetMinutesAt("Asia/Kolkata", Date.UTC(2026, 0, 15))).toBe(330);
  });

  test("a negative offset keeps its sign", () => {
    expect(offsetMinutesAt("America/Sao_Paulo", Date.UTC(2026, 0, 15))).toBe(-180);
  });
});

describe("localDateTimeToInstant", () => {
  test("Maputo 09:00 is 07:00 UTC", () => {
    expect(localDateTimeToInstant("Africa/Maputo", "2026-08-12", 540).toISOString())
      .toBe("2026-08-12T07:00:00.000Z");
  });

  test("minute 1440 is midnight at the end of the day", () => {
    expect(localDateTimeToInstant("Africa/Maputo", "2026-08-12", 1440).toISOString())
      .toBe("2026-08-12T22:00:00.000Z");
  });

  // Lisbon springs forward at 01:00 UTC on 2026-03-29: 01:00 local becomes
  // 02:00 local. Mozambique has no daylight saving, so this bug would only
  // ever appear in a market we have not opened — the worst place to find it.
  test("the hour after a spring-forward is correct", () => {
    expect(localDateTimeToInstant("Europe/Lisbon", "2026-03-29", 180).toISOString())
      .toBe("2026-03-29T02:00:00.000Z"); // 03:00 local, offset +01:00
  });

  test("a local time the spring-forward skipped resolves forward", () => {
    // 01:30 does not exist that day. Resolving forward gives 02:30 local,
    // which is 01:30 UTC.
    expect(localDateTimeToInstant("Europe/Lisbon", "2026-03-29", 90).toISOString())
      .toBe("2026-03-29T01:30:00.000Z");
  });

  test("a local time that happens twice resolves to the first", () => {
    // Lisbon falls back at 01:00 UTC on 2026-10-25. 01:30 local happens at
    // 00:30 UTC (+01:00) and again at 01:30 UTC (+00:00). The first wins.
    expect(localDateTimeToInstant("Europe/Lisbon", "2026-10-25", 90).toISOString())
      .toBe("2026-10-25T00:30:00.000Z");
  });

  test("an ordinary day away from any transition is unaffected", () => {
    expect(localDateTimeToInstant("Europe/Lisbon", "2026-07-15", 540).toISOString())
      .toBe("2026-07-15T08:00:00.000Z");
  });
});

describe("civil date helpers", () => {
  test("localDateAt reads the date in the zone, not in UTC", () => {
    // 23:30 UTC is already the next day in Maputo.
    expect(localDateAt("Africa/Maputo", new Date("2026-08-12T23:30:00.000Z"))).toBe("2026-08-13");
  });

  test("addDays crosses a month boundary", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
  });

  test("addDays crosses a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  test("weekdayOf returns 0 for Sunday", () => {
    expect(weekdayOf("2026-08-16")).toBe(0);
    expect(weekdayOf("2026-08-12")).toBe(3); // a Wednesday
  });

  test("daysBetween counts both ends", () => {
    expect(daysBetween("2026-08-12", "2026-08-12")).toBe(1);
    expect(daysBetween("2026-08-12", "2026-08-14")).toBe(3);
  });

  test("isValidTimeZone rejects what Intl does not know", () => {
    expect(isValidTimeZone("Africa/Maputo")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});
