import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import type { Booking } from "../../domain/aggregates/booking.aggregate";
import { BookingCancelled, type BookingCancelledReason, BookingCompleted } from "../../domain/events";
import { BookingNotFoundError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import {
  raiseQuietly,
  type RaiseNotificationInternalPort,
} from "../ports/outbound/raise-notification.port";

/**
 * What `booking_change.reason` records for the outcome that sides with the
 * customer.
 *
 * `satisfies BookingCancelledReason`, not a bare string, and named once
 * rather than typed at both places that need it — the change row and the
 * `BookingCancelled` payload the wallet work will read. The two must agree,
 * and a literal typed twice is a way for them not to. The same shape
 * `SweepBookingCommand` uses for `customer_did_not_pay`, for the same reason.
 */
const DISPUTE_UPHELD = "dispute_upheld" satisfies BookingCancelledReason;

/**
 * And for the outcome that lets the completion stand.
 *
 * Deliberately *not* a member of `CompleteReason`: that union belongs to
 * `CompleteBookingCommand`, whose three doors all open from `MARKED_DONE`,
 * and this booking is no longer there. See that type's own doc comment, which
 * says as much and points here. A machine token rather than a sentence, for
 * the reason every other reason in this directory is one.
 */
const DISPUTE_REJECTED = "dispute_rejected";

export interface ResolveBookingDisputeInput {
  bookingId: string;
  /**
   * The administrator who decided. From `requireAdminUserId` at the GraphQL
   * layer, never from the client, and never null: unlike the sweep's own
   * hops, there is no version of this one that nobody took.
   */
  adminUserId: string;
  /** True sides with the customer; false lets the completion stand. */
  upheld: boolean;
  /** What the administrator wants both sides told, if anything. */
  note: string | null;
}

/**
 * An administrator decided. Either the completion stands and the booking is
 * `COMPLETED`, or the customer is right and it is `CANCELLED` under
 * `dispute_upheld` — the flag the wallet work reads later to know what not to
 * pay out. No refunds and no wallet entries: money moves nowhere in this
 * phase, by design (BR-C7).
 *
 * **Administrator-only, and the edge is what guards it.** There is no check
 * in this command and there should not be one, for the same reason
 * `CompleteBookingCommand` has none: an administrator is an administrator by
 * virtue of the edge that let them in, not by belonging to the provider whose
 * booking they are deciding about — a membership check would refuse every
 * administrator on the platform, and there is no other caller for it to
 * refuse. `adminUserId` is recorded on the change row so the decision has a
 * name against it.
 *
 * **`Booking.resolveDispute` is the only door this command opens, and
 * `cancel` is deliberately not used for the upheld outcome even though
 * `CANCELLABLE_FROM` makes `cancel(at, "dispute_upheld")` a legal call.** The
 * difference is what each does when the read went stale: `cancel` answers a
 * status it does not govern by handing the instance back in silence, which is
 * right for a sweep reading a deadline and wrong for a person who pressed a
 * button — they would be shown a recorded decision that was never recorded.
 * `resolveDispute` throws, and both halves of the one decision refuse the
 * same way. See `CANCELLABLE_FROM`'s own doc comment, which says the entry
 * exists for the *event*, not as an invitation to this command.
 *
 * **Both outcomes publish, and each one already had an event waiting for
 * it.** `BookingCancelled` carries `dispute_upheld` — that is what
 * `CANCELLABLE_FROM`'s entry is for, and this command is that reason's only
 * producer; nothing else in the codebase may emit it. `BookingCompleted` is
 * the other: a dispute turned down is a completion like any other, the work
 * stands and the payout becomes owed, which is exactly what that event
 * reports. It carries no hint that a dispute happened, and does not need to —
 * no consumer pays out differently for a completion an administrator upheld
 * than for one a timer closed.
 *
 * **No slot release on either outcome.** `CANCELLED` is not one of
 * `SLOT_HOLDING_STATUSES`, so this hop does move the row out from under the
 * exclusion constraint — but `DISPUTED` is only reachable through
 * `MARKED_DONE`, which is only reachable once the appointment has ended, so
 * the calendar this booking held is days in the past and nobody is waiting
 * for it. `SlotHoldPort` is not taken for the same reason
 * `CompleteBookingCommand` does not take it.
 *
 * **The support request itself is not resolved here.** Closing the
 * conversation is Communication's own action, which the administrator takes
 * in the same screen — this command decides the booking. Reaching across to
 * resolve the thread would be this context writing another's row, which is
 * the coupling `OpenDisputeThreadPort` exists to avoid on the way in.
 *
 * **Both raises happen after the transaction resolves, and only on the
 * applied path** (BR-P6). **`execute` answers with the booking it moved, or
 * `null` when it moved nothing**, the same way `MarkBookingDoneCommand` and
 * `CompleteBookingCommand` do.
 */
export class ResolveBookingDisputeCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: ResolveBookingDisputeInput): Promise<Booking | null> {
    // Computed once, before the transition — the instant this command ran.
    const at = new Date();

