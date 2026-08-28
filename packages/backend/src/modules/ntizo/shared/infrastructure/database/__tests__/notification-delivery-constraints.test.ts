import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  emailSuppression,
  notificationDelivery,
} from "../notification/schemas";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "./dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql);
const suffix = crypto.randomUUID();

afterAll(async () => {
  await bestEffortCleanup([
    () => db.delete(emailSuppression).where(eq(emailSuppression.email, `bounced-${suffix}@ntizo.test`)),
    () => sql.end({ timeout: 5 }),
  ]);
});

/** Drizzle builders are lazy thenables, not Promises — `expect(builder).rejects` throws before the query runs. */
async function insertDelivery(values: Record<string, unknown>) {
  await db.insert(notificationDelivery).values(values as never);
}

describe("a delivery stands alone", () => {
  test("accepts a row with no notification behind it", async () => {
    const [row] = await db
      .insert(notificationDelivery)
      .values({
        type: "TEAM_INVITATION",
        channel: "EMAIL",
        toEmail: `stranger-${suffix}@ntizo.test`,
        locale: "pt-MZ",
        status: "queued",
      })
      .returning();
    expect(row?.notificationId).toBeNull();
    await db.delete(notificationDelivery).where(eq(notificationDelivery.id, row!.id));
  });

  test("refuses a status nobody defined", async () => {
    await expect(
      insertDelivery({
        type: "WELCOME",
        channel: "EMAIL",
        toEmail: `x-${suffix}@ntizo.test`,
        locale: "en-US",
        status: "pending",
      }),
    ).rejects.toThrow(/notification_delivery_status_known/);
  });

  test("refuses a channel nobody built", async () => {
    await expect(
      insertDelivery({
        type: "WELCOME",
        channel: "SMS",
        toEmail: `x-${suffix}@ntizo.test`,
        locale: "en-US",
        status: "queued",
      }),
    ).rejects.toThrow(/notification_delivery_channel_known/);
  });
});

describe("suppression", () => {
  test("one row per address, and a second write is not an error", async () => {
    const email = `bounced-${suffix}@ntizo.test`;
    await db.insert(emailSuppression).values({ email, reason: "bounce" });
    await db
      .insert(emailSuppression)
      .values({ email, reason: "complaint" })
      .onConflictDoNothing();

    const rows = await db.select().from(emailSuppression).where(eq(emailSuppression.email, email));
    expect(rows).toHaveLength(1);
    // The FIRST reason survives. A complaint arriving after a bounce does not
    // rewrite why we stopped writing to this address.
    expect(rows[0]!.reason).toBe("bounce");
  });

  test("refuses a reason nobody defined", async () => {
    await expect(
      (async () => {
        await db
          .insert(emailSuppression)
          .values({ email: `y-${suffix}@ntizo.test`, reason: "unsubscribed" });
      })(),
    ).rejects.toThrow(/email_suppression_reason_known/);
  });
});
