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
}

export interface CreateUserOnSignUpInternalPort {
  execute(input: CreateUserOnSignUpInternalInput): Promise<void>;
}
