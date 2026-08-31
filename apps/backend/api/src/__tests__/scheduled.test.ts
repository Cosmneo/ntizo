import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { infraStore } from "@ntizo/backend/shared/infra";
import { Db } from "@ntizo/backend/shared/infra/database";
import { NotifyUnreadInternalCommand } from "@ntizo/backend/modules/ntizo/bounded-contexts/communication";
import { ExpireDueBookingsInternalCommand } from "@ntizo/backend/modules/ntizo/bounded-contexts/booking";
import { scheduled, SWEEP_LIMIT, BOOKING_EXPIRY_SWEEP_LIMIT } from "../scheduled";
import handler from "../index";
import type { AppBindings } from "../types";

/**
 * Why this file exists.
 *
 * `NotifyUnreadInternalCommand` (Task 5) is fully built and fully tested, and
 * calling it does nothing on its own: nobody schedules it. `scheduled.ts` is
 * the cron handler that does, and this file proves the ways that could
 * silently fail to matter:
 *
 * 1. `scheduled` runs the sweep *outside* the request-scoped `infraStore`
 *    context that `configMiddleware` builds for every HTTP request but that a
 *    cron invocation has no equivalent of. Unwrapped, the raise and
 *    `markNotified` still succeed, and only the deferred email delivery
 *    throws — inside `DeferredNotificationDelivery`'s own `.catch`, logged,
 *    and gone. Permanent, silent email loss, every test green. Guarded by
 *    "establishes the infra-store scope before running the sweep" below,
 *    which fails the moment `infraStore.runAsync` stops wrapping the sweep —
 *    see that test's comment for exactly how.
 * 2. `scheduled` defers the pool close BESIDE the deferred work it started
 *    instead of BEHIND it, letting the close win a race it must not win.
 *    Guarded by "closes the run's postgres pool behind deferred work, not
 *    beside it" below, which needs — and creates — a genuine race: see that
 *    test's own comment for why the first version of this test could not
 *    have caught this.
 * 3. `scheduled` exists in this file but is never attached to the Worker's
 *    default export, so Cloudflare never calls it and the sweep never runs.
 *    Guarded by "wires `scheduled` into the worker's default export" below.
 * 4. `scheduled` used to run both sweeps under one shared `try`, notification
 *    first — so anything `notifyUnread.execute` threw skipped the
 *    booking-expiry sweep entirely, silently reinstating the permanent slot
 *    leak that sweep exists to prevent, from a context that has nothing to
 *    do with bookings. Guarded by "runs the booking-expiry sweep even when
 *    the notify-unread sweep throws" below (Task 5 of the booking-seams
 *    repair plan), which forces the notify-unread sweep to throw and proves
 *    the booking sweep still ran to completion regardless.
 *
 * Tests 1, 3 and 4 run the real sweep(s) against the real dev database (via
 * `process.env.DATABASE_URL`, which `bun test` loads from `.env`) rather than
 * a fake repository, because the whole point is to prove the *wiring* down to
 * a real `getDb()` call — a fake repository would never notice a missing
 * `infraStore.runAsync`. This is safe to run repeatedly: the messaging and
 * booking tables hold zero due rows, so `claimDueForNotice` and
 * `findDueForExpiry` always return `[]` and neither sweep raises a
 * notification, sends an email, expires a booking, or writes anything.
 */

const ENV = {
  STAGE: "local",
  LOG_LEVEL: "info",
  DATABASE_URL: process.env["DATABASE_URL"] ?? "",
  BETTER_AUTH_SECRET: "test-secret",
  RESEND_API_KEY: "test-key",
  EMAIL_FROM: "Ntizo <noreply@ntizo.co.mz>",
  APP_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
} as unknown as AppBindings;

if (!process.env["DATABASE_URL"]) {
  throw new Error(
    "DATABASE_URL is not set — see apps/backend/api/.env. These tests exercise the real sweep against the real (empty) messaging tables.",
  );
}

function fakeController(): ScheduledController {
  return {
    scheduledTime: Date.now(),
    cron: "* * * * *",
    noRetry() {},
  } as unknown as ScheduledController;
}

/** Mirrors `wait-until.test.ts`'s helper of the same shape. */
function fakeExecutionContext() {
  const scheduledPromises: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(promise: Promise<unknown>) {
      scheduledPromises.push(promise);
    },
    passThroughOnException() {},
    props: {},
  };
  return { ctx: ctx as unknown as ExecutionContext, scheduledPromises };
}

const originalClose = Db.closeDbConnection;
afterEach(() => {
  Db.closeDbConnection = originalClose;
});

