/**
 * Whether an email address already has an account, as the Notification
 * context needs to know it.
 *
 * An outbound port rather than an import of the User context: notifications
 * must not reach into another bounded context's tables, and the adapter that
 * implements this is the one place the coupling is written down. It exists
 * because `provider.invite.sent` cannot tell an invited colleague from a
 * stranger — the Provider context never looks that up — so the Notification
 * context does its own lookup on the way in.
 */
export interface UserByEmailReaderPort {
  /** The user id for this email, or null if nobody has signed up with it yet. */
  findUserIdByEmail(email: string): Promise<string | null>;
}
