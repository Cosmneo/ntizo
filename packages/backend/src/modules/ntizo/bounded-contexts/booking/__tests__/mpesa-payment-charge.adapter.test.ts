/**
 * `MpesaPaymentCharge` — the seam where Booking's money stops being integer
 * minor units and becomes whatever the processor counts in.
 *
 * **The second half of this file exists because the first half was not
 * enough.** Testing `toMajorUnits` and the pre-flight refusals leaves the
 * eight lines that actually build the request unreachable: the adapter used
 * to construct `new MpesaClient(config)` inline, so nothing could watch what
 * it sent. Replacing `toMajorUnits(request.amountMinor)` with
 * `request.amountMinor` left all 68 charge tests green — every customer
 * charged a hundred times the price, and nothing red. So the adapter now
 * takes the same injected `fetchImpl` the client has always taken, and the
 * `at the wire` block below asserts against the actual JSON body: the
 * conversion, the MSISDN, both references, and the `paid → paymentRef`
 * mapping.
 *
 * Those tests need a *real* RSA public key, because the whole request path
 * runs — including minting the bearer token. One is generated in `beforeAll`
 * and exists only in memory. **No credential appears in this file.**
 */
import { beforeAll, describe, expect, it } from "bun:test";
import { Buffer } from "node:buffer";
import { generateKeyPairSync } from "node:crypto";
import { infraStore, type InfraEnvBindings } from "../../../../../shared/infrastructure/stores/infra-store";
import {
  MpesaLiveShortcodeInSandboxError,
  MpesaSandboxShortcodeInProductionError,
} from "../../../shared/infrastructure/payments/mpesa";
import {
  CHARGE_LOCAL_CODES,
  MpesaPaymentCharge,
  thirdPartyReferenceFor,
  toMajorUnits,
} from "../infrastructure/adapters/mpesa-payment-charge.adapter";

function request(over: Partial<Parameters<MpesaPaymentCharge["charge"]>[0]> = {}) {
  return {
    bookingId: "bk-1",
    phone: "+258841234567",
    amountMinor: 150000,
    currency: "MZN",
    reference: "AABBCCDDEEFF0011",
    ...over,
  };
}

let publicKeyBase64: string;

beforeAll(() => {
  const pair = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  // Exactly the shape the developer portal issues: base64 DER, one line.
  publicKeyBase64 = Buffer.from(pair.publicKey).toString("base64");
});

/** An env with nothing M-Pesa in it — every deployed stage before its secrets are set. */
const BARE_ENV = {
  STAGE: "local",
  LOG_LEVEL: "info",
  DATABASE_URL: "",
  BETTER_AUTH_SECRET: "",
  RESEND_API_KEY: "",
  EMAIL_FROM: "",
  APP_URL: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
} as InfraEnvBindings;

/** A configured stage, with a key pair that exists only for this run. */
function configuredEnv(over: Partial<InfraEnvBindings> = {}): InfraEnvBindings {
  return {
    ...BARE_ENV,
    MPESA_API_KEY: "test-api-key-0123456789abcdef",
    MPESA_PUBLIC_KEY: publicKeyBase64,
    MPESA_ENVIRONMENT: "development",
    MPESA_ORIGIN: "developer.mpesa.vm.co.mz",
    MPESA_SERVICE_PROVIDER_CODE: "171717",
    ...over,
  } as InfraEnvBindings;
}

/** Captures the request the adapter builds and answers with a body of our choosing. */
function wireStub(answer: () => Response) {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl = async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return answer();
  };
  return { bodies, fetchImpl };
}

