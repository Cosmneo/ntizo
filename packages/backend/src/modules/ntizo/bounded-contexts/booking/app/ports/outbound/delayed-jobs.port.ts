/**
 * This port captures the command's intent — "this booking's clock runs out at
 * this time" — without binding it to any specific job queue implementation.
 * The adapter that ships (`BookingRowDelayedJobs`) does nothing, because the
 * booking row already carries `expires_at` and the cron sweep reads it the
 * same way the notification sweep reads `notify_due_at`.
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
   * Register when this booking's current deadline falls due.
   *
   * **Not `scheduleBookingExpiry`, which is what this was called.** All three
   * of the design's clocks come through here — `CreateBookingCommand` books
   * the checkout hold, `SubmitBookingCommand` the provider's response window,
   * `AcceptBookingCommand` the payment window — and the third of those is the
   * one clock that does *not* end in `EXPIRED`: a `PENDING_PAYMENT` booking
   * past its window is cancelled with a reason (see `SweepBookingCommand`).
   * The old name promised an ending this method has no say over, and was
   * plainly wrong at one of its three call sites.
   *
   * What it schedules is the *deadline*; what happens when the deadline
   * passes is the sweep's decision, made from the status the booking is in by
   * then — which may not be the status it was in when this was called.
   *
   * The booking row stores `expires_at` and the sweep reads it. This method
   * lets the command express what it means in the code; the adapter decides
   * how (or whether) to realize that meaning in the platform.
   *
   * @param bookingId The id of the booking whose deadline this is
   * @param at The instant the deadline falls due
   */
  scheduleBookingDeadline(bookingId: string, at: Date): Promise<void>;
}
