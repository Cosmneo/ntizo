# Phase 2 — User Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the User BC through the same read/write GraphQL layers the Provider slice proved, retire the last REST endpoint, and extract `@ntizo/auth-client`.

**Architecture:** Mirror `read/provider` exactly — a dedicated read repository projecting straight to read models, a projection taking a plain input, an arg-mapper that lifts the requester id from the session, and handlers built with `graphqlRoutes(...).handleWithUseCase(...)`. The frontend gains a `user` feature repository alongside `provider`, and the three duplicate `/api/me` fetchers collapse onto it. `@ntizo/auth-client` becomes a workspace package so the better-auth client config has one home.

**Tech Stack:** Bun 1.3.9, Turborepo, `@cosmneo/onion-lasagna` 1.0.0-beta.3, GraphQL Yoga, Hono, Drizzle, TanStack Start/Router/Query, better-auth.

## Global Constraints

- `@cosmneo/*` overrides stay pinned **exactly** at `1.0.0-beta.3`. `latest` is `0.4.1`, a different API line. Never widen to a range.
- The repo root is `ntizo-workspace/`. All paths in this plan are relative to it.
- `read/<bc>` defines **queries only**; `write/<bc>` defines **mutations only**. A fitness test asserts this — see `packages/backend/src/modules/ntizo/__tests__/`.
- The kit flattens nested namespaces to camelCase root fields: `user.me` → `userMe`. Every field takes a required `input` arg, even when empty (`input: {}`).
- The requester id comes from the **session**, never from args. Any mapper that reads a user id off `args` is a defect.
- `getGraphQLErrorCode` returns the coarse kit code; the fine-grained domain code is in `extensions.originalCode`.
- Frontend layering is enforced by `eslint-plugin-boundaries` with `no-unknown-files: "error"`. Every new file must land in a classified folder: `domain/`, `data/`, `viewmodel/`, `ui/`, `locales/`.
- No `as UserRole` casts. Use `toUserRole()` from `@ntizo/shared`.
- Commit after each task. Run `bun run check-types && bun run lint && bun run test && bun run build` from the repo root before each commit.

## File Structure

**New — `packages/backend/src/modules/ntizo/read/user/`** (mirrors `read/provider/`)
- `app/ports/outbound/user-read.repository.port.ts` — the read port
- `app/ports/inbound/index.ts` — `GetCurrentUserProjectionPort` + input/output types
- `app/use-cases/get-current-user.projection.ts` — the projection
- `infra/repositories/drizzle/user-read.repository.ts` — projects to `CurrentUserDTO`
- `graphql/schema/queries.ts` — `userMe` query, `userReadSchema`
- `graphql/handlers/arg-mappers.ts` — session → projection input
- `graphql/handlers/queries.handlers.ts` — `createUserReadHandlers`
- `bootstrap/index.ts` — wires repository into projection
- `index.ts` — public surface
- `__tests__/queries.handlers.test.ts` — arg-mapper + projection tests

**Modified — backend**
- `packages/backend/src/modules/ntizo/read/schema.ts` — merge in `userReadSchema`
- `apps/backend/api/src/graphql/private.ts` — bootstrap + register handlers
- `apps/backend/api/src/api.ts` — drop the REST route (Task 4)
- `apps/backend/api/src/http/user.router.ts` — **deleted** (Task 4)

**New — `packages/frontend/auth-client/`**
- `package.json`, `tsconfig.json`, `src/index.ts`

**Modified — frontend**
- `apps/frontend/web/src/features/user/data/user.repository.ts` — new, GraphQL
- `apps/frontend/web/src/features/user/domain/current-user.ts` — new, types
- `apps/frontend/web/src/shared/lib/api/me.ts` — **deleted** (Task 4)
- `apps/frontend/web/src/features/admin/dashboard/hooks/use-current-user.ts` — **deleted**, callers move to the repository
- `apps/frontend/web/src/features/account/hooks/use-current-user.ts` — **deleted**, same
- `apps/frontend/web/src/shared/lib/api/auth-client.ts` — re-export from the package
- `apps/frontend/web/eslint.config.js` — classify `features/user/**`

---

### Task 1: `read/user` slice

**Files:**
- Create: every file under `packages/backend/src/modules/ntizo/read/user/` listed above
- Test: `packages/backend/src/modules/ntizo/read/user/__tests__/queries.handlers.test.ts`

