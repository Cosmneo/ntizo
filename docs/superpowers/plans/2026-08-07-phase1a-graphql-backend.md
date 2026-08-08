# Phase 1A — Workers Runtime + GraphQL Backend (Provider Slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `apps/backend/api` to Cloudflare Workers and stand up a GraphQL API — built on `@cosmneo/onion-lasagna` with a read/write CQRS tier split — serving the Provider bounded context alongside the existing REST endpoints.

**Architecture:** `packages/backend` gains `read/provider/` (queries, own repositories and bootstrap, no aggregate hydration) and `write/provider/` (mutations delegating to the existing BC use-cases). Field *definitions* use only the core kit + zod; the Hono/Yoga *binding* lives exclusively in `apps/backend/api`. REST stays live throughout — the frontend cutover is Plan 1B.

**Tech Stack:** Bun, Cloudflare Workers (wrangler), Hono, GraphQL Yoga, `@cosmneo/onion-lasagna` 1.0.0-beta.3, Drizzle, Zod, better-auth.

**Spec:** `docs/superpowers/specs/2026-08-07-doazores-pattern-adoption-design.md`

## Global Constraints

- All seven `@cosmneo/*` versions pinned **exactly** to `1.0.0-beta.3` in the workspace-root `overrides`. Never a caret range: `latest` is `0.4.1`, a different API.
- `packages/backend` must **never** import `@cosmneo/onion-lasagna-hono`, `hono`, or `graphql-yoga`. Field definitions use `@cosmneo/onion-lasagna/*` and `@cosmneo/onion-lasagna-zod` only.
- `read/**` exposes `defineQuery` **only**. `write/**` exposes `defineMutation` **only**.
- Package naming stays `@ntizo/*`. Do not adopt `@repo/*`.
- The Provider REST router keeps working until Plan 1B. Do not delete it here.
- **Database access:** obtain the handle with `getDb()` from
  `modules/better-auth/infrastructure/client/drizzle` — the convention every
  existing ntizo repository already follows. (A lazy `db` Proxy is also
  exported for legacy callers; do not use it in new code.) Sharing the
  *connection* is fine and expected. What is forbidden is **reading
  better-auth's tables** (`better_auth.user`) from ntizo code — member names
  and emails come from ntizo's own `ntizo_user.user` + `ntizo_user.profile`.
- **Scope of "it works" in this plan is local `wrangler dev` only.** Deployed
  stages additionally need a Hyperdrive binding (see Task 1 Step 4); that is an
  ops step requiring the Cloudflare account and is out of scope here.
- Every task ends green: `bun run typecheck` in each changed workspace.
- **Any task that verifies against a running server must make at least two
  authenticated DB round-trips on the same server process.** A single call
  passes even when connections are broken across requests — that is exactly how
  the Task 1 regression reached review undetected.
- `wrangler` requires Node ≥ 22; the default on this machine is v20. Run
  `nvm use 22` before `bun run dev` in `apps/backend/api`.

---

### Task 1: Pin the kit and swap the API to Cloudflare Workers

**Files:**
- Modify: `ntizo-workspace/package.json` (overrides block)
- Modify: `ntizo-workspace/apps/backend/api/package.json`
- Modify: `ntizo-workspace/apps/backend/api/src/index.ts`
- Modify: `ntizo-workspace/apps/backend/api/src/middlewares/config.middleware.ts`
- Modify: `ntizo-workspace/apps/backend/api/tsconfig.json`
- Create: `ntizo-workspace/apps/backend/api/wrangler.jsonc`

**Interfaces:**
- Produces: a Workers `fetch` default export; `AppBindings` carrying env vars from `c.env` rather than `process.env`.

- [ ] **Step 1: Pin all seven kit packages**

In `ntizo-workspace/package.json`, replace the `overrides` block's `@cosmneo/*` entries with exactly:

```json
  "overrides": {
    "@cosmneo/onion-lasagna": "1.0.0-beta.3",
    "@cosmneo/onion-lasagna-saga": "1.0.0-beta.3",
    "@cosmneo/onion-lasagna-zod": "1.0.0-beta.3",
    "@cosmneo/onion-lasagna-hono": "1.0.0-beta.3",
    "@cosmneo/onion-lasagna-yoga": "1.0.0-beta.3",
    "@cosmneo/onion-lasagna-graphql-client": "1.0.0-beta.3",
    "@cosmneo/onion-lasagna-graphql-react-query": "1.0.0-beta.3",
    "lightningcss": "1.30.1"
  }
```

- [ ] **Step 2: Fix the pre-existing `bun-types` typecheck failure**

`apps/backend/api/tsconfig.json` sets `"types": ["bun-types"]` but the package depends on `@types/bun`. Under Workers it needs neither. Replace the `types` entry:

```json
{
  "extends": "@ntizo/typescript-config/base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Add Workers dependencies**

```bash
cd ntizo-workspace/apps/backend/api
bun add -d wrangler@^4 @cloudflare/workers-types
bun remove @types/bun
```

- [ ] **Step 4: Write `wrangler.jsonc`**

Create `ntizo-workspace/apps/backend/api/wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ntizo-api",
  "main": "src/index.ts",
  "compatibility_date": "2026-02-12",
  "compatibility_flags": ["nodejs_compat"],
  "vars": { "STAGE": "local", "LOG_LEVEL": "info" },
  "env": {
    "dev":  { "vars": { "STAGE": "dev",  "LOG_LEVEL": "info" } },
    "qa":   { "vars": { "STAGE": "qa",   "LOG_LEVEL": "info" } },
    "prod": { "vars": { "STAGE": "prod", "LOG_LEVEL": "warn" } }
  }
}
```

Secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, OAuth pairs) are **never** committed here — they go in `.dev.vars` locally and `wrangler secret` per stage.

> **Hyperdrive — required before any deploy, deliberately absent locally.**
> `postgres.js` opens raw TCP sockets. Under local `wrangler dev` (Miniflare +
> `nodejs_compat`) that works against Neon directly, which is all Phase 1A
> verifies. A *deployed* Worker cannot, so each stage needs a Hyperdrive
> binding — this is exactly what the reference project does (its config notes
> "Hyperdrive is intentionally absent [locally] — local DB comes from the
> `DB_URL` fallback").
>
> Provisioning needs the Cloudflare account and is **out of scope for this
> plan**. When you do deploy, run per stage:
>
> ```bash
> wrangler hyperdrive create ntizo-db-dev --connection-string="<neon url>"
> ```
>
> then add the returned id under that stage:
>
> ```jsonc
> "dev": {
>   "vars": { "STAGE": "dev", "LOG_LEVEL": "info" },
>   "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<id from the command above>" }]
> }
> ```
>
> and have `getDb()` prefer `env.HYPERDRIVE.connectionString` over
> `DATABASE_URL` when the binding is present. **Do not** attempt this in Task 1
> — `bun run deploy:dev` is expected to fail until it is done, and Task 1's
> definition of done is local `wrangler dev` only.

- [ ] **Step 5: Create `.dev.vars` from the existing `.env`**

Workers reads `.dev.vars`, not `.env`. Copy the values across:

```bash
cd ntizo-workspace/apps/backend/api
cp .env .dev.vars
echo ".dev.vars" >> .gitignore
```

- [ ] **Step 6: Convert the entrypoint to a Workers default export**

Replace `ntizo-workspace/apps/backend/api/src/index.ts` entirely:

```ts
import { app } from "./api";
import type { AppBindings } from "./types";

