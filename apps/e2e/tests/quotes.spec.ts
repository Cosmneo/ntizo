import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";
import { createVerifiedUser, type VerifiedUser } from "../fixtures/auth";
import { fillSignInForm } from "../fixtures/ui";
import { seedQuoteService, QUOTE_SERVICE_NAME } from "../fixtures/quote";

/**
 * Task 14 of the quotes-web plan: proving the thirteen tasks' screens
 * actually join up, in a real browser, against a real database — the thing
 * thirteen rounds of unit tests, each proving one screen correct in
 * isolation, cannot see.
 *
 * **The entry point, closed.** `docs/superpowers/sdd/2026-09-07-quotes-web/task-6-brief.md`
 * specced "the entry points — the button finally goes somewhere": the browse
 * row's and the service page's own "Pedir orçamento"/"Ask for a quote" wired
 * to `/quote/$serviceId`. Task 14 first landed with that task still missing
 * — `service-quote-notice.tsx` and `service-row.tsx` were exactly the
 * pre-Task-6 shape, and the first test below pinned it as a passing
 * assertion precisely so that the day Task 6 shipped, this file would go red
 * and force whoever landed it to notice. Task 6 landed (`b8ae2e0f`) and
 * nobody came back until this branch's whole-review fix wave did: the first
 * test below now proves the link exists and reaches the request page by
 * clicking it, the same way a customer would, rather than by `page.goto`.
 *
 * Every test after the first still reaches `/quote/$serviceId` by
 * `page.goto`, now a plain convenience rather than a bypass of a real gap:
 * the first test already proves the click path works, and the tasks
 * *downstream* of the entry point (the request form, the customer's list
 * and detail, the provider's queue and proposal form, the acceptance page,
 * and the two closing paths) are what the rest of this file exists to prove.
 *
 * **A second, more severe finding, fixed rather than merely reported.**
 * Reaching "Accept and pay …" from a live proposal changed the URL to
 * `/quotes/$quoteId/accept` but left the *detail* page's own content on
 * screen — no error, no console warning, nothing to notice by. Unlike the
 * entry-point gap above, this one had no working bypass at all: a fresh
 * `page.goto` straight at the same URL reproduced the identical wrong
 * content, confirmed empirically before the fix below, so there was no
 * "reach the acceptance page" this file could honestly perform without
 * fixing it. The cause and the fix are the exact ones `bookings.index.tsx`'s
 * own doc comment already names for the identical shape elsewhere in this
 * app: `quotes.$quoteId.tsx` (bare) was TanStack Router's *layout* for its
 * own `accept` child the moment that child existed, and rendered no
 * `<Outlet />` for it. Renamed to `quotes.$quoteId.index.tsx` — see that
 * file's own doc comment for the full mechanism. Reported prominently in
 * this branch's Task 14 report, as instructed, rather than silently folded
 * into this file's own history.
 *
 * **Payment is out of scope, on purpose**, the same call
 * `customer-bookings.spec.ts` makes for the identical reason: accepting a
 * proposal triggers a real M-Pesa STK prompt to a real handset, and nothing
 * in this harness can drive the sandbox's other side. Every test here stops
 * the moment `/quotes/$quoteId/accept` is reached and confirmed correct —
 * never clicking "Accept and pay …".
 *
 * No explicit cleanup: like `provider.spec.ts`, `customer-bookings.spec.ts`
 * and `console-mobile.spec.ts`, this file's rows live in the throwaway
 * database for the rest of the run, which `global-setup.ts` rebuilds from
 * zero on the next one. `messaging.spec.ts`'s own cleanup exists for a
 * `communication`-specific foreign key this suite never touches.
 *
 * Screenshots land in `apps/e2e/screenshots/` (created by this file if
 * absent) — a new location, since no earlier spec captured any; nothing in
 * this repo's `.gitignore` excludes it, so these are meant to be committed
 * alongside the spec, the same way `docs/superpowers/specs/*.mockup.html`
 * and the plan's own diffs live in git.
 */

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, "../screenshots");
mkdirSync(SCREENSHOT_DIR, { recursive: true });

/** The proposal this file always sends: 9,800.00 MZN, three days out, two hours. */
const PROPOSAL_PRICE_MINOR = 980_000;
const PROPOSAL_DURATION_HOURS = "2";
const PROPOSAL_TIME = "10:00";

