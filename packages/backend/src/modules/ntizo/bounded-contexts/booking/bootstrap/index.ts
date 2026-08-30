import { DrizzleBookingRepository } from "../infrastructure/repositories/drizzle/booking.repository";
import { DrizzleServicePricingReader } from "../infrastructure/repositories/drizzle/service-pricing.reader";
import { DrizzleProviderSnapshotReader } from "../infrastructure/repositories/drizzle/provider-snapshot.reader";
import { BookingRowSlotHold } from "../infrastructure/adapters/booking-row-slot-hold.adapter";
import { ExpiresAtDelayedJobs } from "../infrastructure/adapters/expires-at-delayed-jobs.adapter";
import { CreateBookingCommand } from "../app/use-cases/create-booking.command";
import { ExpireBookingCommand } from "../app/use-cases/expire-booking.command";
import { MarkBookingPaidCommand } from "../app/use-cases/mark-booking-paid.command";
import { DrizzleUnitOfWork } from "../../../../../shared/infrastructure/unit-of-work";
import { OutboxAdapter } from "../../../../../shared/infrastructure/outbox/outbox.adapter";
import { DrizzleOutboxEventRepository } from "../../../../../shared/infrastructure/outbox/drizzle/outbox-event.repository";

/**
 * Constructs every use case Task 8 and Task 9 built, including the two
 * nothing in this task exposes: `markBookingPaid` (Payment's event handler
 * reaches for it once Payment lands) and `expireBooking` (Task 12's sweep
 * reaches for it). A bootstrap that omitted either would leave both with
 * nothing to call — an omission that surfaces only when somebody tries, the
 * same failure mode `bootstrap-wiring.test.ts` guards against for
 * Notification.
 *
 * `task-10-decisions.md` describes this as "all four use cases", but only
 * three command classes exist under `app/use-cases/` —
 * `CreateBookingCommand`, `ExpireBookingCommand`, `MarkBookingPaidCommand`.
 * That count is carried over from the brief unchanged rather than resolved
 * silently; see the Task 10 report for the same note.
 */
export function bootstrapBooking() {
  const bookingRepository = new DrizzleBookingRepository();
  const pricingReader = new DrizzleServicePricingReader();
  const providerReader = new DrizzleProviderSnapshotReader();
  const slotHold = new BookingRowSlotHold();
  const delayedJobs = new ExpiresAtDelayedJobs();
  const unitOfWork = new DrizzleUnitOfWork();
  const outboxPort = new OutboxAdapter(new DrizzleOutboxEventRepository());

  return {
    adapters: {
      bookingRepository,
      pricingReader,
      providerReader,
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
        slotHold,
        delayedJobs,
        unitOfWork,
        outboxPort,
      ),
      expireBooking: new ExpireBookingCommand(bookingRepository, slotHold, unitOfWork, outboxPort),
      markBookingPaid: new MarkBookingPaidCommand(bookingRepository, unitOfWork, outboxPort),
    },
  };
}

export type BookingBootstrap = ReturnType<typeof bootstrapBooking>;
