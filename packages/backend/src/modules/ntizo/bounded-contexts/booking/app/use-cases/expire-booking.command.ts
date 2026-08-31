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
 * **A lost update is a different problem, and the aggregate cannot see it.**
 * The identity check above only ever reasons about the value `findById`
 * returned at the top of this transaction — it has nothing to say about a
 * write that lands on the row afterward. A payment webhook can read and
 * write this exact row within moments of this sweep run claiming it:
 * M-Pesa's C2B is synchronous against the same payment window this sweep is
 * enforcing, so approvals landing near the deadline are routine, not a
 * theoretical edge case. Without a guard at the write, whichever of the two
 * writes second would silently overwrite the first's transition — the row
 * would say `EXPIRED` and the slot handed to someone else while the payment
 * actually cleared, or the row would say paid while `BookingExpired` had
 * already told Scheduling and Notification the opposite. `repo.save`'s
 * `expectedStatus` parameter guards against exactly this: it carries the
 * status this read saw, and the repository only writes if the row is still
 * at that status when the write actually runs (see
 * `BookingRepositoryPort.save`'s own comment for the mechanism). `false`
 * back means the payment won the race — handled the same way as the
 * aggregate's own no-op, below: no release, no publish, because the slot
 * this sweep read as abandoned is not abandoned anymore.
 *
 * **Order inside the transaction: save, then release, then publish.** The
 * save is what makes the release correct — releasing the hold while the row
 * still says `PENDING_PAYMENT` would leave a window where the slot reads as
 * free while the booking still claims it. One transaction makes that window
 * unobservable to anyone else today, but the ordering still has to read
 * right to whoever adds a second hold mechanism later. The `applied` check
 * sits between save and release for the same reason: releasing a hold this
 * command's own write never actually took would hand away a slot on nothing
 * but a stale read.
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

      const applied = await this.repo.save(moved, booking.status);
      if (!applied) {
        // The row no longer holds the status this read saw — a payment
        // reached it first and already committed. `moved` describes a
        // world that no longer exists; releasing its hold or announcing its
        // expiry would hand away, and tell everyone about the loss of, a
        // slot a customer who just paid is still holding. See this class's
        // own doc comment for why the aggregate's identity check above
        // cannot catch this on its own.
        return;
      }

      // Never null here: `moved` was loaded through `findById`, which only
      // ever returns a booking the database already assigned an id to.
      const bookingId = moved.id as string;

      await this.slotHold.release(bookingId);

      await this.outboxPort.publish(
        [
          new BookingExpired({
            bookingId,
            customerId: moved.customerId,
            providerMemberId: moved.providerMemberId,
            startsAt: moved.startsAt,
          }),
        ],
        "booking",
      );
    });
  }
}
