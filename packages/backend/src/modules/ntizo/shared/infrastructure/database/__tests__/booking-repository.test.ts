/**
 * `DrizzleBookingRepository` against the real dev database, same reason and
 * same mechanism as `activity.repository.test.ts` and
 * `booking-constraints.test.ts`: the repository reaches the database through
 * `getDb()`, which resolves through the app's request-scoped
 * AsyncLocalStorage context — and a test has no request.
 * `__runWithTransactionContextForTests` binds this file's own real,
 * `DEV_DB_URL`-backed Drizzle client into that same context for the duration
 * of one test body, for every test except the rollback test below, which
 * needs a *real* transaction rather than a bound connection — see its own
 * comment for why it is wired differently.
 *
 * Fixtures follow `booking-constraints.test.ts`'s pattern exactly: one
 * provider and one provider member, created fresh under a random `suffix` in
 * `beforeAll`, so this run's `providerMemberId` cannot collide with another
 * worktree's or another session's concurrent run on
 * `booking_member_slot_active_uq`. Within this file, tests that share that
 * one member use distinct `startsAt` values to avoid colliding with each
 * other.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, sql as sqlExpr } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../../shared/infrastructure/database/tx-context";
import { Db } from "../../../../../../shared/infrastructure/database/connection";
import { infraStore } from "../../../../../../shared/infrastructure/stores/infra-store";
import { DrizzleUnitOfWork } from "../../../../../../shared/infrastructure/unit-of-work";
import { category } from "../catalog/schemas/category.schema";
import { service, serviceOption } from "../catalog/schemas/service.schema";
import { provider } from "../provider/schemas/provider.schema";
import { providerMember } from "../provider/schemas/provider-member.schema";
import { user } from "../user/schemas/user.schema";
import { booking } from "../booking/schemas/booking.schema";
import { bookingChange } from "../booking/schemas/booking-change.schema";
import { Booking } from "../../../../bounded-contexts/booking/domain/aggregates/booking.aggregate";
import { SlotAlreadyTakenError } from "../../../../bounded-contexts/booking/domain/exceptions";
import { DrizzleBookingRepository } from "../../../../bounded-contexts/booking/infrastructure/repositories/drizzle/booking.repository";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "./dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
// `{ schema: authSchema }`, not a bare `drizzle(sql)`: `DrizzleDb` (what
// `__runWithTransactionContextForTests` binds into AsyncLocalStorage) is
// typed against this schema shape — same requirement as
// `activity.repository.test.ts`, even though nothing queried here belongs to
// that schema.
const db = drizzle(sql, { schema: authSchema });

const repo = new DrizzleBookingRepository();
const suffix = crypto.randomUUID();

let customerId: string;
let ownerUserId: string;
let providerId: string;
let memberId: string;
let categoryId: string;
let serviceId: string;
let serviceOptionId: string;

beforeAll(async () => {
  customerId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  await db.insert(user).values([
    {
      id: customerId,
      email: `booking-repo-customer-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: ownerUserId,
      email: `booking-repo-owner-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
  ]);

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "Booking Repository Test Provider",
      slug: `booking-repo-test-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  providerId = providerRow!.id;

  const [memberRow] = await db
    .insert(providerMember)
    .values({ providerId, userId: ownerUserId, role: "owner" })
    .returning({ id: providerMember.id });
  memberId = memberRow!.id;

  const [categoryRow] = await db
    .insert(category)
    .values({ code: `booking-repo-test-${suffix}` })
    .returning({ id: category.id });
  categoryId = categoryRow!.id;

  const [serviceRow] = await db
    .insert(service)
    .values({
      providerId,
      categoryId,
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
      status: "published",
    })
    .returning({ id: service.id });
  serviceId = serviceRow!.id;

  const [optionRow] = await db
    .insert(serviceOption)
    .values({
      serviceId,
      pricingMode: "fixed",
      amountMinor: 100_000,
      durationMinutes: 60,
    })
    .returning({ id: serviceOption.id });
  serviceOptionId = optionRow!.id;
});

afterAll(async () => {
  // Same ordering discipline as `booking-constraints.test.ts`: children
  // first, and scoped to `providerId` rather than a tracked id list, so a
  // booking this file inserted but never got to track (an assertion that
  // threw partway through a test) is still cleaned up.
  await bestEffortCleanup([
    () =>
      db.delete(bookingChange).where(
        sqlExpr`${bookingChange.bookingId} IN (SELECT ${booking.id} FROM ${booking} WHERE ${booking.providerId} = ${providerId})`,
      ),
    () => db.delete(booking).where(eq(booking.providerId, providerId)),
    () => db.delete(serviceOption).where(eq(serviceOption.id, serviceOptionId)),
    () => db.delete(service).where(eq(service.id, serviceId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(user).where(eq(user.id, customerId)),
    () => db.delete(user).where(eq(user.id, ownerUserId)),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

/** Every `Booking.create` input this file needs, with a distinct slot per call. */
function bookingInput(
  overrides: Partial<Parameters<typeof Booking.create>[0]> = {},
): Parameters<typeof Booking.create>[0] {
  return {
    customerId,
    providerId,
    serviceId,
    serviceOptionId,
    providerMemberId: memberId,
    startsAt: new Date("2026-10-01T09:00:00.000Z"),
    durationMinutes: 60,
    priceMinor: 100_000,
    commissionBps: 1000,
    currency: "MZN",
    serviceName: "Corte de Cabelo",
    providerName: "Booking Repository Test Provider",
    providerSlug: `booking-repo-test-${suffix}`,
    optionName: "Standard",
    addressLabel: "Salão",
    addressLine: "Av. Julius Nyerere 123",
    addressCity: "Maputo",
    addressDistrict: "Sommerschield",
    addressDirections: "Portão azul, tocar a campainha",
    addressLat: -25.9655,
    addressLng: 32.5832,
    description: "Corte simples, sem barba",
    expiresAt: new Date("2026-10-01T09:30:00.000Z"),
    ...overrides,
  };
}

