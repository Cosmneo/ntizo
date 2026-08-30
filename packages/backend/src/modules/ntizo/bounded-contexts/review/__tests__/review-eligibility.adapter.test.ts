/**
 * `BookingReviewEligibilityAdapter` against the real dev database, same
 * reasoning as `booking-repository.test.ts` and
 * `provider-name-reader.adapter.test.ts`: a fake reimplementing "is there a
 * completed booking" would only prove the fake agrees with itself, not that
 * the real query — the real `status` filter, the real `providerId`
 * predicate, the real ordering — is right. `SubmitReviewCommand`'s own tests
 * already prove the pass-through (a verdict's `bookingId` lands on the
 * review); what only a real query can prove is the verdict itself.
 *
 * Six customers, not one, each proving a different way this could go wrong
 * silently. The query has three predicates — `status`, `providerId`,
 * `customerId` — and each is pinned by exactly one test below, not merely
 * exercised in passing by whichever fixture happens to be there:
 *  - `status`: "refuses a customer whose only booking with this provider is
 *    not COMPLETED". A fixture holding only completed bookings could pass
 *    this file even if the status filter were deleted; this is the row that
 *    makes that a failing test instead.
 *  - `providerId`: "refuses a customer whose COMPLETED booking is with the
 *    other provider". Catches `providerId` being dropped, which would let
 *    anyone who ever completed any booking review every provider on the
 *    platform.
 *  - `customerId`: "returns this customer's own completed booking, not a
 *    different customer's who also completed one with the same provider".
 *    The other customer's booking is given a *later* `completedAt` than this
 *    one's own, so if `customerId` were dropped the `ORDER BY completedAt
 *    DESC` would deterministically surface the wrong person's booking —
 *    this does not depend on which other tests ran first, unlike the
 *    file-order coincidence it replaces (see that test's own comment).
 *
 * Two more tests cover behaviour once eligibility is established, rather than
 * a single predicate:
 *  - a single `COMPLETED` booking against the provider under test — allowed,
 *    with that booking's own id.
 *  - two `COMPLETED` bookings against the provider under test, at different
 *    times, and nothing else — allowed, and pointed at the more recently
 *    completed one specifically, not merely at "a" completed booking. Its
 *    own customer, not any other test's, so the assertion depends on
 *    `completedAt` rather than on cross-test insertion order.
 *
 * Fixtures follow `booking-repository.test.ts`'s pattern: a random `suffix`
 * per run so this file's rows cannot collide with another worktree's or
 * another session's concurrent run against the shared dev database, and
 * `bestEffortCleanup` so one failed teardown step doesn't strand the rest.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { category } from "../../../shared/infrastructure/database/catalog/schemas/category.schema";
import { service, serviceOption } from "../../../shared/infrastructure/database/catalog/schemas/service.schema";
import { provider } from "../../../shared/infrastructure/database/provider/schemas/provider.schema";
import { providerMember } from "../../../shared/infrastructure/database/provider/schemas/provider-member.schema";
import { user } from "../../../shared/infrastructure/database/user/schemas/user.schema";
import { booking } from "../../../shared/infrastructure/database/booking/schemas/booking.schema";
import type { NewBookingRow } from "../../../shared/infrastructure/database/booking/schemas/booking.schema";
import { BookingStatus } from "../../../shared/infrastructure/database/booking/enums";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "../../../shared/infrastructure/database/__tests__/dev-db-test-connection";
import { BookingReviewEligibilityAdapter } from "../infrastructure/repositories/drizzle/booking-review-eligibility.adapter";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
// `{ schema: authSchema }`, not a bare `drizzle(sql)`: `DrizzleDb` (what
// `__runWithTransactionContextForTests` binds into AsyncLocalStorage) is
// typed against this schema shape — same requirement as
// `booking-repository.test.ts`.
const db = drizzle(sql, { schema: authSchema });

const adapter = new BookingReviewEligibilityAdapter();
const suffix = crypto.randomUUID();

let customerNotCompletedId: string;
let customerWrongProviderId: string;
let customerEarnedId: string;
let customerMultipleCompletedId: string;
let customerSelfId: string;
let customerOtherId: string;
let ownerAId: string;
let ownerBId: string;
let providerAId: string;
let providerBId: string;
let memberAId: string;
let memberBId: string;
let categoryId: string;
let serviceAId: string;
let serviceBId: string;
let serviceOptionAId: string;
let serviceOptionBId: string;

beforeAll(async () => {
  customerNotCompletedId = crypto.randomUUID();
  customerWrongProviderId = crypto.randomUUID();
  customerEarnedId = crypto.randomUUID();
  customerMultipleCompletedId = crypto.randomUUID();
  customerSelfId = crypto.randomUUID();
  customerOtherId = crypto.randomUUID();
  ownerAId = crypto.randomUUID();
  ownerBId = crypto.randomUUID();

  await db.insert(user).values([
    {
      id: customerNotCompletedId,
      email: `review-elig-not-completed-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: customerWrongProviderId,
      email: `review-elig-wrong-provider-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: customerEarnedId,
      email: `review-elig-earned-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: customerMultipleCompletedId,
      email: `review-elig-multiple-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: customerSelfId,
      email: `review-elig-self-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: customerOtherId,
      email: `review-elig-other-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: ownerAId,
      email: `review-elig-owner-a-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: ownerBId,
      email: `review-elig-owner-b-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
  ]);

  const [providerARow] = await db
    .insert(provider)
    .values({
      ownerUserId: ownerAId,
      type: "individual",
      name: "Review Eligibility Test Provider A",
      slug: `review-elig-test-a-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  providerAId = providerARow!.id;

  const [providerBRow] = await db
    .insert(provider)
    .values({
      ownerUserId: ownerBId,
      type: "individual",
      name: "Review Eligibility Test Provider B",
      slug: `review-elig-test-b-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  providerBId = providerBRow!.id;

  const [memberARow] = await db
    .insert(providerMember)
    .values({ providerId: providerAId, userId: ownerAId, role: "owner" })
    .returning({ id: providerMember.id });
  memberAId = memberARow!.id;

  const [memberBRow] = await db
    .insert(providerMember)
    .values({ providerId: providerBId, userId: ownerBId, role: "owner" })
    .returning({ id: providerMember.id });
  memberBId = memberBRow!.id;

  const [categoryRow] = await db
    .insert(category)
    .values({ code: `review-elig-test-${suffix}` })
    .returning({ id: category.id });
  categoryId = categoryRow!.id;

  const [serviceARow] = await db
    .insert(service)
    .values({
      providerId: providerAId,
      categoryId,
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
      status: "published",
    })
    .returning({ id: service.id });
  serviceAId = serviceARow!.id;

  const [serviceBRow] = await db
    .insert(service)
    .values({
      providerId: providerBId,
      categoryId,
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
      status: "published",
    })
    .returning({ id: service.id });
  serviceBId = serviceBRow!.id;

  const [optionARow] = await db
    .insert(serviceOption)
    .values({ serviceId: serviceAId, pricingMode: "fixed", amountMinor: 100_000, durationMinutes: 60 })
    .returning({ id: serviceOption.id });
  serviceOptionAId = optionARow!.id;

  const [optionBRow] = await db
    .insert(serviceOption)
    .values({ serviceId: serviceBId, pricingMode: "fixed", amountMinor: 100_000, durationMinutes: 60 })
    .returning({ id: serviceOption.id });
  serviceOptionBId = optionBRow!.id;
});

afterAll(async () => {
  await bestEffortCleanup([
    () => db.delete(booking).where(eq(booking.providerId, providerAId)),
    () => db.delete(booking).where(eq(booking.providerId, providerBId)),
    () => db.delete(serviceOption).where(eq(serviceOption.id, serviceOptionAId)),
    () => db.delete(serviceOption).where(eq(serviceOption.id, serviceOptionBId)),
    () => db.delete(service).where(eq(service.id, serviceAId)),
    () => db.delete(service).where(eq(service.id, serviceBId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberAId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberBId)),
    () => db.delete(provider).where(eq(provider.id, providerAId)),
    () => db.delete(provider).where(eq(provider.id, providerBId)),
    () => db.delete(user).where(eq(user.id, customerNotCompletedId)),
    () => db.delete(user).where(eq(user.id, customerWrongProviderId)),
    () => db.delete(user).where(eq(user.id, customerEarnedId)),
    () => db.delete(user).where(eq(user.id, customerMultipleCompletedId)),
    () => db.delete(user).where(eq(user.id, customerSelfId)),
    () => db.delete(user).where(eq(user.id, customerOtherId)),
    () => db.delete(user).where(eq(user.id, ownerAId)),
    () => db.delete(user).where(eq(user.id, ownerBId)),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

/** A row that satisfies every booking NOT NULL, distinct `startsAt`/`endsAt` per call. */
function bookingRow(overrides: Partial<NewBookingRow> = {}): NewBookingRow {
  return {
    customerId: customerNotCompletedId,
    providerId: providerAId,
    serviceId: serviceAId,
    serviceOptionId: serviceOptionAId,
    providerMemberId: memberAId,
    startsAt: new Date("2026-09-10T09:00:00Z"),
    endsAt: new Date("2026-09-10T10:00:00Z"),
    status: BookingStatus.PendingPayment,
    priceMinor: 100_000,
    commissionBps: 1000,
    commissionMinor: 10_000,
    currency: "MZN",
    serviceName: "Corte de Cabelo",
    providerName: "Review Eligibility Test Provider A",
    providerSlug: `review-elig-test-a-${suffix}`,
    optionName: "Standard",
    durationMinutes: 60,
    addressLabel: "Salão",
    addressLine: "Av. Julius Nyerere 123",
    addressCity: "Maputo",
    ...overrides,
  };
}

