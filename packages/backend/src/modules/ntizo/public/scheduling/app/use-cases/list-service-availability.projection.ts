import { addDays, daysBetween, localDateTimeToInstant, weekdayOf } from "@ntizo/shared/datetime";
import type { ServiceAvailabilityDTO } from "@ntizo/shared/read-models";
import { ServiceNotFoundError } from "../../../../bounded-contexts/catalog/domain/exceptions";
import type { BusyIntervalsPort } from "../../../../bounded-contexts/scheduling/app/ports/outbound/busy-intervals.port";
import type { ScheduleRepositoryPort } from "../../../../bounded-contexts/scheduling/app/ports/outbound/schedule.repository.port";
import type { DateExceptionEntry } from "../../../../bounded-contexts/scheduling/domain/aggregates/member-schedule.aggregate";
import {
  AvailabilityWindowTooWideError,
  ServiceMemberCannotPerformError,
} from "../../../../bounded-contexts/scheduling/domain/exceptions";
import {
  freeIntervals,
  type DayException,
  type Interval,
} from "../../../../bounded-contexts/scheduling/domain/intervals";
import {
  fixedStarts,
  hourlyStarts,
  type FixedShape,
  type HourlyShape,
} from "../../../../bounded-contexts/scheduling/domain/offers";

/**
 * Two months. Long enough for "when can you come next month", short enough
 * that one request never turns into an unbounded scan.
 */
export const MAX_WINDOW_DAYS = 62;

export interface ListServiceAvailabilityInput {
  serviceId: string;
  /**
   * One person's calendar, or the union across everybody who performs the
   * service when omitted.
   */
  memberId?: string | undefined;
  from: string;
  to: string;
}

type SchedulingInfo = NonNullable<
  Awaited<ReturnType<ScheduleRepositoryPort["findServiceSchedulingInfo"]>>
>;

/**
 * The engine's `DayRules.exceptions` speaks `{ kind, start, end }` because it
 * knows nothing about rows; the aggregate and the database speak
 * `{ kind, startMinute, endMinute }`. This is the only place the two names
 * meet, and it meets them once — inlining the rename at each call site is how
 * a `start`/`startMinute` mix-up survives review three times.
 */
function toDayExceptions(entries: readonly DateExceptionEntry[]): DayException[] {
  return entries.map((e) => ({ kind: e.kind, start: e.startMinute, end: e.endMinute }));
}

/** One performer's whole window, indexed so the day loop is pure lookups. */
interface MemberCalendar {
  readonly memberId: string;
  readonly weeklyByWeekday: ReadonlyMap<number, Interval[]>;
  readonly exceptionsByDate: ReadonlyMap<string, DayException[]>;
  readonly busyByDate: ReadonlyMap<string, Interval[]>;
}

/**
 * What the default option makes bookable, or null when it makes nothing.
 *
 * Null covers a quote service (no option at all) and the shapes the database's
 * own CHECK constraints already forbid — a fixed option with no duration, an
 * hourly one with no step, a non-positive grid. They are unreachable through
 * the write path, but this read is anonymous and a zero grid would spin
 * `fixedStarts` forever rather than answer wrongly. A calendar with nothing on
 * it is the honest answer to "when can this be had" for a service that cannot
 * be booked by the clock.
 */
type OfferShape =
  | { readonly kind: "fixed"; readonly shape: FixedShape }
  | { readonly kind: "hourly"; readonly shape: HourlyShape };

function resolveOfferShape(info: SchedulingInfo): OfferShape | null {
  const option = info.defaultOption;
  if (!option) return null;

  const gridMinutes = info.slotIntervalMinutes;
  const bufferMinutes = info.bufferMinutes;
  if (!Number.isInteger(gridMinutes) || gridMinutes <= 0) return null;
  if (!Number.isInteger(bufferMinutes) || bufferMinutes < 0) return null;

  if (option.pricingMode === "fixed") {
    const durationMinutes = option.durationMinutes;
    if (durationMinutes === null || durationMinutes <= 0) return null;
    return { kind: "fixed", shape: { durationMinutes, bufferMinutes, gridMinutes } };
  }

  const minMinutes = option.minMinutes;
  const stepMinutes = option.stepMinutes;
  if (minMinutes === null || minMinutes <= 0) return null;
  if (stepMinutes === null || stepMinutes <= 0) return null;
  return { kind: "hourly", shape: { minMinutes, stepMinutes, bufferMinutes, gridMinutes } };
}

