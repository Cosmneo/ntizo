import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { BookingAccepted } from "../../domain/events";
import { BookingNotFoundError, NotProviderMemberError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { DelayedJobsPort } from "../ports/outbound/delayed-jobs.port";
import type { PlatformSettingsReaderPort } from "../ports/outbound/platform-settings.reader.port";
import type { ProviderMemberReaderPort } from "../ports/outbound/provider-member-reader.port";

export interface AcceptBookingInput {
  bookingId: string;
  /** From `requireUser` at the GraphQL layer, never from the client. */
  requesterUserId: string;
}

/**
 * The provider says yes: `AWAITING_PROVIDER` becomes `PENDING_PAYMENT`, and
 * the customer's payment window starts.
 *
 * **Authorisation is the point of this command.** Only a member of the
 * booking's own provider may accept it — `ProviderMemberReaderPort.isMember`
 * is checked immediately after the booking is read, before anything else
 * runs, and before anything is written. A caller who is not a member is
 * refused with `NotProviderMemberError` and this command writes nothing:
 * no `save`, no `appendChange`, no publish, no scheduled job. Everything
 * past that check is mechanical — a compare-and-swap and an event, the
 * same shape every other command in this file uses.
 *
 * **`payBy` is computed here, from `payment_window_minutes`, because
 * `Booking.accept` cannot read it.** The aggregate has no way to reach
 * `platform_settings` — see `Booking.accept`'s own doc comment — so this
 * command reads the window fresh, on every call: an administrator's change
 * reaches the very next acceptance, and a booking already accepted keeps
 * the deadline it was given regardless of what this returns afterward.
 *
 * **This command uses the compare-and-swap.** `save(booking, expectedStatus)`
 * only writes if the row is still at the status this command's own read
 * saw — see `BookingRepositoryPort.save`'s own comment for the mechanism.
 * Two members of the same provider hitting "Aceitar" at the same moment is
 * the ordinary case this exists for, not an exotic one: both reads see
 * `AWAITING_PROVIDER`, both compute a real transition — `Booking.accept`
 * has no no-op story of its own for an unexpected status (see its own doc
 * comment: it raises rather than absorbs) — so the write is where this race
 * is actually settled. `false` back means the other member won it, and this
 * command returns without publishing, without scheduling a job, and
 * without throwing, the same outcome `MarkBookingPaidCommand` and
 * `SweepBookingCommand` reach through the aggregate's own no-op path,
 * reached here through the repository's guard instead.
 *
 * **`scheduleBookingExpiry` is called after the transaction resolves, with
 * `payBy`** — mirroring `CreateBookingCommand`'s own discipline. `payBy`
 * comes back `null` from `atomicExecute` exactly when nothing happened (a
 * losing compare-and-swap), so nothing gets scheduled for a transition that
 * never landed.
 */
export class AcceptBookingCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly providerMemberReader: ProviderMemberReaderPort,
    private readonly platformSettingsReader: PlatformSettingsReaderPort,
    private readonly delayedJobs: DelayedJobsPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(input: AcceptBookingInput): Promise<void> {
    // Computed once, before the transition — the instant this command ran.
    const at = new Date();

    const payBy = await this.unitOfWork.atomicExecute(async (): Promise<Date | null> => {
      const booking = await this.repo.findById(input.bookingId);
      if (!booking) {
        throw new BookingNotFoundError(input.bookingId);
      }

      // The point of this command. Checked before anything else runs, and
      // before anything is written — see this class's own doc comment.
      const isMember = await this.providerMemberReader.isMember(
        booking.providerId,
        input.requesterUserId,
      );
      if (!isMember) {
        throw new NotProviderMemberError();
      }

      // LIVE: read fresh on every call, per this class's own doc comment.
      const paymentWindowMinutes = await this.platformSettingsReader.findPaymentWindowMinutes();
      const payByDeadline = new Date(at.getTime() + paymentWindowMinutes * 60_000);

      const moved = booking.accept(at, payByDeadline);

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
          new BookingAccepted({
            // Never null here: `moved` was loaded through `findById`, which
            // only ever returns a booking the database already assigned an
            // id to.
            bookingId: moved.id as string,
            customerId: moved.customerId,
            providerId: moved.providerId,
            priceMinor: moved.priceMinor,
            currency: moved.currency,
          }),
        ],
        "booking",
      );

      return payByDeadline;
    });

    // Scheduled after the transaction resolves, not inside it — the same
    // reason `CreateBookingCommand` schedules its own job outside its own
    // `atomicExecute`: a job queued for a write that then rolled back, or
    // that lost the compare-and-swap above, would be a job for nothing.
    if (payBy) {
      await this.delayedJobs.scheduleBookingExpiry(input.bookingId, payBy);
    }
  }
}
