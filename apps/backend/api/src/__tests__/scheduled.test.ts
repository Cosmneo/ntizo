import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { infraStore } from "@ntizo/backend/shared/infra";
import { Db } from "@ntizo/backend/shared/infra/database";
import { NotifyUnreadInternalCommand } from "@ntizo/backend/modules/ntizo/bounded-contexts/communication";
import {
  ChargeAcceptedBookingsInternalCommand,
  SweepDueBookingsInternalCommand,
} from "@ntizo/backend/modules/ntizo/bounded-contexts/booking";
import { scheduled, SWEEP_LIMIT, BOOKING_SWEEP_LIMIT, BOOKING_CHARGE_LIMIT } from "../scheduled";
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
 *    booking sweep entirely, silently reinstating the permanent slot
 *    leak that sweep exists to prevent, from a context that has nothing to
 *    do with bookings. Guarded by "runs the booking sweep even when
 *    the notify-unread sweep throws" below (Task 5 of the booking-seams
 *    repair plan), which forces the notify-unread sweep to throw and proves
 *    the booking sweep still ran to completion regardless.
 *
 * 5. `scheduled` runs the charge sweep — the cron's third question, added by
 *    Task 5 of the payment-and-confirmation-order plan — under one of the
 *    other two sweeps' `try`, so anything either of them throws skips the
 *    only thing on this platform that collects money. Guarded by "runs the
 *    charge sweep even when both sweeps before it throw" below.
 *
 * Tests 1, 3, 4 and 5 run the real sweep(s) against the real dev database (via
 * `process.env.DATABASE_URL`, which `bun test` loads from `.env`) rather than
 * a fake repository, because the whole point is to prove the *wiring* down to
 * a real `getDb()` call — a fake repository would never notice a missing
 * `infraStore.runAsync`. This is safe to run repeatedly: the messaging and
 * booking tables hold zero due rows, so `claimDueForNotice`,
 * `findDueForSweep` and `findAwaitingCharge` always return `[]` — no
 * notification is raised, no email sent, no booking expired, **and no
 * customer is charged**: with an empty result the charge sweep never reaches
 * `PaymentChargePort` at all, which is what makes running this file against
 * the live gateway's credentials harmless.
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

    // Fix round 2: the deferred work now finishes when *this test* says so,
    // never on a timer.
    //
    // The previous version resolved it from a 20ms `setTimeout` and then
    // asserted `order` was still empty the moment `scheduled()` returned —
    // which quietly assumed `scheduled()` returns in under 20ms. That held
    // while the only real work in it was one sweep against an empty table;
    // it stopped holding once a second sweep joined, because the booking
    // sweep is a live round trip to Neon. The timer then elapsed *during*
    // `scheduled()`, `order` already read `["delivery", "close"]` at the
    // first assertion, and the test failed consistently — against behaviour
    // that was entirely correct. The assertion was racing the code under
    // test rather than measuring it.
    //
    // A promise this test resolves itself, after it has checked `order` is
    // empty, cannot lose that race however long `scheduled()` takes. The
    // final assertion is untouched and is still the whole point: the close
    // is chained BEHIND the delivery, not registered beside it.
    let letDeliveryFinish!: () => void;
    const deliveryHeld = new Promise<void>((resolve) => {
      letDeliveryFinish = resolve;
    });

    const executeSpy = spyOn(NotifyUnreadInternalCommand.prototype, "execute").mockImplementation(
      async () => {
        infraStore.waitUntil(
          (async () => {
            await deliveryHeld;
            order.push("delivery");
          })(),
        );
        return { notified: 1, failed: 0 };
      },
    );

    const { ctx, scheduledPromises } = fakeExecutionContext();
    await scheduled(fakeController(), ENV, ctx);

    // The run itself did not pay for the delivery — it is still in flight,
    // and now provably so: nothing but the line below can finish it.
    expect(order).toEqual([]);

    letDeliveryFinish();

    await Promise.all(scheduledPromises);
    // The close is registered as a SECOND task chained behind the first, not
    // beside it: it must not run before the delivery finishes.
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

  it("runs the booking sweep even when the notify-unread sweep throws", async () => {
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
    const sweepDueSpy = spyOn(SweepDueBookingsInternalCommand.prototype, "execute");

    const { ctx, scheduledPromises } = fakeExecutionContext();

    // `scheduled()` itself must not reject: a cron invocation has nobody to
    // report a rejection to, and the fixed shape logs each sweep's own
    // failure instead of letting it propagate past the other sweep.
    await scheduled(fakeController(), ENV, ctx);

    expect(sweepDueSpy).toHaveBeenCalledTimes(1);
    expect(sweepDueSpy.mock.calls[0]?.[0]).toEqual({ limit: BOOKING_SWEEP_LIMIT });
    // Resolved, not merely called — the dev database holds zero due
    // bookings, so this is always { swept: 0, failed: 0 }, same reasoning as
    // test 1's assertion on the notify-unread sweep's own result. `swept`,
    // not `expired`: the sweep gives two of its three clocks an expiry and
    // the third a cancellation, so a count named for one of the two endings
    // would be wrong for whichever bookings got the other — see
    // `SweepDueBookingsInternalCommand.execute`.
    await expect(sweepDueSpy.mock.results[0]?.value).resolves.toEqual({
      swept: 0,
      failed: 0,
    });

    await Promise.all(scheduledPromises);
    notifySpy.mockRestore();
    sweepDueSpy.mockRestore();
  });

  it("runs the charge sweep even when both sweeps before it throw", async () => {
    // The same shape as the test above, one sweep further along. The charge
    // sweep is last in `scheduled`, which makes it the one with the most
    // `try` blocks upstream of it that could swallow it — and it is the only
    // one of the three whose failing silently means a provider blocks their
    // Saturday for a booking nobody was ever asked to pay for.
    //
    // Both predecessors are forced to throw at once, because either of them
    // sharing a `try` with this one would produce the same visible symptom:
    // `chargeAccepted.execute` never called.
    const notifySpy = spyOn(NotifyUnreadInternalCommand.prototype, "execute").mockImplementation(
      async () => {
        throw new Error("notify-unread sweep blew up");
      },
    );
    const sweepDueSpy = spyOn(SweepDueBookingsInternalCommand.prototype, "execute").mockImplementation(
      async () => {
        throw new Error("booking deadline sweep blew up");
      },
    );
    const chargeSpy = spyOn(ChargeAcceptedBookingsInternalCommand.prototype, "execute");

    const { ctx, scheduledPromises } = fakeExecutionContext();

    // Still no rejection out of `scheduled()` itself: a cron invocation has
    // nobody to report one to.
    await scheduled(fakeController(), ENV, ctx);

    expect(chargeSpy).toHaveBeenCalledTimes(1);
    // Its own limit, two orders of magnitude below the sweeps' — a charge is
    // a blocking round trip to a handset, not a database write. Passing
    // `BOOKING_SWEEP_LIMIT` here by copy-paste would budget two hundred
    // minute-long calls into one cron invocation.
    expect(chargeSpy.mock.calls[0]?.[0]).toEqual({ limit: BOOKING_CHARGE_LIMIT });
    // Resolved, not merely called. The dev database holds no booking
    // awaiting a charge, so this is always { attempted: 0, failed: 0 } — and
    // that zero is also what guarantees no real charge is attempted by
    // running this file.
    await expect(chargeSpy.mock.results[0]?.value).resolves.toEqual({
      attempted: 0,
      failed: 0,
    });

    await Promise.all(scheduledPromises);
    notifySpy.mockRestore();
    sweepDueSpy.mockRestore();
    chargeSpy.mockRestore();
  });
});
