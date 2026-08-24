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
 * Just enough drizzle for `DrizzleNotificationRepository.save`.
 *
 * Seeded onto the store so `Db.getDbConnection()` finds a connection and never
 * opens a real one. Everything the deferred delivery then reaches for —
 * `select`, the recipient lookup — is absent on purpose: that work fails, the
 * delivery command swallows and logs it exactly as designed, and none of it
 * changes what this test is asking, which is whether the promise was handed to
 * `waitUntil` at all.
 */
function fakeDbConnection() {
  const drizzleDbClient = {
    insert: () => ({
      values: () => ({
        returning: async () => [{ id: "n-wired" }],
      }),
    }),
  };
  return { drizzleDbClient: drizzleDbClient as never, postgresDbClient: {} as never };
}

describe("bootstrapNotification wires delivery off the critical path", () => {
  it("schedules delivery on waitUntil instead of awaiting it", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const scheduled: Promise<unknown>[] = [];
      await infraStore.runAsync(TEST_ENV, async () => {
        infraStore.setDbConnection(fakeDbConnection());
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

        await infraStore.settleDeferredWork();
      });
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
