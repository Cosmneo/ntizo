import { describe, expect, it } from "bun:test";
import { bootstrapBooking } from "../bootstrap";
import { CreateBookingCommand } from "../app/use-cases/create-booking.command";
import { ExpireBookingCommand } from "../app/use-cases/expire-booking.command";
import { MarkBookingPaidCommand } from "../app/use-cases/mark-booking-paid.command";
import { DrizzleBookingRepository } from "../infrastructure/repositories/drizzle/booking.repository";
import { DrizzleServicePricingReader } from "../infrastructure/repositories/drizzle/service-pricing.reader";
import { DrizzleProviderSnapshotReader } from "../infrastructure/repositories/drizzle/provider-snapshot.reader";
import { BookingRowSlotHold } from "../infrastructure/adapters/booking-row-slot-hold.adapter";
import { ExpiresAtDelayedJobs } from "../infrastructure/adapters/expires-at-delayed-jobs.adapter";

/**
 * The wiring is the feature — see notification's `bootstrap-wiring.test.ts`
 * for why: every command below has its own unit tests that pass on classes
 * nothing ever constructs, and that is exactly how eight GraphQL handlers
 * shipped mounted-nowhere in an earlier phase of this project.
 *
 * `markBookingPaid` and `expireBooking` have no caller anywhere in this task
 * — Payment's event handler and Task 12's sweep reach for them later. A
 * bootstrap that silently dropped either would leave both with nothing to
 * call, and nothing today would notice: their own command tests construct
 * the class directly and never go through `bootstrapBooking()`.
 *
 * Note on count: `task-10-brief.md` and `task-10-decisions.md` both call for
 * asserting "all four" use cases. Only three command classes exist under
 * `app/use-cases/` — `CreateBookingCommand`, `ExpireBookingCommand`,
 * `MarkBookingPaidCommand` — so this test asserts those three. Reported as a
 * discrepancy in the two requirement files rather than resolved by
 * inventing a fourth command.
 */
describe("bootstrapBooking", () => {
  it("constructs every use case, including the two nothing calls yet", () => {
    const { useCases } = bootstrapBooking();

    expect(useCases.createBooking).toBeInstanceOf(CreateBookingCommand);
    expect(useCases.expireBooking).toBeInstanceOf(ExpireBookingCommand);
    expect(useCases.markBookingPaid).toBeInstanceOf(MarkBookingPaidCommand);
  });

  it("builds the two real readers and the two no-op adapters — the whole point of this task", () => {
    const { adapters } = bootstrapBooking();

    expect(adapters.bookingRepository).toBeInstanceOf(DrizzleBookingRepository);
    expect(adapters.pricingReader).toBeInstanceOf(DrizzleServicePricingReader);
    expect(adapters.providerReader).toBeInstanceOf(DrizzleProviderSnapshotReader);
    // Empty methods, but a real class in the graph — not the port type
    // itself and not a bare object literal standing in for one.
    expect(adapters.slotHold).toBeInstanceOf(BookingRowSlotHold);
    expect(adapters.delayedJobs).toBeInstanceOf(ExpiresAtDelayedJobs);
  });
});