describe("the scheduled worker", () => {
  it("establishes the infra-store scope before running the sweep", async () => {
    // Proof, not narration: `NotifyUnreadInternalCommand.execute`'s very
    // first line calls `claimDueForNotice`, which reaches `getDb()` ->
    // `Db.getDbConnection()` -> `infraStore.getConnectionString()`. That last
    // call THROWS synchronously — "[infra-store] not initialized. Ensure
    // configMiddleware wraps the request..." — unless something already ran
    // `infraStore.runAsync`. Delete that wrapper from scheduled.ts and this
    // test goes red: `execute` rejects, `scheduled()` rejects with it (the
    // `finally` that closes the pool does not swallow), and the `await`
    // below throws.
    const executeSpy = spyOn(NotifyUnreadInternalCommand.prototype, "execute");
    const { ctx, scheduledPromises } = fakeExecutionContext();

    await scheduled(fakeController(), ENV, ctx);

    // The sweep actually ran, exactly once, with the cron's own budget — not
    // merely "scheduled() returned", which a handler that skipped the sweep
    // entirely could also manage.
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy.mock.calls[0]?.[0]).toEqual({ limit: SWEEP_LIMIT });
    // And it resolved rather than being a call whose rejection we happened
    // not to await — the dev database holds zero due messages, so this is
    // always { notified: 0, failed: 0 }.
    await expect(executeSpy.mock.results[0]?.value).resolves.toEqual({
      notified: 0,
      failed: 0,
    });

    await Promise.all(scheduledPromises);
    executeSpy.mockRestore();
  });

  it("closes the run's postgres pool behind deferred work, not beside it", async () => {
    // Fix round 1: the first version of this test spied on
    // `settleDeferredWork` / `closeDbConnection` and checked *call order*
    // against a sweep that has nothing to defer (zero due messages in the
    // dev DB). `settleDeferredWork()` resolves instantly either way when
    // there is nothing queued, so that version could not tell the correct,
    // chained shape apart from the broken one:
    //
    //   try { ctx.waitUntil(infraStore.settleDeferredWork()); } catch {}
    //   try { ctx.waitUntil(Db.closeDbConnection()); } catch {}
    //
    // — both still call `settleDeferredWork` once and `closeDbConnection`
    // once, in that textual order, so the earlier assertions passed against
    // either. Confirmed by mutation: applying exactly that shape left the
    // old version of this test at 3/3 pass.
    //
    // A genuine race needs genuine deferred work, so this test mocks
    // `NotifyUnreadInternalCommand.execute` (rather than seeding a real due
    // message, which would need a real Resend call through the dev
    // `RESEND_API_KEY` to be honest, and this task must leave the dev
    // database at zero rows) to do what a real notified message would: call
    // `infraStore.waitUntil` with a promise that takes real time — mirroring
    // `wait-until.test.ts`'s own race test for `configMiddleware`, one layer
    // up the stack. The mock runs inside the exact `infraStore.runAsync`
    // scope `scheduled()` establishes, since it is invoked synchronously
    // from within it — that scope is the only thing this test needs from the
    // production sweep.
    const order: string[] = [];
    Db.closeDbConnection = async () => {
      order.push("close");
    };
    const executeSpy = spyOn(NotifyUnreadInternalCommand.prototype, "execute").mockImplementation(
      async () => {
        infraStore.waitUntil(
          (async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            order.push("delivery");
          })(),
        );
        return { notified: 1, failed: 0 };
      },
    );

    const { ctx, scheduledPromises } = fakeExecutionContext();
    await scheduled(fakeController(), ENV, ctx);

    // The run itself did not pay for the delivery — it is still in flight.
    expect(order).toEqual([]);

    await Promise.all(scheduledPromises);
    // The close is registered as a SECOND task chained behind the first, not
    // beside it: it must not run before the 20ms delivery finishes.
    expect(order).toEqual(["delivery", "close"]);

    executeSpy.mockRestore();
  });

  it("wires `scheduled` into the worker's default export", async () => {
    // The literal thing Cloudflare calls. `scheduled.ts` alone schedules
    // nothing if `index.ts`'s default export never attaches it — delete the
    // `scheduled` property from that object and this assertion is the first
    // thing to go red (a plain object with no `scheduled` key gives
    // `undefined`, not a function).
    expect(typeof handler.scheduled).toBe("function");

    const { ctx, scheduledPromises } = fakeExecutionContext();
    await handler.scheduled(fakeController(), ENV, ctx);
    await Promise.all(scheduledPromises);
  });

  it("runs the booking-expiry sweep even when the notify-unread sweep throws", async () => {
    // Before Task 5 of the booking-seams repair plan, both sweeps ran under
    // one shared `try`, notification first — so a throw here never even
    // reached the booking sweep below it, and `scheduled()` itself rejected.
    // Forcing the throw here and then asserting the booking sweep still ran
    // to completion is the only way to tell that shape apart from the fixed
    // one: both shapes call `notifyUnread.execute` once, so a call-count
    // assertion on that spy alone cannot distinguish them.
    const notifySpy = spyOn(NotifyUnreadInternalCommand.prototype, "execute").mockImplementation(
      async () => {
        throw new Error("notify-unread sweep blew up");
      },
    );
    const expireDueSpy = spyOn(ExpireDueBookingsInternalCommand.prototype, "execute");

    const { ctx, scheduledPromises } = fakeExecutionContext();

    // `scheduled()` itself must not reject: a cron invocation has nobody to
    // report a rejection to, and the fixed shape logs each sweep's own
    // failure instead of letting it propagate past the other sweep.
    await scheduled(fakeController(), ENV, ctx);

    expect(expireDueSpy).toHaveBeenCalledTimes(1);
    expect(expireDueSpy.mock.calls[0]?.[0]).toEqual({ limit: BOOKING_EXPIRY_SWEEP_LIMIT });
    // Resolved, not merely called — the dev database holds zero due
    // bookings, so this is always { expired: 0, failed: 0 }, same reasoning
    // as test 1's assertion on the notify-unread sweep's own result.
    await expect(expireDueSpy.mock.results[0]?.value).resolves.toEqual({
      expired: 0,
      failed: 0,
    });

    await Promise.all(scheduledPromises);
    notifySpy.mockRestore();
    expireDueSpy.mockRestore();
  });
});
