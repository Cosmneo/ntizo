import { test, expect } from "@playwright/test";
import { createVerifiedUser, verifyUserByEmail } from "../fixtures/auth";
import { createProvider } from "../fixtures/provider";
import { fillSignInForm, signOutViaSidebar } from "../fixtures/ui";

test("sign up, verify, sign in, and land on the right zone", async ({ page }) => {
  const email = `e2e-ui-signup-${crypto.randomUUID()}@example.test`;
  const password = "Password123!";

  await page.goto("/sign-up");
  await page.getByLabel("First name").fill("Signup");
  await page.getByLabel("Last name").fill("Flow");
  await page.getByLabel("Email", { exact: true }).fill(email);
  // National digits only — the country selector supplies the +258, and the
  // field is required, so omitting it blocks submission at the browser's own
  // validation and the form never reaches the API.
  await page.getByLabel("Mobile number").fill("841234567");
  await page.getByLabel("Password", { exact: true }).fill(password);
  // Required, and validated again on submit. Leaving it unticked blocks the
  // form at the browser's own validation, so the page simply never changes —
  // which is how this spec failed silently once the checkbox was added.
  await page.getByRole("checkbox", { name: /i accept/i }).check();
  await page.getByRole("button", { name: /create account/i }).click();

  // The real POST /api/auth/sign-up/email round-trip completed and the form
  // swapped to the "check your email" view — proves sign-up itself (not
  // just the fixture's own copy of this call) reaches the real API.
  await expect(page.getByText("Check your email")).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  // No mailbox this browser can drive — flip verified the same way
  // createVerifiedUser does (see its doc comment) and continue as a plain
  // customer (no role passed, matching what a real signup produces).
  await verifyUserByEmail(email);

  // "Back to sign in" — the link on the check-your-email view, not the
  // "Sign in" one at the foot of the form, which this view has replaced.
  await page.getByRole("link", { name: /back to sign in/i }).click();
  await page.waitForURL(/\/sign-in/);
  await fillSignInForm(page, { email, password });

  // A brand-new customer owns no providers and holds no elevated role, so
  // resolvePostLoginDestination sends them to "/" — the landing page, the
  // only zone a plain customer can reach.
  await page.waitForURL("http://localhost:3000/");
  await expect(page.getByText("Find it.")).toBeVisible();
});

test("signing in as a different user shows that user's session, not the previous one's", async ({
  page,
}) => {
  const admin = await createVerifiedUser("admin", { firstName: "Ada", lastName: "Admin" });
  const providerOwner = await createVerifiedUser(undefined, { firstName: "Pia", lastName: "Provider" });

  // Give providerOwner a provider *before* the leak-sensitive part of this
  // test. This test is about session isolation, not about the wizard, so the
  // provider is seeded directly rather than driven through the UI — that
  // also keeps this spec decoupled from provider.spec.ts, which owns
  // exercising the create flow itself.
  await createProvider({
    name: "Pia's Services",
    slug: `pias-services-${crypto.randomUUID()}`,
    ownerUserId: providerOwner.id,
  });

  // Everything from here on reuses ONE page/context with no hard
  // navigation, so the SPA's in-memory QueryClient singleton — where the
  // leak this test exists to catch actually lived — survives the whole
  // sign-out/sign-in cycle, the same as a real user's browser tab would.
  await page.goto("/sign-in");
  await fillSignInForm(page, admin);
  await page.waitForURL(/\/admin/);

  // The admin's own name, not the previous user's — the whole point of this
  // test. Admin is not a segment in the pill any more; it is reached from the
  // account menu, so only the identity assertion belongs here.
  await expect(page.locator('[data-sidebar="menu-button"]').filter({ hasText: admin.name })).toBeVisible();

  await signOutViaSidebar(page, admin.name);
  await page.waitForURL(/\/sign-in/);

  await fillSignInForm(page, providerOwner);
  await page.waitForURL(/\/provider/);

  // The regression: without a full page reload in between, a stale
  // QueryClient entry from `admin`'s session could still be sitting in
  // cache under the same query keys `providerOwner`'s hooks now read.
  await expect(
    page.locator('[data-sidebar="menu-button"]').filter({ hasText: providerOwner.name }),
  ).toBeVisible();
  await expect(page.getByText(admin.name)).toHaveCount(0);

  // This user owns a provider, so the pill has somewhere to switch to and
  // renders both segments. Admin is not one of them for anybody.
  const providerZoneNav = page.getByRole("navigation", { name: "Switch view" });
  await expect(providerZoneNav.getByRole("link", { name: "Provider" })).toBeVisible();
  await expect(providerZoneNav.getByRole("link", { name: "Customer" })).toBeVisible();
  await expect(providerZoneNav.getByRole("link", { name: "Admin" })).toHaveCount(0);
});
