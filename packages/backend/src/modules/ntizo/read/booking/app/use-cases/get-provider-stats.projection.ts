import {
  STATS_WINDOW_DAYS,
  type ProviderBookingStatsDTO,
  type ProviderBookingStatsDayDTO,
} from "@ntizo/shared/read-models";
import type {
  BookingReadRepositoryPort,
  ProviderStatsDayRow,
} from "../ports/outbound/booking-read.repository.port";

/** What a workspace that has never taken a booking is priced in. The launch market's, and the `booking` column's own default. */
const DEFAULT_CURRENCY = "MZN";

const DAY_MS = 86_400_000;

/**
 * Thirty buckets ending on the provider's today, oldest first, with the days
 * nobody booked drawn as zeros.
 *
 * The arithmetic is on bare dates anchored at midnight UTC, which is not the
 * workspace's midnight and does not need to be: these strings were already
 * bucketed by Postgres in the workspace's zone, and stepping a `YYYY-MM-DD`
 * back one calendar day is the same operation in every zone. Doing it here
 * rather than with `generate_series` keeps a thirty-row loop out of the query
 * plan and makes the gap-filling testable without a database.
 */
export function fillDays(
  today: string,
  rows: readonly ProviderStatsDayRow[],
): ProviderBookingStatsDayDTO[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const end = Date.parse(`${today}T00:00:00.000Z`);
  const days: ProviderBookingStatsDayDTO[] = [];
  for (let back = STATS_WINDOW_DAYS - 1; back >= 0; back -= 1) {
    const date = new Date(end - back * DAY_MS).toISOString().slice(0, 10);
    const hit = byDate.get(date);
    days.push({ date, requests: hit?.requests ?? 0, confirmed: hit?.confirmed ?? 0 });
  }
  return days;
}

/**
 * The dashboard's one read. Everything it returns comes from a single
 * repository call, because a dashboard that fetched its cards one at a time
 * would show a workspace mid-blink: eight numbers from eight instants.
 */
export class GetProviderStatsProjection {
  constructor(private readonly repo: BookingReadRepositoryPort) {}

  async execute(input: { providerId: string; now: Date }): Promise<ProviderBookingStatsDTO> {
    const { totals, perDay } = await this.repo.statsForProvider(input.providerId, input.now);
    return {
      awaitingResponse: totals.awaitingResponse,
      awaitingPayment: totals.awaitingPayment,
      upcomingToday: totals.upcomingToday,
      upcomingWeek: totals.upcomingWeek,
      completedLast30: totals.completedLast30,
      declinedLast30: totals.declinedLast30,
      revenueLast30Minor: totals.revenueLast30Minor,
      pipelineMinor: totals.pipelineMinor,
      currency: totals.currency ?? DEFAULT_CURRENCY,
      perDay: fillDays(totals.today, perDay),
    };
  }
}
