# Phase 1B — Frontend GraphQL Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `apps/frontend/web` off REST onto the GraphQL API built in Phase 1A, restructure the provider feature into Clean Architecture + MVVM layers enforced by lint, and delete the REST provider router along with the two fitness gates that were blocked on it.

**Architecture:** A single credentialed `sessionGraphql` client posts to `/graphql`; `data/*.repository.ts` exports TanStack Query `queryOptions`; `viewmodel/` hooks consume them; `ui/` renders. Backend domain exceptions become kit `CodedError` subclasses so the client can branch on stable codes instead of parsing messages.

**Tech Stack:** Vite, React 19, TanStack Router + Query, `@cosmneo/onion-lasagna` 1.0.0-beta.3, `eslint-plugin-boundaries`, Bun, Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-08-07-doazores-pattern-adoption-design.md` (§1.5, §1.7, plus "Carried forward from Phase 1A").

**Reference:** `doazores-workspace/doazores/apps/frontend/doazores-web-storefront`
(this app was previously named `doazores-web-client-next`; the Phase 1A spec
refers to the old name).

## Global Constraints

- `@cosmneo/*` pinned **exactly** to `1.0.0-beta.3`; `graphql` pinned to `16.14.2`. Never a caret — npm's `latest` for the kit is `0.4.1`, a different API line, and bare `graphql` resolves to 17.x which breaks `graphql-yoga@5` peer deps.
- **The kit flattens nested namespaces to camelCase root fields.** `provider.mine` is queried as `providerMine`, not `provider { mine }`. Every field takes a required `input` argument even when its input schema is empty — send `input: {}`.
- **A GraphQL error usually arrives on HTTP 200** with `errors[].extensions.code`, not as a 4xx. The client must throw whenever `errors` is non-empty OR `!response.ok`.
- `packages/backend` must never import `@cosmneo/onion-lasagna-hono`, `hono`, `graphql-yoga`. After Task 7 this becomes a fitness gate.
- `read/**` exposes `defineQuery` only; `write/**` exposes `defineMutation` only.
- Every task ends green: `bun run check-types`, `bun run lint`, `bun run test` at `ntizo-workspace/`.
- Any live verification must make **at least two authenticated round-trips on one server** — a single call passes even when connections are broken across requests.
- `wrangler` requires Node ≥ 22 (`nvm use 22`). Kill stale servers with `pkill -f "workerd|wrangler"`.
- Test account: `pw.tester.0807@example.com` / `password123`, verified, owns one provider. `callback.check@example.com` / `password123` owns none — use it for authorization checks.

---

### Task 1: Give domain exceptions stable error codes

**Why first.** Everything downstream depends on it. Today all 9 mutations, both queries, and all 8 domain exception types collapse to `"An unexpected error occurred" / INTERNAL_ERROR`, because the kit masks any error that is not one of its own `CodedError` subclasses. REST returns specific messages the current UI displays, so cutting over without this **regresses every provider-zone error message**.

**Files:**
- Modify: `ntizo-workspace/packages/backend/src/modules/ntizo/bounded-contexts/provider/domain/exceptions/index.ts`
- Test: `ntizo-workspace/packages/backend/src/modules/ntizo/bounded-contexts/provider/domain/exceptions/__tests__/exceptions.test.ts`

**Interfaces:**
- Produces: the same 8 exception classes, now extending kit error types and carrying stable `code` strings. Task 5 branches on these codes in the UI.

- [ ] **Step 1: Write the failing test**

Create `.../domain/exceptions/__tests__/exceptions.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { getGraphQLErrorCode } from "@cosmneo/onion-lasagna";
import {
  IndividualProviderCannotHaveMembersError,
  InsufficientProviderPermissionsError,
  InviteAlreadyUsedError,
  InviteExpiredError,
  InviteNotFoundError,
  MemberAlreadyExistsError,
  MemberNotFoundError,
  NotProviderOwnerError,
  ProviderNotFoundError,
} from "..";

describe("provider domain exceptions", () => {
  it("are not masked to INTERNAL_ERROR by the kit", () => {
    const errors: Error[] = [
      new ProviderNotFoundError("p1"),
      new NotProviderOwnerError("p1", "u1"),
      new InsufficientProviderPermissionsError("p1", "u1"),
      new InviteExpiredError("t"),
      new InviteAlreadyUsedError("t"),
      new InviteNotFoundError("t"),
      new MemberAlreadyExistsError("p1", "u1"),
      new MemberNotFoundError("p1", "u1"),
      new IndividualProviderCannotHaveMembersError("p1"),
    ];
    const masked = errors.filter((e) => getGraphQLErrorCode(e) === "INTERNAL_ERROR");
    expect(masked.map((e) => e.name)).toEqual([]);
  });

  it("carries a stable, distinct code per failure mode", () => {
    expect(new ProviderNotFoundError("p1").code).toBe("PROVIDER_NOT_FOUND");
    expect(new NotProviderOwnerError("p1", "u1").code).toBe("NOT_PROVIDER_OWNER");
    expect(new InviteExpiredError("t").code).toBe("INVITE_EXPIRED");
    expect(new MemberAlreadyExistsError("p1", "u1").code).toBe("MEMBER_ALREADY_EXISTS");
  });

  it("still reads as an Error with a useful message", () => {
    const e = new ProviderNotFoundError("p1");
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toContain("p1");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd ntizo-workspace/packages/backend && bun test src/modules/ntizo/bounded-contexts/provider/domain/exceptions`
Expected: FAIL — every error masks to `INTERNAL_ERROR` and `.code` is undefined.

- [ ] **Step 3: Re-base the exceptions on kit error types**

Replace `.../domain/exceptions/index.ts`:

```ts
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from "@cosmneo/onion-lasagna";

/**
 * Provider BC domain exceptions.
 *
 * Each extends a kit error type so `getGraphQLErrorCode` recognises it and the
 * GraphQL layer stops masking it to INTERNAL_ERROR. The `code` strings are a
 * PUBLIC CONTRACT — the web client branches on them. Renaming one is a
 * breaking change to the frontend.
 */

