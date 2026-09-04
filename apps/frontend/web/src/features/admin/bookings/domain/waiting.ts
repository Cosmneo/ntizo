/**
 * How long a row of the administrator's queue has been sitting there, and
 * which page of the queue is the last one that can hold anything.
 *
 * The queue's whole justification is that somebody has to look at these
 * bookings, so the one fact a row must carry beyond who and what is *how long
 * it has been waiting for that look*. Everything here is a pure function of
 * the row and an instant, so the list and its tests measure the same way.
 */

/** The half of a queue row this module reads. Named so a test can build one without the other fifteen fields. */
export interface WaitingRow {
  markedDoneAt: string | null;
  endsAt: string;
}

/**
 * The instant the row's clock starts from — whichever one its status actually
 * stands on.
 *
 * - `unclosed` is `CONFIRMED` with the appointment behind it and nothing since:
 *   `markedDoneAt` is null, so the wait runs from the end of the appointment,
 *   which is exactly the column the server sorts that tab by.
 * - `in_window` is `MARKED_DONE`: the wait runs from the moment it was marked,
 *   which moves in lockstep with the `expiresAt` the server sorts by (the
 *   window is a fixed length), so the column and the order agree.
 * - `disputed` also carries a `markedDoneAt`, because a dispute can only be
 *   opened inside that window. It is therefore the *earliest* the complaint can
 *   have existed rather than the moment it was raised — the row carries no
 *   `disputedAt` at all. Read as "this booking has been unfinished for", which
 *   is true of all three tabs, rather than as the age of the complaint.
 */
export function waitingSince(row: WaitingRow): string {
  return row.markedDoneAt ?? row.endsAt;
}

/**
 * That wait as a short string, **in the reader's own language**: "40 min",
 * "6 h", "2 dias" in `pt`; "40min", "6h", "2j" in `fr`; "40min", "6h", "2gg"
 * in `it`; "40m", "6h", "2d" in `en`.
 *
 * `Intl.NumberFormat`'s unit style rather than a hardcoded "min"/"h"/"d",
 * which is what the first revision shipped. The provider's countdown does
 * hardcode them (`timeLeftWording` writes "20 min" and "1h42") and that was
 * the precedent cited for it — but a bare `d` is not how French or Italian
 * abbreviate a day (`j` and `gg`), so on this screen the unit letter was
 * simply wrong in two of the eight locales. CLDR knows all eight; nothing
 * here has to.
 *
 * Coarsened one step from the countdown's minute precision, because a queue is
 * read in hours and days — an administrator deciding whether to close somebody
 * else's booking does not care that it has been 6h07.
 *
 * `null` when the instant has not passed yet, and when it is not an instant at
 * all: a row cannot have been waiting for a negative time, and printing
 * "NaN min" beside a workspace's name would be worse than printing nothing.
 */
export function waitedWording(sinceIso: string, now: Date, locale: string): string | null {
  const minutes = Math.floor((now.getTime() - new Date(sinceIso).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 60) return unit(minutes, "minute", locale);
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return unit(hours, "hour", locale);
  return unit(Math.floor(hours / 24), "day", locale);
}

/** One number and its unit, as the locale abbreviates it. */
function unit(value: number, name: "minute" | "hour" | "day", locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: name,
    unitDisplay: "narrow",
  }).format(value);
}

/**
 * The offset of the last page that can still hold a row, for a queue of
 * `total` rows read `pageSize` at a time.
 *
 * What it is for: an administrator working a queue *empties* it, and emptying
 * the page they are standing on is the normal way this ends. Twenty-one
 * bookings, closing the twenty-first, and the second page has nothing on it —
 * while the count above still says twenty need attention and the card below
 * says there is nothing to close. Two sentences on one screen contradicting
 * each other, and, when the pager's own visibility was tied to
 * `total > pageSize`, no way back to the twenty.
 *
 * Answering with the *last non-empty* offset rather than stepping back one
 * page is deliberate: it is one hop from any offset, including a nonsense one
 * somebody put in the address bar, so no sequence of corrections can walk
 * backwards a page at a time or loop.
 */
export function lastPageOffset(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) return 0;
  return Math.max(0, Math.floor((total - 1) / pageSize) * pageSize);
}
