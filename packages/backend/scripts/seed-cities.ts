#!/usr/bin/env bun
/**
 * Loads the GeoNames `cities500` gazetteer into `ntizo_reference.city`.
 *
 * Run once per environment, and again whenever GeoNames publishes a newer
 * dump — cities do not move, so "whenever somebody remembers" is an adequate
 * schedule. Idempotent: rows are upserted on the GeoNames id, so a second run
 * corrects renames and adds new places without touching anything else and
 * without a window where the table is empty.
 *
 *   bun run db:cities:dev:seed
 *   bun run db:cities:qa:seed
 *   bun run db:cities:prod:seed
 *
 * Data: https://download.geonames.org/export/dump/ — CC BY 4.0. The licence
 * requires attribution, which the address form carries; see
 * `apps/frontend/web/src/features/account/ui/addresses-page.tsx`.
 *
 * Why a dump and not a geocoding API: the field needs every country, it needs
 * to work with no key and no per-request cost, and it must not put a third
 * party on the path of somebody typing their own address. 235 206 rows is
 * roughly 31 MB with the indexes.
 */

/// <reference types="node" />
import { unlinkSync } from "node:fs";
import postgres from "postgres";

const DUMP_URL = "https://download.geonames.org/export/dump/cities500.zip";

/**
 * Rows per INSERT.
 *
 * Postgres caps a statement at 65 535 bound parameters; at six columns that is
 * 10 922 rows, so this leaves room rather than sitting on the edge. Larger
 * batches stop helping well before the limit — the cost is round trips, and by
 * two thousand rows there are few enough of those to matter.
 */
const BATCH_SIZE = 2_000;

/** Columns of the GeoNames export we read. The file has nineteen; the rest are geography. */
const COL = { id: 0, name: 1, ascii: 2, country: 8, admin1: 10, population: 14 } as const;

interface CityRow {
  geoname_id: number;
  name: string;
  search_name: string;
  country: string;
  admin1: string | null;
  population: number;
}

/**
 * Folds a name to what the prefix index matches: lowercase, no accents.
 *
 * Applied to both sides — here at seed time and to the user's query at read
 * time — because a fold applied to only one of them is worse than none. The
 * NFD decomposition splits "ã" into "a" plus a combining tilde, and the
 * property escape then removes the mark. GeoNames ships its own ASCII column,
 * but it is not always populated and never lowercased, so this does both in
 * one place instead of trusting a field that is sometimes empty.
 */
export function foldForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function stageUrl(): { stage: string; url: string } {
  const stage = (process.env["STAGE"] ?? "dev").toLowerCase();
  const url = { dev: "DEV_DB_URL", qa: "QA_DB_URL", prod: "PROD_DB_URL" }[stage];
  if (!url) throw new Error(`Unknown STAGE "${stage}" — expected dev, qa or prod.`);
  const value = process.env[url];
  if (!value) throw new Error(`${url} is not set. Seeding ${stage} needs it.`);
  return { stage, url: value };
}

async function downloadDump(): Promise<string> {
  const zipPath = `/tmp/ntizo-cities500-${process.pid}.zip`;
  process.stdout.write(`  downloading ${DUMP_URL}\n`);
  const response = await fetch(DUMP_URL);
  if (!response.ok) throw new Error(`GeoNames returned HTTP ${response.status}`);
  await Bun.write(zipPath, await response.arrayBuffer());

  // `unzip -p` streams the member to stdout. Bun has no zip reader built in,
  // and the alternative is a dependency for one call in one script.
  const unzip = Bun.spawn(["unzip", "-p", zipPath, "cities500.txt"], { stdout: "pipe" });
  const text = await new Response(unzip.stdout).text();
  if ((await unzip.exited) !== 0) throw new Error("unzip failed to read cities500.txt");
  unlinkSync(zipPath);
  return text;
}

/**
 * Parses the tab-separated export.
 *
 * Deliberately not a CSV parser: the format has no quoting and no escaping, so
 * splitting on tabs is the whole specification. A parser that treated quotes as
 * significant would corrupt names that legitimately contain them.
 */
export function parseDump(text: string): CityRow[] {
  const rows: CityRow[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const c = line.split("\t");
    const geonameId = Number(c[COL.id]);
    const name = c[COL.name];
    const country = c[COL.country];
    // A row missing any of these is unusable rather than partially usable:
    // there is nothing to show, or nothing to filter it by.
    if (!Number.isFinite(geonameId) || !name || !country) continue;
    rows.push({
      geoname_id: geonameId,
      name,
      search_name: foldForSearch(c[COL.ascii] || name),
      country,
      admin1: c[COL.admin1] || null,
      population: Number(c[COL.population]) || 0,
    });
  }
  return rows;
}

async function main() {
  const { stage, url } = stageUrl();
  process.stdout.write(`Seeding cities into ${stage}\n`);

  const text = await downloadDump();
  const rows = parseDump(text);
  if (rows.length < 100_000) {
    // A truncated download parses without error and would quietly leave the
    // picker with a fraction of the world. The dump has held above 200 000 for
    // years; anything near half that means the file, not the data, changed.
    throw new Error(`Only ${rows.length} rows parsed — refusing to seed a partial dump.`);
  }
  process.stdout.write(`  parsed ${rows.length.toLocaleString("en-US")} cities\n`);

  const sql = postgres(url, { max: 1 });
  try {
    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      // Upsert, so a re-run is a correction rather than a reload. Deleting
      // first would leave the table empty for the length of the seed, and the
      // address form reads this table in production.
      await sql`
        INSERT INTO ntizo_reference.city ${sql(batch, "geoname_id", "name", "search_name", "country", "admin1", "population")}
        ON CONFLICT (geoname_id) DO UPDATE SET
          name = EXCLUDED.name,
          search_name = EXCLUDED.search_name,
          country = EXCLUDED.country,
          admin1 = EXCLUDED.admin1,
          population = EXCLUDED.population
      `;
      done += batch.length;
      process.stdout.write(`\r  inserted ${done.toLocaleString("en-US")} / ${rows.length.toLocaleString("en-US")}`);
    }
    process.stdout.write("\n");

    const [count] = await sql`SELECT count(*)::int AS n FROM ntizo_reference.city`;
    const countries = await sql`SELECT count(DISTINCT country)::int AS n FROM ntizo_reference.city`;
    process.stdout.write(`Done: ${count?.["n"]} cities across ${countries[0]?.["n"]} countries.\n`);
  } finally {
    await sql.end();
  }
}

// Guarded so the parser can be imported by its test without running the seed.
if (import.meta.main) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
