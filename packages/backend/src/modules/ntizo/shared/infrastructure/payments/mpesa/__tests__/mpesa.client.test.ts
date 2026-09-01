/**
 * `MpesaClient` against a stub, never the network.
 *
 * **No credential appears in this file.** The key pair below is generated
 * fresh in `beforeAll` and exists only in memory for the length of the run —
 * which is also what makes the token test worth writing: holding the private
 * half lets it prove the bearer really is the API key encrypted with the
 * public one, rather than asserting that some base64 was sent.
 *
 * What a stub cannot prove is that this is the API M-Pesa actually has. That
 * is Step 5's job and it was done by hand against the live sandbox; the
 * bodies below are the shapes that came back from it, not shapes invented
 * here. See `task-5-report.md`.
 */
import { beforeAll, describe, expect, it } from "bun:test";
import { Buffer } from "node:buffer";
import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto";
import {
  MPESA_LOCAL_CODES,
  MpesaClient,
  MpesaSandboxShortcodeInProductionError,
  type MpesaConfig,
} from "../mpesa.client";

/** The API key this file's config carries. A throwaway string, not a credential. */
const API_KEY = "test-api-key-0123456789abcdef";

let publicKeyBase64: string;
let privateKeyPem: string;

beforeAll(() => {
  // 2048 rather than the 4096 the real portal issues: the algorithm and the
  // padding are what is under test, and a smaller modulus keeps the run fast.
  const pair = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  // Exactly how the developer portal hands the public key over: base64 DER,
  // one unbroken line, no PEM framing.
  publicKeyBase64 = Buffer.from(pair.publicKey).toString("base64");
  privateKeyPem = pair.privateKey;
});

function config(over: Partial<MpesaConfig> = {}): MpesaConfig {
  return {
    apiKey: API_KEY,
    publicKey: publicKeyBase64,
    environment: "development",
    origin: "developer.mpesa.vm.co.mz",
    serviceProviderCode: "171717",
    ...over,
  };
}

/**
 * The raw RSA primitive, with no padding removed.
 *
 * `privateDecrypt` with `RSA_PKCS1_PADDING` is refused outright by the
 * runtime ("no longer supported for private decryption") — a Bleichenbacher
 * mitigation, since a padding oracle is only a hazard for the party holding
 * the private key. Encryption with that padding is unaffected, which is why
 * the client can use it and this test cannot simply mirror it. `RSA_NO_PADDING`
 * hands back the whole `m^d mod n` block instead, and `unpadPkcs1` below
 * strips the framing by hand.
 */
function rawDecrypt(bearerBase64: string): Buffer {
  return privateDecrypt(
    { key: privateKeyPem, padding: constants.RSA_NO_PADDING },
    Buffer.from(bearerBase64, "base64"),
  );
}

/**
 * PKCS#1 v1.5 type-2 framing: `0x00 0x02 <at least 8 non-zero random bytes>
 * 0x00 <message>`. Some runtimes drop the leading `0x00` from a `NO_PADDING`
 * result because it is a leading zero of an integer, so the block type is
 * located rather than assumed to be at a fixed index.
 *
 * Test-only, and deliberately not shared with the client: nothing in the
 * product ever decrypts one of these, and a helper that made it look like
 * something did would be worse than this duplication.
 */
function unpadPkcs1(block: Buffer): string {
  const start = block[0] === 0x00 ? 1 : 0;
  expect(block[start]).toBe(0x02);
  const separator = block.indexOf(0x00, start + 1);
  expect(separator).toBeGreaterThan(start + 8);
  return block.subarray(separator + 1).toString("utf8");
}

interface Capture {
  url: string;
  init: RequestInit;
}