/**
 * A booking as this file needs it for everything below `insert, then
 * findById`: `PENDING_PAYMENT`, with `expiresAt` fixed to exactly the value
 * the caller configured.
 *
 * `Booking.create` alone no longer reaches `PENDING_PAYMENT` — it produces
 * `DRAFT` now, the reversal Task 3 of the payment-and-confirmation-order
 * plan built — so this threads through `submit` and `accept` the way a real
 * booking does. `submit`'s `respondBy` and `accept`'s `payBy` are both
 * meaningless to this file's assertions, so `input.expiresAt` is reused for
 * both rather than inventing two dates nothing here reads back — only the
 * final, post-`accept` value matters, and it lands exactly where
 * `bookingInput` put it.
 */
function pendingBooking(input: Parameters<typeof Booking.create>[0]): Booking {
  const draft = Booking.create(input);
  return draft.submit(new Date(), input.expiresAt, requiredAddress(draft), null).accept(new Date(), input.expiresAt);
}

/**
 * The middle of the design's first three clocks: a request sent, waiting on the provider,
 * with `expiresAt` left at exactly the value the caller configured — the
 * same reuse of one date `pendingBooking` makes, and for the same reason.
 */
function awaitingBooking(input: Parameters<typeof Booking.create>[0]): Booking {
  const draft = Booking.create(input);
  return draft.submit(new Date(), input.expiresAt, requiredAddress(draft), null);
}

/**
 * `submit` now takes the address explicitly rather than reading it off the
 * draft it already carries. Every `bookingInput` in this file sets a
 * concrete address, so pulling it back off the draft — rather than
 * inventing a second copy here — is what keeps `addressLabel` etc. exactly
 * the value this file's round-trip assertions expect.
 */
function requiredAddress(b: Booking) {
  return { label: b.addressLabel as string, line: b.addressLine as string, city: b.addressCity as string };
}

/**
 * Runs one test body inside this file's transaction context and deletes
 * every booking it registered afterwards — **in a `finally`, so an assertion
 * that throws mid-test still cleans up.**
 *
 * Every test here used to end with its own `db.delete(...)` calls after its
 * last assertion, which is a cleanup any earlier assertion can skip. That
 * shape has already cost this branch once: a leaked `PENDING_PAYMENT` row
 * with a non-null `expires_at` was picked up by `findDueForSweep` in two
 * later, unrelated-looking tests. It matters more now than it did then,
 * because that query no longer selects one status — a leaked `DRAFT` or
 * `AWAITING_PROVIDER` row is claimed by it too, here and in
 * `booking-sweep.test.ts`.
 *
 * `afterAll`'s delete-by-`providerId` is not the same net: it runs once, at
 * the end of the file, long after the tests a leak would have poisoned.
 *
 * Deleting the booking is enough for its `booking_change` rows —
 * `booking_change.booking_id` is `ON DELETE CASCADE` (see its schema).
 */
