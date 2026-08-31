import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { addDays, localDateAt, localDateTimeToInstant } from "@ntizo/shared/datetime";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { booking } from "../../../../../shared/infrastructure/database/booking/schemas";
import { SLOT_HOLDING_STATUSES } from "../../../../../shared/infrastructure/database/booking/enums";
import { provider } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { BusyIntervalsPort } from "../../../app/ports/outbound/busy-intervals.port";

const MS_PER_DAY = 86_400_000;

type BusyInterval = { date: string; start: number; end: number };

/**
 * Real busy time, read from `booking`.
 *
 * Replaces `NoBookingsBusyAdapter` — see that class's own doc comment for why
 * it existed at all. This is the class it said would replace it.
 *
 * **The provider's timezone, read per row, not assumed.** The port hands this
 * adapter member ids and two civil dates and no timezone, so a member's rows
 * are converted using whichever provider they belong to — read off the same
 * `booking` row via `providerId` (the snapshot every booking carries, not a
 * second join through `provider_member`). Two members in the query can
 * legitimately resolve to different timezones; nothing here assumes they
 * don't.
 *
 * **The SQL `WHERE` is deliberately wider than `[fromDate, toDate]`.** Which
 * timezone turns those civil dates into an instant range is exactly the
 * question this adapter cannot answer before it has read a row — the range
 * spans however many providers `memberIds` belongs to, each on its own clock.
 * Rather than a per-timezone query, the instant bounds are padded by a day on
 * each side (comfortably past any real UTC offset, which tops out at ±14h),
 * over-fetching a few rows at the edges. Each row is then converted with its
 * own provider's timezone and only kept if the civil date it lands on is
 * still inside `[fromDate, toDate]` — see the filter in the loop below.
 */
export class DrizzleBookingBusyAdapter implements BusyIntervalsPort {
  async forMembers(
    memberIds: readonly string[],
    fromDate: string,
    toDate: string,
  ): Promise<Map<string, BusyInterval[]>> {
    const result = new Map<string, BusyInterval[]>();
    if (memberIds.length === 0) return result;

    const lowerBound = new Date(Date.parse(`${fromDate}T00:00:00.000Z`) - MS_PER_DAY);
    const upperBound = new Date(Date.parse(`${toDate}T00:00:00.000Z`) + 2 * MS_PER_DAY);

    const rows = await getDb()
      .select({
        memberId: booking.providerMemberId,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        timezone: provider.timezone,
      })
      .from(booking)
      .innerJoin(provider, eq(provider.id, booking.providerId))
      .where(
        and(
          inArray(booking.providerMemberId, [...memberIds]),
          // Not retyped: the same list the partial unique index is built
          // from, so a status this misses is a status the index also stopped
          // protecting — one bug, not two independently-drifting ones.
          inArray(booking.status, [...SLOT_HOLDING_STATUSES]),
          lt(booking.startsAt, upperBound),
          gte(booking.endsAt, lowerBound),
        ),
      );

    for (const row of rows) {
      for (const interval of splitByLocalCivilDate(row.timezone, row.startsAt, row.endsAt)) {
        // Trims the day of slack the query added on each side back down to
        // what the caller actually asked for.
        if (interval.date < fromDate || interval.date > toDate) continue;
        const existing = result.get(row.memberId);
        if (existing) existing.push(interval);
        else result.set(row.memberId, [interval]);
      }
    }

    // No entry for a member with no busy rows — `ListServiceAvailability`
    // reads `busyByMember.get(memberId) ?? []`, so an empty array here would
    // be read identically and would only be a trap for the next person who
    // "fixes" the asymmetry and wonders why nothing changed.
    return result;
  }
}

/**
 * One booking's time, expressed as one interval per civil date it touches in
 * `timezone`.
 *
 * A booking that starts before local midnight and ends after it — 22:00 to
 * 01:00, say — cannot be one interval: `{ start: 1320, end: 1500 }` is
 * nonsense against a day that ends at minute 1440, and the engine would
 * subtract the tail of it from the wrong day entirely. Nothing in this
 * codebase can produce a booking like that today (`Booking.create` takes a
 * single `durationMinutes` off a fixed-price option, and every option this
 * adapter has seen behind it is well under a day), but the cost of handling
 * it is a loop, and the cost of assuming it can't happen is a member who
 * looks free at 00:30 when they are still finishing a job that started the
 * evening before — a silent double-booking, not a loud one. So this splits
 * unconditionally rather than asserting same-day.
 */
function splitByLocalCivilDate(timezone: string, startsAt: Date, endsAt: Date): BusyInterval[] {
  const startDate = localDateAt(timezone, startsAt);
  const endDate = localDateAt(timezone, endsAt);

  if (startDate === endDate) {
    const start = minutesSinceLocalMidnight(timezone, startsAt, startDate);
    const end = minutesSinceLocalMidnight(timezone, endsAt, endDate);
    // Defensive rather than reachable: `Booking` never produces
    // `startsAt === endsAt`, but a zero-length interval would be silent noise
    // for `subtractIntervals` to chew on for no reason.
    return start < end ? [{ date: startDate, start, end }] : [];
  }

  const intervals: BusyInterval[] = [];
  let date = startDate;
  let start = minutesSinceLocalMidnight(timezone, startsAt, startDate);
  while (date < endDate) {
    intervals.push({ date, start, end: 1440 });
    date = addDays(date, 1);
    start = 0;
  }
  const end = minutesSinceLocalMidnight(timezone, endsAt, endDate);
  // Guards the case `endsAt` lands exactly on local midnight of `endDate`
  // (an interval ending at 24:00 the day before, not starting a new one at
  // 00:00) — without it, a booking ending precisely at midnight would add a
  // meaningless `{ start: 0, end: 0 }` on the day after it actually ends.
  if (start < end) intervals.push({ date: endDate, start, end });
  return intervals;
}

/**
 * Minutes between local midnight on `localDate` and `instant` — the inverse
 * of `localDateTimeToInstant`, which `ListServiceAvailability` uses for the
 * opposite conversion (minute-of-day to instant). Deriving this from the same
 * function rather than a second offset calculation is what keeps the two
 * directions from silently disagreeing on a DST boundary or a fractional
 * offset the other doesn't handle the same way.
 */
function minutesSinceLocalMidnight(timezone: string, instant: Date, localDate: string): number {
  const localMidnight = localDateTimeToInstant(timezone, localDate, 0);
  return Math.round((instant.getTime() - localMidnight.getTime()) / 60_000);
}
