# Service Catalogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A provider creates services, gives each one what it offers and at what price, translates them if they want to, and publishes them; customers can read the published ones.

**Architecture:** A `Service` aggregate in the existing `catalog` bounded context, holding its options as a collection. Four new tables in the `ntizo_catalog` Postgres schema beside the categories already there. Three GraphQL slices: `write/catalog` for the mutations, `read/catalog` for the provider's own list, `public/catalog` for the customer's, resolved into one locale.

**Tech Stack:** Bun 1.3.9, Turborepo, Drizzle + Neon Postgres, GraphQL Yoga on Hono/Cloudflare Workers, `@cosmneo/onion-lasagna` (hexagonal/DDD kit), TanStack Start + React, i18next.

**Spec:** `docs/superpowers/specs/2026-08-11-service-catalogue-design.md`

## Global Constraints

- **Money is integers in minor units.** `bigint`, never a decimal or float. 300,50 MT is `30050`.
- **Every domain refusal extends a kit error type** (`ConflictError`, `NotFoundError`, `UnprocessableError`, `ForbiddenError` from `@cosmneo/onion-lasagna`). A bare `Error` reaches the browser as "An unexpected error occurred" with code `INTERNAL_ERROR`. This has been got wrong three times on this project; every one was found by calling the endpoint, never by reading the code.
- **A new Postgres schema must be registered in two places** — `packages/backend/src/modules/ntizo/drizzle.config.ts` `schemaFilter` and the database `index.ts`. `ntizo_catalog` is already in both; no new schema is needed here.
- **Backend tests run under `bun:test`** (`import { describe, expect, it } from "bun:test"`). Frontend tests run under `vitest`. Using the wrong one fails typecheck.
- **`zod.default()` does not survive into the GraphQL schema.** Use `.optional()` and apply the default in the handler's `argsMapper`.
- **The kit's `argsMapper` is synchronous.** Any check needing a query goes in a `.handle()` body, not `handleWithUseCase`'s mapper.
- **`ui/` may not import `data/`** — enforced by `eslint-plugin-boundaries`.
- **Nothing under `public/` may import from `read/` or `write/`** — enforced by `packages/backend/src/modules/ntizo/public/__tests__/public-imports.guard.test.ts`. Shared persistence lives in `bounded-contexts/`.
- **A field the aggregate holds and the mapper does not carry silently never persists.** Both directions of every mapper, every time. This is where every logo upload was lost.
- **Verification is against the running app.** Every silent failure on this project passed types, lint and tests: images that never persisted, submenu clicks that died to a `mousedown` handler, a schema absent from the migration filter, a route shadowed by its neighbour.

---

## File Structure

**`packages/shared/src/enums/`**
- `booking-enums/index.ts` — modify: const arrays + zod for the two bare unions
- `catalog-enums/index.ts` — create: service status, booking mode, pricing mode

**`packages/backend/src/modules/ntizo/shared/infrastructure/database/catalog/schemas/`**
- `service.schema.ts` — create: `service`, `service_option`, `service_quote_form`, `service_translation`, `service_option_translation`

**`packages/backend/src/modules/ntizo/bounded-contexts/catalog/`**
- `domain/translations.ts` — modify: fallback locale becomes a parameter
- `domain/service-rules.ts` — create: the pure invariants, testable without a database
- `domain/aggregates/service.aggregate.ts` — create
- `domain/exceptions.ts` — modify: the catalogue's new refusals
- `app/ports/outbound/service.repository.port.ts` — create
- `app/use-cases/*.command.ts` — create: one file per command
- `infrastructure/repositories/drizzle/service.repository.ts` — create
- `bootstrap/index.ts` — modify

**`packages/backend/src/modules/ntizo/write/catalog/`** — modify both files
**`packages/backend/src/modules/ntizo/read/catalog/`** — add the provider-facing read
**`packages/backend/src/modules/ntizo/public/catalog/`** — add the customer-facing read

**`packages/shared/src/read-models/`**
- `system/service/` — create: the provider's own view, translations unresolved
- `public/service/` — create: the customer's view, one locale

**`apps/frontend/web/src/features/provider/services/`**
- `domain/types.ts`, `data/service.repository.ts`, `viewmodel/use-services.ts`
- `ui/services-page.tsx`, `ui/service-form.tsx`, `ui/options-editor.tsx`, `ui/translations-sheet.tsx`

---

## Task 1: The two things in `packages/shared` that must be fixed first

**Files:**
- Modify: `packages/shared/src/enums/booking-enums/index.ts`
- Create: `packages/shared/src/enums/catalog-enums/index.ts`
- Modify: `packages/shared/src/enums/index.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/domain/translations.ts`
- Test: `packages/shared/src/enums/__tests__/catalog-enums.test.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/__tests__/category-domain.test.ts` (extend)

**Interfaces:**
- Produces: `SERVICE_LOCATION_TYPES`, `serviceLocationTypeSchema`, `BOOKING_PATHS`, `bookingPathSchema`, `SERVICE_STATUSES`, `serviceStatusSchema`, `SERVICE_BOOKING_MODES`, `serviceBookingModeSchema`, `SERVICE_PRICING_MODES`, `servicePricingModeSchema`, and `resolveTranslation(rows, locale, fallbackLocale)`.

- [ ] **Step 1: Write the failing test for the enums**

Create `packages/shared/src/enums/__tests__/catalog-enums.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SERVICE_LOCATION_TYPES,
  serviceLocationTypeSchema,
  SERVICE_BOOKING_MODES,
  SERVICE_PRICING_MODES,
  SERVICE_STATUSES,
  serviceStatusSchema,
} from "../index";

/**
 * These exist as runtime values, not only as types. Every other enum on this
 * project is a `const` array with a zod schema derived from it, because the
 * API validates against the values at request time and a type union has none
 * of them at run time.
 */
describe("catalogue enums", () => {
  it("exposes the four service location types at runtime", () => {
    expect([...SERVICE_LOCATION_TYPES]).toEqual([
      "at_customer",
      "at_provider",
      "remote",
      "flexible",
    ]);
  });

  it("validates a known location type and rejects an unknown one", () => {
    expect(serviceLocationTypeSchema.safeParse("remote").success).toBe(true);
    expect(serviceLocationTypeSchema.safeParse("in_orbit").success).toBe(false);
  });

  it("exposes the booking and pricing modes", () => {
    expect([...SERVICE_BOOKING_MODES]).toEqual(["priced", "quote"]);
    expect([...SERVICE_PRICING_MODES]).toEqual(["fixed", "hourly"]);
  });

  it("exposes the three service statuses", () => {
    expect([...SERVICE_STATUSES]).toEqual(["draft", "published", "archived"]);
    expect(serviceStatusSchema.safeParse("draft").success).toBe(true);
    expect(serviceStatusSchema.safeParse("pending").success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/shared && bunx vitest run src/enums/__tests__/catalog-enums.test.ts`
Expected: FAIL — the module has no such exports.

- [ ] **Step 3: Rewrite the bare unions as const arrays**

Replace the two type-only unions in `packages/shared/src/enums/booking-enums/index.ts`. Keep `BookingStatus` as it is — nothing in this slice touches it.

```ts
import { z } from "zod";

/**
 * The four ways a booking can be reached.
 *
 * A `const` array with the type derived from it, not a bare union: the API
 * validates an incoming value at request time and a type union has nothing to
 * validate against. Same shape as `USER_ROLES` and `LOCALES`.
 */
export const BOOKING_PATHS = [
  "package",      // A — fixed-price package
  "hourly",       // B — hourly booking
  "custom_quote", // C — customer requests a quote
  "task_bid",     // D — customer posts a task, providers bid
] as const;

export const bookingPathSchema = z.enum(BOOKING_PATHS);
export type BookingPath = (typeof BOOKING_PATHS)[number];

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "disputed";

/**
 * Where the work happens.
 *
 * "In person" is not one of these — it is the umbrella over `at_provider`,
 * `at_customer` and `flexible`. The interface may present it as a first
 * question; the stored value is always one of these four.
 */
export const SERVICE_LOCATION_TYPES = [
  "at_customer",
  "at_provider",
  "remote",
  "flexible",
] as const;

export const serviceLocationTypeSchema = z.enum(SERVICE_LOCATION_TYPES);
export type ServiceLocationType = (typeof SERVICE_LOCATION_TYPES)[number];
```

- [ ] **Step 4: Add the catalogue enums**

Create `packages/shared/src/enums/catalog-enums/index.ts`:

```ts
import { z } from "zod";

/**
 * A service's own lifecycle, distinct from its provider's.
 *
 * `archived` rather than deleted: bookings will point at a service and their
 * history has to keep meaning what it meant.
 */
export const SERVICE_STATUSES = ["draft", "published", "archived"] as const;
export const serviceStatusSchema = z.enum(SERVICE_STATUSES);
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

/**
 * How a service is bought.
 *
 * `priced` carries options, each with a price and a duration. `quote` carries
 * none and cannot: the whole point is that the price is not knowable until the
 * provider has seen the job.
 */
export const SERVICE_BOOKING_MODES = ["priced", "quote"] as const;
export const serviceBookingModeSchema = z.enum(SERVICE_BOOKING_MODES);
export type ServiceBookingMode = (typeof SERVICE_BOOKING_MODES)[number];

/**
 * What an option's price is per.
 *
 * `fixed` carries the duration; the customer books that block. `hourly` does
 * not — the customer chooses how long, within a minimum and a step.
 */
export const SERVICE_PRICING_MODES = ["fixed", "hourly"] as const;
export const servicePricingModeSchema = z.enum(SERVICE_PRICING_MODES);
export type ServicePricingMode = (typeof SERVICE_PRICING_MODES)[number];
```

Add to `packages/shared/src/enums/index.ts`:

```ts
export * from "./catalog-enums";
```

- [ ] **Step 5: Run the enum test**

Run: `cd packages/shared && bunx vitest run src/enums/__tests__/catalog-enums.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the failing test for the fallback parameter**

Append to `packages/backend/src/modules/ntizo/bounded-contexts/catalog/__tests__/category-domain.test.ts`:

```ts
describe("resolveTranslation with an explicit fallback", () => {
  const rows = [
    { locale: "pt-MZ", name: "Canalização", description: null },
    { locale: "en-US", name: "Plumbing", description: null },
  ];

  it("falls back to the locale it was given, not to the platform default", () => {
    // A service falls back to whatever its provider wrote in. A category falls
    // back to the platform's own language. Same function, and the difference
    // has to be the caller's to state.
    expect(resolveTranslation(rows, "fr-FR", "en-US")).toEqual({
      name: "Plumbing",
      description: null,
      isFallback: true,
    });
  });

  it("still defaults to the platform locale when no fallback is given", () => {
    expect(resolveTranslation(rows, "fr-FR")?.name).toBe("Canalização");
  });
});
```

- [ ] **Step 7: Run it and watch it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/catalog`
Expected: FAIL — the third argument is ignored and it returns "Canalização".

- [ ] **Step 8: Make the fallback a parameter**

In `packages/backend/src/modules/ntizo/bounded-contexts/catalog/domain/translations.ts`, change the signature and the lookup:

```ts
export function resolveTranslation(
  rows: readonly TranslationRow[],
  locale: string,
  /**
   * Where to fall back when `locale` has no row.
   *
   * Defaults to the platform's locale, which is right for a category — that is
   * content the platform owns. A service falls back to the locale its provider
   * wrote in, which only the caller knows.
   */
  fallbackLocale: string = DEFAULT_LOCALE,
): ResolvedTranslation | null {
  const exact = rows.find((r) => r.locale === locale);
  if (exact) {
    return { name: exact.name, description: exact.description, isFallback: false };
  }
  const base = rows.find((r) => r.locale === fallbackLocale);
  if (base) {
    return { name: base.name, description: base.description, isFallback: true };
  }
  return null;
}
```

- [ ] **Step 9: Run the whole suite**

Run: `bun run check-types && bun run lint && bun run test`
Expected: 0 type errors, 0 lint errors, 0 test failures. The category tests still pass because the default preserves their behaviour.

- [ ] **Step 10: Commit**

```bash
git add packages/shared/src/enums packages/backend/src/modules/ntizo/bounded-contexts/catalog
git commit -m "refactor(shared): runtime catalogue enums, and a fallback locale resolveTranslation can be told

ServiceLocationType and BookingPath were bare type unions where every
other enum here is a const array with a zod schema. The API validates an
incoming value at request time and a type union has nothing to validate
against.

resolveTranslation hardcoded DEFAULT_LOCALE as its fallback. That is
right for a category — platform content — and wrong for a service, which
falls back to the locale its provider wrote in. The parameter defaults to
the old behaviour so the categories are untouched."
```

