/**
 * Both of `read/booking`'s projections — `ListMyBookingsProjection` and
 * `GetMyBookingProjection` — wired to the real `DrizzleBookingReadRepository`,
 * against the real dev database. Same reason and same mechanism as
 * `booking-repository.test.ts`: the reader reaches the database through
 * `getDb()`, which resolves through the app's request-scoped
 * AsyncLocalStorage context, and a test has no request.
 * `__runWithTransactionContextForTests` binds this file's own real,
 * `DEV_DB_URL`-backed Drizzle client into that same context for the duration
 * of one test body.
 *
 * One file for both, and one fixture: they read the same columns off the
 * same table for the same customer, differing only in their `WHERE`. A
 * second file would be a second elaborate fixture and a second connection to
 * a shared dev database, for two queries that must not be allowed to
 * disagree.
 *
 * The fixture below seeds bookings for TWO customers on purpose. BR7 limits
 * reading a booking to its own customer, its provider, or an administrator —
 * these queries answer only for the signed-in customer — and a fixture
 * holding only the caller's own rows cannot fail if `listForCustomer`'s or
 * `findForCustomer`'s `WHERE` clause were ever dropped. The whole point of
 * this file is to prove those filters, not merely the mapping.
 *
 * Fixtures follow `booking-repository.test.ts`'s pattern: one provider and
 * one provider member, created fresh under a random `suffix` in `beforeAll`,
 * so this run's `providerMemberId` cannot collide with another worktree's or
 * another session's concurrent run on `booking_member_slot_active_uq`. Every
 * booking this file inserts uses its own distinct `startsAt` for the same
 * reason.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { bookingReadModel } from "@ntizo/shared/read-models";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { category } from "../../../shared/infrastructure/database/catalog/schemas";
import { service, serviceOption } from "../../../shared/infrastructure/database/catalog/schemas";
import { provider, providerMember } from "../../../shared/infrastructure/database/provider/schemas";
import { user } from "../../../shared/infrastructure/database/user/schemas";
import { booking } from "../../../shared/infrastructure/database/booking/schemas";
import { BookingStatus } from "../../../shared/infrastructure/database/booking/enums";
import { Booking } from "../../../bounded-contexts/booking/domain/aggregates/booking.aggregate";
import { DrizzleBookingRepository } from "../../../bounded-contexts/booking/infrastructure/repositories/drizzle/booking.repository";
import { DrizzleBookingReadRepository } from "../infra/repositories/drizzle/booking-read.repository";
import { GetMyBookingProjection } from "../app/use-cases/get-my-booking.projection";
import { ListMyBookingsProjection } from "../app/use-cases/list-my-bookings.projection";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "../../../shared/infrastructure/database/__tests__/dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql, { schema: authSchema });

const writeRepo = new DrizzleBookingRepository();
const readRepo = new DrizzleBookingReadRepository();
const projection = new ListMyBookingsProjection(readRepo);
const byId = new GetMyBookingProjection(readRepo);
const suffix = crypto.randomUUID();

/** The instant every test injects as `now` — never `new Date()` inside the projection under test. */
const NOW = new Date("2026-11-25T00:00:00.000Z");

let customerAId: string;
let customerBId: string;
let ownerUserId: string;
let providerId: string;
let memberId: string;
let categoryId: string;
let serviceId: string;
let serviceOptionId: string;