**Interfaces:**
- Consumes: `currentUserReadModel` and `CurrentUserDTO` from `@ntizo/shared`; `ntizoGraphqlContextSchema`, `asNtizoGraphqlContext`, `requireRequesterUserId`, `NtizoGraphqlContext` from `../../../../graphql/context`; the `user` and `profile` Drizzle schemas from `../../../shared/infrastructure/database/user/schemas`
- Produces: `userReadSchema`, `createUserReadHandlers(module)`, `bootstrapUserRead()`, `type UserReadModule`, `GetCurrentUserProjectionPort`

> **Why a new projection rather than reusing `GetCurrentUserUseCase`.** The
> existing BC use case takes an `ExecutionContext` and lives in
> `bounded-contexts/user/`. `read/provider` established the opposite shape for
> the read tier: projections take a plain input and the arg-mapper does the
> session lifting. Follow the read-tier pattern. The BC use case stays where it
> is — it is still reachable, and Task 4 only removes its REST adapter.

- [ ] **Step 1: Write the failing test**

`packages/backend/src/modules/ntizo/read/user/__tests__/queries.handlers.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import type { CurrentUserDTO } from "@ntizo/shared";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import { mapGetCurrentUserInput } from "../graphql/handlers/arg-mappers";
import { GetCurrentUserProjection } from "../app/use-cases/get-current-user.projection";
import type { UserReadRepositoryPort } from "../app/ports/outbound/user-read.repository.port";

const dto: CurrentUserDTO = {
  id: "u1", email: "a@b.c", role: "customer", status: "active",
  createdAt: "2026-01-01T00:00:00.000Z", name: "A B",
  firstName: "A", lastName: "B", displayName: "A B",
  avatarUrl: null, phoneNumber: null, bio: null,
  language: "en-US", timezone: "UTC",
};

function ctx(overrides: Partial<NtizoGraphqlContext> = {}): NtizoGraphqlContext {
  return {
    requesterUserId: "u-session", email: null, firstName: null,
    lastName: null, role: "customer",
    requestId: null, ipAddress: null, userAgent: null,
    ...overrides,
  };
}

class FakeUserReadRepository implements UserReadRepositoryPort {
  public readonly calls: string[] = [];
  constructor(private readonly toReturn: CurrentUserDTO | null) {}
  async findCurrentUser(userId: string): Promise<CurrentUserDTO | null> {
    this.calls.push(`findCurrentUser:${userId}`);
    return this.toReturn;
  }
}

describe("mapGetCurrentUserInput", () => {
  it("takes the requester id from the session", () => {
    expect(mapGetCurrentUserInput(ctx())).toEqual({ requestedByUserId: "u-session" });
  });

  it("throws for an anonymous caller rather than fabricating an identity", () => {
    expect(() => mapGetCurrentUserInput(ctx({ requesterUserId: null }))).toThrow();
  });
});

describe("GetCurrentUserProjection", () => {
  it("returns the current user for the requester", async () => {
    const repo = new FakeUserReadRepository(dto);
    const result = await new GetCurrentUserProjection(repo).execute({
      requestedByUserId: "u1",
    });
    expect(result).toEqual(dto);
    expect(repo.calls).toEqual(["findCurrentUser:u1"]);
  });

  it("throws when the requester has no user row", async () => {
    const repo = new FakeUserReadRepository(null);
    await expect(
      new GetCurrentUserProjection(repo).execute({ requestedByUserId: "ghost" }),
    ).rejects.toThrow("[read/user] current user not found");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test packages/backend/src/modules/ntizo/read/user`
Expected: FAIL — modules do not resolve yet.

- [ ] **Step 3: Write the port, projection and repository**

`app/ports/outbound/user-read.repository.port.ts`:

```ts
import type { CurrentUserDTO } from "@ntizo/shared";

export interface UserReadRepositoryPort {
  findCurrentUser(userId: string): Promise<CurrentUserDTO | null>;
}
```

`app/ports/inbound/index.ts`:

```ts
import type { CurrentUserDTO } from "@ntizo/shared";

export interface GetCurrentUserProjectionInput {
  requestedByUserId: string;
}

export interface GetCurrentUserProjectionPort {
  execute(input: GetCurrentUserProjectionInput): Promise<CurrentUserDTO>;
}
```

