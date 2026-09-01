import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { BookingSubmitted } from "../../domain/events";
import { BookingNotFoundError, NotBookingCustomerError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { DelayedJobsPort } from "../ports/outbound/delayed-jobs.port";
import type { PlatformSettingsReaderPort } from "../ports/outbound/platform-settings.reader.port";

export interface SubmitBookingInput {
  bookingId: string;
  /** From `requireUser` at the GraphQL layer, never from the client. */
  customerId: string;
}

/**
 * The customer finishes the checkout form: `DRAFT` becomes `AWAITING_PROVIDER`,
 * and the provider's response window starts.
 *
 * **Authorisation, Ruling N.** The original brief scoped the authorisation
 * discipline to `AcceptBookingCommand` and `DeclineBookingCommand` and said
 * nothing about this command — an omission, not a decision: submitting
 * somebody else's `DRAFT` starts the provider's two-hour clock and puts a
 * request in their queue the customer never sent. Only the booking's own
 * customer may submit it, checked against `booking.customerId` — already on
 * the row this command reads, no second lookup needed — immediately after
 * `findById` and before anything is written. A caller who is not that
 * customer is refused with `NotBookingCustomerError` and this command writes
 * nothing: no `save`, no publish, no scheduled job.
 *
 * **`respondBy` is computed here, from `provider_response_minutes`, because
 * `Booking.submit` cannot read it.** The aggregate has no way to reach
 * `platform_settings` — see `Booking.submit`'s own doc comment — so this
 * command reads the window fresh, on every call, the same LIVE relationship
 * `CreateBookingCommand` already has with `checkout_hold_minutes`: a change
 * an administrator makes reaches the very next booking to submit, and a
 * booking already submitted keeps the deadline it was given regardless of
 * what this returns afterward.
 *
 * **This command uses the compare-and-swap.** `save(booking, expectedStatus)`
 * only writes if the row is still at the status this command's own read
 * saw — see `BookingRepositoryPort.save`'s own comment for the mechanism.
 * A double-tap on "Enviar Pedido", or a client retrying a request whose
 * response never arrived, sends two submissions for one booking; both reads
 * see `DRAFT` and both compute a real transition — `Booking.submit` has no
 * no-op story of its own for this (see its own doc comment: an unexpected
 * status is a bug to raise, not a race to absorb), so the write is the only
 * place this race is actually settled. `false` back means the other request
 * won it, and this command returns without publishing, without scheduling a
 * job, and without throwing — the same outcome the aggregate's own no-op
 * path produces in `MarkBookingPaidCommand` and `SweepBookingCommand`,
 * reached here by the repository's guard instead.
 *
 * **`scheduleBookingDeadline` is called after the transaction resolves, with
 * `respondBy`** — mirroring `CreateBookingCommand`'s own discipline of
 * scheduling only once its write has actually committed, against whichever
 * deadline it just stamped rather than a stale one. `respondBy` comes back
 * `null` from `atomicExecute` exactly when nothing happened (a losing
 * compare-and-swap), so nothing gets scheduled for a transition that never
 * landed.
 */
export class SubmitBookingCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly platformSettingsReader: PlatformSettingsReaderPort,
    private readonly delayedJobs: DelayedJobsPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(input: SubmitBookingInput): Promise<void> {
    // Computed once, before the transition — the instant this command ran,
    // not some later instant a retry or a delayed write might see.
    const at = new Date();

    const respondBy = await this.unitOfWork.atomicExecute(async (): Promise<Date | null> => {
      const booking = await this.repo.findById(input.bookingId);
      if (!booking) {
        throw new BookingNotFoundError(input.bookingId);
      }

      // The point of Ruling N. Checked before anything else runs, and
      // before anything is written — see this class's own doc comment.
      if (booking.customerId !== input.customerId) {
        throw new NotBookingCustomerError();
      }

      // LIVE: read fresh on every call, per this class's own doc comment.
      const providerResponseMinutes = await this.platformSettingsReader.findProviderResponseMinutes();
      const respondByDeadline = new Date(at.getTime() + providerResponseMinutes * 60_000);

      const moved = booking.submit(at, respondByDeadline);

      const applied = await this.repo.save(moved, booking.status);
      if (!applied) {
        // The row no longer holds the status this read saw. `moved`
        // describes a world that no longer exists; saving it would
        // silently overwrite whatever the concurrent writer just
        // committed, and scheduling a job against its deadline would be
        // scheduling one for a transition that never happened.
        return null;
      }

      await this.outboxPort.publish(
        [
          new BookingSubmitted({
            // Never null here: `moved` was loaded through `findById`, which
            // only ever returns a booking the database already assigned an
            // id to.
            bookingId: moved.id as string,
            customerId: moved.customerId,
            providerId: moved.providerId,
            providerMemberId: moved.providerMemberId,
            serviceId: moved.serviceId,
            startsAt: moved.startsAt,
            endsAt: moved.endsAt,
            priceMinor: moved.priceMinor,
            currency: moved.currency,
            respondBy: respondByDeadline,
          }),
        ],
        "booking",
      );

      return respondByDeadline;
    });

    // Scheduled after the transaction resolves, not inside it — the same
    // reason `CreateBookingCommand` schedules its own job outside its own
    // `atomicExecute`: a job queued for a write that then rolled back, or
    // that lost the compare-and-swap above, would be a job for nothing.
    if (respondBy) {
      await this.delayedJobs.scheduleBookingDeadline(input.bookingId, respondBy);
    }
  }
}
