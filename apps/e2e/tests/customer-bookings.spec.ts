import { test, expect } from "@playwright/test";
import { createVerifiedUser } from "../fixtures/auth";
import { fillSignInForm } from "../fixtures/ui";
import { seedAwaitingBooking, BOOKING_SERVICE_NAME } from "../fixtures/booking";

/**
 * The seam none of this plan's unit or projection tests can see: a real
 * signed-in session reading `bookingMine`/`bookingById` off a real database
 * row and a real `bookingCancel` mutation moving that same row, through the
 * actual list and detail pages rather than a mocked repository.
 *
 * Booking creation itself is seeded directly (`seedAwaitingBooking`), not
 * driven through checkout — see that fixture's own doc comment for why.
 * What this spec proves is downstream of a submitted booking existing:
 * Task 4's list (the waiting tab, the row, its one action), Task 6's detail
 * (the timeline's first entry), and Tasks 7-9's cancel (the command, the
 * dialog's ambiguous "Cancelar reserva" label, and history picking the row
 * back up under its new status).
 *
 * Paying is deliberately not covered here. `PayDialog` waits on a real
 * M-Pesa STK prompt landing on a handset — there is nothing in this harness
 * that can drive the sandbox's other side, and faking the wait would only
 * prove the mock, not the flow.
 *
 * This is also the test that found the row's own click didn't work at all,
 * on the real app, before this task's changes: clicking a row went nowhere
 * because `_customer/bookings.tsx` had a `$bookingId` sibling and no
 * `<Outlet />` — see that route file's own doc comment (now
 * `bookings.index.tsx`) for the mechanism and `docs/superpowers/
 * follow-ups.md` for why it stayed invisible until a real browser session
 * tried it.
 */
test("a customer sees the booking they made, and can call it off", async ({ page }) => {
  const customer = await createVerifiedUser();
  const { bookingId } = await seedAwaitingBooking(customer.id);

  // Signs in reading `auth.json`'s `en-US` bundle — `fillSignInForm` matches
  // its fields by their English accessible names
  // (`getByLabel("Email", { exact: true })`) — so the switch to pt-MZ below
  // happens only after this step, never before it.
  await page.goto("/sign-in");
  await fillSignInForm(page, customer);
  await page.waitForURL("http://localhost:3000/");

  // The same dialog a real customer reaches for — `LanguageSwitcher`/
  // `LanguageDialog` (shared/components/language-switcher.tsx) — rather than
  // forcing the browser's own locale (`test.use({ locale: "pt-MZ" })`),
  // which would have translated the sign-in form out from under
  // `fillSignInForm` too. `i18n.changeLanguage` persists to `localStorage`
  // ("i18nextLng"), so the choice survives the reloads this test makes
  // afterwards, exactly as it would for a returning visitor. This is what
  // the customer-facing assertions below are written in — the exact copy
  // this task's own brief quotes.
  await page.getByRole("button", { name: "Change language" }).click();
  await page.getByRole("button", { name: "Português (Moçambique)" }).click();

  await page.goto("/bookings");
  await page.waitForLoadState("networkidle");

  // Defaults to the "waiting" tab (bookings.index.tsx's `validateSearch`),
  // which is where `AWAITING_PROVIDER` lives (`CUSTOMER_TAB_STATUSES.waiting`)
  // — no `?tab=` needed to find it here.
  const row = page.getByRole("row", { name: new RegExp(BOOKING_SERVICE_NAME) });
  await expect(row).toBeVisible();
  await expect(row.getByText("À espera do prestador")).toBeVisible();

  await row.getByRole("link", { name: new RegExp(BOOKING_SERVICE_NAME) }).click();
  await page.waitForURL(new RegExp(`/bookings/${bookingId}$`));

  // `timelineOf`'s first entry, synthesised from the row's own `createdAt`
  // regardless of what (if anything) `booking_change` holds — see the
  // fixture's doc comment for why seeding needs no change row to produce it.
  await expect(page.getByText("Pedido enviado")).toBeVisible();

  // AWAITING_PROVIDER is `canCancel` and not `canPay` (domain/status.ts), so
  // the detail header renders exactly one "Cancelar reserva" button here —
  // the ambiguity starts only once the dialog (whose confirm button carries
  // the identical label) is on the page too.
  await page.getByRole("button", { name: "Cancelar reserva" }).click();
  // Two elements now match: the header button behind the dialog and the
  // dialog's own confirm button, appended after it in DOM order. `.last()`
  // is the dialog's — this exact ambiguity is called out in this task's own
  // brief as something this repo has already been bitten by twice.
  await page.getByRole("button", { name: "Cancelar reserva" }).last().click();

  // `useCancelBooking`'s `onSettled` invalidation (Task 9's fix round) is
  // what makes this observable without a reload; this spec reloads anyway
  // (`page.goto`), so it also proves the server-side read reflects the
  // write a moment after `booking.cancel` committed, not only a warm cache.
  await page.goto("/bookings?tab=history");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("row", { name: new RegExp(BOOKING_SERVICE_NAME) }).getByText("Cancelada"),
  ).toBeVisible();
});
