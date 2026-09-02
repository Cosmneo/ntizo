# Customer Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the availability modal with three routed checkout pages, so a customer can hold a slot, give their details, and send a request to a provider.

**Architecture:** The slot is held by a `DRAFT` created on step 1, which is why a draft may carry no address — the customer has not given one yet. Steps 2 and 3 write nothing; the address, description and phone travel together on `submit`, which is where an address becomes required. One open draft per customer, so an abandoned checkout does not accumulate held slots.

**Tech Stack:** Bun, Drizzle over Neon Postgres, `@cosmneo/onion-lasagna` (hexagonal/DDD), Zod read models in `@ntizo/shared`, React 19 + TanStack Router + TanStack Query, Tailwind v4, i18next across 8 locales.

**Spec:** `docs/superpowers/specs/2026-09-01-customer-checkout-design.md`

## Global Constraints

- Money is integer minor units (centavos); commission is basis points, **deducted from the provider's payout**. The customer is never shown a commission breakdown.
- **The seat is never exposed** — not in a read model, not in an event, not in GraphQL.
- `app/` reaches infrastructure only through ports for adapters and repositories. Shared type constants under `shared/infrastructure/database/*/enums.ts` are read across layers throughout this codebase, including by `domain/` — that is the existing convention.
- Backend tests are `bun test` with `"bun:test"` imports, run from `packages/backend`. `packages/shared` and `apps/frontend/web` use **vitest**.
- **The gate is `bun run test` from the repo root** — that is what CI runs (`turbo run test`, every workspace). Scoping it to one workspace is how this branch twice shipped a red test.
- The dev database is shared. Randomise identifiers, clean up **in a `finally`**, and re-run a failing file alone before reporting it.
- Every transition uses `save(booking, expectedStatus)`; `false` means somebody moved it first, so return without publishing and without throwing.
- Migrations are **generated, never applied** by an implementer. The controller applies them.
- Comments say *why*, not *what*.
- Copy is authored in `pt-MZ` and `en-US` and translated into all eight locales — never left in English in a non-English file.

---

## File Structure

**Backend, modified:**
- `.../booking/domain/aggregates/booking.aggregate.ts` — `create` accepts a null address; `submit` takes and requires one
- `.../booking/domain/events/index.ts` — `BookingExpiredClock` becomes `BookingExpiredCause`, gaining `superseded`
- `.../booking/app/use-cases/create-booking.command.ts` — expires the customer's open draft first
- `.../booking/app/use-cases/submit-booking.command.ts` — takes the address, refuses without a phone
- `.../booking/app/ports/outbound/booking.repository.port.ts` — `findOpenDraftForCustomer`
- `.../booking/infrastructure/repositories/drizzle/booking.repository.ts` — the same
- `.../shared/infrastructure/database/booking/schemas/booking.schema.ts` — three columns nullable
- `.../write/booking/graphql/schema/mutations.ts` + `handlers/mutations.handlers.ts` — `booking.submit`
- `.../read/booking/**` — `booking.byId` for the owner
- `packages/shared/src/read-models/system/booking/booking.schema.ts` — three fields nullable

**Backend, created:**
- `packages/shared/src/phone/msisdn.ts` — moved out of `packages/backend`, so the browser validates with the same rule the charge does

**Frontend, created:**
- `apps/frontend/web/src/routes/book.$serviceId.tsx`
- `apps/frontend/web/src/routes/booking.$bookingId.details.tsx`
- `apps/frontend/web/src/routes/booking.$bookingId.confirm.tsx`
- `.../features/checkout/data/checkout.repository.ts` — the three GraphQL calls
- `.../features/checkout/viewmodel/use-checkout.ts` — mutations and the draft query
- `.../features/checkout/domain/draft-store.ts` — the between-steps store
- `.../features/checkout/ui/` — the three pages, plus `checkout-countdown.tsx` and `checkout-steps.tsx`

**Frontend, deleted:**
- `.../features/directory/availability/ui/availability-sheet.tsx` and its test — its three children (`date-strip.tsx`, `member-picker.tsx`, `time-grid.tsx`) are kept and reused

---

## Two decisions this plan makes that the spec did not name

**1. `BookingExpiredClock` becomes `BookingExpiredCause` and gains `superseded`.** Expiring a customer's previous draft because they started a new one is not a clock running out, and reporting it as `checkout_hold` would be a false statement in an event Notification switches on. The union is gated by a total `Record` in `booking-events.test.ts`, so adding a member is a compile error until somebody says who hears about it — the answer here is nobody, the same as `checkout_hold`.

**2. `msisdn.ts` moves to `packages/shared`.** The spec says the browser must validate with the same normaliser the charge uses, and warns that a second laxer rule in the browser would let a customer past a check the charge fails on later. It currently lives under `packages/backend/src/modules/ntizo/shared/infrastructure/payments/mpesa/`, which the web app cannot import. It is a pure function with no infrastructure, so it moves rather than being duplicated.

