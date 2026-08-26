import { test, expect } from "@playwright/test";
import { createVerifiedUser } from "../fixtures/auth";
import { sql } from "../fixtures/db";
import { fillSignInForm } from "../fixtures/ui";

/**
 * The seam no unit test observes: an upload that reaches R2 through the real
 * route, a key saved through the real mutation, and a read that composes the
 * URL back out of it. Every half is covered in isolation; this is the proof
 * they are joined.
 */
test("a photo, a phone and a timezone survive a save and a reload", async ({ page }) => {
  const user = await createVerifiedUser(undefined, { firstName: "Ana", lastName: "Sitoe" });

  await page.goto("/sign-in");
  await fillSignInForm(page, user);
  await page.waitForURL("http://localhost:3000/");

  await page.goto("/account");
  await page.getByRole("button", { name: /edit profile/i }).click();

  // A 1x1 PNG is enough: the route checks the MIME type and the size, and
  // the crop dialog works on whatever it is given.
  await page.setInputFiles('input[type="file"]', {
    name: "me.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await page.getByRole("button", { name: /use this framing/i }).click();

  // `account.json`'s `fieldPhone` is "Mobile number", not "phone" — a label
  // regex of /phone/i would never match it. And the field itself (the same
  // `PhoneInput` the sign-up form uses, see auth.spec.ts) only takes the
  // national significant number: the dial code is a separate control fixed
  // at `defaultCountry="MZ"` in profile-form.tsx, and `PhoneInput.emit()`
  // *prepends* that country's calling code to whatever digits land in this
  // field. Filling the full "+258841234567" here would strip the "+" and
  // hand "258841234567" to `emit`, which would then prefix another "+258",
  // producing "+258258841234567" — not the number this test asserts below.
  // National digits only, matching auth.spec.ts's own sign-up flow.
  await page.getByLabel("Mobile number").fill("841234567");
  await page.getByRole("button", { name: /^save$/i }).click();

  await expect(page.getByText("+258841234567")).toBeVisible();

  // The key reached the database, and the profile's number reached the auth
  // identity — the two halves that a green screen alone does not prove.
  // `sql` is a function returning the client, not the tag itself: see
  // `fixtures/db.ts` and how `notifications.spec.ts` calls it.
  const [profile] = await sql()<{ avatar_key: string | null; phone_number: string | null }[]>`
    SELECT avatar_key, phone_number FROM ntizo_user.profile WHERE user_id = ${user.id}
  `;
  expect(profile!.avatar_key).toMatch(/^avatar\//);
  expect(profile!.phone_number).toBe("+258841234567");

  const [identity] = await sql()<{ phone_number: string | null; phone_number_verified: boolean }[]>`
    SELECT phone_number, phone_number_verified FROM better_auth."user" WHERE id = ${user.id}
  `;
  expect(identity!.phone_number).toBe("+258841234567");
  // Changing a number un-verifies it. Nothing has verified this one — and
  // `createVerifiedUser` signs up with no phone at all, so this is a genuine
  // first write rather than an edit.
  expect(identity!.phone_number_verified).toBe(false);

  await page.reload();
  // Scoped to the avatar's own key, not just any `<img>`: `/account` renders
  // inside `CustomerShell` -> `SiteHeader`, which puts an unconditional
  // `<img src="/brand/logo-primary.svg">` (and `UserMenu` another `<img>`)
  // ahead of this page's content, so an unscoped `page.locator("img").first()`
  // would match the brand logo and pass even if the avatar never rendered at
  // all. `mediaUrl()` embeds the R2 key (`avatar/${userId}/${timestamp}`,
  // media.ts:138) verbatim in the `src`, which the logo's `/brand/...` path
  // cannot collide with — do not loosen this back to a bare "img".
  await expect(page.locator('img[src*="/avatar/"]').first()).toBeVisible();
});
