import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { localDateAt } from "@ntizo/shared/datetime";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  booking,
  bookingChange,
  type BookingRow,
  type NewBookingRow,
} from "../../../../../shared/infrastructure/database/booking/schemas";
import {
  BookingStatus,
  DEADLINE_BEARING_STATUSES,
  SLOT_HOLDING_STATUSES,
} from "../../../../../shared/infrastructure/database/booking/enums";
import { provider } from "../../../../../shared/infrastructure/database/provider/schemas";
import { Booking } from "../../../domain/aggregates/booking.aggregate";
import { SlotAlreadyTakenError } from "../../../domain/exceptions";
import type {
  BookingChangeRecord,
  BookingRepositoryPort,
} from "../../../app/ports/outbound/booking.repository.port";

const MS_PER_DAY = 86_400_000;

/**
 * The second key of `pg_advisory_xact_lock`'s two-int form for
 * `findOpenDraftForCustomer`'s lock — a namespace, not a value.
 *
 * Negative on purpose. The other advisory lock in this file, `insert`'s seat
 * assignment, passes a civil day number in that position, and both share one
 * key space. Day numbers are days since the epoch, so positive for every date
 * this platform can book; a negative namespace therefore cannot be mistaken
 * for one. Without that separation, a customer id that happened to hash to
 * the same `int` as a provider member id would serialise two transactions
 * with nothing to do with each other — harmless to correctness, invisible,
 * and slow.
 */
const CUSTOMER_DRAFT_LOCK_NAMESPACE = -1;

/**
 * The civil day `instant` falls on in `timezone`, as an integer count of
 * days since the epoch — small enough for `pg_advisory_xact_lock`'s `int`
 * key, and derived through `localDateAt`, the same conversion
 * `DrizzleBookingBusyAdapter` uses for its own civil-date splitting, so the
 * two cannot silently disagree at a DST boundary or a fractional UTC offset.
 * A lock keyed on a UTC day would serialise the wrong pairs of customers
 * near local midnight — see `insert`'s own comment on the lock.
 */
function civilDayNumber(timezone: string, instant: Date): number {
  const isoDate = localDateAt(timezone, instant);
  return Math.floor(Date.parse(`${isoDate}T00:00:00.000Z`) / MS_PER_DAY);
}

/**
 * The lowest seat number not occupied by an overlapping slot-holding booking
 * on `providerMemberId` — see `booking.schema.ts`'s comment on the `seat`
 * column for why lowest-free rather than any-free: it is what makes a
 * capacity *reduction* self-correcting. Drop capacity from 3 to 1 while
 * seats 2 and 3 are occupied, and the lowest free seat is still 2 — which
 * exceeds the new capacity — so nothing new joins, while an any-free
 * assignment could still have handed out seat 2 or 3 to a newcomer the
 * moment either happened to look free.
 *
 * Must run after the advisory lock is held (see `insert`) and inside the
 * same transaction as the write that follows it: reading occupancy before
 * the lock, or in a different transaction than the insert, is exactly the
 * window the lock exists to close.
 */