async function withBookings(
  body: (track: (created: Booking) => Booking) => Promise<void>,
): Promise<void> {
  const ids: string[] = [];
  await __runWithTransactionContextForTests(db, async () => {
    try {
      await body((created) => {
        ids.push(created.id as string);
        return created;
      });
    } finally {
      for (const id of ids) {
        await db.delete(booking).where(eq(booking.id, id));
      }
    }
  });
}

/**
 * Every field `Booking.restore` did not derive — i.e. every field a round
 * trip could lose.
 *
 * `confirmedAt` is no longer one of the fields this function can only ever
 * compare null-to-null: the round-trip test below builds its fixture
 * through `pendingBooking()` (above), which calls `submit` then `accept`,
 * so `confirmedAt` carries a real, non-null value that a mis-mapping could
 * actually lose. `declinedAt`, `cancelledAt`, `markedDoneAt`, `completedAt`
 * and `disputedAt` remain compared as null-to-null on every booking this
 * file builds — not because `Booking` still lacks the transitions
 * (`decline` exists now too), but because a single booking cannot pass
 * through both `accept` and `decline`, and a second, decline-shaped fixture
 * here would only re-prove the same round-trip mechanism `booking.aggregate.test.ts`
 * already covers for `decline`'s own behaviour. `cancelledAt`,
 * `markedDoneAt`, `completedAt` and `disputedAt` are still genuinely
 * unreachable: `Booking` has no `cancel`/`markDone`/`complete`/`dispute`
 * transition yet, so there is still no public way to give any of them a
 * real value. A null-to-null comparison still catches a `toRow`/`toAggregate`
 * mapping bug that aliases one of these five to some unrelated non-null
 * column (proven below, in the mis-mapping check this file's commit
 * message points at), even though it cannot distinguish one of the five
 * from another of the same five — both would still read back null either
 * way.
 *
 * Every timestamp field is compared by `.toISOString()`, not `.toBe()`:
 * two `Date` instances naming the same moment are never `===`, so a bare
 * `toBe()` only ever happened to pass here because every one of these
 * fields was null on both sides until `confirmedAt` stopped being one of
 * them — the same reasoning `startsAt`, `endsAt`, `expiresAt` and
 * `expiredAt` already used this comparison for below.
 */
function expectSameSnapshot(actual: Booking, expected: Booking): void {
  expect(actual.customerId).toBe(expected.customerId);
  expect(actual.providerId).toBe(expected.providerId);
  expect(actual.serviceId).toBe(expected.serviceId);
  expect(actual.serviceOptionId).toBe(expected.serviceOptionId);
  expect(actual.providerMemberId).toBe(expected.providerMemberId);
  expect(actual.startsAt.toISOString()).toBe(expected.startsAt.toISOString());
  expect(actual.endsAt.toISOString()).toBe(expected.endsAt.toISOString());
  expect(actual.durationMinutes).toBe(expected.durationMinutes);
  expect(actual.status).toBe(expected.status);
  expect(actual.expiresAt?.toISOString() ?? null).toBe(expected.expiresAt?.toISOString() ?? null);
  expect(actual.paidAt?.toISOString() ?? null).toBe(expected.paidAt?.toISOString() ?? null);
  expect(actual.paymentRef).toBe(expected.paymentRef);
  expect(actual.confirmedAt?.toISOString() ?? null).toBe(expected.confirmedAt?.toISOString() ?? null);
  expect(actual.declinedAt?.toISOString() ?? null).toBe(expected.declinedAt?.toISOString() ?? null);
  expect(actual.cancelledAt?.toISOString() ?? null).toBe(expected.cancelledAt?.toISOString() ?? null);
  expect(actual.markedDoneAt?.toISOString() ?? null).toBe(expected.markedDoneAt?.toISOString() ?? null);
  expect(actual.completedAt?.toISOString() ?? null).toBe(expected.completedAt?.toISOString() ?? null);
  expect(actual.disputedAt?.toISOString() ?? null).toBe(expected.disputedAt?.toISOString() ?? null);
  expect(actual.expiredAt?.toISOString() ?? null).toBe(expected.expiredAt?.toISOString() ?? null);
  expect(actual.priceMinor).toBe(expected.priceMinor);
  expect(actual.commissionBps).toBe(expected.commissionBps);
  expect(actual.commissionMinor).toBe(expected.commissionMinor);
  expect(actual.providerPayoutMinor).toBe(expected.providerPayoutMinor);
  expect(actual.currency).toBe(expected.currency);
  expect(actual.serviceName).toBe(expected.serviceName);
  expect(actual.providerName).toBe(expected.providerName);
  expect(actual.providerSlug).toBe(expected.providerSlug);
  expect(actual.optionName).toBe(expected.optionName);
  expect(actual.addressLabel).toBe(expected.addressLabel);
  expect(actual.addressLine).toBe(expected.addressLine);
  expect(actual.addressCity).toBe(expected.addressCity);
  expect(actual.addressDistrict).toBe(expected.addressDistrict);
  expect(actual.addressDirections).toBe(expected.addressDirections);
  expect(actual.addressLat).toBe(expected.addressLat);
  expect(actual.addressLng).toBe(expected.addressLng);
  expect(actual.description).toBe(expected.description);
}

