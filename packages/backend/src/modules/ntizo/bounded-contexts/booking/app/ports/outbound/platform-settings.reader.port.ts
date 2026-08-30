/**
 * The one platform setting this bounded context is allowed to read.
 *
 * This does not return the `platform_settings` row. A port that hands back
 * every knob invites the next command to read a second one through it and
 * quietly become a dependency on the whole table — the same reasoning behind
 * Provider's own `PlatformSettingsPort`, which exposes only
 * `defaultCommissionBps`. Booking's one legitimate reason to read this table
 * is the payment window, so that is the only thing this port can return.
 */
export interface PlatformSettingsReaderPort {
  /**
   * Minutes an unpaid booking holds its slot before expiring.
   *
   * LIVE, not SEED (see `platform_settings`'s own header comment for the
   * distinction): read fresh every time a booking is created, so a change an
   * administrator makes applies to the next booking immediately. A booking
   * already created keeps the `expiresAt` it was given regardless of what
   * this returns afterward — that is the booking snapshot behaving normally,
   * not this port's concern.
   */
  findPaymentWindowMinutes(): Promise<number>;
}
