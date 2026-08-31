import { and, asc, eq, isNotNull, lte } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  booking,
  bookingChange,
  type BookingRow,
  type NewBookingRow,
} from "../../../../../shared/infrastructure/database/booking/schemas";
import { BookingStatus } from "../../../../../shared/infrastructure/database/booking/enums";
import { Booking } from "../../../domain/aggregates/booking.aggregate";
import { SlotAlreadyTakenError } from "../../../domain/exceptions";
import type {
  BookingChangeRecord,
  BookingRepositoryPort,
} from "../../../app/ports/outbound/booking.repository.port";

/**
 * The partial unique index Task 2 built. Superseded by
 * `SLOT_OVERLAP_CONSTRAINT` (see `booking.schema.ts` for why: it only ever
 * caught two bookings sharing an exact start instant, not a genuine overlap),
 * but still checked below alongside the new one — see `isSlotCollision`.
 */
const SLOT_COLLISION_CONSTRAINT = "booking_member_slot_active_uq";

/**
 * The `EXCLUDE USING gist` constraint that replaces the index above (Task 4
 * of the booking-seams repair plan). Named rather than a string this file
 * only half-owns, same reasoning as `SLOT_COLLISION_CONSTRAINT` — see
 * `isSlotCollision` for why the name has to match exactly.
 */
const SLOT_OVERLAP_CONSTRAINT = "booking_member_slot_no_overlap";

/**
 * postgres.js surfaces a unique violation as SQLSTATE `23505` and an
 * exclusion-constraint violation as `23P01` — different codes for a reason
 * that matters here: a unique index and an `EXCLUDE` constraint are
 * different Postgres objects, and the two-argument message ("could not
 * create unique index" vs. "conflicts with existing key") is not an API
 * either — a Postgres upgrade is free to reword it without changing the code
 * or the constraint name, and matching on message text is how a handled case
 * turns into a 500. Both fields — `code` and `constraint_name` — are checked
 * together for both constraints, not a substring of either message.
 *
 * `booking.schema.ts`'s table config no longer declares
 * `booking_member_slot_active_uq` — the exclusion constraint subsumes it,
 * since an identical start is a degenerate overlap. It stays checked here
 * anyway because migrations in this repository are applied by hand, per
 * stage: this code can ship before the migration that drops the old index
 * and adds the new constraint is actually run, and until it is, the live
 * database still raises `23505` against the old name for exactly the
 * collision this function exists to catch. Dropping this branch the day the
 * schema file changed — rather than the day every stage's database is
 * confirmed migrated — is how an honest race turns into a 500.
 *
 * Checks the code *and* the name for each constraint, not the name alone:
 * `constraint_name` is only meaningful once `code` has already established
 * which kind of violation this is. A `23505` or `23P01` from some other
 * constraint (there is none on this table today) is a real conflict too,
 * just not this one, and must surface as itself rather than being
 * relabelled `SlotAlreadyTakenError`.
 */
function isSlotCollision(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  const constraintName = (error as { constraint_name?: unknown }).constraint_name;
  return (
    (code === "23505" && constraintName === SLOT_COLLISION_CONSTRAINT) ||
    (code === "23P01" && constraintName === SLOT_OVERLAP_CONSTRAINT)
  );
}

/**
 * The columns that move together on every write, insert or update alike.
 *
 * `id`, `createdAt` and `updatedAt` are deliberately absent: the first two
 * are the database's to assign and never the caller's to overwrite, and the
 * third is stamped explicitly by `save` (a column default only fires on
 * `INSERT`, never on `UPDATE` — see `review.repository.ts`'s `upsert` for
 * the same reasoning).
 *
 * `addressLat`/`addressLng` are the one place this mapping isn't a straight
 * copy: the column is `text` (`booking.schema.ts` matches
 * `address.schema.ts`'s own choice there), but the aggregate's snapshot
 * types them `number | null` — a booking's coordinates are meant to be
 * arithmetic, not a string the address VO merely stores. Converted here, at
 * the one seam that has to know both shapes.
 */
function toRow(entity: Booking): Omit<NewBookingRow, "id" | "createdAt" | "updatedAt"> {
  return {
    customerId: entity.customerId,
    providerId: entity.providerId,
    serviceId: entity.serviceId,
    serviceOptionId: entity.serviceOptionId,
    providerMemberId: entity.providerMemberId,
    startsAt: entity.startsAt,
    endsAt: entity.endsAt,
    durationMinutes: entity.durationMinutes,
    status: entity.status,
    expiresAt: entity.expiresAt,
    paidAt: entity.paidAt,
    paymentRef: entity.paymentRef,
    confirmedAt: entity.confirmedAt,
    declinedAt: entity.declinedAt,
    cancelledAt: entity.cancelledAt,
    markedDoneAt: entity.markedDoneAt,
    completedAt: entity.completedAt,
    disputedAt: entity.disputedAt,
    expiredAt: entity.expiredAt,
    priceMinor: entity.priceMinor,
    commissionBps: entity.commissionBps,
    commissionMinor: entity.commissionMinor,
    currency: entity.currency,
    serviceName: entity.serviceName,
    providerName: entity.providerName,
    providerSlug: entity.providerSlug,
    optionName: entity.optionName,
    addressLabel: entity.addressLabel,
    addressLine: entity.addressLine,
    addressCity: entity.addressCity,
    addressDistrict: entity.addressDistrict,
    addressDirections: entity.addressDirections,
    addressLat: entity.addressLat === null ? null : String(entity.addressLat),
    addressLng: entity.addressLng === null ? null : String(entity.addressLng),
    description: entity.description,
  };
}

