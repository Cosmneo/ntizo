import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { join, relative } from "node:path";

const PUBLIC_DIR = join(import.meta.dir, "..");
const MODULE_ROOT = join(PUBLIC_DIR, "..");

/**
 * Nothing under `public/` may import from the privileged tiers.
 *
 * `public/` serves anonymous visitors. `read/` and `write/` are session-authed
 * — their arg-mappers call `requireRequesterUserId`, and their handlers assume
 * an identity exists. A public slice that imports one inherits that assumption
 * silently: it either throws for the very callers it exists to serve, or, worse,
 * pulls privileged code into a bundle that anonymous traffic reaches.
 *
 * A public slice needing a projection gets it **injected at the composition
 * root**, the same way `apps/backend/api/src/graphql/private.ts` wires the
 * private handlers today. Injection is a runtime edge the bootstrap owns; a
 * source import is a compile-time dependency this file forbids.
 *
 * Deliberately allowlist-free. An allowlist is where this kind of gate goes to
 * die — the first exception is always justified, and by the fifth nobody can
 * say what the rule is. If something genuinely needs to be shared between
 * public and private, it belongs in `shared/`, which is not a privileged tier
 * and is not matched below.
 */
const PRIVILEGED_TIERS = ["read", "write"] as const;

/**
 * Matches an import/require of a privileged tier, whether written relative
 * (`../read/...`, `../../write/...`) or absolute-ish
 * (`@ntizo/backend/modules/ntizo/read/...`).
 *
 * Anchored on import syntax rather than a bare substring: a plain
 * `includes("read")` would fire on `readFileSync`, `alreadyRead`, or any
 * sentence in a doc comment. This project has already shipped one check that
 * passed because it examined a pattern that never existed — the failure mode
 * runs both ways.
 */
const PRIVILEGED_IMPORT = new RegExp(
  String.raw`(?:from\s+|import\(\s*|require\(\s*)["'][^"']*(?:^|/)(?:${PRIVILEGED_TIERS.join("|")})/[^"']*["']`,
);

interface Listing {
  sourceFiles: string[];
  /** Symlinks and non-TS sources could alias a forbidden import past the scan. */
  blindSpots: string[];
}

function walk(dir: string, acc: Listing): Listing {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = lstatSync(full);

    if (stat.isSymbolicLink()) {
      acc.blindSpots.push(full);
      continue;
    }
    if (stat.isDirectory()) {
      walk(full, acc);
      continue;
    }
    // This guard's own file carries the forbidden patterns as fixtures.
    if (full === import.meta.path) continue;
    if (full.endsWith(".ts")) acc.sourceFiles.push(full);
    else if (/\.(js|jsx|mjs|cjs|mts|cts)$/.test(full)) acc.blindSpots.push(full);
  }
  return acc;
}

describe("public tier isolation", () => {
  it("no file under public/ imports from read/ or write/", () => {
    const { sourceFiles, blindSpots } = walk(PUBLIC_DIR, {
      sourceFiles: [],
      blindSpots: [],
    });

    // Without this the gate passes vacuously the day someone moves or renames
    // the directory — a green tick reporting that nothing was examined.
    expect(sourceFiles.length).toBeGreaterThan(0);
    expect(blindSpots.map((f) => relative(MODULE_ROOT, f))).toEqual([]);

    const offenders = sourceFiles.filter((file) =>
      PRIVILEGED_IMPORT.test(readFileSync(file, "utf8")),
    );

    expect(offenders.map((f) => relative(MODULE_ROOT, f))).toEqual([]);
  });
});
