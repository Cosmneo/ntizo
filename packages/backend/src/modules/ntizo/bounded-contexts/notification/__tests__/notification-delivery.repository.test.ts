import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { NotificationType } from "@ntizo/shared";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { emailSuppression } from "../../../shared/infrastructure/database/notification/schemas";
import { user } from "../../../shared/infrastructure/database/user/schemas";
import { profile } from "../../../shared/infrastructure/database/user/schemas";
import { NotificationDelivery } from "../domain/aggregates/notification-delivery.aggregate";
import { DrizzleNotificationDeliveryRepository } from "../infrastructure/repositories/drizzle/notification-delivery.repository";
import { DrizzleEmailSuppressionRepository } from "../infrastructure/repositories/drizzle/email-suppression.repository";
import { DrizzleRecipientReader } from "../infrastructure/outbound-adapters/cross-bc/recipient-reader.adapter";

const url = process.env["DEV_DB_URL"];
if (!url) throw new Error("DEV_DB_URL is not set — see packages/backend/.env");

const sql = postgres(url, { max: 1 });
const db = drizzle(sql, { schema: authSchema });
const deliveries = new DrizzleNotificationDeliveryRepository();
const suppressions = new DrizzleEmailSuppressionRepository();
const recipients = new DrizzleRecipientReader();

const suffix = crypto.randomUUID();
let anaId: string;
const anaEmail = `ana-${suffix}@ntizo.test`;

beforeAll(async () => {
  anaId = crypto.randomUUID();
  await db.insert(user).values({ id: anaId, email: anaEmail, role: "customer", status: "active" });
  await db.insert(profile).values({ userId: anaId, firstName: "Ana", language: "pt-MZ" });
});

afterAll(async () => {
  await db.delete(emailSuppression).where(eq(emailSuppression.email, anaEmail));
  await db.delete(user).where(eq(user.id, anaId));
  await sql.end();
});

describe("the delivery record", () => {
  test("a queued row can be found again by the id its send returned", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const id = await deliveries.save(
        NotificationDelivery.queue({
          type: NotificationType.Welcome,
          toEmail: anaEmail,
          locale: "pt-MZ",
        }),
      );
      const sent = NotificationDelivery.queue({
        type: NotificationType.Welcome,
        toEmail: anaEmail,
        locale: "pt-MZ",
      }).markSent(`msg-${suffix}`);
      await deliveries.update(id, sent);

      const found = await deliveries.findByProviderMessageId(`msg-${suffix}`);
      expect(found?.status).toBe("sent");
      expect(found?.toEmail).toBe(anaEmail);
    });
  });

  test("an unknown provider id finds nothing rather than throwing", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      expect(await deliveries.findByProviderMessageId(`nope-${suffix}`)).toBeNull();
    });
  });
});

describe("suppression", () => {
  test("an address nobody complained about is not suppressed", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      expect(await suppressions.isSuppressed(anaEmail)).toBe(false);
    });
  });

  test("suppressing once, then again, keeps the first reason", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      await suppressions.suppress({ email: anaEmail, reason: "bounce" });
      await suppressions.suppress({ email: anaEmail, reason: "complaint" });
      expect(await suppressions.isSuppressed(anaEmail)).toBe(true);
    });
    const [row] = await db.select().from(emailSuppression).where(eq(emailSuppression.email, anaEmail));
    expect(row?.reason).toBe("bounce");
  });
});

describe("who to write to", () => {
  test("reads a person's own language, not a default", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const r = await recipients.forUser(anaId);
      expect(r?.email).toBe(anaEmail);
      expect(r?.locale).toBe("pt-MZ");
    });
  });

  test("a user with no profile still gets an address", async () => {
    // A profile row is created on sign-up, but this must not be the thing that
    // silently drops an email if one is ever missing.
    const orphanId = crypto.randomUUID();
    const orphanEmail = `orphan-${suffix}@ntizo.test`;
    await db.insert(user).values({ id: orphanId, email: orphanEmail, role: "customer", status: "active" });
    await __runWithTransactionContextForTests(db, async () => {
      const r = await recipients.forUser(orphanId);
      expect(r?.email).toBe(orphanEmail);
      expect(r?.locale).toBe("en-US");
    });
    await db.delete(user).where(eq(user.id, orphanId));
  });

  test("an unknown user is null, not an empty recipient", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      expect(await recipients.forUser(crypto.randomUUID())).toBeNull();
    });
  });
});