describe("insert, then findById", () => {
  test("round-trips through Booking.restore with every snapshot field intact", async () => {
    await withBookings(async (track) => {
      // `pendingBooking`, not a bare `Booking.create`: this is the fixture
      // that gives `confirmedAt` a real, non-null value to round-trip — see
      // `expectSameSnapshot`'s own doc comment for why that closes a gap
      // this test used to leave open.
      const created = pendingBooking(bookingInput());
      const inserted = track(await repo.insert(created, 1));

      expect(inserted.id).toBeString();
      expectSameSnapshot(inserted, created);

      const found = await repo.findById(inserted.id as string);
      expect(found).not.toBeNull();
      expectSameSnapshot(found as Booking, created);
      // Includes the id: this is the one field `create` never has and a
      // round trip through the database is the only thing that assigns.
      expect(found?.id).toBe(inserted.id);
    });
  });

  test("returns null for an id nothing was ever stored under", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const found = await repo.findById(crypto.randomUUID());
      expect(found).toBeNull();
    });
  });
});

describe("booking_member_slot_active_uq, from behind the repository", () => {
  test("a second insert on the same (member, startsAt) is refused as SlotAlreadyTakenError while the first is PENDING_PAYMENT", async () => {
    await withBookings(async (track) => {
      const slotStart = new Date("2026-10-02T09:00:00.000Z");
      const slotExpires = new Date("2026-10-02T09:30:00.000Z");

      const first = track(
        await repo.insert(
          pendingBooking(bookingInput({ startsAt: slotStart, expiresAt: slotExpires })),
          1,
        ),
      );
      expect(first.status).toBe("PENDING_PAYMENT");

      const second = Booking.create(bookingInput({ startsAt: slotStart, expiresAt: slotExpires }));
      const error = await repo.insert(second, 1).catch((e: unknown) => e);

      // Not a substring match on a message — the class itself, the same
      // check `create-booking.command.test.ts` makes on the fake, and the
      // one Task 8's real command relies on to catch this without importing
      // anything from `infrastructure/`.
      expect(error).toBeInstanceOf(SlotAlreadyTakenError);
      expect((error as SlotAlreadyTakenError).providerMemberId).toBe(memberId);
      expect((error as SlotAlreadyTakenError).startsAt).toEqual(slotStart);
    });
  });

  test("the same slot can be rebooked once the first booking is EXPIRED — the partial index earning its keep", async () => {
    await withBookings(async (track) => {
      const slotStart = new Date("2026-10-03T09:00:00.000Z");
      const slotExpires = new Date("2026-10-03T09:30:00.000Z");

      // A `DRAFT`, not a `PENDING_PAYMENT`, because `expire` governs the
      // two clocks *before* payment now: a checkout abandoned mid-form is
      // exactly what `Booking.create` produces and exactly what the first
      // of the design's five clocks ends. A `PENDING_PAYMENT` past its window ends
      // as `CANCELLED` instead (see `save`'s guard test below, which uses
      // that path).
      const first = track(
        await repo.insert(
          Booking.create(bookingInput({ startsAt: slotStart, expiresAt: slotExpires })),
          1,
        ),
      );
      expect(first.status).toBe("DRAFT");

      // `save` against the happy path here — its compare-and-swap guard
      // (Task 5 of the booking-seams repair plan) gets its own tests below.
      // This is the scenario the brief asks for regardless: a released slot
      // must accept a second booking, which is only true once `expire`
      // moved the first one out of a slot-holding status and `save`
      // persisted that.
      const expired = first.expire(new Date("2026-10-03T09:31:00.000Z"));
      expect(expired.status).toBe("EXPIRED");
      const applied = await repo.save(expired, "DRAFT");
      expect(applied).toBe(true);

      const reread = await repo.findById(first.id as string);
      expect(reread?.status).toBe("EXPIRED");
      // Not only the status: `expiredAt` is the one transition timestamp
      // this file can actually give a real (non-null) value, so this is
      // the assertion that proves a transition timestamp itself — not only
      // the status that moved alongside it — survives the round trip.
      expect(reread?.expiredAt).not.toBeNull();
      expect(reread?.expiredAt?.toISOString()).toBe(expired.expiredAt?.toISOString());

      const second = track(
        await repo.insert(
          pendingBooking(bookingInput({ startsAt: slotStart, expiresAt: slotExpires })),
          1,
        ),
      );
      expect(second.id).toBeString();
      expect(second.status).toBe("PENDING_PAYMENT");
    });
  });
});

