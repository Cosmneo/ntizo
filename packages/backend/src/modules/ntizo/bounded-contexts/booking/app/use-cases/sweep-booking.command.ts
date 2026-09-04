import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import type { Booking } from "../../domain/aggregates/booking.aggregate";
import {
  BookingCancelled,
  type BookingCancelledReason,
  BookingExpired,
  type BookingExpiredCause,
} from "../../domain/events";
import { BookingNotFoundError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { AdminUserReaderPort } from "../ports/outbound/admin-user-reader.port";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import {
  raiseQuietly,
  type RaiseNotificationInternalPort,
} from "../ports/outbound/raise-notification.port";
import type { SlotHoldPort } from "../ports/outbound/slot-hold.port";
import type { CompleteBookingCommand, CompleteReason } from "./complete-booking.command";
import {
  ASK_AGAIN_AFTER_DAYS,
  DAY_MS,
  type MarkBookingDoneCommand,
  type MarkDoneReason,
} from "./mark-booking-done.command";

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
const CUSTOMER_DID_NOT_PAY = "customer_did_not_pay" satisfies BookingCancelledReason;

/**
 * What `booking_change.reason` records for the one hop this sweep writes that
 * is not an ending: the platform asked the provider to close a booking whose
 * appointment is over.
 *
 * A machine token rather than a sentence, the contract every other reason in
 * this directory keeps — a booking's history renders into eight locales, and
 * a locale key can be switched on where English prose can only be shown
 * verbatim. `KeepBookingOpenCommand`'s `STILL_ONGOING` is its counterpart: one
 * row for the question, one for each answer, so a job that overran four times
 * reads as four exchanges rather than as one status.
 *
 * It doubles as this command's own outcome name, which the two hops below do
 * not — see `SweptOutcome`.
 */
const CLOSE_REMINDER = "close_reminder";

/**
 * The two hops this sweep does not write itself, named here so the tokens it
 * hands to `MarkBookingDoneCommand` and `CompleteBookingCommand` are checked
 * against those commands' own vocabularies rather than typed as loose strings.
 *
 * `satisfies` rather than a type annotation, so each stays the literal it is:
 * an annotation would widen `MARKED_DONE_BY_PLATFORM` to all three
 * `MarkDoneReason` members and take the `switch` below's exhaustiveness gate
 * with it. Renaming a member on either side is a compile error here.
 */
const MARKED_DONE_BY_PLATFORM = "marked_done_by_platform" satisfies MarkDoneReason;
const COMPLETED_BY_TIMER = "completed_by_timer" satisfies CompleteReason;

/**
 * What this sweep calls the ending `COMPLETED_BY_TIMER` produces — and
 * deliberately not the same word.
 *
 * The history row answers "how did this booking end?", and the honest answer
 * is that a timer closed it. This outcome answers "what did this sweep run
 * decide?", and the honest answer there is that the customer's window closed
 * with nothing said. `close_reminder` above needs no such pair because the
 * question and the record really are the same fact.
 */
const FEEDBACK_WINDOW_CLOSED = "feedback_window_closed";

/**
 * What `booking_change.reason` records for every ending that expires — this
 * command's two, and `CreateBookingCommand`'s one.
 *
 * Machine tokens, not sentences — the same contract `DeclineBookingCommand`'s
 * `DECLINED_WITHOUT_REASON` keeps, and for the same reason: whatever renders
 * a booking's history renders it into eight locales, and a locale key can be
 * switched on where English prose can only be shown verbatim.
 *
 * **Named for what happened, not for which clock it was.** `checkout_hold`
 * and `provider_response` — the two `BookingExpiredCause` members this
 * command can produce — name *windows*, and a window is not a reason: a
 * column that promises a cause and answers with a clock is a column that
 * lies. So these are their own vocabulary rather than a reuse of that one.
 * `superseded_by_new_draft` keeps that separation honest from the other
 * side: its cause, `superseded`, names no window at all.
 *
 * **`superseded_by_new_draft` is produced elsewhere**, by
 * `CreateBookingCommand` expiring the draft a customer replaced. It is
 * declared here rather than there because this is one vocabulary for one
 * hop — `DRAFT`/`AWAITING_PROVIDER` becoming `EXPIRED` — and a second union
 * next to the second producer would be two vocabularies for it, which is the
 * exact drift this type was closed to prevent. A command writing history for
 * one route into `EXPIRED` and not the other reads as an oversight rather
 * than a decision, so all three routes write a row.
 *
 * A closed union rather than loose strings, and that is the half of this
 * that took a second pass to get right. The cancellation ending has
 * `BookingCancelledReason` holding it to a contract; before this type, these
 * had nothing, so a rename on either side of the cause/reason pairing
 * would have gone unnoticed and the two vocabularies could drift apart in
 * silence.
 */
export type BookingExpiredReason =
  | "checkout_hold_expired"
  | "provider_did_not_respond"
  | "superseded_by_new_draft";

/**
 * The `BookingExpiredCause` members that really are clocks — the only ones a
 * deadline sweep can ever produce.
 *
 * `superseded` is excluded because no deadline produces it: a customer
 * starting a second draft expires their first one on the spot, from inside
 * `CreateBookingCommand`, while `findDueForSweep` selects on `expires_at`
 * alone. Asking this file which *window* a superseded draft stood on would
 * be asking a question that has no answer.
 *
 * An `Exclude` rather than a second hand-typed union, so the gate below
 * keeps working in the direction that matters: a fourth cause that really is
 * a clock lands in this type on its own and leaves the map below incomplete,
 * which is a compile error until somebody says what it means.
 */
type BookingExpiredClock = Exclude<BookingExpiredCause, "superseded">;

/**
 * Which reason each clock produces — total over `BookingExpiredClock`, which
 * is what ties the two vocabularies together without merging them.
 *
 * `Record`, not `Partial<Record>`: a clock added to `BookingExpiredClock` is
 * a type error here until somebody says what its running out actually *means*
 * — the same gate `CANCELLABLE_FROM` puts on a new cancellation reason, and
 * the same one `booking.aggregate.test.ts` puts on a new slot-holding status.
 * Renaming a clock member breaks this map's key; renaming a reason breaks its
 * value. Neither can move alone.
 *
 * `superseded_by_new_draft` has no key here, and cannot: its cause is not a
 * clock, so `BookingExpiredClock` above excludes it and this sweep can never
 * reach it. That one cause/reason pairing lives beside its own producer, in
 * `CreateBookingCommand` — the map is total over what a *deadline* can
 * produce, not over the reason vocabulary.
 *
 * The cancellation ending is deliberately not in here. It reuses
 * `CUSTOMER_DID_NOT_PAY` above rather than declaring a token of its own,
 * because `BookingCancelled` already publishes that exact string and a
 * history row disagreeing with the event about why the same hop happened
 * would be worse than no row at all. The asymmetry is the point: the
 * cancellation's reason *is* an event field, so the event owns it; the
 * expiries' reasons are not carried on any event, so they are owned here.
 */
const EXPIRED_REASON_BY_CLOCK: Record<BookingExpiredClock, BookingExpiredReason> = {
  checkout_hold: "checkout_hold_expired",
  provider_response: "provider_did_not_respond",
};

/**
 * What one sweep of one booking actually did: the booking as it now stands,
 * and which of the five outcomes that was.
 *
 * `null` covers every way it did nothing — a status no clock governs, the
 * aggregate's own no-op, a lost race with a payment or with a provider's own
 * button — so the announcement below cannot fire on a hop that never landed.
 * The reason travels out because the status alone cannot say what happened:
 * two of the endings share `EXPIRED`, and one of the five moves no status at
 * all.
 *
 * **`moved` is always the aggregate as this hop left it**, including on the
 * two arms this command hands to another one: those return the booking they
 * wrote, and `null` when their own compare-and-swap lost, which is exactly
 * why they return anything at all (see `MarkBookingDoneCommand.execute`).
 *
 * The union is narrowed to what this sweep can actually produce rather than
 * to the whole of either vocabulary. `dispute_upheld` is the member left out,
 * and leaving it out is the point: it is a legal `BookingCancelledReason`
 * from `DISPUTED`, and a sweep that could name it is a sweep one line away
 * from deciding disputes on a timer. `superseded_by_new_draft` stays only
 * because it belongs to `BookingExpiredReason`, whose other two members this
 * command does produce; `CreateBookingCommand` is its only writer.
 */
type SweptOutcome = {
  moved: Booking;
  reason:
    | BookingExpiredReason
    | typeof CUSTOMER_DID_NOT_PAY
    | typeof CLOSE_REMINDER
    | typeof MARKED_DONE_BY_PLATFORM
    | typeof FEEDBACK_WINDOW_CLOSED;
};

/**
 * The hops this sweep decides on but does not write.
 *
 * Both are already owned by a command of their own —
 * `MarkBookingDoneCommand`'s platform arm and `CompleteBookingCommand`'s
 * timer arm — each with its own history reason, its own domain event and its
 * own notifications. Re-implementing either here would be a second producer
 * of `booking.marked_done` or `booking.completed`, and the second one is the
 * one that quietly stops agreeing with the first. Payment's payout hangs off
 * `booking.completed`; a sweep-completed booking that published nothing would
 * simply never pay the provider.
 */
type HandOver = "mark_done" | "complete";

/**
 * What this command's transaction concluded: either an outcome it wrote
 * itself, or the name of a command that has to run once the transaction is
 * over.
 *
 * The hand-over cannot happen *inside* the transaction, and that is what this
 * type exists to make impossible to get wrong. Both commands raise their
 * notifications after their own `atomicExecute` resolves; called from in
 * here, that "after" would still be inside this one, and BR-P6's rule —
 * nothing announced that a rollback could take back — would be broken by
 * construction rather than by mistake.
 */
type SweepDecision =
  | ({ kind: "swept" } & SweptOutcome)
  | { kind: "handOver"; to: HandOver };

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
 *   obligation; `BookingExpired.cause` is what carries the difference to
 *   Notification.
 * - `PENDING_PAYMENT` past the payment window becomes **`CANCELLED`, not
 *   `EXPIRED`**, and **the provider is told, with the reason**. This is the
 *   failure the design was written for: the provider accepted, blocked
 *   their calendar, the customer never paid, and the platform's own choice
 *   of ordering is what cost them the slot. `EXPIRED` explains none of
 *   that. `BookingCancelled` carrying `customer_did_not_pay` does.
 *
 * **Two more clocks were added after those three, and the first of them ends
 * nothing at all.** The three above all run before anybody has done any work;
 * these two run after the work is over:
 *
 * - `CONFIRMED` past its own appointment's end is **asked, not closed** — the
 *   platform tells the provider their booking is still open and pushes the
 *   clock out seven days. Only a second firing, with `reminded_at` already on
 *   the row, closes it, and that closing is `MarkBookingDoneCommand`'s to
 *   write. A platform that assumed a job was finished because a week passed
 *   would be deciding, on no evidence, that a customer owes money; asking
 *   first costs one notification and is the whole difference.
 * - `MARKED_DONE` past the customer's window is **completed** by
 *   `CompleteBookingCommand`, which is the ending the entire flow aims at:
 *   the work stands, nobody disputed it, and the payout becomes owed.
 *
 * **There is no `DISPUTED` arm, and there must not be one.**
 * `Booking.dispute` nulls `expires_at` precisely so this sweep stops seeing
 * the booking; a person owns it from then on, and it leaves through
 * `Booking.resolveDispute`. `cancel(at, "dispute_upheld")` is a legal call
 * from `DISPUTED` and this command is its most plausible accidental caller —
 * a sweep that made it would settle a case against a provider that no
 * administrator ever read. `SweptOutcome` cannot even name that reason.
 *
 * The status is read here, once, because it is the only place the *which
 * clock* still exists: every one of those windows is stamped onto the same
 * `expiresAt` column by the hop that enters the status, so the column says
 * when and the status says which. Reading it does not move the transition
 * decision out of the aggregate — `expire` and `cancel` still refuse (by
 * no-op) anything they do not govern, and the identity check below is what
 * this command actually acts on.
 *
 * **Idempotency is the aggregate's decision, not this command's.** `expire`
 * and `cancel` return the very same instance back from a status they do not
 * govern — a booking that already paid, or that an earlier sweep run
 * already ended, is left alone. That identity, read below with `===`, is
 * what decides whether anything gets saved, released, or announced. The
 * three transitions the later arms reach — `reminded`, `markDone`,
 * `complete` — throw instead, and are none the worse for it: each is only
 * ever called from inside a `case` that just read the one status it governs,
 * and the write that follows is guarded by the compare-and-swap below.
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
 * claims it. Releasing is part of all three of the endings that run before
 * the work, not only the two that expire: `EXPIRED` and `CANCELLED` are both
 * outside `SLOT_HOLDING_STATUSES`. The two later arms release nothing at
 * all, and neither does the asking — by the time any of them fires the
 * appointment is already over, so there is no calendar left to free. One transaction makes that window
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
    private readonly raiseNotification: RaiseNotificationInternalPort,
    /**
     * The two commands this sweep drives rather than duplicating — the same
     * relationship `ChargeBookingCommand` has with `MarkBookingPaidCommand`,
     * and for the same reason written there: each already owns its hop's
     * compare-and-swap, its history reason, its event and its notifications,
     * and a second implementation of any of those is a second place for them
     * to be wrong.
     */
    private readonly markBookingDone: MarkBookingDoneCommand,
    private readonly completeBooking: CompleteBookingCommand,
    /**
     * Who to tell when the platform had to close a booking alone. Only the
     * seven-day arm reads it; every other outcome leaves it untouched.
     */
    private readonly adminUsers: AdminUserReaderPort,
  ) {}

  /**
   * Returns what this run decided, or `null` when it decided nothing — a
   * status no clock governs, or a race lost to somebody who moved the row
   * first. `SweepDueBookingsInternalCommand` ignores the value and counts a
   * booking as swept whenever this resolves; the tests read it, because the
   * reason is the only thing that separates five outcomes sharing three
   * statuses.
   */
  async execute(input: SweepBookingInput): Promise<SweptOutcome | null> {
    // Computed once, before the transition — the instant this sweep run
    // reached this booking, not the instant its deadline actually passed.
    // Those differ by up to the sweep interval; if that difference ever
    // matters to a report, the real deadline is already on the row as
    // `expiresAt` and belongs in the event payload, not here.
    const at = new Date();

    const decision = await this.unitOfWork.atomicExecute(async (): Promise<SweepDecision | null> => {
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
      // Narrowed to the two closed unions rather than `string`, so nothing
      // here can hand `appendChange` a token no vocabulary declares — even
      // though the column itself is `text` and legitimately holds a
      // provider's own free-text decline reason too.
      let changeReason: BookingExpiredReason | BookingCancelledReason;

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
        // The two expiry branches name their clock **once**, in `clock`, and
        // derive both the event field and the history reason from that one
        // name. Writing the clock twice — once into the payload, once into a
        // lookup — would be two places for the same fact to disagree, which
        // is exactly what `EXPIRED_REASON_BY_CLOCK` exists to prevent.
        case "DRAFT": {
          const clock: BookingExpiredClock = "checkout_hold";
          moved = booking.expire(at);
          announcement = new BookingExpired({
            bookingId,
            customerId: booking.customerId,
            providerMemberId: booking.providerMemberId,
            startsAt: booking.startsAt,
            cause: clock,
          });
          changeReason = EXPIRED_REASON_BY_CLOCK[clock];
          break;
        }

        case "AWAITING_PROVIDER": {
          const clock: BookingExpiredClock = "provider_response";
          moved = booking.expire(at);
          announcement = new BookingExpired({
            bookingId,
            customerId: booking.customerId,
            providerMemberId: booking.providerMemberId,
            startsAt: booking.startsAt,
            cause: clock,
          });
          changeReason = EXPIRED_REASON_BY_CLOCK[clock];
          break;
        }

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

        case "CONFIRMED": {
          // **The first firing is a question, not a transition.** The
          // appointment is over and nobody closed the booking, so the platform
          // asks the provider to and pushes its own clock out seven days.
          // `remindedAt` is what tells this firing from the next one, and it
          // is why `Booking.reminded` throws rather than shrugging: a hop that
          // quietly no-opped would leave the row unable to say it had already
          // asked, and the platform would ask for ever.
          //
          // Written out here rather than through the shared tail below,
          // because two of that tail's three steps are wrong for this hop.
          // Nothing is released — the booking still holds its own (long past)
          // slot legitimately, and it is not ending. Nothing is published —
          // no consumer outside this context acts on the platform having
          // asked a question, and an event nobody reads is a promise this
          // context would then have to keep.
          if (booking.remindedAt !== null) {
            // Asked, and a week of silence later. The closing itself belongs
            // to `MarkBookingDoneCommand`, after this transaction — see
            // `SweepDecision`.
            return { kind: "handOver", to: "mark_done" };
          }

          const asked = booking.reminded(
            at,
            new Date(at.getTime() + ASK_AGAIN_AFTER_DAYS * DAY_MS),
          );

          const askApplied = await this.repo.save(asked, booking.status);
          if (!askApplied) {
            // The provider closed it themselves in the moment between this
            // read and this write — the very race the whole question exists
            // to invite. Nothing to record and nobody to ask.
            return null;
          }

          // `reminded_at` on the row remembers only the first question, by
          // design; this row is what makes the whole exchange — every asking
          // and every "ainda a decorrer" answering it — readable afterwards.
          // Null actor because nobody did it: a deadline passed.
          await this.repo.appendChange({
            bookingId,
            changedByUserId: null,
            reason: CLOSE_REMINDER,
            previousStartsAt: null,
            previousEndsAt: null,
            previousProviderMemberId: null,
            previousPriceMinor: null,
          });

          return { kind: "swept", moved: asked, reason: CLOSE_REMINDER };
        }

        case "MARKED_DONE":
          // The customer's window closed with nothing said, so the completion
          // stands. `CompleteBookingCommand` owns the hop, after this
          // transaction — see `SweepDecision`.
          //
          // **A booking that was already `MARKED_DONE` before migration 0038
          // arrives here at once, and that is the intended outcome rather
          // than a bug to guard against.** That migration backfilled
          // `expires_at` for `CONFIRMED` rows and deliberately not for these,
          // so an old marked-done row still carries the payment deadline
          // `accept` wrote, long past, and the first sweep to reach it
          // completes it on the spot. A booking somebody said was finished
          // months ago, that no customer ever disputed, is finished.
          return { kind: "handOver", to: "complete" };

        default:
          // No clock governs where this booking is now: the sweep selected
          // it on a deadline and it moved on before this call reached it.
          // The ordinary race, answered the same way the aggregate answers
          // it — silently, with nothing written.
          return null;
      }

      if (moved === booking) {
        // The aggregate says nothing happened by handing back the instance
        // it was given. It has the last word even where the switch above
        // expected a transition: releasing this booking's hold would hand
        // away a slot somebody may still be holding.
        return null;
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
        return null;
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

      return { kind: "swept", moved, reason: changeReason };
    });

    if (!decision) {
      return null;
    }

    // **The hand-over happens here, outside the transaction, and the position
    // is the whole point.** Both commands announce after their own
    // `atomicExecute` resolves; driven from inside this one they would be
    // announcing inside it, and BR-P6 — nothing told to anybody that a
    // rollback could still take back — would be broken by construction. Each
    // opens a transaction of its own, re-reads the row and guards its write
    // with its own compare-and-swap, so the gap this leaves is the ordinary
    // race every other arm here already answers by returning `null`.
    const outcome =
      decision.kind === "swept" ? decision : await this.handOver(decision.to, input.bookingId);

    if (!outcome) {
      return null;
    }

    // **Who hears about each outcome, decided in one place.**
    //
    // A `switch` rather than a chain of `if`s, and closed over
    // `SweptOutcome["reason"]` rather than over `string`: a sixth outcome
    // added without saying who is told about it is a compile error in the
    // `default` arm below, not a booking that silently ends with nobody
    // hearing. Same gate as `EXPIRED_REASON_BY_CLOCK`'s total `Record`, one
    // question further on — that one asks what an ending *means*, this one
    // asks who it is *for*.
    //
    // Every raise is `raiseQuietly` and every one is after the transaction,
    // per BR-P6: this runs inside a cron sweep, and a throw here would count
    // a booking the sweep really did settle as `failed` in the wave's tally.
    switch (outcome.reason) {
      case CUSTOMER_DID_NOT_PAY:
        // The one of the three original endings that costs somebody
        // something. The provider accepted, blocked their Saturday, and the
        // customer never paid — the platform's own ordering is what took the
        // slot back, and a provider whose calendar empties without a word is
        // exactly the failure this notification exists for.
        await raiseQuietly(
          this.raiseNotification,
          {
            type: NotificationType.ProviderBookingCancelledByCustomer,
            audience: "provider",
            providerId: outcome.moved.providerId,
            payload: {
              bookingId: input.bookingId,
              serviceName: outcome.moved.serviceName,
              startsAt: outcome.moved.startsAt.toISOString(),
              reason: CUSTOMER_DID_NOT_PAY,
            },
          },
          input.bookingId,
        );
        break;

      case CLOSE_REMINDER:
        // The question itself. Only the provider hears it: the customer has
        // nothing to do with a booking still being open, and telling them the
        // platform is chasing their electrician would be news about somebody
        // else's admin. `closeBy` is the half that matters — a provider asked
        // to close a booking and not told what happens if they do not has
        // been asked for a favour rather than given a deadline.
        await raiseQuietly(
          this.raiseNotification,
          {
            type: NotificationType.ProviderBookingCloseReminder,
            audience: "provider",
            providerId: outcome.moved.providerId,
            payload: {
              bookingId: input.bookingId,
              serviceName: outcome.moved.serviceName,
              startsAt: outcome.moved.startsAt.toISOString(),
              // Never null here: `reminded` just wrote it.
              closeBy: (outcome.moved.expiresAt as Date).toISOString(),
            },
          },
          input.bookingId,
        );
        break;

      case MARKED_DONE_BY_PLATFORM:
        // **Only the administrators, and that is not an oversight.**
        // `MarkBookingDoneCommand`'s platform arm has already told the
        // customer their window is open and told the provider the platform
        // closed the booking for them. Raising either of those again here
        // would send the provider two notifications for one closing.
        await this.tellAdministrators(outcome.moved, input.bookingId);
        break;

      case FEEDBACK_WINDOW_CLOSED:
      case "checkout_hold_expired":
      case "provider_did_not_respond":
      case "superseded_by_new_draft":
        // Nobody, for four different reasons.
        //
        // `feedback_window_closed` is the one that looks like an omission and
        // is not: `CompleteBookingCommand` already tells the customer and the
        // provider that the booking is finished, so a raise here would be the
        // same double-announcement the arm above avoids.
        //
        // A `DRAFT` past its checkout hold has nobody to tell but the
        // customer who walked away from their own checkout. An
        // `AWAITING_PROVIDER` past the provider's window does owe the
        // customer a word, and the type for it is still not one this phase
        // adds — see the design's three-row table above.
        // `superseded_by_new_draft` cannot reach this switch at all: it is
        // `CreateBookingCommand`'s to write, and no deadline produces it.
        break;

      default: {
        // Unreachable: the union above is closed and every member has an arm.
        // The annotation is the gate — a new outcome reason fails to narrow
        // to `never` here, which is a compile error until somebody says who
        // it is for. Logged rather than thrown so that, if it ever did
        // happen, a booking that really did move would not be reported as a
        // failure by the wave that moved it.
        const unhandled: never = outcome.reason;
        console.error("[booking] swept an outcome nobody is told about", {
          bookingId: input.bookingId,
          reason: unhandled,
        });
      }
    }

    return outcome;
  }

  /**
   * Run the command that owns this hop, and report what it actually did.
   *
   * `null` back means that command's own compare-and-swap lost — a provider
   * pressing "Concluído" a moment before the seven days ran out, a customer
   * disputing in the last second of their window — and this sweep then
   * announces nothing at all. Without the answer, the administrators would be
   * told the platform had to close a booking alone that its provider had in
   * fact just closed themselves.
   *
   * `requesterUserId: null` and `changedByUserId: null` are what say a cron
   * invocation did this: no human is involved, so the history row names
   * nobody (see `BookingChangeRecord.changedByUserId`) and no membership is
   * checked, because there is nobody to check. The reason is hardcoded on
   * both calls rather than passed through from anywhere — nothing outside
   * this process can put a token into either.
   */
  private async handOver(to: HandOver, bookingId: string): Promise<SweptOutcome | null> {
    if (to === "mark_done") {
      const moved = await this.markBookingDone.execute({
        bookingId,
        requesterUserId: null,
        reason: MARKED_DONE_BY_PLATFORM,
      });
      return moved === null ? null : { moved, reason: MARKED_DONE_BY_PLATFORM };
    }

    const moved = await this.completeBooking.execute({
      bookingId,
      reason: COMPLETED_BY_TIMER,
      changedByUserId: null,
    });
    return moved === null ? null : { moved, reason: FEEDBACK_WINDOW_CLOSED };
  }

  /**
   * One notification per administrator, each in its own `raiseQuietly`.
   *
   * The administrators are the only audience for this arm that is not a party
   * to the booking, and the reason they are told at all is that an
   * auto-closed booking is a symptom: a provider who does not answer is one
   * the platform may need to talk to. The admin queue shows it regardless of
   * whether anybody could be reached here.
   *
   * **Reading the list is allowed to fail, and failing tells nobody rather
   * than undoing the close.** The booking has already committed by the time
   * this runs, so the only thing an exception could cost is the
   * announcement — and letting it out would count a settled booking as
   * `failed` in the sweep's tally. Same posture, and the same `console.error`
   * for the same reason, as Communication's own admin fan-out: a cron
   * invocation sets no request scope for `getRequestScopedLogger()` to read.
   *
   * An empty list is not an error. A platform with no administrators closes
   * the booking and tells nobody, which is the honest outcome.
   */
  private async tellAdministrators(moved: Booking, bookingId: string): Promise<void> {
    let adminIds: string[];
    try {
      adminIds = await this.adminUsers.findAdminUserIds();
    } catch (error) {
      console.error("[booking] could not list administrators for an auto-closed booking", {
        bookingId,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    for (const userId of adminIds) {
      await raiseQuietly(
        this.raiseNotification,
        {
          type: NotificationType.AdminBookingAutoClosed,
          audience: "user",
          userId,
          payload: {
            bookingId,
            serviceName: moved.serviceName,
            // The provider, by id and by name: an administrator reading this
            // needs to reach whoever stopped answering, and the id is what
            // the admin queue filters on.
            providerId: moved.providerId,
            providerName: moved.providerName,
          },
        },
        bookingId,
      );
    }
  }
}
