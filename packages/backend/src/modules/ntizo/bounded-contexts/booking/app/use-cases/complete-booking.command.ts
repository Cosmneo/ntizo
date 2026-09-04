import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import type { Booking } from "../../domain/aggregates/booking.aggregate";
import { BookingCompleted } from "../../domain/events";
import { BookingNotFoundError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import {
  raiseQuietly,
  type RaiseNotificationInternalPort,
} from "../ports/outbound/raise-notification.port";

/**
 * What `booking_change.reason` records for this hop — which of the three
 * doors into `COMPLETED` this booking came through.
 *
 * Machine tokens, not sentences, and a closed union rather than loose
 * strings: the same contract `MarkDoneReason` and `BookingExpiredReason`
 * keep, for the same reason. Declared beside its producer rather than on
 * `BookingCompleted` for the same reason too — a reason that rides on an
 * event is owned by the event, and this one does not ride on anything. No
 * consumer of `BookingCompleted` pays out differently for a window that
 * closed quietly than for a review that closed it early.
 *
 * `completed_by_review` is the customer's own doing and the reason this is
 * not simply a timer's vocabulary: leaving a review says the work happened,
 * so the review context closes the booking rather than making the customer
 * wait out a window they have already answered. `completed_by_admin` is the
 * manual door, for the cases support has to settle by hand.
 *
 * **There is deliberately no `dispute_rejected` member.** A booking whose
 * dispute an administrator turned down also lands on `COMPLETED`, but it does
 * not come through this command: `Booking.resolveDispute` writes that outcome
 * itself, from `DISPUTED`, which `Booking.complete` refuses. Its reason
 * belongs to that hop's own command.
 */
export type CompleteReason = "completed_by_timer" | "completed_by_review" | "completed_by_admin";

export interface CompleteBookingInput {
  bookingId: string;
  reason: CompleteReason;
  /**
   * Who closed it, or null when nobody did — the sweep's own arm, where the
   * clock ran out and no human was involved. See
   * `BookingChangeRecord.changedByUserId` for why null rather than a sentinel
   * "system user".
   */
  changedByUserId: string | null;
}

/**
 * The window closed without a dispute, or the customer's review closed it
 * early, or an administrator closed it by hand. Either way this is the
 * ending the whole flow is aimed at: the work is finished, both sides are
 * told, and the payout becomes owed.
 *
 * **This command takes no membership check, and that is deliberate rather
 * than an oversight — do not add one.** Its three callers are the sweep, the
 * review context and an administrator, and each is already authorised at its
 * own edge: the sweep runs from a cron invocation with no user at all, the
 * review context has already established that the reviewer is this booking's
 * customer before it will accept a review, and an administrator is an
 * administrator by virtue of the edge that let them in rather than by
 * belonging to the provider. There is no fourth caller and no provider-facing
 * button here — a provider cannot complete their own booking, which is the
 * entire reason `MARKED_DONE` and the customer's window exist between
 * `CONFIRMED` and this. A membership check would therefore have nobody
 * legitimate to pass and nobody illegitimate to refuse.
 *
 * **`Booking.complete` is the only door this command opens, and `MARKED_DONE`
 * is the only status it opens from.** A `DISPUTED` booking is not completed
 * here: `resolveDispute` is how a booking leaves a dispute, and it writes
 * both of its outcomes itself. `Booking.cancel(at, "dispute_upheld")` is a
 * legal call from `DISPUTED` and is not the door either — see
 * `CANCELLABLE_FROM`'s own doc comment on why that entry exists and why it is
 * not an invitation.
 *
 * **No slot release.** `COMPLETED` is not one of `SLOT_HOLDING_STATUSES`, so
 * this hop does move the row out from under the exclusion constraint — but
 * unlike a decline or a sweep there is no calendar to free: `MARKED_DONE` is
 * only reachable once the appointment has ended, so the slot this booking
 * held is days in the past and nobody is waiting to book it. `SlotHoldPort`
 * is not taken for the same reason `KeepBookingOpenCommand` takes no
 * notification port — a dependency that would never be called lies about what
 * the command does.
 *
 * **Both raises happen after the transaction resolves, and only on the
 * applied path** (BR-P6), the same discipline every other command in this
 * directory keeps: nothing announced that a rollback could take back, and
 * nothing announced for a compare-and-swap somebody else won.
 */
export class CompleteBookingCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: CompleteBookingInput): Promise<void> {
    // Computed once, before the transition — the instant this command ran.
    const at = new Date();

    const moved = await this.unitOfWork.atomicExecute(async (): Promise<Booking | null> => {
      const booking = await this.repo.findById(input.bookingId);
      if (!booking) {
        throw new BookingNotFoundError(input.bookingId);
      }

      const next = booking.complete(at);

      const applied = await this.repo.save(next, booking.status);
      if (!applied) {
        // The row moved between this read and this write — a dispute landing
        // in the last seconds of the window is the case this exists for.
        // `next` describes a world that no longer exists, and telling both
        // sides a disputed booking completed cleanly would be the worst
        // possible thing to announce.
        return null;
      }

      // Which door this booking came through, and who opened it. `null` here
      // is the sweep's arm and says so — no human closed this one.
      //
      // Every `previous*` field is null because this hop moved none of them:
      // it changed the status, and the status is on the booking.
      await this.repo.appendChange({
        bookingId: input.bookingId,
        changedByUserId: input.changedByUserId,
        reason: input.reason,
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      });

      await this.outboxPort.publish(
        [
          new BookingCompleted({
            bookingId: input.bookingId,
            customerId: next.customerId,
            providerId: next.providerId,
            priceMinor: next.priceMinor,
            commissionMinor: next.commissionMinor,
            currency: next.currency,
          }),
        ],
        "booking",
      );

      return next;
    });

    if (!moved) {
      return;
    }

    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.BookingCompleted,
        audience: "user",
        userId: moved.customerId,
        payload: {
          bookingId: input.bookingId,
          serviceName: moved.serviceName,
          providerName: moved.providerName,
        },
      },
      input.bookingId,
    );

    // The same type to the other side. One notification type, two audiences —
    // the inbox's presentation map keys on the type, and "this booking is
    // finished" is the same news whoever reads it.
    //
    // `customerFirstName` is explicitly null rather than absent, the shape
    // `SubmitBookingCommand` already uses for the same field: the template
    // renders "um cliente" for it, and a key that is present and null is a
    // decision where a missing one is a bug nobody can tell apart from a
    // typo. This command reads no profile, so it has no name to give.
    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.BookingCompleted,
        audience: "provider",
        providerId: moved.providerId,
        payload: {
          bookingId: input.bookingId,
          serviceName: moved.serviceName,
          customerFirstName: null,
        },
      },
      input.bookingId,
    );
  }
}
