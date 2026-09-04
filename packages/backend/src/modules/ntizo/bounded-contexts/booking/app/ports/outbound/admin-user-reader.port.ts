/**
 * Who administers the platform, as the people the sweep has to tell when it
 * closed a booking nobody answered for.
 *
 * **This context's own copy of a port the Communication context also
 * declares**, and it is a copy on purpose — the same rule
 * `raise-notification.port.ts` follows and for the reason written there: no
 * `app/` tree imports another context's `app/` tree. The two interfaces are
 * identical today and are free to stop being: Communication asks this
 * question to address a support request, Booking asks it to raise
 * `AdminBookingAutoClosed`, and a shared type would make either context's
 * next need the other's problem.
 *
 * Read at the moment of asking, never cached, exactly as Communication's copy
 * says: an administrator appointed an hour ago must hear about the next
 * booking the platform closes alone.
 */
export interface AdminUserReaderPort {
  /**
   * Every active user with role `admin`.
   *
   * Empty when there is none, and the caller decides what that means — for
   * the sweep it means the booking still closes and nobody is told, which is
   * the honest outcome on a platform that has no administrators.
   */
  findAdminUserIds(): Promise<string[]>;
}
