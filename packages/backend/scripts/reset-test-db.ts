#!/usr/bin/env bun
/**
 * Resets a throwaway Postgres database for the e2e suite: drops every schema
 * either migration chain owns, then re-applies both chains from zero.
 *
 * THIS SCRIPT IS DESTRUCTIVE. Its only safeguard is the guard below — read it
 * before changing it.
 *
 * Guard:
 *   - Target comes from `E2E_DB_URL` only. Never `DATABASE_URL`, never a
 *     fallback. An unset var refuses, loudly, with a non-zero exit.
 *   - Refuses if the hostname looks like a managed provider. This project's
 *     dev/qa/prod databases are Neon, whose hostnames contain "neon.tech" —
 *     that pattern is the check. It is not a general safety net for every
 *     possible managed provider; it targets the one this project actually
 *     uses.
 *
 * Ordering (do not swap without re-verifying against dev):
 *   Both migration chains write to the SAME default `drizzle.__drizzle_migrations`
 *   journal table (see the "coincidental, not designed" comment in
 *   drizzle.config.ts). That is more fragile than a hash collision risk: the
 *   postgres-js migrator in drizzle-orm (pg-core/dialect.js, `PgDialect.migrate`)
 *   only compares each pending migration's own timestamp against the SINGLE
 *   most recent `created_at` row already in that shared table — not against
 *   the set of already-applied hashes. Concretely:
 *
 *     const dbMigrations = await session.all(
 *       sql`select id, hash, created_at from ${schema}.${table}
 *           order by created_at desc limit 1`
 *     );
 *     const lastDbMigration = dbMigrations[0];
 *     // later, per migration in *this* chain only:
 *     if (!lastDbMigration || lastDbMigration.created_at < migration.folderMillis) { apply }
 *
 *   Each migration file's timestamp is its `when` in meta/_journal.json.
 *   better-auth's single migration was generated earlier (smaller `when`) than
 *   ntizo's. Applying ntizo first leaves a high-water mark in the shared
 *   journal that is greater than better-auth's migration timestamp, so running
 *   better-auth second causes it to be silently skipped: exit code 0, "applied
 *   successfully", zero rows inserted, `better_auth` schema never created. No
 *   error is raised anywhere in that path.
 *
 *   Verified against the real dev database (read-only): its journal holds
 *   better-auth's hash first, then both ntizo hashes, in that order. This
 *   script preserves it: better-auth migrates before ntizo.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import postgres from "postgres";
import ntizoConfig from "../src/modules/ntizo/drizzle.config";
import betterAuthConfig from "../src/modules/better-auth/drizzle.config";

const TARGET_URL_ENV_VAR = "E2E_DB_URL";
const BACKEND_ROOT = path.resolve(import.meta.dir, "..");

function refuse(message: string): never {
  console.error(`[reset-test-db] REFUSING TO RUN: ${message}`);
  process.exit(1);
}

function guardTargetUrl(): string {
  const url = process.env[TARGET_URL_ENV_VAR];
  if (!url || url.trim() === "") {
    refuse(
      `${TARGET_URL_ENV_VAR} is not set. This script drops and recreates ` +
        `database schemas — it only ever runs against a target named ` +
        `explicitly, never DATABASE_URL, never a default. Set ${TARGET_URL_ENV_VAR} ` +
        `to the throwaway test database's connection string and try again.`,
    );
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    refuse(`${TARGET_URL_ENV_VAR} is not a valid connection URL.`);
  }

  if (hostname.toLowerCase().includes("neon.tech")) {
    refuse(
      `${TARGET_URL_ENV_VAR} points at host "${hostname}", which contains ` +
        `"neon.tech" — this project's dev/qa/prod databases are Neon. That ` +
        `makes this almost certainly a real, shared database, not a ` +
        `throwaway one. Point ${TARGET_URL_ENV_VAR} at a local or CI-only ` +
        `Postgres instance instead.`,
    );
  }

  return url;
}

/**
 * The schemas either migration chain owns, plus the shared migration
 * journal's own schema. Read from the same config modules `drizzle-kit`
 * itself uses, so this list can never drift from what the chains actually
 * claim via `schemaFilter`.
 */
function schemasToReset(): string[] {
  const betterAuthSchemas = (betterAuthConfig.schemaFilter ?? []) as string[];
  const ntizoSchemas = (ntizoConfig.schemaFilter ?? []) as string[];
  return ["drizzle", ...betterAuthSchemas, ...ntizoSchemas];
}

async function dropSchemas(url: string, schemas: string[]): Promise<void> {
  const sql = postgres(url, { max: 1 });
  try {
    for (const schema of schemas) {
      console.log(`[reset-test-db] dropping schema "${schema}" (if it exists)...`);
      await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function runMigrate(url: string, configPath: string, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[reset-test-db] applying ${label} migrations...`);
    const child = spawn("bunx", ["drizzle-kit", "migrate", "--config", configPath], {
      cwd: BACKEND_ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        STAGE: "dev",
        // Both configs' "dev" stage reads DEV_DB_URL. Scope the override to
        // this child process only — never mutate the parent's real env, and
        // never rely on whatever DEV_DB_URL may already be set to outside
        // this script.
        DEV_DB_URL: url,
      },
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} migrate exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function main(): Promise<void> {
  const url = guardTargetUrl();
  const schemas = schemasToReset();

  await dropSchemas(url, schemas);

  // Order matters — see the header comment. better-auth must apply first.
  await runMigrate(url, "./src/modules/better-auth/drizzle.config.ts", "better-auth");
  await runMigrate(url, "./src/modules/ntizo/drizzle.config.ts", "ntizo");

  console.log("[reset-test-db] done.");
}

await main();