export default {
  fetch(request: Request, env: AppBindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
};
```

- [ ] **Step 7: Read config from `c.env`, not `process.env`**

Replace the body of `config.middleware.ts`. Under Workers `process.env` is empty — bindings arrive on the Hono context:

```ts
import type { MiddlewareHandler } from "hono";
import { infraStore } from "@ntizo/backend/shared/infra";
import type { Stage } from "@ntizo/backend/shared/infra/config";
import type { AppBindings } from "../types";

/**
 * Populates the process-wide infraStore from Worker bindings.
 * Must run before any handler that touches the DB or better-auth.
 */
export const configMiddleware: MiddlewareHandler<{
  Bindings: AppBindings;
}> = async (c, next) => {
  const env = c.env;
  infraStore.setEnv({
    STAGE: (env.STAGE as Stage) ?? "local",
    LOG_LEVEL: env.LOG_LEVEL ?? "info",
    DATABASE_URL: env.DATABASE_URL ?? "",
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
    RESEND_API_KEY: env.RESEND_API_KEY ?? "",
    EMAIL_FROM: env.EMAIL_FROM ?? "Ntizo <noreply@ntizo.com>",
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID ?? "",
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET ?? "",
    MICROSOFT_CLIENT_ID: env.MICROSOFT_CLIENT_ID ?? "",
    MICROSOFT_CLIENT_SECRET: env.MICROSOFT_CLIENT_SECRET ?? "",
  });
  await next();
};
```

- [ ] **Step 8: Widen `AppBindings`**

Replace `ntizo-workspace/apps/backend/api/src/types.ts`:

```ts
import type { InfraEnvBindings } from "@ntizo/backend/shared/infra";

/** Worker bindings = the infra env vars, supplied by wrangler vars + secrets. */
export type AppBindings = InfraEnvBindings;
```

- [ ] **Step 9: Point the dev script at wrangler**

In `apps/backend/api/package.json` scripts, replace `dev` and `start`:

```json
    "dev": "wrangler dev --port 8788",
    "deploy:dev": "wrangler deploy --env dev",
    "deploy:qa": "wrangler deploy --env qa",
    "deploy:prod": "wrangler deploy --env prod",
    "typecheck": "tsc --noEmit"
```

- [ ] **Step 10: Verify the Worker boots and serves**

```bash
cd ntizo-workspace/apps/backend/api
bun run dev &
sleep 8
curl -s http://localhost:8788/
```

Expected: `{"status":"ok","service":"ntizo-api"}`

Then verify auth still round-trips against the database:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8788/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","password":"wrongpassword"}'
```

Expected: `401` (not `500` — a 500 means `DATABASE_URL` didn't reach the Worker from `.dev.vars`).

- [ ] **Step 11: Typecheck and commit**

```bash
cd ntizo-workspace/apps/backend/api && bun run typecheck
cd ../../.. && git add apps/backend/api package.json
git commit -m "feat(api): run on Cloudflare Workers; pin onion-lasagna 1.0.0-beta.3"
```

---

### Task 1b: Per-request database connections (Workers correctness)

**Why this task exists.** Task 1's live verification found `GET /api/me`
returning 500 under `wrangler dev`:

```
Cannot perform I/O on behalf of a different request. I/O objects ... created in
the context of one request handler cannot be accessed from a different request's
handler.  at postgres/cf/polyfills.js:182
```

`getDb()` caches one postgres pool at module scope. Workers forbid reusing a
socket across requests, so the first DB call in a fresh isolate succeeds and
every later one fails. `infraStore` has the same flaw one level up: it is an
isolate-wide singleton, so concurrent requests in one isolate can overwrite each
other's env.

The reference solves both with `AsyncLocalStorage`: env **and** connection are
request-scoped, and the pool is released via `executionCtx.waitUntil`. This task
ports that. Tasks 4–6 all build on `getDb()`, so it must land first.

**Files:**
- Modify: `ntizo-workspace/packages/backend/src/shared/infrastructure/stores/infra-store.ts`
- Create: `ntizo-workspace/packages/backend/src/shared/infrastructure/database/connection.ts`
- Modify: `ntizo-workspace/packages/backend/src/modules/better-auth/infrastructure/client/drizzle.ts`
- Modify: `ntizo-workspace/apps/backend/api/src/middlewares/config.middleware.ts`
- Modify: `ntizo-workspace/packages/backend/package.json` (exports)
- Test: `ntizo-workspace/packages/backend/src/shared/infrastructure/database/__tests__/connection.test.ts`

**Interfaces:**
- Produces: `infraStore.runAsync(env, fn)`, `infraStore.getDbConnection()`,
  `infraStore.setDbConnection()`, `infraStore.setHyperdrive()`,
  `infraStore.getConnectionString()`; `Db.getDbConnection()`,
  `Db.closeDbConnection()`. `getDb()` keeps its existing signature so all ~10
  existing repositories compile unchanged.

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/shared/infrastructure/database/__tests__/connection.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { infraStore } from "../../stores/infra-store";

const env = {
  STAGE: "local" as const,
  LOG_LEVEL: "info",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "s",
  RESEND_API_KEY: "",
  EMAIL_FROM: "a@b.c",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  MICROSOFT_CLIENT_ID: "",
  MICROSOFT_CLIENT_SECRET: "",
};

describe("infraStore request scoping", () => {
  it("throws outside a request scope instead of leaking another request's env", () => {
    expect(() => infraStore.getEnv()).toThrow();
  });

  it("isolates env between concurrent scopes", async () => {
    const seen: string[] = [];
    await Promise.all([
      infraStore.runAsync({ ...env, STAGE: "dev" }, async () => {
        await new Promise((r) => setTimeout(r, 10));
        seen.push(infraStore.getEnv().STAGE);
      }),
      infraStore.runAsync({ ...env, STAGE: "qa" }, async () => {
        seen.push(infraStore.getEnv().STAGE);
      }),
    ]);
    expect(seen.sort()).toEqual(["dev", "qa"]);
  });

  it("keeps the db connection slot per-scope", async () => {
    await infraStore.runAsync(env, async () => {
      expect(infraStore.getDbConnection()).toBeUndefined();
      infraStore.setDbConnection({
        drizzleDbClient: {} as never,
        postgresDbClient: {} as never,
      });
      expect(infraStore.getDbConnection()).toBeDefined();
    });
    // A separate scope must not see the previous scope's connection.
    await infraStore.runAsync(env, async () => {
      expect(infraStore.getDbConnection()).toBeUndefined();
    });
  });

  it("prefers the Hyperdrive connection string when the binding is present", async () => {
    await infraStore.runAsync(env, async () => {
      expect(infraStore.getConnectionString()).toBe(env.DATABASE_URL);
      infraStore.setHyperdrive({ connectionString: "postgresql://hyper/db" });
      expect(infraStore.getConnectionString()).toBe("postgresql://hyper/db");
    });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd ntizo-workspace/packages/backend && bun test src/shared/infrastructure/database`
Expected: FAIL — `runAsync`, `getDbConnection`, `getConnectionString` do not exist.

- [ ] **Step 3: Convert `infra-store.ts` to AsyncLocalStorage**

Replace the whole file:

```ts
import { AsyncLocalStorage } from "node:async_hooks";
import type { Stage } from "../config/stage-properties";

export interface InfraEnvBindings {
  STAGE: Stage;
  LOG_LEVEL: string;
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
}

/** A Cloudflare Hyperdrive binding — only the field we consume. */
export interface HyperdriveBinding {
  readonly connectionString: string;
}

export interface DbConnection {
  drizzleDbClient: unknown;
  postgresDbClient: unknown;
}

interface InfraStoreData {
  env: InfraEnvBindings;
  dbConnection?: DbConnection;
  hyperdrive?: HyperdriveBinding;
}

/**
 * Request-scoped infrastructure store.
 *
 * Backed by AsyncLocalStorage because Cloudflare Workers share module scope
 * across every request an isolate handles. An isolate-wide singleton would let
 * concurrent requests overwrite each other's env, and — worse — share a
 * postgres socket, which Workers reject with "Cannot perform I/O on behalf of a
 * different request".
 */
class InfraStore {
  private readonly storage = new AsyncLocalStorage<InfraStoreData>();

  async runAsync<T>(env: InfraEnvBindings, fn: () => Promise<T>): Promise<T> {
    return this.storage.run({ env }, fn);
  }

  private require(): InfraStoreData {
    const store = this.storage.getStore();
    if (!store) {
      throw new Error(
        "[infra-store] not initialized. Ensure configMiddleware wraps the request before reading infra state.",
      );
    }
    return store;
  }

  getEnv(): InfraEnvBindings {
    return this.require().env;
  }

  isInContext(): boolean {
    return this.storage.getStore() !== undefined;
  }

  getDbConnection(): DbConnection | undefined {
    return this.storage.getStore()?.dbConnection;
  }

  setDbConnection(connection: DbConnection): void {
    this.require().dbConnection = connection;
  }

  setHyperdrive(binding: HyperdriveBinding | undefined): void {
    if (binding) this.require().hyperdrive = binding;
  }

  /**
   * Hyperdrive's pooled string when the binding exists (deployed stages),
   * else the direct DATABASE_URL (local `wrangler dev`).
   */
  getConnectionString(): string {
    const store = this.require();
    return store.hyperdrive?.connectionString ?? store.env.DATABASE_URL;
  }
}

export const infraStore = new InfraStore();
```

> `setEnv` is deliberately gone — it was the isolate-wide mutation that caused
> the bug. Any remaining caller must move inside `runAsync`.

- [ ] **Step 4: Add the per-request connection module**

Create `packages/backend/src/shared/infrastructure/database/connection.ts`:

```ts
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../../../modules/better-auth/infrastructure/database/schema";
import { infraStore } from "../stores/infra-store";

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Serverless-friendly connector. Each REQUEST gets its own pool, cached on the
 * AsyncLocalStorage store and released by the config middleware via
 * `executionCtx.waitUntil` — Workers run nothing after the response otherwise,
 * so an unreleased socket leaks for the isolate's lifetime.
 */
export class Db {
  static getDbConnection(): { drizzleDbClient: DrizzleDb; postgresDbClient: postgres.Sql } {
    const existing = infraStore.getDbConnection();
    if (existing) {
      return {
        drizzleDbClient: existing.drizzleDbClient as DrizzleDb,
        postgresDbClient: existing.postgresDbClient as postgres.Sql,
      };
    }

    // Per Cloudflare guidance: keep the per-request pool at 1 and give every
    // socket a bounded lifetime so leaks self-heal if the release hook is
    // skipped because the isolate was evicted.
    const sql = postgres(infraStore.getConnectionString(), {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      max_lifetime: 60 * 5,
      fetch_types: false,
      prepare: false,
    });
    const drizzleClient = drizzle(sql, { schema });

    infraStore.setDbConnection({
      drizzleDbClient: drizzleClient,
      postgresDbClient: sql,
    });
    return { drizzleDbClient: drizzleClient, postgresDbClient: sql };
  }

  /** Best-effort release. No-op when nothing was opened; never throws. */
  static async closeDbConnection(timeoutSeconds = 5): Promise<void> {
    const existing = infraStore.getDbConnection();
    if (!existing) return;
    try {
      await (existing.postgresDbClient as postgres.Sql).end({ timeout: timeoutSeconds });
    } catch {
      // The response is already sent; max_lifetime is the backstop.
    }
  }
}
```

- [ ] **Step 5: Repoint `getDb()` — keep every existing repository compiling**

Replace `modules/better-auth/infrastructure/client/drizzle.ts`:

```ts
import { Db } from "../../../../shared/infrastructure/database/connection";

/**
 * The per-request drizzle client. Signature unchanged, so all existing
 * repositories keep working — but the handle is now scoped to the current
 * request instead of the isolate.
 */
export function getDb() {
  return Db.getDbConnection().drizzleDbClient;
}

/** Legacy lazy proxy. Resolves per property access, so it picks up the
 *  current request's connection. Do not use in new code — call getDb(). */
export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_t, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
```

- [ ] **Step 6: Wrap the request in the scope and release the pool**

Replace `apps/backend/api/src/middlewares/config.middleware.ts`:

```ts
import type { MiddlewareHandler } from "hono";
import { infraStore } from "@ntizo/backend/shared/infra";
import { Db } from "@ntizo/backend/shared/infra/database";
import type { Stage } from "@ntizo/backend/shared/infra/config";
import type { AppBindings } from "../types";

/**
 * Establishes the request-scoped infra context and guarantees the per-request
 * postgres pool is released. Must wrap every handler that touches the DB.
 */
export const configMiddleware: MiddlewareHandler<{ Bindings: AppBindings }> = async (
  c,
  next,
) => {
  const env = c.env;
  await infraStore.runAsync(
    {
      STAGE: (env.STAGE as Stage) ?? "local",
      LOG_LEVEL: env.LOG_LEVEL ?? "info",
      DATABASE_URL: env.DATABASE_URL ?? "",
      BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
      RESEND_API_KEY: env.RESEND_API_KEY ?? "",
      EMAIL_FROM: env.EMAIL_FROM ?? "Ntizo <noreply@ntizo.com>",
      GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID ?? "",
      GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET ?? "",
      MICROSOFT_CLIENT_ID: env.MICROSOFT_CLIENT_ID ?? "",
      MICROSOFT_CLIENT_SECRET: env.MICROSOFT_CLIENT_SECRET ?? "",
    },
    async () => {
      infraStore.setHyperdrive(
        (c.env as unknown as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE,
      );
      try {
        return await next();
      } finally {
        // Workers run nothing after the response unless scheduled.
        try {
          c.executionCtx.waitUntil(Db.closeDbConnection());
        } catch {
          void Db.closeDbConnection();
        }
      }
    },
  );
};
```

- [ ] **Step 7: Export the database module**

Add to `packages/backend/package.json` `exports`:

```json
    "./shared/infra/database": "./src/shared/infrastructure/database/connection.ts"
```

- [ ] **Step 8: Run the unit tests**

Run: `cd ntizo-workspace/packages/backend && bun test src/shared/infrastructure/database`
Expected: PASS (4 tests).

- [ ] **Step 9: Typecheck both workspaces**

```bash
cd ntizo-workspace/packages/backend && bun run typecheck
cd ../../apps/backend/api && bun run typecheck
```

Expected: clean. If a file still calls `infraStore.setEnv(...)`, move it inside `runAsync` — do not re-add `setEnv`.

- [ ] **Step 10: Prove the regression is fixed — the check Task 1 lacked**

`wrangler` needs Node ≥ 22 (`nvm use 22`). Start the Worker, then make **multiple authenticated DB round-trips on one server**:

```bash
cd ntizo-workspace/apps/backend/api && bun run dev &
sleep 10
rm -f /tmp/nt.txt
curl -s -o /dev/null -c /tmp/nt.txt -X POST http://localhost:8788/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"pw.tester.0807@example.com","password":"password123"}'
for i in 1 2 3; do
  echo "round $i:"
  curl -s -b /tmp/nt.txt -o /dev/null -w "  /api/me            %{http_code}\n" http://localhost:8788/api/me
  curl -s -b /tmp/nt.txt -o /dev/null -w "  /api/providers/mine %{http_code}\n" http://localhost:8788/api/providers/mine
done
```

Expected: **200 for all six calls.** Any 500 means the connection is still being
reused across requests — re-read Step 6 before changing anything else. Before
Task 1b, `/api/me` returned 500 on exactly this sequence.

Also confirm the log is free of `Cannot perform I/O on behalf of a different request`.

- [ ] **Step 11: Commit**

```bash
cd /Users/saliffaustino/Desktop/Salif/Projects/Ntizo
git add ntizo-workspace/packages/backend ntizo-workspace/apps/backend/api
git commit -m "fix(backend): per-request DB connections and request-scoped infra store

Cloudflare Workers forbid reusing an I/O object across requests, so the
module-scope getDb() singleton made every DB call after the first in an
isolate fail. Scope env and connection to the request via AsyncLocalStorage
and release the pool through executionCtx.waitUntil."
```

---

### Task 2: Convert shared read-models to zod schemas

**Files:**
- Modify: `ntizo-workspace/packages/shared/src/read-models/system/provider/provider-list-item.schema.ts`
- Modify: `ntizo-workspace/packages/shared/src/read-models/system/user/current-user.schema.ts`
- Create: `ntizo-workspace/packages/shared/src/read-models/system/provider/provider-detail.schema.ts`
- Modify: `ntizo-workspace/packages/shared/src/read-models/system/provider/index.ts`
- Modify: `ntizo-workspace/packages/shared/package.json`
- Test: `ntizo-workspace/packages/shared/src/read-models/__tests__/read-models.test.ts`

**Interfaces:**
- Produces: `providerListItemReadModel`, `providerDetailReadModel`, `currentUserReadModel` (zod schemas) plus their inferred types `ProviderListItemDTO`, `ProviderDetailDTO`, `CurrentUserDTO`. Tasks 4 and 5 use these as GraphQL `output` schemas.

- [ ] **Step 1: Add zod and a test script to `@ntizo/shared`**

```bash
cd ntizo-workspace/packages/shared
bun add zod
bun add -d vitest
```

Add to `packages/shared/package.json` scripts:

```json
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
```

- [ ] **Step 2: Write the failing test**

Create `ntizo-workspace/packages/shared/src/read-models/__tests__/read-models.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  providerListItemReadModel,
  providerDetailReadModel,
} from "../system/provider";
import { currentUserReadModel } from "../system/user";

describe("providerListItemReadModel", () => {
  it("accepts a well-formed list item", () => {
    const parsed = providerListItemReadModel.parse({
      id: "952c41ea-299a-4e1f-a05f-a68f52a112af",
      name: "Playwright's Org",
      slug: "playwright-s-org",
      type: "organization",
      status: "active",
      role: "owner",
    });
    expect(parsed.role).toBe("owner");
  });

  it("rejects an unknown provider type", () => {
    expect(() =>
      providerListItemReadModel.parse({
        id: "x", name: "n", slug: "s", type: "sole_trader",
        status: "active", role: "owner",
      }),
    ).toThrow();
  });
});

describe("providerDetailReadModel", () => {
  it("accepts members and invites", () => {
    const parsed = providerDetailReadModel.parse({
      id: "p1", name: "Org", slug: "org", type: "organization",
      status: "active", description: null, ownerUserId: "u1",
      members: [{ userId: "u1", email: "a@b.c", name: "A B", role: "owner", joinedAt: "2026-08-07T00:00:00.000Z" }],
      invites: [{ id: "i1", email: "c@d.e", role: "staff", status: "pending" }],
    });
    expect(parsed.members).toHaveLength(1);
    expect(parsed.invites[0]!.status).toBe("pending");
  });
});

describe("currentUserReadModel", () => {
  it("accepts a profile with nullable fields unset", () => {
    const parsed = currentUserReadModel.parse({
      id: "u1", email: "a@b.c", role: "customer", status: "active",
      createdAt: "2026-08-07T00:00:00.000Z", name: "A B",
      firstName: "A", lastName: "B", displayName: "A B",
      avatarUrl: null, phoneNumber: null, bio: null,
      language: "en-US", timezone: "UTC",
    });
    expect(parsed.avatarUrl).toBeNull();
  });
});
```

- [ ] **Step 2b: Run it to confirm it fails**

Run: `cd ntizo-workspace/packages/shared && bun run test`
Expected: FAIL — `providerListItemReadModel` is not exported (the current file exports only TS interfaces).

- [ ] **Step 3: Convert the provider list item**

Replace `read-models/system/provider/provider-list-item.schema.ts`:

```ts
import { z } from "zod";

export const providerListItemType = z.enum(["individual", "organization"]);
export const providerListItemRole = z.enum(["owner", "admin", "staff"]);

/** Read model returned by the `provider.mine` query — viewer-scoped. */
export const providerListItemReadModel = z.object({
  id: z.string().min(1),
  name: z.string(),
  slug: z.string(),
  type: providerListItemType,
  status: z.string(),
  role: providerListItemRole,
});

export type ProviderListItemType = z.infer<typeof providerListItemType>;
export type ProviderListItemRole = z.infer<typeof providerListItemRole>;
export type ProviderListItemDTO = z.infer<typeof providerListItemReadModel>;
```

- [ ] **Step 4: Add the provider detail read model**

Create `read-models/system/provider/provider-detail.schema.ts`:

```ts
import { z } from "zod";
import { providerListItemRole, providerListItemType } from "./provider-list-item.schema";

export const providerMemberReadModel = z.object({
  userId: z.string().min(1),
  email: z.string(),
  name: z.string().nullable(),
  role: providerListItemRole,
  joinedAt: z.string(),
});

export const providerInviteReadModel = z.object({
  id: z.string().min(1),
  email: z.string(),
  role: z.enum(["admin", "staff"]),
  status: z.string(),
});

/** Read model returned by the `provider.byId` query. */
export const providerDetailReadModel = z.object({
  id: z.string().min(1),
  name: z.string(),
  slug: z.string(),
  type: providerListItemType,
  status: z.string(),
  description: z.string().nullable(),
  ownerUserId: z.string().min(1),
  members: z.array(providerMemberReadModel),
  invites: z.array(providerInviteReadModel),
});

export type ProviderMemberDTO = z.infer<typeof providerMemberReadModel>;
export type ProviderInviteDTO = z.infer<typeof providerInviteReadModel>;
export type ProviderDetailDTO = z.infer<typeof providerDetailReadModel>;
```

- [ ] **Step 5: Update the provider barrel**

Replace `read-models/system/provider/index.ts`:

```ts
export {
  providerListItemReadModel,
  providerListItemRole,
  providerListItemType,
  type ProviderListItemDTO,
  type ProviderListItemRole,
  type ProviderListItemType,
} from "./provider-list-item.schema";
export {
  providerDetailReadModel,
  providerMemberReadModel,
  providerInviteReadModel,
  type ProviderDetailDTO,
  type ProviderMemberDTO,
  type ProviderInviteDTO,
} from "./provider-detail.schema";
```

- [ ] **Step 6: Convert the current-user read model**

Replace `read-models/system/user/current-user.schema.ts`:

```ts
import { z } from "zod";

export const currentUserReadModel = z.object({
  id: z.string().min(1),
  email: z.string(),
  role: z.enum(["customer", "individual_provider", "organization_owner", "admin"]),
  status: z.enum(["active", "pending", "suspended"]),
  createdAt: z.string(),
  name: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  bio: z.string().nullable(),
  language: z.enum(["pt-MZ", "pt-PT", "en-US"]),
  timezone: z.string(),
});

export type CurrentUserDTO = z.infer<typeof currentUserReadModel>;
```

- [ ] **Step 7: Run the tests**

Run: `cd ntizo-workspace/packages/shared && bun run test`
Expected: PASS (3 suites).

- [ ] **Step 8: Verify no downstream type breakage**

`CurrentUserDTO` and `ProviderListItemDTO` are consumed by the web app. The inferred types are structurally identical to the old interfaces, so this must stay green:

```bash
cd ntizo-workspace/apps/frontend/web && bun run typecheck
```

Expected: clean. If `language` errors, a caller is passing a locale outside the `Locale` union — fix the caller, not the schema.

- [ ] **Step 9: Commit**

```bash
git add ntizo-workspace/packages/shared ntizo-workspace/apps/frontend/web
git commit -m "feat(shared): zod read-models for provider + current user"
```

---

### Task 3: GraphQL context for the ntizo module

**Files:**
- Create: `ntizo-workspace/packages/backend/src/modules/ntizo/graphql/context.ts`
- Modify: `ntizo-workspace/packages/backend/package.json` (deps + exports)

**Interfaces:**
- Produces: `NtizoGraphqlContext` (type), `ntizoGraphqlContextSchema` (zod), `asNtizoGraphqlContext(ctx)`. Tasks 4 and 5 attach the schema to `defaults.context` and use the caster in arg-mappers.

- [ ] **Step 1: Add the kit to `packages/backend`**

```bash
cd ntizo-workspace/packages/backend
bun add @cosmneo/onion-lasagna @cosmneo/onion-lasagna-zod zod
```

Do **not** add `-hono` or `-yoga` here — those belong to the app layer (Global Constraints).

- [ ] **Step 2: Write the context module**

Create `ntizo-workspace/packages/backend/src/modules/ntizo/graphql/context.ts`:

```ts
import { z } from "zod";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import type { GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";

/**
 * The single shape of the GraphQL context injected into every ntizo resolver,
 * across all bounded contexts. Resolved once per request from the better-auth
 * session by the API composition root and consumed by every BC's arg-mappers.
 *
 * This is the GraphQL-tier analogue of the REST-tier ExecutionContext: a slim,
 * already-authenticated projection, so use cases never re-resolve the session.
 */
export interface NtizoGraphqlContext {
  /** Authenticated user id, or null for anonymous requests. */
  readonly requesterUserId: string | null;
  readonly email: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly requestId: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export const ntizoGraphqlContextSchema = zodSchema(
  z.object({
    requesterUserId: z.string().nullable(),
    email: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    requestId: z.string().nullable(),
    ipAddress: z.string().nullable(),
    userAgent: z.string().nullable(),
  }),
);

/**
 * Narrows the kit's generic handler context to the ntizo shape. The kit
 * validates the context against `defaults.context` per request, so this is a
 * type-level narrowing, not an unchecked assertion.
 */
export function asNtizoGraphqlContext(
  ctx: GraphQLHandlerContext,
): NtizoGraphqlContext {
  return ctx as unknown as NtizoGraphqlContext;
}

/** Throws unless the request carries an authenticated user. */
export function requireRequesterUserId(ctx: NtizoGraphqlContext): string {
  if (!ctx.requesterUserId) {
    throw new Error("[graphql] unauthenticated");
  }
  return ctx.requesterUserId;
}
```

- [ ] **Step 3: Export it from the package**

Add to `packages/backend/package.json` `exports`:

```json
    "./modules/ntizo/graphql/context": "./src/modules/ntizo/graphql/context.ts",
    "./modules/ntizo/graphql/private-schema": "./src/modules/ntizo/graphql/private-schema.ts",
    "./modules/ntizo/read/provider": "./src/modules/ntizo/read/provider/index.ts",
    "./modules/ntizo/write/provider": "./src/modules/ntizo/write/provider/index.ts"
```

- [ ] **Step 4: Typecheck and commit**

```bash
cd ntizo-workspace/packages/backend && bun run typecheck
git add . && git commit -m "feat(backend): ntizo graphql context schema"
```

---

### Task 4: `read/provider` — query slice

**Files:**
- Create: `.../modules/ntizo/read/provider/app/ports/inbound/index.ts`
- Create: `.../read/provider/app/ports/outbound/provider-read.repository.port.ts`
- Create: `.../read/provider/app/use-cases/list-my-providers.projection.ts`
- Create: `.../read/provider/app/use-cases/get-provider-detail.projection.ts`
- Create: `.../read/provider/infra/repositories/drizzle/provider-read.repository.ts`
- Create: `.../read/provider/graphql/schema/queries.ts`
- Create: `.../read/provider/graphql/handlers/queries.handlers.ts`
- Create: `.../read/provider/bootstrap/index.ts`
- Create: `.../read/provider/index.ts`
- Create: `.../modules/ntizo/read/schema.ts`
- Test: `.../read/provider/__tests__/queries.handlers.test.ts`

**Interfaces:**
- Consumes: `providerListItemReadModel`, `providerDetailReadModel` (Task 2); `ntizoGraphqlContextSchema`, `asNtizoGraphqlContext`, `requireRequesterUserId` (Task 3).
- Produces: `providerReadSchema`, `createProviderReadHandlers(module)`, `bootstrapProviderRead()`, `readSchema`.

**Design note — the user-name join.** The deleted REST router joined member names by importing better-auth's drizzle client from inside the provider BC. The read repository must **not** do that. Ntizo's own `ntizo_user.user` (email) and `ntizo_user.profile` (firstName/lastName/displayName) carry everything needed, so the join stays inside the ntizo module.

- [ ] **Step 1: Outbound port**

Create `read/provider/app/ports/outbound/provider-read.repository.port.ts`:

```ts
import type { ProviderDetailDTO, ProviderListItemDTO } from "@ntizo/shared/read-models";

export interface ProviderReadRepositoryPort {
  listForUser(userId: string): Promise<ProviderListItemDTO[]>;
  findDetailById(providerId: string): Promise<ProviderDetailDTO | null>;
  isMember(providerId: string, userId: string): Promise<boolean>;
}
```

- [ ] **Step 2: Inbound ports**

Create `read/provider/app/ports/inbound/index.ts`:

```ts
import type { ProviderDetailDTO, ProviderListItemDTO } from "@ntizo/shared/read-models";

export interface ListMyProvidersProjectionInput {
  requestedByUserId: string;
}
export interface ListMyProvidersProjectionPort {
  execute(input: ListMyProvidersProjectionInput): Promise<ProviderListItemDTO[]>;
}

export interface GetProviderDetailProjectionInput {
  providerId: string;
  requestedByUserId: string;
}
export interface GetProviderDetailProjectionPort {
  execute(input: GetProviderDetailProjectionInput): Promise<ProviderDetailDTO>;
}
```

- [ ] **Step 3: Write the failing handler test**

Create `read/provider/__tests__/queries.handlers.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { createProviderReadHandlers } from "../graphql/handlers/queries.handlers";
import type { ProviderDetailDTO, ProviderListItemDTO } from "@ntizo/shared/read-models";

const listItem: ProviderListItemDTO = {
  id: "p1", name: "Org", slug: "org",
  type: "organization", status: "active", role: "owner",
};

const detail: ProviderDetailDTO = {
  id: "p1", name: "Org", slug: "org", type: "organization", status: "active",
  description: null, ownerUserId: "u1", members: [], invites: [],
};

function makeModule(calls: string[] = []) {
  return {
    calls,
    listMyProviders: {
      execute: async (input: { requestedByUserId: string }) => {
        calls.push(`list:${input.requestedByUserId}`);
        return [listItem];
      },
    },
    getProviderDetail: {
      execute: async (input: { providerId: string; requestedByUserId: string }) => {
        calls.push(`detail:${input.providerId}:${input.requestedByUserId}`);
        return detail;
      },
    },
  };
}

describe("createProviderReadHandlers", () => {
  it("builds a handler for every read field", () => {
    const handlers = createProviderReadHandlers(makeModule());
    expect(Array.isArray(handlers)).toBe(true);
    expect(handlers.length).toBe(2);
  });

  it("stamps requestedByUserId from the session, never from args", async () => {
    const calls: string[] = [];
    const mod = makeModule(calls);
    // The arg-mapper is the unit under test: args carry no user id.
    const { mapListMyProvidersInput } = await import("../graphql/handlers/arg-mappers");
    const mapped = mapListMyProvidersInput({
      requesterUserId: "u-session", email: null, firstName: null,
      lastName: null, requestId: null, ipAddress: null, userAgent: null,
    });
    expect(mapped.requestedByUserId).toBe("u-session");
    await mod.listMyProviders.execute(mapped);
    expect(calls).toEqual(["list:u-session"]);
  });
});
```

- [ ] **Step 3b: Run it to confirm it fails**

Run: `cd ntizo-workspace/packages/backend && bun test src/modules/ntizo/read/provider`
Expected: FAIL — module `../graphql/handlers/queries.handlers` not found.

- [ ] **Step 4: Use cases**

Create `read/provider/app/use-cases/list-my-providers.projection.ts`:

```ts
import type { ProviderListItemDTO } from "@ntizo/shared/read-models";
import type {
  ListMyProvidersProjectionInput,
  ListMyProvidersProjectionPort,
} from "../ports/inbound";
import type { ProviderReadRepositoryPort } from "../ports/outbound/provider-read.repository.port";

export class ListMyProvidersProjection implements ListMyProvidersProjectionPort {
  constructor(private readonly repo: ProviderReadRepositoryPort) {}

  async execute(
    input: ListMyProvidersProjectionInput,
  ): Promise<ProviderListItemDTO[]> {
    if (!input.requestedByUserId) return [];
    return this.repo.listForUser(input.requestedByUserId);
  }
}
```

Create `read/provider/app/use-cases/get-provider-detail.projection.ts`:

```ts
import type { ProviderDetailDTO } from "@ntizo/shared/read-models";
import type {
  GetProviderDetailProjectionInput,
  GetProviderDetailProjectionPort,
} from "../ports/inbound";
import type { ProviderReadRepositoryPort } from "../ports/outbound/provider-read.repository.port";

export class GetProviderDetailProjection implements GetProviderDetailProjectionPort {
  constructor(private readonly repo: ProviderReadRepositoryPort) {}

  async execute(
    input: GetProviderDetailProjectionInput,
  ): Promise<ProviderDetailDTO> {
    // Authorization lives in the projection, off the session-stamped id.
    const member = await this.repo.isMember(input.providerId, input.requestedByUserId);
    if (!member) throw new Error("[read/provider] not a member of this provider");

    const detail = await this.repo.findDetailById(input.providerId);
    if (!detail) throw new Error("[read/provider] provider not found");
    return detail;
  }
}
```

- [ ] **Step 5: Drizzle read repository**

Create `read/provider/infra/repositories/drizzle/provider-read.repository.ts`:

```ts
import { and, eq, inArray } from "drizzle-orm";
import type { ProviderDetailDTO, ProviderListItemDTO } from "@ntizo/shared/read-models";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  provider,
  providerMember,
  providerInvite,
} from "../../../../../shared/infrastructure/database/provider/schemas";
import { user, profile } from "../../../../../shared/infrastructure/database/user/schemas";
import type { ProviderReadRepositoryPort } from "../../../app/ports/outbound/provider-read.repository.port";

/**
 * Read-side repository. Projects straight to read models — no aggregate
 * hydration. Member names come from ntizo's own user + profile tables, NOT
 * from better-auth's user table (no cross-module reach).
 */
export class DrizzleProviderReadRepository implements ProviderReadRepositoryPort {
  async listForUser(userId: string): Promise<ProviderListItemDTO[]> {
    const rows = await getDb()
      .select({
        id: provider.id,
        name: provider.name,
        slug: provider.slug,
        type: provider.type,
        status: provider.status,
        role: providerMember.role,
      })
      .from(providerMember)
      .innerJoin(provider, eq(provider.id, providerMember.providerId))
      .where(eq(providerMember.userId, userId));

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      type: r.type as ProviderListItemDTO["type"],
      status: r.status,
      role: r.role as ProviderListItemDTO["role"],
    }));
  }

  async isMember(providerId: string, userId: string): Promise<boolean> {
    const rows = await getDb()
      .select({ userId: providerMember.userId })
      .from(providerMember)
      .where(and(eq(providerMember.providerId, providerId), eq(providerMember.userId, userId)))
      .limit(1);
    return rows.length > 0;
  }

  async findDetailById(providerId: string): Promise<ProviderDetailDTO | null> {
    const [row] = await getDb()
      .select()
      .from(provider)
      .where(eq(provider.id, providerId))
      .limit(1);
    if (!row) return null;

    const memberRows = await getDb()
      .select({
        userId: providerMember.userId,
        role: providerMember.role,
        joinedAt: providerMember.joinedAt,
      })
      .from(providerMember)
      .where(eq(providerMember.providerId, providerId));

    const userIds = memberRows.map((m) => m.userId);
    const people = userIds.length
      ? await getDb()
          .select({
            id: user.id,
            email: user.email,
            displayName: profile.displayName,
          })
          .from(user)
          .leftJoin(profile, eq(profile.userId, user.id))
          .where(inArray(user.id, userIds))
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));

    const inviteRows = await getDb()
      .select({
        id: providerInvite.id,
        email: providerInvite.email,
        role: providerInvite.role,
        status: providerInvite.status,
      })
      .from(providerInvite)
      .where(eq(providerInvite.providerId, providerId));

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      type: row.type as ProviderDetailDTO["type"],
      status: row.status,
      description: row.description ?? null,
      ownerUserId: row.ownerUserId,
      members: memberRows.map((m) => ({
        userId: m.userId,
        email: byId.get(m.userId)?.email ?? "",
        name: byId.get(m.userId)?.displayName ?? null,
        role: m.role as ProviderDetailDTO["members"][number]["role"],
        joinedAt: m.joinedAt.toISOString(),
      })),
      invites: inviteRows.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role as ProviderDetailDTO["invites"][number]["role"],
        status: i.status,
      })),
    };
  }
}
```

> If `providerInvite`/`providerMember` column names differ from the above, read
> `shared/infrastructure/database/provider/schemas/` and use the actual names —
> do not rename the schema to match this plan.

- [ ] **Step 6: Query schema**

Create `read/provider/graphql/schema/queries.ts`:

```ts
import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import {
  providerDetailReadModel,
  providerListItemReadModel,
} from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * READ-side GraphQL schema for the provider BC. Queries ONLY — the
 * read=queries-only fitness gate (Task 7) asserts this.
 */
