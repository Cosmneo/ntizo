import { test, expect } from "@playwright/test";
import { createVerifiedUser } from "../fixtures/auth";
import { fillSignInForm } from "../fixtures/ui";

// This is the flow whose non-atomic write could leave an orphan invisible
// to its own creator: `providerCreate`'s owner-membership row and the
// frontend's own cache invalidation both have to land for the creator to
// ever see what they just made without a manual reload.
test("creating a provider makes it appear in its own creator's dashboard", async ({ page }) => {
  const owner = await createVerifiedUser();
  const providerName = `Test Services ${crypto.randomUUID().slice(0, 8)}`;

  await page.goto("/sign-in");
  await fillSignInForm(page, owner);
  await page.waitForURL("http://localhost:3000/"); // plain customer, no provider yet

  await page.goto("/provider");
  await page.waitForURL(/\/provider\/no-provider/);
  await page.getByRole("button", { name: /create manually/i }).click();
  await page.getByLabel("Name", { exact: true }).fill(providerName);
  await page.getByRole("button", { name: /^create$/i }).click();

  // Redirects straight to the dashboard with no manual reload — proves the
  // create mutation's own cache invalidation (useCreateProvider's
  // onSuccess) is what makes the provider visible to its own creator.
  await page.waitForURL(/\/provider\/overview/);
  await expect(page.getByText(providerName)).toBeVisible();

  // And a cold reload sees it too: this isn't only true of a still-warm
  // client cache — the server-side read (`providerMine`) itself reflects
  // the write a moment after `providerCreate` committed.
  await page.reload();
  await expect(page.getByText(providerName)).toBeVisible();
});
