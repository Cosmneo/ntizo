import { describe, expect, it, spyOn } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { infraStore } from "../../../../../shared/infrastructure/stores/infra-store";
import { bootstrapNotification } from "../bootstrap";
import { DeferredNotificationDelivery } from "../infrastructure/inbound-adapters/deferred-notification-delivery.adapter";
import { DeliverNotificationInternalCommand } from "../app/use-cases/deliver-notification.internal.command";

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
  MICROSOFT_CLIENT_ID: "",
  MICROSOFT_CLIENT_SECRET: "",
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
