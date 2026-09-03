import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createVerifiedUser, type VerifiedUser } from "../fixtures/auth";
import { fillSignInForm } from "../fixtures/ui";
import { sql } from "../fixtures/db";

/**
 * The seam no unit test can see: a real customer opening the Help Center on
 * a real page, writing a request, and a real administrator finding it in the
 * queue, answering, and resolving it — with the customer seeing the reply
 * come back into the same panel.
 *
 * Every layer underneath is already tested in isolation (the panel's screens,
 * the queue's rows, the repositories, and plan A's whole backend). What this
 * proves is the wiring between them: the mutation is mounted, the admin
 * queries are reachable to an admin and only to an admin, and the two sides
 * are looking at the same thread.
 *
 * Selectors are read off the real components, not guessed from copy:
 * `help-launcher.tsx` (`aria-label={t("launcher")}` → "Help"),
 * `help-home.tsx` (`actionMessage` → "Send a message", `actionRequests` →
 * "My requests"), `help-new-request.tsx` (`subjectLabel` → "Subject"),
 * `message-composer.tsx` (`composerLabel` → "Message body", `send` →
 * "Send"), `thread-view.tsx` (a message body renders as a `<p>`, so
 * `getByRole("paragraph")` finds it), `support-page.tsx` (a row's `primary`
 * is a `<Link>`, so `getByRole("link", { name: subject })` finds it),
 * `support-request-page.tsx` (`h1` is the subject alone, `supportResolve` →
 * "Mark as resolved", `supportStatus.resolved` → "Resolved"). All confirmed
 * against `en-US`'s locale files, the default this harness runs under.
 *
 * **`getByRole("link", …)` on the admin queue, not `getByText`.**
 * `CollectionCard` (`collection-card.tsx`) renders every row's `primary`
 * TWICE — once inside the desktop `<table>`, once inside the mobile
 * card list — toggled by a CSS breakpoint only, so both copies of the
 * `<Link>` are always in the DOM. `company.spec.ts` hit exactly this with
 * `getByText` and had to scope to `getByRole("table")` to avoid a strict-mode
 * violation. Verified here that `getByRole` does not need the same
 * workaround: Chromium's accessibility tree (which `getByRole` reads) excludes
 * a `display: none` subtree by construction, so at this project's Desktop
 * Chrome viewport (well past the `md` breakpoint) only the table's copy is
 * exposed — confirmed with a throwaway two-copy fixture before writing this
 * file, `getByRole("link", { name })` resolved to exactly one element where
 * `getByText` would have resolved to two.
 *
 * **The `ADMIN_ONLY` refusal rides under `extensions.originalCode`, not
 * `extensions.code`.** Traced through `@cosmneo/onion-lasagna`'s GraphQL
 * error mapping (`mapErrorToGraphQLError`): a `CodedError` (which
 * `ForbiddenError` is) always produces `{ code: <coarse kit classification>,
 * originalCode: error.code }`, and `getGraphQLErrorCode` maps every
 * `ForbiddenError` to the coarse code `"FORBIDDEN"` — the same shape
 * `messaging.spec.ts` already documents for `THREAD_NOT_VISIBLE`
 * (`{ code: "UNPROCESSABLE", originalCode: "THREAD_NOT_VISIBLE" }`) and the
 * frontend's own `GraphqlError` doc comment ("a forbidden read returns
 * `{ code: "FORBIDDEN", originalCode: "NOT_PROVIDER_MEMBER" }`"). So the
 * fine-grained `"ADMIN_ONLY"` `requireAdmin` throws
 * (`read/support/graphql/handlers/queries.handlers.ts`) is `originalCode`,
 * not `code`.
 *
 * **This file has not been executed.** The suite needs a throwaway Postgres
 * on `localhost:55432` (`fixtures/db.ts`) that this environment does not
 * have — no Docker, no Postgres binary, the port closed. Every selector
 * above was checked against the real component source and locale strings,
 * never against a running page. Run it (throwaway Postgres up, then
 * `bun run e2e -- help-center`) before trusting it, and — per this task's
 * own brief — comment out `<HelpCenter />` in `routes/__root.tsx` and
 * re-run once to confirm the first test actually fails at the launcher
 * rather than passing for an unrelated reason, then restore it.
 *
 * **Cleanup runs in `finally`, scoped by id.** Opening a request writes a
 * thread, a support_request and a message that no fixture inserted; the
 * notification rows raised for the admins are the same
 * (`OpenSupportRequestCommand.tellAdmins`, payload `{ threadId, subject,
 * requestAudience, … }`). Order: notification_delivery and notification
 * (matched by `payload->>'threadId'`, not cascaded from the thread), then
 * the thread (cascades to support_request and message per
 * `thread.schema.ts`), then both users in both schemas.
 */
