import type { Hono } from "hono";
import {
  createResendWebhookHandler,
  type RefusalCount,
} from "@ntizo/backend/modules/ntizo/write/notification";
import type { NotificationBootstrap } from "@ntizo/backend/modules/ntizo/bounded-contexts/notification";
import type { AppBindings } from "./types";

/**
 * A body bigger than this is refused before it is buffered.
 *
 * This is the repo's first unauthenticated public POST, and the signature
 * check cannot run until the whole body is in the isolate — so without a
 * bound, an anonymous caller decides how much memory to allocate. Cloudflare
 * caps a request at 100 MB, which is a bound but not a useful one. A Resend
 * webhook is a few hundred bytes; 1 MiB is three orders of magnitude of
 * headroom and still refuses the interesting cases.
 */
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

/**
 * Refusals since this isolate booted.
 *
 * Module scope is what makes "since boot" true: a Worker evaluates this module
 * once per isolate and reuses it across requests, so the first refusal it sees
 * is genuinely the first. Handed to the handler rather than kept there so a
 * test can supply its own and get a deterministic count.
 */
const refusalsSinceBoot: RefusalCount = { count: 0 };

export interface WebhookDeps {
  /** Task 8's command: what a bounce or a complaint means for an address. */
  readonly handleResendWebhook: NotificationBootstrap["useCases"]["internal"]["handleResendWebhook"];
}

/**
 * Inbound provider callbacks. Resend's is the first.
 *
 * **Mounted before `app.use("/api/*", authCors)`, and that is the whole
 * point.** Hono composes every matching handler in *registration* order, so a
 * route registered after that line runs the CORS middleware and a route
 * registered before it does not — verified, not assumed: registered after, a
 * request carrying `Origin: http://localhost:3000` comes back with an
 * `access-control-allow-origin` header; registered before, it does not.
 * A webhook is a server-to-server POST with no origin, and `authCors` exists
 * to police browsers, so running it here would be enforcing a browser rule on
 * something that is not one.
 *
 * It stays *after* `configMiddleware`, which is registered on `*` above and
 * therefore still wraps this route. That one is not optional and the comment
 * is not the guard: move the mount above it and a real hard bounce finds no
 * request-scoped infra store, `getDb()` throws "[infra-store] not
 * initialized", the 500 is retried until Resend gives up, and the bounce is
 * lost with nothing alerting. `webhook-mount.test.ts`'s first describe drives
 * a signed hard bounce through and asserts the connection was asked for from
 * *inside* a scope — every other test in that file uses an event the command
 * ignores, so every other test stays green through that move.
 *
 * The decision — is this body signed, and what does it mean — lives in
 * `packages/backend` (`write/notification/http/`). This file is only the
 * binding: raw bytes and headers in, status out. Two fitness tests fail if
 * that is done the other way round.
 */
export function mountWebhooks(app: Hono<{ Bindings: AppBindings }>, deps: WebhookDeps) {
  app.post("/api/webhooks/resend", async (c) => {
    const handler = createResendWebhookHandler({
      handleWebhook: deps.handleResendWebhook,
      secret: c.env.RESEND_WEBHOOK_SECRET,
      refusals: refusalsSinceBoot,
    });

    // Refused before a byte is buffered, when the sender declares a size.
    // `Content-Length` is absent on a chunked body and can simply lie, so the
    // read below is checked too — but a declared 50 MB never gets allocated.
    const declared = Number(c.req.header("content-length"));
    if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BODY_BYTES) {
      return tooLarge();
    }

    // The RAW body, never `c.req.json()`. svix verifies the exact bytes that
    // were signed, and re-serialising a parse changes them — different key
    // order, different whitespace — so every real Resend callback would come
    // back 401 and only an unverified route would appear to work.
    const body = await c.req.text();

    // The header lied or was missing. `String.length` counts UTF-16 code
    // units, and a UTF-8 encoding is never *fewer* bytes than that, so this
    // rejects only bodies that are certainly over the limit — and it costs
    // nothing, unlike the HMAC it now runs in front of.
    if (body.length > MAX_WEBHOOK_BODY_BYTES) {
      return tooLarge();
    }

    // `Headers.forEach` yields `(value, name)` with the name already
    // lower-cased by the Fetch spec; svix lower-cases again on its side, so
    // the casing of what Resend sent never matters.
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((value, name) => {
      headers[name] = value;
    });

    const res = await handler({ body, headers });

    // A plain Response rather than `c.body(...)`: the handler already decided
    // the status, and `c.body`'s typed status parameter would need a cast back
    // to a literal to accept a number that is genuinely dynamic.
    return new Response(res.body, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  });
}

function tooLarge(): Response {
  // 413, not 401. This one is honest about why, because the size of a request
  // is not a secret and a caller that hits it needs to know it was the size
  // rather than the signature.
  return new Response(JSON.stringify({ error: "payload too large" }), {
    status: 413,
    headers: { "content-type": "application/json" },
  });
}
