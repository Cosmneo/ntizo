import type { Locale } from "@ntizo/shared";

export interface CreateUserOnSignUpInternalInput {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  /** E.164, or null. Written onto the Profile so it matches the auth user. */
  phoneNumber?: string | null;
  /**
   * The language this person is reading the app in, resolved at the edge.
   *
   * Passed in rather than defaulted here because signup is the only moment it
   * is knowable: the request carries it, and by the time anything else runs
   * the request is gone. Absent means "we could not tell", and the Profile
   * falls back to the platform default.
   */
  language?: Locale | null;
  /**
   * The photo the sign-in provider supplied, or null.
   *
   * Written to `avatarUrl`, never to `avatarKey`: it is somebody else's URL on
   * somebody else's host. If it ever breaks, the profile falls back to
   * initials and the person can upload their own — which then wins.
   */
  image?: string | null;
  /**
   * IANA name, resolved at the edge from `X-Timezone`.
   *
   * Absent means "we could not tell" — a Google sign-up arrives through an
   * OAuth callback that carries no header of ours — and the Profile falls
   * back to UTC.
   */
  timezone?: string | null;
}

export interface CreateUserOnSignUpInternalPort {
  execute(input: CreateUserOnSignUpInternalInput): Promise<void>;
}
