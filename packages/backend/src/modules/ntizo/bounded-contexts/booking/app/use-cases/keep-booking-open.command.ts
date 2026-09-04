import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type { Booking } from "../../domain/aggregates/booking.aggregate";
import { BookingKeptOpen } from "../../domain/events";
import { BookingNotFoundError, NotProviderMemberError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { ProviderMemberReaderPort } from "../ports/outbound/provider-member-reader.port";
import { ASK_AGAIN_AFTER_DAYS, DAY_MS } from "./mark-booking-done.command";

/**
 * What `booking_change.reason` records for this hop.
 *
 * A machine token, not a sentence — the same contract every other reason in
 * this directory keeps, and for the same reason: a booking's history is
 * rendered into eight locales, and a locale key can be switched on where
 * English prose can only be shown verbatim.
 *
 * Named for the job, not for the button. "Ainda em curso" is what the
 * provider taps; `still_ongoing` is what happened to the work. Whoever
 * renders this booking's history months from now is told something by the
 * second and nothing at all by the first.
 */
const STILL_ONGOING = "still_ongoing";

export interface KeepBookingOpenInput {
  bookingId: string;
  /** From `requireUser` at the GraphQL layer, never from the client. */
  requesterUserId: string;
}

/**
 * "Still going." The job outran its slot — ordinary for the trades this
 * platform serves — so the provider pushes the platform's question out rather
 * than being asked again tomorrow, or closed for them in seven days on a
 * claim nobody made.
 *
 * **Membership is required, with no exempt arm.** Unlike
 * `MarkBookingDoneCommand`, which the sweep and an administrator also drive,
 * this hop has exactly one caller: a member of the booking's own provider,
 * answering a question the platform asked them. Nobody else is in a position
 * to know whether a wall is finished — that is the whole argument of
 * `Booking.keepOpen` — so there is no reason here that could exempt anybody,
 * and `requesterUserId` is not nullable. The error is
 * `NotProviderMemberError`, the same one every other authorised hop in this
 * context throws rather than a fourth way of saying it.
 *
 * **It takes no notification port, and that absence is the design.** The
 * provider answered the platform; the platform is not a third party who has
 * to be told, and the customer already knows the work is still going on,
 * because they are standing next to it. `CreateBookingCommand` is built the
 * same way for the same reason — a command that announces nothing does not
 * take a port to announce with, because a dependency that is never called
 * lies about what the command does.
 *
 * **It does publish, though the status never moves.** `CONFIRMED` before,
 * `CONFIRMED` after: the only thing this hop changes on the row is a
 * deadline. The event is still the right shape for it, because "this job is
 * running longer than it was sold for" is a fact about the booking that
 * outlives this context — the same argument `BookingSubmitted`'s own doc
 * comment makes for carrying fields no consumer has asked for yet, since a
 * consumer that has to read the booking back to learn what an event could
 * have told it is the thing this codebase does not want.
 *
 * **The `booking_change` row is the other half, and it is not a duplicate of
 * the event.** This hop is repeatable by design, and `booking` keeps no "kept
 * open at" column — nor should it, since one column remembers only the last
 * push where this table remembers every one. A wall pushed out four times
 * leaves four rows saying so, which is what makes an overrun visible at all.
 *
 * **The compare-and-swap stays**, even though this hop lands on the status it
 * started from. `save`'s predicate is what stops this write from silently
 * overwriting a concurrent one: the sweep's own seven-day arm can mark this
 * very booking done in the moment between this command's read and its write,
 * and without the guard a `keepOpen` would put a `MARKED_DONE` booking back
 * to `CONFIRMED` and hand it a fresh week. `false` back means exactly that
 * happened, and this call returns without writing history — or an event — for
 * a hop that never landed.
 */
export class KeepBookingOpenCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly providerMemberReader: ProviderMemberReaderPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(input: KeepBookingOpenInput): Promise<void> {
    // Computed once, before the transition — the instant this command ran.
    const at = new Date();

    await this.unitOfWork.atomicExecute(async (): Promise<Booking | null> => {
      const booking = await this.repo.findById(input.bookingId);
      if (!booking) {
        throw new BookingNotFoundError(input.bookingId);
      }

      // Checked before anything else runs and before anything is written,
      // the same shape `AcceptBookingCommand` uses.
      const isMember = await this.providerMemberReader.isMember(
        booking.providerId,
        input.requesterUserId,
      );
      if (!isMember) {
        throw new NotProviderMemberError();
      }

      const askAgainAt = new Date(at.getTime() + ASK_AGAIN_AFTER_DAYS * DAY_MS);
      const next = booking.keepOpen(at, askAgainAt);

      const applied = await this.repo.save(next, booking.status);
      if (!applied) {
        return null;
      }

      // Which member said the job was still running, and when — deliberately
      // leaving `remindedAt` alone, as `Booking.keepOpen` does, so the row
      // still says when the conversation started rather than when it was
      // last continued.
      //
      // Every `previous*` field is null because this hop moved none of them:
      // it moved a deadline, and the deadline lives on the booking.
      await this.repo.appendChange({
        bookingId: input.bookingId,
        changedByUserId: input.requesterUserId,
        reason: STILL_ONGOING,
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      });

      await this.outboxPort.publish(
        [
          new BookingKeptOpen({
            bookingId: input.bookingId,
            customerId: next.customerId,
            providerId: next.providerId,
            askAgainAt,
          }),
        ],
        "booking",
      );

      return next;
    });
  }
}
