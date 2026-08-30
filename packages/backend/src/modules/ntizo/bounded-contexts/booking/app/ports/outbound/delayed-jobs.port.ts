/**
 * This port captures the command's intent — "this booking should expire at this
 * time" — without binding it to any specific job queue implementation. The adapter
 * that ships (`DelayedJobsAdapter`) does nothing, because the booking row already
 * carries `expires_at` and Task 12's cron sweep reads it the same way the
 * notification sweep reads `notify_due_at`.
 *
 * The port exists so the command says what it means rather than depending on a
 * sweep it cannot see. If a later build adds a real job queue (e.g., a message
 * broker or a dedicated scheduler), the adapter swaps in and the port remains
 * the same. If the sweep is all that ever happens, the adapter stays as a no-op.
 * The important thing is that the intent is visible in the port, not hidden inside
 * a database write.
 */
export interface DelayedJobsPort {
  /**
   * Schedule a booking to expire at a given time.
   *
   * The booking row stores `expires_at` and the expiry sweep (Task 12) reads it.
   * This method lets the command express what it means in the code; the adapter
   * decides how (or whether) to realize that meaning in the platform.
   *
   * @param bookingId The id of the booking to expire
   * @param at The instant at which the booking expires
   */
  scheduleBookingExpiry(bookingId: string, at: Date): Promise<void>;
}
