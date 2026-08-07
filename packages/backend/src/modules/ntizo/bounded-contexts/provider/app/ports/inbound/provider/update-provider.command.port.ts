import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";
import type { AddressProps } from "../../../../domain/value-objects/address.vo";

export interface UpdateProviderInput {
  providerId: string;
  name?: string;
  description?: string;
  address?: AddressProps;
}

export interface UpdateProviderOutput {
  providerId: string;
}

export interface UpdateProviderPort {
  execute(
    ctx: ExecutionContext,
    input: UpdateProviderInput,
  ): Promise<UpdateProviderOutput>;
}