function ins0(transactionId = "7SHV1234567"): Response {
  return new Response(
    JSON.stringify({
      output_ResponseCode: "INS-0",
      output_ResponseDesc: "Request processed successfully",
      output_TransactionID: transactionId,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/** One charge, all the way to the JSON body that would have gone on the wire. */
async function chargeAtTheWire(
  over: Partial<Parameters<MpesaPaymentCharge["charge"]>[0]> = {},
  answer: () => Response = () => ins0(),
  env: InfraEnvBindings = configuredEnv(),
) {
  const { bodies, fetchImpl } = wireStub(answer);
  const result = await infraStore.runAsync(env, () =>
    new MpesaPaymentCharge(fetchImpl).charge(request(over)),
  );
  return { result, body: bodies[0], bodies };
}

describe("toMajorUnits", () => {
  /**
   * The whole reason this is a named, exported, tested function rather than
   * `amountMinor / 100` written inline: everything else in this codebase
   * counts money in integer minor units, and this is the one place that stops
   * being true. A booking priced at 1 500,00 MZN that reaches the gateway as
   * 150 000 charges a customer a hundred times over.
   */
  it.each([
    [1, 0.01],
    [5, 0.05],
    [10, 0.1],
    [99, 0.99],
    [100, 1],
    [101, 1.01],
    [12345, 123.45],
    [150000, 1500],
    [999999, 9999.99],
    [100000000, 1000000],
  ])("turns %d minor units into %d major", (minor, major) => {
    expect(toMajorUnits(minor)).toBe(major);
  });

  /**
   * A number goes on the wire because a number is what the live sandbox is
   * proven to accept. That is only safe if the decimal it serialises to is
   * the exact amount — so this asserts the JSON text, not just the double.
   */
  it("serialises to the exact decimal the gateway is sent", () => {
    expect(JSON.stringify(toMajorUnits(12345))).toBe("123.45");
    expect(JSON.stringify(toMajorUnits(150000))).toBe("1500");
    expect(JSON.stringify(toMajorUnits(5))).toBe("0.05");
  });
});

describe("MpesaPaymentCharge.charge", () => {
  /**
   * M-Pesa Moçambique has no currency field at all — the shortcode's own
   * wallet decides — so a booking priced in anything else is not
   * "unsupported by our settings", it is a booking whose price would be
   * silently charged as if it had been meticais all along.
   */
  it("refuses a currency M-Pesa does not settle, before anything else", async () => {
    const result = await new MpesaPaymentCharge().charge(request({ currency: "ZAR" }));

    expect(result).toMatchObject({
      outcome: "refused",
      code: CHARGE_LOCAL_CODES.unsupportedCurrency,
    });
  });

  it.each([[0], [-1], [1.5]])("refuses %p as an amount", async (amountMinor) => {
    const result = await new MpesaPaymentCharge().charge(request({ amountMinor }));

    expect(result).toMatchObject({
      outcome: "refused",
      code: CHARGE_LOCAL_CODES.invalidAmount,
    });
  });

  /**
   * The ruling in adapter form: a stored number M-Pesa cannot reach is an
   * ordinary charge failure with a name, not an exception and not a special
   * status. `ChargeBookingCommand` counts the attempt either way.
   */
  it.each([
    ["a wrong-prefix nine-digit number", "123456789"],
    ["a Movitel number, which cannot hold an M-Pesa wallet", "861234567"],
    ["something that is not a number at all", "not a phone"],
    ["an empty string", ""],
  ])("refuses %s as an unusable phone", async (_label, phone) => {
    const result = await new MpesaPaymentCharge().charge(request({ phone }));

    expect(result).toMatchObject({ outcome: "refused", code: CHARGE_LOCAL_CODES.unusablePhone });
    // The number itself must not travel into a log line via the description:
    // a failed charge is diagnosed by its booking id, and the booking is what
    // leads back to the number. Skipped for the empty case, where
    // `not.toContain("")` would be false of every string and could only ever
    // fail.
    if (phone.length > 0) {
      expect((result as { description: string }).description).not.toContain(phone);
    }
  });

  /**
   * A stage whose secrets were never set reports itself rather than throwing,
   * so the sweep keeps running and the affected bookings fall to their
   * payment window like any other unpaid one. Quiet by design, which is why
   * the code is distinct enough to grep for.
   */
  it("reports an unconfigured stage instead of throwing", async () => {
    const result = await infraStore.runAsync(BARE_ENV, () =>
      new MpesaPaymentCharge().charge(request()),
    );

    expect(result).toMatchObject({ outcome: "refused", code: CHARGE_LOCAL_CODES.notConfigured });
  });
});

describe("thirdPartyReferenceFor", () => {
  /**
   * It used to be `crypto.randomUUID()` — generated, sent, and dropped. That
   * made it unreconstructible, which matters because the deferred remedy for
   * a charge whose answer never came back is to ask
   * `queryTransactionStatus` about that attempt *by name*. If the query
   * endpoint keys on the third-party reference — plausible, and unconfirmed —
   * a random one means the handle does not exist anywhere.
   */
  it("is derived from the transaction reference, so it can be rebuilt from the row", () => {
    expect(thirdPartyReferenceFor("0F7C1A2B3D4E4F5001")).toBe("T0F7C1A2B3D4E4F5001");
    // Same input, same output — the property a random value did not have.
    expect(thirdPartyReferenceFor("BK101")).toBe(thirdPartyReferenceFor("BK101"));
  });

  it("differs from the reference it is derived from, and fits the field", () => {
    const reference = "0F7C1A2B3D4E4F5001";
    const third = thirdPartyReferenceFor(reference);
    expect(third).not.toBe(reference);
    expect(third.length).toBeLessThanOrEqual(20);
    expect(third).toMatch(/^[0-9A-Z]+$/);
    // A reference at the limit must not push this one past it.
    expect(thirdPartyReferenceFor("A".repeat(20))).toHaveLength(20);
  });
});

describe("MpesaPaymentCharge at the wire", () => {
  /**
   * **The test the whole seam was added for.** `toMajorUnits` has good unit
   * tests and they proved nothing about the call site: with the conversion
   * deleted, every charge test stayed green while every customer was charged
   * a hundred times the price. This asserts the number that would actually
   * have gone to Vodacom.
   */
  it.each([
    [150000, 1500],
    [12345, 123.45],
    [100, 1],
    [5, 0.05],
    [999999, 9999.99],
  ])("sends %d minor units as %d major", async (amountMinor, expected) => {
    const { body } = await chargeAtTheWire({ amountMinor });

    expect(body?.["input_Amount"]).toBe(expected);
  });

  it("sends the normalised MSISDN, not the stored number", async () => {
    const { body } = await chargeAtTheWire({ phone: "+258 84 123 4567" });

    expect(body?.["input_CustomerMSISDN"]).toBe("258841234567");
  });

  it("sends the caller's reference, and the third-party one derived from it", async () => {
    const { body } = await chargeAtTheWire({ reference: "0F7C1A2B3D4E4F5001" });

    expect(body?.["input_TransactionReference"]).toBe("0F7C1A2B3D4E4F5001");
    expect(body?.["input_ThirdPartyReference"]).toBe("T0F7C1A2B3D4E4F5001");
  });

  it("sends the stage's shortcode", async () => {
    const { body } = await chargeAtTheWire();

    expect(body?.["input_ServiceProviderCode"]).toBe("171717");
  });

  /**
   * `paymentRef` is what `Booking.markPaid` deduplicates on and what a refund
   * would have to name. It must be M-Pesa's `output_TransactionID` — never
   * our own reference, which is what we called the attempt rather than what
   * they called the payment.
   */
  it("returns M-Pesa's transaction id as the payment reference, not ours", async () => {
    const { result } = await chargeAtTheWire({ reference: "0F7C1A2B3D4E4F5001" }, () =>
      ins0("7SHV9999999"),
    );

    expect(result).toEqual({ outcome: "paid", paymentRef: "7SHV9999999" });
  });

  it("passes a refusal through with the provider's own code and words", async () => {
    const { result } = await chargeAtTheWire(
      {},
      () =>
        new Response(
          JSON.stringify({
            output_ResponseCode: "INS-9",
            output_ResponseDesc: "Request timeout",
          }),
          { status: 408, headers: { "Content-Type": "application/json" } },
        ),
    );

    expect(result).toEqual({
      outcome: "refused",
      code: "INS-9",
      description: "Request timeout",
    });
  });

  /**
   * The client's refused/ambiguous split has to survive the adapter, because
   * the adapter is the only thing Booking sees. Collapsing them one line from
   * where they are decided would throw away the distinction that stops a
   * second prompt going out over a live one.
   */
  it("carries an unreadable response through as ambiguous, not refused", async () => {
    const { result } = await chargeAtTheWire(
      {},
      () =>
        new Response("<html><body><h1>504 Gateway Time-out</h1></body></html>", {
          status: 504,
          headers: { "Content-Type": "text/html" },
        }),
    );

    expect(result).toMatchObject({
      outcome: "ambiguous",
      code: "NTIZO-UNREADABLE-RESPONSE",
    });
  });

  it("reports an unconfigured stage as not ready, without touching the network", async () => {
    const { bodies, fetchImpl } = wireStub(() => ins0());

    const readiness = await infraStore.runAsync(BARE_ENV, async () =>
      new MpesaPaymentCharge(fetchImpl).readiness(),
    );

    expect(readiness).toMatchObject({ ready: false, code: CHARGE_LOCAL_CODES.notConfigured });
    expect(bodies).toHaveLength(0);
  });

  it("reports a configured stage as ready", async () => {
    const readiness = await infraStore.runAsync(configuredEnv(), async () =>
      new MpesaPaymentCharge().readiness(),
    );

    expect(readiness).toEqual({ ready: true });
  });

  /**
   * Readiness runs the *same* shortcode gate the client runs, so a
   * deployment that must not charge anybody is caught before a customer's
   * retry budget is touched rather than after.
   */
  it("throws from readiness when the environment and the shortcode disagree", async () => {
    await expect(
      infraStore.runAsync(
        configuredEnv({ MPESA_ENVIRONMENT: "production", MPESA_SERVICE_PROVIDER_CODE: "171717" }),
        async () => new MpesaPaymentCharge().readiness(),
      ),
    ).rejects.toThrow(MpesaSandboxShortcodeInProductionError);
  });

  /**
   * Both misconfiguration gates, reached through the adapter rather than the
   * client, because the adapter is what production actually constructs — and
   * `resolveMpesaConfig`'s defaults are how each becomes reachable.
   */
  it("refuses to charge when production still carries the sandbox shortcode", async () => {
    const { bodies, fetchImpl } = wireStub(() => ins0());

    await expect(
      infraStore.runAsync(
        configuredEnv({ MPESA_ENVIRONMENT: "production", MPESA_SERVICE_PROVIDER_CODE: "171717" }),
        () => new MpesaPaymentCharge(fetchImpl).charge(request()),
      ),
    ).rejects.toThrow(MpesaSandboxShortcodeInProductionError);

    expect(bodies).toHaveLength(0);
  });

  /**
   * The mirror, and the one the defaults make easy: a stage issued a real
   * shortcode that sets it and forgets `MPESA_ENVIRONMENT` talks to the
   * sandbox host with a live shortcode. Harmless to money and silent —
   * every charge answers "unknown shortcode", which from outside is
   * indistinguishable from every customer ignoring their prompt, and the
   * bookings get cancelled telling providers the customer did not pay.
   */
  it("refuses to charge when the sandbox is handed a live shortcode", async () => {
    const { bodies, fetchImpl } = wireStub(() => ins0());

    await expect(
      infraStore.runAsync(
        configuredEnv({ MPESA_ENVIRONMENT: "development", MPESA_SERVICE_PROVIDER_CODE: "900123" }),
        () => new MpesaPaymentCharge(fetchImpl).charge(request()),
      ),
    ).rejects.toThrow(MpesaLiveShortcodeInSandboxError);

    expect(bodies).toHaveLength(0);
  });

  it("charges happily once production has a shortcode of its own", async () => {
    const { bodies, fetchImpl } = wireStub(() => ins0());

    const result = await infraStore.runAsync(
      configuredEnv({ MPESA_ENVIRONMENT: "production", MPESA_SERVICE_PROVIDER_CODE: "900123" }),
      () => new MpesaPaymentCharge(fetchImpl).charge(request()),
    );

    expect(result.outcome).toBe("paid");
    expect(bodies[0]?.["input_ServiceProviderCode"]).toBe("900123");
  });
});
