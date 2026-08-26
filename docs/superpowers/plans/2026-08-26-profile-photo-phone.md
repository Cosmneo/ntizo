# Profile photo, phone and timezone — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person change their phone number, upload a profile photo, keep the one Google already gave us, and set their timezone.

**Architecture:** The domain `Profile` already holds `phoneNumber` and `avatarUrl`; this adds `avatarKey` beside them so an uploaded photo (an R2 key, resolved per stage) and a Google photo (an absolute URL) can coexist with the key winning. The phone is pushed to the better-auth identity through a single named adapter so the two never disagree. Nothing about Google's OAuth mapping changes — `better_auth.user.image` has been populated all along.

**Tech Stack:** Bun, Hono on Cloudflare Workers, Drizzle + postgres.js, better-auth 1.6.2, GraphQL via onion-lasagna, React + TanStack Router/Query/Form, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-26-profile-photo-phone-design.md`

## Global Constraints

- Every new domain exception extends a kit error type (`ConflictError`, `UnprocessableError`, `NotFoundError` from `@cosmneo/onion-lasagna`). A plain `Error` with a `code` property compiles and then reaches the browser as "An unexpected error occurred".
- `code` strings on exceptions are a public contract — the web client branches on them.
- Phone numbers are stored in E.164 (`+258841234567`) and nowhere else, in both `ntizo_user.profile` and `better_auth.user`.
- The user bounded context reads and writes its own tables only. The single exception is the adapter built in Task 4, which is the only file in the context permitted to touch `better_auth.*`.
- Images: `image/jpeg`, `image/png`, `image/webp` only — never SVG — and at most 5 MB. Enforced server-side regardless of what the client checks.
- `updateMe` semantics: an absent key means "leave alone", an explicit `null` means "clear". Never collapse the two.
- Run commands from the repo root unless a step says otherwise. Package test commands: `bun test src` in `packages/backend` and `apps/backend/api`, `vitest run` in `packages/frontend`, `playwright test` in `apps/e2e`.

---

### Task 1: The middleware test that never reached its assertion

`apps/backend/api/src/__tests__/wait-until.test.ts` fails on `dev` and therefore on this branch. Its fake Hono context is `{ env, executionCtx }` with no `req`, and `configMiddleware` reads `c.req.header("accept-language")` before it reaches anything the test asserts. The test dies with `undefined is not an object (evaluating 'c.req.header')` — so the behaviour it exists to protect has been unprotected since the `Accept-Language` read was added.

Task 8 adds a second header read to that same middleware. Fixing this first means that change lands on a test that can actually fail for the right reason.

**Files:**
- Modify: `apps/backend/api/src/__tests__/wait-until.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. This is a repair.

- [ ] **Step 1: Run the failing test to see the current failure**

```bash
cd apps/backend/api && bun test src/__tests__/wait-until.test.ts
```

Expected: 3 pass, 1 fail — `closes behind deferred work even when what it wraps rejects`, with `Received message: "undefined is not an object (evaluating 'c.req.header')"`.

- [ ] **Step 2: Give the fake context a request**

In `apps/backend/api/src/__tests__/wait-until.test.ts`, find the failing test's context construction:

```ts
    const { ctx, scheduled } = fakeExecutionContext();
    const c = { env: ENV, executionCtx: ctx } as unknown as Parameters<
      typeof configMiddleware
    >[0];
```

Replace it with:

```ts
    const { ctx, scheduled } = fakeExecutionContext();
    // `req` is not optional decoration: `configMiddleware` reads
    // `c.req.header("accept-language")` before it reaches anything this test
    // asserts, so without it the middleware throws a TypeError and the
    // rejection this test is checking for is never the one it sees. The other
    // tests in this file go through a real Hono app and get a real `req`.
    const c = { env: ENV, executionCtx: ctx, req: { header: () => undefined } } as unknown as Parameters<
      typeof configMiddleware
    >[0];
```

- [ ] **Step 3: Run the test and verify it passes for the right reason**

```bash
cd apps/backend/api && bun test src/__tests__/wait-until.test.ts
```

Expected: 4 pass, 0 fail. If the fixed test now fails on its `order` assertion rather than passing, stop and report — that would mean it is catching a real ordering bug that was hidden behind the TypeError.

- [ ] **Step 4: Verify the whole suite is green**

```bash
bun run test
```

Expected: 5 tasks successful, 0 failures. This is the clean baseline every later task is measured against.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/api/src/__tests__/wait-until.test.ts
git commit -m "fix(api): the pool-ordering test died before it could assert anything"
```

---

### Task 2: `avatar_key` on the profile

**Files:**
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/user/schemas/profile.schema.ts`
- Create: a generated migration under `packages/backend/src/modules/ntizo/shared/infrastructure/migrations/`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/user/domain/aggregates/profile.aggregate.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/user/infrastructure/repositories/drizzle-profile.repository.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/user/domain/aggregates/__tests__/profile.aggregate.test.ts` (create — there is no profile aggregate test today, only `user.aggregate.test.ts` and `payment-method.test.ts`)

**Interfaces:**
- Consumes: nothing.
- Produces: `ProfileProps.avatarKey: string | null`; `Profile.avatarKey` getter; `Profile.updateContact({ phoneNumber?, bio?, avatarUrl?, avatarKey? })`; `Profile.create({ userId, firstName, lastName, displayName?, language?, timezone?, avatarUrl? })`.

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/modules/ntizo/bounded-contexts/user/domain/aggregates/__tests__/profile.aggregate.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Profile } from "../profile.aggregate";

const base = { userId: "u1", firstName: "Ana", lastName: "Sitoe" };

describe("Profile avatars", () => {
  it("is created with neither an avatar key nor an avatar url", () => {
    const profile = Profile.create(base);
    expect(profile.avatarKey).toBeNull();
    expect(profile.avatarUrl).toBeNull();
  });

  it("accepts an avatar url at creation, for the one Google supplies", () => {
    const profile = Profile.create({ ...base, avatarUrl: "https://lh3.googleusercontent.com/a/x" });
    expect(profile.avatarUrl).toBe("https://lh3.googleusercontent.com/a/x");
    // The key stays null: a Google photo is not ours and has no R2 key.
    expect(profile.avatarKey).toBeNull();
  });

  it("accepts a timezone at creation, and falls back to UTC without one", () => {
    expect(Profile.create({ ...base, timezone: "Africa/Maputo" }).timezone).toBe("Africa/Maputo");
    expect(Profile.create(base).timezone).toBe("UTC");
  });

  it("sets and clears the avatar key without disturbing the url", () => {
    const profile = Profile.create({ ...base, avatarUrl: "https://lh3.googleusercontent.com/a/x" });

    profile.updateContact({ avatarKey: "avatar/u1/1730000000000" });
    expect(profile.avatarKey).toBe("avatar/u1/1730000000000");
    expect(profile.avatarUrl).toBe("https://lh3.googleusercontent.com/a/x");

    profile.updateContact({ avatarKey: null });
    expect(profile.avatarKey).toBeNull();
    expect(profile.avatarUrl).toBe("https://lh3.googleusercontent.com/a/x");
  });

  it("leaves the avatar key alone when the key is absent from the update", () => {
    const profile = Profile.create(base);
    profile.updateContact({ avatarKey: "avatar/u1/1" });
    profile.updateContact({ bio: "Electrician" });
    expect(profile.avatarKey).toBe("avatar/u1/1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/user/domain/aggregates/__tests__/profile.aggregate.test.ts
```

Expected: FAIL — `profile.avatarKey` is not a function/property, and `Profile.create` rejects `avatarUrl`.

- [ ] **Step 3: Add the field to the aggregate**

In `profile.aggregate.ts`, add to `ProfileProps` immediately after `avatarUrl`:

```ts
  /**
   * The R2 key of a photo this person uploaded, or null.
   *
   * Separate from `avatarUrl` because the two have different shapes and
   * different owners: Google hands over an absolute URL on a host we do not
   * control, and an upload of ours produces a key whose URL is composed at
   * read time from the stage's own media base. Storing that composed URL
   * would put one stage's hostname into the database.
   *
   * The key wins when both are set, so a photo somebody chose is never
   * displaced by a later Google sign-in.
   */
  avatarKey: string | null;
```

Extend `create`'s parameter type and body:

```ts
  static create(params: {
    userId: string;
    firstName: string;
    lastName: string;
    displayName?: string;
    language?: Locale;
    timezone?: string;
    /** Google's, at sign-up. Never one of ours — an upload cannot exist yet. */
    avatarUrl?: string | null;
  }): Profile {
```

In the object it returns, replace `avatarUrl: null,` with:

```ts
      avatarUrl: params.avatarUrl ?? null,
      avatarKey: null,
```

Add the getter after `avatarUrl`'s:

```ts
  get avatarKey() {
    return this.props.avatarKey;
  }
```

Extend `updateContact`:

```ts
  updateContact(params: {
    phoneNumber?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    avatarKey?: string | null;
  }): void {
    if (params.phoneNumber !== undefined)
      this.props.phoneNumber = params.phoneNumber;
    if (params.bio !== undefined) this.props.bio = params.bio;
    if (params.avatarUrl !== undefined)
      this.props.avatarUrl = params.avatarUrl;
    if (params.avatarKey !== undefined)
      this.props.avatarKey = params.avatarKey;
    this.props.updatedAt = new Date();
  }
```

`timezone` already reads `params.timezone ?? "UTC"` in `create` — leave it.

