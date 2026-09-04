import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import type { Booking } from "../../domain/aggregates/booking.aggregate";
import { BookingMarkedDone } from "../../domain/events";
import { BookingNotFoundError, NotProviderMemberError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { ProviderMemberReaderPort } from "../ports/outbound/provider-member-reader.port";
import {
  raiseQuietly,
  type RaiseNotificationInternalPort,
} from "../ports/outbound/raise-notification.port";

/**
 * How long the customer has to answer once the work is said to be done.
 *
 * A constant rather than a `platform_settings` column, unlike the three
 * windows `CreateBookingCommand`, `SubmitBookingCommand` and
 * `AcceptBookingCommand` read live. Those three protect a *slot* and are
 * genuinely operational — an administrator shortening the checkout hold on a
 * busy Saturday is a real thing to want. This one is a promise made to the
 * customer in the message this command sends them, and a promise whose length
 * an administrator can change between the sending and the expiring is not one.
 *
 * Exported because the hop that closes the window has to agree with the hop
 * that opened it. `close-booking.command.test.ts` pins the number both ways:
 * directly, and through a literal deadline asserted against a frozen clock —
 * deliberately *not* by re-deriving the expected instant from this constant,
 * which is an assertion that can only ever prove the multiplication.
 */
export const FEEDBACK_WINDOW_DAYS = 3;

/**
 * How long the platform waits for an answer before closing a booking itself.
 *
 * Declared here rather than beside `KeepBookingOpenCommand`, which is its
 * busiest reader, because this is the number the *asking* is measured in:
 * the sweep stamps it when it first asks the provider to close a booking,
 * `keepOpen` re-stamps the same seven days each time they answer "still
 * going", and when it finally runs out with no answer it is this command's
 * `marked_done_by_platform` arm that fires. One constant, one meaning — "how
 * long the platform gives a provider to answer" — and every hop that touches
 * that clock reads it from the file that acts when it expires.
 */
export const ASK_AGAIN_AFTER_DAYS = 7;

/**
 * A day, in milliseconds. Exported alongside the two windows it multiplies,
 * so `KeepBookingOpenCommand` — which already imports `ASK_AGAIN_AFTER_DAYS`
 * from here — reads the same number rather than keeping a second copy of it.
 */
export const DAY_MS = 86_400_000;

/**
 * What `booking_change.reason` records for this hop — which of the three
 * people entitled to say "the work is done" actually said it.
 *
 * Machine tokens, not sentences, the same contract `BookingExpiredReason` and
 * `ACCEPTED_BY_PROVIDER` keep and for the same reason: a booking's history is
 * rendered into eight locales, and a locale key can be switched on where
 * English prose can only be shown verbatim.
 *
 * A closed union rather than loose strings, and declared *here*, beside its
 * producer, rather than on `BookingMarkedDone`. That placement is the rule
 * `SweepBookingCommand` already wrote down: a reason that rides on an event
 * is owned by the event, and a reason that does not is owned by the command
 * that writes it. Nothing outside this context behaves differently for a
 * provider's claim than for the platform's — see `BookingMarkedDone`'s own
 * doc comment — so this vocabulary never leaves the row it is written to,
 * and `domain/` is spared a type it would have no use for.
 */
export type MarkDoneReason =
  | "marked_done_by_provider"
  | "marked_done_by_admin"
  | "marked_done_by_platform";

export interface MarkBookingDoneInput {
  bookingId: string;
  /** Null when the platform is closing it on nobody's behalf. */
  requesterUserId: string | null;
  reason?: MarkDoneReason;
}

/**
 * The provider says the work is done — or an administrator, or the platform
 * after seven days of silence. One command for all three because the hop is
 * the same hop; only who asked for it differs, and that difference is a
 * `booking_change` reason, not a second code path.
 *
 * **The membership check covers the provider's own hop and no other, and the
 * asymmetry is deliberate.** A member pressing "Concluído" is the only caller
 * whose right to close this booking rests on belonging to its provider, so
 * that is the only caller `ProviderMemberReaderPort` is asked about — and the
 * error is `NotProviderMemberError`, the one `AcceptBookingCommand` and
 * `DeclineBookingCommand` already throw, not a new one saying the same thing
 * a third way. The other two arms are authorised somewhere this command
 * cannot see: the sweep runs from a cron invocation with no user at all
 * (`requesterUserId: null`, and there is nobody to look up), and an
 * administrator is an administrator by virtue of the edge that let them in,
 * not by virtue of belonging to the provider they are closing for — checking
 * membership on them would refuse every administrator on the platform. A
 * caller cannot promote itself past the check by claiming a reason, either:
 * the two exempt reasons are reachable only from inside the process, since
 * nothing maps a client's input onto them.
 *
 * **The deadline is computed here, not in the aggregate**, for the same
 * reason `AcceptBookingCommand` computes `payBy`: `Booking.markDone` takes
 * its deadline as an argument because `domain/` reaches for no configuration
 * of any kind. See `FEEDBACK_WINDOW_DAYS` above for why that configuration is
 * a constant here where the earlier three windows are settings rows.
 *
 * **This command uses the compare-and-swap**, and the race is real rather
 * than theoretical: the sweep's seven-day arm and the provider's own button
 * watch the same booking from opposite sides, exactly as the payment webhook
 * and the deadline sweep do (see `BookingRepositoryPort.save`). `false` back
 * means the other one won, and this call returns without appending, without
 * publishing and without announcing — the acknowledgement it would be
 * sending is the other writer's, not this one's.
 *
 * **Both raises happen after the transaction resolves, and only on the
 * applied path.** BR-P6, in the same place and for the same reasons every
 * other command in this directory puts it there: nothing is announced that a
 * rollback could take back, and `raiseQuietly` keeps a provider who closed
 * their booking from being told it failed because an email adapter hiccupped.
 */
export class MarkBookingDoneCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly providerMemberReader: ProviderMemberReaderPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: MarkBookingDoneInput): Promise<void> {
    // Computed once, before the transition — the instant this command ran.
    const at = new Date();
    // A null requester is nobody, and nobody is the platform. Defaulting a
    // null requester to `marked_done_by_provider` — which is what a single
    // `?? "marked_done_by_provider"` does — would write a history row saying
    // the provider claimed the work was done with no provider having claimed
    // it, and would then skip the auto-closed notification that arm owes
    // them. There is no caller that reaches this branch today; the point is
    // that the dishonest row cannot be produced at all.
    const reason: MarkDoneReason =
      input.reason ??
      (input.requesterUserId === null ? "marked_done_by_platform" : "marked_done_by_provider");

