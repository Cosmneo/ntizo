// Internal compensation — deactivates a provider without requiring an
// ExecutionContext / owner check. Used by the register-as-provider saga
// when a later step fails after provider creation.

export interface DeactivateProviderInternalInput {
  providerId: string;
}

export interface DeactivateProviderInternalOutput {
  providerId: string;
}

export interface DeactivateProviderInternalPort {
  execute(
    input: DeactivateProviderInternalInput,
  ): Promise<DeactivateProviderInternalOutput>;
}
