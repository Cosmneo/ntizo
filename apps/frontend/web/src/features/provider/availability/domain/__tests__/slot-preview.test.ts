import { describe, expect, test } from "vitest";
import { offerFromOption, previewSlots } from "../slot-preview";
import type { ServiceOption } from "@/features/provider/services/domain/types";

/**
 * The numbers below are derived from the real engine, not from the plan's own
 * narrative. The plan's Step 1 described five back-to-back slots
 * (09:00–10:30, 10:45–12:15, …), which was true of the *old* screen, where a
 * rule's grid was implicitly its own duration-plus-buffer. Under this plan's
 * model the grid is independent of the offer and defaults to 30 — exactly the
 * point of a per-rule grid — so a 90-minute, 15-minute-buffer offer left on
 * the default grid actually produces a pick every 30 minutes wherever the
 * 105-minute span still fits, not one slot per appointment. Trusting the
 * plan's narrative here would have shipped a test that could not pass against
 * the code it was meant to protect; the values below were confirmed against
 * `startsForDay` directly before being written down.
 */

const rule = (weekday: number, over = {}) => ({
  weekday,
  startMinute: 540,
  endMinute: 1080,
  bufferMinutes: null,
  slotIntervalMinutes: null,
  capacity: null,
  ...over,
});

describe("previewSlots", () => {
  test("counts the slots a week produces", () => {
    // 09:00–18:00, 90-minute offer, 15-minute buffer, default 30-minute grid:
    // every 30-minute mark where the 105-minute occupied span still fits
    // before 18:00, i.e. up to and including 16:00 (960 + 105 = 1065 <= 1080).
    const preview = previewSlots({
      dates: ["2026-08-10"],
      rules: [rule(1, { bufferMinutes: 15 })],
      exceptions: [],
      closures: [],
      offer: { kind: "fixed", durationMinutes: 90 },
    });
    expect(preview.byDate["2026-08-10"]).toEqual([
      540, 570, 600, 630, 660, 690, 720, 750, 780, 810, 840, 870, 900, 930, 960,
    ]);
    expect(preview.totalSlots).toBe(15);
  });

  test("counts seats, not only slots", () => {
    const preview = previewSlots({
      dates: ["2026-08-10"],
      rules: [rule(1, { bufferMinutes: 15, capacity: 390 })],
      exceptions: [],
      closures: [],
      offer: { kind: "fixed", durationMinutes: 90 },
    });
    // 15 slots (see above) at 390 seats each.
    expect(preview.totalSeats).toBe(15 * 390);
  });

  test("a rule with no grid produces no slots but is not an error", () => {
    const preview = previewSlots({
      dates: ["2026-08-10"],
      rules: [rule(1, { slotIntervalMinutes: 0 })],
      exceptions: [],
      closures: [],
      offer: { kind: "fixed", durationMinutes: 90 },
    });
    expect(preview.totalSlots).toBe(0);
    expect(preview.byDate["2026-08-10"]).toEqual([]);
  });

  test("a closed day contributes nothing", () => {
    const preview = previewSlots({
      dates: ["2026-08-10"],
      rules: [rule(1)],
      exceptions: [],
      closures: [{ fromDate: "2026-08-10", toDate: "2026-08-10" }],
      offer: { kind: "fixed", durationMinutes: 30 },
    });
    expect(preview.totalSlots).toBe(0);
  });

  test("an hourly offer previews every start on the grid, not one length", () => {
    // Same window, no shape overrides (buffer 0, grid 30, capacity 1). A
    // 60-minute minimum leaves room for a start every 30 minutes up to 17:00
    // (1020 + 60 = 1080), seventeen of them — confirmed against
    // `startsForDay` directly, the same discipline as the fixed case above.
    const preview = previewSlots({
      dates: ["2026-08-10"],
      rules: [rule(1)],
      exceptions: [],
      closures: [],
      offer: { kind: "hourly", minMinutes: 60, stepMinutes: 30 },
    });
    expect(preview.totalSlots).toBe(17);
    expect(preview.byDate["2026-08-10"]?.[0]).toBe(540);
    expect(preview.byDate["2026-08-10"]?.at(-1)).toBe(1020);
    expect(preview.totalSeats).toBe(17);
  });

  test("a date with two weekdays' worth of rules only counts its own weekday", () => {
    // Monday rule and Sunday rule both configured; 2026-08-10 is a Monday, so
    // only the Monday rule contributes.
    const preview = previewSlots({
      dates: ["2026-08-10"],
      rules: [rule(1, { slotIntervalMinutes: 60 }), rule(0, { startMinute: 0, endMinute: 60 })],
      exceptions: [],
      closures: [],
      offer: { kind: "fixed", durationMinutes: 30 },
    });
    // grid 60, span 30, window 540–1080: marks at 540, 600, …, 1020 → 9.
    expect(preview.totalSlots).toBe(9);
  });
});

describe("offerFromOption", () => {
  const base: ServiceOption = {
    id: "o1",
    pricingMode: "fixed",
    amountMinor: 10000,
    currency: "MZN",
    durationMinutes: 60,
    minMinutes: null,
    stepMinutes: null,
    isDefault: true,
    isActive: true,
    sortOrder: 0,
    translations: [],
  };

  test("a fixed option becomes a fixed offer with its own duration", () => {
    expect(offerFromOption(base)).toEqual({ kind: "fixed", durationMinutes: 60 });
  });

  test("an hourly option becomes an hourly offer, not its minimum read as a fixed length", () => {
    const hourly: ServiceOption = {
      ...base,
      pricingMode: "hourly",
      durationMinutes: null,
      minMinutes: 60,
      stepMinutes: 30,
    };
    expect(offerFromOption(hourly)).toEqual({ kind: "hourly", minMinutes: 60, stepMinutes: 30 });
  });

  test("a fixed option missing its duration resolves to no offer, not a guess", () => {
    expect(offerFromOption({ ...base, durationMinutes: null })).toBeNull();
  });
});
