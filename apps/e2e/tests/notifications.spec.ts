import { test, expect } from "@playwright/test";
import { createVerifiedUser } from "../fixtures/auth";
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
  await row.click();

  // The dot is gone from the row, which is the assertion that survives a
  // refactor of the badge's polling interval.
  await expect(row).not.toHaveClass(/border-\[var\(--color-primary\)\]/);
});
