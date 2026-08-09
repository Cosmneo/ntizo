import { test, expect } from "@playwright/test";
import { createVerifiedUser } from "../fixtures/auth";
import { fillSignInForm } from "../fixtures/ui";

test("a customer does not see the Provider or Admin zone links", async ({ page }) => {
  const customer = await createVerifiedUser();
  await page.goto("/sign-in");
  await fillSignInForm(page, customer);
  await page.waitForURL("http://localhost:3000/");

  // The zone switcher only lives inside the provider/admin shells. Any
  // authenticated user may reach /provider/no-provider (becoming a
  // provider is opt-in, not gated), so it's a real, always-reachable page
  // to read the switcher's actual contents off of for a plain customer.
  await page.goto("/provider");
  await page.waitForURL(/\/provider\/no-provider/);

  const zoneNav = page.getByRole("navigation", { name: "Zone switcher" });
  await expect(zoneNav.getByRole("link", { name: "Landing" })).toBeVisible();
  await expect(zoneNav.getByRole("link", { name: "Provider" })).toHaveCount(0);
  await expect(zoneNav.getByRole("link", { name: "Admin" })).toHaveCount(0);
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
