/**
 * `MpesaPaymentCharge` — the seam where Booking's money stops being integer
 * minor units and becomes whatever the processor counts in.
 *
 * Only the half that never touches the network is exercised here: the unit
 * conversion, and the four refusals the adapter reaches before a request is
 * ever built. The half that does talk to M-Pesa is `MpesaClient`, which has
 * its own file and its own stub. Nothing here needs a credential, and nothing
 * here has one.
 */
import { describe, expect, it } from "bun:test";
import { infraStore, type InfraEnvBindings } from "../../../../../shared/infrastructure/stores/infra-store";
import {
  CHARGE_LOCAL_CODES,
  MpesaPaymentCharge,
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
      outcome: "failed",
      code: CHARGE_LOCAL_CODES.unsupportedCurrency,
    });
  });

  it.each([[0], [-1], [1.5]])("refuses %p as an amount", async (amountMinor) => {
    const result = await new MpesaPaymentCharge().charge(request({ amountMinor }));

    expect(result).toMatchObject({
      outcome: "failed",
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

    expect(result).toMatchObject({ outcome: "failed", code: CHARGE_LOCAL_CODES.unusablePhone });
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

    expect(result).toMatchObject({ outcome: "failed", code: CHARGE_LOCAL_CODES.notConfigured });
  });
});
