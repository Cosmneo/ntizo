# Activity Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record what a person did on Ntizo and show it at `/activity` and beside the notification inbox.

**Architecture:** A table keyed by actor, written by handlers on the existing in-process `EventRouter` after the producing transaction commits — the same machinery the notification handlers use. The payload is a snapshot, so a row keeps saying the same thing when the service it names is renamed. Reads are cursor-paged and rendered client-side from `type` + `payload`, so the server never needs the reader's locale.

**Tech Stack:** Bun, Drizzle + Neon Postgres (named schemas), onion-lasagna GraphQL field kit, TanStack Query + Router, React 19, i18next across 8 locales.

**Spec:** `docs/superpowers/specs/2026-08-26-activity-feed-design.md`

## Global Constraints

- `packages/backend` must NOT import a web framework binding: `hono`, `graphql-yoga`, `@cosmneo/onion-lasagna-hono`, `@cosmneo/onion-lasagna-yoga`. The GraphQL **field kit** (`@cosmneo/onion-lasagna/graphql/field`) IS allowed. Two fitness tests enforce this — `fitness-no-framework-in-packages.test.ts` and `fitness-no-framework-in-read-write.test.ts`.
- The 8 locales are exactly: `en-US`, `pt-MZ`, `pt-PT`, `es-ES`, `fr-FR`, `it-IT`, `de-DE`, `nl-NL`. Every user-facing string ships in all eight.
- `DEFAULT_LOCALE` is `pt-MZ`. Never default to English by writing `"en-US"` as a literal.
- Frontend layers: `domain/` imports nothing, `data/` imports domain, `viewmodel/` imports domain+data, `ui/` imports viewmodel+domain. **`ui/` may never import `data/`.** `eslint-plugin-boundaries` has `no-unknown-files: "error"`, so a file outside a layer fails lint — put tests inside a layer's `__tests__/`, never at the feature root.
- A domain-event handler NEVER throws at its caller and never stops its siblings. `EventRouter` documents this; the notifications phase needed three review rounds to make it true.
- `getRequestScopedLogger()` throws unconditionally and nothing sets a scope. Use `console.error` with the error as a **separate argument** (`console.error("[msg]", error)`), never interpolated — the interpolated form throws on hostile error values. `tx-context.ts:21` does the same.
- Do NOT run `prettier`. This repo has no prettier config; it reformats 25 unrelated files.
- Gates for every task: `cd packages/backend && bun test src/modules/ntizo && bun run typecheck && bun run lint` AND `cd apps/frontend/web && bun run test && bun run typecheck` AND `cd apps/backend/api && bun run typecheck && bun run lint`. Run both packages — a change in `packages/backend` that breaks a consumer in `apps/` was invisible for four commits in the last phase because task gates only ran one.
- Turbo caches `lint`. Use `bun run lint --force` when a run must reflect the file you just wrote.

---

## File Structure

**New — backend, the activity bounded context** (mirrors `bounded-contexts/notification/`):

| file | responsibility |
|---|---|
| `shared/infrastructure/database/activity/schemas/activity.schema.ts` | the Drizzle table |
| `bounded-contexts/activity/domain/aggregates/activity.aggregate.ts` | one recorded action, and what a valid one is |
| `bounded-contexts/activity/app/ports/outbound/activity.repository.port.ts` | save + list |
| `bounded-contexts/activity/app/ports/inbound/record-activity.internal.command.port.ts` | the input shape handlers speak |
| `bounded-contexts/activity/app/use-cases/record-activity.internal.command.ts` | the one way a row comes into existence |
| `bounded-contexts/activity/infrastructure/repositories/drizzle/activity.repository.ts` | the adapter |
| `bounded-contexts/activity/bootstrap/index.ts` | wiring |

**New — backend, write and read layers:**

| file | responsibility |
|---|---|
| `write/activity/events/handlers/user.event-handlers.ts` | `user.registered` |
| `write/activity/events/handlers/provider.event-handlers.ts` | provider + invite events |
| `write/activity/events/handlers/catalog.event-handlers.ts` | service events |
| `write/activity/events/handlers/review.event-handlers.ts` | `review.created` |
| `write/activity/events/index.ts` | the four registrars |
| `read/activity/app/use-cases/list-activity.projection.ts` | the cursor page |
| `read/activity/graphql/schema/queries.ts` | the field |
| `read/activity/graphql/handlers/queries.handlers.ts` | the handler |
| `read/activity/bootstrap/index.ts` | wiring |
| `packages/shared/src/read-models/system/activity/activity.schema.ts` | the DTO both sides share |

**Modified — backend:**

| file | change |
|---|---|
| `bounded-contexts/catalog/domain/events.ts` | `actorUserId` on the four service events |
| `bounded-contexts/provider/domain/events/index.ts` | `actorUserId` on the two invite events |
| `bounded-contexts/review/domain/events/index.ts` | **new file** — `ReviewCreated` |
| `bounded-contexts/review/app/use-cases/submit-review.command.ts` | publish it |
| `apps/backend/api/src/api.ts` | register the four handler sets |

**Modified — frontend:**

| file | change |
|---|---|
| `features/activity/domain/types.ts` | `description` → `type` + `payload` |
| `features/activity/ui/activity-list.tsx` | render from the type key |
| `features/activity/data/activity.repository.ts` | **new** — the query |
| `features/activity/viewmodel/use-activity.ts` | **new** — the hook |
| `features/activity/ui/customer-activity-page.tsx` | real data |
| `features/notifications/ui/notifications-page.tsx` | the activity column |
| `shared/locales/*/account.json` | nine `activityType.*` keys × 8 |

---

## Task 1: The table

**Files:**
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/activity/schemas/activity.schema.ts`
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/activity/schemas/index.ts`
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/schemas.ts` (re-export)
- Test: `packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/activity-constraints.test.ts`

**Interfaces:**
- Produces: `activity` (Drizzle table), `ActivityRow`, `NewActivityRow`, `activitySchema` (the `pgSchema`).

- [ ] **Step 1: Write the schema**

```ts
import { pgSchema, uuid, varchar, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const activitySchema = pgSchema("ntizo_activity");

/**
 * One thing a person did.
 *
 * Keyed by the actor, never by the thing acted on: this table answers "what
 * did I do", and the inbox answers "what happened to me". Those are different
 * questions and an event answers at most one of them per person — an admin
 * approving a provider writes activity for the admin and a notification for
 * the provider.
 */
export const activity = activitySchema.table(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id").notNull(),
    type: varchar("type", { length: 64 }).notNull(),
    /**
     * The words the sentence needs, snapshotted.
     *
     * A service name, a provider name — never a foreign key. A history entry
     * has to keep saying the same thing after the service is renamed or
     * deleted, and a row that resolved its name on read would rewrite the
     * past every time somebody edited it. The notifications phase shipped a
     * team invitation that snapshotted a uuid instead of a name and the email
     * arrived saying nothing; this is that lesson as a column comment.
     */
    payload: jsonb("payload").notNull(),
    /**
     * From the event, not from the insert.
     *
     * A handler that runs late still sorts where it belongs. Using the insert
     * time would put a delayed row at the top of somebody's history.
     */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The only query this table serves: one person's history, newest first.
    // `id` is in the index because the cursor pages on (occurred_at, id) and
    // two events can share a millisecond.
    index("idx_activity_actor_occurred").on(t.actorUserId, t.occurredAt.desc(), t.id.desc()),
  ],
);

