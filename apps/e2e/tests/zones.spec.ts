import { test, expect } from "@playwright/test";
import { createVerifiedUser } from "../fixtures/auth";
import { fillSignInForm } from "../fixtures/ui";

test("a customer does not see the Provider or Admin zone links", async ({ page }) => {
  const customer = await createVerifiedUser();
  await page.goto("/sign-in");
  await fillSignInForm(page, customer);
  await page.waitForURL("http://localhost:3000/");

  // /account, not /provider: a plain customer visiting /provider is now
  // redirected to /onboarding, which deliberately renders no navigation
  // chrome at all — the assertions below would pass there for the wrong
  // reason (no header, not "no zones"). /account renders CustomerShell's
  // SiteHeader, is authenticated, and any customer can always reach it, so
  // it is a real, always-reachable page to read the switcher off.
  await page.goto("/account");
  await page.waitForURL(/\/account/);

  // No switcher at all, not a switcher with one entry. A customer who owns no
  // provider has nowhere to switch to, and a lone "Customer" pill would imply
  // a choice that does not exist. Admin is never a segment for anyone; it
  // lives in the account menu.
  await expect(page.getByRole("navigation", { name: "Switch view" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Provider dashboard" })).toHaveCount(0);
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
