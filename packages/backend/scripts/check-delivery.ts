/**
 * "Did the email arrive?", answered without a database client.
 *
 * That question had no answer at all before this phase — a send left no trace
 * beyond a log line in whichever isolate happened to run it. It now leaves a
 * `notification_delivery` row per attempt, but a table nobody can query
 * without writing SQL answers the question only for people who already knew
 * how, and support does not.
 *
 * Prints every delivery for an address, newest first, with when each outcome
 * was recorded, then whether the address is suppressed and why. Read-only: it
 * writes nothing, so it is safe to point at prod.
 *
 *   bun run db:delivery:dev:check  somebody@example.com
 *   bun run db:delivery:prod:check somebody@example.com
 *
 * `STAGE` selects the database exactly as the seeds and the slug backfill do,
 * and each stage has its own script for the same reason they do: naming the
 * stage in the command is what stops somebody reading prod by accident. Called
 * directly it is the same thing with `STAGE` supplied by hand:
 *
 *   STAGE=dev bun run --env-file=.env scripts/check-delivery.ts somebody@example.com
 */
import { desc, eq, sql as raw } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  emailSuppression,
  notificationDelivery,
} from "../src/modules/ntizo/shared/infrastructure/database/notification/schemas";

/** Same stage selection the cities seed, the categories seed and the slug backfill use. */
function stageUrl(): string {
  const stage = (process.env["STAGE"] ?? "dev").toLowerCase();
  const key = { dev: "DEV_DB_URL", qa: "QA_DB_URL", prod: "PROD_DB_URL" }[stage];
  if (!key) throw new Error(`Unknown STAGE "${stage}" — expected dev, qa or prod.`);
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set. Reading ${stage} needs it.`);
  return value;
}

/**
 * A pasted address arrives with whatever came with it — a trailing space out
 * of a spreadsheet, a `mailto:` a browser added. Trimmed, and nothing more:
 * the lookup below is deliberately byte-exact, because that is what the
 * platform itself does.
 */
function addressArgument(): string {
  const arg = process.argv.slice(2).find((a) => !a.startsWith("-"));
  const email = arg?.trim().replace(/^mailto:/i, "");
  if (!email) {
    console.error("Usage: bun run db:delivery:<dev|qa|prod>:check <email-address>");
    process.exit(1);
  }
  return email;
}

function when(value: Date | null): string {
  return value ? value.toISOString() : "—";
}

/**
 * How long ago, in the coarsest unit that is still informative.
 *
 * "Stuck for 3h" is the answer somebody wants when they ask about a queued
 * row; a millisecond count is not, and neither is a second timestamp they have
 * to subtract in their head.
 */
function ago(value: Date | null): string {
  if (!value) return "an unknown length of time";
  const minutes = Math.floor((Date.now() - value.getTime()) / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

async function main(): Promise<void> {
  const email = addressArgument();
  const client = postgres(stageUrl(), { max: 1 });
  const db = drizzle(client);

  try {
    const deliveries = await db
      .select()
      .from(notificationDelivery)
      .where(eq(notificationDelivery.toEmail, email))
      // Newest first: the question is almost always about the most recent
      // attempt, and an address with a long history should not make the
      // operator scroll to reach it.
      .orderBy(desc(notificationDelivery.createdAt));

    console.log(`\n${email} — ${deliveries.length} ${plural(deliveries.length, "delivery", "deliveries")}\n`);

    for (const d of deliveries) {
      console.log(`  ${when(d.createdAt)}  ${d.type}  ${d.locale}  ${d.status.toUpperCase()}`);
      // `updated_at` is maintained by the repository's `update` for exactly one
      // reason — "what is stuck, and for how long" — and this is the only place
      // that question gets asked. Printed only when it differs from
      // `created_at`: an equal pair means nothing was ever recorded against the
      // row, which the `queued` line below already says, better.
      if (d.updatedAt && d.createdAt && d.updatedAt.getTime() !== d.createdAt.getTime()) {
        console.log(`      outcome recorded: ${when(d.updatedAt)} (${ago(d.updatedAt)} ago)`);
      }
      if (d.providerMessageId) {
        console.log(`      message id: ${d.providerMessageId}`);
      } else if (d.status === "sent") {
        // A `sent` row with no message id is not a gap, and the absence is
        // only worth remarking on here — a row that never reached a sender
        // has no reference to be missing. The console adapter (STAGE=local,
        // no RESEND_API_KEY) reports success and hands back nothing to
        // correlate a later bounce against.
        console.log("      message id: none — this sender returned no reference");
      }
      if (d.error) console.log(`      error: ${d.error}`);
      // The one status that needs translating. Every row is written `queued`
      // before the attempt and updated in place afterwards, so a row still
      // reading `queued` means no result was ever recorded — the isolate died
      // mid-send, or the write that would have recorded the outcome failed.
      // It does NOT mean the email did not go out, and resending on the
      // strength of it may deliver a second copy.
      if (d.status === "queued") {
        console.log(
          `      still queued after ${ago(d.updatedAt)} — no outcome was ever recorded.` +
            " The email may or may not have been sent.",
        );
      }
    }

    if (deliveries.length === 0) {
      // The most common way this tool lies to somebody: suppression keys and
      // `to_email` are byte-exact everywhere in the round trip (follow-up
      // #52), so an address that differs only in case really does have no
      // rows under the spelling that was typed — while rows exist under
      // another. Saying so beats an operator concluding "we never sent it".
      const [nearby] = await db
        .select({ count: raw<number>`count(*)::int` })
        .from(notificationDelivery)
        .where(raw`lower(${notificationDelivery.toEmail}) = lower(${email})`);
      if (nearby && nearby.count > 0) {
        console.log(
          `  Nothing under that exact spelling, but ${nearby.count} row(s) differ only in case.\n` +
            `  Addresses are stored and matched byte-exact — try the spelling the user signed up with.`,
        );
      } else {
        console.log("  No delivery was ever attempted to this address.");
      }
    }

    const [suppression] = await db
      .select()
      .from(emailSuppression)
      .where(eq(emailSuppression.email, email));

    console.log("");
    if (suppression) {
      // There is no un-suppression path by design, so this line is the whole
      // explanation for every future email to this address not being sent.
      console.log(
        `  SUPPRESSED — ${suppression.reason}, recorded ${when(suppression.suppressedAt)}.` +
          " Nothing will be sent to this address again.",
      );
      if (suppression.detail) {
        console.log(`  what the provider said: ${JSON.stringify(suppression.detail)}`);
      }
    } else {
      console.log("  Not suppressed.");
    }
    console.log("");
  } finally {
    // postgres-js keeps the socket open; without this the script hangs after
    // printing rather than exiting.
    await client.end({ timeout: 5 });
  }
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

// Guarded like reset-test-db.ts: importing this module must not run it.
if (import.meta.main) {
  await main();
}
