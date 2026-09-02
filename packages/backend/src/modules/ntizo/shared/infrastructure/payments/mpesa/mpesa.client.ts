import { Buffer } from "node:buffer";
import { constants, createPublicKey, publicEncrypt } from "node:crypto";

/**
 * The one response code that means the customer typed their PIN and the
 * money moved. Everything else — including `INS-9`, the ~60-second timeout a
 * customer who never answers produces — is a refusal carrying the provider's
 * own words.
 */
export const MPESA_SUCCESS_CODE = "INS-0";

/**
 * Codes this client invents for failures the API never got far enough to
 * name. Prefixed `NTIZO-` precisely so nobody reading a log can mistake one
 * for something Vodacom said: every code the API produces is `INS-<n>`, and
 * a synthetic code that looked like one would send whoever is diagnosing a
 * failure to the wrong documentation.
 */
export const MPESA_LOCAL_CODES = {
  /** `fetch` itself rejected — DNS, TLS, a dropped connection, or our own abort. */
  transport: "NTIZO-TRANSPORT",
  /**
   * The bearer token could not be minted: the public key would not parse, or
   * this runtime cannot do PKCS#1 v1.5 encryption.
   *
   * **Its own code rather than `transport`, and that is the entire point of
   * it.** Both used to come back as `NTIZO-TRANSPORT`, which made a platform
   * whose crypto does not work indistinguishable in the logs from a platform
   * where every customer ignored their prompt. Nothing in this path has ever
   * run inside workerd; if `publicEncrypt` turns out not to work there, this
   * is the code that says so on the first charge instead of a month later.
   *
   * A `refused`, not an `ambiguous`: the request never left, so no prompt is
   * live and nothing could have been debited.
   */
  crypto: "NTIZO-CRYPTO-FAILED",
  /**
   * A response arrived and was not the JSON envelope this client understands.
   *
   * Not hypothetical: the sandbox sits behind Imperva, which answers with an
   * HTML `403 Forbidden` when it dislikes a request and an HTML
   * `504 Gateway Time-out` when the C2B leg takes longer than its own
   * patience. Both are `text/html`, and both used to be indistinguishable
   * from a crash if this client had assumed a body it could parse.
   */
  unreadable: "NTIZO-UNREADABLE-RESPONSE",
  /**
   * `INS-0` with nothing in it this client could read as a transaction id.
   *
   * Success without the one field that identifies what succeeded is not
   * something to record as a payment: `paymentRef` is what
   * `Booking.markPaid` deduplicates on and what a refund would have to name,
   * so an empty one is worse than a failure.
   *
   * **Reaching this is the most expensive way this client can be wrong**, so
   * it is deliberately hard to reach — `readTransactionId` tries the
   * documented key, then any spelling of it, before giving up, and the whole
   * response body is logged on every `INS-0` regardless. See both for why:
   * the field name is the one part of this integration never confirmed
   * against a live success.
   */
  missingTransactionId: "NTIZO-MISSING-TRANSACTION-ID",
} as const;

/**
 * The three outcomes that mean **we do not know whether the customer's money
 * moved**, as opposed to knowing it did not.
 *
 * The distinction decides whether a retry is safe, and it is the difference
 * between one debit and two. `chargeReference` is deliberately different on
 * every attempt so the processor cannot refuse a retry as a duplicate — which
 * means nothing about a retry is idempotent, and pushing a second prompt over
 * a possibly-live first one is a customer who can accept both.
 *
 * - `transport` — the socket died, or our own abort fired at 110s. The prompt
 *   may well still be on the handset.
 * - `unreadable` — the WAF answered HTML. **Measured**, not theoretical: the
 *   sandbox's Imperva front end returns a `504` at ~31s while Vodacom is
 *   still waiting for the customer. The prompt is definitely still live.
 * - `missingTransactionId` — `INS-0` with nothing readable as a receipt. Here
 *   we know the money *did* move; what is ambiguous is only whether we can
 *   ever name it. Retrying is the worst of the three.
 */
export const MPESA_AMBIGUOUS_CODES: readonly string[] = [
  MPESA_LOCAL_CODES.transport,
  MPESA_LOCAL_CODES.unreadable,
  MPESA_LOCAL_CODES.missingTransactionId,
];