- [ ] **Step 4: Run the aggregate test to verify it passes**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/user/domain/aggregates/__tests__/profile.aggregate.test.ts
```

Expected: 5 pass.

- [ ] **Step 5: Add the column to the drizzle schema**

In `packages/backend/src/modules/ntizo/shared/infrastructure/database/user/schemas/profile.schema.ts`, after the `avatarUrl` line:

```ts
  /**
   * An R2 key, not a URL. `mediaUrl()` composes the URL at read time from the
   * stage's `MEDIA_PUBLIC_URL_BASE`, which differs per stage — locally it
   * points at this Worker. Same convention as `provider.logo_key`.
   */
  avatarKey: text("avatar_key"),
```

- [ ] **Step 6: Generate the migration**

```bash
cd packages/backend && bun db:ntizo:generate
```

Expected: a new `.sql` file under `src/modules/ntizo/shared/infrastructure/migrations/` containing `ALTER TABLE "ntizo_user"."profile" ADD COLUMN "avatar_key" text;`, plus its snapshot and a `_journal.json` entry. Read the generated SQL and confirm it adds only that column — if drizzle proposes dropping or renaming anything, stop and report.

- [ ] **Step 7: Carry the column through the repository**

In `drizzle-profile.repository.ts`, add `avatarKey: row.avatarKey,` to the `Profile.rehydrate({...})` object (after `avatarUrl`), and `avatarKey: json.avatarKey,` to **both** the `.values({...})` and the `.onConflictDoUpdate({ set: {...} })` objects (after `avatarUrl` in each).

Missing the `set` half is the failure mode to watch for: inserts would carry the key and updates would silently drop it, so an uploaded photo would appear once and vanish on the next save.

- [ ] **Step 8: Verify the package compiles and its tests pass**

```bash
cd packages/backend && bun run typecheck && bun test src
```

Expected: no type errors, all tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/backend/src/modules/ntizo
git commit -m "feat(user): a place for a photo somebody chose, beside the one Google gave"
```

---

### Task 3: The phone number, validated in the domain

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/user/domain/value-objects/phone-number.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/user/domain/exceptions/index.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/user/domain/value-objects/__tests__/phone-number.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizePhoneNumber(raw: string): string`; `InvalidPhoneNumberError`; `PhoneNumberAlreadyInUseError`.

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/modules/ntizo/bounded-contexts/user/domain/value-objects/__tests__/phone-number.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { normalizePhoneNumber } from "../phone-number";
import { InvalidPhoneNumberError } from "../../exceptions";

describe("normalizePhoneNumber", () => {
  it("returns E.164 unchanged when it already is", () => {
    expect(normalizePhoneNumber("+258841234567")).toBe("+258841234567");
  });

  it("strips punctuation and spacing", () => {
    // The unique index compares strings. "+258 84 123 4567" stored verbatim
    // would sit beside "+258841234567" as a second row for one phone.
    expect(normalizePhoneNumber("+258 84 123 4567")).toBe("+258841234567");
  });

  it("refuses a national number with no country code", () => {
    expect(() => normalizePhoneNumber("841234567")).toThrow(InvalidPhoneNumberError);
  });

  it("refuses junk", () => {
    expect(() => normalizePhoneNumber("not a phone")).toThrow(InvalidPhoneNumberError);
  });

  it("does not put the number itself in the error message", () => {
    // Error messages reach logs. A phone number is the person.
    try {
      normalizePhoneNumber("+258000");
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain("258000");
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/user/domain/value-objects
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Add the exceptions**

In `packages/backend/src/modules/ntizo/bounded-contexts/user/domain/exceptions/index.ts`, change the import line to:

```ts
import { ConflictError, NotFoundError, UnprocessableError } from "@cosmneo/onion-lasagna";
```

and append:

```ts
/**
 * Deliberately does not name the number it rejected.
 *
 * Error messages end up in logs, and a phone number is not a detail about a
 * request — it is the person making it. The caller supplied the value and
 * does not need it read back.
 */
export class InvalidPhoneNumberError extends UnprocessableError {
  constructor() {
    super({
      message: "Phone number must be in international format, for example +258841234567.",
      code: "INVALID_PHONE_NUMBER",
    });
    this.name = "InvalidPhoneNumberError";
  }
}

/**
 * One number, one account.
 *
 * Enforced by the unique index on `better_auth.user.phone_number`, which is
 * what an SMS is ultimately delivered against: two accounts sharing a number
 * means a code sent to one arriving for the other.
 */
export class PhoneNumberAlreadyInUseError extends ConflictError {
  constructor() {
    super({
      message: "That phone number is already in use by another account.",
      code: "PHONE_NUMBER_ALREADY_IN_USE",
    });
    this.name = "PhoneNumberAlreadyInUseError";
  }
}
```

- [ ] **Step 4: Write the normaliser**

Create `packages/backend/src/modules/ntizo/bounded-contexts/user/domain/value-objects/phone-number.ts`:

```ts
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { InvalidPhoneNumberError } from "../exceptions";

/**
 * A phone number, in the one form the platform stores.
 *
 * The better-auth module has `normalizeSignUpPhoneNumber`, which parses the
 * same way and throws better-auth's `APIError`. It is not reused here: a
 * domain value object that imports an auth framework's HTTP error type cannot
 * be tested or reasoned about without that framework. The duplication is one
 * call; the coupling avoided is larger.
 *
 * Parsed with no default country, so a bare national number is refused. There
 * is no country to default to — the platform is not Mozambique-only, and
 * guessing one would silently turn a Portuguese number into a Mozambican one.
 */