export class ProviderNotFoundError extends NotFoundError {
  constructor(id: string) {
    super({ message: `Provider not found: ${id}`, code: "PROVIDER_NOT_FOUND" });
    this.name = "ProviderNotFoundError";
  }
}

export class NotProviderOwnerError extends ForbiddenError {
  constructor(providerId: string, userId: string) {
    super({ message: `User ${userId} is not the owner of provider ${providerId}`, code: "NOT_PROVIDER_OWNER" });
    this.name = "NotProviderOwnerError";
  }
}

export class InsufficientProviderPermissionsError extends ForbiddenError {
  constructor(providerId: string, userId: string) {
    super({ message: `User ${userId} lacks the required role on provider ${providerId}`, code: "INSUFFICIENT_PROVIDER_PERMISSIONS" });
    this.name = "InsufficientProviderPermissionsError";
  }
}

export class InviteExpiredError extends UnprocessableError {
  constructor(token: string) {
    super({ message: `Invite token expired: ${token}`, code: "INVITE_EXPIRED" });
    this.name = "InviteExpiredError";
  }
}

export class InviteAlreadyUsedError extends ConflictError {
  constructor(token: string) {
    super({ message: `Invite token already used or revoked: ${token}`, code: "INVITE_ALREADY_USED" });
    this.name = "InviteAlreadyUsedError";
  }
}

export class InviteNotFoundError extends NotFoundError {
  constructor(token: string) {
    super({ message: `Invite not found: ${token}`, code: "INVITE_NOT_FOUND" });
    this.name = "InviteNotFoundError";
  }
}

export class MemberAlreadyExistsError extends ConflictError {
  constructor(providerId: string, userId: string) {
    super({ message: `User ${userId} is already a member of provider ${providerId}`, code: "MEMBER_ALREADY_EXISTS" });
    this.name = "MemberAlreadyExistsError";
  }
}

export class MemberNotFoundError extends NotFoundError {
  constructor(providerId: string, userId: string) {
    super({ message: `User ${userId} is not a member of provider ${providerId}`, code: "MEMBER_NOT_FOUND" });
    this.name = "MemberNotFoundError";
  }
}

