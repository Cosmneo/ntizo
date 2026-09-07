import { describe, expect, it } from "bun:test";
import { STATS_WINDOW_DAYS } from "@ntizo/shared/read-models";
import { GetAdminStatsProjection } from "../app/use-cases/get-admin-stats.projection";
import type { AdminStats, BookingReadRepositoryPort } from "../app/ports/outbound/booking-read.repository.port";

function repoAnswering(stats: AdminStats): BookingReadRepositoryPort {
  return { statsForAdmin: async () => stats } as unknown as BookingReadRepositoryPort;
}

const totals = {
  disputed: 1, confirmedLast30: 12, completedLast30: 9,
  grossLast30Minor: 1_240_000, commissionLast30Minor: 124_000, newProvidersLast30: 3,
  currency: "MZN", today: "2026-09-07",
};

describe("GetAdminStatsProjection", () => {
  it("passes the totals through and fills the thirty days, oldest first", async () => {
    const out = await new GetAdminStatsProjection(
      repoAnswering({ totals, perDay: [{ date: "2026-09-07", requests: 4, confirmed: 2 }] }),
    ).execute({ now: new Date("2026-09-07T10:00:00.000Z") });

    expect(out).toMatchObject({ disputed: 1, confirmedLast30: 12, completedLast30: 9, grossLast30Minor: 1_240_000, commissionLast30Minor: 124_000, newProvidersLast30: 3, currency: "MZN" });
    expect(out.perDay).toHaveLength(STATS_WINDOW_DAYS);
    expect(out.perDay[0]).toEqual({ date: "2026-08-09", requests: 0, confirmed: 0 });
    expect(out.perDay[STATS_WINDOW_DAYS - 1]).toEqual({ date: "2026-09-07", requests: 4, confirmed: 2 });
  });

  it("prices an empty platform in MZN", async () => {
    const out = await new GetAdminStatsProjection(
      repoAnswering({ totals: { ...totals, currency: null }, perDay: [] }),
    ).execute({ now: new Date("2026-09-07T10:00:00.000Z") });
    expect(out.currency).toBe("MZN");
  });
});
