/**
 * DB-backed test for `DrizzleServiceNameReader` against the real dev
 * database — same reasoning as `catalog-unpublish-sweep.test.ts`: the join
 * on `service.source_locale` can look right in review while quietly
 * matching nothing, and only a real query against real rows proves it
 * resolves the translation the provider actually wrote, falls back when
 * that translation is missing, and returns null rather than throwing when
 * nothing at all matches.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { category, service, serviceTranslation } from "../../../shared/infrastructure/database/catalog/schemas";
import { provider } from "../../../shared/infrastructure/database/provider/schemas";
import { user } from "../../../shared/infrastructure/database/user/schemas/user.schema";
import { DrizzleServiceNameReader } from "../infrastructure/outbound-adapters/cross-bc/service-name-reader.adapter";

const url = process.env["DEV_DB_URL"];
if (!url) throw new Error("DEV_DB_URL is not set — see packages/backend/.env");

const sql = postgres(url, { max: 1 });
const db = drizzle(sql, { schema: authSchema });
const reader = new DrizzleServiceNameReader();

const suffix = crypto.randomUUID();
const ownerId = crypto.randomUUID();
let providerId: string;
let categoryId: string;

let hasSourceLocaleRow: string;
let fallbackRow: string;
let noTranslationRow: string;

beforeAll(async () => {
  await db.insert(user).values({ id: ownerId, email: `activity-snr-${suffix}@example.com` });

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId: ownerId,
      type: "individual",
      name: "Activity Service Name Reader Test Provider",
      slug: `activity-snr-test-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  providerId = providerRow!.id;

  const [categoryRow] = await db
    .insert(category)
    .values({ code: `activity-snr-test-${suffix}` })
    .returning({ id: category.id });
  categoryId = categoryRow!.id;

  async function makeService(): Promise<string> {
    const [row] = await db
      .insert(service)
      .values({
        providerId,
        categoryId,
        sourceLocale: "pt-MZ",
        locationType: "at_provider",
        status: "draft",
      })
      .returning({ id: service.id });
    return row!.id;
  }

  // Has its own `source_locale` translation AND a competing `de-DE` one —
  // "de-DE" sorts before "pt-MZ" alphabetically, so this is what actually
  // proves the source-locale join wins over the fallback: an adapter that
  // ignored `source_locale` and always fell through to the locale-ordered
  // scan would answer "Haarschnitt" here too, not "Corte de Cabelo". A
  // fixture with only the `pt-MZ` row (the earlier version of this file)
  // could not tell the two implementations apart — both return the same
  // name when there is nothing else to return.
  hasSourceLocaleRow = await makeService();
  await db
    .insert(serviceTranslation)
    .values({ serviceId: hasSourceLocaleRow, locale: "pt-MZ", name: "Corte de Cabelo" });
  await db
    .insert(serviceTranslation)
    .values({ serviceId: hasSourceLocaleRow, locale: "de-DE", name: "Haarschnitt (errado)" });

  // No `pt-MZ` row at all — only reachable, in production, before a first
  // publish (`hasSourceName` is a publish invariant). Inserted en-US first,
  // then de-DE, so a plain unordered scan would tend to answer "Haircut"
  // and only the `ORDER BY locale` in the adapter answers "Haarschnitt".
  fallbackRow = await makeService();
  await db
    .insert(serviceTranslation)
    .values({ serviceId: fallbackRow, locale: "en-US", name: "Haircut" });
  await db
    .insert(serviceTranslation)
    .values({ serviceId: fallbackRow, locale: "de-DE", name: "Haarschnitt" });

  // No translation of any kind.
  noTranslationRow = await makeService();
});

afterAll(async () => {
  const serviceIds = [hasSourceLocaleRow, fallbackRow, noTranslationRow];
  for (const id of serviceIds) {
    await db.delete(serviceTranslation).where(eq(serviceTranslation.serviceId, id));
  }
  for (const id of serviceIds) {
    await db.delete(service).where(eq(service.id, id));
  }
  await db.delete(category).where(eq(category.id, categoryId));
  await db.delete(provider).where(eq(provider.id, providerId));
  await db.delete(user).where(eq(user.id, ownerId));
  await sql.end({ timeout: 5 });
});

describe("DrizzleServiceNameReader — real join, real fallback, real rows", () => {
  test("resolves the service's own source_locale translation over a competing, alphabetically-earlier one", async () => {
    // `hasSourceLocaleRow` carries both a `pt-MZ` row (its `source_locale`)
    // and a `de-DE` row that would win the fallback's `ORDER BY locale` on
    // its own. "Corte de Cabelo" only comes back if the join actually
    // matches on `source_locale` — an adapter that fell straight to the
    // fallback would answer "Haarschnitt (errado)" instead.
    const name = await __runWithTransactionContextForTests(db, () =>
      reader.findNameById(hasSourceLocaleRow),
    );
    expect(name).toBe("Corte de Cabelo");
  });

  test("falls back, deterministically by locale, when the source_locale translation is missing", async () => {
    const name = await __runWithTransactionContextForTests(db, () =>
      reader.findNameById(fallbackRow),
    );
    // "de-DE" sorts before "en-US" — this is the one place that ordering is
    // the right call: a last resort picking *some* name, not a second-best
    // guess at which language the provider meant.
    expect(name).toBe("Haarschnitt");
  });

  test("answers null for a service with no translation at all", async () => {
    const name = await __runWithTransactionContextForTests(db, () =>
      reader.findNameById(noTranslationRow),
    );
    expect(name).toBeNull();
  });

  test("answers null for a service that does not exist", async () => {
    const name = await __runWithTransactionContextForTests(db, () =>
      reader.findNameById(crypto.randomUUID()),
    );
    expect(name).toBeNull();
  });
});