/**
 * How long to wait on one C2B before giving up.
 *
 * The API's own patience is about sixty seconds — measured against the live
 * sandbox, `INS-9 Request timeout` came back at 62s for a handset that never
 * answered. This is that plus headroom, so the abort below is a backstop for
 * a connection that has genuinely gone away rather than a second, shorter
 * deadline racing the provider's own. Without any limit a hung socket would
 * hold the cron invocation until the platform killed it, taking every
 * booking queued behind it in the same wave with it.
 *
 * **Exported because the sweep has to budget for it.** A booking whose
 * payment window is shorter than this call cannot survive being charged —
 * the deadline sweep would cancel it while the call is still blocking, and
 * the customer would be debited for a booking already called off. So
 * `BOOKING_CHARGE_MIN_WINDOW_MS` has to be larger than this number, and a
 * test asserts it: see `charge-booking.command.test.ts`.
 */
export const C2B_TIMEOUT_MS = 110_000;

/**
 * The environment string that selects the sandbox host. Anything else is the
 * live gateway.
 */
const SANDBOX_ENVIRONMENT = "development";

/**
 * Vodacom's sandbox merchant shortcode. Every integrator on the planet
 * collects into it, which is exactly what makes it safe in a sandbox and
 * catastrophic against the live gateway: a production charge carrying this
 * code is a real customer's money moving to a shared test merchant.
 *
 * Named here rather than left as a literal in `wrangler.jsonc` alone,
 * because a value that must never appear in one configuration needs to be
 * something code can compare against — see `assertNotSandboxShortcodeInProduction`.
 */
const SANDBOX_SERVICE_PROVIDER_CODE = "171717";

/**
 * The one configuration this client refuses to act on.
 *
 * Not a `PaymentChargeResult` failure like every other refusal in this flow,
 * and deliberately so. Those describe a charge that did not land — an
 * ordinary outcome, counted against the retry bound, ending in a booking the
 * payment window cancels. This describes a *deployment* that must not be
 * allowed to charge anybody, and treating it as an ordinary failure would
 * mean it fails quietly three times per booking and looks exactly like a
 * platform full of customers who ignored their prompts.
 *
 * A thrown error instead reaches `ChargeAcceptedBookingsInternalCommand`'s
 * per-booking `try`, is counted as a *failure* rather than an attempt, and
 * puts `[scheduled] booking charge sweep: N attempted, M failed` in the
 * Worker's logs — the one line in this flow that is only ever printed when
 * something is actually wrong.
 */
export class MpesaSandboxShortcodeInProductionError extends Error {
  constructor(
    readonly environment: string,
    readonly serviceProviderCode: string,
  ) {
    super(
      `Refusing to charge: MPESA_ENVIRONMENT="${environment}" points at the live gateway ` +
        `while MPESA_SERVICE_PROVIDER_CODE="${serviceProviderCode}" is Vodacom's shared sandbox ` +
        `shortcode. A charge on this configuration would move a real customer's money to a test ` +
        `merchant. Set this stage's own shortcode, or set MPESA_ENVIRONMENT="${SANDBOX_ENVIRONMENT}".`,
    );
    this.name = "MpesaSandboxShortcodeInProductionError";
  }
}

/**
 * The mirror of the error above, and harmless to money rather than
 * catastrophic — which is exactly why it needs a gate of its own.
 *
 * A stage that is issued a real shortcode and sets it, but forgets to move
 * `MPESA_ENVIRONMENT` off its default, talks to the **sandbox host with a
 * live shortcode**. Vodacom's sandbox knows one merchant, `171717`, so every
 * charge answers `INS-13 Invalid Shortcode Used` — and from the outside that
 * is indistinguishable from a platform where every customer happens to be
 * ignoring their prompt. Bookings quietly exhaust their retry bound and get
 * cancelled telling providers the customer did not pay.
 *
 * Loud, therefore, on the same reasoning as its opposite: a silent failure
 * that costs providers their Saturdays is not better than one that costs
 * money, it is only harder to find.
 */
export class MpesaLiveShortcodeInSandboxError extends Error {
  constructor(
    readonly environment: string,
    readonly serviceProviderCode: string,
  ) {
    super(
      `Refusing to charge: MPESA_ENVIRONMENT="${environment}" points at the sandbox, whose only ` +
        `merchant is the shared shortcode "${SANDBOX_SERVICE_PROVIDER_CODE}", but ` +
        `MPESA_SERVICE_PROVIDER_CODE="${serviceProviderCode}". Every charge on this configuration ` +
        `would fail as an unknown shortcode. Set MPESA_ENVIRONMENT to this stage's real ` +
        `environment, or use the sandbox shortcode.`,
    );
    this.name = "MpesaLiveShortcodeInSandboxError";
  }
}