async function lowestFreeSeat(
  db: ReturnType<typeof getDb>,
  providerMemberId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<number> {
  const occupied = await db
    .select({ seat: booking.seat })
    .from(booking)
    .where(
      and(
        eq(booking.providerMemberId, providerMemberId),
        // The same list the exclusion constraint's WHERE is built from (by
        // hand, in the migration — see that constant's own comment): a
        // status this misses is a status the constraint also stopped
        // protecting.
        inArray(booking.status, [...SLOT_HOLDING_STATUSES]),
        lt(booking.startsAt, endsAt),
        gt(booking.endsAt, startsAt),
      ),
    );
  const takenSeats = new Set(occupied.map((row) => row.seat));
  let seat = 1;
  while (takenSeats.has(seat)) seat += 1;
  return seat;
}

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
    remindedAt: entity.remindedAt,
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
    remindedAt: row.remindedAt,
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
   *
   * **Assigns the seat under a transaction-scoped advisory lock.** Three
   * statements, run in this exact order, all against `getDb()` — the active
   * transaction handle, whichever one the caller already opened
   * (`CreateBookingCommand`'s `unitOfWork.atomicExecute`). This method does
   * *not* open its own transaction: a lock taken outside a real transaction
   * releases the instant its own statement finishes, protecting nothing —
   * see `booking-seat-assignment.test.ts`'s proof-of-life test for exactly
   * that failure, captured with the lock removed.
   *
   * 1. `pg_advisory_xact_lock(hashtext(providerMemberId), civilDay)` —
   *    taken *before* anything is read, so no window exists between
   *    deciding a seat and taking it. Transaction-scoped (`_xact_`), so it
   *    releases on commit or rollback with no `finally` to forget.
   *    `hashtext` turns the member id into the `int` key the two-argument
   *    form wants; the civil day needs no hash, it is already a small
   *    integer. Keyed per member *per civil day*, not per member alone, so
   *    two customers booking the same person on different days never wait
   *    on each other — see `civilDayNumber` for why the day is read in the
   *    provider's own timezone rather than UTC.
   * 2. `lowestFreeSeat` reads current occupancy and refuses with
   *    `SlotAlreadyTakenError` if the lowest free seat exceeds `capacity`.
   * 3. The insert itself, with the assigned seat. `isSlotCollision` stays as
   *    the backstop it always was: the lock is what stops the race from
   *    happening, the exclusion constraint is what makes it impossible for
   *    the race to matter if the lock is ever bypassed — a backfill, a
   *    manual `INSERT`, or a future code path that forgets.
   */
  async insert(entity: Booking, capacity: number): Promise<Booking> {
    const db = getDb();

    // The provider's own clock, not UTC — read fresh per call rather than
    // trusted from the caller, the same reasoning `DrizzleBookingBusyAdapter`
    // gives for reading a provider's timezone per row rather than assuming
    // one. `provider.timezone` is NOT NULL with a default, and
    // `CreateBookingCommand` already resolved this exact provider through
    // `ProviderSnapshotReaderPort` before `Booking.create` ever ran, so this
    // row cannot really be missing here — the `"UTC"` fallback only guards
    // against a broken foreign key degrading gracefully instead of throwing
    // a `TypeError` deep inside `localDateAt`.
    const [providerRow] = await db
      .select({ timezone: provider.timezone })
      .from(provider)
      .where(eq(provider.id, entity.providerId))
      .limit(1);
    const timezone = providerRow?.timezone ?? "UTC";

    await db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${entity.providerMemberId}), ${civilDayNumber(timezone, entity.startsAt)})`,
    );

    const seat = await lowestFreeSeat(db, entity.providerMemberId, entity.startsAt, entity.endsAt);
    if (seat > capacity) {
      throw new SlotAlreadyTakenError(entity.providerMemberId, entity.startsAt);
    }

    try {
      const [row] = await db
        .insert(booking)
        .values({ ...toRow(entity), seat })
        .returning();
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

  /**
   * `DRAFT` is the whole status filter, and it is also the whole "still
   * holding a slot on nothing but a countdown" test: every other
   * slot-holding status has somebody standing behind it — a provider asked,
   * a provider who said yes, a payment that cleared — and none of them is a
   * hold this customer may be made to give up by picking a different time.
   *
   * Ordered and limited even though the rule this backs is what keeps a
   * customer down to one draft. Rows predating that rule can still exist,
   * and a bare `limit(1)` over several of them would return whichever the
   * planner reached first — a query whose answer changes between runs. The
   * oldest is the honest one to expire first: it is the hold that has been
   * blocking a provider's calendar the longest.
   *
   * **Takes an advisory lock on the customer before reading**, the same
   * mechanism and the same reasoning as `insert`'s seat assignment one file
   * down: a `SELECT` with no lock behind it answers a question that can stop
   * being true before the caller acts on it. Two concurrent creates for one
   * customer would both read "no open draft" and both insert, and the
   * customer would hold two slots — the exact state
   * `CreateBookingCommand`'s rule is named for preventing. See
   * `BookingRepositoryPort.findOpenDraftForCustomer` for why serialising is
   * better than a unique index here, and why the caller's compare-and-swap
   * is still needed anyway.
   *
   * `_xact_`, so it releases at commit rather than needing an explicit
   * unlock — and so it protects nothing at all outside a real transaction,
   * where every statement autocommits. `CreateBookingCommand` calls this as
   * the first statement inside its `atomicExecute`, which is what makes the
   * lock span the read, the supersede and the insert that follows.
   *
   * **Lock ordering is consistent with `insert`'s and cannot deadlock
   * against it:** every path takes the customer lock here first and the
   * member/day lock later, never the reverse, so two transactions can queue
   * on each other but never form a cycle.
   */
  async findOpenDraftForCustomer(customerId: string): Promise<Booking | null> {
    const db = getDb();

    await db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${customerId}), ${CUSTOMER_DRAFT_LOCK_NAMESPACE})`,
    );

    const [row] = await db
      .select()
      .from(booking)
      .where(and(eq(booking.customerId, customerId), eq(booking.status, BookingStatus.Draft)))
      .orderBy(asc(booking.createdAt))
      .limit(1);
    return row ? toAggregate(row) : null;
  }

  /**
   * `expectedStatus` in the `WHERE`, not just `id` — see
   * `BookingRepositoryPort.save`'s own comment for the race this defends
   * against. Without it this was a plain `UPDATE … WHERE id = $1`: whichever
   * of a payment webhook and the sweep wrote second would win
   * unconditionally, silently overwriting the first writer's transition
   * (and its already-drained outbox row) with its own.
   *
   * `.returning({ id: booking.id })` rather than a bare `UPDATE`, so the
   * caller can tell "matched and wrote" from "matched nothing" without a
   * second round trip: zero rows back means the predicate didn't match —
   * either this id doesn't exist (shouldn't happen given `save`'s contract,
   * see below) or, the case this method exists for, `status` had already
   * moved past `expectedStatus` by the time this `UPDATE` actually ran.
   */
  async save(entity: Booking, expectedStatus: Booking["status"]): Promise<boolean> {
    // Never null here: `BookingRepositoryPort.save`'s contract is that the
    // aggregate it is handed already has an id — every caller loads it
    // through `findById` first (see `SweepBookingCommand`,
    // `MarkBookingPaidCommand`), which only ever returns a booking the
    // database already assigned one to.
    const id = entity.id as string;
    const rows = await getDb()
      .update(booking)
      .set({ ...toRow(entity), updatedAt: new Date() })
      .where(and(eq(booking.id, id), eq(booking.status, expectedStatus)))
      .returning({ id: booking.id });
    return rows.length > 0;
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
   * `DEADLINE_BEARING_STATUSES`, not every slot-holding status and no
   * longer `PENDING_PAYMENT` alone: the design's three clocks all stamp
   * this one column, so the three windows are already baked into
   * `expires_at` by the time this query sees the row and the whole
   * difference between them is which status the row is in. One predicate
   * answers all three — see `BookingRepositoryPort.findDueForSweep` for
   * why that is not three queries, and `DEADLINE_BEARING_STATUSES` for why
   * that list is not `SLOT_HOLDING_STATUSES`.
   *
   * `CONFIRMED` and `MARKED_DONE` are what the status filter is keeping
   * out, and it is the only thing keeping them out: both still hold the
   * slot, and both still carry the `expires_at` they were given, because
   * `markPaid` deliberately stopped nulling it (see `BookingProps.expiresAt`).
   * A sweep that trusted `expires_at` alone would cancel sales that already
   * completed.
   *
   * `expires_at IS NOT NULL` is belt-and-braces on top of that, not a
   * second filter doing real work: `Booking.create` always sets it and no
   * transition nulls it afterward, so a deadline-bearing row can never
   * actually have a null here for this filter to need. The guard exists in
   * case one somehow does anyway.
   *
   * Oldest deadline first, so a sweep that can only process part of a
   * backlog drains it in the order it accumulated rather than starving
   * whichever booking has been waiting longest.
   */
  async findDueForSweep(now: Date, limit: number): Promise<Booking[]> {
    const rows = await getDb()
      .select()
      .from(booking)
      .where(
        and(
          inArray(booking.status, [...DEADLINE_BEARING_STATUSES]),
          isNotNull(booking.expiresAt),
          lte(booking.expiresAt, now),
        ),
      )
      .orderBy(asc(booking.expiresAt))
      .limit(limit);
    return rows.map(toAggregate);
  }

  /**
   * `expires_at > now`, and that inequality is the whole relationship
   * between this query and `findDueForSweep` above.
   *
   * The two run in the same cron invocation against the same column, and
   * they must never both claim the same row: one is about to cancel the
   * booking and tell the provider the customer never paid, the other is
   * about to ask that customer for money. Written as strict `>` against the
   * other's `<=`, so the boundary instant belongs to exactly one of them —
   * the deadline sweep, which is the right answer, because a booking whose
   * window has closed is not one to charge.
   *
   * `isNull(lastChargeAttemptAt)` is a real branch here, unlike
   * `findDueForSweep`'s belt-and-braces null guard: a booking accepted and
   * never yet charged genuinely has none, and it is the common case this
   * query exists to find.
   */
  async findAwaitingCharge(criteria: {
    deadlineAfter: Date;
    limit: number;
    maxAttempts: number;
    notAttemptedSince: Date;
  }): Promise<Booking[]> {
    const rows = await getDb()
      .select()
      .from(booking)
      .where(
        and(
          eq(booking.status, BookingStatus.PendingPayment),
          lt(booking.chargeAttempts, criteria.maxAttempts),
          or(
            isNull(booking.lastChargeAttemptAt),
            lte(booking.lastChargeAttemptAt, criteria.notAttemptedSince),
          ),
          isNotNull(booking.expiresAt),
          gt(booking.expiresAt, criteria.deadlineAfter),
        ),
      )
      .orderBy(asc(booking.expiresAt))
      .limit(criteria.limit);
    return rows.map(toAggregate);
  }

  /**
   * The claim, and the reason it is an `UPDATE … WHERE <the whole selection
   * predicate>` rather than `WHERE id = $1`.
   *
   * The three conditions below are the same three `findAwaitingCharge`
   * selected on, re-evaluated at the moment of the write. Under READ
   * COMMITTED an `UPDATE` carrying them blocks on the row lock if a
   * concurrent wave got there first, then re-evaluates against the row that
   * wave actually committed — so the loser's `WHERE` no longer matches, it
   * updates zero rows, and `null` comes back instead of a second prompt on a
   * handset that is already showing one. Exactly the mechanism
   * `save(booking, expectedStatus)` uses, applied to a different predicate;
   * see this method's own port comment for the two-wave trace that makes it
   * necessary rather than defensive.
   *
   * `charge_attempts = charge_attempts + 1` in the database, not in this
   * process, so the number that comes back is genuinely this attempt's and
   * two waves can never derive the same payment reference.
   *
   * **Zero rows is not an error here**, which is why this no longer raises
   * `BookingNotFoundError`. It is the ordinary answer to "somebody else has
   * this booking" — the row moved on, was charged by another wave, or
   * exhausted its bound between the select and now — and the caller treats it
   * the same way it treats a losing `save`: return, silently, having charged
   * nobody. A vanished row is indistinguishable from those and equally not
   * worth a throw: the caller has already read the booking through `findById`
   * one statement earlier.
   */
  async recordChargeAttempt(claim: {
    bookingId: string;
    at: Date;
    maxAttempts: number;
    notAttemptedSince: Date;
    deadlineAfter: Date;
  }): Promise<number | null> {
    const [row] = await getDb()
      .update(booking)
      .set({
        chargeAttempts: sql`${booking.chargeAttempts} + 1`,
        lastChargeAttemptAt: claim.at,
        updatedAt: claim.at,
      })
      .where(
        and(
          eq(booking.id, claim.bookingId),
          eq(booking.status, BookingStatus.PendingPayment),
          lt(booking.chargeAttempts, claim.maxAttempts),
          or(
            isNull(booking.lastChargeAttemptAt),
            lte(booking.lastChargeAttemptAt, claim.notAttemptedSince),
          ),
          // The criterion the first version of this method left out, and the
          // only one whose absence could lose a customer's money outright:
          // a booking whose payment window closes while the call is still
          // blocking is cancelled by the deadline sweep, and then paid for.
          // See the port's own comment for the minute-by-minute sequence.
          isNotNull(booking.expiresAt),
          gt(booking.expiresAt, claim.deadlineAfter),
        ),
      )
      .returning({ chargeAttempts: booking.chargeAttempts });
    return row?.chargeAttempts ?? null;
  }

  /**
   * `GREATEST`, not an assignment — see the port. A bound lowered between
   * deploys must not turn "never charge this again" back into "charge it
   * once more".
   *
   * Unconditional on purpose: this is called after a charge whose outcome we
   * could not read, and it has to take effect whatever the row now says. A
   * predicate here could only ever leave a booking retryable that must not
   * be.
   */
  async abandonCharge(abandonment: {
    bookingId: string;
    at: Date;
    maxAttempts: number;
  }): Promise<void> {
    await getDb()
      .update(booking)
      .set({
        chargeAttempts: sql`greatest(${booking.chargeAttempts}, ${abandonment.maxAttempts})`,
        lastChargeAttemptAt: abandonment.at,
        updatedAt: abandonment.at,
      })
      .where(eq(booking.id, abandonment.bookingId));
  }
}
