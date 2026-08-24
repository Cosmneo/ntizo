import { describe, expect, it, spyOn } from "bun:test";
import { Webhook } from "svix";
import { createResendWebhookHandler } from "@ntizo/backend/modules/ntizo/write/notification";

/**
 * The handler under test lives in `packages/backend`
 * (`write/notification/http/resend-webhook.routes.ts`); the test lives here
 * because signing a body needs `svix`, and because reaching the handler
 * through the package export specifier is itself part of what is being
 * checked — a handler that exists but is not re-exported is a handler the
 * Hono binding cannot import.
 */
const SECRET = "whsec_" + Buffer.from("test-secret-at-least-24-bytes").toString("base64");

class SpyCommand {
  calls: unknown[] = [];
  async execute(e: unknown) {
    this.calls.push(e);
    return { suppressed: true };
  }
}

function sign(payload: string): Record<string, string> {
  const wh = new Webhook(SECRET);
  const id = "msg_test";
  const timestamp = new Date();
  const signature = wh.sign(id, timestamp, payload);
  return {
    "svix-id": id,
    "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "svix-signature": signature,
  };
}

describe("an unsigned or wrongly-signed body", () => {
  it("is refused before it is parsed", async () => {
    const cmd = new SpyCommand();
    const handler = createResendWebhookHandler({ handleWebhook: cmd as never, secret: SECRET });
    const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@b.test"] } });

    const res = await handler({ body, headers: {} });

    expect(res.status).toBe(401);
    // The command must never have run. A route that verifies after acting has
    // not verified anything.
    expect(cmd.calls).toEqual([]);
  });

  it("refuses a body that was tampered with after signing", async () => {
    const cmd = new SpyCommand();
    const handler = createResendWebhookHandler({ handleWebhook: cmd as never, secret: SECRET });
    const original = JSON.stringify({ type: "email.delivered", data: { to: ["a@b.test"] } });
    const headers = sign(original);
    const tampered = JSON.stringify({ type: "email.bounced", data: { to: ["victim@b.test"] } });

    const res = await handler({ body: tampered, headers });

    expect(res.status).toBe(401);
    expect(cmd.calls).toEqual([]);
  });

  it("says nothing about why it refused", async () => {
    // Telling a caller *why* verification failed is telling them how to pass
    // it. The two refusals above fail for different reasons — no headers at
    // all, and a signature over different bytes — and must be indistinguishable
    // from outside.
    const cmd = new SpyCommand();
    const handler = createResendWebhookHandler({ handleWebhook: cmd as never, secret: SECRET });
    const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@b.test"] } });

    const noHeaders = await handler({ body, headers: {} });
    const wrongSignature = await handler({
      body,
      headers: sign(JSON.stringify({ type: "email.delivered" })),
    });

    expect(noHeaders).toEqual(wrongSignature);
    expect(noHeaders.body).toBe(JSON.stringify({ error: "invalid signature" }));
  });
});

describe("a properly signed body", () => {
  it("reaches the command and is acknowledged", async () => {
    const cmd = new SpyCommand();
    const handler = createResendWebhookHandler({ handleWebhook: cmd as never, secret: SECRET });
    const body = JSON.stringify({
      type: "email.bounced",
      data: { to: ["a@b.test"], bounce: { type: "Permanent" } },
    });

    const res = await handler({ body, headers: sign(body) });

    expect(res.status).toBe(200);
    expect(cmd.calls).toHaveLength(1);
  });

  it("hands the command the parsed event, not the raw string", async () => {
    // `verify` returns the parsed payload, and that is what the command is
    // given. Passing `req.body` through instead would type-check (the command
    // takes an interface, and `as never` at the call site erases the mismatch)
    // and then quietly match no event type at all.
    const cmd = new SpyCommand();
    const handler = createResendWebhookHandler({ handleWebhook: cmd as never, secret: SECRET });
    const body = JSON.stringify({
      type: "email.bounced",
      data: { to: ["a@b.test"], bounce: { type: "Permanent" } },
    });

    await handler({ body, headers: sign(body) });

    expect(cmd.calls[0]).toEqual({
      type: "email.bounced",
      data: { to: ["a@b.test"], bounce: { type: "Permanent" } },
    });
  });

  it("acknowledges even when the command finds nothing to do", async () => {
    // 200, not 204 or 202. A provider retries anything else, and an ignored
    // event is a successfully handled event.
    const cmd = new SpyCommand();
    cmd.execute = async () => ({ suppressed: false });
    const handler = createResendWebhookHandler({ handleWebhook: cmd as never, secret: SECRET });
    const body = JSON.stringify({ type: "email.opened", data: { to: ["a@b.test"] } });

    const res = await handler({ body, headers: sign(body) });
    expect(res.status).toBe(200);
  });
});

describe("with no secret configured", () => {
  it("refuses everything rather than accepting everything", async () => {
    // The failure mode this guards is a deploy that forgot the variable: an
    // unverified webhook endpoint open to the internet is worse than one that
    // is down, because nobody notices it.
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const cmd = new SpyCommand();
      const handler = createResendWebhookHandler({
        handleWebhook: cmd as never,
        secret: undefined,
      });
      const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@b.test"] } });

      const res = await handler({ body, headers: sign(body) });
      expect(res.status).toBe(500);
      expect(cmd.calls).toEqual([]);
      // And loudly. A silent 500 is the same invisible outage.
      expect(logged).toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });
});

describe("with an unusable secret configured", () => {
  it("refuses loudly, the way a missing one does — not as a 401", async () => {
    // A secret that is present but malformed (a truncated paste, the wrong
    // value) is a deploy mistake, not an attacker. Letting `new Webhook(...)`
    // throw inside the signature catch would answer 401 forever: Resend would
    // retry, give up, and nobody would learn the endpoint was never working.
    // Same class of failure as an absent secret, so the same 500.
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const cmd = new SpyCommand();
      const handler = createResendWebhookHandler({
        handleWebhook: cmd as never,
        secret: "not-a-real-secret",
      });
      const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@b.test"] } });

      const res = await handler({ body, headers: sign(body) });
      expect(res.status).toBe(500);
      expect(cmd.calls).toEqual([]);
      expect(logged).toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });
});
