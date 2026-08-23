import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { NotificationDTO } from "@ntizo/shared/read-models";
import { groupByDay } from "@/features/notifications/domain/inbox-groups";

// Pinned explicitly rather than left to whatever the host or CI machine
// happens to default to: every case below depends on the *local* calendar
// day, and this repo's own machines are not all UTC (this one, checked while
// writing the fix, defaults to Europe/Lisbon) — a suite that relied on the
// ambient TZ would pass or fail depending on who ran it, which is exactly
// the failure mode that let the UTC bug through the first time (every
// existing instant here used to be UTC-aligned, so it passed regardless of
// which calendar `dayNumber` actually used). Maputo, UTC+2 year-round with
// no DST to complicate the arithmetic, is the market this bug was filed
// against. `vi.stubEnv` rather than writing `process.env.TZ` directly: this
// package's tsconfig carries no Node types, so `process` does not typecheck
// here, and `vi.stubEnv` is the typed, Vitest-native way to the same
// `process.env` write. Set in `beforeAll`/`afterAll` rather than at module
// scope so it cannot leak into any other file sharing this worker.
beforeAll(() => {
  vi.stubEnv("TZ", "Africa/Maputo");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

function at(iso: string): NotificationDTO {
  return { id: iso, type: "WELCOME", payload: {}, createdAt: iso, read: false };
}

const TODAY = "2026-08-23T12:00:00.000Z"; // 2026-08-23T14:00 local (UTC+2)

describe("groupByDay", () => {
  it("puts this calendar day under today", () => {
    const groups = groupByDay([at("2026-08-23T08:00:00.000Z")], TODAY);
    expect(groups.map((g) => g.key)).toEqual(["today"]);
  });

  it("puts the previous calendar day under yesterday", () => {
    // 2026-08-22T16:00Z is 18:00 local on the 22nd — safely on the previous
    // local calendar day, not just the previous UTC one.
    const groups = groupByDay([at("2026-08-22T16:00:00.000Z")], TODAY);
    expect(groups.map((g) => g.key)).toEqual(["yesterday"]);
  });

  // These two would both fail under the old `getTime() / 86_400_000` (UTC)
  // implementation — see that function's replaced docblock for the maths.
  // They are the two failure directions the finding named: something from
  // local last night reading as today, and something from local this
  // morning reading as yesterday.
  it("puts something from just before local midnight under yesterday, even though it shares a UTC calendar day with today", () => {
    // 21:50Z = 23:50 local on the 22nd. "Today" here is 22:10 local on the
    // 23rd (00:10 local, ten minutes past midnight) = 22:10Z on the 22nd —
    // the same UTC calendar day as the item, which is exactly what made the
    // old implementation call this "today".
    const groups = groupByDay([at("2026-08-22T21:50:00.000Z")], "2026-08-22T22:10:00.000Z");
    expect(groups.map((g) => g.key)).toEqual(["yesterday"]);
  });

  it("puts something from just after local midnight under today, even though its own UTC calendar day is still yesterday's", () => {
    // 22:15Z on the 22nd = 00:15 local on the 23rd — created today, just
    // after local midnight, while its UTC stamp still reads the 22nd. Viewed
    // later the same local day (09:00 local on the 23rd = 07:00Z), the old
    // implementation compared UTC day 22 against UTC day 23 and called a
    // same-day item "yesterday" for the rest of the day.
    const groups = groupByDay([at("2026-08-22T22:15:00.000Z")], "2026-08-23T07:00:00.000Z");
    expect(groups.map((g) => g.key)).toEqual(["today"]);
  });

  it("puts anything older under earlier", () => {
    const groups = groupByDay([at("2026-08-01T10:00:00.000Z")], TODAY);
    expect(groups.map((g) => g.key)).toEqual(["earlier"]);
  });

  it("keeps the order it was given inside a group", () => {
    const groups = groupByDay([at("2026-08-23T10:00:00.000Z"), at("2026-08-23T08:00:00.000Z")], TODAY);
    expect(groups[0]!.items.map((i) => i.id)).toEqual([
      "2026-08-23T10:00:00.000Z",
      "2026-08-23T08:00:00.000Z",
    ]);
  });

  it("emits no empty groups", () => {
    // A heading with nothing under it reads as a section that failed to load.
    const groups = groupByDay([at("2026-08-01T10:00:00.000Z")], TODAY);
    expect(groups).toHaveLength(1);
  });

  it("returns nothing for an empty inbox", () => {
    expect(groupByDay([], TODAY)).toEqual([]);
  });
});
