import { test, expect } from "@playwright/test";
import { createVerifiedUser } from "../fixtures/auth";
import { fillSignInForm } from "../fixtures/ui";

/**
 * Rewritten 2026-08-23. It used to sign a customer in and assert that a
 * "Switch view" pill offered them no Provider or Admin link. That pill was
 * deleted in `ac746e4` ("registering as a provider is an application, not a
 * launch") and switching workspace moved into the sidebar's own user menu —
 * so BOTH of the old assertions had become unfailable: they checked that
 * elements which exist for nobody were absent for a customer, and would have
 * passed just as happily for a provider.
 *
 * The guarantee is still real, but it is now enforced by a redirect rather
 * than by hiding a link: a customer with no provider who asks for /provider
 * is sent to the onboarding wizard instead of into somebody's dashboard.
 * That is what this asserts, because that is what would actually break.
 */
test("a customer asking for the provider zone is sent to onboarding, not into it", async ({
  page,
}) => {
  const customer = await createVerifiedUser();
  await page.goto("/sign-in");
  await fillSignInForm(page, customer);
  await page.waitForURL("http://localhost:3000/");

  await page.goto("/provider");
  await page.waitForURL(/\/onboarding/);

  // Not merely "somewhere else" — specifically not inside a workspace. A
  // regression that sent them to some other provider's overview would still
  // satisfy a bare "did not stay on /provider".
  expect(page.url()).not.toMatch(/\/provider\/[^/]+\/(overview|members|settings)/);
});

test("/admin bounces a non-admin to the landing page", async ({ page }) => {
  const customer = await createVerifiedUser();
  await page.goto("/sign-in");
  await fillSignInForm(page, customer);
  await page.waitForURL("http://localhost:3000/");

  await page.goto("/admin");
  await page.waitForURL("http://localhost:3000/");
  await expect(page.getByText("Find it.")).toBeVisible();
});

// The role read here is ntizo_user.user.role, never better_auth.user.role —
// createVerifiedUser("admin") only ever sets the former (see its doc
// comment), so this specifically exercises the column the guard is
// supposed to read, not the one that happens to also say "customer".
test("/admin admits an admin", async ({ page }) => {
  const admin = await createVerifiedUser("admin");
  await page.goto("/sign-in");
  await fillSignInForm(page, admin);
  await page.waitForURL(/\/admin/);

  await page.goto("/admin");
  await page.waitForURL(/\/admin\/dashboard/);
  await expect(page.getByRole("heading", { name: "Ntizo Admin Dashboard" })).toBeVisible();
});