/**
 * Turns a stored row back into an aggregate through `Booking.restore`,
 * never the private constructor and never a cast. `restore` re-runs every
 * guard `create` runs, plus the two consistency checks on `endsAt` and
 * `commissionMinor` — see its own doc comment. This function does no
 * validation of its own; it only reshapes columns into the props `restore`
 * expects, so that every read still goes through the one seam that checks a
 * row agrees with itself.
 */
function toAggregate(row: BookingRow): Booking {
  return Booking.restore({
    id: row.id,
    customerId: row.customerId,
    providerId: row.providerId,
    serviceId: row.serviceId,
    serviceOptionId: row.serviceOptionId,
    providerMemberId: row.providerMemberId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    durationMinutes: row.durationMinutes,
    // `status` is `text` in the database, kept honest by the
    // `booking_status_known` CHECK constraint rather than a Postgres enum —
    // see `booking.schema.ts`. That constraint is what makes this cast
    // safe: a row that reaches this function already had its status
    // validated against `BOOKING_STATUSES` by Postgres, at write time.
    status: row.status as BookingStatus,
    expiresAt: row.expiresAt,
    paidAt: row.paidAt,
    paymentRef: row.paymentRef,
    confirmedAt: row.confirmedAt,
    declinedAt: row.declinedAt,
    cancelledAt: row.cancelledAt,
    markedDoneAt: row.markedDoneAt,
    completedAt: row.completedAt,
    disputedAt: row.disputedAt,
    expiredAt: row.expiredAt,
    priceMinor: row.priceMinor,
    commissionBps: row.commissionBps,
    commissionMinor: row.commissionMinor,
    currency: row.currency,
    serviceName: row.serviceName,
    providerName: row.providerName,
    providerSlug: row.providerSlug,
    optionName: row.optionName,
    addressLabel: row.addressLabel,
    addressLine: row.addressLine,
    addressCity: row.addressCity,
    addressDistrict: row.addressDistrict,
    addressDirections: row.addressDirections,
    addressLat: row.addressLat === null ? null : Number(row.addressLat),
    addressLng: row.addressLng === null ? null : Number(row.addressLng),
    description: row.description,
  });
}

export class DrizzleBookingRepository implements BookingRepositoryPort {
  /**
   * `entity`, not `booking` — the parameter name the port declares — because
   * this file also imports the `booking` table. Same convention as
   * `service.repository.ts`'s `save(aggregate: Service)`, for the same
   * reason: TypeScript doesn't require parameter names to match an
   * interface's, and a name here that shadowed the table import would make
   * the table unreachable inside the method body.
   */
  async insert(entity: Booking): Promise<Booking> {
    try {
      const [row] = await getDb().insert(booking).values(toRow(entity)).returning();
      // `.returning()` with no column list always yields exactly one row for
      // exactly one values() row on a single-statement insert; the `!` is a
      // fact about that shape, not an assumption about the data.
      return toAggregate(row!);
    } catch (error) {
      if (isSlotCollision(error)) {
        throw new SlotAlreadyTakenError(entity.providerMemberId, entity.startsAt);
      }
      throw error;
    }
  }

  async findById(id: string): Promise<Booking | null> {
    const [row] = await getDb().select().from(booking).where(eq(booking.id, id)).limit(1);
    return row ? toAggregate(row) : null;
  }

  async save(entity: Booking): Promise<void> {
    // Never null here: `BookingRepositoryPort.save`'s contract is that the
    // aggregate it is handed already has an id — every caller loads it
    // through `findById` first (see `ExpireBookingCommand`,
    // `MarkBookingPaidCommand`), which only ever returns a booking the
    // database already assigned one to.
    const id = entity.id as string;
    await getDb()
      .update(booking)
      .set({ ...toRow(entity), updatedAt: new Date() })
      .where(eq(booking.id, id));
  }

  async appendChange(change: BookingChangeRecord): Promise<void> {
    await getDb().insert(bookingChange).values({
      bookingId: change.bookingId,
      changedByUserId: change.changedByUserId,
      reason: change.reason,
      previousStartsAt: change.previousStartsAt,
      previousEndsAt: change.previousEndsAt,
      previousProviderMemberId: change.previousProviderMemberId,
      previousPriceMinor: change.previousPriceMinor,
    });
  }

  /**
   * `PENDING_PAYMENT` only, not every slot-holding status: a paid booking
   * (`AWAITING_PROVIDER`, `CONFIRMED`, `MARKED_DONE`) still holds its slot
   * but has already taken the customer's money, and expiring it would
   * cancel a sale that already happened. `expires_at IS NOT NULL` is
   * belt-and-braces on top of the status filter, not a second filter doing
   * real work: `Booking`'s transitions null it out on every path leaving
   * `PENDING_PAYMENT` (see `markPaid` and `expire`), so nothing in the
   * status should ever have a null `expiresAt` — the guard exists in case a
   * row somehow does anyway.
   *
   * Oldest deadline first, so a sweep that can only process part of a
   * backlog drains it in the order it accumulated rather than starving
   * whichever booking has been waiting longest.
   */
  async findDueForExpiry(now: Date, limit: number): Promise<Booking[]> {
    const rows = await getDb()
      .select()
      .from(booking)
      .where(
        and(
          eq(booking.status, BookingStatus.PendingPayment),
          isNotNull(booking.expiresAt),
          lte(booking.expiresAt, now),
        ),
      )
      .orderBy(asc(booking.expiresAt))
      .limit(limit);
    return rows.map(toAggregate);
  }
}