/**
 * The port each operation is served on. Vodacom's gateway puts every IPG
 * operation on its own port of the same host — C2B is 18352, B2C 18345,
 * reversal 18354 — so the port is part of the endpoint, not a deployment
 * detail. Only the one this file makes is named here; the others arrive with
 * the code that calls them.
 */
const C2B_PORT = "18352";

const C2B_PATH = "/ipg/v1x/c2bPayment/singleStage/";

/**
 * Sent on every request, and **not optional**.
 *
 * The gateway is fronted by Imperva, which answers a request with no
 * `User-Agent` with an HTML `403 Forbidden` (or, once the upstream is slow, a
 * `504`) before Vodacom ever sees it. Confirmed against the live sandbox: the
 * identical request differs only by this header between "403 from a WAF" and
 * a real `INS-*` answer. Nothing in Vodacom's own documentation says so,
 * which is exactly why it is written down here.
 */
const USER_AGENT = "ntizo-api";

export interface MpesaConfig {
  /** The portal-issued API key. Encrypted with `publicKey` to form the bearer token. */
  readonly apiKey: string;
  /**
   * The portal-issued public key, base64 DER (SPKI) — exactly the single
   * line the portal shows, with no PEM header, footer or line breaks. Those
   * are added here.
   */
  readonly publicKey: string;
  /** `development` selects the sandbox host, anything else the production one. */
  readonly environment: string;
  /** The `Origin` header the gateway expects — `developer.mpesa.vm.co.mz`. */
  readonly origin: string;
  /** The merchant shortcode being paid. `171717` in the sandbox. */
  readonly serviceProviderCode: string;
}

export interface MpesaC2BRequest {
  /** `258XXXXXXXXX` — see `toMpesaMsisdn`, which is the only thing that should produce one. */
  readonly msisdn: string;
  /**
   * **Major units**, not minor. Everything else in this codebase counts
   * money in integer minor units; this API does not, and this is the seam
   * where that stops being true. See `MpesaPaymentCharge.charge` for the
   * conversion and its tests.
   */
  readonly amount: number;
  /** Ours, and what the customer's statement shows. Alphanumeric, ≤ 20 characters. */
  readonly transactionReference: string;
  /** Ours too, echoed back on the response for correlation. Alphanumeric, ≤ 20 characters. */
  readonly thirdPartyReference: string;
}

export type MpesaC2BResponse =
  | {
      readonly outcome: "paid";
      /** M-Pesa's own id for the transaction — the receipt, and what we store as `paymentRef`. */
      readonly transactionId: string;
      readonly conversationId: string | null;
    }
  | {
      /**
       * Vodacom answered, and the answer was no. Safe to attempt again: no
       * prompt is live, and nothing was debited.
       */
      readonly outcome: "refused";
      /** `INS-<n>` from the provider, or `MPESA_LOCAL_CODES.crypto`. */
      readonly code: string;
      /** The provider's own description where there is one — never a sentence of ours put in its mouth. */
      readonly description: string;
    }
  | {
      /**
       * We do not know what happened. **Never attempt again** — see
       * `MPESA_AMBIGUOUS_CODES`, and `ChargeBookingCommand` for what the
       * caller does about it.
       */
      readonly outcome: "ambiguous";
      /** One of `MPESA_AMBIGUOUS_CODES`. */
      readonly code: string;
      readonly description: string;
    };