/**
 * The compare-and-swap Task 5 of the booking-seams repair plan added to
 * `save`, proven against real Postgres rather than a fake: a plain
 * `UPDATE … WHERE id = $1` (no status predicate) would apply both writers'
 * transitions unconditionally and let whichever runs second silently
 * overwrite the first, drained outbox row and all — see
 * `BookingRepositoryPort.save`'s own comment for the full scenario.
 */
describe("save's expectedStatus guard", () => {
  test("a write whose expectedStatus no longer matches the row applies nothing and returns false", async () => {
    await withBookings(async (track) => {
      const slotStart = new Date("2026-10-03T15:00:00.000Z");
      const slotExpires = new Date("2026-10-03T15:30:00.000Z");

      const first = track(
        await repo.insert(
          pendingBooking(bookingInput({ startsAt: slotStart, expiresAt: slotExpires })),
          1,
        ),
      );

      // The row genuinely moves past PENDING_PAYMENT first — standing in
      // for whichever of a payment webhook and the sweep wins the
      // race this guard exists to settle.
      const paid = first.markPaid("mpesa-race-winner", new Date("2026-10-03T15:05:00.000Z"));
      const winnerApplied = await repo.save(paid, "PENDING_PAYMENT");
      expect(winnerApplied).toBe(true);

      // A second writer computed its own transition from the SAME
      // PENDING_PAYMENT read `first` represents — it never saw the write
      // above, exactly like a webhook and a sweep that both selected the
      // row before either wrote. Its `UPDATE … WHERE id = $1 AND status =
      // 'PENDING_PAYMENT'` now matches nothing, because the row already
      // moved.
      //
      // `cancel`, not `expire`: the sweep's ending for a PENDING_PAYMENT
      // booking past its payment window is `CANCELLED` with a reason, which
      // is what actually races a late-landing payment here.
      const cancelled = first.cancel(
        new Date("2026-10-03T15:06:00.000Z"),
        "customer_did_not_pay",
      );
      expect(cancelled.status).toBe("CANCELLED");
      const loserApplied = await repo.save(cancelled, "PENDING_PAYMENT");
      expect(loserApplied).toBe(false);

      // The row still says what the winner wrote — the loser's write did
      // not silently overwrite it.
      const reread = await repo.findById(first.id as string);
      expect(reread?.status).toBe("CONFIRMED");
      expect(reread?.paymentRef).toBe("mpesa-race-winner");
    });
  });
});

