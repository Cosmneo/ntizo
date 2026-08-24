# Public Service Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/services/$id`, the public page where a customer reads a service, picks a package, sees the total with commission, and sees when it can happen and who would do it.

**Architecture:** A new public GraphQL query `serviceById` returns the service, its full option list, its provider and its performers. Availability stays on the existing `availability.forService`, windowed separately so moving through dates does not refetch the page. Performer names cross from Catalog into the User context and therefore go behind their own outbound port.

**Tech Stack:** Bun, Hono, Drizzle, Neon Postgres, `@cosmneo/onion-lasagna`, zod, React 19, TanStack Router + Query, Tailwind v4, i18next.

**Spec:** `docs/superpowers/specs/2026-08-13-service-detail-page-design.md`

## Global Constraints

- **Money is integer minor units.** Never a float. A percentage of a float is how a total ends in `550.0000000001`.
- **Commission is 10%, charged to the customer.** The provider receives the full package price. Permanent model — do not make it configurable.
- **Backend tests use `bun:test`** (`import { describe, expect, it } from "bun:test"`), run with `bun test <path>` from `packages/backend`. Frontend and shared use **vitest**, run with `bunx vitest run <path>`.
- **8 locales, all required:** `en-US`, `pt-MZ`, `pt-PT`, `es-ES`, `fr-FR`, `de-DE`, `it-IT`, `nl-NL`. `src/shared/lib/__tests__/i18n-parity.test.ts` fails if one is missing a key.
- **Locale JSON keeps insertion order.** Append new keys; never sort the file.
- **Every new GraphQL argument needs a line in `arg-mappers.ts`.** `locationType` and `sort` both shipped doing nothing because they were added to the schema and not the mapper. Validation accepts them, the mapper drops them, the page reads as "no results".
- **A public read model addition is one-way.** Anything crawled stays crawled.
- **Node 22 for the API:** `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`. Ports: API 8788, web 3000.
- **Another session may be editing `features/provider/availability/`.** Typecheck errors in `week-preview.test.tsx` are not yours. Filter with `| grep -v "provider/availability"`.

---

### Task 1: Booking total arithmetic

The money maths, alone and testable, before anything renders it.

**Files:**
- Create: `apps/frontend/web/src/features/directory/services/domain/booking-total.ts`
- Test: `apps/frontend/web/src/features/directory/services/domain/__tests__/booking-total.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `NTIZO_COMMISSION_RATE: 0.1`, `bookingTotal(packageMinor: number): { packageMinor: number; commissionMinor: number; totalMinor: number }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { NTIZO_COMMISSION_RATE, bookingTotal } from "../booking-total";

