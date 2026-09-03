import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { Booking } from "../../domain/aggregates/booking.aggregate";
import type {
  RaiseNotificationInput,
  RaiseNotificationInternalPort,
} from "../../app/ports/outbound/raise-notification.port";

/**
 * A transactional fake with real buffer-and-discard semantics, not a
 * passthrough. `stage(commit)` is how a fake repository or outbox registers a
 * write instead of applying it straight to its own arrays: called while
 * `atomicExecute`'s block is running, the write is buffered and only applied
 * once that block returns without throwing; a throw discards the whole
 * buffer instead. Called with no block open, it applies immediately — the
 * same way a bare `INSERT` against a real database autocommits unless
 * something wrapped it in `BEGIN … COMMIT`. That second branch is not a
 * convenience fallback: it is what makes a transaction-removal experiment
 * meaningful. Strip `atomicExecute` out of the command under test and every
 * write here starts autocommitting on its own — including the one a later
 * step in the same call was about to fail on — exactly as it would against
 * the real database.
 *
 * `insideTransaction` and `order` are how a capturing fake (an outbox, a
 * slot-hold release) tells "happened inside the transaction, after the
 * write it depends on" apart from "happened outside it, or before that
 * write" — see `create-booking.command.test.ts`'s `CapturingOutbox` for the
 * pattern.
 *
 * **The limit of this simulation, stated plainly:** buffering and discarding
 * in this fake proves that a command's call ordering is *compatible* with a
 * database that rolls back on a mid-transaction failure. It does not prove
 * Postgres actually rolls anything back; nothing in this file talks to a
 * database. That proof runs against the real one, in Task 7's repository
 * test.
 *
 * Shared by `create-booking.command.test.ts` and
 * `booking-lifecycle.command.test.ts` — both tasks needed the exact same
 * fake, and a second copy would only be a second place for the two to drift.
 */
export class TrackingUnitOfWork implements UnitOfWorkPort {
  insideTransaction = false;
  order: string[] = [];
  private pending: (() => void)[] = [];

  stage(commit: () => void): void {
    if (this.insideTransaction) {
      this.pending.push(commit);
    } else {
      commit();
    }
  }

  async atomicExecute<T>(work: () => Promise<T>): Promise<T> {
    this.insideTransaction = true;
    this.order = [];
    this.pending = [];
    try {
      const result = await work();
      for (const commit of this.pending) commit();
      return result;
    } catch (error) {
      this.pending = [];
      throw error;
    } finally {
      this.insideTransaction = false;
    }
  }
}

/**
 * Stands in for what a real `BookingRepositoryPort.insert` does: hand back
 * the same booking with a database-assigned id. Built through
 * `Booking.restore`, the same reconstitution seam the real repository uses,
 * rather than reaching into `Booking`'s private state.
 *
 * Shared for the same reason as `TrackingUnitOfWork`: both command tests need
 * a booking that already carries an id — one to get one from `insert`, the
 * other to have one to `findById`.
 */
export function withId(booking: Booking, id: string): Booking {
  return Booking.restore({
    id,
    customerId: booking.customerId,
    providerId: booking.providerId,
    serviceId: booking.serviceId,
    serviceOptionId: booking.serviceOptionId,
    providerMemberId: booking.providerMemberId,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    durationMinutes: booking.durationMinutes,
    status: booking.status,
    expiresAt: booking.expiresAt,
    paidAt: booking.paidAt,
    paymentRef: booking.paymentRef,
    confirmedAt: booking.confirmedAt,
    declinedAt: booking.declinedAt,
    cancelledAt: booking.cancelledAt,
    remindedAt: booking.remindedAt,
    markedDoneAt: booking.markedDoneAt,
    completedAt: booking.completedAt,
    disputedAt: booking.disputedAt,
    expiredAt: booking.expiredAt,
    priceMinor: booking.priceMinor,
    commissionBps: booking.commissionBps,
    commissionMinor: booking.commissionMinor,
    currency: booking.currency,
    serviceName: booking.serviceName,
    providerName: booking.providerName,
    providerSlug: booking.providerSlug,
    optionName: booking.optionName,
    addressLabel: booking.addressLabel,
    addressLine: booking.addressLine,
    addressCity: booking.addressCity,
    addressDistrict: booking.addressDistrict,
    addressDirections: booking.addressDirections,
    addressLat: booking.addressLat,
    addressLng: booking.addressLng,
    description: booking.description,
  });
}

/**
 * Records every notification a command raised, in order, so a test can read
 * back *what* was announced rather than only that something was.
 *
 * `failWith` is the other half, and the reason this fake takes a constructor
 * argument at all: BR-P6 says a raise that throws must not fail the write
 * that already committed, and the only way to prove that is a port that
 * really does throw. A fake that could only succeed would leave the
 * `try`/`catch` in `raiseQuietly` untested — the exact code whose absence
 * nothing else in this suite would notice.
 *
 * Shared by `submit-accept-decline-booking.command.test.ts`,
 * `booking-lifecycle.command.test.ts`, `bootstrap.test.ts` and the two
 * dev-database tests that wire commands the way `bootstrapBooking()` does —
 * one fake rather than five copies, for the same reason
 * `TrackingUnitOfWork` is here.
 */
export class FakeRaiser implements RaiseNotificationInternalPort {
  public readonly raised: RaiseNotificationInput[] = [];

  constructor(private readonly failWith: Error | null = null) {}

  async execute(input: RaiseNotificationInput): Promise<{ notificationId: string }> {
    if (this.failWith) throw this.failWith;
    this.raised.push(input);
    return { notificationId: `n-${this.raised.length}` };
  }
}