export type ActivityRow = typeof activity.$inferSelect;
export type NewActivityRow = typeof activity.$inferInsert;
```

- [ ] **Step 2: Export it**

`.../database/activity/schemas/index.ts`:

```ts
export * from "./activity.schema";
```

Then add `export * from "./activity/schemas";` to `.../database/schemas.ts`, beside the existing notification export. **Read that file first** — match how the neighbours are exported rather than assuming.

- [ ] **Step 3: Generate the migration**

```bash
cd packages/backend && bun run db:ntizo:generate
```

Expected: a new `00NN_*.sql` under `src/modules/ntizo/shared/infrastructure/migrations/`. Open it and confirm it only CREATEs — a generated `DROP` means the schema file disagrees with the database and must be resolved before going further. **Report the file name.**

- [ ] **Step 4: Apply it to dev**

```bash
cd packages/backend && bun run db:ntizo:dev:migrate
```

- [ ] **Step 5: Write the constraint test**

`.../database/__tests__/activity-constraints.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { activity } from "../activity/schemas/activity.schema";

describe("the activity table", () => {
  it("keys rows by the actor, not by what was acted on", () => {
    // The whole distinction from the inbox. A row keyed by the thing would
    // make "what did I do" unanswerable without a join that does not exist.
    expect(activity.actorUserId.notNull).toBe(true);
    expect(activity.actorUserId.name).toBe("actor_user_id");
  });

  it("has no read state, because activity is not read", () => {
    // If this ever gains a `read_at`, the table has drifted into being a
    // second inbox and the two will disagree about what a notification is.
    const columns = Object.keys(activity);
    expect(columns).not.toContain("readAt");
    expect(columns).not.toContain("isRead");
  });

  it("records when the event happened, separately from when it was written", () => {
    expect(activity.occurredAt.notNull).toBe(true);
    expect(activity.createdAt.notNull).toBe(true);
  });
});
```

- [ ] **Step 6: Run the gates**

```bash
cd packages/backend && bun test src/modules/ntizo/shared/infrastructure/database && bun run typecheck && bun run lint
```

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo/shared/infrastructure
git commit -m "feat(activity): the table a person's history lives in"
```

---

## Task 2: The aggregate and its ports

**Files:**
- Create: `.../bounded-contexts/activity/domain/aggregates/activity.aggregate.ts`
- Create: `.../bounded-contexts/activity/domain/activity-type.ts`
- Create: `.../bounded-contexts/activity/app/ports/outbound/activity.repository.port.ts`
- Create: `.../bounded-contexts/activity/app/ports/inbound/record-activity.internal.command.port.ts`
- Create: `.../bounded-contexts/activity/app/ports/{inbound,outbound}/index.ts`
- Test: `.../bounded-contexts/activity/__tests__/activity.aggregate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ACTIVITY_TYPES` (readonly tuple), `ActivityType`, `Activity.record(...)`, `ActivityRepositoryPort`, `RecordActivityInternalInput`.

- [ ] **Step 1: The type list**

`domain/activity-type.ts`:

```ts
/**
 * Every kind of thing this platform records a person as having done.
 *
 * A closed list, not a free string. An unknown type reaching the table is a
 * row the interface renders as its own key — the reader sees
 * "activityType.somethingNew" where a sentence should be.
 *
 * Six of the fifteen domain events are deliberately absent. `provider.updated`
 * and `service.updated` say nothing a person would read back — updated what? —
 * and a feed of them buries the entries that mean something. `member.added`,
 * `member.removed`, `invite.declined` and `invite.revoked` are the other side
 * of an action already recorded: `invite.sent` sits in the inviter's history
 * and `invite.accepted` in the invitee's, so logging the membership too would
 * write the same moment three times.
 */
export const ACTIVITY_TYPES = [
  "user.registered",
  "provider.created",
  "provider.statusDecided",
  "provider.inviteSent",
  "provider.inviteAccepted",
  "service.created",
  "service.published",
  "service.unpublished",
  "review.created",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export function isActivityType(value: string): value is ActivityType {
  return (ACTIVITY_TYPES as readonly string[]).includes(value);
}
```

- [ ] **Step 2: Write the failing aggregate test**

`__tests__/activity.aggregate.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Activity } from "../domain/aggregates/activity.aggregate";

const base = {
  actorUserId: "u1",
  type: "service.published" as const,
  payload: { serviceName: "Corte de cabelo" },
  occurredAt: new Date("2026-08-26T10:00:00Z"),
};

describe("Activity.record", () => {
  it("keeps the payload it was given", () => {
    expect(Activity.record(base).payload).toEqual({ serviceName: "Corte de cabelo" });
  });

  it("refuses a type nobody can render", () => {
    // A row with an unknown type reaches the screen as its own key. Rejecting
    // it here means the write fails loudly instead of the reader seeing
    // "activityType.whatever" months later.
    expect(() =>
      Activity.record({ ...base, type: "service.renamed" as never }),
    ).toThrow(/unknown activity type/i);
  });

  it("refuses an empty actor", () => {
    // A row nobody owns is unreachable: the only query filters by actor.
    expect(() => Activity.record({ ...base, actorUserId: "  " })).toThrow(/actor/i);
  });

  it("keeps the event's own time rather than stamping now", () => {
    // A handler that runs late must not sort to the top of a history.
    expect(Activity.record(base).occurredAt.toISOString()).toBe("2026-08-26T10:00:00.000Z");
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/activity
```
Expected: FAIL — module not found.

- [ ] **Step 4: Write the aggregate**

```ts
import { isActivityType, type ActivityType } from "../activity-type";

export interface ActivityProps {
  id?: string;
  actorUserId: string;
  type: ActivityType;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

/**
 * One recorded action.
 *
 * Thin on purpose: there is nothing to transition. An activity row is written
 * once and never changes — no read state, no status, no correction. That is
 * what separates it from `NotificationDelivery`, which exists precisely to
 * carry a status through time.
 */
export class Activity {
  private constructor(private readonly props: Required<Omit<ActivityProps, "id">> & { id?: string }) {}

  static record(params: ActivityProps): Activity {
    if (!isActivityType(params.type)) {
      throw new Error(`[activity] unknown activity type: ${String(params.type)}`);
    }
    if (!params.actorUserId.trim()) {
      throw new Error("[activity] an activity row needs an actor");
    }
    return new Activity({
      id: params.id,
      actorUserId: params.actorUserId,
      type: params.type,
      payload: params.payload,
      occurredAt: params.occurredAt,
    });
  }

  get id() { return this.props.id; }
  get actorUserId() { return this.props.actorUserId; }
  get type() { return this.props.type; }
  get payload() { return this.props.payload; }
  get occurredAt() { return this.props.occurredAt; }
}
```

- [ ] **Step 5: Run and watch it pass**

Expected: PASS, 4 tests.

- [ ] **Step 6: Write the ports**

`app/ports/outbound/activity.repository.port.ts`:

```ts
import type { Activity } from "../../../domain/aggregates/activity.aggregate";

/** One page of somebody's history, newest first. */
export interface ActivityPage {
  items: Activity[];
  /** Pass back as `cursor` to get the next page. Null when there is no more. */
  nextCursor: string | null;
}

export interface ActivityRepositoryPort {
  save(entity: Activity): Promise<string>;

  /**
   * Cursor-paged, not offset-paged.
   *
   * This table is appended to at the top, which is exactly where offset
   * breaks: a row written between two page fetches shifts every offset by one,
   * so the reader sees an entry twice or never. The notification inbox uses
   * offset and gets away with it because its list is read in one sitting.
   */
  listForActor(params: {
    actorUserId: string;
    limit: number;
    cursor?: string | null;
  }): Promise<ActivityPage>;
}
```

`app/ports/inbound/record-activity.internal.command.port.ts`:

```ts
import type { ActivityType } from "../../../domain/activity-type";

export interface RecordActivityInternalInput {
  actorUserId: string;
  type: ActivityType;
  /** Already snapshotted by the caller. See the table's column comment. */
  payload: Record<string, unknown>;
  occurredAt: Date;
}

export interface RecordActivityInternalPort {
  execute(input: RecordActivityInternalInput): Promise<void>;
}
```

Both `index.ts` files re-export their siblings, matching `bounded-contexts/notification/app/ports/*/index.ts` — **read those first**.

- [ ] **Step 7: Gates and commit**

```bash
cd packages/backend && bun test src/modules/ntizo && bun run typecheck && bun run lint
git add packages/backend/src/modules/ntizo/bounded-contexts/activity
git commit -m "feat(activity): what a recorded action is, and what a valid one is"
```

---

## Task 3: The repository, the command, the bootstrap

**Files:**
- Create: `.../bounded-contexts/activity/infrastructure/repositories/drizzle/activity.repository.ts`
- Create: `.../bounded-contexts/activity/app/use-cases/record-activity.internal.command.ts`
- Create: `.../bounded-contexts/activity/bootstrap/index.ts`
- Create: `.../bounded-contexts/activity/index.ts`
- Test: `.../bounded-contexts/activity/__tests__/record-activity.test.ts`

**Interfaces:**
- Consumes: `Activity`, `ActivityRepositoryPort`, `RecordActivityInternalInput` (Task 2); `activity` table (Task 1).
- Produces: `RecordActivityInternalCommand`, `DrizzleActivityRepository`, `bootstrapActivity()` returning `{ useCases: { internal: { recordActivity } }, repositories: { activity } }`.

**Read `bounded-contexts/notification/infrastructure/repositories/drizzle/notification.repository.ts` first.** It shows how `getDb()` is reached and how rows map to aggregates. Do not invent an import path — count the directory depth against the real tree.

- [ ] **Step 1: Write the failing command test**

```ts
import { beforeEach, describe, expect, it } from "bun:test";
import { RecordActivityInternalCommand } from "../app/use-cases/record-activity.internal.command";

class FakeRepo {
  saved: unknown[] = [];
  fail = false;
  async save(e: unknown) {
    if (this.fail) throw new Error("insert failed");
    this.saved.push(e);
    return `a${this.saved.length}`;
  }
  async listForActor() { return { items: [], nextCursor: null }; }
}

let repo: FakeRepo;
let cmd: RecordActivityInternalCommand;

beforeEach(() => {
  repo = new FakeRepo();
  cmd = new RecordActivityInternalCommand(repo as never);
});

const input = {
  actorUserId: "u1",
  type: "service.published" as const,
  payload: { serviceName: "Corte" },
  occurredAt: new Date("2026-08-26T10:00:00Z"),
};

describe("RecordActivityInternalCommand", () => {
  it("writes the row", async () => {
    await cmd.execute(input);
    expect(repo.saved).toHaveLength(1);
  });

  it("never throws at its caller", async () => {
    // This runs from a domain-event handler, after the producing transaction
    // has committed and possibly after the response has gone. Throwing would
    // turn a successful service publication into a 500 over a log entry.
    repo.fail = true;
    await expect(cmd.execute(input)).resolves.toBeUndefined();
  });

  it("logs what it swallowed, so a lost row is not silent", async () => {
    repo.fail = true;
    const seen: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { seen.push(args); };
    await cmd.execute(input);
    console.error = original;
    expect(seen).toHaveLength(1);
  });

  it("rejects an unknown type without reaching the repository", async () => {
    // The aggregate throws; the command swallows it. What must not happen is
    // a bad row being written.
    await cmd.execute({ ...input, type: "service.renamed" as never });
    expect(repo.saved).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/activity
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the command**

```ts
import { Activity } from "../../domain/aggregates/activity.aggregate";
import type { ActivityRepositoryPort } from "../ports/outbound/activity.repository.port";
import type {
  RecordActivityInternalInput,
  RecordActivityInternalPort,
} from "../ports/inbound/record-activity.internal.command.port";

/**
 * The one way an activity row comes into existence.
 *
 * Internal: there is no mutation behind it and there must not be. Activity is
 * a consequence of something the platform observed, never something a client
 * asks for — an endpoint that recorded activity would let anybody write into
 * anybody's history.
 *
 * **Never throws at its caller.** Every caller is a domain-event handler
 * running after the producing transaction committed. A history entry is worth
 * less than the write it describes, and losing the write to save the entry is
 * the wrong way round.
 */
export class RecordActivityInternalCommand implements RecordActivityInternalPort {
  constructor(private readonly repo: ActivityRepositoryPort) {}

  async execute(input: RecordActivityInternalInput): Promise<void> {
    try {
      await this.repo.save(
        Activity.record({
          actorUserId: input.actorUserId,
          type: input.type,
          payload: input.payload,
          occurredAt: input.occurredAt,
        }),
      );
    } catch (error) {
      // console.error, not the logger: getRequestScopedLogger() throws when no
      // scope is set and nothing in this repo sets one. The error is a
      // SEPARATE argument — interpolating it invokes getters that can throw.
      // tx-context.ts:21 does the same for the same reason.
      console.error("[activity] could not record an action", error);
    }
  }
}
```

- [ ] **Step 4: Run and watch it pass**

Expected: PASS, 4 tests.

- [ ] **Step 5: Write the repository**

```ts
import { and, desc, eq, lt, or } from "drizzle-orm";
import { getDb } from "../../../../../shared/infrastructure/database/tx-context";
import { activity } from "../../../../../shared/infrastructure/database/activity/schemas/activity.schema";
import { Activity } from "../../../domain/aggregates/activity.aggregate";
import type { ActivityType } from "../../../domain/activity-type";
import type { ActivityPage, ActivityRepositoryPort } from "../../../app/ports/outbound/activity.repository.port";

/**
 * The cursor is `<occurredAt ISO>|<id>`.
 *
 * Two facts, because one is not enough: two events can share a millisecond,
 * and a cursor on time alone would either skip the second or repeat it
 * forever. The id breaks the tie and is unique, so the pair is a total order.
 */
function encodeCursor(occurredAt: Date, id: string): string {
  return `${occurredAt.toISOString()}|${id}`;
}

function decodeCursor(cursor: string): { occurredAt: Date; id: string } | null {
  const [when, id] = cursor.split("|");
  if (!when || !id) return null;
  const occurredAt = new Date(when);
  return Number.isNaN(occurredAt.getTime()) ? null : { occurredAt, id };
}

export class DrizzleActivityRepository implements ActivityRepositoryPort {
  async save(entity: Activity): Promise<string> {
    const [row] = await getDb()
      .insert(activity)
      .values({
        actorUserId: entity.actorUserId,
        type: entity.type,
        payload: entity.payload,
        occurredAt: entity.occurredAt,
      })
      .returning({ id: activity.id });
    return row!.id;
  }