export function normalizePhoneNumber(raw: string): string {
  const parsed = parsePhoneNumberFromString(raw);
  if (!parsed?.isValid()) throw new InvalidPhoneNumberError();
  // `.number` is the E.164 form — punctuation and spacing gone.
  return parsed.number;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/user/domain/value-objects
```

Expected: 5 pass.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/user/domain
git commit -m "feat(user): one shape for a phone number, and two ways to refuse one"
```

---

### Task 4: The auth identity port and its adapter

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/user/app/ports/outbound/auth-identity.port.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/user/app/ports/outbound/index.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/user/infrastructure/adapters/better-auth-identity.adapter.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/user/infrastructure/adapters/__tests__/better-auth-identity.adapter.test.ts` (create)

**Interfaces:**
- Consumes: `PhoneNumberAlreadyInUseError` (Task 3).
- Produces: `AuthIdentityPort { setPhoneNumber(userId: string, phoneNumber: string | null): Promise<void> }`; `BetterAuthIdentityAdapter`, whose constructor takes an optional `update` function so the test can drive it without a database.

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/modules/ntizo/bounded-contexts/user/infrastructure/adapters/__tests__/better-auth-identity.adapter.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { BetterAuthIdentityAdapter } from "../better-auth-identity.adapter";
import { PhoneNumberAlreadyInUseError } from "../../../domain/exceptions";

describe("BetterAuthIdentityAdapter", () => {
  it("writes the number and clears the verified flag in one update", async () => {
    const calls: { userId: string; phoneNumber: string | null; verified: boolean }[] = [];
    const adapter = new BetterAuthIdentityAdapter(async (userId, phoneNumber, verified) => {
      calls.push({ userId, phoneNumber, verified });
    });

    await adapter.setPhoneNumber("u1", "+258841234567");

    // One call, not two: a second statement is one crash away from a number
    // nobody verified carrying a verified flag.
    expect(calls).toEqual([{ userId: "u1", phoneNumber: "+258841234567", verified: false }]);
  });

  it("clears the number when given null", async () => {
    const calls: (string | null)[] = [];
    const adapter = new BetterAuthIdentityAdapter(async (_id, phoneNumber) => {
      calls.push(phoneNumber);
    });

    await adapter.setPhoneNumber("u1", null);

    expect(calls).toEqual([null]);
  });

  it("turns a unique violation into a domain error", async () => {
    const adapter = new BetterAuthIdentityAdapter(async () => {
      throw Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
      });
    });

    await expect(adapter.setPhoneNumber("u1", "+258841234567")).rejects.toBeInstanceOf(
      PhoneNumberAlreadyInUseError,
    );
  });

  it("lets any other database error through untouched", async () => {
    const adapter = new BetterAuthIdentityAdapter(async () => {
      throw Object.assign(new Error("connection terminated"), { code: "57P01" });
    });

    await expect(adapter.setPhoneNumber("u1", "+258841234567")).rejects.toThrow(
      "connection terminated",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/user/infrastructure/adapters
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the port**

Create `packages/backend/src/modules/ntizo/bounded-contexts/user/app/ports/outbound/auth-identity.port.ts`:

```ts
/**
 * The user's login identity, as far as this context needs to touch it.
 *
 * A port rather than a direct write because the auth identity lives in another
 * module's tables. The use case depends on this interface and knows nothing
 * about better-auth; exactly one adapter knows, and says so.
 */
export interface AuthIdentityPort {
  /**
   * Writes the number onto the auth identity and clears its verified flag.
   *
   * Both in one statement, always: a number and a stale "verified" belong to
   * different phones the moment they are written separately and something
   * fails in between.
   *
   * @param phoneNumber E.164, or null to release the number.
   * @throws {PhoneNumberAlreadyInUseError} when another account holds it.
   */
  setPhoneNumber(userId: string, phoneNumber: string | null): Promise<void>;
}
```

Add to `packages/backend/src/modules/ntizo/bounded-contexts/user/app/ports/outbound/index.ts`:

```ts
export * from "./auth-identity.port";
```

- [ ] **Step 4: Write the adapter**

Create `packages/backend/src/modules/ntizo/bounded-contexts/user/infrastructure/adapters/better-auth-identity.adapter.ts`:

```ts
import { eq } from "drizzle-orm";
import type { AuthIdentityPort } from "../../app/ports/outbound";
import { PhoneNumberAlreadyInUseError } from "../../domain/exceptions";
import { getDb } from "../../../../../better-auth/infrastructure/client/drizzle";
import { user as authUser } from "../../../../../better-auth/infrastructure/database/schema";

/**
 * The one file in the user context that writes better-auth's tables.
 *
 * The read repository is explicit about never touching them, and that rule
 * stands: this is an adapter, which is the layer where a boundary crossing is
 * allowed to be named and contained rather than spread through use cases. The
 * phone lives in two places because two systems need it — the profile shows
 * it, the auth identity authenticates against it — and something has to keep
 * them equal.
 */
type UpdateFn = (
  userId: string,
  phoneNumber: string | null,
  verified: boolean,
) => Promise<void>;

/** postgres.js surfaces a unique violation as SQLSTATE 23505 on the error. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}

export class BetterAuthIdentityAdapter implements AuthIdentityPort {
  /**
   * `update` is injectable so the error mapping can be tested without a
   * database. It defaults to the real write; nothing in production passes it.
   */
  constructor(
    private readonly update: UpdateFn = async (userId, phoneNumber, verified) => {
      await getDb()
        .update(authUser)
        .set({ phoneNumber, phoneNumberVerified: verified })
        .where(eq(authUser.id, userId));
    },
  ) {}

  async setPhoneNumber(userId: string, phoneNumber: string | null): Promise<void> {
    try {
      await this.update(userId, phoneNumber, false);
    } catch (error) {
      // Only this one is translated. Anything else is an infrastructure
      // failure and must not arrive at the browser dressed as a rejected
      // phone number.
      if (isUniqueViolation(error)) throw new PhoneNumberAlreadyInUseError();
      throw error;
    }
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/user/infrastructure/adapters
```

Expected: 4 pass.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/user
git commit -m "feat(user): keep the profile's phone and the login's phone equal"
```

---

### Task 5: `updateMe` writes the phone and the avatar key

**Files:**
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/user/app/ports/inbound/update-my-profile.command.port.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/user/app/use-cases/update-my-profile.command.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/user/bootstrap/index.ts`
- Modify: `packages/backend/src/modules/ntizo/write/user/graphql/schema/mutations.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/user/app/use-cases/__tests__/update-my-profile.command.test.ts` (create)

**Interfaces:**
- Consumes: `AuthIdentityPort` (Task 4), `normalizePhoneNumber` (Task 3), `Profile.updateContact({ avatarKey })` (Task 2).
- Produces: `UpdateMyProfileInput` gains `avatarKey?: string | null` and loses `avatarUrl`; `UpdateMyProfileCommand(profileRepo, unitOfWork, authIdentity)` — a third constructor argument.

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/modules/ntizo/bounded-contexts/user/app/use-cases/__tests__/update-my-profile.command.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { UpdateMyProfileCommand } from "../update-my-profile.command";
import { Profile } from "../../../domain/aggregates/profile.aggregate";
import { InvalidPhoneNumberError } from "../../../domain/exceptions";
import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";

const ctx = { requester: { userId: "u1", role: "customer" } } as unknown as ExecutionContext;

function harness(profile: Profile) {
  const saved: Profile[] = [];
  const identityCalls: (string | null)[] = [];
  const command = new UpdateMyProfileCommand(
    {
      findByUserId: async () => profile,
      save: async (p: Profile) => {
        saved.push(p);
      },
    } as never,
    { atomicExecute: async (fn: () => Promise<void>) => fn() } as never,
    {
      setPhoneNumber: async (_userId: string, phoneNumber: string | null) => {
        identityCalls.push(phoneNumber);
      },
    },
  );
  return { command, saved, identityCalls };
}

const base = { userId: "u1", firstName: "Ana", lastName: "Sitoe" };

describe("UpdateMyProfileCommand — phone", () => {
  it("normalises to E.164 and pushes the same string to the auth identity", async () => {
    const profile = Profile.create(base);
    const { command, identityCalls } = harness(profile);

    await command.execute(ctx, { phoneNumber: "+258 84 123 4567" });

    expect(profile.phoneNumber).toBe("+258841234567");
    // The same string in both places, or the unique index protects nothing.
    expect(identityCalls).toEqual(["+258841234567"]);
  });

  it("does not touch the auth identity when the number is unchanged", async () => {
    const profile = Profile.create(base);
    profile.updateContact({ phoneNumber: "+258841234567" });
    const { command, identityCalls } = harness(profile);

    // Saving the form without touching the phone must not clear a
    // verification the person already went through.
    await command.execute(ctx, { phoneNumber: "+258841234567", bio: "Electrician" });

    expect(identityCalls).toEqual([]);
    expect(profile.bio).toBe("Electrician");
  });

  it("clears the number in both places when given null", async () => {
    const profile = Profile.create(base);
    profile.updateContact({ phoneNumber: "+258841234567" });
    const { command, identityCalls } = harness(profile);

    await command.execute(ctx, { phoneNumber: null });

    expect(profile.phoneNumber).toBeNull();
    expect(identityCalls).toEqual([null]);
  });

  it("refuses an invalid number before writing anything", async () => {
    const profile = Profile.create(base);
    const { command, saved, identityCalls } = harness(profile);

    await expect(command.execute(ctx, { phoneNumber: "841234567" })).rejects.toBeInstanceOf(
      InvalidPhoneNumberError,
    );
    expect(saved).toEqual([]);
    expect(identityCalls).toEqual([]);
  });
});

describe("UpdateMyProfileCommand — avatar", () => {
  it("sets and clears the avatar key", async () => {
    const profile = Profile.create(base);
    const { command } = harness(profile);

    await command.execute(ctx, { avatarKey: "avatar/u1/1" });
    expect(profile.avatarKey).toBe("avatar/u1/1");

    await command.execute(ctx, { avatarKey: null });
    expect(profile.avatarKey).toBeNull();
  });
});
```

If `ExecutionContext`'s shape rejects the `ctx` literal above, read `packages/backend/src/modules/ntizo/shared/infrastructure/execution-context.ts` and build it the way `create-user-on-sign-up.internal.command.test.ts` does — the `as unknown as` cast is there to keep the test about the command, not about context construction.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/user/app/use-cases/__tests__/update-my-profile.command.test.ts
```

Expected: FAIL — the command takes two constructor arguments and knows nothing about `avatarKey`.

- [ ] **Step 3: Update the inbound port**

In `update-my-profile.command.port.ts`, replace `avatarUrl?: string | null;` with:

```ts
  /**
   * The R2 key of an uploaded photo, or null to remove it and fall back to
   * whatever the sign-up provider supplied.
   *
   * There is deliberately no `avatarUrl` here. It used to accept any URL that
   * parsed, which let any account point its face at any image anywhere —
   * somebody else's bandwidth, or a tracking pixel served to every viewer.
   * `avatar_url` now has exactly one writer: the sign-up hook.
   */
  avatarKey?: string | null;
```

- [ ] **Step 4: Update the command**

In `update-my-profile.command.ts`, add the import:

```ts
import type { AuthIdentityPort } from "../ports/outbound";
import { normalizePhoneNumber } from "../../domain/value-objects/phone-number";
```

Add the third constructor argument:

```ts
  constructor(
    private readonly profileRepo: ProfileRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly authIdentity: AuthIdentityPort,
  ) {}
```

Replace the `touchesContact` block and what follows it, so the method body between the `ProfileNotFoundError` throw and the `touchesPreferences` assignment reads:

```ts
    // Normalised before anything is compared or written: "+258 84 123 4567"
    // and "+258841234567" are one number, and the unique index that protects
    // it can only see strings.
    const nextPhone =
      input.phoneNumber === undefined
        ? undefined
        : input.phoneNumber === null || input.phoneNumber.trim() === ""
          ? null
          : normalizePhoneNumber(input.phoneNumber);

    // Only when it actually changed. Saving the form without touching the
    // phone must not clear a verification the person already went through.
    const phoneChanged = nextPhone !== undefined && nextPhone !== profile.phoneNumber;

    const touchesName =
      input.firstName !== undefined ||
      input.lastName !== undefined ||
      input.displayName !== undefined;
    const touchesContact =
      nextPhone !== undefined ||
      input.bio !== undefined ||
      input.avatarKey !== undefined;
```

Replace the `profile.updateContact({...})` call with:

```ts
    if (touchesContact) {
      profile.updateContact({
        phoneNumber: nextPhone,
        bio: input.bio,
        avatarKey: input.avatarKey,
      });
    }
```

Replace the closing transaction block with:

```ts
    await this.unitOfWork.atomicExecute(async () => {
      await this.profileRepo.save(profile);
    });

    // After the profile commits, not inside the transaction: the two live in
    // different modules' tables and one postgres transaction does not span
    // them anyway. If this throws — a number another account already holds —
    // the caller sees PHONE_NUMBER_ALREADY_IN_USE and the profile carries a
    // number the identity does not, which is visible and correctable. The
    // reverse order would leave the identity holding a number no profile
    // shows, which is neither.
    if (phoneChanged) {
      await this.authIdentity.setPhoneNumber(requester.userId, nextPhone ?? null);
    }
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/user/app/use-cases/__tests__/update-my-profile.command.test.ts
```

Expected: 5 pass.

- [ ] **Step 6: Wire the adapter in the bootstrap**

In `packages/backend/src/modules/ntizo/bounded-contexts/user/bootstrap/index.ts`, add the import:

```ts
import { BetterAuthIdentityAdapter } from "../infrastructure/adapters/better-auth-identity.adapter";
```

and change the construction:

```ts
  const authIdentity = new BetterAuthIdentityAdapter();
  const updateMyProfile = new UpdateMyProfileCommand(
    profileRepository,
    unitOfWork,
    authIdentity,
  );
```

Add `authIdentity,` to the returned `adapters` object.

- [ ] **Step 7: Update the GraphQL write schema**

In `packages/backend/src/modules/ntizo/write/user/graphql/schema/mutations.ts`, inside `updateMyProfile`'s input object, replace the `avatarUrl` line with:

```ts
      // A key, not a URL, and the change is the point: the previous
      // `z.string().url()` accepted any address on the internet, so any
      // account could serve any image — or any tracking pixel — from its own
      // face. A key can only name an object this platform stored.
      avatarKey: z.string().max(300).nullable().optional(),
```

Also update the schema's doc comment: the paragraph explaining `.nullable()` on "the contact fields" still applies, but it names `avatarUrl` — change that word to `avatarKey`.

The handler in `mutations.handlers.ts` passes `args.input` straight through and needs no change.

- [ ] **Step 8: Verify the package and the api compile and pass**

```bash
cd packages/backend && bun run typecheck && bun test src
```

Then from the repo root:

```bash
bun run check-types
```

Expected: no errors. If `apps/backend/api` fails to compile, it is because something still references the removed `avatarUrl` input — remove that reference rather than restoring the field.

- [ ] **Step 9: Commit**

```bash
git add packages/backend/src/modules/ntizo
git commit -m "feat(user): a phone somebody can change, and an avatar only we can host"
```

---

### Task 6: The read side resolves the photo

**Files:**
- Modify: `packages/shared/src/read-models/system/user/current-user.schema.ts`
- Modify: `packages/backend/src/modules/ntizo/read/user/infra/repositories/drizzle/user-read.repository.ts`
- Modify: `apps/frontend/web/src/features/user/data/user.repository.ts` (the `ME` document only)
- Test: `packages/backend/src/modules/ntizo/read/user/__tests__/avatar-resolution.test.ts` (create)

**The frontend document changes in this task, not in Task 11.** `apps/frontend/web/src/features/user/data/__tests__/user.repository.test.ts` has a test named `selects every field of the current-user read model`, which walks `currentUserReadModel`'s keys and asserts each appears in the `ME` query string. Adding a field to the read model without adding it to the document turns that test red — so the two halves travel together or this task ends on a broken repo.

**Interfaces:**
- Consumes: `profile.avatarKey` (Task 2), `mediaUrl` from `packages/backend/src/modules/ntizo/shared/infrastructure/media`.
- Produces: `CurrentUserDTO.avatarKey: string | null`; `CurrentUserDTO.avatarUrl` is now the **resolved** URL — `mediaUrl(avatarKey) ?? avatarUrl`.

- [ ] **Step 1: Write the failing test**

The repository needs a database, so extract the resolution into a pure function and test that. Create `packages/backend/src/modules/ntizo/read/user/__tests__/avatar-resolution.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { resolveAvatarUrl } from "../infra/repositories/drizzle/user-read.repository";

/**
 * `mediaUrl` reads `MEDIA_PUBLIC_URL_BASE` off the request-scoped infra store,
 * which is absent here — see its own test for what it returns without one.
 * What matters at this level is precedence, so the composer is injected.
 */
const compose = (key: string) => `https://cdn.example/${key}`;

describe("resolveAvatarUrl", () => {
  it("prefers the uploaded photo over the provider's", () => {
    expect(
      resolveAvatarUrl("avatar/u1/1", "https://lh3.googleusercontent.com/a/x", compose),
    ).toBe("https://cdn.example/avatar/u1/1");
  });

  it("falls back to the provider's photo when nothing was uploaded", () => {
    expect(resolveAvatarUrl(null, "https://lh3.googleusercontent.com/a/x", compose)).toBe(
      "https://lh3.googleusercontent.com/a/x",
    );
  });

  it("falls back when the key cannot be composed into a URL", () => {
    // Locally `MEDIA_PUBLIC_URL_BASE` may be unset. A null from the composer
    // must not swallow the photo the person does have.
    expect(
      resolveAvatarUrl("avatar/u1/1", "https://lh3.googleusercontent.com/a/x", () => null),
    ).toBe("https://lh3.googleusercontent.com/a/x");
  });

  it("is null when there is no photo at all", () => {
    expect(resolveAvatarUrl(null, null, compose)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/backend && bun test src/modules/ntizo/read/user/__tests__/avatar-resolution.test.ts
```

Expected: FAIL — `resolveAvatarUrl` is not exported.

- [ ] **Step 3: Add `avatarKey` to the read model**

In `packages/shared/src/read-models/system/user/current-user.schema.ts`, after the `avatarUrl` line:

```ts
  /**
   * Set when the photo is one this person uploaded.
   *
   * `avatarUrl` above is the resolved address of whichever photo wins, so it
   * cannot answer "is this mine, or the one my sign-in provider had?" — and
   * the profile form needs that to know whether to offer "remove".
   */
  avatarKey: z.string().nullable(),
```

- [ ] **Step 4: Resolve in the repository**

In `user-read.repository.ts`, add the import:

```ts
import { mediaUrl } from "../../../../../shared/infrastructure/media";
```

Add above the class:

```ts
/**
 * Which photo to show, and where it lives.
 *
 * An uploaded photo wins over the one a sign-in provider supplied, so a
 * deliberate choice is never displaced by a later Google sign-in. The
 * composer is a parameter so precedence can be tested without a request
 * scope; every caller passes `mediaUrl`.
 */
export function resolveAvatarUrl(
  avatarKey: string | null,
  avatarUrl: string | null,
  compose: (key: string) => string | null = mediaUrl,
): string | null {
  if (avatarKey) {
    const composed = compose(avatarKey);
    if (composed) return composed;
  }
  return avatarUrl ?? null;
}
```

Add `avatarKey: profile.avatarKey,` to the `.select({...})` object, and replace the returned `avatarUrl` line with:

```ts
      avatarUrl: resolveAvatarUrl(row.avatarKey ?? null, row.avatarUrl ?? null),
      avatarKey: row.avatarKey ?? null,
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd packages/backend && bun test src/modules/ntizo/read/user
```

Expected: all pass, including the existing `queries.handlers.test.ts`. If that one fails because its fixture lacks `avatarKey`, add the field to the fixture — the read model requires it.

The GraphQL read schema needs no change: `read/user/graphql/schema/queries.ts` sets `output: zodSchema(currentUserReadModel)`, so the field added in Step 3 is already in the contract.

- [ ] **Step 6: Ask for the field in the frontend document**

In `apps/frontend/web/src/features/user/data/user.repository.ts`, add `avatarKey` to the `ME` document's field list, immediately after `avatarUrl`:

```
      id email role status createdAt name firstName lastName displayName avatarUrl avatarKey phoneNumber bio language timezone dateOfBirth gender
```

Nothing else in that file changes here — `UpdateMyProfileInput` is Task 11's.

- [ ] **Step 7: Verify both sides**

```bash
cd packages/backend && bun run typecheck && bun test src
```

Then:

```bash
cd apps/frontend/web && bun run test
```

Expected: `selects every field of the current-user read model` passes. If it fails naming `avatarKey`, the document edit above is missing or misspelt.

- [ ] **Step 8: Commit**

```bash
git add packages/shared packages/backend/src/modules/ntizo/read/user apps/frontend/web/src/features/user
git commit -m "feat(user): show the photo somebody chose, or the one they arrived with"
```

---

### Task 7: `POST /api/media/avatar`

**Files:**
- Modify: `apps/backend/api/src/media.ts`
- Test: `apps/backend/api/src/__tests__/media-avatar.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `POST /api/media/avatar` accepting `multipart/form-data` with a `file` part, answering `201 { key: string, url: string | null }`.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/api/src/__tests__/media-avatar.test.ts`. `mock.module` on the auth module is the convention `graphql/__tests__/context-factory.test.ts` established; `app.request(path, init, ENV)` is the one `webhook-mount.test.ts` uses. This follows both rather than inventing a third.

```ts
import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import type { AppBindings } from "../types";

/** Swaps the session the route will see. Call before importing the module. */
function withSession(sessionUser: unknown) {
  mock.module("@ntizo/backend/modules/better-auth", () => ({
    getAuth: () => ({
      api: { getSession: async () => (sessionUser ? { user: sessionUser } : null) },
    }),
  }));
}

interface PutCall {
  key: string;
  metadata: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> };
}

function fakeBucket() {
  const puts: PutCall[] = [];
  return {
    puts,
    bucket: {
      async put(key: string, _body: unknown, metadata: PutCall["metadata"]) {
        puts.push({ key, metadata });
      },
    },
  };
}

async function subject(env: Partial<AppBindings>) {
  const { mountMedia } = await import("../media");
  const app = new Hono<{ Bindings: AppBindings }>();
  mountMedia(app);
  return (body: FormData) =>
    app.request("/api/media/avatar", { method: "POST", body }, env as AppBindings);
}

function formWith(file: File): FormData {
  const form = new FormData();
  form.append("file", file);
  return form;
}

const JPEG = () => new File([new Uint8Array([1, 2, 3])], "me.jpg", { type: "image/jpeg" });

describe("POST /api/media/avatar", () => {
  it("refuses an anonymous caller with 401, without reaching the bucket", async () => {
    withSession(null);
    const { bucket, puts } = fakeBucket();
    const request = await subject({ MEDIA_BUCKET: bucket } as unknown as Partial<AppBindings>);

    const res = await request(formWith(JPEG()));

    expect(res.status).toBe(401);
    expect(puts).toHaveLength(0);
  });

  it("refuses a PDF with 415", async () => {
    // `accept` on an <input> is a hint to a file dialog and nothing more —
    // one curl away from being irrelevant.
    withSession({ id: "u1" });
    const { bucket, puts } = fakeBucket();
    const request = await subject({ MEDIA_BUCKET: bucket } as unknown as Partial<AppBindings>);

    const res = await request(
      formWith(new File([new Uint8Array([1])], "cv.pdf", { type: "application/pdf" })),
    );

    expect(res.status).toBe(415);
    expect(puts).toHaveLength(0);
  });

  it("refuses a file over 5 MB with 413", async () => {
    // The browser-side size check runs in code the caller controls.
    withSession({ id: "u1" });
    const { bucket, puts } = fakeBucket();
    const request = await subject({ MEDIA_BUCKET: bucket } as unknown as Partial<AppBindings>);

    const tooBig = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.jpg", {
      type: "image/jpeg",
    });
    const res = await request(formWith(tooBig));

    expect(res.status).toBe(413);
    expect(puts).toHaveLength(0);
  });

  it("keys the object by the SESSION's user id and answers 201", async () => {
    withSession({ id: "u1" });
    const { bucket, puts } = fakeBucket();
    const request = await subject({
      MEDIA_BUCKET: bucket,
      MEDIA_PUBLIC_URL_BASE: "https://cdn.example",
    } as unknown as Partial<AppBindings>);

    const res = await request(formWith(JPEG()));

    expect(res.status).toBe(201);
    const body = (await res.json()) as { key: string; url: string | null };
    // The id comes from the session and there is no field in the request that
    // could name a different one — which is the whole reason this route takes
    // no id in its path.
    expect(body.key).toMatch(/^avatar\/u1\/\d+$/);
    expect(body.url).toBe(`https://cdn.example/${body.key}`);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.metadata.customMetadata).toEqual({ uploadedByUserId: "u1" });
  });

  it("answers null for the url when no public base is configured", async () => {
    // Locally, that is every upload. A guessed URL would be worse than none.
    withSession({ id: "u1" });
    const { bucket } = fakeBucket();
    const request = await subject({ MEDIA_BUCKET: bucket } as unknown as Partial<AppBindings>);

    const res = await request(formWith(JPEG()));
    const body = (await res.json()) as { url: string | null };

    expect(res.status).toBe(201);
    expect(body.url).toBeNull();
  });
});
```

If `mountMedia` cannot be imported without pulling in bootstrap, mock the offending module the same way — do not fall back to testing the handler by hand.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/backend/api && bun test src/__tests__/media-avatar.test.ts
```

Expected: FAIL — the route returns 404.

- [ ] **Step 3: Add the route**

In `apps/backend/api/src/media.ts`, inside `mountMedia`, before the `app.post("/api/media/:providerId/:kind", ...)` handler:

```ts
  /**
   * Somebody's own profile photo.
   *
   * No id in the path, and that is the design. The subject is the session
   * user, exactly as in `user.updateMe`: a route that accepts a target id is
   * one authorization bug away from letting anybody replace anybody's face,
   * and no caller here has a reason to write someone else's.
   *
   * One segment after the prefix, so it cannot collide with
   * `/:providerId/:kind`, which needs two — no ordering dependency between
   * the two handlers.
   */
  app.post("/api/media/avatar", async (c) => {
    const session = await getAuth().api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "UNAUTHENTICATED" }, 401);

    const bucket = c.env.MEDIA_BUCKET;
    if (!bucket) return c.json({ error: "MEDIA_STORAGE_UNCONFIGURED" }, 503);

    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "NO_FILE" }, 400);
    if (!isImage(file.type)) return c.json({ error: "UNACCEPTED_TYPE" }, 415);
    if (file.size > MAX_IMAGE_BYTES) return c.json({ error: "TOO_LARGE" }, 413);

    // The id comes from the session, never from the request.
    const key = `avatar/${session.user.id}/${Date.now()}`;
    await bucket.put(key, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: file.type,
        // The key carries a timestamp, so a replaced photo is a new key and
        // never a stale cache.
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: { uploadedByUserId: session.user.id },
    });

    const base = c.env.MEDIA_PUBLIC_URL_BASE;
    return c.json({ key, url: base ? `${base}/${key}` : null }, 201);
  });
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/backend/api && bun test src
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/api/src
git commit -m "feat(api): a place to put your own face"
```

---

### Task 8: Carrying the timezone from the browser to the profile

**Files:**
- Modify: `packages/backend/src/shared/infrastructure/stores/infra-store.ts`
- Modify: `apps/backend/api/src/middlewares/config.middleware.ts`
- Modify: `apps/backend/api/src/middlewares/cors.ts`
- Modify: `apps/frontend/web/src/features/auth/components/sign-up.tsx`
- Test: `apps/backend/api/src/__tests__/wait-until.test.ts` (extend the fake `req`)

**Interfaces:**
- Consumes: nothing.
- Produces: `infraStore.setTimezone(value: string | null | undefined): void` and `infraStore.getTimezone(): string | null`.

- [ ] **Step 1: Add the field to the store**

In `packages/backend/src/shared/infrastructure/stores/infra-store.ts`, add to `InfraStoreData` after `acceptLanguage`:

```ts
  /**
   * The requester's IANA timezone, from `X-Timezone`.
   *
   * Sign-up is the only moment this is knowable — the request carries it and
   * nothing downstream has one — so it travels with the language, for the
   * same reason and by the same route.
   */
  timezone?: string;
```

and, beside the `Accept-Language` pair:

```ts
  /** Records the request's `X-Timezone`. Absent outside a request. */
  setTimezone(value: string | null | undefined): void {
    if (value) this.require().timezone = value;
  }

  /**
   * The request's timezone, or null.
   *
   * Does NOT throw outside a request scope, matching `getAcceptLanguage`: a
   * caller with no timezone should fall back to the default, not fail.
   */
  getTimezone(): string | null {
    return this.storage.getStore()?.timezone ?? null;
  }
```

- [ ] **Step 2: Read it in the middleware**

In `apps/backend/api/src/middlewares/config.middleware.ts`, directly after the `setAcceptLanguage` line:

```ts
      // Same reason, same moment: a Google sign-up arrives through an OAuth
      // callback that carries neither, so this covers the e-mail path only
      // and the profile form covers the rest.
      infraStore.setTimezone(c.req.header("x-timezone"));
```

- [ ] **Step 3: Allow the header through CORS**

In `apps/backend/api/src/middlewares/cors.ts`, change:

```ts
  allowHeaders: ["Content-Type", "Authorization"],
```

to:

```ts
  // `X-Timezone` must be listed and `Accept-Language` need not be: the latter
  // is a CORS-safelisted request header, a custom `X-` header is not, and a
  // preflight refuses what it is not told about. Local development would
  // never show this — the Vite proxy makes those requests same-origin — so it
  // would have failed first in dev, silently, with the timezone simply never
  // arriving.
  allowHeaders: ["Content-Type", "Authorization", "X-Timezone"],
```

- [ ] **Step 4: Send it from the sign-up form**

In `apps/frontend/web/src/features/auth/components/sign-up.tsx`, find:

```tsx
            fetchOptions: { headers: { "Accept-Language": i18n.language } },
```

and replace it with:

```tsx
            fetchOptions: {
              headers: {
                "Accept-Language": i18n.language,
                // So a new profile is born in the reader's own timezone
                // instead of UTC. `resolvedOptions().timeZone` is an IANA
                // name in every browser this app supports.
                "X-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
            },
```

- [ ] **Step 5: Extend the middleware test's fake request**

In `apps/backend/api/src/__tests__/wait-until.test.ts`, the fake `req` added in Task 1 already answers every header with `undefined`, which covers the new read. Confirm by running:

```bash
cd apps/backend/api && bun test src/__tests__/wait-until.test.ts
```

Expected: 4 pass. If it fails, the fake `req.header` is not accepting an argument — make it `header: (_name: string) => undefined`.

- [ ] **Step 6: Verify everything compiles**

```bash
bun run check-types && bun run test
```

Expected: no type errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/shared apps/backend/api/src apps/frontend/web/src/features/auth
git commit -m "feat(user): a new profile starts in the timezone its owner is reading in"
```

---

### Task 9: The sign-up hook carries the photo and the timezone

**Files:**
- Modify: `packages/backend/src/modules/better-auth/lib/better-auth.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/user/app/ports/inbound/create-user-on-sign-up.internal.command.port.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/user/app/use-cases/create-user-on-sign-up.internal.command.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/user/app/use-cases/__tests__/create-user-on-sign-up.internal.command.test.ts`

**Interfaces:**
- Consumes: `Profile.create({ avatarUrl, timezone })` (Task 2), `infraStore.getTimezone()` (Task 8).
- Produces: `SignUpHookInput` gains `image: string | null` and `timezone?: string | null`; `CreateUserOnSignUpInternalInput` gains the same two.

- [ ] **Step 1: Write the failing test**

Append to `create-user-on-sign-up.internal.command.test.ts`, reusing the harness already at the top of that file — `createStore()`, `FakeUserRepository`, `FakeProfileRepository`, `InMemoryUnitOfWork`, `SpyOutbox`. Add this whole `describe` block at the end:

```ts
describe("CreateUserOnSignUpInternalCommand — what the sign-up knew", () => {
  function subject() {
    const store = createStore();
    const command = new CreateUserOnSignUpInternalCommand(
      new FakeUserRepository(store),
      new FakeProfileRepository(store),
      new InMemoryUnitOfWork(store),
      new SpyOutbox(),
    );
    const profileOf = (userId: string) => {
      const profile = store.profiles.get(userId);
      if (!profile) throw new Error("no profile was written");
      return profile;
    };
    return { command, profileOf };
  }

  const base = {
    userId: "user-1",
    email: "new@ntizo.test",
    firstName: "New",
    lastName: "User",
  };

  it("puts the sign-in provider's photo on the new profile", async () => {
    // better-auth's Google provider builds the user as
    // `{ ..., image: user.picture, ...mapProfileToUser(...) }` — the picture
    // has been in `better_auth.user.image` all along. This is the carry
    // across, and the only part that was missing.
    const { command, profileOf } = subject();

    await command.execute({ ...base, image: "https://lh3.googleusercontent.com/a/x" });

    expect(profileOf("user-1").avatarUrl).toBe("https://lh3.googleusercontent.com/a/x");
    // Not a key: this photo is not ours and has no R2 object.
    expect(profileOf("user-1").avatarKey).toBeNull();
  });

  it("leaves the avatar null when the provider had no photo", async () => {
    const { command, profileOf } = subject();

    await command.execute({ ...base, image: null });

    expect(profileOf("user-1").avatarUrl).toBeNull();
  });

  it("puts the request's timezone on the new profile", async () => {
    const { command, profileOf } = subject();

    await command.execute({ ...base, image: null, timezone: "Africa/Maputo" });

    expect(profileOf("user-1").timezone).toBe("Africa/Maputo");
  });

  it("falls back to UTC when the request carried no timezone", async () => {
    const { command, profileOf } = subject();

    await command.execute({ ...base, image: null });

    expect(profileOf("user-1").timezone).toBe("UTC");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/user/app/use-cases/__tests__/create-user-on-sign-up.internal.command.test.ts
```

Expected: FAIL — the input type rejects `image`, and the profile's avatar is null.

- [ ] **Step 3: Extend the inbound port**

In `create-user-on-sign-up.internal.command.port.ts`, add to the interface:

```ts
  /**
   * The photo the sign-in provider supplied, or null.
   *
   * Written to `avatarUrl`, never to `avatarKey`: it is somebody else's URL on
   * somebody else's host. If it ever breaks, the profile falls back to
   * initials and the person can upload their own — which then wins.
   */
  image?: string | null;
  /**
   * IANA name, resolved at the edge from `X-Timezone`.
   *
   * Absent means "we could not tell" — a Google sign-up arrives through an
   * OAuth callback that carries no header of ours — and the Profile falls
   * back to UTC.
   */
  timezone?: string | null;
```

- [ ] **Step 4: Pass them through the command**

In `create-user-on-sign-up.internal.command.ts`, extend the `Profile.create` call:

```ts
      const profile = Profile.create({
        userId: input.userId,
        firstName: input.firstName,
        lastName: input.lastName,
        // Only when we actually resolved one. `undefined` lets the aggregate
        // apply the platform default; passing null would mean writing "no
        // language" into a column that has to hold one.
        ...(input.language ? { language: input.language } : {}),
        // Same rule, same reason: UTC is the aggregate's default, and an
        // absent header is not an instruction to store an empty timezone.
        ...(input.timezone ? { timezone: input.timezone } : {}),
        avatarUrl: input.image ?? null,
      });
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/user/app/use-cases
```

Expected: all pass.

- [ ] **Step 6: Extend the better-auth hook**

In `packages/backend/src/modules/better-auth/lib/better-auth.ts`, add to `SignUpHookInput`:

```ts
  /**
   * The provider's photo, or null for an e-mail sign-up.
   *
   * better-auth already stores Google's `picture` on the auth user — the
   * default social mapping sets `image` and `mapProfileToUser`'s result is
   * spread after it, so our `firstName`/`lastName` override never displaced
   * it. Nothing needed changing there; this is the carry across to the
   * domain profile, which was the only missing half.
   */
  image: string | null;
  /** IANA name from `X-Timezone`, resolved at the edge. */
  timezone?: string | null;
```

In the `create.after` hook, add to the `_signUpHook({...})` call, after `phoneNumber`:

```ts
                image: (u.image as string | undefined) ?? null,
                // Read here rather than inside the user context, which has no
                // request. Same route the language takes, one line above.
                timezone: infraStore.getTimezone(),
```

- [ ] **Step 7: Verify**

```bash
cd packages/backend && bun run typecheck && bun test src
```

Then from the repo root: `bun run check-types`.

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src
git commit -m "feat(user): the photo Google always sent us finally reaches the profile"
```

---

### Task 10: `LogoUpload` learns a round preview

**Files:**
- Modify: `packages/frontend/src/components/image-upload.tsx`
- Test: `packages/frontend/src/components/__tests__/image-upload.test.tsx` (create if absent; check the folder first)

**Interfaces:**
- Consumes: nothing.
- Produces: `LogoUploadProps.shape?: "square" | "round"`, default `"square"`.

- [ ] **Step 1: Add the prop**

In `packages/frontend/src/components/image-upload.tsx`, add to `LogoUploadProps`:

```ts
  /**
   * The preview's outline. `LOGO_CROP` is already `{ aspect: 1, width: 512 }`,
   * which is an avatar's shape as much as a logo's — only the frame differs,
   * so this is a prop rather than a second component copying the picker, the
   * crop dialog, the rejection handling and the busy state.
   */
  shape?: "square" | "round";
```

Destructure `shape = "square",` in the function's parameter list, and in the preview button's `cn(...)` replace the literal `"...rounded-[var(--radius-card-sm)] border-2 border-dashed transition-colors"` so the radius comes from the prop:

```ts
            className={cn(
              "relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden border-2 border-dashed transition-colors",
              shape === "round" ? "rounded-full" : "rounded-[var(--radius-card-sm)]",
              dragging
                ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]"
                : "border-[var(--color-border)] hover:border-[var(--color-primary)]",
              shown && "border-solid",
            )}
```

If the image element inside that button carries its own radius class, give it the same conditional.

- [ ] **Step 2: Verify nothing regressed**

```bash
cd packages/frontend && bun run typecheck && bun run test
```

Expected: existing tests pass. `LogoUpload`'s existing call sites pass no `shape` and keep the square frame.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src
git commit -m "feat(ui): the same picker, framed round"
```

---

### Task 11: The frontend's data layer

**Files:**
- Modify: `apps/frontend/web/src/features/user/data/user.repository.ts`
- Modify: `apps/frontend/web/src/features/user/domain/current-user.ts`
- Create: `apps/frontend/web/src/features/account/data/avatar.repository.ts`
- Create: `apps/frontend/web/src/features/account/viewmodel/use-avatar-upload.ts`
- Test: `apps/frontend/web/src/features/account/data/__tests__/avatar.repository.test.ts` (create)

**Interfaces:**
- Consumes: `POST /api/media/avatar` (Task 7), `CurrentUserDTO.avatarKey` (Task 6).
- Produces: `uploadMyAvatar(file: File): Promise<{ key: string; url: string | null }>`; `AvatarUploadError` with a `code`; `useAvatarUpload(): { busy, errorKey, upload, clearError }`; `UpdateMyProfileInput` gains `phoneNumber?: string | null` and `avatarKey?: string | null` and loses `avatarUrl`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/web/src/features/account/data/__tests__/avatar.repository.test.ts`. The neighbouring `user.repository.test.ts` spies on the GraphQL client module (`vi.spyOn(client, "sessionGraphql")`) because that is what it calls; this one hits `fetch` directly, so it stubs the global instead:

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { uploadMyAvatar, AvatarUploadError } from "../avatar.repository";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown) {
  const spy = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("uploadMyAvatar", () => {
  it("posts multipart with credentials and no Content-Type of its own", async () => {
    const spy = stubFetch(201, { key: "avatar/u1/1", url: "https://cdn/x" });

    await uploadMyAvatar(new File(["x"], "me.jpg", { type: "image/jpeg" }));

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeInstanceOf(FormData);
    // The browser must add its own with the multipart boundary; setting it by
    // hand produces a body the server cannot parse.
    expect(init.headers).toBeUndefined();
  });

  it("throws the server's own code so the caller can say something specific", async () => {
    stubFetch(413, { error: "TOO_LARGE" });

    await expect(
      uploadMyAvatar(new File(["x"], "me.jpg", { type: "image/jpeg" })),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("falls back to the status when the body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>502</html>", { status: 502 })));

    await expect(
      uploadMyAvatar(new File(["x"], "me.jpg", { type: "image/jpeg" })),
    ).rejects.toBeInstanceOf(AvatarUploadError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/frontend/web && bun run test
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the repository**

Create `apps/frontend/web/src/features/account/data/avatar.repository.ts`:

```ts
import { API_BASE_URL } from "@/shared/lib/api/auth-client";

/** What `POST /api/media/avatar` answers with. */
export interface UploadedAvatar {
  key: string;
  /** Null when no public base is configured — locally, that is every upload. */
  url: string | null;
}

/**
 * Carries the server's own code so the caller can say something specific. A
 * generic "upload failed" hides the difference between a file that is too
 * large and a session that has expired.
 */
export class AvatarUploadError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AvatarUploadError";
  }
}

/**
 * Sends the photo.
 *
 * `multipart/form-data`, not GraphQL: the schema would have to carry bytes as
 * base64, inflating them by a third and buffering the whole thing in the
 * Worker's JSON parser. `credentials: "include"` because the route takes the
 * subject from the session cookie — there is no user id to send.
 *
 * No `Content-Type` header on purpose: the browser must add its own with the
 * multipart boundary.
 */
export async function uploadMyAvatar(file: File): Promise<UploadedAvatar> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/media/avatar`, {
    method: "POST",
    credentials: "include",
    body: form,
  });

  const text = await response.text();
  let body: (UploadedAvatar & { error?: string }) | undefined;
  if (text) {
    try {
      body = JSON.parse(text) as UploadedAvatar & { error?: string };
    } catch {
      // A proxy error page or a truncated response is not JSON. Fall through
      // to the status-based error rather than throwing a raw SyntaxError.
    }
  }

  if (!response.ok) throw new AvatarUploadError(body?.error ?? `HTTP_${response.status}`);
  if (!body) throw new AvatarUploadError("MALFORMED_RESPONSE");
  return { key: body.key, url: body.url };
}
```

- [ ] **Step 4: Write the viewmodel**

Create `apps/frontend/web/src/features/account/viewmodel/use-avatar-upload.ts`:

```ts
import { useCallback, useState } from "react";
import { AvatarUploadError, uploadMyAvatar } from "@/features/account/data/avatar.repository";

/** Server codes that deserve their own sentence. Anything else is generic. */
const KNOWN_CODES = new Set([
  "UNAUTHENTICATED",
  "TOO_LARGE",
  "UNACCEPTED_TYPE",
  "MEDIA_STORAGE_UNCONFIGURED",
]);

function errorKeyFor(err: unknown): string {
  if (err instanceof AvatarUploadError && KNOWN_CODES.has(err.code)) {
    return `mediaError.${err.code}`;
  }
  return "mediaError.GENERIC";
}

export interface AvatarUploadState {
  busy: boolean;
  /** A translation key under `account.mediaError.*`, or null. */
  errorKey: string | null;
  upload: (file: File) => Promise<{ key: string; url: string | null } | null>;
  clearError: () => void;
}

/**
 * Uploading one's own photo.
 *
 * Not a react-query mutation: there is no cache entry to invalidate here. The
 * upload produces a key, and it is *saving the form* that attaches it — a
 * separate, deliberate act, so a wrong photograph is discarded rather than
 * undone.
 */
export function useAvatarUpload(): AvatarUploadState {
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const upload = useCallback(async (file: File) => {
    setBusy(true);
    setErrorKey(null);
    try {
      return await uploadMyAvatar(file);
    } catch (err) {
      setErrorKey(errorKeyFor(err));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, errorKey, upload, clearError: useCallback(() => setErrorKey(null), []) };
}
```

- [ ] **Step 5: Update the mutation's input type**

The `ME` document already asks for `avatarKey` — Task 6 did that, because the read model and the document are checked against each other by a test. Only the mutation input changes here.

In `apps/frontend/web/src/features/user/data/user.repository.ts`, in `UpdateMyProfileInput`, replace `avatarUrl?: string | null;` with:

```ts
  phoneNumber?: string | null;
  avatarKey?: string | null;
```

`features/user/domain/current-user.ts` needs no change — it is a bare `export type { CurrentUserDTO } from "@ntizo/shared"`, so Task 6's field arrives through it already.

- [ ] **Step 6: Run the tests**

```bash
cd apps/frontend/web && bun run typecheck && bun run test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/web/src/features
git commit -m "feat(account): the browser's half of uploading a photo"
```

---

### Task 12: The profile form gains a photo, a phone and a timezone

**Files:**
- Modify: `apps/frontend/web/src/features/account/ui/profile-form.tsx`
- Create: `apps/frontend/web/src/features/account/viewmodel/use-avatar-crop-strings.ts`
- Modify: all eight `apps/frontend/web/src/shared/locales/*/account.json`

**Interfaces:**
- Consumes: `useAvatarUpload` (Task 11), `LogoUpload` with `shape="round"` (Task 10), `PhoneInput` from `@ntizo/frontend-ui`, `UpdateMyProfileInput.phoneNumber`/`.avatarKey` (Task 11).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add the locale keys**

The account namespace already has `fieldPhone`, `fieldTimezone`, `verified`, `unverified`, `verifyPhone`, `notSet` — do not duplicate them. Add to **every one** of the eight `account.json` files (`en-US`, `pt-MZ`, `pt-PT`, `es-ES`, `fr-FR`, `de-DE`, `it-IT`, `nl-NL`), translated:

```json
  "fieldPhoto": "Profile photo",
  "fieldPhotoHint": "JPG, PNG or WebP, up to 5 MB.",
  "photoChoose": "Choose a photo",
  "photoReplace": "Replace",
  "photoRemove": "Remove",
  "phoneUnverified": "Not verified",
  "invalidPhone": "Use the international format, for example +258 84 123 4567.",
  "countrySearchPlaceholder": "Search for a country",
  "countryNoResults": "No country matches that.",
  "countrySelectLabel": "Country code",
  "crop": {
    "title": "Frame your photo",
    "hint": "Square, so it looks the same everywhere it appears. Drag to move, use the wheel or the slider to zoom.",
    "cancel": "Cancel",
    "confirm": "Use this framing",
    "zoom": "Zoom"
  },
  "mediaReject": {
    "type": "That file is not a JPG, PNG or WebP.",
    "size": "That file is larger than 5 MB."
  },
  "mediaError": {
    "UNAUTHENTICATED": "Your session has expired. Sign in again.",
    "TOO_LARGE": "That file is larger than 5 MB.",
    "UNACCEPTED_TYPE": "That file is not a JPG, PNG or WebP.",
    "MEDIA_STORAGE_UNCONFIGURED": "Photo uploads are unavailable right now.",
    "GENERIC": "The photo could not be uploaded. Try again."
  }
```

The `provider` namespace has equivalents for `crop`, `mediaReject` and `mediaError`, and the `auth` namespace has the three `country*` keys (as `countrySearchPlaceholder`, `countryNoResults`, `countrySelectLabel`). Copy their wording per language rather than inventing a second phrasing for the same sentence.

The spec says upload errors "reuse the existing `mediaError.*` keys". They exist under `provider`, and reading another feature's namespace from the account form would tie the two together for no reason — so they are copied into `account` instead. Same strings, own namespace.

- [ ] **Step 2: Write the crop-strings hook**

Create `apps/frontend/web/src/features/account/viewmodel/use-avatar-crop-strings.ts`:

```ts
import { useTranslation } from "react-i18next";
import type { CropStrings } from "@ntizo/frontend-ui";

/**
 * The cropper's copy, from the account bundle.
 *
 * `@ntizo/frontend-ui` has no i18n and must not grow one — a component
 * package that translates decides for every app consuming it. The provider
 * feature has its own version of this hook against its own namespace; they
 * are two lookups of five keys, not a shared abstraction waiting to happen.
 */
export function useAvatarCropStrings(): CropStrings {
  const { t } = useTranslation("account");
  return {
    title: t("crop.title"),
    hint: t("crop.hint"),
    cancel: t("crop.cancel"),
    confirm: t("crop.confirm"),
    zoom: t("crop.zoom"),
  };
}
```

- [ ] **Step 3: Add the three fields to the form**

In `apps/frontend/web/src/features/account/ui/profile-form.tsx`:

Extend the imports:

```tsx
import { useState } from "react";
import { isValidPhoneNumber } from "libphonenumber-js";
import { Button, DatePicker, Input, Label, LogoUpload, PhoneInput, Select } from "@ntizo/frontend-ui";
import { useAvatarUpload } from "@/features/account/viewmodel/use-avatar-upload";
import { useAvatarCropStrings } from "@/features/account/viewmodel/use-avatar-crop-strings";
```

Add to `defaultValues`:

```tsx
      phone: user.phoneNumber ?? "",
      timezone: user.timezone,
```

Add above `useForm`:

```tsx
  const avatar = useAvatarUpload();
  const cropStrings = useAvatarCropStrings();
  // The key chosen in this session, before it is saved. `null` means the
  // photo was removed; `undefined` means it was not touched, and the two must
  // stay distinguishable or "remove" becomes "leave alone".
  const [avatarKey, setAvatarKey] = useState<string | null | undefined>(undefined);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [mediaMessage, setMediaMessage] = useState<string | null>(null);

  // Every IANA zone the browser knows, with the reader's own first so the
  // common case is one click.
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = [browserZone, ...Intl.supportedValuesOf("timeZone").filter((z) => z !== browserZone)];
```

In `onSubmitAsync`, before the `update.mutateAsync` call:

```tsx
        // Validated here as well as on the server, so the message lands on
        // the field instead of arriving as a mutation failure.
        if (value.phone && !isValidPhoneNumber(value.phone)) {
          return { form: t("invalidPhone") };
        }
```

and extend the mutation payload:

```tsx
            // Empty means cleared, not "leave alone" — the field was on
            // screen and the user emptied it, which is an instruction.
            phoneNumber: value.phone.trim() || null,
            timezone: value.timezone,
            // Only when it was touched this session. Sending `undefined`
            // leaves the stored photo alone; sending `null` removes it.
            ...(avatarKey !== undefined ? { avatarKey } : {}),
```

Add the photo field as the form's first child, above the two-column grid:

```tsx
      <LogoUpload
        shape="round"
        cropStrings={cropStrings}
        url={freshUrl ?? (avatarKey === null ? null : user.avatarUrl)}
        onSelect={(file) => {
          void avatar.upload(file).then((r) => {
            if (!r) return;
            setAvatarKey(r.key);
            setFreshUrl(r.url);
          });
        }}
        // Removing clears the key. What the person sees next is whatever
        // their sign-in provider supplied — for a Google account that is a
        // sensible "reset", and for everyone else it is initials.
        onClear={() => {
          setAvatarKey(null);
          setFreshUrl(null);
        }}
        onReject={(reason) => setMediaMessage(t(`mediaReject.${reason}`))}
        busy={avatar.busy}
        label={t("fieldPhoto")}
        hint={t("fieldPhotoHint")}
        chooseText={t("photoChoose")}
        replaceText={t("photoReplace")}
        removeText={t("photoRemove")}
      />
      {avatar.errorKey || mediaMessage ? (
        <p className="type-body-medium text-[var(--color-destructive)]">
          {mediaMessage ?? t(avatar.errorKey!)}
        </p>
      ) : null}
```

Add the phone and timezone fields inside the existing `sm:grid-cols-2` grid, after `displayName`:

```tsx
        <form.Field name="phone">
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={field.name}>{t("fieldPhone")}</Label>
              {/* The same component the sign-up form uses, so a number that
                  passes here cannot be refused there. It emits E.164 and
                  nothing else. Its copy is passed in because
                  `@ntizo/frontend-ui` has no i18n runtime of its own —
                  `onChange` hands over `(value, { isValid })`, and only the
                  value is wanted here. */}
              <PhoneInput
                id={field.name}
                value={field.state.value}
                onChange={(next) => field.handleChange(next)}
                onBlur={field.handleBlur}
                defaultCountry="MZ"
                locale={i18n.language}
                searchPlaceholder={t("countrySearchPlaceholder")}
                noResultsText={t("countryNoResults")}
                countrySelectLabel={t("countrySelectLabel")}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="timezone">
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={field.name}>{t("fieldTimezone")}</Label>
              <Select
                id={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                options={zones.map((z) => ({ value: z, label: z }))}
              />
            </div>
          )}
        </form.Field>
```

`i18n` is already destructured in this file (`const { t, i18n } = useTranslation("account")`) for the date picker's locale, so `PhoneInput`'s needs no new hook.

- [ ] **Step 4: Verify**

```bash
cd apps/frontend/web && bun run typecheck && bun run lint && bun run test
```

Expected: no type errors, no new lint errors, tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(account): a face, a number and a timezone you can actually change"
```

---

### Task 13: The photo appears everywhere an avatar is drawn

**Files:**
- Modify: `apps/frontend/web/src/features/account/ui/account-page.tsx`
- Modify: `apps/frontend/web/src/shared/components/user-menu.tsx`
- Modify: `apps/frontend/web/src/shared/components/app-sidebar/sidebar-user-menu.tsx`
- Modify: `apps/frontend/web/src/shared/components/admin-sidebar/sidebar-user-menu.tsx`

**Interfaces:**
- Consumes: `CurrentUserDTO.avatarUrl` resolved server-side (Task 6), `AvatarImage` from `@ntizo/frontend-ui`.
- Produces: nothing.

- [ ] **Step 1: Render the photo on the account page**

In `account-page.tsx`, add `AvatarImage` to the `@ntizo/frontend-ui` import and replace the avatar block:

```tsx
          <Avatar className="h-[72px] w-[72px]">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={name} /> : null}
            <AvatarFallback className="type-h2 bg-[var(--color-primary)] font-semibold text-white">
              {initialsOf(name)}
            </AvatarFallback>
          </Avatar>
```

- [ ] **Step 2: Replace the badge with a marker on the number**

Still in `account-page.tsx`, add the session import:

```tsx
import { useSession } from "@ntizo/auth-client";
```

Delete the `verified` constant and the `Badge` block in the heading row, and remove `Badge` and `BadgeCheck` from the imports if nothing else uses them.

Replace the contact line with:

```tsx
            <p className="type-body mt-1 [overflow-wrap:anywhere] text-[var(--color-muted-foreground)]">
              {user.phoneNumber ? (
                <>
                  {user.phoneNumber}
                  {/* Read from the session, not the read model: whether a
                      number is verified is an auth fact, and copying it into
                      the domain profile would create a second truth that
                      drifts. It reads "not verified" for nearly everyone
                      until an SMS provider exists — which is accurate, and
                      why it sits beside the number rather than standing as a
                      verdict on the whole account. */}
                  {session?.user?.phoneNumberVerified ? null : (
                    <span className="ml-1.5 text-[var(--color-warning,inherit)]">
                      · {t("phoneUnverified")}
                    </span>
                  )}
                  {" · "}
                </>
              ) : null}
              {user.email}
            </p>
```

with `const { data: session } = useSession();` alongside the other hooks. Check `packages/frontend/src/components/badge.tsx` or the palette for the warning colour token actually in use, and use that instead of the `var(--color-warning, inherit)` fallback above if one exists.

- [ ] **Step 3: Render the photo in the three menus**

**Six insertions, not three.** Each of these files draws `<Avatar>` twice — once in the trigger and once on the identity row inside the open menu — and a photo that appears in the trigger but not the row is more obviously wrong than one that appears in neither. All three already hold the current user from `useCurrentUser()`, so no new query is needed anywhere.

In each file, add `AvatarImage` to the `@ntizo/frontend-ui` import list (beside `Avatar` and `AvatarFallback`), then put this line inside **both** `<Avatar>` elements, immediately above the `<AvatarFallback>`:

`apps/frontend/web/src/shared/components/user-menu.tsx` — the user is `user`, the display string is the existing `label` const:

```tsx
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={label} /> : null}
```

`apps/frontend/web/src/shared/components/app-sidebar/sidebar-user-menu.tsx` — the user is `user` and may be undefined (`const { data: user } = useCurrentUser()`), and the display string is the existing `initials` source:

```tsx
                  {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name ?? ""} /> : null}
```

`apps/frontend/web/src/shared/components/admin-sidebar/sidebar-user-menu.tsx` — same shape as the one above:

```tsx
                  {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name ?? ""} /> : null}
```

Match each file's own indentation; the two `<Avatar>` blocks in a file are nested at different depths.

- [ ] **Step 4: Verify**

```bash
cd apps/frontend/web && bun run typecheck && bun run lint && bun run test
```

- [ ] **Step 5: Look at it**

```bash
cd apps/frontend/web && bun run dev
```

Open `http://localhost:3000/account`, sign in, upload a photo, save, and confirm it appears on the card and in the user menu. Stop the server afterwards.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(account): a photo that shows up in all four places a face belongs"
```

---

### Task 14: The end-to-end proof

**Files:**
- Create: `apps/e2e/tests/profile.spec.ts`

**Interfaces:**
- Consumes: everything above; `createVerifiedUser` and `fillSignInForm` from `apps/e2e/fixtures`.
- Produces: nothing.

- [ ] **Step 1: Write the spec**

Create `apps/e2e/tests/profile.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { createVerifiedUser } from "../fixtures/auth";
import { sql } from "../fixtures/db";
import { fillSignInForm } from "../fixtures/ui";

/**
 * The seam no unit test observes: an upload that reaches R2 through the real
 * route, a key saved through the real mutation, and a read that composes the
 * URL back out of it. Every half is covered in isolation; this is the proof
 * they are joined.
 */
test("a photo, a phone and a timezone survive a save and a reload", async ({ page }) => {
  const user = await createVerifiedUser(undefined, { firstName: "Ana", lastName: "Sitoe" });

  await page.goto("/sign-in");
  await fillSignInForm(page, user);
  await page.waitForURL("http://localhost:3000/");

  await page.goto("/account");
  await page.getByRole("button", { name: /edit profile/i }).click();

  // A 1x1 PNG is enough: the route checks the MIME type and the size, and
  // the crop dialog works on whatever it is given.
  await page.setInputFiles('input[type="file"]', {
    name: "me.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await page.getByRole("button", { name: /use this framing/i }).click();

  await page.getByLabel(/phone/i).fill("+258841234567");
  await page.getByRole("button", { name: /^save$/i }).click();

  await expect(page.getByText("+258841234567")).toBeVisible();

  // The key reached the database, and the profile's number reached the auth
  // identity — the two halves that a green screen alone does not prove.
  // `sql` is a function returning the client, not the tag itself: see
  // `fixtures/db.ts` and how `notifications.spec.ts` calls it.
  const [profile] = await sql()<{ avatar_key: string | null; phone_number: string | null }[]>`
    SELECT avatar_key, phone_number FROM ntizo_user.profile WHERE user_id = ${user.id}
  `;
  expect(profile!.avatar_key).toMatch(/^avatar\//);
  expect(profile!.phone_number).toBe("+258841234567");

  const [identity] = await sql()<{ phone_number: string | null; phone_number_verified: boolean }[]>`
    SELECT phone_number, phone_number_verified FROM better_auth."user" WHERE id = ${user.id}
  `;
  expect(identity!.phone_number).toBe("+258841234567");
  // Changing a number un-verifies it. Nothing has verified this one — and
  // `createVerifiedUser` signs up with no phone at all, so this is a genuine
  // first write rather than an edit.
  expect(identity!.phone_number_verified).toBe(false);

  await page.reload();
  await expect(page.locator("img").first()).toBeVisible();
});
```

`createVerifiedUser` returns `{ id, email, password, firstName, lastName, name }`, so `user.id` is real. The accessible names above assume the app's English copy; if a locator does not match, run once with `--headed` and read the actual label rather than loosening the selector.

- [ ] **Step 2: Run it**

```bash
cd apps/e2e && bun run e2e -- profile.spec.ts
```

Expected: 1 passed. This needs the API and web app running the way `global-setup.ts` arranges — read it if the run cannot reach them.

- [ ] **Step 3: Run the whole suite**

```bash
bun run test && bun run check-types && bun run lint
```

Expected: all green, and no new lint warnings beyond the pre-existing one in `use-onboarding.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/e2e/tests
git commit -m "test(e2e): the photo, the number and the timezone, end to end"
```

---

## Deployment note

Task 2 adds a column. The migration must run against each stage before the code that reads it is deployed there:

```bash
cd packages/backend
bun db:ntizo:dev:migrate    # then qa, then prod
```

`avatar_key` is nullable with no default, so the migration is safe to run ahead of the deploy — old code ignores a column it does not select.
