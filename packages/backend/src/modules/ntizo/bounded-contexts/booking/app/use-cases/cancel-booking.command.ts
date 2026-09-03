import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import type { Booking } from "../../domain/aggregates/booking.aggregate";
import { BookingCancelled, type BookingCancelledReason } from "../../domain/events";
import { BookingNotFoundError, NotBookingCustomerError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import {
  raiseQuietly,
  type RaiseNotificationInternalPort,
} from "../ports/outbound/raise-notification.port";
import type { SlotHoldPort } from "../ports/outbound/slot-hold.port";

export interface CancelBookingInput {
  bookingId: string;
  /** From `requireUser` at the GraphQL layer, never from the client. */
  requesterUserId: string;
}

/**
 * The one reason this command ever cancels for, named once rather than
 * repeated at the two places that need it — the `Booking.cancelByCustomer`
 * call that decides the transition is legal, and the `booking_change`/
 * `BookingCancelled` payloads that record why. The literal already lives on
 * `BookingCancelledReason` (see that type's own doc comment for the full
 * vocabulary); this constant is just this command's one binding into it.
 */
const CANCELLED_BY_CUSTOMER: BookingCancelledReason = "cancelled_by_customer";

/**
 * The customer calls it off, before any money has moved.
 *
 * **Authorisation is the point of this command.** Only the booking's own
 * customer may cancel it — `booking.customerId === input.requesterUserId` is
 * checked immediately after the booking is read, before anything else runs,
 * and before anything is written. A caller who is not that customer is
 * refused with `NotBookingCustomerError` and this command writes nothing:
 * no `save`, no `appendChange`, no slot release, no publish. Everything past
 * that check is mechanical. No `ProviderMemberReaderPort` here, unlike
 * `DeclineBookingCommand` — the fact being checked is already on the row
 * this command reads, not a membership somewhere else.
 *
 * **A paid booking never reaches here.** `Booking.cancelByCustomer` is legal
 * only from `AWAITING_PROVIDER` and `PENDING_PAYMENT` — see
 * `CANCELLABLE_FROM.cancelled_by_customer` on the aggregate — and throws
 * `BookingTransitionError` for anything past that, the same way `submit`,
 * `accept` and `decline` refuse a status they do not govern rather than
 * quietly no-opping: this is one person's single deliberate action on a
 * booking they are looking at, so a wrong status here is a bug upstream, not
 * a clock that fired late. Once money has moved there is nothing in this
 * platform that can move it back — no refund port, no disbursement — so a
 * cancellation past that point would be a promise the system cannot keep;
 * the aggregate is what makes that boundary real rather than a convention
 * this command would otherwise have to remember to enforce.
 *
 * **`reason` is never stored on `booking`.** There is no `cancelReason`
 * column, and there should not be one — see `Booking.cancel`'s own doc
 * comment, which makes the identical argument for the sweep's cancellation.
 * `booking_change` already has a `reason` column built for exactly this: one
 * row per hop, append-only, never overwritten by whatever the booking does
 * next. `changedByUserId` is the customer who cancelled — the same party
 * this command's own check just authorised.
 *
 * **This command uses the compare-and-swap.** `save(booking, expectedStatus)`
 * only writes if the row is still at the status this command's own read
 * saw — see `BookingRepositoryPort.save`'s own comment for the mechanism.
 * `false` back means somebody else moved the booking first, and this command
 * returns without publishing, without releasing the slot, and without
 * appending a change: `moved` describes a world that no longer exists, and
 * none of those three actions would be true of the row anymore.
 *
 * **Order inside the transaction: save, then append the change, then
 * release the slot, then publish** — matching `DeclineBookingCommand`'s own
 * ordering discipline. The save is what makes the release correct: releasing
 * the hold while the row still claimed the slot would leave a window where
 * the slot reads as free while the booking still held it.
 */
export class CancelBookingCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly slotHold: SlotHoldPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: CancelBookingInput): Promise<void> {
    // Computed once, before the transition — the instant this command ran.
    const at = new Date();

    // The cancelled booking, or `null` when this call cancelled nothing.
    // Carried out of the transaction rather than re-read afterwards: by
    // then the row says `CANCELLED`, and a second read could only find
    // whatever happened to it next.
    const cancelled = await this.unitOfWork.atomicExecute(async (): Promise<Booking | null> => {
      const booking = await this.repo.findById(input.bookingId);
      if (!booking) {
        throw new BookingNotFoundError(input.bookingId);
      }

      // The point of this command. Checked before anything else runs, and
      // before anything is written — see this class's own doc comment.
      if (booking.customerId !== input.requesterUserId) {
        throw new NotBookingCustomerError();
      }

      const moved = booking.cancelByCustomer(at);

      const applied = await this.repo.save(moved, booking.status);
      if (!applied) {
        // The row no longer holds the status this read saw. `moved`
        // describes a world that no longer exists; saving it, appending a
        // change against it, or releasing its slot would all be acting on
        // a fact that stopped being true.
        return null;
      }

      // Never null here: `moved` was loaded through `findById`, which only
      // ever returns a booking the database already assigned an id to.
      const bookingId = moved.id as string;

      await this.repo.appendChange({
        bookingId,
        changedByUserId: input.requesterUserId,
        reason: CANCELLED_BY_CUSTOMER,
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      });

      await this.slotHold.release(bookingId);

      await this.outboxPort.publish(
        [
          new BookingCancelled({
            bookingId,
            customerId: moved.customerId,
            providerId: moved.providerId,
            providerMemberId: moved.providerMemberId,
            startsAt: moved.startsAt,
            reason: CANCELLED_BY_CUSTOMER,
          }),
        ],
        "booking",
      );

      return moved;
    });

    // BR-P6, after the transaction and only when it applied — the same
    // discipline `DeclineBookingCommand` and `SweepBookingCommand` keep, and
    // the same `raiseQuietly` for the same reason: the cancellation is
    // already written, and a notification adapter that hiccups must not
    // report it back to the customer as a cancellation that failed.
    //
    // Addressed to the provider, not the customer — the party this command
    // authorised is the one asking for the cancellation, and the party owed
    // a word about it is the one whose calendar just emptied.
    // `NotificationType.ProviderBookingCancelledByCustomer` already existed
    // for this: `SweepBookingCommand` raises the very same type for the
    // other producer of `cancelled_by_customer`-shaped news, a payment
    // window that ran out. It has no email template yet — in-app only, a
    // known gap this command does not close.
    if (cancelled) {
      await raiseQuietly(
        this.raiseNotification,
        {
          type: NotificationType.ProviderBookingCancelledByCustomer,
          audience: "provider",
          providerId: cancelled.providerId,
          payload: {
            bookingId: input.bookingId,
            serviceName: cancelled.serviceName,
            startsAt: cancelled.startsAt.toISOString(),
            reason: CANCELLED_BY_CUSTOMER,
          },
        },
        input.bookingId,
      );
    }
  }
}