export class IndividualProviderCannotHaveMembersError extends UnprocessableError {
  constructor(providerId: string) {
    super({
      message: `Provider ${providerId} is of type "individual" and cannot have additional members`,
      code: "INDIVIDUAL_PROVIDER_CANNOT_HAVE_MEMBERS",
    });
    this.name = "IndividualProviderCannotHaveMembersError";
  }
}
```

> **Signature verified against the installed 1.0.0-beta.3 types.** The kit's
> error constructors take a SINGLE options object —
> `constructor({ message, code, cause }: { message: string; code?: AppErrorCode | string; cause?: unknown })`
> — not `(message, options)`. The code above uses that form; an earlier draft of
> this plan had it wrong. `getGraphQLErrorCode` is exported from the package
> root.

- [ ] **Step 4: Also code the two ad-hoc authorization throws**

`read/provider/app/use-cases/get-provider-detail.projection.ts` throws
`new Error("[read/provider] not a member of this provider")` and
`new Error("[read/provider] provider not found")`. Replace them with
`NotProviderOwnerError`-style kit errors so the read path is not masked either:
use `ForbiddenError` with code `NOT_PROVIDER_MEMBER` and the existing
`ProviderNotFoundError`. Keep the ordering — the membership check must still run
before `findDetailById`; the three existing tests assert this.

- [ ] **Step 5: Run the tests**

Run: `cd ntizo-workspace/packages/backend && bun run test`
Expected: PASS, including the pre-existing read/provider authorization tests.

- [ ] **Step 6: Commit**

```bash
git add ntizo-workspace/packages/backend
git commit -m "feat(backend): give provider domain exceptions stable error codes"
```

---

### Task 2: Prove the codes reach the wire

**Files:** none (verification only — no code changes)

This is deliberately its own task. Task 1's unit test proves the kit *classifies*
the errors; it does not prove Yoga *serialises* the code to a client. Those are
different layers and the masking bug lived in the second one.

- [ ] **Step 1: Start the API**

```bash
pkill -f "workerd|wrangler"; nvm use 22
cd ntizo-workspace/apps/backend/api && bun run dev &
sleep 10
```

- [ ] **Step 2: Sign in as a user who owns NO provider**

```bash
rm -f /tmp/outsider.txt
curl -s -o /dev/null -c /tmp/outsider.txt -X POST http://localhost:8788/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"callback.check@example.com","password":"password123"}'
```

- [ ] **Step 3: Trigger a forbidden read and read the code off the wire**

```bash
curl -s -b /tmp/outsider.txt -X POST http://localhost:8788/graphql \
  -H 'Content-Type: application/json' -H 'x-graphql-csrf: 1' \
  -d '{"query":"query($i: ProviderByIdInput!){ providerById(input: $i) { name } }","variables":{"i":{"providerId":"952c41ea-299a-4e1f-a05f-a68f52a112af"}}}'
```

Expected: an `errors[0].extensions.code` that is **not** `INTERNAL_ERROR` — it
should be the forbidden/not-a-member code from Task 1. If it is still
`INTERNAL_ERROR`, Task 1 is incomplete: the exception is being wrapped or
re-thrown as a plain `Error` somewhere between the use case and the resolver.
Trace it before continuing — every later task assumes codes reach the client.

- [ ] **Step 4: Confirm a second authenticated round-trip still works**

```bash
for i in 1 2; do
  curl -s -b /tmp/outsider.txt -X POST http://localhost:8788/graphql \
    -H 'Content-Type: application/json' -H 'x-graphql-csrf: 1' \
    -d '{"query":"query($i: JSON!){ providerMine(input: $i) { id } }","variables":{"i":{}}}'
  echo
