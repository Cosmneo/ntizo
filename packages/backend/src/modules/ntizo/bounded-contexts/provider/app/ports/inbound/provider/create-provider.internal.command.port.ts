import type { AddressProps } from "../../../../domain/value-objects/address.vo";
import type { ProviderType } from "../../../../domain/aggregates/provider/provider.aggregate";

// Internal create-provider command — takes a raw ownerUserId since the saga
// is calling on behalf of an already-authorized requester. No ExecutionContext.

export interface CreateProviderInternalInput {
  ownerUserId: string;
  type: ProviderType;
  name: string;
  slug: string;
  description?: string;
  address?: AddressProps;
}

export interface CreateProviderInternalOutput {
  providerId: string;
}

export interface CreateProviderInternalPort {
  execute(
    input: CreateProviderInternalInput,
  ): Promise<CreateProviderInternalOutput>;
}
