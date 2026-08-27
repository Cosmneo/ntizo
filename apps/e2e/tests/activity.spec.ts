import { test, expect } from "@playwright/test";
import { createVerifiedUser } from "../fixtures/auth";
import { sql } from "../fixtures/db";

/**
 * The seam none of the activity feed's unit tests can see: a real sign-up,
 * a real `user.registered` publish, and a real row in `ntizo_activity.activity`
 * that only exists if the handler was actually mounted in `api.ts`.
 *
 * This is the test the phase's most expensive defect would have caught
 * earlier: eight GraphQL handlers were written, unit-tested and reviewed
 * without ever being mounted, every test green, and the only symptom was an
 * endpoint that silently returned nothing. `registerUserActivityHandlers`
 * (api.ts) is the same shape of single point of failure — a compiler cannot
 * flag a missing registration call, every producer keeps publishing, every
 * handler's own unit test keeps passing, and the only symptom is a history
 * that is silently always empty. `RecordActivityInternalCommand` also never
 * throws by design (recording history must not break the action being
 * recorded), which means a broken write is silent by construction, not just
 * by omission — an e2e assertion against the real table is the only thing
 * left that can notice.
 *
 * `createVerifiedUser` (fixtures/auth.ts) is the same real-signup fixture
 * `notifications.spec.ts` uses and for the same reason: a direct DB insert
 * would skip `CreateUserOnSignUpInternalCommand`, the transaction, and the
 * `runAfterCommit` dispatch this test exists to prove — see its doc comment.
 * No browser needed here: the row this test asserts on is written by the
 * sign-up request itself (server-side, inside the API's own transaction and
 * post-commit dispatch), not by anything a page render would trigger.
 *
 * **Cleanup runs in `finally`, not just on the happy path.** This suite's
 * database is the throwaway e2e container that `globalSetup` wipes at the
 * start of every full `bun run e2e`/`playwright test` invocation, but a
 * single-spec rerun against a container nobody restarted should not
 * accumulate rows either, and a failed assertion must not skip teardown —
 * that exact gap (a delete that only ran when the test passed) is what left
 * one orphaned activity row with no matching user behind during this task's
 * own development. Every statement here is scoped to this test's own
 * `user.id`/`user.email`, never a global `DELETE`, and each is wrapped so a
 * cleanup failure cannot mask the assertion's own pass/fail result.
 */
test("registering is the first thing your history records", async () => {
  const user = await createVerifiedUser();

  try {
    await expect
      .poll(
        async () => {
          const rows = await sql()<{ type: string }[]>`
            SELECT a.type FROM ntizo_activity.activity a
            JOIN better_auth."user" u ON u.id = a.actor_user_id
            WHERE u.email = ${user.email}`;
          return rows.map((r) => r.type);
        },
        { timeout: 10_000, message: "expected exactly one activity row for the new user" },
      )
      .toEqual(["user.registered"]);
  } finally {
    // actor_user_id carries no FK (activity.schema.ts's comment: a history
    // entry must outlive the thing that produced it), so this delete is
    // unconstrained and must run first regardless of what follows.
    await sql()`DELETE FROM ntizo_activity.activity WHERE actor_user_id = ${user.id}`.catch(
      (err) => console.error("[e2e] activity cleanup: activity delete failed", err),
    );
    // Cascades to ntizo_user.profile (profile.schema.ts's onDelete: "cascade").
    await sql()`DELETE FROM ntizo_user."user" WHERE id = ${user.id}`.catch((err) =>
      console.error("[e2e] activity cleanup: ntizo_user.user delete failed", err),
    );
    // Cascades to better_auth.session and better_auth.account.
    await sql()`DELETE FROM better_auth."user" WHERE id = ${user.id}`.catch((err) =>
      console.error("[e2e] activity cleanup: better_auth.user delete failed", err),
    );
  }
});
