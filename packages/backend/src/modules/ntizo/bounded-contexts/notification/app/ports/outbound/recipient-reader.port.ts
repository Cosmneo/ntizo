/** Somebody an email can be addressed to, in the language they chose. */
export interface Recipient {
  /** Null for a delivery to an address with no account behind it. */
  userId: string | null;
  email: string;
  /** From `ntizo_user.profile.language`, or a caller-supplied fallback. */
  locale: string;
}

/**
 * Who to write to, and in what language.
 *
 * An outbound port on this context rather than a reach into User or Provider:
 * the same rule Phase 1's `ProviderMemberReaderPort` and `UserByEmailReaderPort`
 * follow. The adapter is the one place the coupling is written down.
 *
 * **`forProviderMembers` returns several.** One workspace notification becomes
 * one delivery per member, each in that member's own language — a Portuguese
 * owner and a French colleague get their own. That is the whole reason locale
 * lives on the delivery rather than on the notification.
 */
export interface RecipientReaderPort {
  forUser(userId: string): Promise<Recipient | null>;
  forProviderMembers(providerId: string): Promise<Recipient[]>;
}
