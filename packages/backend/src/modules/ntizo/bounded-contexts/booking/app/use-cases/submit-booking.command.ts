import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import type { Booking } from "../../domain/aggregates/booking.aggregate";
import { BookingSubmitted } from "../../domain/events";
import {
  BookingNotFoundError,
  BookingTransitionError,
  CustomerPhoneMissingError,
  NotBookingCustomerError,
} from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import { cappedToSlotStart } from "./capped-to-slot-start";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { CustomerPhoneReaderPort } from "../ports/outbound/customer-phone.reader.port";
import type { DelayedJobsPort } from "../ports/outbound/delayed-jobs.port";
import type { PlatformSettingsReaderPort } from "../ports/outbound/platform-settings.reader.port";
import {
  raiseQuietly,
  type RaiseNotificationInternalPort,
} from "../ports/outbound/raise-notification.port";

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
   * What the customer wants done, in their own words — checkout's step 2,
   * the optional note beside the address on the same page.
   *
   * It travels with the address for that reason: `booking.create` carries
   * neither, because step 1 has neither value to give. Passed straight
   * through to `Booking.submit`, which normalises a blank one to null rather
   * than refusing it.
   *
   * `string | null`, never optional. The GraphQL layer collapses an omitted
   * key to `null` before this type is built, so "the customer wrote nothing"
   * has exactly one spelling by the time it reaches the aggregate — see
   * `Booking.submit` for why the parameter it hands this to is required.
   */
  description: string | null;
  /**
   * The signed-in customer's own first name, off the GraphQL session — the
   * one thing `PROVIDER_BOOKING_RECEIVED` needs that the booking row does
   * not carry. `booking` snapshots the *provider's* name, because that is
   * what was sold; it has never had a column for the customer's, so the
   * template that says who is asking has nowhere else to read one from.
   *
   * Optional, and null-tolerant, because `NtizoGraphqlContext.firstName` is
   * `string | null` and a profile with no name on it is ordinary. The
   * template renders "um cliente" for that case; nothing here refuses a
   * booking over a missing name.
   */
  customerFirstName?: string | null;
}

/**
 * What the transaction below hands back when it really did submit: the
 * deadline it stamped, and the booking it stamped it on.
 *
 * The deadline alone used to be enough, because scheduling a job was all
 * that happened afterwards. Announcing the request needs the provider it
 * went to and the service it names, and re-reading the row outside the
 * transaction to find them would be a second read that could disagree with
 * the write — so the aggregate travels out with the date instead. `null`
 * still means the same thing it always did: the compare-and-swap lost and
 * nothing happened.
 */
