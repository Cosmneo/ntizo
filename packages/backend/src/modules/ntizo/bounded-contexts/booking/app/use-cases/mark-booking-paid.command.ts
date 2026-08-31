import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { BookingPaid } from "../../domain/events";
import { BookingNotFoundError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";

export interface MarkBookingPaidInput {
  bookingId: string;
  paymentRef: string;
}

/**
 * A payment cleared; the slot this booking is holding is now backed by
 * money.
 *
 * **This command is internal.** It is driven by Payment's event — a payment
 * provider's webhook told the Payment context a charge cleared, and Payment's
 * handler calls this with the reference it was given. It is never called by
 * a customer, directly or otherwise, which is why it carries no authorisation
 * check: there is no requesting user to authorise, only a fact from another
 * bounded context to record. A reader who assumes otherwise would either add
 * a check that can never pass — nothing upstream of this command carries an
 * `ExecutionContext` — or wonder why one is missing.
 *
 * **Idempotency is the aggregate's decision, not this command's.**
 * `Booking.markPaid` returns the very same instance back when the booking
 * already holds its slot under the same payment reference — see
 * `Booking.markPaid`'s own doc comment for why. That identity, read below
 * with `===`, is the whole mechanism: it is what "paying twice publishes
 * once" turns on, not a status comparison written a second time here. A
 * payment webhook arriving twice is the ordinary case for at-least-once
 * delivery, not the exception, and a second `BookingPaid` for the same
 * payment would tell Notification to send a second confirmation and
 * Scheduling to hold a slot it already holds.
 *
 * **A lost update is a different problem from a duplicate, and the
 * aggregate cannot solve it.** The identity check above only ever reasons
 * about the value `findById` returned — it has nothing to say about a write
 * that lands on the row *after* that read. The expiry sweep reads and
 * writes the same row this command does, on the same deadline, from the
 * opposite direction: M-Pesa's C2B is synchronous against a fifteen-minute
 * window, so a webhook landing within moments of the sweep claiming the
 * same booking as due is routine, not a theoretical edge case. Without a
 * guard at the write, whichever of the two writes second would silently
 * overwrite the first's transition — the row would say `EXPIRED` while this
 * command had just told Notification and the customer they paid, or the
 * row would say `AWAITING_PROVIDER` while `BookingExpired` had already told
 * Scheduling the slot was free. `repo.save`'s `expectedStatus` parameter is
 * the guard: it carries the status this command's own read saw, and the
 * repository only writes if the row is still at that status by the time
 * the write actually runs (see `BookingRepositoryPort.save`'s own comment
 * for the mechanism). `false` back means the sweep won the race — handled
 * the same way as the aggregate's own no-op, below, because from this
 * command's point of view the outcome is identical: nothing here is true
 * anymore, so nothing here gets saved or announced.
 */
export class MarkBookingPaidCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(input: MarkBookingPaidInput): Promise<void> {
    // Computed once, before the transition — the instant this command ran,
    // not the instant the payment actually cleared. Those differ by however
    // long the webhook took to arrive; if that difference ever matters to a
    // report, the real instant belongs in the event payload Payment already
    // carries, not here.
    const at = new Date();

    await this.unitOfWork.atomicExecute(async () => {
      const booking = await this.repo.findById(input.bookingId);
      if (!booking) {
        // A payment naming a booking that does not exist means the money
        // and the booking have come apart — not routine, and worth a fact
        // left behind to find it by.
        throw new BookingNotFoundError(input.bookingId);
      }

      const moved = booking.markPaid(input.paymentRef, at);
      if (moved === booking) {
        // The aggregate says nothing happened by handing back the instance
        // it was given: this reference already paid this booking. Nothing
        // to save, nothing to announce.
        return;
      }

      const applied = await this.repo.save(moved, booking.status);
      if (!applied) {
        // The row no longer holds the status this read saw — the expiry
        // sweep reached it first and already committed. `moved` describes a
        // world that no longer exists; saving it would silently overwrite
        // whatever the sweep just wrote, and publishing `BookingPaid` would
        // tell the customer they hold a slot the sweep just gave away. See
        // this class's own doc comment for why the aggregate's identity
        // check above cannot catch this on its own.
        return;
      }

      await this.outboxPort.publish(
        [
          new BookingPaid({
            // Never null here: `moved` was loaded through `findById`, which
            // only ever returns a booking the database already assigned an
            // id to.
            bookingId: moved.id as string,
            customerId: moved.customerId,
            providerId: moved.providerId,
            priceMinor: moved.priceMinor,
            commissionMinor: moved.commissionMinor,
            currency: moved.currency,
            // Never null here either: the branch above already returned for
            // the one case where `markPaid` doesn't set it fresh (the
            // already-paid no-op), so reaching this line means `markPaid`
            // just moved the booking from `PENDING_PAYMENT` and stamped
            // `paymentRef` with `input.paymentRef`.
            paymentRef: moved.paymentRef as string,
          }),
        ],
        "booking",
      );
    });
  }
}
