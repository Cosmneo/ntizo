import type { ProviderInvite } from "../../../domain/entities/provider-invite";

export interface ProviderInviteRepositoryPort {
  findById(id: string): Promise<ProviderInvite | null>;
  findByToken(token: string): Promise<ProviderInvite | null>;
  findByProviderAndEmail(
    providerId: string,
    email: string,
  ): Promise<ProviderInvite | null>;
  findByProviderId(providerId: string): Promise<ProviderInvite[]>;
  save(invite: ProviderInvite): Promise<void>;
  delete(id: string): Promise<void>;
  /**
   * Conditionally transitions the invite to "accepted" — only if its
   * currently persisted status is still "pending" — and reports whether the
   * transition happened. Unlike `save()` (a blind upsert), this is a
   * `WHERE status = 'pending'` guard evaluated by Postgres against the row's
   * current state at write time, so it is safe to call inside a
   * `unitOfWork.atomicExecute` block even though the invite was originally
   * *read* outside that transaction: a concurrent revoke/accept/expiry that
   * committed in between makes this a no-op (`false`, nothing written)
   * instead of silently overwriting that outcome. See
   * `accept-provider-invite.command.ts`.
   */
  markAcceptedIfPending(id: string): Promise<boolean>;
}
