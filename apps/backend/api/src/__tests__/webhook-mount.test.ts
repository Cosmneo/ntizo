import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { Webhook } from "svix";
import { infraStore } from "@ntizo/backend/shared/infra";
import { Db } from "@ntizo/backend/shared/infra/database";
import type { AppBindings } from "../types";
// The subject is the mounted app, not the handler: `resend-webhook.test.ts`
// already proves what the handler decides. This file proves the route exists,
// is reached, is outside the CORS middleware, and is fed the bytes that were
// actually signed.
import { app } from "../api";

const SECRET = "whsec_" + Buffer.from("test-secret-at-least-24-bytes").toString("base64");

const ENV = { STAGE: "local", RESEND_WEBHOOK_SECRET: SECRET } as unknown as AppBindings;
const ENV_WITHOUT_SECRET = { STAGE: "local" } as unknown as AppBindings;

/**
 * Every event used here is one the command deliberately ignores
 * (`email.delivered`, `email.opened`), so a 200 is reached without a single
 * database query. A hard bounce would try to write a suppression row, and this
 * app has no database — the route's *mounting* is what is under test, not what
 * a bounce means, which `handle-resend-webhook.test.ts` owns.
 */
function signed(payload: string, extra: Record<string, string> = {}) {
  const id = "msg_mount";
  const timestamp = new Date();
  return {
    method: "POST",
    body: payload,
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": new Webhook(SECRET).sign(id, timestamp, payload),
      ...extra,
    },
  };
}

/**
 * A hard bounce is the only event that reaches the database, and reaching the
 * database is the only way to observe two things this file has to prove: that
 * `configMiddleware` really wraps this route, and that a refused body really
 * never got acted on.
 *
 * `Db.getDbConnection` is swapped rather than a connection seeded, because
 * `configMiddleware` opens its own `infraStore.runAsync` scope that a test
 * cannot reach from outside. Same technique `wait-until.test.ts` uses on
 * `closeDbConnection`.
 */
const originalGetDbConnection = Db.getDbConnection;
afterEach(() => {
  Db.getDbConnection = originalGetDbConnection;
});

function captureDatabaseUse() {
  const seen = {
    asked: 0,
    insideInfraScope: [] as boolean[],
    suppressed: [] as Record<string, unknown>[],
  };

  const query: Record<string, unknown> = {
    then(resolve: (rows: unknown[]) => void) {
      resolve([]);
    },
  };
  for (const step of ["from", "where", "orderBy", "limit"]) {
    query[step] = () => query;
  }

  const drizzleDbClient = {
    select: () => query,
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        onConflictDoNothing: async () => {
          seen.suppressed.push(row);
        },
      }),
    }),
  };

  Db.getDbConnection = () => {
    seen.asked += 1;
    // The discriminator. Without `configMiddleware` in front of this route the
    // real `getDbConnection` would fall through to
    // `infraStore.getConnectionString()` and throw "[infra-store] not
    // initialized" — a 500 Resend retries until it gives up, with the bounce
    // lost and nothing alerting. Recording the answer here separates "the
    // database failed" from "there was no request scope to ask in".
    seen.insideInfraScope.push(infraStore.isInContext());
    return { drizzleDbClient, postgresDbClient: {} } as never;
  };

  return seen;
}

const HARD_BOUNCE = JSON.stringify({
  type: "email.bounced",
  data: { to: ["ana@ntizo.test"], bounce: { type: "Permanent" } },
});

describe("configMiddleware wraps the webhook, not just the routes below it", () => {
  it("suppresses a hard bounce from inside a request scope", async () => {
    // Moving the mount above `app.use("*", configMiddleware)` leaves every
    // other test in this file green — every one of them sends an event the
    // command ignores, precisely so it needs no database. This is the test
    // that notices.
    const seen = captureDatabaseUse();

    const res = await app.request("/api/webhooks/resend", signed(HARD_BOUNCE), ENV);

    expect(res.status).toBe(200);
    expect(seen.suppressed).toHaveLength(1);
    expect(seen.suppressed[0]).toMatchObject({
      email: "ana@ntizo.test",
      reason: "bounce",
    });
    // The whole point. Not "a connection was returned" — this test hands one
    // over unconditionally — but "the code asking for it was inside the scope
    // that would have supplied a real one".
    expect(seen.asked).toBeGreaterThan(0);
    expect(seen.insideInfraScope).not.toContain(false);
  });
});

