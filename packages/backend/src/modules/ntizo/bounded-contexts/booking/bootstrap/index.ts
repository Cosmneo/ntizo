import { DrizzleBookingRepository } from "../infrastructure/repositories/drizzle/booking.repository";
import { DrizzleServicePricingReader } from "../infrastructure/repositories/drizzle/service-pricing.reader";
import { DrizzleProviderSnapshotReader } from "../infrastructure/repositories/drizzle/provider-snapshot.reader";
import { DrizzlePlatformSettingsReader } from "../infrastructure/repositories/drizzle/platform-settings.reader";
import { DrizzleProviderMemberReader } from "../infrastructure/repositories/drizzle/provider-member.reader";
import { DrizzleSlotValidityReader } from "../infrastructure/repositories/drizzle/slot-validity.reader";
import { DrizzleCustomerPhoneReader } from "../infrastructure/repositories/drizzle/customer-phone.reader";
import { BookingRowSlotHold } from "../infrastructure/adapters/booking-row-slot-hold.adapter";
import { BookingRowDelayedJobs } from "../infrastructure/adapters/booking-row-delayed-jobs.adapter";
import { MpesaPaymentCharge } from "../infrastructure/adapters/mpesa-payment-charge.adapter";
import { CreateBookingCommand } from "../app/use-cases/create-booking.command";
import { SubmitBookingCommand } from "../app/use-cases/submit-booking.command";
import { AcceptBookingCommand } from "../app/use-cases/accept-booking.command";
import { DeclineBookingCommand } from "../app/use-cases/decline-booking.command";
import { CancelBookingCommand } from "../app/use-cases/cancel-booking.command";
import { SweepBookingCommand } from "../app/use-cases/sweep-booking.command";
import { SweepDueBookingsInternalCommand } from "../app/use-cases/sweep-due-bookings.internal.command";
import { ChargeBookingCommand } from "../app/use-cases/charge-booking.command";
import { ChargeAcceptedBookingsInternalCommand } from "../app/use-cases/charge-accepted-bookings.internal.command";
import { MarkBookingPaidCommand } from "../app/use-cases/mark-booking-paid.command";
import { RequestBookingChargeCommand } from "../app/use-cases/request-booking-charge.command";
import { DeferredBookingCharge } from "../infrastructure/inbound-adapters/deferred-booking-charge.adapter";
import type { RaiseNotificationInternalPort } from "../app/ports/outbound/raise-notification.port";
import { DrizzleUnitOfWork } from "../../../../../shared/infrastructure/unit-of-work";
import { OutboxAdapter } from "../../../../../shared/infrastructure/outbox/outbox.adapter";
import { DrizzleOutboxEventRepository } from "../../../../../shared/infrastructure/outbox/drizzle/outbox-event.repository";

/**
 * Constructs every use case this bounded context has built so far,
 * including three nothing *outside* this bootstrap calls directly.
 * `sweepBooking` and `chargeBooking` are each driven from inside it, through
 * `useCases.internal.sweepDue` and `useCases.internal.chargeAccepted` — the
 * same way Communication's cron sweep goes through
 * `useCases.internal.notifyUnread` rather than touching
 * `MessageRepositoryPort` itself. `markBookingPaid` gained its first real
 * caller in Task 5 (`chargeBooking`, on the one path that produces a
 * payment); Payment's own event handler still reaches for it once Payment
 * lands. A bootstrap that omitted any of the three would leave it with
 * nothing to call — an omission that surfaces only when somebody tries, the
 * same failure mode `bootstrap-wiring.test.ts` guards against for
 * Notification.
 *
 * `submitBooking`, `acceptBooking` and `declineBooking` are the three
 * commands the payment-and-confirmation-order plan's Task 3 added, moving a
 * booking `DRAFT → AWAITING_PROVIDER → PENDING_PAYMENT` (or `DECLINED`).
 * `acceptBooking` and `declineBooking` share `providerMemberReader` — both
 * exist to authorise the same fact, that the caller belongs to the
 * booking's own provider — the same way `createBooking` and `acceptBooking`
 * already shared `platformSettingsReader` before this task.
 *
 * `chargeBooking` and `internal.chargeAccepted` are Task 5's pair, and they
 * mirror `sweepBooking`/`internal.sweepDue` exactly: one command that acts on
 * a single booking, and one that asks the database which bookings there are
 * and drives the first over each. `markBookingPaid` stops being constructed
 * inline here because `chargeBooking` needs the very same instance — see
 * where it is built below.
 *
 * `requestBookingCharge` is Task 11's addition and reuses that same
 * `chargeBooking` instance rather than building a second one — it wraps it
 * in `DeferredBookingCharge` first, which is the one difference between the
 * customer's "Pagar" and the sweep's own call: this path must not block the
 * request that asked for it on a gateway call that can take up to 110
 * seconds, and the sweep's path must, because a cron invocation has nothing
 * to hand `waitUntil` and no reason to return before it knows the outcome.
 */
export interface BookingBootstrapDeps {
  /**
   * The notification context's real `RaiseNotificationInternalCommand`
   * (ideally already wrapped in `DeferredNotificationDelivery`, so a booking
   * that changes hands sends both a bell entry and an email) — it satisfies
   * `RaiseNotificationInternalPort` structurally, with no adapter class
   * needed. This bootstrap is the one place allowed to know that coupling
   * exists; see the port's own doc comment for why it is declared inside this
   * context rather than imported from the notification context's `app/` tree.
   *
   * Required rather than optional, and that is deliberate. Five of the
   * commands below announce something, and an optional dependency would let a
   * composition root construct a booking context that silently tells nobody
   * anything — the exact failure `bootstrap.test.ts` exists to catch, made
   * invisible by a default. Every call site passes the same value
   * `bootstrapCommunication` already takes.
   */
  raiseNotification: RaiseNotificationInternalPort;
}

