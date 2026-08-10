import {
  PaymentDirection,
  PaymentIdentifierKind,
  PaymentMethodType,
  identifierKindFor,
  supportsDirection,
} from "@ntizo/shared";
import { isValidPhoneNumber, parsePhoneNumberFromString } from "libphonenumber-js";
import {
  InvalidPaymentIdentifierError,
  UnsupportedPaymentDirectionError,
} from "../exceptions/payment-method.exceptions";

export interface PaymentMethodProps {
  id: string;
  userId: string;
  type: PaymentMethodType;
  direction: PaymentDirection;
  country: string;
  identifier: string;
  label: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Shows enough to recognise the method, never enough to use it. */
function maskTail(value: string): string {
  const tail = value.slice(-4);
  return `···${tail}`;
}

/**
 * Validates and normalises an identifier for its type.
 *
 * This is the reason payment *types* are code rather than configuration: each
 * one is a different kind of string with different rules. A country can be
 * added as a row; a type cannot, because this function would not know what to
 * do with it.
 */
function normaliseIdentifier(type: PaymentMethodType, raw: string): string {
  const kind = identifierKindFor(type);
  const value = raw.trim();

  switch (kind) {
    case PaymentIdentifierKind.PhoneNumber: {
      // Mobile money is keyed by the subscriber's number, so the same rule as
      // the profile phone applies: E.164 or nothing. "84 123 4567" and
      // "+258841234567" are one account, and storing both would let a user
      // register the same wallet twice.
      if (!isValidPhoneNumber(value)) throw new InvalidPaymentIdentifierError(type);
      return parsePhoneNumberFromString(value)!.number;
    }
    case PaymentIdentifierKind.BankAccountNumber: {
      // Spaces are how humans write IBANs and are not part of the value.
      const compact = value.replace(/\s+/g, "").toUpperCase();
      if (compact.length < 8 || compact.length > 34) {
        throw new InvalidPaymentIdentifierError(type);
      }
      return compact;
    }
    case PaymentIdentifierKind.ProcessorToken: {
      // Opaque by definition — the card never reaches us, so there is nothing
      // to validate beyond "the processor gave us something".
      if (value.length < 8) throw new InvalidPaymentIdentifierError(type);
      return value;
    }
  }
}

export class PaymentMethod {
  private constructor(private readonly props: PaymentMethodProps) {}

  static rehydrate(props: PaymentMethodProps): PaymentMethod {
    return new PaymentMethod(props);
  }

  static create(params: {
    id: string;
    userId: string;
    type: PaymentMethodType;
    direction: PaymentDirection;
    country: string;
    identifier: string;
    label?: string;
    isDefault?: boolean;
  }): PaymentMethod {
    // A card cannot be credited. Checked here rather than trusted from the UI:
    // the picker only offers legal combinations, and the picker is not the
    // thing that has to be right.
    if (!supportsDirection(params.type, params.direction)) {
      throw new UnsupportedPaymentDirectionError(params.type, params.direction);
    }

    const identifier = normaliseIdentifier(params.type, params.identifier);
    const now = new Date();

    return new PaymentMethod({
      id: params.id,
      userId: params.userId,
      type: params.type,
      direction: params.direction,
      country: params.country.trim().toUpperCase(),
      identifier,
      // Derived when the user does not name it, so a list never shows two
      // identical rows the owner cannot tell apart.
      label: params.label?.trim() || maskTail(identifier),
      isDefault: params.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    });
  }

  get id() {
    return this.props.id;
  }
  get userId() {
    return this.props.userId;
  }
  get direction() {
    return this.props.direction;
  }
  get isDefault() {
    return this.props.isDefault;
  }

  rename(label: string): void {
    this.props.label = label.trim() || maskTail(this.props.identifier);
    this.props.updatedAt = new Date();
  }

  /** As with addresses, "exactly one default" is the command's rule, not this one's. */
  setDefault(isDefault: boolean): void {
    this.props.isDefault = isDefault;
    this.props.updatedAt = new Date();
  }

  toJSON(): PaymentMethodProps {
    return { ...this.props };
  }
}
