import type {
  ProviderAdminDTO,
  ProviderDetailDTO,
  ProviderListItemDTO,
  ProviderStatusCountsDTO,
} from "@ntizo/shared/read-models";

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

export interface ListProvidersForAdminInput {
  /** Absent means every status — the queue's "all" tab, not "none". */
  status?: string | undefined;
  search?: string | undefined;
  limit: number;
  offset: number;
}

export interface ListProvidersForAdminPort {
  execute(input: ListProvidersForAdminInput): Promise<ProviderAdminDTO[]>;
}

export interface CountProvidersByStatusPort {
  /** One count per status, all five, for the queue's badge and the dashboard. */
  execute(): Promise<ProviderStatusCountsDTO>;
}
