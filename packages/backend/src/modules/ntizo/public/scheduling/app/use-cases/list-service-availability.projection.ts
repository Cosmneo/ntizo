import { addDays, daysBetween, localDateTimeToInstant, weekdayOf } from "@ntizo/shared/datetime";
import type { ServiceAvailabilityDTO } from "@ntizo/shared/read-models";
import {
  startsForDay,
  type DayException,
  type DayRule,
  type Interval,
  type Offer,
} from "@ntizo/shared/scheduling";
import { ServiceNotFoundError } from "../../../../bounded-contexts/catalog/domain/exceptions";
import type { BusyIntervalsPort } from "../../../../bounded-contexts/scheduling/app/ports/outbound/busy-intervals.port";
import type { ScheduleRepositoryPort } from "../../../../bounded-contexts/scheduling/app/ports/outbound/schedule.repository.port";
import type { DateExceptionEntry } from "../../../../bounded-contexts/scheduling/domain/aggregates/member-schedule.aggregate";
import {
  AvailabilityWindowTooWideError,
  ServiceMemberCannotPerformError,
} from "../../../../bounded-contexts/scheduling/domain/exceptions";

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
  readonly weeklyByWeekday: ReadonlyMap<number, DayRule[]>;
  readonly exceptionsByDate: ReadonlyMap<string, DayException[]>;
  readonly busyByDate: ReadonlyMap<string, Interval[]>;
}

/**
 * What the default option makes bookable, or null when it makes nothing.
 *
 * Reduced to the one thing the *service* still says: how long it takes, or
 * how flexibly. The buffer, the grid and the capacity moved to the
 * availability rule, because a provider's day is cut up by how they work
 * rather than by which of their services is being looked at —
 * `startsForDay` reads those off each rule itself.
 *
 * Null covers a quote service (no option at all) and the shapes the
 * database's own CHECK constraints already forbid — a fixed option with no
 * duration, an hourly one with no minimum or step. They are unreachable
 * through the write path, but this read is anonymous, and a calendar with
 * nothing on it is the honest answer to "when can this be had" for a shape
 * nothing wrote.
 */
function resolveOffer(info: SchedulingInfo): Offer | null {
  const option = info.defaultOption;
  if (!option) return null;

  if (option.pricingMode === "fixed") {
    const durationMinutes = option.durationMinutes;
    if (durationMinutes === null || durationMinutes <= 0) return null;
    return { kind: "fixed", durationMinutes };
  }

  const minMinutes = option.minMinutes;
  const stepMinutes = option.stepMinutes;
  if (minMinutes === null || minMinutes <= 0) return null;
  if (stepMinutes === null || stepMinutes <= 0) return null;
  return { kind: "hourly", minMinutes, stepMinutes };
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
    // Same shape `SweepDueBookingsInternalCommand` injects its clock with: a
    // closure defaulting to the real one, so this class never reads
    // `Date.now()` inline and no fixture in its own tests has to depend on
    // which day it is when the suite runs — see follow-up #104.
    private readonly now: () => Date = () => new Date(),
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

    const offer = resolveOffer(info);
    if (!offer) return empty;

    // ---- Loaded once, before the day loop. ----
    const [scheduleList, closures, busyByMember] = await Promise.all([
      Promise.all(queriedMemberIds.map((id) => this.schedules.findByMember(info.providerId, id))),
      this.schedules.listClosures(info.providerId),
      this.busyIntervals.forMembers(queriedMemberIds, input.from, input.to),
    ]);

    const calendars: MemberCalendar[] = scheduleList.map((schedule, index) => {
      const memberId = queriedMemberIds[index]!;

      const weeklyByWeekday = new Map<number, DayRule[]>();
      for (const rule of schedule.weekly) {
        const day = weeklyByWeekday.get(rule.weekday) ?? [];
        day.push({
          startMinute: rule.startMinute,
          endMinute: rule.endMinute,
          // `?? null`, not left `undefined`: a rule set through the API and
          // one read back from the database must resolve to the same
          // default, and `resolveRuleShape` only checks for `null`.
          bufferMinutes: rule.bufferMinutes ?? null,
          slotIntervalMinutes: rule.slotIntervalMinutes ?? null,
          capacity: rule.capacity ?? null,
        });
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

    // Read once, not inside the day loop: the question for every start in
    // the window is "is it still ahead of this one moment", not "was it
    // ahead of whatever instant the clock happened to read by the time this
    // particular day's iteration ran".
    const now = this.now();

    const days: ServiceAvailabilityDTO["days"] = [];
    for (let date = input.from; date <= input.to; date = addDays(date, 1)) {
      const houseClosed = isHouseClosed(date);
      const weekday = weekdayOf(date);

      // minute → who is free then, how many seats they leave between them,
      // and the longest length any of them can carry.
      const byMinute = new Map<
        number,
        { memberIds: string[]; seatsLeft: number; maxMinutes: number | null }
      >();

      for (const calendar of calendars) {
        // Generated per rule inside `startsForDay` itself — see that
        // function's own doc comment for why a merge-then-generate shape
        // cannot honour two different grids on the same day. `busy` goes in
        // here too, uncut: it is counted against each rule's capacity rather
        // than subtracted from the window, which is what lets a start with
        // room left still be offered after its first booking.
        const starts = startsForDay({
          houseClosed,
          exceptions: calendar.exceptionsByDate.get(date) ?? [],
          rules: calendar.weeklyByWeekday.get(weekday) ?? [],
          busy: calendar.busyByDate.get(date) ?? [],
          offer,
        });

        for (const [minute, { seatsLeft, maxMinutes }] of starts) {
          const existing = byMinute.get(minute);
          if (!existing) {
            byMinute.set(minute, { memberIds: [calendar.memberId], seatsLeft, maxMinutes });
            continue;
          }
          existing.memberIds.push(calendar.memberId);
          // Seats add across members, never take the larger: two barbers
          // free at 09:00 is two haircuts, not one — each member's seats are
          // an independent opening, not a shared one.
          existing.seatsLeft += seatsLeft;
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
          instant: localDateTimeToInstant(info.timezone, date, minuteOfDay),
          maxMinutes: entry.maxMinutes,
          seatsLeft: entry.seatsLeft,
          memberIds: entry.memberIds,
        }))
        // The write's own rule (`SlotValidityReaderPort.check`, in
        // `slot-validity.reader.ts`) throws `SlotInPastError` for any
        // `startsAt <= now`. Matched exactly, not approximated, or a
        // customer is shown a time the write then refuses: `> now`, so a
        // start landing on `now` to the millisecond — already gone by the
        // write's own test — is not offered either.
        .filter((s) => s.instant.getTime() > now.getTime())
        .map((s) => ({
          minuteOfDay: s.minuteOfDay,
          startsAt: s.instant.toISOString(),
          maxMinutes: s.maxMinutes,
          seatsLeft: s.seatsLeft,
          memberIds: s.memberIds,
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
