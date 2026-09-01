import { DrizzleBookingRepository } from "../infrastructure/repositories/drizzle/booking.repository";
import { DrizzleServicePricingReader } from "../infrastructure/repositories/drizzle/service-pricing.reader";
import { DrizzleProviderSnapshotReader } from "../infrastructure/repositories/drizzle/provider-snapshot.reader";
import { DrizzlePlatformSettingsReader } from "../infrastructure/repositories/drizzle/platform-settings.reader";
import { DrizzleProviderMemberReader } from "../infrastructure/repositories/drizzle/provider-member.reader";
import { DrizzleSlotValidityReader } from "../infrastructure/repositories/drizzle/slot-validity.reader";
import { BookingRowSlotHold } from "../infrastructure/adapters/booking-row-slot-hold.adapter";
import { ExpiresAtDelayedJobs } from "../infrastructure/adapters/expires-at-delayed-jobs.adapter";
import { CreateBookingCommand } from "../app/use-cases/create-booking.command";
import { SubmitBookingCommand } from "../app/use-cases/submit-booking.command";
import { AcceptBookingCommand } from "../app/use-cases/accept-booking.command";
import { DeclineBookingCommand } from "../app/use-cases/decline-booking.command";
import { SweepBookingCommand } from "../app/use-cases/sweep-booking.command";
import { SweepDueBookingsInternalCommand } from "../app/use-cases/sweep-due-bookings.internal.command";
import { MarkBookingPaidCommand } from "../app/use-cases/mark-booking-paid.command";
import { DrizzleUnitOfWork } from "../../../../../shared/infrastructure/unit-of-work";
import { OutboxAdapter } from "../../../../../shared/infrastructure/outbox/outbox.adapter";
import { DrizzleOutboxEventRepository } from "../../../../../shared/infrastructure/outbox/drizzle/outbox-event.repository";

/**
 * Constructs every use case this bounded context has built so far,
 * including two nothing outside this bootstrap constructs directly:
 * `markBookingPaid` (Payment's event handler reaches for it once Payment
 * lands) and `sweepBooking`, which the expiry sweep no longer calls
 * directly — it goes through `useCases.internal.sweepDue` below, the same
 * way Communication's cron sweep goes through `useCases.internal.notifyUnread`
 * rather than touching `MessageRepositoryPort` itself. A bootstrap that
 * omitted either top-level use case would leave both with nothing to call —
 * an omission that surfaces only when somebody tries, the same failure mode
 * `bootstrap-wiring.test.ts` guards against for Notification.
 *
 * `submitBooking`, `acceptBooking` and `declineBooking` are the three
 * commands the payment-and-confirmation-order plan's Task 3 added, moving a
 * booking `DRAFT → AWAITING_PROVIDER → PENDING_PAYMENT` (or `DECLINED`).
 * `acceptBooking` and `declineBooking` share `providerMemberReader` — both
 * exist to authorise the same fact, that the caller belongs to the
 * booking's own provider — the same way `createBooking` and `acceptBooking`
 * already shared `platformSettingsReader` before this task.
 */
export function bootstrapBooking() {
  const bookingRepository = new DrizzleBookingRepository();
  const pricingReader = new DrizzleServicePricingReader();
  const providerReader = new DrizzleProviderSnapshotReader();
  const platformSettingsReader = new DrizzlePlatformSettingsReader();
  const providerMemberReader = new DrizzleProviderMemberReader();
  const slotValidityReader = new DrizzleSlotValidityReader();
  const slotHold = new BookingRowSlotHold();
  const delayedJobs = new ExpiresAtDelayedJobs();
  const unitOfWork = new DrizzleUnitOfWork();
  const outboxPort = new OutboxAdapter(new DrizzleOutboxEventRepository());

  const sweepBooking = new SweepBookingCommand(bookingRepository, slotHold, unitOfWork, outboxPort);

  return {
    adapters: {
      bookingRepository,
      pricingReader,
      providerReader,
      platformSettingsReader,
      providerMemberReader,
      slotValidityReader,
      slotHold,
      delayedJobs,
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
        platformSettingsReader,
        delayedJobs,
        unitOfWork,
        outboxPort,
      ),
      acceptBooking: new AcceptBookingCommand(
        bookingRepository,
        providerMemberReader,
        platformSettingsReader,
        delayedJobs,
        unitOfWork,
        outboxPort,
      ),
      declineBooking: new DeclineBookingCommand(
        bookingRepository,
        providerMemberReader,
        slotHold,
        unitOfWork,
        outboxPort,
      ),
      sweepBooking,
      markBookingPaid: new MarkBookingPaidCommand(bookingRepository, unitOfWork, outboxPort),
      internal: {
        // The three clocks a cron sweeps — nobody asks for this, something
        // schedules it. See scheduled.ts. It takes no
        // `platformSettingsReader`, and that absence is the design: each hop
        // already stamped its own window onto `expires_at`, so the sweep
        // reads a deadline rather than recomputing one from a setting that
        // may have changed since.
        sweepDue: new SweepDueBookingsInternalCommand(bookingRepository, sweepBooking),
      },
    },
  };
}

export type BookingBootstrap = ReturnType<typeof bootstrapBooking>;
