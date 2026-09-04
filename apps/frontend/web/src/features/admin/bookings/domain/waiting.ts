/**
 * How long a row of the administrator's queue has been sitting there.
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
 * That wait as a short string: "40 min", "6 h", "2 d".
 *
 * The same untranslated vocabulary the provider's countdown already ships
 * (`timeLeftWording` writes "20 min" and "1h42"), coarsened one step because
 * a queue is read in days and hours rather than to the minute — an
 * administrator deciding whether to close somebody's booking does not care
 * that it has been 6h07.
 *
 * `null` when the instant has not passed yet, and when it is not an instant at
 * all: a row cannot have been waiting for a negative time, and printing
 * "NaN min" beside a workspace's name would be worse than printing nothing.
 */
export function waitedWording(sinceIso: string, now: Date): string | null {
  const minutes = Math.floor((now.getTime() - new Date(sinceIso).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}