/** Every offer one member has on one day, as `{ minute → longest length }`. */
function offersFor(shape: OfferShape, free: readonly Interval[]): Map<number, number | null> {
  const out = new Map<number, number | null>();
  if (shape.kind === "fixed") {
    // A fixed service has one knowable length, so there is nothing left to
    // choose and nothing to report per start.
    for (const minute of fixedStarts(free, shape.shape)) out.set(minute, null);
    return out;
  }
  for (const offer of hourlyStarts(free, shape.shape)) out.set(offer.start, offer.maxMinutes);
  return out;
}

/**
 * When a service can be had — the question a customer actually asks.
 *
 * On the **public** tier, and therefore with no requester at all: a visitor
 * comparing two barbers has no account yet, and a calendar that needs a
 * session to say "Wednesday at nine" cannot sell anything.
 *
 * Two refusals are deliberately *not* what a reader might expect:
 *
 * - An **unpublished service, or one whose provider is not trading**, answers
 *   `SERVICE_NOT_FOUND`, the same as one that does not exist. A separate "not
 *   published yet" or "provider suspended" code would confirm to an anonymous
 *   caller that the id is real, which is exactly what guessing ids is for.
 * - A **quote** service answers with an empty `days` array rather than an
 *   error. It genuinely has no calendar — its price and its length are not
 *   knowable until the provider has seen the job — and asking about it is a
 *   perfectly reasonable thing for a screen to do. `bookingMode` on the
 *   response is what lets the screen tell that apart from a priced service
 *   whose window happens to be entirely closed.
 *
 * Every date in the window comes back either way, including the shut ones: a
 * closed Sunday is something the screen has to draw, and a client left to
 * infer it from a missing key will infer it wrongly.
 *
 * **Everything is loaded before the day loop, never inside it.** The
 * schedules, the closures and the busy intervals do not change between the
 * 1st and the 62nd, so a repository call per day is 62 round trips for one
 * answer. The cost of this query is a function of how many people perform the
 * service, not of how long a window was asked for.
 */
export class ListServiceAvailability {
  constructor(
    private readonly schedules: ScheduleRepositoryPort,
    private readonly busyIntervals: BusyIntervalsPort,
  ) {}

