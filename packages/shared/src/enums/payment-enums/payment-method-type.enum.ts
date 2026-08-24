/**
 * The kinds of payment instrument the platform knows how to handle.
 *
 * This is code, not configuration. Each entry implies fields, validation and a
 * provider integration: an M-Pesa number is a Mozambican mobile number, an
 * IBAN is checksummed, a card is tokenised and never touches our storage.
 * Adding one means writing all of that.
 *
 * Which of these a given country offers is the opposite — data an
 * administrator maintains. See `CountryPaymentConfig`. The rule that keeps the
 * two apart: if adding a row to a table would require writing code, it should
 * not have been a row.
 */
export enum PaymentMethodType {
  /** Mobile money, Mozambique. Identified by the subscriber's phone number. */
  MPesa = "M_PESA",
  /** Mobile money, Mozambique — Movitel's. Same shape, different operator. */
  EMola = "E_MOLA",
  /** Bank account, identified by IBAN or a local account number. */
  BankAccount = "BANK_ACCOUNT",
  /** Card, tokenised by the processor. Customers only — nobody is paid out to a card. */
  Card = "CARD",
}

/**
 * What a method is for.
 *
 * A customer's saved card and a provider's M-Pesa number are both "payment
 * methods" in conversation and are nothing alike in the model: one is charged,
 * the other is credited, and the rules about which types are legal differ by
 * direction. Naming the direction stops one table from quietly serving both
 * with a nullable column deciding which.
 */
export enum PaymentDirection {
  /** How a customer pays. */
  Charge = "CHARGE",
  /** How a provider is paid. */
  Payout = "PAYOUT",
}

/**
 * The types that can be credited.
 *
 * A card cannot: card networks push refunds back to the original charge, not
 * arbitrary payouts. Encoded here rather than left to each call site to
 * remember.
 */
export const PAYOUT_CAPABLE_TYPES = [
  PaymentMethodType.MPesa,
  PaymentMethodType.EMola,
  PaymentMethodType.BankAccount,
] as const;

export function supportsDirection(
  type: PaymentMethodType,
  direction: PaymentDirection,
): boolean {
  if (direction === PaymentDirection.Charge) return true;
  return (PAYOUT_CAPABLE_TYPES as readonly PaymentMethodType[]).includes(type);
}

/**
 * The identifier a method is keyed by, so a form knows what to ask for and a
 * validator knows what it is looking at.
 */
export enum PaymentIdentifierKind {
  /** E.164 phone number — mobile money. */
  PhoneNumber = "PHONE_NUMBER",
  /** IBAN or local account number. */
  BankAccountNumber = "BANK_ACCOUNT_NUMBER",
  /** Processor token. The real number never reaches us. */
  ProcessorToken = "PROCESSOR_TOKEN",
}

export function identifierKindFor(type: PaymentMethodType): PaymentIdentifierKind {
  switch (type) {
    case PaymentMethodType.MPesa:
    case PaymentMethodType.EMola:
      return PaymentIdentifierKind.PhoneNumber;
    case PaymentMethodType.BankAccount:
      return PaymentIdentifierKind.BankAccountNumber;
    case PaymentMethodType.Card:
      return PaymentIdentifierKind.ProcessorToken;
  }
}

/**
 * Narrows an untrusted string to a `PaymentMethodType`.
 *
 * A guard rather than a cast, for the same reason `toUserRole` is one: nothing
 * upstream constrains what arrives, and a cast would let an unknown method
 * through to a payout that then fails at the gateway.
 */
export function isPaymentMethodType(value: string): value is PaymentMethodType {
  return (Object.values(PaymentMethodType) as string[]).includes(value);
}
