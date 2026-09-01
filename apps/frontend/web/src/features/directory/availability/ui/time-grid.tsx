import { useTranslation } from "react-i18next";
import { cn } from "@ntizo/frontend-ui";
import { groupByHour } from "@/features/directory/availability/domain/day-strip";
import type { Start } from "@/features/directory/availability/domain/types";

function formatTime(startsAt: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone }).format(
    new Date(startsAt),
  );
}

/**
 * The lengths a customer could choose for one hourly start: `minMinutes`,
 * then every step up to that start's own `maxMinutes`.
 *
 * `maxMinutes` is documented on the read model as "already rounded onto the
 * step ladder" — the backend's own engine only ever emits multiples of
 * `stepMinutes` past the minimum — so a plain loop never overshoots it. Null
 * `minMinutes`/`stepMinutes` (the type's own nullability, never true for a
 * genuinely hourly option) yields no lengths rather than an infinite one.
 */
function lengthLadder(minMinutes: number | null, stepMinutes: number | null, maxMinutes: number | null): number[] {
  if (minMinutes === null || stepMinutes === null || stepMinutes <= 0 || maxMinutes === null) return [];
  const lengths: number[] = [];
  for (let m = minMinutes; m <= maxMinutes; m += stepMinutes) lengths.push(m);
  return lengths;
}

/**
 * The free times of one day, grouped under an hour heading each — and, once
 * a start on an hourly service is picked, the lengths bookable from it.
 *
 * There is still no booking control here, but the reason changed. It used to
 * be that booking did not exist; it does now, and `ChooseWhenPage` — the
 * routed page this grid moved into when `AvailabilitySheet` was deleted —
 * carries the confirm that holds the slot. This component reports which time
 * was picked and nothing else, which is what lets that page keep the choice
 * in the URL rather than in state: one component owns the decision, and it is
 * not this one.
 */
export function TimeGrid({
  starts,
  pricingMode,
  minMinutes,
  stepMinutes,
  locale,
  timezone,
  selectedStart,
  selectedLengthMinutes,
  onSelectStart,
  onSelectLength,
}: {
  starts: readonly Start[];
  pricingMode: "fixed" | "hourly" | null;
  minMinutes: number | null;
  stepMinutes: number | null;
  locale: string;
  timezone: string;
  selectedStart: Start | null;
  selectedLengthMinutes: number | null;
  onSelectStart: (start: Start) => void;
  onSelectLength: (minutes: number) => void;
}) {
  const { t } = useTranslation("directory");
  const groups = groupByHour(starts);

  if (groups.length === 0) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">{t("availabilityDayEmpty")}</p>;
  }

  const lengths =
    pricingMode === "hourly" && selectedStart
      ? lengthLadder(minMinutes, stepMinutes, selectedStart.maxMinutes)
      : [];

  return (
    <div className="grid gap-4">
      {groups.map((group) => (
        <div key={group[0]!.minuteOfDay} className="grid gap-2">
          <h4 className="text-xs font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
            {formatTime(group[0]!.startsAt, locale, timezone)}
          </h4>
          <div className="flex flex-wrap gap-2">
            {group.map((start) => {
              const selected = selectedStart?.startsAt === start.startsAt;
              return (
                <button
                  key={start.startsAt}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectStart(start)}
                  className={cn(
                    "rounded-[var(--radius-card-sm)] border px-3.5 py-2 text-sm font-semibold transition-colors",
                    selected
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]",
                  )}
                >
                  {formatTime(start.startsAt, locale, timezone)}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {lengths.length > 0 && (
        <div className="grid gap-2 border-t border-[var(--color-border)] pt-4">
          <h4 className="text-xs font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
            {t("availabilityLengthLabel")}
          </h4>
          <div className="flex flex-wrap gap-2">
            {lengths.map((minutes) => {
              const selected = selectedLengthMinutes === minutes;
              return (
                <button
                  key={minutes}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectLength(minutes)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                    selected
                      ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] font-semibold text-[var(--color-primary)]"
                      : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]",
                  )}
                >
                  {t("serviceDurationMinutes", { count: minutes })}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