---

### Task 1: A draft may have no address

**Files:**
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/booking/schemas/booking.schema.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/booking/domain/aggregates/booking.aggregate.ts`
- Modify: `packages/shared/src/read-models/system/booking/booking.schema.ts`
- Create: a migration (generate with `bun run db:ntizo:generate` from `packages/backend`, **do not apply**)
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/booking/__tests__/booking.aggregate.test.ts`

**Interfaces:**
- Produces: `Booking.create` accepts `addressLabel?: string | null`, `addressLine?: string | null`, `addressCity?: string | null`. `Booking.submit(at: Date, respondBy: Date, address: { label: string; line: string; city: string; district?: string | null; directions?: string | null; lat?: number | null; lng?: number | null })`. Getters `addressLabel`, `addressLine`, `addressCity` return `string | null`.

- [ ] **Step 1: Write the failing tests**

Add to `booking.aggregate.test.ts`. `validInput` currently supplies a complete address; these override it.

```ts
describe("Booking.create — a draft may have no address", () => {
  // The customer picks a slot on step 1 and gives an address on step 2, so
  // the hold has to exist before the address does. Null is "not supplied
  // yet"; blank is a bug, and the two must not be collapsed.
  it("accepts a draft with no address at all", () => {
    const booking = Booking.create(
      validInput({ addressLabel: null, addressLine: null, addressCity: null }),
    );
    expect(booking.status).toBe("DRAFT");
    expect(booking.addressLabel).toBeNull();
    expect(booking.addressLine).toBeNull();
    expect(booking.addressCity).toBeNull();
  });

  it.each(["addressLabel", "addressLine", "addressCity"] as const)(
    "still refuses a present-but-blank %s",
    (field) => {
      expect(() => Booking.create(validInput({ [field]: "" }))).toThrow(BookingFieldBlankError);
      expect(() => Booking.create(validInput({ [field]: "   " }))).toThrow(BookingFieldBlankError);
    },
  );
});

describe("Booking.submit — the address becomes required here", () => {
  const RESPOND_BY = new Date("2026-09-04T11:00:00.000Z");
  const AT = new Date("2026-09-04T09:00:00.000Z");
  const ADDRESS = {
    label: "Casa",
    line: "Av. Julius Nyerere 812",
    city: "Maputo",
    district: "Sommerschield",
    directions: null,
    lat: null,
    lng: null,
  };

  function draftWithoutAddress() {
    return Booking.restore(
      validProps({
        status: "DRAFT",
        addressLabel: null,
        addressLine: null,
        addressCity: null,
      }),
    );
  }

  it("writes the address onto the booking it returns", () => {
    const submitted = draftWithoutAddress().submit(AT, RESPOND_BY, ADDRESS);
    expect(submitted.status).toBe("AWAITING_PROVIDER");
    expect(submitted.addressLabel).toBe("Casa");
    expect(submitted.addressLine).toBe("Av. Julius Nyerere 812");
    expect(submitted.addressCity).toBe("Maputo");
    expect(submitted.addressDistrict).toBe("Sommerschield");
  });

  it.each(["label", "line", "city"] as const)("refuses a blank %s", (field) => {
    expect(() => draftWithoutAddress().submit(AT, RESPOND_BY, { ...ADDRESS, [field]: "  " })).toThrow(
      BookingFieldBlankError,
    );
  });

  it("still replaces expiresAt with respondBy", () => {
    // Guarding the behaviour the address change sits next to: the provider's
    // window has to start here, not keep the checkout hold.
    const submitted = draftWithoutAddress().submit(AT, RESPOND_BY, ADDRESS);
    expect(submitted.expiresAt).toEqual(RESPOND_BY);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/booking/__tests__/booking.aggregate.test.ts`
Expected: FAIL — `submit` takes two arguments, and `create` refuses a null address.

- [ ] **Step 3: Widen the three columns**

In `booking.schema.ts`, drop `.notNull()` from the three:

```ts
addressLabel: text("address_label"),
addressLine: text("address_line"),
addressCity: text("address_city"),
```

Leave `address_district`, `address_directions`, `address_lat`, `address_lng` exactly as they are — already nullable.

- [ ] **Step 4: Change the aggregate**

In `BookingProps`, the three become `string | null`. In `create`'s input they become `addressLabel?: string | null` (same for line and city), and their three unconditional `requireNonBlank` calls move into the conditional block that already guards `addressDistrict`:

```ts
// Null is how a caller says "the customer has not reached step 2 yet".
// A present-but-blank value says something different and wrong — that
// there is an address, and it is nothing. The distinction is load-bearing:
// collapse it and a blank address reaches a submitted booking.
for (const field of ["addressLabel", "addressLine", "addressCity"] as const) {
  const value = input[field];
  if (value != null) {
    Booking.requireNonBlank(value, field);
  }
}
```