  async listForActor(params: {
    actorUserId: string;
    limit: number;
    cursor?: string | null;
  }): Promise<ActivityPage> {
    const after = params.cursor ? decodeCursor(params.cursor) : null;
    // One more than asked for: its existence is what says another page exists,
    // without a second COUNT query that could disagree with this one.
    const rows = await getDb()
      .select()
      .from(activity)
      .where(
        after
          ? and(
              eq(activity.actorUserId, params.actorUserId),
              or(
                lt(activity.occurredAt, after.occurredAt),
                and(eq(activity.occurredAt, after.occurredAt), lt(activity.id, after.id)),
              ),
            )
          : eq(activity.actorUserId, params.actorUserId),
      )
      .orderBy(desc(activity.occurredAt), desc(activity.id))
      .limit(params.limit + 1);

    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map((r) =>
        Activity.record({
          id: r.id,
          actorUserId: r.actorUserId,
          type: r.type as ActivityType,
          payload: r.payload as Record<string, unknown>,
          occurredAt: r.occurredAt,
        }),
      ),
      nextCursor: hasMore && last ? encodeCursor(last.occurredAt, last.id) : null,
    };
  }
}
```

- [ ] **Step 6: Write the bootstrap**

`bootstrap/index.ts` — match `bounded-contexts/notification/bootstrap/index.ts`'s shape:

```ts
import { DrizzleActivityRepository } from "../infrastructure/repositories/drizzle/activity.repository";
import { RecordActivityInternalCommand } from "../app/use-cases/record-activity.internal.command";

export function bootstrapActivity() {
  const repository = new DrizzleActivityRepository();
  return {
    repositories: { activity: repository },
    useCases: { internal: { recordActivity: new RecordActivityInternalCommand(repository) } },
  };
}

export type ActivityBootstrap = ReturnType<typeof bootstrapActivity>;
```

`bounded-contexts/activity/index.ts` re-exports the bootstrap, matching the notification context's own `index.ts`.

- [ ] **Step 7: Gates and commit**

```bash
cd packages/backend && bun test src/modules/ntizo && bun run typecheck && bun run lint
cd ../../apps/backend/api && bun run typecheck
git add packages/backend/src/modules/ntizo/bounded-contexts/activity
git commit -m "feat(activity): write a row, read a page, and never fail the caller"
```

---

## Task 4: An actor on the events that lack one

**Files:**
- Modify: `.../bounded-contexts/catalog/domain/events.ts`
- Modify: `.../bounded-contexts/catalog/app/use-cases/create-service.command.ts` and the publish/unpublish commands in the same folder
- Modify: `.../bounded-contexts/provider/domain/events/index.ts` (`ProviderInviteSent`, `ProviderInviteAccepted`)
- Modify: the provider commands that construct those two
- Test: `.../bounded-contexts/catalog/__tests__/events-carry-actor.test.ts`

**Interfaces:**
- Produces: `ServiceCreated`, `ServicePublished`, `ServiceUnpublished` payloads gain `actorUserId: string`; `ProviderInviteSent` and `ProviderInviteAccepted` gain `actorUserId: string`.

**Three events already carry their actor and must NOT be changed:** `user.registered` (`userId`), `provider.created` (`ownerUserId`), `provider.status.decided` (`decidedByUserId`). Handlers read those fields directly.

**The value is already in hand.** Every command that constructs these events receives `requesterUserId` for authorization — `create-service.command.ts:24` calls `isProviderMember(input.providerId, input.requesterUserId)`. Pass it; do not look it up.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "bun:test";
import { ServiceCreated, ServicePublished, ServiceUnpublished } from "../domain/events";

describe("service events", () => {
  it("say who caused them", () => {
    // Without this the activity row has no owner and the only query that
    // reads the table — one person's history — cannot find it.
    const e = new ServiceCreated({ serviceId: "s1", providerId: "p1", actorUserId: "u1" });
    expect(e.payload.actorUserId).toBe("u1");
  });

  it("carry the actor on publish and unpublish too", () => {
    expect(new ServicePublished({ serviceId: "s1", actorUserId: "u1" }).payload.actorUserId).toBe("u1");
    expect(new ServiceUnpublished({ serviceId: "s1", actorUserId: "u1" }).payload.actorUserId).toBe("u1");
  });

  it("keeps the aggregate id as the service, not the actor", () => {
    // The event is still ABOUT the service. Making the actor the aggregate id
    // would break every existing consumer that keys on it.
    expect(new ServicePublished({ serviceId: "s1", actorUserId: "u1" }).aggregateId).toBe("s1");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `actorUserId` is not in the payload type.

- [ ] **Step 3: Add the field**

In `catalog/domain/events.ts`, add `actorUserId: string;` to the payload type and constructor parameter of `ServiceCreated`, `ServicePublished` and `ServiceUnpublished`. Leave `ServiceUpdated` alone — it produces no activity.

Add this note above the three:

```ts
/**
 * `actorUserId` is who did it, and is separate from `providerId`, which is
 * whose it is. A workspace has several members and "the provider published
 * this" cannot say which of them to put it in front of.
 */
```

Do the same for `ProviderInviteSent` and `ProviderInviteAccepted` in `provider/domain/events/index.ts`.

- [ ] **Step 4: Pass it from the commands**

In each command that constructs one of the five events, pass `actorUserId: input.requesterUserId`. **Read each command first** — the field may already be named differently there, and inventing a name that does not compile costs a round.

For `ProviderInviteAccepted` the actor is the *invitee*, not the inviter: read the command to find which input holds them.

- [ ] **Step 5: Run everything**

```bash
cd packages/backend && bun test src/modules/ntizo && bun run typecheck && bun run lint
```

Every existing consumer ignores the new field, so nothing else should move. **If a test fails, that is a finding — report it rather than adjusting the test.**

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts
git commit -m "feat(events): five events now say who caused them"
```

---

## Task 5: The review context gets an event

**Files:**
- Create: `.../bounded-contexts/review/domain/events/index.ts`
- Modify: `.../bounded-contexts/review/app/use-cases/submit-review.command.ts`
- Test: `.../bounded-contexts/review/__tests__/review-created-event.test.ts`

**Interfaces:**
- Produces: `ReviewCreated` with payload `{ reviewId, providerId, providerName, rating, actorUserId }`, event name `"review.created"`.

**Why this exists:** the review context emits nothing at all. Without it a customer's history reads "you created your account" and stops — and the customer page is what prompted this work. There are 41 reviews in dev and no event for any of them.

**`providerName` is in the payload on purpose.** The sentence is "You reviewed *X*". Task 6's handler could look the name up, and for services it does — but a review's provider is already loaded in this command to check eligibility, so passing it costs nothing and saves the handler a query.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "bun:test";
import { ReviewCreated } from "../domain/events";