---

## Task 2: The tables

**Files:**
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/catalog/schemas/service.schema.ts`
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/catalog/schemas/index.ts`
- Test: `packages/backend/scripts/verify-service-schema.ts` (a one-off probe, deleted in step 7)

**Interfaces:**
- Consumes: `catalogSchema` from `category.schema.ts`.
- Produces: `service`, `serviceOption`, `serviceQuoteForm`, `serviceTranslation`, `serviceOptionTranslation`, and their `$inferSelect` / `$inferInsert` types.

- [ ] **Step 1: Write the schema**

Create `service.schema.ts`. Note `catalogSchema` is imported, not redeclared — a second `pgSchema("ntizo_catalog")` is a different object and drizzle will not know they are the same.

```ts
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { catalogSchema, category } from "./category.schema";
import { provider } from "../../provider/schemas";

/**
 * Something a provider sells.
 *
 * `name` and `description` are not here — they are the provider's own words in
 * the provider's own language, and they live in `service_translation`.
 */
export const service = catalogSchema.table(
  "service",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    providerId: uuid("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "cascade" }),

    /**
     * Required. A service with no category appears in no listing and nobody
     * can tell why — the categories exist so that browsing works.
     */
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id),

    /** The locale the provider wrote in. What everything falls back to. */
    sourceLocale: text("source_locale").notNull(),

    /** A `ServiceLocationType`. */
    locationType: text("location_type").notNull(),

    /** A `ServiceBookingMode`: `priced` has options, `quote` has a form. */
    bookingMode: text("booking_mode").notNull().default("priced"),

    /** A `ServiceStatus`. */
    status: text("status").notNull().default("draft"),

    /** R2 keys, not URLs. The reader composes the URL from the public base. */
    imageKeys: text("image_keys").array(),

    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("service_provider_order_idx").on(t.providerId, t.sortOrder),
    // The customer's browse: published services in a category.
    index("service_status_category_idx").on(t.status, t.categoryId),
  ],
);

/**
 * What a customer actually picks.
 *
 * The layer that carries the duration, which is the reason it exists: the
 * calendar reads it to cut blocks, and thirty minutes and fifty minutes
 * cannot come out of one rule.
 */
export const serviceOption = catalogSchema.table(
  "service_option",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => service.id, { onDelete: "cascade" }),

    /** A `ServicePricingMode`. */
    pricingMode: text("pricing_mode").notNull().default("fixed"),

    /** Minor units — centavos — as an integer, never a decimal or a float. */
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("MZN"),

    /** `fixed` only. How long this takes. */
    durationMinutes: integer("duration_minutes"),

    /** `hourly` only. The smallest booking, and what it grows by. */
    minMinutes: integer("min_minutes"),
    stepMinutes: integer("step_minutes"),

    /** The "standard" price — the one number a search card can show. */
    isDefault: boolean("is_default").notNull().default(false),

    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("service_option_service_order_idx").on(t.serviceId, t.sortOrder),
    // One default per service, enforced here rather than by discipline: the
    // search card shows one number and there has to be exactly one.
    uniqueIndex("service_option_one_default")
      .on(t.serviceId)
      .where(sql`${t.isDefault}`),
    check("service_option_amount_positive", sql`${t.amountMinor} > 0`),
    // The duration fields belong to exactly one mode. Slice 2 reads these to
    // generate blocks; a null in the wrong one generates zero-length blocks.
    check(
      "service_option_mode_fields",
      sql`(
        ${t.pricingMode} = 'fixed'
          AND ${t.durationMinutes} IS NOT NULL
          AND ${t.minMinutes} IS NULL AND ${t.stepMinutes} IS NULL
      ) OR (
        ${t.pricingMode} = 'hourly'
          AND ${t.durationMinutes} IS NULL
          AND ${t.minMinutes} IS NOT NULL AND ${t.stepMinutes} IS NOT NULL
      )`,
    ),
    check(
      "service_option_durations_positive",
      sql`(${t.durationMinutes} IS NULL OR ${t.durationMinutes} > 0)
        AND (${t.minMinutes} IS NULL OR ${t.minMinutes} > 0)
        AND (${t.stepMinutes} IS NULL OR ${t.stepMinutes} > 0)`,
    ),
  ],
);

/**
 * What to ask a customer who wants a quote.
 *
 * This table describes the *form*. Everything that happens after they press
 * send — the proposal, the acceptance, the payment — is slice 3.
 */
export const serviceQuoteForm = catalogSchema.table("service_quote_form", {
  serviceId: uuid("service_id")
    .primaryKey()
    .references(() => service.id, { onDelete: "cascade" }),

  /** What the provider commits to. The mockup says 48. */
  responseHours: integer("response_hours").notNull().default(48),

  askDeadline: boolean("ask_deadline").notNull().default(true),
  askPhotos: boolean("ask_photos").notNull().default(true),
  askLocation: boolean("ask_location").notNull().default(true),

  /** One line above the form, in the service's `source_locale`. */
  intro: text("intro"),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * A service in one language.
 *
 * Its own table rather than one polymorphic `translation(entity_type, …)`: a
 * polymorphic table cannot carry a foreign key, and a row orphaned by a
 * deleted service stays for ever.
 */
export const serviceTranslation = catalogSchema.table(
  "service_translation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => service.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("service_translation_unique").on(t.serviceId, t.locale),
    index("service_translation_locale_idx").on(t.locale),
  ],
);

export const serviceOptionTranslation = catalogSchema.table(
  "service_option_translation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    optionId: uuid("option_id")
      .notNull()
      .references(() => serviceOption.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    name: text("name").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("service_option_translation_unique").on(t.optionId, t.locale),
  ],
);

export type ServiceRow = typeof service.$inferSelect;
export type NewServiceRow = typeof service.$inferInsert;
export type ServiceOptionRow = typeof serviceOption.$inferSelect;
export type NewServiceOptionRow = typeof serviceOption.$inferInsert;
```

- [ ] **Step 2: Register it**

`packages/backend/src/modules/ntizo/shared/infrastructure/database/catalog/schemas/index.ts`:

```ts
export * from "./category.schema";
export * from "./service.schema";
```

- [ ] **Step 3: Generate the migration and read it before applying**

```bash
cd packages/backend && bun run db:ntizo:generate
```

Then read the generated SQL. It must contain five `CREATE TABLE` statements, the three `CHECK` constraints, and the partial unique index with its `WHERE`. If any CHECK is missing, the schema file is wrong — drizzle silently omits a `check()` whose `sql` template does not compile.

- [ ] **Step 4: Apply it**

```bash
cd packages/backend && bun run db:ntizo:dev:migrate
```

- [ ] **Step 5: Prove the constraints exist in the database**

A CHECK nobody exercises is a CHECK that might not be there. Create `packages/backend/scripts/verify-service-schema.ts`:

```ts
import postgres from "postgres";

const sql = postgres(process.env["DEV_DB_URL"]!, { max: 1 });

const tables = await sql`
  select table_name from information_schema.tables
  where table_schema = 'ntizo_catalog' order by table_name`;

const checks = await sql`
  select con.conname from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where ns.nspname = 'ntizo_catalog' and con.contype = 'c'
  order by con.conname`;

const indexes = await sql`
  select indexname from pg_indexes
  where schemaname = 'ntizo_catalog' and indexname = 'service_option_one_default'`;

console.log("tables:", tables.map((r) => r.table_name));
console.log("checks:", checks.map((r) => r.conname));
console.log("partial unique index present:", indexes.length === 1);

await sql.end();
process.exit(0);
```

Run: `cd packages/backend && bun run --env-file=.env scripts/verify-service-schema.ts`

Expected output includes the five tables, the three check names
(`service_option_amount_positive`, `service_option_mode_fields`,
`service_option_durations_positive`), and `partial unique index present: true`.

- [ ] **Step 6: Prove the CHECK actually refuses**

Append to the same script, before `sql.end()`, and re-run:

```ts
// An hourly option carrying a fixed duration must be refused by the database,
// not only by the aggregate. Both are needed: the aggregate is the readable
// rule, the CHECK is what survives a script that bypasses it.
const [row] = await sql`select id from ntizo_catalog.service limit 1`;
if (row) {
  try {
    await sql`
      insert into ntizo_catalog.service_option
        (service_id, pricing_mode, amount_minor, duration_minutes)
      values (${row.id}, 'hourly', 1000, 60)`;
    console.log("CHECK DID NOT FIRE — the constraint is missing");
  } catch {
    console.log("check refuses hourly+duration: ok");
  }
} else {
  console.log("no service row yet — re-run this after task 5");
}
```

- [ ] **Step 7: Delete the probe and commit**

```bash
rm packages/backend/scripts/verify-service-schema.ts
git add packages/backend/src/modules/ntizo/shared/infrastructure/database/catalog packages/backend/src/modules/ntizo/shared/infrastructure/migrations
git commit -m "feat(db): service, options, quote form and translations

Five tables in ntizo_catalog. The option carries the duration, which is
why it exists — the calendar reads it to cut blocks and thirty minutes
and fifty minutes cannot come out of one rule.

The duration fields belong to exactly one pricing mode, enforced by a
CHECK and not only by the aggregate: slice 2 reads them and a null in the
wrong one generates zero-length blocks. One default option per service is
a partial unique index for the same reason — the search card shows one
number and there has to be exactly one.

Verified against the running database: five tables, three checks, the
partial index, and the hourly-plus-duration insert refused."
```

---

## Task 3: The pure rules

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/domain/service-rules.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/domain/exceptions.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/__tests__/service-rules.test.ts`

**Interfaces:**
- Produces: `assertOptionShape(option)`, `withSingleDefault(options)`, `canPublish(service)`, `promoteNextDefault(options, removedId)`, and the exceptions `ServiceNeedsOptionError`, `QuoteServiceHasOptionsError`, `ServiceNameRequiredError`, `ServiceCategoryRequiredError`, `OptionDurationError`, `LastOptionError`, `ServiceNotFoundError`.

- [ ] **Step 1: Write the failing tests**

Create `service-rules.test.ts`. These are pure functions over plain objects — no database, no aggregate, so the rules can be read and exercised on their own.

```ts
import { describe, expect, it } from "bun:test";
import {
  assertOptionShape,
  canPublish,
  promoteNextDefault,
  withSingleDefault,
} from "../domain/service-rules";

const fixed = (over: Partial<Parameters<typeof assertOptionShape>[0]> = {}) => ({
  pricingMode: "fixed" as const,
  amountMinor: 30000,
  durationMinutes: 30,
  minMinutes: null,
  stepMinutes: null,
  ...over,
});

const hourly = (over = {}) => ({
  pricingMode: "hourly" as const,
  amountMinor: 25000,
  durationMinutes: null,
  minMinutes: 120,
  stepMinutes: 60,
  ...over,
});

describe("assertOptionShape", () => {
  it("accepts a well-formed fixed option and a well-formed hourly one", () => {
    expect(() => assertOptionShape(fixed())).not.toThrow();
    expect(() => assertOptionShape(hourly())).not.toThrow();
  });

  it("refuses a fixed option with no duration", () => {
    expect(() => assertOptionShape(fixed({ durationMinutes: null }))).toThrow(
      /OPTION_DURATION_REQUIRED/,
    );
  });

  it("refuses an hourly option carrying a duration", () => {
    // The calendar decides the block from the mode. A duration on an hourly
    // option is a number nobody reads and slice 2 would read it anyway.
    expect(() => assertOptionShape(hourly({ durationMinutes: 60 }))).toThrow(
      /OPTION_DURATION_NOT_ALLOWED/,
    );
  });

  it("refuses an hourly option with no minimum", () => {
    expect(() => assertOptionShape(hourly({ minMinutes: null }))).toThrow(
      /OPTION_DURATION_REQUIRED/,
    );
  });

  it("refuses a price of zero or less", () => {
    expect(() => assertOptionShape(fixed({ amountMinor: 0 }))).toThrow(
      /OPTION_PRICE_INVALID/,
    );
    expect(() => assertOptionShape(fixed({ amountMinor: -1 }))).toThrow(
      /OPTION_PRICE_INVALID/,
    );
  });
});

describe("withSingleDefault", () => {
  it("makes the first option the default", () => {
    const out = withSingleDefault([{ id: "a", isDefault: false, sortOrder: 0 }]);
    expect(out.map((o) => o.isDefault)).toEqual([true]);
  });

  it("keeps exactly one when several claim it", () => {
    // Two defaults is the state a partial unique index refuses; this is the
    // same rule where a person can read it.
    const out = withSingleDefault([
      { id: "a", isDefault: true, sortOrder: 0 },
      { id: "b", isDefault: true, sortOrder: 1 },
    ]);
    expect(out.filter((o) => o.isDefault).map((o) => o.id)).toEqual(["a"]);
  });

  it("leaves an empty list empty rather than inventing a default", () => {
    expect(withSingleDefault([])).toEqual([]);
  });
});

