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
/**
 * A Mozambican mobile number nobody else in this run will claim.
 *
 * NOT a constant. `better_auth.user.phone_number` is unique, and this suite
 * both retries failed tests and runs specs in parallel workers — so a fixed
 * number is claimed by the first attempt and rejected for every one after it
 * with PHONE_NUMBER_ALREADY_IN_USE. The feature was working; the test was
 * colliding with itself.
 *
 * `84` is a real Vodacom prefix, so the seven random digits after it still
 * parse as valid E.164 — which the command requires before it stores anything.
 */
function uniqueNationalNumber(): string {
  const digits = Math.floor(Math.random() * 10_000_000)
    .toString()
    .padStart(7, "0");
  return `84${digits}`;
}

test("a photo, a phone and a timezone survive a save and a reload", async ({ page }) => {
  const user = await createVerifiedUser(undefined, { firstName: "Ana", lastName: "Sitoe" });
  const national = uniqueNationalNumber();
  const e164 = `+258${national}`;

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

  // Confirming the crop above only STARTS the upload — it does not wait for
  // it. Clicking Save before it resolves would submit whatever `avatarKey`
  // happens to be in form state at that instant, which is `undefined` on a
  // slow upload, silently dropping the photo from this test's save. The
  // Remove button is gated on `hasOwnPhoto` (profile-form.tsx), which only
  // flips true once the upload resolves and the key lands in form state —
  // and it renders only once there is an uploaded photo to remove — so
  // waiting for it is exactly the synchronisation point missing here.
  await expect(page.getByRole("button", { name: /^remove$/i })).toBeVisible();

  // `account.json`'s `fieldPhone` is "Mobile number", not "phone" — a label
  // regex of /phone/i would never match it. And the field itself (the same
  // `PhoneInput` the sign-up form uses, see auth.spec.ts) only takes the
  // national significant number: the dial code is a separate control fixed
  // at `defaultCountry="MZ"` in profile-form.tsx, and `PhoneInput.emit()`
  // *prepends* that country's calling code to whatever digits land in this
  // field. Filling the full "+258…" form here would strip the "+" and
  // hand "258841234567" to `emit`, which would then prefix another "+258",
  // producing "+258258841234567" — not the number this test asserts below.
  // National digits only, matching auth.spec.ts's own sign-up flow.
  await page.getByLabel("Mobile number").fill(national);

  // `createVerifiedUser` signs up over a server-side fetch with no
  // `X-Timezone` header, so this profile was born UTC and the select
  // defaults to it. Saving UTC back over UTC would be a no-op that passes
  // whether or not the timezone field is wired to anything — picking a
  // different zone is what makes this leg of the test able to fail. The
  // full ~450-entry list renders unfiltered until searched, so the option is
  // already in the DOM once the trigger opens.
  await page.getByLabel("Time zone", { exact: true }).click();
  await page.getByRole("option", { name: "Africa/Maputo", exact: true }).click();

  await page.getByRole("button", { name: /^save$/i }).click();

  await expect(page.getByText(e164)).toBeVisible();

  // The key reached the database, and the profile's number reached the auth
  // identity — the two halves that a green screen alone does not prove.
  // `sql` is a function returning the client, not the tag itself: see
  // `fixtures/db.ts` and how `notifications.spec.ts` calls it.
  const [profile] = await sql()<
    { avatar_key: string | null; phone_number: string | null; timezone: string }[]
  >`
    SELECT avatar_key, phone_number, timezone FROM ntizo_user.profile WHERE user_id = ${user.id}
  `;
  expect(profile!.avatar_key).toMatch(/^avatar\//);
  expect(profile!.phone_number).toBe(e164);
  expect(profile!.timezone).toBe("Africa/Maputo");

  const [identity] = await sql()<{ phone_number: string | null; phone_number_verified: boolean }[]>`
    SELECT phone_number, phone_number_verified FROM better_auth."user" WHERE id = ${user.id}
  `;
  expect(identity!.phone_number).toBe(e164);
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
  const avatarImage = page.locator('img[src*="/avatar/"]').first();
  await expect(avatarImage).toBeVisible();
  // `toBeVisible()` measures the element's box, not whether the request
  // behind `src` actually resolved — a broken image still lays out as a
  // visible 72x72 box with `naturalWidth: 0`. Polling for a positive
  // `naturalWidth` is what proves the browser decoded real pixels rather
  // than rendering an empty icon after a failed fetch.
  await expect
    .poll(() => avatarImage.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
});