describe("POST /api/webhooks/resend is actually mounted", () => {
  it("answers a signed event, so the route is reached and not shadowed", async () => {
    const payload = JSON.stringify({ type: "email.delivered", data: { to: ["a@b.test"] } });
    const res = await app.request("/api/webhooks/resend", signed(payload), ENV);

    expect(res.status).toBe(200);
    // `.text()`, not `.json()`: the handler returns a plain `Response`, so
    // Hono infers no response type for this route and `res.json()` is typed
    // `undefined`. Comparing the body as a string says the same thing.
    expect(await res.text()).toBe(JSON.stringify({ ok: true }));
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  it("refuses an unsigned body, and the command never runs", async () => {
    // The status alone proves nothing: under the verify-after-acting break
    // this route still answered 401 while the command suppressed the address
    // the attacker named. `resend-webhook.test.ts` catches that with
    // `cmd.calls`; through the real route there is no spy, so the equivalent —
    // and stronger — assertion is that nothing ever asked for a database. The
    // body is a hard bounce, which is the one event that would.
    const logged = spyOn(console, "error").mockImplementation(() => {});
    const seen = captureDatabaseUse();
    try {
      const res = await app.request(
        "/api/webhooks/resend",
        { method: "POST", body: HARD_BOUNCE, headers: { "content-type": "application/json" } },
        ENV,
      );

      expect(res.status).toBe(401);
      expect(seen.asked).toBe(0);
      expect(seen.suppressed).toEqual([]);
    } finally {
      logged.mockRestore();
    }
  });

  it("refuses everything when the deploy forgot the secret", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const payload = JSON.stringify({ type: "email.delivered", data: { to: ["a@b.test"] } });
      const res = await app.request("/api/webhooks/resend", signed(payload), ENV_WITHOUT_SECRET);

      expect(res.status).toBe(500);
      expect(logged).toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });
});

describe("the binding forwards the bytes that were signed", () => {
  it("verifies a body whose JSON is not in canonical form", async () => {
    // This is the whole guard against `c.req.json()`. The payload below is
    // valid JSON with whitespace and a key order that `JSON.stringify` would
    // not reproduce, so a binding that parses and re-serialises hands svix
    // different bytes from the ones the signature covers — and every real
    // Resend callback comes back 401 while the tests, which sign whatever the
    // binding happens to produce, stay green. Signing these exact bytes and
    // sending them unchanged is what makes that regression visible.
    const payload = '{\n  "data": { "to": ["a@b.test"] },\n  "type": "email.opened"\n}';
    expect(payload).not.toBe(JSON.stringify(JSON.parse(payload)));

    const res = await app.request("/api/webhooks/resend", signed(payload), ENV);

    expect(res.status).toBe(200);
  });
});

describe("the webhook sits outside /api/*'s CORS middleware", () => {
  const ORIGIN = "http://localhost:3000";

  it("does not answer with CORS headers, because a webhook has no origin", async () => {
    const payload = JSON.stringify({ type: "email.delivered", data: { to: ["a@b.test"] } });
    const res = await app.request(
      "/api/webhooks/resend",
      signed(payload, { origin: ORIGIN }),
      ENV,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("and that means something: any other /api/* path does answer with them", async () => {
    // The control. Without it, `toBeNull()` above would also pass if `authCors`
    // were deleted, if the origin stopped being trusted, or if this test simply
    // stopped exercising CORS at all. `http://localhost:3000` is the local
    // stage's landing URL and is on the allowlist, so a path that goes through
    // `authCors` must reflect it — even on a 404, since the middleware sets the
    // header on the way back out.
    const res = await app.request(
      "/api/not-a-real-route",
      { method: "POST", body: "{}", headers: { origin: ORIGIN } },
      ENV,
    );

    expect(res.status).toBe(404);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });
});

describe("an oversized body is refused before it is verified", () => {
  // The signature check cannot run until the whole body is in the isolate, so
  // on the repo's first unauthenticated public POST an anonymous caller would
  // otherwise decide how much memory to allocate. Cloudflare's 100 MB request
  // cap is a bound, not a useful one.
  const OVER_LIMIT = 1024 * 1024 + 1;

  it("refuses a body that really is too large, signed or not", async () => {
    const seen = captureDatabaseUse();
    const res = await app.request(
      "/api/webhooks/resend",
      { method: "POST", body: "x".repeat(OVER_LIMIT), headers: { "content-type": "text/plain" } },
      ENV,
    );

    expect(res.status).toBe(413);
    expect(await res.text()).toBe(JSON.stringify({ error: "payload too large" }));
    expect(seen.asked).toBe(0);
  });

  it("refuses on a declared size, before the body is read at all", async () => {
    // The cheap half: a caller announcing 50 MB is turned away without those
    // bytes ever being buffered. Deliberately paired with a *small* actual
    // body, so only the header check can be what rejected it.
    const res = await app.request(
      "/api/webhooks/resend",
      {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json", "content-length": "52428800" },
      },
      ENV,
    );

    expect(res.status).toBe(413);
  });

  it("lets an ordinary Resend callback through", async () => {
    // The limit must not have grown teeth: a real webhook is a few hundred
    // bytes, three orders of magnitude under it.
    const payload = JSON.stringify({ type: "email.delivered", data: { to: ["a@b.test"] } });
    const res = await app.request("/api/webhooks/resend", signed(payload), ENV);

    expect(res.status).toBe(200);
  });
});
