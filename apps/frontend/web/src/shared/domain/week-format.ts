/**
 * Weekday and clock formatting, in the reader's own language.
 *
 * Lifted out of `features/provider/availability/domain/week.ts` when the
 * customer-facing detail pages needed the same primitives: a second copy of
 * `weekdayLabel` is a second chance to disagree with the calendar the provider
 * configures. What stayed behind is that feature's own domain — rule drafts,
 * grouping, overlap — which has nothing to say to a directory page.
 */

/**
 * The display order — Monday first — while the stored `weekday` keeps
 * `Date#getUTCDay`'s own numbering, 0 for Sunday.
 *
 * Storing what a `Date` returns and displaying what a week looks like on a
 * page are different problems: every rule this screen sends or receives
 * still carries `weekday` 0–6 in the storage numbering, this array is only
 * the order the seven days are laid out in.
 */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/**
 * Where a stored `weekday` (0–6, `Date#getUTCDay` numbering) falls in the
 * Monday-first display order — `-1` if it is not one of the seven.
 *
 * `WEEKDAY_ORDER`'s own element type is the literal union `0 | 1 | … | 6`, so
 * `WEEKDAY_ORDER.indexOf(candidate)` refuses a plain `number` at the type
 * level even though every value on this screen is already known to be in
 * range; this widens that one call rather than widening the exported
 * constant itself, which would lose the literal typing everywhere else.
 */
export function weekdayDisplayIndex(weekday: number): number {
  return (WEEKDAY_ORDER as readonly number[]).indexOf(weekday);
}

/** A UTC instant known to fall on a Sunday — 2023-01-01. Any weekday is this plus `weekday` days. */
const REFERENCE_SUNDAY_UTC_MS = Date.UTC(2023, 0, 1);
const MS_PER_DAY = 86_400_000;

/**
 * The weekday's own name, in the reader's language — "Monday", "lundi",
 * "Montag" — via `Intl.DateTimeFormat`, not a translation key.
 *
 * The platform already knows every weekday's name in every locale; storing
 * a second copy of that in eight JSON files would be the kind of duplicate
 * source of truth that drifts the moment one of the eight is edited alone.
 * `timeZone: "UTC"` pins the calculation so the caller's own timezone can
 * never shift which day of the week a given date formats as.
 */
export function weekdayLabel(locale: string, weekday: number): string {
  const date = new Date(REFERENCE_SUNDAY_UTC_MS + weekday * MS_PER_DAY);
  return new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(date);
}

const LABEL = /^([01]\d|2[0-4]):([0-5]\d)$/;

/** `540` → `"09:00"`, `1440` (midnight at the end of the day) → `"24:00"`. */
export function minutesToLabel(minute: number): string {
  const hours = Math.floor(minute / 60);
  const mins = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * The inverse of {@link minutesToLabel}, or `null` for anything that is not
 * a real `HH:MM` in `00:00`–`24:00`.
 *
 * `24:30` matches the regex's own hour/minute ranges but is not a real
 * time — the day has already ended at `24:00` — so it is refused explicitly
 * rather than silently read as 24 hours and 30 minutes into the next one.
 */
export function labelToMinutes(label: string): number | null {
  const match = LABEL.exec(label);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours === 24 && mins !== 0) return null;
  return hours * 60 + mins;
}

/**
 * The weekday's own short name — "Mon", "seg", "Mo" — from the same source as
 * {@link weekdayLabel} and for the same reason.
 */
export function weekdayShortLabel(locale: string, weekday: number): string {
  const date = new Date(REFERENCE_SUNDAY_UTC_MS + weekday * MS_PER_DAY);
  return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(date);
}

/**
 * The weekday as a single character — "M", "S", "L" — for a control with one
 * cell per day and no room for a word.
 *
 * `short` cannot do this job. It is "Mon" in `en-US` and "Mo" in `de-DE`, but
 * CLDR gives `pt-PT` and `pt-MZ` the *full* word for their abbreviated form —
 * `short` for Monday there is literally "segunda" — so a seven-cell dial in the
 * platform's own launch language truncated every cell to "segund". `narrow` is
 * one grapheme in every locale, which is the only form a fixed seven-cell strip
 * can promise to fit.
 *
 * Ambiguous by construction: `en-US` narrow is S M T W T F S, with Saturday and
 * Sunday sharing a letter. That is why every caller must also carry the full
 * name — as a `title` on the cell, and as the day list in the control's own
 * accessible name — rather than leaving the letter to speak for itself.
 */
export function weekdayNarrowLabel(locale: string, weekday: number): string {
  const date = new Date(REFERENCE_SUNDAY_UTC_MS + weekday * MS_PER_DAY);
  return new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" }).format(date);
}

/**
 * Several weekdays as one phrase — "Mon, Wed and Fri", "segunda, quarta e
 * sexta" — with the language's own conjunction and its own comma rules, from
 * `Intl.ListFormat`.
 *
 * The order given is the order printed: callers pass display order (Monday
 * first) and this does not second-guess them, because "Sunday and Monday" and
 * "Monday and Sunday" are different sentences and only the caller knows which
 * week it is describing.
 */
export function formatDayList(
  locale: string,
  weekdays: readonly number[],
  width: "short" | "long" = "short",
): string {
  const label = width === "long" ? weekdayLabel : weekdayShortLabel;
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(
    weekdays.map((w) => label(locale, w)),
  );
}

/**
 * A span of minutes as hours in the reader's language — "8 hours", "8,5
 * horas", "1 hour".
 *
 * `Intl.NumberFormat`'s `hour` unit already knows every locale's plural
 * agreement and its decimal separator, so none of that is spelled out in eight
 * JSON files where seven copies would sit unread until one of them was wrong.
 */
export function formatHours(minutes: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "hour",
    unitDisplay: "long",
    maximumFractionDigits: 2,
  }).format(minutes / 60);
}