describe("ReviewCreated", () => {
  it("names the provider rather than only its id", () => {
    // The activity row renders "You reviewed X". An id would render the id.
    const e = new ReviewCreated({
      reviewId: "r1", providerId: "p1", providerName: "Barbearia do João",
      rating: 5, actorUserId: "u1",
    });
    expect(e.payload.providerName).toBe("Barbearia do João");
  });

  it("is about the review, and says who wrote it", () => {
    const e = new ReviewCreated({
      reviewId: "r1", providerId: "p1", providerName: "X", rating: 4, actorUserId: "u1",
    });
    expect(e.aggregateId).toBe("r1");
    expect(e.payload.actorUserId).toBe("u1");
  });

  it("is named review.created", () => {
    // The name is the key EventRouter fans out on. Renaming it silently
    // orphans every consumer, so it is pinned here.
    const e = new ReviewCreated({
      reviewId: "r1", providerId: "p1", providerName: "X", rating: 4, actorUserId: "u1",
    });
    expect(e.eventName).toBe("review.created");
  });
});
```

**Check `BaseDomainEvent`'s accessor before running this** — `eventName` may be spelled differently. `provider/domain/events/__tests__/events.test.ts` shows the real one.

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — module not found.

- [ ] **Step 3: Write the event**

```ts
import { BaseDomainEvent } from "@cosmneo/onion-lasagna";

/**
 * Somebody reviewed a provider.
 *
 * The Review context's first domain event — it had no event-recording
 * machinery at all, which is why a customer's history had nothing in it but a
 * registration.
 *
 * It carries the provider's name because the activity row that reacts to it
 * says "You reviewed X". A handler that looked the name up would tie a history
 * entry written once to a provider that can be renamed later, and the entry
 * would then quietly change what it said about the past.
 */
export class ReviewCreated extends BaseDomainEvent<{
  reviewId: string;
  providerId: string;
  providerName: string;
  rating: number;
  actorUserId: string;
}> {
  constructor(payload: {
    reviewId: string;
    providerId: string;
    providerName: string;
    rating: number;
    actorUserId: string;
  }) {
    super("review.created", payload.reviewId, payload);
  }
}
```

- [ ] **Step 4: Publish it from the command**

Read `submit-review.command.ts` fully first. Publish inside the same transaction as the review write, **last**, exactly as the provider commands do — the outbox row and the review commit or roll back together, and a review that failed halfway announces nothing.

The provider's name: the command already loads the provider for its eligibility check. If the loaded object does not carry a name, add the read rather than a second query in the handler — and say so in your report.

- [ ] **Step 5: Run everything and commit**

```bash
cd packages/backend && bun test src/modules/ntizo && bun run typecheck && bun run lint
git add packages/backend/src/modules/ntizo/bounded-contexts/review
git commit -m "feat(review): the context announces a review for the first time"
```

---

## Task 6: The handlers, and wiring them in

**Files:**
- Create: `.../write/activity/events/handlers/{user,provider,catalog,review}.event-handlers.ts`
- Create: `.../write/activity/events/index.ts`
- Create: `.../write/activity/index.ts`
- Modify: `apps/backend/api/src/api.ts`
- Test: `.../write/activity/__tests__/event-handlers.test.ts`

**Interfaces:**
- Consumes: `RecordActivityInternalCommand` (Task 3); the five events with actors (Task 4); `ReviewCreated` (Task 5); `EventRouter`.
- Produces: `registerUserActivityHandlers`, `registerProviderActivityHandlers`, `registerCatalogActivityHandlers`, `registerReviewActivityHandlers`, each `(router, deps) => void`.

**Read `write/notification/events/handlers/user.event-handlers.ts` first.** It is the exact shape to follow, including the import depth (`../../../../../../shared/infrastructure/events/event-router`) — count it against the real tree rather than copying blind, because your file sits at a different depth if you nest differently.

**Service names need a lookup.** `service.published` carries only `serviceId`. The catalog handler resolves the name once, at write time, and snapshots it. Declare a `ServiceNameReaderPort` in the activity context's outbound ports and implement it as a cross-BC adapter, exactly as `notification/infrastructure/outbound-adapters/cross-bc/` does for provider names — **read that folder before writing yours**.

- [ ] **Step 1: Write the failing handler test**

```ts
import { beforeEach, describe, expect, it } from "bun:test";
import { EventRouter } from "../../../../shared/infrastructure/events/event-router";
import { registerCatalogActivityHandlers } from "../events/handlers/catalog.event-handlers";
import { registerUserActivityHandlers } from "../events/handlers/user.event-handlers";

class SpyRecord {
  calls: Array<{ actorUserId: string; type: string; payload: Record<string, unknown> }> = [];
  fail = false;
  async execute(i: never) {
    if (this.fail) throw new Error("boom");
    this.calls.push(i);
  }
}
class FakeNames {
  async nameOf(id: string) { return id === "s1" ? "Corte de cabelo" : null; }
}

let router: EventRouter;
let record: SpyRecord;

beforeEach(() => {
  router = new EventRouter();
  record = new SpyRecord();
  registerUserActivityHandlers(router, { recordActivity: record as never });
  registerCatalogActivityHandlers(router, {
    recordActivity: record as never,
    serviceNameReader: new FakeNames() as never,
  });
});

describe("activity handlers", () => {
  it("records a registration against the person who registered", async () => {
    await router.dispatch({
      eventName: "user.registered",
      payload: { userId: "u1", email: "a@b.test", firstName: "Ana" },
      occurredOn: new Date("2026-08-26T09:00:00Z"),
    } as never);
    expect(record.calls[0]).toMatchObject({ actorUserId: "u1", type: "user.registered" });
  });

  it("snapshots the service's name rather than its id", async () => {
    // The row says "You published X". Storing the id would render the id, and
    // resolving on read would rewrite history when the service is renamed.
    await router.dispatch({
      eventName: "service.published",
      payload: { serviceId: "s1", actorUserId: "u2" },
      occurredOn: new Date("2026-08-26T09:00:00Z"),
    } as never);
    expect(record.calls[0]!.payload).toEqual({ serviceName: "Corte de cabelo" });
  });

  it("keeps the event's time, not the handler's", async () => {
    await router.dispatch({
      eventName: "user.registered",
      payload: { userId: "u1", email: "a@b.test", firstName: null },
      occurredOn: new Date("2026-08-26T09:00:00Z"),
    } as never);
    expect((record.calls[0] as never as { occurredAt: Date }).occurredAt.toISOString())
      .toBe("2026-08-26T09:00:00.000Z");
  });

  it("still records when the name cannot be resolved", async () => {
    // A deleted service must not silence the entry. "You published something"
    // is worth more than nothing at all.
    await router.dispatch({
      eventName: "service.published",
      payload: { serviceId: "gone", actorUserId: "u2" },
      occurredOn: new Date("2026-08-26T09:00:00Z"),
    } as never);
    expect(record.calls).toHaveLength(1);
    expect(record.calls[0]!.payload).toEqual({ serviceName: null });
  });
});
```

**`router.dispatch`'s real signature may differ.** Read `event-router.ts` and match it — the notification handler tests show the shape that works.

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — module not found.

- [ ] **Step 3: Write the four handler files**

Each follows this shape. The user one, in full:

```ts
import type { EventRouter } from "../../../../../../shared/infrastructure/events/event-router";
import type { RecordActivityInternalPort } from "../../../../bounded-contexts/activity/app/ports/inbound/record-activity.internal.command.port";

export interface UserActivityDeps {
  readonly recordActivity: RecordActivityInternalPort;
}

/**
 * What the User context's one event means to somebody's history.
 *
 * Registered rather than imported by the producer, like the notification
 * handlers: the User context publishes `user.registered` and does not know
 * that anything keeps a history.
 */
