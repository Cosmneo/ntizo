import { afterEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { infraStore } from "@ntizo/backend/shared/infra";
import { Db } from "@ntizo/backend/shared/infra/database";
import { configMiddleware } from "../middlewares/config.middleware";
import type { AppBindings } from "../types";

/**
 * Why this test exists.
 *
 * `configMiddleware` releases the per-request postgres pool from a `finally`,
 * on `waitUntil`, because a Worker runs nothing after the response otherwise.
 * Delivering an email is now scheduled on `waitUntil` too — and it needs that
 * same `{ max: 1 }` connection for recipients, suppressions and delivery rows.
 *
 * Cloudflare does not order `waitUntil` tasks against each other. Two
 * independent tasks means the close can win, the delivery's queries fail, and
 * — because it is a race — `wrangler dev` forgives it locally while production
 * fails intermittently. A green local run would prove nothing, so the ordering
 * is asserted here instead: these tests fail if the close is ever scheduled
 * beside deferred work rather than behind it.
 */
const ENV = {} as AppBindings;

function fakeExecutionContext() {
  const scheduled: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(promise: Promise<unknown>) {
      scheduled.push(promise);
    },
    passThroughOnException() {},
    props: {},
  };
  return { ctx: ctx as unknown as ExecutionContext, scheduled };
}

const originalClose = Db.closeDbConnection;
afterEach(() => {
  Db.closeDbConnection = originalClose;
});

function appThatDefers(order: string[], delayMs: number) {
  const app = new Hono<{ Bindings: AppBindings }>();
  app.use("*", configMiddleware);
  app.get("/", (c) => {
    infraStore.waitUntil(
      (async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        order.push("delivery");
      })(),
    );
    return c.text("ok");
  });
  return app;
}

describe("the per-request pool closes behind deferred work", () => {
  it("closes only after deferred work has finished", async () => {
    const order: string[] = [];
    Db.closeDbConnection = async () => {
      order.push("close");
    };

    const { ctx, scheduled } = fakeExecutionContext();
    const res = await appThatDefers(order, 20).fetch(new Request("http://api.test/"), ENV, ctx);

    expect(res.status).toBe(200);
    // The response did not pay for the delivery.
    expect(order).toEqual([]);

    await Promise.all(scheduled);
    expect(order).toEqual(["delivery", "close"]);
  });

  it("closes behind deferred work even with no execution context", async () => {
    // `c.executionCtx` throws here rather than returning undefined, so the
    // middleware falls back to running the same chain unscheduled. The
    // ordering must not change with it.
    const order: string[] = [];
    Db.closeDbConnection = async () => {
      order.push("close");
    };

    const res = await appThatDefers(order, 10).request("/", {}, ENV);

    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(order).toEqual(["delivery", "close"]);
  });

  it("closes behind deferred work even when what it wraps rejects", async () => {
    // The `finally` is the only thing that makes this true, and nothing
    // asserted it until now: every other test in this file returns normally,
    // so replacing `try { return await next() } finally { … }` with a
    // straight-line `await next()` followed by the same block leaves all of
    // them green.
    //
    // What that costs is no longer just a leaked socket. That block is now the
    // sole thing that runs `settleDeferredWork()`, which is the sole thing
    // awaiting an in-flight email delivery — so on a rejecting request the
    // delivery promise floats with nothing awaiting it while this request's
    // `{ max: 1 }` pool stays checked out until `max_lifetime` (5 minutes).
    // Under `wrangler dev` the delivery still completes, so a local run would
    // not show it either.
    //
    // Invoked directly rather than through a Hono app, deliberately. Hono's
    // default error handler catches an `Error` thrown by a route handler at
    // *that handler's own* `dispatch` level and turns it into a 500 there, so
    // `next()` resolves and an app-driven test cannot tell the two shapes
    // apart. What still reaches this `await next()` in production is whatever
    // Hono re-raises — a non-`Error` throw, an `onError` that itself fails —
    // and, more to the point, this middleware's cleanup must not owe its
    // correctness to a framework detail it does not control.
    const order: string[] = [];
    Db.closeDbConnection = async () => {
      order.push("close");
    };

    const { ctx, scheduled } = fakeExecutionContext();
    const c = { env: ENV, executionCtx: ctx } as unknown as Parameters<
      typeof configMiddleware
    >[0];

    const failing = configMiddleware(c, async () => {
      // The ordinary shape: something raised a notification, the delivery was
      // deferred, and then the request failed for an unrelated reason.
      infraStore.waitUntil(
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          order.push("delivery");
        })(),
      );
      throw new Error("the handler failed after raising a notification");
    });

    await expect(failing).rejects.toThrow("the handler failed after raising a notification");
    // Scheduled by the time the rejection surfaced, not merely eventually: the
    // delivery, and the close chained behind it. This is the assertion that
    // goes red if the block ever stops being a `finally` — a straight-line
    // version schedules only the delivery.
    expect(scheduled).toHaveLength(2);
    await Promise.all(scheduled);
    expect(order).toEqual(["delivery", "close"]);
  });

  it("still closes when nothing was deferred", async () => {
    const order: string[] = [];
    Db.closeDbConnection = async () => {
      order.push("close");
    };

    const app = new Hono<{ Bindings: AppBindings }>();
    app.use("*", configMiddleware);
    app.get("/", (c) => c.text("ok"));

    const { ctx, scheduled } = fakeExecutionContext();
    await app.fetch(new Request("http://api.test/"), ENV, ctx);
    await Promise.all(scheduled);

    expect(order).toEqual(["close"]);
  });

  it("registers the platform's waitUntil for code that never sees the request", async () => {
    // The whole point of carrying it through the store: a use case deep in a
    // bounded context can defer work without knowing Hono exists.
    let registered = false;
    const app = new Hono<{ Bindings: AppBindings }>();
    app.use("*", configMiddleware);
    app.get("/", (c) => {
      infraStore.waitUntil(Promise.resolve());
      registered = true;
      return c.text("ok");
    });

    Db.closeDbConnection = async () => {};
    const { ctx, scheduled } = fakeExecutionContext();
    await app.fetch(new Request("http://api.test/"), ENV, ctx);

    expect(registered).toBe(true);
    // The deferred promise and the close chained behind it.
    expect(scheduled).toHaveLength(2);
    await Promise.all(scheduled);
  });
});
