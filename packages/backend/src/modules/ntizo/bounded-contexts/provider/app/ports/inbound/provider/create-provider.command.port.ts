import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";
import type { AddressProps } from "../../../../domain/value-objects/address.vo";
import type { ProviderType } from "../../../../domain/aggregates/provider/provider.aggregate";

export interface CreateProviderInput {
  type: ProviderType;
  name: string;
  slug: string;
  description?: string;
  address?: AddressProps;
}

export interface CreateProviderOutput {
  providerId: string;
}

export interface CreateProviderPort {
  execute(
    ctx: ExecutionContext,
    input: CreateProviderInput,
  ): Promise<CreateProviderOutput>;
}
