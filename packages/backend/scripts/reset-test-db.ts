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
 *     fallback. An unset (or blank) var refuses, loudly, with a non-zero
 *     exit.
 *   - Refuses a URL that resolves to an empty hostname, e.g. "postgres:///db"
 *     — an authority-less URL, which `new URL(...)` parses without throwing
 *     and gives `hostname === ""`. An empty hostname would otherwise sail
 *     straight past the neon.tech check below while `postgres.js` quietly
 *     falls back to resolving the real host from `PGHOST`/`PGHOSTADDR`,
 *     which this script has no visibility into. (A URL that instead has
 *     credentials or a port but no host, e.g. "postgres://u:p@:5432/db",
 *     was already refused before this check existed — `new URL(...)` throws
 *     on that shape rather than returning an empty hostname, verified
 *     directly against both Bun's and Node's URL parser, and the surrounding
 *     try/catch below turns that throw into the "not a valid connection URL"
 *     refusal.)
 *   - Refuses if the hostname looks like a managed provider. This project's
 *     dev/qa/prod databases are Neon, whose hostnames contain "neon.tech" —
 *     that pattern is the check. It is not a general safety net for every
 *     possible managed provider; it targets the one this project actually
 *     uses.
 *
 * Ordering: does not matter, and does not need to. Each migration chain
 * writes to its own journal table — `ntizo_migrations` /
 * `better_auth_migrations`, set via each chain's own `drizzle.config.ts`
 * (`migrations: { table: ... }`) — instead of sharing the default
 * `drizzle.__drizzle_migrations`. An earlier revision of this file required
 * better-auth to apply first, because drizzle-orm's postgres-js migrator
 * (pg-core/dialect.js, `PgDialect.migrate`) decides what to apply by
 * comparing each pending migration's own timestamp against the single most
 * recent row in ONE journal table — not by hash membership — so two chains
 * sharing that table were order-dependent in a way that failed silently.
 * That coupling was removed structurally, as a property of the drizzle
 * configs (see the `migrations.table` comment in each), not by any ordering
 * guarantee in this file — there is nothing left here to re-verify before
 * swapping the two `runMigrate` calls below. Neither chain's migrations
 * reference the other's tables via foreign key either, so there is no
 * data-dependency reason to prefer one order over the other.
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

/**
 * Thrown by `guardTargetUrl` for every refusal case. Kept separate from
 * `refuse`'s `process.exit(1)` specifically so the guard logic itself is a
 * pure function the test suite can call directly, instead of a script entry
 * point that would kill the test runner's process on the very refusals it's
 * trying to exercise.
 */
export class GuardRefusalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardRefusalError";
  }
}

export function guardTargetUrl(): string {
  const url = process.env[TARGET_URL_ENV_VAR];
  if (!url || url.trim() === "") {
    throw new GuardRefusalError(
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
    throw new GuardRefusalError(`${TARGET_URL_ENV_VAR} is not a valid connection URL.`);
  }

  if (hostname.trim() === "") {
    throw new GuardRefusalError(
      `${TARGET_URL_ENV_VAR} resolves to an empty hostname (parsed from ` +
        `"${url}"). An authority-less URL like "postgres:///db" passes the ` +
        `neon.tech check below by simply not matching it, while postgres.js ` +
        `silently falls back to resolving the real host from ` +
        `PGHOST/PGHOSTADDR, which this script cannot see or verify. Set ` +
        `${TARGET_URL_ENV_VAR} to a URL that names its host explicitly.`,
    );
  }

  if (hostname.toLowerCase().includes("neon.tech")) {
    throw new GuardRefusalError(
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
  let url: string;
  try {
    url = guardTargetUrl();
  } catch (error) {
    if (error instanceof GuardRefusalError) {
      refuse(error.message);
    }
    throw error;
  }
  const schemas = schemasToReset();

  await dropSchemas(url, schemas);

  // Order does not matter — see the header comment. Each chain owns its own
  // journal table, so neither run can see or be skipped by the other's rows.
  await runMigrate(url, "./src/modules/better-auth/drizzle.config.ts", "better-auth");
  await runMigrate(url, "./src/modules/ntizo/drizzle.config.ts", "ntizo");

  console.log("[reset-test-db] done.");
}

// Guarded so importing this module (e.g. from the guard's own test suite)
// never runs the destructive script as a side effect of import — only
// running it directly (`bun run reset-test-db.ts`, including via `bunx bun
// run` from the package script) does.
if (import.meta.main) {
  await main();
}
