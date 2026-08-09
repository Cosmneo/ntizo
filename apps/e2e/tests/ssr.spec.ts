import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { createVerifiedUser } from "../fixtures/auth";
import { fillSignInForm } from "../fixtures/ui";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const WEB_ROOT = path.join(REPO_ROOT, "apps/frontend/web");

test("/ is server-rendered: the hero text is in the HTML with JavaScript disabled", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  expect(await page.content()).toContain("Find it.");
  await ctx.close();
});

// /admin and /provider/overview are `ssr: false` (inherited from
// start.ts's `defaultSsr: false`) — a signed-in user's own dashboard must
// never be sent as part of the initial HTML, which is the only way an
// unauthenticated fetch of the same URL (a crawler, a shared link, a CDN
// cache) could ever end up holding someone else's session-shaped markup.
// Authenticated on purpose, not just unauthenticated: an unauthenticated
// request never reaches the guarded content either way (the client-side
// guard would redirect it), so it alone wouldn't prove the *server*
// response is what's actually being suppressed.
test("/admin and /provider/overview render no authenticated content with JavaScript disabled", async ({
  browser,
}) => {
  const admin = await createVerifiedUser("admin");

  const signedInCtx = await browser.newContext();
  const signedInPage = await signedInCtx.newPage();
  await signedInPage.goto("/sign-in");
  await fillSignInForm(signedInPage, admin);
  await signedInPage.waitForURL(/\/admin/);
  const storageState = await signedInCtx.storageState();
  await signedInCtx.close();

  const noJsCtx = await browser.newContext({ javaScriptEnabled: false, storageState });
  const noJsPage = await noJsCtx.newPage();

  const adminResponse = await noJsPage.goto("/admin");
  expect(adminResponse?.status()).toBe(200);
  const adminHtml = await noJsPage.content();
  expect(adminHtml).not.toContain(admin.email);
  expect(adminHtml).not.toContain("Ntizo Admin Dashboard");

  const providerResponse = await noJsPage.goto("/provider/overview");
  expect(providerResponse?.status()).toBe(200);
  const providerHtml = await noJsPage.content();
  expect(providerHtml).not.toContain(admin.email);
  expect(providerHtml).not.toContain("No active provider");
  expect(providerHtml).not.toContain("Active services");

  await noJsCtx.close();
});

// The runtime `ssr: false` check above and this one guard two genuinely
// independent switches (vite.config.ts's own comment: `defaultSsr` and
// `autoStaticPathsDiscovery` — "neither implies the other"). This is the
// literal historical regression: with auto-discovery left on,
// `autoStaticPathsDiscovery` walks the whole route tree at *build* time —
// with no request, no cookies, and no guard able to run at all — and bakes
// every route (12 of them, including /admin and /sign-in) into a static,
// publicly-servable HTML file regardless of its own `ssr` flag.
test("the production build prerenders only \"/\" to a static file", async () => {
  test.setTimeout(120_000);

  const distDir = path.join(WEB_ROOT, "dist");
  fs.rmSync(distDir, { recursive: true, force: true });

  const result = spawnSync("bun", ["run", "build"], { cwd: WEB_ROOT, encoding: "utf8" });
  expect(result.status, `web build failed:\n${result.stdout}\n${result.stderr}`).toBe(0);

  const distClient = path.join(distDir, "client");
  const htmlFiles = listHtmlFilesRelative(distClient).sort();
  expect(htmlFiles).toEqual(["index.html"]);
});

function listHtmlFilesRelative(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listHtmlFilesRelative(full, base));
    else if (entry.name.endsWith(".html")) out.push(path.relative(base, full));
  }
  return out;
}
