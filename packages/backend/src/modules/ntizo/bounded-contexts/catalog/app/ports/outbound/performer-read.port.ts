export interface PerformerRow {
  /** A `provider_member.id`. */
  id: string;
  firstName: string;
  /**
   * A storage key, not a URL — the caller resolves it with `mediaUrl()`.
   *
   * Deliberately `avatarKey` and not `avatarUrl`: this row backs a public
   * page nobody asked to appear on, so it must never carry `profile.avatarUrl`
   * (a Google sign-in photo, published without anyone choosing to publish
   * it). Only a photo someone deliberately uploaded belongs here.
   */
  avatarKey: string | null;
}

/**
 * Who performs a service, by name.
 *
 * Its own port because answering it leaves the Catalog context: a member's
 * name lives on `ntizo_user.profile`, which the User context owns. A read-side
 * projection assembling a view across contexts is what read models are for;
 * a Catalog repository reaching into another context's tables is not, and the
 * difference is exactly this interface.
 *
 * `firstName` and not `displayName`: the display name is whatever a person
 * chose for themselves product-wide and can be anything at all. What was
 * approved for publication is a first name.
 */
export interface PerformerReadPort {
  /** Returns a row per id that resolves; unknown ids are simply absent. */
  byMemberIds(memberIds: string[]): Promise<PerformerRow[]>;
}
