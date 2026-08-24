import type { UserRole } from "@ntizo/shared";
import { sql } from "./db";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:8788";

/**
 * The web app's own origin — sent as `Origin` below, not because a browser
 * is involved (this is a plain server-side `fetch`), but because Node's
 * built-in `fetch` (undici) sets `Sec-Fetch-Mode: cors` on every request by
 * default. better-auth's `formCsrfMiddleware` (wired onto `sign-up/email`
 * and `sign-in/email`, `node_modules/better-auth/dist/api/routes/sign-up.mjs`
 * / `sign-in.mjs`) treats the presence of any `Sec-Fetch-*` header as a
 * browser-shaped request and then requires a matching `Origin` — with none
 * supplied it throws `403 MISSING_OR_NULL_ORIGIN`
 * (`better-auth/dist/api/middlewares/origin-check.mjs`, `validateFormCsrf`).
 * Confirmed empirically: `curl` and Bun's own `fetch` don't set
 * `Sec-Fetch-Mode`, so a manual curl/`bun run` sanity check of this endpoint
 * passes; the actual Playwright *test worker* process runs under plain
 * Node (verified — `typeof Bun === "undefined"` inside a spec, even though
 * `bun run e2e` launches the top-level CLI), whose `fetch` does set it, so
 * this only ever broke inside a real Playwright run, never in a standalone
 * check. `http://localhost:3000` is on the backend's trusted-origins list
 * for local stage (`packages/backend/src/shared/infrastructure/config/
 * stage-properties.ts`'s `landingUrl`) — the same origin a real browser
 * sign-up from this harness's web server would present.
 */
const WEB_ORIGIN = process.env.E2E_WEB_URL ?? "http://localhost:3000";

export interface VerifiedUser {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  name: string;
}

/**
 * Signs up a fresh user through the REAL API (`POST /api/auth/sign-up/email`)
 * rather than inserting rows directly, so better-auth's `user.create.after`
 * hook actually runs: it drives `CreateUserOnSignUpInternalCommand`, which
 * creates the `ntizo_user.user` + `ntizo_user.profile` rows inside the same
 * unit-of-work transaction as the `better_auth.user` row. A direct DB insert
 * would skip that whole path and could pass tests a real signup would fail.
 *
 * better-auth is configured with `requireEmailVerification: true`
 * (packages/backend/src/modules/better-auth/lib/better-auth.ts) and this
 * harness has no mailbox a Playwright browser context can drive, so
 * `email_verified` is flipped directly in Postgres afterwards instead of
 * consuming a real verification link.
 *
 * Role — READ THIS BEFORE CHANGING: there are two independent `role`
 * columns and nothing keeps them in sync.
 *   - `better_auth.user.role` defaults to "customer" and exists only
 *     because better-auth's Drizzle adapter needs a matching field
 *     (better-auth.ts's `user.additionalFields.role`); it is never read
 *     back — no admin plugin is registered, and confirmed by a passing test
 *     (apps/backend/api/src/graphql/__tests__/context-factory.test.ts) that
 *     asserts the session's role is discarded.
 *   - `ntizo_user.user.role` is hardcoded to "customer" by
 *     `CreateUserOnSignUpInternalCommand` on every signup regardless of what
 *     was posted, and is the column `userMe` and every authorization check
 *     actually read (apps/backend/api/src/graphql/context-factory.ts calls
 *     `findPlatformRole`, which selects from `ntizo_user.user`, never from
 *     the better-auth table).
 * So when `role` is passed here, only `ntizo_user.user.role` is updated.
 * `better_auth.user.role` is deliberately left at its default — nothing in
 * this codebase reads it for an authorization decision.
 *
 * `name` defaults to "E2E Tester" for every caller that doesn't override it —
 * fine for single-user specs, but a test asserting that one user's name
 * doesn't leak into another user's session (the query-cache regression this
 * harness exists to catch) needs two *visibly different* names, so pass one
 * explicitly whenever a test's assertions depend on telling two users apart.
 */
export async function createVerifiedUser(
  role?: UserRole,
  name?: { firstName: string; lastName: string },
): Promise<VerifiedUser> {
  const email = `e2e-${crypto.randomUUID()}@example.test`;
  const password = "Password123!";
  const firstName = name?.firstName ?? "E2E";
  const lastName = name?.lastName ?? "Tester";

  const response = await fetch(`${API_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN },
    body: JSON.stringify({
      email,
      password,
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `[e2e] createVerifiedUser: sign-up failed (${response.status}): ${await response.text()}`,
    );
  }

  const body = (await response.json()) as { user?: { id?: string } };
  const id = body.user?.id;
  if (!id) {
    throw new Error(
      `[e2e] createVerifiedUser: sign-up response had no user id: ${JSON.stringify(body)}`,
    );
  }

  await sql()`UPDATE better_auth."user" SET email_verified = true WHERE id = ${id}`;

  if (role) {
    await sql()`UPDATE ntizo_user."user" SET role = ${role} WHERE id = ${id}`;
  }

  return { id, email, password, firstName, lastName, name: `${firstName} ${lastName}` };
}

/**
 * The email-address-driven twin of `createVerifiedUser`'s own verify step,
 * for a spec that drives the real sign-up *form* in the browser (rather
 * than the fixture's own direct API call) and so only knows the new user by
 * the email it typed in, not an id from a JSON response. Same shortcut,
 * same reason: `requireEmailVerification: true` and no mailbox a Playwright
 * browser context can drive.
 */
export async function verifyUserByEmail(email: string, role?: UserRole): Promise<string> {
  const rows = await sql()`SELECT id FROM better_auth."user" WHERE email = ${email}`;
  const id = rows[0]?.id as string | undefined;
  if (!id) {
    throw new Error(`[e2e] verifyUserByEmail: no better_auth.user row found for ${email}`);
  }

  await sql()`UPDATE better_auth."user" SET email_verified = true WHERE id = ${id}`;
  if (role) {
    await sql()`UPDATE ntizo_user."user" SET role = ${role} WHERE id = ${id}`;
  }
  return id;
}
