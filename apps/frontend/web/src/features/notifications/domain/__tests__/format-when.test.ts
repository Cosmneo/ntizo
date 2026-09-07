import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { formatWhen } from "@/features/notifications/domain/inbox-groups";

// Pinned for the same reason `inbox-groups.test.ts` pins it: the clock and
// the calendar day below are the reader's local ones.
beforeAll(() => {
  vi.stubEnv("TZ", "Africa/Maputo");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const TODAY = "2026-08-23T12:00:00.000Z"; // 2026-08-23T14:00 local (UTC+2)

describe("formatWhen", () => {
  it("shows the clock for something from today — the heading already says the day", () => {
    // 06:33Z is 08:33 in Maputo.
    expect(formatWhen("2026-08-23T06:33:00.000Z", "today", "en-GB", TODAY)).toBe("08:33");
  });

  it("shows the clock for yesterday too", () => {
    expect(formatWhen("2026-08-22T16:24:00.000Z", "yesterday", "en-GB", TODAY)).toBe("18:24");
  });

  it("shows the day for anything earlier, since that group spans weeks", () => {
    expect(formatWhen("2026-08-03T10:00:00.000Z", "earlier", "en-US", TODAY)).toBe("Aug 3");
  });

  it("adds the year only when it is not this one", () => {
    expect(formatWhen("2025-12-30T10:00:00.000Z", "earlier", "en-US", TODAY)).toBe("Dec 30, 2025");
  });
});