async function signIn(page: Page, user: VerifiedUser, expectedUrl: string | RegExp): Promise<void> {
  await page.goto("/sign-in");
  await fillSignInForm(page, user);
  await page.waitForURL(expectedUrl);
}

async function cleanup(threadId: string | null, users: readonly VerifiedUser[]): Promise<void> {
  if (threadId) {
    await sql()`DELETE FROM ntizo_notification.notification_delivery WHERE notification_id IN (
      SELECT id FROM ntizo_notification.notification WHERE payload->>'threadId' = ${threadId})`.catch(
      (err) => console.error("[e2e] help-center cleanup: deliveries", err),
    );
    await sql()`DELETE FROM ntizo_notification.notification WHERE payload->>'threadId' = ${threadId}`.catch(
      (err) => console.error("[e2e] help-center cleanup: notifications", err),
    );
    // Cascades to support_request and message.
    await sql()`DELETE FROM ntizo_communication.thread WHERE id = ${threadId}`.catch((err) =>
      console.error("[e2e] help-center cleanup: thread", err),
    );
  }
  for (const user of users) {
    // Cascades to ntizo_user.profile (profile.schema.ts's onDelete: "cascade").
    await sql()`DELETE FROM ntizo_user."user" WHERE id = ${user.id}`.catch((err) =>
      console.error("[e2e] help-center cleanup: ntizo_user.user", err),
    );
    // Cascades to better_auth.session and better_auth.account.
    await sql()`DELETE FROM better_auth."user" WHERE id = ${user.id}`.catch((err) =>
      console.error("[e2e] help-center cleanup: better_auth.user", err),
    );
  }
}

