import { describe, expect, test } from "vitest";
import { labelToMinutes, minutesToLabel, overlaps } from "../week";

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
});

describe("overlaps", () => {
  const monday = { weekday: 1, startMinute: 480, endMinute: 720 };
  test("a row inside another overlaps", () => {
    expect(overlaps([monday], { weekday: 1, startMinute: 540, endMinute: 600 })).toBe(true);
  });
  test("a row straddling the end overlaps", () => {
    expect(overlaps([monday], { weekday: 1, startMinute: 660, endMinute: 840 })).toBe(true);
  });
  test("a row starting exactly where the other ends does not overlap", () => {
    expect(overlaps([monday], { weekday: 1, startMinute: 720, endMinute: 840 })).toBe(false);
  });
  test("the same hours on a different weekday do not overlap", () => {
    expect(overlaps([monday], { weekday: 2, startMinute: 540, endMinute: 600 })).toBe(false);
  });
});
