import type { DelayedJobsPort } from "../../app/ports/outbound/delayed-jobs.port";

/**
 * The adapter for `DelayedJobsPort` on a platform with no job queue.
 * `scheduleBookingDeadline` does nothing, and that is the point, not a gap.
 *
 * **The booking row *is* the schedule** — the same shape as
 * `BookingRowSlotHold` next door, where the booking row is the hold, and
 * named to match it. `booking.expires_at` is already on the row the command
 * just wrote, inside the same transaction. The cron sweep reads it every
 * minute — `findDueForSweep(now, limit)` on `BookingRepositoryPort` — the
 * same way the existing notification sweep reads `notify_due_at` rather than
 * depending on anything having been enqueued for it. A `WHERE expires_at <=
 * now` a sweep already runs is a job an actual queue would only duplicate:
 * there is nothing to enqueue into, and standing one up would add a
 * deployment surface (a broker, a worker, a retry policy) for something a
 * timestamp column and a cron trigger already do.
 *
 * Not `ExpiresAtDelayedJobs`, which is what this was called. The column is
 * still `expires_at`, so that name was not false so much as it named the
 * wrong thing about this class: what makes the method empty is that the *row*
 * already carries the schedule, exactly as it already carries the hold. The
 * port method renamed alongside it for a stronger reason — it was actively
 * mislabelled; see `DelayedJobsPort.scheduleBookingDeadline`.
 *
 * The port still earns its place even though this adapter is empty: it lets
 * each command say "this booking's clock runs out at this time" as an
 * explicit call, rather than that intent living only as an implicit
 * assumption about what some sweep, somewhere, will eventually do with a
 * column it never announced writing.
 *
 * **What would make this non-empty:** a later build that adds a real job
 * queue (a message broker, a dedicated scheduler) swaps in a different
 * adapter here — one that actually enqueues — and neither the port nor any
 * command changes. If the sweep is all that ever happens, this adapter stays
 * exactly as it is.
 */
export class BookingRowDelayedJobs implements DelayedJobsPort {
  async scheduleBookingDeadline(_bookingId: string, _at: Date): Promise<void> {
    // Nothing to do — see this class's doc comment.
  }
}