beforeAll(async () => {
  customerAId = crypto.randomUUID();
  customerBId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  await db.insert(user).values([
    {
      id: customerAId,
      email: `list-my-bookings-customer-a-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: customerBId,
      email: `list-my-bookings-customer-b-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: ownerUserId,
      email: `list-my-bookings-owner-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
  ]);

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "List My Bookings Test Provider",
      slug: `list-my-bookings-test-${suffix}`,
      status: "active",
      // Deliberately NOT `Africa/Maputo`, which is both the column's own
      // default and this platform's launch market. A fixture on the default
      // could not fail the timezone assertion below: a reader that ignored
      // the join and hardcoded the market, or fell back to the machine's
      // own zone in CI, would still answer "Africa/Maputo" and look right.
      timezone: "Europe/Lisbon",
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
    .values({ code: `list-my-bookings-test-${suffix}` })
    .returning({ id: category.id });
  categoryId = categoryRow!.id;

  const [serviceRow] = await db
    .insert(service)
    .values({
      providerId,
      categoryId,
      sourceLocale: "pt-MZ",
      // Deliberately NOT `at_customer`, the value checkout's rail draws its
      // extra "Deslocação — Incluída" line from and the one every frontend
      // fixture for these pages uses. A reader that hardcoded the interesting
      // branch, or that fell back to it, would still look right against a
      // fixture on it — the same reasoning the provider's `Europe/Lisbon`
      // above is chosen for.
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
  await bestEffortCleanup([
    () => db.delete(booking).where(eq(booking.providerId, providerId)),
    () => db.delete(serviceOption).where(eq(serviceOption.id, serviceOptionId)),
    () => db.delete(service).where(eq(service.id, serviceId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(user).where(eq(user.id, customerAId)),
    () => db.delete(user).where(eq(user.id, customerBId)),
    () => db.delete(user).where(eq(user.id, ownerUserId)),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

/**
 * The one address this file's fixtures use — `create`'s own snapshot fields
 * and `submit`'s separately-shaped, separately-required address both read
 * off this, so the two cannot quietly drift into two different addresses for
 * what is supposed to be the same booking.
 */
const ADDRESS = {
  label: "Salão",
  line: "Av. Julius Nyerere 123",
  city: "Maputo",
  district: "Sommerschield",
  directions: "Portão azul, tocar a campainha",
  lat: -25.9655,
  lng: 32.5832,
};

/** Every `Booking.create` input this file needs, with a distinct slot per call. */
function bookingInput(
  overrides: Partial<Parameters<typeof Booking.create>[0]> = {},
): Parameters<typeof Booking.create>[0] {
  return {
    customerId: customerAId,
    providerId,
    serviceId,
    serviceOptionId,
    providerMemberId: memberId,
    startsAt: new Date("2026-12-01T09:00:00.000Z"),
    durationMinutes: 60,
    priceMinor: 100_000,
    commissionBps: 1000,
    currency: "MZN",
    serviceName: "Corte de Cabelo",
    providerName: "List My Bookings Test Provider",
    providerSlug: `list-my-bookings-test-${suffix}`,
    optionName: "Standard",
    addressLabel: ADDRESS.label,
    addressLine: ADDRESS.line,
    addressCity: ADDRESS.city,
    addressDistrict: ADDRESS.district,
    addressDirections: ADDRESS.directions,
    addressLat: ADDRESS.lat,
    addressLng: ADDRESS.lng,
    description: "Corte simples, sem barba",
    expiresAt: new Date("2026-12-01T09:30:00.000Z"),
    ...overrides,
  };
}

/**
 * Moves a freshly inserted `DRAFT` to `AWAITING_PROVIDER` — the "waiting"
 * tab's own status, and the status this file's fixtures need now that
 * `ListMyBookingsProjection` reads one tab at a time rather than everything a
 * customer has. `DRAFT` is excluded from every tab by design — see
 * `customerWhere`'s own doc comment on `DrizzleBookingReadRepository` — so a
 * booking left exactly as `Booking.create` made it could never appear in a
 * page this projection returns.
 */
async function submitBooking(draft: Booking, startsAt: Date): Promise<Booking> {
  const respondBy = new Date(startsAt.getTime() - 15 * 60 * 1000);
  const submitted = draft.submit(NOW, respondBy, ADDRESS, null);
  const written = await writeRepo.save(submitted, BookingStatus.Draft);
  if (!written) {
    throw new Error(`fixture: submit of ${draft.id} matched no row`);
  }
  return submitted;
}

/**
 * Pins `createdAt` to an exact value so "newest first" can be asserted
 * without racing the wall clock: `DrizzleBookingRepository.insert` always
 * writes `createdAt` via the column's own `defaultNow()` (see its `toRow`),
 * with no way to pass one in — a real request never needs to backdate a
 * booking, so the port has no reason to accept one. Only this test, which
 * needs two rows with a guaranteed, non-flaky order, reaches past the
 * repository to set it directly.
 */
async function pinCreatedAt(id: string, createdAt: Date): Promise<void> {
  await db.update(booking).set({ createdAt }).where(eq(booking.id, id));
}

describe("ListMyBookingsProjection, backed by DrizzleBookingReadRepository", () => {
  test("returns only the signed-in customer's bookings, newest first", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const older = await writeRepo.insert(
        Booking.create(
          bookingInput({
            customerId: customerAId,
            startsAt: new Date("2026-12-02T09:00:00.000Z"),
            expiresAt: new Date("2026-12-02T09:30:00.000Z"),
          }),
        ),
        1,
      );
      const newer = await writeRepo.insert(
        Booking.create(
          bookingInput({
            customerId: customerAId,
            startsAt: new Date("2026-12-02T10:00:00.000Z"),
            expiresAt: new Date("2026-12-02T10:30:00.000Z"),
          }),
        ),
        1,
      );
      // A booking belonging to a DIFFERENT customer, moved to the same
      // status as the other two. Without this row, the fixture could not
      // fail even if `listForCustomer`'s WHERE clause were deleted outright
      // — see this file's own doc comment.
      const somebodyElses = await writeRepo.insert(
        Booking.create(
          bookingInput({
            customerId: customerBId,
            startsAt: new Date("2026-12-02T11:00:00.000Z"),
            expiresAt: new Date("2026-12-02T11:30:00.000Z"),
          }),
        ),
        1,
      );

      await submitBooking(older, new Date("2026-12-02T09:00:00.000Z"));
      await submitBooking(newer, new Date("2026-12-02T10:00:00.000Z"));
      await submitBooking(somebodyElses, new Date("2026-12-02T11:00:00.000Z"));

      await pinCreatedAt(older.id as string, new Date("2026-12-01T08:00:00.000Z"));
      await pinCreatedAt(newer.id as string, new Date("2026-12-01T09:00:00.000Z"));

      const page = await projection.execute({
        customerId: customerAId,
        tab: "waiting",
        limit: 20,
        offset: 0,
        now: NOW,
      });

      expect(page.items.map((b) => b.id)).toEqual([newer.id as string, older.id as string]);
      expect(page.items.map((b) => b.id)).not.toContain(somebodyElses.id as string);

      await db.delete(booking).where(eq(booking.id, older.id as string));
      await db.delete(booking).where(eq(booking.id, newer.id as string));
      await db.delete(booking).where(eq(booking.id, somebodyElses.id as string));
    });
  });

  test("a customer with none gets an empty list, not an error", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const strangerId = crypto.randomUUID();
      const page = await projection.execute({
        customerId: strangerId,
        tab: "waiting",
        limit: 20,
        offset: 0,
        now: NOW,
      });
      expect(page.items).toEqual([]);
      expect(page.total).toBe(0);
      expect(page.nextOffset).toBeNull();
    });
  });

  test("every field of bookingReadModel parses, and dates cross the wire as ISO strings", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const created = await writeRepo.insert(
        Booking.create(
          bookingInput({
            customerId: customerAId,
            startsAt: new Date("2026-12-03T09:00:00.000Z"),
            expiresAt: new Date("2026-12-03T09:30:00.000Z"),
          }),
        ),
        1,
      );
      await submitBooking(created, new Date("2026-12-03T09:00:00.000Z"));

      const page = await projection.execute({
        customerId: customerAId,
        tab: "waiting",
        limit: 20,
        offset: 0,
        now: NOW,
      });
      const item = page.items.find((b) => b.id === created.id);
      expect(item).toBeDefined();

      const parsed = bookingReadModel.safeParse(item);
      expect(parsed.success).toBe(true);

      expect(typeof item?.startsAt).toBe("string");
      expect(typeof item?.endsAt).toBe("string");
      expect(typeof item?.createdAt).toBe("string");
      // AWAITING_PROVIDER — this fixture's status now that a customer's own
      // list only ever reads a real tab — always carries a real expiresAt:
      // `submit` replaced the checkout hold with the provider's response
      // window. So this also proves the non-null branch is a string, not
      // merely that a null one passes trivially.
      expect(item?.expiresAt).not.toBeNull();
      expect(typeof item?.expiresAt).toBe("string");
      expect(item?.startsAt).toBe("2026-12-03T09:00:00.000Z");
      expect(item?.endsAt).toBe("2026-12-03T10:00:00.000Z");
      // The joined column, and the reason the two instants above are worth
      // anything to a reader: `booking` has no zone of its own, so this can
      // only have come from `provider.timezone`. The fixture's provider is
      // on `Europe/Lisbon` precisely so this cannot pass on the column
      // default — see the insert's own comment.
      expect(item?.timezone).toBe("Europe/Lisbon");

      await db.delete(booking).where(eq(booking.id, created.id as string));
    });
  });

  test("counts all three tabs in one read, not just the tab requested", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const waiting = await writeRepo.insert(
        Booking.create(
          bookingInput({
            customerId: customerAId,
            startsAt: new Date("2026-12-05T09:00:00.000Z"),
            expiresAt: new Date("2026-12-05T08:30:00.000Z"),
          }),
        ),
        1,
      );
      const toDecline = await writeRepo.insert(
        Booking.create(
          bookingInput({
            customerId: customerAId,
            startsAt: new Date("2026-12-05T11:00:00.000Z"),
            expiresAt: new Date("2026-12-05T10:30:00.000Z"),
          }),
        ),
        1,
      );

      await submitBooking(waiting, new Date("2026-12-05T09:00:00.000Z"));
      const submittedToDecline = await submitBooking(toDecline, new Date("2026-12-05T11:00:00.000Z"));
      const declined = submittedToDecline.decline(NOW);
      const written = await writeRepo.save(declined, BookingStatus.AwaitingProvider);
      if (!written) {
        throw new Error(`fixture: decline of ${toDecline.id} matched no row`);
      }

      const page = await projection.execute({
        customerId: customerAId,
        tab: "waiting",
        limit: 20,
        offset: 0,
        now: NOW,
      });

      // The chips render off this object whichever tab is open — a booking
      // sorted into the wrong bucket has to fail here, on the read the chips
      // actually share, rather than on a page nobody navigated to.
      expect(page.counts).toEqual({ waiting: 1, upcoming: 0, history: 1 });

      await db.delete(booking).where(eq(booking.id, waiting.id as string));
      await db.delete(booking).where(eq(booking.id, toDecline.id as string));
    });
  });

  test("nextOffset names the next page, and the last page offers none", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const first = await writeRepo.insert(
        Booking.create(
          bookingInput({
            customerId: customerAId,
            startsAt: new Date("2026-12-06T09:00:00.000Z"),
            expiresAt: new Date("2026-12-06T08:30:00.000Z"),
          }),
        ),
        1,
      );
      const second = await writeRepo.insert(
        Booking.create(
          bookingInput({
            customerId: customerAId,
            startsAt: new Date("2026-12-06T10:00:00.000Z"),
            expiresAt: new Date("2026-12-06T09:30:00.000Z"),
          }),
        ),
        1,
      );
      const third = await writeRepo.insert(
        Booking.create(
          bookingInput({
            customerId: customerAId,
            startsAt: new Date("2026-12-06T11:00:00.000Z"),
            expiresAt: new Date("2026-12-06T10:30:00.000Z"),
          }),
        ),
        1,
      );

      await submitBooking(first, new Date("2026-12-06T09:00:00.000Z"));
      await submitBooking(second, new Date("2026-12-06T10:00:00.000Z"));
      await submitBooking(third, new Date("2026-12-06T11:00:00.000Z"));

      // Three rows, a limit of two: the shape that actually exercises the
      // non-null branch, rather than every other test's single page that
      // never fills its own limit.
      const firstPage = await projection.execute({
        customerId: customerAId,
        tab: "waiting",
        limit: 2,
        offset: 0,
        now: NOW,
      });
      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.nextOffset).toBe(2);

      const secondPage = await projection.execute({
        customerId: customerAId,
        tab: "waiting",
        limit: 2,
        offset: 2,
        now: NOW,
      });
      expect(secondPage.items).toHaveLength(1);
      expect(secondPage.nextOffset).toBeNull();

      await db.delete(booking).where(eq(booking.id, first.id as string));
      await db.delete(booking).where(eq(booking.id, second.id as string));
      await db.delete(booking).where(eq(booking.id, third.id as string));
    });
  });
});

describe("GetMyBookingProjection, backed by DrizzleBookingReadRepository", () => {
  test("returns the caller's own booking, and null for another customer's", async () => {
    const created: string[] = [];
    try {
      await __runWithTransactionContextForTests(db, async () => {
        const mine = await writeRepo.insert(
          Booking.create(
            bookingInput({
              customerId: customerAId,
              startsAt: new Date("2026-12-04T09:00:00.000Z"),
              expiresAt: new Date("2026-12-04T09:30:00.000Z"),
            }),
          ),
          1,
        );
        // A real booking belonging to a real, different customer — asked for
        // by its own id below. Without this row the test could not fail even
        // if `findForCustomer` dropped `customerId` from its `WHERE` clause
        // entirely, because there would be nothing to wrongly return. This
        // branch has shipped that exact shape twice.
        const theirs = await writeRepo.insert(
          Booking.create(
            bookingInput({
              customerId: customerBId,
              startsAt: new Date("2026-12-04T11:00:00.000Z"),
              expiresAt: new Date("2026-12-04T11:30:00.000Z"),
            }),
          ),
          1,
        );
        created.push(mine.id as string, theirs.id as string);

        const own = await byId.execute({
          bookingId: mine.id as string,
          customerId: customerAId,
          now: NOW,
        });
        expect(own?.id).toBe(mine.id as string);
        // The mapping is the list's mapping — `toBookingDTO`, shared — so
        // one field is enough to prove this went through it rather than
        // handing back a raw row.
        expect(own?.startsAt).toBe("2026-12-04T09:00:00.000Z");
        // Read off the row rather than snapshotted: checkout's steps 2 and 3
        // send a customer whose hold lapsed back to `/book/<this service>` on
        // this option, and before these were on the read model they had to
        // carry both in the URL, where a shared link could name a service
        // that disagreed with the booking.
        expect(own?.serviceId).toBe(serviceId);
        expect(own?.serviceOptionId).toBe(serviceOptionId);
        // Joined off `service`, which `booking` has no column for — so like
        // the timezone above, this can only have come from the join. Checkout
        // prints it under the appointment ("No espaço dele · 60 min") and
        // decides from it whether it may claim the travel is included.
        expect(own?.locationType).toBe("at_provider");
        // **Asserted here as well as on the list, because this is the query
        // checkout actually reads.** `SELECTED_COLUMNS` is shared by both, so
        // they are hard to make disagree — but "hard to break" is not the
        // same as covered, and the page that prints a time to a customer
        // loads its booking through *this* projection. `Europe/Lisbon` rather
        // than the column default, for the reason the provider fixture gives.
        expect(own?.timezone).toBe("Europe/Lisbon");

        // **The booking came back at all, and that is the assertion.** The
        // business's score and verified badge are `leftJoin`ed off two
        // aggregates; this fixture's provider has no published review and no
        // accepted document, so both aggregates have nothing for it. An
        // inner join would make this booking vanish from a customer's own
        // checkout — a page that simply says "nothing is being held for you"
        // — rather than fail anything. Null and false are the honest answers
        // for a business nobody has reviewed and nobody has verified; zero
        // would tell the customer this is the worst provider on the platform.
        expect(own?.providerRatingAverage).toBeNull();
        expect(own?.providerVerified).toBe(false);

        // The assertion this test exists for: customer A asking for customer
        // B's booking, by its real id, gets nothing.
        const stolen = await byId.execute({
          bookingId: theirs.id as string,
          customerId: customerAId,
          now: NOW,
        });
        expect(stolen).toBeNull();

        // And the same booking is genuinely readable by the customer it
        // belongs to, so the null above is the filter refusing rather than
        // the row being absent or unreadable for some other reason.
        const hers = await byId.execute({
          bookingId: theirs.id as string,
          customerId: customerBId,
          now: NOW,
        });
        expect(hers?.id).toBe(theirs.id as string);
      });
    } finally {
      await bestEffortCleanup(
        created.map((id) => () => db.delete(booking).where(eq(booking.id, id))),
      );
    }
  });

  test("an id that names no booking is null, not an error", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      // A well-formed id that simply is not one — the shape a stale link
      // produces. Undistinguished from "not yours" on purpose: telling the
      // two apart would confirm that a given id names a real booking.
      const result = await byId.execute({
        bookingId: crypto.randomUUID(),
        customerId: customerAId,
        now: NOW,
      });
      expect(result).toBeNull();
    });
  });

  test("tells the booking's own story, through the same assembly the provider's page reads", async () => {
    const created: string[] = [];
    try {
      await __runWithTransactionContextForTests(db, async () => {
        const startsAt = new Date("2026-12-07T09:00:00.000Z");
        const draft = await writeRepo.insert(
          Booking.create(
            bookingInput({
              customerId: customerAId,
              startsAt,
              expiresAt: new Date("2026-12-07T08:30:00.000Z"),
            }),
          ),
          1,
        );
        created.push(draft.id as string);

        const submitted = await submitBooking(draft, startsAt);
        // `SubmitBookingCommand` appends this row in the same transaction as
        // the DRAFT → AWAITING_PROVIDER hop; this fixture calls `submit` and
        // `save` directly, bypassing the command, so it records the row by
        // hand — the same thing `provider-bookings.repository.test.ts`'s own
        // `recordSubmission` does for the provider side.
        await writeRepo.appendChange({
          bookingId: draft.id as string,
          changedByUserId: customerAId,
          reason: "submitted_by_customer",
          previousStartsAt: null,
          previousEndsAt: null,
          previousProviderMemberId: null,
          previousPriceMinor: null,
        });

        const detail = await byId.execute({
          bookingId: draft.id as string,
          customerId: customerAId,
          now: NOW,
        });

        expect(detail?.timeline).toHaveLength(3);
        expect(detail?.timeline[0]?.reason).toBe("created_by_customer");
        // The assertion this test exists for: the row above was written with
        // `changedByUserId: customerAId`, and `timelineOf` only resolves
        // that to "customer" when the `customerId` it was handed matches —
        // proving `GetMyBookingProjection` threaded its caller's own id
        // through rather than some other value, which would have silently
        // mapped this hop to "provider" instead.
        expect(detail?.timeline[1]).toMatchObject({ reason: "submitted_by_customer", actor: "customer" });
        // Still AWAITING_PROVIDER, with its deadline still ahead of `now` —
        // so the clock is the last entry, drawn pending.
        expect(detail?.timeline.at(-1)).toEqual({
          // Non-null: `submit` always replaces `expiresAt` with `respondBy`.
          at: submitted.expiresAt!.toISOString(),
          reason: "respond_by",
          actor: "system",
          pending: true,
        });
      });
    } finally {
      await bestEffortCleanup(created.map((id) => () => db.delete(booking).where(eq(booking.id, id))));
    }
  });
});
