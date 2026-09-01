import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { BookingSubmitted } from "../../domain/events";
import { BookingNotFoundError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { PlatformSettingsReaderPort } from "../ports/outbound/platform-settings.reader.port";

export interface SubmitBookingInput {
  bookingId: string;
}

/**
 * The customer finishes the checkout form: `DRAFT` becomes `AWAITING_PROVIDER`,
 * and the provider's response window starts.
 *
 * No authorisation check here — unlike `AcceptBookingCommand` and
 * `DeclineBookingCommand`, this is the customer's own action on their own
 * booking, not a provider acting on somebody else's. `CreateBookingCommand`
 * already establishes `customerId` at the moment the row is created; nothing
 * about *submitting* a booking that already exists needs to re-ask who owns
 * it.
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
 * won it, and this command returns without publishing and without
 * throwing — the same outcome the aggregate's own no-op path produces in
 * `MarkBookingPaidCommand` and `ExpireBookingCommand`, reached here by the
 * repository's guard instead.
 */
export class SubmitBookingCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly platformSettingsReader: PlatformSettingsReaderPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(input: SubmitBookingInput): Promise<void> {
    // Computed once, before the transition — the instant this command ran,
    // not some later instant a retry or a delayed write might see.
    const at = new Date();

    await this.unitOfWork.atomicExecute(async () => {
      const booking = await this.repo.findById(input.bookingId);
      if (!booking) {
        throw new BookingNotFoundError(input.bookingId);
      }

      // LIVE: read fresh on every call, per this class's own doc comment.
      const providerResponseMinutes = await this.platformSettingsReader.findProviderResponseMinutes();
      const respondBy = new Date(at.getTime() + providerResponseMinutes * 60_000);

      const moved = booking.submit(at, respondBy);

      const applied = await this.repo.save(moved, booking.status);
      if (!applied) {
        // The row no longer holds the status this read saw. `moved`
        // describes a world that no longer exists; saving it would
        // silently overwrite whatever the concurrent writer just committed.
        return;
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
            startsAt: moved.startsAt,
            endsAt: moved.endsAt,
            respondBy,
          }),
        ],
        "booking",
      );
    });
  }
}