/** Narrowed to what this client calls, so a stub in a test is four lines rather than a whole `fetch`. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Vodacom Moçambique's C2B, and nothing else.
 *
 * **A C2B blocks.** It pushes a prompt to the customer's handset and does not
 * answer until they accept, refuse, or ~60 seconds pass — so the response is
 * the outcome, and there is no callback to wait for. The predecessor platform
 * (`ntizo-v1`) called it exactly this way and *also* shipped a callback
 * handler, which parses Safaricom **Kenya**'s `Body.stkCallback` envelope —
 * a different country's API — and looks up `mpesa_checkout_request_id`, a
 * column nothing ever writes. It is dead code standing where a reader would
 * look for the authoritative answer. There is no callback here, deliberately.
 *
 * **Authentication is one step, not two.** The bearer token is the API key
 * RSA-encrypted (PKCS#1 v1.5) with the portal's public key and base64'd —
 * that is the whole handshake. There is no session exchange on this API
 * version: `GET /ipg/v1x/getSession/` and `GET
 * /ipg/v2/vodacomMZN/getSession/` both answer `403` against the same
 * credentials this succeeds with. A fresh token is minted per request rather
 * than cached, because PKCS#1 v1.5 padding is randomised — two encryptions of
 * the same key are different ciphertexts — and the encryption is microseconds
 * against a call that blocks for a minute.
 *
 * **`node:crypto`, not WebCrypto.** WebCrypto cannot do PKCS#1 v1.5
 * *encryption* at all (it offers RSA-OAEP for encryption and PKCS#1 v1.5 only
 * for signatures), and this API wants v1.5. `node:crypto` is fully supported
 * on Workers under `nodejs_compat`, which this Worker already enables.
 *
 * **No charge outcome is ever thrown.** A dropped connection, an HTML error
 * page from the WAF, a body that is not JSON, an `INS-0` missing its
 * transaction id — every one of them comes back as `{ outcome: "refused" }`
 * with a code. The caller is a cron sweep charging a queue of bookings one at
 * a time; a throw from here would be indistinguishable from a bug, and the
 * honest shape of "we did not collect the money" is a result, not an
 * exception.
 *
 * **One thing does throw, and it is not a charge outcome.** A stage pointed
 * at the live gateway while still carrying Vodacom's shared sandbox shortcode
 * would move a real customer's money to a test merchant. That is a
 * deployment that must not charge anybody, not a charge that failed, and
 * `MpesaSandboxShortcodeInProductionError` says so at the moment money would
 * otherwise move — see that class for why a quiet `refused` would be the
 * wrong shape for it.
 */
