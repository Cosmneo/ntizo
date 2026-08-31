import { and, eq, gte, inArray, lt, lte } from "drizzle-orm";
import { addDays, localDateAt, localDateTimeToInstant, weekdayOf } from "@ntizo/shared/datetime";
import {
  startsForDay,
  type DayException,
  type DayRule,
  type Interval,
  type Offer,
} from "@ntizo/shared/scheduling";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { service, serviceMember } from "../../../../../shared/infrastructure/database/catalog/schemas";
import { provider } from "../../../../../shared/infrastructure/database/provider/schemas";
import {
  dateException,
  houseClosure,
  memberAvailability,
} from "../../../../../shared/infrastructure/database/scheduling/schemas";
import { booking } from "../../../../../shared/infrastructure/database/booking/schemas";
import { SLOT_HOLDING_STATUSES } from "../../../../../shared/infrastructure/database/booking/enums";
import type {
  SlotValidityCheckInput,
  SlotValidityReaderPort,
  SlotValidityResult,
} from "../../../app/ports/outbound/slot-validity.reader.port";

const MS_PER_DAY = 86_400_000;

/**
 * Answers `SlotValidityReaderPort` by reading the same tables
 * `list-service-availability.projection.ts` reads and calling the same
 * `startsForDay` engine that projection calls — see the port's own doc
 * comment for why a second implementation of the grid would be the exact
 * defect this whole plan exists to close, one layer up.
 */
export class DrizzleSlotValidityReader implements SlotValidityReaderPort {
  async check(input: SlotValidityCheckInput): Promise<SlotValidityResult> {
    // Not a Scheduling rule — `ListServiceAvailability` has no notion of
    // "now" and answers whatever window it is asked about, past window
    // included. This is a booking-specific refusal, checked first because it
    // needs no query at all.
    if (input.startsAt.getTime() <= Date.now()) {
      return { ok: false, reason: "starts_at_in_past" };
    }

    const db = getDb();

    // One query, two predicates. The join (`service_member` matching this
    // exact service and member) and the status read (`provider.status`,
    // selected rather than filtered in `WHERE`) each answer a different
    // question below — see `ServiceMemberCannotPerformError` and
    // `ServiceNotBookableError`'s `"provider_not_active"` reason for why
    // they need to stay distinguishable rather than collapsing into one
    // "no row" outcome.
    const [membership] = await db
      .select({
        providerId: service.providerId,
        providerStatus: provider.status,
        timezone: provider.timezone,
      })
      .from(serviceMember)
      .innerJoin(service, eq(service.id, serviceMember.serviceId))
      .innerJoin(provider, eq(provider.id, service.providerId))
      .where(
        and(eq(serviceMember.serviceId, input.serviceId), eq(serviceMember.memberId, input.providerMemberId)),
      )
      .limit(1);

    // No `service_member` row for this exact (service, member) pair — either
    // this member never performs this service, or `providerMemberId` names a
    // member of an entirely different provider. `SetServiceMembersCommand`
    // never lets a `service_member` row exist for a member outside the
    // service's own provider (it checks `memberBelongsToProvider` before
    // writing one), so a cross-provider id fails this exact join too: one
    // check answers both of `ServiceMemberCannotPerformError`'s cases.
    if (!membership) {
      return { ok: false, reason: "member_cannot_perform_service" };
    }
    if (membership.providerStatus !== "active") {
      return { ok: false, reason: "provider_not_active" };
    }

    const { providerId, timezone } = membership;
    const date = localDateAt(timezone, input.startsAt);
    const weekday = weekdayOf(date);

    const [weeklyRows, exceptionRows, closureRows, busy] = await Promise.all([
      db
        .select()
        .from(memberAvailability)
        .where(
          and(
            eq(memberAvailability.providerId, providerId),
            eq(memberAvailability.memberId, input.providerMemberId),
            eq(memberAvailability.weekday, weekday),
          ),
        ),
      db
        .select()
        .from(dateException)
        .where(
          and(
            eq(dateException.providerId, providerId),
            eq(dateException.memberId, input.providerMemberId),
            eq(dateException.onDate, date),
          ),
        ),
      db
        .select({ id: houseClosure.id })
        .from(houseClosure)
        .where(
          and(eq(houseClosure.providerId, providerId), lte(houseClosure.fromDate, date), gte(houseClosure.toDate, date)),
        )
        .limit(1),
      busyOnDate(input.providerMemberId, timezone, date),
    ]);

    // Same rename `list-service-availability.projection.ts`'s own
    // `toDayExceptions` makes, for the same reason: the engine's
    // `DayRules.exceptions` speaks `{ kind, start, end }`, the row speaks
    // `{ kind, startMinute, endMinute }`, and this is the one place the two
    // meet. Not imported — that helper is private to its own file.
    const rules: DayRule[] = weeklyRows.map((r) => ({
      startMinute: r.startMinute,
      endMinute: r.endMinute,
      bufferMinutes: r.bufferMinutes ?? null,
      slotIntervalMinutes: r.slotIntervalMinutes ?? null,
      capacity: r.capacity ?? null,
    }));
    const exceptions: DayException[] = exceptionRows.map((e) => ({
      kind: e.kind as "closed" | "custom",
      start: e.startMinute,
      end: e.endMinute,
    }));

    // Always `"fixed"`: `CreateBookingCommand` already refused an hourly
    // option (`ServiceNotBookableError("hourly")`) before this port is ever
    // called, so `durationMinutes` is the real, positive length of the exact
    // option being bought — not re-derived from the service's default
    // option, which is all `ListServiceAvailability` itself has to work
    // with. See `SlotValidityReaderPort`'s own doc comment for why that is
    // the correct duration to check against, not a shortcut.
    const offer: Offer = { kind: "fixed", durationMinutes: input.durationMinutes };

    const starts = startsForDay({
      houseClosed: closureRows.length > 0,
      exceptions,
      rules,
      busy,
      offer,
    });

    const requestedMinute = minutesSinceLocalMidnight(timezone, input.startsAt, date);
    // `.get`, not `.has` then a second lookup: the value already carries
    // `capacity` off the same rule that decides whether this start exists
    // at all, so one read answers both.
    const startCapacity = starts.get(requestedMinute);
    if (!startCapacity) {
      return { ok: false, reason: "slot_not_offered" };
    }

    return { ok: true, capacity: startCapacity.capacity };
  }
}

