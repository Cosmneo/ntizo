import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { BookingSubmitted } from "../../domain/events";
import {
  BookingNotFoundError,
  CustomerPhoneMissingError,
  NotBookingCustomerError,
} from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import { cappedToSlotStart } from "./capped-to-slot-start";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { CustomerPhoneReaderPort } from "../ports/outbound/customer-phone.reader.port";
import type { DelayedJobsPort } from "../ports/outbound/delayed-jobs.port";
import type { PlatformSettingsReaderPort } from "../ports/outbound/platform-settings.reader.port";

export interface SubmitBookingInput {
  bookingId: string;
  /** From `requireUser` at the GraphQL layer, never from the client. */
  customerId: string;
  /**
   * What the customer gave on checkout's step 2. Same shape `Booking.submit`
   * takes, and passed straight through to it — this command does not
   * duplicate the aggregate's own blank/missing checks, because a second
   * copy of that rule here is a second place for it to drift from the one
   * `Booking.submit` actually enforces.
   */
  address: {
    label: string;
    line: string;
    city: string;
    district?: string | null;
    directions?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
  /**
   * What the customer wants done, in their own words — checkout's step 3.
   *
   * It travels with the address for the same reason: `booking.create` no
   * longer carries either, because step 1 has neither value to give. Passed
   * straight through to `Booking.submit`, which normalises a blank one to
   * null rather than refusing it.
   */
  description: string | null;
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
 * Named for what happened, and by whom, because that is the whole of what this
 * hop records. There is no free-text alternative here the way there is on a
 * decline: a customer sending their own request has nothing to explain.
 */
const SUBMITTED_BY_CUSTOMER = "submitted_by_customer";

/**
 * The customer finishes the checkout form: `DRAFT` becomes `AWAITING_PROVIDER`,
 * and the provider's response window starts.
 *
 * **Authorisation, Ruling N.** The original brief scoped the authorisation
 * discipline to `AcceptBookingCommand` and `DeclineBookingCommand` and said
 * nothing about this command — an omission, not a decision: submitting
 * somebody else's `DRAFT` starts the provider's two-hour clock and puts a
 * request in their queue the customer never sent. Only the booking's own
 * customer may submit it, checked against `booking.customerId` — already on
 * the row this command reads, no second lookup needed — immediately after
 * `findById` and before anything is written. A caller who is not that
 * customer is refused with `NotBookingCustomerError` and this command writes
 * nothing: no `save`, no publish, no scheduled job.
 *
 * **`respondBy` is computed here, from `provider_response_minutes`, because
 * `Booking.submit` cannot read it.** The aggregate has no way to reach
 * `platform_settings` — see `Booking.submit`'s own doc comment — so this
 * command reads the window fresh, on every call, the same LIVE relationship
 * `CreateBookingCommand` already has with `checkout_hold_minutes`: a change
 * an administrator makes reaches the very next booking to submit, and a
 * booking already submitted keeps the deadline it was given regardless of
 * what this returns afterward. It is then **capped at the slot's own start**
 * — a provider cannot be given until 15:45 to answer for a service that was
 * due at 14:00 — see `cappedToSlotStart` for the full argument, and for why
 * a slot booked at short notice getting a short window is honest rather than
 * a bug.
 *
 * **This command writes a `booking_change` row.** `changedByUserId` is the
 * customer who submitted — the same party the authorisation check above just
 * confirmed. `DeclineBookingCommand` and `SweepBookingCommand` both record
 * their hop, and a hop that is left out reads as an oversight rather than a
 * decision: the row is the only place that says *who* sent this request and
 * *when*, and `booking` carries no column for either. Same ordering the other
 * two use — save, then append, then publish (there is no hold to release
 * here: `AWAITING_PROVIDER` still holds the slot).
 *
 * **This command uses the compare-and-swap.** `save(booking, expectedStatus)`
 * only writes if the row is still at the status this command's own read
 * saw — see `BookingRepositoryPort.save`'s own comment for the mechanism.
 * A double-tap on "Enviar Pedido", or a client retrying a request whose
 * response never arrived, sends two submissions for one booking; both reads
 * see `DRAFT` and both compute a real transition — `Booking.submit` has no
 * no-op story of its own for this (see its own doc comment: an unexpected
 * status is a bug to raise, not a race to absorb), so the write is the only
 * place this race is actually settled. `false` back means the other request
 * won it, and this command returns without publishing, without scheduling a
 * job, and without throwing — the same outcome the aggregate's own no-op
 * path produces in `MarkBookingPaidCommand` and `SweepBookingCommand`,
 * reached here by the repository's guard instead.
 *
 * **`scheduleBookingDeadline` is called after the transaction resolves, with
 * `respondBy`** — mirroring `CreateBookingCommand`'s own discipline of
 * scheduling only once its write has actually committed, against whichever
 * deadline it just stamped rather than a stale one. `respondBy` comes back
 * `null` from `atomicExecute` exactly when nothing happened (a losing
 * compare-and-swap), so nothing gets scheduled for a transition that never
 * landed.
 *
 * **A customer with no phone number on file is refused, before anything else
 * runs.** M-Pesa pushes its payment prompt to a handset rather than to an
 * account, and `profile.phone_number` is nullable with nothing in the
 * platform requiring it — see `CustomerPhoneMissingError` for the failure
 * that gap already produces downstream, and why refusing here rather than at
 * charge time is what makes the number a rule instead of a form convention.
 * The read happens *outside* `atomicExecute`: the refusal needs no
 * transaction, and opening one only to throw it away again is work nobody
 * asked for.
 */
export class SubmitBookingCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly customerPhoneReader: CustomerPhoneReaderPort,
    private readonly platformSettingsReader: PlatformSettingsReaderPort,
    private readonly delayedJobs: DelayedJobsPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(input: SubmitBookingInput): Promise<{ bookingId: string; respondBy: string }> {
    // Computed once, before the transition — the instant this command ran,
    // not some later instant a retry or a delayed write might see.
    const at = new Date();

    // Before the transaction opens, per this class's own doc comment. Blank
    // counts as missing: `profile.phone_number` is `text`, and a column that
    // permits `""` will eventually hold one.
    const phone = await this.customerPhoneReader.findPhoneNumber(input.customerId);
    if (phone == null || phone.trim().length === 0) {
      throw new CustomerPhoneMissingError(input.customerId);
    }

    const respondBy = await this.unitOfWork.atomicExecute(async (): Promise<Date | null> => {
      const booking = await this.repo.findById(input.bookingId);
      if (!booking) {
        throw new BookingNotFoundError(input.bookingId);
      }

      // The point of Ruling N. Checked before anything else runs, and
      // before anything is written — see this class's own doc comment.
      if (booking.customerId !== input.customerId) {
        throw new NotBookingCustomerError();
      }

      // LIVE: read fresh on every call, per this class's own doc comment,
      // then held to the slot it protects — a response window running past
      // `startsAt` would let a provider commit a calendar the service had
      // already been due on.
      const providerResponseMinutes = await this.platformSettingsReader.findProviderResponseMinutes();
      const respondByDeadline = cappedToSlotStart(
        new Date(at.getTime() + providerResponseMinutes * 60_000),
        booking.startsAt,
      );

      const moved = booking.submit(at, respondByDeadline, input.address, input.description);

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

      // The durable record of who sent this request and when, written before
      // anything is announced so it survives a consumer that never runs — the
      // same argument `SweepBookingCommand` makes for its own three endings.
      // `BookingSubmitted` is a message; this is the record.
      //
      // Every `previous*` field is null because this hop moved none of them:
      // it changed the status, and the status is on the booking, not here.
      await this.repo.appendChange({
        bookingId,
        changedByUserId: input.customerId,
        reason: SUBMITTED_BY_CUSTOMER,
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      });

      await this.outboxPort.publish(
        [
          new BookingSubmitted({
            bookingId,
            customerId: moved.customerId,
            providerId: moved.providerId,
            providerMemberId: moved.providerMemberId,
            serviceId: moved.serviceId,
            startsAt: moved.startsAt,
            endsAt: moved.endsAt,
            priceMinor: moved.priceMinor,
            currency: moved.currency,
            respondBy: respondByDeadline,
          }),
        ],
        "booking",
      );

      return respondByDeadline;
    });

    // Scheduled after the transaction resolves, not inside it — the same
    // reason `CreateBookingCommand` schedules its own job outside its own
    // `atomicExecute`: a job queued for a write that then rolled back, or
    // that lost the compare-and-swap above, would be a job for nothing.
    if (respondBy) {
      await this.delayedJobs.scheduleBookingDeadline(input.bookingId, respondBy);
      return { bookingId: input.bookingId, respondBy: respondBy.toISOString() };
    }

    // The losing compare-and-swap still has to answer with a deadline: the
    // caller asked when the provider must respond, and there genuinely is
    // one — the twin request that won the race stamped it, published the
    // event and scheduled the job. So it is read back off the row rather
    // than reported from the value this call computed and then discarded,
    // which would tell the customer a deadline nothing is holding anyone to.
    //
    // Outside the transaction, because nothing is written after it.
    // `expiresAt` is set at `create` and only ever replaced, never cleared
    // (see `Booking.submit` and `Booking.accept`), so a booking that is
    // still there always has one; a null here means the row itself is gone.
    const current = await this.repo.findById(input.bookingId);
    if (!current?.expiresAt) {
      throw new BookingNotFoundError(input.bookingId);
    }
    return { bookingId: input.bookingId, respondBy: current.expiresAt.toISOString() };
  }
}
