/**
 * A provider's current name, as the Activity context needs it to snapshot a
 * history row.
 *
 * An outbound port rather than an import of the Provider context: activity
 * must not reach into another bounded context's tables, and the adapter that
 * implements this is the one place the coupling is written down.
 *
 * This mirrors the Notification context's own `ProviderNameReaderPort` in
 * shape and purpose, but is a separate declaration on purpose (F5): each
 * context that needs this lookup owns its own port and its own adapter,
 * rather than importing another context's port or reaching into its
 * bootstrap. A change to what Notification needs from Provider must not
 * ripple into what Activity needs, and vice versa.
 */
export interface ProviderNameReaderPort {
  /** The provider's current name, or null if the provider no longer exists. */
  findNameById(providerId: string): Promise<string | null>;
}
