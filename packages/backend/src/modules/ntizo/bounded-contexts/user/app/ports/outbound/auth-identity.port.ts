/**
 * The user's login identity, as far as this context needs to touch it.
 *
 * A port rather than a direct write because the auth identity lives in another
 * module's tables. The use case depends on this interface and knows nothing
 * about better-auth; exactly one adapter knows, and says so.
 */
export interface AuthIdentityPort {
  /**
   * Writes the number onto the auth identity and clears its verified flag.
   *
   * Both in one statement, always: a number and a stale "verified" belong to
   * different phones the moment they are written separately and something
   * fails in between.
   *
   * @param phoneNumber E.164, or null to release the number.
   * @throws {PhoneNumberAlreadyInUseError} when another account holds it.
   */
  setPhoneNumber(userId: string, phoneNumber: string | null): Promise<void>;
}