test("a customer asks for help, and an administrator answers and closes it", async ({ browser }) => {
  const stamp = crypto.randomUUID().slice(0, 8);
  const subject = `Reembolso ${stamp}`;
  const question = `Paguei duas vezes (${stamp})`;
  const answer = `Já devolvemos o valor (${stamp})`;

  const customer = await createVerifiedUser(undefined, { firstName: "Cora", lastName: "Customer" });
  const admin = await createVerifiedUser("admin", { firstName: "Ada", lastName: "Admin" });

  let threadId: string | null = null;
  let customerCtx: BrowserContext | undefined;
  let adminCtx: BrowserContext | undefined;

  try {
    customerCtx = await browser.newContext();
    const customerPage = await customerCtx.newPage();
    // A brand-new customer owns no provider and holds no elevated role, so
    // resolvePostLoginDestination sends them to "/" — the one page
    // `showsHelpLauncher` always shows the launcher on (see auth.spec.ts /
    // messaging.spec.ts for the same redirect on the same shape of account).
    await signIn(customerPage, customer, "http://localhost:3000/");

    // The launcher, on an ordinary page.
    await customerPage.getByRole("button", { name: /help/i }).click();
    await expect(customerPage.getByRole("dialog")).toBeVisible();

    await customerPage.getByRole("button", { name: /send a message/i }).click();
    await customerPage.getByLabel(/subject/i).fill(subject);
    await customerPage.getByLabel("Message body", { exact: true }).fill(question);
    await customerPage.getByRole("button", { name: /^send$/i }).click();

    // The panel switches to the conversation it just created.
    await expect(customerPage.getByRole("paragraph").filter({ hasText: question })).toBeVisible();

    const rows = await sql()`
      SELECT t.id FROM ntizo_communication.thread t
      JOIN ntizo_communication.support_request r ON r.thread_id = t.id
      WHERE r.subject = ${subject}`;
    threadId = (rows[0] as { id: string } | undefined)?.id ?? null;
    expect(threadId).not.toBeNull();

    adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await signIn(adminPage, admin, /\/admin/);

    await adminPage.goto("/admin/support");
    // See this file's own doc comment: `getByRole` reads the accessibility
    // tree, which already excludes `CollectionCard`'s CSS-hidden mobile-card
    // copy of this same `<Link>` — no extra scoping needed here, unlike
    // `company.spec.ts`'s `getByText` case.
    await adminPage.getByRole("link", { name: new RegExp(subject) }).click();
    await expect(adminPage.getByRole("heading", { name: subject })).toBeVisible();
    await expect(adminPage.getByText(question)).toBeVisible();

    await adminPage.getByLabel("Message body", { exact: true }).fill(answer);
    await adminPage.getByRole("button", { name: /^send$/i }).click();
    await expect(adminPage.getByText(answer)).toBeVisible();

    await adminPage.getByRole("button", { name: /mark as resolved/i }).click();
    await expect(adminPage.getByText(/^resolved$/i)).toBeVisible();

    // Back on the customer's side: the reply is labelled as the platform's,
    // and the request now says resolved.
    await customerPage.reload();
    await customerPage.getByRole("button", { name: /help/i }).click();
    await customerPage.getByRole("button", { name: /my requests/i }).click();
    await customerPage.getByRole("button", { name: new RegExp(subject) }).click();
    await expect(customerPage.getByText(answer)).toBeVisible();
    await expect(customerPage.getByText("Ntizo Support")).toBeVisible();
  } finally {
    await cleanup(threadId, [customer, admin]);
    await customerCtx?.close();
    await adminCtx?.close();
  }
});

test("the support fields refuse a customer", async ({ page }) => {
  const customer = await createVerifiedUser(undefined, { firstName: "Cleo", lastName: "Curious" });
  try {
    await signIn(page, customer, "http://localhost:3000/");
    // The admin route redirects a non-admin away — the guard, not the field.
    await page.goto("/admin/support");
    await expect(page).not.toHaveURL(/\/admin\/support/);

    // And the field itself refuses, which is the check that matters: a
    // guard is a convenience, the resolver is the boundary.
    //
    // `content-type: application/json` on a POST is not one of the
    // CSRF-prevention plugin's "simple" (non-preflighted) content types
    // (`@graphql-yoga/plugin-csrf-prevention`'s own
    // `NON_PREFLIGHTED_CONTENT_TYPES`), so this request is already
    // preflight-protected without the `x-graphql-csrf` header
    // `session-graphql.ts` sends — reaching the resolver, and the
    // `ADMIN_ONLY` refusal, is exactly the point of this request.
    const refused = await page.evaluate(async () => {
      const res = await fetch("/graphql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query: "{ supportOpenCount(input: {}) { count } }" }),
      });
      return (await res.json()) as {
        errors?: { extensions?: { code?: string; originalCode?: string } }[];
      };
    });
    // See this file's own doc comment: a `ForbiddenError`'s fine-grained
    // code always rides under `originalCode`, never the coarse kit `code`
    // ("FORBIDDEN"), which is the same bucket every other authorization
    // failure in this app falls into.
    expect(refused.errors?.[0]?.extensions?.originalCode).toBe("ADMIN_ONLY");
  } finally {
    await cleanup(null, [customer]);
  }
});
