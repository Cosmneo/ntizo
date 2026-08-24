/**
 * Who belongs to a workspace, as the Notification context needs to know it.
 *
 * An outbound port rather than an import of the Provider context: notifications
 * must not reach into another bounded context's tables, and the adapter that
 * implements this is the one place the coupling is written down. It answers one
 * question and no more — everything else about a member is the Provider
 * context's business.
 */
export interface ProviderMemberReaderPort {
  /** Whether this person may read this workspace's inbox at all. */
  isMember(providerId: string, userId: string): Promise<boolean>;
}
