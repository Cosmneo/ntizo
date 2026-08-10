import { test, expect } from "@playwright/test";
import { createProvider } from "../fixtures/provider";

/**
 * The public directory is the one surface built to be read by software that
 * does not execute JavaScript. Every assertion here therefore runs with JS
 * disabled: if the content is not in the HTML the server sent, it does not
 * exist as far as a crawler is concerned, no matter how well the page works
 * in a browser.
 *
 * This suite exists because two real bugs got through everything else:
 *
 * 1. `publicGraphql` used a relative URL. Fine in a browser, "Failed to parse
 *    URL" during SSR — the render fell into the error boundary and shipped an
 *    empty page. Unit tests mock fetch, so nothing else could see it.
 *
 * 2. The directory lived at `routes/providers.tsx` next to
 *    `routes/providers.$slug.tsx`, which silently made it a LAYOUT for the
 *    detail route. Every `/providers/<slug>` URL rendered the directory
 *    listing instead of the provider — including for slugs that do not exist.
 *    Type-checks, lint, build and the whole unit suite were green throughout.
 */
// Serial: `beforeAll` runs once per worker, so parallel workers would each try
// to seed the same slugs. The fixture is idempotent as well, but pinning the
// file to one worker keeps the seeded state predictable for the assertions.
test.describe.configure({ mode: "serial" });

test.describe("public provider directory", () => {
  // No resetDb() here: globalSetup already resets once per run, and calling it
  // again from a spec would drop the schemas out from under the other specs
  // running in parallel. The slugs below are unique to this file, so seeding
  // without a reset cannot collide.
  test.beforeAll(async () => {
    await createProvider({ name: "Atlas Cleaning", slug: "atlas-cleaning", city: "Maputo" });
    await createProvider({ name: "Beira Plumbing", slug: "beira-plumbing", city: "Beira" });
  });

  test("lists active providers in the served HTML, with no session and no JavaScript", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    const response = await page.goto("/providers");

    expect(response?.status()).toBe(200);
    const html = await page.content();
    expect(html).toContain("Atlas Cleaning");
    expect(html).toContain("Beira Plumbing");
    // The error boundary's copy. Its presence means SSR threw and the page
    // shipped empty — the exact failure the relative-URL bug produced.
    expect(html).not.toContain("Something went wrong");
    await ctx.close();
  });

  test("a provider's own page renders its own content and its own title", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/providers/atlas-cleaning");

    const html = await page.content();
    expect(html).toContain("Atlas Cleaning");
    // The routing bug's signature: the sibling provider appearing here means
    // the directory listing rendered instead of the detail page.
    expect(html).not.toContain("Beira Plumbing");
    // A per-provider title is the whole point of a page built to rank; the
    // root's bare "Ntizo" would mean the detail route never ran its own head.
    await expect(page).toHaveTitle(/Atlas Cleaning/);
    await ctx.close();
  });

  test("an unknown slug says so, and leaks no other provider", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/providers/no-such-provider");

    const html = await page.content();
    expect(html).toContain("Provider not found");
    expect(html).not.toContain("Atlas Cleaning");
    expect(html).not.toContain("Beira Plumbing");
    await ctx.close();
  });

  test("a deactivated provider is indistinguishable from a missing one", async ({ browser }) => {
    await createProvider({
      name: "Gone Services",
      slug: "gone-services",
      city: "Nampula",
      status: "inactive",
    });

    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/providers/gone-services");

    const html = await page.content();
    // Telling "deactivated" apart from "never existed" would let anyone
    // enumerate which businesses exist but are hidden.
    expect(html).toContain("Provider not found");
    expect(html).not.toContain("Gone Services");

    const listPage = await ctx.newPage();
    await listPage.goto("/providers");
    expect(await listPage.content()).not.toContain("Gone Services");
    await ctx.close();
  });
});
