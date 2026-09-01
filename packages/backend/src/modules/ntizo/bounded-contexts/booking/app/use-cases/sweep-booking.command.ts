import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type { Booking } from "../../domain/aggregates/booking.aggregate";
import {
  BookingCancelled,
  type BookingCancelledReason,
  BookingExpired,
} from "../../domain/events";
import { BookingNotFoundError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { SlotHoldPort } from "../ports/outbound/slot-hold.port";

export interface SweepBookingInput {
  bookingId: string;
}

/**
 * The one reason this command ever cancels for, named once rather than
 * repeated at the two places that need it — the `Booking.cancel` call that
 * decides the transition is legal, and the `BookingCancelled` payload that
 * tells the provider why their Saturday is empty. The two must agree; a
 * literal typed twice is a way for them not to.
 */
const CUSTOMER_DID_NOT_PAY: BookingCancelledReason = "customer_did_not_pay";

/**
 * What `booking_change.reason` records for the two endings that expire.
 *
 * Machine tokens, not sentences — the same contract `DeclineBookingCommand`'s
 * `DECLINED_WITHOUT_REASON` keeps, and for the same reason: whatever renders
 * a booking's history renders it into eight locales, and a locale key can be
 * switched on where English prose can only be shown verbatim.
 *
 * Named for what happened, not for which clock it was: `checkout_hold` and
 * `provider_response` (the `BookingExpiredClock` members) name *windows*, and
 * a window is not a reason. The third ending reuses `CUSTOMER_DID_NOT_PAY`
 * above rather than declaring a fourth token, because `BookingCancelled`
 * already publishes that exact string and a history row disagreeing with the
 * event about why the same hop happened would be worse than no row at all.
 */
const CHECKOUT_HOLD_EXPIRED = "checkout_hold_expired";
const PROVIDER_DID_NOT_RESPOND = "provider_did_not_respond";

/**
 * A clock ran out on one booking. Which clock decides what that means.
 *
 * **Not `ExpireBookingCommand`, which is what this was called.** That name
 * was accurate while a payment window was the only deadline a booking could
 * miss. Under the design's three clocks one of the three endings is a
 * cancellation, so a name covering only the other two describes this class
 * a third of the time — the same argument that renamed this sweep's counter
 * from `expired` to `swept`, and it applies harder to a type name, which is
 * read far more often than a field.
 *
 * **This command is internal.** It is driven by the sweep, which
 * selects rows on `expires_at` with no way to know whether a booking
 * already moved on — submitted, accepted, paid, declined — between that
 * select and this call. That is an ordinary race, not a fault on either
 * side, which is exactly why `Booking.expire` and `Booking.cancel` are
 * silent no-ops from a status neither governs rather than refusals. No
 * authorisation check for the same reason as `MarkBookingPaidCommand`:
 * there is no requesting user here, only a job that outlived (or didn't)
 * its target's deadline.
 *
 * **Three clocks, two endings, and the third row is the point.** The design
 * gives every deadline-bearing status its own outcome, and they are not one
 * outcome under different labels:
 *
 * - `DRAFT` past its checkout hold becomes `EXPIRED`, and **nobody is
 *   told** — the only person who could be told is the customer who walked
 *   away from their own checkout.
 * - `AWAITING_PROVIDER` past the provider's window becomes `EXPIRED`, and
 *   **the customer is told** — they did everything asked of them and the
 *   provider never answered. Same status, same transition, different
 *   obligation; `BookingExpired.clock` is what carries the difference to
 *   Notification.
 * - `PENDING_PAYMENT` past the payment window becomes **`CANCELLED`, not
 *   `EXPIRED`**, and **the provider is told, with the reason**. This is the
 *   failure the design was written for: the provider accepted, blocked
 *   their calendar, the customer never paid, and the platform's own choice
 *   of ordering is what cost them the slot. `EXPIRED` explains none of
 *   that. `BookingCancelled` carrying `customer_did_not_pay` does.
 *
 * The status is read here, once, because it is the only place the *which
 * clock* still exists: all three windows are stamped onto the same
 * `expiresAt` column by the hop that enters the status, so the column says
 * when and the status says which. Reading it does not move the transition
 * decision out of the aggregate — `expire` and `cancel` still refuse (by
 * no-op) anything they do not govern, and the identity check below is what
 * this command actually acts on.
 *
 * **Idempotency is the aggregate's decision, not this command's.** Both
 * transitions return the very same instance back from a status they do not
 * govern — a booking that already paid, or that an earlier sweep run
 * already ended, is left alone. That identity, read below with `===`, is
 * what decides whether anything gets saved, released, or announced.
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
 * would say `CANCELLED` and the slot handed to someone else while the
 * payment actually cleared, or the row would say paid while
 * `BookingCancelled` had already told Scheduling and Notification the
 * opposite, reason and all. `repo.save`'s
 * `expectedStatus` parameter guards against exactly this: it carries the
 * status this read saw, and the repository only writes if the row is still
 * at that status when the write actually runs (see
 * `BookingRepositoryPort.save`'s own comment for the mechanism). `false`
 * back means the payment won the race — handled the same way as the
 * aggregate's own no-op, below: no release, no publish, because the slot
 * this sweep read as abandoned is not abandoned anymore.
 *
 * **Order inside the transaction: save, then append the change, then
 * release, then publish** — matching `DeclineBookingCommand`. The
 * save is what makes the release correct — releasing the hold while the row
 * still says whichever slot-holding status this sweep found it in would
 * leave a window where the slot reads as free while the booking still
 * claims it. Releasing is part of all three endings, not only the two that
 * expire: `EXPIRED` and `CANCELLED` are both outside
 * `SLOT_HOLDING_STATUSES`. One transaction makes that window
 * unobservable to anyone else today, but the ordering still has to read
 * right to whoever adds a second hold mechanism later. The `applied` check
 * sits between save and release for the same reason: releasing a hold this
 * command's own write never actually took would hand away a slot on nothing
 * but a stale read.
 */
export class SweepBookingCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly slotHold: SlotHoldPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(input: SweepBookingInput): Promise<void> {
    // Computed once, before the transition — the instant this sweep run
    // reached this booking, not the instant its deadline actually passed.
    // Those differ by up to the sweep interval; if that difference ever
    // matters to a report, the real deadline is already on the row as
    // `expiresAt` and belongs in the event payload, not here.
    const at = new Date();

    await this.unitOfWork.atomicExecute(async () => {
      const booking = await this.repo.findById(input.bookingId);
      if (!booking) {
        // A sweep naming a booking that does not exist means the job
        // outlived its row — not routine, and worth a fact left behind to
        // find it by.
        throw new BookingNotFoundError(input.bookingId);
      }

      // Never null here: `booking` was loaded through `findById`, which
      // only ever returns a booking the database already assigned an id to.
      const bookingId = booking.id as string;

      let moved: Booking;
      let announcement: BookingExpired | BookingCancelled;
      let changeReason: string;

      // The design's three-row table, in code. The transition, the fact its
      // event has to carry, and the reason its history row records are
      // decided together, off the one status read, because they are the same
      // decision: which clock this booking was standing on. `expiresAt` says
      // when the deadline was, never which window set it.
      //
      // Literals rather than the `BookingStatus` const: that const lives in
      // `shared/infrastructure/database/booking/enums.ts`, and no use case
      // in this codebase reaches into `infrastructure/` — the domain layer's
      // own use of it is as far in as this vocabulary comes. (Two of
      // Communication's outbound *ports* do import from there; a command
      // doing it would be a step further, and there is no need.) The
      // literals are not loose strings either: `booking.status` is that same
      // union, so a `case` naming a status that stopped existing is a
      // compile error here, not a branch that silently stops matching.
      switch (booking.status) {
        case "DRAFT":
          moved = booking.expire(at);
          announcement = new BookingExpired({
            bookingId,
            customerId: booking.customerId,
            providerMemberId: booking.providerMemberId,
            startsAt: booking.startsAt,
            clock: "checkout_hold",
          });
          changeReason = CHECKOUT_HOLD_EXPIRED;
          break;

        case "AWAITING_PROVIDER":
          moved = booking.expire(at);
          announcement = new BookingExpired({
            bookingId,
            customerId: booking.customerId,
            providerMemberId: booking.providerMemberId,
            startsAt: booking.startsAt,
            clock: "provider_response",
          });
          changeReason = PROVIDER_DID_NOT_RESPOND;
          break;

        case "PENDING_PAYMENT":
          // Not an expiry. See this class's doc comment: a provider blocked
          // their calendar on the platform's promise and got nothing, and
          // the reason is what they are owed.
          moved = booking.cancel(at, CUSTOMER_DID_NOT_PAY);
          announcement = new BookingCancelled({
            bookingId,
            customerId: booking.customerId,
            providerId: booking.providerId,
            providerMemberId: booking.providerMemberId,
            startsAt: booking.startsAt,
            reason: CUSTOMER_DID_NOT_PAY,
          });
          changeReason = CUSTOMER_DID_NOT_PAY;
          break;

        default:
          // No clock governs where this booking is now: the sweep selected
          // it on a deadline and it moved on before this call reached it.
          // The ordinary race, answered the same way the aggregate answers
          // it — silently, with nothing written.
          return;
      }

      if (moved === booking) {
        // The aggregate says nothing happened by handing back the instance
        // it was given. It has the last word even where the switch above
        // expected a transition: releasing this booking's hold would hand
        // away a slot somebody may still be holding.
        return;
      }

      const applied = await this.repo.save(moved, booking.status);
      if (!applied) {
        // The row no longer holds the status this read saw — a payment
        // reached it first and already committed. `moved` describes a
        // world that no longer exists; releasing its hold or announcing
        // its ending would hand away, and tell everyone about the loss of,
        // a slot a customer who just paid is still holding. See this
        // class's own doc comment for why the aggregate's identity check
        // above cannot catch this on its own.
        return;
      }

      // The durable answer to "why did this booking die?", written before
      // anything is announced, so it survives a consumer that never runs.
      // `BookingCancelled` carries the reason to Notification, but an event
      // is a message, not a record: if Notification drops it, or is added
      // later, or is asked afterwards by a provider who wants to know why
      // their Saturday emptied, the only thing left is this table.
      //
      // `changedByUserId: null` — nobody did this. A deadline passed. See
      // the column's own doc comment for why null rather than a sentinel
      // system user, and `DeclineBookingCommand` for the same
      // save-then-append ordering.
      //
      // Every `previous*` field is null because this hop moved none of
      // them: it changed the status, and the status is on the booking, not
      // here.
      await this.repo.appendChange({
        bookingId,
        changedByUserId: null,
        reason: changeReason,
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      });

      await this.slotHold.release(bookingId);

      await this.outboxPort.publish([announcement], "booking");
    });
  }
}
