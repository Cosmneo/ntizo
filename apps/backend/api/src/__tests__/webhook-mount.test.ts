import { describe, expect, it, spyOn } from "bun:test";
import { Webhook } from "svix";
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

  it("refuses an unsigned body through the real route", async () => {
    const res = await app.request(
      "/api/webhooks/resend",
      {
        method: "POST",
        body: JSON.stringify({ type: "email.bounced", data: { to: ["a@b.test"] } }),
        headers: { "content-type": "application/json" },
      },
      ENV,
    );

    expect(res.status).toBe(401);
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
