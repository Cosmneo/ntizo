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
 * **Everything the command can decide is a 200.** A provider retries anything
 * else, and an event we chose to ignore was handled successfully. A *thrown*
 * command — a dropped database connection — is deliberately not caught: that
 * one is transient, and a retry is the correct answer to it.
 */
export function createResendWebhookHandler(deps: {
  handleWebhook: HandleResendWebhookInternalCommand;
  secret: string | undefined;
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
      // Deliberately no detail, and deliberately not logged per-request:
      // telling a caller *why* verification failed is telling them how to
      // pass it, and an open endpoint collects noise.
      return { status: 401, body: JSON.stringify({ error: "invalid signature" }) };
    }

    // A signed body still has to be an object before anything can read
    // `.type` off it. `JSON.parse("null")` is a valid parse and would throw a
    // TypeError inside the command, which would surface as a 500 and be
    // retried forever — for a body no retry can improve. Acknowledged and
    // logged instead.
    if (typeof event !== "object" || event === null) {
      console.error("[resend-webhook] signed body is not an object — nothing to decide", {
        received: typeof event,
      });
      return { status: 200, body: JSON.stringify({ ok: true }) };
    }

    await deps.handleWebhook.execute(event as ResendWebhookEvent);

    return { status: 200, body: JSON.stringify({ ok: true }) };
  };
}
