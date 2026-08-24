/**
 * What a customer pays, and how it breaks down.
 *
 * Ntizo charges the customer 10% on top of the package price; the provider
 * receives the price they set, whole. That asymmetry is the platform's
 * permanent commercial model, not a setting — which is why the rate is a
 * constant here rather than a column somebody could set to 0 for one booking
 * and 30 for the next.
 */
export const NTIZO_COMMISSION_RATE = 0.1;

export interface BookingTotal {
  /** What the provider set, and what they receive. */
  packageMinor: number;
  /** What Ntizo adds. */
  commissionMinor: number;
  /** What the customer pays. Always exactly the two above. */
  totalMinor: number;
}

/**
 * Minor units throughout, and the total derived by addition rather than by a
 * second multiplication.
 *
 * `price * 1.1` and `price + round(price * 0.1)` disagree at any amount whose
 * tenth is not whole, and a receipt whose three lines do not add up is a
 * support ticket that takes an hour to explain. Rounding once, then adding,
 * makes the arithmetic on screen the arithmetic that happened.
 */
export function bookingTotal(packageMinor: number): BookingTotal {
  const commissionMinor = Math.round(packageMinor * NTIZO_COMMISSION_RATE);
  return {
    packageMinor,
    commissionMinor,
    totalMinor: packageMinor + commissionMinor,
  };
}
