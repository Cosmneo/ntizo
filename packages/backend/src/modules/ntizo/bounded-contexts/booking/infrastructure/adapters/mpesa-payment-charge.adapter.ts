import { toMpesaMsisdn } from "@ntizo/shared";
import { infraStore } from "../../../../../../shared/infrastructure/stores/infra-store";
import {
  assertEnvironmentMatchesShortcode,
  type FetchLike,
  MpesaClient,
  type MpesaConfig,
} from "../../../../shared/infrastructure/payments/mpesa";
import type {
  PaymentChargePort,
  PaymentChargeReadiness,
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

/** M-Pesa's own limit on both reference fields. Alphanumeric, no longer than this. */
const MPESA_REFERENCE_MAX_CHARS = 20;

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
 *
 * **`fetchImpl` is threaded through to the client, and that seam is the
 * difference between these eight lines being tested and not.** Without it
 * `new MpesaClient(config)` was unreachable from every test — the adapter's
 * own tests all returned before it, the command and sweep tests substitute
 * this whole class at the port, and the client's tests build their own
 * request by hand. Replacing `toMajorUnits(request.amountMinor)` below with
 * `request.amountMinor` left all 68 charge tests green: every customer
 * charged a hundred times the price, nothing red. The conversion, the
 * MSISDN, both references and the `paid → paymentRef` mapping all live in
 * that gap, and they are the only lines here where money is actually
 * decided.
 */
export class MpesaPaymentCharge implements PaymentChargePort {
  constructor(
    /**
     * Handed to `MpesaClient` so a test can watch what reaches the wire.
     * Defaulted, so production wiring (`bootstrapBooking`) passes nothing and
     * reads the same as before.
     */
    private readonly fetchImpl?: FetchLike,
  ) {}

  /**
   * Configuration only, and answered before any customer's retry budget is
   * spent. The shortcode gate is *the same function* `MpesaClient.c2b` runs —
   * imported rather than reimplemented, so the check that stops real money
   * reaching a test merchant has exactly one definition. It throws here for
   * the same reason it throws there: a deployment that must not charge
   * anybody is not a charge that failed.
   */
  readiness(): PaymentChargeReadiness {
    const config = resolveMpesaConfig();
    if (config === null) {
      return {
        ready: false,
        code: CHARGE_LOCAL_CODES.notConfigured,
        description: "MPESA_API_KEY or MPESA_PUBLIC_KEY is not set on this stage",
      };
    }
    assertEnvironmentMatchesShortcode(config);
    return { ready: true };
  }

  async charge(request: PaymentChargeRequest): Promise<PaymentChargeResult> {
    if (request.currency !== SETTLEMENT_CURRENCY) {
      return {
        outcome: "refused",
        code: CHARGE_LOCAL_CODES.unsupportedCurrency,
        description: `M-Pesa Moçambique settles ${SETTLEMENT_CURRENCY}; this booking is priced in ${request.currency}`,
      };
    }

    if (!Number.isInteger(request.amountMinor) || request.amountMinor <= 0) {
      return {
        outcome: "refused",
        code: CHARGE_LOCAL_CODES.invalidAmount,
        description: `${request.amountMinor} is not a chargeable amount in minor units`,
      };
    }

    const msisdn = toMpesaMsisdn(request.phone);
    if (msisdn === null) {
      return {
        outcome: "refused",
        code: CHARGE_LOCAL_CODES.unusablePhone,
        // The number itself is deliberately not in the description: this
        // string reaches a log line, and a log line is not where a
        // customer's phone number belongs. The booking id travels with every
        // one of these anyway, and it is what leads back to the number.
        description: "the customer's stored number is not one M-Pesa can push a prompt to",
      };
    }

    // Already answered by `readiness()` before the attempt was claimed; kept
    // because `charge` must be correct when called on its own, and because a
    // `null` here would otherwise be a crash rather than a refusal.
    const config = resolveMpesaConfig();
    if (config === null) {
      return {
        outcome: "refused",
        code: CHARGE_LOCAL_CODES.notConfigured,
        description: "MPESA_API_KEY or MPESA_PUBLIC_KEY is not set on this stage",
      };
    }

    const client = this.fetchImpl
      ? new MpesaClient(config, this.fetchImpl)
      : new MpesaClient(config);

    const response = await client.c2b({
      msisdn,
      amount: toMajorUnits(request.amountMinor),
      transactionReference: request.reference,
      thirdPartyReference: thirdPartyReferenceFor(request.reference),
    });

    if (response.outcome === "paid") {
      return { outcome: "paid", paymentRef: response.transactionId };
    }
    // The client's own split, carried through unchanged. Collapsing the two
    // here would be the whole point of the distinction thrown away one line
    // from where it is decided.
    return {
      outcome: response.outcome,
      code: response.code,
      description: response.description,
    };
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
 * The second reference the gateway wants, derived from the first.
 *
 * M-Pesa takes two: `input_TransactionReference`, which is what the customer
 * sees, and `input_ThirdPartyReference`, which it echoes back. They must
 * differ, and this one used to be a fresh `crypto.randomUUID()` — which made
 * it **unreconstructible**, and that was a real hole rather than an
 * aesthetic one. The whole point of deriving the transaction reference from
 * `bookingId` + `attempt` (see `chargeReference`) is that a later
 * reconciliation can name an attempt whose answer never came back. If
 * `queryTransactionStatus` keys on the third-party reference — which is
 * plausible, and unconfirmed — then a random one means the handle for the
 * attempt you need to ask about does not exist anywhere. A UUID that is
 * generated, sent, and then dropped on the floor is not a reference.
 *
 * `T` + the transaction reference: distinct from it, deterministic in
 * exactly the same inputs, and rebuildable from the row by rebuilding the
 * transaction reference first. Nineteen characters against the field's limit
 * of twenty (`chargeReference` produces eighteen), and sliced anyway so a
 * longer reference can never silently produce an over-long field.
 */
export function thirdPartyReferenceFor(reference: string): string {
  return `T${reference}`.slice(0, MPESA_REFERENCE_MAX_CHARS);
}

/**
 * The stage's M-Pesa settings, or `null` when the two secrets are missing.
 *
 * The three non-secret values keep their defaults so a stage that forgot them
 * still talks to the sandbox rather than to nothing; the two secrets have
 * none, and their absence is the whole reason this can return `null`. `null`
 * rather than a throw so an unconfigured stage produces a named charge
 * failure — counted, logged, bounded by the retry limit — instead of an
 * exception the sweep has to catch and re-describe.
 *
 * **The defaults are also how the two misconfigurations `MpesaClient` gates
 * become reachable**, and they are deliberately left in place rather than
 * removed. Defaulting the environment to the sandbox is the safe direction —
 * a forgotten variable talks to a test gateway, never to a live one. What
 * makes it safe is that the client refuses the two mismatches outright rather
 * than proceeding: sandbox host with a live shortcode, and live host with the
 * sandbox shortcode. Removing the defaults would trade a loud, named refusal
 * for a stage that simply reports itself unconfigured, which says less.
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