done
```

Expected: both return `{"data":{"providerMine":[]}}` — an empty list, not an error.

- [ ] **Step 5: Record the observed codes in your report and stop the server**

```bash
pkill -f "workerd|wrangler"
```

---

### Task 3: The session GraphQL client

**Files:**
- Create: `ntizo-workspace/apps/frontend/web/src/shared/lib/graphql/session-graphql.ts`
- Test: `ntizo-workspace/apps/frontend/web/src/shared/lib/graphql/__tests__/session-graphql.test.ts`

**Interfaces:**
- Produces: `sessionGraphql<T>(query, variables?)` and `GraphqlError` (with `status`, `errors[]`, `code`). Task 4's repositories are the only callers.

- [ ] **Step 1: Write the failing test**

Create `.../shared/lib/graphql/__tests__/session-graphql.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphqlError, sessionGraphql } from "../session-graphql";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("sessionGraphql", () => {
  it("returns data on success", async () => {
    mockFetch(200, { data: { providerMine: [{ id: "p1" }] } });
    const out = await sessionGraphql<{ providerMine: Array<{ id: string }> }>("{ providerMine { id } }");
    expect(out.providerMine[0]!.id).toBe("p1");
  });

  it("throws on a GraphQL error delivered with HTTP 200", async () => {
    // This is the important case: the transport succeeds, the operation did not.
    mockFetch(200, {
      data: null,
      errors: [{
        message: "nope",
        // The real wire shape: coarse `code` plus fine-grained `originalCode`.
        extensions: { code: "FORBIDDEN", originalCode: "NOT_PROVIDER_OWNER" },
      }],
    });
    await expect(sessionGraphql("{ x }")).rejects.toBeInstanceOf(GraphqlError);
    // `code` must prefer originalCode — branching on the coarse FORBIDDEN
    // would make every authorization failure indistinguishable.
    await expect(sessionGraphql("{ x }")).rejects.toMatchObject({
      code: "NOT_PROVIDER_OWNER",
      kitCode: "FORBIDDEN",
      status: 200,
    });
  });

  it("throws on a non-2xx even when no errors array is present", async () => {
    mockFetch(500, {});
    await expect(sessionGraphql("{ x }")).rejects.toBeInstanceOf(GraphqlError);
  });

  it("sends credentials so the better-auth cookie is attached", async () => {
    const fn = mockFetch(200, { data: {} });
    await sessionGraphql("{ x }");
    expect(fn.mock.calls[0]![1]).toMatchObject({
      method: "POST",
      credentials: "include",
    });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd ntizo-workspace/apps/frontend/web && bun run vitest run src/shared/lib/graphql`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the client**

Create `.../shared/lib/graphql/session-graphql.ts`:

```ts
import { API_BASE_URL } from "@/shared/lib/api/auth-client";

export interface GraphqlErrorEntry {
  message: string;
  extensions?: {
    /** Coarse kit classification: FORBIDDEN, NOT_FOUND, CONFLICT, … */
    code?: string;
    /** The fine-grained domain code, e.g. NOT_PROVIDER_MEMBER. */
    originalCode?: string;
  };
}

/**
 * A GraphQL operation that failed. `code` is the backend's stable domain code
 * (see the provider BC's domain/exceptions) — branch on it, never on `message`.
 */
export class GraphqlError extends Error {
  readonly status: number;
  readonly errors: GraphqlErrorEntry[];
  /**
   * The domain code to branch on — `originalCode` when the backend supplied
   * one, else the coarse kit code.
   *
   * VERIFIED ON THE WIRE: a forbidden read returns
   * `{ code: "FORBIDDEN", originalCode: "NOT_PROVIDER_MEMBER" }`. Reading
   * `code` alone would collapse every authorization failure into one bucket
   * and make specific UI copy impossible.
   */
  readonly code?: string;
  /** The coarse kit classification, kept for transport-level decisions. */
  readonly kitCode?: string;

  constructor(status: number, errors: GraphqlErrorEntry[]) {
    super(errors[0]?.message ?? `HTTP ${status}`);
    this.name = "GraphqlError";
    this.status = status;
    this.errors = errors;
    const ext = errors[0]?.extensions;
    this.code = ext?.originalCode ?? ext?.code;
    this.kitCode = ext?.code;
  }
}

/**
 * POST a query or mutation to the private, session-authenticated endpoint.
 *
 * A GraphQL failure normally arrives as HTTP 200 with a populated `errors`
 * array — NOT as a 4xx — so a status check alone would silently return
 * `undefined` data. Throw on either signal.
 */
export async function sessionGraphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/graphql`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      // Required by the server's CSRF-prevention plugin.
      "x-graphql-csrf": "1",
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = (await response.json()) as {
    data?: T;
    errors?: GraphqlErrorEntry[];
  };

  if (!response.ok || (body.errors && body.errors.length > 0)) {
    throw new GraphqlError(response.status, body.errors ?? []);
  }
  return body.data as T;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd ntizo-workspace/apps/frontend/web && bun run vitest run src/shared/lib/graphql`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add ntizo-workspace/apps/frontend/web
git commit -m "feat(web): credentialed session GraphQL client with coded errors"
```

---

### Task 4: Restructure `features/provider` into Clean Architecture layers

**Files (moves, then edits):**
- `features/provider/types.ts` → `features/provider/domain/types.ts`
- `features/provider/lib/slugify.ts` → `features/provider/domain/slugify.ts`
- `features/provider/lib/provider-api.ts` → **replaced** by `features/provider/data/provider.repository.ts`
- `features/provider/hooks/*.ts` → `features/provider/viewmodel/*.ts`
- `features/provider/pages/*.tsx` + `components/*.tsx` → `features/provider/ui/*.tsx`
- Create: `features/provider/index.ts` (barrel)

**Interfaces:**
- Consumes: `sessionGraphql`, `GraphqlError` (Task 3).
- Produces: `providerQueries` (queryOptions factories) and mutation functions from `data/provider.repository.ts`; the viewmodel hooks keep their current exported names so `ui/` needs no rewrite beyond import paths.

**Dependency rule** — `ui → viewmodel → data → domain`, never backwards. Task 6 enforces it with lint; get it right here.

- [ ] **Step 1: Move files without changing behaviour**

Use `git mv` so history follows:

```bash
cd ntizo-workspace/apps/frontend/web/src/features/provider
mkdir -p domain data viewmodel ui
git mv types.ts domain/types.ts
git mv lib/slugify.ts domain/slugify.ts
git mv hooks/use-active-provider.ts viewmodel/use-active-provider.ts
git mv hooks/use-member-mutations.ts viewmodel/use-member-mutations.ts
git mv hooks/use-provider-mutations.ts viewmodel/use-provider-mutations.ts
git mv hooks/use-providers.ts viewmodel/use-providers.ts
git mv components/create-provider-dialog.tsx ui/create-provider-dialog.tsx
git mv pages/members.tsx ui/members.tsx
git mv pages/no-provider.tsx ui/no-provider.tsx
git mv pages/overview.tsx ui/overview.tsx
git mv pages/settings.tsx ui/settings.tsx
rmdir hooks components pages lib 2>/dev/null || true
```

- [ ] **Step 2: Fix every import path**

`bun run check-types` in `apps/frontend/web` will list every broken import.
Fix them all — including the seven files outside this feature that import
`provider-api`:

```
features/auth/components/accept-invite.tsx
routes/provider/index.tsx
shared/components/zone-switcher.tsx
shared/lib/api/post-login.ts
```

(plus the three viewmodel hooks, which Task 5 rewrites anyway).

Leave `provider-api.ts` in place for now — Task 5 deletes it. This step is a
pure move: **typecheck and tests must pass with no behaviour change**.

- [ ] **Step 3: Verify nothing changed**

```bash
cd ntizo-workspace/apps/frontend/web
bun run check-types && bun run test
```

Expected: clean, 21 tests pass. If a test fails, you changed behaviour — undo it.

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor(web): move features/provider into domain/data/viewmodel/ui"
```

---

### Task 5: Replace the REST data layer with GraphQL

**Files:**
- Create: `features/provider/data/provider.repository.ts`
- Delete: `features/provider/lib/provider-api.ts`
- Modify: `features/provider/viewmodel/*.ts`, `features/auth/components/accept-invite.tsx`, `routes/provider/index.tsx`, `shared/components/zone-switcher.tsx`, `shared/lib/api/post-login.ts`
- Test: `features/provider/data/__tests__/provider.repository.test.ts`

**Interfaces:**
- Consumes: `sessionGraphql` (Task 3).
- Produces: `providerQueries.mine()`, `providerQueries.byId(id)` (queryOptions), and mutation functions `createProvider`, `registerMe`, `updateProvider`, `deactivateProvider`, `inviteMember`, `acceptInvite`, `revokeInvite`, `removeMember`, `updateMemberRole` — same names the current `provider-api.ts` exports, so viewmodel changes stay small.

**Field names — the kit flattens namespaces.** Use these exactly:

| Operation | GraphQL field | Kind |
|---|---|---|
| list mine | `providerMine` | query |
| detail | `providerById` | query |
| create | `providerCreate` | mutation |
| update | `providerUpdate` | mutation |
| deactivate | `providerDeactivate` | mutation |
| register me | `providerRegisterMe` | mutation |
| invite | `providerInvitesSend` | mutation |
| accept invite | `providerInvitesAccept` | mutation |
| revoke invite | `providerInvitesRevoke` | mutation |
| remove member | `providerMembersRemove` | mutation |
| change role | `providerMembersUpdateRole` | mutation |

> **Confirm these against the live SDL before writing the file.** Start the API
> and run an introspection query for the root `Query`/`Mutation` field names.
> If any differ, use the real name and record the discrepancy in your report.
> Every field takes a required `input` argument — send `input: {}` for
> `providerMine`.

- [ ] **Step 1: Write the failing test**

Create `features/provider/data/__tests__/provider.repository.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { providerQueries, inviteMember } from "../provider.repository";
import * as client from "@/shared/lib/graphql/session-graphql";

afterEach(() => vi.restoreAllMocks());

describe("providerQueries.mine", () => {
  it("exposes a stable query key and unwraps the flattened field", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ providerMine: [{ id: "p1", name: "Org" }] } as never);

    const opts = providerQueries.mine();
    expect(opts.queryKey).toEqual(["providers", "mine"]);

    const result = await (opts.queryFn as () => Promise<unknown>)();
    expect(result).toEqual([{ id: "p1", name: "Org" }]);
    // Sends `input: {}` — the field's argument is required even though empty.
    expect(spy.mock.calls[0]![1]).toEqual({ input: {} });
  });
});

describe("mutations", () => {
  it("returns only the declared output of an invite", async () => {
    vi.spyOn(client, "sessionGraphql").mockResolvedValue({
      providerInvitesSend: { inviteId: "i1" },
    } as never);
    const out = await inviteMember("p1", { email: "a@b.c", role: "staff" });
    expect(out).toEqual({ inviteId: "i1" });
    // The backend strips it, but assert the client never surfaces a token either.
    expect("token" in (out as object)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd ntizo-workspace/apps/frontend/web && bun run vitest run src/features/provider/data`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the repository**

Create `features/provider/data/provider.repository.ts`. Shape (fill in the rest
following the table above):

```ts
import { queryOptions } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import type {
  CreateProviderBody,
  InviteMemberBody,
  ProviderDetail,
  ProviderRole,
  ProviderSummary,
  RegisterMeBody,
} from "../domain/types";

const MINE = `
  query ProviderMine($input: JSON!) {
    providerMine(input: $input) { id name slug type status role }
  }`;

const BY_ID = `
  query ProviderById($input: ProviderByIdInput!) {
    providerById(input: $input) {
      id name slug type status description ownerUserId
      members { userId email name role joinedAt }
      invites { id email role status }
    }
  }`;

/** Query definitions. Components consume these via useQuery(providerQueries.x()). */
export const providerQueries = {
  mine: () =>
    queryOptions({
      queryKey: ["providers", "mine"] as const,
      queryFn: async () => {
        const d = await sessionGraphql<{ providerMine: ProviderSummary[] }>(MINE, {
          input: {},
        });
        return d.providerMine;
      },
    }),

  byId: (providerId: string) =>
    queryOptions({
      queryKey: ["providers", providerId] as const,
      queryFn: async () => {
        const d = await sessionGraphql<{ providerById: ProviderDetail }>(BY_ID, {
          input: { providerId },
        });
        return d.providerById;
      },
    }),
};

export async function inviteMember(providerId: string, body: InviteMemberBody) {
  const d = await sessionGraphql<{ providerInvitesSend: { inviteId: string } }>(
    `mutation($input: ProviderInvitesSendInput!) {
       providerInvitesSend(input: $input) { inviteId }
     }`,
    { input: { providerId, ...body } },
  );
  return d.providerInvitesSend;
}

// … the remaining mutations follow the same shape.
```

- [ ] **Step 4: Point the viewmodels at it and delete the REST module**

Rewrite the four `viewmodel/*.ts` hooks to consume `providerQueries` / the
mutation functions. Update the four outside consumers listed in **Files**.
`shared/lib/api/post-login.ts` and `shared/components/zone-switcher.tsx` both
call `listMyProviders()` — switch them to `providerQueries.mine()`.

Then:

```bash
git rm ntizo-workspace/apps/frontend/web/src/features/provider/lib/provider-api.ts
```

`shared/lib/api/me.ts` stays on REST — `/api/me` is a user-BC endpoint and there
is no `read/user` GraphQL slice yet.

- [ ] **Step 5: Surface coded errors in the UI**

Where the UI currently renders a REST error string, branch on
`GraphqlError.code` instead. At minimum handle `MEMBER_ALREADY_EXISTS`,
`INVITE_ALREADY_USED`, `INVITE_EXPIRED` and `INSUFFICIENT_PROVIDER_PERMISSIONS`
with specific copy; fall back to the error's `message` otherwise. Add the
strings to `shared/locales/{en,pt}/provider.json`.

- [ ] **Step 6: Verify**

```bash
cd ntizo-workspace/apps/frontend/web
bun run check-types && bun run lint && bun run test
```

Expected: clean; the 21 existing tests plus the new ones pass.

- [ ] **Step 7: Commit**

```bash
git commit -am "feat(web): move the provider feature onto GraphQL, delete provider-api"
```

---

### Task 6: `#/*` imports and boundaries lint

**Files:**
- Modify: `apps/frontend/web/package.json` (add `imports`), `tsconfig.json` (add path), `eslint.config.js`
- Modify: source files, mechanically, `@/` → `#/`

**Interfaces:**
- Produces: a lint rule set that fails the build on a backwards dependency.

- [ ] **Step 1: Add the subpath import**

`package.json`: `"imports": { "#/*": "./src/*" }`.
`tsconfig.json` `paths`: keep `"@/*"` AND add `"#/*": ["./src/*"]` — the
reference supports both, so the migration can be incremental.

- [ ] **Step 2: Add the boundaries rules**

```bash
cd ntizo-workspace/apps/frontend/web && bun add -d eslint-plugin-boundaries
```

Extend `eslint.config.js`:

```js
import boundaries from "eslint-plugin-boundaries";

// … inside the exported array:
{
  plugins: { boundaries },
  settings: {
    "boundaries/elements": [
      { type: "domain",    pattern: ["src/features/*/domain/**", "src/shared/domain/**"] },
      { type: "data",      pattern: ["src/features/*/data/**"] },
      { type: "viewmodel", pattern: ["src/features/*/viewmodel/**"] },
      { type: "ui",        pattern: ["src/features/*/ui/**", "src/shared/ui/**", "src/shared/components/**"] },
      { type: "routes",    pattern: ["src/routes/**"] },
      { type: "shared",    pattern: ["src/shared/**"] },
    ],
  },
  rules: {
    "boundaries/element-types": ["error", {
      default: "disallow",
      rules: [
        { from: "domain",    allow: ["domain"] },
        { from: "data",      allow: ["domain", "data", "shared"] },
        { from: "viewmodel", allow: ["domain", "data", "viewmodel", "shared"] },
        { from: "ui",        allow: ["domain", "viewmodel", "ui", "shared"] },
        { from: "routes",    allow: ["domain", "viewmodel", "ui", "routes", "shared"] },
        { from: "shared",    allow: ["domain", "shared"] },
      ],
    }],
  },
},
```

> `ui` may NOT import `data` — that is the rule with teeth. If the existing code
> violates it, fix the code by routing through a viewmodel; do not widen the rule.

- [ ] **Step 3: Prove the rule bites**

Add a temporary import of `../data/provider.repository` inside a `ui/` file, run
`bun run lint`, confirm it FAILS with a `boundaries/element-types` error, then
remove it and confirm lint passes. Report both.

- [ ] **Step 4: Verify and commit**

```bash
cd ntizo-workspace && bun run lint && bun run check-types && bun run test
git commit -am "chore(web): #/ subpath imports and architecture boundaries lint"
```

---

### Task 7: Delete the REST provider router and close the two deferred gates

**Files:**
- Delete: `packages/backend/src/modules/ntizo/bounded-contexts/provider/infrastructure/rest/provider.router.ts`
- Modify: `apps/backend/api/src/api.ts`, `packages/backend/package.json` (drop the router export)
- Create: `packages/backend/src/modules/ntizo/__tests__/fitness-no-framework-in-packages.test.ts`
- Create: `packages/backend/src/modules/ntizo/__tests__/fitness-no-bc-router.test.ts`

**Why now.** These two gates were written into the Phase 1A plan and deliberately
deferred: they cannot pass while the router exists, and the router had to survive
until the frontend cut over. Task 5 completed that.

- [ ] **Step 1: Confirm nothing still calls the REST provider endpoints**

```bash
cd ntizo-workspace
grep -rn "api/providers" apps/frontend/web/src || echo "  no frontend references — safe to delete"
```

Expected: no matches. If any remain, Task 5 is incomplete — finish it first.

- [ ] **Step 2: Delete the router and unmount it**

```bash
git rm packages/backend/src/modules/ntizo/bounded-contexts/provider/infrastructure/rest/provider.router.ts
```

Remove `createProviderRouter` — its import, its `app.route("/api", ...)` call in
`apps/backend/api/src/api.ts`, and the
`"./modules/ntizo/bounded-contexts/provider/router"` entry from
`packages/backend/package.json` exports.

Leave the **user** router (`GET /api/me`) mounted — `shared/lib/api/me.ts` still
uses it and there is no `read/user` slice yet.

- [ ] **Step 3: Write the framework-isolation gate (now package-wide)**

Create `modules/ntizo/__tests__/fitness-no-framework-in-packages.test.ts`. Walk
every `.ts` under `packages/backend/src` and assert none matches the framework
import regex. Reuse the regex from the existing
`fitness-no-framework-in-read-write.test.ts` — it already covers `from`,
`import()` and `require()` with bare-or-subpath specifiers, which a naive
`from "hono"` substring check does not.

- [ ] **Step 4: Write the no-BC-router gate**

Create `modules/ntizo/__tests__/fitness-no-bc-router.test.ts`: assert no file
under `bounded-contexts/**` lives in a directory named `rest`, `http` or
`graphql`, and that no file there exports a symbol matching `/^create\w*Router$/`.
Presentation belongs in `read/`, `write/` or `public/`.

- [ ] **Step 5: Prove BOTH gates bite**

For each: introduce a real violation (add `import { Hono } from "hono";` to a
file under `bounded-contexts/`; create a throwaway
`bounded-contexts/provider/infrastructure/rest/x.router.ts` exporting
`createXRouter`), run the gate, confirm it FAILS, remove, confirm it passes.
Report the failure output for both and confirm `git diff` shows no residue.

- [ ] **Step 6: Verify the API still boots and serves**

```bash
pkill -f "workerd|wrangler"; nvm use 22
cd ntizo-workspace/apps/backend/api && bun run dev &
sleep 10
curl -s http://localhost:8788/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8788/api/providers/mine   # expect 404 — route is gone
```

- [ ] **Step 7: Commit**

```bash
git commit -am "refactor(backend): delete the provider REST router; close both fitness gates"
```

---

### Task 8: Full-stack verification

**Files:** none (verification only)

- [ ] **Step 1: Every workspace green**

```bash
cd ntizo-workspace
bun run check-types && bun run lint && bun run test && bun run build
```

- [ ] **Step 2: Drive the app in a browser, over GraphQL**

Start both servers (`nvm use 22`). Sign in through the real UI as
`pw.tester.0807@example.com` / `password123`. Confirm:

- login routes to `/provider/overview` and the dashboard renders real data
- the members page lists members and pending invites
- the browser devtools Network tab shows requests to `/graphql` and **none** to
  `/api/providers/*`
- zero console errors

- [ ] **Step 3: Confirm a coded error reaches the UI**

Trigger a duplicate invite (invite an address that is already a member) and
confirm the UI shows the specific `MEMBER_ALREADY_EXISTS` copy, not a generic
"unexpected error". This is the regression Task 1 exists to prevent.

- [ ] **Step 4: Confirm the authorization boundary still holds**

Sign in as `callback.check@example.com` (owns no provider) and confirm
`/provider` does not expose another provider's members — the GraphQL read side
must refuse, exactly as it did in Phase 1A.

- [ ] **Step 5: Record what remains**

Confirm and carry into Plan 1C:
- the frontend is still an SPA; TanStack Start / SSR is not adopted
- `shared/lib/api/me.ts` still uses REST `/api/me`
- `@/` imports still exist alongside `#/`

- [ ] **Step 6: Commit**

```bash
git commit --allow-empty -m "chore: Phase 1B complete — frontend on GraphQL, REST provider router deleted"
```

---

## Deliberately NOT in this plan

**TanStack Start and SSR** (spec §1.5's rendering half) is Plan 1C. It is a
rendering-pipeline change — Start plugin, server entry, prerendering, the worker
swap — that shares no code with the data-layer cutover and would roughly double
this plan while making a bisect much harder if something breaks. 1B leaves the
app a working SPA on GraphQL; 1C changes only how it renders.

**Hyperdrive / deploy provisioning** needs the Cloudflare account (see
`.github/README.md`).

**A `read/user` slice.** `/api/me` stays REST until the User BC gets the Phase 2
treatment.

## Self-Review

**Spec coverage.** §1.5's data layer, feature restructure, `#/` imports and
boundaries lint → Tasks 3–6. §1.5's SSR half → deferred to 1C, stated above.
§1.7 error handling → Tasks 1, 2, 5. Carry-forward "delete the router + two
gates" → Task 7. Carry-forward "error taxonomy" → Tasks 1–2. Carry-forward
"`platformRole` fabricated" → **not addressed here**; it is inert (nothing reads
it) and belongs with the Phase 2 User BC work that introduces a role-sensitive
check.

**Type consistency.** `sessionGraphql`/`GraphqlError` defined in Task 3, consumed
in Tasks 5 and 8. `providerQueries`/mutation names defined in Task 5 and used by
the viewmodels in the same task. The domain error codes defined in Task 1 are the
strings Task 5 branches on and Task 8 verifies end-to-end.

**One deliberate uncertainty.** Task 5's GraphQL field names are written from the
kit's documented flattening rule (`provider.mine` → `providerMine`), verified
live for `providerMine`, `providerById` and `providerInvitesSend` during Phase
1A. The remaining eight are inferred from the same rule, so Task 5 opens by
confirming all of them against the live SDL rather than trusting the table.
