/**
 * Delivers one outbox event whose handlers never ran.
 *
 * Normally nothing needs this: `OutboxAdapter.publish` dispatches in-process
 * after commit, so an event is delivered by the same request that produced
 * it. It is needed when a producer ran outside the Worker — a maintenance
 * script, say — where `getEventRouter()` is a fresh, empty router and the
 * dispatch reaches nobody. The row is inserted, the handlers never run, and
 * (since the status fix) the row is left honestly `pending`.
 *
 * Scoped to a single id on purpose. There is no "drain everything pending"
 * mode here and there should not be one until the status column has been
 * trustworthy for longer than the oldest row: draining a backlog whose rows
 * were already delivered re-sends every one of them.
 *
 *   DATABASE_URL=... RESEND_API_KEY=... bun run scripts/dispatch-outbox-event.ts <eventId> [--apply]
 *
 * Without `--apply` it reports what it would dispatch and sends nothing.
 */
import { eq } from "drizzle-orm";
import { infraStore } from "../src/shared/infrastructure/stores/infra-store";
import { getDb } from "../src/modules/better-auth/infrastructure/client/drizzle";
import { getEventRouter } from "../src/shared/infrastructure/events";
import { outboxEvent } from "../src/modules/ntizo/shared/infrastructure/database/outbox/schemas/outbox-event.schema";
import { bootstrapNotification } from "../src/modules/ntizo/bounded-contexts/notification";
import { bootstrapActivity } from "../src/modules/ntizo/bounded-contexts/activity";
import {
  registerProviderNotificationHandlers,
} from "../src/modules/ntizo/write/notification";
import { registerProviderActivityHandlers } from "../src/modules/ntizo/write/activity";
import { ProviderStatusDecided } from "../src/modules/ntizo/bounded-contexts/provider/domain/events";

const [eventId] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const apply = process.argv.includes("--apply");

if (!eventId) {
  console.error("usage: dispatch-outbox-event.ts <eventId> [--apply]");
  process.exit(1);
}

const env = {
  STAGE: (process.env["STAGE"] ?? "dev") as never,
  LOG_LEVEL: process.env["LOG_LEVEL"] ?? "info",
  DATABASE_URL: process.env["DATABASE_URL"] ?? "",
  BETTER_AUTH_SECRET: process.env["BETTER_AUTH_SECRET"] ?? "",
  RESEND_API_KEY: process.env["RESEND_API_KEY"] ?? "",
  EMAIL_FROM: process.env["EMAIL_FROM"] ?? "",
  APP_URL: process.env["APP_URL"] ?? "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
};

await infraStore.runAsync(env, async () => {
  const db = getDb();
  const [row] = await db.select().from(outboxEvent).where(eq(outboxEvent.id, eventId)).limit(1);

  if (!row) {
    console.error(`No outbox event with id ${eventId}`);
    process.exit(1);
  }

  console.log(`  ${row.eventType}  (${row.status})`);
  console.log(`  aggregate ${row.aggregateId}`);
  console.log(`  payload   ${JSON.stringify(row.payload)}`);

  if (row.status !== "pending") {
    console.error(`\nRefusing: this row is already "${row.status}". Re-dispatching would duplicate it.`);
    process.exit(1);
  }

  // Only the one event shape this script has been needed for. Reconstructing
  // an arbitrary event from a row means trusting the payload to match a class
  // nobody checked — a narrow, explicit map refuses loudly instead.
  if (row.eventType !== "provider.status.decided") {
    console.error(`\nRefusing: no reconstruction is defined for "${row.eventType}".`);
    process.exit(1);
  }

  if (!apply) {
    console.log("\nDry run. Nothing dispatched. Re-run with --apply.");
    return;
  }

  const notification = bootstrapNotification();
  const activity = bootstrapActivity();
  const router = getEventRouter();

  registerProviderNotificationHandlers(router, {
    raiseNotification: notification.useCases.internal.raiseNotification,
    userByEmailReader: notification.adapters.userByEmailReader,
    providerNameReader: notification.adapters.providerNameReader,
  });
  registerProviderActivityHandlers(router, {
    recordActivity: activity.useCases.internal.recordActivity,
    // Not optional, though the type let it be omitted: the handler resolves
    // the workspace's name for the history row and threw on `undefined` the
    // first time this ran. `EventRouter.dispatch` swallowed it, so the
    // dispatch reported success and the activity row was simply missing —
    // which is exactly the silence the registration tests in api.ts exist to
    // prevent, and this script is a second, unguarded copy of that wiring.
    providerNameReader: activity.adapters.providerNameReader,
  });

  const payload = row.payload as {
    providerId: string;
    from: string;
    to: string;
    decidedByUserId: string;
  };

  await router.dispatch([new ProviderStatusDecided(payload)]);

  await db
    .update(outboxEvent)
    .set({ status: "dispatched" })
    .where(eq(outboxEvent.id, eventId));

  console.log("\nDispatched, and the row is marked.");
  await infraStore.settleDeferredWork?.();
});

process.exit(0);