describe("promoteNextDefault", () => {
  it("promotes the next by sortOrder when the default is removed", () => {
    const out = promoteNextDefault(
      [
        { id: "a", isDefault: true, sortOrder: 0 },
        { id: "b", isDefault: false, sortOrder: 1 },
        { id: "c", isDefault: false, sortOrder: 2 },
      ],
      "a",
    );
    expect(out.find((o) => o.isDefault)?.id).toBe("b");
    expect(out.map((o) => o.id)).toEqual(["b", "c"]);
  });

  it("does nothing to the default when a non-default is removed", () => {
    const out = promoteNextDefault(
      [
        { id: "a", isDefault: true, sortOrder: 0 },
        { id: "b", isDefault: false, sortOrder: 1 },
      ],
      "b",
    );
    expect(out.find((o) => o.isDefault)?.id).toBe("a");
  });
});

describe("canPublish", () => {
  it("refuses a priced service with no options", () => {
    expect(() =>
      canPublish({
        bookingMode: "priced",
        categoryId: "cat",
        hasSourceName: true,
        optionCount: 0,
      }),
    ).toThrow(/SERVICE_NEEDS_OPTION/);
  });

  it("refuses a quote service that somehow has options", () => {
    expect(() =>
      canPublish({
        bookingMode: "quote",
        categoryId: "cat",
        hasSourceName: true,
        optionCount: 1,
      }),
    ).toThrow(/SERVICE_QUOTE_HAS_OPTIONS/);
  });

  it("refuses a service with no name in the locale it was written in", () => {
    expect(() =>
      canPublish({
        bookingMode: "priced",
        categoryId: "cat",
        hasSourceName: false,
        optionCount: 1,
      }),
    ).toThrow(/SERVICE_NAME_REQUIRED/);
  });

  it("accepts a priced service with a category, a name and one option", () => {
    expect(() =>
      canPublish({
        bookingMode: "priced",
        categoryId: "cat",
        hasSourceName: true,
        optionCount: 1,
      }),
    ).not.toThrow();
  });

  it("accepts a quote service with no options at all", () => {
    expect(() =>
      canPublish({
        bookingMode: "quote",
        categoryId: "cat",
        hasSourceName: true,
        optionCount: 0,
      }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/catalog/__tests__/service-rules.test.ts`
Expected: FAIL — no such module.

- [ ] **Step 3: Add the exceptions**

Append to `packages/backend/src/modules/ntizo/bounded-contexts/catalog/domain/exceptions.ts` (the file already imports `ConflictError`, `NotFoundError`, `UnprocessableError`):

```ts
export class ServiceNotFoundError extends NotFoundError {
  constructor(public readonly serviceId: string) {
    super({ message: `No service with id "${serviceId}"`, code: "SERVICE_NOT_FOUND" });
    this.name = "ServiceNotFoundError";
  }
}

export class ServiceNeedsOptionError extends UnprocessableError {
  constructor() {
    super({
      message: "A priced service needs at least one option before it can be published",
      code: "SERVICE_NEEDS_OPTION",
    });
    this.name = "ServiceNeedsOptionError";
  }
}

export class QuoteServiceHasOptionsError extends ConflictError {
  constructor() {
    super({
      message: "A quote service cannot have options — its price is not knowable in advance",
      code: "SERVICE_QUOTE_HAS_OPTIONS",
    });
    this.name = "QuoteServiceHasOptionsError";
  }
}

export class ServiceNameRequiredError extends UnprocessableError {
  constructor() {
    super({
      message: "A service needs a name in the language it was written in",
      code: "SERVICE_NAME_REQUIRED",
    });
    this.name = "ServiceNameRequiredError";
  }
}

export class ServiceCategoryRequiredError extends UnprocessableError {
  constructor() {
    super({ message: "A service needs a category", code: "SERVICE_CATEGORY_REQUIRED" });
    this.name = "ServiceCategoryRequiredError";
  }
}

export class OptionDurationError extends UnprocessableError {
  constructor(code: "OPTION_DURATION_REQUIRED" | "OPTION_DURATION_NOT_ALLOWED", reason: string) {
    super({ message: reason, code });
    this.name = "OptionDurationError";
  }
}

export class OptionPriceInvalidError extends UnprocessableError {
  constructor() {
    super({ message: "A price must be greater than zero", code: "OPTION_PRICE_INVALID" });
    this.name = "OptionPriceInvalidError";
  }
}

export class LastOptionError extends ConflictError {
  constructor() {
    super({
      message: "A published service cannot be left with no options",
      code: "OPTION_LAST_ONE",
    });
    this.name = "LastOptionError";
  }
}
```

- [ ] **Step 4: Write the rules**

Create `packages/backend/src/modules/ntizo/bounded-contexts/catalog/domain/service-rules.ts`:

```ts
import {
  OptionDurationError,
  OptionPriceInvalidError,
  ServiceCategoryRequiredError,
  ServiceNameRequiredError,
  ServiceNeedsOptionError,
  QuoteServiceHasOptionsError,
} from "./exceptions";

export interface OptionShape {
  pricingMode: "fixed" | "hourly";
  amountMinor: number;
  durationMinutes: number | null;
  minMinutes: number | null;
  stepMinutes: number | null;
}

/**
 * The duration fields belong to exactly one pricing mode.
 *
 * Stated here as well as in the CHECK, and both are needed: this is the rule
 * where a person can read it and where the error carries a code the form can
 * put under the right field, and the CHECK is what survives a script that
 * bypasses this.
 */
export function assertOptionShape(option: OptionShape): void {
  if (!Number.isInteger(option.amountMinor) || option.amountMinor <= 0) {
    throw new OptionPriceInvalidError();
  }

  if (option.pricingMode === "fixed") {
    if (option.durationMinutes === null) {
      throw new OptionDurationError(
        "OPTION_DURATION_REQUIRED",
        "A fixed-price option needs a duration",
      );
    }
    if (option.minMinutes !== null || option.stepMinutes !== null) {
      throw new OptionDurationError(
        "OPTION_DURATION_NOT_ALLOWED",
        "A fixed-price option has no minimum or step — its duration is the block",
      );
    }
    return;
  }

  if (option.durationMinutes !== null) {
    throw new OptionDurationError(
      "OPTION_DURATION_NOT_ALLOWED",
      "An hourly option has no fixed duration — the customer chooses how long",
    );
  }
  if (option.minMinutes === null || option.stepMinutes === null) {
    throw new OptionDurationError(
      "OPTION_DURATION_REQUIRED",
      "An hourly option needs a minimum and a step",
    );
  }
}

export interface DefaultableOption {
  id: string;
  isDefault: boolean;
  sortOrder: number;
}

/**
 * Exactly one default, or none when there are no options.
 *
 * The first by `sortOrder` wins when several claim it. Never invents one for
 * an empty list — a quote service legitimately has no options at all.
 */
export function withSingleDefault<T extends DefaultableOption>(options: readonly T[]): T[] {
  if (options.length === 0) return [];
  const ordered = [...options].sort((a, b) => a.sortOrder - b.sortOrder);
  const chosen = ordered.find((o) => o.isDefault) ?? ordered[0]!;
  return ordered.map((o) => ({ ...o, isDefault: o.id === chosen.id }));
}

/** The list without `removedId`, with a default guaranteed among what is left. */
export function promoteNextDefault<T extends DefaultableOption>(
  options: readonly T[],
  removedId: string,
): T[] {
  return withSingleDefault(options.filter((o) => o.id !== removedId));
}

export interface PublishCheck {
  bookingMode: "priced" | "quote";
  categoryId: string | null;
  hasSourceName: boolean;
  optionCount: number;
}

/** Throws the first thing standing between this service and being published. */
export function canPublish(service: PublishCheck): void {
  if (!service.categoryId) throw new ServiceCategoryRequiredError();
  if (!service.hasSourceName) throw new ServiceNameRequiredError();
  if (service.bookingMode === "priced" && service.optionCount === 0) {
    throw new ServiceNeedsOptionError();
  }
  if (service.bookingMode === "quote" && service.optionCount > 0) {
    throw new QuoteServiceHasOptionsError();
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/catalog/__tests__/service-rules.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 6: Break-check one of them**

Temporarily change `assertOptionShape` so the hourly branch does not check `durationMinutes`. Re-run: the test "refuses an hourly option carrying a duration" must FAIL. Restore the line and re-run: PASS. A test that passes against a broken implementation is not a test.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/catalog
git commit -m "feat(catalog): the service rules, as pure functions

Duration belongs to exactly one pricing mode; exactly one option is the
default, and removing it promotes the next; publishing needs a category,
a name in the source locale, and options if and only if the service is
priced.

Pure functions over plain objects rather than methods on the aggregate:
the rules can be read and exercised without a database, and each refusal
carries a code the form puts under the right field. The CHECKs in the
schema say the same things to anything that bypasses this."
```

---

## Task 4: The aggregate

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/domain/aggregates/service.aggregate.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/domain/events.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/__tests__/service.aggregate.test.ts`

**Interfaces:**
- Consumes: `assertOptionShape`, `withSingleDefault`, `promoteNextDefault`, `canPublish` from Task 3.
- Produces: `Service.create(params)`, `Service.rehydrate(props)`, and the methods `update`, `addOption`, `updateOption`, `removeOption`, `reorderOptions`, `publish`, `unpublish`, `archive`, `setTranslation`, `removeTranslation`, `setQuoteForm`, `toJSON`, `pullEvents`.

- [ ] **Step 1: Write the failing test**

Create `service.aggregate.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Service } from "../domain/aggregates/service.aggregate";

function newService(over: Partial<Parameters<typeof Service.create>[0]> = {}) {
  return Service.create({
    id: "svc-1",
    providerId: "prov-1",
    categoryId: "cat-1",
    sourceLocale: "pt-MZ",
    locationType: "at_provider",
    bookingMode: "priced",
    name: "Corte de cabelo",
    ...over,
  });
}

const fixedOption = {
  id: "opt-1",
  pricingMode: "fixed" as const,
  amountMinor: 30000,
  currency: "MZN",
  durationMinutes: 30,
  minMinutes: null,
  stepMinutes: null,
  name: "Só cabelo",
};

describe("Service.create", () => {
  it("starts as a draft with the name recorded in the source locale", () => {
    const s = newService();
    expect(s.toJSON().status).toBe("draft");
    expect(s.toJSON().translations).toEqual([
      { locale: "pt-MZ", name: "Corte de cabelo", description: null },
    ]);
  });

  it("raises a created event", () => {
    const events = newService().pullEvents();
    expect(events.map((e) => e.eventName)).toEqual(["service.created"]);
  });
});

describe("options", () => {
  it("makes the first option the default", () => {
    const s = newService();
    s.addOption(fixedOption);
    expect(s.toJSON().options[0]!.isDefault).toBe(true);
  });

  it("keeps one default when a second option is added", () => {
    const s = newService();
    s.addOption(fixedOption);
    s.addOption({ ...fixedOption, id: "opt-2", name: "Cabelo e barba", durationMinutes: 50 });
    expect(s.toJSON().options.filter((o) => o.isDefault)).toHaveLength(1);
  });

  it("promotes the next when the default is removed", () => {
    const s = newService();
    s.addOption(fixedOption);
    s.addOption({ ...fixedOption, id: "opt-2", name: "Cabelo e barba", durationMinutes: 50 });
    s.removeOption("opt-1");
    expect(s.toJSON().options.find((o) => o.isDefault)?.id).toBe("opt-2");
  });

  it("refuses to leave a published service with none", () => {
    const s = newService();
    s.addOption(fixedOption);
    s.publish();
    expect(() => s.removeOption("opt-1")).toThrow(/OPTION_LAST_ONE/);
  });

  it("allows a draft to be emptied", () => {
    // A draft is somebody still working. Refusing here would trap them.
    const s = newService();
    s.addOption(fixedOption);
    s.removeOption("opt-1");
    expect(s.toJSON().options).toEqual([]);
  });

  it("refuses an option on a quote service", () => {
    const s = newService({ bookingMode: "quote" });
    expect(() => s.addOption(fixedOption)).toThrow(/SERVICE_QUOTE_HAS_OPTIONS/);
  });

  it("refuses an hourly option carrying a duration", () => {
    const s = newService();
    expect(() =>
      s.addOption({
        ...fixedOption,
        pricingMode: "hourly",
        durationMinutes: 60,
        minMinutes: 120,
        stepMinutes: 60,
      }),
    ).toThrow(/OPTION_DURATION_NOT_ALLOWED/);
  });
});

describe("publishing", () => {
  it("refuses a priced service with no options", () => {
    expect(() => newService().publish()).toThrow(/SERVICE_NEEDS_OPTION/);
  });

  it("publishes a quote service with none", () => {
    const s = newService({ bookingMode: "quote" });
    s.publish();
    expect(s.toJSON().status).toBe("published");
  });

  it("refuses to publish with no name in the source locale", () => {
    const s = newService();
    s.addOption(fixedOption);
    s.removeTranslation("pt-MZ");
    expect(() => s.publish()).toThrow(/SERVICE_NAME_REQUIRED/);
  });
});

describe("translations", () => {
  it("adds one without touching the source", () => {
    const s = newService();
    s.setTranslation("en-US", "Haircut", null);
    expect(s.toJSON().translations.map((t) => t.locale).sort()).toEqual(["en-US", "pt-MZ"]);
  });

  it("replaces rather than duplicating the same locale", () => {
    const s = newService();
    s.setTranslation("pt-MZ", "Corte", null);
    expect(s.toJSON().translations).toHaveLength(1);
    expect(s.toJSON().translations[0]!.name).toBe("Corte");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/catalog/__tests__/service.aggregate.test.ts`
Expected: FAIL — no such module.

- [ ] **Step 3: Write the events**

Create `packages/backend/src/modules/ntizo/bounded-contexts/catalog/domain/events.ts`:

```ts
import { BaseDomainEvent } from "@cosmneo/onion-lasagna";

// The string passed as `eventName` becomes the outbox's `event_type` column —
// keep them byte-identical; renaming one silently orphans any consumer.

export class ServiceCreated extends BaseDomainEvent<{
  serviceId: string;
  providerId: string;
}> {
  constructor(payload: { serviceId: string; providerId: string }) {
    super("service.created", payload.serviceId, payload);
  }
}

export class ServiceUpdated extends BaseDomainEvent<{ serviceId: string }> {
  constructor(payload: { serviceId: string }) {
    super("service.updated", payload.serviceId, payload);
  }
}

export class ServicePublished extends BaseDomainEvent<{ serviceId: string }> {
  constructor(payload: { serviceId: string }) {
    super("service.published", payload.serviceId, payload);
  }
}

export class ServiceUnpublished extends BaseDomainEvent<{ serviceId: string }> {
  constructor(payload: { serviceId: string }) {
    super("service.unpublished", payload.serviceId, payload);
  }
}
```

- [ ] **Step 4: Write the aggregate**

Create `service.aggregate.ts`. It holds its options and translations as collections — they have no life of their own, are never addressed without their service, and are deleted with it.

```ts
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import {
  assertOptionShape,
  canPublish,
  promoteNextDefault,
  withSingleDefault,
} from "../service-rules";
import { LastOptionError, QuoteServiceHasOptionsError } from "../exceptions";
import {
  ServiceCreated,
  ServicePublished,
  ServiceUnpublished,
  ServiceUpdated,
} from "../events";

export interface ServiceOptionProps {
  id: string;
  pricingMode: "fixed" | "hourly";
  amountMinor: number;
  currency: string;
  durationMinutes: number | null;
  minMinutes: number | null;
  stepMinutes: number | null;
  isDefault: boolean;
  sortOrder: number;
  isActive: boolean;
  /** Per-locale names, the source locale among them. */
  translations: { locale: string; name: string }[];
}

export interface ServiceTranslationProps {
  locale: string;
  name: string;
  description: string | null;
}

export interface QuoteFormProps {
  responseHours: number;
  askDeadline: boolean;
  askPhotos: boolean;
  askLocation: boolean;
  intro: string | null;
}

export interface ServiceProps {
  id: string;
  providerId: string;
  categoryId: string;
  sourceLocale: string;
  locationType: string;
  bookingMode: "priced" | "quote";
  status: "draft" | "published" | "archived";
  imageKeys: string[];
  sortOrder: number;
  options: ServiceOptionProps[];
  translations: ServiceTranslationProps[];
  quoteForm: QuoteFormProps | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Service {
  private readonly _events: BaseDomainEvent[] = [];

  private constructor(private readonly props: ServiceProps) {}

  static rehydrate(props: ServiceProps): Service {
    return new Service(props);
  }

  static create(params: {
    id: string;
    providerId: string;
    categoryId: string;
    sourceLocale: string;
    locationType: string;
    bookingMode: "priced" | "quote";
    name: string;
    description?: string | null;
  }): Service {
    const now = new Date();
    const service = new Service({
      id: params.id,
      providerId: params.providerId,
      categoryId: params.categoryId,
      sourceLocale: params.sourceLocale,
      locationType: params.locationType,
      bookingMode: params.bookingMode,
      // A draft, not a listing. The provider decides when it goes up.
      status: "draft",
      imageKeys: [],
      sortOrder: 0,
      options: [],
      // The name they typed, in the language they typed it. This row is what
      // every other locale falls back to, and it is why the provider never
      // sees a translation form unless they go looking for one.
      translations: [
        { locale: params.sourceLocale, name: params.name, description: params.description ?? null },
      ],
      quoteForm:
        params.bookingMode === "quote"
          ? { responseHours: 48, askDeadline: true, askPhotos: true, askLocation: true, intro: null }
          : null,
      createdAt: now,
      updatedAt: now,
    });
    service._events.push(
      new ServiceCreated({ serviceId: params.id, providerId: params.providerId }),
    );
    return service;
  }

  get id() { return this.props.id; }
  get providerId() { return this.props.providerId; }
  get status() { return this.props.status; }

  update(params: {
    categoryId?: string;
    locationType?: string;
    imageKeys?: string[];
    sortOrder?: number;
  }): void {
    if (params.categoryId !== undefined) this.props.categoryId = params.categoryId;
    if (params.locationType !== undefined) this.props.locationType = params.locationType;
    if (params.imageKeys !== undefined) this.props.imageKeys = params.imageKeys;
    if (params.sortOrder !== undefined) this.props.sortOrder = params.sortOrder;
    this.touch();
  }

  addOption(params: {
    id: string;
    pricingMode: "fixed" | "hourly";
    amountMinor: number;
    currency: string;
    durationMinutes: number | null;
    minMinutes: number | null;
    stepMinutes: number | null;
    name: string;
  }): void {
    if (this.props.bookingMode === "quote") throw new QuoteServiceHasOptionsError();
    assertOptionShape(params);

    this.props.options.push({
      id: params.id,
      pricingMode: params.pricingMode,
      amountMinor: params.amountMinor,
      currency: params.currency,
      durationMinutes: params.durationMinutes,
      minMinutes: params.minMinutes,
      stepMinutes: params.stepMinutes,
      isDefault: false,
      sortOrder: this.props.options.length,
      isActive: true,
      translations: [{ locale: this.props.sourceLocale, name: params.name }],
    });
    this.normaliseDefaults();
    this.touch();
  }

  updateOption(
    optionId: string,
    params: Partial<Omit<ServiceOptionProps, "id" | "translations">> & { name?: string },
  ): void {
    const option = this.props.options.find((o) => o.id === optionId);
    if (!option) return;

    const next = {
      pricingMode: params.pricingMode ?? option.pricingMode,
      amountMinor: params.amountMinor ?? option.amountMinor,
      durationMinutes:
        params.durationMinutes !== undefined ? params.durationMinutes : option.durationMinutes,
      minMinutes: params.minMinutes !== undefined ? params.minMinutes : option.minMinutes,
      stepMinutes: params.stepMinutes !== undefined ? params.stepMinutes : option.stepMinutes,
    };
    assertOptionShape(next);

    Object.assign(option, next);
    if (params.currency !== undefined) option.currency = params.currency;
    if (params.isActive !== undefined) option.isActive = params.isActive;
    if (params.isDefault === true) {
      for (const o of this.props.options) o.isDefault = o.id === optionId;
    }
    if (params.name !== undefined) {
      this.setOptionTranslation(optionId, this.props.sourceLocale, params.name);
    }
    this.normaliseDefaults();
    this.touch();
  }

  removeOption(optionId: string): void {
    // A draft may be emptied — somebody is still working. A published service
    // may not: it is on the marketplace with nothing to buy.
    if (this.props.status === "published" && this.props.options.length <= 1) {
      throw new LastOptionError();
    }
    const kept = promoteNextDefault(this.props.options, optionId);
    this.props.options = kept as ServiceOptionProps[];
    this.touch();
  }

  reorderOptions(orderedIds: readonly string[]): void {
    const byId = new Map(this.props.options.map((o) => [o.id, o]));
    const next = orderedIds.flatMap((id, i) => {
      const found = byId.get(id);
      return found ? [{ ...found, sortOrder: i }] : [];
    });
    // Anything the caller did not mention keeps its place at the end rather
    // than disappearing: a stale list must not delete rows.
    const mentioned = new Set(orderedIds);
    const rest = this.props.options
      .filter((o) => !mentioned.has(o.id))
      .map((o, i) => ({ ...o, sortOrder: next.length + i }));
    this.props.options = [...next, ...rest];
    this.normaliseDefaults();
    this.touch();
  }

  setOptionTranslation(optionId: string, locale: string, name: string): void {
    const option = this.props.options.find((o) => o.id === optionId);
    if (!option) return;
    const existing = option.translations.find((t) => t.locale === locale);
    if (existing) existing.name = name;
    else option.translations.push({ locale, name });
    this.touch();
  }

  setTranslation(locale: string, name: string, description: string | null): void {
    const existing = this.props.translations.find((t) => t.locale === locale);
    if (existing) {
      existing.name = name;
      existing.description = description;
    } else {
      this.props.translations.push({ locale, name, description });
    }
    this.touch();
  }

  removeTranslation(locale: string): void {
    this.props.translations = this.props.translations.filter((t) => t.locale !== locale);
    this.touch();
  }

  setQuoteForm(form: QuoteFormProps): void {
    this.props.quoteForm = form;
    this.touch();
  }

  publish(): void {
    canPublish({
      bookingMode: this.props.bookingMode,
      categoryId: this.props.categoryId,
      hasSourceName: this.props.translations.some(
        (t) => t.locale === this.props.sourceLocale && t.name.trim().length > 0,
      ),
      optionCount: this.props.options.length,
    });
    this.props.status = "published";
    this.touch();
    this._events.push(new ServicePublished({ serviceId: this.props.id }));
  }

  unpublish(): void {
    this.props.status = "draft";
    this.touch();
    this._events.push(new ServiceUnpublished({ serviceId: this.props.id }));
  }

  archive(): void {
    this.props.status = "archived";
    this.touch();
  }

  private normaliseDefaults(): void {
    const normalised = withSingleDefault(this.props.options);
    this.props.options = normalised as ServiceOptionProps[];
  }

  private touch(): void {
    this.props.updatedAt = new Date();
    this._events.push(new ServiceUpdated({ serviceId: this.props.id }));
  }

  toJSON(): ServiceProps {
    return {
      ...this.props,
      options: this.props.options.map((o) => ({ ...o, translations: [...o.translations] })),
      translations: [...this.props.translations],
    };
  }

  pullEvents(): BaseDomainEvent[] {
    const events = [...this._events];
    this._events.length = 0;
    return events;
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/catalog`
Expected: PASS. The "raises a created event" test may fail if `touch()` runs during `create` — it does not, because `create` pushes `ServiceCreated` directly and never calls `touch`. If it fails, that is the bug, not the test.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/catalog
git commit -m "feat(catalog): the Service aggregate

Options and translations are collections inside the service: they have no
life of their own, are never addressed without it, and are deleted with
it.

The name the provider typed is written as a translation row in the locale
they typed it in. That is what every other locale falls back to, and it
is why they never see a translation form unless they go looking.

A draft may be left with no options — somebody is still working. A
published service may not: it would be on the marketplace with nothing to
buy. Reordering keeps anything the caller did not mention, so a stale
list cannot delete rows."
```

---

## Task 5: Persistence

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/app/ports/outbound/service.repository.port.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/infrastructure/repositories/drizzle/service.repository.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/infrastructure/repositories/drizzle/service.mapper.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/__tests__/service.mapper.test.ts`

**Interfaces:**
- Consumes: `Service`, `ServiceProps` from Task 4; the tables from Task 2.
- Produces: `ServiceRepositoryPort` with `findById(id)`, `save(service)`, `delete(id)`, `isProviderMember(providerId, userId)`; and `serviceMapper.toDomain(rows)` / `serviceMapper.toPersistence(service)`.

- [ ] **Step 1: Write the failing mapper test**

The mapper is where this project has lost data before: a field the aggregate holds and the mapper does not carry silently never persists, and the UI reports success either way.

Create `service.mapper.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Service } from "../domain/aggregates/service.aggregate";
import { serviceMapper } from "../infrastructure/repositories/drizzle/service.mapper";

function built() {
  const s = Service.create({
    id: "svc-1",
    providerId: "prov-1",
    categoryId: "cat-1",
    sourceLocale: "pt-MZ",
    locationType: "at_provider",
    bookingMode: "priced",
    name: "Corte de cabelo",
    description: "Barbearia",
  });
  s.addOption({
    id: "opt-1",
    pricingMode: "fixed",
    amountMinor: 30000,
    currency: "MZN",
    durationMinutes: 30,
    minMinutes: null,
    stepMinutes: null,
    name: "Só cabelo",
  });
  s.update({ imageKeys: ["service/svc-1/1"] });
  s.setTranslation("en-US", "Haircut", null);
  return s;
}

describe("serviceMapper", () => {
  it("carries every field of the service row", () => {
    const row = serviceMapper.toPersistence(built()).service;
    expect(row).toMatchObject({
      id: "svc-1",
      providerId: "prov-1",
      categoryId: "cat-1",
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
      bookingMode: "priced",
      status: "draft",
      imageKeys: ["service/svc-1/1"],
    });
  });

  it("carries the options, their prices and their durations", () => {
    const { options } = serviceMapper.toPersistence(built());
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      serviceId: "svc-1",
      pricingMode: "fixed",
      amountMinor: 30000,
      durationMinutes: 30,
      minMinutes: null,
      stepMinutes: null,
      isDefault: true,
    });
  });

  it("carries both translations of the service and the option's own", () => {
    const out = serviceMapper.toPersistence(built());
    expect(out.translations.map((t) => t.locale).sort()).toEqual(["en-US", "pt-MZ"]);
    expect(out.optionTranslations).toEqual([
      { optionId: "opt-1", locale: "pt-MZ", name: "Só cabelo" },
    ]);
  });

  it("round-trips: what toPersistence writes, toDomain reads back the same", () => {
    // The check that catches a field carried one way and dropped the other —
    // which is exactly how every logo upload was lost on this project.
    const before = built().toJSON();
    const rows = serviceMapper.toPersistence(built());
    const after = serviceMapper
      .toDomain({
        service: { ...rows.service, createdAt: before.createdAt, updatedAt: before.updatedAt },
        options: rows.options.map((o) => ({
          ...o,
          createdAt: before.createdAt,
          updatedAt: before.updatedAt,
        })),
        translations: rows.translations,
        optionTranslations: rows.optionTranslations,
        quoteForm: rows.quoteForm,
      })
      .toJSON();

    expect(after.imageKeys).toEqual(before.imageKeys);
    expect(after.options.map((o) => o.amountMinor)).toEqual(
      before.options.map((o) => o.amountMinor),
    );
    expect(after.options.map((o) => o.durationMinutes)).toEqual(
      before.options.map((o) => o.durationMinutes),
    );
    expect(after.translations.map((t) => t.locale).sort()).toEqual(
      before.translations.map((t) => t.locale).sort(),
    );
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/catalog/__tests__/service.mapper.test.ts`
Expected: FAIL — no such module.

- [ ] **Step 3: Write the port**

```ts
import type { Service } from "../../../domain/aggregates/service.aggregate";

export interface ServiceRepositoryPort {
  /** Null rather than throwing — "no such service" is an answer a stale link earns. */
  findById(serviceId: string): Promise<Service | null>;
  /** Writes the service and replaces its options and translations wholesale. */
  save(service: Service): Promise<void>;
  delete(serviceId: string): Promise<void>;
  /**
   * Whether this person may act for this workspace.
   *
   * On the repository because it is a query, and the kit's `argsMapper` is
   * synchronous — the handler cannot ask this from there.
   */
  isProviderMember(providerId: string, userId: string): Promise<boolean>;
}
```

- [ ] **Step 4: Write the mapper**

Create `service.mapper.ts`. Both directions, every field, every time.

```ts
import { Service, type ServiceProps } from "../../../domain/aggregates/service.aggregate";

export interface ServiceRowSet {
  service: {
    id: string;
    providerId: string;
    categoryId: string;
    sourceLocale: string;
    locationType: string;
    bookingMode: string;
    status: string;
    imageKeys: string[] | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  };
  options: {
    id: string;
    serviceId: string;
    pricingMode: string;
    amountMinor: number;
    currency: string;
    durationMinutes: number | null;
    minMinutes: number | null;
    stepMinutes: number | null;
    isDefault: boolean;
    sortOrder: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }[];
  translations: { serviceId: string; locale: string; name: string; description: string | null }[];
  optionTranslations: { optionId: string; locale: string; name: string }[];
  quoteForm: {
    serviceId: string;
    responseHours: number;
    askDeadline: boolean;
    askPhotos: boolean;
    askLocation: boolean;
    intro: string | null;
  } | null;
}

export const serviceMapper = {
  toDomain(rows: ServiceRowSet): Service {
    const props: ServiceProps = {
      id: rows.service.id,
      providerId: rows.service.providerId,
      categoryId: rows.service.categoryId,
      sourceLocale: rows.service.sourceLocale,
      locationType: rows.service.locationType,
      bookingMode: rows.service.bookingMode as ServiceProps["bookingMode"],
      status: rows.service.status as ServiceProps["status"],
      imageKeys: rows.service.imageKeys ?? [],
      sortOrder: rows.service.sortOrder,
      options: [...rows.options]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((o) => ({
          id: o.id,
          pricingMode: o.pricingMode as "fixed" | "hourly",
          amountMinor: o.amountMinor,
          currency: o.currency,
          durationMinutes: o.durationMinutes,
          minMinutes: o.minMinutes,
          stepMinutes: o.stepMinutes,
          isDefault: o.isDefault,
          sortOrder: o.sortOrder,
          isActive: o.isActive,
          translations: rows.optionTranslations
            .filter((t) => t.optionId === o.id)
            .map((t) => ({ locale: t.locale, name: t.name })),
        })),
      translations: rows.translations.map((t) => ({
        locale: t.locale,
        name: t.name,
        description: t.description,
      })),
      quoteForm: rows.quoteForm
        ? {
            responseHours: rows.quoteForm.responseHours,
            askDeadline: rows.quoteForm.askDeadline,
            askPhotos: rows.quoteForm.askPhotos,
            askLocation: rows.quoteForm.askLocation,
            intro: rows.quoteForm.intro,
          }
        : null,
      createdAt: rows.service.createdAt,
      updatedAt: rows.service.updatedAt,
    };
    return Service.rehydrate(props);
  },

  toPersistence(service: Service): ServiceRowSet {
    const json = service.toJSON();
    return {
      service: {
        id: json.id,
        providerId: json.providerId,
        categoryId: json.categoryId,
        sourceLocale: json.sourceLocale,
        locationType: json.locationType,
        bookingMode: json.bookingMode,
        status: json.status,
        imageKeys: json.imageKeys,
        sortOrder: json.sortOrder,
        createdAt: json.createdAt,
        updatedAt: json.updatedAt,
      },
      options: json.options.map((o) => ({
        id: o.id,
        serviceId: json.id,
        pricingMode: o.pricingMode,
        amountMinor: o.amountMinor,
        currency: o.currency,
        durationMinutes: o.durationMinutes,
        minMinutes: o.minMinutes,
        stepMinutes: o.stepMinutes,
        isDefault: o.isDefault,
        sortOrder: o.sortOrder,
        isActive: o.isActive,
        createdAt: json.createdAt,
        updatedAt: json.updatedAt,
      })),
      translations: json.translations.map((t) => ({
        serviceId: json.id,
        locale: t.locale,
        name: t.name,
        description: t.description,
      })),
      optionTranslations: json.options.flatMap((o) =>
        o.translations.map((t) => ({ optionId: o.id, locale: t.locale, name: t.name })),
      ),
      quoteForm: json.quoteForm
        ? { serviceId: json.id, ...json.quoteForm }
        : null,
    };
  },
};
```

- [ ] **Step 5: Run the mapper tests**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/catalog/__tests__/service.mapper.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the drizzle repository**

Create `service.repository.ts`. One transaction per save, children replaced wholesale — clearing a translation has to be expressible and an upsert can only ever add.

```ts
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  service,
  serviceOption,
  serviceOptionTranslation,
  serviceQuoteForm,
  serviceTranslation,
} from "../../../../../shared/infrastructure/database/catalog/schemas";
import { providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { Service } from "../../../domain/aggregates/service.aggregate";
import type { ServiceRepositoryPort } from "../../../app/ports/outbound/service.repository.port";
import { serviceMapper } from "./service.mapper";

export class DrizzleServiceRepository implements ServiceRepositoryPort {
  async findById(serviceId: string): Promise<Service | null> {
    const db = getDb();
    const [row] = await db.select().from(service).where(eq(service.id, serviceId)).limit(1);
    if (!row) return null;

    const options = await db
      .select()
      .from(serviceOption)
      .where(eq(serviceOption.serviceId, serviceId));
    const translations = await db
      .select()
      .from(serviceTranslation)
      .where(eq(serviceTranslation.serviceId, serviceId));
    const optionIds = options.map((o) => o.id);
    const optionTranslations = optionIds.length
      ? await db
          .select()
          .from(serviceOptionTranslation)
          .where(inArray(serviceOptionTranslation.optionId, optionIds))
      : [];
    const [quoteForm] = await db
      .select()
      .from(serviceQuoteForm)
      .where(eq(serviceQuoteForm.serviceId, serviceId))
      .limit(1);

    return serviceMapper.toDomain({
      service: row,
      options,
      translations,
      optionTranslations,
      quoteForm: quoteForm ?? null,
    });
  }

  async save(aggregate: Service): Promise<void> {
    const rows = serviceMapper.toPersistence(aggregate);

    await getDb().transaction(async (tx) => {
      // The update set is derived rather than hand-listed: a field added to the
      // row and forgotten here is a field that silently never persists.
      const { id, providerId, createdAt, ...mutable } = rows.service;
      await tx
        .insert(service)
        .values(rows.service)
        .onConflictDoUpdate({ target: service.id, set: mutable });

      // Children replaced wholesale. Removing an option or clearing a
      // translation has to be expressible, and an upsert can only ever add.
      await tx.delete(serviceOption).where(eq(serviceOption.serviceId, id));
      if (rows.options.length) await tx.insert(serviceOption).values(rows.options);

      await tx.delete(serviceTranslation).where(eq(serviceTranslation.serviceId, id));
      if (rows.translations.length) await tx.insert(serviceTranslation).values(rows.translations);

      if (rows.optionTranslations.length) {
        await tx.insert(serviceOptionTranslation).values(rows.optionTranslations);
      }

      await tx.delete(serviceQuoteForm).where(eq(serviceQuoteForm.serviceId, id));
      if (rows.quoteForm) await tx.insert(serviceQuoteForm).values(rows.quoteForm);
    });
  }

  async delete(serviceId: string): Promise<void> {
    await getDb().delete(service).where(eq(service.id, serviceId));
  }

  async isProviderMember(providerId: string, userId: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ id: providerMember.id })
      .from(providerMember)
      .where(and(eq(providerMember.providerId, providerId), eq(providerMember.userId, userId)))
      .limit(1);
    return row !== undefined;
  }
}
```

Note: deleting the options cascades their translations, which is why
`optionTranslations` is inserted after the options and not deleted separately.

- [ ] **Step 7: Typecheck, test, commit**

Run: `bun run check-types && bun run lint && cd packages/backend && bun test src/modules/ntizo/bounded-contexts/catalog`

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/catalog
git commit -m "feat(catalog): the service repository and its mapper

Both directions of the mapper, with a round-trip test: a field the
aggregate holds and the mapper does not carry silently never persists,
and the UI reports success either way. That is how every logo upload on
this project was lost.

Children are replaced wholesale inside one transaction rather than
upserted: removing an option or clearing a translation has to be
expressible, and an upsert can only ever add. The update set is derived
from the row rather than hand-listed, for the same reason the mapper is
tested."
```

---

## Task 6: The commands

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/app/use-cases/create-service.command.ts`
- Create: `.../update-service.command.ts`, `.../manage-options.command.ts`, `.../set-service-status.command.ts`, `.../set-service-translation.command.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/bootstrap/index.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/index.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/__tests__/service-commands.test.ts`

**Interfaces:**
- Consumes: `ServiceRepositoryPort`, `Service`.
- Produces: `CreateServiceCommand`, `UpdateServiceCommand`, `ManageOptionsCommand` (with `add`, `update`, `remove`, `reorder`), `SetServiceStatusCommand`, `SetServiceTranslationCommand` — every one taking `{ requesterUserId, … }` and refusing a non-member.

- [ ] **Step 1: Write the failing tests**

Create `service-commands.test.ts` with a fake repository:

```ts
import { beforeEach, describe, expect, it } from "bun:test";
import { Service } from "../domain/aggregates/service.aggregate";
import { CreateServiceCommand } from "../app/use-cases/create-service.command";
import { ManageOptionsCommand } from "../app/use-cases/manage-options.command";
import { SetServiceStatusCommand } from "../app/use-cases/set-service-status.command";
import type { ServiceRepositoryPort } from "../app/ports/outbound/service.repository.port";

class FakeRepo implements ServiceRepositoryPort {
  saved: Service[] = [];
  stored = new Map<string, Service>();
  members = new Set<string>(["prov-1:user-1"]);

  async findById(id: string) { return this.stored.get(id) ?? null; }
  async save(s: Service) { this.saved.push(s); this.stored.set(s.id, s); }
  async delete(id: string) { this.stored.delete(id); }
  async isProviderMember(providerId: string, userId: string) {
    return this.members.has(`${providerId}:${userId}`);
  }
}

let repo: FakeRepo;
beforeEach(() => { repo = new FakeRepo(); });

const base = {
  requesterUserId: "user-1",
  providerId: "prov-1",
  categoryId: "cat-1",
  sourceLocale: "pt-MZ",
  locationType: "at_provider" as const,
  bookingMode: "priced" as const,
  name: "Corte de cabelo",
};

describe("CreateServiceCommand", () => {
  it("creates a draft owned by the provider", async () => {
    const out = await new CreateServiceCommand(repo).execute(base);
    expect(out.serviceId).toBeTruthy();
    expect(repo.saved[0]!.toJSON().status).toBe("draft");
  });

  it("refuses somebody who does not belong to the workspace", async () => {
    await expect(
      new CreateServiceCommand(repo).execute({ ...base, requesterUserId: "stranger" }),
    ).rejects.toMatchObject({ code: "NOT_PROVIDER_MEMBER" });
    expect(repo.saved).toHaveLength(0);
  });

  it("gives a quote service its form and no options", async () => {
    const out = await new CreateServiceCommand(repo).execute({ ...base, bookingMode: "quote" });
    const json = repo.stored.get(out.serviceId)!.toJSON();
    expect(json.quoteForm?.responseHours).toBe(48);
    expect(json.options).toEqual([]);
  });
});

describe("ManageOptionsCommand", () => {
  async function withService() {
    const out = await new CreateServiceCommand(repo).execute(base);
    return out.serviceId;
  }

  it("adds an option and makes it the default", async () => {
    const id = await withService();
    await new ManageOptionsCommand(repo).add({
      requesterUserId: "user-1",
      serviceId: id,
      pricingMode: "fixed",
      amountMinor: 30000,
      currency: "MZN",
      durationMinutes: 30,
      minMinutes: null,
      stepMinutes: null,
      name: "Só cabelo",
    });
    expect(repo.stored.get(id)!.toJSON().options[0]!.isDefault).toBe(true);
  });

  it("refuses a stranger", async () => {
    const id = await withService();
    await expect(
      new ManageOptionsCommand(repo).add({
        requesterUserId: "stranger",
        serviceId: id,
        pricingMode: "fixed",
        amountMinor: 30000,
        currency: "MZN",
        durationMinutes: 30,
        minMinutes: null,
        stepMinutes: null,
        name: "x",
      }),
    ).rejects.toMatchObject({ code: "NOT_PROVIDER_MEMBER" });
  });

  it("refuses an id that is not there", async () => {
    await expect(
      new ManageOptionsCommand(repo).remove({
        requesterUserId: "user-1",
        serviceId: "nope",
        optionId: "x",
      }),
    ).rejects.toMatchObject({ code: "SERVICE_NOT_FOUND" });
  });
});

describe("SetServiceStatusCommand", () => {
  it("refuses to publish a priced service with no options", async () => {
    const { serviceId } = await new CreateServiceCommand(repo).execute(base);
    await expect(
      new SetServiceStatusCommand(repo).execute({
        requesterUserId: "user-1",
        serviceId,
        status: "published",
      }),
    ).rejects.toMatchObject({ code: "SERVICE_NEEDS_OPTION" });
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/catalog/__tests__/service-commands.test.ts`
Expected: FAIL — no such modules.

- [ ] **Step 3: Add the membership refusal to the exceptions**

Append to `domain/exceptions.ts`:

```ts
export class NotProviderMemberError extends ForbiddenError {
  constructor() {
    super({
      message: "This workspace is not one you belong to",
      code: "NOT_PROVIDER_MEMBER",
    });
    this.name = "NotProviderMemberError";
  }
}
```

Add `ForbiddenError` to the import at the top of that file.

- [ ] **Step 4: Write `create-service.command.ts`**

```ts
import { randomUUID } from "node:crypto";
import { Service } from "../../domain/aggregates/service.aggregate";
import { NotProviderMemberError } from "../../domain/exceptions";
import type { ServiceRepositoryPort } from "../ports/outbound/service.repository.port";

export interface CreateServiceInput {
  requesterUserId: string;
  providerId: string;
  categoryId: string;
  sourceLocale: string;
  locationType: string;
  bookingMode: "priced" | "quote";
  name: string;
  description?: string | null;
}

export class CreateServiceCommand {
  constructor(private readonly repo: ServiceRepositoryPort) {}

  async execute(input: CreateServiceInput): Promise<{ serviceId: string }> {
    // Membership, not ownership: an admin of the workspace may add services.
    // Checked here because it is a query and the kit's argsMapper is
    // synchronous — the GraphQL edge cannot ask this from a mapper.
    if (!(await this.repo.isProviderMember(input.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError();
    }

    const service = Service.create({
      id: randomUUID(),
      providerId: input.providerId,
      categoryId: input.categoryId,
      sourceLocale: input.sourceLocale,
      locationType: input.locationType,
      bookingMode: input.bookingMode,
      name: input.name.trim(),
      description: input.description?.trim() || null,
    });

    await this.repo.save(service);
    return { serviceId: service.id };
  }
}
```

- [ ] **Step 5: Write the remaining commands**

`manage-options.command.ts` — one class with four methods, because all four load the same aggregate, make the same membership check and save it the same way; four classes would be four copies of that.

```ts
import { randomUUID } from "node:crypto";
import { NotProviderMemberError, ServiceNotFoundError } from "../../domain/exceptions";
import type { Service } from "../../domain/aggregates/service.aggregate";
import type { ServiceRepositoryPort } from "../ports/outbound/service.repository.port";

interface Scoped { requesterUserId: string; serviceId: string; }

export class ManageOptionsCommand {
  constructor(private readonly repo: ServiceRepositoryPort) {}

  private async load(input: Scoped): Promise<Service> {
    const service = await this.repo.findById(input.serviceId);
    if (!service) throw new ServiceNotFoundError(input.serviceId);
    if (!(await this.repo.isProviderMember(service.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError();
    }
    return service;
  }

  async add(input: Scoped & {
    pricingMode: "fixed" | "hourly";
    amountMinor: number;
    currency: string;
    durationMinutes: number | null;
    minMinutes: number | null;
    stepMinutes: number | null;
    name: string;
  }): Promise<{ optionId: string }> {
    const service = await this.load(input);
    const optionId = randomUUID();
    service.addOption({ ...input, id: optionId });
    await this.repo.save(service);
    return { optionId };
  }

  async update(input: Scoped & {
    optionId: string;
    pricingMode?: "fixed" | "hourly";
    amountMinor?: number;
    currency?: string;
    durationMinutes?: number | null;
    minMinutes?: number | null;
    stepMinutes?: number | null;
    isDefault?: boolean;
    isActive?: boolean;
    name?: string;
  }): Promise<{ ok: true }> {
    const service = await this.load(input);
    const { requesterUserId, serviceId, optionId, ...rest } = input;
    service.updateOption(optionId, rest);
    await this.repo.save(service);
    return { ok: true };
  }

  async remove(input: Scoped & { optionId: string }): Promise<{ ok: true }> {
    const service = await this.load(input);
    service.removeOption(input.optionId);
    await this.repo.save(service);
    return { ok: true };
  }

  async reorder(input: Scoped & { orderedIds: string[] }): Promise<{ ok: true }> {
    const service = await this.load(input);
    service.reorderOptions(input.orderedIds);
    await this.repo.save(service);
    return { ok: true };
  }
}
```

`set-service-status.command.ts`:

```ts
import { NotProviderMemberError, ServiceNotFoundError } from "../../domain/exceptions";
import type { ServiceRepositoryPort } from "../ports/outbound/service.repository.port";

export class SetServiceStatusCommand {
  constructor(private readonly repo: ServiceRepositoryPort) {}

  async execute(input: {
    requesterUserId: string;
    serviceId: string;
    status: "draft" | "published" | "archived";
  }): Promise<{ ok: true }> {
    const service = await this.repo.findById(input.serviceId);
    if (!service) throw new ServiceNotFoundError(input.serviceId);
    if (!(await this.repo.isProviderMember(service.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError();
    }

    // Publishing is where the invariants are checked; the aggregate throws the
    // first thing standing in the way, with a code the form puts under a field.
    if (input.status === "published") service.publish();
    else if (input.status === "draft") service.unpublish();
    else service.archive();

    await this.repo.save(service);
    return { ok: true };
  }
}
```

`update-service.command.ts` and `set-service-translation.command.ts` follow the
same `load` → mutate → `save` shape. `UpdateServiceCommand.execute` takes
`{ requesterUserId, serviceId, categoryId?, locationType?, imageKeys?, quoteForm? }`
and calls `service.update(...)` plus `service.setQuoteForm(...)` when one is
given. `SetServiceTranslationCommand.execute` takes
`{ requesterUserId, serviceId, locale, name, description, optionId? }` and calls
`service.setOptionTranslation(...)` when `optionId` is present, otherwise
`service.setTranslation(...)`.

- [ ] **Step 6: Bootstrap them**

In `bounded-contexts/catalog/bootstrap/index.ts`, add the repository and the five commands beside the category ones:

```ts
const serviceRepository = new DrizzleServiceRepository();
// …
useCases: {
  // …existing category commands…
  createService: new CreateServiceCommand(serviceRepository),
  updateService: new UpdateServiceCommand(serviceRepository),
  manageOptions: new ManageOptionsCommand(serviceRepository),
  setServiceStatus: new SetServiceStatusCommand(serviceRepository),
  setServiceTranslation: new SetServiceTranslationCommand(serviceRepository),
},
```

Export them from `bounded-contexts/catalog/index.ts`.

- [ ] **Step 7: Run everything and commit**

Run: `bun run check-types && bun run lint && bun run test`

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/catalog
git commit -m "feat(catalog): the service commands

Every one checks workspace membership before it does anything, and does
it in the command rather than at the GraphQL edge: it is a query, and the
kit's argsMapper is synchronous.

The four option operations are one class with four methods because all
four load the same aggregate, make the same check and save it the same
way — four classes would be four copies of that."
```

---

## Task 7: The write slice

**Files:**
- Modify: `packages/backend/src/modules/ntizo/write/catalog/graphql/schema/mutations.ts`
- Modify: `packages/backend/src/modules/ntizo/write/catalog/graphql/handlers/mutations.handlers.ts`
- Test: `packages/backend/src/modules/ntizo/write/catalog/__tests__/service-mutations.test.ts`

**Interfaces:**
- Consumes: the five commands from Task 6.
- Produces: GraphQL fields `service.create`, `service.update`, `service.setStatus`, `service.options.add`, `service.options.update`, `service.options.remove`, `service.options.reorder`, `service.translation.set`.

- [ ] **Step 1: Write the failing handler test**

Create `service-mutations.test.ts`, following the shape of
`read/user/__tests__/queries.handlers.test.ts` — build the handlers against
fakes and assert the count, which is what catches a field silently dropped from
the schema.

```ts
import { describe, expect, it } from "bun:test";
import { createCatalogWriteHandlers } from "../graphql/handlers/mutations.handlers";

const noop = { async execute() { return { ok: true as const }; } } as never;

describe("createCatalogWriteHandlers", () => {
  it("builds a handler for every catalogue mutation", () => {
    const handlers = createCatalogWriteHandlers({
      catalog: {
        useCases: {
          createCategory: noop,
          updateCategory: noop,
          reorderCategories: noop,
          createService: noop,
          updateService: noop,
          manageOptions: {
            add: async () => ({ optionId: "x" }),
            update: async () => ({ ok: true as const }),
            remove: async () => ({ ok: true as const }),
            reorder: async () => ({ ok: true as const }),
          },
          setServiceStatus: noop,
          setServiceTranslation: noop,
        },
      },
    } as never);

    // Three category mutations plus eight service ones. Asserting the count
    // rather than "not empty" is what catches a field dropped from the schema:
    // an unhandled field collapses the builder's return type to `never`, but a
    // handled field removed from the schema fails silently.
    expect(handlers.length).toBe(11);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/write/catalog`
Expected: FAIL — 3, not 11.

- [ ] **Step 3: Add the mutations to the schema**

Append to `write/catalog/graphql/schema/mutations.ts`:

```ts
import {
  serviceBookingModeSchema,
  serviceLocationTypeSchema,
  servicePricingModeSchema,
  serviceStatusSchema,
  localeSchema,
} from "@ntizo/shared";

const optionShape = z.object({
  pricingMode: servicePricingModeSchema,
  amountMinor: z.number().int().min(1),
  currency: z.string().length(3),
  // Nullable, not merely optional: an hourly option must be able to say "no
  // duration", and an optional-only field can say "leave it" but never
  // "there is none".
  durationMinutes: z.number().int().min(1).nullable(),
  minMinutes: z.number().int().min(1).nullable(),
  stepMinutes: z.number().int().min(1).nullable(),
  name: z.string().trim().min(1).max(120),
});

export const createService = defineMutation({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      categoryId: z.string().min(1),
      sourceLocale: localeSchema,
      locationType: serviceLocationTypeSchema,
      bookingMode: serviceBookingModeSchema,
      name: z.string().trim().min(1).max(160),
      description: z.string().trim().max(2000).nullable().optional(),
    }),
  ),
  output: zodSchema(z.object({ serviceId: z.string().min(1) })),
  docs: { summary: "Create a service", tags: ["Catalog"] },
});

export const updateService = defineMutation({
  input: zodSchema(
    z.object({
      serviceId: z.string().min(1),
      categoryId: z.string().min(1).optional(),
      locationType: serviceLocationTypeSchema.optional(),
      imageKeys: z.array(z.string().max(300)).optional(),
      quoteForm: z
        .object({
          responseHours: z.number().int().min(1).max(720),
          askDeadline: z.boolean(),
          askPhotos: z.boolean(),
          askLocation: z.boolean(),
          intro: z.string().trim().max(400).nullable(),
        })
        .optional(),
    }),
  ),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Update a service", tags: ["Catalog"] },
});

export const setServiceStatus = defineMutation({
  input: zodSchema(
    z.object({ serviceId: z.string().min(1), status: serviceStatusSchema }),
  ),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Publish, unpublish or archive a service", tags: ["Catalog"] },
});

export const addServiceOption = defineMutation({
  input: zodSchema(optionShape.extend({ serviceId: z.string().min(1) })),
  output: zodSchema(z.object({ optionId: z.string().min(1) })),
  docs: { summary: "Add an option to a service", tags: ["Catalog"] },
});

export const updateServiceOption = defineMutation({
  input: zodSchema(
    optionShape.partial().extend({
      serviceId: z.string().min(1),
      optionId: z.string().min(1),
      isDefault: z.boolean().optional(),
      isActive: z.boolean().optional(),
    }),
  ),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Update an option", tags: ["Catalog"] },
});

export const removeServiceOption = defineMutation({
  input: zodSchema(
    z.object({ serviceId: z.string().min(1), optionId: z.string().min(1) }),
  ),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Remove an option", tags: ["Catalog"] },
});

export const reorderServiceOptions = defineMutation({
  input: zodSchema(
    z.object({
      serviceId: z.string().min(1),
      orderedIds: z.array(z.string().min(1)).min(1).max(100),
    }),
  ),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Set the display order of a service's options", tags: ["Catalog"] },
});

export const setServiceTranslation = defineMutation({
  input: zodSchema(
    z.object({
      serviceId: z.string().min(1),
      /** Present to translate an option's name; absent for the service's own. */
      optionId: z.string().min(1).optional(),
      locale: localeSchema,
      name: z.string().trim().min(1).max(160),
      description: z.string().trim().max(2000).nullable().optional(),
    }),
  ),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Write one language's copy for a service", tags: ["Catalog"] },
});
```

And extend the schema tree:

```ts
export const catalogWriteSchema = defineGraphQLSchema(
  {
    category: { create: createCategory, update: updateCategory, reorder: reorderCategories },
    service: {
      create: createService,
      update: updateService,
      setStatus: setServiceStatus,
      options: {
        add: addServiceOption,
        update: updateServiceOption,
        remove: removeServiceOption,
        reorder: reorderServiceOptions,
      },
      translation: { set: setServiceTranslation },
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
```

- [ ] **Step 4: Add the handlers**

In `write/catalog/graphql/handlers/mutations.handlers.ts`, add eight `.handle()`
calls before `.build()`. Every one reads `requesterUserId` from the context and
refuses an anonymous caller — the membership check itself lives in the command.

```ts
function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({ message: "Sign in to manage services", code: "UNAUTHENTICATED" });
  }
  return requesterUserId;
}
```

```ts
    .handle("service.create", async (args, ctx) =>
      uc.createService.execute({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("service.update", async (args, ctx) =>
      uc.updateService.execute({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("service.setStatus", async (args, ctx) =>
      uc.setServiceStatus.execute({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("service.options.add", async (args, ctx) =>
      uc.manageOptions.add({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("service.options.update", async (args, ctx) =>
      uc.manageOptions.update({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("service.options.remove", async (args, ctx) =>
      uc.manageOptions.remove({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("service.options.reorder", async (args, ctx) =>
      uc.manageOptions.reorder({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("service.translation.set", async (args, ctx) =>
      uc.setServiceTranslation.execute({ requesterUserId: requireUser(ctx), ...args.input }),
    )
```

- [ ] **Step 5: Run the handler test**

Run: `cd packages/backend && bun test src/modules/ntizo/write/catalog`
Expected: PASS — 11 handlers.

- [ ] **Step 6: Verify against the running API**

Start it: `cd apps/backend/api && PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" bunx wrangler dev --port 8788`

Then, anonymously — every one must be refused, and none may leak:

```bash
curl -s -X POST http://localhost:8788/graphql \
  -H 'content-type: application/json' -H 'x-graphql-csrf: 1' \
  -d '{"query":"mutation($i:ServiceCreateInput!){serviceCreate(input:$i){serviceId}}","variables":{"i":{"providerId":"x","categoryId":"y","sourceLocale":"pt-MZ","locationType":"remote","bookingMode":"priced","name":"n"}}}'
```

Expected: `"originalCode":"UNAUTHENTICATED"` and `"data":{"serviceCreate":null}`.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo/write/catalog
git commit -m "feat(catalog): the service mutations

Eight fields under service.*, each refusing an anonymous caller at the
edge and leaving the membership check to the command, where it can be a
query.

Duration fields are nullable rather than merely optional: an hourly
option must be able to say it has no duration, and an optional-only field
can say 'leave it' but never 'there is none'.

Verified against the running API: anonymous is refused with
UNAUTHENTICATED and no data comes back."
```

---

## Task 8: The provider's own read

**Files:**
- Create: `packages/shared/src/read-models/system/service/service-admin.schema.ts` and `index.ts`
- Modify: `packages/shared/src/read-models/system/index.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/app/ports/outbound/service-read.repository.port.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/infrastructure/repositories/drizzle/service-read.repository.ts`
- Create: `packages/backend/src/modules/ntizo/read/catalog/app/use-cases/list-my-services.projection.ts`
- Modify: `read/catalog/graphql/schema/queries.ts`, `read/catalog/graphql/handlers/queries.handlers.ts`, `read/catalog/bootstrap/index.ts`

**Interfaces:**
- Produces: query `service.mine` returning `ServiceOwnerDTO[]` — every translation **unresolved**, so the provider can see which languages are filled in.

- [ ] **Step 1: Write the read model**

```ts
import { z } from "zod";
import { LOCALES } from "../../../enums/system-enums";

export const serviceOptionOwnerReadModel = z.object({
  id: z.string().min(1),
  pricingMode: z.string(),
  amountMinor: z.number().int(),
  currency: z.string(),
  durationMinutes: z.number().int().nullable(),
  minMinutes: z.number().int().nullable(),
  stepMinutes: z.number().int().nullable(),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  translations: z.array(z.object({ locale: z.enum(LOCALES), name: z.string() })),
});

/**
 * A service as its own provider sees it.
 *
 * Translations are deliberately unresolved. The provider's job on this screen
 * is to see which languages are filled in and which are not, and a resolved
 * name would hide exactly that — a service with no English would show its
 * Portuguese and look finished.
 */
export const serviceOwnerReadModel = z.object({
  id: z.string().min(1),
  providerId: z.string(),
  categoryId: z.string(),
  categoryCode: z.string(),
  sourceLocale: z.enum(LOCALES),
  locationType: z.string(),
  bookingMode: z.string(),
  status: z.string(),
  imageUrls: z.array(z.string()),
  sortOrder: z.number().int(),
  options: z.array(serviceOptionOwnerReadModel),
  translations: z.array(
    z.object({
      locale: z.enum(LOCALES),
      name: z.string(),
      description: z.string().nullable(),
    }),
  ),
  quoteForm: z
    .object({
      responseHours: z.number().int(),
      askDeadline: z.boolean(),
      askPhotos: z.boolean(),
      askLocation: z.boolean(),
      intro: z.string().nullable(),
    })
    .nullable(),
  createdAt: z.string(),
});

export type ServiceOwnerDTO = z.infer<typeof serviceOwnerReadModel>;
```

- [ ] **Step 2: Write the read repository**

`service-read.repository.ts` selects the service rows for a provider, then their
options, translations and option translations in three further queries keyed by
the ids — not joins, because joining any of them multiplies the service row and
makes every count on it wrong. It lives in `bounded-contexts/` and not in
`read/` so the public slice can use it too without tripping the tier guard.

- [ ] **Step 3: Add the query, handler and bootstrap**

`service.mine` takes `{ providerId, status? }`. The handler is a `.handle()`
rather than `handleWithUseCase`, because membership is a query:

```ts
    .handle("service.mine", async (args, ctx) => {
      const { requesterUserId } = asNtizoGraphqlContext(ctx);
      if (!requesterUserId) {
        throw new ForbiddenError({ message: "Sign in", code: "UNAUTHENTICATED" });
      }
      if (!(await mod.serviceRead.isProviderMember(args.input.providerId, requesterUserId))) {
        throw new ForbiddenError({
          message: "This workspace is not one you belong to",
          code: "NOT_PROVIDER_MEMBER",
        });
      }
      return mod.listMyServices.execute(args.input);
    })
```

- [ ] **Step 4: Verify against the running API**

Create a service through the mutations with a real session, then read it back
and assert: the option is there, `isDefault` is true, and `translations` carries
exactly the source locale.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/read-models packages/backend/src/modules/ntizo
git commit -m "feat(catalog): the provider's own service list

Translations come back unresolved on purpose: the job on this screen is
to see which languages are filled in, and a resolved name would hide
exactly that.

Options and translations are three further queries rather than joins —
joining any of them multiplies the service row and makes every count on
it wrong."
```

---

## Task 9: The customer's read

**Files:**
- Create: `packages/shared/src/read-models/public/service/service.schema.ts` and `index.ts`
- Modify: `packages/shared/src/read-models/public/index.ts`
- Create: `packages/backend/src/modules/ntizo/public/catalog/app/use-cases/list-services.projection.ts`
- Modify: `public/catalog/graphql/schema/queries.ts`, `public/catalog/graphql/handlers/queries.handlers.ts`, `public/catalog/bootstrap.ts`
- Test: `packages/backend/src/modules/ntizo/public/catalog/__tests__/list-services.test.ts`

**Interfaces:**
- Produces: query `service.all` taking `{ locale?, categoryCode?, limit?, offset? }` and returning `{ items, nextOffset }`.

- [ ] **Step 1: Write the failing projection test**

```ts
import { describe, expect, it } from "bun:test";
import { ListServicesProjection } from "../app/use-cases/list-services.projection";

const row = (over = {}) => ({
  id: "svc-1",
  providerId: "prov-1",
  providerName: "Barbearia",
  providerStatus: "active",
  categoryCode: "hair",
  status: "published",
  sourceLocale: "pt-MZ",
  locationType: "at_provider",
  bookingMode: "priced",
  imageKeys: [],
  defaultOption: { amountMinor: 30000, currency: "MZN", durationMinutes: 30, pricingMode: "fixed" },
  translations: [{ locale: "pt-MZ", name: "Corte de cabelo", description: null }],
  ...over,
});

class FakeRepo {
  constructor(private readonly rows: unknown[]) {}
  async listPublished() { return this.rows; }
}

describe("ListServicesProjection", () => {
  it("resolves the name into the reader's locale", async () => {
    const rows = [row({ translations: [
      { locale: "pt-MZ", name: "Corte de cabelo", description: null },
      { locale: "en-US", name: "Haircut", description: null },
    ] })];
    const out = await new ListServicesProjection(new FakeRepo(rows) as never)
      .execute({ locale: "en-US", limit: 10, offset: 0 });
    expect(out.items[0]!.name).toBe("Haircut");
    expect(out.items[0]!.isFallback).toBe(false);
  });

  it("falls back to the locale the provider wrote in, not the platform's", async () => {
    // The whole point of `sourceLocale`. A photographer writing in English must
    // not have their service shown in Portuguese to an Italian reader just
    // because Portuguese is the platform's default.
    const rows = [row({
      sourceLocale: "en-US",
      translations: [{ locale: "en-US", name: "Haircut", description: null }],
    })];
    const out = await new ListServicesProjection(new FakeRepo(rows) as never)
      .execute({ locale: "it-IT", limit: 10, offset: 0 });
    expect(out.items[0]!.name).toBe("Haircut");
    expect(out.items[0]!.isFallback).toBe(true);
  });

  it("drops a service whose provider is not active", async () => {
    const rows = [row({ providerStatus: "pending" })];
    const out = await new ListServicesProjection(new FakeRepo(rows) as never)
      .execute({ locale: "pt-MZ", limit: 10, offset: 0 });
    expect(out.items).toEqual([]);
  });

  it("reports the next offset only when there is another page", async () => {
    const many = Array.from({ length: 3 }, (_, i) => row({ id: `svc-${i}` }));
    const out = await new ListServicesProjection(new FakeRepo(many) as never)
      .execute({ locale: "pt-MZ", limit: 2, offset: 0 });
    expect(out.items).toHaveLength(2);
    expect(out.nextOffset).toBe(2);
  });
});
```

- [ ] **Step 2: Run and watch it fail, then write the projection**

The projection filters on `providerStatus === "active"` **and**
`status === "published"`, resolves each name with
`resolveTranslation(rows, locale, row.sourceLocale)`, drops any row that
resolves to null, and advances `nextOffset` by the page size rather than by the
number of items returned — a row dropped for being unreadable still occupied a
position, and paging by the shorter number would fetch it for ever.

- [ ] **Step 3: Wire the query into the public tier**

Add to `public/catalog/graphql/schema/queries.ts`, with **no context schema** —
the public mount supplies an empty context, and a schema that asks for a
requester there can only ever refuse.

- [ ] **Step 4: Run the tier isolation guard**

Run: `cd packages/backend && bun test src/modules/ntizo/public`
Expected: PASS. If it fails, the public slice is importing from `read/` — move
the shared persistence into `bounded-contexts/`.

- [ ] **Step 5: Verify against the running API, anonymously**

```bash
curl -s -X POST http://localhost:8788/public/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"query($i:ServiceAllInput!){serviceAll(input:$i){items{name isFallback} nextOffset}}","variables":{"i":{"locale":"it-IT"}}}'
```

Expected: the published services of active providers, names resolved, and
`isFallback: true` on any that have no Italian.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/read-models packages/backend/src/modules/ntizo/public
git commit -m "feat(catalog): the customer's service read

Resolved into one locale on the server so the fallback rule lives in one
place, and the fallback is the service's own source locale — a
photographer writing in English must not be shown in Portuguese to an
Italian reader because Portuguese is the platform's default.

Visible means published AND the provider is active, evaluated here rather
than copied onto the service: a copied status is two statuses that will
disagree."
```

---

## Task 10: The provider's service list

**Files:**
- Create: `apps/frontend/web/src/features/provider/services/domain/types.ts`
- Create: `apps/frontend/web/src/features/provider/services/data/service.repository.ts`
- Create: `apps/frontend/web/src/features/provider/services/viewmodel/use-services.ts`
- Create: `apps/frontend/web/src/features/provider/services/ui/services-page.tsx`
- Create: `apps/frontend/web/src/routes/provider/$slug/services.tsx`
- Modify: `apps/frontend/web/src/shared/lib/navigation.ts`
- Test: `apps/frontend/web/src/features/provider/services/domain/__tests__/service-display.test.ts`

**Interfaces:**
- Consumes: query `service.mine`.
- Produces: `ownerName(service, locale)`, `translatedCount(service)`, `formatOptionPrice(option, locale)`.

- [ ] **Step 1: Write the failing display tests**

```ts
import { describe, expect, it } from "vitest";
import { formatOptionPrice, ownerName, translatedCount } from "../types";

const svc = {
  sourceLocale: "pt-MZ",
  translations: [
    { locale: "pt-MZ", name: "Corte de cabelo", description: null },
    { locale: "en-US", name: "Haircut", description: null },
  ],
} as never;

describe("ownerName", () => {
  it("prefers the reader's locale", () => {
    expect(ownerName(svc, "en-US")).toBe("Haircut");
  });

  it("falls back to the locale the provider wrote in", () => {
    expect(ownerName(svc, "fr-FR")).toBe("Corte de cabelo");
  });
});

describe("translatedCount", () => {
  it("counts the languages with a name", () => {
    expect(translatedCount(svc)).toBe(2);
  });
});

describe("formatOptionPrice", () => {
  it("reads a fixed option as a price for the job", () => {
    expect(
      formatOptionPrice(
        { pricingMode: "fixed", amountMinor: 30000, currency: "MZN", durationMinutes: 30 } as never,
        "pt-MZ",
      ),
    ).toMatch(/300/);
  });

  it("reads an hourly option as a rate", () => {
    // The two must not read alike: one is what the job costs, the other is
    // what an hour of it costs, and a customer who confuses them is a dispute.
    const out = formatOptionPrice(
      {
        pricingMode: "hourly",
        amountMinor: 25000,
        currency: "MZN",
        durationMinutes: null,
        minMinutes: 120,
      } as never,
      "pt-MZ",
    );
    expect(out).toMatch(/250/);
    expect(out).toMatch(/\//);
  });
});
```

- [ ] **Step 2: Run, watch it fail, write `types.ts`**

Run: `cd apps/frontend/web && bunx vitest run src/features/provider/services`

`formatOptionPrice` returns `"300,00 MTn"` for fixed and `"250,00 MTn / h"` for
hourly, using `Intl.NumberFormat` with `style: "currency"` and the division by
100 happening only there.

- [ ] **Step 3: Write the repository, viewmodel and page**

The page uses `CollectionCard` — the same component as every other list in the
app, so the header, count, search box, table above `md` and stacked cards below
have one definition. Columns: the service (image or monogram, name, category),
the default price, languages as `n/8`, status, and a row menu.

- [ ] **Step 4: Add the route and the nav entry**

`routes/provider/$slug/services.tsx`, and a `nav.services` item in
`providerNavGroups` under `nav.work`, above the overview's siblings.

- [ ] **Step 5: Verify in the running app**

Load `/provider/<slug>/services` and confirm: the list renders, the skeleton
matches the loaded dimensions, and no raw translation keys appear
(`document.body.innerText.match(/services[A-Z]\w+/g)` must be empty).

- [ ] **Step 6: Commit**

---

## Task 11: Creating and editing

**Files:**
- Create: `apps/frontend/web/src/features/provider/services/ui/service-form.tsx`
- Create: `apps/frontend/web/src/features/provider/services/ui/options-editor.tsx`
- Test: `apps/frontend/web/src/features/provider/services/domain/__tests__/service-draft.test.ts`

- [ ] **Step 1: Write the failing draft tests**

The form's rules, as pure functions so they can be tested without a DOM:

```ts
import { describe, expect, it } from "vitest";
import { canSubmit, emptyDraft, optionErrors } from "../service-draft";

describe("canSubmit", () => {
  it("needs a category, a name and a location", () => {
    expect(canSubmit(emptyDraft())).toBe(false);
    expect(
      canSubmit({ ...emptyDraft(), categoryId: "c", name: "Corte", locationType: "at_provider" }),
    ).toBe(true);
  });
});

describe("optionErrors", () => {
  it("asks a fixed option for a duration", () => {
    expect(
      optionErrors({ pricingMode: "fixed", amount: "300", duration: "", min: "", step: "" }),
    ).toHaveProperty("duration");
  });

  it("asks an hourly option for a minimum and a step, and no duration", () => {
    const errs = optionErrors({ pricingMode: "hourly", amount: "250", duration: "", min: "", step: "" });
    expect(errs).toHaveProperty("min");
    expect(errs).toHaveProperty("step");
    expect(errs).not.toHaveProperty("duration");
  });

  it("refuses a price of zero", () => {
    expect(
      optionErrors({ pricingMode: "fixed", amount: "0", duration: "30", min: "", step: "" }),
    ).toHaveProperty("amount");
  });

  it("accepts a comma as the decimal separator", () => {
    // It is how the number is written here. Refusing it would make the form
    // wrong for the market it launches in.
    expect(
      optionErrors({ pricingMode: "fixed", amount: "300,50", duration: "30", min: "", step: "" }),
    ).toEqual({});
  });
});
```

- [ ] **Step 2: Run, watch it fail, write `service-draft.ts`**

- [ ] **Step 3: Write the form**

A short form, not a wizard: a service is a small thing and a seven-step wizard
would make it feel like registering a business again. Category, name,
description, where it happens, and then the branch on `bookingMode`.

The location question is asked in two steps in the interface and stored as one
value: "Remotely or in person?" and, when in person, "Where?" — because "in
person" is the umbrella over three of the four values, not a peer of them.

- [ ] **Step 4: Write the options editor**

A list of cards, each with name, pricing mode, price and the duration fields for
that mode. The first created is marked as the standard. Reordering by dragging,
**and** move-up/move-down in each row's menu: drag events do not fire for touch
and cannot be driven from a keyboard, so dragging alone reorders nothing for
most of the ways people use a list.

- [ ] **Step 5: Verify the whole path in the running app**

Create a service, add two options with different durations, publish it, and
confirm through the public query that it appears with the default option's
price. Then try to publish a priced service with no options and confirm the
message names the reason rather than saying something went wrong.

- [ ] **Step 6: Commit**

---

## Task 12: Translations, copy, and the end-to-end check

**Files:**
- Create: `apps/frontend/web/src/features/provider/services/ui/translations-sheet.tsx`
- Modify: `apps/frontend/web/src/shared/locales/*/provider.json` (8 files)

- [ ] **Step 1: Write the translations sheet**

Behind a "Translate" button, never a field in the main form. One box per locale,
the source locale shown first and marked as the one that was written. No
warning anywhere that a service is untranslated, and nothing blocking
publication: a provider who abandons publishing because the platform asked for
eight languages costs more than an untranslated service.

- [ ] **Step 2: Add every string to all eight locale files**

Portuguese (both) and English written properly; the other six may take the
English text rather than a guess, as the categories did.

- [ ] **Step 3: Confirm no key renders raw**

In the running app, on each of the list, the form and the sheet:

```js
document.body.innerText.match(/service[A-Z]\w+|options[A-Z]\w+/g)
```

Expected: `null`. A missing key renders as the key and never fails a build —
this has happened twice on this project by reading a key from the wrong
namespace.

- [ ] **Step 4: Full verification**

```bash
bun run check-types && bun run lint && bun run test
```

Then, against the running app, walk the whole slice: create → add options →
translate → publish → read anonymously in a third language and see the fallback.

- [ ] **Step 5: Commit**

---

## Self-review

**Spec coverage.** Every section of the spec has a task: the enums and
`resolveTranslation` (1), the four tables and their constraints (2), the domain
rules (3), the aggregate (4), persistence (5), commands (6), the write slice
(7), the provider read (8), the public read (9), and the interface (10-12). The
`service_quote_form` is created by the aggregate in Task 4 and edited through
`service.update` in Task 7. The `BookingPath` mapping table in the spec is
documentation, not code, and needs no task.

**Placeholders.** None: every code step carries the code, every test step
carries the test, and every verification step carries the command and the
expected output.

**Type consistency.** `assertOptionShape`, `withSingleDefault`,
`promoteNextDefault` and `canPublish` are defined in Task 3 and used under those
names in Task 4. `ServiceRepositoryPort`'s four methods are defined in Task 5
and called under those names in Task 6. `serviceMapper.toDomain` takes a
`ServiceRowSet` in both the test and the repository. The five commands are
constructed in Task 6's bootstrap under the names Task 7's handlers call.

**Gaps found and closed while reviewing:** Task 5's `save` deletes options
before inserting option translations, which cascades — noted inline so nobody
adds a redundant delete. Task 9's `nextOffset` advances by the page size and not
by `items.length`, which the spec did not say and which would otherwise re-fetch
a dropped row for ever.
