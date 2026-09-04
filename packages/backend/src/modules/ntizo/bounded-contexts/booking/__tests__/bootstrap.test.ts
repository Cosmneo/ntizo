import { describe, expect, it } from "bun:test";
import { bootstrapBooking } from "../bootstrap";
import { CreateBookingCommand } from "../app/use-cases/create-booking.command";
import { SubmitBookingCommand } from "../app/use-cases/submit-booking.command";
import { AcceptBookingCommand } from "../app/use-cases/accept-booking.command";
import { DeclineBookingCommand } from "../app/use-cases/decline-booking.command";
import { SweepBookingCommand } from "../app/use-cases/sweep-booking.command";
import { SweepDueBookingsInternalCommand } from "../app/use-cases/sweep-due-bookings.internal.command";
import { MarkBookingPaidCommand } from "../app/use-cases/mark-booking-paid.command";
import { MarkBookingDoneCommand } from "../app/use-cases/mark-booking-done.command";
import { KeepBookingOpenCommand } from "../app/use-cases/keep-booking-open.command";
import { CompleteBookingCommand } from "../app/use-cases/complete-booking.command";
import { DrizzleBookingRepository } from "../infrastructure/repositories/drizzle/booking.repository";
import { DrizzleServicePricingReader } from "../infrastructure/repositories/drizzle/service-pricing.reader";
import { DrizzleProviderSnapshotReader } from "../infrastructure/repositories/drizzle/provider-snapshot.reader";
import { DrizzlePlatformSettingsReader } from "../infrastructure/repositories/drizzle/platform-settings.reader";
import { DrizzleProviderMemberReader } from "../infrastructure/repositories/drizzle/provider-member.reader";
import { DrizzleSlotValidityReader } from "../infrastructure/repositories/drizzle/slot-validity.reader";
import { BookingRowSlotHold } from "../infrastructure/adapters/booking-row-slot-hold.adapter";
import { BookingRowDelayedJobs } from "../infrastructure/adapters/booking-row-delayed-jobs.adapter";
import { FakeRaiser } from "./support/fakes";

/**
 * The wiring is the feature — see notification's `bootstrap-wiring.test.ts`
 * for why: every command below has its own unit tests that pass on classes
 * nothing ever constructs, and that is exactly how eight GraphQL handlers
 * shipped mounted-nowhere in an earlier phase of this project.
 *
 * `markBookingPaid` has no caller anywhere in this task — Payment's event
 * handler reaches for it later. `sweepBooking` now does have a caller,
 * `useCases.internal.sweepDue` (Task 12's sweep), asserted separately
 * below. A bootstrap that silently dropped either would leave it with
 * nothing to call, and nothing today would notice: their own command tests
 * construct the class directly and never go through `bootstrapBooking()`.
 *
 * Note on count: `task-10-brief.md` and `task-10-decisions.md` both call for
 * asserting "all four" use cases. Only three command classes exist under
 * `app/use-cases/` — `CreateBookingCommand`, `SweepBookingCommand`,
 * `MarkBookingPaidCommand` — so this test asserts those three. Reported as a
 * discrepancy in the two requirement files rather than resolved by
 * inventing a fourth command.
 */
describe("bootstrapBooking", () => {
  it("constructs every use case, including the two nothing calls yet", () => {
    const { useCases } = bootstrapBooking({ raiseNotification: new FakeRaiser() });

    expect(useCases.createBooking).toBeInstanceOf(CreateBookingCommand);
    expect(useCases.submitBooking).toBeInstanceOf(SubmitBookingCommand);
    expect(useCases.acceptBooking).toBeInstanceOf(AcceptBookingCommand);
    expect(useCases.declineBooking).toBeInstanceOf(DeclineBookingCommand);
    expect(useCases.sweepBooking).toBeInstanceOf(SweepBookingCommand);
    expect(useCases.markBookingPaid).toBeInstanceOf(MarkBookingPaidCommand);
  });

  // The booking-completion plan's Task 4. Nothing calls these three yet
  // either: the sweep reaches for `markBookingDone` and `completeBooking`
  // next, the review context reaches for `completeBooking` after that, and
  // the provider's own two buttons reach this far through GraphQL last. A
  // bootstrap that dropped any of them would leave a booking with no way to
  // end, and nothing else here would notice — their own tests construct the
  // classes directly, the same blind spot this file exists for.
  it("constructs the three commands that close a booking", () => {
    const { useCases } = bootstrapBooking({ raiseNotification: new FakeRaiser() });

    expect(useCases.markBookingDone).toBeInstanceOf(MarkBookingDoneCommand);
    expect(useCases.keepBookingOpen).toBeInstanceOf(KeepBookingOpenCommand);
    expect(useCases.completeBooking).toBeInstanceOf(CompleteBookingCommand);
  });

  // The payment-and-confirmation-order plan's Task 3: without this,
  // `acceptBooking` and `declineBooking` would still type-check against a
  // provider-membership reader nothing real backs, and every accept or
  // decline would silently skip the one check that closes off a stranger
  // acting on somebody else's provider.
  it("wires the provider-membership reader acceptBooking and declineBooking share", () => {
    const { adapters } = bootstrapBooking({ raiseNotification: new FakeRaiser() });

    expect(adapters.providerMemberReader).toBeInstanceOf(DrizzleProviderMemberReader);
  });

  it("wires the sweep Task 12's cron calls, over the same sweepBooking instance", () => {
    const { useCases } = bootstrapBooking({ raiseNotification: new FakeRaiser() });

    expect(useCases.internal.sweepDue).toBeInstanceOf(SweepDueBookingsInternalCommand);
  });

  it("builds the two real readers and the two no-op adapters — the whole point of this task", () => {
    const { adapters } = bootstrapBooking({ raiseNotification: new FakeRaiser() });

    expect(adapters.bookingRepository).toBeInstanceOf(DrizzleBookingRepository);
    expect(adapters.pricingReader).toBeInstanceOf(DrizzleServicePricingReader);
    expect(adapters.providerReader).toBeInstanceOf(DrizzleProviderSnapshotReader);
    // Empty methods, but a real class in the graph — not the port type
    // itself and not a bare object literal standing in for one.
    expect(adapters.slotHold).toBeInstanceOf(BookingRowSlotHold);
    expect(adapters.delayedJobs).toBeInstanceOf(BookingRowDelayedJobs);
  });

  // Task 13: the payment window moved from a hardcoded constant in
  // `CreateBookingCommand` to this reader. Asserted separately from the test
  // above because it postdates "the whole point of this task" (Task 10) —
  // this is the wiring Task 13 added on top of it.
  it("wires the payment-window reader Task 13 added", () => {
    const { adapters, useCases } = bootstrapBooking({ raiseNotification: new FakeRaiser() });

    expect(adapters.platformSettingsReader).toBeInstanceOf(DrizzlePlatformSettingsReader);
    expect(useCases.createBooking).toBeInstanceOf(CreateBookingCommand);
  });

  // The booking-seams plan's Task 2: without this, `createBooking` would
  // still type-check against a slot-validity reader nothing real backs, and
  // every booking would silently skip the check that closes the
  // calendar-blocking hole.
  it("wires the slot-validity reader that closes the calendar-blocking hole", () => {
    const { adapters } = bootstrapBooking({ raiseNotification: new FakeRaiser() });

    expect(adapters.slotValidityReader).toBeInstanceOf(DrizzleSlotValidityReader);
  });
});