The three getters return `string | null`. Then `submit` gains the address:

```ts
submit(
  at: Date,
  respondBy: Date,
  address: {
    label: string;
    line: string;
    city: string;
    district?: string | null;
    directions?: string | null;
    lat?: number | null;
    lng?: number | null;
  },
): Booking {
  if (this.props.status !== BookingStatus.Draft) {
    throw new BookingTransitionError(this.props.status, BookingStatus.AwaitingProvider);
  }

  Booking.requireValidDate(at, "at");
  Booking.requireValidDate(respondBy, "respondBy");

  // The invariant this method carries: a DRAFT may have no address, and
  // nothing past DRAFT may be without one. This is the hop where a booking
  // stops being the customer's private draft and becomes a request somebody
  // has to answer, so it is the hop that has to be able to name the place.
  Booking.requireNonBlank(address.label, "addressLabel");
  Booking.requireNonBlank(address.line, "addressLine");
  Booking.requireNonBlank(address.city, "addressCity");
  if (address.district != null) {
    Booking.requireNonBlank(address.district, "addressDistrict");
  }
  if (address.directions != null) {
    Booking.requireNonBlank(address.directions, "addressDirections");
  }

  return new Booking({
    ...this.props,
    status: BookingStatus.AwaitingProvider,
    expiresAt: respondBy,
    addressLabel: address.label,
    addressLine: address.line,
    addressCity: address.city,
    addressDistrict: address.district ?? null,
    addressDirections: address.directions ?? null,
    addressLat: address.lat ?? null,
    addressLng: address.lng ?? null,
  });
}
```

- [ ] **Step 5: Widen the read model**

In `packages/shared/src/read-models/system/booking/booking.schema.ts`:

```ts
  // Null on a DRAFT and only on a DRAFT: the customer holds the slot from
  // step 1 and gives the address on step 2, so a draft that has not reached
  // step 2 has no address to report. `submit` refuses without one, so any
  // status past DRAFT carries all three.
  addressLabel: z.string().nullable(),
  addressLine: z.string().nullable(),
  addressCity: z.string().nullable(),
```

- [ ] **Step 6: Generate the migration**

Run from `packages/backend`: `bun run db:ntizo:generate`

Read the generated SQL before committing. It must contain three `DROP NOT NULL` statements and nothing else. If drizzle-kit emits a `$1` placeholder anywhere, replace it with a literal — a parameterised predicate fails on apply with `42P02`; this branch has hit it once.

- [ ] **Step 7: Run the suites**

Run: `bun run test` from the repo root.
Expected: the aggregate tests PASS. Database-backed tests that insert a booking will FAIL until the controller applies the migration — that is the designed signal. Report the exact count and confirm every failure names the address columns.

Then `bun run typecheck` from `packages/backend`.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(booking): let a draft exist before the customer has given an address" -- \
  packages/backend/src/modules/ntizo/shared/infrastructure/database/booking/schemas/booking.schema.ts \
  packages/backend/src/modules/ntizo/bounded-contexts/booking/domain/aggregates/booking.aggregate.ts \
  packages/backend/src/modules/ntizo/bounded-contexts/booking/__tests__/booking.aggregate.test.ts \
  packages/shared/src/read-models/system/booking/booking.schema.ts \
  packages/backend/src/modules/ntizo/shared/infrastructure/migrations/
