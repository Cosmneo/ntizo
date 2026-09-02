import { useTranslation } from "react-i18next";
import { cn } from "@ntizo/frontend-ui";
import { endOfStart, splitByHalfDay } from "@/features/directory/availability/domain/day-strip";
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
 * One section of a day — its heading, the span it actually covers, and its
 * times as cards.
 *
 * **The span is read off the starts themselves**, first to last, rather than
 * printed from a constant. "Manhã 08:00 às 12:00" over a provider who opens
 * at 06:00 is a sentence about somebody else's business, and the two hours it
 * hides are exactly the ones an early customer came looking for.
 */
function HalfDay({
  heading,
  starts,
  durationMinutes,
  locale,
  timezone,
  selectedStart,
  onSelectStart,
}: {
  heading: string;
  starts: readonly Start[];
  durationMinutes: number | null;
  locale: string;
  timezone: string;
  selectedStart: Start | null;
  onSelectStart: (start: Start) => void;
}) {
  const { t } = useTranslation("directory");
  if (starts.length === 0) return null;

  const first = starts[0]!;
  const last = starts[starts.length - 1]!;

  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-xs font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
          {heading}
        </h4>
        <span className="type-caption tabular-nums text-[var(--color-muted-foreground)]">
          {t("availabilityHalfDayRange", {
            from: formatTime(first.startsAt, locale, timezone),
            to: formatTime(last.startsAt, locale, timezone),
          })}
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
        {starts.map((start) => {
          const selected = selectedStart?.startsAt === start.startsAt;
          // The end of *this* appointment, from the package's own length — so
          // the card is an appointment rather than a number. Absent on an
          // hourly service, where the customer has not chosen a length yet and
          // there is genuinely no end to state.
          const until =
            durationMinutes === null
              ? null
              : t("availabilityUntil", {
                  time: formatTime(
                    endOfStart(start.startsAt, durationMinutes),
                    locale,
                    timezone,
                  ),
                });
          const at = formatTime(start.startsAt, locale, timezone);

          return (
            <button
              key={start.startsAt}
              type="button"
              aria-pressed={selected}
              // The two visible lines, joined: a card announced as "09:00"
              // alone tells a screen-reader user the one half of the
              // appointment they can already guess and hides the half they
              // cannot.
              aria-label={until ? `${at} ${until}` : at}
              onClick={() => onSelectStart(start)}
              className={cn(
                "grid gap-0.5 rounded-[var(--radius-card-sm)] border px-3 py-2 text-center transition-colors",
                selected
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]",
              )}
            >
              <span aria-hidden="true" className="text-sm font-semibold tabular-nums">
                {at}
              </span>
              {until && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "type-caption tabular-nums",
                    !selected && "text-[var(--color-muted-foreground)]",
                  )}
                >
                  {until}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The free times of one day, in two sections — morning and afternoon — and,
 * once a start on an hourly service is picked, the lengths bookable from it.
 *
 * **Only bookable starts are drawn, and there is no "ocupado" state.** The
 * approved mockup greys occupied times out and strikes them through; the
 * availability response has nothing to draw them from, because a minute
 * nobody is free at never entered the projection's map. Returning them so
 * this grid could grey them would mean publishing starts that cannot be
 * booked — the same trap as offering ones that have already passed, which
 * this flow has already had to fix once. The day cards carry the density
 * instead, and the legend below names the two states that really exist.
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
  durationMinutes,
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
  /** How long the chosen package runs, or null when the length is not fixed. */
  durationMinutes: number | null;
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
  const { morning, afternoon } = splitByHalfDay(starts);

  if (starts.length === 0) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">{t("availabilityDayEmpty")}</p>;
  }

  const lengths =
    pricingMode === "hourly" && selectedStart
      ? lengthLadder(minMinutes, stepMinutes, selectedStart.maxMinutes)
      : [];

  return (
    <div className="grid gap-5">
      <HalfDay
        heading={t("availabilityMorning")}
        starts={morning}
        durationMinutes={durationMinutes}
        locale={locale}
        timezone={timezone}
        selectedStart={selectedStart}
        onSelectStart={onSelectStart}
      />
      <HalfDay
        heading={t("availabilityAfternoon")}
        starts={afternoon}
        durationMinutes={durationMinutes}
        locale={locale}
        timezone={timezone}
        selectedStart={selectedStart}
        onSelectStart={onSelectStart}
      />

      {/* Two entries, not three. There is no "ocupado" swatch because there
          are no occupied cards to explain — see this component's own note. */}
      <ul className="type-caption flex flex-wrap gap-4 text-[var(--color-muted-foreground)]">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-3 w-3 rounded-full border border-[var(--color-border)]"
          />
          {t("availabilityLegendFree")}
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-3 w-3 rounded-full border border-[var(--color-primary)] bg-[var(--color-primary)]"
          />
          {t("availabilityLegendSelected")}
        </li>
      </ul>

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