export class MpesaClient {
  constructor(
    private readonly config: MpesaConfig,
    /** Injected so the tests can answer with a body of their own choosing rather than reaching the network. */
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  async c2b(request: MpesaC2BRequest): Promise<MpesaC2BResponse> {
    // Before anything else, and before the network: the one configuration
    // this client will not act on. Checked here rather than in the
    // constructor so it fires at the moment a charge is actually asked for —
    // and checked in code rather than promised in a comment, because a
    // comment in `wrangler.jsonc` saying the shortcode must be replaced
    // before production is exactly as strong as whoever reads it next.
    assertEnvironmentMatchesShortcode(this.config);

    const url = `https://${host(this.config.environment)}:${C2B_PORT}${C2B_PATH}`;

    // Minted **outside** the `try` below, in one of its own. Both used to sit
    // together, so a runtime that cannot do PKCS#1 v1.5 encryption reported
    // itself as `NTIZO-TRANSPORT` — the same code a dropped socket gets, and
    // therefore invisible among the ordinary failures of a cron that talks to
    // a flaky gateway. Nothing in this path has ever run inside workerd.
    let authorization: string;
    try {
      authorization = `Bearer ${bearerToken(this.config)}`;
    } catch (error) {
      return {
        outcome: "refused",
        code: MPESA_LOCAL_CODES.crypto,
        description: error instanceof Error ? error.message : String(error),
      };
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Lower-case `origin` is what the predecessor sent and what the
          // gateway documents; headers are case-insensitive, so the casing
          // here is only for a reader.
          Origin: this.config.origin,
          "User-Agent": USER_AGENT,
          Authorization: authorization,
        },
        body: JSON.stringify({
          input_TransactionReference: request.transactionReference,
          input_CustomerMSISDN: request.msisdn,
          input_Amount: request.amount,
          input_ThirdPartyReference: request.thirdPartyReference,
          input_ServiceProviderCode: this.config.serviceProviderCode,
        }),
        signal: AbortSignal.timeout(C2B_TIMEOUT_MS),
      });
    } catch (error) {
      // `ambiguous`, not `refused`: the request left. Vodacom may be pushing
      // a prompt to the handset right now, and our abort at 110s says nothing
      // about what the customer does with it.
      return {
        outcome: "ambiguous",
        code: MPESA_LOCAL_CODES.transport,
        description: error instanceof Error ? error.message : String(error),
      };
    }

    // The status is deliberately not the discriminator. This API answers
    // `400` for `INS-13 Invalid Amount Used`, `408` for `INS-9 Request
    // timeout` and `200` for `INS-0` — all four carrying the same JSON
    // envelope — so branching on the status would only re-derive, less
    // reliably, what `output_ResponseCode` already says. The status is kept
    // for the one case where there is no envelope to read: see below.
    const body = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return {
        outcome: "ambiguous",
        code: MPESA_LOCAL_CODES.unreadable,
        description: `HTTP ${response.status} with a body this client could not read as JSON`,
      };
    }

    const code = readString(payload, "output_ResponseCode");
    if (code === null) {
      return {
        outcome: "ambiguous",
        code: MPESA_LOCAL_CODES.unreadable,
        description: `HTTP ${response.status} with JSON carrying no output_ResponseCode`,
      };
    }

    if (code !== MPESA_SUCCESS_CODE) {
      return {
        outcome: "refused",
        code,
        // The provider's own words, verbatim. A description of ours here
        // would be a guess at what their code meant, and the codes outnumber
        // anything worth maintaining a translation table for.
        description: readString(payload, "output_ResponseDesc") ?? "",
      };
    }

    // **The whole body, verbatim, before anything is extracted from it.**
    //
    // This is the one moment in the flow where a customer's money has
    // definitely moved. Everything after it can fail — the field name could
    // be wrong (see `readTransactionId`), the write that records the payment
    // can lose a race, the Worker can be evicted — and every one of those
    // failures leaves a debited customer whose receipt exists nowhere. A log
    // line costs nothing and is the difference between reconciling that by
    // hand and not being able to.
    //
    // `console.error`, not `info`: `getRequestScopedLogger()` throws where
    // this runs (a cron sets no request scope), and the error channel is the
    // one nothing filters out by level. A success on the error channel reads
    // oddly for a second and is worth it.
    //
    // **The MSISDN is masked first.** This is a payment receipt going into
    // Worker logs, which are retained and widely readable, and the response
    // envelope is not ours — a field carrying the payer's number back could
    // be added at Vodacom's end without anybody here noticing. Masking on the
    // way out costs nothing and does not depend on knowing today's schema.
    console.error("[mpesa] a charge succeeded — full response follows", {
      transactionReference: request.transactionReference,
      thirdPartyReference: request.thirdPartyReference,
      body: maskMsisdns(body, request.msisdn),
    });

    const transactionId = readTransactionId(payload);
    if (transactionId === null) {
      return {
        // The one `ambiguous` where we know the money *did* move. Retrying is
        // not a risk of a second debit, it is a near-certainty of one.
        outcome: "ambiguous",
        code: MPESA_LOCAL_CODES.missingTransactionId,
        description: `${MPESA_SUCCESS_CODE} with nothing readable as a transaction id — the money moved; see the logged response body`,
      };
    }

    return {
      outcome: "paid",
      transactionId,
      conversationId: readString(payload, "output_ConversationID"),
    };
  }
}

/**
 * Hides the payer's number in text on its way to a log.
 *
 * Two passes, because either alone leaves a gap. The first masks the exact
 * number we sent, wherever it appears and however the response spells the
 * field. The second masks *any* Mozambican MSISDN-shaped run of digits, which
 * covers a number we did not send — a payer different from the handset we
 * prompted, say — without needing to know which key carried it.
 *
 * Digits only, anchored on the `258` country code: a transaction id like
 * `7SHV1234567` is alphanumeric and cannot match, so the receipt this log
 * exists for survives the masking.
 */
export function maskMsisdns(text: string, msisdn: string): string {
  const mask = (value: string) => `${value.slice(0, 5)}****${value.slice(-3)}`;
  const escaped = msisdn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(escaped, "g"), mask(msisdn))
    .replace(/(?<!\d)258\d{9}(?!\d)/g, (found) => mask(found));
}

/**
 * Sandbox or production, from the one config value that decides it.
 *
 * `development` rather than `sandbox` because that is the string the portal,
 * the predecessor's config and every published SDK use for this API; a
 * synonym of our own would only be a value somebody has to translate when
 * copying a stage's settings across.
 */
function host(environment: string): string {
  return environment === SANDBOX_ENVIRONMENT ? "api.sandbox.vm.co.mz" : "api.vm.co.mz";
}

