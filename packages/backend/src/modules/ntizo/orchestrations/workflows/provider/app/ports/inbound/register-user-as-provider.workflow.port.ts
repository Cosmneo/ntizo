import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";

export interface RegisterUserAsProviderWorkflowInput {
  executionContext: ExecutionContext;
  input: {
    name?: string;
    slug?: string;
  };
}

export interface RegisterUserAsProviderWorkflowOutput {
  providerId: string;
}

export interface RegisterUserAsProviderWorkflowPort {
  execute(
    input: RegisterUserAsProviderWorkflowInput,
  ): Promise<RegisterUserAsProviderWorkflowOutput>;
}
