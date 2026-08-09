import type { Page } from "@playwright/test";

/**
 * Fills and submits the real sign-in form. Assumes the caller is already on
 * `/sign-in` (either via `page.goto("/sign-in")` for a first navigation, or
 * because the app's own sign-out flow just client-side-navigated there) and
 * does not itself navigate or assert a destination — callers know (via
 * `resolvePostLoginDestination`) where a given user should land and should
 * assert that themselves.
 *
 * Deliberately never calls `page.goto("/sign-in")` itself: a spec proving
 * the query-cache stays scoped to the signed-in user across a sign-out +
 * sign-in cycle (auth.spec.ts) must keep reusing the same in-memory SPA —
 * `page.goto` is a hard navigation that would reset the very
 * `QueryClient` singleton the regression lives in, silently making the test
 * pass for the wrong reason.
 */
export async function fillSignInForm(
  page: Page,
  user: { email: string; password: string },
): Promise<void> {
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
}

/**
 * Opens the signed-in user's sidebar menu and clicks "Sign out". Both real
 * shells (`app-sidebar/sidebar-user-menu.tsx` for /provider,
 * `admin-sidebar/sidebar-user-menu.tsx` for /admin) render the trigger as a
 * plain `<button data-sidebar="menu-button">` with no shared accessible
 * role to hang a selector off (packages/frontend/src/components/sidebar.tsx),
 * so this matches on the trigger containing the current user's own visible
 * name — which also happens to be the assertion that matters here: the
 * button we click is provably *this* user's, not a leftover from whoever
 * was signed in before.
 */
export async function signOutViaSidebar(page: Page, currentUserName: string): Promise<void> {
  await page
    .locator('[data-sidebar="menu-button"]')
    .filter({ hasText: currentUserName })
    .click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();
}
