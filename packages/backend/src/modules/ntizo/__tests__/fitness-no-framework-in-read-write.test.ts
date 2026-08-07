import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const FORBIDDEN = [
  "@cosmneo/onion-lasagna-hono",
  "@cosmneo/onion-lasagna-yoga",
  "graphql-yoga",
  'from "hono"',
];

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

    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return FORBIDDEN.some((needle) => source.includes(needle));
    });

    expect(offenders.map((f) => f.replace(ROOT, ""))).toEqual([]);
  });
});
