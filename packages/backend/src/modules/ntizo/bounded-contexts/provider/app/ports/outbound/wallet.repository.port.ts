/**
 * Creating a provider's wallet.
 *
 * Only creation for now, deliberately: entries are written by the payment
 * flows that do not exist yet, and a port with methods nobody calls is a
 * design guess wearing an interface. The one thing that has to happen today is
 * that a workspace never exists without somewhere for its money to land.
 */
export interface WalletRepositoryPort {
  /**
   * Idempotent. A retried creation must not produce a second wallet, and the
   * unique index on `provider_id` is what enforces that rather than a check
   * this code performs and races on.
   */
  createForProvider(input: { providerId: string; currency: string }): Promise<void>;
}