```

---

### Task 2: One open draft per customer

**Files:**
- Modify: `.../booking/domain/events/index.ts`
- Modify: `.../booking/app/ports/outbound/booking.repository.port.ts`
- Modify: `.../booking/infrastructure/repositories/drizzle/booking.repository.ts`
- Modify: `.../booking/app/use-cases/create-booking.command.ts`
- Test: `.../booking/__tests__/booking-events.test.ts`, `.../booking/__tests__/create-booking.command.test.ts`, `.../shared/infrastructure/database/__tests__/booking-charge-sweep.test.ts`'s sibling — create `.../shared/infrastructure/database/__tests__/booking-draft-supersede.test.ts`

**Interfaces:**
- Consumes: `Booking.create` from Task 1.
- Produces: `BookingRepositoryPort.findOpenDraftForCustomer(customerId: string): Promise<Booking | null>`. `BookingExpiredCause = "checkout_hold" | "provider_response" | "superseded"`.

- [ ] **Step 1: Write the failing tests**

First, the event union. In `booking-events.test.ts`, the existing total `Record<BookingExpiredClock, "nobody" | "the customer">` gate gains a row:

```ts
// Renamed from BookingExpiredClock: two of the three are clocks and the
// third is not. A draft superseded because the customer started a new one
// did not run out of anything, and reporting it as `checkout_hold` would
// make this event say something false about why a slot came free.
const AUDIENCE: Record<BookingExpiredCause, "nobody" | "the customer"> = {
  checkout_hold: "nobody",
  provider_response: "the customer",
  // The customer did this deliberately, three seconds ago, by picking a
  // different time. Telling them about it would be telling them what they
  // just did.
  superseded: "nobody",
};
```

Then the rule itself, in a new DB test `booking-draft-supersede.test.ts`:

```ts
it("expires the customer's previous draft, and releases its slot", async () => {
  // The fixture that makes this able to fail: the customer already holds a
  // draft on a DIFFERENT slot. A test whose customer holds nothing cannot
  // fail if the rule is dropped, and a test where both drafts are on the
  // same slot would pass on the exclusion constraint instead of on this rule.
  await withBookings(async (track) => {
    const first = await createDraft({ customerId, startsAt: NINE_AM });
    track(first.id);

    const second = await createDraft({ customerId, startsAt: TEN_AM });
    track(second.id);

    const rows = await db
      .select({ id: booking.id, status: booking.status })
      .from(booking)
      .where(inArray(booking.id, [first.id, second.id]));

    expect(rows.find((r) => r.id === first.id)?.status).toBe("EXPIRED");
    expect(rows.find((r) => r.id === second.id)?.status).toBe("DRAFT");

    // The whole point of the rule is the calendar, not the row: assert the
    // released slot, not merely the changed status.
    expect(await slotIsFree(memberId, NINE_AM)).toBe(true);
  });
});

