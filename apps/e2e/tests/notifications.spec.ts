import { test, expect } from "@playwright/test";
import { createVerifiedUser } from "../fixtures/auth";
import { sql } from "../fixtures/db";
import { fillSignInForm } from "../fixtures/ui";

/**
 * The one seam no unit test observes: a real sign-up, a real transaction, a
 * real commit, and a notification that only exists if `runAfterCommit` fired
 * and the router had a handler registered. Everything either side of that
 * seam is covered in isolation; this is the proof they are joined.
 *
 * `createVerifiedUser` (fixtures/auth.ts) is what every other spec in this
 * suite reaches for to get "a real sign-up through the real
 * POST /api/auth/sign-up/email, verified without a mailbox to click through"
 * — see its own doc comment for why a direct DB insert would skip the very
 * path (`CreateUserOnSignUpInternalCommand` inside better-auth's
 * `user.create.after` hook) this test exists to exercise. There is no
 * `signUpAndVerify` export in fixtures/auth.ts to reach for instead.
 */
test("registering produces a welcome in the new user's inbox", async ({ page }) => {
  const user = await createVerifiedUser(undefined, { firstName: "Ana", lastName: "Registrant" });

  await page.goto("/sign-in");
  await fillSignInForm(page, user);
  // A brand-new customer owns no provider and holds no elevated role, so
  // resolvePostLoginDestination sends them to "/" (see auth.spec.ts).
  await page.waitForURL("http://localhost:3000/");

  await page.goto("/account/notifications");

  await expect(page.getByRole("heading", { name: /notifications/i })).toBeVisible();
  // This text exists only if the whole chain fired: the outbox row published
  // inside CreateUserOnSignUpInternalCommand's transaction, runAfterCommit
  // dispatched it after commit, the in-process EventRouter had
  // "user.registered" registered (registerUserNotificationHandlers), and
  // that handler's RaiseNotificationInternalCommand actually wrote a row.
  await expect(page.getByText(/welcome to ntizo/i)).toBeVisible();
});

test("marking it read clears the badge", async ({ page }) => {
  const user = await createVerifiedUser(undefined, { firstName: "Ana", lastName: "Registrant" });

  await page.goto("/sign-in");
  await fillSignInForm(page, user);
  await page.waitForURL("http://localhost:3000/");

  await page.goto("/account/notifications");

  // NotificationCell (features/notifications/ui/notification-cell.tsx) renders
  // the whole row as one <button> — "marking read is the only thing it does" —
  // and that button carries the unread border directly
  // (`border-transparent` vs `border-[var(--color-primary)]`); the <li> around
  // it carries no class attribute at all, read or unread.
  //
  // `getByRole("listitem").first()` (this task's brief, verbatim) does not
  // reach this row: the account sidebar rendered on the very same page has
  // its own <li> items — down to a literal `listitem: button "Sign out"` —
  // and comes first in DOM order, so `.first()` resolves to the sidebar's
  // "My profile" link item, whose `getByRole("button")` then legitimately
  // finds nothing. Confirmed empirically: that exact locator failed with
  // "element(s) not found" against the real page, not a class mismatch.
  // Matching on this row's own accessible name sidesteps the ambiguity
  // instead of guessing an index into a list shared with unrelated UI.
  const row = page.getByRole("button", { name: /welcome to ntizo/i });

  // Asserted present before the click, not just absent after: a negative
  // assertion with nothing to negate is true from first render, and would
  // keep passing forever — proving nothing — if the unread styling ever
  // moved to a different class or a `data-read` attribute. `useMarkRead`
  // does no optimistic update, so this row is the only end-to-end proof the
  // server state actually changed.
  await expect(row).toHaveClass(/border-\[var\(--color-primary\)\]/);

  await row.click();

  // The dot is gone from the row, which is the assertion that survives a
  // refactor of the badge's polling interval.
  await expect(row).not.toHaveClass(/border-\[var\(--color-primary\)\]/);
});

/**
 * The other half of that seam: the email.
 *
 * Everything about delivery is otherwise proven with fakes — a fake sender, a
 * fake clock, an in-memory repository. This is the only place the whole chain
 * runs against a real Worker and a real Postgres: sign-up commits,
 * `runAfterCommit` dispatches `user.registered`, the handler raises, and the
 * deferring adapter hands the actual send to `waitUntil`.
 *
 * **Polled, not asserted once.** Under `wrangler dev` there IS an execution
 * context, so `infraStore.waitUntil` really does hand the work to the
 * platform and it finishes AFTER the response to sign-up has been written.
 * (Outside a Worker there is none, and `settleDeferredWork()` drains it inside
 * the request instead — same row, different moment. Polling is what covers
 * both without encoding either.) A single SELECT here would be a race the
 * harness would lose often enough to look like flake and rarely enough to
 * look like a bug.
 *
 * **Why exactly one row, `sent`, with no provider message id.** One row
 * because `audience: "user"` resolves to a single recipient — the workspace
 * fan-out that produces one delivery per member is a different audience.
 * `sent` because this harness sets no `RESEND_API_KEY` and `STAGE` stays at
 * wrangler.jsonc's `"local"`, so `resolveEmailService()` picks the console
 * adapter, which prints the message and reports success. Its `messageId` is
 * `null` — a real fact about a sender that hands back no reference, which
 * `DeliverNotificationInternalCommand` stores unmodified rather than papering
 * over with `""`. Asserting the whole row in one poll rather than counting
 * first and reading second keeps it a single observation: a second query
 * could see a different row than the one the count matched.
 *
 * The address is the one `createVerifiedUser` generated, not one this test
 * chose. The fixture returns it, and `notification_delivery.to_email` is
 * whatever `ntizo_user.user.email` holds — passing an address in would add a
 * parameter to the fixture that tells this assertion nothing extra.
 *
 * No `resetDb()` here, deliberately: `globalSetup` resets once, and a second
 * reset would drop the schemas out from under every spec running in parallel.
 * Every row this reads is scoped to its own freshly-generated address anyway.
 */
test("registering also records the email it queued, per attempt", async ({ page }) => {
  const user = await createVerifiedUser(undefined, { firstName: "Ana", lastName: "Registrant" });

  await page.goto("/sign-in");
  await fillSignInForm(page, user);
  await page.waitForURL("http://localhost:3000/");

  await expect
    .poll(
      async () => {
        const rows = await sql()<{ status: string; provider_message_id: string | null }[]>`
          SELECT status, provider_message_id
          FROM ntizo_notification.notification_delivery
          WHERE to_email = ${user.email}`;
        return rows.map((r) => `${r.status}/${r.provider_message_id ?? "no-message-id"}`);
      },
      { timeout: 15_000, message: "expected exactly one delivery row for the new user" },
    )
    .toEqual(["sent/no-message-id"]);
});
