import type { PaymentDirection, PaymentMethodType } from "@ntizo/shared";

/**
 * The identifier does not look like what its type requires.
 *
 * Carries the type but never the value: an error message is logged, shown and
 * sometimes forwarded, and a rejected bank account number is still a bank
 * account number.
 */
export class InvalidPaymentIdentifierError extends Error {
  readonly code = "INVALID_PAYMENT_IDENTIFIER";
  constructor(public readonly type: PaymentMethodType) {
    super(`Invalid identifier for payment method type ${type}`);
    this.name = "InvalidPaymentIdentifierError";
  }
}

/** A card cannot be paid out to; only charged. */
export class UnsupportedPaymentDirectionError extends Error {
  readonly code = "UNSUPPORTED_PAYMENT_DIRECTION";
  constructor(
    public readonly type: PaymentMethodType,
    public readonly direction: PaymentDirection,
  ) {
    super(`Payment method type ${type} cannot be used for ${direction}`);
    this.name = "UnsupportedPaymentDirectionError";
  }
}

export class PaymentMethodNotFoundError extends Error {
  readonly code = "PAYMENT_METHOD_NOT_FOUND";
  constructor(id: string) {
    super(`Payment method ${id} not found`);
    this.name = "PaymentMethodNotFoundError";
  }
}
