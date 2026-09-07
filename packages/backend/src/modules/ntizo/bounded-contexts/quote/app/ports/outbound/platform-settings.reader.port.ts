/**
 * The platform settings this context is allowed to read: the proposal's
 * validity window and the price floor a proposal must clear.
 *
 * This does not return the `platform_settings` row. A port that hands back
 * every knob invites the next command to read a second one through it and
 * quietly become a dependency on the whole table — the same reasoning behind
 * Booking's own `PlatformSettingsReaderPort`. This context's legitimate
 * reasons to read this table are these two values, so that is all this port
 * can return.
 */
export interface PlatformSettingsReaderPort {
  /**
   * Hours a fresh proposal stays live before it lapses on its own.
   *
   * LIVE, read on every proposal: a change an administrator makes applies to
   * the next proposal immediately. A proposal already made keeps the
   * `validUntil` it was given regardless of what this returns afterward —
   * that is the proposal snapshot behaving normally, not this port's
   * concern.
   */
  findQuoteProposalValidityHours(): Promise<number>;
  /**
   * The floor a proposal's price must clear.
   *
   * LIVE, read on every proposal, for the same reason
   * `findQuoteProposalValidityHours` is.
   */
  findMinServicePriceMinor(): Promise<number>;
}
