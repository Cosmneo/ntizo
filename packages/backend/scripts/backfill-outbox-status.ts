/**
 * Closes out outbox rows written before anything ever advanced their status.
 *
 * `DrizzleOutboxEventRepository.insertEvents` stamped every row `pending` and
 * nothing moved it, so the column reported 267 rows as awaiting dispatch that
 * had all already been through `EventRouter.dispatch`. The danger was never
 * the stale column itself — it was the obvious thing to build on it. A relay
 * that drained everything `pending` would have re-sent hundreds of
 * notifications to people who received them weeks ago.
 *
 * Every one of these rows was dispatched: `OutboxAdapter.publish` hands the
 * batch to the router in an after-commit callback, and that ran. Rows older
 * than the notification handlers (first notification row: 2026-08-24)
 * dispatched into a router with no subscriber for them, which is still a
 * completed dispatch and is emphatically not a reason to deliver them now — a
 * welcome email for a workspace created a month ago is noise, not a fix.
 *
 * So this updates a column and nothing else. It does not read handlers, does
 * not construct the router, and cannot send anything. That is the property
 * that makes it safe to run against a stage you are unsure about.
 *
 * Idempotent: rows already `dispatched` are not matched.
 *
 *   DATABASE_URL=... bun run scripts/backfill-outbox-status.ts [--apply] [--except <id>]
 *
 * Without `--apply` it reports what it would change and writes nothing.
 */
import { and, eq, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { outboxEvent } from "../src/modules/ntizo/shared/infrastructure/database/outbox/schemas/outbox-event.schema";

const apply = process.argv.includes("--apply");
const exceptIndex = process.argv.indexOf("--except");
/** Left pending on purpose — an event that genuinely never reached a handler. */
const except = exceptIndex === -1 ? undefined : process.argv[exceptIndex + 1];

const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

const where = except
  ? and(eq(outboxEvent.status, "pending"), ne(outboxEvent.id, except))
  : eq(outboxEvent.status, "pending");

const pending = await db
  .select({ id: outboxEvent.id, type: outboxEvent.eventType, at: outboxEvent.createdAt })
  .from(outboxEvent)
  .where(where);

// An explicit comparator. `[].sort()` with none compares string forms, and a
// Date stringifies to "Mon Aug 10 2026 …" — so the default sorts by weekday
// name and reported the wrong oldest row the first time this ran.
const times = pending
  .map((r) => r.at)
  .sort((a, b) => a.getTime() - b.getTime());
console.log(`  ${pending.length} row(s) still pending`);
if (pending.length > 0) {
  console.log(`  oldest: ${times[0]?.toISOString()}`);
  console.log(`  newest: ${times.at(-1)?.toISOString()}`);
}
if (except) console.log(`  holding back: ${except}`);

if (!apply) {
  console.log("\nDry run. Nothing written. Re-run with --apply.");
} else {
  await db.update(outboxEvent).set({ status: "dispatched" }).where(where);
  console.log(`\nApplied. ${pending.length} row(s) marked dispatched.`);
}

await sql.end();
