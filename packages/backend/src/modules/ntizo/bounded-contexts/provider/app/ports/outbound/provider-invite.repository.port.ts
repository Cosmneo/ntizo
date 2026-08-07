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
}
