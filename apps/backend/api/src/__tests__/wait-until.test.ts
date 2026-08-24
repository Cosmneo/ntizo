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
