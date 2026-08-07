import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
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
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

describe("framework isolation", () => {
  it("read/ and write/ never import a web framework or server adapter", () => {
    const files = [...walk(join(ROOT, "read")), ...walk(join(ROOT, "write"))];
    expect(files.length).toBeGreaterThan(0);

    const offenders = files.filter((file) => isForbidden(readFileSync(file, "utf8")));

    expect(offenders.map((f) => f.replace(ROOT, ""))).toEqual([]);
  });
});