  async execute(input: ListServiceAvailabilityInput): Promise<ServiceAvailabilityDTO> {
    const info = await this.schedules.findServiceSchedulingInfo(input.serviceId);
    if (!info) throw new ServiceNotFoundError(input.serviceId);
    // A draft is not a thing the public may ask about, and telling them apart
    // would tell an anonymous caller that the id exists.
    //
    // Neither is a service of a workspace that is not trading — pending,
    // rejected, suspended or archived. Checked here rather than trusted from
    // the repository, for the reason its sibling in `public/catalog` gives:
    // this is the rule the class exists to enforce, and a fake, a future
    // repository or a forgotten WHERE clause must not be able to leak a row
    // past it. "Not discoverable through the catalogue" is not the same as
    // "unreachable" — `provider.status` defaults to `pending`, so a workspace
    // that has never been reviewed holds live service ids it can hand out
    // directly, and a workspace suspended after trading distributed its ids
    // while it was active.
    if (info.status !== "published" || info.providerStatus !== "active") {
      throw new ServiceNotFoundError(input.serviceId);
    }

    // Null rather than a default for a quote service: it has no priced option
    // to read a mode from, and "fixed" would be a value that is not true.
    const pricingMode = info.defaultOption?.pricingMode ?? null;
    // `info.memberIds`, never filtered by `input.memberId` — the roster
    // answers "who performs this service", not "who was asked about", and a
    // caller who named one person still needs to see everyone else to offer
    // "anyone" or a different name next. See the read model's own doc
    // comment for the picker-stranding bug this field exists to prevent.
    const empty: ServiceAvailabilityDTO = {
      serviceId: info.serviceId,
      timezone: info.timezone,
      bookingMode: info.bookingMode,
      pricingMode,
      memberIds: info.memberIds,
      days: [],
    };

    if (info.bookingMode === "quote") return empty;

    const span = daysBetween(input.from, input.to);
    if (span > MAX_WINDOW_DAYS) throw new AvailabilityWindowTooWideError(span);

    if (input.memberId !== undefined && !info.memberIds.includes(input.memberId)) {
      throw new ServiceMemberCannotPerformError(input.serviceId, input.memberId);
    }
    // The members this *query* is scoped to — one, if `input.memberId` named
    // someone, else the whole roster. Deliberately not reused for the
    // response's own `memberIds` above/below, which is always the full
    // roster regardless of this filter.
    const queriedMemberIds = input.memberId !== undefined ? [input.memberId] : info.memberIds;

    const shape = resolveOfferShape(info);
    if (!shape) return empty;

    // ---- Loaded once, before the day loop. ----
    const [scheduleList, closures, busyByMember] = await Promise.all([
      Promise.all(queriedMemberIds.map((id) => this.schedules.findByMember(info.providerId, id))),
      this.schedules.listClosures(info.providerId),
      this.busyIntervals.forMembers(queriedMemberIds, input.from, input.to),
    ]);

    const calendars: MemberCalendar[] = scheduleList.map((schedule, index) => {
      const memberId = queriedMemberIds[index]!;

      const weeklyByWeekday = new Map<number, Interval[]>();
      for (const rule of schedule.weekly) {
        const day = weeklyByWeekday.get(rule.weekday) ?? [];
        day.push({ start: rule.startMinute, end: rule.endMinute });
        weeklyByWeekday.set(rule.weekday, day);
      }

      const entriesByDate = new Map<string, DateExceptionEntry[]>();
      for (const entry of schedule.exceptions) {
        const day = entriesByDate.get(entry.onDate) ?? [];
        day.push(entry);
        entriesByDate.set(entry.onDate, day);
      }
      const exceptionsByDate = new Map<string, DayException[]>();
      for (const [onDate, entries] of entriesByDate) {
        exceptionsByDate.set(onDate, toDayExceptions(entries));
      }

      const busyByDate = new Map<string, Interval[]>();
      for (const row of busyByMember.get(memberId) ?? []) {
        const day = busyByDate.get(row.date) ?? [];
        day.push({ start: row.start, end: row.end });
        busyByDate.set(row.date, day);
      }

      return { memberId, weeklyByWeekday, exceptionsByDate, busyByDate };
    });

    // A date sits inside a closure when it falls between its ends, inclusive —
    // a range test, not an equality one, or a week-long shutdown would only
    // close its first day.
    const isHouseClosed = (date: string) =>
      closures.some((c) => c.fromDate <= date && date <= c.toDate);

    const days: ServiceAvailabilityDTO["days"] = [];
    for (let date = input.from; date <= input.to; date = addDays(date, 1)) {
      const houseClosed = isHouseClosed(date);
      const weekday = weekdayOf(date);

      // minute → who is free then, and the longest length any of them can carry.
      const byMinute = new Map<number, { memberIds: string[]; maxMinutes: number | null }>();

      for (const calendar of calendars) {
        const free = freeIntervals({
          houseClosed,
          exceptions: calendar.exceptionsByDate.get(date) ?? [],
          weekly: calendar.weeklyByWeekday.get(weekday) ?? [],
          busy: calendar.busyByDate.get(date) ?? [],
        });

        for (const [minute, maxMinutes] of offersFor(shape, free)) {
          const existing = byMinute.get(minute);
          if (!existing) {
            byMinute.set(minute, { memberIds: [calendar.memberId], maxMinutes });
            continue;
          }
          existing.memberIds.push(calendar.memberId);
          // The longest, not the last: a start offering 60 minutes because the
          // person with the shortest afternoon happened to be read last would
          // hide an hour somebody else could genuinely work.
          if (maxMinutes !== null && (existing.maxMinutes === null || maxMinutes > existing.maxMinutes)) {
            existing.maxMinutes = maxMinutes;
          }
        }
      }

      // A minute nobody is free at never entered the map, so there is no
      // "drop the empty ones" pass to forget.
      const starts = [...byMinute.entries()]
        .sort(([a], [b]) => a - b)
        .map(([minuteOfDay, entry]) => ({
          minuteOfDay,
          startsAt: localDateTimeToInstant(info.timezone, date, minuteOfDay).toISOString(),
          maxMinutes: entry.maxMinutes,
          memberIds: entry.memberIds,
        }));

      days.push({ date, starts });
    }

    return {
      serviceId: info.serviceId,
      timezone: info.timezone,
      bookingMode: info.bookingMode,
      pricingMode,
      memberIds: info.memberIds,
      days,
    };
  }
}
