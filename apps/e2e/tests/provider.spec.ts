import { test, expect } from "@playwright/test";
import { createVerifiedUser } from "../fixtures/auth";
import { fillSignInForm } from "../fixtures/ui";

// This is the flow whose non-atomic write could leave an orphan invisible
// to its own creator: `providerCreate`'s owner-membership row and the
// frontend's own cache invalidation both have to land for the creator to
// ever see what they just made without a manual reload.
//
// `/provider` now redirects a provider-less customer to the onboarding
// wizard (`ac746e4`, "registering as a provider is an application, not a
// launch") instead of the two-button scaffold this test used to drive, so
// creating a provider here means driving the wizard.
test("creating a provider makes it appear in its own creator's dashboard", async ({ page }) => {
  const owner = await createVerifiedUser();
  const providerName = `Test Services ${crypto.randomUUID().slice(0, 8)}`;

  await page.goto("/sign-in");
  await fillSignInForm(page, owner);
  await page.waitForURL("http://localhost:3000/"); // plain customer, no provider yet

  await page.goto("/provider");
  await page.waitForURL(/\/onboarding/);

  // Step "type": the only screen with no back button (screen-model.ts's
  // `previousStep` has nothing before it to return to).
  await page.getByRole("radio", { name: /on your own/i }).click();
  await page.getByRole("button", { name: /^continue$/i }).click();

  // Step "identity": the only required field is the name.
  await page.getByLabel("Name", { exact: true }).fill(providerName);
  await page.getByRole("button", { name: /^continue$/i }).click();

  // Step "location" is `CREATES_PROVIDER` (screen-model.ts): the provider row
  // is created the moment this step's Continue succeeds, not at the end of
  // the wizard. `validation.ts` only requires `country` and `city` here.
  //
  // The wizard does not stop at seven steps' worth of driving after this:
  // `media`, `payout`, `documents` and `review` all collect fields
  // `validation.ts` marks optional by design (payout and documents can both
  // follow the application), so nothing past this step is needed to reach a
  // real, working provider. Driving those screens anyway would only couple
  // this test to copy and upload widgets that can change for reasons that
  // have nothing to do with "does creating a provider work" — do not
  // "complete" this test by adding them back.
  await page.getByRole("button", { name: "Country", exact: true }).click();
  await page.getByPlaceholder("Search country").fill("Mozambique");
  await page.getByRole("option", { name: /mozambique/i }).click();
  await page.getByLabel("City", { exact: true }).fill("Maputo");
  await page.getByRole("button", { name: /^continue$/i }).click();

  // `useOnboarding`'s `submit()` does not navigate anywhere on success — it
  // moves the wizard on to the (skippable) "media" step, which only renders
  // once the provider row exists (its uploads are gated on membership). That
  // heading appearing is this test's proof the create mutation resolved,
  // before it acts on that in any way.
  await expect(
    page.getByRole("heading", { name: /show customers your work/i }),
  ).toBeVisible();

  // The wizard itself no longer redirects to the dashboard after creating —
  // that auto-navigate is exactly what the redirect-to-onboarding change
  // replaced — so this test reaches the dashboard the same way a real user
  // would from here: the "Already a provider?" link the wizard's footer
  // renders on every step. That is a client-side route change, not a fresh
  // `page.goto`/reload, so this still proves what the original assertion
  // proved: `useCreateProvider`'s own cache invalidation (its `onSuccess`) is
  // what makes the provider visible to its own creator, not a fresh load.
  await page.getByRole("link", { name: /go to the dashboard/i }).click();
  await page.waitForURL(/\/provider\/[^/]+\/overview/);
  await expect(page.getByText(providerName)).toBeVisible();

  // And a cold reload sees it too: this isn't only true of a still-warm
  // client cache — the server-side read (`providerMine`) itself reflects
  // the write a moment after `providerCreate` committed.
  await page.reload();
  await expect(page.getByText(providerName)).toBeVisible();
});