describe("findDueForSweep", () => {
  /**
   * One predicate over every deadline-bearing status, not one query each:
   * each hop already stamped its own clock's deadline onto `expires_at`, so
   * by the time this query runs the only thing left to ask is `expires_at <=
   * now AND status IN (DEADLINE_BEARING_STATUSES)`. The fixtures below use
   * three of the five, which is enough to prove the predicate is one question
   * rather than a per-status branch; `booking-sweep.test.ts` is where the two
   * closing clocks get their own coverage.
   *
   * Runs through `withBookings`, like every other DB-backed test here, so
   * its inserts are cleaned up in a `finally` rather than after the last
   * assertion. That matters most for this test: a `DRAFT` or
   * `AWAITING_PROVIDER` row leaked by an assertion that threw early would be
   * picked up by *this very query* in every later test and in
   * `booking-sweep.test.ts`.
   */
  test("selects every status standing on a clock whose deadline has passed, oldest first, up to the limit", async () => {
    await withBookings(async (track) => {
      const now = new Date("2026-10-04T12:00:00.000Z");

      // Due: one booking on each of the first three clocks, past its own
      // deadline, at different slots so they don't collide with each
      // other. `DRAFT` and `AWAITING_PROVIDER` are what the widened
      // predicate added — before it, both of these rows sat here for ever
      // holding a member's calendar.
      const dueLater = await repo.insert(
        pendingBooking(
          bookingInput({
            startsAt: new Date("2026-10-04T09:00:00.000Z"),
            expiresAt: new Date("2026-10-04T09:30:00.000Z"),
          }),
        ),
        1,
      );
      track(dueLater);

      const dueEarlier = await repo.insert(
        pendingBooking(
          bookingInput({
            startsAt: new Date("2026-10-04T10:00:00.000Z"),
            expiresAt: new Date("2026-10-04T09:15:00.000Z"),
          }),
        ),
        1,
      );
      track(dueEarlier);

      const dueDraft = await repo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2026-10-04T14:00:00.000Z"),
            expiresAt: new Date("2026-10-04T09:45:00.000Z"),
          }),
        ),
        1,
      );
      track(dueDraft);
      expect(dueDraft.status).toBe("DRAFT");

      const dueAwaiting = await repo.insert(
        awaitingBooking(
          bookingInput({
            startsAt: new Date("2026-10-04T15:00:00.000Z"),
            expiresAt: new Date("2026-10-04T10:00:00.000Z"),
          }),
        ),
        1,
      );
      track(dueAwaiting);
      expect(dueAwaiting.status).toBe("AWAITING_PROVIDER");

      // Not due: on a clock, but the deadline is still in the future. One
      // per status the widening added, so a predicate that dropped the
      // time comparison while gaining statuses fails here.
      const notYetDue = await repo.insert(
        pendingBooking(
          bookingInput({
            startsAt: new Date("2026-10-04T11:00:00.000Z"),
            expiresAt: new Date("2026-10-04T23:00:00.000Z"),
          }),
        ),
        1,
      );
      track(notYetDue);

      const draftNotYetDue = await repo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2026-10-04T16:00:00.000Z"),
            expiresAt: new Date("2026-10-04T23:30:00.000Z"),
          }),
        ),
        1,
      );
      track(draftNotYetDue);

      // Due, not excluded: a `CONFIRMED` booking whose appointment is
      // already behind it. `CONFIRMED` joined `DEADLINE_BEARING_STATUSES`
      // when bookings gained an ending (the booking-completion plan's
      // schema task), and the clock it stands on is the appointment's own
      // end — `markPaid` hands `expires_at` on to `ends_at` when the charge
      // clears, the same way `submit` and `accept` hand it on at their own
      // hops. So this row is due for the reason the sweep exists: the work
      // is over and nobody has said how it went. The `startsAt` below is
      // chosen for exactly that, an hour that ends before `now` rather than
      // after it.
      //
      // Rows that were already `CONFIRMED` when that migration ran reached
      // the same value a different way: the migration backfilled
      // `expires_at` to `ends_at` by hand, once, because they were sitting
      // on a payment deadline long past. This one is paid fresh, after the
      // migration, through the ordinary code path. `findDueForSweep` cannot
      // tell an appointment that has just ended from a reminder nobody
      // answered — that distinction is `SweepDueBookingsInternalCommand`'s
      // job, not this query's.
      const paidConfirmed = await repo.insert(
        pendingBooking(
          bookingInput({
            startsAt: new Date("2026-10-04T08:00:00.000Z"),
            expiresAt: new Date("2026-10-04T07:45:00.000Z"),
          }),
        ),
        1,
      );
      track(paidConfirmed);
      const paid = paidConfirmed.markPaid("mpesa-repo-test", new Date("2026-10-04T07:30:00.000Z"));
      // The payment window it was given is behind it; what it stands on now
      // is its own appointment's end.
      expect(paid.expiresAt).toEqual(paidConfirmed.endsAt);
      expect(paid.expiresAt).not.toEqual(paidConfirmed.expiresAt);
      const paidApplied = await repo.save(paid, "PENDING_PAYMENT");
      expect(paidApplied).toBe(true);

      // This booking is already being built for the exclusion check below;
      // reading it back costs one query and is the only place in this file
      // that proves `paidAt` and `paymentRef` survive a round trip with a
      // real value — `expectSameSnapshot` never sees a paid booking, since
      // `Booking.create` always starts both null.
      const paidReread = await repo.findById(paidConfirmed.id as string);
      expect(paidReread?.paidAt?.toISOString()).toBe(paid.paidAt?.toISOString());
      expect(paidReread?.paymentRef).toBe("mpesa-repo-test");
      // And the other half of the same write: the clock `markPaid` handed on
      // is the one that reached the row, not the payment deadline it
      // replaced. Without this the aggregate could be moving the deadline
      // correctly while the column kept the old value, and the sweep
      // assertion below would still pass for the wrong reason.
      expect(paidReread?.expiresAt?.toISOString()).toBe(paidConfirmed.endsAt.toISOString());

      const due = await repo.findDueForSweep(now, 10);
      const dueIds = due.map((b) => b.id);

      expect(dueIds).toContain(dueDraft.id);
      expect(dueIds).toContain(dueAwaiting.id);
      expect(dueIds).not.toContain(notYetDue.id);
      expect(dueIds).not.toContain(draftNotYetDue.id);
      expect(dueIds).toContain(paidConfirmed.id);

      const dueLaterIndex = dueIds.indexOf(dueLater.id);
      const dueEarlierIndex = dueIds.indexOf(dueEarlier.id);
      expect(dueLaterIndex).toBeGreaterThanOrEqual(0);
      expect(dueEarlierIndex).toBeGreaterThanOrEqual(0);
      // Oldest deadline first.
      expect(dueEarlierIndex).toBeLessThan(dueLaterIndex);
      // And oldest-first across the whole result, not only among this
      // file's own rows — the dev database is shared, so the result can
      // legitimately carry rows nothing here inserted, and the ordering
      // has to hold over those too.
      const deadlines = due.map((b) => (b.expiresAt as Date).getTime());
      expect(deadlines).toEqual([...deadlines].sort((a, b) => a - b));

      const limited = await repo.findDueForSweep(now, 1);
      expect(limited).toHaveLength(1);
      // The limit is applied *after* the ordering: the one row a limit of
      // one returns is the same row the unlimited query returns first.
      // Asserted against `due[0]` rather than against a fixture of this
      // file's own, because the query is global and another session's row
      // may legitimately be older than anything here.
      expect(limited[0]?.id).toBe(due[0]?.id);
    });
  });
});

