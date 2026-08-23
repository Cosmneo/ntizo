/**
 * A provider's current name, as the Notification context needs it to
 * snapshot a personal inbox row.
 *
 * An outbound port rather than an import of the Provider context: notifications
 * must not reach into another bounded context's tables, and the adapter that
 * implements this is the one place the coupling is written down. It exists
 * because a *personal* inbox — unlike a workspace's own — cannot assume the
 * reader already knows which business a row is about: one person can own or
 * work at several. `provider.created`'s own payload is deliberately thin for
 * the opposite reason (see the docblock on `registerProviderNotificationHandlers`
 * in `provider.event-handlers.ts`) — that row lands inside the one workspace
 * it is about, so it does not need a name. This port is for the row that does.
 */
export interface ProviderNameReaderPort {
  /** The provider's current name, or null if the provider no longer exists. */
  findNameById(providerId: string): Promise<string | null>;
}
