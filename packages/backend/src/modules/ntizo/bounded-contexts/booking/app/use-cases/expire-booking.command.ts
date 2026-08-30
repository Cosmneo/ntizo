import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { BookingExpired } from "../../domain/events";
import { BookingNotFoundError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { SlotHoldPort } from "../ports/outbound/slot-hold.port";

export interface ExpireBookingInput {
  bookingId: string;
}

/**
 * The payment window closed without a payment ever arriving.
 *
 * **This command is internal.** It is driven by Task 12's expiry sweep, which
 * fires on a timer set at booking creation with no way to know whether the
 * booking already moved on — paid, or moved on some other way — by the time
 * it does. That is an ordinary race against payment, not a fault on either
 * side, which is exactly why `Booking.expire` is a silent no-op everywhere
 * but `PENDING_PAYMENT` rather than a refusal. No authorisation check for the
 * same reason as `MarkBookingPaidCommand`: there is no requesting user here,
 * only a job that outlived (or didn't) its target's deadline.
 *
 * **Idempotency is the aggregate's decision, not this command's.**
 * `Booking.expire` returns the very same instance back from every status
 * other than `PENDING_PAYMENT` — a booking that already paid, or that an
 * earlier sweep run already expired, is left alone. That identity, read
 * below with `===`, is what decides whether anything gets saved, released,
 * or announced; a status comparison written a second time here would only be
 * a second place for that decision to drift from the aggregate's.
 *
 * **Order inside the transaction: save, then release, then publish.** The
 * save is what makes the release correct — releasing the hold while the row
 * still says `PENDING_PAYMENT` would leave a window where the slot reads as
 * free while the booking still claims it. One transaction makes that window
 * unobservable to anyone else today, but the ordering still has to read
 * right to whoever adds a second hold mechanism later.
 */
export class ExpireBookingCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly slotHold: SlotHoldPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(input: ExpireBookingInput): Promise<void> {
    // Computed once, before the transition — the instant this sweep run
    // reached this booking, not the instant its deadline actually passed.
    // Those differ by up to the sweep interval; if that difference ever
    // matters to a report, the real deadline is already on the row as
    // `expiresAt` and belongs in the event payload, not here.
    const at = new Date();

    await this.unitOfWork.atomicExecute(async () => {
      const booking = await this.repo.findById(input.bookingId);
      if (!booking) {
        // An expiry job naming a booking that does not exist means the job
        // outlived its row — not routine, and worth a fact left behind to
        // find it by.
        throw new BookingNotFoundError(input.bookingId);
      }

      const moved = booking.expire(at);
      if (moved === booking) {
        // The aggregate says nothing happened by handing back the instance
        // it was given: this booking already left `PENDING_PAYMENT` by some
        // other path. Releasing its hold here would hand away a slot a
        // customer who paid for it is still holding.
        return;
      }

      await this.repo.save(moved);

      // Never null here: `moved` was loaded through `findById`, which only
      // ever returns a booking the database already assigned an id to.
      const bookingId = moved.id as string;

      await this.slotHold.release(bookingId);

      await this.outboxPort.publish(
        [
          new BookingExpired({
            bookingId,
            providerMemberId: moved.providerMemberId,
            startsAt: moved.startsAt,
          }),
        ],
        "booking",
      );
    });
  }
}