/**
 * One member's busy time on one civil date, in minutes from local midnight —
 * the shape `startsForDay` wants.
 *
 * A reduced-scope mirror of `DrizzleBookingBusyAdapter.forMembers`
 * (Scheduling's own infrastructure): same padded-window-then-split approach,
 * same reason (a booking can cross local midnight; see that adapter's own
 * comment for why the split is unconditional rather than asserted away), but
 * for one member and one date rather than many members and a range. Not
 * imported from there — `splitByLocalCivilDate` and
 * `minutesSinceLocalMidnight` are private to that file, and this codebase's
 * own convention (see `NotProviderMemberError` in Scheduling's
 * `domain/exceptions.ts`) is to duplicate a small, self-contained piece of
 * logic across bounded contexts rather than import one context's
 * infrastructure into another's. This is data-shape and timezone-conversion
 * glue, not an availability rule — the rule itself (`startsForDay`) is still
 * called, not restated.
 */
async function busyOnDate(memberId: string, timezone: string, date: string): Promise<Interval[]> {
  const lowerBound = new Date(Date.parse(`${date}T00:00:00.000Z`) - MS_PER_DAY);
  const upperBound = new Date(Date.parse(`${date}T00:00:00.000Z`) + 2 * MS_PER_DAY);

  const rows = await getDb()
    .select({ startsAt: booking.startsAt, endsAt: booking.endsAt })
    .from(booking)
    .where(
      and(
        eq(booking.providerMemberId, memberId),
        inArray(booking.status, [...SLOT_HOLDING_STATUSES]),
        lt(booking.startsAt, upperBound),
        gte(booking.endsAt, lowerBound),
      ),
    );

  const intervals: Interval[] = [];
  for (const row of rows) {
    for (const interval of splitByLocalCivilDate(timezone, row.startsAt, row.endsAt)) {
      if (interval.date === date) intervals.push({ start: interval.start, end: interval.end });
    }
  }
  return intervals;
}

/** One booking's time, expressed as one interval per civil date it touches in `timezone`. */
function splitByLocalCivilDate(
  timezone: string,
  startsAt: Date,
  endsAt: Date,
): { date: string; start: number; end: number }[] {
  const startDate = localDateAt(timezone, startsAt);
  const endDate = localDateAt(timezone, endsAt);

  if (startDate === endDate) {
    const start = minutesSinceLocalMidnight(timezone, startsAt, startDate);
    const end = minutesSinceLocalMidnight(timezone, endsAt, endDate);
    return start < end ? [{ date: startDate, start, end }] : [];
  }

  const out: { date: string; start: number; end: number }[] = [];
  let date = startDate;
  let start = minutesSinceLocalMidnight(timezone, startsAt, startDate);
  while (date < endDate) {
    out.push({ date, start, end: 1440 });
    date = addDays(date, 1);
    start = 0;
  }
  const end = minutesSinceLocalMidnight(timezone, endsAt, endDate);
  if (start < end) out.push({ date: endDate, start, end });
  return out;
}

/** Minutes between local midnight on `localDate` and `instant` — the inverse of `localDateTimeToInstant`. */
function minutesSinceLocalMidnight(timezone: string, instant: Date, localDate: string): number {
  const localMidnight = localDateTimeToInstant(timezone, localDate, 0);
  return Math.round((instant.getTime() - localMidnight.getTime()) / 60_000);
}
