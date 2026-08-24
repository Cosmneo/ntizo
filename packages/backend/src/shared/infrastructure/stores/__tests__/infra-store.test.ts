import { describe, expect, it } from "bun:test";
import { infraStore } from "../infra-store";

const env = {
  STAGE: "local" as const,
  LOG_LEVEL: "info",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "s",
  RESEND_API_KEY: "",
  EMAIL_FROM: "a@b.c",
  APP_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  MICROSOFT_CLIENT_ID: "",
  MICROSOFT_CLIENT_SECRET: "",
};

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("infraStore.waitUntil", () => {
  it("passes the promise to the platform when one is registered", async () => {
    const scheduled: Promise<unknown>[] = [];
    await infraStore.runAsync(env, async () => {
      infraStore.setWaitUntil((p) => {
        scheduled.push(p);
      });
      infraStore.waitUntil(Promise.resolve("done"));
      expect(scheduled).toHaveLength(1);
      await infraStore.settleDeferredWork();
    });
  });

  it("runs the work anyway when no platform waitUntil was registered", async () => {
    let ran = false;
    await infraStore.runAsync(env, async () => {
      infraStore.waitUntil(
        (async () => {
          await tick(5);
          ran = true;
        })(),
      );
      expect(ran).toBe(false);
      await infraStore.settleDeferredWork();
    });
    expect(ran).toBe(true);
  });

  it("does not throw outside a request scope", () => {
    // A script or a test calling into code that defers. There is nothing to
    // record it on and nothing to hand it to; refusing would be worse.
    expect(() => infraStore.waitUntil(Promise.resolve())).not.toThrow();
  });

  it("swallows a rejection instead of letting it reach the platform", async () => {
    const scheduled: Promise<unknown>[] = [];
    await infraStore.runAsync(env, async () => {
      infraStore.setWaitUntil((p) => {
        scheduled.push(p);
      });
      infraStore.waitUntil(Promise.reject(new Error("boom")));
      // A rejection handed to ctx.waitUntil is an unhandled rejection in the
      // isolate, with nothing left to say about where it came from.
      await expect(Promise.all(scheduled)).resolves.toBeDefined();
      await expect(infraStore.settleDeferredWork()).resolves.toBeUndefined();
    });
  });
});

describe("infraStore.settleDeferredWork", () => {
  it("waits for everything deferred on this request", async () => {
    const order: string[] = [];
    await infraStore.runAsync(env, async () => {
      infraStore.waitUntil(tick(15).then(() => void order.push("slow")));
      infraStore.waitUntil(tick(1).then(() => void order.push("fast")));
      await infraStore.settleDeferredWork();
      order.push("settled");
    });
    expect(order).toEqual(["fast", "slow", "settled"]);
  });

  it("drains work that deferred work schedules of its own", async () => {
    // Deferred work inherits this AsyncLocalStorage scope, so it can call
    // waitUntil again. A single allSettled snapshot would return before that
    // second wave — and, in the middleware, close the connection under it.
    let inner = false;
    await infraStore.runAsync(env, async () => {
      infraStore.waitUntil(
        (async () => {
          await tick(5);
          infraStore.waitUntil(
            (async () => {
              await tick(5);
              inner = true;
            })(),
          );
        })(),
      );
      await infraStore.settleDeferredWork();
    });
    expect(inner).toBe(true);
  });

  it("does not wait for another request's deferred work", async () => {
    let other = false;
    const outer = infraStore.runAsync(env, async () => {
      infraStore.waitUntil(
        (async () => {
          await tick(30);
          other = true;
        })(),
      );
      await tick(1);
    });
    await infraStore.runAsync(env, async () => {
      await infraStore.settleDeferredWork();
      expect(other).toBe(false);
    });
    await outer;
  });

  it("resolves immediately outside a request scope", async () => {
    await expect(infraStore.settleDeferredWork()).resolves.toBeUndefined();
  });
});
