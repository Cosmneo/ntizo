/**
 * A person as the administration list sees them.
 *
 * Mirrors the read model rather than the profile: an admin scanning this list
 * is answering "who is on the platform, what can they do, and is anything
 * wrong with their account". Bio, timezone and the rest are absent from the
 * server's projection too — this is not a screen that needs them, and every
 * field it does not carry is one less piece of someone's data on it.
 */
export interface AdminUser {
  id: string;
  email: string;
  /** Null where the person never set one — most rows shortly after signup. */
  name: string | null;
  role: string;
  status: string;
  phoneNumber: string | null;
  /** How many workspaces they belong to. The reason most rows get looked at. */
  providerCount: number;
  createdAt: string;
}

/**
 * What to show in the primary column when somebody has no name yet.
 *
 * The email, not a placeholder: it is the only thing that identifies the row,
 * and "—" in the one column that says who a row is about makes the whole list
 * unreadable. The email still appears in its own column — repeated, but a
 * repeated fact reads better than an anonymous row.
 */
export function displayName(user: AdminUser): string {
  return user.name?.trim() || user.email;
}