    const moved = await this.unitOfWork.atomicExecute(async (): Promise<Booking | null> => {
      const booking = await this.repo.findById(input.bookingId);
      if (!booking) {
        throw new BookingNotFoundError(input.bookingId);
      }

      // Refuses from any status but `DISPUTED`, which is the behaviour this
      // hop needs and the reason it does not go through `cancel`.
      const next = booking.resolveDispute(at, input.upheld);

      const applied = await this.repo.save(next, booking.status);
      if (!applied) {
        // The row moved between this read and this write — a second
        // administrator deciding the same case from another screen is what
        // this exists for. `next` describes a world that no longer exists,
        // and announcing an outcome that was not written would be telling
        // both sides the opposite of what the row now says.
        return null;
      }

      // Which way it went, and who decided. Every `previous*` field is null
      // because this hop moved none of them: it changed the status, and the
      // status is on the booking. The note is not here — this table has no
      // column for one, and inventing a place for it in `reason` would break
      // the machine-token contract every other row in it keeps.
      await this.repo.appendChange({
        bookingId: input.bookingId,
        changedByUserId: input.adminUserId,
        reason: input.upheld ? DISPUTE_UPHELD : DISPUTE_REJECTED,
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      });

      await this.outboxPort.publish(
        [
          input.upheld
            ? new BookingCancelled({
                bookingId: input.bookingId,
                customerId: next.customerId,
                providerId: next.providerId,
                // Carried because `BookingCancelled` carries them for every
                // producer — Scheduling reads them rather than reading the
                // booking back. There is no calendar to free here (see the
                // "no slot release" paragraph above), and a consumer acting
                // on a slot days in the past finds nothing waiting for it.
                providerMemberId: next.providerMemberId,
                startsAt: next.startsAt,
                reason: DISPUTE_UPHELD,
              })
            : new BookingCompleted({
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
      return null;
    }

    // One type, two audiences — "an administrator decided your dispute" is
    // the same news whoever reads it, and the inbox's presentation map keys
    // on the type. `upheld` is what makes the two readings differ, and it
    // travels in the payload rather than in a second notification type.
    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.BookingDisputeResolved,
        audience: "user",
        userId: moved.customerId,
        payload: {
          bookingId: input.bookingId,
          serviceName: moved.serviceName,
          providerName: moved.providerName,
          upheld: input.upheld,
          // Explicitly null rather than absent when there is none, the shape
          // `SubmitBookingCommand` and `CompleteBookingCommand` already use:
          // a key that is present and null is a decision, where a missing one
          // is a bug nobody can tell apart from a typo. This is also the only
          // place the administrator's note can go — `booking_change` has no
          // column for one — so dropping it would lose it entirely.
          note: input.note,
        },
      },
      input.bookingId,
    );

    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.BookingDisputeResolved,
        audience: "provider",
        providerId: moved.providerId,
        payload: {
          bookingId: input.bookingId,
          serviceName: moved.serviceName,
          // Null rather than absent, for the reason `CompleteBookingCommand`
          // gives for the same field: this command reads no profile, so it
          // has no name to give, and the template renders "um cliente".
          customerFirstName: null,
          upheld: input.upheld,
          note: input.note,
        },
      },
      input.bookingId,
    );

    return moved;
  }
}