    const moved = await this.unitOfWork.atomicExecute(async (): Promise<Booking | null> => {
      const booking = await this.repo.findById(input.bookingId);
      if (!booking) {
        throw new BookingNotFoundError(input.bookingId);
      }

      // The platform and an administrator answer to a different check than a
      // member does; `requesterUserId` null is the sweep, which asked nobody.
      // See this class's own doc comment for why that is not a hole.
      if (input.requesterUserId !== null && reason === "marked_done_by_provider") {
        const isMember = await this.providerMemberReader.isMember(
          booking.providerId,
          input.requesterUserId,
        );
        if (!isMember) {
          throw new NotProviderMemberError();
        }
      }

      const next = booking.markDone(at, new Date(at.getTime() + FEEDBACK_WINDOW_DAYS * DAY_MS));

      const applied = await this.repo.save(next, booking.status);
      if (!applied) {
        // The row no longer holds the status this read saw. `next` describes
        // a world that no longer exists; writing history for it, publishing
        // it, or telling the customer their window is open would all be
        // reporting a hop that never happened.
        return null;
      }

      // Who closed it, and when — the fact `booking.markedDoneAt` cannot
      // hold. For an Organization with several members this row is the only
      // place that could ever name which of them, and for the sweep's arm
      // `changedByUserId` is null, which is this table's own way of saying
      // no human did it (see `BookingChangeRecord.changedByUserId`).
      //
      // Every `previous*` field is null because this hop moved none of them:
      // it changed the status and a deadline, and both live on the booking.
      await this.repo.appendChange({
        bookingId: input.bookingId,
        changedByUserId: input.requesterUserId,
        reason,
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      });

      await this.outboxPort.publish(
        [
          new BookingMarkedDone({
            bookingId: input.bookingId,
            customerId: next.customerId,
            providerId: next.providerId,
            // Never null here: `markDone` just wrote it.
            feedbackBy: next.expiresAt as Date,
          }),
        ],
        "booking",
      );

      return next;
    });

    if (!moved) {
      return;
    }

    // `feedbackBy` is the point of this one. A customer told the work is
    // finished and not told how long they have to say otherwise has been
    // given half the message — and the half that matters is the clock.
    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.BookingMarkedDone,
        audience: "user",
        userId: moved.customerId,
        payload: {
          bookingId: input.bookingId,
          serviceName: moved.serviceName,
          providerName: moved.providerName,
          feedbackBy: moved.expiresAt?.toISOString() ?? null,
          markedBy: reason,
        },
      },
      input.bookingId,
    );

    // Only the platform's own arm tells the provider anything. On the other
    // two somebody deliberately closed this booking seconds ago — the
    // provider from their own screen, or an administrator who is presumably
    // talking to them — and a notification announcing what they just did
    // would be noise. Here nobody acted: the provider was asked, said
    // nothing for seven days, and is owed the news that the platform closed
    // it without them.
    if (reason === "marked_done_by_platform") {
      await raiseQuietly(
        this.raiseNotification,
        {
          type: NotificationType.ProviderBookingAutoClosed,
          audience: "provider",
          providerId: moved.providerId,
          payload: { bookingId: input.bookingId, serviceName: moved.serviceName },
        },
        input.bookingId,
      );
    }
  }
}