/**
 * `formatMoney(PROPOSAL_PRICE_MINOR, "MZN", "en-US")`'s own output — reached
 * for through the browser under test, not precomputed in this file's own
 * Node process. `messaging.spec.ts`'s raw GraphQL query is declared inline
 * because this package has no dependency on the frontend app's `src`, and
 * the same reasoning applies here to the *formatter*, not just to the
 * result: Playwright's test workers run under plain Node
 * (`messaging.spec.ts`'s own doc comment), which bundles its own ICU data —
 * not necessarily the same version Chromium ships — so a string computed
 * here and one rendered there are not guaranteed to agree for a currency as
 * obscure to most locale data as MZN. Running the identical
 * `Intl.NumberFormat` call *inside* the page removes that risk entirely.
 */
async function expectedPrice(page: Page): Promise<string> {
  return page.evaluate(
    (minor) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "MZN",
        minimumFractionDigits: 2,
      }).format(minor / 100),
    PROPOSAL_PRICE_MINOR,
  );
}

/**
 * The customer detail page's own big display number — whole units, no
 * currency (`quote-page.tsx`'s `priceAmount`, a second, separate formatting
 * of the same amount from `formatMoney`'s own). Reached for the same way and
 * for the same reason as `expectedPrice`.
 */
async function expectedPriceAmount(page: Page): Promise<string> {
  return page.evaluate(
    (minor) =>
      // `true`, not the string literal `"always"` the app's own
      // `quote-page.tsx` passes: this package's `tsconfig` targets an older
      // `Intl.NumberFormatOptions` (`useGrouping?: boolean`) than the web
      // app's does, and both produce the identical grouped output for a
      // plain positive amount like this one.
      new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, useGrouping: true }).format(
        minor / 100,
      ),
    PROPOSAL_PRICE_MINOR,
  );
}

/** Three days out — far enough that no slow CI run crosses it mid-test, the same margin `booking.ts` gives its own seeded slot. */
function proposalDateString(): string {
  return new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function signIn(page: Page, user: VerifiedUser, expectedUrl: string | RegExp): Promise<void> {
  await page.goto("/sign-in");
  await fillSignInForm(page, user);
  await page.waitForURL(expectedUrl);
}

async function scrollOverflowAt390(page: Page): Promise<number> {
  await page.setViewportSize(MOBILE);
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/**
 * Screenshots the current page at both required widths and pins, at 390px,
 * that it does not scroll sideways — item 4 of this task's own brief,
 * checked on every screen this function is asked to capture. Leaves the
 * page at `DESKTOP` afterwards: every row/table assertion in this file
 * needs the desktop layout (`CollectionCard`'s own `hidden md:block` table
 * only renders from that breakpoint up).
 *
 * **Known, unresolved caveat: `provider-queue-390.png` specifically.** On
 * this one capture, the card's own label/value rows (Service/Status/Price)
 * intermittently save as visually blank underneath their own labels. This is
 * a capture-time artifact, not a rendering defect — confirmed repeatedly, at
 * the exact moment of the shot, that the live DOM and its computed layout
 * are correct (`innerHTML`, `getComputedStyle`, `boundingBox()` all read
 * back exactly what the 1440px capture and the desktop table both show).
 * None of the fixes tried made it reliably go away: dropping `fullPage`,
 * an extra animation frame, a 500ms wait, a forced scroll reflow, a hard
 * `page.reload()`, and moving `atExtra` (the phone tab-bar's own menu-sheet
 * check) to run after this function's own screenshots rather than before —
 * all tried, none conclusive; the failure recurs even on a completely bare
 * `page.goto` → assert → screenshot sequence with no prior interaction at
 * all, in this run's environment specifically. Reported as a caveat in this
 * branch's Task 14 report rather than chased further — see that report for
 * the full account.
 */
async function captureScreens(page: Page, name: string, atExtra?: () => Promise<void>): Promise<void> {
  await page.setViewportSize(DESKTOP);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-1440.png`) });

  const overflow = await scrollOverflowAt390(page);
  expect(
    overflow,
    `${name} scrolls horizontally at 390px (scrollWidth exceeds innerWidth by ${overflow}px)`,
  ).toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-390.png`) });
  if (atExtra) await atExtra();

  await page.setViewportSize(DESKTOP);
}

