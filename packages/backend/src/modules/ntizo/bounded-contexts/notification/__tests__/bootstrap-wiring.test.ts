import { describe, expect, it, spyOn } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { infraStore } from "../../../../../shared/infrastructure/stores/infra-store";
import { bootstrapNotification } from "../bootstrap";
import { DeferredNotificationDelivery } from "../infrastructure/inbound-adapters/deferred-notification-delivery.adapter";
import { DeliverNotificationInternalCommand } from "../app/use-cases/deliver-notification.internal.command";
import { HandleResendWebhookInternalCommand } from "../app/use-cases/handle-resend-webhook.internal.command";

/**
 * The wiring is the feature.
 *
 * `DeferredNotificationDelivery` has its own unit tests, and every one of them
 * passes on a class nothing constructs. Replace
 * `new DeferredNotificationDelivery(deliverNotification)` in the bootstrap with
 * the bare command and all 711 tests stay green while delivery moves back onto
 * the request's critical path — the same shape as Phase 1's eight GraphQL
 * handlers that were never mounted. Lint is not a guard either: the import
 * stays referenced the moment anything else in the file mentions the symbol.
 *
 * So this test asserts the composed graph, through its front door: raise a
 * notification the way the API does and check that delivery was *scheduled*
 * rather than awaited.
 */
const TEST_ENV = {
  STAGE: "local" as const,
  LOG_LEVEL: "info",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "s",
  RESEND_API_KEY: "",
  EMAIL_FROM: "a@b.c",
  APP_URL: "https://ntizo.test",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
};

/**
 * Just enough drizzle for the two queries this path makes, and instrumented so
 * the test can see *when* the second one happens.
 *
 * Seeded onto the store so `Db.getDbConnection()` finds a connection and never
 * opens a real one. `insert` serves the inbox write. `select` serves the
 * recipient lookup, which is the delivery command's first move — and its
 * builder only settles on a **macrotask**, which is the whole point: a
 * macrotask cannot interleave into the microtask-only path of the raise
 * returning, so "did the raise come back before delivery finished" has a
 * stable answer instead of a race.
 *
 * It resolves to no rows, so delivery finds no recipient, writes nothing and
 * returns cleanly. Nothing is logged, and the test asserts that too.
 */
function fakeDbConnection() {
  const seen = { lookupStarted: false, lookupSettled: false };

  const query: Record<string, unknown> = {
    then(resolve: (rows: unknown[]) => void) {
      setTimeout(() => {
        seen.lookupSettled = true;
        resolve([]);
      }, 0);
    },
  };
  for (const step of ["from", "leftJoin", "innerJoin", "where", "orderBy", "limit", "offset"]) {
    query[step] = () => query;
  }

  const drizzleDbClient = {
    insert: () => ({
      values: () => ({
        returning: async () => [{ id: "n-wired" }],
      }),
    }),
    select: () => {
      seen.lookupStarted = true;
      return query;
    },
  };

  return {
    connection: { drizzleDbClient: drizzleDbClient as never, postgresDbClient: {} as never },
    seen,
  };
}

