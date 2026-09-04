import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import type { Booking } from "../../domain/aggregates/booking.aggregate";
import { BookingPaid } from "../../domain/events";
import { BookingNotFoundError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import {
  raiseQuietly,
  type RaiseNotificationInternalPort,
} from "../ports/outbound/raise-notification.port";

export interface MarkBookingPaidInput {
  bookingId: string;
  paymentRef: string;
}

/**
 * The `booking_change` reason this command writes — the hop that carries a
 * booking to the end the design names.
 *
 * A token, never a sentence, for the reason `ACCEPTED_BY_PROVIDER` and
 * `SUBMITTED_BY_CUSTOMER` are tokens: whatever renders a booking's history
 * renders it into eight locales, and a locale key can be switched on where
 * prose cannot. Both zones carry it — `bookings.timeline.payment_confirmed`
 * for the customer and `provider.bookings.timelineReason.payment_confirmed`
 * for the provider — because both read the same list.
 *
 * **Nothing wrote this hop until now, and the timeline stopped one entry
 * short because of it.** `timelineOf` is built from `booking_change` rows
 * plus the booking's own clocks; this command wrote none, so a `CONFIRMED`
 * booking's story ended at "Prestador aceitou" while the money card directly
 * above it said "Pago a …". The spec is explicit that the timeline ends at
 * "pagamento confirmado", and this is the row that lets it.
 *
 * Written here rather than synthesised in the read from `paid_at` — the other
 * way it could have been closed — because the hop is a fact of the write, and
 * `paid_at` is not the only column a synthesised entry would have to keep
 * agreeing with. This is also where `CancelBookingCommand` puts its own
 * customer-caused hop, and one rule for both is easier to keep than two.
 */
const PAYMENT_CONFIRMED = "payment_confirmed";

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
 * that lands on the row *after* that read. The sweep reads and
 * writes the same row this command does, on the same deadline, from the
 * opposite direction: M-Pesa's C2B is synchronous against a fifteen-minute
 * window, so a webhook landing within moments of the sweep claiming the
 * same booking as due is routine, not a theoretical edge case. Without a
 * guard at the write, whichever of the two writes second would silently
 * overwrite the first's transition — the row would say `EXPIRED` while this
 * command had just told Notification and the customer they paid, or the
 * row would say `CONFIRMED` while `BookingExpired` had already told
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
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: MarkBookingPaidInput): Promise<void> {
    // Computed once, before the transition — the instant this command ran,
    // not the instant the payment actually cleared. Those differ by however
    // long the webhook took to arrive; if that difference ever matters to a
    // report, the real instant belongs in the event payload Payment already
    // carries, not here.
    const at = new Date();

    // The confirmed booking, or `null` for either of the two ways this
    // command does nothing — the aggregate's already-paid no-op, or a
    // lost race with the sweep. Both raises below hang off it, so neither
    // can announce a confirmation that never happened, and a webhook
    // delivered twice still confirms once.
    const confirmed = await this.unitOfWork.atomicExecute(async (): Promise<Booking | null> => {
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
        return null;
      }

      const applied = await this.repo.save(moved, booking.status);
      if (!applied) {
        // The row no longer holds the status this read saw — the sweep
        // reached it first and already committed. `moved` describes a
        // world that no longer exists; saving it would silently overwrite
        // whatever the sweep just wrote, and publishing `BookingPaid` would
        // tell the customer they hold a slot the sweep just gave away. See
        // this class's own doc comment for why the aggregate's identity
        // check above cannot catch this on its own.
        return null;
      }

      // After the compare-and-swap, never before it: a change row appended
      // against a `save` that did not apply would be a history claiming a
      // hop the row never made — the same discipline `CancelBookingCommand`
      // keeps, and the reason both of them return above rather than write.
      //
      // `changedByUserId` is null because nobody made this change: it is a
      // payment webhook being recorded, not a person acting. See the
      // column's own doc comment in `booking-change.schema.ts` for why null
      // rather than a sentinel "system user".
      await this.repo.appendChange({
        // Never null here: `moved` was loaded through `findById`, which only
        // ever returns a booking the database already assigned an id to.
        bookingId: moved.id as string,
        changedByUserId: null,
        reason: PAYMENT_CONFIRMED,
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      });

      await this.outboxPort.publish(
        [
          new BookingPaid({
            // Never null here: `moved` was loaded through `findById`, which
            // only ever returns a booking the database already assigned an
            // id to.
            bookingId: moved.id as string,
            customerId: moved.customerId,
            providerId: moved.providerId,
            providerMemberId: moved.providerMemberId,
            startsAt: moved.startsAt,
            endsAt: moved.endsAt,
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

      return moved;
    });

    if (!confirmed) {
      return;
    }

    // **Two raises, because a confirmation says two different things.** The
    // customer is being told their money went through and the slot is theirs;
    // the provider is being told the acceptance they already gave is now a
    // commitment on both sides. One type with a branch in its template would
    // be exactly the shape `NotificationType`'s own doc comment argues
    // against.
    //
    // Both after the transaction, both `raiseQuietly`, per BR-P6 — and this
    // is the command where that matters most: the money has already cleared
    // and the row already says `CONFIRMED`, so a throw travelling out of here
    // would reach a payment webhook as a failure, be retried, and the retry
    // would find an already-paid booking and correctly do nothing. The
    // notification would be lost either way, and a payment marked failed
    // would be lost on top of it.
    const shared = {
      bookingId: input.bookingId,
      serviceName: confirmed.serviceName,
      startsAt: confirmed.startsAt.toISOString(),
      priceMinor: confirmed.priceMinor,
      currency: confirmed.currency,
    };

    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.BookingConfirmed,
        audience: "user",
        userId: confirmed.customerId,
        payload: { ...shared, providerName: confirmed.providerName },
      },
      input.bookingId,
    );

    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.ProviderBookingConfirmed,
        audience: "provider",
        providerId: confirmed.providerId,
        payload: {
          ...shared,
          // The booking row snapshots the provider's name, never the
          // customer's, and this command has no session to read one off — it
          // is driven by a payment webhook. The template says "um cliente";
          // the key is present and null rather than absent, the same shape
          // `SubmitBookingCommand` sends when its own session has no name.
          customerFirstName: null,
        },
      },
      input.bookingId,
    );
  }
}
