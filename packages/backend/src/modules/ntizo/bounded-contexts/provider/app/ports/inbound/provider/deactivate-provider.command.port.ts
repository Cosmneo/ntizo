import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";

export interface DeactivateProviderInput {
  providerId: string;
}

export interface DeactivateProviderOutput {
  providerId: string;
}

export interface DeactivateProviderPort {
  execute(
    ctx: ExecutionContext,
    input: DeactivateProviderInput,
  ): Promise<DeactivateProviderOutput>;
}
