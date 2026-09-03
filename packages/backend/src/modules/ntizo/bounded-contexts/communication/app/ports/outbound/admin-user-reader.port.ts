/**
 * Who administers the platform, as the people a new support request is
 * addressed to. Read from `ntizo_user.user.role` at the moment of asking,
 * never cached: a role granted an hour ago must receive the next request.
 */
export interface AdminUserReaderPort {
  /** Every active user with role `admin`. Empty when there is none — the caller decides what that means. */
  findAdminUserIds(): Promise<string[]>;
}
