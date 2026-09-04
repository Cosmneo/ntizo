import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import type { Booking } from "../../domain/aggregates/booking.aggregate";
import { BookingAccepted } from "../../domain/events";
import { BookingNotFoundError, NotProviderMemberError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import { cappedToSlotStart } from "./capped-to-slot-start";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { DelayedJobsPort } from "../ports/outbound/delayed-jobs.port";
import type { PlatformSettingsReaderPort } from "../ports/outbound/platform-settings.reader.port";
import type { ProviderMemberReaderPort } from "../ports/outbound/provider-member-reader.port";
import {
  raiseQuietly,
  type RaiseNotificationInternalPort,
} from "../ports/outbound/raise-notification.port";

export interface AcceptBookingInput {
  bookingId: string;
  /** From `requireUser` at the GraphQL layer, never from the client. */
  requesterUserId: string;
}

/**
 * What `booking_change.reason` records for this hop.
 *
 * A machine token, not a sentence — the same contract
 * `DeclineBookingCommand`'s `DECLINED_WITHOUT_REASON` and
 * `SweepBookingCommand`'s `BookingExpiredReason` keep, and for the same
 * reason: whatever renders a booking's history renders it into eight locales,
 * and a locale key can be switched on where English prose can only be shown
 * verbatim.
 *
 * The mirror of `declined_without_reason`: a decline is fully attributable
 * today and the acceptance it answers was not. There is no free-text variant
 * of this one — a provider saying yes has nothing to explain, and the whole
 * content of the row is who committed the calendar and when.
 */
const ACCEPTED_BY_PROVIDER = "accepted_by_provider";

/**
 * What the transaction below hands back when it really did accept: the
 * deadline it stamped, and the booking it stamped it on.
 *
 * The deadline alone used to be enough, because scheduling a job was all
 * that happened afterwards. Telling the customer needs the customer, the
 * service and the price, and re-reading the row outside the transaction to
 * find them would be a second read that could disagree with the write — so
 * the aggregate travels out with the date instead. `null` still means the
 * same thing it always did: the compare-and-swap lost, and nothing happened.
 */
type AcceptOutcome = { payBy: Date; moved: Booking };

/**
 * The provider says yes: `AWAITING_PROVIDER` becomes `PENDING_PAYMENT`, and
 * the customer's payment window starts.
 *
 * **Authorisation is the point of this command.** Only a member of the
 * booking's own provider may accept it — `ProviderMemberReaderPort.isMember`
 * is checked immediately after the booking is read, before anything else
 * runs, and before anything is written. A caller who is not a member is
 * refused with `NotProviderMemberError` and this command writes nothing:
 * no `save`, no `appendChange`, no publish, no scheduled job. Everything
 * past that check is mechanical — a compare-and-swap and an event, the
 * same shape every other command in this file uses.
 *
 * **This command writes a `booking_change` row, and it is the one hop that
 * most needs one.** `booking.confirmedAt` says the provider said yes and
 * *when*; nothing on the row says *who*. For an Organization with several
 * members, `booking_change.changed_by_user_id` is the only place that could
 * ever name the member who committed the calendar — and under the reversal,
 * accepting is exactly where a provider commits their Saturday.
 * `DeclineBookingCommand` already records its hop, so leaving this one out
 * makes a decline fully attributable and the acceptance it mirrors not.
 * `changedByUserId` is the member `ProviderMemberReaderPort` just authorised.
 * Same ordering the other commands use — save, then append, then publish
 * (there is no hold to release here: `PENDING_PAYMENT` still holds the slot).
 *
 * **`payBy` is computed here, from `payment_window_minutes`, because
 * `Booking.accept` cannot read it.** The aggregate has no way to reach
 * `platform_settings` — see `Booking.accept`'s own doc comment — so this
 * command reads the window fresh, on every call: an administrator's change
 * reaches the very next acceptance, and a booking already accepted keeps
 * the deadline it was given regardless of what this returns afterward. It is
 * then **capped at the slot's own start** — a payment window running past
 * `startsAt` would have the charge sweep pushing an M-Pesa prompt for work
 * whose time has already passed. See `cappedToSlotStart` for the full
 * argument, and for why a slot accepted at short notice getting a short
 * window is honest rather than a bug.
 *
 * **This command uses the compare-and-swap.** `save(booking, expectedStatus)`
 * only writes if the row is still at the status this command's own read
 * saw — see `BookingRepositoryPort.save`'s own comment for the mechanism.
 * Two members of the same provider hitting "Aceitar" at the same moment is
 * the ordinary case this exists for, not an exotic one: both reads see
 * `AWAITING_PROVIDER`, both compute a real transition — `Booking.accept`
 * has no no-op story of its own for an unexpected status (see its own doc
 * comment: it raises rather than absorbs) — so the write is where this race
 * is actually settled. `false` back means the other member won it, and this
 * command returns without publishing, without scheduling a job, and
 * without throwing, the same outcome `MarkBookingPaidCommand` and
 * `SweepBookingCommand` reach through the aggregate's own no-op path,
 * reached here through the repository's guard instead.
 *
 * **`scheduleBookingDeadline` is called after the transaction resolves, with
 * `payBy`** — mirroring `CreateBookingCommand`'s own discipline. `payBy`
 * comes back `null` from `atomicExecute` exactly when nothing happened (a
 * losing compare-and-swap), so nothing gets scheduled for a transition that
 * never landed.
 */
export class AcceptBookingCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly providerMemberReader: ProviderMemberReaderPort,
    private readonly platformSettingsReader: PlatformSettingsReaderPort,
    private readonly delayedJobs: DelayedJobsPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: AcceptBookingInput): Promise<void> {
    // Computed once, before the transition — the instant this command ran.
    const at = new Date();

    const result = await this.unitOfWork.atomicExecute(async (): Promise<AcceptOutcome | null> => {
      const booking = await this.repo.findById(input.bookingId);
      if (!booking) {
        throw new BookingNotFoundError(input.bookingId);
      }

      // The point of this command. Checked before anything else runs, and
      // before anything is written — see this class's own doc comment.
      const isMember = await this.providerMemberReader.isMember(
        booking.providerId,
        input.requesterUserId,
      );
      if (!isMember) {
        throw new NotProviderMemberError();
      }

      // LIVE: read fresh on every call, per this class's own doc comment,
      // then held to the slot it protects — a payment window outliving
      // `startsAt` would keep a slot held, and a charge chasing a customer,
      // for a service that was already due.
      const paymentWindowMinutes = await this.platformSettingsReader.findPaymentWindowMinutes();
      const payByDeadline = cappedToSlotStart(
        new Date(at.getTime() + paymentWindowMinutes * 60_000),
        booking.startsAt,
      );

      const moved = booking.accept(at, payByDeadline);

      const applied = await this.repo.save(moved, booking.status);
      if (!applied) {
        // The row no longer holds the status this read saw. `moved`
        // describes a world that no longer exists; saving it would
        // silently overwrite whatever the concurrent writer just
        // committed, and scheduling a job against its deadline would be
        // scheduling one for a transition that never happened.
        return null;
      }

      // Never null here: `moved` was loaded through `findById`, which only
      // ever returns a booking the database already assigned an id to.
      const bookingId = moved.id as string;

      // Which member committed this calendar, and when — the fact `booking`
      // has nowhere to put and this table exists for. Written before anything
      // is announced so it survives a consumer that never runs, the same
      // argument `SweepBookingCommand` makes for each of its own endings.
      //
      // Every `previous*` field is null because this hop moved none of them:
      // it changed the status, and the status is on the booking, not here.
      await this.repo.appendChange({
        bookingId,
        changedByUserId: input.requesterUserId,
        reason: ACCEPTED_BY_PROVIDER,
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      });

      await this.outboxPort.publish(
        [
          new BookingAccepted({
            bookingId,
            customerId: moved.customerId,
            providerId: moved.providerId,
            priceMinor: moved.priceMinor,
            currency: moved.currency,
          }),
        ],
        "booking",
      );

      return { payBy: payByDeadline, moved };
    });

    // Scheduled after the transaction resolves, not inside it — the same
    // reason `CreateBookingCommand` schedules its own job outside its own
    // `atomicExecute`: a job queued for a write that then rolled back, or
    // that lost the compare-and-swap above, would be a job for nothing.
    if (result) {
      await this.delayedJobs.scheduleBookingDeadline(input.bookingId, result.payBy);

      // BR-P6, in the same place and for the same reasons as
      // `SubmitBookingCommand`'s: after the transaction resolved, so nothing
      // is announced that a rollback could take back, and inside the applied
      // branch, so a losing compare-and-swap announces nothing — the
      // acceptance it would be reporting is the other member's, not this
      // call's. `raiseQuietly` because a provider who said yes must not be
      // told their acceptance failed over a notification adapter.
      //
      // `payBy` is the point of this one. The customer now has a window and
      // a prompt on its way to their handset; a message that did not say how
      // long they have would be worse than none.
      await raiseQuietly(
        this.raiseNotification,
        {
          type: NotificationType.BookingAccepted,
          audience: "user",
          userId: result.moved.customerId,
          payload: {
            bookingId: input.bookingId,
            serviceName: result.moved.serviceName,
            providerName: result.moved.providerName,
            startsAt: result.moved.startsAt.toISOString(),
            payBy: result.payBy.toISOString(),
            priceMinor: result.moved.priceMinor,
            currency: result.moved.currency,
          },
        },
        input.bookingId,
      );
    }
  }
}
