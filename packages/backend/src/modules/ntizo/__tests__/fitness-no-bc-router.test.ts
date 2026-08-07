import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";

// packages/backend/src/modules/ntizo/bounded-contexts — domain, app and
// persistence-adapter code for each bounded context. Presentation
// (REST/HTTP/GraphQL routing) does not belong here: it belongs in read/,
// write/ or public/, which sit at the app layer's edge and are the only
// places allowed to bind a wire protocol to use cases.
const ROOT = join(import.meta.dir, "..", "bounded-contexts");

const FORBIDDEN_DIR_NAMES = new Set(["rest", "http", "graphql"]);

// Matches an exported function/const whose name looks like a router
// factory, e.g. `export function createProviderRouter(...)` or
// `export const createXRouter = (...)`.
const ROUTER_EXPORT = /export\s+(?:async\s+)?(?:function|const|let)\s+(create\w*Router)\b/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

function dirSegments(file: string): string[] {
  return file.split(sep).slice(0, -1);
}

describe("no presentation infrastructure inside bounded-contexts", () => {
  const files = walk(ROOT);

  it("scans at least one bounded-context file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no file lives in a directory named rest, http or graphql", () => {
    const offenders = files.filter((file) =>
      dirSegments(file).some((segment) => FORBIDDEN_DIR_NAMES.has(segment)),
    );
    expect(offenders.map((f) => f.replace(ROOT, ""))).toEqual([]);
  });

  it("no file exports a createXRouter symbol", () => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      ROUTER_EXPORT.lastIndex = 0;
      return ROUTER_EXPORT.test(source);
    });
    expect(offenders.map((f) => f.replace(ROOT, ""))).toEqual([]);
  });
});