`app/use-cases/get-current-user.projection.ts`:

```ts
import type { CurrentUserDTO } from "@ntizo/shared";
import type {
  GetCurrentUserProjectionInput,
  GetCurrentUserProjectionPort,
} from "../ports/inbound";
import type { UserReadRepositoryPort } from "../ports/outbound/user-read.repository.port";

export class GetCurrentUserProjection implements GetCurrentUserProjectionPort {
  constructor(private readonly repo: UserReadRepositoryPort) {}

  async execute(input: GetCurrentUserProjectionInput): Promise<CurrentUserDTO> {
    const dto = await this.repo.findCurrentUser(input.requestedByUserId);
    // Throw rather than return null: the id came from a validated session, so a
    // missing row is a broken invariant, not an ordinary "not found". The output
    // schema is non-nullable, so returning null would fail kit validation with a
    // far less legible error.
    if (!dto) throw new Error("[read/user] current user not found");
    return dto;
  }
}
```

`infra/repositories/drizzle/user-read.repository.ts`:

```ts
import { eq } from "drizzle-orm";
import type { CurrentUserDTO } from "@ntizo/shared";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { user, profile } from "../../../../../shared/infrastructure/database/user/schemas";
import type { UserReadRepositoryPort } from "../../../app/ports/outbound/user-read.repository.port";

/**
 * Read-side repository. Projects straight to the read model — no aggregate
 * hydration. Reads ntizo's own user + profile tables, never better-auth's
 * user table (no cross-module reach).
 */
export class DrizzleUserReadRepository implements UserReadRepositoryPort {
  async findCurrentUser(userId: string): Promise<CurrentUserDTO | null> {
    const [row] = await getDb()
      .select({
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        firstName: profile.firstName,
        lastName: profile.lastName,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        phoneNumber: profile.phoneNumber,
        bio: profile.bio,
        language: profile.language,
        timezone: profile.timezone,
      })
      .from(user)
      // leftJoin, not innerJoin: the profile is created empty on registration
      // and may legitimately not exist yet. innerJoin would make a fresh user
      // look deleted.
      .leftJoin(profile, eq(profile.userId, user.id))
      .where(eq(user.id, userId))
      .limit(1);

    if (!row) return null;

    const firstName = row.firstName ?? "";
    const lastName = row.lastName ?? "";
    const displayName = row.displayName ?? `${firstName} ${lastName}`.trim();

    return {
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      name: displayName,
      firstName,
      lastName,
      displayName,
      avatarUrl: row.avatarUrl ?? null,
      phoneNumber: row.phoneNumber ?? null,
      bio: row.bio ?? null,
      language: row.language ?? "en-US",
      timezone: row.timezone ?? "UTC",
    };
  }
}
```

- [ ] **Step 4: Write the GraphQL schema, arg-mapper and handlers**

`graphql/schema/queries.ts`:

```ts
import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { currentUserReadModel } from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * READ-side GraphQL schema for the user BC. Queries ONLY — the
 * read=queries-only fitness gate asserts this.
 */
export const getCurrentUser = defineQuery({
  input: zodSchema(z.object({})),
  output: zodSchema(currentUserReadModel),
  docs: { summary: "The authenticated user's profile", tags: ["User"] },
});

export const userReadSchema = defineGraphQLSchema(
  { user: { me: getCurrentUser } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
```

`graphql/handlers/arg-mappers.ts`:

```ts
import type { NtizoGraphqlContext } from "../../../../graphql/context";
import { requireRequesterUserId } from "../../../../graphql/context";
import type { GetCurrentUserProjectionInput } from "../../app/ports/inbound";

/** The session — never the args — supplies the requester id. */
export function mapGetCurrentUserInput(
  ctx: NtizoGraphqlContext,
): GetCurrentUserProjectionInput {
  return { requestedByUserId: requireRequesterUserId(ctx) };
}
```

`graphql/handlers/queries.handlers.ts`:

```ts
import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { GetCurrentUserProjectionPort } from "../../app/ports/inbound";
import { userReadSchema } from "../schema/queries";
import { mapGetCurrentUserInput } from "./arg-mappers";

export interface UserReadModule {
  readonly getCurrentUser: GetCurrentUserProjectionPort;
}

export function createUserReadHandlers(readModule: UserReadModule) {
  return graphqlRoutes(userReadSchema)
    .handleWithUseCase("user.me", {
      argsMapper: (_args, ctx) => mapGetCurrentUserInput(asNtizoGraphqlContext(ctx)),
      useCase: readModule.getCurrentUser,
      responseMapper: (output) => output,
    })
    .build();
}
```

`bootstrap/index.ts`:

```ts
import { DrizzleUserReadRepository } from "../infra/repositories/drizzle/user-read.repository";
import { GetCurrentUserProjection } from "../app/use-cases/get-current-user.projection";
import type { UserReadModule } from "../graphql/handlers/queries.handlers";

export function bootstrapUserRead(): {
  adapters: { userReadRepository: DrizzleUserReadRepository };
  useCases: UserReadModule;
} {
  const userReadRepository = new DrizzleUserReadRepository();
  return {
    adapters: { userReadRepository },
    useCases: { getCurrentUser: new GetCurrentUserProjection(userReadRepository) },
  };
}

export type UserReadBootstrap = ReturnType<typeof bootstrapUserRead>;
```

`index.ts`:

```ts
export * from "./bootstrap";
export { userReadSchema } from "./graphql/schema/queries";
export {
  createUserReadHandlers,
  type UserReadModule,
} from "./graphql/handlers/queries.handlers";
export type * from "./app/ports/inbound";
```

- [ ] **Step 5: Run the tests**

Run: `bun test packages/backend/src/modules/ntizo/read/user`
Expected: PASS, 4 tests.

- [ ] **Step 6: Break-check the session-not-args property**

Temporarily change `mapGetCurrentUserInput` to read `requestedByUserId` from an
args parameter instead of the context. Re-run. The anonymous test must fail.
Restore, re-run, confirm green. A test that cannot fail is not a gate.

- [ ] **Step 7: Merge into the read schema**

`packages/backend/src/modules/ntizo/read/schema.ts` currently does a direct
assignment — there is no merge call to copy, because provider is the only read
slice today. This task introduces the merge:

```ts
import { mergeGraphQLSchemas } from "@cosmneo/onion-lasagna/graphql/field";
import { providerReadSchema } from "./provider/graphql/schema/queries";
import { userReadSchema } from "./user/graphql/schema/queries";

/** The READ-side schema barrel — queries only, across all bounded contexts. */
export const readSchema = mergeGraphQLSchemas(providerReadSchema, userReadSchema);
```

`mergeGraphQLSchemas` is already used by `graphql/private-schema.ts` to combine
read and write, so the import path is proven.

- [ ] **Step 8: Full suite and commit**

```bash
bun run check-types && bun run lint && bun run test && bun run build
git add -A && git commit -m "feat(backend): read/user slice (user.me)"
```

---

### Task 2: Mount `read/user` in the API

**Files:**
- Modify: `apps/backend/api/src/graphql/private.ts`

**Interfaces:**
- Consumes: `bootstrapUserRead`, `createUserReadHandlers` from `@ntizo/backend/modules/ntizo/read/user`
- Produces: a live `userMe` field on `/graphql`

- [ ] **Step 1: Register the handlers**

In `getYoga`, add `const userRead = bootstrapUserRead();` next to the existing
bootstraps, and spread `...createUserReadHandlers(userRead.useCases)` into the
`fields` array after the provider handlers.

- [ ] **Step 2: Verify against the live schema**

```bash
cd apps/backend/api && bun run dev   # needs Node >= 22: PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
```

Then confirm the field exists and is named as the kit flattens it:

```bash
curl -s -X POST http://localhost:8788/graphql \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' \
  -d '{"query":"{ __schema { queryType { fields { name } } } }"}'
```

Expected: the list contains `userMe` (not `user_me`, not `me`).

- [ ] **Step 3: Verify it requires a session**

Call `userMe` with no cookie. Expected: an error, and `data.userMe` null —
the same posture as `providerMine`.

- [ ] **Step 4: Verify it returns real data**

