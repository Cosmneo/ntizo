import type { ProviderDetailDTO, ProviderListItemDTO } from "@ntizo/shared/read-models";

export interface ListMyProvidersProjectionInput {
  requestedByUserId: string;
}
export interface ListMyProvidersProjectionPort {
  execute(input: ListMyProvidersProjectionInput): Promise<ProviderListItemDTO[]>;
}

export interface GetProviderDetailProjectionInput {
  providerId: string;
  requestedByUserId: string;
}
export interface GetProviderDetailProjectionPort {
  execute(input: GetProviderDetailProjectionInput): Promise<ProviderDetailDTO>;
}
