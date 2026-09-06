import { test, expect } from "@playwright/test";
import { createVerifiedUser } from "../fixtures/auth";
import { createProvider } from "../fixtures/provider";
import { fillSignInForm } from "../fixtures/ui";

// What the unit tests cannot say, because jsdom applies no CSS: that on a
// phone the bar is the thing you see and the hamburger is not.
test("@mobile the console carries its navigation in a bottom bar and a menu sheet", async ({ page }) => {
  const owner = await createVerifiedUser();
  const slug = `mobile-${crypto.randomUUID().slice(0, 8)}`;
  await createProvider({ name: "Mobile Console Co", slug, ownerUserId: owner.id });

  await page.goto("/sign-in");
  await fillSignInForm(page, owner);
  await page.waitForURL(/\/provider\//);

  await page.goto(`/provider/${slug}/services`);
  const bar = page.getByRole("navigation", { name: "Main navigation" });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("link", { name: "Messages" })).toBeVisible();
  await expect(page.locator('[data-sidebar="trigger"]')).toBeHidden();

  await bar.getByRole("button", { name: "Menu" }).click();
  const sheet = page.getByRole("dialog", { name: "Menu" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Settings" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(bar.getByRole("button", { name: "Menu" })).toBeFocused();
});
