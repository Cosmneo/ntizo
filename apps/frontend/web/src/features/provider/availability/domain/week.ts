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

/**
 * One weekly row's place in the canonical draft order: its day in the
 * Monday-first display order, then its start.
 *
 * The draft is kept sorted rather than sorted at each read, so what a reader
 * sees, what the cards group, and what `setWeeklyPattern` sends are all one
 * sequence — a member whose Sunday row was typed first does not get a
 * different payload from one who typed it last.
 */
export function compareRules(a: WeeklyRuleDraft, b: WeeklyRuleDraft): number {
  const byDay = weekdayDisplayIndex(a.weekday) - weekdayDisplayIndex(b.weekday);
  return byDay !== 0 ? byDay : a.startMinute - b.startMinute;
}

/**
 * What the weekly pattern itself adds up to, before any date on the calendar
 * touches it.
 *
 * The number beside it — `weekTotals(previewDays).totalMinutes` — is what a
 * *particular* week produces once closures and exceptions have had their say.
 * Showing only that one leaves the provider to work out for themselves why this
 * week reads 38 hours when they set 44; the difference between the two is the
 * sentence the old screen could not say at all.
 *
 * One row per weekday means the sum is already exactly one week. It is not a
 * count of anything on a calendar, so a rule on a weekday that this particular
 * week's closure blackens still counts here — that is the point.
 */
export function patternMinutes(
  rules: readonly Pick<WeeklyRuleDraft, "startMinute" | "endMinute">[],
): number {
  return rules.reduce((sum, rule) => sum + (rule.endMinute - rule.startMinute), 0);
}

/**
 * The rows that share a pair of times *and the same shape*, as one thing a
 * provider can name.
 *
 * "Monday to Friday, 09:00 to 17:00" is one decision, and the database stores
 * it as five rows because a row is per-day. A card per row would ask somebody
 * to change their mind five times to move their morning, so the screen groups
 * them back and the drawer edits the group; `rules` is the expansion the wire
 * still wants.
 *
 * Grouping decision, spelled out because it is easy to get backwards: the
 * group's identity is the hours *and* `bufferMinutes`/`slotIntervalMinutes`/
 * `capacity` together, not the hours alone. Two rows that read the same
 * 09:00–17:00 but disagree on capacity — Wednesday capped at one booking,
 * every other day left at the default — become two separate cards rather
 * than one. Grouping by hours alone would have merged them into a single
 * card with a single drawer, and the drawer can only hand back *one* shape
 * for every day it edits — saving that card would have silently overwritten
 * Wednesday's real capacity with whatever the drawer's field said (typically
 * blank, since the drawer has no way to show "3 on one day, default on the
 * rest"). Splitting the card is the safer surprise: it costs a provider an
 * extra card to look at, where the alternative cost them data they never
 * knew was at risk.
 */
export interface WeekRuleGroup {
  /** Stable within a draft — hours and shape together are the group's identity. */
  readonly id: string;
  readonly startMinute: number;
  readonly endMinute: number;
  /** This group's own shape — shared by construction across every rule folded into it. See the grouping decision above. */
  readonly bufferMinutes: number | null;
  readonly slotIntervalMinutes: number | null;
  readonly capacity: number | null;
  /** Stored weekday numbers (0 = Sunday), in Monday-first display order. */
  readonly weekdays: readonly number[];
  /** One row per day, in the same order — what goes back over the wire. */
  readonly rules: readonly WeeklyRuleDraft[];
}

/** A row's group identity: hours and shape, both — see {@link WeekRuleGroup}'s grouping decision. */
function groupKey(rule: WeeklyRuleDraft): string {
  return `${rule.startMinute}-${rule.endMinute}-${rule.bufferMinutes}-${rule.slotIntervalMinutes}-${rule.capacity}`;
}

export function groupRules(rules: readonly WeeklyRuleDraft[]): WeekRuleGroup[] {
  const byKey = new Map<string, { shape: WeeklyRuleDraft; days: number[] }>();
  for (const rule of rules) {
    const key = groupKey(rule);
    const entry = byKey.get(key) ?? { shape: rule, days: [] };
    if (!entry.days.includes(rule.weekday)) entry.days.push(rule.weekday);
    byKey.set(key, entry);
  }

  return [...byKey.entries()]
    .map(([id, { shape, days }]) => {
      const { startMinute, endMinute, bufferMinutes, slotIntervalMinutes, capacity } = shape;
      const weekdays = [...days].sort((a, b) => weekdayDisplayIndex(a) - weekdayDisplayIndex(b));
      return {
        id,
        startMinute,
        endMinute,
        bufferMinutes,
        slotIntervalMinutes,
        capacity,
        weekdays,
        // Rebuilt rather than carried through from the input: the group is the
        // authority on its own hours and shape, so an expansion can never
        // disagree with what the card and the drawer are showing above it.
        rules: weekdays.map((weekday) => ({
          weekday,
          startMinute,
          endMinute,
          bufferMinutes,
          slotIntervalMinutes,
          capacity,
        })),
      };
    })
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
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
