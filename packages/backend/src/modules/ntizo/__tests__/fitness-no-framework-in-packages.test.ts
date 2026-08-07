import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// packages/backend/src — the whole framework-agnostic core package. Route
// definitions use only the core kit; the Hono binding lives at the app
// layer (apps/backend/api/src/), never inside this package. See
// fitness-no-framework-in-read-write.test.ts for the read/write-scoped
// predecessor of this gate.
const ROOT = join(import.meta.dir, "..", "..", "..");

// This directory (modules/ntizo/__tests__) holds only fitness/architecture
// meta-tests, including this file. Those tests must spell out the forbidden
// specifiers verbatim to define what they check for, so scanning this
// directory would make every fitness test flag itself and its siblings.
// Every other `__tests__` folder in the tree (bounded-contexts/**,
// read/**, write/**, shared/**) is ordinary test code and stays in scope.
const SELF_DIR = import.meta.dir;

const FORBIDDEN_SUBSTRINGS = [
  "@cosmneo/onion-lasagna-hono",
  "@cosmneo/onion-lasagna-yoga",
  "graphql-yoga",
];

/**
 * Matches a hono module specifier — bare (`hono`) or subpath (`hono/cors`,
 * `hono/...`) — behind `from "..."`, `import("...")`, or `require("...")`,
 * single- or double-quoted. A plain substring check on `hono` would false-
 * positive on prose ("honor", "dishonor"); anchoring on the import/require
 * syntax avoids that while still catching every one of hono's 75 subpath
 * exports, not just the bare specifier.
 */
const HONO_IMPORT = /\b(?:from\s+|import\(\s*|require\(\s*)["']hono(?:\/[^"']*)?["']/;

function isForbidden(source: string): boolean {
  return FORBIDDEN_SUBSTRINGS.some((needle) => source.includes(needle)) || HONO_IMPORT.test(source);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (full === SELF_DIR) return [];
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

describe("framework isolation (package-wide)", () => {
  it("packages/backend/src never imports a web framework or server adapter", () => {
    const files = walk(ROOT);
    expect(files.length).toBeGreaterThan(0);

    const offenders = files.filter((file) => isForbidden(readFileSync(file, "utf8")));

    expect(offenders.map((f) => f.replace(ROOT, ""))).toEqual([]);
  });
});
