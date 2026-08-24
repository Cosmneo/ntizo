import type { Hono } from "hono";
import { createResendWebhookHandler } from "@ntizo/backend/modules/ntizo/write/notification";
import type { NotificationBootstrap } from "@ntizo/backend/modules/ntizo/bounded-contexts/notification";
import type { AppBindings } from "./types";

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
 * therefore still wraps this route. That one is not optional: it establishes
 * the request-scoped infra store the suppression write needs, and closes the
 * postgres pool afterwards.
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
    });

    // The RAW body, never `c.req.json()`. svix verifies the exact bytes that
    // were signed, and re-serialising a parse changes them — different key
    // order, different whitespace — so every real Resend callback would come
    // back 401 and only an unverified route would appear to work.
    const body = await c.req.text();

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
