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
 * Nine event names, not four: this is every event `ACTIVITY_TYPES` has a
 * producer for today (Task 5 added the ninth, `review.created`). The four
 * that overlap with the Notification context's own registrations
 * (`user.registered`, `provider.created`, `provider.status.decided`,
 * `provider.invite.sent`) are covered for exact count in
 * `event-handler-registration.test.ts`; this file only asserts presence.
 */
const REGISTERED_EVENTS = [
  "user.registered",
  "provider.created",
  "provider.status.decided",
  "provider.invite.sent",
  "provider.invite.accepted",
  "service.created",
  "service.published",
  "service.unpublished",
  "review.created",
] as const;

describe("activity event handlers are registered when the API loads", () => {
  for (const eventName of REGISTERED_EVENTS) {
    it(`has at least one handler for ${eventName}`, () => {
      expect(getEventRouter().handlerCount(eventName)).toBeGreaterThanOrEqual(1);
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