export function registerUserActivityHandlers(router: EventRouter, deps: UserActivityDeps): void {
  router.on("user.registered", async (event) => {
    const payload = event.payload as { userId: string };
    await deps.recordActivity.execute({
      actorUserId: payload.userId,
      type: "user.registered",
      payload: {},
      occurredAt: event.occurredOn,
    });
  });
}
```

The other three follow the table in the spec:

| event | actor comes from | payload snapshot |
|---|---|---|
| `provider.created` | `ownerUserId` | `{ providerName }` — resolve via the name reader |
| `provider.status.decided` | `decidedByUserId` | `{ providerName, to }` |
| `provider.invite.sent` | `actorUserId` | `{ email }` |
| `provider.invite.accepted` | `actorUserId` | `{ providerName }` |
| `service.created` | `actorUserId` | `{ serviceName }` |
| `service.published` | `actorUserId` | `{ serviceName }` |
| `service.unpublished` | `actorUserId` | `{ serviceName }` |
| `review.created` | `actorUserId` | `{ providerName, rating }` |

`review.created` needs no lookup — Task 5 put the name in the event.

- [ ] **Step 4: Run and watch it pass**

Expected: PASS, 4 tests.

- [ ] **Step 5: Wire it in `api.ts`**

Read `apps/backend/api/src/api.ts:95-105` — the notification handlers are registered there against `getEventRouter()`. Add the four activity registrations beside them, bootstrapping the activity context first.

**This is the step that is easiest to skip and impossible to notice.** In the notifications phase, eight GraphQL handlers were written, tested and reviewed while never being mounted, and every test passed. Task 11's e2e is what proves this line exists.

- [ ] **Step 6: Test the wiring**

Add to `apps/backend/api/src/__tests__/` a test that bootstraps the app and asserts the router has a handler for `review.created`. **Break-check it**: comment out the registration, confirm the test goes red, restore.

- [ ] **Step 7: Gates and commit**

```bash
cd packages/backend && bun test src/modules/ntizo && bun run typecheck && bun run lint
cd ../../apps/backend/api && bun test src && bun run typecheck && bun run lint
git add packages/backend/src/modules/ntizo/write/activity apps/backend/api/src
git commit -m "feat(activity): nine events now write a history"
```

---

## Task 7: Reading it back

**Files:**
- Create: `packages/shared/src/read-models/system/activity/activity.schema.ts` (+ its `index.ts`, and the parent re-export)
- Create: `.../read/activity/app/use-cases/list-activity.projection.ts`
- Create: `.../read/activity/graphql/schema/queries.ts`
- Create: `.../read/activity/graphql/handlers/queries.handlers.ts`
- Create: `.../read/activity/bootstrap/index.ts`, `.../read/activity/index.ts`
- Modify: `apps/backend/api/src/graphql/private.ts` (mount the field)
- Test: `.../read/activity/__tests__/list-activity.projection.test.ts`

**Interfaces:**
- Consumes: `ActivityRepositoryPort.listForActor` (Task 2).
- Produces: `activityPageReadModel` / `ActivityPageDTO`; GraphQL query `listMyActivity`, which the field kit **flattens** — `{ activity: { mine } }` emits on the wire as **`activityMine`**. The notifications phase lost a round to this; the frontend must call `activityMine`.

- [ ] **Step 1: The shared read model**

```ts
import { z } from "zod";

/** One entry, as the wire carries it. */
export const activityEntryReadModel = z.object({
  id: z.string(),
  /** The key the client translates. Never a sentence — the server has no locale. */
  type: z.string(),
  /** Interpolation values for that key, snapshotted when the row was written. */
  payload: z.record(z.unknown()),
  occurredAt: z.string(),
});

export const activityPageReadModel = z.object({
  items: z.array(activityEntryReadModel),
  /**
   * Opaque. Pass it back to get the next page; null means there is no more.
   * Opaque on purpose — a client that parsed it would depend on the ordering
   * columns, and changing them would then be a breaking change.
   */
  nextCursor: z.string().nullable(),
});

export type ActivityEntryDTO = z.infer<typeof activityEntryReadModel>;
export type ActivityPageDTO = z.infer<typeof activityPageReadModel>;
```

Re-export it from `read-models/system/activity/index.ts` and from the parent barrel — **read how `read-models/system/notification/` is exported and match it**.

- [ ] **Step 2: Write the failing projection test**

```ts
import { describe, expect, it } from "bun:test";
import { ListActivityProjection } from "../app/use-cases/list-activity.projection";

class FakeRepo {
  lastCall: unknown;
  async listForActor(p: unknown) {
    this.lastCall = p;
    return { items: [], nextCursor: null };
  }
  async save() { return "a1"; }
}