describe("bootstrapNotification wires delivery off the critical path", () => {
  it("schedules delivery on waitUntil instead of awaiting it", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const scheduled: Promise<unknown>[] = [];
      const { connection, seen } = fakeDbConnection();
      await infraStore.runAsync(TEST_ENV, async () => {
        infraStore.setDbConnection(connection);
        infraStore.setWaitUntil((p) => {
          scheduled.push(p);
        });

        const { useCases } = bootstrapNotification();
        const result = await useCases.internal.raiseNotification.execute({
          type: NotificationType.Welcome,
          audience: "user",
          userId: "u1",
          payload: { firstName: "Ana" },
        });

        // The inbox row is written and returned...
        expect(result).toEqual({ notificationId: "n-wired" });
        // ...and the email is somebody else's problem, later. Nothing is
        // scheduled here if the bootstrap hands the raise the bare command.
        expect(scheduled).toHaveLength(1);

        // And it is genuinely *later*. Delivery has begun — the decorator must
        // call `inner.execute` to have a promise to hand over, so "not yet
        // started" was never the property — but it has not finished, and the
        // raise did not wait for it. A decorator that awaited the inner call
        // before scheduling still leaves `scheduled` at 1 and fails right here.
        //
        // This assertion is deliberately not left to
        // `deferred-delivery.test.ts`, which proves the same thing about the
        // decorator in isolation: two guards that only work together mean
        // deleting either file silently un-guards the property.
        expect(seen.lookupStarted).toBe(true);
        expect(seen.lookupSettled).toBe(false);

        await infraStore.settleDeferredWork();

        // The promise handed to waitUntil really was the delivery, and the
        // drain really does wait for it. Without this, "scheduled.length === 1"
        // would be satisfied by scheduling anything at all.
        expect(seen.lookupSettled).toBe(true);
      });

      // Delivery ran to completion without incident: no recipient, no row, no
      // complaint. Any log line here would mean this test is passing for a
      // reason other than the one it claims.
      expect(logged).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it("exposes the undecorated command separately, and it stays undecorated", () => {
    // The awaitable one, for a caller that needs the delivery ids back. Pinned
    // because the two exports look interchangeable and are not: wrapping this
    // one too would make `deliveryIds` permanently empty, and swapping them
    // would put delivery back on the critical path.
    const { useCases } = bootstrapNotification();
    expect(useCases.internal.deliverNotification).toBeInstanceOf(
      DeliverNotificationInternalCommand,
    );
    expect(useCases.internal.deliverNotification).not.toBeInstanceOf(
      DeferredNotificationDelivery,
    );
  });
});

/**
 * The webhook command's own wiring, guarded the same way and for the same
 * reason.
 *
 * `handle-resend-webhook.test.ts` proves the command's decisions against two
 * fakes, and every one of those tests passes on a command nothing constructs —
 * which is exactly what the bootstrap did until Task 9. Its two constructor
 * arguments are also easy to get wrong in a way nothing else notices: they are
 * both repositories, swapping them throws only at call time, and passing the
 * suppressions twice degrades silently to a suppression with no idea which
 * notification produced it.
 *
 * So this drives the composed command through its front door — a hard bounce
 * carrying an `email_id` — and reads back both effects: the suppression row
 * (the `suppressions` argument) and the notification folded into its `detail`
 * (the `deliveries` argument).
 */
const DELIVERY_ROW = {
  id: "d-1",
  notificationId: "n-1",
  type: NotificationType.Welcome,
  toEmail: "ana@ntizo.test",
  locale: "pt",
  status: "sent",
  providerMessageId: "prov-123",
  error: null,
};

/**
 * `select(...).from(...).where(...).orderBy(...).limit(...)` for the delivery
 * lookup, `insert(...).values(...).onConflictDoNothing()` for the suppression.
 * Both are what the two real Drizzle repositories actually call, so a change
 * that reshapes either query fails here rather than in production.
 */
function fakeWebhookDb() {
  const suppressed: Array<Record<string, unknown>> = [];
  const lookedUp: unknown[] = [];

  const selectQuery: Record<string, unknown> = {
    then(resolve: (rows: unknown[]) => void) {
      resolve([DELIVERY_ROW]);
    },
  };
  for (const step of ["from", "where", "orderBy", "limit"]) {
    selectQuery[step] = () => selectQuery;
  }

  const drizzleDbClient = {
    select: () => {
      lookedUp.push(true);
      return selectQuery;
    },
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        onConflictDoNothing: async () => {
          suppressed.push(row);
        },
      }),
    }),
  };

  return {
    connection: { drizzleDbClient: drizzleDbClient as never, postgresDbClient: {} as never },
    suppressed,
    lookedUp,
  };
}

describe("bootstrapNotification wires the Resend webhook command", () => {
  it("constructs it at all", () => {
    // The bootstrap built two commands and not this one for a whole task.
    // Nothing failed, because nothing asked.
    const { useCases } = bootstrapNotification();
    expect(useCases.internal.handleResendWebhook).toBeInstanceOf(
      HandleResendWebhookInternalCommand,
    );
  });

  it("gives it the suppressions repository, and the deliveries one too", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const { connection, suppressed, lookedUp } = fakeWebhookDb();
      await infraStore.runAsync(TEST_ENV, async () => {
        infraStore.setDbConnection(connection);

        const { useCases } = bootstrapNotification();
        const out = await useCases.internal.handleResendWebhook.execute({
          type: "email.bounced",
          data: {
            email_id: "prov-123",
            to: ["ana@ntizo.test"],
            bounce: { type: "Permanent" },
          },
        });

        expect(out).toEqual({ suppressed: true });

        // Argument one. Swap the two and this line throws instead, because a
        // delivery repository has no `suppress`.
        expect(suppressed).toHaveLength(1);
        expect(suppressed[0]).toMatchObject({ email: "ana@ntizo.test", reason: "bounce" });

        // Argument two. Pass the suppressions twice — the reading of this
        // command as "the thing that suppresses addresses" — and the lookup
        // throws inside its own best-effort catch, `detail` silently falls
        // back to the raw provider payload, and only this assertion notices.
        expect(lookedUp).toHaveLength(1);
        expect(suppressed[0]!.detail).toMatchObject({
          notification: { id: "n-1", type: NotificationType.Welcome },
        });
      });

      // A hard bounce that correlates cleanly logs nothing. Any line here
      // means one of the two lookups above failed and was swallowed.
      expect(logged).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });
});
