import { test, expect } from "@playwright/test";

// Task 3's only spec: prove the harness itself — both real servers started
// against the throwaway database, a real browser driving the real web app.
// The real test suite is Task 4's job, not this file's.
test("landing page renders the hero", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("THIS TEXT DOES NOT EXIST ON THE PAGE")).toBeVisible();
});
