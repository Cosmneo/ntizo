import { describe, expect, it } from "bun:test";
import { getEventRouter } from "@ntizo/backend/shared/infra/events";
// Imported for its module-scope side effects, which are the subject: importing
// `api.ts` is what registers the notification handlers on the router.
import "../api";

/**
 * The registration in `api.ts` has no compiler behind it.
 *
 * Delete both `register*NotificationHandlers` calls and everything still
 * builds, every other test still passes, and the only symptom is that nobody
 * is ever notified of anything — a silent, production-only regression in the
 * one wiring step this whole feature depends on. This test is the guard.
 *
 * It deliberately reaches the router through the package export
 * (`@ntizo/backend/shared/infra/events`), the same specifier `api.ts` uses,
 * rather than by relative path.
 *
 * The four names are the contract, not an implementation detail: each is a
 * string a producer passes to `super(eventName, ...)` and a consumer passes to
 * `router.on(...)`, with nothing connecting the two but the string itself.
 */
const REGISTERED_EVENTS = [
  "user.registered",
  "provider.created",
  "provider.status.decided",
  "provider.invite.sent",
] as const;

describe("notification event handlers are registered when the API loads", () => {
  for (const eventName of REGISTERED_EVENTS) {
    it(`has at least one handler for ${eventName}`, () => {
      expect(getEventRouter().handlerCount(eventName)).toBeGreaterThanOrEqual(1);
    });
  }

  it("registers each of them exactly once for notifications", () => {
    // Registration is module-scoped, so it must not be able to accumulate a
    // second copy of every handler — that would raise two rows per event.
    //
    // The count pinned here is 2, not 1: Task 6 (activity) also listens on
    // these same four event names — `event-handler-registration.activity.test.ts`
    // is the guard for that side — so each of them now carries one
    // notification handler AND one activity handler on the same router. A
    // count of 2 still catches a duplicate of either kind; only a count of
    // exactly 1 would have been wrong to keep asserting once a second,
    // legitimate consumer existed.
    for (const eventName of REGISTERED_EVENTS) {
      expect(getEventRouter().handlerCount(eventName)).toBe(2);
    }
  });

  it("registers nothing for an event with no consumer", () => {
    // `provider.member.role-updated` is one of the eight deliberately silent
    // Provider events. If a handler appears here, somebody added one without
    // deciding it was worth an inbox row.
    expect(getEventRouter().handlerCount("provider.member.role-updated")).toBe(0);
  });
});
