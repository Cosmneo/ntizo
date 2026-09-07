import { describe, expect, it } from "vitest";
import { greetingKey } from "../greeting";

describe("greetingKey", () => {
  it("says morning before noon, afternoon until seven, evening after", () => {
    expect(greetingKey(new Date("2026-09-03T08:00:00"))).toBe("morning");
    expect(greetingKey(new Date("2026-09-03T13:00:00"))).toBe("afternoon");
    expect(greetingKey(new Date("2026-09-03T20:00:00"))).toBe("evening");
  });

  /**
   * The three handovers, which are the only places this can be wrong: noon
   * belongs to the afternoon, seven o'clock to the evening, and midnight
   * starts the morning again rather than continuing the night before.
   */
  it("hands over on the hour, not a minute either side of it", () => {
    expect(greetingKey(new Date("2026-09-03T11:59:00"))).toBe("morning");
    expect(greetingKey(new Date("2026-09-03T12:00:00"))).toBe("afternoon");
    expect(greetingKey(new Date("2026-09-03T18:59:00"))).toBe("afternoon");
    expect(greetingKey(new Date("2026-09-03T19:00:00"))).toBe("evening");
    expect(greetingKey(new Date("2026-09-03T00:00:00"))).toBe("morning");
  });
});
