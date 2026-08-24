/**
 * One thing that happened, in whichever zone is asking.
 *
 * Deliberately thin. Nothing in the backend writes activity yet — there is no
 * booking, payment or audit context — so this is the shape the three zones
 * have agreed to speak, not a mirror of a table that exists. When a real read
 * model lands it maps onto this or this changes to meet it; what must not
 * happen is three zones each inventing their own row.
 */
export interface ActivityEntry {
  id: string;
  /**
   * What happened, already translated.
   *
   * A sentence rather than a code, because the zone that fetched it knows what
   * it means and the list does not. A list that took `type: "booking.created"`
   * would need a translation table per zone, which is the zone's job.
   */
  description: string;
  /** ISO 8601. Formatted here, so the three zones cannot format it three ways. */
  occurredAt: string;
  /**
   * The right-hand column: an amount, a status, a name. Optional because not
   * every kind of event has a second fact worth a column of its own.
   */
  meta?: string | null;
}
