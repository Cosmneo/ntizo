import { Webhook } from "svix";
import type {
  HandleResendWebhookInternalCommand,
  ResendWebhookEvent,
} from "../../../bounded-contexts/notification/app/use-cases/handle-resend-webhook.internal.command";

/** One inbound webhook, reduced to the two things a signature is computed over. */
export interface WebhookRequest {
  /**
   * The RAW bytes as they arrived, never a re-serialised parse. svix signs the
   * exact string, so `JSON.stringify(JSON.parse(body))` — different key order,
   * different whitespace — verifies as a forgery.
   */
  body: string;
  /** Lower-cased or not; svix normalises the case itself. */
  headers: Record<string, string>;
}

export interface WebhookResponse {
  status: number;
  body: string;
}

/**
 * How many bodies have been refused, counted somewhere that outlives one
 * request.
 *
 * A mutable box rather than a module-scope `let` so the *caller* decides what
 * "since boot" means. The Hono binding keeps one at module scope, which in a
 * Worker is exactly one per isolate; a test hands over a fresh one and gets a
 * deterministic first refusal instead of inheriting whatever ran before it.
 */
export interface RefusalCount {
  count: number;
}

/**
 * Refusals at which a line is written: the first, then every hundredth.
 *
 * The first is the one that matters — see the `catch` below for why a silent
 * 401 is the failure mode this exists to break. The hundredths keep a
 * sustained attack visible without letting an open endpoint write a log line
 * per probe.
 */
function shouldLogRefusal(refused: number): boolean {
  return refused === 1 || refused % 100 === 0;
}

/**
 * Resend's bounce and complaint webhook.
 *
 * **Framework-free on purpose.** It takes a raw body and headers and returns a
 * status, so `packages/backend` never imports Hono — a rule two fitness tests
 * enforce (`fitness-no-framework-in-packages`, `fitness-no-framework-in-read-write`).
 * `svix` is not a web framework and neither test forbids it: it computes an
 * HMAC over a string, which is exactly the decision this file exists to make.
 * The Hono binding lives in `apps/backend/api/src/webhooks.ts`.
 *
 * **The body is verified before it is parsed.** Not merely before it is acted
 * on: parsing attacker-controlled JSON is itself a decision, and svix verifies
 * the exact bytes that were signed. Parsing first and verifying after would
 * mean the signature covers something other than what was read — so the parsed
 * event handed to the command is the one `verify` returns, never a second
 * `JSON.parse` of the same string.
 *
 * **A missing or unusable secret refuses everything, loudly.** The failure it
 * guards is a deploy that forgot the variable — or pasted half of it — which
 * leaves an unverified endpoint open to the internet, worse than one that is
 * down because nobody notices. Both cases answer 500 rather than 401: a 401
 * is indistinguishable from ordinary attacker noise, so Resend would retry,
 * give up, and the endpoint would sit dead with nothing in the log saying so.
 *
 * **A secret that is merely *wrong* cannot reach that 500**, because a
 * well-formed `whsec_…` from the wrong endpoint constructs perfectly and only
 * fails at `verify`. That is the likeliest misconfiguration of the three, so
 * the refusal path logs too — sampled, not per-request. See the `catch`.
 *
 * **Everything the command can decide is a 200.** A provider retries anything
 * else, and an event we chose to ignore was handled successfully. A *thrown*
 * command — a dropped database connection — is deliberately not caught: that
 * one is transient, and a retry is the correct answer to it.
 */
export function createResendWebhookHandler(deps: {
  handleWebhook: HandleResendWebhookInternalCommand;
  secret: string | undefined;
  /** Shared across requests by the caller — see `RefusalCount`. */
  refusals: RefusalCount;
}) {
  return async (req: WebhookRequest): Promise<WebhookResponse> => {
    // console.error, not the logger: getRequestScopedLogger() throws when no
    // scope is set, and nothing sets one on this path — same reasoning as
    // tx-context.ts's drainAfterCommit.
    let webhook: Webhook;
    try {
      if (!deps.secret) throw new Error("RESEND_WEBHOOK_SECRET is not set");
      webhook = new Webhook(deps.secret);
    } catch (error) {
      console.error("[resend-webhook] no usable signing secret — refusing every event", error);
      return { status: 500, body: JSON.stringify({ error: "not configured" }) };
    }

    let event: unknown;
    try {
      event = webhook.verify(req.body, req.headers);
    } catch {
      // The RESPONSE says nothing about why. Telling a caller which check
      // failed is telling them how to pass it, so both a missing header and a
      // signature over different bytes come back byte-identical.
      //
      // The LOG is a different question, and the answer changed. A secret that
      // is well-formed but simply wrong — the other endpoint's, a rotated one,
      // dev's value deployed to prod — constructs fine and lands here, not on
      // the 500 above. Left unlogged, every callback would be refused with
      // nothing anywhere saying so: Resend retries, exhausts, gives up, and
      // the endpoint sits dead exactly as if the secret had been missing. That
      // is the failure the 500 branch exists to prevent, so this branch must
      // not reintroduce it. Sampled rather than per-request because the
      // endpoint is public and unauthenticated, so it collects noise.
      deps.refusals.count += 1;
      if (shouldLogRefusal(deps.refusals.count)) {
        console.error(
          "[resend-webhook] refused a body whose signature did not verify — " +
            "if this is every request, the configured secret is wrong",
          { refusedSinceBoot: deps.refusals.count },
        );
      }
      return { status: 401, body: JSON.stringify({ error: "invalid signature" }) };
    }

    // A signed body still has to be an event-shaped object before anything can
    // read `.type` off it. `JSON.parse("null")` is a valid parse and `null`
    // would throw a TypeError inside the command, surfacing as a 500 that
    // Resend retries forever — for a body no retry can improve.
    //
    // `Array.isArray` is part of the check, not decoration: an array satisfies
    // `typeof === "object"`, so without it the guard is wider than the
    // sentence above claims. An array reaching the command happens to be
    // harmless today (`event.type` is undefined, so it no-ops), but "happens
    // to be harmless" is not the property being asserted here — "this is not
    // a Resend event" is, and an array is not one.
    if (typeof event !== "object" || event === null || Array.isArray(event)) {
      console.error("[resend-webhook] signed body is not an event object — nothing to decide", {
        received: Array.isArray(event) ? "array" : typeof event,
      });
      return { status: 200, body: JSON.stringify({ ok: true }) };
    }

    await deps.handleWebhook.execute(event as ResendWebhookEvent);

    return { status: 200, body: JSON.stringify({ ok: true }) };
  };
}
