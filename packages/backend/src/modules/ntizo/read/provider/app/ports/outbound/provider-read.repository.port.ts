import type { ProviderDetailDTO, ProviderListItemDTO } from "@ntizo/shared/read-models";

export interface ProviderReadRepositoryPort {
  listForUser(userId: string): Promise<ProviderListItemDTO[]>;
  findDetailById(providerId: string): Promise<ProviderDetailDTO | null>;
  isMember(providerId: string, userId: string): Promise<boolean>;
}