/** A stub `fetch` that records what it was asked and answers with what it was given. */
function stub(answer: () => Response | Promise<Response>) {
  const calls: Capture[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return answer();
  };
  return { calls, fetchImpl };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const REQUEST = {
  msisdn: "258841234567",
  amount: 1500,
  transactionReference: "AABBCCDDEEFF001101",
  thirdPartyReference: "0123456789ABCDEF0123",
};

describe("MpesaClient.c2b", () => {
  it("treats INS-0 as the money having moved, and keeps M-Pesa's own transaction id", async () => {
    const { fetchImpl } = stub(() =>
      json({
        output_ResponseCode: "INS-0",
        output_ResponseDesc: "Request processed successfully",
        output_TransactionID: "7SHV1234567",
        output_ConversationID: "conv-1",
        output_ThirdPartyReference: REQUEST.thirdPartyReference,
      }),
    );

    const result = await new MpesaClient(config(), fetchImpl).c2b(REQUEST);

    expect(result).toEqual({
      outcome: "paid",
      transactionId: "7SHV1234567",
      conversationId: "conv-1",
    });
  });

  /**
   * The three refusals this file cares about are all *real*: `INS-9` is what
   * the live sandbox returned after 62 seconds for a handset that never
   * answered, `INS-2051` for a malformed MSISDN, `INS-13` for a negative
   * amount. Each carries the provider's own description through untouched —
   * this is the only record of why a charge did not land, and a sentence of
   * ours in Vodacom's mouth would be a guess.
   */
  it.each([
    ["INS-9", "Request timeout", 408],
    ["INS-2051", "MSISDN invalid.", 400],
    ["INS-13", "Invalid Amount Used", 400],
    ["INS-16", "Unable to handle the request due to a temporary overloading", 503],
  ])("treats %s as a refusal carrying the provider's own words", async (code, desc, status) => {
    const { fetchImpl } = stub(() =>
      json(
        {
          output_ResponseCode: code,
          output_ResponseDesc: desc,
          output_TransactionID: "",
          output_ConversationID: "",
        },
        status,
      ),
    );

    const result = await new MpesaClient(config(), fetchImpl).c2b(REQUEST);

    expect(result).toEqual({ outcome: "refused", code, description: desc });
  });

  /**
   * Not a hypothetical: the sandbox sits behind Imperva, which answers with
   * an HTML `403 Forbidden` when it dislikes a request and an HTML
   * `504 Gateway Time-out` when the upstream outlasts its patience. Both were
   * observed against the live host. A client that assumed a JSON body would
   * throw a `SyntaxError` out of a cron sweep for a routine WAF response.
   */
  it("treats an HTML error page as a refusal rather than a crash", async () => {
    const { fetchImpl } = stub(
      () =>
        new Response("<html><body><h1>504 Gateway Time-out</h1></body></html>", {
          status: 504,
          headers: { "Content-Type": "text/html" },
        }),
    );

    const result = await new MpesaClient(config(), fetchImpl).c2b(REQUEST);

    expect(result.outcome).toBe("refused");
    expect(result).toMatchObject({ code: MPESA_LOCAL_CODES.unreadable });
    // The status survives into the description: without it, "could not read
    // the body" says nothing about which body.
    expect((result as { description: string }).description).toContain("504");
  });

  it("treats JSON with no response code as unreadable too", async () => {
    const { fetchImpl } = stub(() => json({ something: "else" }));

    const result = await new MpesaClient(config(), fetchImpl).c2b(REQUEST);

    expect(result).toMatchObject({ outcome: "refused", code: MPESA_LOCAL_CODES.unreadable });
  });

  /**
   * `INS-0` is the answer that moves money, and `output_TransactionID` is the
   * only handle on the money it moved — it becomes `paymentRef`, which
   * `Booking.markPaid` deduplicates on and which a refund would have to name.
   * Recording a payment with an empty reference is worse than recording a
   * failure, so this is refused rather than accepted with a blank.
   */
  it.each([
    ["missing", { output_ResponseCode: "INS-0", output_ResponseDesc: "ok" }],
    ["empty", { output_ResponseCode: "INS-0", output_ResponseDesc: "ok", output_TransactionID: "" }],
  ])("refuses an INS-0 whose transaction id is %s", async (_label, body) => {
    const { fetchImpl } = stub(() => json(body));

    const result = await new MpesaClient(config(), fetchImpl).c2b(REQUEST);

    expect(result).toMatchObject({
      outcome: "refused",
      code: MPESA_LOCAL_CODES.missingTransactionId,
    });
  });

  it("turns a rejected fetch into a refusal, not a throw", async () => {
    const fetchImpl = async () => {
      throw new Error("The operation timed out.");
    };

    const result = await new MpesaClient(config(), fetchImpl).c2b(REQUEST);

    expect(result).toEqual({
      outcome: "refused",
      code: MPESA_LOCAL_CODES.transport,
      description: "The operation timed out.",
    });
  });

  it("posts the request M-Pesa documents, on the port it documents", async () => {
    const { calls, fetchImpl } = stub(() =>
      json({ output_ResponseCode: "INS-0", output_TransactionID: "T1" }),
    );

    await new MpesaClient(config(), fetchImpl).c2b(REQUEST);

    const [call] = calls;
    expect(call?.url).toBe("https://api.sandbox.vm.co.mz:18352/ipg/v1x/c2bPayment/singleStage/");
    expect(call?.init.method).toBe("POST");
    expect(JSON.parse(String(call?.init.body))).toEqual({
      input_TransactionReference: REQUEST.transactionReference,
      input_CustomerMSISDN: REQUEST.msisdn,
      input_Amount: 1500,
      input_ThirdPartyReference: REQUEST.thirdPartyReference,
      input_ServiceProviderCode: "171717",
    });
  });

  /**
   * **The production stanza used to be guarded by a comment.**
   * `wrangler.jsonc`'s prod block carries `MPESA_ENVIRONMENT: "production"`
   * next to `MPESA_SERVICE_PROVIDER_CODE: "171717"` — Vodacom's shared
   * sandbox shortcode — with a note saying it must be replaced before the
   * stage takes real money. That note is honest and it is not a gate: one
   * deploy with it unread and every customer's payment lands in a test
   * merchant's wallet. These three tests are the gate.
   *
   * Neither value is wrong alone, which is why the guard is a pairing and why
   * the two passing cases below are as load-bearing as the failing one: a
   * check that refused the sandbox shortcode outright would break every
   * sandbox stage, and one that refused the production environment outright
   * would break production.
   */
  it("refuses to charge at all when production still carries the sandbox shortcode", async () => {
    const { calls, fetchImpl } = stub(() =>
      json({ output_ResponseCode: "INS-0", output_TransactionID: "T1" }),
    );
    const client = new MpesaClient(
      config({ environment: "production", serviceProviderCode: "171717" }),
      fetchImpl,
    );

    // A throw, not a `{ outcome: "refused" }`. See the error class's own doc
    // comment: a refusal here would be counted as an ordinary failed charge
    // and would look exactly like a platform full of customers ignoring their
    // prompts.
    await expect(client.c2b(REQUEST)).rejects.toThrow(MpesaSandboxShortcodeInProductionError);
    // And nothing reached the network. The point is that no money moves, not
    // that we find out about it afterwards.
    expect(calls).toHaveLength(0);

    // Both values are in the message, so the diagnosis does not require
    // opening two files.
    const error = (await client.c2b(REQUEST).catch((e: unknown) => e)) as Error;
    expect(error.message).toContain("production");
    expect(error.message).toContain("171717");
  });

  it("allows the sandbox shortcode against the sandbox, which is how every stage but prod runs", async () => {
    const { fetchImpl } = stub(() =>
      json({ output_ResponseCode: "INS-0", output_TransactionID: "T1" }),
    );

    const result = await new MpesaClient(
      config({ environment: "development", serviceProviderCode: "171717" }),
      fetchImpl,
    ).c2b(REQUEST);

    expect(result.outcome).toBe("paid");
  });

  it("allows production once it carries a shortcode of its own", async () => {
    const { fetchImpl } = stub(() =>
      json({ output_ResponseCode: "INS-0", output_TransactionID: "T1" }),
    );

    const result = await new MpesaClient(
      config({ environment: "production", serviceProviderCode: "900123" }),
      fetchImpl,
    ).c2b(REQUEST);

    expect(result.outcome).toBe("paid");
  });

  it("points at the production host when the stage is not development", async () => {
    const { calls, fetchImpl } = stub(() =>
      json({ output_ResponseCode: "INS-0", output_TransactionID: "T1" }),
    );

    // A shortcode of its own, not the sandbox's — the guard above refuses
    // that pairing outright, so this test cannot use the default config.
    await new MpesaClient(
      config({ environment: "production", serviceProviderCode: "900123" }),
      fetchImpl,
    ).c2b(REQUEST);

    expect(calls[0]?.url).toStartWith("https://api.vm.co.mz:18352/");
  });

  /**
   * The `User-Agent` is not decoration. Against the live sandbox, the
   * identical request differs only by this header between an HTML `403` from
   * the WAF in front of the gateway and a real `INS-*` answer from the
   * gateway itself. Nothing in Vodacom's documentation says so, so nothing
   * but a test will notice if it is ever dropped as noise.
   */
  it("sends the Origin and User-Agent headers the gateway requires", async () => {
    const { calls, fetchImpl } = stub(() =>
      json({ output_ResponseCode: "INS-0", output_TransactionID: "T1" }),
    );

    await new MpesaClient(config(), fetchImpl).c2b(REQUEST);

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["Origin"]).toBe("developer.mpesa.vm.co.mz");
    expect(headers["User-Agent"]).toBeTruthy();
    expect(headers["Content-Type"]).toBe("application/json");
  });

  /**
   * The whole authentication scheme, proved rather than asserted: the bearer
   * is the API key RSA-encrypted (PKCS#1 v1.5) with the portal's public key
   * and base64'd. Decrypting it with the private half — which only this test
   * has — is the only way to show it is the key and not some other base64.
   *
   * It also pins the shape of the handshake. There is no session exchange on
   * this API version, which is worth a test rather than a comment: both
   * `getSession` endpoints answer `403` against credentials this scheme
   * succeeds with, so anybody who "fixes" this by adding a session step would
   * be adding a request that fails.
   */
  it("signs with the API key encrypted under the portal's public key", async () => {
    const { calls, fetchImpl } = stub(() =>
      json({ output_ResponseCode: "INS-0", output_TransactionID: "T1" }),
    );

    await new MpesaClient(config(), fetchImpl).c2b(REQUEST);

    const headers = calls[0]?.init.headers as Record<string, string>;
    const bearer = headers["Authorization"]?.replace("Bearer ", "") ?? "";

    expect(unpadPkcs1(rawDecrypt(bearer))).toBe(API_KEY);
    // Exactly one request. A session exchange would be two.
    expect(calls).toHaveLength(1);
  });

  /**
   * PKCS#1 v1.5 padding is randomised, so two encryptions of the same key are
   * different ciphertexts — which is why the token is minted per request
   * rather than cached, and why the test above decrypts instead of comparing
   * strings. Written down so a future "optimisation" that caches the header
   * and compares it against a fixture has something to fail against.
   */
  it("mints a fresh token per request", async () => {
    const { calls, fetchImpl } = stub(() =>
      json({ output_ResponseCode: "INS-0", output_TransactionID: "T1" }),
    );
    const client = new MpesaClient(config(), fetchImpl);

    await client.c2b(REQUEST);
    await client.c2b(REQUEST);

    const first = (calls[0]?.init.headers as Record<string, string>)["Authorization"];
    const second = (calls[1]?.init.headers as Record<string, string>)["Authorization"];
    expect(first).not.toBe(second);
  });
});
