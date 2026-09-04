import { DrizzleBookingRepository } from "../infrastructure/repositories/drizzle/booking.repository";
import { DrizzleServicePricingReader } from "../infrastructure/repositories/drizzle/service-pricing.reader";
import { DrizzleProviderSnapshotReader } from "../infrastructure/repositories/drizzle/provider-snapshot.reader";
import { DrizzlePlatformSettingsReader } from "../infrastructure/repositories/drizzle/platform-settings.reader";
import { DrizzleProviderMemberReader } from "../infrastructure/repositories/drizzle/provider-member.reader";
import { DrizzleAdminUserReader } from "../infrastructure/repositories/drizzle/admin-user.reader";
import { DrizzleSlotValidityReader } from "../infrastructure/repositories/drizzle/slot-validity.reader";
import { DrizzleCustomerPhoneReader } from "../infrastructure/repositories/drizzle/customer-phone.reader";
import { BookingRowSlotHold } from "../infrastructure/adapters/booking-row-slot-hold.adapter";
import { BookingRowDelayedJobs } from "../infrastructure/adapters/booking-row-delayed-jobs.adapter";
import { MpesaPaymentCharge } from "../infrastructure/adapters/mpesa-payment-charge.adapter";
import { CreateBookingCommand } from "../app/use-cases/create-booking.command";
import { SubmitBookingCommand } from "../app/use-cases/submit-booking.command";
import { AcceptBookingCommand } from "../app/use-cases/accept-booking.command";
import { DeclineBookingCommand } from "../app/use-cases/decline-booking.command";
import { SweepBookingCommand } from "../app/use-cases/sweep-booking.command";
import { SweepDueBookingsInternalCommand } from "../app/use-cases/sweep-due-bookings.internal.command";
import { ChargeBookingCommand } from "../app/use-cases/charge-booking.command";
import { ChargeAcceptedBookingsInternalCommand } from "../app/use-cases/charge-accepted-bookings.internal.command";
import { MarkBookingPaidCommand } from "../app/use-cases/mark-booking-paid.command";
import { MarkBookingDoneCommand } from "../app/use-cases/mark-booking-done.command";
import { KeepBookingOpenCommand } from "../app/use-cases/keep-booking-open.command";
import { CompleteBookingCommand } from "../app/use-cases/complete-booking.command";
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
   * Required rather than optional, and that is deliberate. Seven of the
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
  const adminUserReader = new DrizzleAdminUserReader();
  const slotValidityReader = new DrizzleSlotValidityReader();
  const customerPhoneReader = new DrizzleCustomerPhoneReader();
  const slotHold = new BookingRowSlotHold();
  const delayedJobs = new BookingRowDelayedJobs();
  const paymentCharge = new MpesaPaymentCharge();
  const unitOfWork = new DrizzleUnitOfWork();
  const outboxPort = new OutboxAdapter(new DrizzleOutboxEventRepository());

  // Hoisted out of the `useCases` literal below for the same reason
  // `markBookingPaid` is: `sweepBooking` drives both of them. Its
  // seven-day arm is `markBookingDone`'s third caller and its window arm is
  // `completeBooking`'s first, and two instances would be two copies of the
  // same compare-and-swap and the same announcements wired to one repository.
  const markBookingDone = new MarkBookingDoneCommand(
    bookingRepository,
    providerMemberReader,
    unitOfWork,
    outboxPort,
    deps.raiseNotification,
  );
  const completeBooking = new CompleteBookingCommand(
    bookingRepository,
    unitOfWork,
    outboxPort,
    deps.raiseNotification,
  );
  const sweepBooking = new SweepBookingCommand(
    bookingRepository,
    slotHold,
    unitOfWork,
    outboxPort,
    deps.raiseNotification,
    markBookingDone,
    completeBooking,
    // Only the seven-day arm reads this, and only to tell the
    // administrators that a booking closed with no provider answering.
    adminUserReader,
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

  return {
    adapters: {
      bookingRepository,
      pricingReader,
      providerReader,
      platformSettingsReader,
      providerMemberReader,
      adminUserReader,
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
      // The three hops that close a booking. `markBookingDone` is the one
      // with three callers rather than one — the provider's own button, an
      // administrator, and the sweep's seven-day arm, which is why it takes
      // `providerMemberReader` even though only the first of the three is
      // checked against it (see that command's own doc comment). It and
      // `completeBooking` are built above rather than here, because
      // `sweepBooking` holds the very same two instances.
      //
      // `keepBookingOpen` stops one argument short of the rest, and that is
      // the design rather than an omission: it announces nothing, so it takes
      // no `deps.raiseNotification` — the same shape `createBooking` above
      // already has, and for the same reason. `completeBooking` stops one
      // short at the other end: it takes no `providerMemberReader`, because
      // its three callers (the sweep, the review context, an administrator)
      // are each authorised at their own edge and none of them is a member of
      // the provider they are closing for.
      markBookingDone,
      keepBookingOpen: new KeepBookingOpenCommand(
        bookingRepository,
        providerMemberReader,
        unitOfWork,
        outboxPort,
      ),
      completeBooking,
      sweepBooking,
      chargeBooking,
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