Sign in as a real user, call `{ userMe(input:{}) { id email role } }` with the
cookie, and confirm the returned `role` matches the database row for that user.
This is the one check that proves the whole chain, not just the wiring.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(api): mount read/user alongside read/provider"
```

---

### Task 3: Frontend cutover to `userMe`

**Files:**
- Create: `apps/frontend/web/src/features/user/domain/current-user.ts`
- Create: `apps/frontend/web/src/features/user/data/user.repository.ts`
- Modify: `apps/frontend/web/eslint.config.js`
- Modify: every caller found by `grep -rn "fetchCurrentUser\|api/me" apps/frontend/web/src`

**Interfaces:**
- Consumes: `sessionGraphql` and `GraphqlError` from `@/shared/lib/graphql/session-graphql`
- Produces: `userQueries.me()` — a TanStack Query options object, matching the shape `providerQueries.mine()` already returns

> **There are three duplicate fetchers today**, not one:
> `shared/lib/api/me.ts`, `features/admin/dashboard/hooks/use-current-user.ts`,
> and `features/account/hooks/use-current-user.ts`. All three hit
> `${API_BASE_URL}/api/me` with their own copy of the fetch. They collapse onto
> the single repository here. Migrating only the first would leave two live REST
> callers and make Task 4 break the app.

- [ ] **Step 1: Read the provider repository first**

Read `apps/frontend/web/src/features/provider/data/provider.repository.ts` in
full. Match its document style, its query-key convention, and its error
handling. Do not invent a second convention.

- [ ] **Step 2: Write the domain type**

`features/user/domain/current-user.ts` — re-export the `CurrentUserDTO` shape
the app needs. Zero imports from `data/` or `ui/` (boundaries lint enforces it).

- [ ] **Step 3: Write the repository**

`features/user/data/user.repository.ts`, with the GraphQL document:

```graphql
query UserMe { userMe(input: {}) { id email role status createdAt name firstName lastName displayName avatarUrl phoneNumber bio language timezone } }
```

Export `userQueries.me()` returning `{ queryKey: ["user", "me"], queryFn }`.

- [ ] **Step 4: Validate the document against the live schema**

Send the exact query string to `/graphql` with a valid cookie. Every selected
field must resolve. A field name that does not exist fails the whole query, so
a typo here is not a partial degradation.

- [ ] **Step 5: Migrate all three callers, delete the duplicates**

Update `post-login.ts`, `zone-switcher.tsx`, `routes/admin/route.tsx`, and both
`use-current-user.ts` hooks to consume `userQueries.me()`. Delete the two hook
files and `shared/lib/api/me.ts`.

- [ ] **Step 6: Classify the new folder in boundaries lint**

Add `features/user/**` to `eslint.config.js` with the same element types and
policies `features/provider/**` already has. Then break-check: add a
`features/user/data/` import into `features/user/domain/` and confirm lint
errors. Remove it.

- [ ] **Step 7: Verify no REST caller remains**

```bash
grep -rn "api/me" apps/frontend/web/src   # must return nothing
```

- [ ] **Step 8: Full suite and commit**

```bash
bun run check-types && bun run lint && bun run test && bun run build
git commit -am "feat(web): read the current user over GraphQL; drop three duplicate fetchers"
```

---

### Task 4: Retire the REST `/api/me`

**Files:**
- Delete: `apps/backend/api/src/http/user.router.ts`
- Modify: `apps/backend/api/src/api.ts` (remove the import and the `app.route("/api", ...)` line)

- [ ] **Step 1: Confirm nothing still calls it**

```bash
grep -rn "api/me" apps/ packages/ --exclude-dir=node_modules --exclude-dir=dist
```

Expected: no hits outside docs. If anything remains, stop — Task 3 is incomplete.

- [ ] **Step 2: Delete the router and its mount**

- [ ] **Step 3: Verify the endpoint is gone and the app still works**

Start the API and confirm `GET /api/me` returns 404. Then run the web app,
sign in, and confirm the provider dashboard and zone switcher still populate —
they were the REST endpoint's real consumers.

- [ ] **Step 4: Confirm the BC use case is still reachable**

`GetCurrentUserUseCase` in `bounded-contexts/user/` loses its only adapter here.
Confirm it is still exported and still compiles. If nothing references it,
say so in the commit body rather than deleting it silently — that is a
separate decision.

- [ ] **Step 5: Full suite and commit**

```bash
bun run check-types && bun run lint && bun run test && bun run build
git commit -am "chore(api): retire REST /api/me; GraphQL is the only client surface"
```

---

### Task 5: `@ntizo/auth-client` package

**Files:**
- Create: `packages/auth-client/{package.json,tsconfig.json,src/index.ts}`
- Modify: `apps/frontend/web/src/shared/lib/api/auth-client.ts`
- Modify: `apps/frontend/web/package.json` (add the dependency)

> **The package goes at `packages/auth-client/`, not `packages/frontend/auth-client/`.**
> The root workspace globs are `["apps/frontend/*","apps/backend/*","apps/mobile/*","packages/*","packages/tooling/*"]`,
> and `packages/frontend` is not a directory of packages — it *is* a package,
> `@ntizo/frontend-ui`. Nesting under it would place the new package outside
> every workspace glob, so `bun install` would never link it and the import
> would fail to resolve.

**Interfaces:**
- Produces: `authClient`, `useSession`, `signOut`, `API_BASE_URL`

> **`inferAdditionalFields` is missing `role`.** The backend declares three
> additional fields in `packages/backend/src/modules/better-auth/lib/better-auth.ts`
> — `firstName`, `lastName` and `role` — but the client infers only the first
> two. The session object carries `role` at runtime (verified live), so this is
> a type-level blind spot, not a data gap: `session.user.role` does not
> typecheck today. Fix it while moving the file.

- [ ] **Step 1: Read the existing frontend package first**

Read `packages/frontend/package.json` and `tsconfig.json` — that is
`@ntizo/frontend-ui`, the closest precedent. It publishes source directly
(`exports: { ".": "./src/index.ts" }`) with no build step. Match that exactly:
same `exports` shape, same no-build posture, same TS config extension. Do not
introduce a second packaging convention.

- [ ] **Step 2: Create the package with the role field added**

`src/index.ts` carries the current `auth-client.ts` content plus:

```ts
    inferAdditionalFields({
      user: {
        firstName: { type: "string", required: true },
        lastName: { type: "string", required: true },
        // Declared by the backend and present on the session at runtime.
        // Without it here, session.user.role does not typecheck.
        role: { type: "string", required: false },
      },
    }),
```

- [ ] **Step 3: Re-export from the app**

`apps/frontend/web/src/shared/lib/api/auth-client.ts` becomes a re-export, so
the ~20 existing `@/shared/lib/api/auth-client` importers keep working
unchanged. Do not rewrite every import site in this task.

- [ ] **Step 4: Prove the role field now typechecks**

Add a temporary line reading `session.user.role` in a typed context, run
`bun run check-types`, confirm it passes, then remove it. Before the fix this
line fails — confirm that too by reverting the `role:` entry once.

- [ ] **Step 5: Full suite and commit**

```bash
bun run check-types && bun run lint && bun run test && bun run build
git commit -am "feat(frontend): extract @ntizo/auth-client; infer the role field"
```

---

### Task 6: Full verification

- [ ] **Step 1: Root sweep**

```bash
bun run check-types && bun run lint && bun run test && bun run build
```

- [ ] **Step 2: Live end-to-end**

Start API and web. Sign in. Confirm:
- `userMe` returns the signed-in user with the correct `role`
- the provider dashboard populates
- the zone switcher shows only accessible zones
- `/admin` still guards correctly
- zero console errors

- [ ] **Step 3: Confirm REST is gone**

`GET /api/me` → 404. `grep -rn "api/me" apps/ packages/` → nothing outside docs.

- [ ] **Step 4: Confirm the fitness gates still hold**

`read/user` must contain queries only. Run the tier-segregation test and
confirm it covers the new slice — if it enumerates contexts explicitly rather
than globbing, add `user` to it, then break-check by adding a mutation to
`read/user` and confirming the gate fails.

- [ ] **Step 5: Record what remains**

Carry forward:
- admin authorization rules still unwritten — `platformRole` is now correct end-to-end but nothing reads it
- `#/` remains a single-import beachhead against ~84 `@/`
- deploys still gated on `DEPLOY_ENABLED`; route hostnames still placeholders
- the SSR hydration payload still carries 3 NUL bytes — re-check behind a CDN on first deploy

- [ ] **Step 6: Commit**

```bash
git commit --allow-empty -m "chore: Phase 2 complete — user slice on GraphQL, REST retired"
```
