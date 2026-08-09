import postgres from "postgres";
import type { UserRole } from "@ntizo/shared";
import { E2E_DB_URL } from "./db";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:8788";

export interface VerifiedUser {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

let sqlClient: postgres.Sql | undefined;

function sql(): postgres.Sql {
  sqlClient ??= postgres(E2E_DB_URL, { max: 1 });
  return sqlClient;
}

/** Closes this fixture's own DB connection. Call from a global teardown so the process can exit. */
export async function closeAuthDb(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end({ timeout: 5 });
    sqlClient = undefined;
  }
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
 */
export async function createVerifiedUser(role?: UserRole): Promise<VerifiedUser> {
  const email = `e2e-${crypto.randomUUID()}@example.test`;
  const password = "Password123!";
  const firstName = "E2E";
  const lastName = "Tester";

  const response = await fetch(`${API_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

  return { id, email, password, firstName, lastName };
}