describe("appendChange", () => {
  test("writes an audit row a plain read can see", async () => {
    await withBookings(async (track) => {
      const created = track(
        await repo.insert(
          Booking.create(
            bookingInput({
              startsAt: new Date("2026-10-05T09:00:00.000Z"),
              expiresAt: new Date("2026-10-05T09:30:00.000Z"),
            }),
          ),
          1,
        ),
      );

      await repo.appendChange({
        bookingId: created.id as string,
        changedByUserId: ownerUserId,
        reason: "customer asked to move an hour earlier",
        previousStartsAt: new Date("2026-10-05T08:00:00.000Z"),
        previousEndsAt: new Date("2026-10-05T09:00:00.000Z"),
        previousProviderMemberId: null,
        previousPriceMinor: null,
      });

      const [row] = await db
        .select()
        .from(bookingChange)
        .where(eq(bookingChange.bookingId, created.id as string));

      expect(row?.reason).toBe("customer asked to move an hour earlier");
      expect(row?.changedByUserId).toBe(ownerUserId);
      expect(row?.previousStartsAt?.toISOString()).toBe("2026-10-05T08:00:00.000Z");
      expect(row?.previousProviderMemberId).toBeNull();
    });
  });

  test("accepts a change nobody made — the sweep's own hop, with a null actor", async () => {
    // The live-database half of the same argument the column's doc comment
    // makes: a cron sweep ending a booking whose clock ran out has no
    // requesting user, and null is how that is recorded rather than a
    // sentinel "system user" that would join to `user` and quietly count as
    // somebody's action in every audit query.
    //
    // This is also the guard against the migration that makes it nullable
    // never being applied. Without it, `SweepBookingCommand` writing this
    // row would fail on a `NOT NULL` violation against the live table while
    // the schema file happily says otherwise — and the sweep swallows and
    // logs per-booking failures by design, so the only visible symptom
    // would be bookings that never settle.
    await withBookings(async (track) => {
      const created = track(
        await repo.insert(
          Booking.create(
            bookingInput({
              startsAt: new Date("2026-10-05T11:00:00.000Z"),
              expiresAt: new Date("2026-10-05T11:30:00.000Z"),
            }),
          ),
          1,
        ),
      );

      await repo.appendChange({
        bookingId: created.id as string,
        changedByUserId: null,
        reason: "customer_did_not_pay",
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      });

      const [row] = await db
        .select()
        .from(bookingChange)
        .where(eq(bookingChange.bookingId, created.id as string));

      expect(row?.changedByUserId).toBeNull();
      // The row still answers "why", which is what makes the missing "who"
      // acceptable rather than a hole.
      expect(row?.reason).toBe("customer_did_not_pay");
    });
  });
});

