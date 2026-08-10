/**
 * Gives existing providers the same slug shape new ones get.
 *
 * Rows created before slugs carried a suffix hold bare names — `salao-beleza`
 * — and the odd `-2` where two businesses shared one. Leaving them is not an
 * option now that the slug is the URL: the rule would hold for new workspaces
 * and not old ones, and the first business to have registered would keep a
 * name it won by arriving first.
 *
 * Idempotent. A row whose slug already matches what `slugCandidates` would
 * produce for it is skipped, so running this twice changes nothing — which is
 * what makes it safe to run against a stage you are unsure about.
 *
 * This rewrites URLs. Any link to a provider page minted before it runs will
 * 404 afterwards. That is acceptable now, while the only such links are in dev
 * and in this repository's own tests; once real ones exist, this becomes a
 * redirect table rather than an UPDATE.
 *
 *   bun run db:slugs:dev:backfill [--apply]
 *
 * Without `--apply` it prints what it would do and writes nothing.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { provider } from "../src/modules/ntizo/shared/infrastructure/database/provider/schemas";
import { slugCandidates } from "../src/modules/ntizo/bounded-contexts/provider/domain/services/provider-slug";

const apply = process.argv.includes("--apply");

/** Same stage selection the cities seed uses — one env var per stage. */
function stageUrl(): string {
  const stage = (process.env["STAGE"] ?? "dev").toLowerCase();
  const key = { dev: "DEV_DB_URL", qa: "QA_DB_URL", prod: "PROD_DB_URL" }[stage];
  if (!key) throw new Error(`Unknown STAGE "${stage}" — expected dev, qa or prod.`);
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set. Backfilling ${stage} needs it.`);
  return value;
}

async function main(): Promise<void> {
  const sql = postgres(stageUrl(), { max: 1 });
  const db = drizzle(sql);
  const rows = await db
    .select({ id: provider.id, name: provider.name, slug: provider.slug })
    .from(provider);

  if (rows.length === 0) {
    console.log("No providers. Nothing to do.");
    return;
  }

  // Every slug in use, so a rewritten one cannot land on a row this run has
  // not reached yet. Reading them all up front costs one query and removes an
  // ordering dependency that would otherwise be invisible until it bit.
  const taken = new Set(rows.map((r) => r.slug));
  const changes: Array<{ id: string; from: string; to: string }> = [];

  for (const row of rows) {
    const candidates = [...slugCandidates(row.name, row.id)];
    if (candidates.includes(row.slug)) continue; // already in shape

    const next = candidates.find((c) => !taken.has(c));
    if (!next) {
      console.error(`  ${row.slug}: every candidate taken — skipped, needs a look`);
      continue;
    }
    taken.delete(row.slug);
    taken.add(next);
    changes.push({ id: row.id, from: row.slug, to: next });
  }

  if (changes.length === 0) {
    console.log(`${rows.length} providers, all already in shape.`);
    return;
  }

  for (const change of changes) {
    console.log(`  ${change.from}  →  ${change.to}`);
  }

  if (!apply) {
    console.log(`\n${changes.length} would change. Re-run with --apply to write.`);
    return;
  }

  for (const change of changes) {
    await db.update(provider).set({ slug: change.to }).where(eq(provider.id, change.id));
  }
  console.log(`\n${changes.length} updated.`);
}

await main();
// `postgres-js` keeps the socket open; without this the script never exits.
process.exit(0);