/**
 * Refuses the one pairing that must never reach the live gateway.
 *
 * Either value alone is fine: the sandbox shortcode against the sandbox host
 * is how every integration is built, and a real shortcode against the
 * production host is the point. It is the *combination* that is fatal, and it
 * is reachable by exactly one plausible mistake — flipping
 * `MPESA_ENVIRONMENT` to production and forgetting the shortcode beneath it,
 * which is precisely what `wrangler.jsonc`'s prod stanza is one edit away
 * from today.
 *
 * Both values go into the message. A failure that says "misconfigured" sends
 * whoever is on call to read two files; one that names the environment and
 * the shortcode it objects to is the whole diagnosis.
 */
export function assertEnvironmentMatchesShortcode(config: MpesaConfig): void {
  const isSandbox = config.environment === SANDBOX_ENVIRONMENT;
  const isSandboxShortcode = config.serviceProviderCode === SANDBOX_SERVICE_PROVIDER_CODE;

  if (!isSandbox && isSandboxShortcode) {
    throw new MpesaSandboxShortcodeInProductionError(
      config.environment,
      config.serviceProviderCode,
    );
  }
  if (isSandbox && !isSandboxShortcode) {
    throw new MpesaLiveShortcodeInSandboxError(config.environment, config.serviceProviderCode);
  }
}

/**
 * The transaction id off an `INS-0`, tried three ways before giving up.
 *
 * **This exists because the field name is the one thing in this integration
 * never confirmed against a live success.** `output_ResponseCode` and
 * `output_ResponseDesc` were read off real answers from the sandbox;
 * `output_TransactionID` comes from the predecessor platform's PHP and from a
 * stub built to match it. If that spelling is wrong, every successful charge
 * would downgrade to a refusal — the customer debited, up to three times, and
 * the booking then cancelled telling the provider nobody paid. That is the
 * worst outcome this system can produce, and it would be produced by a
 * capital letter.
 *
 * So: the documented key, then the same key under any casing, then any key
 * that reads as a transaction id at all. A guess about a field name should
 * cost a log line, not a customer's money. The exact key is still tried
 * first, so a correct response is never resolved by a fuzzy match.
 */
function readTransactionId(payload: unknown): string | null {
  const exact = readString(payload, "output_TransactionID");
  if (exact !== null && exact.length > 0) return exact;

  if (typeof payload !== "object" || payload === null) return null;
  const entries = Object.entries(payload as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
  );

  const normalise = (key: string) => key.toLowerCase().replace(/[^a-z]/g, "");
  const sameKey = entries.find(([key]) => normalise(key) === "outputtransactionid");
  if (sameKey) return sameKey[1];

  // Last resort, and deliberately not `transaction` alone: `input_`/`output_`
  // `TransactionReference` is *ours*, echoed back, and recording our own
  // reference as the processor's receipt would be worse than admitting we
  // could not find one. Requiring "id" excludes it.
  const anyId = entries.find(([key]) => {
    const n = normalise(key);
    return n.includes("transaction") && n.includes("id") && !n.includes("reference");
  });
  return anyId ? anyId[1] : null;
}

/**
 * `base64(RSA_PKCS1_v1_5(apiKey, publicKey))` — the bearer token, mint-fresh.
 *
 * The portal hands out the public key as one unbroken base64 line;
 * `createPublicKey` wants PEM, which is that same base64 wrapped at 64
 * columns between a header and a footer. Nothing is being decoded or
 * re-encoded here, only framed.
 */
function bearerToken(config: MpesaConfig): string {
  const pem = [
    "-----BEGIN PUBLIC KEY-----",
    ...(config.publicKey.match(/.{1,64}/g) ?? []),
    "-----END PUBLIC KEY-----",
    "",
  ].join("\n");

  const key = createPublicKey({ key: pem, format: "pem", type: "spki" });
  return publicEncrypt(
    { key, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(config.apiKey, "utf8"),
  ).toString("base64");
}

/**
 * One field off a body this client did not build, without trusting its shape.
 *
 * `null` covers all three ways a field can be absent — the payload was not an
 * object, the key is missing, or its value is not a string — because the
 * caller treats them identically and a narrower answer would only invite a
 * check that adds nothing.
 */
function readString(payload: unknown, field: string): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = (payload as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}