describe("BookingReviewEligibilityAdapter — real status filter, real providerId predicate", () => {
  test("refuses a customer whose only booking with this provider is not COMPLETED", async () => {
    await db.insert(booking).values(
      bookingRow({
        customerId: customerNotCompletedId,
        status: BookingStatus.MarkedDone,
        startsAt: new Date("2026-09-10T09:00:00Z"),
        endsAt: new Date("2026-09-10T10:00:00Z"),
      }),
    );

    const verdict = await __runWithTransactionContextForTests(db, () =>
      adapter.check(providerAId, customerNotCompletedId),
    );

    expect(verdict).toEqual({ allowed: false, bookingId: null });
  });

  test("refuses a customer whose COMPLETED booking is with the other provider", async () => {
    await db.insert(booking).values(
      bookingRow({
        customerId: customerWrongProviderId,
        providerId: providerBId,
        serviceId: serviceBId,
        serviceOptionId: serviceOptionBId,
        providerMemberId: memberBId,
        providerName: "Review Eligibility Test Provider B",
        providerSlug: `review-elig-test-b-${suffix}`,
        status: BookingStatus.Completed,
        completedAt: new Date("2026-09-11T10:00:00Z"),
        startsAt: new Date("2026-09-11T09:00:00Z"),
        endsAt: new Date("2026-09-11T10:00:00Z"),
      }),
    );

    // Checked against provider A, whom this customer never booked at all —
    // this is the assertion that fails if `providerId` is dropped from the
    // adapter's WHERE clause, since a completed booking (just the wrong one)
    // does exist for this customer.
    const verdict = await __runWithTransactionContextForTests(db, () =>
      adapter.check(providerAId, customerWrongProviderId),
    );

    expect(verdict).toEqual({ allowed: false, bookingId: null });
  });

  test("returns this customer's own completed booking, not a different customer's who also completed one with the same provider", async () => {
    // Symmetric to the wrong-provider test above, pinning the third
    // predicate instead of the second: same provider, same status, two
    // different customers. `other`'s booking is completed *after* `self`'s —
    // if `customerId` were dropped from the WHERE clause, `ORDER BY
    // completedAt DESC LIMIT 1` would deterministically return `other`'s row
    // instead, regardless of which other tests in this file happened to run
    // first. That determinism is the point: the "several COMPLETED bookings"
    // test below only failed on a dropped `customerId` by accident — a
    // *different* customer's booking two tests up (`customerEarnedId`,
    // completed 2026-09-12) happens to be more recent than that test's own
    // "newer" row, so an unfiltered query happened to return the wrong
    // customer's booking there too, but only in this file's own run order.
    // Under `.only` on that test alone, or a different ordering, that
    // accidental cover disappears; this test's own two rows are the only
    // ones it needs, so dropping `customerId` fails it on its own.
    const [self] = await db
      .insert(booking)
      .values(
        bookingRow({
          customerId: customerSelfId,
          status: BookingStatus.Completed,
          completedAt: new Date("2026-12-01T10:00:00Z"),
          startsAt: new Date("2026-12-01T09:00:00Z"),
          endsAt: new Date("2026-12-01T10:00:00Z"),
        }),
      )
      .returning({ id: booking.id });

    const [other] = await db
      .insert(booking)
      .values(
        bookingRow({
          customerId: customerOtherId,
          status: BookingStatus.Completed,
          completedAt: new Date("2026-12-02T10:00:00Z"),
          startsAt: new Date("2026-12-02T09:00:00Z"),
          endsAt: new Date("2026-12-02T10:00:00Z"),
        }),
      )
      .returning({ id: booking.id });

    const verdict = await __runWithTransactionContextForTests(db, () =>
      adapter.check(providerAId, customerSelfId),
    );

    expect(verdict.allowed).toBe(true);
    expect(verdict.bookingId).toBe(self!.id);
    expect(verdict.bookingId).not.toBe(other!.id);
  });

  test("allows a customer with a COMPLETED booking against this provider, and returns its id", async () => {
    const [row] = await db
      .insert(booking)
      .values(
        bookingRow({
          customerId: customerEarnedId,
          status: BookingStatus.Completed,
          completedAt: new Date("2026-09-12T10:00:00Z"),
          startsAt: new Date("2026-09-12T09:00:00Z"),
          endsAt: new Date("2026-09-12T10:00:00Z"),
        }),
      )
      .returning({ id: booking.id });

    const verdict = await __runWithTransactionContextForTests(db, () =>
      adapter.check(providerAId, customerEarnedId),
    );

    expect(verdict).toEqual({ allowed: true, bookingId: row!.id });
  });

  test("with several COMPLETED bookings against this provider, points at the most recently completed one", async () => {
    // A customer of its own, not `customerEarnedId` — that one already
    // carries a completed booking from the previous test, and reusing it
    // here would make this assertion depend on cross-test insertion order
    // instead of on `completedAt` itself.
    const [older] = await db
      .insert(booking)
      .values(
        bookingRow({
          customerId: customerMultipleCompletedId,
          status: BookingStatus.Completed,
          completedAt: new Date("2026-01-05T10:00:00Z"),
          startsAt: new Date("2026-01-05T09:00:00Z"),
          endsAt: new Date("2026-01-05T10:00:00Z"),
        }),
      )
      .returning({ id: booking.id });

    const [newer] = await db
      .insert(booking)
      .values(
        bookingRow({
          customerId: customerMultipleCompletedId,
          status: BookingStatus.Completed,
          completedAt: new Date("2026-06-05T10:00:00Z"),
          startsAt: new Date("2026-06-05T09:00:00Z"),
          endsAt: new Date("2026-06-05T10:00:00Z"),
        }),
      )
      .returning({ id: booking.id });

    const verdict = await __runWithTransactionContextForTests(db, () =>
      adapter.check(providerAId, customerMultipleCompletedId),
    );

    expect(verdict.allowed).toBe(true);
    expect(verdict.bookingId).not.toBe(older!.id);
    expect(verdict.bookingId).toBe(newer!.id);
  });
});
