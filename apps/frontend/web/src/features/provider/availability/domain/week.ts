import type { WeeklyRuleDraft } from "./types";

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
 * Whether `candidate` overlaps any existing rule on the same weekday.
 *
 * A usability guard for the form, not an invariant — the engine merges
 * overlapping rules harmlessly and the server never refuses one. Half-open
 * interval comparison: a row starting exactly where another ends does not
 * overlap it, the same way two back-to-back shifts do not.
 */
export function overlaps(rules: readonly WeeklyRuleDraft[], candidate: WeeklyRuleDraft): boolean {
  return rules.some(
    (rule) =>
      rule.weekday === candidate.weekday &&
      rule.startMinute < candidate.endMinute &&
      candidate.startMinute < rule.endMinute,
  );
}
