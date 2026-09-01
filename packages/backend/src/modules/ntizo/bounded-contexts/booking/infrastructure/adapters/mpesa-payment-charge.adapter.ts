import { infraStore } from "../../../../../../shared/infrastructure/stores/infra-store";
import {
  MpesaClient,
  type MpesaConfig,
  toMpesaMsisdn,
} from "../../../../shared/infrastructure/payments/mpesa";
import type {
  PaymentChargePort,
  PaymentChargeRequest,
  PaymentChargeResult,
} from "../../app/ports/outbound/payment-charge.port";

/**
 * The only currency M-Pesa Moçambique settles in.
 *
 * Not a configuration value: the gateway has no currency field at all — the
 * shortcode's own wallet decides — so a booking priced in anything else is
 * not "unsupported by our settings", it is a booking this processor cannot
 * take money for. Refused here, by name, rather than sent and silently
 * charged as if the number had been meticais all along.
 */
const SETTLEMENT_CURRENCY = "MZN";

/** The metical has two decimal places, like every currency this platform prices in today. */
const MINOR_UNITS_PER_MAJOR = 100;

/**
 * Failures this adapter names before the client is ever called. Same
 * `NTIZO-` prefix and same reason as `MPESA_LOCAL_CODES`: a code in a log
 * line has to be unmistakably ours or unmistakably Vodacom's.
 */
export const CHARGE_LOCAL_CODES = {
  /** `profile.phone_number` held something no Vodacom handset could be reached at — or nothing at all. */
  unusablePhone: "NTIZO-UNUSABLE-PHONE",
  /** The booking is priced in a currency this processor does not settle. */
  unsupportedCurrency: "NTIZO-UNSUPPORTED-CURRENCY",
  /** A zero or negative amount. The API answers `INS-13` for it; naming it here saves a round trip. */
  invalidAmount: "NTIZO-INVALID-AMOUNT",
  /** The stage is missing `MPESA_API_KEY` or `MPESA_PUBLIC_KEY`. */
  notConfigured: "NTIZO-MPESA-NOT-CONFIGURED",
} as const;

/**
 * Booking's `PaymentChargePort`, over Vodacom Moçambique's C2B.
 *
 * **This is the only thing in Booking that knows M-Pesa exists.** The client
 * it drives lives in `shared/infrastructure/payments/mpesa` rather than here,
 * because the same gateway serves B2C payouts and reversals — a provider
 * being paid, a customer being refunded — and neither of those is Booking's.
 * This class is the half that *is* Booking's: minor units become major ones,
 * a stored phone number becomes an MSISDN or a named failure, and an `INS-*`
 * code becomes a `PaymentChargeResult`.
 *
 * **Configuration is resolved per charge, not at construction.**
 * `infraStore.getEnv()` throws outside a request or cron scope, and this
 * class is built by `bootstrapBooking()`, which is called from module scope
 * in `graphql/private.ts` — resolving eagerly would blow up a GraphQL
 * bootstrap that never charges anything. Same shape and same reasoning as
 * `LazyEmailServiceAdapter`.
 */
export class MpesaPaymentCharge implements PaymentChargePort {
  async charge(request: PaymentChargeRequest): Promise<PaymentChargeResult> {
    if (request.currency !== SETTLEMENT_CURRENCY) {
      return {
        outcome: "failed",
        code: CHARGE_LOCAL_CODES.unsupportedCurrency,
        description: `M-Pesa Moçambique settles ${SETTLEMENT_CURRENCY}; this booking is priced in ${request.currency}`,
      };
    }

    if (!Number.isInteger(request.amountMinor) || request.amountMinor <= 0) {
      return {
        outcome: "failed",
        code: CHARGE_LOCAL_CODES.invalidAmount,
        description: `${request.amountMinor} is not a chargeable amount in minor units`,
      };
    }

    const msisdn = toMpesaMsisdn(request.phone);
    if (msisdn === null) {
      return {
        outcome: "failed",
        code: CHARGE_LOCAL_CODES.unusablePhone,
        // The number itself is deliberately not in the description: this
        // string reaches a log line, and a log line is not where a
        // customer's phone number belongs. The booking id travels with every
        // one of these anyway, and it is what leads back to the number.
        description: "the customer's stored number is not one M-Pesa can push a prompt to",
      };
    }

    const config = resolveMpesaConfig();
    if (config === null) {
      return {
        outcome: "failed",
        code: CHARGE_LOCAL_CODES.notConfigured,
        description: "MPESA_API_KEY or MPESA_PUBLIC_KEY is not set on this stage",
      };
    }

    const response = await new MpesaClient(config).c2b({
      msisdn,
      amount: toMajorUnits(request.amountMinor),
      transactionReference: request.reference,
      thirdPartyReference: thirdPartyReference(),
    });

    if (response.outcome === "paid") {
      return { outcome: "paid", paymentRef: response.transactionId };
    }
    return { outcome: "failed", code: response.code, description: response.description };
  }
}

/**
 * Minor units to major, exactly.
 *
 * `amountMinor / 100` looks like the whole answer and is where money bugs
 * come from, so the division is done on the two halves separately and only
 * recombined through `Number`, which parses a decimal *string* rather than
 * accumulating a binary one: 12345 becomes the string `"123.45"` and then
 * the nearest double to it, which is the same double `JSON.stringify` will
 * print back as `123.45`. A number is what goes on the wire because a number
 * is what the gateway is proven to accept — `input_Amount: 10` returned a
 * real `INS-*` answer against the live sandbox, and the string form was never
 * confirmed.
 *
 * Only ever reached with a positive integer: `charge` refuses everything else
 * above, which is why there is no sign handling here.
 */
export function toMajorUnits(amountMinor: number): number {
  const whole = Math.trunc(amountMinor / MINOR_UNITS_PER_MAJOR);
  const fraction = amountMinor % MINOR_UNITS_PER_MAJOR;
  return Number(`${whole}.${String(fraction).padStart(2, "0")}`);
}

/**
 * The second reference the gateway wants, distinct from ours.
 *
 * M-Pesa takes two: `input_TransactionReference`, which is what the customer
 * sees and which `ChargeBookingCommand` derives from the booking, and
 * `input_ThirdPartyReference`, which it only echoes back. Random, because
 * nothing reads it: giving it the same value as the transaction reference
 * would invite a reader to believe one of them means something it does not.
 * Twenty characters is the field's limit.
 */
function thirdPartyReference(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase();
}

/**
 * The stage's M-Pesa settings, or `null` when the two secrets are missing.
 *
 * The three non-secret values have defaults so a stage that forgot them still
 * talks to the sandbox rather than to nothing; the two secrets have none, and
 * their absence is the whole reason this can return `null`. `null` rather
 * than a throw so an unconfigured stage produces a named charge failure —
 * counted, logged, bounded by the retry limit — instead of an exception the
 * sweep has to catch and re-describe.
 */
function resolveMpesaConfig(): MpesaConfig | null {
  const env = infraStore.getEnv();
  if (!env.MPESA_API_KEY || !env.MPESA_PUBLIC_KEY) return null;
  return {
    apiKey: env.MPESA_API_KEY,
    publicKey: env.MPESA_PUBLIC_KEY,
    environment: env.MPESA_ENVIRONMENT ?? "development",
    origin: env.MPESA_ORIGIN ?? "developer.mpesa.vm.co.mz",
    serviceProviderCode: env.MPESA_SERVICE_PROVIDER_CODE ?? "171717",
  };
}