/** The same 390px check as `captureScreens`, for a screen this file visits but is not asked to screenshot. */
async function assertNoHorizontalScrollAt390(page: Page): Promise<void> {
  const overflow = await scrollOverflowAt390(page);
  expect(
    overflow,
    `page scrolls horizontally at 390px (scrollWidth exceeds innerWidth by ${overflow}px)`,
  ).toBeLessThanOrEqual(0);
  await page.setViewportSize(DESKTOP);
}

/**
 * The finding this whole file was originally built around, now the proof
 * that it closed: the one control `task-6-brief.md` specced for this exact
 * panel — "Ask for a quote", linking to `/quote/$serviceId` — is on screen,
 * and clicking it, the way a customer actually would, lands on the request
 * page. Messaging keeps its place underneath, unchanged.
 */
test("the service page's quote panel offers a way into the request page", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const customer = await createVerifiedUser(undefined, { firstName: "Gita", lastName: "Gapcheck" });
  const { serviceId } = await seedQuoteService();

  await signIn(page, customer, "http://localhost:3000/");

  await page.goto(`/services/${serviceId}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: QUOTE_SERVICE_NAME })).toBeVisible();

  const quoteLink = page.getByRole("link", { name: "Ask for a quote" });
  await expect(quoteLink).toBeVisible();
  await expect(quoteLink).toHaveAttribute("href", `/quote/${serviceId}`);
  // Messaging is still offered, demoted to text underneath the primary action.
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();

  await quoteLink.click();
  await page.waitForURL(new RegExp(`/quote/${serviceId}$`));
  await expect(page.getByRole("heading", { name: "Ask for a quote" })).toBeVisible();
});

test("a customer requests a quote, the provider proposes a price, and the customer reaches the acceptance page", async ({
  browser,
}) => {
  const customer = await createVerifiedUser(undefined, { firstName: "Cora", lastName: "Client" });
  const { serviceId, providerSlug, owner } = await seedQuoteService();

  const customerCtx = await browser.newContext();
  const providerCtx = await browser.newContext();

  try {
    const customerPage = await customerCtx.newPage();
    await customerPage.setViewportSize(DESKTOP);
    // A brand-new customer owns no provider, so `resolvePostLoginDestination`
    // sends them to "/" — see `messaging.spec.ts`'s identical note.
    await signIn(customerPage, customer, "http://localhost:3000/");

    // ── The request, reached the way a customer actually would: from the ────
    // ── service page's own quote panel, not a direct `page.goto` — see this ─
    // ── file's own top-of-file note and the first test above. ───────────────
    await customerPage.goto(`/services/${serviceId}`);
    await customerPage.waitForLoadState("networkidle");
    await customerPage.getByRole("link", { name: "Ask for a quote" }).click();
    await customerPage.waitForURL(new RegExp(`/quote/${serviceId}$`));
    await expect(customerPage.getByRole("heading", { name: "Ask for a quote" })).toBeVisible();
    const description =
      "The AC in the living room stopped cooling and makes a rattling noise. Please take a look and give me a quote.";
    await captureScreens(customerPage, "quote-request");

    await customerPage.getByLabel("What you need", { exact: true }).fill(description);
    await customerPage.getByRole("button", { name: "Send request" }).click();
    await customerPage.waitForURL(/\/quotes\/[^/]+$/);
    const quoteId = new URL(customerPage.url()).pathname.split("/").pop()!;

    // ── /quotes shows it as awaiting a proposal. ────────────────────────────
    await expect(customerPage.getByText("Waiting for a proposal")).toBeVisible();
    await customerPage.goto("/quotes");
    await customerPage.waitForLoadState("networkidle");
    const openRow = customerPage.getByRole("row", { name: new RegExp(QUOTE_SERVICE_NAME) });
    await expect(openRow).toBeVisible();
    await expect(openRow.getByText("Waiting for a proposal")).toBeVisible();

    // ── The provider's console: the sidebar item, its count, the queue. ────
    const providerPage = await providerCtx.newPage();
    await providerPage.setViewportSize(DESKTOP);
    await signIn(providerPage, owner, /\/provider\/[^/]+\/overview/);

    await providerPage.goto(`/provider/${providerSlug}/quotes`);
    await providerPage.waitForLoadState("networkidle");

    const sidebarQuotesLink = providerPage
      .locator('[data-slot="sidebar"]')
      .getByRole("link", { name: /Quotes/ });
    await expect(sidebarQuotesLink).toBeVisible();
    await expect(sidebarQuotesLink).toContainText("1");

    await expect(providerPage.getByRole("tab", { name: "To answer" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const toAnswerRow = providerPage.getByRole("row", { name: new RegExp(QUOTE_SERVICE_NAME) });
    await expect(toAnswerRow).toBeVisible();
    await expect(toAnswerRow.getByText("Cora")).toBeVisible();

    await captureScreens(providerPage, "provider-queue", async () => {
      // The phone's tab bar: three primaries plus Menu, and Availability
      // relocated to the sheet rather than dropped — `console-nav.ts`'s own
      // `WORKSPACE.work` marks bookings/quotes/messages `primary: true` and
      // leaves availability out of that set.
      const bar = providerPage.getByRole("navigation", { name: "Main navigation" });
      await expect(bar).toBeVisible();
      await expect(bar.getByRole("link")).toHaveCount(3);
      await expect(bar.getByRole("link", { name: /Bookings/ })).toBeVisible();
      await expect(bar.getByRole("link", { name: /Quotes/ })).toBeVisible();
      await expect(bar.getByRole("link", { name: /Messages/ })).toBeVisible();
      await expect(bar.getByRole("button", { name: "Menu" })).toBeVisible();

      await bar.getByRole("button", { name: "Menu" }).click();
      const sheet = providerPage.getByRole("dialog", { name: "Menu" });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("link", { name: /Availability/ })).toBeVisible();
      await providerPage.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    });

    // ── The provider answers with a price, a date, a time and a duration. ──
    await toAnswerRow.getByRole("link", { name: "Cora" }).click();
    await providerPage.waitForURL(new RegExp(`/quotes/${quoteId}$`));
    await expect(providerPage.getByRole("heading", { name: "Your proposal" })).toBeVisible();
    await captureScreens(providerPage, "provider-quote-form");

    await providerPage.getByLabel("Price for the customer", { exact: true }).fill("9800");
    await providerPage.getByLabel("Date", { exact: true }).fill(proposalDateString());
    await providerPage.getByLabel("Time", { exact: true }).fill(PROPOSAL_TIME);
    await providerPage.getByLabel("Duration", { exact: true }).fill(PROPOSAL_DURATION_HOURS);
    await providerPage.getByRole("button", { name: "Send proposal" }).click();
    await expect(providerPage.getByRole("heading", { name: "Proposal sent" })).toBeVisible();
    const price = await expectedPrice(providerPage);
    await expect(providerPage.getByText(price)).toBeVisible();

    // ── The customer's row becomes "Proposal received", carrying the price. ─
    await customerPage.goto("/quotes");
    await customerPage.waitForLoadState("networkidle");
    const proposedRow = customerPage.getByRole("row", { name: new RegExp(QUOTE_SERVICE_NAME) });
    await expect(proposedRow).toBeVisible();
    await expect(proposedRow.getByText("Proposal received")).toBeVisible();
    await expect(proposedRow.getByText(price)).toBeVisible();

    // ── The customer opens it, sees the live proposal, and reaches ─────────
    // ── the acceptance page — stopping there; see this file's own note ─────
    // ── on why payment is out of scope. ─────────────────────────────────────
    await proposedRow.getByRole("link", { name: new RegExp(QUOTE_SERVICE_NAME) }).click();
    await customerPage.waitForURL(new RegExp(`/quotes/${quoteId}$`));
    // Scoped to the exact big display number, not a bare `getByText("Proposal
    // received")`: that string appears twice on this page — once in the
    // header's own status line, once again in the rail's "Where things
    // stand" progress list ("detail.stepProposed") — and a strict-mode
    // Playwright locator refuses to pick between them.
    await expect(
      customerPage.getByText(await expectedPriceAmount(customerPage), { exact: true }),
    ).toBeVisible();
    const acceptLink = customerPage.getByRole("link", { name: `Accept and pay ${price}` });
    await expect(acceptLink).toBeVisible();
    await captureScreens(customerPage, "quote-detail-proposal");

    await acceptLink.click();
    await customerPage.waitForURL(new RegExp(`/quotes/${quoteId}/accept$`));
    await expect(customerPage.getByRole("heading", { name: "Accept the proposal" })).toBeVisible();
    await expect(customerPage.getByLabel("M-Pesa number")).toBeVisible();
    await expect(
      customerPage.getByRole("button", { name: `Accept and pay ${price}` }),
    ).toBeVisible();
    await assertNoHorizontalScrollAt390(customerPage);
    // Not clicked — see this file's own top-of-file note on payment.
  } finally {
    await customerCtx.close();
    await providerCtx.close();
  }
});

