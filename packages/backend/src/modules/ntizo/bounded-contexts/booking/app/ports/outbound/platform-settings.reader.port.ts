/**
 * The platform settings this bounded context is allowed to read: the three
 * clocks the design names — the checkout hold, the provider's response
 * window, and the payment window.
 *
 * This does not return the `platform_settings` row. A port that hands back
 * every knob invites the next command to read a second one through it and
 * quietly become a dependency on the whole table — the same reasoning behind
 * Provider's own `PlatformSettingsPort`, which exposes only
 * `defaultCommissionBps`. Booking's legitimate reasons to read this table are
 * these three windows, so that is all this port can return.
 */
export interface PlatformSettingsReaderPort {
  /**
   * Minutes a `DRAFT` holds its slot before an abandoned checkout expires it.
   *
   * LIVE, not SEED (see `platform_settings`'s own header comment for the
   * distinction): read fresh every time a booking is created, so a change an
   * administrator makes applies to the next booking immediately. A booking
   * already created keeps the `expiresAt` it was given regardless of what
   * this returns afterward — that is the booking snapshot behaving normally,
   * not this port's concern.
   */
  findCheckoutHoldMinutes(): Promise<number>;

  /**
   * Minutes a provider has to accept or decline a request once it reaches
   * `AWAITING_PROVIDER`, before it expires on them.
   *
   * LIVE, read fresh every time a booking is submitted, for the same reason
   * `findCheckoutHoldMinutes` is: a booking already waiting on a provider
   * keeps the deadline it was given even if this setting changes underneath
   * it.
   */
  findProviderResponseMinutes(): Promise<number>;

  /**
   * Minutes an accepted booking holds its slot while payment is collected,
   * before it expires unpaid.
   *
   * LIVE, not SEED (see `platform_settings`'s own header comment for the
   * distinction): read fresh every time a booking is accepted, so a change an
   * administrator makes applies to the next acceptance immediately. A booking
   * already accepted keeps the `expiresAt` it was given regardless of what
   * this returns afterward — that is the booking snapshot behaving normally,
   * not this port's concern.
   */
  findPaymentWindowMinutes(): Promise<number>;
}
