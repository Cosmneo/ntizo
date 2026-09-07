/**
 * The provider's share of a price they have not sent yet.
 *
 * The proposal form has to show "recebe X" while the provider is still typing,
 * and the quote read model carries only `commissionBps` — there is no
 * `commissionMinor` to read, because no booking exists yet. So the arithmetic
 * happens here, and it is `booking.aggregate.ts`'s expression character for
 * character: `Math.round((priceMinor * commissionBps) / 10_000)`. Any other
 * rounding shows the provider one number and pays them another.
 */
const COMMISSION_BPS_MAX = 10_000;

export function commissionMinorOf(priceMinor: number, commissionBps: number): number {
  return Math.round((priceMinor * commissionBps) / COMMISSION_BPS_MAX);
}

export function payoutMinorOf(priceMinor: number, commissionBps: number): number {
  return priceMinor - commissionMinorOf(priceMinor, commissionBps);
}