type SubmitOutcome = { respondBy: Date; moved: Booking };

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
 * place this race is actually settled. `false` back means somebody else's
 * write moved the row first, and this command publishes nothing, appends
 * nothing and schedules nothing — the same outcome the aggregate's own no-op
 * path produces in `MarkBookingPaidCommand` and `SweepBookingCommand`,
 * reached here by the repository's guard instead.
 *
 * **What it answers with then depends on who that other writer was**, and a
 * twin submit is only one of three candidates — the sweep and
 * `CreateBookingCommand`'s one-draft rule can both move a `DRAFT` too, and
 * neither of them submitted anything. The re-read at the bottom of `execute`
 * is where that is decided; see its own comment, which is the argument for
 * why this command cannot simply report whatever deadline the row happens to
 * be carrying.
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
    private readonly raiseNotification: RaiseNotificationInternalPort,
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

    const result = await this.unitOfWork.atomicExecute(async (): Promise<SubmitOutcome | null> => {
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

      return { respondBy: respondByDeadline, moved };
    });

    // Scheduled after the transaction resolves, not inside it — the same
    // reason `CreateBookingCommand` schedules its own job outside its own
    // `atomicExecute`: a job queued for a write that then rolled back, or
    // that lost the compare-and-swap above, would be a job for nothing.
    if (result) {
      await this.delayedJobs.scheduleBookingDeadline(input.bookingId, result.respondBy);

      // BR-P6, and it sits here — inside the applied branch, after the
      // transaction resolved — for both halves of that rule. *After*,
      // because announcing a request from inside the transaction that
      // carries it would tell the provider about a submission a rollback
      // could still take back. *Inside this branch*, because the other one
      // is a losing compare-and-swap: this call's submission never landed,
      // and there is nothing to announce.
      //
      // `raiseQuietly` rather than a bare `execute`: the booking is already
      // submitted by the time this line runs, and a notification adapter
      // that hiccups must not turn a request the customer really did send
      // into a failed mutation. See that function's own doc comment.
      await raiseQuietly(
        this.raiseNotification,
        {
          type: NotificationType.ProviderBookingReceived,
          audience: "provider",
          providerId: result.moved.providerId,
          payload: {
            bookingId: input.bookingId,
            serviceName: result.moved.serviceName,
            startsAt: result.moved.startsAt.toISOString(),
            // `booking` carries no timezone, and none is invented here.
            // Whatever renders this decides how to show an instant, the same
            // way every other consumer of `startsAt` already does.
            timezone: null,
            customerFirstName: input.customerFirstName ?? null,
            respondBy: result.respondBy.toISOString(),
          },
        },
        input.bookingId,
      );

      return { bookingId: input.bookingId, respondBy: result.respondBy.toISOString() };
    }

    // The compare-and-swap found something other than the `DRAFT` this
    // call's own read saw. **Three different writers can do that, and only
    // one of them is another submit:**
    //
    //   - a twin submit — a double-tap, or a retry of a request whose
    //     response never arrived — which really did send this booking, and
    //     stamped the `respondBy` the provider is now held to;
    //   - `SweepBookingCommand`, when the checkout hold ran out;
    //   - `CreateBookingCommand`'s one-draft rule, which expires this draft
    //     and releases its slot the moment the same customer opens step 1
    //     again in another tab.
    //
    // The last is the reachable one, and it is why this branch cannot simply
    // report whatever `expiresAt` holds. `Booking.expire` moves the status
    // and sets `expiredAt`; it never touches `expiresAt`, so an expired
    // draft still carries the checkout hold — now in the past. Reporting it
    // would answer a submission that did not happen with a success and a
    // dead countdown, under a slot that has already been released and a
    // provider who was never asked.
    //
    // So the status is the guard, not the presence of a date: `expiresAt` is
    // only a `respondBy` while the booking is actually in
    // `AWAITING_PROVIDER`. Anything else means this call's submission did
    // not happen, and the caller has to be told — the same
    // `BookingTransitionError` the non-race path already raises when
    // `findById` reads a booking that is no longer a `DRAFT`, so checkout's
    // step 3 handles one outcome for one event rather than two that depend
    // on which side of a settings round trip a concurrent write landed. See
    // the design's failure table: the customer goes back to step 1 with the
    // service kept.
    //
    // Outside the transaction, because nothing is written after it.
    //
    // A literal rather than the `BookingStatus` const, matching
    // `ChargeBookingCommand` and `SweepBookingCommand`: that const lives in
    // `shared/infrastructure/database/booking/enums.ts`, and no use case in
    // this bounded context reaches into `infrastructure/`. It is not a loose
    // string either — `current.status` is that same union.
    const current = await this.repo.findById(input.bookingId);
    if (!current) {
      throw new BookingNotFoundError(input.bookingId);
    }
    if (current.status !== "AWAITING_PROVIDER") {
      throw new BookingTransitionError(current.status, "AWAITING_PROVIDER");
    }
    // Never null on an `AWAITING_PROVIDER` row: `Booking.submit` is the only
    // way into that status and it always writes `respondBy` here — the same
    // reasoning `moved.id as string` above relies on.
    return { bookingId: input.bookingId, respondBy: (current.expiresAt as Date).toISOString() };
  }
}
