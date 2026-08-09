import type { ProviderPublicDTO } from "@ntizo/shared";

export interface ListPublicProvidersInput {
  limit: number;
  offset: number;
}

export interface ListPublicProvidersPort {
  execute(input: ListPublicProvidersInput): Promise<ProviderPublicDTO[]>;
}

export interface GetPublicProviderInput {
  slug: string;
}

export interface GetPublicProviderPort {
  execute(input: GetPublicProviderInput): Promise<ProviderPublicDTO | null>;
}
