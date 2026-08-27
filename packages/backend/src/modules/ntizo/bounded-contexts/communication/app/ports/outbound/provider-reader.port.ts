/**
 * What the Communication context needs to know about a provider, read across
 * the boundary rather than by importing Provider's repository or bootstrap.
 *
 * Two questions, both answered by reading one column off one row — the same
 * shape `ProviderMemberReaderPort` in the Notification context already
 * takes, and for the same reason: this context needs a fact Provider owns,
 * not the machinery that produces it, and depending on Provider's bootstrap
 * to get one boolean would couple two contexts' lifecycles for a single-row
 * lookup.
 */
export interface ProviderReaderPort {
  /**
   * Whether this provider can be messaged at all.
   *
   * "Contactable" is not a concept of its own — it is `provider.status =
   * 'active'`, the exact predicate the public directory already uses to
   * decide a provider is visible at all. A provider nobody can find there is
   * a provider nobody should be able to open a conversation with.
   */
  isContactable(providerId: string): Promise<boolean>;

  /**
   * Whether this person belongs to this provider's team.
   *
   * `ntizo_provider.provider_member` carries no status column — being a
   * member *is* the row existing for `(providerId, userId)`, `role` and
   * nothing else. Not `provider.owner_user_id`: an owner who has since left
   * their own workspace's `provider_member` table is not a member, and a
   * staff member who never owned anything is.
   */
  isMember(providerId: string, userId: string): Promise<boolean>;
}
