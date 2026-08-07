import type { ProviderMember } from "../../../domain/entities/provider-member";

export interface ProviderMemberRepositoryPort {
  findByProviderId(providerId: string): Promise<ProviderMember[]>;
  findByProviderAndUser(
    providerId: string,
    userId: string,
  ): Promise<ProviderMember | null>;
  save(member: ProviderMember): Promise<void>;
  delete(providerId: string, userId: string): Promise<void>;
}
