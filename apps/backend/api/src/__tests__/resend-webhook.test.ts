import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
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

/**
 * Every handler here gets its OWN refusal counter.
 *
 * The counter is shared across requests in production — that is the point of
 * it — so a test that let handlers share one would have its log assertions
 * depend on which tests ran first. A fresh box per handler makes "the first
 * refusal" mean the first refusal *of this test*.
 */
function handlerFor(cmd: SpyCommand, secret: string | undefined) {
  // `secret` is required and has no default on purpose: with
  // `secret = SECRET`, passing `undefined` explicitly selects the default, so
  // the no-secret test silently exercised the happy path and asserted 500
  // against a 200. Found by that test failing.
  return createResendWebhookHandler({
    handleWebhook: cmd as never,
    secret,
    refusals: { count: 0 },
  });
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
  // Every test in here refuses at least once, and the first refusal a counter
  // sees now writes a line. Silenced so the suite's output stays readable;
  // what the line says is asserted in its own describe below.
  let logged: ReturnType<typeof spyOn<Console, "error">>;
  beforeEach(() => {
    logged = spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    logged.mockRestore();
  });

  it("is refused before it is parsed", async () => {
    const cmd = new SpyCommand();
    const handler = handlerFor(cmd, SECRET);
    const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@b.test"] } });

    const res = await handler({ body, headers: {} });

    expect(res.status).toBe(401);
    // The command must never have run. A route that verifies after acting has
    // not verified anything.
    expect(cmd.calls).toEqual([]);
  });

  it("refuses a body that was tampered with after signing", async () => {
    const cmd = new SpyCommand();
    const handler = handlerFor(cmd, SECRET);
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
    const handler = handlerFor(cmd, SECRET);
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
    const handler = handlerFor(cmd, SECRET);
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
    const handler = handlerFor(cmd, SECRET);
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
    const handler = handlerFor(cmd, SECRET);
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
      const handler = handlerFor(cmd, undefined);
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
      const handler = handlerFor(cmd, "not-a-real-secret");
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

describe("a refusal is silent to the caller but not to the operator", () => {
  /**
   * The gap this closes. Three ways to misconfigure the secret, and only two
   * of them reach the 500 above: absent, and malformed. The third — a
   * well-formed `whsec_…` that simply belongs to something else, which is the
   * likeliest of the three — constructs fine and fails at `verify`. Left
   * unlogged, every Resend callback would come back 401 with nothing anywhere
   * saying so, and the endpoint would sit dead exactly as if the secret were
   * missing. That is the failure the 500 exists to prevent, so the 401 path
   * must not reintroduce it.
   */
  it("logs the first refusal a counter sees, with the hint that names the cause", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const cmd = new SpyCommand();
      const handler = handlerFor(cmd, SECRET);

      const res = await handler({ body: "{}", headers: {} });

      expect(res.status).toBe(401);
      expect(logged).toHaveBeenCalledTimes(1);
      const [message, context] = logged.mock.calls[0]!;
      expect(String(message)).toContain("the configured secret is wrong");
      expect(context).toEqual({ refusedSinceBoot: 1 });
    } finally {
      logged.mockRestore();
    }
  });

  it("then goes quiet, and speaks again every hundredth", async () => {
    // The endpoint is public and unauthenticated, so it collects probes. A
    // line per probe would bury the one line that matters; no line after the
    // first would hide a sustained attack. 1, 100, 200.
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const cmd = new SpyCommand();
      const refusals = { count: 0 };
      const handler = createResendWebhookHandler({
        handleWebhook: cmd as never,
        secret: SECRET,
        refusals,
      });

      for (let i = 0; i < 200; i += 1) {
        await handler({ body: "{}", headers: {} });
      }

      expect(refusals.count).toBe(200);
      expect(logged).toHaveBeenCalledTimes(3);
      expect(logged.mock.calls.map((call) => call[1])).toEqual([
        { refusedSinceBoot: 1 },
        { refusedSinceBoot: 100 },
        { refusedSinceBoot: 200 },
      ]);
      expect(cmd.calls).toEqual([]);
    } finally {
      logged.mockRestore();
    }
  });

  it("counts into the box the caller owns, so 'since boot' is the caller's word", async () => {
    // Production passes one module-scope box for the isolate's whole life. If
    // the counter lived in the handler instead, the binding — which builds a
    // handler per request — would reset it every time and log every refusal.
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const refusals = { count: 0 };
      const perRequest = () =>
        createResendWebhookHandler({
          handleWebhook: new SpyCommand() as never,
          secret: SECRET,
          refusals,
        });

      await perRequest()({ body: "{}", headers: {} });
      await perRequest()({ body: "{}", headers: {} });
      await perRequest()({ body: "{}", headers: {} });

      expect(refusals.count).toBe(3);
      expect(logged).toHaveBeenCalledTimes(1);
    } finally {
      logged.mockRestore();
    }
  });
});

describe("a signed body that cannot be a Resend event", () => {
  /**
   * Reachable only by somebody already holding the secret, so this is
   * tidiness rather than security — but it is deliberate tidiness, and
   * without these tests it reads as dead code to the next person. Deleting
   * the guard makes a signed `null` throw a TypeError inside the command,
   * which surfaces as a 500 and gets retried forever for a body no retry can
   * improve.
   */
  const NOT_EVENTS: Array<[string, string, string]> = [
    ["null", "null", "object"],
    ["a bare number", "123", "number"],
    ["a bare string", '"email.bounced"', "string"],
    // An array satisfies `typeof === "object"`, so it slips past a guard
    // written as `typeof event !== "object" || event === null`. Harmless in
    // itself — `event.type` is undefined and the command no-ops — but the
    // guard claims to reject "not a Resend event", and an array is not one.
    ["an array", '[{"type":"email.bounced"}]', "array"],
  ];

  for (const [name, payload, reported] of NOT_EVENTS) {
    it(`acknowledges ${name} without handing it to the command`, async () => {
      const logged = spyOn(console, "error").mockImplementation(() => {});
      try {
        const cmd = new SpyCommand();
        const handler = handlerFor(cmd, SECRET);

        const res = await handler({ body: payload, headers: sign(payload) });

        // 200: the signature was good, and no retry can make this body better.
        expect(res.status).toBe(200);
        expect(cmd.calls).toEqual([]);
        expect(logged).toHaveBeenCalledTimes(1);
        expect(logged.mock.calls[0]![1]).toEqual({ received: reported });
      } finally {
        logged.mockRestore();
      }
    });
  }

  it("still hands over an ordinary object", async () => {
    // The guard must not have grown teeth. Without this, narrowing it to
    // something absurd would pass every test above.
    const cmd = new SpyCommand();
    const handler = handlerFor(cmd, SECRET);
    const payload = JSON.stringify({ type: "email.opened", data: { to: ["a@b.test"] } });

    const res = await handler({ body: payload, headers: sign(payload) });

    expect(res.status).toBe(200);
    expect(cmd.calls).toHaveLength(1);
  });
});
