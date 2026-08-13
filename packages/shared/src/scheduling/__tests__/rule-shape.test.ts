import { describe, expect, test } from "vitest";
import { SCHEDULING_DEFAULTS, resolveRuleShape } from "../rule-shape";

const bare = { bufferMinutes: null, slotIntervalMinutes: null, capacity: null };

describe("resolveRuleShape", () => {
  test("a rule that says nothing gets every default", () => {
    expect(resolveRuleShape(bare)).toEqual({
      bufferMinutes: 0,
      gridMinutes: 30,
      capacity: 1,
      offersSlots: true,
    });
  });

  test("capacity defaults to one, because one barber cuts one head", () => {
    expect(SCHEDULING_DEFAULTS.capacity).toBe(1);
  });

  test("each field is taken when it is set", () => {
    expect(resolveRuleShape({ bufferMinutes: 15, slotIntervalMinutes: 60, capacity: 10 })).toEqual({
      bufferMinutes: 15,
      gridMinutes: 60,
      capacity: 10,
      offersSlots: true,
    });
  });

  test("a zero buffer is a real answer, not a missing one", () => {
    // `?? ` and not `||`: 0 is falsy and would silently become the default,
    // which happens to also be 0 today and would stop being so the day the
    // default changes.
    expect(resolveRuleShape({ ...bare, bufferMinutes: 0 }).bufferMinutes).toBe(0);
  });

  test("a grid of zero means no slots, and is not the default grid", () => {
    const open = resolveRuleShape({ ...bare, slotIntervalMinutes: 0 });
    expect(open.offersSlots).toBe(false);
    expect(open.gridMinutes).toBe(0);
    // The distinction the whole feature rests on.
    expect(open).not.toEqual(resolveRuleShape(bare));
  });

  test("null grid still offers slots", () => {
    expect(resolveRuleShape(bare).offersSlots).toBe(true);
  });
});