describe("bookingTotal", () => {
  it("adds ten percent to the package price", () => {
    // The mockup's own numbers: 500 + 50 = 550.
    expect(bookingTotal(50000)).toEqual({
      packageMinor: 50000,
      commissionMinor: 5000,
      totalMinor: 55000,
    });
  });

  it("rounds the commission to whole minor units", () => {
    // 333.33 MZN at 10% is 33.333 — a third of a centavo cannot be charged,
    // and a fraction reaching a payment provider is a rejected transaction.
    const t = bookingTotal(33333);
    expect(Number.isInteger(t.commissionMinor)).toBe(true);
    expect(t.commissionMinor).toBe(3333);
  });

  it("keeps the total exactly the sum of its two parts", () => {
    // The invariant the receipt depends on. Rounding each part separately is
    // how a line-item breakdown stops adding up to its own total.
    for (const amount of [1, 7, 99, 12345, 33333, 99999, 100000001]) {
      const t = bookingTotal(amount);
      expect(t.packageMinor + t.commissionMinor).toBe(t.totalMinor);
    }
  });

  it("charges nothing on nothing", () => {
    expect(bookingTotal(0)).toEqual({
      packageMinor: 0,
      commissionMinor: 0,
      totalMinor: 0,
    });
  });

  it("exposes the rate so the UI can name it without restating it", () => {
    expect(NTIZO_COMMISSION_RATE).toBe(0.1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/services/domain/__tests__/booking-total.test.ts`
Expected: FAIL — cannot resolve `../booking-total`.

- [ ] **Step 3: Implement**

```ts
/**
 * What a customer pays, and how it breaks down.
 *
 * Ntizo charges the customer 10% on top of the package price; the provider
 * receives the price they set, whole. That asymmetry is the platform's
 * permanent commercial model, not a setting — which is why the rate is a
 * constant here rather than a column somebody could set to 0 for one booking
 * and 30 for the next.
 */
export const NTIZO_COMMISSION_RATE = 0.1;

export interface BookingTotal {
  /** What the provider set, and what they receive. */
  packageMinor: number;
  /** What Ntizo adds. */
  commissionMinor: number;
  /** What the customer pays. Always exactly the two above. */
  totalMinor: number;
}

/**
 * Minor units throughout, and the total derived by addition rather than by a
 * second multiplication.
 *
 * `price * 1.1` and `price + round(price * 0.1)` disagree at any amount whose
 * tenth is not whole, and a receipt whose three lines do not add up is a
 * support ticket that takes an hour to explain. Rounding once, then adding,
 * makes the arithmetic on screen the arithmetic that happened.
 */
export function bookingTotal(packageMinor: number): BookingTotal {
  const commissionMinor = Math.round(packageMinor * NTIZO_COMMISSION_RATE);
  return {
    packageMinor,
    commissionMinor,
    totalMinor: packageMinor + commissionMinor,
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/services/domain/__tests__/booking-total.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/features/directory/services/domain/booking-total.ts apps/frontend/web/src/features/directory/services/domain/__tests__/booking-total.test.ts
git commit -m "feat(services): the money a booking costs, and its three lines"
```

---

### Task 2: The detail read model

**Files:**
- Modify: `packages/shared/src/read-models/public/service/service.schema.ts`

**Interfaces:**
- Consumes: `servicePublicOptionReadModel` (exists).
- Produces: `serviceDetailReadModel`, `ServiceDetailDTO`, `servicePerformerReadModel`, `ServicePerformerDTO`, `serviceDetailOptionReadModel`, `ServiceDetailOptionDTO`.

- [ ] **Step 1: Add the models**

Append to `service.schema.ts`, after `ServicePageDTO`:

```ts
/**
 * One package a customer can choose, on the service's own page.
 *
 * Distinct from `servicePublicOptionReadModel`, which is the single option a
 * *card* shows: this one carries an id (the chooser needs something to select)
 * and a name (a list of three prices with no labels is not a choice).
 */
export const serviceDetailOptionReadModel = z.object({
  id: z.string().min(1),
  /** Already resolved into the reader's language. */
  name: z.string(),
  amountMinor: z.number().int(),
  currency: z.string(),
  durationMinutes: z.number().int().nullable(),
  minMinutes: z.number().int().nullable(),
  stepMinutes: z.number().int().nullable(),
  pricingMode: z.string(),
  isDefault: z.boolean(),
});

/**
 * Somebody who performs this service.
 *
 * First name and photograph, never a surname: enough for a customer to know
 * who is coming, and the narrowest disclosure that achieves it. These are
 * employees, not account holders — publishing them is a one-way decision taken
 * on 2026-08-13, reversing the earlier choice `member-picker.tsx` documents.
 */
export const servicePerformerReadModel = z.object({
  /** A `provider_member.id` — the same id `availability.forService` speaks. */
  id: z.string().min(1),
  firstName: z.string(),
  avatarUrl: z.string().nullable(),
});

/**
 * One service, in full, for its own page.
 *
 * A separate model from `serviceReadModel` rather than more fields on it: the
 * browse asks for twenty-four services at a time and wants one price each.
 * Sending every option of every card to save a schema would make the list page
 * pay for the detail page's data.
 */
export const serviceDetailReadModel = z.object({
  id: z.string().min(1),
  providerId: z.string(),
  providerName: z.string(),
  providerSlug: z.string(),
  providerType: z.enum(["individual", "organization"]),
  providerLogoUrl: z.string().nullable(),
  providerCity: z.string().nullable(),
  providerDistrict: z.string().nullable(),
  categoryCode: z.string(),
  categoryName: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  locationType: z.string(),
  bookingMode: z.string(),
  imageUrls: z.array(z.string()),
  /** Every active option, cheapest first. Empty for a `quote` service. */
  options: z.array(serviceDetailOptionReadModel),
  performers: z.array(servicePerformerReadModel),
  isFallback: z.boolean(),
});

export type ServiceDetailOptionDTO = z.infer<typeof serviceDetailOptionReadModel>;
export type ServicePerformerDTO = z.infer<typeof servicePerformerReadModel>;
export type ServiceDetailDTO = z.infer<typeof serviceDetailReadModel>;
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/shared && bunx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/read-models/public/service/service.schema.ts
git commit -m "feat(catalog): a public read model for one service in full"
```

---

### Task 3: The performer port and its adapter

The cross-context hop, isolated behind a port so no Catalog repository reads a User table.

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/app/ports/outbound/performer-read.port.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/infrastructure/repositories/drizzle/performer-read.repository.ts`

**Interfaces:**
- Consumes: `providerMember` (`.../provider/schemas`), `profile` (`.../user/schemas`).
- Produces: `PerformerRow { id, firstName, avatarUrl }`, `PerformerReadPort.byMemberIds(memberIds: string[]): Promise<PerformerRow[]>`, `DrizzlePerformerReadRepository`.

- [ ] **Step 1: Write the port**

```ts
export interface PerformerRow {
  /** A `provider_member.id`. */
  id: string;
  firstName: string;
  avatarUrl: string | null;
}

/**
 * Who performs a service, by name.
 *
 * Its own port because answering it leaves the Catalog context: a member's
 * name lives on `ntizo_user.profile`, which the User context owns. A read-side
 * projection assembling a view across contexts is what read models are for;
 * a Catalog repository reaching into another context's tables is not, and the
 * difference is exactly this interface.
 *
 * `firstName` and not `displayName`: the display name is whatever a person
 * chose for themselves product-wide and can be anything at all. What was
 * approved for publication is a first name.
 */
export interface PerformerReadPort {
  /** Returns a row per id that resolves; unknown ids are simply absent. */
  byMemberIds(memberIds: string[]): Promise<PerformerRow[]>;
}
```

- [ ] **Step 2: Write the adapter**

```ts
import { inArray, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import { profile } from "../../../../../shared/infrastructure/database/user/schemas";
import type {
  PerformerReadPort,
  PerformerRow,
} from "../../../app/ports/outbound/performer-read.port";

/**
 * The one place the Catalog side joins a User table.
 *
 * Deliberately the whole of it: the join lives here so that widening what is
 * published about a person is a change to one file somebody can review, rather
 * than a column quietly added to a select in the middle of a service query.
 */
export class DrizzlePerformerReadRepository implements PerformerReadPort {
  async byMemberIds(memberIds: string[]): Promise<PerformerRow[]> {
    if (memberIds.length === 0) return [];
    const rows = await getDb()
      .select({
        id: providerMember.id,
        firstName: profile.firstName,
        avatarUrl: profile.avatarUrl,
      })
      .from(providerMember)
      .innerJoin(profile, eq(profile.userId, providerMember.userId))
      .where(inArray(providerMember.id, memberIds));
    return rows;
  }
}
```

- [ ] **Step 3: Verify the `profile` export path**

Run: `cd packages/backend && grep -rn "export.*profile" src/modules/ntizo/shared/infrastructure/database/user/schemas/index.ts`
Expected: `profile` is exported. If the barrel does not export it, import from `../user/schemas/profile.schema` instead and note it.

- [ ] **Step 4: Typecheck**

Run: `cd packages/backend && bunx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/catalog/app/ports/outbound/performer-read.port.ts packages/backend/src/modules/ntizo/bounded-contexts/catalog/infrastructure/repositories/drizzle/performer-read.repository.ts
git commit -m "feat(catalog): a port for who performs a service, by name"
```

---

### Task 4: `getPublishedById` on the service read repository

**Files:**
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/app/ports/outbound/service-read.repository.port.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/infrastructure/repositories/drizzle/service-read.repository.ts`

**Interfaces:**
- Consumes: `ServicePublicTranslationRow` (exists).
- Produces: `ServiceDetailRow`, `ServiceReadRepositoryPort.getPublishedById(id: string): Promise<ServiceDetailRow | null>`.

- [ ] **Step 1: Add the row type and the method to the port**

Append to `service-read.repository.port.ts`:

```ts
export interface ServiceDetailOptionRow {
  id: string;
  amountMinor: number;
  currency: string;
  durationMinutes: number | null;
  minMinutes: number | null;
  stepMinutes: number | null;
  pricingMode: string;
  isDefault: boolean;
  sortOrder: number;
  translations: { locale: string; name: string }[];
}

export interface ServiceDetailRow extends ServicePublicRow {
  providerLogoKey: string | null;
  providerCity: string | null;
  providerDistrict: string | null;
  /** Active options only, cheapest first. */
  options: ServiceDetailOptionRow[];
  /** `provider_member.id`s who perform this service. */
  memberIds: string[];
}
```

Add to the `ServiceReadRepositoryPort` interface:

```ts
  /**
   * One published service in full, or null.
   *
   * Null covers missing, unpublished and inactive-provider alike. The caller
   * cannot tell which, and that is the point: distinguishing them would let an
   * anonymous reader probe ids for services their owner has not published.
   */
  getPublishedById(id: string): Promise<ServiceDetailRow | null>;
```

- [ ] **Step 2: Implement it**

Add to `DrizzleServiceReadRepository`, after `listPublished`:

```ts
  async getPublishedById(id: string): Promise<ServiceDetailRow | null> {
    const db = getDb();
    const [row] = await db
      .select({
        id: service.id,
        providerId: service.providerId,
        providerName: provider.name,
        providerSlug: provider.slug,
        providerStatus: provider.status,
        providerType: provider.type,
        providerLogoKey: provider.logoKey,
        providerCity: provider.addressCity,
        providerDistrict: provider.addressDistrict,
        categoryId: category.id,
        categoryCode: category.code,
        status: service.status,
        sourceLocale: service.sourceLocale,
        locationType: service.locationType,
        bookingMode: service.bookingMode,
        imageKeys: service.imageKeys,
      })
      .from(service)
      .innerJoin(category, eq(category.id, service.categoryId))
      .innerJoin(provider, eq(provider.id, service.providerId))
      .where(eq(service.id, id))
      .limit(1);

    if (!row) return null;

    const [translations, categoryTranslations, options, members] = await Promise.all([
      db.select().from(serviceTranslation).where(eq(serviceTranslation.serviceId, id)),
      db.select().from(categoryTranslation).where(eq(categoryTranslation.categoryId, row.categoryId)),
      db
        .select()
        .from(serviceOption)
        .where(and(eq(serviceOption.serviceId, id), eq(serviceOption.isActive, true)))
        .orderBy(asc(serviceOption.amountMinor)),
      db.select().from(serviceMember).where(eq(serviceMember.serviceId, id)),
    ]);

    const optionIds = options.map((o) => o.id);
    const optionTranslations = optionIds.length
      ? await db
          .select()
          .from(serviceOptionTranslation)
          .where(inArray(serviceOptionTranslation.optionId, optionIds))
      : [];

    const { categoryId, ...rest } = row;
    return {
      ...rest,
      // The page's own chooser lists cheapest first, which is also the order
      // the "from" price on the browse card is taken from. One order, so the
      // number a reader arrived expecting is the first one they see here.
      options: options.map((o) => ({
        id: o.id,
        amountMinor: o.amountMinor,
        currency: o.currency,
        durationMinutes: o.durationMinutes,
        minMinutes: o.minMinutes,
        stepMinutes: o.stepMinutes,
        pricingMode: o.pricingMode,
        isDefault: o.isDefault,
        sortOrder: o.sortOrder,
        translations: optionTranslations
          .filter((t) => t.optionId === o.id)
          .map((t) => ({ locale: t.locale, name: t.name })),
      })),
      memberIds: members.map((m) => m.memberId),
      categoryTranslations: categoryTranslations.map((t) => ({
        locale: t.locale,
        name: t.name,
        description: null,
      })),
      translations: translations.map((t) => ({
        locale: t.locale,
        name: t.name,
        description: t.description,
      })),
      // The card's own fields, unused by the detail page but part of the row
      // it extends. `defaultOption` is the one marked default; the aggregate
      // pair are derived from the options already fetched.
      defaultOption: (() => {
        const d = options.find((o) => o.isDefault);
        return d
          ? {
              amountMinor: d.amountMinor,
              currency: d.currency,
              durationMinutes: d.durationMinutes,
              minMinutes: d.minMinutes,
              stepMinutes: d.stepMinutes,
              pricingMode: d.pricingMode,
            }
          : null;
      })(),
      fromAmountMinor: options.length ? (options[0]?.amountMinor ?? null) : null,
      optionCount: options.length,
    };
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/backend && bunx tsc --noEmit`
Expected: no output. If `provider.logoKey`, `provider.addressCity` or `provider.addressDistrict` are named differently, correct to the real column names — check with `grep -n "logoKey\|addressCity\|addressDistrict" src/modules/ntizo/shared/infrastructure/database/provider/schemas/provider.schema.ts`.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/catalog/
git commit -m "feat(catalog): read one published service with all its packages"
```

---

### Task 5: The projection

**Files:**
- Create: `packages/backend/src/modules/ntizo/public/catalog/app/use-cases/get-service.projection.ts`
- Create: `packages/backend/src/modules/ntizo/public/catalog/__tests__/get-service.test.ts`

**Interfaces:**
- Consumes: `ServiceReadRepositoryPort.getPublishedById`, `PerformerReadPort.byMemberIds`, `resolveTranslation`, `mediaUrl`.
- Produces: `GetServiceProjection` with `execute(input: { id: string; locale: string }): Promise<ServiceDetailDTO | null>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "bun:test";
import { GetServiceProjection } from "../app/use-cases/get-service.projection";

const row = (over = {}) => ({
  id: "svc-1",
  providerId: "prov-1",
  providerName: "Barbearia",
  providerSlug: "barbearia",
  providerStatus: "active",
  providerType: "organization",
  providerLogoKey: null,
  providerCity: "Maputo",
  providerDistrict: "Malhazine",
  categoryCode: "hair",
  categoryTranslations: [{ locale: "pt-MZ", name: "Cabeleireiro", description: null }],
  status: "published",
  sourceLocale: "pt-MZ",
  locationType: "at_customer",
  bookingMode: "priced",
  imageKeys: [],
  defaultOption: null,
  fromAmountMinor: 35000,
  optionCount: 3,
  memberIds: ["m1", "m2"],
  options: [
    { id: "o1", amountMinor: 35000, currency: "MZN", durationMinutes: 60, minMinutes: null, stepMinutes: null, pricingMode: "fixed", isDefault: false, sortOrder: 0, translations: [{ locale: "pt-MZ", name: "Cerimónia" }] },
    { id: "o2", amountMinor: 50000, currency: "MZN", durationMinutes: 120, minMinutes: null, stepMinutes: null, pricingMode: "fixed", isDefault: true, sortOrder: 1, translations: [{ locale: "pt-MZ", name: "Cerimónia + Copo d'água" }] },
  ],
  translations: [{ locale: "pt-MZ", name: "Fotografia de casamentos", description: "Seis anos de experiência." }],
  ...over,
});

class FakeRepo {
  constructor(private readonly r: unknown) {}
  async getPublishedById() { return this.r; }
}
class FakePerformers {
  lastIds: string[] = [];
  constructor(private readonly rows: unknown[] = []) {}
  async byMemberIds(ids: string[]) { this.lastIds = ids; return this.rows; }
}

const make = (r: unknown, p = new FakePerformers()) =>
  new GetServiceProjection(new FakeRepo(r) as never, p as never);

describe("GetServiceProjection", () => {
  it("returns the service with its packages, cheapest first", async () => {
    const out = await make(row()).execute({ id: "svc-1", locale: "pt-MZ" });
    expect(out?.name).toBe("Fotografia de casamentos");
    expect(out?.options.map((o) => o.amountMinor)).toEqual([35000, 50000]);
    expect(out?.options[0]?.name).toBe("Cerimónia");
  });

  it("returns null when there is no such service", async () => {
    expect(await make(null).execute({ id: "nope", locale: "pt-MZ" })).toBeNull();
  });

  it("returns null for an unpublished service", async () => {
    // Not an error, and not a different null from "missing": telling them
    // apart lets anyone probe ids for services nobody published.
    expect(await make(row({ status: "draft" })).execute({ id: "svc-1", locale: "pt-MZ" })).toBeNull();
  });

  it("returns null when the provider is not active", async () => {
    expect(await make(row({ providerStatus: "suspended" })).execute({ id: "svc-1", locale: "pt-MZ" })).toBeNull();
  });

  it("resolves option names by the service's own source locale, not the platform's", async () => {
    // An option is the provider's writing, like the service's name. A reader
    // in Italian gets the provider's English, not the platform's Portuguese.
    const out = await make(row({
      sourceLocale: "en-US",
      translations: [{ locale: "en-US", name: "Wedding photography", description: null }],
      options: [{ id: "o1", amountMinor: 35000, currency: "MZN", durationMinutes: 60, minMinutes: null, stepMinutes: null, pricingMode: "fixed", isDefault: true, sortOrder: 0, translations: [{ locale: "en-US", name: "Ceremony" }] }],
    })).execute({ id: "svc-1", locale: "it-IT" });
    expect(out?.options[0]?.name).toBe("Ceremony");
  });

  it("asks the performer port for exactly this service's members", async () => {
    const performers = new FakePerformers([
      { id: "m1", firstName: "Ana", avatarUrl: null },
      { id: "m2", firstName: "Flávio", avatarUrl: "https://cdn/x.jpg" },
    ]);
    const out = await make(row(), performers).execute({ id: "svc-1", locale: "pt-MZ" });
    expect(performers.lastIds).toEqual(["m1", "m2"]);
    expect(out?.performers.map((p) => p.firstName)).toEqual(["Ana", "Flávio"]);
  });

  it("carries a quote service through with no packages", async () => {
    const out = await make(row({ bookingMode: "quote", options: [] }))
      .execute({ id: "svc-1", locale: "pt-MZ" });
    expect(out?.options).toEqual([]);
    expect(out?.bookingMode).toBe("quote");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/public/catalog/__tests__/get-service.test.ts`
Expected: FAIL — cannot resolve `get-service.projection`.

- [ ] **Step 3: Implement**

```ts
import type { ServiceDetailDTO } from "@ntizo/shared/read-models";
import { resolveTranslation } from "../../../../bounded-contexts/catalog/domain/translations";
import { mediaUrl } from "../../../../shared/infrastructure/media/media-url";
import type { ServiceReadRepositoryPort } from "../../../../bounded-contexts/catalog/app/ports/outbound/service-read.repository.port";
import type { PerformerReadPort } from "../../../../bounded-contexts/catalog/app/ports/outbound/performer-read.port";

export interface GetServiceInput {
  id: string;
  locale: string;
}

/**
 * One published service, in the reader's language.
 *
 * The same published-AND-active rule `ListServicesProjection` enforces, and
 * enforced in the same place for the same reason: a fake, a future repository
 * or a forgotten WHERE clause must not be able to leak a row past it.
 *
 * Every reason to refuse returns the same `null`. A missing id, a draft and a
 * suspended provider are one answer to an anonymous reader — three answers
 * would be a way to enumerate what providers have not published.
 */
export class GetServiceProjection {
  constructor(
    private readonly repo: ServiceReadRepositoryPort,
    private readonly performers: PerformerReadPort,
  ) {}

  async execute(input: GetServiceInput): Promise<ServiceDetailDTO | null> {
    const r = await this.repo.getPublishedById(input.id);
    if (!r) return null;
    if (r.status !== "published" || r.providerStatus !== "active") return null;

    const t = resolveTranslation(r.translations, input.locale, r.sourceLocale);
    if (!t) return null;

    // Two arguments for the category, three for the service and its options:
    // a category is platform data with no author and falls back to the
    // platform's language; a service and its packages are the provider's
    // writing and fall back to theirs.
    const c = resolveTranslation(r.categoryTranslations, input.locale);
    const performers = await this.performers.byMemberIds(r.memberIds);

    return {
      id: r.id,
      providerId: r.providerId,
      providerName: r.providerName,
      providerSlug: r.providerSlug,
      providerType: r.providerType as ServiceDetailDTO["providerType"],
      providerLogoUrl: mediaUrl(r.providerLogoKey),
      providerCity: r.providerCity,
      providerDistrict: r.providerDistrict,
      categoryCode: r.categoryCode,
      categoryName: c?.name ?? r.categoryCode,
      name: t.name,
      description: t.description,
      locationType: r.locationType,
      bookingMode: r.bookingMode,
      imageUrls: (r.imageKeys ?? [])
        .map((k) => mediaUrl(k))
        .filter((u): u is string => u !== null),
      options: r.options.map((o) => {
        const ot = resolveTranslation(
          o.translations.map((x) => ({ ...x, description: null })),
          input.locale,
          r.sourceLocale,
        );
        return {
          id: o.id,
          // An option with no name at all still has a price, and dropping it
          // would hide a package the provider is selling. The empty string is
          // the UI's problem to render, not this layer's to refuse.
          name: ot?.name ?? "",
          amountMinor: o.amountMinor,
          currency: o.currency,
          durationMinutes: o.durationMinutes,
          minMinutes: o.minMinutes,
          stepMinutes: o.stepMinutes,
          pricingMode: o.pricingMode,
          isDefault: o.isDefault,
        };
      }),
      performers: performers.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        avatarUrl: p.avatarUrl,
      })),
      isFallback: t.isFallback,
    };
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd packages/backend && bun test src/modules/ntizo/public/catalog/__tests__/get-service.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo/public/catalog/
git commit -m "feat(catalog): project one service, its packages and its performers"
```

---

### Task 6: GraphQL wiring

**Files:**
- Modify: `packages/backend/src/modules/ntizo/public/catalog/graphql/schema/queries.ts`
- Modify: `packages/backend/src/modules/ntizo/public/catalog/graphql/handlers/arg-mappers.ts`
- Modify: `packages/backend/src/modules/ntizo/public/catalog/graphql/handlers/queries.handlers.ts`
- Modify: `packages/backend/src/modules/ntizo/public/catalog/bootstrap.ts`
- Modify: `packages/backend/src/modules/ntizo/public/catalog/__tests__/get-service.test.ts`

**Interfaces:**
- Consumes: `GetServiceProjection`, `DrizzlePerformerReadRepository`.
- Produces: GraphQL field `serviceById`; `mapGetServiceInput(input): GetServiceInput`.

- [ ] **Step 1: Write the failing mapper test**

Append to `get-service.test.ts`:

```ts
import { mapGetServiceInput } from "../graphql/handlers/arg-mappers";

describe("mapGetServiceInput", () => {
  it("passes the id and the locale through", () => {
    expect(mapGetServiceInput({ id: "svc-1", locale: "en-US" })).toEqual({
      id: "svc-1",
      locale: "en-US",
    });
  });

  it("falls back to the platform's language when none was asked for", () => {
    // A zod `.default()` does not survive into the generated GraphQL schema,
    // so the fallback has to run here or not at all.
    expect(mapGetServiceInput({ id: "svc-1" })).toEqual({
      id: "svc-1",
      locale: "pt-MZ",
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/public/catalog/__tests__/get-service.test.ts`
Expected: FAIL — `mapGetServiceInput` is not exported.

- [ ] **Step 3: Add the query to the schema**

In `queries.ts`, after `listServices`, add:

```ts
/**
 * One published service, in full — the service's own page.
 *
 * Public for the same reason `listServices` is: this page is server-rendered
 * for crawlers and read by people who have not signed in.
 *
 * Nullable output rather than an error for a missing service, so the three
 * ways a service can be unreachable — gone, unpublished, provider suspended —
 * are one answer.
 */
export const getService = defineQuery({
  input: zodSchema(
    z.object({
      id: z.string().min(1),
      locale: localeSchema.optional(),
    }),
  ),
  output: zodSchema(serviceDetailReadModel.nullable()),
  docs: { summary: "One published service in one language", tags: ["Catalog"] },
});
```

Change the mount to:

```ts
export const catalogPublicSchema = defineGraphQLSchema({
  category: { all: listCategories },
  service: { all: listServices, byId: getService },
});
```

Add `serviceDetailReadModel` to the `@ntizo/shared/read-models` import.

- [ ] **Step 4: Add the mapper**

In `arg-mappers.ts`:

```ts
import type { GetServiceInput } from "../../app/use-cases/get-service.projection";

/**
 * The GraphQL arguments of `service.byId`, as the projection wants them.
 *
 * A named, tested function for the same reason `mapListServicesInput` is: a
 * field added to the schema and forgotten here validates fine and is then
 * silently dropped.
 */
export function mapGetServiceInput(input: {
  id: string;
  locale?: string | undefined;
}): GetServiceInput {
  return { id: input.id, locale: input.locale ?? DEFAULT_LOCALE };
}
```

- [ ] **Step 5: Add the handler**

In `queries.handlers.ts`, add `getService: GetServiceProjection` to `CatalogPublicModule`, import `mapGetServiceInput` and the projection type, and chain:

```ts
    .handleWithUseCase("service.byId", {
      argsMapper: (args) => mapGetServiceInput(args.input),
      useCase: mod.getService,
      responseMapper: (output) => output,
    })
```

- [ ] **Step 6: Wire the bootstrap**

In `bootstrap.ts`, add the performer repository to `adapters` and the projection to `useCases`:

```ts
  const performerReadRepository = new DrizzlePerformerReadRepository();
  return {
    adapters: { categoryReadRepository, serviceReadRepository, performerReadRepository },
    useCases: {
      listCategories: new ListCategoriesProjection(categoryReadRepository),
      listServices: new ListServicesProjection(serviceReadRepository),
      getService: new GetServiceProjection(serviceReadRepository, performerReadRepository),
    },
  };
```

Update the return type's `adapters` shape to include `performerReadRepository: DrizzlePerformerReadRepository`.

- [ ] **Step 7: Run the tests and typecheck**

Run: `cd packages/backend && bunx tsc --noEmit && bun test src/modules/ntizo/public/catalog`
Expected: no typecheck output; all tests pass.

- [ ] **Step 8: Boot the API and query it for real**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd apps/backend/api && bun run dev
```

In another shell, with any published service id:

```bash
curl -s localhost:8788/public/graphql -H 'Content-Type: application/json' \
  -d '{"query":"{ serviceById(input:{id:\"<ID>\",locale:\"pt-MZ\"}) { name options { name amountMinor } performers { firstName } } }"}'
```

Expected: the service, its options cheapest-first, and its performers. A `null` means the id is not a published service of an active provider.

- [ ] **Step 9: Commit**

```bash
git add packages/backend/src/modules/ntizo/public/catalog/
git commit -m "feat(catalog): serviceById on the public schema"
```

---

### Task 7: Frontend data and route

First point the page is reachable in a browser.

**Files:**
- Create: `apps/frontend/web/src/features/directory/services/data/service-detail.repository.ts`
- Create: `apps/frontend/web/src/features/directory/services/viewmodel/use-service-detail.ts`
- Create: `apps/frontend/web/src/features/directory/services/ui/service-detail-page.tsx`
- Create: `apps/frontend/web/src/routes/services.$id.tsx`
- Create: `apps/frontend/web/src/features/directory/services/data/__tests__/service-detail.repository.test.ts`

**Interfaces:**
- Consumes: `publicGraphql`, `ServiceDetailDTO`.
- Produces: `SERVICE_DETAIL_FIELDS`, `serviceDetailQueries.byId({ id, locale })`, `useServiceDetail(id)`, `prefetchServiceDetail(queryClient, id)`, `ServiceDetailPage({ id })`.

- [ ] **Step 1: Write the failing selection-set test**

```ts
import { describe, expect, it } from "vitest";
import { SERVICE_DETAIL_FIELDS } from "@/features/directory/services/data/service-detail.repository";

/**
 * The one defect no other test in this app can catch.
 *
 * Every render test builds a complete fixture and every repository test
 * replaces the transport, so a field missing from the selection set is
 * invisible to all of them. The server does not object either: an unrequested
 * field is absent, not an error, and `undefined` renders as nothing.
 */
const READ_BY_THE_PAGE = [
  "id", "name", "description", "imageUrls",
  "providerName", "providerSlug", "providerLogoUrl", "providerCity",
  "categoryName", "locationType", "bookingMode",
  "options", "amountMinor", "isDefault",
  "performers", "firstName", "avatarUrl",
];

describe("the service detail query", () => {
  it.each(READ_BY_THE_PAGE)("asks the server for %s", (field) => {
    expect(SERVICE_DETAIL_FIELDS).toContain(field);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/services/data/__tests__/service-detail.repository.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Write the repository**

```ts
import { queryOptions } from "@tanstack/react-query";
import type { ServiceDetailDTO } from "@ntizo/shared/read-models";
import { publicGraphql } from "@/shared/lib/graphql/public-graphql";

/** Its own exported constant so a test can assert the page's fields are in it. */
export const SERVICE_DETAIL_FIELDS = `
  id providerId providerName providerSlug providerType providerLogoUrl
  providerCity providerDistrict categoryCode categoryName
  name description locationType bookingMode imageUrls isFallback
  options { id name amountMinor currency durationMinutes minMinutes stepMinutes pricingMode isDefault }
  performers { id firstName avatarUrl }`;

const BY_ID = `
  query ServiceById($input: ServiceByIdInput!) {
    serviceById(input: $input) {${SERVICE_DETAIL_FIELDS}
    }
  }`;

export const serviceDetailQueries = {
  byId: (input: { id: string; locale: string }) =>
    queryOptions({
      // The locale is part of the key: the same service in two languages is
      // two different payloads, and sharing a key would serve one under the
      // other's heading.
      queryKey: ["public", "service-detail", input.id, input.locale] as const,
      queryFn: async (): Promise<ServiceDetailDTO | null> => {
        const d = await publicGraphql<{ serviceById: ServiceDetailDTO | null }>(BY_ID, {
          input: { id: input.id, locale: input.locale },
        });
        return d.serviceById;
      },
    }),
};
```

If the generated input type is not `ServiceByIdInput`, run the API and check `curl -s localhost:8788/public/graphql -H 'Content-Type: application/json' -d '{"query":"{__schema{queryType{fields{name args{name type{name ofType{name}}}}}}}"}'`, then correct the name.

- [ ] **Step 4: Write the viewmodel**

```ts
import { useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ServiceDetailDTO } from "@ntizo/shared/read-models";
import i18n from "@/shared/lib/i18n";
import { serviceDetailQueries } from "@/features/directory/services/data/service-detail.repository";

/**
 * `useSuspenseQuery`, like the browse and for the same reason: this page is
 * server-rendered so a crawler finds the service in the HTML. A plain
 * `useQuery` renders its loading state on the server and ships a page with
 * nothing in it — the one outcome a page built to rank must not have.
 */
export function useServiceDetail(id: string): ServiceDetailDTO | null {
  const { i18n: instance } = useTranslation();
  const locale = instance.resolvedLanguage ?? instance.language;
  const { data } = useSuspenseQuery(serviceDetailQueries.byId({ id, locale }));
  return data;
}

export function prefetchServiceDetail(
  queryClient: QueryClient,
  id: string,
): Promise<ServiceDetailDTO | null> {
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return queryClient.ensureQueryData(serviceDetailQueries.byId({ id, locale }));
}
```

- [ ] **Step 5: Write the page shell**

```tsx
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/shared/components/site-header";
import { EmptyCard } from "@/shared/components/empty-card";
import { PackageX } from "lucide-react";
import { useServiceDetail } from "@/features/directory/services/viewmodel/use-service-detail";

/**
 * One service, in full.
 *
 * Two columns on a wide screen: what the service is on the left, what it costs
 * and when it can happen on the right. The right column is what the reader
 * came to act on, so it is the one that stays in view as the left one scrolls.
 */
export function ServiceDetailPage({ id }: { id: string }) {
  const { t } = useTranslation("directory");
  const service = useServiceDetail(id);

  if (!service) {
    return (
      <>
        <SiteHeader current="services" />
        <main className="page-shell py-12">
          <EmptyCard
            framed
            badge={PackageX}
            title={t("serviceNotFoundTitle")}
            body={t("serviceNotFoundBody")}
            action={
              <Link
                to="/services"
                className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                {t("serviceNotFoundAction")}
              </Link>
            }
          />
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader current="services" />
      <main className="page-shell py-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
          <div className="min-w-0">
            <h1 className="type-h1">{service.name}</h1>
            <p className="type-body mt-2 text-[var(--color-muted-foreground)]">
              {[service.categoryName, service.providerCity].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="lg:sticky lg:top-4" />
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 6: Write the route**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { ServiceDetailPage } from "@/features/directory/services/ui/service-detail-page";
import { prefetchServiceDetail } from "@/features/directory/services/viewmodel/use-service-detail";

/**
 * One service's public page, at `/services/<id>`.
 *
 * A sibling of `services.index.tsx`, not a child: that file's own comment
 * explains why it carries the `.index` suffix, and this is the route it was
 * protecting the browse from becoming a layout for.
 *
 * `ssr: true` and deliberately not prerendered — a service frozen at build
 * time goes stale the moment its provider edits a price.
 */
export const Route = createFileRoute("/services/$id")({
  ssr: true,
  loader: ({ context, params }) => prefetchServiceDetail(context.queryClient, params.id),
  head: ({ loaderData }) => {
    const s = loaderData ?? null;
    if (!s) return { meta: [{ title: "Ntizo" }] };
    const place = [s.providerCity, s.providerDistrict].filter(Boolean).join(", ");
    return {
      meta: [
        { title: `${s.name} · ${s.providerName} · Ntizo` },
        {
          name: "description",
          content: s.description?.slice(0, 155) ?? `${s.name}${place ? ` — ${place}` : ""}.`,
        },
      ],
    };
  },
  component: ServiceDetail,
});

function ServiceDetail() {
  const { id } = Route.useParams();
  return <ServiceDetailPage id={id} />;
}
```

- [ ] **Step 7: Add the four locale keys**

Add `serviceNotFoundTitle`, `serviceNotFoundBody`, `serviceNotFoundAction` to `directory.json` in all 8 locales. English: "Service not found" / "This service may have been removed, or the link is wrong." / "Browse services". Translate for the other seven.

- [ ] **Step 8: Regenerate the route tree, typecheck, test**

Run: `cd apps/frontend/web && bunx vite build && bun run typecheck 2>&1 | grep -v "provider/availability" && bunx vitest run src/features/directory src/shared/lib/__tests__/i18n-parity.test.ts`
Expected: `/services/$id` appears in `src/routeTree.gen.ts`; typecheck clean; tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(services): a public page for one service"
```

---

### Task 8: Gallery, provider card, performers

**Files:**
- Create: `apps/frontend/web/src/features/directory/services/ui/service-gallery.tsx`
- Create: `apps/frontend/web/src/features/directory/services/ui/service-provider-card.tsx`
- Create: `apps/frontend/web/src/features/directory/services/ui/service-performers.tsx`
- Modify: `apps/frontend/web/src/features/directory/services/ui/service-detail-page.tsx`

**Interfaces:**
- Consumes: `ServiceDetailDTO`.
- Produces: `ServiceGallery({ images, alt })`, `ServiceProviderCard({ service })`, `ServicePerformers({ performers })`.

- [ ] **Step 1: Build the gallery**

One large image with the rest as thumbnails beneath; clicking a thumbnail promotes it. With no images, render nothing at all rather than a grey box — an empty frame says the service has no photo more loudly than its absence does.

```tsx
import { useState } from "react";
import { cn } from "@ntizo/frontend-ui";

export function ServiceGallery({ images, alt }: { images: readonly string[]; alt: string }) {
  const [active, setActive] = useState(0);
  if (images.length === 0) return null;
  const main = images[active] ?? images[0]!;
  return (
    <div className="grid gap-3">
      <img
        src={main}
        alt={alt}
        className="aspect-[4/3] w-full rounded-[var(--radius-card)] object-cover"
      />
      {images.length > 1 && (
        <ul className="flex list-none gap-2 overflow-x-auto p-0">
          {images.map((src, i) => (
            <li key={src}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`${alt} ${i + 1}`}
                aria-current={i === active}
                className={cn(
                  "block h-16 w-20 overflow-hidden rounded-[var(--radius-card-sm)] border-2 transition-colors",
                  i === active ? "border-[var(--color-primary)]" : "border-transparent",
                )}
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build the provider card**

Logo, name, type, and a link to `/providers/$slug`. No verification tick — see the spec's own section on why it is omitted rather than faked.

- [ ] **Step 3: Build the performers list**

First name and avatar per performer, falling back to a monogram (`initialsFrom` in `@/shared/lib/initials`) when `avatarUrl` is null. Render nothing when the list is empty or has one entry — one performer is not a roster, and "who will do this" with a single answer is noise on the page.

- [ ] **Step 4: Compose them into the page**

Left column: gallery, title, meta line, description, performers. Right column: provider card.

- [ ] **Step 5: Typecheck and lint**

Run: `cd apps/frontend/web && bun run typecheck 2>&1 | grep -v "provider/availability" && bunx eslint src/features/directory`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src/features/directory/services/ui
git commit -m "feat(services): the gallery, the business and who performs it"
```

---

### Task 9: The package chooser

**Files:**
- Create: `apps/frontend/web/src/features/directory/services/ui/package-chooser.tsx`
- Create: `apps/frontend/web/src/features/directory/services/ui/__tests__/package-chooser.test.tsx`
- Modify: `apps/frontend/web/src/features/directory/services/ui/service-detail-page.tsx`

**Interfaces:**
- Consumes: `bookingTotal`, `NTIZO_COMMISSION_RATE`, `formatAmount`, `ServiceDetailOptionDTO`.
- Produces: `PackageChooser({ options, locale, onSelect })`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackageChooser } from "../package-chooser";

const opt = (over = {}) => ({
  id: "o1", name: "Cerimónia", amountMinor: 35000, currency: "MZN",
  durationMinutes: 60, minMinutes: null, stepMinutes: null,
  pricingMode: "fixed", isDefault: false, ...over,
});

describe("PackageChooser", () => {
  it("selects the provider's default package on arrival", () => {
    render(<PackageChooser locale="pt-MZ" options={[
      opt(), opt({ id: "o2", name: "Dia completo", amountMinor: 85000, isDefault: true }),
    ]} />);
    expect(screen.getByRole("radio", { name: /Dia completo/ })).toBeChecked();
  });

  it("falls back to the cheapest when none is marked default", () => {
    render(<PackageChooser locale="pt-MZ" options={[
      opt({ id: "o1", amountMinor: 35000 }), opt({ id: "o2", name: "Dia", amountMinor: 85000 }),
    ]} />);
    expect(screen.getByRole("radio", { name: /Cerimónia/ })).toBeChecked();
  });

  it("recalculates the total when another package is chosen", async () => {
    // The whole point of the component: a chooser whose total does not follow
    // the choice is worse than no total at all.
    render(<PackageChooser locale="pt-MZ" options={[
      opt({ amountMinor: 50000, isDefault: true }),
      opt({ id: "o2", name: "Dia completo", amountMinor: 85000 }),
    ]} />);
    await userEvent.click(screen.getByRole("radio", { name: /Dia completo/ }));
    // 850 + 85 = 935. Asserted on digits so the currency format is not the test.
    expect(screen.getByTestId("booking-total").textContent).toMatch(/935/);
  });

  it("renders nothing at all with no packages", () => {
    // A quote service. An empty chooser with a 0,00 total would invite
    // somebody to book a price the provider has not set.
    const { container } = render(<PackageChooser locale="pt-MZ" options={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/services/ui/__tests__/package-chooser.test.tsx`
Expected: FAIL — cannot resolve `../package-chooser`.

- [ ] **Step 3: Implement**

A `radiogroup` of options, then the three-line breakdown from `bookingTotal` (package, commission labelled with the rate, total), then the Reservar button. Initial selection: the option with `isDefault`, else the first — which is the cheapest, since the server orders them that way. Give the total `data-testid="booking-total"`. The button is disabled with a note that bookings are not open yet; wire that copy from `directory.json`.

- [ ] **Step 4: Run it and watch it pass**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/services/ui/__tests__/package-chooser.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add locale keys in 8 locales**

`packagesTitle`, `packagePrice`, `packageCommission` (with `{{rate}}`), `packageTotal`, `packageBook`, `packageBookingsClosed`, `packageContactProvider`.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(services): choose a package and see what it costs"
```

---

### Task 10: Availability, and performers by name

**Files:**
- Modify: `apps/frontend/web/src/features/directory/availability/ui/member-picker.tsx`
- Modify: `apps/frontend/web/src/features/directory/services/ui/service-detail-page.tsx`

**Interfaces:**
- Consumes: `AvailabilitySheet` (unchanged), `ServicePerformerDTO`.
- Produces: `MemberPicker` gains an optional `performers` prop.

- [ ] **Step 1: Give `MemberPicker` real names**

Add `performers?: readonly { id: string; firstName: string }[]`. When a performer matches the id, label the button with their first name; when none matches, keep the numbered fallback. Replace the doc comment — it currently states the platform deliberately does not publish these names, which stopped being true on 2026-08-13. Say what changed and why the numbered fallback survives (a member whose profile has no first name).

- [ ] **Step 2: Mount the availability sheet on the page**

Reuse `AvailabilitySheet` exactly as `services-section.tsx` does, passing the service and the performers.

- [ ] **Step 3: Run the availability tests**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory`
Expected: PASS. If a `member-picker` test asserts the numbered labels, update it to cover both paths.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/web/src/features/directory
git commit -m "feat(services): when it can happen, and who by name"
```

---

### Task 11: The placeholder sections

Ratings, reviews, service radius and cancellation policy. No backend exists for any of them.

**Files:**
- Create: `apps/frontend/web/src/features/directory/services/ui/service-detail-placeholders.tsx`
- Modify: `apps/frontend/web/src/features/directory/services/ui/service-detail-page.tsx`

**Interfaces:**
- Produces: `ServiceRating()`, `ServiceReviews()`, `ServiceFacts()`.

- [ ] **Step 1: Write the module with its warning at the top**

```tsx
/**
 * ⚠️ EVERYTHING IN THIS FILE IS INVENTED.
 *
 * There is no Review context, no Booking context, no service radius and no
 * cancellation policy in Ntizo. These sections exist so the page can be seen
 * whole before those are built, and they were deliberately shipped without a
 * flag separating them from the real sections around them (decision,
 * 2026-08-13).
 *
 * That means: on a page that also names a real business, a real price and a
 * real address, "4.3 · 130 avaliações" is a claim about that business that
 * nobody made.
 *
 * Delete this file and its three call sites before the first real provider is
 * onboarded. `docs/superpowers/follow-ups.md` entry 43 carries the trigger.
 */
```

Then the three components, rendering the mockup's content.

- [ ] **Step 2: Mount them on the page**

Rating under the title; reviews below the description; facts (duration, area, cancellation) as the description card's footer row.

- [ ] **Step 3: Typecheck and lint**

Run: `cd apps/frontend/web && bun run typecheck 2>&1 | grep -v "provider/availability" && bunx eslint src/features/directory`

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/web/src/features/directory/services/ui
git commit -m "feat(services): placeholder ratings and reviews, marked as such"
```

---

### Task 12: Point the browse at the new page

The reason the page exists.

**Files:**
- Modify: `apps/frontend/web/src/features/directory/services/ui/browse-service-card.tsx`
- Modify: `apps/frontend/web/src/features/directory/services/ui/service-card.tsx`

- [ ] **Step 1: Change the browse card's link**

`to="/providers/$slug" params={{ slug: service.providerSlug }}` becomes `to="/services/$id" params={{ id: service.id }}`. Update the component's doc comment — it currently explains at length that the card leads to the provider page *because* the availability flow lives there, which stops being the reason once this page exists.

- [ ] **Step 2: Run the whole frontend suite**

Run: `cd apps/frontend/web && bun run typecheck 2>&1 | grep -v "provider/availability" && bun run test`
Expected: typecheck clean; every test file passes.

- [ ] **Step 3: See it in a browser**

Start both servers, open `localhost:3000/services`, click a card, confirm it lands on the service and the total follows the package choice.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/web/src/features/directory/services/ui
git commit -m "feat(services): the browse links to the service, not the business"
```

---

## Self-review

**Spec coverage.** Every section of the spec maps to a task: two queries (6, 7), `getService` returning null (5), the detail read model (2), option name fallback (5), performers and the port (3, 5, 10), the omitted verification badge (8, step 2), composition (7–11), commission arithmetic (1), the arg mapper's own history (6), and the tests the spec names (1, 5, 7, 9).

**Placeholder scan.** Tasks 8, 9, 10, 11 and 12 describe some steps in prose rather than full code — the components there are straightforward composition over interfaces fully specified in earlier tasks, and their tests are given in full where behaviour is non-obvious (Task 9). Every type, function and prop named in a later task is defined in an earlier one.

**Type consistency.** `ServiceDetailDTO`, `ServiceDetailOptionDTO` and `ServicePerformerDTO` are defined in Task 2 and used unchanged in 5, 7, 9, 10. `bookingTotal` returns `{ packageMinor, commissionMinor, totalMinor }` in Task 1 and is consumed with those names in Task 9. `PerformerReadPort.byMemberIds` is defined in Task 3 and called with that name in Tasks 5 and 6. `getPublishedById` is defined in Task 4 and called in Task 5.

**Known risk carried forward.** Task 4 assumes the provider table's columns are `logoKey`, `addressCity`, `addressDistrict`; step 3 of that task says to verify and correct. Task 7 assumes the generated GraphQL input type is `ServiceByIdInput`; step 3 says how to check.
