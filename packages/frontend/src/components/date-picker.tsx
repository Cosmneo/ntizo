import * as React from "react";
import { cn } from "../lib/utils";
import { Select } from "./select";

export interface DatePickerProps {
  /** `YYYY-MM-DD`, or `""` for unset. The form's format, not the display one. */
  value: string;
  onChange: (value: string) => void;
  /** BCP-47 tag. Decides the month names, the weekday order and the display format. */
  locale?: string;
  /** Earliest and latest selectable date, `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  placeholder?: string;
  clearLabel?: string;
  todayLabel?: string;
  monthLabel?: string;
  yearLabel?: string;
  yearSearchPlaceholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

const DAYS_IN_WEEK = 7;
/** Six rows always. A grid that changes height between months makes the popover jump. */
const WEEKS_SHOWN = 6;

/**
 * Splits `YYYY-MM-DD` without going through `Date`.
 *
 * Exported for its own test. The bug it prevents only reproduces west of
 * Greenwich, so a rendering test on a machine in Lisbon proves nothing about
 * a user in Brazil — the guarantee has to be asserted on the function itself.
 *
 * `new Date("1999-02-06")` parses as midnight UTC, so west of Greenwich it
 * formats as the 5th. A date of birth has no timezone — it is three numbers —
 * and treating it as an instant is how a birthday moves by a day.
 */
export function parseISO(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function toISO(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 = Sunday. UTC throughout, so the local timezone cannot shift the grid. */
function firstWeekdayOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

/**
 * Which weekday the locale starts its week on: 1 for Monday, 0 for Sunday.
 *
 * `Intl.Locale.getWeekInfo` knows, but it is not everywhere yet, so a Monday
 * default covers the app's eight languages — all of which start on Monday —
 * and the API is used where it exists.
 */
function weekStartFor(locale: string): number {
  try {
    const info = (
      new Intl.Locale(locale) as Intl.Locale & {
        getWeekInfo?: () => { firstDay: number };
        weekInfo?: { firstDay: number };
      }
    );
    const firstDay = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay;
    // The API numbers Monday as 1 and Sunday as 7; the grid uses 0 for Sunday.
    return firstDay === 7 ? 0 : (firstDay ?? 1);
  } catch {
    return 1;
  }
}

/**
 * A date field with a real calendar.
 *
 * Replaces `<input type="date">`, which renders as a different control on
 * every platform — a spinner on one, a full-screen sheet on another, three
 * separate boxes on a third — and cannot be styled to match anything around
 * it. The value it exchanges is unchanged, so nothing downstream notices.
 *
 * The header carries month and year as dropdowns rather than only arrows. For
 * a date of birth that is not a refinement: reaching 1974 from today is three
 * hundred clicks on an arrow, and a control that cannot reach its own values
 * is not a control.
 */
export function DatePicker({
  value,
  onChange,
  locale = "en-US",
  min,
  max,
  placeholder,
  clearLabel,
  todayLabel,
  monthLabel,
  yearLabel,
  yearSearchPlaceholder,
  id,
  disabled,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const selected = React.useMemo(() => parseISO(value), [value]);
  const today = React.useMemo(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  }, []);

  // Which month the grid is showing. Opens on the chosen date, or on today
  // when there is none — never on a month the user has to navigate away from.
  const [view, setView] = React.useState(() => ({
    year: selected?.year ?? today.year,
    month: selected?.month ?? today.month,
  }));

  React.useEffect(() => {
    if (open && selected) setView({ year: selected.year, month: selected.month });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const monthNames = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(Date.UTC(2000, i, 1))));
  }, [locale]);

  const weekStart = React.useMemo(() => weekStartFor(locale), [locale]);

  /**
   * The column headings, narrow with the full name behind them.
   *
   * `weekday: "short"` is not short in Portuguese — CLDR's abbreviated form is
   * the whole word, so the launch language rendered "domingo segunda terça" on
   * top of each other in seven columns. `narrow` gives the single letters every
   * printed Portuguese calendar uses (D S T Q Q S S), and English and German
   * get their own conventional S M T W T F S.
   *
   * Those letters repeat — two S and two Q in Portuguese — so each is an
   * `<abbr>` carrying the full name for anyone reading with a screen reader or
   * hovering.
   */
  const weekdayNames = React.useMemo(() => {
    const narrow = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
    const long = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
    // 2000-01-02 was a Sunday, so adding the index walks the week from Sunday.
    return Array.from({ length: DAYS_IN_WEEK }, (_, i) => {
      const day = new Date(Date.UTC(2000, 0, 2 + ((weekStart + i) % DAYS_IN_WEEK)));
      return { narrow: narrow.format(day), long: long.format(day) };
    });
  }, [locale, weekStart]);

  const displayValue = React.useMemo(() => {
    if (!selected) return "";
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(selected.year, selected.month - 1, selected.day)));
  }, [locale, selected]);

  /**
   * The years the dropdown offers.
   *
   * Derived from `min`/`max` when given. Without them it spans a lifetime back
   * and a decade forward, because this control serves both a date of birth and
   * a booking date and neither should be unreachable.
   */
  const years = React.useMemo(() => {
    const lo = parseISO(min ?? "")?.year ?? today.year - 120;
    const hi = parseISO(max ?? "")?.year ?? today.year + 10;
    return Array.from({ length: hi - lo + 1 }, (_, i) => hi - i);
  }, [min, max, today.year]);

  const outOfRange = React.useCallback(
    (iso: string) => (min ? iso < min : false) || (max ? iso > max : false),
    [min, max],
  );

  const cells = React.useMemo(() => {
    const total = daysInMonth(view.year, view.month);
    const lead = (firstWeekdayOf(view.year, view.month) - weekStart + DAYS_IN_WEEK) % DAYS_IN_WEEK;
    return Array.from({ length: WEEKS_SHOWN * DAYS_IN_WEEK }, (_, i) => {
      const day = i - lead + 1;
      return day >= 1 && day <= total ? day : null;
    });
  }, [view, weekStart]);

  function shiftMonth(delta: number) {
    setView((v) => {
      const m = v.month + delta;
      if (m < 1) return { year: v.year - 1, month: 12 };
      if (m > 12) return { year: v.year + 1, month: 1 };
      return { year: v.year, month: m };
    });
  }

  function choose(day: number) {
    const iso = toISO(view.year, view.month, day);
    if (outOfRange(iso)) return;
    onChange(iso);
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Inline and borderless: this sits between two arrows in a header, where a
  // full-width bordered field would be the wrong shape entirely.
  const headerButton =
    "type-body-medium flex items-center gap-1 rounded-md px-2 py-1 font-semibold hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]";
  const arrowButton =
    "grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]";

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="type-body flex h-11 w-full items-center gap-2.5 rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 text-left transition-colors hover:border-[var(--color-muted-foreground)] focus-visible:border-[var(--color-primary)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 11h18" />
        </svg>
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            !displayValue && "text-[var(--color-muted-foreground)]",
          )}
        >
          {displayValue || placeholder || ""}
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="false"
          className="absolute z-50 mt-1.5 w-[19rem] rounded-[var(--radius-card-sm)] border border-[var(--color-border)] bg-[var(--color-background)] p-3 shadow-lg"
        >
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => shiftMonth(-1)} className={arrowButton}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            {/* Month and year are selects, not just labels between arrows.
                Reaching 1974 from today by clicking an arrow is three hundred
                clicks, which is the same as not being reachable. */}
            <div className="flex flex-1 items-center justify-center gap-1">
              <Select
                value={String(view.month)}
                onChange={(m) => setView((v) => ({ ...v, month: Number(m) }))}
                options={monthNames.map((label, i) => ({ value: String(i + 1), label }))}
                searchable={false}
                ariaLabel={monthLabel}
                triggerClassName={headerButton}
                menuClassName="w-44"
              />
              <Select
                value={String(view.year)}
                onChange={(y) => setView((v) => ({ ...v, year: Number(y) }))}
                options={years.map((y) => ({ value: String(y), label: String(y) }))}
                searchPlaceholder={yearSearchPlaceholder}
                ariaLabel={yearLabel}
                triggerClassName={cn(headerButton, "tabular-nums")}
                menuClassName="w-32"
              />
            </div>

            <button type="button" onClick={() => shiftMonth(1)} className={arrowButton}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-0.5">
            {weekdayNames.map((d) => (
              <abbr
                key={d.long}
                title={d.long}
                className="type-caption grid h-8 place-items-center font-semibold text-[var(--color-muted-foreground)] no-underline"
              >
                {d.narrow}
              </abbr>
            ))}

            {cells.map((day, i) => {
              if (day === null) return <div key={`pad-${i}`} className="h-9" />;
              const iso = toISO(view.year, view.month, day);
              const isSelected =
                selected?.year === view.year &&
                selected.month === view.month &&
                selected.day === day;
              const isToday =
                today.year === view.year && today.month === view.month && today.day === day;
              const blocked = outOfRange(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={blocked}
                  aria-pressed={isSelected}
                  onClick={() => choose(day)}
                  className={cn(
                    "type-body grid h-9 place-items-center rounded-md tabular-nums transition-colors",
                    !blocked && "hover:bg-[var(--color-muted)]",
                    blocked && "cursor-not-allowed opacity-30",
                    // Today is marked by a ring, the choice by a fill. Two
                    // different facts, so two different marks — colouring both
                    // would make today look chosen.
                    isToday && !isSelected && "ring-1 ring-inset ring-[var(--color-primary)]",
                    isSelected &&
                      "bg-[var(--color-primary)] font-semibold text-white hover:bg-[var(--color-primary)]",
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-[var(--color-border)] pt-2">
            <button
              type="button"
              onClick={() => setView({ year: today.year, month: today.month })}
              className="type-caption rounded-md px-2 py-1.5 font-semibold text-[var(--color-primary)] hover:bg-[var(--color-muted)]"
            >
              {todayLabel}
            </button>
            {value ? (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="type-caption rounded-md px-2 py-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
              >
                {clearLabel}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