export const listMyProviders = defineQuery({
  input: zodSchema(z.object({})),
  output: zodSchema(z.array(providerListItemReadModel)),
  docs: {
    summary: "Providers the authenticated user belongs to",
    tags: ["Provider"],
  },
});

export const getProviderDetail = defineQuery({
  input: zodSchema(z.object({ providerId: z.string().min(1) })),
  output: zodSchema(providerDetailReadModel),
  docs: {
    summary: "Provider detail with members and invites",
    tags: ["Provider"],
  },
});

export const providerReadSchema = defineGraphQLSchema(
  {
    provider: {
      mine: listMyProviders,
      byId: getProviderDetail,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
```

- [ ] **Step 7: Arg-mappers**

Create `read/provider/graphql/handlers/arg-mappers.ts`:

```ts
import type { NtizoGraphqlContext } from "../../../../graphql/context";
import { requireRequesterUserId } from "../../../../graphql/context";
import type {
  GetProviderDetailProjectionInput,
  ListMyProvidersProjectionInput,
} from "../../app/ports/inbound";

/** The session — never the args — supplies the requester id. */
export function mapListMyProvidersInput(
  ctx: NtizoGraphqlContext,
): ListMyProvidersProjectionInput {
  return { requestedByUserId: requireRequesterUserId(ctx) };
}

export function mapGetProviderDetailInput(
  args: { providerId: string },
  ctx: NtizoGraphqlContext,
): GetProviderDetailProjectionInput {
  return {
    providerId: args.providerId,
    requestedByUserId: requireRequesterUserId(ctx),
  };
}
```

- [ ] **Step 8: Handlers**

Create `read/provider/graphql/handlers/queries.handlers.ts`:

```ts
import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type {
  GetProviderDetailProjectionPort,
  ListMyProvidersProjectionPort,
} from "../../app/ports/inbound";
import { providerReadSchema } from "../schema/queries";
import { mapGetProviderDetailInput, mapListMyProvidersInput } from "./arg-mappers";

/**
 * The provider READ surface. Members are typed as inbound PORTS, not concrete
 * classes, so the handler stays decoupled from the projection implementations.
 */
export interface ProviderReadModule {
  readonly listMyProviders: ListMyProvidersProjectionPort;
  readonly getProviderDetail: GetProviderDetailProjectionPort;
}

export function createProviderReadHandlers(readModule: ProviderReadModule) {
  return graphqlRoutes(providerReadSchema)
    .handleWithUseCase("provider.mine", {
      argsMapper: (_args, ctx) => mapListMyProvidersInput(asNtizoGraphqlContext(ctx)),
      useCase: readModule.listMyProviders,
      responseMapper: (output) => output,
    })
    .handleWithUseCase("provider.byId", {
      argsMapper: (args, ctx) =>
        mapGetProviderDetailInput(args.input, asNtizoGraphqlContext(ctx)),
      useCase: readModule.getProviderDetail,
      responseMapper: (output) => output,
    })
    .build();
}
```

- [ ] **Step 9: Bootstrap**

Create `read/provider/bootstrap/index.ts`:

```ts
import { DrizzleProviderReadRepository } from "../infra/repositories/drizzle/provider-read.repository";
import { ListMyProvidersProjection } from "../app/use-cases/list-my-providers.projection";
import { GetProviderDetailProjection } from "../app/use-cases/get-provider-detail.projection";
import type { ProviderReadModule } from "../graphql/handlers/queries.handlers";

export function bootstrapProviderRead(): {
  adapters: { providerReadRepository: DrizzleProviderReadRepository };
  useCases: ProviderReadModule;
} {
  const providerReadRepository = new DrizzleProviderReadRepository();
  return {
    adapters: { providerReadRepository },
    useCases: {
      listMyProviders: new ListMyProvidersProjection(providerReadRepository),
      getProviderDetail: new GetProviderDetailProjection(providerReadRepository),
    },
  };
}

export type ProviderReadBootstrap = ReturnType<typeof bootstrapProviderRead>;
```

- [ ] **Step 10: Barrels**

Create `read/provider/index.ts`:

```ts
export * from "./bootstrap";
export { providerReadSchema } from "./graphql/schema/queries";
export {
  createProviderReadHandlers,
  type ProviderReadModule,
} from "./graphql/handlers/queries.handlers";
export type * from "./app/ports/inbound";
```

Create `modules/ntizo/read/schema.ts`:

```ts
import { providerReadSchema } from "./provider/graphql/schema/queries";

/** The READ-side schema barrel — queries only, across all bounded contexts. */
export const readSchema = providerReadSchema;
```

- [ ] **Step 11: Run the tests**

Run: `cd ntizo-workspace/packages/backend && bun test src/modules/ntizo/read/provider`
Expected: PASS (2 tests).

- [ ] **Step 12: Typecheck and commit**

```bash
cd ntizo-workspace/packages/backend && bun run typecheck
git add . && git commit -m "feat(backend): read/provider query slice (provider.mine, provider.byId)"
```

---

### Task 5: `write/provider` — mutation slice

**Files:**
- Create: `.../modules/ntizo/write/provider/graphql/schema/mutations.ts`
- Create: `.../write/provider/graphql/handlers/arg-mappers.ts`
- Create: `.../write/provider/graphql/handlers/mutations.handlers.ts`
- Create: `.../write/provider/index.ts`
- Create: `.../modules/ntizo/write/schema.ts`
- Create: `.../modules/ntizo/graphql/private-schema.ts`
- Test: `.../write/provider/__tests__/mutations.handlers.test.ts`

**Interfaces:**
- Consumes: `bootstrapProvider()` and `bootstrapProviderWorkflows()` (existing); `ntizoGraphqlContextSchema` (Task 3); `readSchema` (Task 4).
- Produces: `providerWriteSchema`, `createProviderWriteHandlers(module)`, `writeSchema`, `privateGraphqlSchema`.

**Design note.** Write handlers delegate to the **existing** BC use-cases untouched. Those take `(ctx: ExecutionContext, input)`, so the arg-mapper rebuilds a minimal `ExecutionContext` from the GraphQL context.

- [ ] **Step 1: Write the failing test**

Create `write/provider/__tests__/mutations.handlers.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { toExecutionContext } from "../graphql/handlers/arg-mappers";

describe("toExecutionContext", () => {
  it("builds an authenticated ExecutionContext from the graphql context", () => {
    const ec = toExecutionContext({
      requesterUserId: "u1", email: "a@b.c", firstName: "A", lastName: "B",
      requestId: "r1", ipAddress: "1.2.3.4", userAgent: "ua",
    });
    expect(ec.requester.type).toBe("authenticated");
    if (ec.requester.type !== "authenticated") throw new Error("unreachable");
    expect(ec.requester.user.userId).toBe("u1");
    expect(ec.metadata.requestId).toBe("r1");
  });

  it("throws for an anonymous caller rather than fabricating an identity", () => {
    expect(() =>
      toExecutionContext({
        requesterUserId: null, email: null, firstName: null, lastName: null,
        requestId: null, ipAddress: null, userAgent: null,
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 1b: Run it to confirm it fails**

Run: `cd ntizo-workspace/packages/backend && bun test src/modules/ntizo/write/provider`
Expected: FAIL — module not found.

- [ ] **Step 2: Mutation schema**

Create `write/provider/graphql/schema/mutations.ts`:

```ts
import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

const providerIdResult = z.object({ providerId: z.string().min(1) });
const okResult = z.object({ ok: z.literal(true) });

export const createProvider = defineMutation({
  input: zodSchema(
    z.object({
      type: z.enum(["individual", "organization"]),
      name: z.string().min(1),
      slug: z.string().min(1),
      description: z.string().optional(),
    }),
  ),
  output: zodSchema(providerIdResult),
  docs: { summary: "Create a provider owned by the caller", tags: ["Provider"] },
});

export const updateProvider = defineMutation({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
    }),
  ),
  output: zodSchema(okResult),
  docs: { summary: "Update a provider's details", tags: ["Provider"] },
});

export const deactivateProvider = defineMutation({
  input: zodSchema(z.object({ providerId: z.string().min(1) })),
  output: zodSchema(okResult),
  docs: { summary: "Deactivate a provider", tags: ["Provider"] },
});

export const registerMeAsProvider = defineMutation({
  input: zodSchema(
    z.object({ name: z.string().optional(), slug: z.string().optional() }),
  ),
  output: zodSchema(providerIdResult),
  docs: {
    summary: "Upgrade the caller to a provider (cross-BC saga)",
    tags: ["Provider"],
  },
});

export const inviteProviderMember = defineMutation({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      email: z.string().email(),
      role: z.enum(["admin", "staff"]),
    }),
  ),
  output: zodSchema(z.object({ inviteId: z.string().min(1) })),
  docs: { summary: "Invite a member to a provider", tags: ["Provider"] },
});

export const acceptProviderInvite = defineMutation({
  input: zodSchema(z.object({ token: z.string().min(1) })),
  output: zodSchema(providerIdResult),
  docs: { summary: "Accept a provider invite", tags: ["Provider"] },
});

export const revokeProviderInvite = defineMutation({
  input: zodSchema(
    z.object({ providerId: z.string().min(1), inviteId: z.string().min(1) }),
  ),
  output: zodSchema(okResult),
  docs: { summary: "Revoke a pending invite", tags: ["Provider"] },
});

export const removeProviderMember = defineMutation({
  input: zodSchema(
    z.object({ providerId: z.string().min(1), userId: z.string().min(1) }),
  ),
  output: zodSchema(okResult),
  docs: { summary: "Remove a member from a provider", tags: ["Provider"] },
});

export const updateProviderMemberRole = defineMutation({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      userId: z.string().min(1),
      role: z.enum(["owner", "admin", "staff"]),
    }),
  ),
  output: zodSchema(okResult),
  docs: { summary: "Change a member's role", tags: ["Provider"] },
});

export const providerWriteSchema = defineGraphQLSchema(
  {
    provider: {
      create: createProvider,
      update: updateProvider,
      deactivate: deactivateProvider,
      registerMe: registerMeAsProvider,
      invites: {
        send: inviteProviderMember,
        accept: acceptProviderInvite,
        revoke: revokeProviderInvite,
      },
      members: {
        remove: removeProviderMember,
        updateRole: updateProviderMemberRole,
      },
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
```

- [ ] **Step 3: Arg-mappers**

Create `write/provider/graphql/handlers/arg-mappers.ts`:

```ts
import type { NtizoGraphqlContext } from "../../../../graphql/context";
import type { ExecutionContext } from "../../../../shared/infrastructure/execution-context";

/**
 * Rebuilds the ExecutionContext the existing BC use-cases expect from the slim
 * GraphQL context. Throws for anonymous callers rather than fabricating an
 * identity — the same posture as `requireAuthenticated`.
 */
export function toExecutionContext(ctx: NtizoGraphqlContext): ExecutionContext {
  if (!ctx.requesterUserId) {
    throw new Error("[write/provider] unauthenticated");
  }
  return {
    requester: {
      type: "authenticated",
      user: {
        userId: ctx.requesterUserId,
        email: ctx.email ?? "",
        firstName: ctx.firstName ?? "",
        lastName: ctx.lastName ?? "",
        platformRole: "customer",
      },
    },
    metadata: {
      requestId: ctx.requestId ?? "",
      ipAddress: ctx.ipAddress ?? undefined,
      userAgent: ctx.userAgent ?? undefined,
      receivedAt: new Date(),
    },
  };
}
```

> `platformRole` is not consulted by any provider use-case (authorization is by
> membership on the aggregate). If a future use-case needs the real role, add it
> to `NtizoGraphqlContext` and resolve it in the API context factory.

- [ ] **Step 4: Handlers**

Create `write/provider/graphql/handlers/mutations.handlers.ts`:

```ts
import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { ProviderBootstrap } from "../../../../bounded-contexts/provider/bootstrap";
import type { ProviderWorkflowsBootstrap } from "../../../../orchestrations/workflows/provider/bootstrap";
import { providerWriteSchema } from "../schema/mutations";
import { toExecutionContext } from "./arg-mappers";

export interface ProviderWriteModule {
  readonly provider: ProviderBootstrap;
  readonly workflows: ProviderWorkflowsBootstrap;
}

export function createProviderWriteHandlers(mod: ProviderWriteModule) {
  const uc = mod.provider.useCases;

  return graphqlRoutes(providerWriteSchema)
    .handle("provider.create", async (args, ctx) =>
      uc.createProvider.execute(toExecutionContext(asNtizoGraphqlContext(ctx)), args.input),
    )
    .handle("provider.update", async (args, ctx) => {
      await uc.updateProvider.execute(
        toExecutionContext(asNtizoGraphqlContext(ctx)),
        args.input,
      );
      return { ok: true as const };
    })
    .handle("provider.deactivate", async (args, ctx) => {
      await uc.deactivateProvider.execute(
        toExecutionContext(asNtizoGraphqlContext(ctx)),
        args.input,
      );
      return { ok: true as const };
    })
    .handle("provider.registerMe", async (args, ctx) =>
      mod.workflows.useCases.registerUserAsProvider.execute({
        executionContext: toExecutionContext(asNtizoGraphqlContext(ctx)),
        input: { name: args.input.name, slug: args.input.slug },
      }),
    )
    .handle("provider.invites.send", async (args, ctx) =>
      uc.inviteProviderMember.execute(
        toExecutionContext(asNtizoGraphqlContext(ctx)),
        args.input,
      ),
    )
    .handle("provider.invites.accept", async (args, ctx) =>
      uc.acceptProviderInvite.execute(
        toExecutionContext(asNtizoGraphqlContext(ctx)),
        args.input,
      ),
    )
    .handle("provider.invites.revoke", async (args, ctx) => {
      await uc.revokeProviderInvite.execute(
        toExecutionContext(asNtizoGraphqlContext(ctx)),
        args.input,
      );
      return { ok: true as const };
    })
    .handle("provider.members.remove", async (args, ctx) => {
      await uc.removeProviderMember.execute(
        toExecutionContext(asNtizoGraphqlContext(ctx)),
        args.input,
      );
      return { ok: true as const };
    })
    .handle("provider.members.updateRole", async (args, ctx) => {
      await uc.updateProviderMemberRole.execute(
        toExecutionContext(asNtizoGraphqlContext(ctx)),
        args.input,
      );
      return { ok: true as const };
    })
    .build();
}
```

> **Verified against `1.0.0-beta.3` types.** `graphqlRoutes(...)` exposes both
> `.handle(key, fn)` and `.handleWithUseCase(key, config)`. The signature is
> `SimpleGraphQLHandlerFn<TField> = (args: ValidatedArgs<TField>, ctx:
> TypedGraphQLContext<TField>) => Promise<Output> | Output`, and
> `ValidatedArgs` carries the validated payload on `.input` — so `args.input`
> above is correct. `.build()` terminates the chain and fails to compile if any
> schema field is left unhandled.

- [ ] **Step 5: Barrels and merged schema**

Create `write/provider/index.ts`:

```ts
export { providerWriteSchema } from "./graphql/schema/mutations";
export {
  createProviderWriteHandlers,
  type ProviderWriteModule,
} from "./graphql/handlers/mutations.handlers";
```

Create `modules/ntizo/write/schema.ts`:

```ts
import { providerWriteSchema } from "./provider/graphql/schema/mutations";

/** The WRITE-side schema barrel — mutations only, across all bounded contexts. */
export const writeSchema = providerWriteSchema;
```

Create `modules/ntizo/graphql/private-schema.ts`:

```ts
import { mergeGraphQLSchemas } from "@cosmneo/onion-lasagna/graphql/field";
import { readSchema } from "../read/schema";
import { writeSchema } from "../write/schema";

/**
 * The PRIVATE (session-authed) client-facing schema — definitions only, no
 * handlers. This is the type the frontend GraphQL client imports to infer its
 * typed method tree (Plan 1B).
 */
export const privateGraphqlSchema = mergeGraphQLSchemas(readSchema, writeSchema);
```

- [ ] **Step 6: Run the tests**

Run: `cd ntizo-workspace/packages/backend && bun test src/modules/ntizo/write/provider`
Expected: PASS (2 tests).

- [ ] **Step 7: Typecheck and commit**

```bash
cd ntizo-workspace/packages/backend && bun run typecheck
git add . && git commit -m "feat(backend): write/provider mutation slice + private schema"
```

---

### Task 6: Mount GraphQL Yoga in the API

**Files:**
- Create: `ntizo-workspace/apps/backend/api/src/graphql/hardening.ts`
- Create: `ntizo-workspace/apps/backend/api/src/graphql/build-yoga.ts`
- Create: `ntizo-workspace/apps/backend/api/src/graphql/context-factory.ts`
- Create: `ntizo-workspace/apps/backend/api/src/graphql/private.ts`
- Modify: `ntizo-workspace/apps/backend/api/src/api.ts`
- Modify: `ntizo-workspace/apps/backend/api/package.json`

**Interfaces:**
- Consumes: `privateGraphqlSchema`, `createProviderReadHandlers`, `bootstrapProviderRead` (Task 4); `createProviderWriteHandlers` (Task 5).
- Produces: `POST /graphql`.

- [ ] **Step 1: Add the app-layer GraphQL dependencies**

```bash
cd ntizo-workspace/apps/backend/api
bun add @cosmneo/onion-lasagna @cosmneo/onion-lasagna-hono @cosmneo/onion-lasagna-yoga graphql graphql-yoga
bun add @escape.tech/graphql-armor-cost-limit @escape.tech/graphql-armor-max-aliases \
        @escape.tech/graphql-armor-max-directives @escape.tech/graphql-armor-max-tokens \
        @graphql-yoga/plugin-csrf-prevention @graphql-yoga/plugin-disable-introspection
```

- [ ] **Step 2: Hardening plugins**

Create `apps/backend/api/src/graphql/hardening.ts`:

```ts
import { costLimitPlugin } from "@escape.tech/graphql-armor-cost-limit";
import { maxAliasesPlugin } from "@escape.tech/graphql-armor-max-aliases";
import { maxDirectivesPlugin } from "@escape.tech/graphql-armor-max-directives";
import { maxTokensPlugin } from "@escape.tech/graphql-armor-max-tokens";
import { useCSRFPrevention } from "@graphql-yoga/plugin-csrf-prevention";
import { useDisableIntrospection } from "@graphql-yoga/plugin-disable-introspection";

export const MAX_DEPTH = 10;

/**
 * Query-shape limits applied at every stage, plus introspection disabled in
 * prod only (GraphiQL stays usable in local/dev/qa).
 */
export function buildHardeningPlugins(stage: string): unknown[] {
  const plugins: unknown[] = [
    costLimitPlugin({ maxCost: 5000 }),
    maxAliasesPlugin({ n: 15 }),
    maxDirectivesPlugin({ n: 50 }),
    maxTokensPlugin({ n: 1000 }),
    useCSRFPrevention({ requestHeaders: ["x-graphql-csrf"] }),
  ];
  if (stage === "prod") plugins.push(useDisableIntrospection());
  return plugins;
}
```

- [ ] **Step 3: Yoga builder**

Create `apps/backend/api/src/graphql/build-yoga.ts`:

```ts
import { createOnionYoga } from "@cosmneo/onion-lasagna-yoga";
import { ConsoleLoggerAdapter } from "@ntizo/backend/shared/infra/logger";
import { MAX_DEPTH } from "./hardening";

const fallbackLogger = new ConsoleLoggerAdapter("error");

export interface BuildYogaOptions {
  readonly schema: unknown;
  readonly fields: Parameters<typeof createOnionYoga>[0]["fields"];
  readonly plugins: readonly unknown[];
  readonly createContext: (request: Request) => unknown | Promise<unknown>;
  readonly graphiql: boolean;
}

/** Single factory every GraphQL mount flows through. */
export function buildYoga(options: BuildYogaOptions) {
  return createOnionYoga({
    fields: options.fields,
    schema: options.schema as Parameters<typeof createOnionYoga>[0]["schema"],
    createContext: options.createContext as Parameters<
      typeof createOnionYoga
    >[0]["createContext"],
    plugins: options.plugins,
    maxDepth: MAX_DEPTH,
    onResolverError: (error: unknown, fieldKey: string) => {
      fallbackLogger.error(`GraphQL resolver error [${fieldKey}]`, {
        message: error instanceof Error ? error.message : String(error),
      });
    },
    yoga: { graphiql: options.graphiql },
  });
}
```

- [ ] **Step 4: Context factory**

Create `apps/backend/api/src/graphql/context-factory.ts`:

```ts
import { getAuth } from "@ntizo/backend/modules/better-auth";
import type { NtizoGraphqlContext } from "@ntizo/backend/modules/ntizo/graphql/context";

/**
 * Resolves the per-request GraphQL context from the better-auth session.
 * Anonymous requests get null ids rather than an error — field-level
 * authorization is the arg-mapper's job.
 */
export async function createGraphqlContext(
  request: Request,
): Promise<NtizoGraphqlContext> {
  const session = await getAuth().api.getSession({ headers: request.headers });
  const u = session?.user as
    | (NonNullable<typeof session>["user"] & {
        firstName?: string;
        lastName?: string;
      })
    | undefined;

  return {
    requesterUserId: u?.id ?? null,
    email: u?.email ?? null,
    firstName: u?.firstName ?? null,
    lastName: u?.lastName ?? null,
    requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
    ipAddress:
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  };
}
```

- [ ] **Step 5: The private mount**

Create `apps/backend/api/src/graphql/private.ts`:

```ts
import type { Hono } from "hono";
import { privateGraphqlSchema } from "@ntizo/backend/modules/ntizo/graphql/private-schema";
import {
  bootstrapProviderRead,
  createProviderReadHandlers,
} from "@ntizo/backend/modules/ntizo/read/provider";
import { createProviderWriteHandlers } from "@ntizo/backend/modules/ntizo/write/provider";
import { bootstrapProvider } from "@ntizo/backend/modules/ntizo/bounded-contexts/provider";
import { bootstrapProviderWorkflows } from "@ntizo/backend/modules/ntizo/orchestrations/workflows/provider";
import { bootstrapUser } from "@ntizo/backend/modules/ntizo/bounded-contexts/user";
import { buildYoga } from "./build-yoga";
import { buildHardeningPlugins } from "./hardening";
import { createGraphqlContext } from "./context-factory";
import type { AppBindings } from "../types";

/**
 * Built lazily and memoised for the isolate's lifetime so `c.env.STAGE` can be
 * read on first request. STAGE is constant per deployment, so this is safe.
 */
let yoga: ReturnType<typeof buildYoga> | undefined;

function getYoga(stage: string) {
  if (!yoga) {
    const providerRead = bootstrapProviderRead();
    const provider = bootstrapProvider();
    const user = bootstrapUser();
    const workflows = bootstrapProviderWorkflows({
      userInternal: {
        upgradeProfileToProvider: user.useCases.internal.upgradeProfileToProvider,
        revertProviderUpgrade: user.useCases.internal.revertProviderUpgrade,
      },
      providerInternal: {
        createProvider: provider.useCases.internal.createProvider,
        deactivateProvider: provider.useCases.internal.deactivateProvider,
      },
    });

    yoga = buildYoga({
      schema: privateGraphqlSchema,
      fields: [
        ...createProviderReadHandlers(providerRead.useCases),
        ...createProviderWriteHandlers({ provider, workflows }),
      ] as Parameters<typeof buildYoga>[0]["fields"],
      plugins: buildHardeningPlugins(stage),
      createContext: createGraphqlContext,
      graphiql: stage !== "prod",
    });
  }
  return yoga;
}

export function mountPrivateGraphql(app: Hono<{ Bindings: AppBindings }>) {
  app.all("/graphql", (c) => getYoga(c.env.STAGE ?? "local").fetch(c.req.raw));
}
```

- [ ] **Step 6: Wire it into `api.ts`**

In `apps/backend/api/src/api.ts`, add the import beside the existing router imports:

```ts
import { mountPrivateGraphql } from "./graphql/private";
```

and immediately after the two `app.route("/api", ...)` calls, add:

```ts
// GraphQL (private, session-authed). REST stays live until Plan 1B.
mountPrivateGraphql(app);
```

- [ ] **Step 7: Verify the endpoint serves**

```bash
cd ntizo-workspace/apps/backend/api && bun run dev &
sleep 8
curl -s -X POST http://localhost:8788/graphql \
  -H 'Content-Type: application/json' -H 'x-graphql-csrf: 1' \
  -d '{"query":"{ __typename }"}'
```

Expected: `{"data":{"__typename":"Query"}}`

Then confirm an unauthenticated read is rejected by the arg-mapper, not by a crash:

```bash
curl -s -X POST http://localhost:8788/graphql \
  -H 'Content-Type: application/json' -H 'x-graphql-csrf: 1' \
  -d '{"query":"{ provider { mine { id name } } }"}'
```

Expected: an `errors` array (unauthenticated) — **not** a 500 stack trace and not `data.provider.mine`.

- [ ] **Step 8: Verify an authenticated read returns real rows**

Sign in with the seeded account and reuse the cookie:

```bash
cd ntizo-workspace/apps/backend/api
curl -s -c /tmp/ntizo-cookies.txt -X POST http://localhost:8788/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"pw.tester.0807@example.com","password":"password123"}' > /dev/null
curl -s -b /tmp/ntizo-cookies.txt -X POST http://localhost:8788/graphql \
  -H 'Content-Type: application/json' -H 'x-graphql-csrf: 1' \
  -d '{"query":"{ provider { mine { id name slug role } } }"}'
```

Expected: one provider (`Playwright's Org`, role `owner`) — the same data `GET /api/providers/mine` returns. If the two disagree, the read repository's joins are wrong; fix them before continuing.

- [ ] **Step 9: Confirm REST still works**

```bash
curl -s -b /tmp/ntizo-cookies.txt http://localhost:8788/api/providers/mine
```

Expected: identical JSON. REST must keep working until Plan 1B.

- [ ] **Step 10: Typecheck and commit**

```bash
cd ntizo-workspace/apps/backend/api && bun run typecheck
git add . && git commit -m "feat(api): mount private GraphQL Yoga with hardening"
```

---

### Task 7: Architecture fitness tests

**Files:**
- Create: `ntizo-workspace/packages/backend/src/modules/ntizo/__tests__/fitness-tier-segregation.test.ts`
- Create: `ntizo-workspace/packages/backend/src/modules/ntizo/__tests__/fitness-no-framework-in-read-write.test.ts`
- Modify: `ntizo-workspace/packages/backend/package.json` (add `test` script)

**Interfaces:**
- Consumes: `providerReadSchema` (Task 4), `providerWriteSchema` (Task 5).

**Scope note.** The *no-Hono-anywhere-in-`packages/backend`* and *no-BC-exposes-a-router* gates are **deliberately deferred to Plan 1B**: `provider.router.ts` still exists and must keep working until the frontend cuts over. This task lands the gates that are true today.

- [ ] **Step 1: Add a test script**

In `packages/backend/package.json` scripts:

```json
    "test": "bun test src"
```

- [ ] **Step 2: Write the tier-segregation gate**

Create `modules/ntizo/__tests__/fitness-tier-segregation.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { readSchema } from "../read/schema";
import { writeSchema } from "../write/schema";

/**
 * Walks a schema definition and collects every leaf field.
 *
 * Shapes verified against the 1.0.0-beta.3 types:
 *   GraphQLSchemaDefinition = { fields, defaults?, _isGraphQLSchema: true }
 *   GraphQLFieldDefinition  = { operation, input, output, docs, _isGraphQLField: true }
 * Leaves are identified by the `_isGraphQLField` marker rather than by duck-typing
 * on `operation`, so a nested group can never be mistaken for a field.
 */
function collectFields(
  node: unknown,
  path: string[] = [],
): Array<{ path: string; operation: unknown }> {
  if (!node || typeof node !== "object") return [];

  if ((node as { _isGraphQLField?: true })._isGraphQLField) {
    return [{ path: path.join("."), operation: (node as { operation: unknown }).operation }];
  }
  // Unwrap a nested schema definition, then recurse over its groups.
  const groups = (node as { _isGraphQLSchema?: true })._isGraphQLSchema
    ? (node as { fields: Record<string, unknown> }).fields
    : (node as Record<string, unknown>);

  return Object.entries(groups).flatMap(([k, v]) => collectFields(v, [...path, k]));
}

describe("tier segregation", () => {
  it("read/ exposes queries only", () => {
    const fields = collectFields(readSchema);
    expect(fields.length).toBeGreaterThan(0);
    const offenders = fields.filter((f) => f.operation !== "query");
    expect(offenders.map((o) => o.path)).toEqual([]);
  });

  it("write/ exposes mutations only", () => {
    const fields = collectFields(writeSchema);
    expect(fields.length).toBeGreaterThan(0);
    const offenders = fields.filter((f) => f.operation !== "mutation");
    expect(offenders.map((o) => o.path)).toEqual([]);
  });
});
```

- [ ] **Step 3: Write the framework-isolation gate**

Create `modules/ntizo/__tests__/fitness-no-framework-in-read-write.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const FORBIDDEN = [
  "@cosmneo/onion-lasagna-hono",
  "@cosmneo/onion-lasagna-yoga",
  "graphql-yoga",
  'from "hono"',
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

describe("framework isolation", () => {
  it("read/ and write/ never import a web framework or server adapter", () => {
    const files = [...walk(join(ROOT, "read")), ...walk(join(ROOT, "write"))];
    expect(files.length).toBeGreaterThan(0);

    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return FORBIDDEN.some((needle) => source.includes(needle));
    });

    expect(offenders.map((f) => f.replace(ROOT, ""))).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the gates**

Run: `cd ntizo-workspace/packages/backend && bun run test`
Expected: PASS — all suites including Tasks 4 and 5.

- [ ] **Step 5: Prove the gate actually bites**

Temporarily add `import { Hono } from "hono";` to the top of
`modules/ntizo/read/schema.ts`, re-run `bun run test`, and confirm the framework
isolation test **fails**. Then remove the import and confirm it passes again. A
fitness test that cannot fail is worthless.

- [ ] **Step 6: Commit**

```bash
git add ntizo-workspace/packages/backend
git commit -m "test(backend): tier-segregation and framework-isolation fitness gates"
```

---

### Task 8: Full-stack verification

**Files:** none (verification only)

- [ ] **Step 1: Every workspace typechecks**

```bash
cd ntizo-workspace
bun run check-types
```

Expected: all packages pass.

- [ ] **Step 2: Every test suite passes**

```bash
cd ntizo-workspace/packages/shared  && bun run test
cd ../backend                       && bun run test
cd ../../apps/frontend/web          && bun run test
```

Expected: green in all three. The web app's 21 tests must be unchanged — Plan 1A does not touch the frontend.

- [ ] **Step 3: The app still works end-to-end in a browser**

Start both servers, sign in as `pw.tester.0807@example.com` / `password123`, and confirm `/provider/overview` still loads its data over **REST**. Plan 1A adds GraphQL alongside; it must not have altered any existing behaviour.

- [ ] **Step 4: Record what is deliberately still outstanding**

Confirm these remain true, and carry them into Plan 1B:
- `bounded-contexts/provider/infrastructure/rest/provider.router.ts` still exists and still imports Hono.
- The *no-Hono-in-`packages/backend`* and *no-BC-router* fitness gates are not yet written.
- The frontend still talks REST.

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "chore: Phase 1A complete — GraphQL live alongside REST"
```

---

## Self-Review

**Spec coverage.** Spec §1.1 dependencies → Tasks 1, 3, 6. §1.2 zod read-models → Task 2. §1.3 `packages/backend` read/write slices → Tasks 3–5 (the router *deletion* is 1B by design, per the scope note in Task 7). §1.4 API Workers + Yoga + hardening → Tasks 1, 6. §1.5 frontend → **Plan 1B**. §1.7 error handling → partially deferred: the error-remap plugin lands in 1B with the frontend that consumes the codes. §1.8 backend testing + fitness → Tasks 2, 4, 5, 7. §1.9 continuity → Tasks 6 and 8 explicitly verify REST still works.

**Type consistency.** `ProviderListItemDTO`/`ProviderDetailDTO`/`CurrentUserDTO` are defined in Task 2 and consumed with those exact names in Tasks 4–6. `NtizoGraphqlContext`, `ntizoGraphqlContextSchema`, `asNtizoGraphqlContext` and `requireRequesterUserId` are defined in Task 3 and used with matching signatures thereafter. `ProviderReadModule` is defined in Task 4 and consumed in Task 6. `readSchema`/`writeSchema`/`privateGraphqlSchema` are defined in Tasks 4–5 and consumed in Tasks 6–7.

**Kit API verified, not assumed.** `1.0.0-beta.3` has no published documentation and the reference project demonstrates only `handleWithUseCase`, so both open questions were resolved by reading the shipped `.d.ts` files:

| Question | Verified answer |
|---|---|
| Does `.handle()` exist? | Yes — `handle(key, fn \| config)` alongside `handleWithUseCase(key, config)` |
| Handler signature | `(args: ValidatedArgs<TField>, ctx: TypedGraphQLContext<TField>) => Promise<Output> \| Output` |
| Where is the payload? | `ValidatedArgs.input` (plus `.raw` for unvalidated args) |
| Where do field defs live? | `GraphQLSchemaDefinition.fields`; leaves carry `_isGraphQLField: true`, groups `_isGraphQLSchema: true` |
| Operation discriminator | `GraphQLFieldDefinition.operation: 'query' \| 'mutation'` — what the Task 7 gate asserts on |

`mergeGraphQLSchemas` is typed for exactly two arguments
(`<T1, T2>(s1, s2)`). Phase 1A merges read + write, so that fits. When a third
tier (`public/`) lands in Phase 4, check for an n-ary overload before assuming
`merge(read, write, public)` compiles.
