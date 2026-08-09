import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * wrangler refuses to run on Node < 22, AND refuses to run under Bun's own
 * runtime entirely — confirmed empirically while building this harness:
 * `bun run node_modules/.bin/wrangler dev` prints "Wrangler does not
 * support the Bun runtime", logs "Unexpected server response: 101" for its
 * inspector/devtools bridge, and the dev server never actually serves a
 * request despite printing "Ready". `bun run e2e` (this harness's own entry
 * point) executes playwright.config.ts under Bun, so the API webServer
 * entry must launch wrangler with an explicit, real Node >= 22 binary —
 * never bare "node" on PATH (this machine's default is v20, per the Phase
 * 3B brief) and never Bun.
 */
export function resolveNode22(): string {
  const override = process.env.NTIZO_E2E_NODE_BIN;
  if (override) return override;

  const systemNodeMajor = nodeMajorVersion("node");
  if (systemNodeMajor !== undefined && systemNodeMajor >= 22) return "node";

  // Fall back to scanning nvm's install directory for the highest installed
  // >=22 version. Generic (not hardcoded to one exact version string) so
  // this works on any machine using nvm, not just the one this was written
  // on.
  const nvmDir = path.join(os.homedir(), ".nvm", "versions", "node");
  if (fs.existsSync(nvmDir)) {
    const best = fs
      .readdirSync(nvmDir)
      .filter((v) => /^v\d+\.\d+\.\d+$/.test(v))
      .filter((v) => Number(v.slice(1).split(".")[0]) >= 22)
      .sort(compareVersionsDescending)[0];
    if (best) return path.join(nvmDir, best, "bin", "node");
  }

  throw new Error(
    "[e2e] No Node >= 22 binary found on PATH or under ~/.nvm (wrangler " +
      "requires it, and refuses to run under Bun's runtime). Install one " +
      "(e.g. via nvm) or set NTIZO_E2E_NODE_BIN to its absolute path.",
  );
}

function nodeMajorVersion(bin: string): number | undefined {
  try {
    const out = execFileSync(bin, ["--version"], { encoding: "utf8" }).trim();
    const match = /^v(\d+)\./.exec(out);
    return match ? Number(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

function compareVersionsDescending(a: string, b: string): number {
  const pa = a.slice(1).split(".").map(Number);
  const pb = b.slice(1).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
