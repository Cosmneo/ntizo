import type { ProviderPublicDTO } from "@ntizo/shared";

export interface ListPublicProvidersInput {
  limit: number;
  offset: number;
  /** Free-text filter. Absent means "no filter", never "match nothing". */
  search?: string | undefined;
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