describe("ListActivityProjection", () => {
  it("defaults the page size rather than trusting the caller", async () => {
    const repo = new FakeRepo();
    await new ListActivityProjection(repo as never).execute({ requesterUserId: "u1" });
    expect(repo.lastCall).toMatchObject({ actorUserId: "u1", limit: 20 });
  });

  it("clamps a limit nobody should ask for", async () => {
    // A zod `.default()` does not reach the GraphQL schema — follow-up #20.
    // The clamp lives here, which is why it is tested here.
    const repo = new FakeRepo();
    await new ListActivityProjection(repo as never).execute({ requesterUserId: "u1", limit: 5000 });
    expect(repo.lastCall).toMatchObject({ limit: 50 });
  });

  it("reads only the caller's own history", async () => {
    // The actor is the session's user, never an argument. An id parameter
    // here would be an endpoint for reading anybody's history.
    const repo = new FakeRepo();
    await new ListActivityProjection(repo as never).execute({ requesterUserId: "u9" });
    expect(repo.lastCall).toMatchObject({ actorUserId: "u9" });
  });
});
```

- [ ] **Step 3: Run and watch it fail**

- [ ] **Step 4: Write the projection**

```ts
import type { ActivityRepositoryPort } from "../../../../bounded-contexts/activity/app/ports/outbound/activity.repository.port";
import type { ActivityPageDTO } from "@ntizo/shared/read-models";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export class ListActivityProjection {
  constructor(private readonly repo: ActivityRepositoryPort) {}

  async execute(input: {
    requesterUserId: string;
    limit?: number;
    cursor?: string | null;
  }): Promise<ActivityPageDTO> {
    // Clamped here, not in the schema: a zod default never reaches the emitted
    // GraphQL field, so every caller would have to send one.
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const page = await this.repo.listForActor({
      actorUserId: input.requesterUserId,
      limit,
      cursor: input.cursor ?? null,
    });
    return {
      items: page.items.map((a) => ({
        id: a.id!,
        type: a.type,
        payload: a.payload,
        occurredAt: a.occurredAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }
}
```

- [ ] **Step 5: The GraphQL field**

Follow `read/notification/graphql/schema/queries.ts` exactly — same `defineQuery`, same `ntizoGraphqlContextSchema`, same `defineGraphQLSchema` nesting. The field takes `limit` and `cursor`, both `.optional()`, and **no user id**: it resolves from the session, so there is nothing to tamper with.

- [ ] **Step 6: Mount it**

Add the activity read module to `apps/backend/api/src/graphql/private.ts` beside the notification one. **Verify the field is actually on the schema** by querying the running API's introspection, not by reading the file — the notifications phase wrote eight handlers that were never mounted and every test still passed.

- [ ] **Step 7: Gates and commit**

```bash
cd packages/shared && bun run typecheck
cd ../backend && bun test src/modules/ntizo && bun run typecheck && bun run lint
cd ../../apps/backend/api && bun run typecheck && bun run lint
git add packages/shared packages/backend/src/modules/ntizo/read/activity apps/backend/api/src
git commit -m "feat(activity): a paged read of your own history"
```

---

## Task 8: The frontend contract

**Files:**
- Modify: `apps/frontend/web/src/features/activity/domain/types.ts`
- Modify: `apps/frontend/web/src/features/activity/ui/activity-list.tsx`
- Create: `apps/frontend/web/src/features/activity/data/activity.repository.ts`
- Create: `apps/frontend/web/src/features/activity/viewmodel/use-activity.ts`
- Modify: the three pages that render `ActivityList` (customer, provider, admin) — the provider and admin ones keep passing `[]`
- Test: `apps/frontend/web/src/features/activity/domain/__tests__/types.test.ts`

**Interfaces:**
- Consumes: the wire field `activityMine` (Task 7).
- Produces: `ActivityEntry = { id, type, payload, occurredAt }`; `useMyActivity()` returning `{ entries, loading, hasMore, loadMore }`.

**The type change is the point.** `ActivityEntry.description` is a pre-translated sentence today, and its own comment says: *"When a real read model lands it maps onto this or this changes to meet it."* It changes. The server has no locale and must not grow one for this.

- [ ] **Step 1: Rewrite the type**

```ts
/**
 * One thing that happened, in whichever zone is asking.
 *
 * `type` + `payload`, not a sentence. The server writes the row without
 * knowing who will read it or in what language; the client holds the
 * translations and renders at read time. This is the notification inbox's
 * mechanism, which already does `t(\`type.${key}\`, { replace: payload })`.
 *
 * It used to be a pre-translated `description`, written before any read model
 * existed, on the reasoning that the zone that fetched it knew what it meant.
 * A real read model landed and that stopped being true: it is one table, read
 * the same way by three zones.
 */
export interface ActivityEntry {
  id: string;
  /** Translation key under `activityType.*`. */
  type: string;
  /** Interpolation values, snapshotted server-side when the row was written. */
  payload: Record<string, unknown>;
  /** ISO 8601. Formatted in the list, so three zones cannot format it three ways. */
  occurredAt: string;
}
```

- [ ] **Step 2: Render from the key**

In `activity-list.tsx`, replace `{entry.description}` with a translated lookup. The list takes strings as props today precisely so it belongs to no namespace — keep that: add a `renderDescription: (entry: ActivityEntry) => string` prop, and let each zone pass its own. The customer page passes `(e) => t(\`activityType.${key(e.type)}\`, { replace: e.payload })`.

`key()` maps `"service.published"` to `"servicePublished"`, because a dot in an i18next key means nesting.

- [ ] **Step 3: Write the failing key test**

```ts
import { describe, expect, it } from "vitest";
import { activityTypeKey } from "../types";

describe("activityTypeKey", () => {
  it("flattens the dot, because i18next reads it as nesting", () => {
    // t("activityType.service.published") looks for {service:{published}}.
    // The translation file is flat, so the dot has to go.
    expect(activityTypeKey("service.published")).toBe("servicePublished");
    expect(activityTypeKey("provider.inviteSent")).toBe("providerInviteSent");
  });

  it("leaves a key with no dot alone", () => {
    expect(activityTypeKey("welcome")).toBe("welcome");
  });
});
```

- [ ] **Step 4: The data layer**

`data/activity.repository.ts` — follow `features/notifications/data/` exactly: same GraphQL client, same shape. The field is **`activityMine`**, flattened by the kit from `{ activity: { mine } }`.

- [ ] **Step 5: The viewmodel**

`viewmodel/use-activity.ts` — a `useInfiniteQuery` keyed on `["activity", "mine"]`, `getNextPageParam: (last) => last.nextCursor`. Returns `{ entries, loading, hasMore, loadMore }`.

- [ ] **Step 6: Gates and commit**

```bash
cd apps/frontend/web && bun run test && bun run typecheck && bun run lint --force
git add apps/frontend/web/src/features/activity
git commit -m "feat(activity): the client translates, the server does not"
```

---

## Task 9: The page and its words

**Files:**
- Modify: `apps/frontend/web/src/features/activity/ui/customer-activity-page.tsx`
- Modify: `apps/frontend/web/src/shared/locales/*/account.json` (all eight)
- Test: `apps/frontend/web/src/shared/lib/__tests__/activity-copy.test.ts`

**Interfaces:**
- Consumes: `useMyActivity()` (Task 8), `activityTypeKey` (Task 8).

**Nine keys under `activityType`, in all eight locales.** English and Portuguese below; the other six are yours to translate, and the test in Step 3 fails if any is the English string pasted under a translated key.

```
userRegistered          "Created your account"          / "Criou a sua conta"
providerCreated         "Created {{providerName}}"      / "Criou {{providerName}}"
providerStatusDecided   "Reviewed {{providerName}}"     / "Analisou {{providerName}}"
providerInviteSent      "Invited {{email}}"             / "Convidou {{email}}"
providerInviteAccepted  "Joined {{providerName}}"       / "Juntou-se a {{providerName}}"
serviceCreated          "Created {{serviceName}}"       / "Criou {{serviceName}}"
servicePublished        "Published {{serviceName}}"     / "Publicou {{serviceName}}"
serviceUnpublished      "Unpublished {{serviceName}}"   / "Despublicou {{serviceName}}"
reviewCreated           "Reviewed {{providerName}}"     / "Avaliou {{providerName}}"
```

**A name can be null.** `serviceName` is null when the service was deleted before the handler ran. Each key needs a fallback form — `"Published a service"` / `"Publicou um serviço"` — chosen in the page, not by leaving `{{serviceName}}` to render as an empty gap.

- [ ] **Step 1: Write the failing copy test**

```ts
import { describe, expect, it } from "vitest";

const modules = import.meta.glob<Record<string, unknown>>("../../locales/*/account.json", {
  eager: true, import: "default",
});
const byLocale = Object.entries(modules).map(([p, d]) => ({
  locale: p.match(/locales\/([^/]+)\//)![1]!,
  data: d as { activityType?: Record<string, string> },
}));

const KEYS = [
  "userRegistered", "providerCreated", "providerStatusDecided",
  "providerInviteSent", "providerInviteAccepted", "serviceCreated",
  "servicePublished", "serviceUnpublished", "reviewCreated",
];

describe("activity copy", () => {
  it("has all nine keys in every locale", () => {
    expect(byLocale.length).toBeGreaterThanOrEqual(8);
    for (const { locale, data } of byLocale)
      for (const k of KEYS) expect(data.activityType?.[k], `${locale}.${k}`).toBeTruthy();
  });

  it("is translated, not English under a locale name", () => {
    const en = byLocale.find((l) => l.locale === "en-US")!;
    for (const { locale, data } of byLocale) {
      if (locale.startsWith("en")) continue;
      // pt-MZ and pt-PT may agree with each other, never with English.
      expect(data.activityType!.userRegistered, `${locale}`).not.toBe(
        en.data.activityType!.userRegistered,
      );
    }
  });

  it("keeps every interpolation the key promises", () => {
    // A locale that drops {{serviceName}} renders a sentence with a hole in
    // it, and i18next says nothing.
    const en = byLocale.find((l) => l.locale === "en-US")!;
    for (const k of KEYS) {
      const vars = [...en.data.activityType![k]!.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
      for (const { locale, data } of byLocale)
        for (const v of vars)
          expect(data.activityType![k], `${locale}.${k} missing {{${v}}}`).toContain(`{{${v}}}`);
    }
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Expected: FAIL — `activityType` is undefined in every locale.

- [ ] **Step 3: Write the nine keys in all eight locales**

- [ ] **Step 4: Wire the page**

```tsx
export function CustomerActivityPage() {
  const { t, i18n } = useTranslation("account");
  const { entries, loading, hasMore, loadMore } = useMyActivity();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="type-h1">{t("activityTitle")}</h1>
      <div className="mt-8">
        <ActivityList
          entries={entries}
          loading={loading}
          locale={i18n.resolvedLanguage ?? i18n.language}
          title={t("activityListTitle")}
          hint={t("activityHint")}
          emptyTitle={t("activityEmptyTitle")}
          emptyBody={t("activityEmptyBody")}
          renderDescription={(e) =>
            t(`activityType.${activityTypeKey(e.type)}`, { replace: e.payload })
          }
        />
        {hasMore ? (
          <Button variant="outline" className="mt-4 w-full" onClick={() => loadMore()}>
            {t("activityLoadMore")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
```

`activityLoadMore` is a tenth key — add it to all eight too.

- [ ] **Step 5: Test that a hostile name cannot inject**

```tsx
it("escapes a service name that contains markup", () => {
  // The name comes from whoever created the service. React escapes by
  // default and i18next's `replace` does not bypass that, but the value is
  // user-chosen and this is where that gets proved rather than assumed.
  render(<ActivityList entries={[{
    id: "a1", type: "service.published",
    payload: { serviceName: "<img src=x onerror=alert(1)>" },
    occurredAt: "2026-08-26T10:00:00Z",
  }]} loading={false} locale="en-US" title="t" emptyTitle="e" emptyBody="b"
    renderDescription={(e) => `Published ${String(e.payload.serviceName)}`} />);
  expect(document.querySelector("img")).toBeNull();
});
```

- [ ] **Step 6: Gates and commit**

```bash
cd apps/frontend/web && bun run test && bun run typecheck && bun run lint --force
git add apps/frontend/web/src
git commit -m "feat(activity): the page says what you did, in your language"
```

---

## Task 10: The column beside the inbox

**Files:**
- Modify: `apps/frontend/web/src/features/notifications/ui/notifications-page.tsx`

**Interfaces:**
- Consumes: `useMyActivity()` (Task 8), `ActivityList` (Task 8).

This is the layout that prompted the whole design: the inbox on the left, "what you have done here" on the right.

- [ ] **Step 1: Add the column**

Wrap the existing content in a two-column grid — `grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start`. The inbox keeps its current markup in the first cell; `ActivityList` goes in the second with `skeletonRows={4}`.

**`minmax(0,1fr)`, never a bare `1fr`.** A bare `1fr` is `minmax(auto,1fr)`, whose minimum is the content's own width — the header grid on this site did exactly that and pushed the page into a sideways scroll on a phone.

- [ ] **Step 2: Below `lg`, the column goes under the inbox**

Not beside it, and not hidden. A phone reading the inbox scrolls past it to the history, which is the order of interest.

- [ ] **Step 3: Verify it at a narrow viewport**

Deploy to dev, open the page in a browser at the narrowest window the tooling allows, and measure:

```js
document.documentElement.scrollWidth - document.documentElement.clientWidth
```

**Expected: 0.** Report the viewport width you measured at. If the window will not resize below `sm`, say so rather than claiming a phone was tested — the last phase hit exactly that and the honest note was worth more than the claim.

- [ ] **Step 4: Gates and commit**

```bash
cd apps/frontend/web && bun run test && bun run typecheck && bun run lint --force
git add apps/frontend/web/src/features/notifications
git commit -m "feat(notifications): what you did, beside what happened to you"
```

---

## Task 11: Prove it end to end

**Files:**
- Modify: `apps/e2e/tests/notifications.spec.ts` (or a new `activity.spec.ts` beside it)
- Modify: `docs/superpowers/follow-ups.md`

- [ ] **Step 1: Extend the e2e**

A sign-up already produces a `user.registered` event. Assert that it also produces exactly one activity row for that user:

```ts
test("registering is the first thing your history records", async () => {
  const email = `activity-${crypto.randomUUID()}@ntizo.test`;
  await createVerifiedUser({ email });
  await expect.poll(async () => {
    const rows = await sql()`
      SELECT a.type FROM ntizo_activity.activity a
      JOIN better_auth."user" u ON u.id = a.actor_user_id
      WHERE u.email = ${email}`;
    return rows.map((r) => r.type);
  }, { timeout: 10_000 }).toEqual(["user.registered"]);
});
```

Read `apps/e2e/fixtures/db.ts` and use its client. Never call `resetDb()` from a spec — `globalSetup` resets once and a second reset drops schemas out from under parallel specs.

- [ ] **Step 2: Break-check it**

Comment out the `registerUserActivityHandlers` line in `api.ts`, run the spec, confirm it goes red, restore. **Report both runs.** This is the assertion that would have caught the unmounted-handlers defect in the last phase.

- [ ] **Step 3: Run every gate from the repo root**

```bash
bun run check-types && bun run lint && bun run test && bun run e2e
```

The e2e needs node 22 on PATH and its Postgres container:

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
docker run --rm -d --name ntizo-e2e-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ntizo_e2e -p 55432:5432 postgres:16-alpine
```

**Report the real counts, including any failure.** `catalog-service-search.test.ts` fails against the shared dev Neon database and is unrelated to this work — classify it rather than fixing it.

- [ ] **Step 4: Record what this leaves open**

Add to `docs/superpowers/follow-ups.md`:

- The provider and admin activity pages still render `[]`. The table serves them with a different filter, but "what this workspace did" is a different question and was deliberately not answered here.
- If the isolate dies between the producing commit and the handler dispatch, the activity row is lost. The outbox row survives; follow-up #8's relay recovers this and the equivalent notification gap together.

- [ ] **Step 5: Commit**

```bash
git add apps/e2e docs/superpowers/follow-ups.md
git commit -m "test(activity): prove a history is written, and say what is left"
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: the table (1), snapshot rule (1, 6), no read state (1, 2), the actor (4), review's missing event (5), names from the handler (6), handlers never failing the caller (3, 6), cursor paging (2, 3, 7), `type` + `payload` rendering (8, 9), the page and the column (9, 10), interpolation escaping (9), the known isolate-death limitation (11).

**Deviation from the codebase, stated on purpose.** The notification read uses offset paging; this one uses a cursor. Activity is appended at the top, which is where offset breaks — a row written between two fetches shifts every offset and the reader sees an entry twice or never. The inbox gets away with offset because it is read in one sitting.

**Type consistency.** `ActivityType` (Task 2) is the same closed list the handlers write (6) and the copy test asserts (9). `ActivityPage.nextCursor` (2) is what the repository returns (3), what the projection passes through (7), and what `getNextPageParam` reads (8). `activityMine` is the flattened wire name in both 7 and 8.

**Placeholder scan:** clean. An earlier draft of Task 9's copy table carried a mangled row and a paragraph explaining why it had been left in. That was a formatting slip being defended rather than fixed; the table now lists the nine keys and nothing else.