export function bootstrapBooking(deps: BookingBootstrapDeps) {
  const bookingRepository = new DrizzleBookingRepository();
  const pricingReader = new DrizzleServicePricingReader();
  const providerReader = new DrizzleProviderSnapshotReader();
  const platformSettingsReader = new DrizzlePlatformSettingsReader();
  const providerMemberReader = new DrizzleProviderMemberReader();
  const slotValidityReader = new DrizzleSlotValidityReader();
  const customerPhoneReader = new DrizzleCustomerPhoneReader();
  const slotHold = new BookingRowSlotHold();
  const delayedJobs = new BookingRowDelayedJobs();
  const paymentCharge = new MpesaPaymentCharge();
  const unitOfWork = new DrizzleUnitOfWork();
  const outboxPort = new OutboxAdapter(new DrizzleOutboxEventRepository());

  const sweepBooking = new SweepBookingCommand(
    bookingRepository,
    slotHold,
    unitOfWork,
    outboxPort,
    deps.raiseNotification,
  );
  // Hoisted out of the `useCases` literal below, unlike every other command
  // there, because it now has a second caller inside this function:
  // `chargeBooking` drives it on the one path that actually produces a
  // payment. Two instances would be two copies of the same idempotency and
  // compare-and-swap logic wired to the same repository — harmless today and
  // exactly the kind of thing that stops being harmless.
  const markBookingPaid = new MarkBookingPaidCommand(
    bookingRepository,
    unitOfWork,
    outboxPort,
    deps.raiseNotification,
  );
  const chargeBooking = new ChargeBookingCommand(
    bookingRepository,
    customerPhoneReader,
    paymentCharge,
    markBookingPaid,
  );
  // The customer-facing counterpart to `chargeAccepted` below: same
  // `ChargeBookingCommand` instance, wrapped so the request that asks for it
  // does not pay for the gateway call — see `DeferredBookingCharge`'s own
  // doc comment for why this is the one place that wiring decision is made.
  const requestBookingCharge = new RequestBookingChargeCommand(
    bookingRepository,
    customerPhoneReader,
    // The same adapter `chargeBooking` holds, asked the same synchronous
    // question — see `RequestBookingChargeCommand`'s own doc comment for why
    // the fast half has to ask it too rather than leaving it to the charge.
    paymentCharge,
    new DeferredBookingCharge(chargeBooking),
  );

  return {
    adapters: {
      bookingRepository,
      pricingReader,
      providerReader,
      platformSettingsReader,
      providerMemberReader,
      slotValidityReader,
      customerPhoneReader,
      slotHold,
      delayedJobs,
      paymentCharge,
      unitOfWork,
      outboxPort,
    },
    useCases: {
      createBooking: new CreateBookingCommand(
        bookingRepository,
        pricingReader,
        providerReader,
        platformSettingsReader,
        slotValidityReader,
        slotHold,
        delayedJobs,
        unitOfWork,
        outboxPort,
      ),
      submitBooking: new SubmitBookingCommand(
        bookingRepository,
        // Shared with `chargeBooking`, which reads the same column for the
        // same customer minutes later. Requiring the number at submit is
        // what stops that charge being attempted against nothing at all —
        // see `CustomerPhoneMissingError`.
        customerPhoneReader,
        platformSettingsReader,
        delayedJobs,
        unitOfWork,
        outboxPort,
        deps.raiseNotification,
      ),
      acceptBooking: new AcceptBookingCommand(
        bookingRepository,
        providerMemberReader,
        platformSettingsReader,
        delayedJobs,
        unitOfWork,
        outboxPort,
        deps.raiseNotification,
      ),
      declineBooking: new DeclineBookingCommand(
        bookingRepository,
        providerMemberReader,
        slotHold,
        unitOfWork,
        outboxPort,
        deps.raiseNotification,
      ),
      // Needs no `ProviderMemberReaderPort`, unlike `declineBooking` beside
      // it: the fact this command authorises against — whose booking this
      // is — is already on the row it reads, not a membership read
      // elsewhere. Shares everything else declineBooking shares: the same
      // repository, slot hold, unit of work, outbox and notification port.
      cancelBooking: new CancelBookingCommand(
        bookingRepository,
        slotHold,
        unitOfWork,
        outboxPort,
        deps.raiseNotification,
      ),
      sweepBooking,
      chargeBooking,
      requestBookingCharge,
      markBookingPaid,
      internal: {
        // The three clocks a cron sweeps — nobody asks for this, something
        // schedules it. See scheduled.ts. It takes no
        // `platformSettingsReader`, and that absence is the design: each hop
        // already stamped its own window onto `expires_at`, so the sweep
        // reads a deadline rather than recomputing one from a setting that
        // may have changed since.
        sweepDue: new SweepDueBookingsInternalCommand(bookingRepository, sweepBooking),
        // The cron's second question, in the same invocation and the same
        // scope: which accepted bookings still owe a charge. It takes no
        // `platformSettingsReader` either, and for a different reason — the
        // attempt bound and the cooldown are not administrator settings, they
        // are the shape of the processor's own behaviour (see that command's
        // own constants).
        chargeAccepted: new ChargeAcceptedBookingsInternalCommand(bookingRepository, chargeBooking),
      },
    },
  };
}

export type BookingBootstrap = ReturnType<typeof bootstrapBooking>;
