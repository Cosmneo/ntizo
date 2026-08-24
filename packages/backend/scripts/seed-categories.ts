/**
 * Seeds the eight categories the landing page already shows.
 *
 * They exist today as translation keys in the web app's `landing` namespace,
 * which works only for a list developers ship. The whole point of the admin
 * form is that somebody who is not a developer can add the ninth — so the
 * eight have to move into the database, and their translations come from the
 * files that already hold them rather than from a fresh guess at eight
 * languages.
 *
 * Idempotent by `code`: a category already there keeps its row and its
 * translations. Run it twice and the second run changes nothing, which is what
 * makes it safe to put in front of a deploy.
 *
 *   bun run --env-file=.env scripts/seed-categories.ts            # dry run
 *   bun run --env-file=.env scripts/seed-categories.ts --apply
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { inArray } from "drizzle-orm";
import postgres from "postgres";
import { LOCALES } from "@ntizo/shared";
import {
  category,
  categoryTranslation,
} from "../src/modules/ntizo/shared/infrastructure/database/catalog/schemas";

const apply = process.argv.includes("--apply");

/** Same stage selection the cities seed and the slug backfill use. */
function stageUrl(): string {
  const stage = (process.env["STAGE"] ?? "dev").toLowerCase();
  const key = { dev: "DEV_DB_URL", qa: "QA_DB_URL", prod: "PROD_DB_URL" }[stage];
  if (!key) throw new Error(`Unknown STAGE "${stage}" — expected dev, qa or prod.`);
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set. Seeding ${stage} needs it.`);
  return value;
}

/**
 * The order they appear on the home page, which is a layout rather than an
 * index — sorting them alphabetically would reshuffle the whole grid every
 * time somebody switched language.
 */
const CODES = [
  "plumbing",
  "electrical",
  "cleaning",
  "mechanic",
  "cooking",
  "delivery",
  "building",
  "driving",
] as const;

const LOCALES_DIR = join(
  import.meta.dirname,
  "../../../apps/frontend/web/src/shared/locales",
);

function labelsFor(locale: string): Record<string, string> {
  const file = join(LOCALES_DIR, locale, "landing.json");
  const json = JSON.parse(readFileSync(file, "utf8")) as { cat?: Record<string, string> };
  return json.cat ?? {};
}

async function main(): Promise<void> {
  const sql = postgres(stageUrl(), { max: 1 });
  const db = drizzle(sql);

  const existing = await db
    .select({ code: category.code })
    .from(category)
    .where(inArray(category.code, [...CODES]));
  const have = new Set(existing.map((r) => r.code));

  const labels = Object.fromEntries(
    LOCALES.map((l) => [l, labelsFor(l)] as const),
  );

  let created = 0;
  for (const [i, code] of CODES.entries()) {
    if (have.has(code)) {
      console.log(`  = ${code} (já existe)`);
      continue;
    }
    const translations = LOCALES.flatMap((locale) => {
      const name = labels[locale]?.[code];
      return name?.trim() ? [{ locale, name: name.trim() }] : [];
    });
    console.log(
      `  ${apply ? "+" : "?"} ${code} — ${translations.length}/${LOCALES.length} idiomas`,
    );
    if (!apply) continue;

    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(category)
        .values({ code, sortOrder: i, isActive: true })
        .returning({ id: category.id });
      await tx.insert(categoryTranslation).values(
        translations.map((t) => ({
          categoryId: row!.id,
          locale: t.locale,
          name: t.name,
          description: null,
        })),
      );
    });
    created += 1;
  }

  console.log(
    apply
      ? `\n  ${created} categorias criadas.`
      : `\n  Simulação. Corra com --apply para escrever.`,
  );
  await sql.end();
  process.exit(0);
}

void main();
