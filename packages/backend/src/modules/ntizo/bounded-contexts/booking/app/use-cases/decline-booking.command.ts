import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { BookingDeclined } from "../../domain/events";
import { BookingNotFoundError, NotProviderMemberError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { ProviderMemberReaderPort } from "../ports/outbound/provider-member-reader.port";
import type { SlotHoldPort } from "../ports/outbound/slot-hold.port";

export interface DeclineBookingInput {
  bookingId: string;
  /** From `requireUser` at the GraphQL layer, never from the client. */
  requesterUserId: string;
  reason?: string;
}

/**
 * A machine token, not a sentence. `booking_change.reason` is a contract
 * with whatever eventually renders this history — the same argument that
 * made `BookingCancelledReason` a closed union rather than free text (see
 * that type's own doc comment) — so what goes in the column when the
 * provider gives no reason has to read as a value a renderer can switch on
 * and translate, not as English prose a renderer would have to display
 * verbatim to every locale. This branch already shipped raw English into a
 * column meant for eight locales once; this is the same mistake avoided a
 * second time.
 */
const DECLINED_WITHOUT_REASON = "declined_without_reason";

/**
 * The provider says no: `AWAITING_PROVIDER` becomes `DECLINED`, and the slot
 * this booking was holding releases.
 *
 * **Authorisation is the point of this command.** Only a member of the
 * booking's own provider may decline it — `ProviderMemberReaderPort.isMember`
 * is checked immediately after the booking is read, before anything else
 * runs, and before anything is written. A caller who is not a member is
 * refused with `NotProviderMemberError` and this command writes nothing:
 * no `save`, no `appendChange`, no slot release, no publish. Everything
 * past that check is mechanical.
 *
 * **`reason` is never stored on `booking`.** There is no `declineReason`
 * column, and there should not be one — see `Booking.decline`'s own doc
 * comment. `booking_change` already has a `reason` column built for exactly
 * this: one row per hop, append-only, never overwritten by whatever the
 * booking does next. This command is that column's first caller.
 * `changedByUserId` is the provider member who declined, not the customer —
 * the same party `ProviderMemberReaderPort` just authorised. When the
 * provider gives no reason, this command still writes the hop — the row's
 * value is not only the reason, it is the record of who declined and when,
 * which nothing else on `booking` carries — with `DECLINED_WITHOUT_REASON`
 * (see that constant's own doc comment for why it is a token, not a
 * sentence) rather than leaving `reason` blank, since the column is
 * `NOT NULL` and a blank string is the same bug `Booking`'s own
 * `requireNonBlank` guards against everywhere else in this codebase.
 *
 * **This command uses the compare-and-swap.** `save(booking, expectedStatus)`
 * only writes if the row is still at the status this command's own read
 * saw — see `BookingRepositoryPort.save`'s own comment for the mechanism.
 * `false` back means somebody else moved the booking first — the provider
 * accepted it a moment before this member's decline reached the row, say —
 * and this command returns without publishing, without releasing the slot,
 * and without appending a change: `moved` describes a world that no longer
 * exists, and none of those three actions would be true of the row anymore.
 *
 * **Order inside the transaction: save, then append the change, then
 * release the slot, then publish** — matching `SweepBookingCommand`'s own
 * ordering discipline. The save is what makes the release correct:
 * releasing the hold while the row still said `AWAITING_PROVIDER` would
 * leave a window where the slot reads as free while the booking still
 * claimed it.
 */
export class DeclineBookingCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly providerMemberReader: ProviderMemberReaderPort,
    private readonly slotHold: SlotHoldPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(input: DeclineBookingInput): Promise<void> {
    // Computed once, before the transition — the instant this command ran.
    const at = new Date();

    await this.unitOfWork.atomicExecute(async () => {
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

      const moved = booking.decline(at, input.reason);

      const applied = await this.repo.save(moved, booking.status);
      if (!applied) {
        // The row no longer holds the status this read saw. `moved`
        // describes a world that no longer exists; saving it, appending a
        // change against it, or releasing its slot would all be acting on
        // a fact that stopped being true.
        return;
      }

      // Never null here: `moved` was loaded through `findById`, which only
      // ever returns a booking the database already assigned an id to.
      const bookingId = moved.id as string;

      await this.repo.appendChange({
        bookingId,
        changedByUserId: input.requesterUserId,
        reason: input.reason ?? DECLINED_WITHOUT_REASON,
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      });

      await this.slotHold.release(bookingId);

      await this.outboxPort.publish(
        [
          new BookingDeclined({
            bookingId,
            customerId: moved.customerId,
            providerMemberId: moved.providerMemberId,
            startsAt: moved.startsAt,
            reason: input.reason ?? null,
          }),
        ],
        "booking",
      );
    });
  }
}
