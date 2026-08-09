import type { CurrentUserDTO, UserRole } from "@ntizo/shared";

export interface UserReadRepositoryPort {
  findCurrentUser(userId: string): Promise<CurrentUserDTO | null>;

  /**
   * The requester's platform role, from the column that owns it.
   *
   * There are two `role` columns. `better_auth.user.role` exists because
   * better-auth needs one; `ntizo_user.user.role` is the one the Ntizo user
   * BC manages, and the one `userMe` projects. Nothing synchronises them, so
   * authorization reading the better-auth copy could enforce a different role
   * than the UI displays. This is the authoritative read, kept separate from
   * `findCurrentUser` so the per-request authorization path costs one
   * primary-key lookup rather than a profile join it does not need.
   *
   * Returns null when the user has no ntizo row; callers must treat that as
   * the least-privileged role, never as "unrestricted".
   */
  findPlatformRole(userId: string): Promise<UserRole | null>;
}