it("leaves another customer's draft alone", async () => {
  // Same shape as the authorisation fixtures elsewhere on this branch: the
  // row that must NOT move belongs to somebody else, and the assertion is
  // about that row.
  await withBookings(async (track) => {
    const theirs = await createDraft({ customerId: otherCustomerId, startsAt: NINE_AM });
    track(theirs.id);

    const mine = await createDraft({ customerId, startsAt: TEN_AM });
    track(mine.id);

    const [row] = await db
      .select({ status: booking.status })
      .from(booking)
      .where(eq(booking.id, theirs.id));
    expect(row?.status).toBe("DRAFT");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/backend && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/booking-draft-supersede.test.ts`
Expected: FAIL — the first draft is still `DRAFT` and its slot is still held.

- [ ] **Step 3: Rename the union and add the member**

In `domain/events/index.ts`, rename `BookingExpiredClock` to `BookingExpiredCause` throughout, add `"superseded"` to it, and update the doc comment: it named itself after `platform_settings` columns, which is no longer true of every member. Update `BookingExpired`'s payload field name from `clock` to `cause`, and every producer in `sweep-booking.command.ts`.

- [ ] **Step 4: Add the port method and its adapter**

In `booking.repository.port.ts`:

```ts
/**
 * The one draft this customer is allowed to be holding, if any.
 *
 * A customer who abandons step 2 three times would otherwise hold three
 * slots for thirty minutes each — follow-up #108's calendar-hold problem
 * arriving by accident rather than by attack. `CreateBookingCommand` reads
 * this and expires what it finds before holding another slot.
 *
 * Not a rate limit and not pretending to be one: a scripted caller can
 * still create, abandon and re-create in a loop. #108 stays open.
 */
findOpenDraftForCustomer(customerId: string): Promise<Booking | null>;
```

In the Drizzle adapter, a single-row select on `customerId` and `status = 'DRAFT'`, mapped through the same `toAggregate` every other read uses.

- [ ] **Step 5: Expire it inside create's transaction**

In `create-booking.command.ts`, inside the existing `atomicExecute`, before the insert:

```ts
// Same transaction as the insert on purpose: a customer who ends up with
// neither their old draft nor a new one has lost a slot to a failure that
// did nothing else.
const previous = await this.repo.findOpenDraftForCustomer(input.customerId);
if (previous?.id) {
  const expired = previous.expire(at);
  const applied = await this.repo.save(expired, previous.status);
  if (applied) {
    await this.slotHold.release(previous.id);
    await this.outboxPort.publish(
      [
        new BookingExpired({
          bookingId: previous.id,
          customerId: previous.customerId,
          providerMemberId: previous.providerMemberId,
          startsAt: previous.startsAt,
          cause: "superseded",
        }),
      ],
      "Booking",
    );
  }
}
```

- [ ] **Step 6: Run the suites**

Run: `bun run test` from the repo root. Then `bun run typecheck` from `packages/backend`, and `bunx eslint packages/backend/src/modules/ntizo` from the repo root.

Then prove the rule is load-bearing: delete the `findOpenDraftForCustomer` block and confirm the two new tests redden. Restore, and confirm `git status --short` is clean before committing.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(booking): one open draft per customer" -- <the files above>
```

---

### Task 3: Submit carries the address and needs a phone

**Files:**
- Create: `packages/shared/src/phone/msisdn.ts` (moved), `packages/shared/src/phone/index.ts`
- Delete: `packages/backend/src/modules/ntizo/shared/infrastructure/payments/mpesa/msisdn.ts` and its test, after moving both
- Modify: `.../booking/app/use-cases/submit-booking.command.ts`
- Modify: `.../booking/bootstrap/index.ts`
- Modify: `.../write/booking/graphql/schema/mutations.ts`, `.../write/booking/graphql/handlers/mutations.handlers.ts`
- Modify: `.../read/booking/**` — add `booking.byId`
- Test: `.../booking/__tests__/submit-accept-decline-booking.command.test.ts`, `.../write/booking/__tests__/mutations.test.ts`

**Interfaces:**
- Consumes: `Booking.submit(at, respondBy, address)` from Task 1; `CustomerPhoneReaderPort.findPhoneNumber(userId)`, which already exists.
- Produces: GraphQL `booking.submit(input: { bookingId, address: {...}, description })` and `booking.byId(input: { bookingId })`.

- [ ] **Step 1: Move the normaliser**

`git mv` `msisdn.ts` and `__tests__/msisdn.test.ts` into `packages/shared/src/phone/`, export from `packages/shared/src/index.ts`, and update `mpesa-payment-charge.adapter.ts`'s import to `@ntizo/shared`.

Nothing about the function changes. Its test — which loops all 100 two-digit prefixes and refuses 98 of them in three forms — moves with it and must still pass, under vitest rather than `bun test`. Change the import from `"bun:test"` to `"vitest"`; nothing else.

- [ ] **Step 2: Write the failing tests**

```ts
it("refuses a customer who has no phone number on file", async () => {
  // The mockup promises "Recebe um pedido de pagamento no 84 ••• 4021", and
  // a customer with no number is charged into the void, spends all three
  // attempts, and has the booking cancelled telling the provider they did
  // not pay. This refusal is what makes the step-3 field a rule rather than
  // a UI convention — anything calling the mutation directly meets it too.
  const phones = new FakePhoneReader({ [CUSTOMER_ID]: null });
  const command = buildSubmit({ phones });

  await expect(command.execute({ bookingId, requesterUserId: CUSTOMER_ID, address: ADDRESS }))
    .rejects.toThrow(CustomerPhoneMissingError);

  // A refusal writes nothing. Not merely "no booking came back" — a command
  // that writes and then throws passes that weaker assertion.
  expect(repo.saveCalls).toBe(0);
  expect(outbox.published).toEqual([]);
});

it("submits when the customer has one", async () => {
  const phones = new FakePhoneReader({ [CUSTOMER_ID]: "258841234567" });
  const command = buildSubmit({ phones });

  await command.execute({ bookingId, requesterUserId: CUSTOMER_ID, address: ADDRESS });

  expect(repo.lastSaved?.status).toBe("AWAITING_PROVIDER");
  expect(repo.lastSaved?.addressCity).toBe("Maputo");
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/booking/__tests__/submit-accept-decline-booking.command.test.ts`
Expected: FAIL — `CustomerPhoneMissingError` does not exist and `execute` takes no address.

- [ ] **Step 4: Implement**

Add `CustomerPhoneMissingError` to `booking/domain/exceptions.ts`, following the shape of its siblings there. In `SubmitBookingCommand`, inject `CustomerPhoneReaderPort`, and read the phone **before** the transaction opens — the refusal needs no transaction, and taking one to throw it out again is work nobody asked for:

```ts
const phone = await this.phones.findPhoneNumber(input.requesterUserId);
if (phone == null || phone.trim().length === 0) {
  throw new CustomerPhoneMissingError(input.requesterUserId);
}
```

Pass `input.address` through to `booking.submit(at, respondBy, input.address)`.

- [ ] **Step 5: Mount the mutation**

In `write/booking/graphql/schema/mutations.ts`, beside `createBooking`:

```ts
/**
 * The customer finishes checkout and sends the request on to the provider.
 *
 * **There is no `customerId` field**, for the same reason `createBooking`
 * has none: the customer comes from `requireUser(ctx)`, and a field here
 * would make this the mutation that submits somebody else's draft. The
 * command's own authorisation check refuses a requester who is not the
 * booking's customer.
 *
 * The address arrives here rather than on `createBooking` because the
 * customer supplies it on step 2, after the slot is already held — see the
 * design's own account of the conflict this resolves.
 */
export const submitBooking = defineMutation({
  input: zodSchema(
    z.object({
      bookingId: z.string().min(1),
      address: z.object({
        label: z.string().trim().min(1),
        line: z.string().trim().min(1),
        city: z.string().trim().min(1),
        district: z.string().trim().min(1).nullable(),
        directions: z.string().trim().max(500).nullable(),
        lat: z.number().nullable(),
        lng: z.number().nullable(),
      }),
      description: z.string().trim().max(1000).nullable(),
    }),
  ),
  output: zodSchema(z.object({ bookingId: z.string().min(1), respondBy: z.string() })),
  docs: { summary: "Send a booking request to the provider", tags: ["Booking"] },
});
```

Register it as `{ booking: { create: createBooking, submit: submitBooking } }`, and add the handler beside `booking.create`'s.

- [ ] **Step 6: Add `booking.byId` for the owner**

Steps 2 and 3 load one booking. `booking.mine` returns a list; a by-id query is what those pages need. Add it to `read/booking` following `list-my-bookings.projection.ts`'s shape, with the repository filtering on **both** `id` and `customerId` — an authorisation expressed as a `WHERE` clause rather than a check after the read, so there is no window in which the wrong booking is in memory.

Its test must ask for another customer's booking by id and assert `null` comes back, with that other customer's booking actually present in the fixture.

- [ ] **Step 7: Run the suites and commit**

Run: `bun run test` from the repo root, `bun run typecheck` from `packages/backend`, `bunx eslint packages/backend/src/modules/ntizo` from the repo root.

```bash
git commit -m "feat(booking): mount submit, and make the phone number a rule" -- <the files above>
```

---

### Task 4: Step 1 — choose when

**Files:**
- Create: `apps/frontend/web/src/routes/book.$serviceId.tsx`
- Create: `.../features/checkout/data/checkout.repository.ts`, `.../features/checkout/viewmodel/use-checkout.ts`
- Create: `.../features/checkout/ui/choose-when-page.tsx`, `.../features/checkout/ui/checkout-countdown.tsx`, `.../features/checkout/ui/checkout-steps.tsx`
- Delete: `.../features/directory/availability/ui/availability-sheet.tsx` and `.../ui/__tests__/availability-sheet.test.tsx`
- Modify: `.../features/directory/services/ui/service-card.tsx`, `service-quote-notice.tsx`, `services-section.tsx`, `service-detail-page.tsx` — link instead of opening a sheet
- Test: `.../features/checkout/ui/__tests__/choose-when-page.test.tsx`, `.../features/checkout/ui/__tests__/checkout-countdown.test.tsx`

**Interfaces:**
- Consumes: `booking.create` (already mounted), `DateStrip`, `MemberPicker`, `TimeGrid` from `features/directory/availability/ui/`.
- Produces: route `/book/$serviceId` with search params `{ memberId?: string; startsAt?: string }`; `useCreateBooking()`.

- [ ] **Step 1: Write the failing tests**

```tsx
it("keeps the chosen slot in the URL, not in memory", async () => {
  // The sign-in round trip leaves the app entirely. A choice held in
  // component state does not survive it, and the customer comes back to an
  // empty grid having already decided. This is also what makes a slot
  // linkable and a refresh harmless.
  const { router } = renderChooseWhen({ serviceId: "svc-1" });
  await userEvent.click(await screen.findByRole("button", { name: /09:00/ }));

  expect(router.state.location.search).toMatchObject({
    memberId: "mem-1",
    startsAt: "2026-09-04T09:00:00.000Z",
  });
});

it("sends an anonymous visitor to sign in and back to the same slot", async () => {
  const { router } = renderChooseWhen({ serviceId: "svc-1", session: null });
  await userEvent.click(await screen.findByRole("button", { name: /09:00/ }));
  await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

  expect(router.state.location.pathname).toBe("/sign-in");
  expect(router.state.location.search.redirect).toContain("startsAt=2026-09-04T09");
});

it("shows the slot as gone when somebody else took it", async () => {
  // The command refuses with SLOT_ALREADY_TAKEN. Telling the customer
  // "something went wrong" would leave them clicking the same dead time.
  const { create } = renderChooseWhen({
    serviceId: "svc-1",
    createFails: { code: "SLOT_ALREADY_TAKEN" },
  });
  await userEvent.click(await screen.findByRole("button", { name: /09:00/ }));
  await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

  expect(await screen.findByText(/já foi marcada/i)).toBeInTheDocument();
  expect(create.refetched).toBe(true);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/frontend/web && bun run test src/features/checkout`
Expected: FAIL — the route does not exist.

- [ ] **Step 3: Build the page**

The route declares its search params the way `services.index.tsx` does:

```tsx
export const Route = createFileRoute("/book/$serviceId")({
  validateSearch: (search: Record<string, unknown>): { memberId?: string; startsAt?: string } => ({
    memberId: typeof search.memberId === "string" ? search.memberId : undefined,
    startsAt: typeof search.startsAt === "string" ? search.startsAt : undefined,
  }),
  component: ChooseWhenPage,
});
```

`ChooseWhenPage` renders `DateStrip`, `MemberPicker` and `TimeGrid` unchanged — they already take the props the sheet gave them — plus `CheckoutSteps` (1 of 3) and the confirm button. Confirming calls `booking.create` and navigates to `/booking/$bookingId/details`.

- [ ] **Step 4: Delete the sheet and relink its callers**

Remove `availability-sheet.tsx` and its test. Its four callers currently open a dialog; each becomes a `<Link to="/book/$serviceId" params={{ serviceId }} />`. `service-quote-notice.tsx` links the same way — a quote-mode service still starts here.

- [ ] **Step 5: Build the countdown**

`CheckoutCountdown` takes the draft's `expiresAt` and renders `Hora reservada MM:SS`, reaching zero by navigating back to step 1 with a message rather than by sitting at `00:00`. Copy in all eight locales.

- [ ] **Step 6: Run the suites and commit**

Run: `bun run test` from the repo root.

```bash
git commit -m "feat(web): choose a time on a page, not in a modal" -- <the files above>
```

---

### Task 5: Step 2 — details

**Files:**
- Create: `apps/frontend/web/src/routes/booking.$bookingId.details.tsx`
- Create: `.../features/checkout/ui/details-page.tsx`, `.../features/checkout/domain/draft-store.ts`
- Test: `.../features/checkout/ui/__tests__/details-page.test.tsx`, `.../features/checkout/domain/__tests__/draft-store.test.ts`

**Interfaces:**
- Consumes: `booking.byId` from Task 3; the address book's existing `list-my-addresses` query.
- Produces: `saveDraftDetails(bookingId, { addressId, description })` and `readDraftDetails(bookingId)` in `draft-store.ts`; route `/booking/$bookingId/details`.

- [ ] **Step 1: Write the failing tests**

```ts
it("carries the details to step 3 without writing them to the server", () => {
  // The design's one-write-at-each-end rule: an intermediate mutation would
  // leave a row that is neither an abandoned draft nor a sent request, and
  // a second place for the address to disagree with itself.
  saveDraftDetails("bk-1", { addressId: "addr-2", description: "Portão azul" });
  expect(readDraftDetails("bk-1")).toEqual({ addressId: "addr-2", description: "Portão azul" });
});

it("keeps one booking's details out of another's", () => {
  saveDraftDetails("bk-1", { addressId: "addr-2", description: "Portão azul" });
  expect(readDraftDetails("bk-2")).toBeNull();
});

it("survives a refresh", () => {
  // sessionStorage rather than component state: the customer who reloads
  // step 2 keeps what they typed. Scoped to the tab, gone when it closes.
  saveDraftDetails("bk-1", { addressId: "addr-2", description: "Portão azul" });
  expect(JSON.parse(sessionStorage.getItem("ntizo.checkout.bk-1") ?? "null")).toMatchObject({
    addressId: "addr-2",
  });
});
```

```tsx
it("offers the add-address form when there are none saved", async () => {
  // An empty list with nothing to do next reads as broken. The customer
  // cannot proceed without an address, so the form IS the empty state.
  renderDetails({ bookingId: "bk-1", addresses: [] });
  expect(await screen.findByRole("form", { name: /nova morada/i })).toBeInTheDocument();
});

it("sends the customer back to step 1 when the draft has expired", async () => {
  const { router } = renderDetails({ bookingId: "bk-1", booking: null });
  expect(router.state.location.pathname).toBe("/book/svc-1");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/frontend/web && bun run test src/features/checkout`
Expected: FAIL — neither `draft-store.ts` nor the route exists.

- [ ] **Step 3: Build the store**

`sessionStorage`, keyed `ntizo.checkout.<bookingId>`, with every read and write wrapped in `try/catch` — a private window or a browser refusing site data must not break checkout. A read that throws or finds nothing returns `null`.

- [ ] **Step 4: Build the page**

Loads the booking through `booking.byId` and the addresses through the existing query. A `null` booking means the draft expired or was superseded: navigate to `/book/$serviceId` with the reason. Renders the address list as a radio group, the inline add-address form, the description field, `CheckoutSteps` (2 of 3), and the countdown.

Continuing writes to the store and navigates to `/booking/$bookingId/confirm`.

- [ ] **Step 5: Run the suites and commit**

```bash
git commit -m "feat(web): the details step" -- <the files above>
```

---

### Task 6: Step 3 — confirm and send

**Files:**
- Create: `apps/frontend/web/src/routes/booking.$bookingId.confirm.tsx`
- Create: `.../features/checkout/ui/confirm-page.tsx`
- Modify: `.../features/checkout/data/checkout.repository.ts`, `.../features/checkout/viewmodel/use-checkout.ts`
- Test: `.../features/checkout/ui/__tests__/confirm-page.test.tsx`

**Interfaces:**
- Consumes: `booking.submit` from Task 3; `user.updateMyProfile` (already mounted); `normaliseMsisdn` from `@ntizo/shared`; `readDraftDetails` from Task 5.

- [ ] **Step 1: Write the failing tests**

```tsx
it("validates the phone with the same rule the charge uses", async () => {
  // 82 is a real Mozambican prefix and not Vodacom's. A laxer browser rule
  // would accept it here and the charge would fail on it later, after the
  // provider had already blocked their calendar.
  renderConfirm({ bookingId: "bk-1" });
  await userEvent.type(screen.getByLabelText(/telem[oó]vel/i), "821234567");
  await userEvent.click(screen.getByRole("button", { name: /enviar pedido/i }));

  expect(await screen.findByText(/n[uú]mero.*Vodacom/i)).toBeInTheDocument();
  expect(submitSpy).not.toHaveBeenCalled();
});

it("saves the phone before submitting, in that order", async () => {
  // Two mutations, not one: setting a phone number is the User context's
  // job. If the second fails the phone is still saved, which is recoverable
  // and not wrong.
  renderConfirm({ bookingId: "bk-1" });
  await userEvent.type(screen.getByLabelText(/telem[oó]vel/i), "841234567");
  await userEvent.click(screen.getByRole("button", { name: /enviar pedido/i }));

  await waitFor(() => expect(calls).toEqual(["user.updateMyProfile", "booking.submit"]));
});

it("shows the price the customer pays and no commission anywhere", () => {
  // The commission comes out of the provider's payout. Showing the customer
  // a breakdown of money that never leaves their side invents a fee they
  // are not charged.
  renderConfirm({ bookingId: "bk-1", priceMinor: 150000, commissionMinor: 18000 });
  expect(screen.getByText("1.500,00 MZN")).toBeInTheDocument();
  expect(screen.queryByText(/comiss/i)).not.toBeInTheDocument();
  expect(screen.queryByText("180,00")).not.toBeInTheDocument();
});

it("says nothing is charged now", () => {
  // The mockup's own promise, and the one sentence on this page that would
  // be a lie under the old ordering.
  renderConfirm({ bookingId: "bk-1" });
  expect(screen.getByText(/nada é cobrado agora/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/frontend/web && bun run test src/features/checkout`
Expected: FAIL — the route does not exist.

- [ ] **Step 3: Build the page**

Reads the booking through `booking.byId` and the details from the store. Renders the slot, the address, the price, the M-Pesa method (one method, not a chooser with disabled options — card and cash are out of scope this phase), the phone field pre-filled from the profile, and the mockup's three-step explanation.

Sending calls `user.updateMyProfile` with the phone, then `booking.submit` with the address from the store, then navigates to `/bookings` where the request appears as awaiting the provider.

- [ ] **Step 4: Translate**

The three pages' copy in all eight locales. `pt-MZ` and `en-US` are authored; the other six are translated in full — never a file left half-English, which this branch shipped once.

- [ ] **Step 5: Run the suites and commit**

Run: `bun run test` from the repo root, and `bunx eslint apps/frontend/web/src` from the repo root.

```bash
git commit -m "feat(web): confirm and send the request" -- <the files above>
```

---

## Self-Review

**Spec coverage.** The three pages are Tasks 4–6. The address nullability and its invariant are Task 1. The one-open-draft rule is Task 2. `booking.submit` mounted, the phone requirement and its server-side refusal, and `booking.byId` are Task 3. Deleting the sheet is Task 4, Step 4. The failure table's five rows map to: slot taken (Task 4), draft expired (Task 5), not signed in (Task 4), no saved addresses (Task 5), phone refused (Task 6).

**Two things the spec named that this plan resolves differently, and says so.** The spec accepts that a refresh on step 2 loses the typed address; Task 5 keeps it in `sessionStorage`, which is strictly better and costs nothing. And the spec called the phone normaliser "already built" without saying the web app cannot import from `packages/backend` — Task 3, Step 1 moves it.

**Ordering.** Task 1's migration must be applied before Tasks 2 and 3 can be verified against the database — a manual act the controller performs, and the plan pauses there. Tasks 4–6 depend on Task 3's mutations existing but not on the migration.

**Type consistency.** `Booking.submit(at, respondBy, address)` is defined in Task 1 and consumed in Task 3. `BookingExpiredCause` is renamed in Task 2 and used nowhere later. `findOpenDraftForCustomer` is declared and implemented in the same task. `readDraftDetails`/`saveDraftDetails` are defined in Task 5 and consumed in Task 6. The address object's shape — `{ label, line, city, district, directions, lat, lng }` — is the same in the aggregate, the mutation schema and the store.

**What is deliberately not here.** The provider's inbox, `accept` and `decline` mounted, and the notification relay are the second spec's. Until they exist, a submitted request can only be accepted by hand — which is the slicing the original booking spec chose, not an oversight.