describe("a real atomicExecute rolling back", () => {
  /**
   * The load-bearing test in this file. Everything above binds a real
   * connection into AsyncLocalStorage with `__runWithTransactionContextForTests`
   * — which, per its own doc comment, "does not open a transaction and does
   * not roll anything back". It proves the repository's mapping is correct;
   * it proves nothing about atomicity.
   *
   * This test goes through the real path instead:
   * `infraStore.runAsync` stands in for a request (the scope
   * `Db.getDbConnection()` needs to open a real connection),
   * `DrizzleUnitOfWork.atomicExecute` is the same class every bootstrap
   * wires up, and `runInTransaction` underneath it opens a real
   * `db.transaction(...)` against `DEV_DB_URL`. The insert runs — for real,
   * inside that transaction — and only then does the block throw, so the
   * row is proven to have existed before the assertion that it doesn't.
   *
   * Until this test existed, nothing in this repository demonstrated
   * Postgres actually rolling anything back: `drizzle-unit-of-work.test.ts`
   * uses a fake AsyncLocalStorage context with no live connection, and
   * `create-booking.command.test.ts`'s `TrackingUnitOfWork` proves only that
   * a command's calls are ordered compatibly with rollback, by its own
   * documented admission. BR2's atomicity rested on those two fakes
   * agreeing with each other until this test ran against the real database.
   */
  test("a booking inserted inside atomicExecute is gone once the block throws", async () => {
    const testEnv = {
      STAGE: "local" as const,
      LOG_LEVEL: "info",
      DATABASE_URL: process.env["DEV_DB_URL"] as string,
      BETTER_AUTH_SECRET: "s",
      RESEND_API_KEY: "",
      EMAIL_FROM: "a@b.c",
      APP_URL: "https://ntizo.test",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    };

    const unitOfWork = new DrizzleUnitOfWork();
    const boom = new Error("thrown after the insert executed, to force a rollback");
    let insertedId: string | null = null;

    await infraStore.runAsync(testEnv, async () => {
      try {
        await expect(
          unitOfWork.atomicExecute(async () => {
            const inserted = await repo.insert(
              Booking.create(
                bookingInput({
                  startsAt: new Date("2026-10-06T09:00:00.000Z"),
                  expiresAt: new Date("2026-10-06T09:30:00.000Z"),
                }),
              ),
              1,
            );
            // The insert has definitely executed by this line — its result
            // carries a database-assigned id, which only a row that really
            // exists (for now) can have.
            insertedId = inserted.id;
            throw boom;
          }),
        ).rejects.toBe(boom);
      } finally {
        // This scope opened its own connection (`Db.getDbConnection()`,
        // lazily, on the first query inside `atomicExecute`) — distinct from
        // this file's own `sql`/`db` above, which never touches
        // `infraStore`. Closing it here, inside the same `runAsync` scope
        // that opened it, is what `Db.closeDbConnection` requires: it reads
        // the connection back off `infraStore`, which only resolves inside
        // this callback.
        await Db.closeDbConnection();
      }
    });

    expect(insertedId).toBeString();
    const rows = await sql`SELECT id FROM ntizo_booking.booking WHERE id = ${insertedId}`;
    expect(rows).toHaveLength(0);
  });
});
