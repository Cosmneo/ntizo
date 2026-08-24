/**
 * What can move money in a provider's wallet.
 *
 * A closed list, because every kind of movement has to be one somebody can
 * read on a statement. "Adjustment" as a catch-all is how ledgers become
 * unauditable — the row says money moved and nothing says why.
 */
export enum WalletEntryType {
  /** A booking was paid for. Lands in pending: the work is not done yet. */
  BookingEarning = "booking_earning",
  /** The booking completed and its dispute window closed. Pending → available. */
  EarningReleased = "earning_released",
  /** Settled in cash, hand to hand. Recorded, but moves no balance. */
  CashSettlement = "cash_settlement",
  /** Money sent to the provider's M-Pesa, e-Mola or bank. Debits available. */
  Payout = "payout",
  /** A payout that failed at the gateway. Returns it to available. */
  PayoutReversed = "payout_reversed",
  /** A booking refunded to the customer. Takes back what it brought in. */
  Refund = "refund",
  /** A correction made by an administrator. Always carries a description. */
  ManualAdjustment = "manual_adjustment",
}

export const WALLET_ENTRY_TYPES = Object.values(WalletEntryType);

/** Signed movements. The balance is the sum of these, by definition. */
export interface WalletDeltas {
  availableDeltaMinor: number;
  pendingDeltaMinor: number;
}

/**
 * How each kind of entry moves the two balances.
 *
 * One function, so the rule lives in one place rather than at every call site
 * that writes an entry — which is where ledgers usually go wrong: two callers,
 * two opinions about which balance a refund comes out of.
 *
 * `amountMinor` is always positive; the direction is this table's business.
 */
export function deltasFor(
  type: WalletEntryType,
  amountMinor: number,
  options: { fromPending?: boolean } = {},
): WalletDeltas {
  const amount = Math.abs(amountMinor);

  switch (type) {
    case WalletEntryType.BookingEarning:
      // Pending, not available. The customer has paid but the work is not
      // done, and money that might still be refunded is not the provider's to
      // withdraw.
      return { availableDeltaMinor: 0, pendingDeltaMinor: amount };

    case WalletEntryType.EarningReleased:
      // One event, both balances. Splitting it into two rows would let a
      // reader see a moment where the money was in neither.
      return { availableDeltaMinor: amount, pendingDeltaMinor: -amount };

    case WalletEntryType.CashSettlement:
      // Recorded, and deliberately weightless. The platform never held this
      // money, so claiming it as a balance would be a lie the provider finds
      // out about at withdrawal. The amount still counts towards what they
      // earned, which is the number they actually care about.
      return { availableDeltaMinor: 0, pendingDeltaMinor: 0 };

    case WalletEntryType.Payout:
      return { availableDeltaMinor: -amount, pendingDeltaMinor: 0 };

    case WalletEntryType.PayoutReversed:
      return { availableDeltaMinor: amount, pendingDeltaMinor: 0 };

    case WalletEntryType.Refund:
      // Out of whichever balance it went into. A booking refunded before
      // completion never reached available, and taking it from there would
      // push a provider negative on money they never had.
      return options.fromPending
        ? { availableDeltaMinor: 0, pendingDeltaMinor: -amount }
        : { availableDeltaMinor: -amount, pendingDeltaMinor: 0 };

    case WalletEntryType.ManualAdjustment:
      // Signed by the caller: a correction goes either way, and an
      // administrator writing one has said which.
      return { availableDeltaMinor: amountMinor, pendingDeltaMinor: 0 };
  }
}

/** Does this entry count towards "how much has this provider earned"? */
export function countsAsEarning(type: WalletEntryType): boolean {
  // Cash counts. The platform never touched it, but the provider earned it,
  // and a total that excludes it is a total they will not recognise.
  return (
    type === WalletEntryType.BookingEarning ||
    type === WalletEntryType.CashSettlement
  );
}

/**
 * Whether a wallet can absorb this movement.
 *
 * Checked before writing, because a negative balance in a marketplace is not
 * a smaller number — it is money already sent to somebody's phone that cannot
 * be pulled back. A refund that would overdraw is a decision for a human.
 */
export function wouldOverdraw(
  balances: { availableMinor: number; pendingMinor: number },
  deltas: WalletDeltas,
): boolean {
  return (
    balances.availableMinor + deltas.availableDeltaMinor < 0 ||
    balances.pendingMinor + deltas.pendingDeltaMinor < 0
  );
}