/**
 * The refusal path, end to end: the provider declines with a reason, and the
 * customer sees that exact reason on their own detail page — a defect this
 * plan found and fixed once already (`544c3f2a`, "surface why a quote
 * closed"), which is why this file drives the real path rather than trusting
 * the fix from a unit test alone.
 */
test("a provider declines a quote, and the customer sees the reason", async ({ browser }) => {
  const customer = await createVerifiedUser(undefined, { firstName: "Deon", lastName: "Decline" });
  const { serviceId, providerSlug, owner } = await seedQuoteService();

  const customerCtx = await browser.newContext();
  const providerCtx = await browser.newContext();

  try {
    const customerPage = await customerCtx.newPage();
    await customerPage.setViewportSize(DESKTOP);
    await signIn(customerPage, customer, "http://localhost:3000/");

    // A direct `page.goto`, not a click-through: the first test in this file
    // and the main flow test above it already prove the entry point works,
    // so this test — about the decline path, not the entry point — reaches
    // the request page the plain way.
    await customerPage.goto(`/quote/${serviceId}`);
    await customerPage.waitForLoadState("networkidle");
    await customerPage
      .getByLabel("What you need", { exact: true })
      .fill("Need a quote to fix a leaking pipe under the kitchen sink.");
    await customerPage.getByRole("button", { name: "Send request" }).click();
    await customerPage.waitForURL(/\/quotes\/[^/]+$/);
    const quoteId = new URL(customerPage.url()).pathname.split("/").pop()!;

    const providerPage = await providerCtx.newPage();
    await providerPage.setViewportSize(DESKTOP);
    await signIn(providerPage, owner, /\/provider\/[^/]+\/overview/);
    await providerPage.goto(`/provider/${providerSlug}/quotes/${quoteId}`);
    await providerPage.waitForLoadState("networkidle");
    await expect(providerPage.getByRole("heading", { name: "Deon" })).toBeVisible();

    await providerPage.getByRole("button", { name: "Decline request" }).click();
    // `CloseQuoteDialog` sits on `@ntizo/frontend-ui`'s own `Dialog`
    // (`packages/frontend/src/components/dialog.tsx`) — a bespoke
    // implementation with no `role="dialog"`, no `aria-modal` and no
    // `aria-labelledby`, unlike the Sheet the console's own menu uses (see
    // the mobile-tab-bar check above, which finds one by role fine). Not
    // this branch's defect to fix — see this file's Task 14 report — so
    // this reaches the dialog's own content by its heading and its buttons
    // by position instead of by a landmark role that is not actually there.
    await expect(providerPage.getByRole("heading", { name: "Decline this request?" })).toBeVisible();
    await providerPage.getByRole("radio", { name: "I don't do this work" }).check();
    const note = "Sorry — this isn't a job we take on.";
    // Exact match: an unscoped substring match would also catch the
    // underlying (still-mounted) proposal form's "Note for the customer
    // (optional)" field.
    await providerPage.getByLabel("Note (optional)", { exact: true }).fill(note);
    // Two buttons now share the label "Decline request" — the trigger behind
    // the dialog and the dialog's own confirm button, appended after it in
    // DOM order. `.last()` is the dialog's — the same ambiguity and the same
    // fix `customer-bookings.spec.ts` already documents for "Cancelar
    // reserva".
    await providerPage.getByRole("button", { name: "Decline request" }).last().click();
    await expect(providerPage.getByRole("heading", { name: "Decline this request?" })).toBeHidden();
    await expect(providerPage.getByText("You declined")).toBeVisible();

    // ── The customer sees the reason — not just that it was declined. ──────
    await customerPage.goto(`/quotes/${quoteId}`);
    await customerPage.waitForLoadState("networkidle");
    await expect(customerPage.getByText("Declined by the provider")).toBeVisible();
    // `.first()`: the reason renders twice by design on this page — once in
    // the header's own clock line (`clock.customer.closedReason`, whose
    // template is bare `"{{reason}}"`) and again in the "Before this
    // proposal" history entry — both correct, so either is proof enough.
    await expect(customerPage.getByText("I don't do this work").first()).toBeVisible();
    await expect(customerPage.getByText(note)).toBeVisible();
    await assertNoHorizontalScrollAt390(customerPage);
  } finally {
    await customerCtx.close();
    await providerCtx.close();
  }
});
