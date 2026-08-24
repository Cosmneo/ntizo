import { startsForDay, type Offer } from "@ntizo/shared/scheduling";
import { weekdayOf } from "@ntizo/shared/datetime";
import type { ServiceOption } from "@/features/provider/services/domain/types";
import type { AvailabilityException, HouseClosure, WeeklyRuleDraft } from "./types";

/**
 * What the rules on screen would actually offer, computed in the browser by
 * the same function that answers a customer.
 *
 * There is no forecast here and no second implementation to drift: the
 * provider is looking at the product rather than at a forecast of it.
 * `startsForDay` is asked once per date — the same "translate and delegate"
 * role `previewWeek` already plays for the working-hours grid in this same
 * folder. The house-closure/closed/custom precedence chain and the per-rule
 * grid merge trap both live in `@ntizo/shared/scheduling` and nowhere else;
 * a line here that starts to look like `if (houseClosed) return []` already
 * exists somewhere better.
 */
export interface SlotPreview {
  readonly byDate: Readonly<Record<string, readonly number[]>>;
  readonly totalSlots: number;
  readonly totalSeats: number;
}

function coversDate(closure: Pick<HouseClosure, "fromDate" | "toDate">, date: string): boolean {
  // Civil dates as `YYYY-MM-DD` compare correctly as strings, and both ends
  // are inclusive — the same rule `previewWeek`'s own `coversDate` follows.
  return closure.fromDate <= date && date <= closure.toDate;
}

export function previewSlots(input: {
  readonly dates: readonly string[];
  readonly rules: readonly WeeklyRuleDraft[];
  readonly exceptions: readonly Pick<
    AvailabilityException,
    "onDate" | "kind" | "startMinute" | "endMinute"
  >[];
  readonly closures: readonly Pick<HouseClosure, "fromDate" | "toDate">[];
  readonly offer: Offer;
}): SlotPreview {
  const byDate: Record<string, number[]> = {};
  let totalSlots = 0;
  let totalSeats = 0;

  for (const date of input.dates) {
    const weekday = weekdayOf(date);
    const starts = startsForDay({
      houseClosed: input.closures.some((c) => coversDate(c, date)),
      exceptions: input.exceptions
        .filter((e) => e.onDate === date)
        .map((e) => ({ kind: e.kind, start: e.startMinute, end: e.endMinute })),
      // A rule with no grid (`slotIntervalMinutes: 0`) is still in `rules`
      // here — `startsForDay` itself is the one that reads `offersSlots` and
      // skips it, the same guard every other caller relies on.
      rules: input.rules.filter((r) => r.weekday === weekday),
      offer: input.offer,
      // Configured time, not free time — the same reason `previewWeek` passes
      // `busy: []`. This answers "what would this window sell", not "what is
      // already booked".
      busy: [],
    });

    const minutes = [...starts.keys()].sort((a, b) => a - b);
    byDate[date] = minutes;
    totalSlots += minutes.length;
    for (const { seatsLeft } of starts.values()) totalSeats += seatsLeft;
  }

  return { byDate, totalSlots, totalSeats };
}

/**
 * The `Offer` `previewSlots` wants, from the service option a provider
 * actually sells.
 *
 * A fixed option has one knowable length; an hourly one is a minimum plus a
 * step ladder — `startsForDay`'s own hourly variant, not a bare number, so an
 * hourly service's minimum can never be silently read as its only length.
 * `null` when the option is missing the field its own pricing mode requires:
 * the write path already refuses to publish such an option
 * (`OPTION_DURATION_REQUIRED`), so this is a type-narrowing for data the
 * client cannot fully trust, not a real branch the picker can reach.
 */
export function offerFromOption(option: ServiceOption): Offer | null {
  if (option.pricingMode === "fixed") {
    return option.durationMinutes != null
      ? { kind: "fixed", durationMinutes: option.durationMinutes }
      : null;
  }
  return option.minMinutes != null && option.stepMinutes != null
    ? { kind: "hourly", minMinutes: option.minMinutes, stepMinutes: option.stepMinutes }
    : null;
}
