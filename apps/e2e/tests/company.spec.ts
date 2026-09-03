import { test, expect } from "@playwright/test";
import { createVerifiedUser } from "../fixtures/auth";
import { fillSignInForm } from "../fixtures/ui";
import { sql } from "../fixtures/db";

/**
 * The seam no unit test can see: a real anonymous visitor sending the real
 * form through the real private endpoint (which must accept a caller with no
 * session — the first mutation that relies on it), the row landing in a real
 * table, and a real administrator finding it by the reference the visitor
 * was shown and resolving it. Verified by mutation: commenting out
 * `...createContactWriteHandlers` in `apps/backend/api/src/graphql/private.ts`
 * turns this red.
 *
 * Cleanup runs in `finally`, scoped to this test's own row and its own
 * admin user — never a global DELETE. Unlike most of this suite's specs
 * (`auth.spec.ts`, `zones.spec.ts`), which leave the users they create
 * behind, this follows `activity.spec.ts` / `attachments.spec.ts` /
 * `messaging.spec.ts`: those delete every user they create, in `finally`,
 * for the reason stated in `activity.spec.ts`'s own doc comment — a
 * single-spec rerun against a container nobody restarted must not
 * accumulate rows either, and `globalSetup` only resets the database once
 * per full run, not once per spec. The `contact_request` row is deleted
 * first: `resolved_by_user_id` references `ntizo_user.user`, and while the
 * column is `ON DELETE SET NULL` (so order is not required to avoid an
 * error), deleting the row that points at the admin before the admin itself
 * keeps the delete order self-explanatory rather than leaning on that
 * default.
 */
test("a visitor writes to us, and an administrator resolves it", async ({ page, browser }) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const name = `E2E Contact ${suffix}`;
  let reference = "";
  let admin: Awaited<ReturnType<typeof createVerifiedUser>> | undefined;

  try {
    await page.goto("/contact");
    // The very first navigation to a route this dev server hasn't yet
    // compiled races React hydration: a `.fill()`/click landing before the
    // client attaches its listeners hits the bare `<form>`'s native submit
    // (no method/action, no JS `preventDefault` yet) instead of the
    // mutation, which reloads the route with all state back at its initial
    // (empty) value — reference derived from this run: the same
    // fill-then-click sequence sent no `contactRequestSubmit` request and
    // left every field blank until this wait was added, after which the
    // mutation fired immediately. `networkidle` is empirically what closes
    // the gap: `/contact` fetches several dev-only ESM chunks and a
    // `userMe` query on mount, and both are done by the time the network
    // goes quiet.
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Talk to us.");

    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Email").fill(`e2e-contact-${suffix}@example.test`);
    await page.getByLabel("Message").fill("We would like to propose a partnership with our school.");
    await page.getByRole("button", { name: /send message/i }).click();

    await expect(page.getByRole("heading", { name: "We got your message." })).toBeVisible();
    const refText = await page.getByText(/^Reference: /).textContent();
    reference = refText!.replace("Reference: ", "").trim();
    expect(reference).toMatch(/^[0-9A-F]{6}$/);

    // The row exists, open, with the reference derived from its id.
    const rows = await sql()<{ id: string; status: string }[]>`
      SELECT id::text, status FROM ntizo_contact.contact_request WHERE name = ${name}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("open");
    expect(rows[0]!.id.replace(/-/g, "").slice(0, 6).toUpperCase()).toBe(reference);

    admin = await createVerifiedUser("admin", { firstName: "Ada", lastName: "Admin" });
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/sign-in");
    // Same first-compile hydration race as `/contact` above — this is a
    // fresh browser context, so `/sign-in` has never been interacted with
    // in this run either.
    await adminPage.waitForLoadState("networkidle");
    await fillSignInForm(adminPage, admin);
    await adminPage.waitForURL(/\/admin/);

    await adminPage.goto("/admin/contact");
    await adminPage.waitForLoadState("networkidle");
    await adminPage.getByPlaceholder(/search a name/i).fill(reference);
    // `CollectionCard` renders the same rows twice — a `<table>` for wide
    // screens and a stacked-card list for narrow ones, toggled by CSS
    // breakpoint rather than JS, both present in the DOM at once (see its
    // own doc comment). A bare `getByText` matches both and violates strict
    // mode; scoping to the table (the one visible at this project's Desktop
    // Chrome viewport) resolves to the single element actually on screen.
    const row = adminPage.getByRole("table").getByText(`#${reference}`);
    await expect(row).toBeVisible();
    await adminPage.getByRole("button", { name: /mark resolved/i }).first().click();

    // Open is the default filter, so a resolved request leaves the list.
    await expect(row).toBeHidden();

    const after = await sql()<{ status: string; resolved_by_user_id: string | null }[]>`
      SELECT status, resolved_by_user_id FROM ntizo_contact.contact_request WHERE name = ${name}`;
    expect(after[0]!.status).toBe("resolved");
    expect(after[0]!.resolved_by_user_id).toBe(admin.id);

    await adminContext.close();
  } finally {
    await sql()`DELETE FROM ntizo_contact.contact_request WHERE name = ${name}`.catch((err) =>
      console.error("[e2e] company cleanup: contact_request delete failed", err),
    );
    if (admin) {
      // Cascades to ntizo_user.profile (profile.schema.ts's onDelete: "cascade").
      await sql()`DELETE FROM ntizo_user."user" WHERE id = ${admin.id}`.catch((err) =>
        console.error("[e2e] company cleanup: ntizo_user.user delete failed", err),
      );
      // Cascades to better_auth.session and better_auth.account.
      await sql()`DELETE FROM better_auth."user" WHERE id = ${admin.id}`.catch((err) =>
        console.error("[e2e] company cleanup: better_auth.user delete failed", err),
      );
    }
  }
});
