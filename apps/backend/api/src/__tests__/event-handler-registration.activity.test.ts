import { describe, expect, it } from "bun:test";
import { getEventRouter } from "@ntizo/backend/shared/infra/events";
// Imported for its module-scope side effects, which are the subject: importing
// `api.ts` is what registers the activity handlers on the router. Bun's module
// cache means this import (and the one in `event-handler-registration.test.ts`)
// only ever evaluates `api.ts` once for the whole test run, so both files
// observe the same, already-wired router.
import "../api";

/**
 * The activity registration in `api.ts` has no compiler behind it, same as
 * the notification one this file sits beside.
 *
 * Delete any of the four `register*ActivityHandlers` calls and everything
 * still builds, every handler's own unit test still passes, and the only
 * symptom is a history that is silently always empty — nobody's "you did X"
 * page ever gains a row. This test is the guard.
 *
 * It deliberately reaches the router through the package export
 * (`@ntizo/backend/shared/infra/events`), the same specifier `api.ts` uses,
 * rather than by relative path.
 *
 * The count asserted per event is exact, not `>= 1`: a duplicate
 * `register*ActivityHandlers(...)` call — e.g. a merge that lands the same
 * block twice — writes two identical rows per event and is invisible to a
 * `>= 1` assertion. Four of the nine (`user.registered`, `provider.created`,
 * `provider.status.decided`, `provider.invite.sent`) are also where the
 * Notification context listens, so those carry 2 (one notification handler,
 * one activity handler — `event-handler-registration.test.ts` asserts the
 * same fact from the notification side); the other five carry 1. This file
 * does not lean on that other file to prove activity's own handlers are
 * mounted — each file proves its own consumer independently, even though
 * both read the same router.
 */
const EXPECTED_HANDLER_COUNT: Record<string, number> = {
  "user.registered": 2,
  "provider.created": 2,
  "provider.status.decided": 2,
  "provider.invite.sent": 2,
  "provider.invite.accepted": 1,
  "service.created": 1,
  "service.published": 1,
  "service.unpublished": 1,
  "review.created": 1,
};

describe("activity event handlers are registered when the API loads", () => {
  for (const [eventName, expected] of Object.entries(EXPECTED_HANDLER_COUNT)) {
    it(`registers exactly ${expected} handler(s) for ${eventName}`, () => {
      expect(getEventRouter().handlerCount(eventName)).toBe(expected);
    });
  }

  it("registers nothing for an event no activity type covers", () => {
    // `provider.member.role-updated` carries no `actorUserId` — there is
    // nobody to file a row under — and is one of the events `ACTIVITY_TYPES`
    // deliberately excludes. If a handler appears here, somebody added one
    // without deciding it was worth a history row.
    expect(getEventRouter().handlerCount("provider.member.role-updated")).toBe(0);
  });
});
